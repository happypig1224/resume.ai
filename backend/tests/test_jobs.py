import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_job_lifecycle_vertical_slice(client: AsyncClient):
    """纵向切片端到端验证：岗位创建 -> 草稿编辑 -> 列表防N+1查询 -> 确认冻结版本 -> 再次编辑派生新草稿"""

    # 1. 验证空态列表友好响应 (HTTP 200, total=0, items=[])
    res = await client.get("/api/v1/jobs")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 200
    assert body["data"]["total"] == 0
    assert body["data"]["items"] == []

    # 2. 创建岗位 (POST /api/v1/jobs)
    create_payload = {
        "title": "资深后端开发专家 (FastAPI/Go)",
        "department": "基础架构平台部",
        "jd_text": "负责微服务架构演进，要求精通 Python/FastAPI，具备高并发经验。",
        "initial_criteria": [
            {
                "description": "5年以上后端开发经验",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "order_num": 1,
            }
        ],
    }
    create_res = await client.post("/api/v1/jobs", json=create_payload)
    assert create_res.status_code == 201
    create_data = create_res.json()["data"]
    job_id = create_data["id"]
    draft_id = create_data["draft_version_id"]
    assert job_id is not None
    assert draft_id is not None
    assert create_data["current_criteria_version_id"] is None

    # 3. 列表检索并验证未确认状态 (GET /api/v1/jobs)
    list_res = await client.get("/api/v1/jobs")
    assert list_res.status_code == 200
    items = list_res.json()["data"]["items"]
    assert len(items) == 1
    job_item = items[0]
    assert job_item["id"] == job_id
    assert job_item["criteria_status"]["is_ready_for_import"] is False
    assert job_item["criteria_status"]["has_active_draft"] is True
    assert job_item["criteria_status"]["draft_version_num"] == 1

    # 4. 获取岗位详情 (GET /api/v1/jobs/{job_id})
    detail_res = await client.get(f"/api/v1/jobs/{job_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()["data"]
    assert detail_data["id"] == job_id
    assert detail_data["active_draft_version"]["id"] == draft_id
    assert len(detail_data["active_draft_version"]["criteria"]) == 1

    # 4.1 测试 AI/启发式条件提取 (POST /api/v1/jobs/{job_id}/extract-criteria)
    extract_res = await client.post(f"/api/v1/jobs/{job_id}/extract-criteria")
    assert extract_res.status_code == 200
    extracted_items = extract_res.json()["data"]["extracted_criteria"]
    assert len(extracted_items) >= 1
    assert any(c["kind"] == "required" for c in extracted_items)

    # 5. 更新标准草稿 (PUT /api/v1/jobs/{job_id}/criteria-draft)
    update_payload = {
        "recommendation_rule": {
            "min_match_score": 80,
            "min_coverage_rate": 70,
            "is_calibrated": True,
        },
        "criteria": [
            {
                "description": "统招本科及以上计算机相关学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "order_num": 1,
            },
            {
                "description": "精通 Python 及 FastAPI 高并发实战",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "order_num": 2,
            },
            {
                "description": "有知名开源项目贡献者优先",
                "kind": "bonus",
                "importance": "medium",
                "constraint": None,
                "order_num": 3,
            },
        ],
    }
    update_res = await client.put(f"/api/v1/jobs/{job_id}/criteria-draft", json=update_payload)
    assert update_res.status_code == 200
    updated_draft = update_res.json()["data"]
    assert len(updated_draft["criteria"]) == 3
    assert updated_draft["recommendation_rule"]["min_match_score"] == 80

    # 6. 确认冻结标准快照 (POST /api/v1/jobs/{job_id}/criteria/confirm)
    confirm_res = await client.post(f"/api/v1/jobs/{job_id}/criteria/confirm")
    assert confirm_res.status_code == 200
    confirm_data = confirm_res.json()["data"]
    assert confirm_data["status"] == "confirmed"
    assert confirm_data["version"] == 1
    assert confirm_data["total_criteria_count"] == 3
    assert confirm_data["required_criteria_count"] == 2
    assert confirm_data["bonus_criteria_count"] == 1

    # 7. 再次查看列表，验证标准就绪度已转为 is_ready_for_import = True
    list_after_confirm = await client.get("/api/v1/jobs?status=ready")
    assert list_after_confirm.status_code == 200
    ready_items = list_after_confirm.json()["data"]["items"]
    assert len(ready_items) == 1
    assert ready_items[0]["criteria_status"]["is_ready_for_import"] is True
    assert ready_items[0]["criteria_status"]["confirmed_version"]["version_num"] == 1
    assert ready_items[0]["criteria_status"]["has_active_draft"] is False

    # 8. 修改已冻结标准时，验证系统自动派生第 2 版草稿 (version=2)
    new_draft_payload = {
        "criteria": [
            {
                "description": "统招硕士及以上学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "order_num": 1,
            }
        ]
    }
    v2_draft_res = await client.put(f"/api/v1/jobs/{job_id}/criteria-draft", json=new_draft_payload)
    assert v2_draft_res.status_code == 200
    v2_draft_data = v2_draft_res.json()["data"]
    assert v2_draft_data["version"] == 2
    assert v2_draft_data["status"] == "draft"

    # 再次查询详情，验证同时存在生效的 v1 和草稿 v2
    final_detail = (await client.get(f"/api/v1/jobs/{job_id}")).json()["data"]
    assert final_detail["current_criteria_version"]["version"] == 1
    assert final_detail["current_criteria_version"]["status"] == "confirmed"
    assert final_detail["active_draft_version"]["version"] == 2
    assert final_detail["active_draft_version"]["status"] == "draft"
