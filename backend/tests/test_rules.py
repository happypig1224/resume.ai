from app.domain.rules import (
    CriterionInput,
    FindingInput,
    RecommendationRuleInput,
    calculate_derived_scores,
)


def test_conflict_queue_when_strict_unmet():
    """测试：任一不可放宽条件不符合时，直接归入条件冲突队列"""
    criteria = [
        CriterionInput(
            id="c1",
            description="5年以上经验",
            kind="required",
            importance="high",
            constraint="strict",
        ),
        CriterionInput(
            id="c2",
            description="熟悉Python",
            kind="required",
            importance="medium",
            constraint="flexible",
        ),
    ]
    findings = [
        FindingInput(criterion_id="c1", verdict="unmet", reason="仅2年经验"),
        FindingInput(criterion_id="c2", verdict="met", reason="精通FastAPI"),
    ]

    scores = calculate_derived_scores(criteria, findings)
    assert scores.suggested_group == "conflict"
    assert scores.match_score == 40  # 2 / (3 + 2) * 100 = 40%
    assert scores.coverage_rate == 100


def test_verification_queue_when_critical_unknown():
    """测试：无硬性冲突但关键条件证据不足时，归入待核实队列"""
    criteria = [
        CriterionInput(
            id="c1",
            description="统招本科以上",
            kind="required",
            importance="high",
            constraint="strict",
        ),
        CriterionInput(
            id="c2",
            description="具备大规模分布式经验",
            kind="required",
            importance="high",
            constraint="flexible",
        ),
    ]
    findings = [
        FindingInput(criterion_id="c1", verdict="met", reason="硕士毕业"),
        FindingInput(criterion_id="c2", verdict="unknown", reason="未提及"),
    ]

    scores = calculate_derived_scores(criteria, findings)
    assert scores.suggested_group == "verification"
    assert scores.match_score == 100  # 3 / 3 = 100%
    assert scores.coverage_rate == 50  # 3 / 6 = 50%


def test_recommended_queue_when_calibrated():
    """测试：关键条件齐全且达到校准门槛时，归入推荐候选人队列"""
    criteria = [
        CriterionInput(
            id="c1",
            description="本科",
            kind="required",
            importance="high",
            constraint="strict",
        ),
        CriterionInput(
            id="c2",
            description="掌握Python",
            kind="required",
            importance="high",
            constraint="strict",
        ),
        CriterionInput(
            id="b1",
            description="开源项目经验",
            kind="bonus",
            importance="low",
            constraint=None,
        ),
    ]
    findings = [
        FindingInput(criterion_id="c1", verdict="met"),
        FindingInput(criterion_id="c2", verdict="met"),
        FindingInput(criterion_id="b1", verdict="met"),
    ]
    rule = RecommendationRuleInput(
        min_match_score=80, min_coverage_rate=80, is_calibrated=True
    )

    scores = calculate_derived_scores(criteria, findings, rule)
    assert scores.suggested_group == "recommended"
    assert scores.match_score == 100
    assert scores.coverage_rate == 100
    assert scores.bonus_count.met == 1
    assert scores.bonus_count.total == 1


def test_all_unknown_yields_none_score():
    """测试：当必要条件全部为 unknown 时，匹配分返回 None（前端展示暂不评分）"""
    criteria = [
        CriterionInput(
            id="c1",
            description="必要条件1",
            kind="required",
            importance="high",
            constraint="strict",
        ),
    ]
    findings = [
        FindingInput(criterion_id="c1", verdict="unknown"),
    ]

    scores = calculate_derived_scores(criteria, findings)
    assert scores.match_score is None
    assert scores.coverage_rate == 0
    assert scores.suggested_group == "verification"
