import os
from typing import List
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.jobs import StandardResponse
from app.core.database import get_db
from app.schemas.domain import (
    CandidateReviewDetailVO,
    CreateDecisionRequest,
    DecisionVO,
    RetryItemResponse,
    SupplementReevaluateRequest,
    SupplementReevaluateResponse,
)
from app.services.item_service import ItemService

router = APIRouter()


@router.get(
    "/{item_id}",
    response_model=StandardResponse[CandidateReviewDetailVO],
    status_code=status.HTTP_200_OK,
    summary="获取候选人全景研判与事实穿透详情",
)
async def get_candidate_review_detail(
    item_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    FR-04/FR-05 核心端点：
    - 获取候选人原件访问 URL、最新评估快照得分、逐项标准判研结果与精确引用证据；
    - 提供不可篡改的多版本快照演进历史（evaluation_history）与 HR 复核决策审计链（decisions_history）。
    """
    data = await ItemService.get_candidate_review_detail(item_id=item_id, db=db)
    return StandardResponse(code=status.HTTP_200_OK, message="获取候选人详情成功", data=data)


@router.get(
    "/{item_id}/pdf",
    summary="原件安全流式预览端点",
)
async def get_candidate_pdf_stream(
    item_id: str,
    range_header: str | None = Header(None, alias="Range"),
    db: AsyncSession = Depends(get_db),
):
    """
    原件流式渲染服务：
    - 严格校验存储路径，防止目录穿越（Path Traversal）安全漏洞；
    - 支持浏览器在线预览与 Range 分片加载。
    """
    file_path, filename = await ItemService.get_candidate_pdf_path(item_id=item_id, db=db)

    import urllib.parse
    encoded_filename = urllib.parse.quote(filename)
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f"inline; filename*=utf-8''{encoded_filename}",
    }

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers=headers,
    )


@router.post(
    "/{item_id}/decisions",
    response_model=StandardResponse[DecisionVO],
    status_code=status.HTTP_200_OK,
    summary="HR 提交人机协同复核决定",
)
async def create_decision(
    item_id: str,
    payload: CreateDecisionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    FR-06 核心端点：
    - 记录 HR 人工最终核准结论（推进沟通 / 待补充信息 / 暂不推进）；
    - 保留修改记录链（通过 supersedes_id 串联），严禁静默淘汰或覆盖历史。
    """
    data = await ItemService.create_decision(item_id=item_id, payload=payload, db=db)
    return StandardResponse(code=status.HTTP_200_OK, message="复核决定已持久保存", data=data)


@router.post(
    "/{item_id}/supplement",
    response_model=StandardResponse[SupplementReevaluateResponse],
    status_code=status.HTTP_200_OK,
    summary="定向补充材料并触发增量重新研判",
)
async def supplement_and_reevaluate(
    item_id: str,
    payload: SupplementReevaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    FR-07 核心端点：
    - HR 电话沟通或调取佐证后，针对特定标准项注入补充材料；
    - 系统封装为 manual 凭据，重评并生成递增的全新快照版本，严格保留历史快照。
    """
    data = await ItemService.supplement_and_reevaluate(
        item_id=item_id, payload=payload, db=db
    )
    return StandardResponse(
        code=status.HTTP_200_OK, message="已完成事实补充与增量重新评估", data=data
    )


@router.get(
    "/{item_id}/decisions",
    response_model=StandardResponse[List[DecisionVO]],
    status_code=status.HTTP_200_OK,
    summary="获取候选人人工复核决定的审计历史追溯链条",
)
async def get_decisions_history(
    item_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    FR-06 审计端点：
    - 返回该候选人从最初复核到后续修改的所有决定时间线；
    - 严格包含 supersedes_id 串联与标签、备注、决策时间。
    """
    data = await ItemService.get_decisions_history(item_id=item_id, db=db)
    return StandardResponse(code=status.HTTP_200_OK, message="获取决策修改审计历史成功", data=data)


@router.post(
    "/{item_id}/retry",
    response_model=StandardResponse[RetryItemResponse],
    status_code=status.HTTP_200_OK,
    summary="异常待办单项重试自愈端点",
)
async def retry_screening_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    FR-08 容灾与任务恢复端点：
    - 单份失败文件独立重试，不影响批次内其余正常候选人；
    - 重新触发文本/OCR解析与结构化评分，自愈为已完成状态。
    """
    data = await ItemService.retry_item(item_id=item_id, db=db)
    return StandardResponse(code=status.HTTP_200_OK, message=data.message, data=data)

