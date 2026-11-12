export type CriterionKind = 'required' | 'bonus'
export type CriterionImportance = 'high' | 'medium' | 'low'
export type CriterionConstraint = 'strict' | 'flexible' | null

export interface Criterion {
  id: string
  description: string
  kind: CriterionKind
  importance: CriterionImportance
  constraint: CriterionConstraint
}

export interface RecommendationRule {
  minMatchScore: number
  minCoverageRate: number
  isCalibrated: boolean
}

export interface CriteriaVersion {
  id: string
  jobId: string
  version: number
  status: 'draft' | 'confirmed'
  criteria: Criterion[]
  recommendationRule?: RecommendationRule
  confirmedAt: string | null
}

export interface Job {
  id: string
  title: string
  department: string
  jdText: string
  currentCriteriaVersionId: string | null
  createdAt: string
}

export type ProcessingStatus = 'queued' | 'parsing' | 'evaluating' | 'completed' | 'failed'
export type ParseStage = 'text' | 'ocr' | 'multimodal'

export interface ProcessingRun {
  id: string
  itemId: string
  attempt: number
  status: ProcessingStatus
  stage: ParseStage
  error?: {
    code: string
    message: string
    retryable: boolean
  } | null
  startedAt: string
  updatedAt: string
}

export type Verdict = 'met' | 'unmet' | 'unknown'

export interface Evidence {
  id: string
  documentId: string
  page: number | null
  quote: string
  locator?: { x?: number; y?: number; width?: number; height?: number } | null
  method: 'text' | 'ocr' | 'multimodal' | 'manual'
}

export interface Finding {
  criterionId: string
  verdict: Verdict
  evidenceIds: string[]
  reason: string
}

export interface Document {
  id: string
  candidateId: string
  kind: 'resume' | 'supplement'
  name: string
  mediaType: string
  sizeBytes: number
  pageCount: number | null
  sourceLabel: string
  contentPages?: string[]
  createdAt: string
}

export interface Candidate {
  id: string
  displayName: string | null
  originalFilename: string
}

export interface Evaluation {
  id: string
  itemId: string
  criteriaVersionId: string
  documentIds: string[]
  ruleVersion: string
  modelVersion: string
  promptVersion: string
  findings: Finding[]
  createdAt: string
  note?: string
}

export type ReviewOutcome = 'advance' | 'need_info' | 'hold'

export interface ReviewDecision {
  id: string
  itemId: string
  evaluationId: string
  outcome: ReviewOutcome
  reasonTags: string[]
  note: string
  createdAt: string
  supersedesId: string | null
}

export interface ScreeningItem {
  id: string
  batchId: string
  candidateId: string
  resumeDocumentId: string
  currentEvaluationId: string | null
  currentRunId: string
}

export interface Batch {
  id: string
  jobId: string
  criteriaVersionId: string
  itemIds: string[]
  createdAt: string
  name: string
}

export type SuggestedGroup = 'recommended' | 'verification' | 'conflict' | 'other'

export interface DerivedScores {
  matchScore: number | null // null 表示“证据不足，暂不评分”
  coverageRate: number // 0 ~ 100
  knownRequiredCount: number
  totalRequiredCount: number
  suggestedGroup: SuggestedGroup
  bonusCount: { met: number; total: number }
  isRuleCalibrated: boolean
}
