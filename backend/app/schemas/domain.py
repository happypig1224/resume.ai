from datetime import datetime, timezone
from typing import Any, Dict, Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

CriterionKind = Literal["required", "bonus"]
CriterionImportance = Literal["high", "medium", "low"]
CriterionConstraint = Optional[Literal["strict", "flexible"]]
Verdict = Literal["met", "unmet", "unknown"]
SuggestedGroup = Literal["conflict", "verification", "recommended", "other"]
ProcessingStatus = Literal["queued", "parsing", "evaluating", "completed", "failed"]
ParseStage = Literal["text", "ocr", "multimodal"]
DecisionType = Literal["advance", "reject", "supplement"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StandardResponse(BaseModel, Generic[T]):
    """统一响应信封：code 严格对齐 HTTP 状态码"""
    code: int = 200
    message: str = "success"
    data: T
    timestamp: datetime = Field(default_factory=utc_now)


class HealthResponse(BaseModel):
    status: str = "ok"
    app_name: str
    environment: str
    database: str
    timestamp: datetime


# ==============================================================================
# 条件与标准 Schema
# ==============================================================================

class CriterionSchema(BaseModel):
    id: Optional[str] = None
    description: str = Field(..., min_length=2, description="条件描述")
    kind: CriterionKind = Field(..., description="类别：required(必要) / bonus(加分)")
    importance: CriterionImportance = Field("medium", description="重要性：high / medium / low")
    constraint: CriterionConstraint = Field(None, description="约束：strict(不可放宽) / flexible(可酌情)")
    order_num: int = 0


class RecommendationRuleSchema(BaseModel):
    min_match_score: int = Field(70, ge=0, le=100, description="最低匹配分门槛")
    min_coverage_rate: int = Field(60, ge=0, le=100, description="最低证据覆盖率门槛")
    is_calibrated: bool = Field(False, description="是否已经过样本门槛校准")


class CriteriaVersionSchema(BaseModel):
    id: str
    job_id: str
    version: int
    status: str
    recommendation_rule: RecommendationRuleSchema
    criteria: List[CriterionSchema] = Field(default_factory=list)
    confirmed_at: Optional[datetime] = None
    created_at: datetime


class CriteriaDraftUpdate(BaseModel):
    """保存或更新标准草稿"""
    recommendation_rule: Optional[RecommendationRuleSchema] = None
    criteria: List[CriterionSchema] = Field(default_factory=list, description="条件清单")


class CriteriaConfirmResponse(BaseModel):
    """确认冻结标准版本的响应"""
    version_id: str
    job_id: str
    version: int
    status: str
    confirmed_at: datetime
    total_criteria_count: int
    required_criteria_count: int
    bonus_criteria_count: int


class ExtractCriteriaResponse(BaseModel):
    """JD 结构化提取条件响应"""
    job_id: str
    extracted_criteria: List[CriterionSchema]


# ==============================================================================
# 岗位 (Jobs) Schema
# ==============================================================================

class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="岗位名称")
    department: str = Field(..., min_length=1, max_length=255, description="所属部门")
    jd_text: str = Field(..., min_length=10, description="岗位 JD 文本，至少10字符")
    initial_criteria: Optional[List[CriterionSchema]] = None


class JobCreateResponse(BaseModel):
    id: str
    title: str
    department: str
    jd_text: str
    current_criteria_version_id: Optional[str] = None
    draft_version_id: str
    created_at: datetime


class ConfirmedVersionSummary(BaseModel):
    version_id: str
    version_num: int
    confirmed_at: datetime
    required_count: int
    bonus_count: int


class CriteriaStatusSummary(BaseModel):
    is_ready_for_import: bool
    confirmed_version: Optional[ConfirmedVersionSummary] = None
    has_active_draft: bool
    draft_version_num: Optional[int] = None
    draft_version_id: Optional[str] = None


class JobStatsSummary(BaseModel):
    total_batches: int = 0
    total_candidates: int = 0
    pending_review_count: int = 0


