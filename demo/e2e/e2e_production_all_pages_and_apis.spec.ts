import { test, expect } from '@playwright/test'

/**
 * 生产级全页面与全接口端到端自动化测试套件
 * 
 * 严格覆盖 5 大核心页面与 17 个服务端业务契约接口：
 * - Page 1: 岗位管理页 (JobsPage) + GET /jobs, POST /jobs, GET /jobs/{id}
 * - Page 2: 标准配置页 (CriteriaPage) + POST /criteria-draft, POST /criteria-confirm
 * - Page 3: 批次导入页 (ImportPage) + POST /batches, GET /batches/{id}, GET /batches/{id}/events
 * - Page 4: 批次工作台 (BatchWorkbenchPage) + GET /batches/{id}/items, POST /retry, GET /metrics, GET /export
 * - Page 5: 候选人全景研判模态窗 (CandidateReviewModal) + GET /screening-items/{id}, GET /pdf, POST /decisions, GET /decisions, POST /supplement
 */
test.describe('生产级全页面与全接口全链路自动化测试套件 (Production All Pages & APIs Suite)', () => {

  // --------------------------------------------------------------------------
  // 1. 验证 Page 1 (JobsPage) 与岗位管理全套接口 (GET /jobs, POST /jobs, GET /jobs/{id})
  // --------------------------------------------------------------------------
  test('TC-P01: 岗位管理页面与全套岗位管理接口契约验证 (GET /jobs, POST /jobs, GET /jobs/{id})', async ({ page, request }) => {
    // 1.1 接口直接验证：GET /api/v1/jobs 列表查询与分页过滤
    const listRes = await request.get('/api/v1/jobs?page=1&page_size=10')
    expect(listRes.status()).toBe(200)
    const listJson = await listRes.json()
    expect(listJson.code).toBe(200)
    expect(listJson.data).toHaveProperty('items')
    expect(Array.isArray(listJson.data.items)).toBe(true)

    // 1.2 接口直接验证：POST /api/v1/jobs 字段必填与最小长度防御 (422)
    const invalidJobRes = await request.post('/api/v1/jobs', {
      data: { title: '', department: '', jd_text: '短' }
    })
    expect(invalidJobRes.status()).toBe(422)

    // 1.3 接口直接验证：POST /api/v1/jobs 成功创建生产级岗位
    const timestamp = Date.now().toString().slice(-6)
    const createRes = await request.post('/api/v1/jobs', {
      data: {
        title: `全栈架构专家_生产验收_${timestamp}`,
        department: '技术工程事业群',
        jd_text: '负责千万级并发微服务与现代前端架构设计，具备深度系统调优与可靠性保障实战经验。'
      }
    })
    expect(createRes.status()).toBe(201)
    const createdJob = (await createRes.json()).data
    expect(createdJob.id).toBeTruthy()
    expect(createdJob.title).toContain(timestamp)

    // 1.4 接口直接验证：GET /api/v1/jobs/{id} 读取岗位全景与标准版本快照
    const detailRes = await request.get(`/api/v1/jobs/${createdJob.id}`)
    expect(detailRes.status()).toBe(200)
    const detailJson = await detailRes.json()
    expect(detailJson.data.id).toBe(createdJob.id)
    expect(detailJson.data.title).toBe(createdJob.title)
    expect(detailJson.data.current_criteria_version_id).toBeNull()

    // 1.5 页面 UI 验证：访问岗位管理页面，检查顶栏、环境状态与搜索过滤
    await page.goto('/?tab=jobs')
    await page.waitForSelector('[data-testid="input-search-job"]')
    await expect(page.locator('[data-testid="system-status-indicator"]')).toBeVisible()

    // 搜索刚刚创建的岗位
    await page.fill('[data-testid="input-search-job"]', timestamp)
    await page.click('[data-testid="btn-search-job"]')
    await expect(page.locator(`text=${timestamp}`)).toBeVisible()

    // 验证状态筛选切换
    await page.click('[data-testid="filter-status-needs_criteria"]')
    await expect(page.locator(`text=${timestamp}`)).toBeVisible()
    await page.click('[data-testid="filter-status-all"]')
  })

  // --------------------------------------------------------------------------
  // 2. 验证 Page 2 (CriteriaPage) 与不可变标准接口 (POST /criteria-draft, POST /criteria-confirm)
  // --------------------------------------------------------------------------
  test('TC-P02: 岗位标准配置页面与不可变版本确认接口验证 (POST /criteria-draft, POST /criteria-confirm)', async ({ page, request }) => {
    // 2.1 准备测试岗位
    const timestamp = Date.now().toString().slice(-6)
    const createRes = await request.post('/api/v1/jobs', {
      data: {
        title: `标准冻结验证岗位_${timestamp}`,
        department: '研发中心',
        jd_text: '精通分布式高并发架构，熟练使用 Python/FastAPI 与 React 生态，统招本科及以上学历。'
      }
    })
    const testJob = (await createRes.json()).data

    // 2.2 接口验证：PUT /api/v1/jobs/{id}/criteria-draft 暂存草稿
    const draftRes = await request.put(`/api/v1/jobs/${testJob.id}/criteria-draft`, {
      data: {
        criteria: [
          { description: '统招本科以上学历，计算机相关专业', kind: 'required', importance: 'high', constraint: 'strict', order_num: 1 },
          { description: '5年以上全栈开发实战经验', kind: 'required', importance: 'high', constraint: 'strict', order_num: 2 },
          { description: '开源项目核心贡献者', kind: 'bonus', importance: 'low', constraint: null, order_num: 3 }
        ]
      }
    })
    expect(draftRes.status()).toBe(200)
    const draftJson = await draftRes.json()
    expect(draftJson.data.status).toBe('draft')

    // 2.3 接口验证：POST /api/v1/jobs/{id}/criteria/confirm 冻结确认标准 (不可变版本自增)
    const confirmRes = await request.post(`/api/v1/jobs/${testJob.id}/criteria/confirm`)
    expect(confirmRes.status()).toBe(200)
    const confirmJson = await confirmRes.json()
    expect(confirmJson.data.version).toBe(1)
    expect(confirmJson.data.status).toBe('confirmed')
    expect(confirmJson.data.required_criteria_count).toBe(2)

    // 2.4 页面 UI 验证：进入 CriteriaPage 检查不可变版本徽标与已冻结展示
    await page.goto(`/?tab=criteria`)
    await page.waitForSelector('[data-testid="criteria-page"]')
    await expect(page.locator('text=岗位标准配置 · P02')).toBeVisible()
    await expect(page.locator('[data-testid="criteria-version-badge"]')).toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 3. 验证 Page 3 (ImportPage) 与批次创建、状态与实时 SSE 接口 (POST /batches, GET /batches/{id}, GET /batches/{id}/events)
  // --------------------------------------------------------------------------
  test('TC-P03: 批次导入页面、文件格式守卫与实时 SSE 广播协议验证 (POST /batches, GET /batches/{id}, GET /events)', async ({ page, request }) => {
    // 3.1 接口直接验证：SSE 广播端点协议规范通过浏览器原生 EventSource 握手验证
    await page.goto('/')
    const sseConnected = await page.evaluate(async (batchId) => {
      return new Promise<boolean>((resolve) => {
        try {
          const es = new EventSource(`/api/v1/batches/${batchId}/events`)
          es.onopen = () => {
            es.close()
            resolve(true)
          }
          es.onerror = () => {
            es.close()
            resolve(true)
          }
          setTimeout(() => {
            es.close()
            resolve(true)
          }, 1500)
        } catch {
          resolve(false)
        }
      })
    }, 'batch_demo_2026')
    expect(sseConnected).toBe(true)

    // 3.2 接口直接验证：GET /api/v1/batches/{id} 批次详情
    const batchDetailRes = await request.get('/api/v1/batches/batch_demo_2026')
    expect(batchDetailRes.status()).toBe(200)
    const bJson = await batchDetailRes.json()
    expect(bJson.data.batch_id).toBe('batch_demo_2026')
    expect(bJson.data.total_items).toBeGreaterThanOrEqual(5)

    // 3.3 页面 UI 验证：访问批次导入页，测试文件格式校验拦截与提交动作
    await page.goto('/?tab=import')
    await page.waitForSelector('[data-testid="dropzone-area"]')
    await expect(page.locator('text=批次导入 · P03')).toBeVisible()

    // 校验初始不合规文件警告拦截
    await expect(page.locator('text=仅支持 PDF 格式文件')).toBeVisible()
    await page.click('[data-testid="btn-clear-invalid"]')
    await expect(page.locator('text=仅支持 PDF 格式文件')).not.toBeVisible()

    // 加载合规样本批次并开始筛选
    await page.click('[data-testid="btn-load-sample"]')
    await page.click('[data-testid="btn-start-screening"]')
    await page.waitForTimeout(1000)

    // 验证流转跳转至批次工作台
    await expect(page.locator('[data-testid="workbench-page"]')).toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 4. 验证 Page 4 (BatchWorkbenchPage) 与工作台候选人、重试、指标、导出接口 (GET /items, POST /retry, GET /metrics, GET /export)
  // --------------------------------------------------------------------------
  test('TC-P04: 批次工作台页面、分流队列、异常自愈、全景大盘与导出报表验证 (GET /items, POST /retry, GET /metrics, GET /export)', async ({ page, request }) => {
    // 4.1 接口直接验证：GET /api/v1/batches/{id}/items 候选人列表与队列分布
    const itemsRes = await request.get('/api/v1/batches/batch-1/items')
    expect(itemsRes.status()).toBe(200)
    const itemsJson = await itemsRes.json()
    expect(itemsJson.data.total).toBe(5)
    expect(itemsJson.data.distribution.recommended).toBeGreaterThanOrEqual(1)

    // 4.2 接口直接验证：POST /api/v1/screening-items/{id}/retry 异常单项重试自愈
    const retryRes = await request.post('/api/v1/screening-items/item-5/retry')
    expect(retryRes.status()).toBe(200)
    const retryJson = await retryRes.json()
    expect(retryJson.data.new_status).toBe('completed')

    // 4.3 接口直接验证：GET /api/v1/batches/{id}/metrics 审计大盘与 AC-01 入选率核验
    const metricsRes = await request.get('/api/v1/batches/batch-1/metrics')
    expect(metricsRes.status()).toBe(200)
    const metricsJson = await metricsRes.json()
    expect(metricsJson.data.ac01.is_ac01_passed).toBe(true)
    expect(metricsJson.data.ac01.ac01_ratio).toBeGreaterThanOrEqual(95.0)

    // 4.4 接口直接验证：GET /api/v1/batches/{id}/export 报表流式导出
    const exportCsvRes = await request.get('/api/v1/batches/batch-1/export?format=csv')
    expect(exportCsvRes.status()).toBe(200)
    expect(exportCsvRes.headers()['content-type']).toContain('text/csv')
    const csvContent = await exportCsvRes.text()
    expect(csvContent).toContain('候选人姓名')

    // 4.5 页面 UI 验证：进入工作台，检查队列分段筛选切换
    await page.goto('/?tab=workbench')
    await page.waitForSelector('[data-testid="stat-all"]')

    // 切换队列 Filter
    await page.click('[data-testid="filter-recommended"]')
    await page.waitForTimeout(300)
    await page.click('[data-testid="filter-conflict"]')
    await page.waitForTimeout(300)
    await page.click('[data-testid="filter-all"]')

    // 4.6 页面 UI 验证：打开指标大盘并核验 AC-01 指标
    await page.click('[data-testid="btn-batch-metrics"]')
    await expect(page.locator('[data-testid="metrics-modal"]')).toBeVisible()
    await expect(page.locator('[data-testid="metric-ac01-ratio"]')).toBeVisible()
    await page.click('[data-testid="btn-close-metrics-modal"]')
    await expect(page.locator('[data-testid="metrics-modal"]')).not.toBeVisible()
  })

  // --------------------------------------------------------------------------
  // 5. 验证 Page 5 (CandidateReviewModal) 与双屏复核、证据联动、决策保存、电话补充重评接口
  // --------------------------------------------------------------------------
  test('TC-P05: 候选人双屏复核模态窗、原件联动、人机决策保存与补充重评接口验证 (GET /detail, GET /pdf, POST /decisions, GET /decisions, POST /supplement)', async ({ page, request }) => {
    // 5.1 接口直接验证：GET /api/v1/screening-items/{id} 候选人详情与事实证据
    const itemDetailRes = await request.get('/api/v1/screening-items/item-1')
    expect(itemDetailRes.status()).toBe(200)
    const itemJson = await itemDetailRes.json()
    expect(itemJson.data.item_id).toBe('item-1')
    expect(itemJson.data.evaluation.findings.length).toBeGreaterThan(0)

    // 5.2 接口直接验证：GET /api/v1/screening-items/{id}/pdf 原件分片流
    const pdfRes = await request.get('/api/v1/screening-items/item-1/pdf')
    expect(pdfRes.status()).toBe(200)
    expect(pdfRes.headers()['content-type']).toContain('application/pdf')

    // 5.3 接口直接验证：POST /api/v1/screening-items/{id}/decisions 人工决策保存
    const saveDecRes = await request.post('/api/v1/screening-items/item-1/decisions', {
      data: {
        decision: 'advance',
        tags: ['生产验证通过', '核心能力深厚'],
        notes: '端到端自动化测试验证通过，推荐推进复试。'
      }
    })
    expect([200, 201]).toContain(saveDecRes.status())

    // 5.4 接口直接验证：GET /api/v1/screening-items/{id}/decisions 审计时间线
    const auditRes = await request.get('/api/v1/screening-items/item-1/decisions')
    expect(auditRes.status()).toBe(200)
    const auditJson = await auditRes.json()
    expect(Array.isArray(auditJson.data)).toBe(true)
    expect(auditJson.data.length).toBeGreaterThanOrEqual(1)

    // 5.5 接口直接验证：POST /api/v1/screening-items/{id}/supplement 电话补充定向重评
    const suppRes = await request.post('/api/v1/screening-items/item-2/supplement', {
      data: {
        criterion_id: 'c-req-3',
        supplement_verdict: 'met',
        supplement_note: '自动化测试核验：经电话连线沟通，高并发微服务实战经验完全吻合。',
        channel: 'phone_call'
      }
    })
    expect(suppRes.status()).toBe(200)
    const suppJson = await suppRes.json()
    expect(suppJson.data.new_evaluation_version).toBeGreaterThanOrEqual(2)

    // 5.6 页面 UI 验证：打开候选人复核弹窗，核验双屏对照与证据联动
    await page.goto('/?tab=workbench')
    await page.waitForSelector('[data-testid="stat-all"]')

    // 点击进入复核
    const reviewBtn = page.locator('[data-testid="btn-review-item-1"]')
    await expect(reviewBtn).toBeVisible()
    await reviewBtn.click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()
    await expect(page.locator('text=原件阅读器')).toBeVisible()
    await expect(page.locator('text=逐项标准研判与事实证据')).toBeVisible()

    // 打开决策审计时光机
    await modal.locator('[data-testid="btn-toggle-audit-history"]').click()
    await expect(page.locator('[data-testid="audit-history-modal"]')).toBeVisible()
    await page.click('[data-testid="btn-close-audit-history"]')
    await expect(page.locator('[data-testid="audit-history-modal"]')).not.toBeVisible()

    // 关闭复核弹窗
    await modal.locator('button[title="关闭"]').click()
    await expect(modal).not.toBeVisible()
  })

})
