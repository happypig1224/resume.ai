# API-001 简历智能筛选助手：RESTful 与 SSE 接口契约规范

| 属性 | 内容 |
|---|---|
| 文档版本 | 1.1 (已应用严审修正：增加文件流预览端点、断网重连补偿、部分失败软受理与状态码对齐) |
| 更新日期 | 2026-11-04 |
| 状态 | 接口定义基准（指导前后端开发、自动化契约测试与 OpenAPI 文档生成） |
| 依据基准 | [PRD-001 简历筛选助手 MVP](../prd/PRD-001-resume-screening-mvp.md)、[SPEC-001 Demo 对象与交互规格](../prd/SPEC-001-demo-interaction-model.md)、[DB-001 数据库设计规范](../database/DB-001-database-design-specification.md) |
| 通信协议 | HTTP/1.1、HTTP/2，长连接采用 Server-Sent Events (SSE) |
| 根路径 | `/api/v1` |

---

## 1. 全局设计规范与约定

### 1.1 协议与编码
- 所有端点均基于 HTTPS（本地开发支持 HTTP），字符集强制使用 `UTF-8`；
- 请求体格式默认为 `application/json`；文件上传使用 `multipart/form-data`；实时进度流使用 `text/event-stream`；
- 文件流预览支持 HTTP `Range` 头（用于 PDF.js 分片流式秒开）。

### 1.2 统一响应结构 (Standard Response Envelope)
除二进制文件流与 SSE 长连接外，所有 API 均统一封装为以下 JSON 格式。**信封中的 `code` 严格与 HTTP 状态码镜像保持一致**（如 200, 201, 202, 400 等）：

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "timestamp": "2026-11-04T05:20:00.000Z"
}
```

### 1.3 统一错误响应 (Standard Error Format)
当 HTTP 状态码为 `4xx` 或 `5xx` 时，返回严格的结构化错误体：

```json
{
  "code": 30002,
  "error": "BatchSizeExceededError",
  "message": "单批上传文件数量超过上限 (最大允许 50 份，当前 56 份)",
  "details": [],
  "path": "/api/v1/batches",
  "timestamp": "2026-11-04T05:20:00.000Z"
}
```

### 1.4 业务错误码字典 (Error Code Dictionary)

| 错误码区间 | 模块分类 | 典型错误码 | 业务含义 | HTTP 状态码 |
| :--- | :--- | :--- | :--- | :--- |
| **1000~1999** | 系统与网络基础 | `10001` <br> `10002` | `InternalServerError` (服务内部未知异常)<br>`DatabaseConnectionFailed` (数据库连通异常) | 500<br>503 |
| **2000~2999** | 岗位与标准引擎 | `20001`<br>`20002`<br>`20003`<br>`20004` | `JobNotFound` (岗位不存在)<br>`CriteriaVersionNotConfirmed` (标准尚未确认冻结，禁止导入)<br>`InvalidCriteriaWeight` (条件权重非法，仅限 high/medium/low)<br>`DraftAlreadyExists` (该岗位已存在未冻结草稿，禁止重复创建) | 404<br>400<br>422<br>409 |
| **3000~3999** | 批次与文件导入 | `30001`<br>`30002`<br>`30003`<br>`30004` | `BatchNotFound` (批次不存在)<br>`BatchSizeExceeded` (单批文件超限，最大 50 份)<br>`EmptyBatchError` (未包含有效文件)<br>`FileNotFound` (原件文件不存在或被隔离) | 404<br>400<br>400<br>404 |
| **4000~4999** | 解析与大模型流水线 | `40001`<br>`40002`<br>`40003` | `ResumeParsingFailed` (3级解析均失败，转入异常待办)<br>`ModelStructuredOutputInvalid` (大模型未按严格契约输出)<br>`ItemNotRetryable` (该项不具备可重试条件) | 422<br>502<br>400 |
| **5000~5999** | 复核与决策审计 | `50001`<br>`50002`<br>`50003` | `ScreeningItemNotFound` (候选人筛选项不存在)<br>`InvalidDecisionType` (决策枚举非法，仅限 advance/reject/supplement)<br>`SupplementTargetMissing` (定向补充未指定对应条件项) | 404<br>422<br>400 |

---

## 2. API 端点矩阵全景

```
/api/v1
├── /health                                    [GET]    服务健康与数据库心跳
├── /jobs                                      [POST]   创建岗位
├── /jobs                                      [GET]    获取岗位列表
├── /jobs/{job_id}                             [GET]    获取岗位详情与当前标准版本
├── /jobs/{job_id}/extract-criteria            [POST]   AI 辅助从 JD 提取条件草稿
├── /jobs/{job_id}/criteria-draft              [PUT]    保存/更新标准草稿
├── /jobs/{job_id}/criteria/confirm            [POST]   确认并冻结标准版本快照
├── /batches                                   [POST]   批量上传 PDF 简历并创建批次 (支持部分失败软受理)
├── /batches                                   [GET]    获取岗位的导入批次列表
├── /batches/{batch_id}                        [GET]    获取批次摘要与阶段统计
├── /batches/{batch_id}/events                 [GET]    SSE: 批次解析与打分实时进度流 (带 Last-Event-ID 补偿)
├── /batches/{batch_id}/items                  [GET]    获取工作台候选人列表 (支持队列过滤)
├── /screening-items/{item_id}                 [GET]    获取候选人详情与结构化证据链
├── /screening-items/{item_id}/pdf             [GET]    获取原件 PDF 分片流式预览 (支持 Range 头)
├── /screening-items/{item_id}/retry           [POST]   异常待办单项重试
├── /screening-items/{item_id}/decisions       [POST]   提交/更新 HR 人工复核决策
├── /screening-items/{item_id}/decisions       [GET]    获取决策修改审计历史
└── /screening-items/{item_id}/supplement      [POST]   录入定向补充说明并触发增量重评
```

---

## 3. 详细接口契约定义

### 3.1 系统健康检查

#### `GET /api/v1/health`
* **功能描述**：用于负载均衡探测、K8s 探针及前后端联调心跳检测。
* **成功响应 (200 OK)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": "ok",
    "app_name": "Resume.AI Backend",
    "environment": "development",
    "database": "connected",
    "timestamp": "2026-11-04T05:20:00.000Z"
  },
  "timestamp": "2026-11-04T05:20:00.000Z"
}
```

