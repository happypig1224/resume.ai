import io
import os
import pypdf
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.models.entities import (
    AuditDecision,
    Batch,
    Criterion,
    CriteriaVersion,
    EvaluationSnapshot,
    Job,
    ScreeningItem,
    utc_now,
)
from conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_decisions_audit_history_timeline(client: AsyncClient):
    """测试人机协同决策修改审计时间线追溯 (FR-06)"""
    async with TestingSessionLocal() as session:
        job = Job(title="架构师", department="技术部", jd_text="招聘架构师")
        session.add(job)
        await session.commit()

        cv = CriteriaVersion(job_id=job.id, version=1, status="confirmed", confirmed_at=utc_now())
        session.add(cv)
        await session.commit()

        job.current_criteria_version_id = cv.id
        batch = Batch(job_id=job.id, criteria_version_id=cv.id, title="测试批次")
        session.add(batch)
        await session.commit()

        item = ScreeningItem(
            batch_id=batch.id,
            candidate_name="周伯通",
            original_filename="周伯通_简历.pdf",
            file_path="/tmp/fake.pdf",
            status="completed",
        )
        session.add(item)
        await session.commit()
        item_id = item.id

    # 1. 提交初始人工复核决定 (待补充信息)
    resp1 = await client.post(
        f"/api/v1/screening-items/{item_id}/decisions",
        json={
            "decision": "supplement",
            "tags": ["学历存疑", "待电话核实"],
            "notes": "第一轮初筛：需电联确认是否为统招",
        },
    )
    assert resp1.status_code == 200
    d1 = resp1.json()["data"]
    assert d1["decision"] == "supplement"
    assert d1["supersedes_id"] is None

    # 2. 提交修改后的复核决定 (推进沟通)
    resp2 = await client.post(
        f"/api/v1/screening-items/{item_id}/decisions",
        json={
            "decision": "advance",
            "tags": ["学历核实通过", "经验契合"],
            "notes": "第二轮复核：学信网已验证统招，推进面试",
        },
    )
    assert resp2.status_code == 200
    d2 = resp2.json()["data"]
    assert d2["decision"] == "advance"
    assert d2["supersedes_id"] == d1["id"]

    # 3. 获取决策修改审计时间线 (GET /screening-items/{item_id}/decisions)
    history_resp = await client.get(f"/api/v1/screening-items/{item_id}/decisions")
    assert history_resp.status_code == 200
    history = history_resp.json()["data"]
    assert len(history) == 2
    # 按时间正序排列
    assert history[0]["id"] == d1["id"]
    assert history[0]["decision"] == "supplement"
    assert history[1]["id"] == d2["id"]
    assert history[1]["decision"] == "advance"
    assert history[1]["supersedes_id"] == d1["id"]


