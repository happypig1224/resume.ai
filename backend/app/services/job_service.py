import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import (
    Batch,
    CriteriaVersion,
    Criterion,
    Job,
    ScreeningItem,
)
from app.schemas.domain import (
    ConfirmedVersionSummary,
    CriteriaConfirmResponse,
    CriteriaDraftUpdate,
    CriteriaStatusSummary,
    CriteriaVersionSchema,
    CriterionSchema,
    JobCreate,
    JobCreateResponse,
    JobDetailResponse,
    JobListItemVO,
    JobListResponse,
    JobStatsSummary,
    RecommendationRuleSchema,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobService:
    """招聘岗位与标准引擎核心业务服务"""

    @staticmethod
    async def create_job(payload: JobCreate, db: AsyncSession) -> JobCreateResponse:
        """创建岗位并自动初始化 v1 版本标准草稿"""
        job = Job(
            title=payload.title.strip(),
            department=payload.department.strip(),
            jd_text=payload.jd_text.strip(),
        )
        db.add(job)
        await db.flush()  # 生成 job.id

        # 自动初始化第 1 版草稿
        draft_version = CriteriaVersion(
            job_id=job.id,
            version=1,
            status="draft",
            recommendation_rule={
                "min_match_score": 70,
                "min_coverage_rate": 60,
                "is_calibrated": False,
            },
        )
        db.add(draft_version)
        await db.flush()

        # 若传入初始条件，批量存入
        if payload.initial_criteria:
            for idx, item in enumerate(payload.initial_criteria):
                criterion = Criterion(
                    version_id=draft_version.id,
                    description=item.description.strip(),
                    kind=item.kind,
                    importance=item.importance,
                    constraint=item.constraint,
                    order_num=item.order_num or (idx + 1),
                )
                db.add(criterion)

        await db.commit()

        return JobCreateResponse(
            id=job.id,
            title=job.title,
            department=job.department,
            jd_text=job.jd_text,
            current_criteria_version_id=job.current_criteria_version_id,
            draft_version_id=draft_version.id,
            created_at=job.created_at,
        )

    @staticmethod
    async def list_jobs(
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        department: Optional[str] = None,
        status_filter: str = "all",
        search: Optional[str] = None,
    ) -> JobListResponse:
        """列表查询：通过预加载与批量聚合彻底消除 N+1 查询"""
        query = select(Job).where(Job.is_deleted == False)

        if department:
            query = query.where(Job.department == department.strip())

        if search:
            query = query.where(Job.title.contains(search.strip(), autoescape=True))

        if status_filter == "ready":
            query = query.where(Job.current_criteria_version_id.isnot(None))
        elif status_filter == "needs_criteria":
            query = query.where(Job.current_criteria_version_id.is_(None))

        # 统计总数
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        # 分页检索（预加载标准版本及其条件）
        paged_stmt = (
            query.order_by(Job.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .options(
                selectinload(Job.criteria_versions).selectinload(CriteriaVersion.criteria)
            )
        )
        jobs: List[Job] = (await db.execute(paged_stmt)).scalars().all()

        if not jobs:
            return JobListResponse(total=total, page=page, page_size=page_size, items=[])

        job_ids = [j.id for j in jobs]

        # 批量统计批次数与候选人数（单条聚合 SQL）
        stat_stmt = (
            select(
                Batch.job_id,
                func.count(func.distinct(Batch.id)).label("batch_count"),
                func.count(ScreeningItem.id).label("candidate_count"),
            )
            .outerjoin(ScreeningItem, Batch.id == ScreeningItem.batch_id)
            .where(Batch.job_id.in_(job_ids), Batch.is_deleted == False)
            .group_by(Batch.job_id)
        )
        stat_rows = (await db.execute(stat_stmt)).all()
        stats_map: Dict[str, Dict[str, int]] = {
            row.job_id: {
                "batch_count": row.batch_count,
                "candidate_count": row.candidate_count,
            }
            for row in stat_rows
        }

        # 组装 DTO 视图对象
        items: List[JobListItemVO] = []
        for j in jobs:
            # 找到当前生效版本与进行中草稿
            confirmed_v = None
            draft_v = None
            for cv in j.criteria_versions:
                if cv.id == j.current_criteria_version_id:
                    confirmed_v = cv
                elif cv.status == "draft":
                    draft_v = cv

            confirmed_summary = None
            if confirmed_v:
                req_cnt = sum(1 for c in confirmed_v.criteria if c.kind == "required")
                bonus_cnt = sum(1 for c in confirmed_v.criteria if c.kind == "bonus")
                confirmed_summary = ConfirmedVersionSummary(
                    version_id=confirmed_v.id,
                    version_num=confirmed_v.version,
                    confirmed_at=confirmed_v.confirmed_at or confirmed_v.created_at,
                    required_count=req_cnt,
                    bonus_count=bonus_cnt,
                )

            j_stat = stats_map.get(j.id, {"batch_count": 0, "candidate_count": 0})

            items.append(
                JobListItemVO(
                    id=j.id,
                    title=j.title,
                    department=j.department,
                    created_at=j.created_at,
                    updated_at=j.updated_at,
                    criteria_status=CriteriaStatusSummary(
                        is_ready_for_import=bool(j.current_criteria_version_id),
                        confirmed_version=confirmed_summary,
                        has_active_draft=draft_v is not None,
                        draft_version_num=draft_v.version if draft_v else None,
                        draft_version_id=draft_v.id if draft_v else None,
                    ),
                    stats=JobStatsSummary(
                        total_batches=j_stat["batch_count"],
                        total_candidates=j_stat["candidate_count"],
                    ),
                )
            )

        return JobListResponse(
            total=total,
            page=page,
            page_size=page_size,
            items=items,
        )

    @staticmethod
    async def get_job_detail(job_id: str, db: AsyncSession) -> JobDetailResponse:
        """获取单个岗位详情及当前生效标准和草稿"""
        stmt = (
            select(Job)
            .where(Job.id == job_id, Job.is_deleted == False)
            .options(
                selectinload(Job.criteria_versions).selectinload(CriteriaVersion.criteria)
            )
        )
        job = (await db.execute(stmt)).scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 20001, "message": f"岗位 {job_id} 不存在或已被删除"},
            )

        current_v = None
        draft_v = None
        for cv in job.criteria_versions:
            if cv.id == job.current_criteria_version_id:
                current_v = cv
            elif cv.status == "draft":
                draft_v = cv

        def map_version_schema(v: Optional[CriteriaVersion]) -> Optional[CriteriaVersionSchema]:
            if not v:
                return None
            return CriteriaVersionSchema(
                id=v.id,
                job_id=v.job_id,
                version=v.version,
                status=v.status,
                recommendation_rule=RecommendationRuleSchema(**(v.recommendation_rule or {})),
                criteria=[
                    CriterionSchema(
                        id=c.id,
                        description=c.description,
                        kind=c.kind,
                        importance=c.importance,
                        constraint=c.constraint,
                        order_num=c.order_num,
                    )
                    for c in v.criteria
                ],
                confirmed_at=v.confirmed_at,
                created_at=v.created_at,
            )

        return JobDetailResponse(
            id=job.id,
            title=job.title,
            department=job.department,
            jd_text=job.jd_text,
            current_criteria_version_id=job.current_criteria_version_id,
            current_criteria_version=map_version_schema(current_v),
            active_draft_version=map_version_schema(draft_v),
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    @staticmethod
    async def update_criteria_draft(
        job_id: str, payload: CriteriaDraftUpdate, db: AsyncSession
    ) -> CriteriaVersionSchema:
        """保存或更新标准草稿（若当前无草稿，自动自增派生新草稿）"""
        job = (
            await db.execute(
                select(Job).where(Job.id == job_id, Job.is_deleted == False)
            )
        ).scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 20001, "message": f"岗位 {job_id} 不存在"},
            )

        # 查找当前草稿
        draft_stmt = (
            select(CriteriaVersion)
            .where(CriteriaVersion.job_id == job_id, CriteriaVersion.status == "draft")
            .options(selectinload(CriteriaVersion.criteria))
        )
        draft = (await db.execute(draft_stmt)).scalar_one_or_none()

        if not draft:
            # 当前无草稿，计算最新版本号派生新草稿
            max_v_stmt = select(func.max(CriteriaVersion.version)).where(
                CriteriaVersion.job_id == job_id
            )
            max_v = (await db.execute(max_v_stmt)).scalar() or 0
            draft = CriteriaVersion(
                job_id=job_id,
                version=max_v + 1,
                status="draft",
                criteria=[],
            )
            db.add(draft)

        # 更新门槛规则
        if payload.recommendation_rule:
            draft.recommendation_rule = payload.recommendation_rule.model_dump()

        # 利用 cascade="all, delete-orphan" 自动物理替换并同步内存关系
        new_criteria: List[Criterion] = [
            Criterion(
                version_id=draft.id,
                description=item.description.strip(),
                kind=item.kind,
                importance=item.importance,
                constraint=item.constraint,
                order_num=item.order_num or (idx + 1),
            )
            for idx, item in enumerate(payload.criteria)
        ]
        draft.criteria = new_criteria

        job.updated_at = utc_now()
        await db.commit()

        return CriteriaVersionSchema(
            id=draft.id,
            job_id=draft.job_id,
            version=draft.version,
            status=draft.status,
            recommendation_rule=RecommendationRuleSchema(**(draft.recommendation_rule or {})),
            criteria=[
                CriterionSchema(
                    id=c.id,
                    description=c.description,
                    kind=c.kind,
                    importance=c.importance,
                    constraint=c.constraint,
                    order_num=c.order_num,
                )
                for c in new_criteria
            ],
            confirmed_at=draft.confirmed_at,
            created_at=draft.created_at,
        )

    @staticmethod
    async def confirm_criteria(job_id: str, db: AsyncSession) -> CriteriaConfirmResponse:
        """核心契约：确认并冻结标准草稿为不可变版本快照"""
        job = (
            await db.execute(
                select(Job).where(Job.id == job_id, Job.is_deleted == False)
            )
        ).scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 20001, "message": f"岗位 {job_id} 不存在"},
            )

        draft_stmt = (
            select(CriteriaVersion)
            .where(CriteriaVersion.job_id == job_id, CriteriaVersion.status == "draft")
            .options(selectinload(CriteriaVersion.criteria))
        )
        draft = (await db.execute(draft_stmt)).scalar_one_or_none()

        if not draft:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": 20002, "message": "当前岗位无待确认的标准草稿"},
            )

        # 业务校验：必须至少有 1 个必要条件
        total_criteria_count = len(draft.criteria)
        required_count = sum(1 for c in draft.criteria if c.kind == "required")
        bonus_count = sum(1 for c in draft.criteria if c.kind == "bonus")

        if required_count == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": 20003, "message": "岗位标准必须包含至少 1 项必要条件 (required)"},
            )

        # 冻结快照
        now = utc_now()
        draft.status = "confirmed"
        draft.confirmed_at = now

        # 更新岗位当前有效版本指向
        job.current_criteria_version_id = draft.id
        job.updated_at = now

        draft_id = draft.id
        draft_version = draft.version
        draft_status = draft.status

        await db.commit()

        return CriteriaConfirmResponse(
            version_id=draft_id,
            job_id=job.id,
            version=draft_version,
            status=draft_status,
            confirmed_at=now,
            total_criteria_count=total_criteria_count,
            required_criteria_count=required_count,
            bonus_criteria_count=bonus_count,
        )

    @staticmethod
    async def extract_criteria_from_jd(
        job_id: str, db: AsyncSession
    ) -> "ExtractCriteriaResponse":
        """AI / 规则混合解析：从岗位原始 JD 中提炼结构化条件项"""
        from app.schemas.domain import ExtractCriteriaResponse

        job = (
            await db.execute(
                select(Job).where(Job.id == job_id, Job.is_deleted == False)
            )
        ).scalar_one_or_none()

        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": 20001, "message": f"岗位 {job_id} 不存在"},
            )

        # 调用真实大模型（DeepSeek / 302.ai）执行结构化判定条件抽取
        from app.services.llm_service import llm_service
        llm_result = await llm_service.extract_criteria_from_jd(job.title, job.jd_text)

        extracted: List[CriterionSchema] = []
        order_idx = 1

        for req in llm_result.get("required_criteria", []):
            extracted.append(
                CriterionSchema(
                    id=f"crit_ext_{uuid.uuid4().hex[:8]}",
                    description=req.get("description", ""),
                    kind="required",
                    importance=req.get("importance", "high"),
                    constraint=req.get("constraint", "strict"),
                    order_num=order_idx,
                )
            )
            order_idx += 1

        for bon in llm_result.get("bonus_criteria", []):
            extracted.append(
                CriterionSchema(
                    id=f"crit_ext_{uuid.uuid4().hex[:8]}",
                    description=bon.get("description", ""),
                    kind="bonus",
                    importance=bon.get("importance", "medium"),
                    constraint=None,
                    order_num=order_idx,
                )
            )
            order_idx += 1

        # 若提取过少，生成保底标准
        if not extracted:
            extracted.append(
                CriterionSchema(
                    id=f"crit_ext_{uuid.uuid4().hex[:8]}",
                    description="具备岗位 JD 要求的核心专业技能与经验",
                    kind="required",
                    importance="high",
                    constraint="strict",
                    order_num=1,
                )
            )

        return ExtractCriteriaResponse(job_id=job.id, extracted_criteria=extracted)