class JobListItemVO(BaseModel):
    """岗位列表项视图对象 (DTO/VO)"""
    id: str
    title: str
    department: str
    created_at: datetime
    updated_at: datetime
    criteria_status: CriteriaStatusSummary
    stats: JobStatsSummary


class JobListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[JobListItemVO]


class JobDetailResponse(BaseModel):
    """岗位详情视图对象"""
    id: str
    title: str
    department: str
    jd_text: str
    current_criteria_version_id: Optional[str] = None
    current_criteria_version: Optional[CriteriaVersionSchema] = None
    active_draft_version: Optional[CriteriaVersionSchema] = None
    created_at: datetime
    updated_at: datetime


# ==============================================================================
# 批次、筛选项与审计 Schema
# ==============================================================================

class BatchAcceptedItemVO(BaseModel):
    item_id: str
    filename: str
    file_size_bytes: int
    status: str = "queued"


class BatchFailedItemVO(BaseModel):
    item_id: str
    filename: str
    file_size_bytes: int
    status: str = "failed"
    error_info: Dict[str, Any]


class BatchCreateResponse(BaseModel):
    """批次受理成功响应 DTO (202 Accepted)"""
    batch_id: str
    job_id: str
    criteria_version_id: str
    title: str
    total_files: int
    accepted_count: int
    rejected_count: int
    queued_items: List[BatchAcceptedItemVO]
    failed_items: List[BatchFailedItemVO]
    sse_stream_url: str
    created_at: datetime


class BatchStatsVO(BaseModel):
    queued: int = 0
    parsing: int = 0
    evaluating: int = 0
    completed: int = 0
    failed: int = 0


class BatchDetailVO(BaseModel):
    """批次详情及各阶段统计 DTO"""
    batch_id: str
    job_id: str
    criteria_version_id: str
    title: str
    total_items: int
    stats: BatchStatsVO
    created_at: datetime


class BatchListItemVO(BaseModel):
    """批次列表项 DTO"""
    batch_id: str
    job_id: str
    criteria_version_id: str
    title: str
    total_items: int
    completed_items: int
    failed_items: int
    created_at: datetime


class BatchListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[BatchListItemVO]


class BatchResponse(BaseModel):
    id: str
    job_id: str
    criteria_version_id: str
    title: str
    total_items: int = 0
    created_at: datetime


# ==============================================================================
# SSE 事件 Payload Schema
# ==============================================================================

class SSEProgressPayload(BaseModel):
    batch_id: str
    total: int
    completed: int
    failed: int
    parsing: int
    evaluating: int
    percent: int


class SSEItemUpdatedPayload(BaseModel):
    item_id: str
    candidate_name: Optional[str] = None
    status: str
    parse_stage: str
    derived_scores: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class SSEStageDegradedPayload(BaseModel):
    item_id: str
    from_stage: str
    to_stage: str
    reason: str


class SSEBatchCompletedPayload(BaseModel):
    batch_id: str
    total: int
    success_count: int
    failed_count: int
    completed_at: datetime


class ScreeningItemResponse(BaseModel):
    id: str
    batch_id: str
    candidate_name: Optional[str] = None
    original_filename: str
    file_size_bytes: int
    status: ProcessingStatus
    parse_stage: ParseStage
    error_info: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class AuditDecisionCreate(BaseModel):
    decision: DecisionType
    tags: List[str] = Field(default_factory=list)
    notes: str = ""


class AuditDecisionResponse(BaseModel):
    id: str
    item_id: str
    decision: DecisionType
    tags: List[str]
    notes: str
    decided_by: str
    supersedes_id: Optional[str] = None
    created_at: datetime


# ==============================================================================
# 候选人全景研判与事实凭据穿透 (Slice 4 DTO)
# ==============================================================================

class EvidenceVO(BaseModel):
    id: str
    page: Optional[int] = None
    quote: str
    method: str = "text"


class FindingDetailVO(BaseModel):
    criterion_id: str
    description: str
    kind: CriterionKind
    importance: CriterionImportance
    constraint: CriterionConstraint = None
    verdict: Verdict
    reason: str
    evidences: List[EvidenceVO] = Field(default_factory=list)


