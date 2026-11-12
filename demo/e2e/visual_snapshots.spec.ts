import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'e2e-screenshots')

test.describe('全页面视觉快照与多模态审计套件', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    }
  })

  test('截取所有核心页面与交互状态高清真机渲染帧', async ({ page }) => {
    // 视口设为专业 Mac Retina 级 1440x900
    await page.setViewportSize({ width: 1440, height: 900 })

    // 1. P04 批次工作台（极光明亮白模式）
    await page.goto('/')
    await expect(page.locator('text=resume.ai')).toBeVisible()
    await page.waitForTimeout(600)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01_workbench_light.png'),
      fullPage: true,
    })

    // 2. P04 批次工作台（深空雨夜暗色模式）
    const themeBtn = page.locator('button[title*="切换"]')
    await themeBtn.click()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02_workbench_dark.png'),
      fullPage: true,
    })

    // 切回明亮模式继续后续测试
    await themeBtn.click()
    await page.waitForTimeout(300)

    // 3. P04 条件冲突队列筛选视图
    await page.click('[data-testid="filter-conflict"]')
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03_workbench_conflict_queue.png'),
      fullPage: false,
    })

    // 4. P04 异常待办队列视图
    await page.click('[data-testid="filter-failed"]')
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04_workbench_failed_queue.png'),
      fullPage: false,
    })

    // 5. P05 候选人复核与原件证据对照模态（双栏）
    await page.click('[data-testid="filter-all"]')
    await page.locator('[data-testid="btn-review-item-1"]').click()
    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()
    // 联动定位证据 P.2
    const evBtn = modal.locator('button:has-text("P.2 ↗")').first()
    await evBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05_review_modal_p05.png'),
      fullPage: false,
    })

    // 6. P05 补充材料与重评抽屉
    await modal.locator('button:has-text("补充材料并重评")').click()
    await expect(modal.locator('text=HR 人工事实补充与重评')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06_review_supplement_drawer.png'),
      fullPage: false,
    })

    // 关闭抽屉与模态
    await modal.locator('button:has-text("取消")').click()
    await modal.locator('button[title="关闭"]').click()

    // 7. P02 岗位标准配置页面
    await page.click('[data-testid="nav-criteria"]')
    await expect(page.locator('text=岗位标准配置 · P02')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07_criteria_page_p02.png'),
      fullPage: true,
    })

    // 8. P03 批次导入页面（含校验拦截提示）
    await page.click('[data-testid="nav-import"]')
    await expect(page.locator('text=批次导入 · P03')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '08_import_page_p03.png'),
      fullPage: true,
    })
  })
})

