import { test, expect } from '@playwright/test'

test.describe('全链路端到端联调与严苛异常测试套件 (Slice 1 & 2)', () => {
  test.beforeEach(async ({ page }) => {
    // 访问系统根路径，通过导航栏切换到岗位管理 (P01)
    await page.goto('/')
    await expect(page.locator('text=resume.ai')).toBeVisible()

    // 真实用户点击导航栏“岗位管理 (P01)”
    const navJobsBtn = page.locator('[data-testid="nav-jobs"]')
    await expect(navJobsBtn).toBeVisible()
    await navJobsBtn.click()

    // 验证成功进入 P01 页面
    await expect(page.locator('text=招聘岗位与标准矩阵')).toBeVisible()
    await expect(page.locator('[data-testid="btn-open-create-job"]')).toBeVisible()
  })

  // ==========================================================================
  // 测试组 1: 正常全生命周期闭环打通 (Happy Path Full Lifecycle)
  // ==========================================================================

  test('TC101: 完整岗位生命周期闭环 (新建 -> AI提取 -> 规则微调 -> 冻结标准 -> 状态变迁 -> 解锁导入)', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6)
    const testJobTitle = `E2E核心全栈架构师_${timestamp}`
    const testDept = '基础平台架构部'
    const testJd = `岗位职责：
1. 负责大规模智能体应用全栈架构设计，深度集成 FastAPI 与 React 19；
2. 负责构建千万级高并发微服务与 Redis/PostgreSQL 读写分离架构；
3. 负责保障平台 99.99% 高可用性与核心业务短事务治理。
任职要求：
1. 统招本科及以上学历，计算机或软件工程相关专业；【必要·不可放宽】
2. 5 年及以上全栈开发实战经验，深度精通 Python 与 TypeScript；【必要·不可放宽】
3. 具备高并发系统架构与性能优化经验，掌握分库分表与缓存拓扑；【必要·可酌情】
4. 拥有真实大模型 Agent / RAG 检索企业落地经历者优先。【加分项】
5. 拥有知名开源项目贡献或技术社区影响力者优先。【加分项】`

    // 1. 点击“新建岗位”按钮唤起弹窗
    await page.locator('[data-testid="btn-open-create-job"]').click()
    const modal = page.locator('[data-testid="modal-create-job"]')
    await expect(modal).toBeVisible()

    // 2. 填写表单
    await page.locator('[data-testid="input-job-title"]').fill(testJobTitle)
    await page.locator('[data-testid="input-job-dept"]').fill(testDept)
    await page.locator('[data-testid="textarea-job-jd"]').fill(testJd)

    // 3. 提交表单并等待创建完成
    const submitBtn = page.locator('[data-testid="btn-submit-create-job"]')
    await submitBtn.click()
    await expect(modal).not.toBeVisible()

    // 4. 在岗位列表中精准检索并定位刚创建的岗位卡片
    await page.locator('[data-testid="input-search-job"]').fill(testJobTitle)
    await page.locator('[data-testid="btn-search-job"]').click()

    const jobCard = page.locator(`[data-testid^="job-card-"]:has-text("${testJobTitle}")`).first()
    await expect(jobCard).toBeVisible()
    await expect(jobCard.locator('text=待配置标准')).toBeVisible()
    await expect(jobCard.locator(`text=${testDept}`)).toBeVisible()

    // 5. 校验防呆保护：标准未冻结前，“批次导入 (P03)”按钮必须处于禁用状态
    const importBtnBefore = jobCard.locator('button:has-text("批次导入 (P03)")')
    await expect(importBtnBefore).toBeDisabled()

    // 6. 点击“配置标准 (P02)”进入标准配置工作台
    const configBtn = jobCard.locator('button:has-text("配置标准 (P02)")')
    await configBtn.click()

    // 7. 验证进入 P02 页面，并呈现刚创建岗位的真实详情
    await expect(page.locator('[data-testid="criteria-page"]')).toBeVisible()
    await expect(page.locator('[data-testid="criteria-job-title"]')).toHaveText(testJobTitle)
    await expect(page.locator('[data-testid="jd-text-container"]')).toContainText('统招本科及以上学历')

    // 8. 点击“模型提取条件”按钮，调用后端规则/模型引擎
    const extractBtn = page.locator('[data-testid="btn-extract-criteria"]')
    await expect(extractBtn).toBeVisible()
    await extractBtn.click()

    // 验证成功提取提示
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toBeVisible({
      timeout: 8000,
    })
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toContainText(
      '已依据岗位 JD 自动解析'
    )

    // 9. 验证提取出的必要条件与加分项
    const reqList = page.locator('[data-testid="required-list"]')
    const initialReqCount = await reqList.locator('textarea').count()
    expect(initialReqCount).toBeGreaterThanOrEqual(1)

    // 10. 用户微调：手动增加一项必要条件
    await page.locator('[data-testid="btn-add-required"]').click()
    await expect(reqList.locator('textarea')).toHaveCount(initialReqCount + 1)
    const newReqTextarea = reqList.locator('textarea').last()
    await newReqTextarea.fill('具备良好的跨团队沟通协同与项目推进执行力')

    // 11. 点击“确认并冻结标准”
    const confirmBtn = page.locator('[data-testid="btn-confirm-criteria"]')
    await confirmBtn.click()

    // 验证冻结成功反馈与基准版本徽章
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toBeVisible({
      timeout: 8000,
    })
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toContainText(
      '标准已成功确认并锁定为不可变版本 v1.0'
    )
    await expect(page.locator('[data-testid="criteria-version-badge"]')).toContainText(
      '基准版本 v1.0'
    )

    // 12. 返回岗位管理列表 (P01) 检验端到端状态变迁
    await page.locator('[data-testid="nav-jobs"]').click()
    await page.locator('[data-testid="input-search-job"]').fill(testJobTitle)
    await page.locator('[data-testid="btn-search-job"]').click()

    const updatedJobCard = page
      .locator(`[data-testid^="job-card-"]:has-text("${testJobTitle}")`)
      .first()
    await expect(updatedJobCard).toBeVisible()

    // 验证：状态变更为“标准就绪 (v1.0)”
    await expect(updatedJobCard.locator('text=标准就绪 (v1.0)')).toBeVisible()
    await expect(updatedJobCard.locator(`text=${initialReqCount + 1} 必要`)).toBeVisible()

    // 验证：此时“批次导入 (P03)”按钮已被激活解锁！
    const importBtnAfter = updatedJobCard.locator('button:has-text("批次导入 (P03)")')
    await expect(importBtnAfter).toBeEnabled()

    // 13. 点击进入批次导入
    await importBtnAfter.click()
    await expect(page.locator('text=批次导入 · P03')).toBeVisible()
  })

  // ==========================================================================
  // 测试组 2: 字段级与客户端校验异常拦截 (Validation Defense)
  // ==========================================================================

  test('TC102: 新建岗位字段必填与最小长度防御 (客户端非空拦截与服务端 422 容灾)', async ({
    page,
  }) => {
    await page.locator('[data-testid="btn-open-create-job"]').click()
    const modal = page.locator('[data-testid="modal-create-job"]')
    await expect(modal).toBeVisible()

    const submitBtn = page.locator('[data-testid="btn-submit-create-job"]')

    // 1. 尝试全空提交
    await submitBtn.click()
    await expect(page.locator('[data-testid="modal-error-alert"]')).toBeVisible()
    await expect(page.locator('[data-testid="modal-error-alert"]')).toContainText('请输入岗位名称')

    // 2. 仅填写岗位名称
    await page.locator('[data-testid="input-job-title"]').fill('测试异常校验岗位')
    await submitBtn.click()
    await expect(page.locator('[data-testid="modal-error-alert"]')).toContainText('请输入所属部门')

    // 3. 填写部门，但 JD 长度少于 10 个字符
    await page.locator('[data-testid="input-job-dept"]').fill('质量工程部')
    await page.locator('[data-testid="textarea-job-jd"]').fill('太短了')
    await submitBtn.click()
    await expect(page.locator('[data-testid="modal-error-alert"]')).toContainText(
      '岗位 JD 描述至少需要输入 10 个字符'
    )

    // 4. 关闭弹窗后重新打开，错误提示应被重置
    await page.locator('[data-testid="btn-cancel-create-job"]').click()
    await expect(modal).not.toBeVisible()

    await page.locator('[data-testid="btn-open-create-job"]').click()
    await expect(page.locator('[data-testid="modal-error-alert"]')).not.toBeVisible()
    await page.locator('[data-testid="btn-cancel-create-job"]').click()
  })

  // ==========================================================================
  // 测试组 3: 业务红线异常拦截 (PRD-001 规定必须保留 >=1 项必要条件)
  // ==========================================================================

  test('TC103: PRD-001 业务红线阻断 (清空所有必要条件时禁止冻结标准，且保留现场数据)', async ({
    page,
  }) => {
    // 1. 创建一个用于测试边界红线的岗位
    const timestamp = Date.now().toString().slice(-6)
    const testTitle = `红线校验测试岗位_${timestamp}`

    await page.locator('[data-testid="btn-open-create-job"]').click()
    await page.locator('[data-testid="input-job-title"]').fill(testTitle)
    await page.locator('[data-testid="input-job-dept"]').fill('合规风控部')
    await page.locator('[data-testid="textarea-job-jd"]').fill(
      '岗位要求：1. 本科以上学历；2. 3年微服务研发经验；3. 英语流利加分。'
    )
    await page.locator('[data-testid="btn-submit-create-job"]').click()

    // 2. 搜索并进入该岗位的配置标准页
    await page.locator('[data-testid="input-search-job"]').fill(testTitle)
    await page.locator('[data-testid="btn-search-job"]').click()
    const jobCard = page.locator(`[data-testid^="job-card-"]:has-text("${testTitle}")`).first()
    await jobCard.locator('button:has-text("配置标准 (P02)")').click()

    await expect(page.locator('[data-testid="criteria-page"]')).toBeVisible()

    // 3. 模型提取初始条件
    await page.locator('[data-testid="btn-extract-criteria"]').click()
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toBeVisible({
      timeout: 8000,
    })

    // 4. 模拟用户误操作：删除全部必要条件
    const reqList = page.locator('[data-testid="required-list"]')
    let removeBtns = reqList.locator('[data-testid^="btn-remove-criterion-"]')
    let count = await removeBtns.count()
    while (count > 0) {
      await removeBtns.first().click()
      removeBtns = reqList.locator('[data-testid^="btn-remove-criterion-"]')
      count = await removeBtns.count()
    }

    // 验证当前必要条件为 0
    await expect(reqList.locator('text=尚未配置必要条件')).toBeVisible()

    // 5. 尝试点击“确认并冻结标准”
    await page.locator('[data-testid="btn-confirm-criteria"]').click()

    // 6. 严苛断言：必须出现阻断警告，明确指出必须至少保留 1 项必要条件
    const errorBanner = page.locator('[data-testid="criteria-error-banner"]')
    await expect(errorBanner).toBeVisible()
    await expect(errorBanner).toContainText('至少 1 项必要条件')

    // 7. 现场保护断言：用户未丢失加分项配置，加分项依然完好在场
    const bonusList = page.locator('[data-testid="bonus-list"]')
    await expect(bonusList.locator('textarea')).not.toHaveCount(0)

    // 8. 纠正恢复：用户补录 1 项必要条件后再次冻结，应能够顺利通过
    await page.locator('[data-testid="btn-add-required"]').click()
    await reqList.locator('textarea').first().fill('统招本科及以上学历，软件工程相关专业')

    await page.locator('[data-testid="btn-confirm-criteria"]').click()
    await expect(page.locator('[data-testid="criteria-success-banner"]')).toBeVisible({
      timeout: 8000,
    })
    await expect(page.locator('[data-testid="criteria-version-badge"]')).toContainText(
      '基准版本 v1.0'
    )
  })

  // ==========================================================================
  // 测试组 4: 混沌与网络故障注入 (Fault Injection & Recovery)
  // ==========================================================================

  test('TC104: 网络异常与服务端 500 熔断容错及一键重试自愈', async ({ page }) => {
    // 1. 模拟网络异常/后端服务挂掉 (注入 500 状态码与异常 JSON)
    await page.route('**/api/v1/jobs*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10001,
          error: 'InternalServerError',
          message: '数据库连接超时，后端正在熔断降级 (Chaos Injected)',
          timestamp: new Date().toISOString(),
        }),
      })
    })

    // 2. 用户触发搜索/拉取操作
    await page.locator('[data-testid="btn-search-job"]').click()

    // 3. 验证页面绝不崩溃白屏，且渲染标准错误横幅
    const errorBanner = page.locator('[data-testid="error-banner"]')
    await expect(errorBanner).toBeVisible()
    await expect(errorBanner).toContainText('数据库连接超时，后端正在熔断降级')

    const retryBtn = page.locator('[data-testid="btn-retry-fetch"]')
    await expect(retryBtn).toBeVisible()

    // 4. 故障排除：解除网络劫持
    await page.unroute('**/api/v1/jobs*')

    // 5. 点击“重试”按钮触发自愈
    await retryBtn.click()

    // 6. 验证恢复正常展示：错误横幅消失，岗位列表成功加载
    await expect(errorBanner).not.toBeVisible()
    await expect(page.locator('[data-testid="jobs-grid"]')).toBeVisible()
  })

  // ==========================================================================
  // 测试组 5: 搜索无结果空状态与多状态过滤
  // ==========================================================================

  test('TC105: 搜索空状态兜底与就绪度分段筛选', async ({ page }) => {
    // 1. 检索一个绝对不存在的岗位名称
    await page.locator('[data-testid="input-search-job"]').fill('___NON_EXISTENT_JOB_QUERY_XYZ___')
    await page.locator('[data-testid="btn-search-job"]').click()

    // 2. 验证空状态展示
    const emptyState = page.locator('[data-testid="empty-state"]')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toContainText('未检索到包含该关键词的岗位')

    // 3. 清空搜索词
    await page.locator('[data-testid="input-search-job"]').fill('')
    await page.locator('[data-testid="btn-search-job"]').click()
    await expect(emptyState).not.toBeVisible()
    await expect(page.locator('[data-testid="jobs-grid"]')).toBeVisible()

    // 4. 切换状态分段
    await page.locator('[data-testid="filter-status-ready"]').click()
    // 列表依然正常渲染
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible()

    await page.locator('[data-testid="filter-status-needs_criteria"]').click()
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible()

    await page.locator('[data-testid="filter-status-all"]').click()
    await expect(page.locator('[data-testid="jobs-grid"]')).toBeVisible()
  })
})
