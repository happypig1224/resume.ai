import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.entities import Batch, Job, ScreeningItem, utc_now
from app.schemas.domain import (
    AC01MetricsVO,
    BatchAcceptedItemVO,
    BatchCreateResponse,
    BatchDetailVO,
    BatchFailedItemVO,
    BatchListItemVO,
    BatchListResponse,
    BatchMetricsVO,
    BatchStatsVO,
)


def extract_candidate_name_from_filename(filename: str) -> str:
    """启发式提取候选人姓名：去除扩展名、序号前缀与岗位后缀（如 1. 张小明_全栈_8年.pdf -> 张小明）"""
    base = os.path.splitext(os.path.basename(filename))[0].strip()

    # 1. 规范化前缀：去除开头的序号与标点（如 "01.", "1-", "2、"）
    base = re.sub(r"^[0-9]+[\.、\s\-_]*", "", base).strip()

    # 2. 规范化括号备注（如 "(985本硕)", "【推荐】"）
    base = re.sub(r"[\(（\[【].*?[\)）\]】]", "", base).strip()

    # 3. 过滤常见分隔符，取最前面的人名部分
    for sep in ["_", "-", "—", " ", "的简历", "简历"]:
        if sep in base:
            parts = [p.strip() for p in base.split(sep) if p.strip()]
            if parts:
                base = parts[0]
                break

    return base if len(base) >= 1 else "未知候选人"


