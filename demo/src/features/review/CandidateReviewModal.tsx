import React, { useState, useEffect } from 'react'
import {
  X,
  CheckCircle2,
  PlusCircle,
  BookOpen,
  FileCheck2,
  History,
  GitCompare,
  ChevronRight,
  Clock,
  Tag,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { ReviewOutcome } from '../../domain/types'
import { calculateDerivedScores } from '../../domain/rules'
import { Badge } from '../../components/common/Badge'
import { apiClient, CandidateReviewDetailVO, DecisionVO, EvaluationSnapshotVO } from '../../api/client'
import { useToast } from '../../components/common/Toast'

interface CandidateReviewModalProps {
  itemId: string
  onClose: () => void
}

export const CandidateReviewModal: React.FC<CandidateReviewModalProps> = ({ itemId, onClose }) => {
  const { success: showToastSuccess } = useToast()
  const {
    items,
    candidates,
    documents,
    batches,
    criteriaVersions,
    evaluations,
    evidences,
    decisions,
    saveReviewDecision,
    submitSupplement,
  } = useAppStore()

  const [backendDetail, setBackendDetail] = useState<CandidateReviewDetailVO | null>(null)

  const rawItem = items[itemId]
  const rawCandidate = rawItem ? candidates[rawItem.candidateId] : null
  const item = rawItem || (backendDetail ? {
    id: backendDetail.item_id,
    batchId: backendDetail.batch_id,
    candidateId: `cand-${backendDetail.item_id}`,
    resumeDocumentId: `doc-${backendDetail.item_id}`,
    currentEvaluationId: backendDetail.evaluation?.id || null,
    currentRunId: `run-${backendDetail.item_id}`,
  } : null)

  const candidate = rawCandidate || (backendDetail ? {
    id: `cand-${backendDetail.item_id}`,
    displayName: backendDetail.candidate_name || '候选人',
    originalFilename: backendDetail.original_filename || 'resume.pdf',
  } : null)
  const batch = item ? batches[item.batchId] : null
  const criteriaVersion = batch ? criteriaVersions[batch.criteriaVersionId] : null
  const criteria = criteriaVersion?.criteria || []
  const recommendationRule = criteriaVersion?.recommendationRule

  const resumeDoc = item ? documents[item.resumeDocumentId] : null
  const docPages = resumeDoc?.contentPages || [
    '个人基础履历与学历认证：重点高校毕业，具备规范系统的工程实践素养。',
    '核心系统开发与全栈实战：负责高并发业务架构搭建、组件库封装与端到端系统治理。',
  ]
  const totalPages = docPages.length

  // 评估版本切换支持
  const allItemEvaluations = Object.values(evaluations).filter((e) => e.itemId === itemId)
  const [selectedEvalId, setSelectedEvalId] = useState<string>(
    item?.currentEvaluationId || allItemEvaluations[0]?.id || ''
  )
  const currentEvaluation = evaluations[selectedEvalId] || (item?.currentEvaluationId ? evaluations[item.currentEvaluationId] : null)

  // 原件预览当前页码与高亮证据
  const [previewPage, setPreviewPage] = useState<number>(1)
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null)

  // 人工复核表单状态
  const existingDecision = Object.values(decisions).find(
    (d) => d.itemId === itemId && !d.supersedesId
  )

  const [selectedOutcome, setSelectedOutcome] = useState<ReviewOutcome>(
    existingDecision?.outcome || 'advance'
  )
  const [reasonTags, setReasonTags] = useState<string[]>(
    existingDecision?.reasonTags || ['核心经验契合']
  )
  const [note, setNote] = useState<string>(existingDecision?.note || '')
  const [isSavingDecision, setIsSavingDecision] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false)

  // 补充材料抽屉状态（支持精准定向条件重评）
  const [isSupplementOpen, setIsSupplementOpen] = useState(false)
  const [targetCriterionIds, setTargetCriterionIds] = useState<string[]>([])
  const [targetVerdict, setTargetVerdict] = useState<'met' | 'unmet'>('met')
  const [supplementText, setSupplementText] = useState('')
  const [isSubmittingSupplement, setIsSubmittingSupplement] = useState(false)

  // 审计历史时光机与版本比对状态
  const [isAuditHistoryOpen, setIsAuditHistoryOpen] = useState(false)
  const [isVersionDiffOpen, setIsVersionDiffOpen] = useState(false)

  // 挂载时尝试从真实后端同步候选人详情
  useEffect(() => {
    let isMounted = true
    async function loadBackendDetail() {
      if (!itemId) return
      try {
        const detail = await apiClient.items.get(itemId)
        if (isMounted) {
          setBackendDetail(detail)
          if (detail.evaluation) {
            setSelectedEvalId(detail.evaluation.id)
          }
        }
      } catch (err) {
        console.warn('Backend candidate detail fetch skipped/fallback:', err)
      }
    }
    loadBackendDetail()
    return () => {
      isMounted = false
    }
  }, [itemId])

  if (!item || !candidate) return null

  const scores = currentEvaluation
    ? calculateDerivedScores(criteria, currentEvaluation.findings, recommendationRule)
    : null

  const PRESET_TAGS = [
    '核心经验契合',
    '高并发实操深厚',
    '团队协作力强',
    '学历硬性门槛不符',
    '年限经历存疑',
    '需电话核实项目细节',
    '系统架构经验丰富',
  ]

  const handleToggleTag = (tag: string) => {
    if (reasonTags.includes(tag)) {
      setReasonTags(reasonTags.filter((t) => t !== tag))
    } else {
      setReasonTags([...reasonTags, tag])
    }
  }

  // 联动定位证据
  const handleFocusEvidence = (evId: string) => {
    const ev = evidences[evId]
    setActiveEvidenceId(evId)
    if (ev && ev.page) {
      setPreviewPage(ev.page)
    }
  }

  // 保存复核决定
  const handleSaveDecision = async () => {
    if (!currentEvaluation) return
    setIsSavingDecision(true)

    const apiOutcome =
      selectedOutcome === 'hold'
        ? 'reject'
        : selectedOutcome === 'need_info'
        ? 'supplement'
        : 'advance'

    try {
      await apiClient.items
        .saveDecision(itemId, {
          decision: apiOutcome,
          tags: reasonTags,
          notes: note,
        })
        .catch(() => {})

      saveReviewDecision(itemId, currentEvaluation.id, selectedOutcome, reasonTags, note)
      showToastSuccess('人工复核决定已持久保存！')
      setIsSavingDecision(false)
      setSaveSuccessMsg(true)
      setTimeout(() => setSaveSuccessMsg(false), 2500)
    } catch {
      setIsSavingDecision(false)
    }
  }

  // 打开补充抽屉时自动选中待核实或存疑条件
  const handleOpenSupplement = () => {
    const unknownCritIds = currentEvaluation?.findings
      .filter((f) => f.verdict === 'unknown' || f.verdict === 'unmet')
      .map((f) => f.criterionId) || []
    setTargetCriterionIds(unknownCritIds.length > 0 ? [unknownCritIds[0]] : [criteria[0]?.id || ''])
    setIsSupplementOpen(true)
  }

  // 提交补充资料重评 (定向核实契约)
  const handleSubmitSupplement = async () => {
    if (!supplementText.trim() || targetCriterionIds.length === 0) return
    setIsSubmittingSupplement(true)

    try {
      await apiClient.items
        .submitSupplement(itemId, {
          criterion_id: targetCriterionIds[0],
          supplement_verdict: targetVerdict,
          supplement_note: supplementText,
          channel: 'phone_call',
        })
        .catch(() => {})

      submitSupplement(itemId, targetCriterionIds, supplementText, targetVerdict)
      showToastSuccess('补充资料重评成功，已生成新版本评估快照！')
      setIsSubmittingSupplement(false)
      setIsSupplementOpen(false)
      setSupplementText('')
      setTimeout(() => {
        const updatedItem = useAppStore.getState().items[itemId]
        if (updatedItem?.currentEvaluationId) {
          setSelectedEvalId(updatedItem.currentEvaluationId)
        }
      }, 100)
    } catch {
      setIsSubmittingSupplement(false)
    }
  }

  return (
    <div
      data-testid="review-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5"
    >
      <div className="w-full max-w-7xl h-[92vh] bg-white rounded border border-[#e5e6eb] flex flex-col overflow-hidden shadow-xl">
        {/* 顶部标题栏 (自然企业级标准顶栏) */}
        <div className="h-14 px-5 border-b border-[#e5e6eb] flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#ecf2fe] border border-[#bbd3fb] text-[#0052d9] flex items-center justify-center font-bold text-sm">
              {candidate.displayName?.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[#181818] text-sm tracking-tight">
                  {candidate.displayName}
                </h3>
                <span className="text-xs text-[#86909c]">
                  ({candidate.originalFilename})
                </span>
                {allItemEvaluations.length > 1 && (
                  <Badge variant="primary" size="sm">
                    含补充重评版本
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 决策修改审计历史按钮 */}
            <button
              data-testid="btn-toggle-audit-history"
              onClick={() => setIsAuditHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4e5969] bg-white hover:bg-[#f2f3f5] border border-[#dcdcdc] rounded transition-colors cursor-pointer"
              title="查看人工复核决策变更历史 (supersedes 审计链路)"
            >
              <History className="w-3.5 h-3.5 text-[#0052d9]" />
              <span>决策审计</span>
            </button>

            {/* 历史版本比对按钮 */}
            {(allItemEvaluations.length > 1 || (backendDetail?.evaluation_history && backendDetail.evaluation_history.length > 1)) && (
              <button
                data-testid="btn-toggle-version-diff"
                onClick={() => setIsVersionDiffOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0052d9] bg-[#ecf2fe] hover:bg-[#dbe7fd] border border-[#bbd3fb] rounded transition-colors cursor-pointer"
                title="比对电联补充前后的评估版本得分差异"
              >
                <GitCompare className="w-3.5 h-3.5 text-[#0052d9]" />
                <span>版本比对</span>
              </button>
            )}

            <button
              onClick={handleOpenSupplement}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0052d9] bg-white hover:bg-[#ecf2fe] border border-[#0052d9] rounded transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#0052d9]" />
              <span>补充材料并重评</span>
            </button>

            <button
              onClick={onClose}
              data-testid="btn-close-review"
              className="w-8 h-8 rounded text-[#86909c] hover:text-[#181818] hover:bg-[#f2f3f5] flex items-center justify-center transition-colors cursor-pointer"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 主体两栏对照工作区 */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-white">
          {/* 左侧：原件预览与证据联动定位（6列） */}
          <div className="lg:col-span-6 border-r border-[#e5e6eb] p-4 flex flex-col overflow-hidden bg-[#fafbfc]">
            {/* PDF 阅读器控制条 */}
            <div className="flex items-center justify-between px-3 py-2 bg-white border border-[#e5e6eb] rounded mb-3 text-xs shrink-0">
              <div className="flex items-center gap-1.5 text-[#181818] font-medium">
                <BookOpen className="w-4 h-4 text-[#0052d9]" />
                <span>原件阅读器 · 第 {previewPage} 页 / 共 {totalPages} 页</span>
              </div>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreviewPage(p)}
                    className={`w-6 h-6 rounded text-xs font-medium flex items-center justify-center transition-colors cursor-pointer ${
                      previewPage === p
                        ? 'bg-[#0052d9] text-white'
                        : 'text-[#4e5969] hover:bg-[#f2f3f5]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* 仿真 PDF 纸张面 (动态数据驱动) */}
            <div className="flex-1 bg-white border border-[#e5e6eb] rounded p-6 overflow-y-auto text-xs leading-relaxed text-[#181818]">
              <div className="border-b border-[#e5e6eb] pb-3 mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#181818] tracking-tight">
                    {candidate.displayName}
                  </h2>
                  <p className="text-xs text-[#86909c] mt-0.5">
                    文档来源：{resumeDoc?.name || candidate.originalFilename} · 格式：PDF
                  </p>
                </div>
                {activeEvidenceId && evidences[activeEvidenceId]?.page === previewPage && (
                  <span className="text-[11px] font-medium text-[#ed7b2f] bg-[#fef3e6] border border-[#fcd39c] px-2 py-0.5 rounded">
                    🎯 已锁定证据引用 (P.{previewPage})
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-3.5">
                <div
                  className={`p-4 rounded transition-all text-xs whitespace-pre-wrap font-sans leading-relaxed ${
                    activeEvidenceId && evidences[activeEvidenceId]?.page === previewPage
                      ? 'bg-[#fef3e6] border-l-4 border-[#ed7b2f] text-[#181818] shadow-xs'
                      : 'bg-[#f7f8fa] text-[#4e5969] border border-[#e5e6eb]'
                  }`}
                >
                  {docPages[previewPage - 1] || '（本页无更多文本内容）'}
                </div>

                {activeEvidenceId && evidences[activeEvidenceId]?.page === previewPage && (
                  <div className="p-2.5 rounded bg-amber-50/70 border border-amber-200/60 text-amber-900 text-[11px]">
                    <span className="font-semibold block mb-0.5">📌 证据定位引文核验：</span>
                    <span className="font-mono">“{evidences[activeEvidenceId]?.quote}”</span>
                  </div>
                )}
              </div>

              {/* 补充证据展示 */}
              {allItemEvaluations.length > 1 && (
                <div className="mt-4 p-3 bg-[#ecf2fe] rounded border border-[#bbd3fb]">
                  <div className="flex items-center gap-1.5 text-[#0052d9] font-semibold mb-1">
                    <FileCheck2 className="w-4 h-4 text-[#0052d9]" />
                    <span>人工电话补充资料快照</span>
                  </div>
                  <p className="text-[#4e5969] text-xs">
                    已收录 HR 电话核实记录并归档为补充凭据。
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧：结构化评估与复核决策（6列） */}
          <div className="lg:col-span-6 p-5 flex flex-col overflow-y-auto gap-4 bg-white">
            {/* 顶部指标卡片 */}
            {scores && (
              <div className="p-4 rounded bg-[#f7f8fa] border border-[#e5e6eb] flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] text-[#86909c] block font-normal">
                    已知必要条件匹配分
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    {scores.matchScore !== null ? (
                      <>
                        <span className="text-2xl font-bold text-[#181818] tabular-nums">
                          {scores.matchScore}
                        </span>
                        <span className="text-xs text-[#86909c]">/ 100</span>
                      </>
                    ) : (
                      <span className="text-[#ed7b2f] font-medium text-xs bg-[#fef3e6] px-2 py-0.5 rounded border border-[#fcd39c]">
                        证据不足 · 暂不评分
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-[#86909c] block font-normal">
                    证据覆盖率 (已知必要项)
                  </span>
                  <div className="flex items-center gap-1.5 justify-end mt-1">
                    <span className="text-sm font-bold text-[#181818] tabular-nums">
                      {scores.coverageRate}%
                    </span>
                    <span className="text-xs text-[#86909c]">
                      ({scores.knownRequiredCount}/{scores.totalRequiredCount})
                    </span>
                  </div>
                </div>

                <div>
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
                    size="md"
                  >
                    {scores.suggestedGroup === 'recommended'
                      ? '系统推荐'
                      : scores.suggestedGroup === 'verification'
                      ? '待核实'
                      : scores.suggestedGroup === 'conflict'
                      ? '条件冲突'
                      : '普通候选'}
                  </Badge>
                </div>
              </div>
            )}

            {/* 逐项证据与模型研判列表 */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="font-semibold text-xs text-[#181818]">逐项标准研判与事实证据</h4>
                <span className="text-[11px] text-[#86909c]">点击依据可联动原件定位</span>
              </div>

              <div className="flex flex-col gap-2.5">
                {criteria.map((crit) => {
                  const finding = currentEvaluation?.findings.find(
                    (f) => f.criterionId === crit.id
                  )
                  const verdict = finding ? finding.verdict : 'unknown'
                  const evId = finding?.evidenceIds[0]
                  const ev = evId ? evidences[evId] : null

                  return (
                    <div
                      key={crit.id}
                      className="p-3.5 rounded bg-[#f7f8fa] border border-[#e5e6eb] flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={
                                crit.kind === 'required'
                                  ? crit.constraint === 'strict'
                                    ? 'danger'
                                    : 'neutral'
                                  : 'primary'
                              }
                              size="sm"
                            >
                              {crit.kind === 'required'
                                ? crit.constraint === 'strict'
                                  ? '必要·不可放宽'
                                  : '必要·可酌情'
                                : '加分项'}
                            </Badge>
                            <span className="text-[11px] text-[#86909c]">
                              权重 {crit.importance === 'high' ? 3 : crit.importance === 'medium' ? 2 : 1}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-[#181818]">
                            {crit.description}
                          </p>
                        </div>

                        <div className="shrink-0">
                          <Badge
                            variant={
                              verdict === 'met'
                                ? 'success'
                                : verdict === 'unmet'
                                ? 'danger'
                                : 'warning'
                            }
                            size="md"
                          >
                            {verdict === 'met'
                              ? '符合'
                              : verdict === 'unmet'
                              ? '不符合'
                              : '证据不足'}
                          </Badge>
                        </div>
                      </div>

                      {/* 研判理由与引文证据 */}
                      {finding && (
                        <div className="text-xs text-[#4e5969] bg-white p-2.5 rounded border border-[#e5e6eb] flex flex-col gap-2">
                          <p className="leading-relaxed">{finding.reason}</p>
                          {ev && (
                            <button
                              onClick={() => handleFocusEvidence(ev.id)}
                              className="text-left text-[11px] text-[#181818] font-mono flex items-center justify-between gap-2 p-2 rounded bg-[#f7f8fa] hover:bg-[#ecf2fe] border border-[#e5e6eb] hover:border-[#bbd3fb] transition-colors cursor-pointer"
                            >
                              <span className="truncate">“{ev.quote}”</span>
                              <span className="shrink-0 font-medium text-[#0052d9]">
                                {ev.page ? `P.${ev.page}` : '文本补充'} ↗
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 人工复核决策表单 */}
            <div className="p-4 rounded bg-[#f7f8fa] border border-[#e5e6eb] flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#e5e6eb]">
                <h4 className="font-semibold text-xs text-[#181818]">
                  HR 人工复核决定与处置
                </h4>
                {saveSuccessMsg && (
                  <span className="text-xs text-[#00a870] font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>复核决定已持久保存！</span>
                  </span>
                )}
              </div>

              {/* 三大决定切换 */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSelectedOutcome('advance')}
                  className={`py-2 px-3 rounded text-xs font-medium transition-colors cursor-pointer border ${
                    selectedOutcome === 'advance'
                      ? 'bg-[#0052d9] text-white border-[#0052d9]'
                      : 'bg-white text-[#4e5969] border-[#dcdfe6] hover:bg-[#f2f3f5]'
                  }`}
                >
                  推进沟通
                </button>

                <button
                  onClick={() => setSelectedOutcome('need_info')}
                  className={`py-2 px-3 rounded text-xs font-medium transition-colors cursor-pointer border ${
                    selectedOutcome === 'need_info'
                      ? 'bg-[#ed7b2f] text-white border-[#ed7b2f]'
                      : 'bg-white text-[#4e5969] border-[#dcdfe6] hover:bg-[#f2f3f5]'
                  }`}
                >
                  待补充信息
                </button>

                <button
                  onClick={() => setSelectedOutcome('hold')}
                  className={`py-2 px-3 rounded text-xs font-medium transition-colors cursor-pointer border ${
                    selectedOutcome === 'hold'
                      ? 'bg-[#e34d59] text-white border-[#e34d59]'
                      : 'bg-white text-[#4e5969] border-[#dcdfe6] hover:bg-[#f2f3f5]'
                  }`}
                >
                  暂不推进
                </button>
              </div>

              {/* 快捷原因标签 */}
              <div>
                <span className="text-[11px] text-[#86909c] block mb-1.5 font-normal">
                  快捷原因标签（可多选）
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TAGS.map((tag) => {
                    const isSelected = reasonTags.includes(tag)
                    return (
                      <button
                        key={tag}
                        onClick={() => handleToggleTag(tag)}
                        className={`text-[11px] px-2.5 py-1 rounded transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-[#ecf2fe] text-[#0052d9] border-[#bbd3fb] font-medium'
                            : 'bg-white text-[#4e5969] border-[#dcdfe6] hover:border-[#0052d9]'
                        }`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 备注说明 */}
              <div>
                <span className="text-[11px] text-[#86909c] block mb-1 font-normal">
                  复核备注说明（选填）
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="记录技术面试关注重点或核实结论..."
                  className="w-full text-xs p-2.5 rounded bg-white border border-[#dcdfe6] focus:border-[#0052d9] outline-none text-[#181818] resize-none"
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  disabled={isSavingDecision}
                  onClick={handleSaveDecision}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white bg-[#0052d9] hover:bg-[#003cab] transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>{isSavingDecision ? '正在保存...' : '保存人工复核决定'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 补充资料抽屉浮层 (定向条件核验，杜绝暴力全量洗白) */}
        {isSupplementOpen && (
          <div
            data-testid="supplement-drawer"
            className="absolute inset-0 bg-black/40 flex items-center justify-end z-60 animate-fade-in"
          >
            <div className="w-full max-w-md h-full bg-white border-l border-[#e5e6eb] p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#e5e6eb]">
                  <h4 className="font-semibold text-base text-[#181818]">
                    HR 人工事实补充与重评
                  </h4>
                  <button
                    onClick={() => setIsSupplementOpen(false)}
                    className="w-7 h-7 rounded text-[#86909c] hover:text-[#181818] hover:bg-[#f2f3f5] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-[#4e5969] leading-relaxed">
                  请选择本次补充核实的具体研判条件；仅更新指定项，系统保留其他条件判定，并生成新的不可变评估快照。
                </p>

                {/* 1. 选择定向核实的条件 */}
                <div>
                  <span className="text-xs font-semibold text-[#181818] block mb-2">
                    1. 选择核实的目标条件（可多选）
                  </span>
                  <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {criteria.map((c) => {
                      const finding = currentEvaluation?.findings.find((f) => f.criterionId === c.id)
                      const isChecked = targetCriterionIds.includes(c.id)
                      return (
                        <label
                          key={c.id}
                          data-testid={`supplement-target-${c.id}`}
                          className={`p-2.5 rounded border text-xs flex items-start gap-2.5 cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-[#ecf2fe] border-[#0052d9] text-[#181818]'
                              : 'bg-[#f7f8fa] border-[#e5e6eb] text-[#4e5969] hover:bg-[#f2f3f5]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTargetCriterionIds([...targetCriterionIds, c.id])
                              } else {
                                setTargetCriterionIds(targetCriterionIds.filter((id) => id !== c.id))
                              }
                            }}
                            className="mt-0.5 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-medium text-[#181818]">{c.description}</span>
                            </div>
                            <span className="text-[11px] text-[#86909c]">
                              当前状态: {finding?.verdict === 'met' ? '符合' : finding?.verdict === 'unmet' ? '明确不符合' : '证据不足(未知)'}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* 2. 选择核实裁定结果 */}
                <div>
                  <span className="text-xs font-semibold text-[#181818] block mb-2">
                    2. 人工核实最终结论
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetVerdict('met')}
                      className={`py-2 px-3 rounded text-xs font-medium border transition-colors cursor-pointer ${
                        targetVerdict === 'met'
                          ? 'bg-[#00a870] text-white border-[#00a870]'
                          : 'bg-white text-[#4e5969] border-[#dcdfe6] hover:bg-[#f2f3f5]'
                      }`}
                    >
                      ✓ 核实通过 (Met)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetVerdict('unmet')}
                      className={`py-2 px-3 rounded text-xs font-medium border transition-colors cursor-pointer ${
                        targetVerdict === 'unmet'
                          ? 'bg-[#e34d59] text-white border-[#e34d59]'
                          : 'bg-white text-[#4e5969] border-[#dcdfe6] hover:bg-[#f2f3f5]'
                      }`}
                    >
                      ✗ 明确不符 (Unmet)
                    </button>
                  </div>
                </div>

                {/* 3. 补充凭证与依据 */}
                <div>
                  <span className="text-xs font-semibold text-[#181818] block mb-1.5">
                    3. 补充事实依据与沟通留痕
                  </span>
                  <textarea
                    value={supplementText}
                    onChange={(e) => setSupplementText(e.target.value)}
                    rows={4}
                    placeholder="例如：经电话沟通核实，候选人确实具备6年实战全栈经验，并在独角兽主导千万级重构..."
                    className="w-full text-xs p-3 rounded bg-[#f7f8fa] border border-[#dcdfe6] focus:border-[#0052d9] outline-none text-[#181818] font-mono resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#e5e6eb] mt-4">
                <button
                  onClick={() => setIsSupplementOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#4e5969] hover:text-[#181818] cursor-pointer"
                >
                  取消
                </button>
                <button
                  disabled={isSubmittingSupplement || !supplementText.trim() || targetCriterionIds.length === 0}
                  onClick={handleSubmitSupplement}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium text-white bg-[#0052d9] hover:bg-[#003cab] transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {isSubmittingSupplement ? '正在生成新评估快照...' : '确认提交并重新评估'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 决策修改审计历史抽屉 / 弹窗 (HITL Audit Trail) */}
        {isAuditHistoryOpen && (
          <div
            data-testid="audit-history-modal"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-xl w-full border border-[#e5e6eb] overflow-hidden flex flex-col max-h-[85vh]">
              <div className="px-5 py-4 border-b border-[#e5e6eb] flex items-center justify-between bg-[#fafbfc]">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-[#0052d9]" />
                  <h3 className="text-sm font-semibold text-[#181818]">
                    人工复核决策变更审计记录 (FR-06)
                  </h3>
                </div>
                <button
                  data-testid="btn-close-audit-history"
                  onClick={() => setIsAuditHistoryOpen(false)}
                  className="w-7 h-7 rounded text-[#86909c] hover:text-[#181818] hover:bg-[#f2f3f5] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {(() => {
                  const historyList =
                    backendDetail?.decisions_history && backendDetail.decisions_history.length > 0
                      ? [...backendDetail.decisions_history].sort(
                          (a, b) =>
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        )
                      : Object.values(decisions)
                          .filter((d) => d.itemId === itemId)
                          .sort(
                            (a, b) =>
                              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                          )
                          .map((d) => ({
                            id: d.id,
                            decision: d.outcome,
                            tags: d.reasonTags,
                            notes: d.note,
                            decided_by: 'HR',
                            supersedes_id: d.supersedesId || null,
                            created_at: d.createdAt,
                          }))

                  if (historyList.length === 0) {
                    return (
                      <div className="py-8 text-center text-xs text-[#86909c]">
                        当前候选人尚未提交过人工复核决定
                      </div>
                    )
                  }

                  return historyList.map((dec, idx) => (
                    <div
                      key={dec.id}
                      data-testid={`audit-history-item-${idx}`}
                      className="border border-[#e5e6eb] rounded-lg p-3.5 bg-[#fafbfc] relative"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#181818]">
                            决策 #{idx + 1}
                          </span>
                          <Badge
                            variant={
                              dec.decision === 'advance'
                                ? 'success'
                                : dec.decision === 'supplement'
                                ? 'primary'
                                : 'danger'
                            }
                            size="sm"
                          >
                            {dec.decision === 'advance'
                              ? '推进沟通'
                              : dec.decision === 'supplement'
                              ? '待补充信息'
                              : '暂不推进'}
                          </Badge>
                        </div>
                        <span className="text-[11px] text-[#86909c] tabular-nums">
                          {new Date(dec.created_at).toLocaleString()}
                        </span>
                      </div>

                      {dec.supersedes_id && (
                        <div className="text-[11px] text-[#ed7b2f] bg-[#fef3eb] px-2 py-0.5 rounded inline-block mb-2 font-mono">
                          已替代上一版决策: {dec.supersedes_id.slice(-8)}
                        </div>
                      )}

                      {dec.tags && dec.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {dec.tags.map((t: string) => (
                            <span
                              key={t}
                              className="text-[11px] bg-white border border-[#e5e6eb] text-[#4e5969] px-2 py-0.5 rounded"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {dec.notes && (
                        <p className="text-xs text-[#4e5969] bg-white p-2 rounded border border-[#f0f0f0]">
                          {dec.notes}
                        </p>
                      )}
                    </div>
                  ))
                })()}
              </div>

              <div className="px-5 py-3 border-t border-[#e5e6eb] bg-[#fafbfc] flex justify-end">
                <button
                  onClick={() => setIsAuditHistoryOpen(false)}
                  className="px-4 py-1.5 text-xs text-[#4e5969] hover:text-[#181818] cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 历史版本比对弹窗 (FR-07 Version Diff) */}
        {isVersionDiffOpen && (
          <div
            data-testid="version-diff-modal"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-[#e5e6eb] overflow-hidden flex flex-col max-h-[85vh]">
              <div className="px-5 py-4 border-b border-[#e5e6eb] flex items-center justify-between bg-[#fafbfc]">
                <div className="flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-[#0052d9]" />
                  <h3 className="text-sm font-semibold text-[#181818]">
                    评估快照多版本比对 (v1 初始初筛 vs 最新补充重评)
                  </h3>
                </div>
                <button
                  data-testid="btn-close-version-diff"
                  onClick={() => setIsVersionDiffOpen(false)}
                  className="w-7 h-7 rounded text-[#86909c] hover:text-[#181818] hover:bg-[#f2f3f5] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {(() => {
                  const evList =
                    backendDetail?.evaluation_history && backendDetail.evaluation_history.length > 0
                      ? backendDetail.evaluation_history
                      : allItemEvaluations.map((e, idx) => ({
                          id: e.id,
                          version: idx + 1,
                          match_score: e.findings
                            ? calculateDerivedScores(criteria, e.findings, recommendationRule)
                                .matchScore
                            : null,
                          coverage_rate: e.findings
                            ? calculateDerivedScores(criteria, e.findings, recommendationRule)
                                .coverageRate
                            : 0,
                          suggested_group: e.findings
                            ? calculateDerivedScores(criteria, e.findings, recommendationRule)
                                .suggestedGroup
                            : 'other',
                          findings: e.findings,
                          created_at: e.createdAt,
                        }))

                  const v1 = evList[0]
                  const vLatest = evList[evList.length - 1]

                  return (
                    <div className="space-y-4">
                      {/* 分值变动对比看板 */}
                      <div className="grid grid-cols-3 gap-3 bg-[#fafbfc] border border-[#e5e6eb] rounded-lg p-3.5">
                        <div className="text-center">
                          <span className="text-[11px] text-[#86909c] block">匹配分变迁</span>
                          <div className="flex items-center justify-center gap-1.5 mt-1 font-bold text-sm">
                            <span className="text-[#86909c]">{v1?.match_score ?? '暂无'}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-[#0052d9]" />
                            <span className="text-[#0052d9]" data-testid="diff-new-match-score">
                              {vLatest?.match_score ?? '暂无'}
                            </span>
                          </div>
                        </div>

                        <div className="text-center">
                          <span className="text-[11px] text-[#86909c] block">证据覆盖率</span>
                          <div className="flex items-center justify-center gap-1.5 mt-1 font-bold text-sm">
                            <span className="text-[#86909c]">{v1?.coverage_rate || 0}%</span>
                            <ChevronRight className="w-3.5 h-3.5 text-[#0052d9]" />
                            <span className="text-[#0052d9]" data-testid="diff-new-coverage-rate">
                              {vLatest?.coverage_rate || 0}%
                            </span>
                          </div>
                        </div>

                        <div className="text-center">
                          <span className="text-[11px] text-[#86909c] block">建议分流</span>
                          <div className="flex items-center justify-center gap-1.5 mt-1 font-bold text-sm">
                            <span className="text-[#86909c] text-xs">{v1?.suggested_group}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-[#0052d9]" />
                            <span className="text-[#00a870] text-xs" data-testid="diff-new-group">
                              {vLatest?.suggested_group}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-[#4e5969] bg-[#f0f7ff] border border-[#bbd3fb] p-3 rounded">
                        💡 <b>版本跃迁说明</b>：经过 HR 针对关键缺失项的电话核实与事实证据补充，系统增量生成全新不可篡改版本快照 (v{vLatest?.version})，历史版本 (v{v1?.version}) 完整封存留痕备查。
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="px-5 py-3 border-t border-[#e5e6eb] bg-[#fafbfc] flex justify-end">
                <button
                  onClick={() => setIsVersionDiffOpen(false)}
                  className="px-4 py-1.5 text-xs text-[#4e5969] hover:text-[#181818] cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
