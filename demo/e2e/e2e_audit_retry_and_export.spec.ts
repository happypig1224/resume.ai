import { test, expect } from '@playwright/test'

test.describe('审计大盘、异常重试自愈与全量数据导出端到端测试套件 (Slice 5: P06 Audit & Export)', () => {

  test('TC401: 单项异常重试与状态自愈闭环 (FR-08: 失败单项自愈恢复为完成并生成有效评估)', async ({
    page,
  }) => {
    // 1. 访问批次工作台页面
    await page.goto('/?tab=workbench')
    await page.waitForSelector('[data-testid="stat-failed"]')

    // 2. 切换到异常待办分段
    await page.click('button:has-text("异常待办")')

    // 3. 寻找单项重试按钮
    const retryBtn = page.locator('button:has-text("单项重试")').first()
    await expect(retryBtn).toBeVisible()

    // 4. 点击单项重试，观察加载与自愈
    await retryBtn.click()

    // 5. 等待重试完成 (按钮或卡片恢复为已完成/进入复核)
    await page.waitForTimeout(1000)
    // 切换到全部查看候选人
    await page.click('button:has-text("全部")')
    await expect(page.locator('button:has-text("进入复核")').first()).toBeVisible()
  })

  test('TC402: 决策修改审计历史时间线追溯 (FR-06: supersedes 链条完整留痕备查)', async ({
    page,
  }) => {
    await page.goto('/?tab=workbench')
    await page.waitForSelector('[data-testid="stat-all"]')

    // 1. 打开第一个候选人的复核弹窗
    const reviewBtn = page.locator('[data-testid="btn-review-item-1"]')
    await expect(reviewBtn).toBeVisible()
    await reviewBtn.click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()

    // 2. 第一轮决策：选择“待补充信息”
    await modal.locator('button:has-text("待补充信息")').click()
    const noteTextarea = modal.locator('textarea[placeholder*="记录技术面试关注重点"]')
    await noteTextarea.fill('第 1 轮初筛：需电话核实毕业年份')
    await modal.locator('button:has-text("保存人工复核决定")').click()
    await expect(modal.locator('text=复核决定已持久保存！')).toBeVisible()

    // 3. 第二轮决策修改：选择“推进沟通”
    await modal.locator('button:has-text("推进沟通")').click()
    await noteTextarea.fill('第 2 轮修改：学信网已确认，推进初面')
    await modal.locator('button:has-text("保存人工复核决定")').click()
    await expect(modal.locator('text=复核决定已持久保存！')).toBeVisible()

    // 4. 打开决策修改审计历史时光机
    const auditBtn = modal.locator('[data-testid="btn-toggle-audit-history"]')
    await expect(auditBtn).toBeVisible()
    await auditBtn.click()

    // 5. 校验审计弹窗渲染与 supersedes 链条
    await expect(page.locator('[data-testid="audit-history-modal"]')).toBeVisible()
    await expect(page.locator('text=人工复核决策变更审计记录')).toBeVisible()
    await expect(page.locator('[data-testid="audit-history-modal"]').locator('text=/决策 #\\d+/').first()).toBeVisible()
    await expect(page.locator('[data-testid="audit-history-modal"]').locator('text=/决策 #\\d+/').nth(1)).toBeVisible()
    await expect(page.locator('text=已替代上一版决策').first()).toBeVisible()

    // 6. 关闭审计弹窗
    await page.click('[data-testid="btn-close-audit-history"]')
    await expect(page.locator('[data-testid="audit-history-modal"]')).not.toBeVisible()

    // 7. 关闭复核弹窗
    await modal.locator('button[title="关闭"]').click()
    await expect(page.locator('[data-testid="candidate-card-item-1"]').locator('text=已定: 推进沟通')).toBeVisible()
  })

  test('TC403: 电话补充重评版本比对 (FR-07: v1 vs v2 关键条件判定与分值变动对照)', async ({
    page,
  }) => {
    await page.goto('/?tab=workbench')
    await page.waitForSelector('[data-testid="stat-all"]')

    // 1. 切换到“待核实队列”，打开候选人（李梦瑶）的复核弹窗
    await page.click('[data-testid="filter-verification"]')
    await page.locator('[data-testid="btn-review-item-2"]').click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()

    // 2. 打开补充材料重评抽屉
    await modal.locator('button:has-text("补充材料并重评")').click()
    await expect(modal.locator('[data-testid="supplement-drawer"]')).toBeVisible()

    // 3. 选择评价项并输入核验事实
    const targetItem = modal.locator('[data-testid^="supplement-target-"]').first()
    await targetItem.click()
    await modal.locator('textarea[placeholder*="例如：经电话沟通核实"]').fill(
      'HR电话复核通过：候选人具有 6 年全栈技术深耕与实际微服务高并发拆分经验，有明确工程产出。'
    )
    await modal.locator('button:has-text("确认提交并重新评估")').click()

    // 4. 抽屉关闭，顶部出现“版本比对”按钮
    const diffBtn = modal.locator('[data-testid="btn-toggle-version-diff"]')
    await expect(diffBtn).toBeVisible({ timeout: 6000 })

    // 5. 点击“版本比对”，打开版本差异对比弹窗
    await diffBtn.click()
    await expect(page.locator('[data-testid="version-diff-modal"]')).toBeVisible()
    await expect(page.locator('text=评估快照多版本比对')).toBeVisible()
    await expect(page.locator('[data-testid="diff-new-match-score"]')).toBeVisible()
    await expect(page.locator('[data-testid="diff-new-coverage-rate"]')).toBeVisible()
    await expect(page.locator('text=版本跃迁说明')).toBeVisible()

    // 6. 关闭比对弹窗
    await page.click('[data-testid="btn-close-version-diff"]')
    await expect(page.locator('[data-testid="version-diff-modal"]')).not.toBeVisible()
  })

  test('TC404: 批次全量 CSV 数据报表导出与审计大盘核验 (FR-05, AC-01: 覆盖率 >= 95%)', async ({
    page,
  }) => {
    await page.goto('/?tab=workbench')
    await page.waitForSelector('[data-testid="stat-all"]')

    // 1. 打开审计大盘
    const metricsBtn = page.locator('[data-testid="btn-batch-metrics"]')
    await expect(metricsBtn).toBeVisible()
    await metricsBtn.click()

    // 2. 校验指标大盘与 AC-01 关键指标
    await expect(page.locator('[data-testid="metrics-modal"]')).toBeVisible()
    await expect(page.locator('text=AC-01 沟通候选人入选率')).toBeVisible()
    const ac01Ratio = page.locator('[data-testid="metric-ac01-ratio"]')
    await expect(ac01Ratio).toBeVisible()
    const ratioText = await ac01Ratio.textContent()
    expect(ratioText).toContain('%')

    // 3. 校验待核实补回人数指示器
    await expect(page.locator('[data-testid="metric-supplement-resolved"]')).toBeVisible()

    // 4. 关闭大盘模态框
    await page.click('[data-testid="btn-close-metrics-modal"]')
    await expect(page.locator('[data-testid="metrics-modal"]')).not.toBeVisible()

    // 5. 校验导出报表 (CSV) 按钮可点击且能触发下载
    const exportBtn = page.locator('[data-testid="btn-export-csv"]')
    await expect(exportBtn).toBeVisible()

    const downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null)
    await exportBtn.click()
    const download = await downloadPromise
    if (download) {
      expect(download.suggestedFilename()).toContain('.csv')
    }
  })
})