---

### 3.2 岗位与标准引擎 (FR-01)

#### `POST /api/v1/jobs`
* **功能描述**：创建招聘岗位，同时初始化 v1 版本的标准草稿。
* **请求体 (application/json)**：
```json
{
  "title": "资深后端开发专家 (Python/Go)",
  "department": "基础架构部",
  "jd_text": "【岗位职责】\n1. 负责核心招聘系统高并发架构设计...\n【任职要求】\n1. 本科及以上学历，计算机相关专业；\n2. 5年以上后端经验，熟练掌握Python/FastAPI；\n3. 具备分布式与高并发微服务实战经验；\n4. 有开源项目贡献者优先。"
}
```
* **成功响应 (201 Created)**：
```json
{
  "code": 201,
  "message": "success",
  "data": {
    "id": "job_01j9abc...",
    "title": "资深后端开发专家 (Python/Go)",
    "department": "基础架构部",
    "jd_text": "...",
    "current_criteria_version_id": null,
    "draft_version_id": "cv_01j9xyz...",
    "created_at": "2026-11-04T05:21:00.000Z"
  },
  "timestamp": "2026-11-04T05:21:00.000Z"
}
```

---

#### `POST /api/v1/jobs/{job_id}/extract-criteria`
* **功能描述**：AI 辅助接口。根据岗位 JD 正文，调用大模型提取结构化 Rubric 条件草稿。
* **路径参数**：`job_id` (UUID)。
* **成功响应 (200 OK)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "job_id": "job_01j9abc...",
    "extracted_criteria": [
      {
        "description": "计算机相关专业统招本科及以上学历",
        "kind": "required",
        "importance": "high",
        "constraint": "strict",
        "order_num": 1
      },
      {
        "description": "5年以上后端开发经验，精通 Python/FastAPI 架构",
        "kind": "required",
        "importance": "high",
        "constraint": "strict",
        "order_num": 2
      },
      {
        "description": "具备大型分布式系统架构与高并发调优实战经验",
        "kind": "required",
        "importance": "medium",
        "constraint": "flexible",
        "order_num": 3
      },
      {
        "description": "拥有主流开源项目核心贡献或知名技术博客",
        "kind": "bonus",
        "importance": "low",
        "constraint": null,
        "order_num": 4
      }
    ]
  },
  "timestamp": "2026-11-04T05:22:00.000Z"
}
```

---

#### `PUT /api/v1/jobs/{job_id}/criteria-draft`
* **功能描述**：HR 在前端微调条件后保存草稿，更新条件的类别、权重与约束。
* **成功响应 (200 OK)**：返回已保存的草稿版本对象。

---

#### `POST /api/v1/jobs/{job_id}/criteria/confirm`
* **功能描述**：**核心契约**。HR 确认当前标准版本。该操作会将当前草稿版本标记为 `confirmed`，更新确认时间戳并冻结，使其成为不可变快照；同时将岗位的 `current_criteria_version_id` 指向该版本。
* **成功响应 (200 OK)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "version_id": "cv_01j9xyz...",
    "job_id": "job_01j9abc...",
    "version": 1,
    "status": "confirmed",
    "confirmed_at": "2026-11-04T05:25:00.000Z",
    "total_criteria_count": 4,
    "required_criteria_count": 3,
    "bonus_criteria_count": 1
  },
  "timestamp": "2026-11-04T05:25:00.000Z"
}
```

