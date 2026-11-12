import io
import os
import pytest
from fastapi import HTTPException, UploadFile
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Job, CriteriaVersion, Criterion, utc_now
from app.services.batch_service import BatchService, extract_candidate_name_from_filename


def make_mock_upload_file(filename: str, content: bytes) -> UploadFile:
    """构造内存 UploadFile 仿真对象"""
    return UploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers={"content-type": "application/pdf" if filename.endswith(".pdf") else "application/octet-stream"},
    )


def test_candidate_name_extraction():
    """测试候选人名称提取算法鲁棒性"""
    assert extract_candidate_name_from_filename("张小明_全栈架构师_8年.pdf") == "张小明"
    assert extract_candidate_name_from_filename("李梦琪-高级前端开发.pdf") == "李梦琪"
    assert extract_candidate_name_from_filename("王文博 资深算法工程师.pdf") == "王文博"
    assert extract_candidate_name_from_filename("周紫晴的简历.pdf") == "周紫晴"
    assert extract_candidate_name_from_filename("1. 陈晨(985本硕).pdf") == "陈晨"
    assert extract_candidate_name_from_filename("resume.pdf") == "resume"


@pytest.mark.asyncio
async def test_batch_file_count_guardrails(db_session: AsyncSession):
    """测试批次文件数量上下限阻断规则 (1 ~ 50 份)"""
    # 1. 空文件列表 -> 400 EmptyBatchError
    with pytest.raises(HTTPException) as exc_info:
        await BatchService.create_batch(
            job_id="job_dummy",
            files=[],
            title=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == 30003
    assert exc_info.value.detail["error"] == "EmptyBatchError"

    # 2. 超出 50 份文件上限 -> 400 BatchSizeExceeded
    fake_files = [
        make_mock_upload_file(f"file_{i}.pdf", b"%PDF-1.4 sample") for i in range(51)
    ]
    with pytest.raises(HTTPException) as exc_info:
        await BatchService.create_batch(
            job_id="job_dummy",
            files=fake_files,
            title=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == 30002
    assert exc_info.value.detail["error"] == "BatchSizeExceeded"


@pytest.mark.asyncio
async def test_batch_job_and_criteria_guardrails(db_session: AsyncSession):
    """测试岗位存在性与生效标准绑定门槛防御"""
    # 1. 目标岗位不存在 -> 404 JobNotFound
    sample_file = [make_mock_upload_file("test.pdf", b"%PDF-1.4 valid")]
    with pytest.raises(HTTPException) as exc_info:
        await BatchService.create_batch(
            job_id="non_existent_job",
            files=sample_file,
            title=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["code"] == 20001
    assert exc_info.value.detail["error"] == "JobNotFound"

    # 2. 目标岗位尚未确认冻结生效标准 -> 400 CriteriaVersionNotConfirmed
    unconfirmed_job = Job(
        id="job_unconfirmed_001",
        title="测试未定标准岗位",
        department="平台部",
        jd_text="岗位JD详细描述测试文本至少10个字符",
        current_criteria_version_id=None,
    )
    db_session.add(unconfirmed_job)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        await BatchService.create_batch(
            job_id=unconfirmed_job.id,
            files=sample_file,
            title=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == 20002
    assert exc_info.value.detail["error"] == "CriteriaVersionNotConfirmed"


@pytest.mark.asyncio
async def test_batch_all_invalid_files_rejected(db_session: AsyncSession):
    """测试全部为非法文件时整批拒绝受理"""
    # 准备合规岗位与标准
    cv = CriteriaVersion(
        id="cv_ready_001",
        job_id="job_ready_001",
        version=1,
        status="confirmed",
        confirmed_at=utc_now(),
    )
    job = Job(
        id="job_ready_001",
        title="标准已就绪岗位",
        department="架构部",
        jd_text="岗位JD详细描述测试文本至少10个字符",
        current_criteria_version_id=cv.id,
    )
    db_session.add_all([cv, job])
    await db_session.commit()

    # 提供全量非 PDF 文件
    all_invalid_files = [
        make_mock_upload_file("resume.docx", b"PK\x03\x04 not a pdf"),
        make_mock_upload_file("resume.txt", b"plain text resume"),
    ]
    with pytest.raises(HTTPException) as exc_info:
        await BatchService.create_batch(
            job_id=job.id,
            files=all_invalid_files,
            title=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == 30003
    assert exc_info.value.detail["error"] == "EmptyBatchError"


@pytest.mark.asyncio
async def test_batch_soft_acceptance_and_persistence(db_session: AsyncSession):
    """核心契约测试：软受理部分失败容灾、物理落盘与状态统计"""
    # 1. 准备就绪岗位与标准
    cv = CriteriaVersion(
        id="cv_prod_001",
        job_id="job_prod_001",
        version=1,
        status="confirmed",
        confirmed_at=utc_now(),
        criteria=[
            Criterion(
                id="c1",
                description="统招本科及以上学历",
                kind="required",
                importance="high",
                constraint="strict",
                order_num=1,
            )
        ],
    )
    job = Job(
        id="job_prod_001",
        title="资深大模型工程专家",
        department="AI创新中心",
        jd_text="负责企业级大模型与Agent应用落地，至少10字符详细描述。",
        current_criteria_version_id=cv.id,
    )
    db_session.add_all([cv, job])
    await db_session.commit()

    # 2. 混合上传：2 份合法 PDF + 1 份非法 docx 文件
    mixed_files = [
        make_mock_upload_file("张小明_资深后端.pdf", b"%PDF-1.5 valid resume data for candidate A"),
        make_mock_upload_file("李梦琪_全栈架构.pdf", b"%PDF-1.4 valid resume data for candidate B"),
        make_mock_upload_file("王文博_设计作品集.docx", b"PK\x03\x04 invalid binary file"),
    ]

    # 3. 执行批次受理
    res = await BatchService.create_batch(
        job_id=job.id,
        files=mixed_files,
        title="2026届校园春招初筛批次",
        db=db_session,
    )

    # 4. 严苛断言批次摘要 (Soft Acceptance 语义)
    assert res.batch_id.startswith("batch_")
    assert res.job_id == job.id
    assert res.criteria_version_id == cv.id
    assert res.title == "2026届校园春招初筛批次"
    assert res.total_files == 3
    assert res.accepted_count == 2
    assert res.rejected_count == 1
    assert len(res.queued_items) == 2
    assert len(res.failed_items) == 1

    # 验证合法项
    accepted_names = [item.filename for item in res.queued_items]
    assert "张小明_资深后端.pdf" in accepted_names
    assert "李梦琪_全栈架构.pdf" in accepted_names
    assert all(item.status == "queued" for item in res.queued_items)

    # 验证异常项被正确隔离并标记 failed，附带标准错误码
    failed_item = res.failed_items[0]
    assert failed_item.filename == "王文博_设计作品集.docx"
    assert failed_item.status == "failed"
    assert failed_item.error_info["code"] == "INVALID_FILE_FORMAT"

    # 5. 验证物理磁盘存储安全性
    for item in res.queued_items:
        # 验证文件在 storage 目录中真实存在
        from app.core.config import settings
        expected_path = os.path.join(settings.STORAGE_DIR, "batches", res.batch_id, f"{item.item_id}.pdf")
        assert os.path.exists(expected_path)
        assert os.path.getsize(expected_path) > 0

    # 6. 验证批次详情统计接口 (get_batch_detail)
    detail = await BatchService.get_batch_detail(res.batch_id, db_session)
    assert detail.batch_id == res.batch_id
    assert detail.total_items == 3
    assert detail.stats.queued == 2
    assert detail.stats.failed == 1
    assert detail.stats.completed == 0

    # 7. 验证批次列表汇总查询 (list_batches)
    batch_list = await BatchService.list_batches(job.id, 1, 10, db_session)
    assert batch_list.total == 1
    assert len(batch_list.items) == 1
    assert batch_list.items[0].batch_id == res.batch_id
    assert batch_list.items[0].total_items == 3
    assert batch_list.items[0].failed_items == 1


@pytest.mark.asyncio
async def test_batch_api_endpoints_via_client(client: AsyncClient):
    """测试完整 RESTful 端点流转：POST /batches (202) -> GET /batches/{id} (200) -> GET /batches (200)"""
    # 1. 先通过 API 创建岗位并确认标准
    create_job_res = await client.post(
        "/api/v1/jobs",
        json={
            "title": "分布式流计算专家",
            "department": "数据平台部",
            "jd_text": "负责实时计算平台架构建设，精通 Flink 与 Python/Go 微服务架构，至少10字符。",
            "initial_criteria": [
                {
                    "description": "5年以上实时计算实战经验",
                    "kind": "required",
                    "importance": "high",
                    "constraint": "strict",
                    "order_num": 1,
                }
            ],
        },
    )
    assert create_job_res.status_code == 201
    job_id = create_job_res.json()["data"]["id"]

    # 确认标准版本
    confirm_res = await client.post(f"/api/v1/jobs/{job_id}/criteria/confirm")
    assert confirm_res.status_code == 200

    # 2. 模拟真实 Multipart 表单文件上传 (POST /api/v1/batches)
    files = [
        ("files", ("候选人甲_Flink架构.pdf", b"%PDF-1.4 sample pdf binary A", "application/pdf")),
        ("files", ("候选人乙_实时计算.pdf", b"%PDF-1.4 sample pdf binary B", "application/pdf")),
        ("files", ("候选人丙_非标简历.docx", b"PK\x03\x04 not pdf binary", "application/octet-stream")),
    ]
    data = {
        "job_id": job_id,
        "title": "实时计算春招专场",
    }

    upload_res = await client.post("/api/v1/batches", data=data, files=files)
    assert upload_res.status_code == 202
    body = upload_res.json()
    assert body["code"] == 202
    assert body["message"] == "批次受理成功，已启动后台异步解析流水线"

    batch_data = body["data"]
    batch_id = batch_data["batch_id"]
    assert batch_data["accepted_count"] == 2
    assert batch_data["rejected_count"] == 1
    assert batch_data["sse_stream_url"] == f"/api/v1/batches/{batch_id}/events"

    # 3. 获取批次详情 (GET /api/v1/batches/{batch_id})
    detail_res = await client.get(f"/api/v1/batches/{batch_id}")
    assert detail_res.status_code == 200
    detail_body = detail_res.json()["data"]
    assert detail_body["batch_id"] == batch_id
    assert detail_body["total_items"] == 3
    assert detail_body["stats"]["failed"] == 1

    # 4. 获取岗位所属批次列表 (GET /api/v1/batches?job_id=...)
    list_res = await client.get(f"/api/v1/batches?job_id={job_id}")
    assert list_res.status_code == 200
    list_body = list_res.json()["data"]
    assert list_body["total"] == 1
    assert list_body["items"][0]["batch_id"] == batch_id
    assert list_body["items"][0]["title"] == "实时计算春招专场"


@pytest.mark.asyncio
async def test_sse_manager_broadcast_and_reconnection():
    """测试 SSE 广播总线协议格式与 Last-Event-ID 断线补偿机制"""
    from app.services.sse_service import SSEManager

    bus = SSEManager(max_history_per_batch=10)
    test_batch = "batch_sse_test_001"

    # 1. 广播 3 条事件
    m1 = await bus.publish(test_batch, "progress", {"percent": 30})
    m2 = await bus.publish(test_batch, "item_updated", {"candidate": "张三", "status": "completed"})
    m3 = await bus.publish(test_batch, "batch_completed", {"total": 1})

    assert m1.id == "evt_1"
    assert m2.id == "evt_2"
    assert m3.id == "evt_3"

    # 2. 模拟客户端断网重连：提供 Last-Event-ID: evt_1，应精准补发 evt_2 与 evt_3
    subscriber = bus.subscribe(test_batch, last_event_id=m1.id, heartbeat_interval=0.1)

    received_lines = []
    # 读取前两条补发消息
    line1 = await anext(subscriber)
    received_lines.append(line1)
    line2 = await anext(subscriber)
    received_lines.append(line2)

    combined = "".join(received_lines)
    assert "id: evt_2" in combined
    assert "event: item_updated" in combined
    assert "id: evt_3" in combined
    assert "event: batch_completed" in combined
    # 验证不包含已接收过的 evt_1
    assert "id: evt_1" not in combined

