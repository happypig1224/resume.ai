import { test, expect } from '@playwright/test'

test.describe('简历筛选助手 MVP - UI/UX 自动化测试套件', () => {
  test.beforeEach(async ({ page }) => {
    // 每次打开前重置并访问
    await page.goto('/')
    await expect(page.locator('text=resume.ai')).toBeVisible()
    await expect(page.locator('[data-testid="system-status-indicator"]')).toBeVisible()
  })

  test('TC01: 工作台初态展示、计分规则与队列分段筛选', async ({ page }) => {
    // 1. 验证批次总览统计指标
    await expect(page.locator('text=批次工作台 · P04')).toBeVisible()
    await expect(page.locator('[data-testid="stat-all"]')).toBeVisible()
    await expect(page.locator('[data-testid="stat-completed"]')).toBeVisible()
    await expect(page.locator('[data-testid="stat-failed"]')).toBeVisible()

    // 2. 验证候选人张承宇（推荐队列，100分，覆盖率100%）
    const card1 = page.locator('[data-testid="candidate-card-item-1"]')
    await expect(card1).toBeVisible()
    await expect(card1.locator('h4:has-text("张承宇")')).toBeVisible()
    await expect(card1.getByText('系统推荐')).toBeVisible()
    await expect(card1.getByText('已定: 推进沟通')).toBeVisible()

    // 3. 验证候选人周紫晴（全部未知，证据不足暂不评分）
    const card5 = page.locator('[data-testid="candidate-card-item-5"]')
    await expect(card5.locator('h4:has-text("周紫晴")')).toBeVisible()
    await expect(card5.getByText('证据不足 · 暂不评分')).toBeVisible()

    // 4. 切换到“推荐队列”分段
    await page.click('[data-testid="filter-recommended"]')
    await expect(page.locator('[data-testid="candidate-card-item-1"]')).toBeVisible()
    await expect(page.locator('[data-testid="candidate-card-item-3"]')).not.toBeVisible()

    // 5. 切换到“条件冲突队列”分段
    await page.click('[data-testid="filter-conflict"]')
    const card3 = page.locator('[data-testid="candidate-card-item-3"]')
    await expect(card3).toBeVisible()
    await expect(card3.getByText('条件冲突')).toBeVisible()
    await expect(page.locator('[data-testid="candidate-card-item-1"]')).not.toBeVisible()

    // 6. 切换到“异常待办”分段
    await page.click('[data-testid="filter-failed"]')
    const card4 = page.locator('[data-testid="candidate-card-item-4"]')
    await expect(card4).toBeVisible()
    await expect(card4.getByText('未生成用于排序的低分')).toBeVisible()
    await expect(page.locator('[data-testid="btn-retry-item-4"]')).toBeVisible()
  })

  test('TC02: 异常单项重试与状态恢复闭环', async ({ page }) => {
    // 切换到异常待办
    await page.click('[data-testid="filter-failed"]')
    const retryBtn = page.locator('[data-testid="btn-retry-item-4"]')
    await expect(retryBtn).toBeVisible()

    // 点击重试，触发新 attempt
    await retryBtn.click()

    // 等待仿真多模态重试完成并切回全部候选人
    await page.waitForTimeout(1400)
    await page.click('[data-testid="filter-all"]')

    // 验证王文博已恢复为评估完成，不再是失败状态，并出现复核按钮
    await expect(page.locator('[data-testid="candidate-card-item-4"]')).toBeVisible()
    await expect(page.locator('[data-testid="btn-review-item-4"]')).toBeVisible()
  })

  test('TC03: P05 候选人复核详情、原件联动定位与人工决定保存', async ({ page }) => {
    // 精准点击张承宇的“进入复核”
    await page.locator('[data-testid="btn-review-item-1"]').click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()

    // 验证弹窗弹出，左侧原件预览，右侧研判
    await expect(modal.locator('text=原件阅读器 · 第 1 页')).toBeVisible()
    await expect(modal.getByText('已知必要条件匹配分')).toBeVisible()
    await expect(modal.locator('text=逐项标准研判与事实证据')).toBeVisible()

    // 点击右侧证据定位按钮（如 P.2 证据）
    const evBtn = modal.locator('button:has-text("P.2 ↗")').first()
    await evBtn.click()

    // 验证左侧原件阅读器自动跳转到第 2 页
    await expect(modal.locator('text=原件阅读器 · 第 2 页')).toBeVisible()
    await expect(modal.locator('text=高并发工程实战与核心项目 (Page 2)')).toBeVisible()

    // 测试修改人工复核决定：修改为“待补充信息”
    await modal.locator('button:has-text("待补充信息")').click()
    await modal.locator('button:has-text("需电话核实项目细节")').click()
    await modal.locator('textarea[placeholder*="记录技术面试关注重点"]').fill('自动化测试录入：重点核验全栈架构与容器化实战经历。')

    // 点击保存决定
    await modal.locator('button:has-text("保存人工复核决定")').click()

    // 验证保存成功的即时反馈
    await expect(modal.locator('text=复核决定已持久保存！')).toBeVisible()

    // 关闭模态
    await modal.locator('[data-testid="btn-close-review"]').click()
    await expect(page.locator('[data-testid="review-modal"]')).not.toBeVisible()
  })

  test('TC04: 电话核实与补充材料重评流程 (保留历史评估)', async ({ page }) => {
    // 切换到待核实队列，选择李梦瑶
    await page.click('[data-testid="filter-verification"]')
    await page.locator('[data-testid="btn-review-item-2"]').click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()

    // 打开补充资料抽屉
    await modal.locator('button:has-text("补充材料并重评")').click()
    await expect(modal.locator('text=HR 人工事实补充与重评')).toBeVisible()

    // 输入补充事实凭证
    await modal.locator('textarea[placeholder*="例如：经电话沟通核实"]').fill(
      'HR电话复核核验通过：候选人具备真实 6 年全栈技术深耕经历，且有大模型检索系统项目沉淀。'
    )

    // 提交重评
    await modal.locator('button:has-text("确认提交并重新评估")').click()

    // 验证重评后生成新快照
    await expect(modal.getByText('含补充重评版本')).toBeVisible({ timeout: 5000 })
    await expect(modal.locator('text=人工电话补充资料快照')).toBeVisible()

    // 关闭弹窗
    await modal.locator('[data-testid="btn-close-review"]').click()
    await expect(page.locator('[data-testid="review-modal"]')).not.toBeVisible()
  })

  test('TC05: P02 岗位标准配置与不可变版本确认', async ({ page }) => {
    // 导航到岗位标准配置
    await page.click('[data-testid="nav-criteria"]')
    await expect(page.locator('text=岗位标准配置 · P02')).toBeVisible()
    await expect(page.locator('text=岗位 JD 原文')).toBeVisible()

    // 点击修改为新草稿
    await page.click('button:has-text("修改为新草稿")')
    await expect(page.locator('button:has-text("确认并冻结标准")')).toBeVisible()

    // 点击模型提取条件
    await page.click('button:has-text("模型提取条件")')
    await expect(page.locator('text=已依据岗位 JD 自动解析')).toBeVisible({ timeout: 5000 })

    // 确认并冻结
    await page.click('button:has-text("确认并冻结标准")')
    await expect(page.locator('text=标准已成功确认并锁定为不可变版本').first()).toBeVisible()
  })

  test('TC06: P03 批次导入与文件格式安全校验拦截', async ({ page }) => {
    // 导航到批次导入
    await page.click('[data-testid="nav-import"]')
    await expect(page.locator('text=批次导入 · P03')).toBeVisible()

    // 验证列表中检测到非法文件 (.docx) 时的错误拦截提示
    await expect(page.locator('text=仅支持 PDF 格式文件')).toBeVisible()
    const submitBtn = page.locator('button:has-text("确认受理并开始筛选")')
    await expect(submitBtn).toBeDisabled()

    // 点击一键移除错误文件
    await page.click('button:has-text("一键移除所有错误文件")')
    await expect(page.locator('text=仅支持 PDF 格式文件')).not.toBeVisible()

    // 提交合规批次
    await submitBtn.click()

    // 验证提交后自动流转至批次工作台
    await expect(page.locator('text=批次工作台 · P04')).toBeVisible()
  })
})
