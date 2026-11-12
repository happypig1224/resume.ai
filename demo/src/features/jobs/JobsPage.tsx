import React, { useEffect, useState } from 'react'
import {
  Briefcase,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react'
import { apiClient, JobItemVO } from '../../api/client'
import { Badge } from '../../components/common/Badge'
import { useToast } from '../../components/common/Toast'

interface JobsPageProps {
  onSelectJobForCriteria: (jobId: string) => void
  onSelectJobForImport: (jobId: string) => void
}

export const JobsPage: React.FC<JobsPageProps> = ({
  onSelectJobForCriteria,
  onSelectJobForImport,
}) => {
  const { success: showSuccess } = useToast()
  const [jobs, setJobs] = useState<JobItemVO[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'needs_criteria'>('all')

  // 新建岗位弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newJd, setNewJd] = useState('')
  const [modalSubmitting, setModalSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const fetchJobs = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.jobs.list({
        status: statusFilter,
        search: search.trim() || undefined,
      })
      setJobs(res.items || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || '获取岗位列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [statusFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchJobs()
  }

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError(null)

    if (!newTitle.trim()) {
      setModalError('请输入岗位名称')
      return
    }
    if (!newDept.trim()) {
      setModalError('请输入所属部门')
      return
    }
    if (newJd.trim().length < 10) {
      setModalError('岗位 JD 描述至少需要输入 10 个字符')
      return
    }

    setModalSubmitting(true)
    try {
      await apiClient.jobs.create({
        title: newTitle.trim(),
        department: newDept.trim(),
        jd_text: newJd.trim(),
      })
      showSuccess(`招聘岗位【${newTitle.trim()}】已成功创建！`)
      setIsModalOpen(false)
      setNewTitle('')
      setNewDept('')
      setNewJd('')
      await fetchJobs()
    } catch (err: any) {
      setModalError(err.message || '创建岗位失败')
    } finally {
      setModalSubmitting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 头部标题与新建按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#0052d9]">
              岗位管理 · P01
            </span>
            <span className="text-xs text-[#86909c]">/</span>
            <span className="text-xs text-[#86909c]">共 {total} 个岗位</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#181818]">
            招聘岗位与标准矩阵
          </h1>
          <p className="text-xs text-[#86909c] mt-1 font-normal">
            管理所有招聘需求、标准冻结版本与批次筛选入口；标准未确认前受保护禁止导入。
          </p>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true)
            setModalError(null)
          }}
          data-testid="btn-open-create-job"
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0052d9] hover:bg-[#003cab] text-white text-sm font-medium rounded shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>新建岗位</span>
        </button>
      </div>

      {/* 搜索与过滤工具栏 */}
      <div className="bg-white rounded border border-[#e5e6eb] p-3.5 mb-6 flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#86909c] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按岗位名称模糊搜索..."
              data-testid="input-search-job"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#f7f8fa] border border-[#dcdfe6] rounded focus:bg-white focus:border-[#0052d9] focus:outline-hidden transition-all text-[#181818]"
            />
          </div>
          <button
            type="submit"
            data-testid="btn-search-job"
            className="px-3 py-1.5 text-xs bg-white hover:bg-[#f2f3f5] border border-[#dcdfe6] text-[#4e5969] rounded transition-colors cursor-pointer"
          >
            搜索
          </button>
        </form>

        <div className="flex items-center gap-1.5 w-full md:w-auto shrink-0">
          <span className="text-xs text-[#86909c] mr-1">就绪度:</span>
          {(['all', 'ready', 'needs_criteria'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              data-testid={`filter-status-${filter}`}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
                statusFilter === filter
                  ? 'bg-[#0052d9] text-white font-medium'
                  : 'bg-[#f2f3f5] text-[#4e5969] hover:bg-[#e5e6eb]'
              }`}
            >
              {filter === 'all' && '全部'}
              {filter === 'ready' && '标准已就绪'}
              {filter === 'needs_criteria' && '待配置标准'}
            </button>
          ))}
        </div>
      </div>

      {/* 错误提示横幅 (支持重试) */}
      {error && (
        <div data-testid="error-banner" className="bg-[#fff2f0] border border-[#ffccc7] rounded p-4 mb-6 flex items-start justify-between gap-3 text-xs text-[#cf1322]">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#f5222d] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">数据加载异常：</span>
              <span>{error}</span>
            </div>
          </div>
          <button
            onClick={fetchJobs}
            data-testid="btn-retry-fetch"
            className="flex items-center gap-1 px-2 py-0.5 bg-white border border-[#ffccc7] hover:bg-[#fff1f0] rounded text-[#cf1322] cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>重试</span>
          </button>
        </div>
      )}

      {/* 岗位卡片网格列表 */}
      {loading ? (
        <div data-testid="loading-state" className="flex items-center justify-center py-20 text-[#86909c] text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0052d9]" />
          <span>正在拉取服务端岗位列表...</span>
        </div>
      ) : jobs.length === 0 ? (
        <div data-testid="empty-state" className="bg-white rounded border border-[#e5e6eb] p-12 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-[#f2f3f5] flex items-center justify-center mx-auto mb-3 text-[#86909c]">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-[#181818] mb-1">暂无符合条件的招聘岗位</h3>
          <p className="text-xs text-[#86909c] mb-4">
            {search ? '未检索到包含该关键词的岗位，请尝试调整搜索条件。' : '当前系统中尚未创建任何招聘岗位，点击下方按钮开始创建。'}
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 text-xs bg-[#0052d9] hover:bg-[#003cab] text-white rounded font-medium cursor-pointer inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>立即创建岗位</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="jobs-grid">
          {jobs.map((j) => (
            <div
              key={j.id}
              data-testid={`job-card-${j.id}`}
              className="bg-white rounded border border-[#e5e6eb] hover:border-[#0052d9] transition-all p-5 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs text-[#86909c] font-normal">{j.department}</span>
                  {j.criteria_status.is_ready_for_import ? (
                    <Badge variant="success" size="sm">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        标准就绪 (v{j.criteria_status.confirmed_version?.version_num}.0)
                      </span>
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        待配置标准
                      </span>
                    </Badge>
                  )}
                </div>

                <h3 className="text-base font-bold text-[#181818] mb-2 leading-snug line-clamp-1" title={j.title}>
                  {j.title}
                </h3>

                <div className="bg-[#f7f8fa] rounded p-2.5 mb-4 text-xs text-[#4e5969] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#86909c]">已确认条件:</span>
                    <span className="font-medium text-[#181818]">
                      {j.criteria_status.confirmed_version
                        ? `${j.criteria_status.confirmed_version.required_count} 必要 · ${j.criteria_status.confirmed_version.bonus_count} 加分`
                        : '未冻结'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86909c]">历史导入批次:</span>
                    <span className="font-medium text-[#181818]">{j.stats.total_batches} 批次</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86909c]">累计已筛人选:</span>
                    <span className="font-medium text-[#181818]">{j.stats.total_candidates} 人</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#f2f3f5] flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectJobForCriteria(j.id)}
                  data-testid={`btn-config-criteria-${j.id}`}
                  className="px-3 py-1.5 text-xs text-[#0052d9] hover:bg-[#f2f3ff] rounded font-medium transition-colors cursor-pointer"
                >
                  配置标准 (P02)
                </button>

                <button
                  onClick={() => onSelectJobForImport(j.id)}
                  disabled={!j.criteria_status.is_ready_for_import}
                  data-testid={`btn-import-batch-${j.id}`}
                  title={!j.criteria_status.is_ready_for_import ? '必须先完成标准配置与冻结才能导入' : '进入批次导入'}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors cursor-pointer ${
                    j.criteria_status.is_ready_for_import
                      ? 'bg-[#0052d9] hover:bg-[#003cab] text-white shadow-xs'
                      : 'bg-[#f2f3f5] text-[#c9cdd4] cursor-not-allowed'
                  }`}
                >
                  <span>批次导入 (P03)</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建岗位 Modal */}
      {isModalOpen && (
        <div
          data-testid="modal-create-job"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-lg shadow-xl border border-[#e5e6eb] max-w-xl w-full p-6 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[#e5e6eb] mb-4">
              <h3 className="text-base font-bold text-[#181818]">新建招聘岗位</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#86909c] hover:text-[#181818] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div
                data-testid="modal-error-alert"
                className="bg-[#fff2f0] border border-[#ffccc7] rounded p-3 mb-4 text-xs text-[#cf1322] flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#f5222d]" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4e5969] mb-1">
                  岗位名称 <span className="text-[#f5222d]">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：资深后端架构师 (Python/FastAPI)"
                  data-testid="input-job-title"
                  className="w-full px-3 py-1.5 text-xs border border-[#dcdfe6] rounded focus:border-[#0052d9] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4e5969] mb-1">
                  所属部门 <span className="text-[#f5222d]">*</span>
                </label>
                <input
                  type="text"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  placeholder="例如：基础架构平台部"
                  data-testid="input-job-dept"
                  className="w-full px-3 py-1.5 text-xs border border-[#dcdfe6] rounded focus:border-[#0052d9] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4e5969] mb-1">
                  岗位 JD 正文描述 <span className="text-[#f5222d]">*</span>
                </label>
                <textarea
                  rows={6}
                  value={newJd}
                  onChange={(e) => setNewJd(e.target.value)}
                  placeholder="粘贴完整的岗位职责与任职要求，后续 AI 引擎将自动基于此提炼判定条件（至少10个字符）..."
                  data-testid="textarea-job-jd"
                  className="w-full px-3 py-1.5 text-xs border border-[#dcdfe6] rounded focus:border-[#0052d9] focus:outline-hidden font-mono"
                />
              </div>

              <div className="pt-3 border-t border-[#f2f3f5] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  data-testid="btn-cancel-create-job"
                  className="px-3 py-1.5 text-xs text-[#4e5969] hover:bg-[#f2f3f5] rounded cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  data-testid="btn-submit-create-job"
                  className="px-4 py-1.5 text-xs bg-[#0052d9] hover:bg-[#003cab] disabled:bg-[#86909c] text-white rounded font-medium cursor-pointer flex items-center gap-1"
                >
                  {modalSubmitting ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>正在创建...</span>
                    </>
                  ) : (
                    <span>确认创建</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
