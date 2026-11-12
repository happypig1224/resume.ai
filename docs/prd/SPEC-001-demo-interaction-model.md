# SPEC-001 简历筛选 Demo 对象与交互规格

| 属性 | 内容 |
|---|---|
| 版本 / 日期 | 0.1 / 2026-10-31 |
| 状态 | 设计提案；已有业务规则继承 PRD，新增交互约定供 Demo 评审 |
| 读者 / 责任角色 | 产品、设计、前端、测试；产品维护，HR 评审业务语义 |
| 依据 | PRD-001 v2.1、RES-002 已确认决定、本轮用户要求 |
| 范围 | 对象模型、页面输入输出、导航依赖、组件状态、前端状态管理与场景验收 |
| 不包含 | HTTP 接口、数据库表、后端部署架构、真实模型接入实现 |

本规格把已确认需求转为可评审的前端行为。对象字段、页面划分和状态机是工程提案，不代表新增业务决定已经确认。使用合成资料演示；阈值与剩余分组规则仍待确认。本文没有新增外部资料核验，不声称行业认证或实际效果验证。

## 1. 对象模型

ID 为稳定字符串，时间使用带时区时间戳；可空字段使用 null，不以 0、空串代替未知。所有关联通过 ID 保存，展示名称不充当标识。下表是前端领域对象，不是数据库表。

| 对象 | 最小字段及类型 | 关系及约束 |
|---|---|---|
| Job 岗位 | id、title:string、jdText:string、currentCriteriaVersionId:string或null | 一个岗位多版标准、多批次；草稿允许未指定有效版本 |
| CriteriaVersion 标准版本 | id、jobId、version:number、status:draft/confirmed、criteria:Criterion[]、confirmedAt:时间或null | 确认后为不可变快照；修改产生新草稿，不改变旧批次 |
| Criterion 条件 | id、description:string、kind:required/bonus、importance:high/medium/low、constraint:strict/flexible或null | necessary 对应 required；bonus 的 constraint 为 null；权重由重要性派生为 3/2/1，不另存可编辑百分比 |
| Batch 批次 | id、jobId、criteriaVersionId、itemIds:string[]、createdAt | 只绑定一版已确认标准；最多 50 个受理项；处理状态由各项派生 |
| ScreeningItem 筛选项 | id、batchId、candidateId、resumeDocumentId、currentEvaluationId:string或null | 一次导入的筛选工作对象；不按姓名自动合并；跨批去重待决 |
| Candidate 候选人 | id、displayName:string或null | 名字未知时显示“未识别姓名”；不是解析失败；Demo 一份简历对应独立候选人，身份合并不在本期设计中 |
| Document 材料 | id、candidateId、kind:resume/supplement、name、mediaType、sizeBytes:number、pageCount:number或null、sourceLabel、createdAt | PDF 与文本补充区分；原始资料不可被解析结果覆盖；补充资料入口见第 8 节假设 |
| Evidence 证据 | id、documentId、page:number或null、quote:string、locator:对象或null、method:text/ocr/multimodal/manual | PDF 页码从 1 起；文本补充使用段落定位而非伪造页码；locator 可缺，不能因此假装已高亮原文 |
| Evaluation 评估快照 | id、itemId、criteriaVersionId、documentIds:string[]、ruleVersion、modelVersion、promptVersion、findings:Finding[]、createdAt | 每次重评新建；输入材料快照明确；只接受本候选人证据 |
| Finding 条件判断 | criterionId、verdict:met/unmet/unknown、evidenceIds:string[]、reason:string | 每项条件恰好一项判断；unknown 可以无证据；met/unmet 必须有可定位依据；矛盾材料的业务裁决待决 |
| ProcessingRun 处理运行 | id、itemId、attempt:number、status、stage、error:对象或null、startedAt、updatedAt | 一个筛选项多次运行；当前 runId 防止旧响应覆盖；error 含 code、message、retryable |
| ReviewDecision 人工决定 | id、itemId、evaluationId、outcome:advance/need_info/hold、reasonTags:string[]、note:string、createdAt、supersedesId:string或null | 追加历史；未复核由无决定派生；新评估不迁移旧决定的关联 |

对象关系：Job → CriteriaVersion；Job → Batch → ScreeningItem → Candidate；Candidate → Document → Evidence；ScreeningItem → ProcessingRun / Evaluation；Evaluation → Finding → Evidence；ReviewDecision → Evaluation。

评分、覆盖率、已知项数和系统分组均由评估快照及对应规则派生；“人工决定”“系统分组”“处理状态”分别管理，不能共用一个 status。无匹配分显示“暂不评分”，不显示 0；未知姓名不影响匹配分。

