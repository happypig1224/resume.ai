"""
确定性评分与分流规则引擎 (Deterministic Scoring & Triaging Engine)
严格对齐 PRD-001 第 6 节与 RES-002、RES-003：
1. 匹配分仅计算必要条件（required），加分项独立展示，不计入匹配分；
2. 权重高/中/低 = 3/2/1；
3. 证据不足（unknown）不计入匹配分分子与分母，但降低证据覆盖率；
4. 已知必要条件全为 unknown 时，匹配分返回 None（前端展示“证据不足，暂不评分”）；
5. 覆盖率 = 已知必要条件权重之和 ÷ 全部必要条件权重之和 × 100%；
6. 分组优先级：
   - 优先级 1 · 条件冲突 (conflict)：任一不可放宽必要条件明确不符合 (unmet)；
   - 优先级 2 · 待核实 (verification)：无冲突，但关键条件（所有不可放宽条件 + 高重要性可酌情条件）任一证据不足 (unknown)；
   - 优先级 3 · 推荐候选人 (recommended)：关键条件齐全，且匹配分与覆盖率均达到已校准门槛；
   - 其余人选 (other)：门槛未校准或得分未达标，保留访问，不予静默淘汰。
"""

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field

CriterionKind = Literal["required", "bonus"]
CriterionImportance = Literal["high", "medium", "low"]
CriterionConstraint = Optional[Literal["strict", "flexible"]]
Verdict = Literal["met", "unmet", "unknown"]
SuggestedGroup = Literal["conflict", "verification", "recommended", "other"]

IMPORTANCE_WEIGHTS: Dict[CriterionImportance, int] = {
    "high": 3,
    "medium": 2,
    "low": 1,
}


class CriterionInput(BaseModel):
    id: str
    description: str
    kind: CriterionKind
    importance: CriterionImportance
    constraint: CriterionConstraint = None


class FindingInput(BaseModel):
    criterion_id: str
    verdict: Verdict
    evidence_ids: List[str] = Field(default_factory=list)
    reason: str = ""


class RecommendationRuleInput(BaseModel):
    min_match_score: int = 70
    min_coverage_rate: int = 60
    is_calibrated: bool = False


class BonusCount(BaseModel):
    met: int
    total: int


class DerivedScores(BaseModel):
    match_score: Optional[int]
    coverage_rate: int
    known_required_count: int
    total_required_count: int
    suggested_group: SuggestedGroup
    bonus_count: BonusCount
    is_rule_calibrated: bool


def calculate_derived_scores(
    criteria: List[CriterionInput],
    findings: List[FindingInput],
    recommendation_rule: Optional[RecommendationRuleInput] = None,
) -> DerivedScores:
    finding_map = {f.criterion_id: f for f in findings}

    required_criteria = [c for c in criteria if c.kind == "required"]
    bonus_criteria = [c for c in criteria if c.kind == "bonus"]

    met_required_weight = 0
    known_required_weight = 0
    total_required_weight = 0
    known_required_count = 0

    has_strict_unmet = False
    has_critical_unknown = False

    for crit in required_criteria:
        weight = IMPORTANCE_WEIGHTS[crit.importance]
        total_required_weight += weight

        finding = finding_map.get(crit.id)
        verdict: Verdict = finding.verdict if finding else "unknown"

        # 检查是否为不可放宽条件 (strict)
        is_strict = crit.constraint == "strict"
        # 关键条件：所有不可放宽条件 + 高重要性可酌情条件
        is_critical = is_strict or (crit.importance == "high" and crit.constraint == "flexible")

        if is_strict and verdict == "unmet":
            has_strict_unmet = True

        if is_critical and verdict == "unknown":
            has_critical_unknown = True

        if verdict == "met":
            met_required_weight += weight
            known_required_weight += weight
            known_required_count += 1
        elif verdict == "unmet":
            known_required_weight += weight
            known_required_count += 1

    # 匹配分计算
    match_score: Optional[int] = None
    if known_required_weight > 0:
        match_score = round((met_required_weight / known_required_weight) * 100)

    # 覆盖率计算
    coverage_rate = (
        round((known_required_weight / total_required_weight) * 100)
        if total_required_weight > 0
        else 0
    )

    # 加分项统计
    bonus_met_count = 0
    for b in bonus_criteria:
        finding = finding_map.get(b.id)
        if finding and finding.verdict == "met":
            bonus_met_count += 1

    # 分流判定：严格遵循 PRD 优先级
    suggested_group: SuggestedGroup = "other"
    is_rule_calibrated = bool(recommendation_rule and recommendation_rule.is_calibrated)

    if has_strict_unmet:
        suggested_group = "conflict"
    elif has_critical_unknown:
        suggested_group = "verification"
    elif is_rule_calibrated and recommendation_rule:
        if (
            match_score is not None
            and match_score >= recommendation_rule.min_match_score
            and coverage_rate >= recommendation_rule.min_coverage_rate
        ):
            suggested_group = "recommended"
        else:
            suggested_group = "other"
    else:
        # 关键条件齐全但门槛尚未完成样本校准冻结
        suggested_group = "other"

    return DerivedScores(
        match_score=match_score,
        coverage_rate=coverage_rate,
        known_required_count=known_required_count,
        total_required_count=len(required_criteria),
        suggested_group=suggested_group,
        bonus_count=BonusCount(met=bonus_met_count, total=len(bonus_criteria)),
        is_rule_calibrated=is_rule_calibrated,
    )
