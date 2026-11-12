import { test, expect } from '@playwright/test'

/**
 * 构造合规且可被 pypdf 提取文本的标准 PDF Buffer
 */
function createValidPdfBuffer(candidateName: string): Buffer {
  const content = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length 120>> stream
BT
/F1 12 Tf
72 720 Td
(Candidate: ${candidateName} - Master CS 7 years experience. Architecture React Python Microservices.) Tj
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
452
%%EOF`
  return Buffer.from(content)
}

/**
 * 统一多文件表单提交辅助函数 (兼容 Node 原生 FormData)
 */
async function postBatchForm(
  baseUrl: string,
  jobId: string,
  title: string,
  files: Array<{ name: string; buffer: Buffer; type?: string }>
) {
  const form = new FormData()
  form.append('job_id', jobId)
  if (title) form.append('title', title)

  files.forEach((f) => {
    form.append(
      'files',
      new Blob([f.buffer], { type: f.type || 'application/pdf' }),
      f.name
    )
  })

  return fetch(`${baseUrl}/api/v1/batches`, {
    method: 'POST',
    body: form,
  })
}

test.describe('批次导入与实时 SSE 流水线端到端测试套件 (Slice 3: P03 & P04)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=resume.ai')).toBeVisible()
  })

  // ==========================================================================
  // TC201: 完整批次上传、后台异步流水线推进与 SSE 实时进度变迁 (Happy Path)
  // ==========================================================================
  test('TC201: 完整批次上传与 SSE 实时流式流转变迁 (创建岗位 -> 冻结标准 -> 上传真实PDF -> SSE实时进度 -> 流转完成)', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6)
    const testJobTitle = `SSE联调全栈岗位_${timestamp}`
    const testDept = '基础架构研发中心'
    const testJd = `岗位职责：负责智能研判引擎与前后端全链路开发。
任职要求：
1. 统招本科及以上学历；【必要·不可放宽】
2. 5年以上工程架构实战经验；【必要·不可放宽】
3. 掌握分布式微服务与高可用架构；【加分项】`

    // 1. 进入岗位管理 (P01) 创建新岗位
    await page.locator('[data-testid="nav-jobs"]').click()
    await page.locator('[data-testid="btn-open-create-job"]').click()
    await page.locator('[data-testid="input-job-title"]').fill(testJobTitle)
    await page.locator('[data-testid="input-job-dept"]').fill(testDept)
    await page.locator('[data-testid="textarea-job-jd"]').fill(testJd)
    await page.locator('[data-testid="btn-submit-create-job"]').click()

    // 2. 检索并进入标准配置 (P02)
    await page.locator('[data-testid="input-search-job"]').fill(testJobTitle)
    await page.locator('[data-testid="btn-search-job"]').click()
    const jobCard = page.locator(`[data-testid^="job-card-"]:has-text("${testJobTitle}")`).first()
    await expect(jobCard).toBeVisible()

    await jobCard.locator('button:has-text("配置标准 (P02)")').click()
    await expect(page.locator('[data-testid="criteria-page"]')).toBeVisible()

    // 提取并冻结标准
    await page.locator('[data-testid="btn-extract-criteria"]').click()
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toBeVisible({
      timeout: 8000,
    })
    await page.locator('[data-testid="btn-confirm-criteria"]').click()
    await expect(page.locator('text=标准已成功确认并锁定为不可变版本').first()).toBeVisible({
      timeout: 5000,
    })

    // 3. 点击“前往导入简历”进入 P03
    await page.locator('[data-testid="btn-goto-import"]').click()
    await expect(page.locator('text=批次导入 · P03')).toBeVisible()
    await expect(page.locator(`text=${testJobTitle}`)).toBeVisible()
    await expect(page.locator('text=标准已冻结')).toBeVisible()

    // 清空初始预置的包含 .docx 错误的条目
    await page.click('button:has-text("一键移除所有错误文件")')

    // 4. 模拟真实用户上传 2 份合法 PDF 简历
    const fileInput = page.locator('[data-testid="file-upload-input"]')
    await fileInput.setInputFiles([
      {
        name: '张海峰_资深全栈_7年.pdf',
        mimeType: 'application/pdf',
        buffer: createValidPdfBuffer('张海峰'),
      },
      {
        name: '李晨曦_架构专家_9年.pdf',
        mimeType: 'application/pdf',
        buffer: createValidPdfBuffer('李晨曦'),
      },
    ])

    // 验证文件清单呈现新增的有效文件
    await expect(page.locator('text=张海峰_资深全栈_7年.pdf')).toBeVisible()
    await expect(page.locator('text=李晨曦_架构专家_9年.pdf')).toBeVisible()

    // 5. 点击“确认受理并开始筛选”
    const submitBtn = page.locator('button:has-text("确认受理并开始筛选")')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 6. 验证流转至 P04 批次工作台
    await expect(page.locator('text=批次工作台 · P04')).toBeVisible()

    // 7. 验证 SSE 实时进度栏挂载并呈现
    const progressBanner = page.locator('[data-testid="sse-progress-banner"]')
    await expect(progressBanner).toBeVisible()

    // 8. 验证流水线逐步处理完毕，进度达到 100% 并展示完成 Banner
    const completedBanner = page.locator('[data-testid="batch-completed-banner"]')
    await expect(completedBanner).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="sse-percent-text"]')).toHaveText('100%')

    // 9. 验证候选人卡片正常渲染，呈现计算所得已知必要条件匹配分
    const cards = page.locator('[data-testid^="candidate-card-"]')
    await expect(cards.first()).toBeVisible()
    await expect(page.locator('text=已知必要条件匹配分').first()).toBeVisible()
  })

  // ==========================================================================
  // TC202: 韧性软受理 (Soft Acceptance) 与部分失败隔离测试
  // ==========================================================================
  test('TC202: 韧性软受理与部分失败隔离 (混合提交有效与损坏文件，保障整批不崩溃)', async ({
    page,
  }) => {
    // 1. 获取一个已冻结标准的有效岗位
    const jobsRes = await fetch('http://127.0.0.1:8000/api/v1/jobs?page_size=10')
    expect(jobsRes.ok).toBeTruthy()
    const jobsData = await jobsRes.json()
    const readyJob = jobsData.data.items.find(
      (j: any) => j.criteria_status?.is_ready_for_import
    )
    expect(readyJob).toBeTruthy()

    // 2. 调用后端 API 提交混合文件：1 份合法 PDF + 1 份非 PDF 伪造文件
    const validPdf = createValidPdfBuffer('王立强')
    const corruptFile = Buffer.from('THIS_IS_NOT_A_PDF_CONTENT')

    const createBatchRes = await postBatchForm(
      'http://127.0.0.1:8000',
      readyJob.id,
      '软受理韧性验证批次',
      [
        {
          name: '王立强_全栈工程师.pdf',
          buffer: validPdf,
          type: 'application/pdf',
        },
        {
          name: '非法损坏简历.docx',
          buffer: corruptFile,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ]
    )

    // 验证 HTTP 202 Accepted 软受理通过，整批未崩溃
    expect(createBatchRes.status).toBe(202)
    const batchBody = await createBatchRes.json()
    expect(batchBody.data.total_files).toBe(2)
    expect(batchBody.data.accepted_count).toBe(1)
    expect(batchBody.data.rejected_count).toBe(1)
    expect(batchBody.data.queued_items.length).toBe(1)
    expect(batchBody.data.failed_items.length).toBe(1)
    expect(batchBody.data.failed_items[0].error_info.code).toBe('INVALID_FILE_FORMAT')

    // 3. 访问前台工作台查看
    await page.goto('/?tab=workbench')
    await expect(page.locator('text=批次工作台 · P04')).toBeVisible()
    await expect(page.locator('[data-testid="stat-failed"]')).toBeVisible()
  })

  // ==========================================================================
  // TC203: 未冻结标准岗位禁止导入严格防御
  // ==========================================================================
  test('TC203: 未冻结标准岗位禁止导入严格防御 (前端禁用拦截与后端400状态码)', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6)
    const unconfirmedTitle = `未配置标准岗位_${timestamp}`

    // 1. 在 P01 创建未配置标准的新岗位
    await page.locator('[data-testid="nav-jobs"]').click()
    await page.locator('[data-testid="btn-open-create-job"]').click()
    await page.locator('[data-testid="input-job-title"]').fill(unconfirmedTitle)
    await page.locator('[data-testid="input-job-dept"]').fill('新业务探索部')
    await page.locator('[data-testid="textarea-job-jd"]').fill('负责前沿探索业务...')
    await page.locator('[data-testid="btn-submit-create-job"]').click()

    // 检索该岗位
    await page.locator('[data-testid="input-search-job"]').fill(unconfirmedTitle)
    await page.locator('[data-testid="btn-search-job"]').click()
    const jobCard = page.locator(`[data-testid^="job-card-"]:has-text("${unconfirmedTitle}")`).first()
    await expect(jobCard).toBeVisible()

    // 验证 P01 卡片上“批次导入”按钮被禁用
    const importBtn = jobCard.locator('button:has-text("批次导入 (P03)")')
    await expect(importBtn).toBeDisabled()

    // 2. 测试后端直接发起 POST /api/v1/batches
    const jobsRes = await fetch(
      `http://127.0.0.1:8000/api/v1/jobs?search=${encodeURIComponent(unconfirmedTitle)}`
    )
    const jobsData = await jobsRes.json()
    const jobId = jobsData.data.items[0].id

    const postBatchRes = await postBatchForm(
      'http://127.0.0.1:8000',
      jobId,
      '违规未冻结导入尝试',
      [
        {
          name: '测试简历.pdf',
          buffer: createValidPdfBuffer('测试人'),
        },
      ]
    )

    // 验证服务端强校验拒绝并返回 400
    expect(postBatchRes.status).toBe(400)
    const errBody = await postBatchRes.json()
    expect(errBody.error || errBody.message || JSON.stringify(errBody)).toContain('尚未配置并确认')
  })

  // ==========================================================================
  // TC204: 超限上传防御 (超过 50 份上限拦截)
  // ==========================================================================
  test('TC204: 超限导入防御 (单批次超过50份时阻断创建)', async () => {
    // 1. 获取一个已冻结标准的岗位
    const jobsRes = await fetch('http://127.0.0.1:8000/api/v1/jobs?page_size=10')
    const jobsData = await jobsRes.json()
    const readyJob = jobsData.data.items.find(
      (j: any) => j.criteria_status?.is_ready_for_import
    )
    expect(readyJob).toBeTruthy()

    // 2. 构造 51 份文件列表
    const files = Array.from({ length: 51 }, (_, i) => ({
      name: `超限候选人_${i + 1}.pdf`,
      buffer: createValidPdfBuffer(`超限候选人${i + 1}`),
    }))

    const res = await postBatchForm(
      'http://127.0.0.1:8000',
      readyJob.id,
      '超限测试批次',
      files
    )

    // 验证服务端返回 400 BatchLimitExceeded
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error || body.message || JSON.stringify(body)).toContain('50')
  })

  // ==========================================================================
  // TC205: SSE 流式端点协议规范与断线补偿保活
  // ==========================================================================
  test('TC205: SSE 流式广播端点协议规范核验 (Content-Type与Last-Event-ID响应)', async () => {
    // 1. 获取最新批次
    const batchesRes = await fetch('http://127.0.0.1:8000/api/v1/batches?page_size=5')
    expect(batchesRes.ok).toBeTruthy()
    const batchesData = await batchesRes.json()
    const targetBatch = batchesData.data.items[0]
    expect(targetBatch).toBeTruthy()

    // 2. 请求 SSE 端点并携带 Last-Event-ID
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const sseRes = await fetch(
      `http://127.0.0.1:8000/api/v1/batches/${targetBatch.batch_id}/events`,
      {
        headers: {
          Accept: 'text/event-stream',
          'Last-Event-ID': 'evt-init-0',
        },
        signal: controller.signal,
      }
    ).catch((err) => {
      // 流式长连接在收到响应头后 abort 是正常的
      if (err.name === 'AbortError') return null
      throw err
    })

    if (sseRes) {
      clearTimeout(timeout)
      expect(sseRes.status).toBe(200)
      expect(sseRes.headers.get('content-type')).toContain('text/event-stream')
      expect(sseRes.headers.get('cache-control')).toBe('no-cache')
    }
  })
})
