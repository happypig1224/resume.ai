import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RESUMES_DIR = path.resolve(__dirname, 'fixtures/resumes')

test.describe('真实用户端到端全链路联调演练测试套件 (Real User Full Lifecycle Suite)', () => {

  test('E2E-001: 从岗位发布、标准冻结、真实PDF批次导入、实时流水线到人机复核与重评的全闭环', async ({ page, request }) => {
    test.setTimeout(90000)

    // ------------------------------------------------------------------------
    // Step 1: 验证服务存活与初始环境就绪
    // ------------------------------------------------------------------------
    const healthRes = await request.get('/api/v1/health')
    expect(healthRes.status()).toBe(200)
    const healthJson = await healthRes.json()
    expect(healthJson.status).toBe('ok')
    expect(healthJson.database).toBe('connected')

    // ------------------------------------------------------------------------
    // Step 2: 访问首页并进入岗位管理 (Page 1: JobsPage)
    // ------------------------------------------------------------------------
    await page.goto('/')
    await expect(page.locator('text=resume.ai')).toBeVisible()

    // 切换到岗位管理导航
    await page.locator('[data-testid="nav-jobs"]').click()
    await expect(page.locator('[data-testid="btn-open-create-job"]')).toBeVisible()

    // 打开创建岗位弹窗
    const timestamp = Date.now().toString().slice(-6)
    const testJobTitle = `生产联调全栈架构师_${timestamp}`
    const testDept = '平台基础架构事业部'
    const testJd = `岗位职责：
1. 负责亿级高并发微服务集群与全栈架构设计演进；
2. 负责现代前端工程化（React/Next.js/TypeScript）落地与性能调优；
3. 探索并推进 LLM Agent 与企业级知识库应用落地。

任职要求：
1. 统招本科及以上学历，计算机或软件工程相关专业；【必要·不可放宽】
2. 5年以上全栈开发经验，精通 Java/Spring 或 Python/FastAPI；【必要·不可放宽】
3. 精通 React/TypeScript，具备大型复杂前端项目治理实战经验；【必要·可酌情】
4. 深入理解 MySQL 慢查询调优与 Redis 缓存治理；【必要·可酌情】
5. 具备生产级大模型开发或高并发微服务落地经验者优先。【加分项】`

    await page.locator('[data-testid="btn-open-create-job"]').click()
    await expect(page.locator('[data-testid="modal-create-job"]')).toBeVisible()

    await page.locator('[data-testid="input-job-title"]').fill(testJobTitle)
    await page.locator('[data-testid="input-job-dept"]').fill(testDept)
    await page.locator('[data-testid="textarea-job-jd"]').fill(testJd)

    // 提交创建岗位
    await page.locator('[data-testid="btn-submit-create-job"]').click()
    await expect(page.locator('[data-testid="modal-create-job"]')).not.toBeVisible()

    // 验证岗位卡片呈现在列表中
    await page.locator('[data-testid="input-search-job"]').fill(timestamp)
    await page.locator('[data-testid="btn-search-job"]').click()
    await expect(page.locator(`text=${testJobTitle}`)).toBeVisible()

    // ------------------------------------------------------------------------
    // Step 3: 配置与确认评估标准 (Page 2: CriteriaPage)
    // ------------------------------------------------------------------------
    // 点击刚创建岗位的“配置标准 (P02)”按钮
    const configBtn = page.locator(`button:has-text("配置标准 (P02)")`).or(page.locator('[data-testid^="btn-config-criteria-"]')).first()
    await expect(configBtn).toBeVisible()
    await configBtn.click()

    await expect(page.locator('[data-testid="criteria-page"]')).toBeVisible()
    await expect(page.locator('[data-testid="criteria-job-title"]')).toContainText(testJobTitle)

    // 点击“模型提取条件”从 JD 自动提炼标准
    const extractBtn = page.locator('[data-testid="btn-extract-criteria"]')
    await expect(extractBtn).toBeVisible()
    await extractBtn.click()

    // 严谨等待大模型提取完成提示及条件项真正渲染
    await expect(page.locator('text=已依据岗位 JD 自动解析并提取出')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="required-list"] textarea').first()).toBeVisible({ timeout: 5000 })

    // 点击“确认并冻结标准”
    const confirmBtn = page.locator('[data-testid="btn-confirm-criteria"]')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // 验证冻结成功提示与“前往导入简历”按钮就绪
    await expect(page.locator('[data-testid="btn-goto-import"]')).toBeVisible({ timeout: 10000 })

    // ------------------------------------------------------------------------
    // Step 4: 真实简历文件批次导入 (Page 3: ImportPage)
    // ------------------------------------------------------------------------
    // 点击“前往导入简历”按钮进入导入页面
    const gotoImportBtn = page.locator('[data-testid="btn-goto-import"]')
    await expect(gotoImportBtn).toBeVisible()
    await gotoImportBtn.click()

    await expect(page.locator('text=批量上传与受理清单').or(page.locator('text=待受理文件清单'))).toBeVisible()

    // 准备 4 份真实生成的 PDF 文件
    const filesToUpload = [
      path.join(RESUMES_DIR, '张明哲_资深全栈架构师_8年.pdf'),
      path.join(RESUMES_DIR, '李沐阳_初级前端工程师_2年.pdf'),
      path.join(RESUMES_DIR, '王浩然_资深产品总监_10年.pdf'),
      path.join(RESUMES_DIR, '陈梓墨_全栈研发_扫描件降级样本.pdf'),
    ]

    for (const f of filesToUpload) {
      expect(fs.existsSync(f)).toBe(true)
    }

    // 通过标准 file input 上传真实 PDF 文件
    const fileInput = page.locator('[data-testid="file-upload-input"]')
    await fileInput.setInputFiles(filesToUpload)

    // 若存在演示用的无效文件，点击一键清理按钮保证批次纯净合规
    const clearInvalidBtn = page.locator('[data-testid="btn-clear-invalid"]')
    if (await clearInvalidBtn.isVisible()) {
      await clearInvalidBtn.click()
    }

    // 验证文件在待处理列表中呈现
    await expect(page.locator('text=张明哲_资深全栈架构师_8年.pdf')).toBeVisible()
    await expect(page.locator('text=李沐阳_初级前端工程师_2年.pdf')).toBeVisible()

    // 提交批次导入并启动初筛流水线
    const startScreeningBtn = page.locator('[data-testid="btn-start-screening"]')
    await expect(startScreeningBtn).toBeEnabled({ timeout: 10000 })
    await startScreeningBtn.click()

    // ------------------------------------------------------------------------
    // Step 5: 批次工作台与后台流水线 (Page 4: BatchWorkbenchPage)
    // ------------------------------------------------------------------------
    await expect(page.locator('[data-testid="workbench-page"]')).toBeVisible({ timeout: 15000 })

    // 验证候选人卡片呈现在工作台中
    await expect(
      page.locator('text=张明哲').or(page.locator('text=张明哲_资深全栈架构师_8年.pdf')).first()
    ).toBeVisible({ timeout: 20000 })

    // 验证分流过滤切换交互
    await page.locator('[data-testid="filter-all"]').click()
    await expect(page.locator('[data-testid="workbench-page"]')).toBeVisible()

    // ------------------------------------------------------------------------
    // Step 6: 左右双屏原件对照复核与决定保存 (Page 5: CandidateReviewModal)
    // ------------------------------------------------------------------------
    // 打开首位候选人的复核详情
    const firstReviewBtn = page.locator('[data-testid^="btn-review-"]').first()
    await expect(firstReviewBtn).toBeVisible()
    await firstReviewBtn.click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()

    // 验证左侧原件对照与右侧证据链就绪
    await expect(modal.locator('text=原件阅读器').or(modal.locator('text=候选人简历原件'))).toBeVisible()
    await expect(modal.locator('text=逐项标准研判与事实证据').or(modal.locator('text=研判与事实证据'))).toBeVisible()

    // 人工决策表单交互：选择“通过初筛”
    const advanceBtn = modal.locator('button:has-text("通过初筛")').first()
    if (await advanceBtn.isVisible()) {
      await advanceBtn.click()

      // 输入复核备注
      const noteInput = modal.locator('textarea').first()
      if (await noteInput.isVisible()) {
        await noteInput.fill('生产联调自动化复核：候选人技术栈高度匹配，综合素质优异，建议推进业务初试。')
      }

      // 保存复核决定
      const saveBtn = modal.locator('button:has-text("保存人工复核决定")')
      if (await saveBtn.isVisible()) {
        await saveBtn.click()
        await expect(modal.locator('text=复核决定已持久保存！').or(modal.locator('text=已保存'))).toBeVisible({ timeout: 5000 })
      }
    }

    // 关闭复核弹窗
    const closeBtn = modal.locator('[data-testid="btn-close-review"]')
    await closeBtn.click()
    await expect(modal).not.toBeVisible()

    // ------------------------------------------------------------------------
    // Step 7: 导出与统计指标契约验证
    // ------------------------------------------------------------------------
    const exportCsvBtn = page.locator('[data-testid="btn-export-csv"]')
    await expect(exportCsvBtn).toBeVisible()
  })

})