@pytest.mark.asyncio
async def test_retry_item_failure_and_healing(client: AsyncClient, tmp_path):
    """测试异常单项重试自愈闭环与不可恢复防御 (FR-08)"""
    # 创建真实可读的测试 PDF
    writer = pypdf.PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    pdf_path = str(tmp_path / "valid_retry.pdf")
    with open(pdf_path, "wb") as f:
        writer.write(f)

    async with TestingSessionLocal() as session:
        job = Job(title="Python研发", department="后端部", jd_text="招聘Python专家")
        session.add(job)
        await session.commit()

        cv = CriteriaVersion(job_id=job.id, version=1, status="confirmed", confirmed_at=utc_now())
        session.add(cv)
        await session.commit()

        c1 = Criterion(
            version_id=cv.id,
            description="5年以上开发经验",
            kind="required",
            importance="high",
            constraint="strict",
            order_num=1,
        )
        session.add(c1)
        job.current_criteria_version_id = cv.id
        batch = Batch(job_id=job.id, criteria_version_id=cv.id, title="重试测试批次")
        session.add(batch)
        await session.commit()

        # 1. 模拟不可恢复的格式异常项 (如 docx 文件)
        non_retryable_item = ScreeningItem(
            batch_id=batch.id,
            candidate_name="非PDF候选人",
            original_filename="bad.docx",
            file_path="/tmp/bad.docx",
            status="failed",
            error_info={"code": "INVALID_FILE_FORMAT", "message": "格式损坏", "retryable": False},
        )
        # 2. 模拟可重试的临时失败项
        retryable_item = ScreeningItem(
            batch_id=batch.id,
            candidate_name="网络临时失败候选人",
            original_filename="valid_retry.pdf",
            file_path=pdf_path,
            status="failed",
            error_info={"code": "PARSE_TIMEOUT", "message": "解析临时超时", "retryable": True},
        )
        session.add_all([non_retryable_item, retryable_item])
        await session.commit()
        bad_id = non_retryable_item.id
        good_id = retryable_item.id

    # 1. 对不可恢复项执行重试，应当被 400 阻断
    bad_resp = await client.post(f"/api/v1/screening-items/{bad_id}/retry")
    assert bad_resp.status_code == 400
    assert bad_resp.json()["detail"]["code"] == 40003

    # 2. 对可恢复项执行重试，应当自愈为 completed
    good_resp = await client.post(f"/api/v1/screening-items/{good_id}/retry")
    assert good_resp.status_code == 200
    data = good_resp.json()["data"]
    assert data["item_id"] == good_id
    assert data["previous_status"] == "failed"
    assert data["new_status"] == "completed"

    # 3. 校验数据库中该候选人状态与评估快照
    detail_resp = await client.get(f"/api/v1/screening-items/{good_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()["data"]
    assert detail["status"] == "completed"
    assert detail["evaluation"] is not None
    assert detail["evaluation"]["version"] == 1


@pytest.mark.asyncio
async def test_batch_metrics_and_ac01(client: AsyncClient):
    """测试批次全景复核指标大盘与 AC-01 指标契约 (FR-05)"""
    async with TestingSessionLocal() as session:
        job = Job(title="全栈工程师", department="研发中心", jd_text="招聘全栈")
        session.add(job)
        await session.commit()

        cv = CriteriaVersion(job_id=job.id, version=1, status="confirmed", confirmed_at=utc_now())
        session.add(cv)
        await session.commit()

        job.current_criteria_version_id = cv.id
        batch = Batch(job_id=job.id, criteria_version_id=cv.id, title="指标审计批次")
        session.add(batch)
        await session.commit()

        # 候选人 1: 推荐队列 + HR推进
        it1 = ScreeningItem(batch_id=batch.id, candidate_name="张三", original_filename="张三.pdf", file_path="f1", status="completed")
        session.add(it1)
        await session.flush()
        snap1 = EvaluationSnapshot(item_id=it1.id, criteria_version_id=cv.id, version=1, match_score=90, coverage_rate=100, suggested_group="recommended")
        dec1 = AuditDecision(item_id=it1.id, decision="advance", tags=["优秀"])
        session.add_all([snap1, dec1])

        # 候选人 2: 初次待核实 -> 补充后转推荐 (待核实补回) + HR推进
        it2 = ScreeningItem(batch_id=batch.id, candidate_name="李四", original_filename="李四.pdf", file_path="f2", status="completed")
        session.add(it2)
        await session.flush()
        snap2_v1 = EvaluationSnapshot(item_id=it2.id, criteria_version_id=cv.id, version=1, match_score=60, coverage_rate=66, suggested_group="verification")
        snap2_v2 = EvaluationSnapshot(item_id=it2.id, criteria_version_id=cv.id, version=2, match_score=85, coverage_rate=100, suggested_group="recommended")
        dec2 = AuditDecision(item_id=it2.id, decision="advance", tags=["核实后推进"])
        session.add_all([snap2_v1, snap2_v2, dec2])

        # 候选人 3: 失败项
        it3 = ScreeningItem(batch_id=batch.id, candidate_name="王五", original_filename="王五.pdf", file_path="f3", status="failed")
        session.add(it3)

        await session.commit()
        batch_id = batch.id

    # 查询指标大盘
    resp = await client.get(f"/api/v1/batches/{batch_id}/metrics")
    assert resp.status_code == 200
    metrics = resp.json()["data"]

    assert metrics["batch_id"] == batch_id
    assert metrics["total_items"] == 3
    assert metrics["completed_count"] == 2
    assert metrics["failed_count"] == 1
    assert metrics["groups_distribution"]["recommended"] == 2
    assert metrics["decisions_distribution"]["advance"] == 2
    assert metrics["decisions_distribution"]["pending"] == 1
    assert metrics["supplement_resolved_count"] == 1  # 李四成功从待核实补回
    # AC-01: HR 选拔 2 人，2 人都在推荐/待核实中，覆盖率 100%
    assert metrics["ac01"]["hr_worthwhile_count"] == 2
    assert metrics["ac01"]["recommended_or_verified_count"] == 2
    assert metrics["ac01"]["ac01_ratio"] == 100.0
    assert metrics["ac01"]["is_ac01_passed"] is True


@pytest.mark.asyncio
async def test_batch_export_csv_and_json(client: AsyncClient):
    """测试批次数据导出报表 (CSV UTF-8 BOM 与 JSON 契约)"""
    async with TestingSessionLocal() as session:
        job = Job(title="数据科学家", department="AI实验室", jd_text="招聘数据专家")
        session.add(job)
        await session.commit()

        cv = CriteriaVersion(job_id=job.id, version=1, status="confirmed", confirmed_at=utc_now())
        session.add(cv)
        await session.commit()

        batch = Batch(job_id=job.id, criteria_version_id=cv.id, title="导出测试批次")
        session.add(batch)
        await session.commit()

        it = ScreeningItem(
            batch_id=batch.id,
            candidate_name="钱学林",
            original_filename="钱学林_简历.pdf",
            file_path="f_export",
            status="completed",
        )
        session.add(it)
        await session.flush()

        snap = EvaluationSnapshot(
            item_id=it.id,
            criteria_version_id=cv.id,
            version=1,
            match_score=88,
            coverage_rate=100,
            suggested_group="recommended",
        )
        dec = AuditDecision(
            item_id=it.id,
            decision="advance",
            tags=["高潜人选"],
            notes="论文成果丰硕",
        )
        session.add_all([snap, dec])
        await session.commit()
        batch_id = batch.id

    # 1. 导出 CSV
    csv_resp = await client.get(f"/api/v1/batches/{batch_id}/export?format=csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "attachment" in csv_resp.headers["content-disposition"]
    # 验证 UTF-8 BOM 存在
    content_bytes = csv_resp.content
    assert content_bytes.startswith(b"\xef\xbb\xbf")
    content_text = content_bytes.decode("utf-8")
    assert "钱学林" in content_text
    assert "优先推荐" in content_text
    assert "推进沟通" in content_text
    assert "高潜人选" in content_text

    # 2. 导出 JSON
    json_resp = await client.get(f"/api/v1/batches/{batch_id}/export?format=json")
    assert json_resp.status_code == 200
    json_data = json_resp.json()
    assert json_data["batch_id"] == batch_id
    assert len(json_data["records"]) == 1
    assert json_data["records"][0]["candidate_name"] == "钱学林"
    assert json_data["records"][0]["match_score"] == 88
