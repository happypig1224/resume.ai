# 项目文档

| 文档 | 用途 |
|---|---|
| [OVERVIEW-001 项目背景与业务闭环](overview/OVERVIEW-001-project-background-and-business-loop.md) | 项目背景、核心功能体系、评分分流机制与端到端业务闭环全景 |
| [PRD-001 简历筛选助手 MVP](prd/PRD-001-resume-screening-mvp.md) | 当前产品需求、范围与验收基准 |
| [SPEC-001 Demo 对象与交互规格](prd/SPEC-001-demo-interaction-model.md) | 对象字段与关系、输入输出、页面依赖、组件状态、前端状态机及 Demo 验收场景；新增设计为提案 |
| [DB-001 数据库设计规范](database/DB-001-database-design-specification.md) | 数据库实体定义、不可变版本快照、状态机流转与物理索引优化 |
| [API-001 接口契约规范](api/API-001-rest-and-sse-specification.md) | RESTful API 契约、SSE 实时事件流、错误码字典与大模型输出约束 |
| [PLAN-001 Demo 落地计划](plans/PLAN-001-demo-delivery.md) | UI/UX、液态玻璃与动效、前端状态方案、实施切片和验收节点 |
| [RES-001 MVP 需求完整性评审](research/RES-001-mvp-requirements-review.md) | 开发准入缺口、验收修订建议及外部核验限制 |
| [RES-002 评分规则补充评审](research/RES-002-scoring-requirements-discovery.md) | 评分职责待决选项及本轮调研记录 |
| [RES-003 对抗性审核与 HITL 调研](research/RES-003-ats-hitl-adversarial-remedies.md) | 外部最佳工程实践、定向补充重评与门槛校准契约 |
| [需求调研与评审规范](process/requirements-discovery.md) | 后续 grill me、工程实践核验及 AI Native 需求拆解准入规则 |
| [源码审查与选型报告](../两个开源项目-源码审查与选型报告.md) | 原两个项目的复用评估 |
| [业务与平台风险报告](../BOSS简历智能筛选助手-业务与平台风险调研报告.md) | 前期业务和接入风险背景 |

## 命名与版本

项目采用 `docs/<类别>/<类型>-<序号>-<英文主题>.md` 的内部约定，例如 `docs/prd/PRD-001-resume-screening-mvp.md`。这是一种便于检索和引用的团队约定，并非行业统一强制标准。流程规范采用语义化英文文件名。

需求文档使用稳定路径；版本、日期、状态和变更记录保存在正文，避免生成“最终版”“最终版2”等并行文件。原 `MVP需求共识-10轮访谈.md` 已由 PRD-001 替代。