## 2. 输入输出与校验

以下是前端动作契约，传输协议后置。动作失败保留输入；保存成功才更新正式领域对象。

| 动作 / 对应 FR | 输入及前置条件 | 成功输出 | 校验及失败反馈 |
|---|---|---|---|
| 提取岗位标准 / 01 | JD 文本；至少有非空白内容 | 标准草稿和逐条建议 | 提取中禁止重复提交；失败保留 JD，允许重试；不自动确认 |
| 编辑并确认 / 01 | 草稿条件、重要性、约束 | 新 confirmed 版本及确认时间 | 条件文字不能为空、枚举有效；零必要条件按 Demo 提案禁止确认，正式规则待决 |
| 选择文件 / 02 | 当前岗位、已确认版本、本地 PDF 列表 | 本地待上传清单 | 选择不等于受理；类型错误逐项提示；超 50 按 Demo 提案整体阻止提交，不静默截断 |
| 提交批次 / 02、08 | 校验通过的清单及版本快照 | Batch、ScreeningItem、排队运行 | 提交中禁用按钮；失败保留清单；允许单项上传失败，其余项继续；不显示虚假全部成功 |
| 完成解析与评估 / 03、04、05 | 运行 ID、材料快照、标准快照 | Evaluation、证据、派生分数及分组 | 缺条件、重复条件 ID、无效引用、跨人证据均不能当有效完成；进入可见失败，保留原件 |
| 保存复核 / 06 | 当前 evaluationId、决定、标签、备注 | 新 ReviewDecision 历史记录 | 决定必选，备注选填；保存失败保留编辑；期间若新评估生效，提示切换并复核，禁止静默保存到新结果 |
| 补充并重评 / 07 | itemId、补充材料、原评估及标准版本 | 新运行，成功后新 Evaluation | 提案：文本补充附来源说明；原评估一直可读；失败不删除旧结果 |
| 重试单项 / 08 | 失败 itemId、当前 runId | 新 attempt/runId | 非失败项不能重试；重试中禁止连点；旧运行响应不改变当前结果 |

Demo 资料保存在可重置的模拟数据层，重载可恢复合成结果；不把真实简历放入浏览器持久化作为生产方案。模拟处理阶段和错误必须标注为演示，不能宣称已完成真实 OCR 或模型分析。

## 3. 页面清单和依赖

路径仅为前端路由建议。岗位列表为入口，不增加招聘流程管理功能。

| 页面 | 路由建议 / 入口 | 读取对象 | 用户操作及输出 | 空态、异常与返回 |
|---|---|---|---|---|
| P01 岗位列表 | /jobs，默认入口 | Job | 新建、进入岗位 | 无岗位引导新建；加载失败可重试 |
| P02 岗位标准 | /jobs/:jobId/criteria | Job、CriteriaVersion | 编辑 JD、提取、编辑条件、确认；进入导入 | 未确认可保存草稿；加载错误禁止以空草稿覆盖；离开脏表单提示保存/放弃/继续编辑 |
| P03 批次导入 | /jobs/:jobId/import | 已确认版本、本地清单 | 添加/移除文件、提交 | 未确认标准引导 P02；展示绑定版本；提交成功进入 P04 |
| P04 批次工作台 | /batches/:batchId | Batch、筛选项、运行、评估、决定 | 看进度、筛选队列、单项重试、打开详情 | 无结果时显示处理中；部分失败仍显示成功项；处理未结束也允许复核已完成项 |
| P05 候选人详情 | /batches/:batchId/items/:itemId | 该项评估、材料、证据、决定历史 | 原文对照、保存决定、补充重评、切换历史 | 结果未生成显示阶段；无原文可展示判断但明确无法加载；返回恢复列表筛选和滚动位置 |

依赖顺序：P01 → P02（确认标准）→ P03（受理批次）→ P04 → P05。P04 可回 P03 新建同岗批次，不能向既有批次静默追加。P05 证据点击只改变材料预览位置；补充资料采用抽屉，历史评估采用版本选择器，不额外增加整页。

直接访问链接先加载资源：不存在显示“记录不存在”及返回入口，失败显示重试，不把加载失败当成不存在。切换岗位/批次清除不兼容筛选；同一列表往返保留筛选。默认查看全部，队列标签展示数量，避免隐藏未推荐人选。

## 4. 组件状态矩阵

