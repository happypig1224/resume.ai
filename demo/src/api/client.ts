/**
 * 统一 API 客户端 (基于 API-001 契约规范)
 */

export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  timestamp: string
}

export interface ApiErrorPayload {
  code: number
  error: string
  message: string
  details?: any[]
  path?: string
  timestamp: string
}

export class ApiError extends Error {
  code: number
  status: number
  details?: any[]

  constructor(message: string, code: number, status: number, details?: any[]) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/api/v1/${endpoint}`
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const config: RequestInit = {
    ...options,
    headers,
  }

  let response: Response
  try {
    response = await fetch(url, config)
  } catch (err: any) {
    throw new ApiError(
      `网络连接失败，请检查网络或后端服务: ${err.message || 'NetworkError'}`,
      10001,
      0
    )
  }

  // 二进制文件流直接返回
  if (response.headers.get('content-type')?.includes('application/pdf')) {
    return response as unknown as T
  }

  let jsonBody: any
  try {
    jsonBody = await response.json()
  } catch {
    throw new ApiError(`服务端响应非有效 JSON (HTTP ${response.status})`, 10002, response.status)
  }

  if (!response.ok || (jsonBody.code && jsonBody.code >= 400)) {
    const errorMsg = jsonBody.message || jsonBody.error || `请求失败 (HTTP ${response.status})`
    const errorCode = jsonBody.code || response.status
    throw new ApiError(errorMsg, errorCode, response.status, jsonBody.details)
  }

  return jsonBody.data !== undefined ? jsonBody.data : jsonBody
}

// ============================================================================
// 岗位与标准 API (Jobs & Criteria)
// ============================================================================

export interface JobItemVO {
  id: string
  title: string
  department: string
  created_at: string
  updated_at: string
  criteria_status: {
    is_ready_for_import: boolean
    confirmed_version: {
      version_id: string
      version_num: number
      confirmed_at: string
      required_count: number
      bonus_count: number
    } | null
    has_active_draft: boolean
    draft_version_num: number | null
    draft_version_id: string | null
  }
  stats: {
    total_batches: number
    total_candidates: number
    pending_review_count: number
  }
}

export interface JobListResponse {
  total: number
  page: number
  page_size: number
  items: JobItemVO[]
}

export interface JobDetailResponse {
  id: string
  title: string
  department: string
  jd_text: string
  current_criteria_version_id: string | null
  current_criteria_version: any | null
  active_draft_version: any | null
  created_at: string
  updated_at: string
}

export interface CreateJobPayload {
  title: string
  department: string
  jd_text: string
  initial_criteria?: any[]
}

export const apiClient = {
  jobs: {
    list: (params: { page?: number; pageSize?: number; department?: string; status?: string; search?: string } = {}) => {
      const q = new URLSearchParams()
      if (params.page) q.append('page', params.page.toString())
      if (params.pageSize) q.append('page_size', params.pageSize.toString())
      if (params.department) q.append('department', params.department)
      if (params.status && params.status !== 'all') q.append('status', params.status)
      if (params.search) q.append('search', params.search)
      const qs = q.toString()
      return request<JobListResponse>(`/api/v1/jobs${qs ? `?${qs}` : ''}`)
    },

    get: (jobId: string) => request<JobDetailResponse>(`/api/v1/jobs/${jobId}`),

    create: (payload: CreateJobPayload) =>
      request<any>('/api/v1/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    extractCriteria: (jobId: string) =>
      request<{ job_id: string; extracted_criteria: any[] }>(`/api/v1/jobs/${jobId}/extract-criteria`, {
        method: 'POST',
      }),

    updateDraft: (jobId: string, payload: { recommendation_rule?: any; criteria: any[] }) =>
      request<any>(`/api/v1/jobs/${jobId}/criteria-draft`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    confirmCriteria: (jobId: string) =>
      request<any>(`/api/v1/jobs/${jobId}/criteria/confirm`, {
        method: 'POST',
      }),
  },

  batches: {
    create: (formData: FormData) =>
      request<BatchCreateVO>('/api/v1/batches', {
        method: 'POST',
        body: formData,
      }),

    get: (batchId: string) => request<BatchDetailVO>(`/api/v1/batches/${batchId}`),

    list: (params: { jobId?: string; page?: number; pageSize?: number } = {}) => {
      const q = new URLSearchParams()
      if (params.jobId) q.append('job_id', params.jobId)
      if (params.page) q.append('page', params.page.toString())
      if (params.pageSize) q.append('page_size', params.pageSize.toString())
      const qs = q.toString()
      return request<any>(`/api/v1/batches${qs ? `?${qs}` : ''}`)
    },

    listItems: (batchId: string, params: { group?: string; decision?: string; page?: number; pageSize?: number } = {}) => {
      const q = new URLSearchParams()
      if (params.group && params.group !== 'all') q.append('group', params.group)
      if (params.decision && params.decision !== 'all') q.append('decision', params.decision)
      if (params.page) q.append('page', params.page.toString())
      if (params.pageSize) q.append('page_size', params.pageSize.toString())
      const qs = q.toString()
      return request<BatchItemListResponseVO>(`/api/v1/batches/${batchId}/items${qs ? `?${qs}` : ''}`)
    },

    createEventSource: (batchId: string, lastEventId?: string): EventSource => {
      const url = new URL(`/api/v1/batches/${batchId}/events`, window.location.origin)
      if (lastEventId) {
        url.searchParams.set('last_event_id', lastEventId)
      }
      return new EventSource(url.toString())
    },

    getMetrics: (batchId: string) =>
      request<BatchMetricsVO>(`/api/v1/batches/${batchId}/metrics`),

    getExportUrl: (batchId: string, format: 'csv' | 'json' = 'csv') =>
      `/api/v1/batches/${batchId}/export?format=${format}`,
  },

  items: {
    get: (itemId: string) => request<CandidateReviewDetailVO>(`/api/v1/screening-items/${itemId}`),

    getPdfUrl: (itemId: string) => `/api/v1/screening-items/${itemId}/pdf`,

    getDecisions: (itemId: string) =>
      request<DecisionVO[]>(`/api/v1/screening-items/${itemId}/decisions`),

    retry: (itemId: string) =>
      request<RetryItemResponseVO>(`/api/v1/screening-items/${itemId}/retry`, {
        method: 'POST',
      }),

    saveDecision: (itemId: string, payload: { decision: 'advance' | 'reject' | 'supplement'; tags?: string[]; notes?: string }) =>
      request<DecisionVO>(`/api/v1/screening-items/${itemId}/decisions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    submitSupplement: (itemId: string, payload: { criterion_id: string; supplement_verdict: 'met' | 'unmet'; supplement_note: string; channel?: string }) =>
      request<SupplementReevaluateResponseVO>(`/api/v1/screening-items/${itemId}/supplement`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
}

// ============================================================================
// 批次与导入 DTO 模型
// ============================================================================

export interface BatchCreateVO {
  batch_id: string
  job_id: string
  criteria_version_id: string
  title: string
  total_files: number
  accepted_count: number
  rejected_count: number
  queued_items: Array<{
    item_id: string
    filename: string
    file_size_bytes: number
    status: string
  }>
  failed_items: Array<{
    item_id: string
    filename: string
    file_size_bytes: number
    status: string
    error_info: {
      code: string
      message: string
      retryable: boolean
    }
  }>
  sse_stream_url: string
  created_at: string
}

export interface BatchDetailVO {
  batch_id: string
  job_id: string
  criteria_version_id: string
  title: string
  total_items: number
  stats: {
    queued: number
    parsing: number
    evaluating: number
    completed: number
    failed: number
  }
  created_at: string
}

// ============================================================================
// 候选人详情、证据穿透与复核 DTO
// ============================================================================

export interface EvidenceVO {
  id: string
  page: number | null
  quote: string
  method: string
}

export interface FindingDetailVO {
  criterion_id: string
  description: string
  kind: 'required' | 'bonus'
  importance: 'high' | 'medium' | 'low'
  constraint: 'strict' | 'flexible' | null
  verdict: 'met' | 'unmet' | 'unknown'
  reason: string
  evidences: EvidenceVO[]
}

export interface EvaluationSnapshotVO {
  id: string
  version: number
  match_score: number | null
  coverage_rate: number
  suggested_group: 'recommended' | 'verification' | 'conflict' | 'other'
  is_rule_calibrated: boolean
  findings: FindingDetailVO[]
  bonus_summary: { met: number; total: number }
  created_at: string
}

export interface DecisionVO {
  id: string
  decision: string
  tags: string[]
  notes: string
  decided_by: string
  supersedes_id: string | null
  created_at: string
}

export interface CandidateReviewDetailVO {
  item_id: string
  batch_id: string
  candidate_name: string | null
  original_filename: string
  pdf_url: string
  status: string
  parse_stage: string
  error_info?: {
    code: string
    message: string
  } | null
  evaluation: EvaluationSnapshotVO | null
  evaluation_history: EvaluationSnapshotVO[]
  decisions_history: DecisionVO[]
}

export interface SupplementReevaluateResponseVO {
  item_id: string
  previous_version: number
  new_evaluation_version: number
  previous_scores: {
    match_score: number | null
    coverage_rate: number
    suggested_group: string
  }
  new_scores: {
    match_score: number | null
    coverage_rate: number
    suggested_group: string
  }
  updated_at: string
}

export interface BatchItemSummaryVO {
  item_id: string
  candidate_name: string | null
  original_filename: string
  status: string
  parse_stage: string
  match_score: number | null
  coverage_rate: number
  suggested_group: string
  latest_decision: DecisionVO | null
  error_info?: any
  updated_at: string
}

export interface BatchItemListResponseVO {
  batch_id: string
  total: number
  page: number
  page_size: number
  items: BatchItemSummaryVO[]
  distribution: {
    recommended: number
    verification: number
    conflict: number
    failed: number
    other: number
  }
}

export interface RetryItemResponseVO {
  item_id: string
  previous_status: string
  new_status: string
  message: string
  retry_stage: string
  retried_at: string
}

export interface AC01MetricsVO {
  hr_worthwhile_count: number
  recommended_or_verified_count: number
  ac01_ratio: number
  is_ac01_passed: boolean
}

export interface BatchMetricsVO {
  batch_id: string
  title: string
  total_items: number
  completed_count: number
  failed_count: number
  processing_count: number
  groups_distribution: Record<string, number>
  decisions_distribution: Record<string, number>
  supplement_resolved_count: number
  average_match_score: number | null
  average_coverage_rate: number
  ac01: AC01MetricsVO
  parse_stages: Record<string, number>
  generated_at: string
}