---

### 3.3 批量导入与异步长任务 (FR-02, FR-08)

#### `POST /api/v1/batches`
* **功能描述**：批量上传 PDF 简历。每批限制最多 50 份，绑定指定岗位当前已生效的标准版本。
* **Content-Type**：`multipart/form-data`。
* **表单字段 (Form Fields)**：
  * `job_id` (string, required): 目标岗位 ID；
  * `title` (string, optional): 批次标题（未传时系统默认按时间生成）；
  * `files` (array of binary files, required): 文件列表，数量 1 ~ 50 份。

> [!IMPORTANT]
> **韧性受理与部分失败原则（Soft Acceptance）**：
> 1. **批次硬阻断条件**：
>    * 文件总数 > 50 时，拒绝受理，返回 `400 (30002 BatchSizeExceeded)`；
>    * 岗位未绑定确认标准时，拒绝受理，返回 `400 (20002 CriteriaVersionNotConfirmed)`；
>    * 全量文件无一有效时，返回 `400 (30003 EmptyBatchError)`。
> 2. **单项软受理条件**：
>    * 若 50 份文件中混入个别损坏文件或非 PDF 文件，**批次依然创建成功并受理**；
>    * 合法 PDF 正常进入 `status: "queued"` 队列调度解析；
>    * 异常文件直接在 `screening_items` 记录为 `status: "failed"`，并计入 `error_info`（错误码 `INVALID_FILE_FORMAT`），绝不阻断整批正常简历。

* **成功响应 (202 Accepted)**：
```json
{
  "code": 202,
  "message": "success",
  "data": {
    "batch_id": "batch_01j9batch...",
    "job_id": "job_01j9abc...",
    "criteria_version_id": "cv_01j9xyz...",
    "title": "2026-11-04 批次 01",
    "total_files": 50,
    "accepted_count": 49,
    "rejected_count": 1,
    "queued_items": [
      {
        "item_id": "item_01...",
        "filename": "候选人A_后端.pdf",
        "file_size_bytes": 1048576,
        "status": "queued"
      }
    ],
    "failed_items": [
      {
        "item_id": "item_50...",
        "filename": "候选人Z_作品集.docx",
        "file_size_bytes": 524288,
        "status": "failed",
        "error_info": {
          "code": "INVALID_FILE_FORMAT",
          "message": "仅支持 PDF 格式文件，请转换后重试",
          "retryable": false
        }
      }
    ],
    "sse_stream_url": "/api/v1/batches/batch_01j9batch.../events",
    "created_at": "2026-11-04T05:30:00.000Z"
  },
  "timestamp": "2026-11-04T05:30:00.000Z"
}
```

