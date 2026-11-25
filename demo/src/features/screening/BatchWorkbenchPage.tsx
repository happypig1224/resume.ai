import React, { useState, useMemo, useEffect } from 'react'
import {
  FileText,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowUpRight,
  Loader2,
  CheckCircle2,
  Download,
  BarChart3,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { SuggestedGroup } from '../../domain/types'
import { calculateDerivedScores } from '../../domain/rules'
import { Badge } from '../../components/common/Badge'
import { apiClient, BatchMetricsVO } from '../../api/client'
import { useToast } from '../../components/common/Toast'

interface BatchWorkbenchPageProps {
  onOpenReview: (itemId: string) => void
}

type FilterQueue = 'all' | SuggestedGroup | 'failed'

export const BatchWorkbenchPage: React.FC<BatchWorkbenchPageProps> = ({ onOpenReview }) => {
  const { success: showToastSuccess } = useToast()
  const {
    currentJobId,
    currentBatchId,
    setBatch,
    batches,
    items,
    candidates,
    criteriaVersions,
    evaluations,
    runs,
    decisions,
    retryProcessingRun,
    updateItemFromSSE,
    registerBackendBatch,
    syncBatchItemsFromBackend,
  } = useAppStore()

  const [activeQueue, setActiveQueue] = useState<FilterQueue>('all')
  const [filterOutcome, setFilterOutcome] = useState<string>('all')
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const [sseProgress, setSseProgress] = useState<{
    batch_id?: string
    total: number
    completed: number
    failed: number
    parsing: number
    evaluating: number
    percent: number
  } | null>(null)
  const [sseCompleted, setSseCompleted] = useState<boolean>(false)
  const [degradedItems, setDegradedItems] = useState<Array<{ itemId: string; reason: string }>>([])

  const batchList = useMemo(() => {
    return Object.values(batches).filter((b) => b.jobId === currentJobId)
  }, [batches, currentJobId])

  const currentBatch = batches[currentBatchId] || batchList[0]

  // 当切换批次或挂载时，若为真实后端批次，挂载 SSE 实时流
  useEffect(() => {
    if (!currentBatch?.id) return

    // 核心持久化：实时从 MySQL 数据库加载最新批次候选人数据与评估快照
    apiClient.batches
      .listItems(currentBatch.id)
      .then((res) => {
        if (res?.items) {
          syncBatchItemsFromBackend(currentBatch.id, res.items)
        }
      })
      .catch((err) => {
        console.warn('MySQL listItems fetch fallback:', err)
      })

    // 同步后端批次列表
    if (currentJobId) {
      apiClient.batches
        .list({ jobId: currentJobId })
        .then((res) => {
          if (res?.items) {
            res.items.forEach((b: any) => {
              registerBackendBatch({
                id: b.batch_id,
                name: b.title || `批次 ${b.batch_id.slice(-6)}`,
                jobId: b.job_id,
                criteriaVersionId: b.criteria_version_id,
                totalItems: b.total_items,
              })
            })
          }
        })
        .catch(() => {})
    }

    if (!currentBatch.id.startsWith('batch_')) {
      setSseProgress(null)
      setSseCompleted(false)
      setDegradedItems([])
      return
    }

    let es: EventSource | null = null
    try {
      es = apiClient.batches.createEventSource(currentBatch.id)

      es.addEventListener('progress', (e) => {
        try {
          const data = JSON.parse(e.data)
          setSseProgress(data)
          if (data.percent >= 100 && (data.completed + data.failed) >= data.total) {
            setSseCompleted(true)
          }
        } catch (err) {
          console.error('SSE progress parse error:', err)
        }
      })

      es.addEventListener('item_updated', (e) => {
        try {
          const data = JSON.parse(e.data)
          updateItemFromSSE({
            itemId: data.item_id,
            status: data.status,
            parseStage: data.parse_stage,
            error: data.error,
            derivedScores: data.derived_scores,
          })
        } catch (err) {
          console.error('SSE item_updated parse error:', err)
        }
      })

      es.addEventListener('stage_degraded', (e) => {
        try {
          const data = JSON.parse(e.data)
          setDegradedItems((prev) => [
            ...prev,
            { itemId: data.item_id, reason: data.reason },
          ])
        } catch (err) {
          console.error('SSE stage_degraded parse error:', err)
        }
      })

      es.addEventListener('batch_completed', (e) => {
        try {
          const data = JSON.parse(e.data)
          setSseCompleted(true)
          setSseProgress({
            total: data.total,
            completed: data.success_count,
            failed: data.failed_count,
            parsing: 0,
            evaluating: 0,
            percent: 100,
          })
          es?.close()
        } catch (err) {
          console.error('SSE batch_completed parse error:', err)
        }
      })

      es.onerror = () => {
        es?.close()
      }
    } catch (err) {
      console.warn('Failed to initialize EventSource:', err)
    }

    return () => {
      if (es) {
        es.close()
      }
    }
  }, [currentBatch?.id, currentJobId, registerBackendBatch, updateItemFromSSE])

  const batchItems = useMemo(() => {
    if (!currentBatch) return []
    return Object.values(items).filter((it) => it.batchId === currentBatch.id)
  }, [items, currentBatch])

  const criteriaVersion = currentBatch
    ? criteriaVersions[currentBatch.criteriaVersionId]
    : null
  const criteria = useMemo(() => criteriaVersion?.criteria || [], [criteriaVersion])
  const recommendationRule = criteriaVersion?.recommendationRule

  // 统计队列概况
  const stats = useMemo(() => {
    let completed = 0
    let failed = 0
    let recommended = 0
    let verification = 0
    let conflict = 0

    batchItems.forEach((it) => {
      const run = runs[it.currentRunId]
      if (run?.status === 'completed') {
        completed++
        if (it.currentEvaluationId) {
          const ev = evaluations[it.currentEvaluationId]
          if (ev) {
            const sc = calculateDerivedScores(criteria, ev.findings, recommendationRule)
            if (sc.suggestedGroup === 'recommended') recommended++
            if (sc.suggestedGroup === 'verification') verification++
            if (sc.suggestedGroup === 'conflict') conflict++
          }
        }
      } else if (run?.status === 'failed') {
        failed++
      }
    })

    const finalCompleted = sseProgress
      ? Math.max(completed, sseProgress.completed)
      : completed
    const finalFailed = sseProgress ? Math.max(failed, sseProgress.failed) : failed
    const finalTotal = sseProgress ? sseProgress.total : batchItems.length

    return {
      total: finalTotal,
      completed: finalCompleted,
      failed: finalFailed,
      recommended,
      verification,
      conflict,
    }
  }, [batchItems, runs, evaluations, criteria, recommendationRule, sseProgress])

  // 过滤后的列表
  const displayedItems = useMemo(() => {
    return batchItems.filter((it) => {
      const run = runs[it.currentRunId]

      // 队列分段过滤
      if (activeQueue === 'failed') {
        if (run?.status !== 'failed') return false
      } else if (activeQueue !== 'all') {
        if (run?.status !== 'completed' || !it.currentEvaluationId) return false
        const ev = evaluations[it.currentEvaluationId]
        if (!ev) return false
        const sc = calculateDerivedScores(criteria, ev.findings, recommendationRule)
        if (sc.suggestedGroup !== activeQueue) return false
      }

      // 复核决定过滤
      if (filterOutcome !== 'all') {
        const itemDecisions = Object.values(decisions).filter((d) => d.itemId === it.id)
        const dec = itemDecisions.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0]
        if (filterOutcome === 'unreviewed') {
          if (dec) return false
        } else {
          if (!dec || dec.outcome !== filterOutcome) return false
        }
      }

      return true
    })
  }, [
    batchItems,
    runs,
    activeQueue,
    filterOutcome,
    evaluations,
    criteria,
    decisions,
    recommendationRule,
  ])

  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false)
  const [metricsData, setMetricsData] = useState<BatchMetricsVO | null>(null)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false)

  const handleRetry = async (itemId: string) => {
    setRetryingId(itemId)
    try {
      if (itemId.startsWith('item')) {
        const res = await apiClient.items.retry(itemId).catch(() => null)
        if (res && res.new_status === 'completed') {
          showToastSuccess('候选人异常重试成功，已自愈流转至复核队列！')
          const detail = await apiClient.items.get(itemId).catch(() => null)
          if (detail?.evaluation) {
            updateItemFromSSE({
              itemId: itemId,
              status: 'completed',
              parseStage: detail.parse_stage,
              derivedScores: {
                match_score: detail.evaluation.match_score,
                coverage_rate: detail.evaluation.coverage_rate,
                suggested_group: detail.evaluation.suggested_group,
              },
            })
          }
        }
      }
      retryProcessingRun(itemId)
    } catch (err: any) {
      console.error('Retry failed:', err)
      retryProcessingRun(itemId)
    } finally {
      setTimeout(() => {
        setRetryingId(null)
      }, 500)
    }
  }

  const handleOpenMetrics = async () => {
    if (!currentBatch?.id) return
    setIsMetricsModalOpen(true)
    let fetchedData: BatchMetricsVO | null = null

    if (currentBatch.id.startsWith('batch_') || currentBatch.id === 'batch-1') {
      setIsLoadingMetrics(true)
      try {
        fetchedData = await apiClient.batches.getMetrics(currentBatch.id)
      } catch (err) {
        console.warn('Backend metrics fetch fallback:', err)
      } finally {
        setIsLoadingMetrics(false)
      }
    }

    if (fetchedData) {
      setMetricsData(fetchedData)
    } else {
      // 依据实际批次候选人与复核决定真实计算统计指标（杜绝任何假数据或固化 Mock）
      const completedItems = batchItems.filter((it) => runs[it.currentRunId]?.status === 'completed')
      const scoresList = completedItems
        .map((it) => {
          const ev = it.currentEvaluationId ? evaluations[it.currentEvaluationId] : null
          return ev ? calculateDerivedScores(criteria, ev.findings, recommendationRule) : null
        })
        .filter((sc): sc is NonNullable<typeof sc> => sc !== null)

      const validMatchScores = scoresList.map((sc) => sc.matchScore).filter((s): s is number => s !== null)
      const avgMatch = validMatchScores.length > 0
        ? Math.round((validMatchScores.reduce((a, b) => a + b, 0) / validMatchScores.length) * 10) / 10
        : null

      const avgCoverage = scoresList.length > 0
        ? Math.round((scoresList.reduce((a, b) => a + b.coverageRate, 0) / scoresList.length) * 10) / 10
        : 0

      const decList = Object.values(decisions).filter((d) => batchItems.some((it) => it.id === d.itemId))
      const advanceCount = decList.filter((d: any) => d.outcome === 'advance').length
      const supplementCount = decList.filter((d: any) => d.outcome === 'supplement').length
      const rejectCount = decList.filter((d: any) => d.outcome === 'reject').length

      let worthwhileCount = 0
      let passedCount = 0
      batchItems.forEach((it) => {
        const itemDec = decList.find((d) => d.itemId === it.id)
        if (itemDec?.outcome === 'advance') {
          worthwhileCount++
          const ev = it.currentEvaluationId ? evaluations[it.currentEvaluationId] : null
          if (ev) {
            const sc = calculateDerivedScores(criteria, ev.findings, recommendationRule)
            if (sc.suggestedGroup === 'recommended' || sc.suggestedGroup === 'verification') {
              passedCount++
            }
          }
        }
      })

      const ac01Ratio = worthwhileCount > 0
        ? Math.round((passedCount / worthwhileCount) * 1000) / 10
        : 100.0

      const otherGroupCount = Math.max(
        0,
        stats.total - stats.recommended - stats.verification - stats.conflict - stats.failed
      )

      setMetricsData({
        batch_id: currentBatch.id,
        title: currentBatch.name,
        total_items: stats.total,
        completed_count: stats.completed,
        failed_count: stats.failed,
        processing_count: Math.max(0, stats.total - stats.completed - stats.failed),
        groups_distribution: {
          recommended: stats.recommended,
          verification: stats.verification,
          conflict: stats.conflict,
          other: otherGroupCount,
        },
        decisions_distribution: {
          advance: advanceCount,
          supplement: supplementCount,
          reject: rejectCount,
          pending: Math.max(0, stats.total - decList.length),
        },
        supplement_resolved_count: supplementCount,
        average_match_score: avgMatch,
        average_coverage_rate: avgCoverage,
        ac01: {
          hr_worthwhile_count: worthwhileCount,
          recommended_or_verified_count: passedCount,
          ac01_ratio: ac01Ratio,
          is_ac01_passed: ac01Ratio >= 95,
        },
        parse_stages: { text: stats.completed, ocr: degradedItems.length, multimodal: 0 },
        generated_at: new Date().toISOString(),
      })
    }
  }

  const handleExportCsv = () => {
    if (!currentBatch?.id) return
    if (currentBatch.id.startsWith('batch_') || currentBatch.id === 'batch-1') {
      const url = apiClient.batches.getExportUrl(currentBatch.id, 'csv')
      window.open(url, '_blank')
    } else {
      const rows = [
        ['序号', '候选人姓名', '原始文件', '处理状态', '匹配分', '覆盖率', '建议队列', '人工决定'],
        ...displayedItems.map((item: any, idx: number) => {
          const run = runs[item.currentRunId]
          const ev = item.currentEvaluationId ? evaluations[item.currentEvaluationId] : null
          const sc = ev ? calculateDerivedScores(criteria, ev.findings, recommendationRule) : null
          const candidate = candidates[item.candidateId]
          const itemDec = Object.values(decisions)
            .filter((d: any) => d.itemId === item.id)
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          return [
            idx + 1,
            candidate?.displayName || item.candidateName || '未知候选人',
            item.filename || 'resume.pdf',
            run?.status || 'completed',
            sc?.matchScore ?? '暂不评分',
            `${sc?.coverageRate || 0}%`,
            sc?.suggestedGroup || 'other',
            itemDec?.outcome || '未复核',
          ]
        }),
      ]
      const csvContent = '\ufeff' + rows.map((e) => e.join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', `批次导出_${currentBatch.name}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }


  return (
    <div data-testid="workbench-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 头部标题与批次概览 (企业级极简设计) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#0052d9]">
              批次工作台 · P04
            </span>
            <span className="text-xs text-slate-300">/</span>
            {batchList.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">当前批次:</span>
                <select
                  data-testid="batch-selector"
                  value={currentBatch?.id}
                  onChange={(e) => setBatch(e.target.value)}
                  className="text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded px-2 py-0.5 outline-none cursor-pointer hover:border-slate-400"
                >
                  {batchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                {currentBatch?.name || '第 1 批次'}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            候选人初筛
          </h1>
        </div>

        {/* 顶部操作区与统计指标 */}
        <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
          {/* 紧凑指标条 */}
          <div className="bg-white border border-slate-200/90 rounded-md px-3 py-1.5 flex items-center gap-3 text-xs shadow-2xs">
            <div data-testid="stat-all" className="flex items-center gap-1.5">
              <span className="text-slate-400 font-normal">总数</span>
              <span className="font-semibold text-slate-900 tabular-nums">{stats.total}</span>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div data-testid="stat-completed" className="flex items-center gap-1.5">
              <span className="text-slate-400 font-normal">已完成</span>
              <span className="font-semibold text-emerald-600 tabular-nums">{stats.completed}</span>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div data-testid="stat-failed" className="flex items-center gap-1.5">
              <span className="text-slate-400 font-normal">异常</span>
              <span className="font-semibold text-rose-600 tabular-nums">{stats.failed}</span>
            </div>
          </div>

          {/* 统一操作按钮 */}
          <div className="flex items-center gap-1.5">
            <button
              data-testid="btn-batch-metrics"
              onClick={handleOpenMetrics}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 transition-colors cursor-pointer shadow-2xs"
              title="查看批次统计指标"
            >
              <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
              <span>统计大盘</span>
            </button>

            <button
              data-testid="btn-export-csv"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 transition-colors cursor-pointer shadow-2xs"
              title="导出当前批次候选人评估报表"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>导出报表</span>
            </button>
          </div>
        </div>
      </div>

      {/* 实时 SSE 异步流水线流式进度栏 */}
      {sseProgress && (
        <div
          data-testid="sse-progress-banner"
          className="mb-4 bg-white border border-slate-200 rounded p-3.5 shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {sseCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Loader2 className="w-4 h-4 text-[#0052d9] animate-spin" />
              )}
              <span className="text-xs font-semibold text-slate-900">
                {sseCompleted ? '批次处理已完成' : '异步流水线处理中'}
              </span>
              <span className="text-xs text-slate-400">
                ({sseProgress.completed + sseProgress.failed}/{sseProgress.total})
              </span>
            </div>

            <span
              data-testid="sse-percent-text"
              className="text-xs font-bold text-[#0052d9] tabular-nums"
            >
              {sseProgress.percent}%
            </span>
          </div>

          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              data-testid="sse-progress-bar-fill"
              className={`h-full transition-all duration-300 rounded-full ${
                sseCompleted ? 'bg-emerald-500' : 'bg-[#0052d9]'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, sseProgress.percent))}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-500">
            <span>已完成: <strong className="text-emerald-600 font-semibold">{sseProgress.completed}</strong></span>
            {sseProgress.parsing > 0 && (
              <span>提取文本: <strong className="text-slate-800 font-semibold">{sseProgress.parsing}</strong></span>
            )}
            {sseProgress.evaluating > 0 && (
              <span>规则研判: <strong className="text-slate-800 font-semibold">{sseProgress.evaluating}</strong></span>
            )}
            {sseProgress.failed > 0 && (
              <span>异常: <strong className="text-rose-600 font-semibold">{sseProgress.failed}</strong></span>
            )}
          </div>

          {degradedItems.length > 0 && (
            <div
              data-testid="sse-degraded-alert"
              className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>检测到 {degradedItems.length} 份文件已平滑转入 OCR 识别。</span>
            </div>
          )}

          {sseCompleted && (
            <div
              data-testid="batch-completed-banner"
              className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>批次处理已完成，评估结果已就绪。</span>
            </div>
          )}
        </div>
      )}

      {/* 队列分段控制栏 */}
      <div className="mb-4 bg-white border border-slate-200 rounded p-1.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <nav className="flex items-center gap-1 flex-wrap">
          <button
            data-testid="filter-all"
            onClick={() => setActiveQueue('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
              activeQueue === 'all'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            全部候选人 <span className="opacity-70 tabular-nums">({stats.total})</span>
          </button>

          <button
            data-testid="filter-recommended"
            onClick={() => setActiveQueue('recommended')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeQueue === 'recommended'
                ? 'bg-emerald-50 text-emerald-700 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            推荐队列 <span className="opacity-70 tabular-nums">({stats.recommended})</span>
          </button>

          <button
            data-testid="filter-verification"
            onClick={() => setActiveQueue('verification')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeQueue === 'verification'
                ? 'bg-amber-50 text-amber-700 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            待核实队列 <span className="opacity-70 tabular-nums">({stats.verification})</span>
          </button>

          <button
            data-testid="filter-conflict"
            onClick={() => setActiveQueue('conflict')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeQueue === 'conflict'
                ? 'bg-rose-50 text-rose-700 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            条件冲突队列 <span className="opacity-70 tabular-nums">({stats.conflict})</span>
          </button>

          <button
            data-testid="filter-failed"
            onClick={() => setActiveQueue('failed')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeQueue === 'failed'
                ? 'bg-rose-50 text-rose-700 font-semibold'
                : 'text-slate-600 hover:text-rose-600 hover:bg-slate-50'
            }`}
          >
            异常待办 <span className="opacity-70 tabular-nums">({stats.failed})</span>
          </button>
        </nav>

        {/* 右侧：复核状态过滤 */}
        <div className="flex items-center gap-2 pr-1">
          <span className="text-xs text-slate-500 font-medium">状态:</span>
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 outline-none cursor-pointer hover:border-slate-400 font-medium"
          >
            <option value="all">全部</option>
            <option value="unreviewed">未复核</option>
            <option value="advance">已定：推进沟通</option>
            <option value="need_info">已定：待补充信息</option>
            <option value="hold">已定：暂不推进</option>
          </select>
        </div>
      </div>

      {/* 候选人数据表格 (企业级标准 ATS 数据表格) */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        {displayedItems.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Search className="w-8 h-8 text-slate-400 mb-2" />
            <h3 className="font-medium text-slate-800 text-sm">当前队列暂无候选人记录</h3>
            <p className="text-xs text-slate-400 mt-1">
              可切换队列分段或在顶部导入新的候选人简历批次。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-semibold text-slate-600 select-none">
                  <th className="py-3 px-4 w-[280px]">候选人 / 简历原件</th>
                  <th className="py-3 px-4 w-[180px]">已知必要条件匹配分</th>
                  <th className="py-3 px-4 w-[200px]">证据覆盖率 (已知必要项)</th>
                  <th className="py-3 px-4 w-[110px]">加分项</th>
                  <th className="py-3 px-4 w-[200px]">分流队列 / 复核状态</th>
                  <th className="py-3 px-4 text-right pr-6 w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {displayedItems.map((item) => {
                  const cand = candidates[item.candidateId]
                  const run = runs[item.currentRunId]
                  const currentEval = item.currentEvaluationId
                    ? evaluations[item.currentEvaluationId]
                    : null
                  const scores = currentEval
                    ? calculateDerivedScores(criteria, currentEval.findings, recommendationRule)
                    : null

                  const itemDecisions = Object.values(decisions).filter((d) => d.itemId === item.id)
                  const decision = itemDecisions.sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0]

                  const isItemRetrying = retryingId === item.id

                  return (
                    <tr
                      key={item.id}
                      data-testid={`candidate-card-${item.id}`}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* 候选人基本信息 */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-900 text-sm tracking-tight truncate group-hover:text-[#0052d9] transition-colors">
                            {cand?.displayName}
                          </h4>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-normal bg-slate-100 text-slate-600 border border-slate-200/60">
                            {run?.stage === 'ocr'
                              ? 'OCR识别'
                              : run?.stage === 'multimodal'
                              ? '多模态'
                              : '文本解析'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-1 flex items-center gap-1.5 font-normal">
                          <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{cand?.originalFilename}</span>
                        </p>
                      </td>

                      {/* 异常失败信息 */}
                      {run?.status === 'failed' ? (
                        <>
                          <td colSpan={4} className="py-3.5 px-4 align-middle">
                            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-rose-50/80 border border-rose-200 text-xs text-rose-700 max-w-full">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                              <span className="font-semibold whitespace-nowrap shrink-0">解析失败</span>
                              <span className="text-rose-300">·</span>
                              <span className="whitespace-nowrap shrink-0">未生成用于排序的低分</span>
                              <span className="text-rose-500 font-normal truncate max-w-[420px]">
                                （{run?.error?.message || '文件损坏或字符流异常，已转入异常待办'}）
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-middle text-right pr-6">
                            <button
                              data-testid={`btn-retry-${item.id}`}
                              disabled={isItemRetrying}
                              onClick={() => handleRetry(item.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs whitespace-nowrap"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isItemRetrying ? 'animate-spin' : ''}`} />
                              <span>{isItemRetrying ? '重试中...' : '单项重试'}</span>
                            </button>
                          </td>
                        </>
                      ) : (run?.status === 'parsing' || run?.status === 'evaluating') ? (
                        <>
                          <td colSpan={4} className="py-3.5 px-4 align-middle">
                            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-50 text-slate-600 text-xs">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0052d9]" />
                              <span>
                                {run?.status === 'parsing'
                                  ? '正在提取原件文本与版式...'
                                  : '正在进行多维证据核验与规则研判...'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-middle text-right pr-6">
                            <span className="text-xs text-slate-400">处理中</span>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* 匹配分 */}
                          <td className="py-3.5 px-4 align-middle">
                            {scores && scores.matchScore !== null ? (
                              <div className="flex items-baseline gap-1">
                                <span className="text-base font-bold text-slate-900 tabular-nums">
                                  {scores.matchScore}
                                </span>
                                <span className="text-xs text-slate-400">分</span>
                              </div>
                            ) : (
                              <span className="inline-block text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80">
                                证据不足 · 暂不评分
                              </span>
                            )}
                          </td>

                          {/* 证据覆盖率 */}
                          <td className="py-3.5 px-4 align-middle">
                            {scores && (
                              <div className="max-w-[150px]">
                                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                                  <span className="font-semibold text-slate-800 tabular-nums">
                                    {scores.coverageRate}%
                                  </span>
                                  <span className="text-slate-400 tabular-nums">
                                    ({scores.knownRequiredCount}/{scores.totalRequiredCount})
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full bg-[#0052d9] rounded-full transition-all duration-300"
                                    style={{ width: `${scores.coverageRate}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 加分项 */}
                          <td className="py-3.5 px-4 align-middle">
                            {scores && (
                              <span className="text-xs font-medium text-slate-700 tabular-nums">
                                {scores.bonusCount.met}/{scores.bonusCount.total} 项
                              </span>
                            )}
                          </td>

                          {/* 建议分流 / 复核状态 */}
                          <td className="py-3.5 px-4 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {scores && (
                                <Badge
                                  variant={
                                    scores.suggestedGroup === 'recommended'
                                      ? 'success'
                                      : scores.suggestedGroup === 'verification'
                                      ? 'warning'
                                      : scores.suggestedGroup === 'conflict'
                                      ? 'danger'
                                      : 'neutral'
                                  }
                                  size="sm"
                                >
                                  {scores.suggestedGroup === 'recommended'
                                    ? '系统推荐'
                                    : scores.suggestedGroup === 'verification'
                                    ? '待核实'
                                    : scores.suggestedGroup === 'conflict'
                                    ? '条件冲突'
                                    : scores.isRuleCalibrated
                                    ? '普通候选'
                                    : '待配置规则'}
                                </Badge>
                              )}

                              {decision ? (
                                <Badge variant="primary" size="sm">
                                  已定: {decision.outcome === 'advance' ? '推进沟通' : decision.outcome === 'need_info' ? '待补充信息' : '暂不推进'}
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  未复核
                                </Badge>
                              )}
                            </div>
                          </td>

                          {/* 操作 */}
                          <td className="py-3.5 px-4 align-middle text-right pr-6">
                            <button
                              data-testid={`btn-review-${item.id}`}
                              onClick={() => onOpenReview(item.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-[#0052d9] hover:text-[#003cab] hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              <span>进入复核</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 批次全景审计与业务验收指标模态框 (企业级纯净统计大盘) */}
      {isMetricsModalOpen && (
        <div
          data-testid="metrics-modal"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* 模态框头部 */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  批次初筛统计大盘
                </h3>
              </div>

              <button
                data-testid="btn-close-metrics-modal"
                onClick={() => setIsMetricsModalOpen(false)}
                className="w-7 h-7 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 模态框主体 */}
            <div className="p-5 overflow-y-auto space-y-4">
              {isLoadingMetrics ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                  <span className="text-xs text-slate-500">正在聚合统计指标...</span>
                </div>
              ) : metricsData ? (
                <>
                  {/* 核心验收指标 AC-01 */}
                  <div className="bg-slate-50 border border-slate-200 rounded p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800">
                          AC-01 沟通候选人入选率
                        </span>
                        <Badge
                          variant={metricsData.ac01.is_ac01_passed ? 'success' : 'danger'}
                          size="sm"
                        >
                          {metricsData.ac01.is_ac01_passed ? '达标 (≥95%)' : '未达标'}
                        </Badge>
                      </div>
                      <span
                        data-testid="metric-ac01-ratio"
                        className="text-xl font-bold text-slate-900 tabular-nums"
                      >
                        {metricsData.ac01.ac01_ratio}%
                      </span>
                    </div>
                  </div>

                  {/* 4 项核心业务指标 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-slate-200 rounded p-3 text-center">
                      <span className="text-xs text-slate-500 block">待核实补回</span>
                      <span
                        data-testid="metric-supplement-resolved"
                        className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 block"
                      >
                        {metricsData.supplement_resolved_count} 人
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded p-3 text-center">
                      <span className="text-xs text-slate-500 block">平均匹配分</span>
                      <span className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 block">
                        {metricsData.average_match_score !== null
                          ? metricsData.average_match_score
                          : '-'}
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded p-3 text-center">
                      <span className="text-xs text-slate-500 block">平均覆盖率</span>
                      <span className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 block">
                        {metricsData.average_coverage_rate}%
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded p-3 text-center">
                      <span className="text-xs text-slate-500 block">OCR识别数</span>
                      <span className="text-lg font-bold text-slate-900 tabular-nums mt-0.5 block">
                        {metricsData.parse_stages.ocr || 0} 份
                      </span>
                    </div>
                  </div>

                  {/* 队列分流与人工决策对比 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded p-3.5">
                      <span className="text-xs font-semibold text-slate-800 block mb-2.5">
                        系统客观分流
                      </span>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">优先推荐</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.groups_distribution.recommended || 0} 份
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">待核实</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.groups_distribution.verification || 0} 份
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">条件冲突</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.groups_distribution.conflict || 0} 份
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">其他人选</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.groups_distribution.other || 0} 份
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded p-3.5">
                      <span className="text-xs font-semibold text-slate-800 block mb-2.5">
                        HR 人工复核决定
                      </span>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">推进沟通</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.decisions_distribution.advance || 0} 份
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">待补充信息</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.decisions_distribution.supplement || 0} 份
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">暂不推进</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.decisions_distribution.reject || 0} 份
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">未复核</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {metricsData.decisions_distribution.pending || 0} 份
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* 模态框底部 */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                生成时间: {metricsData ? new Date(metricsData.generated_at).toLocaleTimeString() : '-'}
              </span>
              <button
                onClick={() => setIsMetricsModalOpen(false)}
                className="px-3.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
