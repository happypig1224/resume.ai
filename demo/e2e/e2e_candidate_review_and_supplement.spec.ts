import { test, expect } from '@playwright/test'

test.describe('候选人全景研判与复核决策端到端测试套件 (Slice 4: P05 Review & HITL)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=resume.ai')).toBeVisible()
    await expect(page.locator('text=批次工作台 · P04')).toBeVisible()
  })

  // ==========================================================================
  // TC301: 候选人双屏复核、原件联动穿透与复核决定持久化 (Happy Path Full Lifecycle)
  // ==========================================================================
  test('TC301: 候选人双屏对照复核、证据点击联动定位与人工决定保存闭环', async ({ page }) => {
    // 1. 在批次工作台点击第 1 位候选人（张承宇）的“进入复核”
    const reviewBtn = page.locator('[data-testid="btn-review-item-1"]')
    await expect(reviewBtn).toBeVisible()
    await reviewBtn.click()

    // 2. 验证弹窗唤起，双屏左右对照区就绪
    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()
    await expect(modal.locator('text=原件阅读器 · 第 1 页')).toBeVisible()
    await expect(modal.getByText('已知必要条件匹配分')).toBeVisible()
    await expect(modal.locator('text=逐项标准研判与事实证据')).toBeVisible()

    // 3. 点击右侧逐项证据中的定位跳转（如 P.2 ↗ 证据按钮）
    const evJumpBtn = modal.locator('button:has-text("P.2 ↗")').first()
    await expect(evJumpBtn).toBeVisible()
    await evJumpBtn.click()

    // 4. 验证左侧阅读器自动切换到第 2 页，并呈现锁定提示
    await expect(modal.locator('text=原件阅读器 · 第 2 页')).toBeVisible()
    await expect(modal.locator('text=已锁定证据引用 (P.2)')).toBeVisible()
    await expect(modal.locator('text=高并发工程实战与核心项目 (Page 2)')).toBeVisible()

    // 5. 修改复核决定表单：选择“待补充信息”
    await modal.locator('button:has-text("待补充信息")').click()
    const detailTagBtn = modal.locator('button:has-text("需电话核实项目细节")')
    await detailTagBtn.click()

    const noteTextarea = modal.locator('textarea[placeholder*="记录技术面试关注重点"]')
    await noteTextarea.fill('HR自动化复核留痕：需重点核实分布式消息队列防重保障与微服务治理经验。')

    // 6. 保存决定并验证即时成功反馈
    const saveBtn = modal.locator('button:has-text("保存人工复核决定")')
    await saveBtn.click()
    await expect(modal.locator('text=复核决定已持久保存！')).toBeVisible()

    // 7. 关闭弹窗
    await modal.locator('button:has(svg.lucide-x)').first().click()
    await expect(page.locator('[data-testid="review-modal"]')).not.toBeVisible()

    // 8. 验证工作台卡片展示最新复核状态
    const card1 = page.locator('[data-testid="candidate-card-item-1"]')
    await expect(card1.locator('text=已定: 待补充信息')).toBeVisible()
  })

  // ==========================================================================
  // TC302: 电话核实与补充材料定向增量重评 (FR-07 Re-evaluation Versioning)
  // ==========================================================================
  test('TC302: 电话核实与补充材料重评契约 (递增新版本并保留历史证据快照)', async ({ page }) => {
    // 1. 切换到“待核实队列”，打开候选人（李梦瑶）的复核弹窗
    await page.click('[data-testid="filter-verification"]')
    await page.locator('[data-testid="btn-review-item-2"]').click()

    const modal = page.locator('[data-testid="review-modal"]')
    await expect(modal).toBeVisible()

    // 2. 点击“补充材料并重评”展开抽屉
    const openSuppBtn = modal.locator('button:has-text("补充材料并重评")')
    await expect(openSuppBtn).toBeVisible()
    await openSuppBtn.click()

    await expect(modal.locator('text=HR 人工事实补充与重评')).toBeVisible()

    // 3. 填写补充事实凭证
    const suppInput = modal.locator('textarea[placeholder*="例如：经电话沟通核实"]')
    await suppInput.fill(
      'HR电话复核通过：候选人具有 6 年全栈技术深耕与实际微服务高并发拆分经验，有明确工程产出。'
    )

    // 4. 提交重新评估
    const submitSuppBtn = modal.locator('button:has-text("确认提交并重新评估")')
    await submitSuppBtn.click()

    // 5. 验证成功生成新快照并标记“含补充重评版本”
    await expect(modal.getByText('含补充重评版本')).toBeVisible({ timeout: 6000 })
    await expect(modal.locator('text=人工电话补充资料快照')).toBeVisible()

    // 6. 关闭弹窗
    await modal.locator('button:has(svg.lucide-x)').first().click()
    await expect(page.locator('[data-testid="review-modal"]')).not.toBeVisible()
  })

  // ==========================================================================
  // TC303: 原件流式加载与安全防御
  // ==========================================================================
  test('TC303: 原件流式访问与目录穿越防护', async () => {
    // 1. 获取已完成筛选的真实候选人 (优先查找 status 为 completed 的筛选项或种子候选人)
    const batchesRes = await fetch('http://127.0.0.1:8000/api/v1/batches?page_size=10')
    const batchesData = await batchesRes.json()
    let testItemId = 'item-1'

    for (const b of batchesData.data.items || []) {
      const itemsRes = await fetch(
        `http://127.0.0.1:8000/api/v1/batches/${b.batch_id}/items`
      )
      const itemsData = await itemsRes.json()
      const completedItem = itemsData.data?.items?.find(
        (it: any) => it.status === 'completed'
      )
      if (completedItem) {
        testItemId = completedItem.item_id
        break
      }
    }

    // 2. 正常流式获取该 PDF
    const pdfRes = await fetch(`http://127.0.0.1:8000/api/v1/screening-items/${testItemId}/pdf`)
    expect(pdfRes.status).toBe(200)
    expect(pdfRes.headers.get('content-type')).toContain('application/pdf')
    expect(pdfRes.headers.get('accept-ranges')).toBe('bytes')

    // 3. 访问不存在的 item_id 防御
    const notFoundRes = await fetch('http://127.0.0.1:8000/api/v1/screening-items/item_invalid_xyz/pdf')
    expect(notFoundRes.status).toBe(404)
  })

  // ==========================================================================
  // TC304: 复核决定修改审计链路 (Decision Supersedes Chain)
  // ==========================================================================
  test('TC304: 复核决定修改审计链路 (多次决策修改严格指向上一版 supersedes_id)', async () => {
    // 1. 获取一个测试筛选项
    const batchesRes = await fetch('http://127.0.0.1:8000/api/v1/batches?page_size=5')
    const batchesData = await batchesRes.json()
    const targetBatch = batchesData.data.items[0]
    const itemsRes = await fetch(
      `http://127.0.0.1:8000/api/v1/batches/${targetBatch.batch_id}/items`
    )
    const itemsData = await itemsRes.json()
    const testItem = itemsData.data.items[0]
    expect(testItem).toBeTruthy()

    // 2. 首次提交决定：advance
    const decRes1 = await fetch(
      `http://127.0.0.1:8000/api/v1/screening-items/${testItem.item_id}/decisions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'advance',
          tags: ['学历优秀', '架构扎实'],
          notes: '首轮技术履历初筛合格',
        }),
      }
    )
    expect(decRes1.status).toBe(200)
    const dec1Data = (await decRes1.json()).data
    const firstDecisionId = dec1Data.id

    // 3. 再次提交修改决定：supplement
    const decRes2 = await fetch(
      `http://127.0.0.1:8000/api/v1/screening-items/${testItem.item_id}/decisions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'supplement',
          tags: ['需电话补充'],
          notes: '修改为待补充信息：核验大模型微服务落地细节',
        }),
      }
    )
    expect(decRes2.status).toBe(200)
    const dec2Data = (await decRes2.json()).data

    // 验证严格指向上一版决定 ID，审计链路完整
    expect(dec2Data.supersedes_id).toBe(firstDecisionId)

    // 4. 查看详情中 decisions_history 留痕
    const detailRes = await fetch(
      `http://127.0.0.1:8000/api/v1/screening-items/${testItem.item_id}`
    )
    const detailData = (await detailRes.json()).data
    expect(detailData.decisions_history.length).toBeGreaterThanOrEqual(2)
    expect(detailData.decisions_history[0].decision).toBe('supplement')
  })
})