| 组件 | 状态及呈现 | 操作约束 |
|---|---|---|
| 标准编辑器 | empty、editing、extracting、invalid、confirming、confirmed、error | extracting 禁重复提取；confirmed 只读，编辑生成草稿；失败保留编辑 |
| 文件清单 | empty、validating、ready、invalid、uploading、partial_failure | 每项显示错误；提交仅在可提交时启用；处理中禁止删除已受理项 |
| 批次进度 | queued、running、completed、completed_with_errors、failed | 展示完成/失败/处理中/总数；有终态不等于评估成功；支持失败项重试 |
| 候选人列表 | loading、empty、filtered_empty、ready、error | empty 与筛选无结果不同；筛选无结果给清除按钮；刷新不清空已有列表 |
| 分数卡 | scored、unscored、not_evaluated | 100 分搭配覆盖率；未知为“暂不评分”；处理中不显示上次分数为本次结果 |
| 条件证据行 | met、unmet、unknown、source_unavailable | 显示条件原文、判定、依据、来源；无法定位给可见反馈，不跳到错误页 |
| 原件预览 | loading、ready、unsupported、error | 支持页跳转；加载失败可重试；没有坐标只定位页并显示引用，不伪造高亮 |
| 复核表单 | pristine、dirty、saving、saved、error、stale | saving 禁重复保存；error 保留输入；stale 提示评估版本变化；已保存可修改 |
| 补充重评抽屉 | editing、invalid、submitting、running、failed、completed | 提交后旧结果标注历史；失败可重试；关闭抽屉不取消后台运行 |

所有错误提供原因和可执行下一步；保存结果用可被辅助技术感知的反馈，不能只靠颜色。弹层打开聚焦标题或首字段，关闭返回触发按钮；键盘可完成筛选、查证据和复核。列表更新不抢走用户正在编辑的焦点。

## 5. 状态机和转换约束

### 5.1 单项处理

| 当前状态 | 事件 / 条件 | 下一状态 | 前端动作 |
|---|---|---|---|
| queued | 开始运行 | parsing | 显示文字提取阶段 |
| parsing | 前阶段质量不足 | parsing | stage 从 text 到 ocr 再到 multimodal，展示升级原因 |
| parsing | 质量通过 | evaluating | 保留解析来源，显示评估中 |
| parsing / evaluating | 失败、超时或无效输出 | failed | 显示阶段与错误，不生成低分 |
| evaluating | 有效结果已保存 | completed | 更新当前评估 ID 和列表派生数据 |
| failed | 用户重试且可重试 | queued（新运行） | attempt 增加，旧运行只读 |
| completed | 提交补充重评 | queued（新运行） | 原评估保留，显示重评中 |

禁止 completed → failed 被旧响应触发。阶段升级门槛和重试上限仍待验证；Demo 使用明确的模拟事件推进。Demo 提案固定为：刷新后已完成结果恢复，未完成运行转 failed，错误码 demo_interrupted，显示“演示任务已中断，可重试”；用户重试启动新运行，不假装后台仍在处理。真实后台恢复方案后置。

批次状态派生：无终态且全排队为 queued；存在非终态且不是全排队为 running；全部终态且全成功为 completed；全部失败为 failed；成功与失败混合为 completed_with_errors。重试可使终态批次回到 running/queued，成功项不回退。

### 5.2 人工复核与评估版本

无当前评估决定为 unreviewed；选择决定只改变本地草稿；保存成功为 reviewed。修改产生新历史，不覆盖旧记录。新评估到达后显示 needs_review，并保留“上一版决定：推进沟通”等历史说明；新评估必须显式保存才算已复核。人工改为推进沟通不改变系统条件冲突分组。

### 5.3 系统分组

| 优先级 | 条件 | 结果 / 状态 |
|---|---|---|
| 1 | 无有效当前评估 | 不参与评分分组，保留处理中/异常入口 |
| 2 | 任一不可放宽条件明确不符合 | 条件冲突（已确认） |
| 3 | 无上述冲突，任一关键条件未知 | 待核实（已确认） |
| 4 | 关键条件齐全 | 推荐及剩余分支仍待阈值和规则确认 |

Demo 可以用明确标识的场景数据展示推荐及其他队列，但不得为第 4 分支硬编码“80 分即推荐”等未经批准的正式规则。未配置门槛的交互结果显示“待配置推荐规则”，仍可人工复核。全未知且有必要条件时，分数 null、覆盖率 0、进入待核实；零必要条件走配置校验而非评分。

## 6. 前端状态管理

