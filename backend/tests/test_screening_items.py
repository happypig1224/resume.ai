import os
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import (
    AuditDecision,
    Batch,
    CriteriaVersion,
    Criterion,
    EvaluationSnapshot,
    Job,
    ScreeningItem,
    utc_now,
)


@pytest.fixture
def dummy_pdf_file():
    """在测试沙箱中生成合法的标准 PDF 供原件流式端点测试"""
    batch_dir = os.path.join(settings.STORAGE_DIR, "batches", "test_batch_001")
    os.makedirs(batch_dir, exist_ok=True)
    pdf_path = os.path.join(batch_dir, "test_resume.pdf")

    with open(pdf_path, "wb") as f:
        f.write(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>startxref\n0\n%%EOF")

    yield pdf_path

    if os.path.exists(pdf_path):
        os.remove(pdf_path)


async def setup_test_context(db: AsyncSession, pdf_path: str):
    """构建用于全景研判与决策复核的完整领域上下文数据"""
    now = utc_now()
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    cv_id = f"cv_{uuid.uuid4().hex[:10]}"
    batch_id = f"batch_{uuid.uuid4().hex[:10]}"
    item_id = f"item_{uuid.uuid4().hex[:10]}"
    crit1_id = f"crit_req_{uuid.uuid4().hex[:6]}"
    crit2_id = f"crit_bonus_{uuid.uuid4().hex[:6]}"

    job = Job(
        id=job_id,
        title="资深全栈工程师",
        department="研发部",
        jd_text="岗位任职要求...",
        current_criteria_version_id=cv_id,
    )
    cv = CriteriaVersion(
        id=cv_id,
        job_id=job_id,
        version=1,
        status="confirmed",
        recommendation_rule={"min_match_score": 70, "min_coverage_rate": 60, "is_calibrated": True},
        confirmed_at=now,
    )
    crit1 = Criterion(
        id=crit1_id,
        version_id=cv_id,
        description="统招本科及以上学历，5年以上全栈经验",
        kind="required",
        importance="high",
        constraint="strict",
        order_num=1,
    )
    crit2 = Criterion(
        id=crit2_id,
        version_id=cv_id,
        description="具备大模型 Agent 架构实战经验",
        kind="bonus",
        importance="low",
        constraint=None,
        order_num=2,
    )
    batch = Batch(
        id=batch_id,
        job_id=job_id,
        criteria_version_id=cv_id,
        title="202611 筛选批次",
    )
    item = ScreeningItem(
        id=item_id,
        batch_id=batch_id,
        candidate_name="王小明",
        original_filename="王小明_资深全栈_6年.pdf",
        file_path=pdf_path,
        file_size_bytes=1024,
        status="completed",
        parse_stage="text",
    )

    ev_id = f"ev_{uuid.uuid4().hex[:8]}"
    snapshot = EvaluationSnapshot(
        item_id=item_id,
        criteria_version_id=cv_id,
        version=1,
        match_score=100,
        coverage_rate=100,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": crit1_id,
                "description": crit1.description,
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于重点院校统招计算机系，有6年全栈研发履历",
                "evidences": [
                    {
                        "id": ev_id,
                        "page": 1,
                        "quote": "教育经历：2014-2018 计算机科学与技术 本科",
                        "method": "text",
                    }
                ],
            },
            {
                "criterion_id": crit2_id,
                "description": crit2.description,
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "unknown",
                "reason": "简历中未检索到明确的大模型项目提及",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 1},
        created_at=now,
    )

    db.add_all([job, cv, crit1, crit2, batch, item, snapshot])
    await db.commit()

    return {
        "job_id": job_id,
        "cv_id": cv_id,
        "batch_id": batch_id,
        "item_id": item_id,
        "crit1_id": crit1_id,
        "crit2_id": crit2_id,
    }


@pytest.mark.asyncio
async def test_get_candidate_review_detail(client: AsyncClient, db_session: AsyncSession, dummy_pdf_file: str):
    """测试获取候选人全景研判详情（双屏对照、证据链引文与得分快照）"""
    ctx = await setup_test_context(db_session, dummy_pdf_file)
    item_id = ctx["item_id"]

    res = await client.get(f"/api/v1/screening-items/{item_id}")
    assert res.status_code == 200

    body = res.json()
    assert body["code"] == 200
    data = body["data"]

    assert data["item_id"] == item_id
    assert data["candidate_name"] == "王小明"
    assert data["pdf_url"] == f"/api/v1/screening-items/{item_id}/pdf"
    assert data["status"] == "completed"

    # 校验最新评估快照
    eval_vo = data["evaluation"]
    assert eval_vo is not None
    assert eval_vo["version"] == 1
    assert eval_vo["match_score"] == 100
    assert eval_vo["coverage_rate"] == 100
    assert eval_vo["suggested_group"] == "recommended"

    # 校验判定与证据清单
    findings = eval_vo["findings"]
    assert len(findings) == 2
    assert findings[0]["verdict"] == "met"
    assert len(findings[0]["evidences"]) == 1
    assert "计算机科学与技术" in findings[0]["evidences"][0]["quote"]
    assert findings[0]["evidences"][0]["method"] == "text"