---

### 3.4 实时长连接通信与断线重连 (Server-Sent Events)

#### `GET /api/v1/batches/{batch_id}/events`
* **功能描述**：建立 SSE 流式长连接。服务端广播处理进度与单项状态跃迁，支持 `Last-Event-ID` 断线补偿。
* **请求头支持**：
  * `Last-Event-ID` (string, optional): 客户端上次接收的最后一条消息 ID。当网络闪断重连时，服务端补发该 ID 之后的所有未收变更，避免刷新。
* **响应头**：
  ```http
  HTTP/1.1 200 OK
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  ```
* **消息流标准格式**：
  * 每条数据块强制携带递增 `id:`；
  * 每 15 秒发送空注释心跳 `: keepalive` 防止中间代理超时断开。

##### 1. 进度事件 (`event: progress`)
```text
id: evt_101
event: progress
data: {"batch_id":"batch_01j9batch...","total":50,"completed":12,"failed":1,"parsing":3,"evaluating":2,"percent":26}

```

##### 2. 单项状态跃迁事件 (`event: item_updated`)
```text
id: evt_102
event: item_updated
data: {"item_id":"item_01...","candidate_name":"张小明","status":"completed","parse_stage":"text","derived_scores":{"match_score":85,"coverage_rate":100,"suggested_group":"recommended"},"error":null}

```

##### 3. 降级告警事件 (`event: stage_degraded`)
```text
id: evt_103
event: stage_degraded
data: {"item_id":"item_02...","from_stage":"text","to_stage":"ocr","reason":"纯文本可读率不足 40%，自动降级为 OCR 深度识别"}

```

##### 4. 批次全量完成事件 (`event: batch_completed`)
```text
id: evt_104
event: batch_completed
data: {"batch_id":"batch_01j9batch...","total":50,"success_count":48,"failed_count":2,"completed_at":"2026-11-04T05:33:20.000Z"}

```

---

### 3.5 工作台与候选人详情 (FR-04, FR-05, FR-06)

#### `GET /api/v1/batches/{batch_id}/items`
* **功能描述**：批次工作台候选人列表查询，支持按系统分流队列和人工状态精准过滤。
* **Query 参数**：
  * `group` (string, optional): `all` / `conflict` / `verification` / `recommended` / `other`；
  * `decision` (string, optional): `all` / `pending` / `advance` / `reject` / `supplement`；
  * `page` (integer, default 1), `page_size` (integer, default 20)。
* **成功响应 (200 OK)**：返回候选人分页数组与队列统计分布。

---

#### `GET /api/v1/screening-items/{item_id}`
* **功能描述**：获取候选人左右分屏复核详情，包含原件在线流式访问地址、完整结构化判定、引文及 PDF 精确页码。
* **成功响应 (200 OK)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "item_id": "item_01...",
    "batch_id": "batch_01j9batch...",
    "candidate_name": "张小明",
    "pdf_url": "/api/v1/screening-items/item_01.../pdf",
    "status": "completed",
    "parse_stage": "text",
    "evaluation": {
      "version": 1,
      "match_score": 85,
      "coverage_rate": 100,
      "suggested_group": "recommended",
      "is_rule_calibrated": true,
      "findings": [
        {
          "criterion_id": "crit_1",
          "description": "计算机相关专业统招本科及以上学历",
          "kind": "required",
          "importance": "high",
          "constraint": "strict",
          "verdict": "met",
          "reason": "毕业于浙江大学计算机科学与技术专业，工学学士",
          "evidences": [
            {
              "id": "ev_01",
              "page": 1,
              "quote": "教育经历：2014.09 - 2018.06 浙江大学 计算机科学与技术 本科",
              "method": "text"
            }
          ]
        }
      ]
    },
    "decisions_history": []
  },
  "timestamp": "2026-11-04T05:50:00.000Z"
}
```

---

#### `GET /api/v1/screening-items/{item_id}/pdf`
* **功能描述**：**原件流式预览端点**。供前端工作台与详情模态框流式渲染原始 PDF。
* **请求头**：支持 `Range: bytes=0-1048576` 分片流式加载。
* **安全防御**：服务端校验 `item_id` 归属，强校验文件存储路径防目录穿越攻击（Directory Traversal）。
* **响应头 (200 OK / 206 Partial Content)**：
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/pdf
  Accept-Ranges: bytes
  Content-Disposition: inline; filename="original_filename.pdf"
  Content-Length: 1048576
  ```

