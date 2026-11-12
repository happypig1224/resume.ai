import urllib.parse
from typing import List, Optional
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.jobs import StandardResponse
from app.core.database import get_db
from app.models.entities import Batch
from app.schemas.domain import (
    BatchCreateResponse,
    BatchDetailVO,
    BatchItemListResponse,
    BatchListResponse,
    BatchMetricsVO,
)
from app.services.batch_service import BatchService
from app.services.item_service import ItemService
from app.services.pipeline_service import process_batch_pipeline
from app.services.sse_service import sse_manager

router = APIRouter()


@router.post(
    "",
    response_model=StandardResponse[BatchCreateResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="批量上传简历创建批次并启动后台解析流水线",
)
async def create_batch(
    background_tasks: BackgroundTasks,
    job_id: str = Form(..., description="所属岗位唯一标识"),
    title: Optional[str] = Form(None, description="批次自定义标题（可选）"),
    files: List[UploadFile] = File(..., description="上传的简历文件列表（1~50份）"),
    db: AsyncSession = Depends(get_db),
):
    """
    核心端点：批量上传简历并创建批次
    - 严守单批 50 份上限；
    - 执行软受理（Soft Acceptance）：单份损坏或非 PDF 文件不阻断整批；
    - 成功受理后返回 202 Accepted 并挂载异步后台解析流水线与 SSE 实时广播。
    """
    data = await BatchService.create_batch(
        job_id=job_id,
        files=files,
        title=title,
        db=db,
    )

    # 派发异步流水线长任务
    background_tasks.add_task(process_batch_pipeline, data.batch_id)

    return StandardResponse(
        code=status.HTTP_202_ACCEPTED,
        message="批次受理成功，已启动后台异步解析流水线",
        data=data,
    )


@router.get(
    "",
    response_model=StandardResponse[BatchListResponse],
    status_code=status.HTTP_200_OK,
    summary="分页获取导入批次列表",
)
async def list_batches(
    job_id: Optional[str] = Query(None, description="按目标岗位 ID 过滤"),
    page: int = Query(1, ge=1, description="当前页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: AsyncSession = Depends(get_db),
):
    data = await BatchService.list_batches(
        job_id=job_id,
        page=page,
        page_size=page_size,
        db=db,
    )
    return StandardResponse(code=status.HTTP_200_OK, message="获取批次列表成功", data=data)


@router.get(
    "/{batch_id}",
    response_model=StandardResponse[BatchDetailVO],
    status_code=status.HTTP_200_OK,
    summary="获取单个批次详情与各阶段统计",
)
async def get_batch_detail(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
):
    data = await BatchService.get_batch_detail(batch_id=batch_id, db=db)
    return StandardResponse(code=status.HTTP_200_OK, message="获取批次详情成功", data=data)


@router.get(
    "/{batch_id}/items",
    response_model=StandardResponse[BatchItemListResponse],
    status_code=status.HTTP_200_OK,
    summary="分页获取批次下的候选人列表与队列分段",
)
async def list_batch_items(
    batch_id: str,
    group: Optional[str] = Query(None, description="队列过滤：all, recommended, verification, conflict, failed"),
    decision: Optional[str] = Query(None, description="复核状态过滤：all, unreviewed, advance, reject, supplement"),
    page: int = Query(1, ge=1, description="当前页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: AsyncSession = Depends(get_db),
):
    """
    FR-04/FR-05 批次工作台列表查询：
    - 返回每个候选人当前的最新评估状态、已知条件匹配分与证据覆盖率；
    - 提供推荐队列、待核实队列、条件冲突队列与异常待办队列的全局分布统计。
    """
    data = await ItemService.list_batch_items(
        batch_id=batch_id,
        group=group,
        decision=decision,
        page=page,
        page_size=page_size,
        db=db,
    )
    return StandardResponse(code=status.HTTP_200_OK, message="获取候选人列表成功", data=data)


@router.get(
    "/{batch_id}/events",
    summary="SSE 流式长连接：批次进度与单项状态跃迁实时广播",
)
async def stream_batch_events(
    batch_id: str,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID", description="断线重连最后收到的事件 ID"),
    last_event_id_query: Optional[str] = Query(None, alias="last_event_id", description="兼容查询参数传参"),
    db: AsyncSession = Depends(get_db),
):
    """
    长连接流式广播端点：
    - Content-Type: text/event-stream
    - 支持 Last-Event-ID 遗漏事件优先补发；
    - 支持每 15 秒心跳保活行 (: keepalive)；
    - 广播事件：progress, item_updated, stage_degraded, batch_completed。
    """
    # 校验批次是否存在
    batch = (
        await db.execute(select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False))
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

    effective_last_id = last_event_id or last_event_id_query

    return StreamingResponse(
        sse_manager.subscribe(batch_id=batch_id, last_event_id=effective_last_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/{batch_id}/metrics",
    response_model=StandardResponse[BatchMetricsVO],
    status_code=status.HTTP_200_OK,
    summary="获取批次全景审计与验收指标大盘",
)
async def get_batch_metrics(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    FR-05, AC-01 ~ AC-05 审计大盘：
    - 返回推荐/待核实/条件冲突各队列人数与转化率；
    - 统计 HR 决策分布与电话补充重评补回人数；
    - 输出 AC-01 关键覆盖率指标 (≥95%) 与各阶段识别率。
    """
    data = await BatchService.get_batch_metrics(batch_id=batch_id, db=db)
    return StandardResponse(code=status.HTTP_200_OK, message="获取批次审计指标成功", data=data)


@router.get(
    "/{batch_id}/export",
    summary="导出批次全量结构化初筛与复核数据报表 (CSV / JSON)",
)
async def export_batch_data(
    batch_id: str,
    format: str = Query("csv", pattern="^(csv|json)$", description="导出格式：csv 或 json"),
    db: AsyncSession = Depends(get_db),
):
    """
    FR-05 离线导出与 ATS 契约：
    - CSV 导出内嵌 UTF-8 BOM，解决 Excel 打开中文乱码问题；
    - 包含：姓名、匹配分、覆盖率、分流队列、人工决定、决定标签、备注、评估版本及更新时间。
    """
    content, media_type, filename = await BatchService.export_batch_data(
        batch_id=batch_id, format_type=format, db=db
    )
    encoded_filename = urllib.parse.quote(filename)
    headers = {
        "Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}",
    }
    return Response(
        content=content,
        media_type=media_type,
        headers=headers,
    )

