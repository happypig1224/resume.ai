import { create } from 'zustand'
import {
  Job,
  CriteriaVersion,
  Batch,
  ScreeningItem,
  Candidate,
  Document,
  Evidence,
  Evaluation,
  ProcessingRun,
  ReviewDecision,
  Criterion,
  ReviewOutcome,
  SuggestedGroup,
} from '../domain/types'
import {
  DEFAULT_JOB,
  DEFAULT_CRITERIA_VERSION,
  DEFAULT_BATCH,
  DEFAULT_ITEMS,
  DEFAULT_CANDIDATES,
  DEFAULT_DOCUMENTS,
  DEFAULT_EVIDENCES,
  DEFAULT_EVALUATIONS,
  DEFAULT_RUNS,
  DEFAULT_DECISIONS,
} from '../simulation/defaultData'
import { BatchItemSummaryVO } from '../api/client'

interface AppState {
  // 领域状态
  jobs: Record<string, Job>
  criteriaVersions: Record<string, CriteriaVersion>
  batches: Record<string, Batch>
  items: Record<string, ScreeningItem>
  candidates: Record<string, Candidate>
  documents: Record<string, Document>
  evidences: Record<string, Evidence>
  evaluations: Record<string, Evaluation>
  runs: Record<string, ProcessingRun>
  decisions: Record<string, ReviewDecision>

  // 当前选中上下文
  currentJobId: string
  currentBatchId: string
  activeItemId: string | null

  // 动作
  setJob: (jobId: string) => void
  setBatch: (batchId: string) => void
  setActiveItem: (itemId: string | null) => void

  // 业务动作
  confirmCriteria: (jobId: string, criteria: Criterion[]) => CriteriaVersion
  importBatch: (
    jobId: string,
    criteriaVersionId: string,
    fileNames: string[],
    customBatchId?: string,
    backendItems?: Array<{
      id: string
      filename: string
      status: string
      error?: string
    }>
  ) => string
  updateItemFromSSE: (payload: {
    itemId: string
    status: 'queued' | 'parsing' | 'evaluating' | 'completed' | 'failed'
    parseStage?: string
    error?: any
    derivedScores?: {
      match_score: number | null
      coverage_rate: number
      suggested_group: SuggestedGroup
    }
  }) => void
  registerBackendBatch: (batch: {
    id: string
    name: string
    jobId: string
    criteriaVersionId: string
    totalItems: number
  }) => void
  syncBatchItemsFromBackend: (batchId: string, backendItems: BatchItemSummaryVO[]) => void
  retryProcessingRun: (itemId: string) => void
  saveReviewDecision: (
    itemId: string,
    evaluationId: string,
    outcome: ReviewOutcome,
    reasonTags: string[],
    note: string
  ) => void
  submitSupplement: (
    itemId: string,
    targetCriterionIds: string[],
    supplementText: string,
    targetVerdict: 'met' | 'unmet'
  ) => void
  resetToDefault: () => void
}

const STORAGE_KEY = 'resume_screening_demo_state_v1'

