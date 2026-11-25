# ResumeAI

> ResumeAI 是面向企业高吞吐招聘初筛场景的工业级人机协同（Human-in-the-Loop, HITL）智能简历筛选工作台。系统采用清晰架构（Clean Architecture）设计，基于严格确定的多阶段状态机推进简历全生命周期解析与研判，内置“纯文本抽取 -> OCR 文本识别 -> 多模态视觉”三级容错自愈降级引擎。系统坚守“严禁算法静默淘汰”红线，通过确定性算法计算已知必要条件匹配分与证据覆盖率，实现原始 PDF 物理页码级事实穿透与双屏热区联动，底层提供多版本不可变标准冻结及基于 supersedes 拓扑链的 HR 复核决策全生命周期审计追踪能力。

[![ResumeAI Production CI Pipeline](https://img.shields.io/badge/ResumeAI%20Production%20CI%20Pipeline-passing-success?logo=github-actions)](https://github.com/happypig1224/resume.ai)
[![ResumeAI Production CD Pipeline](https://img.shields.io/badge/ResumeAI%20Production%20CD%20Pipeline-passing-success?logo=github-actions)](https://github.com/happypig1224/resume.ai)
[![ResumeAI CodeQL Security Analysis](https://img.shields.io/badge/ResumeAI%20CodeQL%20Security%20Analysis-passing-success?logo=github)](https://github.com/happypig1224/resume.ai)

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4+-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tests](https://img.shields.io/badge/Tests-31%20passed-success?logo=playwright)](https://playwright.dev/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

<br />

<div align="center">
  <img src="docs/assets/workbench_preview.png" alt="ResumeAI 企业级高密度初筛工作台真机渲染界面" width="100%" />
  <p><em>图 1：ResumeAI 企业级高密度初筛工作台（去除 AI 样板卡片，采用统一 thead 表头统摄与规整单行错误展示）</em></p>
</div>

---

## 目录

- [核心架构与技术特性](#核心架构与技术特性)
- [简历初筛流水线状态机](#简历初筛流水线状态机)
- [确定性评分体系与证据链事实穿透](#确定性评分体系与证据链事实穿透)
- [领域模型与不可变版本设计](#领域模型与不可变版本设计)
- [工程目录拓扑](#工程目录拓扑)
- [环境基线与前置要求](#环境基线与前置要求)
- [配置与环境变量](#配置与环境变量)
- [本地开发与部署启动](#本地开发与部署启动)
- [生产投产演练与准入预检](#生产投产演练与准入预检)
- [自动化测试套件与代码质量门禁](#自动化测试套件与代码质量门禁)
- [核心 API 与 SSE 流式协议规范](#核心-api-与-sse-流式协议规范)
- [零信任安全与目录穿越防护边界](#零信任安全与目录穿越防护边界)
- [技术支持与开源协议](#技术支持与开源协议)

---

## 核心架构与技术特性

传统简历筛选方案主要存在两类技术极端：一类是纯关键词匹配，无法理解语义与业务上下文；另一类是将整份简历交由商用大语言模型进行端到端黑盒评分。大模型直接给出的 0~100 分数存在概率波动和幻觉，且往往将候选人未写明的字段直接算作不满足要求，造成大量严重误杀。

ResumeAI 采用“结构化规则引擎 + 大模型证据提取 + 确定性评分计算 + 人机协同复核”的分层解耦架构：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        前端交互层 (Presentation Layer)                 │
│      企业级高密度 ATS 数据表格  │  双屏证据穿透阅读器  │  SSE 实时流水线看板       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / RESTful & SSE
┌───────────────────────────────────▼────────────────────────────────────┐
│                        业务领域服务层 (Domain Services)                │
│    标准版本冻结引擎  │  阶梯降级流水线调度器  │  确定性计分器  │  决策拓扑审计器 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ SQLAlchemy 2.0 (Async)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        基础设施与持久层 (Infrastructure)                │
│   MySQL 8.0 (ACID 短事务)  │  本地防穿越加密存储  │  大模型多厂商适配网关   │
└────────────────────────────────────────────────────────────────────────┘
```

系统核心工程特性包括：
- **评估标准不可变冻结（Criteria Immutability）**：批次执行前必须显式冻结岗位规则快照。批次生命周期全程绑定该版本，严禁跨时间段的评估基线漂移。
- **严禁算法静默淘汰（Zero Auto-Rejection）**：系统不设定自动化拒绝阀门。所有候选人（包括条件冲突者与证据不足者）均完整呈现在工作台分流队列中，由 HR 保留最终决策权。
- **阶梯式容错降级流水线（Tiered Parser）**：首选纯文本抽取；当文本质量不足时平滑转入 OCR 识别；复杂多栏排版或模糊扫描件升级至多模态视觉大模型解析。单份损坏文件自动流转至“异常待办”，杜绝整批任务崩溃。
- **双屏证据事实穿透（Dual-Pane Citations）**：模型对每项条件必须输出原始 PDF 页码（Page N）与逐字引文（Quote），前端实现视口联动跳转与热区高亮。

---

## 简历初筛流水线状态机

筛选项（Screening Item）在全生命周期中受到严格状态机约束，状态流转具备严格的确定性与幂等性：

```
                ┌─────────────────────────────────────────────────────────┐
                │                       pending                           │
                │                   (待进入处理流水线)                       │
                └───────────────────────────┬─────────────────────────────┘
                                            │ 任务调度器拉取
                                            ▼
                ┌─────────────────────────────────────────────────────────┐
                │                       parsing                           │
                │           (提取原件文本 / 版式分析 / OCR 降级)           │
                └─────────────┬─────────────────────────────┬─────────────┘
                              │ 提取成功                    │ 提取失败
                              ▼                             ▼
   ┌─────────────────────────────────────┐       ┌────────────────────────┐
   │             evaluating              │       │         failed         │
   │    (规则逐项研判与证据抽取，绑定页码)   │       │       (异常待办)       │
   └──────────────────┬──────────────────┘       └───────────┬────────────┘
                      │ 研判完成                             │ 单项幂等重试
                      ▼                                      │ (retryProcessingRun)
   ┌─────────────────────────────────────┐                   │
   │             completed               │◄──────────────────┘
   │      (计分完成，自动分流至初筛队列)     │
   └──────────────────┬──────────────────┘
                      │ HR 双屏复核
                      ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                    human_reviewed (人机决策达成)                       │
   │    advance (推进沟通) │ need_info (待补充信息) │ hold (暂不推进)        │
   └──────────────────────────────────────────────────────────────────────┘
```

### 状态转换说明
- `pending -> parsing`：批次提交后，调度器拉取文件进入解析阶段。
- `parsing -> failed`：遇到文件图层缺失、全黑扫描件或密码保护，记录具体错误原因并隔离至异常待办队列，不计入低分。
- `failed -> parsing`：HR 在工作台点击“单项重试”后，重置运行上下文并执行自愈重试。
- `parsing -> evaluating`：文本提取成功后，按冻结的标准规则进行结构化事实匹配。
- `evaluating -> completed`：各项条件判定完毕，计算已知必要条件匹配分与覆盖率，进入系统分流队列。

---

## 确定性评分体系与证据链事实穿透

系统严禁大语言模型直接输出综合评分，所有分数均由后置确定性程序规则依据事实判定进行计算。

### 1. 判定三态分类
对于每项岗位要求，模型仅允许输出三种客观状态：
- **符合（Met）**：简历中存在明确、直接的事实支撑。
- **明确不符（Unmet）**：简历明确陈述了不满足不可放宽要求的事实（如要求统招本科，简历明确标注专科学历）。
- **证据不足（Unknown）**：简历完全未提及相关信息，系统按未知处理，严禁主观脑补。

### 2. 确定性计分公式
针对岗位所有必要条件（Required Criteria），已知必要条件匹配分定义为：

$$\text{已知必要条件匹配分} = \frac{\sum_{i \in \text{Met}} \text{Weight}_i}{\sum_{j \in \text{Met} \cup \text{Unmet}} \text{Weight}_j} \times 100$$

> **边界处理保护**：分母严格排除 `Unknown` 条件。若候选人的所有必要条件均因未提及而被判定为 `Unknown`，分母为 0，系统明确显示为“证据不足 · 暂不评分”，绝不虚构 0 分误杀候选人。

证据覆盖率定义为：

$$\text{证据覆盖率} = \frac{\sum_{j \in \text{Met} \cup \text{Unmet}} \text{Weight}_j}{\sum_{k \in \text{All Required}} \text{Weight}_k} \times 100\%$$

### 3. 三大系统分流队列规则
- **条件冲突队列（Conflict）**：任一带有“不可放宽（Strict）”约束的必要条件被判定为 `Unmet`，系统优先分流至此队列。
- **待核实队列（Verification）**：无明确硬伤冲突，但在核心必要条件上存在 `Unknown` 缺失，提示 HR 进行电话核实。
- **系统推荐队列（Recommended）**：核心条件证据齐全无冲突，且匹配分与覆盖率均达标。

---

## 领域模型与不可变版本设计

数据库设计遵循严谨的领域驱动模型，确保历史批次数据绝对不可篡改。

```
 ┌──────────────┐          1:N          ┌─────────────────────┐
 │     jobs     │───────────────────────┤  criteria_versions  │ (不可变快照)
 └──────────────┘                       └──────────┬──────────┘
                                                   │ 1:N
                                                   ▼
 ┌──────────────┐          1:N          ┌─────────────────────┐
 │   batches    │───────────────────────┤      criteria       │
 └──────┬───────┘                       └─────────────────────┘
        │ 1:N
        ▼
 ┌──────────────┐          1:N          ┌─────────────────────┐
 │screening_item│───────────────────────┤evaluation_snapshots │ (多版本评估历史)
 └──────┬───────┘                       └─────────────────────┘
        │ 1:N
        ▼
 ┌──────────────┐
 │audit_decision│ (基于 supersedes_id 构成的决策拓扑链路)
 └──────────────┘
```

### 关键数据表职责
- `criteria_versions`：存储冻结后的标准版本。一旦 `is_confirmed = 1`，该行及其子表 `criteria` 记录通过应用层拦截与数据库行触发器双重加锁，禁止任何 UPDATE/DELETE 操作。
- `evaluation_snapshots`：单份候选人每次评估或补充材料重评，均追加插入一条独立版本记录（v1, v2...），完整保留历史研判证据与得分。
- `audit_decisions`：HR 的复核决定（推进沟通/待补充信息/暂不推进）。每次修改通过 `supersedes_id` 指向上一版决策 ID，构成单向修改追踪链。系统在加载时使用 DAG 深度拓扑排序，保障子版本与修改版本严格排列在最前。

---

## 工程目录拓扑

```
resume.ai/
├── backend/                                # 后端服务工程 (FastAPI + SQLAlchemy)
│   ├── app/
│   │   ├── api/v1/                         # REST 路由与控制层
│   │   │   ├── batches.py                  # 批次上传、导入与流式导出控制器
│   │   │   ├── criteria.py                 # 标准配置草稿、权重计算与确认冻结
│   │   │   ├── jobs.py                     # 岗位主生命周期与列表查询
│   │   │   └── screening_items.py          # 筛选项全景详情、原件流式预览与决策链提交
│   │   ├── core/                           # 核心运行时配置
│   │   │   ├── config.py                   # 环境变量解析与全局配置单例
│   │   │   └── database.py                 # 异步数据库引擎连接池与会话管理
│   │   ├── models/                         # SQLAlchemy 物理数据实体模型
│   │   │   ├── audit.py                    # 决策审计实体 (AuditDecision)
│   │   │   ├── batch.py                    # 批次实体 (Batch)
│   │   │   ├── criteria.py                 # 标准与标准版本实体 (CriteriaVersion, Criterion)
│   │   │   ├── evaluation.py               # 评估快照实体 (EvaluationSnapshot)
│   │   │   ├── job.py                      # 岗位实体 (Job)
│   │   │   └── screening_item.py           # 候选人筛选项实体 (ScreeningItem)
│   │   ├── schemas/                        # Pydantic 强类型请求响应契约 (VO/DTO)
│   │   │   └── domain.py                   # 领域模型定义与请求校验器
│   │   ├── services/                       # 核心业务服务层
│   │   │   ├── batch_service.py            # 批次流式调度与 SSE 广播管理器
│   │   │   ├── criteria_service.py         # 标准解析、校验与版本冻结服务
│   │   │   ├── item_service.py             # 筛选项、事实穿透、降级重评与决策链拓扑服务
│   │   │   └── job_service.py              # 岗位业务服务
│   │   └── main.py                         # FastAPI 应用工厂入口与异常处理器
│   ├── requirements.txt                    # 后端依赖配置清单
│   └── scripts/                            # 自动化脚本工具
│       └── generate_sample_resumes.py      # 仿真测试简历 PDF 生成器
│
├── demo/                                   # 前端工作台工程 (React 19 + TypeScript + Vite)
│   ├── e2e/                                # Playwright 端到端全链路集成测试套件
│   │   ├── e2e_audit_retry_and_export.spec.ts          # 异常重试自愈与审计大盘核验
│   │   ├── e2e_batch_import_and_sse.spec.ts            # 批次导入与 SSE 流水线端到端测试
│   │   ├── e2e_candidate_review_and_supplement.spec.ts  # 双屏原件复核与决策链修改链路
│   │   ├── e2e_full_lifecycle_and_exceptions.spec.ts   # 完整岗位生命周期与异常熔断测试
│   │   ├── e2e_production_all_pages_and_apis.spec.ts   # 生产全页面与全接口全覆盖测试
│   │   ├── e2e_real_user_full_lifecycle.spec.ts        # 真实用户端到端全链路演练
│   │   ├── resume_screening_ui_ux.spec.ts              # UI/UX 规范与业务规则验收
│   │   └── visual_snapshots.spec.ts                    # 高清视觉快照截取套件
│   ├── src/
│   │   ├── api/client.ts                   # 强类型 API 客户端与 SSE EventSource 封装
│   │   ├── components/                     # 通用组件库 (Badge, Toast, ErrorBoundary)
│   │   ├── domain/                         # 前端领域模型与规则引擎纯函数
│   │   ├── features/                       # 业务功能模块
│   │   │   ├── jobs/                       # 岗位管理
│   │   │   ├── criteria/                   # 标准配置与版本确认
│   │   │   ├── import/                     # 批次导入与流水线监控
│   │   │   ├── screening/                  # 高密度 ATS 批次初筛工作台与统计大盘
│   │   │   └── review/                     # 双屏事实穿透原件复核模态窗
│   │   ├── store/useAppStore.ts            # Zustand 全局集中状态总线
│   │   └── App.tsx                         # 根页面组件与路由切换
│   ├── package.json                        # 前端依赖配置
│   └── vite.config.ts                      # Vite 构建配置文件
│
├── docs/                                   # 研发设计规范文档库
│   ├── assets/                             # 架构示意图与真机全景截图
│   ├── api/                                # RESTful 与 SSE 协议定义
│   ├── database/                           # 数据库设计说明书
│   ├── overview/                           # 业务蓝图全景
│   └── prd/                                # PRD-001 需求规格说明书
│
├── .env.example                            # 生产环境变量配置模版
└── README.md                               # 本说明文档
```

---

## 环境基线与前置要求

生产部署与本地联调环境须满足以下基线规格：

| 运行时 / 组件 | 最低版本要求 | 生产推荐版本 | 作用说明 |
| :--- | :--- | :--- | :--- |
| **Node.js** | 18.0.0 | 20.18.0 LTS | 前端工程编译与 Vite 构建运行时 |
| **Python** | 3.11.0 | 3.11.9 | 后端异步运行时与多模态模型调用网关 |
| **MySQL** | 8.0.28 | 8.0.36 | 关系型主存储，必须启用 `utf8mb4` 字符集 |
| **Chromium** | 120.0+ | 最新稳定版 | Playwright 端到端自动化验收驱动引擎 |

---

## 配置与环境变量

系统配置严格通过环境变量解耦，支持生产机密与配置隔离。模版文件参见根目录下 [.env.example](.env.example)。

| 环境变量名 | 说明 | 默认值 / 示例 | 是否必填 |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | 运行环境模式 (`development` / `production`) | `development` | 否 |
| `PORT` | 后端服务监听端口 | `8001` | 否 |
| `DATABASE_URL` | MySQL 异步连接串 | `mysql+aiomysql://root:root@127.0.0.1:3306/resume_ai?charset=utf8mb4` | **是** |
| `LLM_PROVIDER` | 主大语言模型供应商类别 | `deepseek` | 否 |
| `LLM_API_KEY` | 主大语言模型调用密钥 | `sk-************************` | **是** |
| `LLM_BASE_URL` | 主大语言模型 API 入口地址 | `https://api.deepseek.com` | 否 |
| `LLM_MODEL` | 主语言模型名称 | `deepseek-chat` | 否 |
| `SECONDARY_LLM_API_KEY` | 备用多模态/大模型网关密钥 (如 302.ai) | `sk-************************` | 否 |
| `SECONDARY_LLM_BASE_URL` | 备用网关 API 入口地址 | `https://api.302.ai/v1` | 否 |
| `SECONDARY_LLM_MODEL` | 备用模型名称 | `gpt-4o-mini` | 否 |
| `STORAGE_DIR` | 简历原件安全存储目录 | `storage` | 否 |
| `CORS_ORIGINS` | 允许跨域的客户端来源数组 (JSON 格式) | `["http://localhost:5173", "http://127.0.0.1:5173"]` | 否 |

---

## 本地开发与部署启动

### 1. 数据库初始化
确保本地 MySQL 服务已启动，创建专用数据库：
```sql
CREATE DATABASE resume_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 后端服务启动
```bash
# 1. 进入后端目录并建立 Python 虚拟环境
cd backend
python -m venv .venv

# 2. 激活虚拟环境 (Windows PowerShell)
.venv\Scripts\Activate.ps1
# (Linux / macOS)
# source .venv/bin/activate

# 3. 安装依赖组件
pip install -r requirements.txt

# 4. 配置环境变量
cp ../.env.example .env
# 按实际环境编辑 .env 中的 DATABASE_URL 与 LLM_API_KEY

# 5. 启动 FastAPI 服务 (监听 8001 端口)
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```
后端健康检查端点验证：
```bash
curl -s http://127.0.0.1:8001/api/v1/jobs | jq .
```

### 3. 前端工作台启动
```bash
# 1. 进入前端工程目录
cd demo

# 2. 安装依赖包
npm install

# 3. 启动开发服务器 (监听 5173 端口)
npm run dev -- --host 127.0.0.1 --port 5173
```
浏览器访问 `http://127.0.0.1:5173/` 即可进入工作台。

---

## 生产投产演练与准入预检

系统在投产前必须执行全链路模拟预检，确保核心接口与静态资源构建完全正常。

### 1. 前端生产静态打包与类型校验
```bash
cd demo
npm run build
```
输出指标判定标准：
- TypeScript 编译器（`tsc -b`）零告警、零错误退出。
- Vite 输出生产静态资源包至 `demo/dist/`，gzip 压缩后核心包体积控制在 120 KB 以内。

### 2. 真实简历资产准备
如需本地初始化仿真简历数据，可运行内置脚本生成符合各边界特征的标准 PDF：
```bash
$env:PYTHONPATH="backend"; python backend/scripts/generate_sample_resumes.py
```
该命令将在 `demo/e2e/fixtures/resumes/` 目录下生成包含全匹配、部分匹配、学历冲突、扫描件失真等各类真实样本。

---

## 自动化测试套件与代码质量门禁

项目建立了严格的自动化测试门禁体系，涵盖 31 项全链路端到端自动化测试，模拟真实用户从岗位配置、标准冻结、文件上传、实时 SSE 进度、队列分流到双屏复核的全生命周期闭环。

```bash
cd demo
npx playwright test
```

### 测试用例套件矩阵（31 Passed）

| 测试套件文件 | 覆盖业务范围与验收契约 | 用例数 | 状态 |
| :--- | :--- | :--- | :--- |
| `e2e_full_lifecycle_and_exceptions.spec.ts` | 岗位主生命周期闭环、标准不可变冻结红线、服务端 500 熔断自愈 | 5 | 100% Passed |
| `e2e_batch_import_and_sse.spec.ts` | 未冻结标准禁止导入拦截、50 份超限防御、部分文件损坏隔离、SSE 流式协议规范 | 5 | 100% Passed |
| `e2e_candidate_review_and_supplement.spec.ts` | 双屏原件阅读器与证据点击视口联动、电话补充重评、决策链 DAG 拓扑排序校验 | 4 | 100% Passed |
| `e2e_audit_retry_and_export.spec.ts` | 单项异常重试自愈闭环、批次全量 CSV 导出、全景审计大盘 AC-01 入选率（>=95%）核验 | 4 | 100% Passed |
| `e2e_production_all_pages_and_apis.spec.ts` | 全页面所有 RESTful 接口与状态机双向严格断言 | 5 | 100% Passed |
| `e2e_real_user_full_lifecycle.spec.ts` | 真实用户全要素联调演练（发布岗位 -> 导入真实样本 -> 实时推送 -> 复核落库） | 1 | 100% Passed |
| `resume_screening_ui_ux.spec.ts` | UI/UX 业务规范验收、企业级高密度表格渲染、分流标签状态过滤校验 | 6 | 100% Passed |
| `visual_snapshots.spec.ts` | 多屏幕分辨率真机像素级渲染帧捕获与明暗主题一致性审查 | 1 | 100% Passed |

---

## 核心 API 与 SSE 流式协议规范

系统采用严格标准响应包装格式：`{"code": 200, "message": "...", "data": {...}}`。

### 1. 核心 REST 端点
- `POST /api/v1/jobs`：创建招聘岗位。
- `POST /api/v1/jobs/{job_id}/criteria-confirm`：显式冻结标准快照，生成不可变的确定版本（Criteria Version）。
- `POST /api/v1/batches`：创建导入批次，上传候选人简历文件（单批上限 50 份，严格校验 PDF 文件头签名）。
- `GET /api/v1/batches/{batch_id}/items`：分页获取批次下筛选项列表、处理状态与计算所得的匹配分。
- `GET /api/v1/screening-items/{item_id}`：获取候选人研判详情，包含逐项标准评估结论、原文引文（Quote）与 PDF 页码（Page）。
- `POST /api/v1/screening-items/{item_id}/decisions`：提交 HR 人工复核决定，系统自动关联 `supersedes_id` 形成审计链路。
- `POST /api/v1/screening-items/{item_id}/retry`：针对解析失败的异常项执行幂等重试。
- `GET /api/v1/batches/{batch_id}/metrics`：获取批次全景审计指标大盘，计算 AC-01 入选率与各队列流转分布。

### 2. SSE 实时事件流协议
端点：`GET /api/v1/batches/{batch_id}/events`
- `Content-Type: text/event-stream`
- 支持的标准事件流格式：
  - `event: progress`：推送当前批次完成度百分比、已完成数、解析中数及失败数。
  - `event: item_updated`：实时推送单项状态变化及最新匹配得分。
  - `event: stage_degraded`：当文件触发 OCR 或多模态降级时广播降级通知。
  - `event: batch_completed`：整批流水线收敛完成后触发，通知客户端关闭监听。

---

## 零信任安全与目录穿越防护边界

作为企业级招聘资产管理平台，系统在物理存储与接口访问层实施纵深防御：

1. **路径穿越防御（Path Traversal Guard）**
   - 原件预览端点 `GET /api/v1/screening-items/{item_id}/pdf` 严禁直接使用客户端传入的文件名拼接磁盘路径。
   - 存储路径基于安全 UUID 生成相对路径，读取时强制调用 `os.path.realpath` 计算绝对路径，并严格校验目标路径前缀必须从属于配置的 `STORAGE_DIR`。任何包含 `../` 或符号链接穿越的行为将被安全拦截并记录审计日志。
2. **文件格式签名硬核校验（Magic Bytes Verification）**
   - 批次导入时不依赖浏览器声明的扩展名或 Content-Type，强制读取文件头前 4 字节魔数（`%PDF-`）。若格式失真伪造，直接拒绝受理。
3. **不可变快照行级防腐**
   - 历史评估快照与冻结规则快照由数据库外键完整性约束和短事务隔离机制保护，严禁任何业务流修改历史记录。

---

## 技术支持与开源协议

### 问题反馈与安全响应
- **问题与建议（Issues）**：如遇到功能缺陷或使用疑问，请在 GitHub Issues 提交报告，附带完整错误日志与复现步骤。
- **安全漏洞通报**：若发现涉及安全边界或路径穿越等高危隐患，请勿公开发布 Issue，请通过仓库安全私信进行负责任的安全披露。

### 开源协议
本项目基于 Apache License 2.0 协议开源。详细条款见 [LICENSE](LICENSE) 文件。