| 状态层 | 内容 | 生命周期 / 写入规则 |
|---|---|---|
| 领域数据 | 对象字典、当前评估指针、决定历史、运行 | 集中存储，通过明确动作更新；页面不维护第二份候选人事实 |
| 表单草稿 | JD、条件编辑、待上传文件、复核备注、补充文字 | 页面/抽屉持有；成功保存再合并领域数据；离开有未保存内容时提示 |
| 导航状态 | jobId、batchId、itemId、队列、人工状态筛选、排序、选中版本 | ID 和分享所需筛选进入路由；滚动位置只在会话保存；URL 参数校验后使用 |
| 瞬时交互 | 弹层开关、PDF 当前页、焦点、按钮 saving | 局部持有；不能决定真实评估是否完成 |
| 派生状态 | 分数、覆盖率、队列计数、批次进度、待复核标记 | 从同一对象快照计算，不重复存可变副本 |

前端通过 createJob、confirmCriteria、submitBatch、receiveRunUpdate、saveReview、startReevaluation 等动作组织状态变化；名称为设计建议，不绑定框架。异步返回携带 requestId、runId 和目标对象 ID，只更新匹配当前请求的数据；切换候选人后旧详情响应不能写入新候选人面板。保存采用成功后确认，不提前显示“已保存”。

PDF 定位由 documentId + page + locator 驱动；先确认文件加载成功再跳页。历史版本模式保持只读，切回当前版后恢复复核入口。前端状态库、查询库、组件库选择后置，不因引入状态机而强制某个依赖。

## 7. Demo 场景与验收

每条使用固定合成材料和预置事件脚本，人工操作验证界面及对象变化；不以静态截图代替交互验收。

| 编号 / 关联 FR | 场景 | 必须可观察的结果 |
|---|---|---|
| D01 / 01、02 | 新建岗位，生成草稿但未确认 | 导入入口提示先确认；确认后显示对应版本 |
| D02 / 02 | 选择 51 份、含错误类型、移除问题项 | 明确错误，未静默丢文件；满足条件后可提交 |
| D03 / 03、08 | 同批正常、扫描、损坏各一份 | 阶段差异可见；失败一份不阻断其余；进度计数一致 |
| D04 / 04、05 | 5 项等权必要条件，3 符合、1 不符合、1 未知 | 分数 75、覆盖率 80%；各判断可定位证据 |
| D05 / 05 | 不可放宽冲突与关键未知同时存在 | 只属于条件冲突组，两类提示同时可见 |
| D06 / 05 | 全部必要条件未知 | 显示暂不评分、0% 覆盖率、待核实，不显示 100 分 |
| D07 / 06 | 保存失败，再重试，再修改决定 | 输入不丢；成功后列表同步；历史可回查 |
| D08 / 07 | 已推进的人选补充后重评 | 旧结果可读；新结果需复核；旧决定仍可追溯 |
| D09 / 08 | 连点重试，旧运行晚返回 | 只启动一个新运行，旧响应不覆盖新状态 |
| D10 / 全部 | 筛选后进详情、刷新、返回列表 | 恢复有效对象及筛选；不存在 ID 有明确返回入口 |
| D11 / 04 | 原件加载失败或引用无法定位 | 有错误反馈，保留复核数据，不伪造成功定位 |
| D12 / 01、05 | 已有批次后修改岗位标准 | 旧批次仍显示旧版本，不混排不同版本分数 |

## 8. 待确认与 Demo 边界

| 项目 | Demo 提案 / 现状 | 正式决策节点 |
|---|---|---|
| 零必要条件、51 份上传 | 禁止确认；超限整体阻止提交 | 对应交互冻结前由产品确认 |
| 补充资料 | 首先演示文本+来源说明；附件扩展待决 | 复核流程冻结前 |
| 原因标签 | 使用合成示例展示；正式标签词表待 HR 确认 | 复核流程冻结前 |
| 排序、阈值、低覆盖与低分分支 | 保留未配置态；预置场景仅作展示 | 规则确认及校准后 |
| 文件大小/页数及解析质量 | 参数未定；演示可注入超限、缺页、质量不足 | 真实处理接入前；Demo 不宣称已验证 |
| 重载未完成任务 | 提案为转演示中断失败，保留完成结果，显式重试 | Demo 评审确认；不代表真实后台恢复设计 |
| 重复文件/同人多简历 | 不按姓名自动合并；展示重复提示场景，最终受理策略待决 | 导入交互冻结前 |

验收分两层：Demo 验收对象和交互的一致性；真实业务验收仍使用 PRD 的独立样本、漏选率与人工耗时目标。Demo 通过不证明模型效果或后台可靠性。下一次评审优先关闭本节影响交互的待决项，再制作页面，接口与后端方案可后置。
