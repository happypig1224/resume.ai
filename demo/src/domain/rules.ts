import { Criterion, Finding, DerivedScores, SuggestedGroup, RecommendationRule } from './types'

export const IMPORTANCE_WEIGHTS: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * 依据 PRD-001 第 6 节与 RES-002、RES-003 确认规则：
 * 1. 匹配分仅计算必要条件（required），加分项独立展示，不计入匹配分。
 * 2. 权重高/中/低 = 3/2/1。
 * 3. 证据不足（unknown）不计入匹配分分子与分母，但降低证据覆盖率。
 * 4. 已知必要条件全为 unknown 时，匹配分返回 null（界面展示“证据不足，暂不评分”）。
 * 5. 覆盖率 = 已知必要条件权重之和 ÷ 全部必要条件权重之和 × 100%。
 * 6. 分组优先级：
 *    - 任一不可放宽必要条件明确不符合 (unmet) -> 'conflict'（条件冲突）
 *    - 关键条件（所有不可放宽条件 + 高重要性可酌情条件）任一证据不足 (unknown) -> 'verification'（待核实）
 *    - 门槛校准驱动推荐：依据岗位校准参数 (recommendationRule) 进行判定。
 *      未配置或未校准门槛时不随意硬编码推荐，归入 'other' 并在界面提示“待配置推荐规则”。
 */
export function calculateDerivedScores(
  criteria: Criterion[],
  findings: Finding[],
  recommendationRule?: RecommendationRule
): DerivedScores {
  const findingMap = new Map(findings.map((f) => [f.criterionId, f]))

  const requiredCriteria = criteria.filter((c) => c.kind === 'required')
  const bonusCriteria = criteria.filter((c) => c.kind === 'bonus')

  let metRequiredWeight = 0
  let knownRequiredWeight = 0
  let totalRequiredWeight = 0
  let knownRequiredCount = 0

  let hasStrictUnmet = false
  let hasCriticalUnknown = false

  for (const crit of requiredCriteria) {
    const weight = IMPORTANCE_WEIGHTS[crit.importance]
    totalRequiredWeight += weight

    const finding = findingMap.get(crit.id)
    const verdict = finding ? finding.verdict : 'unknown'

    // 检查是否为不可放宽条件
    const isStrict = crit.constraint === 'strict'
    // 关键条件：所有不可放宽条件 + 高重要性可酌情条件
    const isCritical = isStrict || (crit.importance === 'high' && crit.constraint === 'flexible')

    if (isStrict && verdict === 'unmet') {
      hasStrictUnmet = true
    }

    if (isCritical && verdict === 'unknown') {
      hasCriticalUnknown = true
    }

    if (verdict === 'met') {
      metRequiredWeight += weight
      knownRequiredWeight += weight
      knownRequiredCount++
    } else if (verdict === 'unmet') {
      knownRequiredWeight += weight
      knownRequiredCount++
    }
  }

  // 匹配分计算
  let matchScore: number | null = null
  if (knownRequiredWeight > 0) {
    matchScore = Math.round((metRequiredWeight / knownRequiredWeight) * 100)
  }

  // 覆盖率计算
  const coverageRate = totalRequiredWeight > 0
    ? Math.round((knownRequiredWeight / totalRequiredWeight) * 100)
    : 0

  // 加分项统计
  let bonusMetCount = 0
  for (const b of bonusCriteria) {
    const finding = findingMap.get(b.id)
    if (finding && finding.verdict === 'met') {
      bonusMetCount++
    }
  }

  // 分组判定：严格遵循 PRD 优先级
  let suggestedGroup: SuggestedGroup = 'other'
  const isRuleCalibrated = Boolean(recommendationRule && recommendationRule.isCalibrated)

  if (hasStrictUnmet) {
    suggestedGroup = 'conflict'
  } else if (hasCriticalUnknown) {
    suggestedGroup = 'verification'
  } else if (isRuleCalibrated && recommendationRule) {
    if (
      matchScore !== null &&
      matchScore >= recommendationRule.minMatchScore &&
      coverageRate >= recommendationRule.minCoverageRate
    ) {
      suggestedGroup = 'recommended'
    } else {
      suggestedGroup = 'other'
    }
  } else {
    // 关键条件齐全但门槛尚未完成样本校准冻结
    suggestedGroup = 'other'
  }

  return {
    matchScore,
    coverageRate,
    knownRequiredCount,
    totalRequiredCount: requiredCriteria.length,
    suggestedGroup,
    bonusCount: { met: bonusMetCount, total: bonusCriteria.length },
    isRuleCalibrated,
  }
}