function getInitialState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        jobs: parsed.jobs || { [DEFAULT_JOB.id]: DEFAULT_JOB },
        criteriaVersions: parsed.criteriaVersions || { [DEFAULT_CRITERIA_VERSION.id]: DEFAULT_CRITERIA_VERSION },
        batches: parsed.batches || { [DEFAULT_BATCH.id]: DEFAULT_BATCH },
        items: parsed.items || DEFAULT_ITEMS,
        candidates: parsed.candidates || DEFAULT_CANDIDATES,
        documents: parsed.documents || DEFAULT_DOCUMENTS,
        evidences: parsed.evidences || DEFAULT_EVIDENCES,
        evaluations: parsed.evaluations || DEFAULT_EVALUATIONS,
        runs: parsed.runs || DEFAULT_RUNS,
        decisions: parsed.decisions || DEFAULT_DECISIONS,
        currentJobId: parsed.currentJobId || DEFAULT_JOB.id,
        currentBatchId: parsed.currentBatchId || DEFAULT_BATCH.id,
        activeItemId: null,
      }
    }
  } catch (e) {
    console.warn('Failed to load demo state from localStorage, fallback to default.', e)
  }

  return {
    jobs: { [DEFAULT_JOB.id]: DEFAULT_JOB },
    criteriaVersions: { [DEFAULT_CRITERIA_VERSION.id]: DEFAULT_CRITERIA_VERSION },
    batches: { [DEFAULT_BATCH.id]: DEFAULT_BATCH },
    items: DEFAULT_ITEMS,
    candidates: DEFAULT_CANDIDATES,
    documents: DEFAULT_DOCUMENTS,
    evidences: DEFAULT_EVIDENCES,
    evaluations: DEFAULT_EVALUATIONS,
    runs: DEFAULT_RUNS,
    decisions: DEFAULT_DECISIONS,
    currentJobId: DEFAULT_JOB.id,
    currentBatchId: DEFAULT_BATCH.id,
    activeItemId: null,
  }
}

function extractCandidateName(filename: string): string {
  const nameOnly = filename.replace(/\.(pdf|docx)$/i, '')
  const clean = nameOnly.replace(/^\d+[\.\-_]*/, '').replace(/\([^)]*\)/g, '').trim()
  const parts = clean.split(/[-_\s]+/)
  return parts[0] || nameOnly
}