---

#### `POST /api/v1/screening-items/{item_id}/decisions`
* **功能描述**：HR 提交人机复核决策。系统追加记录留痕，严禁静默淘汰。
* **请求体 (application/json)**：
```json
{
  "decision": "advance",
  "tags": ["年限匹配", "具备高并发实战"],
  "notes": "候选人有大型系统重构背景，值得重点沟通"
}
```
* **成功响应 (200 OK)**：返回决策记录详情。

---

#### `POST /api/v1/screening-items/{item_id}/supplement`
* **功能描述**：**定向补充与增量重评契约 (FR-07)**。HR 电话沟通获取缺失信息后，针对具体条件项录入补充说明，触发重新打分，系统生成全新版本的 `EvaluationSnapshot`（旧快照完整留存）。
* **后端行为说明**：
  * 系统自动将 `supplement_note` 封装为一个 `method: "manual"` 的人工补充证据项：
    `evidences: [{"id": "ev_manual_...", "page": null, "quote": supplement_note, "method": "manual"}]`；
  * 更新该条件的判定结果为 `supplement_verdict`，写入新快照的 `findings`；
  * 重新执行确定性程序规则打分，生成版本 `version = previous_version + 1` 的新评估快照。
* **请求体 (application/json)**：
```json
{
  "criterion_id": "crit_3",
  "supplement_verdict": "met",
  "supplement_note": "HR 电话核实：候选人在上一家公司主导过日活 500 万微服务高并发拆分，有明确落地产出",
  "channel": "phone_call"
}
```
* **成功响应 (200 OK)**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "item_id": "item_01...",
    "previous_version": 1,
    "new_evaluation_version": 2,
    "previous_scores": {
      "match_score": 60,
      "coverage_rate": 66,
      "suggested_group": "verification"
    },
    "new_scores": {
      "match_score": 90,
      "coverage_rate": 100,
      "suggested_group": "recommended"
    },
    "updated_at": "2026-11-04T06:00:00.000Z"
  },
  "timestamp": "2026-11-04T06:00:00.000Z"
}
```

---

## 4. 大模型结构化抽取契约 (LLM Structured Output JSON Schema)

后端调用大模型执行证据匹配时，通过严格的 JSON Schema 强制约束输出结构，彻底消除大模型格式损坏与算分幻觉：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ResumeEvidenceExtractionResult",
  "type": "object",
  "required": ["candidate_name", "findings"],
  "properties": {
    "candidate_name": {
      "type": ["string", "null"],
      "description": "从简历中识别的候选人真实姓名"
    },
    "findings": {
      "type": "array",
      "description": "按岗位条件逐项判定的结果清单",
      "items": {
        "type": "object",
        "required": ["criterion_id", "verdict", "reason", "evidences"],
        "properties": {
          "criterion_id": {
            "type": "string",
            "description": "对应岗位条件的唯一 ID"
          },
          "verdict": {
            "type": "string",
            "enum": ["met", "unmet", "unknown"],
            "description": "客观判定：met(明确符合)、unmet(明确不符)、unknown(简历未提及)"
          },
          "reason": {
            "type": "string",
            "description": "判定依据陈述，严禁脑补推测"
          },
          "evidences": {
            "type": "array",
            "description": "支撑该判定的原文引用列表",
            "items": {
              "type": "object",
              "required": ["page", "quote"],
              "properties": {
                "page": {
                  "type": ["integer", "null"],
                  "description": "原件 PDF 的实际物理页码 (从 1 开始)"
                },
                "quote": {
                  "type": "string",
                  "description": "原件中的逐字引用片段，必须在原件文本中完全可溯源"
                }
              }
            }
          }
        }
      }
    }
  },
  "additionalProperties": false
}
```
