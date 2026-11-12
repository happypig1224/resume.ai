import React, { useState, useEffect, useRef } from 'react'
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  FileCheck,
  ArrowRight,
  PlusCircle,
  FolderOpen,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Badge } from '../../components/common/Badge'
import { apiClient, JobDetailResponse } from '../../api/client'
import { useToast } from '../../components/common/Toast'

interface ImportPageProps {
  onGoToWorkbench: () => void
}

interface StagedFile {
  id: string
  name: string
  size: number
  isValid: boolean
  errorReason?: string
  file?: File
}

/**
 * 构造轻量标准合规的合成 PDF 二进制对象，用于快速仿真与联调
 */
function createSyntheticPdfBlob(filename: string): File {
  const safeTitle = filename.replace(/[()\\/]/g, '')
  const dummyPdfContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length 96>> stream
BT
/F1 12 Tf
72 720 Td
(Candidate Resume: ${safeTitle} - Technical Experience and Education) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000056 00000 n 
0000000111 00000 n 
0000000212 00000 n 
0000000280 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
428
%%EOF`
  return new File([dummyPdfContent], filename, { type: 'application/pdf' })
}

export const ImportPage: React.FC<ImportPageProps> = ({ onGoToWorkbench }) => {
  const { success: showToastSuccess } = useToast()
  const { currentJobId, jobs, criteriaVersions, importBatch, setBatch } = useAppStore()
  const localJob = jobs[currentJobId]
  const localVersion = localJob?.currentCriteriaVersionId
    ? criteriaVersions[localJob.currentCriteriaVersionId]
    : null

  const [backendJob, setBackendJob] = useState<JobDetailResponse | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([
    {
      id: 'f-1',
      name: '陈宇航_资深全栈_8年经验.pdf',
      size: 420000,
      isValid: true,
    },
    {
      id: 'f-2',
      name: '宋佳薇_架构专家_候选人.pdf',
      size: 512000,
      isValid: true,
    },
    {
      id: 'f-3',
      name: '王小敏_技术文档.docx',
      size: 154000,
      isValid: false,
      errorReason: '仅支持 PDF 格式文件，暂不支持 .docx 格式',
    },
  ])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // 挂载或当前岗位切换时，尝试从后端同步最新的岗位标准状态
  useEffect(() => {
    let isMounted = true
    async function fetchJobDetail() {
      if (!currentJobId) return
      try {
        const detail = await apiClient.jobs.get(currentJobId)
        if (isMounted) {
          setBackendJob(detail)
        }
      } catch (err) {
        console.warn('Unable to sync job detail from backend, fallback to local store:', err)
      }
    }
    fetchJobDetail()
    return () => {
      isMounted = false
    }
  }, [currentJobId])

  const jobTitle = backendJob?.title || localJob?.title || '目标岗位'
  const jobDepartment = backendJob?.department || localJob?.department || '研发中心'
  const confirmedCriteriaVersionId =
    backendJob?.current_criteria_version_id || localJob?.currentCriteriaVersionId
  const isCriteriaConfirmed = Boolean(confirmedCriteriaVersionId)
  const criteriaCount =
    backendJob?.current_criteria_version?.criteria?.length ??
    localVersion?.criteria?.length ??
    0
  const criteriaVersionNum =
    backendJob?.current_criteria_version?.version_num ??
    localVersion?.version ??
    1

  const handleLoadSampleBatch = () => {
    setGlobalError(null)
    setStagedFiles([
      { id: 'f-s1', name: '孙浩明_全栈工程师_6年.pdf', size: 380000, isValid: true },
      { id: 'f-s2', name: '黄子涵_系统架构师_9年.pdf', size: 640000, isValid: true },
      { id: 'f-s3', name: '刘心怡_前端技术主管_5年.pdf', size: 320000, isValid: true },
      { id: 'f-s4', name: '何天明_资深后端_7年.pdf', size: 450000, isValid: true },
    ])
  }

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setGlobalError(null)

    const newStaged: StagedFile[] = Array.from(files).map((f) => {
      const isPdf = f.name.toLowerCase().endsWith('.pdf')
      const isOverSize = f.size > 20 * 1024 * 1024
      const isValid = isPdf && !isOverSize
      let errorReason: string | undefined
      if (!isPdf) {
        errorReason = '仅支持 PDF 格式文件，暂不支持其他格式'
      } else if (isOverSize) {
        errorReason = '单文件超过 20MB 上限'
      }

      return {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        size: f.size,
        isValid,
        errorReason,
        file: f,
      }
    })

    setStagedFiles((prev) => [...prev, ...newStaged])
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesAdded(e.target.files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    handleFilesAdded(e.dataTransfer.files)
  }

  const handleRemoveFile = (id: string) => {
    setStagedFiles(stagedFiles.filter((f) => f.id !== id))
  }

  const handleClearInvalid = () => {
    setStagedFiles(stagedFiles.filter((f) => f.isValid))
  }

  const handleSubmitBatch = async () => {
    setGlobalError(null)

    if (!isCriteriaConfirmed || !confirmedCriteriaVersionId) {
      setGlobalError('尚未配置并确认岗位标准，无法创建筛选批次！')
      return
    }

    if (stagedFiles.length === 0) {
      setGlobalError('请至少选择一份待筛选的简历文件！')
      return
    }

    const invalidFiles = stagedFiles.filter((f) => !f.isValid)
    if (invalidFiles.length > 0) {
      setGlobalError(`列表中包含 ${invalidFiles.length} 份不合规文件，请移除后再提交！`)
      return
    }

    if (stagedFiles.length > 50) {
      setGlobalError('单批次最大支持 50 份简历，当前数量超限，请分批提交！')
      return
    }

    setIsSubmitting(true)
    const validFiles = stagedFiles.filter((f) => f.isValid)
    const validNames = validFiles.map((f) => f.name)

    try {
      const formData = new FormData()
      formData.append('job_id', currentJobId)
      const batchTitle = `${jobTitle} 筛选批次 (${validFiles.length}份)`
      formData.append('title', batchTitle)

      validFiles.forEach((sf) => {
        const fileObj = sf.file || createSyntheticPdfBlob(sf.name)
        formData.append('files', fileObj, sf.name)
      })

      try {
        const res = await apiClient.batches.create(formData)
        const backendItems = [
          ...res.queued_items.map((q) => ({
            id: q.item_id,
            filename: q.filename,
            status: q.status,
          })),
          ...res.failed_items.map((f) => ({
            id: f.item_id,
            filename: f.filename,
            status: f.status,
            error: f.error_info?.message,
          })),
        ]
        importBatch(
          currentJobId,
          confirmedCriteriaVersionId,
          validNames,
          res.batch_id,
          backendItems
        )
        setBatch(res.batch_id)
        showToastSuccess(`批次导入成功 (${validFiles.length} 份简历)，已创建异步流水线并流转至工作台！`)
      } catch (apiErr: any) {
        if (
          apiErr.status === 400 ||
          apiErr.code === 20002 ||
          apiErr.message?.includes('尚未配置并确认')
        ) {
          setGlobalError(
            apiErr.message || '该岗位尚未配置并确认生效的标准版本，严禁导入简历'
          )
          setIsSubmitting(false)
          return
        }
        console.warn('Backend batch creation failed, using local simulation fallback:', apiErr)
        const localBatchId = importBatch(currentJobId, confirmedCriteriaVersionId, validNames)
        setBatch(localBatchId)
      }

      setIsSubmitting(false)
      onGoToWorkbench()
    } catch (err: any) {
      setIsSubmitting(false)
      setGlobalError(err.message || '创建批次失败，请重试')
    }
  }

  const validCount = stagedFiles.filter((f) => f.isValid).length
  const invalidCount = stagedFiles.filter((f) => !f.isValid).length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <span className="text-xs font-semibold text-[#0052d9]">
          批次导入 · P03
        </span>
        <h1 className="text-xl font-bold tracking-tight text-[#181818] mt-1">
          导入候选人简历批次
        </h1>
        <p className="text-xs text-[#86909c] mt-1 max-w-xl font-normal">
          每批次最多受理 50 份 PDF，导入后自动关联当前已锁定的岗位标准版本快照。
        </p>
      </div>

      {/* 岗位与标准快照信息卡片 */}
      <div className="mb-5 p-4 rounded bg-white border border-[#e5e6eb] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[11px] text-[#86909c] block font-normal">
            绑定的目标岗位与标准快照
          </span>
          <h3 className="font-semibold text-[#181818] text-sm mt-0.5">{jobTitle}</h3>
          <p className="text-xs text-[#4e5969] mt-0.5">
            所属部门：{jobDepartment} · 当前标准快照：
            {isCriteriaConfirmed ? `v${criteriaVersionNum}.0` : '未确认标准'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isCriteriaConfirmed ? (
            <Badge
              variant="success"
              size="sm"
              icon={<CheckCircle2 className="w-3.5 h-3.5 text-[#00a870]" />}
            >
              标准已冻结 (含 {criteriaCount} 项研判条件)
            </Badge>
          ) : (
            <Badge
              variant="danger"
              size="sm"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
            >
              标准未确认
            </Badge>
          )}
        </div>
      </div>

      {globalError && (
        <div className="mb-5 p-3 rounded bg-[#feecee] border border-[#fca5a5] text-[#e34d59] flex items-start gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-[#e34d59] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs">批次校验拦截</p>
            <p className="mt-0.5 text-xs text-[#e34d59]/90">{globalError}</p>
          </div>
        </div>
      )}

      {/* 上传区域 */}
      <div className="bg-white border border-[#e5e6eb] rounded p-6 flex flex-col gap-5 shadow-xs">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx"
          data-testid="file-upload-input"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <div
          data-testid="dropzone-area"
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-[#0052d9] bg-[#ecf2fe]/60'
              : 'border-[#c0c4cc] hover:border-[#0052d9] bg-[#f7f8fa] hover:bg-[#ecf2fe]/40'
          }`}
        >
          <div className="w-12 h-12 rounded bg-[#ecf2fe] text-[#0052d9] flex items-center justify-center mb-2.5 pointer-events-none">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-[#181818] pointer-events-none">
            点击或将 PDF 简历拖拽至此区域
          </p>
          <p className="text-xs text-[#86909c] mt-1 font-normal pointer-events-none">
            单批次上限 50 份 PDF 文件，单个文件大小建议不超过 20MB
          </p>

          <div
            className="mt-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4e5969] bg-white hover:bg-[#f2f3f5] border border-[#dcdfe6] rounded transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#4e5969]" />
              <span>选择本地文件</span>
            </button>
            <button
              type="button"
              onClick={handleLoadSampleBatch}
              data-testid="btn-load-sample"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0052d9] bg-white hover:bg-[#f2f3f5] border border-[#0052d9] rounded transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#0052d9]" />
              <span>载入预置候选人样例（4份合规PDF）</span>
            </button>
          </div>
        </div>

        {/* 待上传文件清单 */}
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-[#e5e6eb]">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#0052d9]" />
              <h4 className="text-sm font-semibold text-[#181818]">
                待受理文件清单 ({stagedFiles.length}/50)
              </h4>
            </div>

            <div className="flex items-center gap-3">
              {invalidCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearInvalid}
                  data-testid="btn-clear-invalid"
                  className="text-xs text-[#e34d59] hover:underline cursor-pointer"
                >
                  一键移除所有错误文件 ({invalidCount})
                </button>
              )}
              <span className="text-xs text-[#86909c]">
                有效：<strong className="text-[#00a870] font-semibold">{validCount}</strong> 份
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-3 max-h-[320px] overflow-y-auto">
            {stagedFiles.map((file) => (
              <div
                key={file.id}
                className={`p-3 rounded border flex items-center justify-between gap-3 text-xs transition-colors ${
                  file.isValid
                    ? 'bg-[#f7f8fa] border-[#e5e6eb]'
                    : 'bg-[#feecee] border-[#fca5a5] text-[#e34d59]'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <FileText
                    className={`w-4 h-4 shrink-0 ${
                      file.isValid ? 'text-[#0052d9]' : 'text-[#e34d59]'
                    }`}
                  />
                  <div className="truncate">
                    <p className="font-medium text-[#181818] truncate">{file.name}</p>
                    {file.errorReason && (
                      <p className="text-[11px] text-[#e34d59] mt-0.5">
                        {file.errorReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-[#86909c] font-mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.id)}
                    className="text-[#86909c] hover:text-[#181818] p-1 cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部提交动作栏 */}
        <div className="flex items-center justify-between pt-4 border-t border-[#e5e6eb]">
          <p className="text-xs text-[#86909c]">
            受理后系统将按既定顺序执行结构化解析与事实证据对齐。
          </p>

          <button
            type="button"
            data-testid="btn-start-screening"
            disabled={isSubmitting || validCount === 0 || invalidCount > 0}
            onClick={handleSubmitBatch}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium text-white bg-[#0052d9] hover:bg-[#003cab] transition-colors disabled:opacity-40 cursor-pointer"
          >
            {isSubmitting ? (
              <span>正在建立筛选批次...</span>
            ) : (
              <>
                <span>确认受理并开始筛选 ({validCount} 份)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
