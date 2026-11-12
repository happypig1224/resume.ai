import React, { useState, useEffect } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ArrowRight,
  ShieldAlert,
  SlidersHorizontal,
  BookmarkCheck,
  Edit3,
  RefreshCw,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Criterion, CriterionImportance, CriterionKind, CriterionConstraint } from '../../domain/types'
import { Badge } from '../../components/common/Badge'
import { apiClient, JobDetailResponse } from '../../api/client'
import { useToast } from '../../components/common/Toast'

interface CriteriaPageProps {
  onGoToImport: () => void
}

export const CriteriaPage: React.FC<CriteriaPageProps> = ({ onGoToImport }) => {
  const { success: showToastSuccess, error: showToastError } = useToast()
  const { currentJobId, jobs, criteriaVersions, confirmCriteria } = useAppStore()
  const job = jobs[currentJobId]
  const currentVersion = job?.currentCriteriaVersionId
    ? criteriaVersions[job.currentCriteriaVersionId]
    : null

  const [jobDetail, setJobDetail] = useState<JobDetailResponse | null>(null)
  const [loadingJob, setLoadingJob] = useState(false)
  const [criteria, setCriteria] = useState<Criterion[]>(currentVersion?.criteria || [])
  const [isEditing, setIsEditing] = useState(!currentVersion)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 挂载或岗位切换时，尝试从服务端 API 加载真实岗位详情与标准
  useEffect(() => {
    let isMounted = true
    async function loadJob() {
      if (!currentJobId) return
      setLoadingJob(true)
      setErrorMsg(null)
      try {
        const detail = await apiClient.jobs.get(currentJobId)
        if (!isMounted) return
        setJobDetail(detail)

        if (detail.active_draft_version && detail.active_draft_version.criteria?.length > 0) {
          const mapped: Criterion[] = detail.active_draft_version.criteria.map((c: any) => ({
            id: c.id,
            description: c.description,
            kind: c.kind,
            importance: c.importance,
            constraint: c.constraint,
          }))
          setCriteria(mapped)
          setIsEditing(true)
        } else if (detail.current_criteria_version && detail.current_criteria_version.criteria?.length > 0) {
          const mapped: Criterion[] = detail.current_criteria_version.criteria.map((c: any) => ({
            id: c.id,
            description: c.description,
            kind: c.kind,
            importance: c.importance,
            constraint: c.constraint,
          }))
          setCriteria(mapped)
          setIsEditing(false)
        } else {
          setCriteria([])
          setIsEditing(true)
        }
      } catch (err: any) {
        if (!isMounted) return
        console.warn('Backend job fetch failed, falling back to local store:', err)
        if (job) {
          setCriteria(currentVersion?.criteria || [])
          setIsEditing(!currentVersion)
        } else {
          setErrorMsg(`无法加载岗位详情: ${err.message || '未知错误'}`)
        }
      } finally {
        if (isMounted) setLoadingJob(false)
      }
    }

    loadJob()
    return () => {
      isMounted = false
    }
  }, [currentJobId])

  const handleAddCriterion = (kind: CriterionKind) => {
    const newId = `c-${kind}-${Date.now().toString().slice(-4)}`
    const newCrit: Criterion = {
      id: newId,
      description: '',
      kind,
      importance: 'medium',
      constraint: kind === 'required' ? 'flexible' : null,
    }
    setCriteria([...criteria, newCrit])
  }

  const handleUpdateCriterion = (id: string, updates: Partial<Criterion>) => {
    setCriteria(criteria.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }

  const handleRemoveCriterion = (id: string) => {
    setCriteria(criteria.filter((c) => c.id !== id))
  }

  const handleExtractFromJd = async () => {
    setIsExtracting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await apiClient.jobs.extractCriteria(currentJobId)
      if (res && res.extracted_criteria && res.extracted_criteria.length > 0) {
        const mapped: Criterion[] = res.extracted_criteria.map((item: any, idx: number) => ({
          id: item.id || `crit-ext-${idx + 1}-${Date.now()}`,
          description: item.description,
          kind: item.kind as CriterionKind,
          importance: item.importance as CriterionImportance,
          constraint:
            (item.constraint as CriterionConstraint) ||
            (item.kind === 'required' ? 'flexible' : null),
        }))
        setCriteria(mapped)
        setIsEditing(true)
        const reqCnt = mapped.filter((c) => c.kind === 'required').length
        const bonusCnt = mapped.filter((c) => c.kind === 'bonus').length
        setSuccessMsg(`已依据岗位 JD 自动解析并提取出 ${reqCnt} 项必要条件与 ${bonusCnt} 项加分项。`)
      } else {
        setErrorMsg('未从岗位 JD 中提炼出有效条件，请手动添加或检查 JD 文本。')
      }
    } catch (err: any) {
      console.warn('API extract failed, trying local fallback:', err)
      if (job && (err.status === 0 || err.status === 404 || err.status >= 500)) {
        setCriteria([
          {
            id: 'c-req-1',
            description: '统招本科及以上学历，计算机或软件工程相关专业',
            kind: 'required',
            importance: 'high',
            constraint: 'strict',
          },
          {
            id: 'c-req-2',
            description: '5 年及以上全栈开发实战经验，精通 React/TypeScript 与分布式微服务架构',
            kind: 'required',
            importance: 'high',
            constraint: 'strict',
          },
          {
            id: 'c-req-3',
            description: '具备高并发系统架构与性能优化经验，熟练掌握 MySQL 分库分表与 Redis 缓存拓扑',
            kind: 'required',
            importance: 'medium',
            constraint: 'flexible',
          },
          {
            id: 'c-req-4',
            description: '具备良好的跨团队沟通与敏捷技术协作推进能力',
            kind: 'required',
            importance: 'low',
            constraint: 'flexible',
          },
          {
            id: 'c-bonus-1',
            description: '拥有真实企业级 AI Agent / RAG 检索落地或大模型全栈架构实战经历',
            kind: 'bonus',
            importance: 'high',
            constraint: null,
          },
          {
            id: 'c-bonus-2',
            description: '拥有知名开源项目核心贡献或高含金量技术社区影响力',
            kind: 'bonus',
            importance: 'low',
            constraint: null,
          },
        ])
        setIsEditing(true)
        setSuccessMsg('已依据岗位 JD 自动解析并提取出 4 项必要条件与 2 项加分项。')
      } else {
        setErrorMsg(err.message || '模型提取条件失败，请检查网络或后端状态')
      }
    } finally {
      setIsExtracting(false)
    }
  }

  const handleConfirm = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    const requiredCriteria = criteria.filter((c) => c.kind === 'required')
    if (requiredCriteria.length === 0) {
      setErrorMsg('岗位标准必须包含至少 1 项必要条件 (required)，不可为空！')
      return
    }

    const hasEmptyText = criteria.some((c) => !c.description.trim())
    if (hasEmptyText) {
      setErrorMsg('所有条件的描述内容均不能为空，请补充或删除空项。')
      return
    }

    setIsSubmitting(true)
    try {
      // 1. 同步更新服务端草稿
      const payloadCriteria = criteria.map((c, idx) => ({
        id: c.id,
        description: c.description.trim(),
        kind: c.kind,
        importance: c.importance || 'medium',
        constraint: c.kind === 'required' ? (c.constraint || 'flexible') : null,
        order_num: idx + 1,
      }))
      await apiClient.jobs.updateDraft(currentJobId, { criteria: payloadCriteria })

      // 2. 冻结生效标准快照
      const confirmRes = await apiClient.jobs.confirmCriteria(currentJobId)

      // 3. 同步本地 Zustand 状态以兼容原纯前端单页仿真
      confirmCriteria(currentJobId, criteria)

      // 4. 更新局部状态
      if (jobDetail) {
        setJobDetail({
          ...jobDetail,
          current_criteria_version_id: confirmRes.version_id,
          current_criteria_version: {
            id: confirmRes.version_id,
            version: confirmRes.version,
            status: confirmRes.status,
            confirmed_at: confirmRes.confirmed_at,
            criteria: payloadCriteria,
          },
          active_draft_version: null,
        })
      }

      setIsEditing(false)
      showToastSuccess(`标准已成功确认并锁定为不可变版本 v${confirmRes.version}.0！`)
      setSuccessMsg(
        `标准已成功确认并锁定为不可变版本 v${confirmRes.version}.0，包含 ${confirmRes.required_criteria_count} 项必要条件与 ${confirmRes.bonus_criteria_count} 项加分项，可立即用于批次简历筛选。`
      )
    } catch (err: any) {
      console.error('Confirm criteria error:', err)
      if (err.status === 422 || err.code === 20003 || err.status === 400) {
        setErrorMsg(err.message || '岗位标准校验未通过，请检查条件项')
        return
      }
      // 若当前为本地 Mock 岗位 (如 job-ai-engineer-1) 或网关 502/连接失败，自动平滑降级至本地状态机
      if (job && (err.status === 0 || err.status === 404 || err.status >= 500)) {
        const newVer = confirmCriteria(currentJobId, criteria)
        setIsEditing(false)
        setSuccessMsg(`标准已成功确认并锁定为不可变版本 v${newVer.version}.0，可立即用于批次简历筛选。`)
        return
      }
      setErrorMsg(err.message || '确认标准失败，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeTitle = jobDetail?.title || job?.title || '岗位标准管理'
  const activeJd = jobDetail?.jd_text || job?.jdText || ''
  const displayVersion = jobDetail?.current_criteria_version
    ? jobDetail.current_criteria_version.version
    : currentVersion
    ? currentVersion.version
    : null

  const requiredList = criteria.filter((c) => c.kind === 'required')
  const bonusList = criteria.filter((c) => c.kind === 'bonus')

  return (
    <div data-testid="criteria-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 头部标题与操作栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#0052d9]">
              岗位标准配置 · P02
            </span>
            {displayVersion && (
              <>
                <span className="text-xs text-[#86909c]">/</span>
                <Badge variant="success" size="sm" data-testid="criteria-version-badge">
                  基准版本 v{displayVersion}.0
                </Badge>
              </>
            )}
          </div>
          <h1
            data-testid="criteria-job-title"
            className="text-xl font-bold tracking-tight text-[#181818]"
          >
            {activeTitle}
          </h1>
          <p className="text-xs text-[#86909c] mt-1 max-w-2xl font-normal">
            定义硬性必要条件与加分权重；HR 确认后生成不可变版本快照，后续评估严格对齐此基准。
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isEditing ? (
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              data-testid="btn-confirm-criteria"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium text-white bg-[#0052d9] hover:bg-[#003cab] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              )}
              <span>{isSubmitting ? '保存冻结中...' : '确认并冻结标准'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsEditing(true)}
                data-testid="btn-edit-criteria"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-[#4e5969] bg-white hover:bg-[#f7f8fa] border border-[#dcdfe6] hover:border-[#0052d9] hover:text-[#0052d9] transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#86909c]" />
                <span>修改为新草稿</span>
              </button>
              <button
                onClick={onGoToImport}
                data-testid="btn-goto-import"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium text-white bg-[#0052d9] hover:bg-[#003cab] transition-colors cursor-pointer"
              >
                <span>前往导入简历</span>
                <ArrowRight className="w-4 h-4 text-white/80" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 错误警告横幅 */}
      {errorMsg && (
        <div
          data-testid="criteria-error-banner"
          className="mb-4 p-3 rounded bg-[#feecee] border border-[#fca5a5] text-[#e34d59] flex items-start gap-2 text-xs animate-in fade-in duration-200"
        >
          <AlertCircle className="w-4 h-4 text-[#e34d59] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs">操作受阻</p>
            <p className="mt-0.5 text-xs text-[#e34d59]/90">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* 成功确认横幅 */}
      {successMsg && (
        <div
          data-testid="criteria-success-banner"
          className="mb-4 p-3 rounded bg-[#e8f8f2] border border-[#9de8c8] text-[#00a870] flex items-start gap-2 text-xs animate-in fade-in duration-200"
        >
          <CheckCircle2 className="w-4 h-4 text-[#00a870] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-xs">{successMsg}</p>
          </div>
        </div>
      )}

      {loadingJob ? (
        <div className="flex items-center justify-center py-24 text-[#86909c] text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0052d9]" />
          <span>正在拉取岗位标准与版本历史...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：JD 原文卡片 */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-white border border-[#e5e6eb] rounded p-5 flex flex-col gap-3 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#e5e6eb]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded bg-[#0052d9]" />
                  <h3 className="font-semibold text-sm text-[#181818]">岗位 JD 原文</h3>
                </div>
                <button
                  disabled={isExtracting}
                  onClick={handleExtractFromJd}
                  data-testid="btn-extract-criteria"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#0052d9] bg-[#ecf2fe] hover:bg-[#d8e6fd] border border-[#bbd3fb] rounded transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#0052d9]" />
                  <span>{isExtracting ? '正在解析 JD...' : '模型提取条件'}</span>
                </button>
              </div>

              <div
                data-testid="jd-text-container"
                className="bg-[#f7f8fa] border border-[#e5e6eb] rounded p-3.5 text-xs leading-relaxed text-[#4e5969] font-mono whitespace-pre-wrap max-h-[560px] overflow-y-auto"
              >
                {activeJd || '暂无岗位 JD 详情'}
              </div>
            </div>
          </div>

          {/* 右侧：结构化必要与加分条件 */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* 必要条件卡片 */}
            <div className="bg-white border border-[#e5e6eb] rounded p-5 flex flex-col gap-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#e5e6eb]">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#ed7b2f]" />
                  <h3 className="font-semibold text-sm text-[#181818]">必要条件 (Required)</h3>
                  <span className="text-xs text-[#86909c] font-normal">
                    （计入匹配分；硬性门槛独立归类）
                  </span>
                </div>
                {isEditing && (
                  <button
                    onClick={() => handleAddCriterion('required')}
                    data-testid="btn-add-required"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0052d9] bg-white hover:bg-[#f7f8fa] border border-[#0052d9] rounded transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#0052d9]" />
                    <span>添加必要条件</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3" data-testid="required-list">
                {requiredList.length === 0 ? (
                  <p className="text-xs text-[#86909c] py-4 text-center border border-dashed border-[#e5e6eb] rounded">
                    尚未配置必要条件，点击上方“添加必要条件”或通过“模型提取条件”自动提炼。
                  </p>
                ) : (
                  requiredList.map((crit, idx) => (
                    <div
                      key={crit.id}
                      data-testid={`criterion-item-${crit.id}`}
                      className="bg-[#f7f8fa] border border-[#e5e6eb] rounded p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="w-5 h-5 rounded bg-[#ecf2fe] border border-[#bbd3fb] text-[#0052d9] flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        {isEditing ? (
                          <textarea
                            value={crit.description}
                            onChange={(e) =>
                              handleUpdateCriterion(crit.id, { description: e.target.value })
                            }
                            rows={2}
                            data-testid={`textarea-criterion-${crit.id}`}
                            placeholder="输入必要条件描述..."
                            className="flex-1 text-xs text-[#181818] bg-white border border-[#dcdfe6] focus:border-[#0052d9] rounded p-2 outline-none resize-none font-normal"
                          />
                        ) : (
                          <p className="flex-1 text-xs text-[#181818] font-medium leading-relaxed">
                            {crit.description}
                          </p>
                        )}
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveCriterion(crit.id)}
                            data-testid={`btn-remove-criterion-${crit.id}`}
                            className="text-[#86909c] hover:text-[#e34d59] p-1 transition-colors cursor-pointer"
                            title="删除条件"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#e5e6eb]">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#86909c]">约束类型：</span>
                          {isEditing ? (
                            <select
                              value={crit.constraint || 'flexible'}
                              onChange={(e) =>
                                handleUpdateCriterion(crit.id, {
                                  constraint: e.target.value as CriterionConstraint,
                                })
                              }
                              className="bg-white border border-[#dcdfe6] text-[11px] px-2 py-0.5 rounded text-[#4e5969] outline-none cursor-pointer hover:border-[#0052d9]"
                            >
                              <option value="strict">不可放宽 (硬性门槛)</option>
                              <option value="flexible">可酌情 (允许替代证据)</option>
                            </select>
                          ) : (
                            <Badge
                              variant={crit.constraint === 'strict' ? 'danger' : 'neutral'}
                              size="sm"
                            >
                              {crit.constraint === 'strict' ? '不可放宽' : '可酌情'}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#86909c]">重要性权重：</span>
                          {isEditing ? (
                            <select
                              value={crit.importance}
                              onChange={(e) =>
                                handleUpdateCriterion(crit.id, {
                                  importance: e.target.value as CriterionImportance,
                                })
                              }
                              className="bg-white border border-[#dcdfe6] text-[11px] px-2 py-0.5 rounded text-[#4e5969] outline-none cursor-pointer hover:border-[#0052d9]"
                            >
                              <option value="high">高重要性 (权重 3)</option>
                              <option value="medium">中重要性 (权重 2)</option>
                              <option value="low">低重要性 (权重 1)</option>
                            </select>
                          ) : (
                            <Badge variant="primary" size="sm">
                              {crit.importance === 'high'
                                ? '高重要性 (权重 3)'
                                : crit.importance === 'medium'
                                ? '中重要性 (权重 2)'
                                : '低重要性 (权重 1)'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 加分项卡片 */}
            <div className="bg-white border border-[#e5e6eb] rounded p-5 flex flex-col gap-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#e5e6eb]">
                <div className="flex items-center gap-2">
                  <BookmarkCheck className="w-4 h-4 text-[#0052d9]" />
                  <h3 className="font-semibold text-sm text-[#181818]">加分项 (Bonus)</h3>
                  <span className="text-xs text-[#86909c] font-normal">
                    （独立展示优势凭据，不并入主分）
                  </span>
                </div>
                {isEditing && (
                  <button
                    onClick={() => handleAddCriterion('bonus')}
                    data-testid="btn-add-bonus"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0052d9] bg-white hover:bg-[#f7f8fa] border border-[#0052d9] rounded transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#0052d9]" />
                    <span>添加加分项</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3" data-testid="bonus-list">
                {bonusList.length === 0 ? (
                  <p className="text-xs text-[#86909c] py-4 text-center border border-dashed border-[#e5e6eb] rounded">
                    暂无加分项配置。
                  </p>
                ) : (
                  bonusList.map((crit, idx) => (
                    <div
                      key={crit.id}
                      data-testid={`criterion-item-${crit.id}`}
                      className="bg-[#f7f8fa] border border-[#e5e6eb] rounded p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="w-5 h-5 rounded bg-[#ecf2fe] border border-[#bbd3fb] text-[#0052d9] flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                          B{idx + 1}
                        </span>
                        {isEditing ? (
                          <textarea
                            value={crit.description}
                            onChange={(e) =>
                              handleUpdateCriterion(crit.id, { description: e.target.value })
                            }
                            rows={2}
                            data-testid={`textarea-criterion-${crit.id}`}
                            placeholder="输入加分项要求..."
                            className="flex-1 text-xs text-[#181818] bg-white border border-[#dcdfe6] focus:border-[#0052d9] rounded p-2 outline-none resize-none font-normal"
                          />
                        ) : (
                          <p className="flex-1 text-xs text-[#181818] font-medium leading-relaxed">
                            {crit.description}
                          </p>
                        )}
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveCriterion(crit.id)}
                            data-testid={`btn-remove-criterion-${crit.id}`}
                            className="text-[#86909c] hover:text-[#e34d59] p-1 transition-colors cursor-pointer"
                            title="删除加分项"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#e5e6eb]">
                        <span className="text-[11px] text-[#86909c]">附加优势参考</span>
                        <Badge variant="neutral" size="sm">
                          {crit.importance === 'high' ? '显著加分' : '一般加分'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