export const useAppStore = create<AppState>((set, get) => ({
  ...getInitialState(),

  setJob: (jobId) => set({ currentJobId: jobId }),
  setBatch: (batchId) => set({ currentBatchId: batchId }),
  setActiveItem: (itemId) => set({ activeItemId: itemId }),

  confirmCriteria: (jobId, criteria) => {
    const state = get()
    const job = state.jobs[jobId]
    const nextVersionNum = Object.values(state.criteriaVersions).filter((cv) => cv.jobId === jobId).length + 1
    const newVersionId = `crit-v${nextVersionNum}-${Date.now().toString().slice(-4)}`

    const newVersion: CriteriaVersion = {
      id: newVersionId,
      jobId,
      version: nextVersionNum,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      criteria,
    }

    const updatedJob = {
      ...job,
      currentCriteriaVersionId: newVersionId,
    }

    set((s) => {
      const next = {
        ...s,
        jobs: { ...s.jobs, [jobId]: updatedJob },
        criteriaVersions: { ...s.criteriaVersions, [newVersionId]: newVersion },
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })

    return newVersion
  },

  importBatch: (jobId, criteriaVersionId, fileNames, customBatchId, backendItems) => {
    const state = get()
    const batchId = customBatchId || `batch-${Date.now().toString().slice(-4)}`
    const batchName = `第 ${Object.keys(state.batches).length + 1} 批次 (${fileNames.length} 份简历)`

    const newItems: Record<string, ScreeningItem> = {}
    const newCandidates: Record<string, Candidate> = {}
    const newDocs: Record<string, Document> = {}
    const newRuns: Record<string, ProcessingRun> = {}
    const itemIds: string[] = []

    if (backendItems && backendItems.length > 0) {
      backendItems.forEach((bItem, idx) => {
        const itemId = bItem.id
        const candId = `cand-${itemId}`
        const docId = `doc-${itemId}`
        const runId = `run-${itemId}`
        const fname = bItem.filename
        const nameMatch = extractCandidateName(fname) || `候选人${idx + 1}`

        newCandidates[candId] = {
          id: candId,
          displayName: nameMatch,
          originalFilename: fname,
        }

        newDocs[docId] = {
          id: docId,
          candidateId: candId,
          kind: 'resume',
          name: fname,
          mediaType: 'application/pdf',
          sizeBytes: 350000,
          pageCount: 2,
          sourceLabel: '后端流水线导入',
          contentPages: [
            `候选人资料：${fname}\n简历已录入异步流水线。`,
          ],
          createdAt: new Date().toISOString(),
        }

        newRuns[runId] = {
          id: runId,
          itemId,
          attempt: 1,
          status: bItem.status === 'failed' ? 'failed' : 'parsing',
          stage: 'text',
          error: bItem.error
            ? {
                code: 'INVALID_FILE_FORMAT',
                message: bItem.error,
                retryable: false,
              }
            : undefined,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        newItems[itemId] = {
          id: itemId,
          batchId,
          candidateId: candId,
          resumeDocumentId: docId,
          currentEvaluationId: null,
          currentRunId: runId,
        }

        itemIds.push(itemId)
      })
    } else {
      fileNames.forEach((fname, idx) => {
        const itemId = `item-new-${batchId}-${idx + 1}`
        const candId = `cand-new-${batchId}-${idx + 1}`
        const docId = `doc-new-${batchId}-${idx + 1}`
        const runId = `run-new-${batchId}-${idx + 1}`

        const nameMatch = extractCandidateName(fname) || `候选人${idx + 1}`

        newCandidates[candId] = {
          id: candId,
          displayName: nameMatch,
          originalFilename: fname,
        }

        newDocs[docId] = {
          id: docId,
          candidateId: candId,
          kind: 'resume',
          name: fname,
          mediaType: 'application/pdf',
          sizeBytes: 300000 + Math.floor(Math.random() * 200000),
          pageCount: 2,
          sourceLabel: '本地批次导入',
          contentPages: [
            `候选人基础资料 (P1)：\n- 姓名/文件名：${fname}\n- 院校及专业：统招重点院校计算机及相关工程背景。\n- 经验概况：具备扎实工程实践背景，熟悉现代 Web 架构与高可用设计。`,
            `项目实践与工程成果 (P2)：\n- 主导参与核心业务模块交付与线上性能调优。\n- 协同产品与设计高效完成敏捷切片迭代，保障零故障上线。`
          ],
          createdAt: new Date().toISOString(),
        }

        newRuns[runId] = {
          id: runId,
          itemId,
          attempt: 1,
          status: 'parsing',
          stage: 'text',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        newItems[itemId] = {
          id: itemId,
          batchId,
          candidateId: candId,
          resumeDocumentId: docId,
          currentEvaluationId: null,
          currentRunId: runId,
        }

        itemIds.push(itemId)
      })
    }

    const newBatch: Batch = {
      id: batchId,
      name: batchName,
      jobId,
      criteriaVersionId,
      itemIds,
      createdAt: new Date().toISOString(),
    }

    set((s) => {
      const next = {
        ...s,
        batches: { ...s.batches, [batchId]: newBatch },
        items: { ...s.items, ...newItems },
        candidates: { ...s.candidates, ...newCandidates },
        documents: { ...s.documents, ...newDocs },
        runs: { ...s.runs, ...newRuns },
        currentBatchId: batchId,
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })

    // 仅在本地纯仿真（未指定 customBatchId）时执行计时器模拟；后端批次由 SSE 实时流驱动
    if (!customBatchId) {
      setTimeout(() => {
        const currentCriteria = get().criteriaVersions[criteriaVersionId]?.criteria || []
        const resolvedRuns: Record<string, ProcessingRun> = {}
        const resolvedEvals: Record<string, Evaluation> = {}
        const resolvedEvidences: Record<string, Evidence> = {}
        const updatedItems: Record<string, ScreeningItem> = {}

        itemIds.forEach((itemId, idx) => {
          const item = get().items[itemId]
          if (!item) return
          const evalId = `eval-auto-${itemId}`
          const runId = item.currentRunId
          const candName = newCandidates[item.candidateId].displayName

          // 真实业务分布仿真：
          // 0: 全符合(推荐)
          // 1: 关键条件缺失(待核实)
          // 2: 不可放宽门槛不符(条件冲突)
          // 3: 扫描图层损坏(异常待办)
          if (idx === 3) {
            resolvedRuns[runId] = {
              ...get().runs[runId],
              status: 'failed' as const,
              stage: 'ocr' as const,
              error: {
                code: 'parse_ocr_error',
                message: 'OCR 文字层字符置信度低于 30%，未能结构化出工作履历，已隔离流转至异常待办。',
                retryable: true,
              },
              updatedAt: new Date().toISOString(),
            }
            updatedItems[itemId] = {
              ...item,
              currentEvaluationId: null,
            }
            return
          }

          resolvedRuns[runId] = {
            ...get().runs[runId],
            status: 'completed' as const,
            stage: idx % 2 === 0 ? ('text' as const) : ('ocr' as const),
            updatedAt: new Date().toISOString(),
          }

          const evId = `ev-auto-${itemId}`
          resolvedEvidences[evId] = {
            id: evId,
            documentId: item.resumeDocumentId,
            page: 1,
            quote: `${candName}，统招院校毕业，具备全栈开发与高并发微服务工程履历。`,
            method: 'text',
          }

          const findings = currentCriteria.map((c, critIdx) => {
            if (idx === 1 && critIdx === 1) {
              return {
                criterionId: c.id,
                verdict: 'unknown' as const,
                evidenceIds: [],
                reason: `简历中关于 ${c.description} 缺乏明确时限或量化证据支撑，需人工核实。`,
              }
            }
            if (idx === 2 && critIdx === 0 && c.constraint === 'strict') {
              return {
                criterionId: c.id,
                verdict: 'unmet' as const,
                evidenceIds: [evId],
                reason: `简历明确标注学历为成教/专科学历，与不可放宽的统招全日制要求明确冲突。`,
              }
            }
            return {
              criterionId: c.id,
              verdict: 'met' as const,
              evidenceIds: [evId],
              reason: `从简历中提取到充分证据支撑 ${c.description}。`,
            }
          })

          resolvedEvals[evalId] = {
            id: evalId,
            itemId,
            criteriaVersionId,
            documentIds: [item.resumeDocumentId],
            ruleVersion: 'v2.1',
            modelVersion: 'gemini-1.5-pro-preview',
            promptVersion: 'p-resume-eval-v3',
            findings,
            createdAt: new Date().toISOString(),
          }

          updatedItems[itemId] = {
            ...item,
            currentEvaluationId: evalId,
          }
        })

        set((s) => {
          const next = {
            ...s,
            runs: { ...s.runs, ...resolvedRuns },
            evaluations: { ...s.evaluations, ...resolvedEvals },
            evidences: { ...s.evidences, ...resolvedEvidences },
            items: { ...s.items, ...updatedItems },
          }
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
          return next
        })
      }, 1200)
    }

    return batchId
  },

  updateItemFromSSE: (payload) => {
    set((s) => {
      const item = s.items[payload.itemId]
      if (!item) return s

      const run = s.runs[item.currentRunId]
      const updatedRun: ProcessingRun = {
        ...(run || {
          id: `run-${payload.itemId}`,
          itemId: payload.itemId,
          attempt: 1,
          startedAt: new Date().toISOString(),
        }),
        status: payload.status,
        stage: (payload.parseStage as any) || run?.stage || 'text',
        updatedAt: new Date().toISOString(),
        error: payload.error
          ? {
              code: 'PROCESSING_ERROR',
              message:
                typeof payload.error === 'string'
                  ? payload.error
                  : payload.error.message || '处理异常',
              retryable: true,
            }
          : undefined,
      }

      let nextEvaluations = s.evaluations
      let evalId = item.currentEvaluationId
      if (payload.status === 'completed') {
        if (!evalId) {
          evalId = `eval-sse-${payload.itemId}`
        }
        const job = s.jobs[s.currentJobId]
        const cv = job?.currentCriteriaVersionId
          ? s.criteriaVersions[job.currentCriteriaVersionId]
          : null
        const criteria = cv?.criteria || []

        const findings = criteria.map((c) => ({
          criterionId: c.id,
          verdict:
            payload.derivedScores?.suggested_group === 'conflict' &&
            c.constraint === 'strict'
              ? ('unmet' as const)
              : ('met' as const),
          evidenceIds: [`ev-${payload.itemId}`],
          reason: '基于简历原件提取文本核验支撑',
        }))

        nextEvaluations = {
          ...s.evaluations,
          [evalId]: {
            id: evalId,
            itemId: item.id,
            criteriaVersionId: cv?.id || 'crit-v1',
            documentIds: [item.resumeDocumentId],
            ruleVersion: 'v2.1',
            modelVersion: 'gemini-1.5-pro-preview',
            promptVersion: 'p-resume-eval-v3',
            findings,
            createdAt: new Date().toISOString(),
          },
        }
      }

      const updatedItem: ScreeningItem = {
        ...item,
        currentEvaluationId: evalId,
      }

      const next = {
        ...s,
        runs: { ...s.runs, [run?.id || `run-${payload.itemId}`]: updatedRun },
        items: { ...s.items, [item.id]: updatedItem },
        evaluations: nextEvaluations,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  },

  syncBatchItemsFromBackend: (batchId, backendItems) => {
    set((s) => {
      const nextItems = { ...s.items }
      const nextCandidates = { ...s.candidates }
      const nextRuns = { ...s.runs }
      const nextEvaluations = { ...s.evaluations }
      const nextDecisions = { ...s.decisions }

      backendItems.forEach((bItem) => {
        const itemId = bItem.item_id
        const candId = `cand-${itemId}`
        const runId = `run-${itemId}`
        const evalId = `eval-${itemId}`

        nextCandidates[candId] = {
          id: candId,
          displayName: bItem.candidate_name || '候选人',
          originalFilename: bItem.original_filename,
        }

        const runStatus = bItem.status === 'failed' ? 'failed' : 'completed'
        nextRuns[runId] = {
          id: runId,
          itemId,
          status: runStatus as any,
          attemptsCount: 1,
          parseStage: (bItem.parse_stage as any) || 'text',
          createdAt: bItem.updated_at,
          completedAt: bItem.status === 'completed' ? bItem.updated_at : undefined,
          errorMessage: bItem.error_info?.message,
        }

        if (bItem.status === 'completed') {
          const job = s.jobs[s.currentJobId]
          const cv = job?.currentCriteriaVersionId
            ? s.criteriaVersions[job.currentCriteriaVersionId]
            : null
          const criteria = cv?.criteria || []

          if (!nextEvaluations[evalId]) {
            const findings = criteria.map((c) => ({
              criterionId: c.id,
              verdict:
                bItem.suggested_group === 'conflict' && c.constraint === 'strict'
                  ? ('unmet' as const)
                  : ('met' as const),
              evidenceIds: [`ev-${itemId}`],
              reason: '从 MySQL 数据库加载事实研判快照',
            }))
            nextEvaluations[evalId] = {
              id: evalId,
              itemId,
              criteriaVersionId: cv?.id || 'crit-v1',
              documentIds: [`doc-${itemId}`],
              ruleVersion: 'v2.1',
              modelVersion: 'deepseek-chat',
              promptVersion: 'p-resume-eval-v3',
              findings,
              createdAt: bItem.updated_at,
            }
          }
        }

        if (bItem.latest_decision) {
          const dec = bItem.latest_decision
          nextDecisions[dec.id] = {
            id: dec.id,
            itemId,
            evaluationId: evalId,
            outcome: (dec.decision as any) === 'supplement' ? 'need_info' : (dec.decision as any) === 'reject' ? 'hold' : 'advance',
            reasonTags: dec.tags || [],
            note: dec.notes || '',
            createdAt: dec.created_at,
            supersedesId: dec.supersedes_id,
          }
        }

        nextItems[itemId] = {
          id: itemId,
          batchId,
          candidateId: candId,
          resumeDocumentId: `doc-${itemId}`,
          currentRunId: runId,
          currentEvaluationId: bItem.status === 'completed' ? evalId : undefined,
          createdAt: bItem.updated_at,
        }
      })

      const next = {
        ...s,
        items: nextItems,
        candidates: nextCandidates,
        runs: nextRuns,
        evaluations: nextEvaluations,
        decisions: nextDecisions,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  },

  retryProcessingRun: (itemId) => {
    const item = get().items[itemId]
    if (!item) return

    const oldRun = get().runs[item.currentRunId]
    const newRunId = `run-retry-${itemId}-${Date.now().toString().slice(-4)}`
    const newAttempt = (oldRun?.attempt || 1) + 1

    const newRun: ProcessingRun = {
      id: newRunId,
      itemId,
      attempt: newAttempt,
      status: 'parsing',
      stage: 'ocr',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    set((s) => {
      const next = {
        ...s,
        runs: { ...s.runs, [newRunId]: newRun },
        items: {
          ...s.items,
          [itemId]: { ...item, currentRunId: newRunId },
        },
      }
      return next
    })

    // 仿真模拟：1 秒后重试修复成功
    setTimeout(() => {
      const evalId = `eval-retry-${itemId}`
      const evId = `ev-retry-${itemId}`
      const batch = get().batches[item.batchId]
      const criteria = get().criteriaVersions[batch.criteriaVersionId]?.criteria || []

      const fixedEvidence: Evidence = {
        id: evId,
        documentId: item.resumeDocumentId,
        page: 1,
        quote: '重试修复：通过图像增强与自适应对比度，成功提取候选人统招本科学历与 6 年全栈经验。',
        method: 'multimodal',
      }

      const fixedEval: Evaluation = {
        id: evalId,
        itemId,
        criteriaVersionId: batch.criteriaVersionId,
        documentIds: [item.resumeDocumentId],
        ruleVersion: 'v2.1',
        modelVersion: 'gemini-1.5-pro-preview',
        promptVersion: 'p-resume-eval-v3',
        findings: criteria.map((c) => ({
          criterionId: c.id,
          verdict: 'met',
          evidenceIds: [evId],
          reason: '重试解析成功：多模态图像重构后核验匹配。',
        })),
        createdAt: new Date().toISOString(),
        note: '重试修复评估',
      }

      set((s) => {
        const next = {
          ...s,
          evidences: { ...s.evidences, [evId]: fixedEvidence },
          evaluations: { ...s.evaluations, [evalId]: fixedEval },
          runs: {
            ...s.runs,
            [newRunId]: {
              ...newRun,
              status: 'completed' as const,
              stage: 'multimodal' as const,
              updatedAt: new Date().toISOString(),
            },
          },
          items: {
            ...s.items,
            [itemId]: { ...s.items[itemId], currentEvaluationId: evalId },
          },
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
        return next
      })
    }, 1000)
  },

  saveReviewDecision: (itemId, evaluationId, outcome, reasonTags, note) => {
    const state = get()
    // 查找该 item 已有的最后一次决定
    const existingDec = Object.values(state.decisions).find(
      (d) => d.itemId === itemId && !d.supersedesId
    )

    const newDecId = `dec-${Date.now().toString().slice(-6)}`
    const newDecision: ReviewDecision = {
      id: newDecId,
      itemId,
      evaluationId,
      outcome,
      reasonTags,
      note,
      createdAt: new Date().toISOString(),
      supersedesId: existingDec ? existingDec.id : null,
    }

    set((s) => {
      const next = {
        ...s,
        decisions: {
          ...s.decisions,
          [newDecId]: newDecision,
        },
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  },

  submitSupplement: (itemId, targetCriterionIds, supplementText, targetVerdict) => {
    const state = get()
    const item = state.items[itemId]
    if (!item) return

    const candId = item.candidateId
    const batch = state.batches[item.batchId]
    const criteria = state.criteriaVersions[batch.criteriaVersionId]?.criteria || []

    const suppDocId = `doc-supp-${Date.now().toString().slice(-4)}`
    const newDoc: Document = {
      id: suppDocId,
      candidateId: candId,
      kind: 'supplement',
      name: 'HR电话核实与事实补充.txt',
      mediaType: 'text/plain',
      sizeBytes: supplementText.length * 2,
      pageCount: 1,
      sourceLabel: 'HR人工电话沟通确认',
      contentPages: [supplementText],
      createdAt: new Date().toISOString(),
    }

    const suppEvId = `ev-supp-${Date.now().toString().slice(-4)}`
    const newEv: Evidence = {
      id: suppEvId,
      documentId: suppDocId,
      page: 1,
      quote: supplementText,
      method: 'manual',
    }

    const newEvalId = `eval-supp-${Date.now().toString().slice(-4)}`
    const oldEval = item.currentEvaluationId ? state.evaluations[item.currentEvaluationId] : null

    // 严密的针对性更新：仅更新 targetCriterionIds 中的条件
    const updatedFindings = criteria.map((c) => {
      const oldF = oldEval?.findings.find((f) => f.criterionId === c.id)
      const isTargeted = targetCriterionIds.includes(c.id)

      if (!isTargeted) {
        return (
          oldF || {
            criterionId: c.id,
            verdict: 'unknown' as const,
            evidenceIds: [],
            reason: '初评未记录，补充材料未涵盖本项。',
          }
        )
      }

      // 是本次定向补充的目标条件
      return {
        criterionId: c.id,
        verdict: targetVerdict,
        evidenceIds: [suppEvId],
        reason: `结合HR人工补充凭证核实${targetVerdict === 'met' ? '通过' : '明确不符合'}：“${supplementText.slice(0, 60)}...”`,
      }
    })

    const newEval: Evaluation = {
      id: newEvalId,
      itemId,
      criteriaVersionId: batch.criteriaVersionId,
      documentIds: [item.resumeDocumentId, suppDocId],
      ruleVersion: 'v2.1',
      modelVersion: 'gemini-1.5-pro-preview',
      promptVersion: 'p-resume-eval-v3',
      findings: updatedFindings,
      createdAt: new Date().toISOString(),
      note: 'HR人工定向补充凭证后重新评估',
    }

    set((s) => {
      const next = {
        ...s,
        documents: { ...s.documents, [suppDocId]: newDoc },
        evidences: { ...s.evidences, [suppEvId]: newEv },
        evaluations: { ...s.evaluations, [newEvalId]: newEval },
        items: {
          ...s.items,
          [itemId]: { ...item, currentEvaluationId: newEvalId },
        },
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  },

  resetToDefault: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
    set({
      jobs: { [DEFAULT_JOB.id]: DEFAULT_JOB },
      criteriaVersions: { [DEFAULT_CRITERIA_VERSION.id]: DEFAULT_CRITERIA_VERSION },
      batches: { [DEFAULT_BATCH.id]: DEFAULT_BATCH },
      items: DEFAULT_ITEMS,
      candidates: DEFAULT_CANDIDATES,
      documents: DEFAULT_DOCUMENTS,
      evidences: DEFAULT_EVIDENCES,
      evaluations: DEFAULT_EVALUATIONS,
      runs: DEFAULT_RUNS,
      decisions: DEFAULT_DECISIONS,
      currentJobId: DEFAULT_JOB.id,
      currentBatchId: DEFAULT_BATCH.id,
      activeItemId: null,
    })
  },
}))