@pytest.mark.asyncio
async def test_get_candidate_pdf_stream_and_security(client: AsyncClient, db_session: AsyncSession, dummy_pdf_file: str):
    """测试原件流式预览端点及目录穿越（Path Traversal）安全防御"""
    ctx = await setup_test_context(db_session, dummy_pdf_file)
    item_id = ctx["item_id"]

    # 1. 正常获取原件流
    res = await client.get(f"/api/v1/screening-items/{item_id}/pdf")
    assert res.status_code == 200
    assert "application/pdf" in res.headers["content-type"]
    assert res.headers["accept-ranges"] == "bytes"
    assert res.content.startswith(b"%PDF")

    # 2. 模拟不存在的 item
    res_404 = await client.get("/api/v1/screening-items/item_non_existent/pdf")
    assert res_404.status_code == 404

    # 3. 模拟目录穿越篡改尝试 (安全阻断)
    item = (await db_session.execute(
        Batch.__table__.select()
    ))
    # 更新 item 的 file_path 指向 storage 之外的系统敏感路径
    from app.models.entities import ScreeningItem
    db_item = (await db_session.execute(
        ScreeningItem.__table__.select().where(ScreeningItem.id == item_id)
    )).first()

    from sqlalchemy import update
    await db_session.execute(
        update(ScreeningItem).where(ScreeningItem.id == item_id).values(file_path="C:\\Windows\\System32\\drivers\\etc\\hosts")
    )
    await db_session.commit()

    res_blocked = await client.get(f"/api/v1/screening-items/{item_id}/pdf")
    assert res_blocked.status_code in (403, 404)


@pytest.mark.asyncio
async def test_create_decision_and_audit_supersede_chain(client: AsyncClient, db_session: AsyncSession, dummy_pdf_file: str):
    """测试 HR 提交人工复核决定及 supersedes_id 审计追踪链"""
    ctx = await setup_test_context(db_session, dummy_pdf_file)
    item_id = ctx["item_id"]

    # 1. 首次决定：推进沟通 (advance)
    payload_1 = {
        "decision": "advance",
        "tags": ["学历优秀", "年限匹配"],
        "notes": "全栈工程背景扎实，建议直接约一面",
    }
    res_1 = await client.post(f"/api/v1/screening-items/{item_id}/decisions", json=payload_1)
    assert res_1.status_code == 200
    data_1 = res_1.json()["data"]
    assert data_1["decision"] == "advance"
    assert data_1["supersedes_id"] is None
    decision_1_id = data_1["id"]

    # 2. 修改决定：待补充信息 (supplement)
    payload_2 = {
        "decision": "supplement",
        "tags": ["待核实架构细节"],
        "notes": "面试前需电话复核大模型高并发拆分经验",
    }
    res_2 = await client.post(f"/api/v1/screening-items/{item_id}/decisions", json=payload_2)
    assert res_2.status_code == 200
    data_2 = res_2.json()["data"]
    assert data_2["decision"] == "supplement"
    assert data_2["supersedes_id"] == decision_1_id  # 严格指向上一版决定

    # 3. 查看详情，验证 decisions_history 包含完整历史且最新置顶
    detail_res = await client.get(f"/api/v1/screening-items/{item_id}")
    decisions = detail_res.json()["data"]["decisions_history"]
    assert len(decisions) == 2
    assert decisions[0]["decision"] == "supplement"
    assert decisions[1]["decision"] == "advance"


@pytest.mark.asyncio
async def test_supplement_and_reevaluate(client: AsyncClient, db_session: AsyncSession, dummy_pdf_file: str):
    """测试 FR-07 定向补充材料与增量重新研判（新版本生成且保留历史快照）"""
    ctx = await setup_test_context(db_session, dummy_pdf_file)
    item_id = ctx["item_id"]
    crit2_id = ctx["crit2_id"]

    # 补充加分项证据：核实大模型项目经验
    payload = {
        "criterion_id": crit2_id,
        "supplement_verdict": "met",
        "supplement_note": "HR电话复核核实：候选人主导开发过千万级 RAG 知识检索企业落地项目，产出明确。",
        "channel": "phone_call",
    }

    res = await client.post(f"/api/v1/screening-items/{item_id}/supplement", json=payload)
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["item_id"] == item_id
    assert data["previous_version"] == 1
    assert data["new_evaluation_version"] == 2
    assert data["new_scores"]["suggested_group"] == "recommended"

    # 验证查看详情时的版本演进历史
    detail_res = await client.get(f"/api/v1/screening-items/{item_id}")
    detail_data = detail_res.json()["data"]

    assert detail_data["evaluation"]["version"] == 2
    history = detail_data["evaluation_history"]
    assert len(history) == 2
    assert history[0]["version"] == 1
    assert history[1]["version"] == 2

    # 验证 v2 中已包含 manual 凭据
    findings_v2 = history[1]["findings"]
    crit2_finding = next(f for f in findings_v2 if f["criterion_id"] == crit2_id)
    assert crit2_finding["verdict"] == "met"
    manual_evidence = next(e for e in crit2_finding["evidences"] if e["method"] == "manual")
    assert "RAG 知识检索" in manual_evidence["quote"]
    assert manual_evidence["page"] is None


@pytest.mark.asyncio
async def test_list_batch_items_and_filtering(client: AsyncClient, db_session: AsyncSession, dummy_pdf_file: str):
    """测试工作台候选人列表与队列分段统计及过滤"""
    ctx = await setup_test_context(db_session, dummy_pdf_file)
    batch_id = ctx["batch_id"]

    # 1. 默认查询
    res = await client.get(f"/api/v1/batches/{batch_id}/items")
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["total"] == 1
    assert data["distribution"]["recommended"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["candidate_name"] == "王小明"

    # 2. 队列过滤：查询 conflict 队列（应为空）
    res_conflict = await client.get(f"/api/v1/batches/{batch_id}/items?group=conflict")
    assert res_conflict.status_code == 200
    assert len(res_conflict.json()["data"]["items"]) == 0

    # 3. 队列过滤：查询 recommended 队列（应包含 1 条）
    res_rec = await client.get(f"/api/v1/batches/{batch_id}/items?group=recommended")
    assert res_rec.status_code == 200
    assert len(res_rec.json()["data"]["items"]) == 1
