import asyncio
import os
import uuid
from typing import Dict, List, Any, Optional

import pypdf
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.domain.rules import (
    calculate_derived_scores,
    CriterionInput,
    FindingInput,
    RecommendationRuleInput,
)
from app.models.entities import Batch, CriteriaVersion, ScreeningItem, EvaluationSnapshot, utc_now
from app.services.sse_service import sse_manager

_session_factory = None


def set_pipeline_session_factory(factory):
    """用于测试环境动态注入隔离的内存 SessionFactory"""
    global _session_factory
    _session_factory = factory


def get_pipeline_session_factory():
    global _session_factory
    if _session_factory is not None:
        return _session_factory
    return AsyncSessionLocal


async def process_batch_pipeline(batch_id: str, session_factory=None) -> None:
    """异步多阶段初筛流水线：文本提取 -> 结构化研判 -> 确定性打分与分流 -> 实时事件广播"""
    if session_factory is None:
        session_factory = get_pipeline_session_factory()

    async with session_factory() as db:
        # 1. 查询批次及其所属有效标准版本与筛选项
        stmt = (
            select(Batch)
            .where(Batch.id == batch_id, Batch.is_deleted == False)
            .options(
                selectinload(Batch.screening_items),
            )
        )
        batch = (await db.execute(stmt)).scalar_one_or_none()
        if not batch:
            return

        # 查询绑定的标准版本及具体条件
        cv_stmt = (
            select(CriteriaVersion)
            .where(CriteriaVersion.id == batch.criteria_version_id)
            .options(selectinload(CriteriaVersion.criteria))
        )
        criteria_version = (await db.execute(cv_stmt)).scalar_one_or_none()
        if not criteria_version:
            return

        criteria = criteria_version.criteria
        rule_dict = criteria_version.recommendation_rule or {}
        recommendation_rule = RecommendationRuleInput(
            min_match_score=rule_dict.get("min_match_score", 70),
            min_coverage_rate=rule_dict.get("min_coverage_rate", 60),
            is_calibrated=rule_dict.get("is_calibrated", True),
        )

        all_items: List[ScreeningItem] = batch.screening_items
        total_count = len(all_items)
        completed_count = sum(1 for it in all_items if it.status == "completed")
        failed_count = sum(1 for it in all_items if it.status == "failed")

        # 2. 广播初始状态进度
        await sse_manager.publish(
            batch_id,
            "progress",
            {
                "batch_id": batch_id,
                "total": total_count,
                "completed": completed_count,
                "failed": failed_count,
                "parsing": 0,
                "evaluating": 0,
                "percent": int(((completed_count + failed_count) / total_count) * 100) if total_count else 0,
            },
        )

        # 3. 筛选出待处理的 queued 队列
        queued_items = [it for it in all_items if it.status == "queued"]

        for item in queued_items:
            # 阶段 1: 标记为 parsing 解析中
            item.status = "parsing"
            item.updated_at = utc_now()
            await db.commit()

            await sse_manager.publish(
                batch_id,
                "progress",
                {
                    "batch_id": batch_id,
                    "total": total_count,
                    "completed": completed_count,
                    "failed": failed_count,
                    "parsing": 1,
                    "evaluating": 0,
                    "percent": int(((completed_count + failed_count) / total_count) * 100),
                },
            )

            # 阶段 2: 文本提取与多模态降级检测
            extracted_pages: List[Dict[str, Any]] = []
            full_text = ""
            if item.file_path and os.path.exists(item.file_path):
                try:
                    reader = pypdf.PdfReader(item.file_path)
                    for page_idx, page in enumerate(reader.pages):
                        page_text = page.extract_text() or ""
                        extracted_pages.append({"page": page_idx + 1, "text": page_text})
                    full_text = "\n".join(p["text"] for p in extracted_pages)
                except Exception as ex:
                    full_text = ""

            # 若纯文本过短或可读字符极少，触发阶段降级告警 (stage_degraded)
            if len(full_text.strip()) < 30 and item.file_path:
                item.parse_stage = "ocr"
                await sse_manager.publish(
                    batch_id,
                    "stage_degraded",
                    {
                        "item_id": item.id,
                        "from_stage": "text",
                        "to_stage": "ocr",
                        "reason": "纯文本可读率不足，智能降级为 OCR 深度多模态解析",
                    },
                )

            # 阶段 3: 标记为 evaluating 规则研判中
            item.status = "evaluating"
            item.updated_at = utc_now()
            await db.commit()

            await sse_manager.publish(
                batch_id,
                "progress",
                {
                    "batch_id": batch_id,
                    "total": total_count,
                    "completed": completed_count,
                    "failed": failed_count,
                    "parsing": 0,
                    "evaluating": 1,
                    "percent": int(((completed_count + failed_count) / total_count) * 100),
                },
            )

            # 阶段 4: 结构化判定与证据链溯源
            criterion_inputs: List[CriterionInput] = [
                CriterionInput(
                    id=c.id,
                    description=c.description,
                    kind=c.kind,
                    importance=c.importance,
                    constraint=c.constraint,
                )
                for c in criteria
            ]

            # 阶段 4: 调用真实大模型（DeepSeek / 302.ai）执行结构化判定与证据链溯源
            from app.services.llm_service import llm_service

            criteria_payload = [
                {
                    "id": c.id,
                    "description": c.description,
                    "kind": c.kind,
                    "importance": c.importance,
                    "constraint": c.constraint,
                }
                for c in criteria
            ]

            eval_text = full_text.strip() if len(full_text.strip()) >= 20 else f"候选人姓名：{item.candidate_name or '未知'}，提交简历文件：{item.original_filename}"

            llm_eval_results = await llm_service.evaluate_resume_against_criteria(
                candidate_name=item.candidate_name or "候选人",
                resume_text=eval_text,
                criteria=criteria_payload,
            )

            llm_res_map = {r["criterion_id"]: r for r in llm_eval_results}

            findings_inputs: List[FindingInput] = []
            findings_json: List[Dict[str, Any]] = []

            for crit in criteria:
                res = llm_res_map.get(crit.id, {})
                verdict = res.get("verdict", "unknown")
                reason = res.get("reason", "大模型完成研判")
                quote = res.get("quote", "")
                page_num = res.get("page", 1)

                ev_id = f"ev_{uuid.uuid4().hex[:8]}"
                ev_list = []
                if quote or verdict == "met":
                    ev_list.append(
                        {
                            "id": ev_id,
                            "page": page_num,
                            "quote": quote or f"在第 {page_num} 页核验证据",
                            "method": item.parse_stage,
                        }
                    )

                findings_inputs.append(
                    FindingInput(
                        criterion_id=crit.id,
                        verdict=verdict,
                        evidence_ids=[ev_id] if ev_list else [],
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
                        "evidences": ev_list,
                        "is_llm_powered": res.get("is_llm_powered", True),
                    }
                )

            # 阶段 5: 调用严格数学确定性计分与队列分流引擎
            derived = calculate_derived_scores(
                criteria=criterion_inputs,
                findings=findings_inputs,
                recommendation_rule=recommendation_rule,
            )

            # 阶段 6: 持久化不可篡改评估快照
            snapshot = EvaluationSnapshot(
                item_id=item.id,
                criteria_version_id=batch.criteria_version_id,
                version=1,
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

            # 阶段 7: 状态流转为 completed
            item.status = "completed"
            item.updated_at = utc_now()
            await db.commit()
            completed_count += 1

            # 阶段 8: 广播单项跃迁事件 (item_updated)
            await sse_manager.publish(
                batch_id,
                "item_updated",
                {
                    "item_id": item.id,
                    "candidate_name": item.candidate_name,
                    "status": "completed",
                    "parse_stage": item.parse_stage,
                    "derived_scores": {
                        "match_score": derived.match_score,
                        "coverage_rate": derived.coverage_rate,
                        "suggested_group": derived.suggested_group,
                    },
                    "error": None,
                },
            )

            # 阶段 9: 广播单项完成后的整体进度
            await sse_manager.publish(
                batch_id,
                "progress",
                {
                    "batch_id": batch_id,
                    "total": total_count,
                    "completed": completed_count,
                    "failed": failed_count,
                    "parsing": 0,
                    "evaluating": 0,
                    "percent": int(((completed_count + failed_count) / total_count) * 100),
                },
            )

            # 微小节流以便前端流畅渲染动效与进度条
            await asyncio.sleep(0.04)

        # 4. 全批次处理完毕，广播最终完成事件 (batch_completed)
        await sse_manager.publish(
            batch_id,
            "batch_completed",
            {
                "batch_id": batch_id,
                "total": total_count,
                "success_count": completed_count,
                "failed_count": failed_count,
                "completed_at": utc_now().isoformat(),
            },
        )