class EvaluationSnapshotVO(BaseModel):
    id: str
    version: int
    match_score: Optional[int] = None
    coverage_rate: int
    suggested_group: SuggestedGroup
    is_rule_calibrated: bool = False
    findings: List[FindingDetailVO] = Field(default_factory=list)
    bonus_summary: Dict[str, int] = Field(default_factory=lambda: {"met": 0, "total": 0})
    created_at: datetime


class DecisionVO(BaseModel):
    id: str
    decision: str
    tags: List[str] = Field(default_factory=list)
    notes: str = ""
    decided_by: str = "HR"
    supersedes_id: Optional[str] = None
    created_at: datetime


class CandidateReviewDetailVO(BaseModel):
    item_id: str
    batch_id: str
    candidate_name: Optional[str] = None
    original_filename: str
    pdf_url: str
    status: str
    parse_stage: str
    error_info: Optional[Dict[str, Any]] = None
    evaluation: Optional[EvaluationSnapshotVO] = None
    evaluation_history: List[EvaluationSnapshotVO] = Field(default_factory=list)
    decisions_history: List[DecisionVO] = Field(default_factory=list)


class CreateDecisionRequest(BaseModel):
    decision: Literal["advance", "reject", "supplement"]
    tags: List[str] = Field(default_factory=list)
    notes: str = Field("", description="HR人工复核备注")


class SupplementReevaluateRequest(BaseModel):
    criterion_id: str = Field(..., description="目标标准条件项 ID")
    supplement_verdict: Literal["met", "unmet"] = Field(..., description="HR补充核验结论")
    supplement_note: str = Field(..., min_length=2, description="HR电话核实或补充材料记录")
    channel: Optional[str] = Field("phone_call", description="核实渠道：phone_call, interview 等")


class SupplementReevaluateResponse(BaseModel):
    item_id: str
    previous_version: int
    new_evaluation_version: int
    previous_scores: Dict[str, Any]
    new_scores: Dict[str, Any]
    updated_at: datetime


class BatchItemSummaryVO(BaseModel):
    item_id: str
    candidate_name: Optional[str] = None
    original_filename: str
    status: str
    parse_stage: str
    match_score: Optional[int] = None
    coverage_rate: int = 0
    suggested_group: str = "other"
    latest_decision: Optional[DecisionVO] = None
    error_info: Optional[Dict[str, Any]] = None
    updated_at: datetime


class BatchItemListResponse(BaseModel):
    batch_id: str
    total: int
    page: int
    page_size: int
    items: List[BatchItemSummaryVO]
    distribution: Dict[str, int] = Field(
        default_factory=lambda: {
            "recommended": 0,
            "verification": 0,
            "conflict": 0,
            "failed": 0,
            "other": 0,
        }
    )


# ==============================================================================
# Slice 5: 审计追溯、异常重试自愈与全量数据导出 Schema
# ==============================================================================

class RetryItemResponse(BaseModel):
    """异常单项重试自愈响应 DTO"""
    item_id: str
    previous_status: str
    new_status: str
    message: str
    retry_stage: str
    retried_at: datetime


class AC01MetricsVO(BaseModel):
    """PRD AC-01 业务指标（HR 值得沟通人选中进入推荐或待核实比例 >= 95%）"""
    hr_worthwhile_count: int
    recommended_or_verified_count: int
    ac01_ratio: float
    is_ac01_passed: bool


class BatchMetricsVO(BaseModel):
    """批次全景复核与审计指标大盘 DTO"""
    batch_id: str
    title: str
    total_items: int
    completed_count: int
    failed_count: int
    processing_count: int
    groups_distribution: Dict[str, int]
    decisions_distribution: Dict[str, int]
    supplement_resolved_count: int
    average_match_score: Optional[float]
    average_coverage_rate: float
    ac01: AC01MetricsVO
    parse_stages: Dict[str, int]
    generated_at: datetime

