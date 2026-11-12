# RES-003 智能简历筛选对抗性审核与人机协同解决方案调研

| 属性 | 内容 |
|---|---|
| 日期 | 2026-11-04 |
| 状态 | 外部工程实践检索完成；领域模型契约与解决方案已收敛 |
| 依据 | PRD-001 v2.1、SPEC-001 v0.1、需求调研与评审规范 (requirements-discovery.md) |
| 关联技能 | `schema-architect`、`frontend-code-reviewer` |

---

## 1. 联网检索与外部证据记录

### 检索 1：AI 候选人初筛、证据驱动评分与人机协同 (HITL) 实践
- **检索词**：`AI resume screening evidence-based human-in-the-loop ATS candidate match score`
- **检索日期**：2026-11-04
- **核心来源**：
  - Composio / Metaview ATS AI Evaluation Architecture (`composio.dev`, `metaview.ai`)
  - TestGorilla / Curriculo Evidence-Based Matching Guide (`testgorilla.com`, `curriculo.me`)
  - Articsledge / Mind-Interview Human-in-the-loop Governance (`articsledge.com`, `mind-interview.com`)
- **实际读到的工程事实**：
  1. 现代招聘系统彻底摒弃黑盒大模型单次打分，转为由结构化 Rubric 驱动的引文证据模型（Inline Citations Mapping）；
  2. 评分由确定性程序规则基于提取的证据推导，模型仅提供事实提取与符合度标记（Met/Unmet/Unknown）；
  3. 严格禁止算法静默自动淘汰（Zero Auto-Rejection），必须保留人工复核（HR Recruiter Override）与决策审计。

### 检索 2：补充材料重评、门槛校准与审计追踪实践
- **检索词**：`candidate screening ATS re-evaluation supplemental information audit trail score calibration`
- **检索日期**：2026-11-04
- **核心来源**：
  - Cadient Talent / HireCarta Score Calibration & Drift Prevention (`cadient.ai`, `hirecarta.com`)
  - SkillFuel / iSolved Audit Trail & Re-Evaluation Protocols (`skillfuel.com`, `isolvedhcm.com`)
  - Xovo / Truffle Multi-Signal Candidate Profile Architecture (`xovotechnologies.com`, `hiretruffle.com`)
- **实际读到的工程事实**：
  1. **Score Calibration（门槛校准）**：招聘系统绝不能将推荐阈值写死在底层代码中（如硬编码 `>=70`），不同岗位（研发、销售、高管）的门槛与覆盖率要求差异极大，未校准前应标记为“待校准规则”或允许岗位级动态配置；
  2. **Targeted Re-Evaluation（定向补充重评）**：HR 针对存疑（Unknown）项或电话核实补充信息时，必须显式关联到对应的评估条件（Rubric Item），禁止使用“全局文本输入导致所有不合规条件一键洗白”的反向注入漏洞；
  3. **Audit Trail & Immutable Snapshots**：每次补充材料与重评生成独立的 Evaluation 快照，保留版本变更历史，旧的人工决定在版本变动后提示“已失效/需二次确认”。

---

## 2. 解决方案设计契约 (基于 schema-architect)

依据上述外部最佳实践及项目 PRD-001，制定以下 4 项系统解决方案：

### 方案 1：解耦硬编码阈值，引入“岗位推荐规则配置 / 待校准状态”
- **现状硬伤**：`rules.ts` 中硬编码 `matchScore >= 70 && coverageRate >= 60`。
- **契约重构**：
  - 领域对象 `CriteriaVersion` 或 `Job` 增加推荐配置项：
    ```typescript
    export interface CriteriaRecommendationRule {
      minMatchScore: number // 如 70
      minCoverageRate: number // 如 60
      isCalibrated: boolean // 是否已通过样本校准冻结
    }
    ```
  - 若 `isCalibrated === false` 或未配置门槛，分组逻辑判定为 `suggestedGroup = 'other'`，界面显式呈现为“待配置推荐规则 / 待样本校准”，不可伪造系统推荐。

### 方案 2：结构化定向补充重评契约 (Targeted Re-Evaluation Contract)
- **现状硬伤**：`submitSupplement` 输入一段文本，所有 `unmet` 和 `unknown` 全部强行改为 `met`。
- **契约重构**：
  - 动作输入契约升级：
    ```typescript
    submitSupplement: (
      itemId: string,
      targetCriterionIds: string[], // 明确指定本次补充针对的具体条件
      supplementText: string,
      targetVerdict: 'met' | 'unmet' // 核实后的裁定
    ) => void
    ```
  - **业务规则保护**：
    1. 只能对 `targetCriterionIds` 包含的条件进行状态更新；
    2. 未选中的条件严格保留原判定；
    3. 对于原本为 `unmet` 的不可放宽硬性门槛，若 HR 强行反转为 `met`，必须要求输入详实的复核依据，并在理由中显式标注“HR人工特批覆核”。

### 方案 3：批次管理闭环与批次切换器 (Batch Context & Selector)
- **现状硬伤**：P04 页面永远 `batchList[0]`。
- **契约重构**：
  - P04 页面读取 `currentBatchId`，并依据 `currentBatchId` 获取当前批次；
  - 顶栏或工作台增加批次切换下拉菜单（`BatchSelector`），支持在“第 1 批次”、“第 2 批次”等多个批次间自由无缝切换；
  - 统计卡片与候选人列表跟随当前选中批次响应式刷新。

### 方案 4：数据驱动的原件预览与引文动态高亮
- **现状硬伤**：左侧阅读器写死李梦瑶/赵浩然等静态文字与 `ev-1-1` 静态 ID 判断。
- **契约重构**：
  - 阅读器内容直接从当前选中的 `item.candidateId`、`item.resumeDocumentId` 中读取真实/模拟段落数据；
  - 高亮判断基于 `activeEvidenceId` 查找对应的 `Evidence` 实体，使用 `quote` 文本包含匹配或统一高亮层，新导入的批次也能正常渲染正文与页码。

### 方案 5：清除无用鸡肋功能
- 移除 `Header.tsx` 中无事件绑定的静态“标准主题”按钮；
- 优化新批次导入（`importBatch`）的模拟生成器，生成具备业务多样性（1 个推荐、1 个待核实、1 个条件冲突、1 个解析失败）的真实测试场景，禁止全员 100 分。

