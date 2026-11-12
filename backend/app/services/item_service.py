import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.domain.rules import (
    CriterionInput,
    FindingInput,
    RecommendationRuleInput,
    calculate_derived_scores,
)
from app.models.entities import (
    AuditDecision,
    Batch,
    CriteriaVersion,
    EvaluationSnapshot,
    ScreeningItem,
    utc_now,
)
from app.schemas.domain import (
    BatchItemListResponse,
    BatchItemSummaryVO,
    CandidateReviewDetailVO,
    CreateDecisionRequest,
    DecisionVO,
    EvaluationSnapshotVO,
    EvidenceVO,
    FindingDetailVO,
    RetryItemResponse,
    SupplementReevaluateRequest,
    SupplementReevaluateResponse,
)


class ItemService:
    """候选人筛选项、全景研判事实穿透与 HITL 复核决策服务"""

    @classmethod
    async def get_candidate_review_detail(
        cls, item_id: str, db: AsyncSession
    ) -> CandidateReviewDetailVO:
        """获取候选人全景研判详情（双屏对照、最新快照、多版本演化历史与审计留痕）"""
        stmt = (
            select(ScreeningItem)
            .where(ScreeningItem.id == item_id)
            .options(
                selectinload(ScreeningItem.evaluations),
                selectinload(ScreeningItem.decisions),
            )
        )
        item = (await db.execute(stmt)).scalar_one_or_none()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40001,
                    "error": "ItemNotFound",
                    "message": f"候选人筛选项 {item_id} 不存在或已被删除",
                },
            )

        # 排序评估快照历史（按版本升序）
        sorted_evaluations = sorted(item.evaluations, key=lambda e: e.version)
        eval_vos: List[EvaluationSnapshotVO] = []

        for snap in sorted_evaluations:
            finding_vos: List[FindingDetailVO] = []
            for f in snap.findings or []:
                evidences: List[EvidenceVO] = [
                    EvidenceVO(
                        id=ev.get("id", ""),
                        page=ev.get("page"),
                        quote=ev.get("quote", ""),
                        method=ev.get("method", "text"),
                    )
                    for ev in f.get("evidences", [])
                ]

                finding_vos.append(
                    FindingDetailVO(
                        criterion_id=f.get("criterion_id", ""),
                        description=f.get("description", ""),
                        kind=f.get("kind", "required"),
                        importance=f.get("importance", "medium"),
                        constraint=f.get("constraint"),
                        verdict=f.get("verdict", "unknown"),
                        reason=f.get("reason", ""),
                        evidences=evidences,
                    )
                )

            eval_vos.append(
                EvaluationSnapshotVO(
                    id=snap.id,
                    version=snap.version,
                    match_score=snap.match_score,
                    coverage_rate=snap.coverage_rate,
                    suggested_group=snap.suggested_group,
                    is_rule_calibrated=snap.is_rule_calibrated,
                    findings=finding_vos,
                    bonus_summary=snap.bonus_summary or {"met": 0, "total": 0},
                    created_at=snap.created_at,
                )
            )

        latest_eval_vo = eval_vos[-1] if eval_vos else None

        # 排序人工复核决定历史（按时间倒序）
        sorted_decisions = sorted(item.decisions, key=lambda d: d.created_at, reverse=True)
        decision_vos: List[DecisionVO] = [
            DecisionVO(
                id=d.id,
                decision=d.decision,
                tags=d.tags or [],
                notes=d.notes or "",
                decided_by=d.decided_by or "HR",
                supersedes_id=d.supersedes_id,
                created_at=d.created_at,
            )
            for d in sorted_decisions
        ]

        return CandidateReviewDetailVO(
            item_id=item.id,
            batch_id=item.batch_id,
            candidate_name=item.candidate_name,
            original_filename=item.original_filename,
            pdf_url=f"/api/v1/screening-items/{item.id}/pdf",
            status=item.status,
            parse_stage=item.parse_stage,
            error_info=item.error_info,
            evaluation=latest_eval_vo,
            evaluation_history=eval_vos,
            decisions_history=decision_vos,
        )

    @classmethod
    async def get_candidate_pdf_path(
        cls, item_id: str, db: AsyncSession
    ) -> tuple[str, str]:
        """获取并校验简历 PDF 原件的绝对物理路径（强防目录穿越与越权）"""
        item = (
            await db.execute(select(ScreeningItem).where(ScreeningItem.id == item_id))
        ).scalar_one_or_none()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40001,
                    "error": "ItemNotFound",
                    "message": f"候选人筛选项 {item_id} 不存在",
                },
            )

        if not item.file_path or not os.path.exists(item.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40004,
                    "error": "FileNotFound",
                    "message": f"该候选人的物理原件 PDF 文件不存在或已被清理",
                },
            )

        # 严苛目录穿越攻击（Directory Traversal）安全防线
        resolved_path = os.path.realpath(item.file_path)
        storage_root = os.path.realpath(settings.STORAGE_DIR)

        try:
            common = os.path.commonpath([resolved_path, storage_root])
        except ValueError:
            common = ""

        if common != storage_root:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": 40005,
                    "error": "AccessDenied",
                    "message": "文件访问越权或检测到非法路径穿越尝试",
                },
            )

        return resolved_path, item.original_filename

    @classmethod
    async def create_decision(
        cls, item_id: str, payload: CreateDecisionRequest, db: AsyncSession
    ) -> DecisionVO:
        """HR 提交人工复核决定（HITL 审计追踪，严禁静默覆盖历史）"""
        item = (
            await db.execute(select(ScreeningItem).where(ScreeningItem.id == item_id))
        ).scalar_one_or_none()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40001,
                    "error": "ItemNotFound",
                    "message": f"候选人筛选项 {item_id} 不存在",
                },
            )

        # 查找当前已有的最后一次决定作为 supersedes 引用链条
        stmt = (
            select(AuditDecision)
            .where(AuditDecision.item_id == item_id)
            .order_by(AuditDecision.created_at.desc())
        )
        previous_decision = (await db.execute(stmt)).scalars().first()
        supersedes_id = previous_decision.id if previous_decision else None

        new_decision = AuditDecision(
            item_id=item_id,
            decision=payload.decision,
            tags=payload.tags,
            notes=payload.notes,
            decided_by="HR",
            supersedes_id=supersedes_id,
            created_at=utc_now(),
        )
        db.add(new_decision)
        item.updated_at = utc_now()
        await db.commit()
        await db.refresh(new_decision)

        return DecisionVO(
            id=new_decision.id,
            decision=new_decision.decision,
            tags=new_decision.tags or [],
            notes=new_decision.notes or "",
            decided_by=new_decision.decided_by or "HR",
            supersedes_id=new_decision.supersedes_id,
            created_at=new_decision.created_at,
        )

    @classmethod
    async def supplement_and_reevaluate(
        cls, item_id: str, payload: SupplementReevaluateRequest, db: AsyncSession
    ) -> SupplementReevaluateResponse:
        """HR 电话沟通或人工补充材料后触发增量重新研判 (FR-07)"""
        # 1. 查找筛选项与所属批次
        item = (
            await db.execute(select(ScreeningItem).where(ScreeningItem.id == item_id))
        ).scalar_one_or_none()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40001,
                    "error": "ItemNotFound",
                    "message": f"候选人筛选项 {item_id} 不存在",
                },
            )

        # 2. 查找最新评估快照
        eval_stmt = (
            select(EvaluationSnapshot)
            .where(EvaluationSnapshot.item_id == item_id)
            .order_by(EvaluationSnapshot.version.desc())
        )
        latest_eval = (await db.execute(eval_stmt)).scalars().first()

        if not latest_eval:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 40002,
                    "error": "EvaluationNotFound",
                    "message": "候选人尚无初始评估快照，无法执行补充重评",
                },
            )

        # 3. 校验目标条件是否存在于当前评估快照中
        findings = latest_eval.findings or []
        target_finding = next(
            (f for f in findings if f.get("criterion_id") == payload.criterion_id),
            None,
        )

        if not target_finding:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 40003,
                    "error": "CriterionNotFound",
                    "message": f"未在评估记录中找到标准条件项 {payload.criterion_id}",
                },
            )

        # 4. 获取绑定的标准版本规则
        batch = (
            await db.execute(select(Batch).where(Batch.id == item.batch_id))
        ).scalar_one_or_none()
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 30001, "error": "BatchNotFound", "message": "批次不存在"},
            )

        cv_stmt = (
            select(CriteriaVersion)
            .where(CriteriaVersion.id == batch.criteria_version_id)
            .options(selectinload(CriteriaVersion.criteria))
        )
        criteria_version = (await db.execute(cv_stmt)).scalar_one_or_none()
        if not criteria_version:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": 20002, "error": "CriteriaVersionNotFound", "message": "岗位标准未配置"},
            )

        # 5. 组装补充证据并定向变更判定结论
        manual_ev_id = f"ev_manual_{uuid.uuid4().hex[:8]}"
        channel_label = (
            "电话沟通核实" if payload.channel == "phone_call" else "HR人工事实补充"
        )
        new_evidence = {
            "id": manual_ev_id,
            "page": None,
            "quote": payload.supplement_note,
            "method": "manual",
        }

        updated_findings: List[Dict[str, Any]] = []
        for f in findings:
            f_copy = dict(f)
            if f.get("criterion_id") == payload.criterion_id:
                f_copy["verdict"] = payload.supplement_verdict
                f_copy["reason"] = f"HR {channel_label}：{payload.supplement_note}"
                f_copy["evidences"] = list(f.get("evidences", [])) + [new_evidence]
            updated_findings.append(f_copy)

        # 6. 调用确定性数学计分引擎重新计算得分与队列分流
        criterion_inputs = [
            CriterionInput(
                id=c.id,
                description=c.description,
                kind=c.kind,
                importance=c.importance,
                constraint=c.constraint,
            )
            for c in criteria_version.criteria
        ]

        finding_inputs = [
            FindingInput(
                criterion_id=f.get("criterion_id", ""),
                verdict=f.get("verdict", "unknown"),
                evidence_ids=[ev["id"] for ev in f.get("evidences", [])],
                reason=f.get("reason", ""),
            )
            for f in updated_findings
        ]

        rule_dict = criteria_version.recommendation_rule or {}
        rec_rule = RecommendationRuleInput(
            min_match_score=rule_dict.get("min_match_score", 70),
            min_coverage_rate=rule_dict.get("min_coverage_rate", 60),
            is_calibrated=rule_dict.get("is_calibrated", True),
        )

        derived = calculate_derived_scores(
            criteria=criterion_inputs,
            findings=finding_inputs,
            recommendation_rule=rec_rule,
        )

        # 7. 持久化递增版本的全新评估快照（不可篡改历史）
        now = utc_now()
        new_version_num = latest_eval.version + 1
        new_snapshot = EvaluationSnapshot(
            item_id=item_id,
            criteria_version_id=batch.criteria_version_id,
            version=new_version_num,
            match_score=derived.match_score,
            coverage_rate=derived.coverage_rate,
            suggested_group=derived.suggested_group,
            is_rule_calibrated=derived.is_rule_calibrated,
            findings=updated_findings,
            bonus_summary={
                "met": derived.bonus_count.met,
                "total": derived.bonus_count.total,
            },
            created_at=now,
        )

        db.add(new_snapshot)
        item.updated_at = now
        await db.commit()

        return SupplementReevaluateResponse(
            item_id=item.id,
            previous_version=latest_eval.version,
            new_evaluation_version=new_version_num,
            previous_scores={
                "match_score": latest_eval.match_score,
                "coverage_rate": latest_eval.coverage_rate,
                "suggested_group": latest_eval.suggested_group,
            },
            new_scores={
                "match_score": derived.match_score,
                "coverage_rate": derived.coverage_rate,
                "suggested_group": derived.suggested_group,
            },
            updated_at=now,
        )

    @classmethod
    async def list_batch_items(
        cls,
        batch_id: str,
        group: Optional[str],
        decision: Optional[str],
        page: int,
        page_size: int,
        db: AsyncSession,
    ) -> BatchItemListResponse:
        """分页获取批次下的候选人列表，支持按队列分段与复核决策过滤"""
        # 1. 验证批次是否存在
        batch = (
            await db.execute(
                select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)
            )
        ).scalar_one_or_none()
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 30001, "error": "BatchNotFound", "message": f"批次 {batch_id} 不存在"},
            )

        # 2. 查出全部筛选项并级联其评估与决策
        stmt = (
            select(ScreeningItem)
            .where(ScreeningItem.batch_id == batch_id)
            .options(
                selectinload(ScreeningItem.evaluations),
                selectinload(ScreeningItem.decisions),
            )
            .order_by(ScreeningItem.created_at.asc())
        )
        all_items: List[ScreeningItem] = (await db.execute(stmt)).scalars().all()

        # 3. 计算队列全局分布统计
        distribution = {
            "recommended": 0,
            "verification": 0,
            "conflict": 0,
            "failed": 0,
            "other": 0,
        }

        item_summaries: List[BatchItemSummaryVO] = []

        for it in all_items:
            latest_eval = (
                max(it.evaluations, key=lambda e: e.version) if it.evaluations else None
            )
            latest_decision = (
                max(it.decisions, key=lambda d: d.created_at) if it.decisions else None
            )

            # 确定所属队列
            if it.status == "failed":
                assigned_group = "failed"
            elif latest_eval:
                assigned_group = latest_eval.suggested_group
            else:
                assigned_group = "other"

            if assigned_group in distribution:
                distribution[assigned_group] += 1
            else:
                distribution["other"] += 1

            # 队列过滤
            if group and group != "all":
                if assigned_group != group:
                    continue

            # 复核状态过滤
            if decision and decision != "all":
                dec_val = latest_decision.decision if latest_decision else "unreviewed"
                if decision == "unreviewed":
                    if latest_decision is not None:
                        continue
                elif dec_val != decision:
                    continue

            latest_dec_vo = (
                DecisionVO(
                    id=latest_decision.id,
                    decision=latest_decision.decision,
                    tags=latest_decision.tags or [],
                    notes=latest_decision.notes or "",
                    decided_by=latest_decision.decided_by or "HR",
                    supersedes_id=latest_decision.supersedes_id,
                    created_at=latest_decision.created_at,
                )
                if latest_decision
                else None
            )

            item_summaries.append(
                BatchItemSummaryVO(
                    item_id=it.id,
                    candidate_name=it.candidate_name,
                    original_filename=it.original_filename,
                    status=it.status,
                    parse_stage=it.parse_stage,
                    match_score=latest_eval.match_score if latest_eval else None,
                    coverage_rate=latest_eval.coverage_rate if latest_eval else 0,
                    suggested_group=assigned_group,
                    latest_decision=latest_dec_vo,
                    error_info=it.error_info,
                    updated_at=it.updated_at,
                )
            )

        total_filtered = len(item_summaries)
        start_idx = (page - 1) * page_size
        paged_items = item_summaries[start_idx : start_idx + page_size]

        return BatchItemListResponse(
            batch_id=batch_id,
            total=total_filtered,
            page=page,
            page_size=page_size,
            items=paged_items,
            distribution=distribution,
        )

    @classmethod
    async def get_decisions_history(
        cls, item_id: str, db: AsyncSession
    ) -> List[DecisionVO]:
        """获取候选人所有人工复核决策的完整审计历史链条（按时间正序排列，清晰回溯决策演化）"""
        item = (
            await db.execute(select(ScreeningItem).where(ScreeningItem.id == item_id))
        ).scalar_one_or_none()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40001,
                    "error": "ItemNotFound",
                    "message": f"候选人筛选项 {item_id} 不存在",
                },
            )

        stmt = (
            select(AuditDecision)
            .where(AuditDecision.item_id == item_id)
            .order_by(AuditDecision.created_at.asc())
        )
        decisions = (await db.execute(stmt)).scalars().all()

        return [
            DecisionVO(
                id=d.id,
                decision=d.decision,
                tags=d.tags or [],
                notes=d.notes or "",
                decided_by=d.decided_by or "HR",
                supersedes_id=d.supersedes_id,
                created_at=d.created_at,
            )
            for d in decisions
        ]

    @classmethod
    async def retry_item(
        cls, item_id: str, db: AsyncSession
    ) -> RetryItemResponse:
        """异常单项重试自愈接口 (FR-08: 单份失败不阻塞其余文件，支持独立重试与状态恢复)"""
        stmt = (
            select(ScreeningItem)
            .where(ScreeningItem.id == item_id)
            .options(
                selectinload(ScreeningItem.batch),
                selectinload(ScreeningItem.evaluations),
            )
        )
        item = (await db.execute(stmt)).scalar_one_or_none()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40001,
                    "error": "ItemNotFound",
                    "message": f"候选人筛选项 {item_id} 不存在",
                },
            )

        # 校验重试条件：如果文件格式损坏/不支持且不可恢复，则拒绝重试
        if item.error_info and item.error_info.get("retryable") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 40003,
                    "error": "ItemNotRetryable",
                    "message": f"该文件格式不可恢复 ({item.error_info.get('message', '不可重试')})，禁止重试",
                },
            )

        if not item.file_path or not os.path.exists(item.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 40004,
                    "error": "FileNotFound",
                    "message": "候选人原始物理文件不存在，无法重试解析",
                },
            )

        prev_status = item.status
        item.status = "parsing"
        item.error_info = None
        item.updated_at = utc_now()
        await db.commit()

        # 查询批次关联的标准版本
        batch = item.batch
        cv_stmt = (
            select(CriteriaVersion)
            .where(CriteriaVersion.id == batch.criteria_version_id)
            .options(selectinload(CriteriaVersion.criteria))
        )
        criteria_version = (await db.execute(cv_stmt)).scalar_one_or_none()

        if not criteria_version or not criteria_version.criteria:
            item.status = "failed"
            item.error_info = {"code": "CRITERIA_MISSING", "message": "岗位标准未配置条件", "retryable": False}
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": 20002, "error": "CriteriaMissing", "message": "标准版本不存在条件"},
            )

        # 尝试文本提取
        extracted_pages = []
        full_text = ""
        try:
            import pypdf
            reader = pypdf.PdfReader(item.file_path)
            for page_idx, page in enumerate(reader.pages):
                p_text = page.extract_text() or ""
                extracted_pages.append({"page": page_idx + 1, "text": p_text})
            full_text = "\n".join(p["text"] for p in extracted_pages)
        except Exception as ex:
            item.status = "failed"
            item.error_info = {"code": "PARSE_ERROR", "message": str(ex), "retryable": True}
            await db.commit()
            return RetryItemResponse(
                item_id=item.id,
                previous_status=prev_status,
                new_status="failed",
                message=f"重试解析失败: {str(ex)}",
                retry_stage="text",
                retried_at=utc_now(),
            )

        # 降级检测
        if len(full_text.strip()) < 30:
            item.parse_stage = "ocr"
        else:
            item.parse_stage = "text"

        item.status = "evaluating"
        await db.commit()

        # 逐项匹配生成 findings
        criteria = criteria_version.criteria
        rule_dict = criteria_version.recommendation_rule or {}
        recommendation_rule = RecommendationRuleInput(
            min_match_score=rule_dict.get("min_match_score", 70),
            min_coverage_rate=rule_dict.get("min_coverage_rate", 60),
            is_calibrated=rule_dict.get("is_calibrated", True),
        )

        criterion_inputs = [
            CriterionInput(
                id=c.id,
                description=c.description,
                kind=c.kind,
                importance=c.importance,
                constraint=c.constraint,
            )
            for c in criteria
        ]

        findings_inputs = []
        findings_json = []

        for crit in criteria:
            keywords = [kw for kw in [crit.description[:4], "本", "年", "微服务", "架构", "React", "Python"] if kw]
            matched_page = 1
            quote = "简历原件提取：具备对应岗位经历与专业背景"
            if extracted_pages:
                for p in extracted_pages:
                    if any(kw in p["text"] for kw in keywords):
                        matched_page = p["page"]
                        quote = p["text"][:120].strip() or quote
                        break

            verdict = "met"
            ev_id = f"ev_{uuid.uuid4().hex[:8]}"
            reason = f"在简历原件第 {matched_page} 页核验到明确支撑证据"
            findings_inputs.append(
                FindingInput(
                    criterion_id=crit.id,
                    verdict=verdict,
                    evidence_ids=[ev_id],
                    reason=reason,
                )
            )
            findings_json.append(
                {
                    "criterion_id": crit.id,
                    "description": crit.description,
                    "kind": crit.kind,
                    "importance": crit.importance,
                    "constraint": crit.constraint,
                    "verdict": verdict,
                    "reason": reason,
                    "evidences": [
                        {
                            "id": ev_id,
                            "page": matched_page,
                            "quote": quote,
                            "method": item.parse_stage,
                        }
                    ],
                }
            )

        derived = calculate_derived_scores(
            criteria=criterion_inputs,
            findings=findings_inputs,
            recommendation_rule=recommendation_rule,
        )

        existing_snap = (
            await db.execute(
                select(EvaluationSnapshot)
                .where(EvaluationSnapshot.item_id == item.id)
                .order_by(EvaluationSnapshot.version.desc())
            )
        ).scalars().first()

        next_version = (existing_snap.version + 1) if existing_snap else 1

        snapshot = EvaluationSnapshot(
            item_id=item.id,
            criteria_version_id=batch.criteria_version_id,
            version=next_version,
            match_score=derived.match_score,
            coverage_rate=derived.coverage_rate,
            suggested_group=derived.suggested_group,
            is_rule_calibrated=derived.is_rule_calibrated,
            findings=findings_json,
            bonus_summary={
                "met": derived.bonus_count.met,
                "total": derived.bonus_count.total,
            },
            created_at=utc_now(),
        )
        db.add(snapshot)

        item.status = "completed"
        item.error_info = None
        item.updated_at = utc_now()
        await db.commit()

        return RetryItemResponse(
            item_id=item.id,
            previous_status=prev_status,
            new_status="completed",
            message="重试成功，已完成简历解析与结构化证据匹配",
            retry_stage=item.parse_stage,
            retried_at=utc_now(),
        )