class BatchService:
    """批次导入与软受理文件存储服务"""

    @staticmethod
    async def create_batch(
        job_id: str,
        files: List[UploadFile],
        title: Optional[str],
        db: AsyncSession,
    ) -> BatchCreateResponse:
        """核心契约：批量上传简历并创建批次（严守 50 份上限与软受理容灾）"""

        # 1. 文件数量硬限制校验 (1 ~ 50 份)
        if not files or len(files) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 30003,
                    "error": "EmptyBatchError",
                    "message": "上传批次未包含有效文件，至少需要上传 1 份简历",
                },
            )

        if len(files) > 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 30002,
                    "error": "BatchSizeExceeded",
                    "message": f"单批上传文件数量超过上限 (最大允许 50 份，当前提供 {len(files)} 份)",
                },
            )

        # 2. 岗位与冻结标准校验
        job = (
            await db.execute(
                select(Job).where(Job.id == job_id, Job.is_deleted == False)
            )
        ).scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 20001,
                    "error": "JobNotFound",
                    "message": f"目标岗位 {job_id} 不存在或已被删除",
                },
            )

        if not job.current_criteria_version_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 20002,
                    "error": "CriteriaVersionNotConfirmed",
                    "message": "该岗位尚未配置并确认生效的标准版本，严禁导入简历",
                },
            )

        # 3. 准备物理存储沙箱目录
        batch_id = f"batch_{uuid.uuid4().hex[:12]}"
        now = utc_now()
        resolved_title = (
            title.strip()
            if title and title.strip()
            else f"{now.strftime('%Y-%m-%d')} 批次 (共 {len(files)} 份简历)"
        )

        batch_dir = Path(settings.STORAGE_DIR) / "batches" / batch_id
        batch_dir.mkdir(parents=True, exist_ok=True)

        queued_vo_list: List[BatchAcceptedItemVO] = []
        failed_vo_list: List[BatchFailedItemVO] = []
        db_items: List[ScreeningItem] = []

        # 4. 逐个文件读取与软受理判别
        for file in files:
            filename = file.filename or "unknown.pdf"
            content = await file.read()
            file_size = len(content)
            item_id = f"item_{uuid.uuid4().hex[:12]}"
            candidate_name = extract_candidate_name_from_filename(filename)

            is_pdf_ext = filename.lower().endswith(".pdf")
            is_pdf_magic = content.startswith(b"%PDF")

            if is_pdf_ext and is_pdf_magic and file_size > 0:
                # 合法 PDF 文件：落盘并进入排队状态
                save_path = batch_dir / f"{item_id}.pdf"
                with open(save_path, "wb") as f:
                    f.write(content)

                screening_item = ScreeningItem(
                    id=item_id,
                    batch_id=batch_id,
                    candidate_name=candidate_name,
                    original_filename=filename,
                    file_path=str(save_path.resolve()),
                    file_size_bytes=file_size,
                    status="queued",
                    parse_stage="text",
                    created_at=now,
                    updated_at=now,
                )
                db_items.append(screening_item)
                queued_vo_list.append(
                    BatchAcceptedItemVO(
                        item_id=item_id,
                        filename=filename,
                        file_size_bytes=file_size,
                        status="queued",
                    )
                )
            else:
                # 软受理隔离：异常/非 PDF 文件直接标记失败，不搞垮整个批次
                error_info = {
                    "code": "INVALID_FILE_FORMAT",
                    "message": "仅支持 PDF 格式文件，请转换后重试" if not is_pdf_ext else "PDF 文件内容损坏或为空",
                    "retryable": False,
                }
                screening_item = ScreeningItem(
                    id=item_id,
                    batch_id=batch_id,
                    candidate_name=candidate_name,
                    original_filename=filename,
                    file_path="",
                    file_size_bytes=file_size,
                    status="failed",
                    parse_stage="text",
                    error_info=error_info,
                    created_at=now,
                    updated_at=now,
                )
                db_items.append(screening_item)
                failed_vo_list.append(
                    BatchFailedItemVO(
                        item_id=item_id,
                        filename=filename,
                        file_size_bytes=file_size,
                        status="failed",
                        error_info=error_info,
                    )
                )

        # 5. 全量失败校验：若 100% 均为非法文件，则拒绝建批
        if len(queued_vo_list) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": 30003,
                    "error": "EmptyBatchError",
                    "message": "批次中所有文件均为无效或非 PDF 格式，无法受理批次",
                },
            )

        # 6. 持久化批次实体与明细
        batch = Batch(
            id=batch_id,
            job_id=job.id,
            criteria_version_id=job.current_criteria_version_id,
            title=resolved_title,
            screening_items=db_items,
            created_at=now,
        )
        db.add(batch)
        job.updated_at = now
        await db.commit()

        return BatchCreateResponse(
            batch_id=batch_id,
            job_id=job.id,
            criteria_version_id=job.current_criteria_version_id,
            title=resolved_title,
            total_files=len(files),
            accepted_count=len(queued_vo_list),
            rejected_count=len(failed_vo_list),
            queued_items=queued_vo_list,
            failed_items=failed_vo_list,
            sse_stream_url=f"/api/v1/batches/{batch_id}/events",
            created_at=now,
        )

    @staticmethod
    async def get_batch_detail(batch_id: str, db: AsyncSession) -> BatchDetailVO:
        """获取批次详情及各阶段数量统计"""
        batch = (
            await db.execute(
                select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)
            )
        ).scalar_one_or_none()

        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": 30001,
                    "error": "BatchNotFound",
                    "message": f"批次 {batch_id} 不存在或已被删除",
                },
            )

        # 聚合统计各状态数量
        status_stmt = (
            select(ScreeningItem.status, func.count(ScreeningItem.id))
            .where(ScreeningItem.batch_id == batch_id)
            .group_by(ScreeningItem.status)
        )
        status_rows = (await db.execute(status_stmt)).all()
        status_counts = {row[0]: row[1] for row in status_rows}

        total_items = sum(status_counts.values())
        stats_vo = BatchStatsVO(
            queued=status_counts.get("queued", 0),
            parsing=status_counts.get("parsing", 0),
            evaluating=status_counts.get("evaluating", 0),
            completed=status_counts.get("completed", 0),
            failed=status_counts.get("failed", 0),
        )

        return BatchDetailVO(
            batch_id=batch.id,
            job_id=batch.job_id,
            criteria_version_id=batch.criteria_version_id,
            title=batch.title,
            total_items=total_items,
            stats=stats_vo,
            created_at=batch.created_at,
        )

    @staticmethod
    async def list_batches(
        job_id: Optional[str],
        page: int,
        page_size: int,
        db: AsyncSession,
    ) -> BatchListResponse:
        """获取批次列表及统计"""
        from sqlalchemy import case

        query = select(Batch).where(Batch.is_deleted == False)
        if job_id:
            query = query.where(Batch.job_id == job_id.strip())

        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        paged_stmt = (
            query.order_by(Batch.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        batches = (await db.execute(paged_stmt)).scalars().all()

        if not batches:
            return BatchListResponse(total=total, page=page, page_size=page_size, items=[])

        batch_ids = [b.id for b in batches]

        # 跨数据库通用聚合统计成功与失败项
        stat_stmt = (
            select(
                ScreeningItem.batch_id,
                func.count(ScreeningItem.id).label("total_items"),
                func.sum(case((ScreeningItem.status == "completed", 1), else_=0)).label("completed_items"),
                func.sum(case((ScreeningItem.status == "failed", 1), else_=0)).label("failed_items"),
            )
            .where(ScreeningItem.batch_id.in_(batch_ids))
            .group_by(ScreeningItem.batch_id)
        )
        stat_rows = (await db.execute(stat_stmt)).all()
        stats_map = {
            row.batch_id: {
                "total": row.total_items,
                "completed": row.completed_items or 0,
                "failed": row.failed_items or 0,
            }
            for row in stat_rows
        }

        items: List[BatchListItemVO] = []
        for b in batches:
            s = stats_map.get(b.id, {"total": 0, "completed": 0, "failed": 0})
            items.append(
                BatchListItemVO(
                    batch_id=b.id,
                    job_id=b.job_id,
                    criteria_version_id=b.criteria_version_id,
                    title=b.title,
                    total_items=s["total"],
                    completed_items=s["completed"],
                    failed_items=s["failed"],
                    created_at=b.created_at,
                )
            )

        return BatchListResponse(
            total=total,
            page=page,
            page_size=page_size,
            items=items,
        )

    @staticmethod
    async def get_batch_metrics(
        batch_id: str,
        db: AsyncSession,
    ) -> BatchMetricsVO:
        """获取批次全景复核与业务验收指标大盘 (FR-05, AC-01 ~ AC-05)"""
        stmt = (
            select(Batch)
            .where(Batch.id == batch_id, Batch.is_deleted == False)
            .options(
                selectinload(Batch.screening_items).selectinload(ScreeningItem.evaluations),
                selectinload(Batch.screening_items).selectinload(ScreeningItem.decisions),
            )
        )
        batch = (await db.execute(stmt)).scalar_one_or_none()
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 30001, "error": "BatchNotFound", "message": f"批次 {batch_id} 不存在"},
            )

        items = batch.screening_items
        total_items = len(items)
        completed_count = 0
        failed_count = 0
        processing_count = 0

        groups_dist = {"recommended": 0, "verification": 0, "conflict": 0, "other": 0}
        decisions_dist = {"pending": 0, "advance": 0, "reject": 0, "supplement": 0}
        parse_stages = {"text": 0, "ocr": 0, "multimodal": 0}

        match_scores: List[int] = []
        coverage_rates: List[int] = []

        # 待核实补回人数统计 (PRD-001 AC-01 / 6.2)：
        # 初次评估在 verification，后续通过 supplement 重评后转入 recommended
        supplement_resolved_count = 0

        # AC-01 口径：HR 值得沟通人选 (decision == 'advance')
        hr_worthwhile_count = 0
        recommended_or_verified_count = 0

        for it in items:
            if it.status == "completed":
                completed_count += 1
            elif it.status == "failed":
                failed_count += 1
            else:
                processing_count += 1

            stage = it.parse_stage or "text"
            parse_stages[stage] = parse_stages.get(stage, 0) + 1

            sorted_decisions = sorted(it.decisions, key=lambda d: d.created_at, reverse=True)
            active_decision = sorted_decisions[0].decision if sorted_decisions else "pending"
            decisions_dist[active_decision] = decisions_dist.get(active_decision, 0) + 1

            if it.evaluations:
                sorted_evals = sorted(it.evaluations, key=lambda e: e.version)
                first_eval = sorted_evals[0]
                latest_eval = sorted_evals[-1]

                grp = latest_eval.suggested_group
                groups_dist[grp] = groups_dist.get(grp, 0) + 1

                if latest_eval.match_score is not None:
                    match_scores.append(latest_eval.match_score)
                coverage_rates.append(latest_eval.coverage_rate)

                if (
                    len(sorted_evals) > 1
                    and first_eval.suggested_group == "verification"
                    and latest_eval.suggested_group == "recommended"
                ):
                    supplement_resolved_count += 1

                if active_decision == "advance":
                    hr_worthwhile_count += 1
                    if latest_eval.suggested_group in ["recommended", "verification"]:
                        recommended_or_verified_count += 1

        avg_score = round(sum(match_scores) / len(match_scores), 1) if match_scores else None
        avg_coverage = round(sum(coverage_rates) / len(coverage_rates), 1) if coverage_rates else 0.0

        ac01_ratio = (
            round((recommended_or_verified_count / hr_worthwhile_count) * 100, 1)
            if hr_worthwhile_count > 0
            else 100.0
        )
        is_ac01_passed = ac01_ratio >= 95.0

        return BatchMetricsVO(
            batch_id=batch.id,
            title=batch.title,
            total_items=total_items,
            completed_count=completed_count,
            failed_count=failed_count,
            processing_count=processing_count,
            groups_distribution=groups_dist,
            decisions_distribution=decisions_dist,
            supplement_resolved_count=supplement_resolved_count,
            average_match_score=avg_score,
            average_coverage_rate=avg_coverage,
            ac01=AC01MetricsVO(
                hr_worthwhile_count=hr_worthwhile_count,
                recommended_or_verified_count=recommended_or_verified_count,
                ac01_ratio=ac01_ratio,
                is_ac01_passed=is_ac01_passed,
            ),
            parse_stages=parse_stages,
            generated_at=utc_now(),
        )

    @staticmethod
    async def export_batch_data(
        batch_id: str,
        format_type: str,
        db: AsyncSession,
    ) -> tuple[str, str, str]:
        """导出批次全量结构化初筛与复核数据报表 (CSV / JSON)"""
        stmt = (
            select(Batch)
            .where(Batch.id == batch_id, Batch.is_deleted == False)
            .options(
                selectinload(Batch.screening_items).selectinload(ScreeningItem.evaluations),
                selectinload(Batch.screening_items).selectinload(ScreeningItem.decisions),
            )
        )
        batch = (await db.execute(stmt)).scalar_one_or_none()
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 30001, "error": "BatchNotFound", "message": f"批次 {batch_id} 不存在"},
            )

        items = batch.screening_items
        group_names = {
            "recommended": "优先推荐",
            "verification": "待核实",
            "conflict": "条件冲突",
            "other": "其他人选",
        }
        decision_names = {
            "advance": "推进沟通",
            "supplement": "待补充信息",
            "reject": "暂不推进",
            "pending": "未复核",
        }

        if format_type.lower() == "json":
            import json

            records = []
            for it in items:
                sorted_evals = sorted(it.evaluations, key=lambda e: e.version)
                latest_eval = sorted_evals[-1] if sorted_evals else None
                sorted_decisions = sorted(it.decisions, key=lambda d: d.created_at, reverse=True)
                active_decision = sorted_decisions[0] if sorted_decisions else None

                records.append({
                    "item_id": it.id,
                    "candidate_name": it.candidate_name,
                    "original_filename": it.original_filename,
                    "status": it.status,
                    "parse_stage": it.parse_stage,
                    "match_score": latest_eval.match_score if latest_eval else None,
                    "coverage_rate": latest_eval.coverage_rate if latest_eval else 0,
                    "suggested_group": latest_eval.suggested_group if latest_eval else "other",
                    "decision": active_decision.decision if active_decision else "pending",
                    "tags": active_decision.tags if active_decision else [],
                    "notes": active_decision.notes if active_decision else "",
                    "evaluation_version": latest_eval.version if latest_eval else 0,
                    "updated_at": it.updated_at.isoformat() if it.updated_at else None,
                })
            content = json.dumps(
                {"batch_id": batch.id, "title": batch.title, "records": records},
                ensure_ascii=False,
                indent=2,
            )
            filename = f"批次导出_{batch.title}.json"
            return content, "application/json; charset=utf-8", filename

        # 默认导出 CSV (带 UTF-8 BOM 兼容 Excel)
        import csv
        import io

        output = io.StringIO()
        output.write("\ufeff")

        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow([
            "序号",
            "候选人姓名",
            "原始文件",
            "处理状态",
            "解析方式",
            "匹配分",
            "证据覆盖率",
            "建议分流队列",
            "人工复核决定",
            "决定标签",
            "复核备注",
            "评估版本",
            "决策修改次数",
            "更新时间",
        ])

        for idx, it in enumerate(items, 1):
            sorted_evals = sorted(it.evaluations, key=lambda e: e.version)
            latest_eval = sorted_evals[-1] if sorted_evals else None
            sorted_decisions = sorted(it.decisions, key=lambda d: d.created_at, reverse=True)
            active_decision = sorted_decisions[0] if sorted_decisions else None

            match_score_str = (
                str(latest_eval.match_score)
                if (latest_eval and latest_eval.match_score is not None)
                else "暂不评分"
            )
            coverage_str = f"{latest_eval.coverage_rate}%" if latest_eval else "0%"
            grp_name = group_names.get(
                latest_eval.suggested_group if latest_eval else "other", "其他人选"
            )
            decision_name = decision_names.get(
                active_decision.decision if active_decision else "pending", "未复核"
            )
            tags_str = (
                "、".join(active_decision.tags)
                if (active_decision and active_decision.tags)
                else ""
            )
            notes_str = active_decision.notes if active_decision else ""
            eval_version_str = f"v{latest_eval.version}" if latest_eval else "-"
            decision_count = len(it.decisions)
            updated_str = (
                it.updated_at.strftime("%Y-%m-%d %H:%M:%S") if it.updated_at else "-"
            )

            writer.writerow([
                idx,
                it.candidate_name or "未知候选人",
                it.original_filename,
                it.status,
                it.parse_stage,
                match_score_str,
                coverage_str,
                grp_name,
                decision_name,
                tags_str,
                notes_str,
                eval_version_str,
                decision_count,
                updated_str,
            ])

        content = output.getvalue()
        filename = f"批次导出_{batch.title}.csv"
        return content, "text/csv; charset=utf-8", filename

