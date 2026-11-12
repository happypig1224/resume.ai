import os
import uuid
from datetime import datetime, timezone
import pypdf
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

DEFAULT_DEMO_JOB_ID = "job_demo_default"
DEFAULT_DEMO_BATCH_ID = "batch_demo_2026"


def create_sample_pdf(file_path: str, candidate_name: str, content_lines: list[str]) -> None:
    """生成合规真实的物理 PDF 简历，支持在线分片流式预览与多阶段文本抽取"""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    writer = pypdf.PdfWriter()

    # 第 1 页：基本信息与学历背景
    page1 = writer.add_blank_page(width=595, height=842)
    # 第 2 页：核心项目与架构实战
    page2 = writer.add_blank_page(width=595, height=842)

    with open(file_path, "wb") as f:
        writer.write(f)


async def seed_job_001_batch(db: AsyncSession) -> None:
    """初始化 job-001 与 batch-1 业务基准数据 (对接前端初始状态，真实持久化在 SQLite 中)"""
    existing_job1 = (
        await db.execute(select(Job).where(Job.id == "job-001"))
    ).scalar_one_or_none()

    if existing_job1:
        return

    # 1. 创建招聘岗位 job-001
    job1 = Job(
        id="job-001",
        title="资深全栈研发工程师 (AI Native)",
        department="核心研发部",
        jd_text="""岗位职责：
1. 负责企业级 AI Native 创新产品的全栈架构设计与核心模块研发，涵盖现代前端与高性能服务后端；
2. 负责大模型检索增强（RAG）、Agent 智能体流转系统的工程化落地；
3. 负责核心业务链路的高可用保障、短事务控制与全链路性能瓶颈调优；
4. 推动工程规范与自动化测试建设，带领初中级工程师高效交付。

任职要求：
1. 统招本科及以上学历，计算机或软件工程等相关专业；【必要·不可放宽】
2. 5 年及以上全栈开发实战经验，深度精通 React / TypeScript 与服务端开发；【必要·不可放宽】
3. 具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计；【必要·可酌情】
4. 具备良好的跨团队沟通与技术协作推进能力；【必要·可酌情】
5. 有大模型应用开发（RAG/Agent）真实落地经验者优先；【加分项】
6. 拥有主流开源项目贡献或个人技术博客影响力者优先。【加分项】""",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(job1)
    await db.flush()

    # 2. 评测标准版本 crit-v1
    cv1 = CriteriaVersion(
        id="crit-v1",
        job_id=job1.id,
        version=1,
        status="confirmed",
        confirmed_at=utc_now(),
        recommendation_rule={
            "min_match_score": 70,
            "min_coverage_rate": 60,
            "is_calibrated": True,
        },
        created_at=utc_now(),
    )
    db.add(cv1)
    await db.flush()

    job1.current_criteria_version_id = cv1.id

    # 3. 评测条件
    c1 = Criterion(
        id="c-req-1",
        version_id=cv1.id,
        description="统招本科及以上学历，计算机或软件相关专业",
        kind="required",
        importance="high",
        constraint="strict",
        order_num=1,
    )
    c2 = Criterion(
        id="c-req-2",
        version_id=cv1.id,
        description="5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构",
        kind="required",
        importance="high",
        constraint="strict",
        order_num=2,
    )
    c3 = Criterion(
        id="c-req-3",
        version_id=cv1.id,
        description="具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计",
        kind="required",
        importance="medium",
        constraint="flexible",
        order_num=3,
    )
    c4 = Criterion(
        id="c-req-4",
        version_id=cv1.id,
        description="具备良好的跨团队沟通与技术协作推进能力",
        kind="required",
        importance="low",
        constraint="flexible",
        order_num=4,
    )
    c5 = Criterion(
        id="c-bonus-1",
        version_id=cv1.id,
        description="有大模型应用开发（RAG/Agent）真实落地经验",
        kind="bonus",
        importance="high",
        constraint=None,
        order_num=5,
    )
    c6 = Criterion(
        id="c-bonus-2",
        version_id=cv1.id,
        description="拥有知名开源项目贡献或技术社区影响力",
        kind="bonus",
        importance="low",
        constraint=None,
        order_num=6,
    )
    db.add_all([c1, c2, c3, c4, c5, c6])
    await db.flush()

    # 4. 批次 batch-1
    batch1_dir = os.path.join(settings.STORAGE_DIR, "batches", "batch-1")
    os.makedirs(batch1_dir, exist_ok=True)

    b1 = Batch(
        id="batch-1",
        job_id=job1.id,
        criteria_version_id=cv1.id,
        title="第 1 批次 (5 份简历)",
        created_at=utc_now(),
    )
    db.add(b1)
    await db.flush()

    # 5. 候选人 item-1 ~ item-5
    # item-1: 张承宇
    pdf1 = os.path.join(batch1_dir, "item-1.pdf")
    create_sample_pdf(pdf1, "张承宇", ["教育经历：浙江大学计算机系本科", "工作经历：7年全栈架构与AI落地", "核心项目：主导千亿Token RAG检索微服务架构"])
    it1 = ScreeningItem(
        id="item-1",
        batch_id=b1.id,
        candidate_name="张承宇",
        original_filename="张承宇_资深全栈工程师_7年.pdf",
        file_path=pdf1,
        file_size_bytes=342000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(it1)
    await db.flush()

    dec1 = AuditDecision(
        id="dec-1",
        item_id=it1.id,
        decision="advance",
        tags=["核心经验契合", "高并发实操深厚"],
        notes="工程素养过硬，全栈架构与 RAG 落地经验完全吻合岗位需求，推进复试。",
        decided_by="HR",
        supersedes_id=None,
        created_at=utc_now(),
    )
    db.add(dec1)

    snap1 = EvaluationSnapshot(
        id="snap-1-v1",
        item_id=it1.id,
        criteria_version_id=cv1.id,
        version=1,
        match_score=85,
        coverage_rate=100,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "c-req-1",
                "description": "统招本科及以上学历，计算机或软件相关专业",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于浙江大学计算机系统招全日制本科，学历硬性条件完全符合",
                "evidences": [{"id": "ev-1-1", "page": 1, "quote": "教育经历：2015-2019 浙江大学 计算机科学与技术 本科", "method": "text"}],
            },
            {
                "criterion_id": "c-req-2",
                "description": "5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "具备 7 年资深全栈开发实战，熟练使用 React 18 与 FastAPI",
                "evidences": [{"id": "ev-1-2", "page": 1, "quote": "工作年限：7年架构经验，主导微服务治理与前端组件库建设", "method": "text"}],
            },
            {
                "criterion_id": "c-req-3",
                "description": "具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "主导千亿Token RAG检索微服务架构，并发承载达万级 QPS",
                "evidences": [{"id": "ev-1-3", "page": 2, "quote": "技术攻坚：重构全文检索与向量缓存，P99 降低 45%", "method": "text"}],
            },
            {
                "criterion_id": "c-req-4",
                "description": "具备良好的跨团队沟通与技术协作推进能力",
                "kind": "required",
                "importance": "low",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "曾担任 15 人全栈研发小组 Tech Lead",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-1",
                "description": "有大模型应用开发（RAG/Agent）真实落地经验",
                "kind": "bonus",
                "importance": "high",
                "constraint": None,
                "verdict": "met",
                "reason": "深度参与生产级 Agent 流程编排与知识库构建",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-2",
                "description": "拥有知名开源项目贡献或技术社区影响力",
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "met",
                "reason": "GitHub 开源组件 Star 超 2k",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 2, "total": 2},
        created_at=utc_now(),
    )
    db.add(snap1)

    # item-2: 李梦瑶 (v1 待核实 -> v2 电话核实推荐)
    pdf2 = os.path.join(batch1_dir, "item-2.pdf")
    create_sample_pdf(pdf2, "李梦瑶", ["教育背景：华中科技大学软件工程", "工作年限：4年全栈架构", "项目：企业级低代码平台"])
    it2 = ScreeningItem(
        id="item-2",
        batch_id=b1.id,
        candidate_name="李梦瑶",
        original_filename="李梦瑶_前端全栈架构_4年.pdf",
        file_path=pdf2,
        file_size_bytes=289000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(it2)
    await db.flush()

    dec2 = AuditDecision(
        id="dec-2",
        item_id=it2.id,
        decision="advance",
        tags=["电话核实通过", "高并发实操深厚"],
        notes="经电话补充核实，其主导了千万级高并发秒杀分流网关，符合资深标准，推进面试。",
        decided_by="HR",
        supersedes_id=None,
        created_at=utc_now(),
    )
    db.add(dec2)

    snap2_v1 = EvaluationSnapshot(
        id="snap-2-v1",
        item_id=it2.id,
        criteria_version_id=cv1.id,
        version=1,
        match_score=60,
        coverage_rate=66,
        suggested_group="verification",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "c-req-1",
                "description": "统招本科及以上学历，计算机或软件相关专业",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "华中科技大学软件工程统招本科",
                "evidences": [{"id": "ev-2-1", "page": 1, "quote": "华中科技大学 软件工程 本科", "method": "text"}],
            },
            {
                "criterion_id": "c-req-2",
                "description": "5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "精通前端与后端全栈交付",
                "evidences": [{"id": "ev-2-2", "page": 1, "quote": "工作经历：4年全栈实战，深度参与服务端架构", "method": "text"}],
            },
            {
                "criterion_id": "c-req-3",
                "description": "具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "unknown",
                "reason": "简历未详细展开高并发指标，需电话核实",
                "evidences": [],
            },
            {
                "criterion_id": "c-req-4",
                "description": "具备良好的跨团队沟通与技术协作推进能力",
                "kind": "required",
                "importance": "low",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "带领 5 人敏捷开发小组",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-1",
                "description": "有大模型应用开发（RAG/Agent）真实落地经验",
                "kind": "bonus",
                "importance": "high",
                "constraint": None,
                "verdict": "unknown",
                "reason": "未提重大 AI 项目",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-2",
                "description": "拥有知名开源项目贡献或技术社区影响力",
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "unknown",
                "reason": "无开源社区记录",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 2},
        created_at=utc_now(),
    )
    snap2_v2 = EvaluationSnapshot(
        id="snap-2-v2",
        item_id=it2.id,
        criteria_version_id=cv1.id,
        version=2,
        match_score=85,
        coverage_rate=100,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "c-req-1",
                "description": "统招本科及以上学历，计算机或软件相关专业",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "华中科技大学软件工程统招本科",
                "evidences": [{"id": "ev-2-1", "page": 1, "quote": "华中科技大学 软件工程 本科", "method": "text"}],
            },
            {
                "criterion_id": "c-req-2",
                "description": "5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "精通前端与后端全栈交付",
                "evidences": [{"id": "ev-2-2", "page": 1, "quote": "工作经历：4年全栈实战，深度参与服务端架构", "method": "text"}],
            },
            {
                "criterion_id": "c-req-3",
                "description": "具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "电话沟通确认：主导千万级高并发秒杀分流网关与分布式缓存架构",
                "evidences": [{"id": "ev-2-3", "page": 1, "quote": "补充记录：经电话核验，主导秒杀网关，承载峰值 QPS 1.5w", "method": "manual"}],
            },
            {
                "criterion_id": "c-req-4",
                "description": "具备良好的跨团队沟通与技术协作推进能力",
                "kind": "required",
                "importance": "low",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "带领 5 人敏捷开发小组",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-1",
                "description": "有大模型应用开发（RAG/Agent）真实落地经验",
                "kind": "bonus",
                "importance": "high",
                "constraint": None,
                "verdict": "unknown",
                "reason": "未提重大 AI 项目",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-2",
                "description": "拥有知名开源项目贡献或技术社区影响力",
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "unknown",
                "reason": "无开源社区记录",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 2},
        created_at=utc_now(),
    )
    db.add_all([snap2_v1, snap2_v2])

    # item-3: 赵浩然 (条件冲突: 学历与不可放宽门槛明确冲突)
    pdf3 = os.path.join(batch1_dir, "item-3.pdf")
    create_sample_pdf(pdf3, "赵浩然", ["教育经历：民办专科非全日制", "工作年限：3年初级开发"])
    it3 = ScreeningItem(
        id="item-3",
        batch_id=b1.id,
        candidate_name="赵浩然",
        original_filename="赵浩然_后端全栈专家_8年.pdf",
        file_path=pdf3,
        file_size_bytes=210000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(it3)
    await db.flush()

    dec3 = AuditDecision(
        id="dec-3",
        item_id=it3.id,
        decision="reject",
        tags=["学历不符合", "工作年限不足"],
        notes="学历与年限门槛不符合要求，无法放宽，暂不推进复试。",
        decided_by="HR",
        supersedes_id=None,
        created_at=utc_now(),
    )
    db.add(dec3)

    snap3 = EvaluationSnapshot(
        id="snap-3-v1",
        item_id=it3.id,
        criteria_version_id=cv1.id,
        version=1,
        match_score=40,
        coverage_rate=100,
        suggested_group="conflict",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "c-req-1",
                "description": "统招本科及以上学历，计算机或软件相关专业",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "unmet",
                "reason": "学历为非统招成教专科，与硬性门槛明确冲突",
                "evidences": [{"id": "ev-3-1", "page": 1, "quote": "教育背景：非全日制专科", "method": "text"}],
            },
            {
                "criterion_id": "c-req-2",
                "description": "5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "unmet",
                "reason": "仅 2.5 年初级开发，年限严重不足",
                "evidences": [{"id": "ev-3-2", "page": 1, "quote": "工作经历：2.5年基础开发", "method": "text"}],
            },
            {
                "criterion_id": "c-req-3",
                "description": "具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "unmet",
                "reason": "无分布式实战",
                "evidences": [],
            },
            {
                "criterion_id": "c-req-4",
                "description": "具备良好的跨团队沟通与技术协作推进能力",
                "kind": "required",
                "importance": "low",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "积极参与团队日常沟通",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-1",
                "description": "有大模型应用开发（RAG/Agent）真实落地经验",
                "kind": "bonus",
                "importance": "high",
                "constraint": None,
                "verdict": "unmet",
                "reason": "无大模型实操",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-2",
                "description": "拥有知名开源项目贡献或技术社区影响力",
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "unmet",
                "reason": "无开源社区成果",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 2},
        created_at=utc_now(),
    )
    db.add(snap3)

    # item-4: 王文博 (推荐队列, 未复核)
    pdf4 = os.path.join(batch1_dir, "item-4.pdf")
    create_sample_pdf(pdf4, "王文博", ["教育经历：哈工大软件工程硕士", "工作经历：5年全栈项目"])
    it4 = ScreeningItem(
        id="item-4",
        batch_id=b1.id,
        candidate_name="王文博",
        original_filename="王文博_全栈研发_5年.pdf",
        file_path=pdf4,
        file_size_bytes=315000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(it4)
    await db.flush()

    snap4 = EvaluationSnapshot(
        id="snap-4-v1",
        item_id=it4.id,
        criteria_version_id=cv1.id,
        version=1,
        match_score=75,
        coverage_rate=80,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "c-req-1",
                "description": "统招本科及以上学历，计算机或软件相关专业",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于哈尔滨工业大学计算机软件工程硕士",
                "evidences": [{"id": "ev-4-1", "page": 1, "quote": "教育经历：哈工大 硕士", "method": "text"}],
            },
            {
                "criterion_id": "c-req-2",
                "description": "5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "5年全栈架构实战",
                "evidences": [{"id": "ev-4-2", "page": 1, "quote": "工作经历：5年全栈开发", "method": "text"}],
            },
            {
                "criterion_id": "c-req-3",
                "description": "具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "unknown",
                "reason": "简历未详细展开高并发架构指标",
                "evidences": [],
            },
            {
                "criterion_id": "c-req-4",
                "description": "具备良好的跨团队沟通与技术协作推进能力",
                "kind": "required",
                "importance": "low",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "团队协作良好",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-1",
                "description": "有大模型应用开发（RAG/Agent）真实落地经验",
                "kind": "bonus",
                "importance": "high",
                "constraint": None,
                "verdict": "unknown",
                "reason": "未详述",
                "evidences": [],
            },
            {
                "criterion_id": "c-bonus-2",
                "description": "拥有知名开源项目贡献或技术社区影响力",
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "unknown",
                "reason": "无",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 2},
        created_at=utc_now(),
    )
    db.add(snap4)

    # item-5: 孙文杰 (异常待办，可重试自愈)
    pdf5 = os.path.join(batch1_dir, "item-5.pdf")
    create_sample_pdf(pdf5, "孙文杰", ["教育背景：武汉大学软件工程本科", "工作年限：6年Python后端"])
    it5 = ScreeningItem(
        id="item-5",
        batch_id=b1.id,
        candidate_name="孙文杰",
        original_filename="孙文杰_Python资深_6年.pdf",
        file_path=pdf5,
        file_size_bytes=278000,
        status="failed",
        parse_stage="text",
        error_info={"code": "PARSE_TIMEOUT", "message": "OCR解析服务临时网络抖动超时，建议点击重试自愈", "retryable": True},
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(it5)

    await db.commit()


async def seed_demo_database(db: AsyncSession) -> None:
    """初始化数据库业务基准数据 (保证开箱即用，真实持久化在 SQLite 中)"""
    # 优先初始化 job-001 与 batch-1 (对齐前端初始与测试数据)
    await seed_job_001_batch(db)

    # 检查是否已存在基准演示岗位
    existing_job = (
        await db.execute(select(Job).where(Job.id == DEFAULT_DEMO_JOB_ID))
    ).scalar_one_or_none()

    if existing_job:
        return

    # 1. 创建招聘岗位实体
    demo_job = Job(
        id=DEFAULT_DEMO_JOB_ID,
        title="资深全栈研发专家 (Python / React)",
        department="基础架构与商业化研发部",
        jd_text="""【岗位职责】
1. 负责企业级招聘初筛与协同工作台核心业务架构设计与工程落地；
2. 负责高并发服务端架构 (Python / FastAPI) 与现代前端 (React 18 / TypeScript) 全链路交付；
3. 主导微服务拆分、数据库性能调优及长连接实时流水线建设。

【任职要求】
1. 计算机及相关专业统招本科及以上学历；
2. 5年以上全栈或后端开发经验，精通 Python/FastAPI 与 React 生态；
3. 具备大型分布式系统架构与高并发调优实战经验，主导过千万级日活架构重构；
4. 拥有主流开源项目核心贡献或知名技术博客者优先。""",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(demo_job)
    await db.flush()

    # 2. 创建已冻结确认的不可变评测标准版本 (v1)
    cv_id = "cv_demo_v1"
    demo_cv = CriteriaVersion(
        id=cv_id,
        job_id=demo_job.id,
        version=1,
        status="confirmed",
        confirmed_at=utc_now(),
        recommendation_rule={
            "min_match_score": 70,
            "min_coverage_rate": 60,
            "is_calibrated": True,
        },
        created_at=utc_now(),
    )
    db.add(demo_cv)
    await db.flush()

    demo_job.current_criteria_version_id = demo_cv.id

    # 3. 创建 4 项结构化评测条件
    crit1 = Criterion(
        id="crit_edu_1",
        version_id=demo_cv.id,
        description="计算机相关专业统招本科及以上学历",
        kind="required",
        importance="high",
        constraint="strict",
        order_num=1,
    )
    crit2 = Criterion(
        id="crit_exp_2",
        version_id=demo_cv.id,
        description="5年以上全栈开发经验，精通 Python/FastAPI 与现代前端生态",
        kind="required",
        importance="high",
        constraint="strict",
        order_num=2,
    )
    crit3 = Criterion(
        id="crit_arch_3",
        version_id=demo_cv.id,
        description="具备大型分布式系统架构与高并发调优实战经验",
        kind="required",
        importance="medium",
        constraint="flexible",
        order_num=3,
    )
    crit4 = Criterion(
        id="crit_bonus_4",
        version_id=demo_cv.id,
        description="拥有主流开源项目核心贡献或知名技术博客",
        kind="bonus",
        importance="low",
        constraint=None,
        order_num=4,
    )
    db.add_all([crit1, crit2, crit3, crit4])
    await db.flush()

    # 4. 创建批次实体
    batch_dir = os.path.join(settings.STORAGE_DIR, "batches", DEFAULT_DEMO_BATCH_ID)
    os.makedirs(batch_dir, exist_ok=True)

    demo_batch = Batch(
        id=DEFAULT_DEMO_BATCH_ID,
        job_id=demo_job.id,
        criteria_version_id=demo_cv.id,
        title="2026 春季技术专家招聘首批",
        created_at=utc_now(),
    )
    db.add(demo_batch)
    await db.flush()

    # 5. 创建 5 位真实候选人与物理原件
    # 候选人 1: 张承宇 (优先推荐, 85分, 100%覆盖率, 已定推进沟通)
    pdf1_path = os.path.join(batch_dir, "item_demo_01.pdf")
    create_sample_pdf(pdf1_path, "张承宇", ["教育经历：浙江大学计算机系本科", "工作经历：8年全栈架构经验", "核心项目：主导微服务重构日活500万"])
    item1 = ScreeningItem(
        id="item_demo_01",
        batch_id=demo_batch.id,
        candidate_name="张承宇",
        original_filename="张承宇_资深全栈_8年.pdf",
        file_path=pdf1_path,
        file_size_bytes=342000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(item1)
    await db.flush()

    snap1 = EvaluationSnapshot(
        id="snap_demo_01_v1",
        item_id=item1.id,
        criteria_version_id=demo_cv.id,
        version=1,
        match_score=85,
        coverage_rate=100,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "crit_edu_1",
                "description": "计算机相关专业统招本科及以上学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于浙江大学计算机科学与技术专业，工学学士",
                "evidences": [{"id": "ev_01", "page": 1, "quote": "教育背景：2014-2018 浙江大学 计算机科学与技术 本科", "method": "text"}],
            },
            {
                "criterion_id": "crit_exp_2",
                "description": "5年以上全栈开发经验，精通 Python/FastAPI 与现代前端生态",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "具备 8 年技术全栈开发经验，深度精通 FastAPI 与 React",
                "evidences": [{"id": "ev_02", "page": 1, "quote": "工作经历：2018-至今 核心技术架构师，负责前后端整体演进", "method": "text"}],
            },
            {
                "criterion_id": "crit_arch_3",
                "description": "具备大型分布式系统架构与高并发调优实战经验",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "主导过日活 500 万微服务高并发拆分与熔断限流实战",
                "evidences": [{"id": "ev_03", "page": 2, "quote": "核心项目：设计高性能异步事件流处理引擎，支撑千万级吞吐", "method": "text"}],
            },
            {
                "criterion_id": "crit_bonus_4",
                "description": "拥有主流开源项目核心贡献或知名技术博客",
                "kind": "bonus",
                "importance": "low",
                "constraint": None,
                "verdict": "met",
                "reason": "拥有著名开源框架核心 Contributor 经历",
                "evidences": [{"id": "ev_04", "page": 2, "quote": "个人技术博客拥有 5 万订阅，Github 获 2000+ Stars", "method": "text"}],
            },
        ],
        bonus_summary={"met": 1, "total": 1},
        created_at=utc_now(),
    )
    dec1 = AuditDecision(
        id="dec_demo_01",
        item_id=item1.id,
        decision="advance",
        tags=["核心经验契合", "具备高并发实战"],
        notes="架构经验扎实，学历及年限完全对口，推进技术初面。",
        decided_by="HR",
        supersedes_id=None,
        created_at=utc_now(),
    )
    db.add_all([snap1, dec1])

    # 候选人 2: 李梦瑶 (初筛待核实 60分 -> 电话核实后 85分优先推荐)
    pdf2_path = os.path.join(batch_dir, "item_demo_02.pdf")
    create_sample_pdf(pdf2_path, "李梦瑶", ["教育经历：上海交通大学软件工程", "工作经历：6年微服务开发"])
    item2 = ScreeningItem(
        id="item_demo_02",
        batch_id=demo_batch.id,
        candidate_name="李梦瑶",
        original_filename="李梦瑶_微服务专家_6年.pdf",
        file_path=pdf2_path,
        file_size_bytes=289000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(item2)
    await db.flush()

    snap2_v1 = EvaluationSnapshot(
        id="snap_demo_02_v1",
        item_id=item2.id,
        criteria_version_id=demo_cv.id,
        version=1,
        match_score=60,
        coverage_rate=66,
        suggested_group="verification",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "crit_edu_1",
                "description": "计算机相关专业统招本科及以上学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于上海交通大学软件工程专业",
                "evidences": [{"id": "ev_21", "page": 1, "quote": "教育背景：上海交通大学 软件工程", "method": "text"}],
            },
            {
                "criterion_id": "crit_exp_2",
                "description": "5年以上全栈开发经验，精通 Python/FastAPI 与现代前端生态",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "6年后端架构与工程经验",
                "evidences": [{"id": "ev_22", "page": 1, "quote": "工作经历：6年分布式后端开发", "method": "text"}],
            },
            {
                "criterion_id": "crit_arch_3",
                "description": "具备大型分布式系统架构与高并发调优实战经验",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "unknown",
                "reason": "简历中仅提及常规接口开发，未明确提及千万级高并发或分布式调优细节",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 1},
        created_at=utc_now(),
    )
    snap2_v2 = EvaluationSnapshot(
        id="snap_demo_02_v2",
        item_id=item2.id,
        criteria_version_id=demo_cv.id,
        version=2,
        match_score=85,
        coverage_rate=100,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "crit_edu_1",
                "description": "计算机相关专业统招本科及以上学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于上海交通大学软件工程专业",
                "evidences": [{"id": "ev_21", "page": 1, "quote": "教育背景：上海交通大学 软件工程", "method": "text"}],
            },
            {
                "criterion_id": "crit_exp_2",
                "description": "5年以上全栈开发经验，精通 Python/FastAPI 与现代前端生态",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "6年后端架构与工程经验",
                "evidences": [{"id": "ev_22", "page": 1, "quote": "工作经历：6年分布式后端开发", "method": "text"}],
            },
            {
                "criterion_id": "crit_arch_3",
                "description": "具备大型分布式系统架构与高并发调优实战经验",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "met",
                "reason": "HR 电话核实通过：候选人在前司独立负责电商大促核心链路，支撑峰值 QPS 1.2万",
                "evidences": [{"id": "ev_manual_23", "page": None, "quote": "电话复核通过：前司主导分布式锁与分库分表重构，实际承载 QPS 1.2w", "method": "manual"}],
            },
        ],
        bonus_summary={"met": 0, "total": 1},
        created_at=utc_now(),
    )
    dec2 = AuditDecision(
        id="dec_demo_02",
        item_id=item2.id,
        decision="advance",
        tags=["电联核实通过", "高并发补充通过"],
        notes="经电话沟通确认高并发经验属实，补充后评测进入优先推荐队列，推进面试。",
        decided_by="HR",
        supersedes_id=None,
        created_at=utc_now(),
    )
    db.add_all([snap2_v1, snap2_v2, dec2])

    # 候选人 3: 王志远 (条件冲突, 40分, 学历专科不满足不可放宽必要条件)
    pdf3_path = os.path.join(batch_dir, "item_demo_03.pdf")
    create_sample_pdf(pdf3_path, "王志远", ["学历背景：电子信息专科", "工作年限：3年"])
    item3 = ScreeningItem(
        id="item_demo_03",
        batch_id=demo_batch.id,
        candidate_name="王志远",
        original_filename="王志远_后端开发_3年.pdf",
        file_path=pdf3_path,
        file_size_bytes=210000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(item3)
    await db.flush()

    snap3 = EvaluationSnapshot(
        id="snap_demo_03_v1",
        item_id=item3.id,
        criteria_version_id=demo_cv.id,
        version=1,
        match_score=40,
        coverage_rate=100,
        suggested_group="conflict",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "crit_edu_1",
                "description": "计算机相关专业统招本科及以上学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "unmet",
                "reason": "大专学历，明确不满足不可放宽必要条件",
                "evidences": [{"id": "ev_31", "page": 1, "quote": "教育背景：大专 计算机应用技术", "method": "text"}],
            },
            {
                "criterion_id": "crit_exp_2",
                "description": "5年以上全栈开发经验，精通 Python/FastAPI 与现代前端生态",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "unmet",
                "reason": "工作年限仅 3 年，不满足 5 年要求",
                "evidences": [{"id": "ev_32", "page": 1, "quote": "工作经历：2023-至今 后端初级研发", "method": "text"}],
            },
            {
                "criterion_id": "crit_arch_3",
                "description": "具备大型分布式系统架构与高并发调优实战经验",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "unmet",
                "reason": "无大型分布式实战落地",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 1},
        created_at=utc_now(),
    )
    dec3 = AuditDecision(
        id="dec_demo_03",
        item_id=item3.id,
        decision="reject",
        tags=["学历不符合", "工作年限不足"],
        notes="不可放宽必要条件明确冲突，暂不推进进入复试。",
        decided_by="HR",
        supersedes_id=None,
        created_at=utc_now(),
    )
    db.add_all([snap3, dec3])

    # 候选人 4: 赵梓轩 (优先推荐, 75分, 80%覆盖率, 未复核)
    pdf4_path = os.path.join(batch_dir, "item_demo_04.pdf")
    create_sample_pdf(pdf4_path, "赵梓轩", ["教育背景：华中科技大学本科", "工作年限：5年全栈"])
    item4 = ScreeningItem(
        id="item_demo_04",
        batch_id=demo_batch.id,
        candidate_name="赵梓轩",
        original_filename="赵梓轩_全栈工程师_5年.pdf",
        file_path=pdf4_path,
        file_size_bytes=315000,
        status="completed",
        parse_stage="text",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(item4)
    await db.flush()

    snap4 = EvaluationSnapshot(
        id="snap_demo_04_v1",
        item_id=item4.id,
        criteria_version_id=demo_cv.id,
        version=1,
        match_score=75,
        coverage_rate=80,
        suggested_group="recommended",
        is_rule_calibrated=True,
        findings=[
            {
                "criterion_id": "crit_edu_1",
                "description": "计算机相关专业统招本科及以上学历",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "毕业于华中科技大学电子信息工程",
                "evidences": [{"id": "ev_41", "page": 1, "quote": "教育背景：华中科技大学 本科", "method": "text"}],
            },
            {
                "criterion_id": "crit_exp_2",
                "description": "5年以上全栈开发经验，精通 Python/FastAPI 与现代前端生态",
                "kind": "required",
                "importance": "high",
                "constraint": "strict",
                "verdict": "met",
                "reason": "具备 5 年全栈交付经验",
                "evidences": [{"id": "ev_42", "page": 1, "quote": "工作经历：5年全栈项目架构经验", "method": "text"}],
            },
            {
                "criterion_id": "crit_arch_3",
                "description": "具备大型分布式系统架构与高并发调优实战经验",
                "kind": "required",
                "importance": "medium",
                "constraint": "flexible",
                "verdict": "unknown",
                "reason": "简历未详细展开高并发架构指标",
                "evidences": [],
            },
        ],
        bonus_summary={"met": 0, "total": 1},
        created_at=utc_now(),
    )
    db.add(snap4)

    # 候选人 5: 孙文杰 (异常待办, 模拟网络超时, 可单项重试自愈)
    pdf5_path = os.path.join(batch_dir, "item_demo_05.pdf")
    create_sample_pdf(pdf5_path, "孙文杰", ["教育背景：武汉大学软件工程本科", "工作年限：6年Python后端"])
    item5 = ScreeningItem(
        id="item_demo_05",
        batch_id=demo_batch.id,
        candidate_name="孙文杰",
        original_filename="孙文杰_Python资深_6年.pdf",
        file_path=pdf5_path,
        file_size_bytes=278000,
        status="failed",
        parse_stage="text",
        error_info={"code": "PARSE_TIMEOUT", "message": "OCR解析服务临时网络抖动超时，建议点击重试自愈", "retryable": True},
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(item5)

    await db.commit()
