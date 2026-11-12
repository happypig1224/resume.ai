from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.domain import (
    CriteriaConfirmResponse,
    CriteriaDraftUpdate,
    CriteriaVersionSchema,
    ExtractCriteriaResponse,
    JobCreate,
    JobCreateResponse,
    JobDetailResponse,
    JobListResponse,
    StandardResponse,
)
from app.services.job_service import JobService

router = APIRouter(prefix="/jobs", tags=["Jobs & Criteria Engine"])


@router.post(
    "",
    response_model=StandardResponse[JobCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="创建岗位并初始化标准草稿",
)
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
):
    data = await JobService.create_job(payload, db)
    return StandardResponse(code=status.HTTP_201_CREATED, message="岗位创建成功", data=data)


@router.get(
    "",
    response_model=StandardResponse[JobListResponse],
    status_code=status.HTTP_200_OK,
    summary="分页获取岗位列表（带标准状态与统计指标）",
)
async def list_jobs(
    page: int = Query(1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数，最大 100"),
    department: Optional[str] = Query(None, description="按部门精确筛选"),
    status_filter: str = Query("all", alias="status", pattern="^(all|ready|needs_criteria)$", description="按标准状态筛选"),
    search: Optional[str] = Query(None, max_length=100, description="按岗位名称模糊搜索"),
    db: AsyncSession = Depends(get_db),
):
    data = await JobService.list_jobs(
        db=db,
        page=page,
        page_size=page_size,
        department=department,
        status_filter=status_filter,
        search=search,
    )
    return StandardResponse(code=status.HTTP_200_OK, message="success", data=data)


@router.get(
    "/{job_id}",
    response_model=StandardResponse[JobDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="获取指定岗位详情及当前标准与草稿",
)
async def get_job_detail(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    data = await JobService.get_job_detail(job_id, db)
    return StandardResponse(code=status.HTTP_200_OK, message="success", data=data)


@router.post(
    "/{job_id}/extract-criteria",
    response_model=StandardResponse[ExtractCriteriaResponse],
    status_code=status.HTTP_200_OK,
    summary="AI/规则提炼 JD 结构化判定条件",
)
async def extract_criteria(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    data = await JobService.extract_criteria_from_jd(job_id, db)
    return StandardResponse(code=status.HTTP_200_OK, message="条件提取成功", data=data)


@router.put(
    "/{job_id}/criteria-draft",
    response_model=StandardResponse[CriteriaVersionSchema],
    status_code=status.HTTP_200_OK,
    summary="保存或更新岗位标准草稿",
)
async def update_criteria_draft(
    job_id: str,
    payload: CriteriaDraftUpdate,
    db: AsyncSession = Depends(get_db),
):
    data = await JobService.update_criteria_draft(job_id, payload, db)
    return StandardResponse(code=status.HTTP_200_OK, message="草稿保存成功", data=data)


@router.post(
    "/{job_id}/criteria/confirm",
    response_model=StandardResponse[CriteriaConfirmResponse],
    status_code=status.HTTP_200_OK,
    summary="确认并冻结标准版本为不可变快照",
)
async def confirm_criteria(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    data = await JobService.confirm_criteria(job_id, db)
    return StandardResponse(code=status.HTTP_200_OK, message="标准确认冻结成功", data=data)
