import {
  Job,
  CriteriaVersion,
  Batch,
  ScreeningItem,
  Candidate,
  Document,
  Evidence,
  Evaluation,
  ProcessingRun,
  ReviewDecision,
} from '../domain/types'

export const DEFAULT_JOB: Job = {
  id: 'job-001',
  title: '资深全栈研发工程师 (AI Native)',
  department: '核心研发部',
  jdText: `岗位职责：
1. 负责企业级 AI Native 创新产品的全栈架构设计与核心模块研发，涵盖现代前端与高性能服务后端；
2. 负责大模型检索增强（RAG）、Agent 智能体流转系统的工程化落地；
3. 负责核心业务链路的高可用保障、短事务控制与全链路性能瓶颈调优；
4. 推动工程规范与自动化测试建设，带领初中级工程师高效交付。

任职要求：
1. 统招本科及以上学历，计算机或软件工程等相关专业；【必要·不可放宽】
2. 5 年及以上全栈开发实战经验，深度精通 React / TypeScript 与服务端开发；【必要·不可放宽】
3. 具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计；【必要·可酌情】
4. 具备良好的跨团队沟通与技术协作推进能力；【必要·可酌情】
5. 有大模型应用开发（RAG/Agent）真实落地经验者优先；【加分项】
6. 拥有主流开源项目贡献或个人技术博客影响力者优先。【加分项】`,
  currentCriteriaVersionId: 'crit-v1',
  createdAt: '2026-10-31T09:00:00Z',
}

export const DEFAULT_CRITERIA_VERSION: CriteriaVersion = {
  id: 'crit-v1',
  jobId: 'job-001',
  version: 1,
  status: 'confirmed',
  confirmedAt: '2026-10-31T09:30:00Z',
  recommendationRule: {
    minMatchScore: 70,
    minCoverageRate: 60,
    isCalibrated: true,
  },
  criteria: [
    {
      id: 'c-req-1',
      description: '统招本科及以上学历，计算机或软件相关专业',
      kind: 'required',
      importance: 'high',
      constraint: 'strict', // 不可放宽
    },
    {
      id: 'c-req-2',
      description: '5 年及以上全栈开发实战经验，精通 React/TypeScript 与服务端架构',
      kind: 'required',
      importance: 'high',
      constraint: 'strict', // 不可放宽
    },
    {
      id: 'c-req-3',
      description: '具备高并发系统架构与性能优化经验，熟练掌握数据库与缓存设计',
      kind: 'required',
      importance: 'medium',
      constraint: 'flexible', // 可酌情
    },
    {
      id: 'c-req-4',
      description: '具备良好的跨团队沟通与技术协作推进能力',
      kind: 'required',
      importance: 'low',
      constraint: 'flexible', // 可酌情
    },
    {
      id: 'c-bonus-1',
      description: '有大模型应用开发（RAG/Agent）真实落地经验',
      kind: 'bonus',
      importance: 'high',
      constraint: null,
    },
    {
      id: 'c-bonus-2',
      description: '拥有知名开源项目贡献或技术社区影响力',
      kind: 'bonus',
      importance: 'low',
      constraint: null,
    },
  ],
}

export const DEFAULT_CANDIDATES: Record<string, Candidate> = {
  'cand-1': {
    id: 'cand-1',
    displayName: '张承宇',
    originalFilename: '张承宇_资深全栈工程师_7年.pdf',
  },
  'cand-2': {
    id: 'cand-2',
    displayName: '李梦瑶',
    originalFilename: '李梦瑶_前端全栈架构_4年.pdf',
  },
  'cand-3': {
    id: 'cand-3',
    displayName: '赵浩然',
    originalFilename: '赵浩然_后端全栈专家_8年.pdf',
  },
  'cand-4': {
    id: 'cand-4',
    displayName: '王文博',
    originalFilename: '王文博_扫描件简历_损坏样例.pdf',
  },
  'cand-5': {
    id: 'cand-5',
    displayName: '周紫晴',
    originalFilename: '周紫晴_实习简版简历.pdf',
  },
}

export const DEFAULT_DOCUMENTS: Record<string, Document> = {
  'doc-1': {
    id: 'doc-1',
    candidateId: 'cand-1',
    kind: 'resume',
    name: '张承宇_资深全栈工程师_7年.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 428000,
    pageCount: 3,
    sourceLabel: '批量导入',
    contentPages: [
      '教育背景与求学履历 (Page 1)：\n- 浙江大学 · 计算机科学与技术系 · 本科学士 (2015.09 - 2019.06)\n- 2019.07 至今先后任职于字节跳动与一线科技独角兽，累计 7 年全栈研发，精通 React/Next.js/TypeScript 及 Go/Node 微服务体系。',
      '高并发工程实战与核心项目 (Page 2)：\n- 主导日均 2000 万请求的核心链路压测与重构，通过 Redis 缓存层拓扑优化与 MySQL 分库分表，将 P99 延迟由 240ms 降至 28ms。\n- 作为技术带头人带领 8 人敏捷研发小组，制定代码规范并践行 TDD 实践，跨部门协调推进 4 个重大版本准时上线。',
      '工程实战与加分项 (Page 3)：\n- 落地基于 LangChain 与 Milvus 的企业知识库 Agent 检索系统，首创重排重问机制，答案召回准确率由 64% 提升至 89%。',
    ],
    createdAt: '2026-10-31T10:00:00Z',
  },
  'doc-2': {
    id: 'doc-2',
    candidateId: 'cand-2',
    kind: 'resume',
    name: '李梦瑶_前端全栈架构_4年.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 312000,
    pageCount: 2,
    sourceLabel: '批量导入',
    contentPages: [
      '教育与初阶经历 (P1)：\n- 武汉大学 · 软件工程系 · 工学学士 (2018.09 - 2022.06)\n- 4 年前端与微服务开发履历，主导电商中台核心模块重构。',
      '微服务与架构 (P2)：\n- 参与微服务拆分与读写分离治理，设计并落地多级缓存同步方案，保障大促期间零宕机。\n- 具备团队日常 Code Review 经验，积极主动协同产品与设计完成切片交付。',
    ],
    createdAt: '2026-10-31T10:00:00Z',
  },
  'doc-3': {
    id: 'doc-3',
    candidateId: 'cand-3',
    kind: 'resume',
    name: '赵浩然_后端全栈专家_8年.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 512000,
    pageCount: 3,
    sourceLabel: '批量导入',
    contentPages: [
      '学历与经历 (P1)：\n- 南京信息职业技术学院 · 计算机应用技术 · 专科学历 (2014.09 - 2017.06)\n- 8 年互联网后端与全栈深耕，主导开发大型分布式订单撮合交易系统。',
      '高并发架构 (P2)：\n- 专精高并发低延迟架构，HikariCP 与 MySQL 死锁排查专家，曾支撑十万级 QPS 秒杀业务。',
      '工程管理 (P3)：\n- 带领 12 人架构组主导容器化改造与全链路混沌压测演练。',
    ],
    createdAt: '2026-10-31T10:00:00Z',
  },
  'doc-4': {
    id: 'doc-4',
    candidateId: 'cand-4',
    kind: 'resume',
    name: '王文博_扫描件简历_损坏样例.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 198000,
    pageCount: 1,
    sourceLabel: '批量导入',
    contentPages: ['[文件扫描损坏，OCR 识别率低于 15%，无法提取有效结构化字符流]'],
    createdAt: '2026-10-31T10:00:00Z',
  },
  'doc-5': {
    id: 'doc-5',
    candidateId: 'cand-5',
    kind: 'resume',
    name: '周紫晴_实习简版简历.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 145000,
    pageCount: 1,
    sourceLabel: '批量导入',
    contentPages: ['个人基本介绍与大学社团活动经历，未包含匹配本岗位工程经验的硬性条件依据。'],
    createdAt: '2026-10-31T10:00:00Z',
  },
}

export const DEFAULT_EVIDENCES: Record<string, Evidence> = {
  // 张承宇
  'ev-1-1': {
    id: 'ev-1-1',
    documentId: 'doc-1',
    page: 1,
    quote: '浙江大学 · 计算机科学与技术系 · 本科学士 (2015.09 - 2019.06)',
    method: 'text',
  },
  'ev-1-2': {
    id: 'ev-1-2',
    documentId: 'doc-1',
    page: 1,
    quote: '2019.07 至今先后任职于字节跳动与一线科技独角兽，累计 7 年全栈研发，精通 React/Next.js/TypeScript 及 Go/Node 微服务体系。',
    method: 'text',
  },
  'ev-1-3': {
    id: 'ev-1-3',
    documentId: 'doc-1',
    page: 2,
    quote: '主导日均 2000 万请求的核心链路压测与重构，通过 Redis 缓存层拓扑优化与 MySQL 分库分表，将 P99 延迟由 240ms 降至 28ms。',
    method: 'text',
  },
  'ev-1-4': {
    id: 'ev-1-4',
    documentId: 'doc-1',
    page: 2,
    quote: '作为技术带头人带领 8 人敏捷研发小组，制定代码规范并践行 TDD 实践，跨部门协调推进 4 个重大版本准时上线。',
    method: 'text',
  },
  'ev-1-5': {
    id: 'ev-1-5',
    documentId: 'doc-1',
    page: 3,
    quote: '落地基于 LangChain 与 Milvus 的企业知识库 Agent 检索系统，首创重排重问机制，答案召回准确率由 64% 提升至 89%。',
    method: 'text',
  },
  // 李梦瑶
  'ev-2-1': {
    id: 'ev-2-1',
    documentId: 'doc-2',
    page: 1,
    quote: '武汉大学 · 软件工程系 · 工学学士 (2018.09 - 2022.06)',
    method: 'text',
  },
  'ev-2-3': {
    id: 'ev-2-3',
    documentId: 'doc-2',
    page: 2,
    quote: '参与微服务拆分与读写分离治理，设计并落地多级缓存同步方案，保障大促期间零宕机。',
    method: 'ocr',
  },
  'ev-2-4': {
    id: 'ev-2-4',
    documentId: 'doc-2',
    page: 2,
    quote: '具备团队日常 Code Review 经验，积极主动协同产品与设计完成切片交付。',
    method: 'ocr',
  },
  // 赵浩然
  'ev-3-1': {
    id: 'ev-3-1',
    documentId: 'doc-3',
    page: 1,
    quote: '南京信息职业技术学院 · 计算机应用技术 · 专科学历 (2014.09 - 2017.06)',
    method: 'text',
  },
  'ev-3-2': {
    id: 'ev-3-2',
    documentId: 'doc-3',
    page: 1,
    quote: '8 年互联网后端与全栈深耕，主导开发大型分布式订单撮合交易系统。',
    method: 'text',
  },
  'ev-3-3': {
    id: 'ev-3-3',
    documentId: 'doc-3',
    page: 2,
    quote: '专精高并发低延迟架构，HikariCP 与 MySQL 死锁排查专家，曾支撑十万级 QPS 秒杀业务。',
    method: 'text',
  },
  'ev-3-4': {
    id: 'ev-3-4',
    documentId: 'doc-3',
    page: 3,
    quote: '带领 12 人架构组主导容器化改造与全链路混沌压测演练。',
    method: 'text',
  },
}

export const DEFAULT_EVALUATIONS: Record<string, Evaluation> = {
  // 张承宇 - 推荐 (100分, 覆盖率100%)
  'eval-1': {
    id: 'eval-1',
    itemId: 'item-1',
    criteriaVersionId: 'crit-v1',
    documentIds: ['doc-1'],
    ruleVersion: 'v2.1',
    modelVersion: 'gemini-1.5-pro-preview',
    promptVersion: 'p-resume-eval-v3',
    findings: [
      {
        criterionId: 'c-req-1',
        verdict: 'met',
        evidenceIds: ['ev-1-1'],
        reason: '统招本科毕业于浙江大学计算机系，学历与专业完全符合。',
      },
      {
        criterionId: 'c-req-2',
        verdict: 'met',
        evidenceIds: ['ev-1-2'],
        reason: '拥有 7 年一线全栈研发经验，超过 5 年要求，技术栈高度契合。',
      },
      {
        criterionId: 'c-req-3',
        verdict: 'met',
        evidenceIds: ['ev-1-3'],
        reason: '具备日均 2000 万请求的高并发重构实战，性能调优成果明确。',
      },
      {
        criterionId: 'c-req-4',
        verdict: 'met',
        evidenceIds: ['ev-1-4'],
        reason: '有带领 8 人小组与跨部门推进重大版本的领导与沟通成果。',
      },
      {
        criterionId: 'c-bonus-1',
        verdict: 'met',
        evidenceIds: ['ev-1-5'],
        reason: '主导落地企业级知识库 Agent 系统，准确率提升成果显著。',
      },
      {
        criterionId: 'c-bonus-2',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '简历未列明开源项目地址或技术社区影响力的直接证据。',
      },
    ],
    createdAt: '2026-10-31T10:05:00Z',
  },
  // 李梦瑶 - 待核实 (关键不可放宽条件 C2 证据不足)
  'eval-2': {
    id: 'eval-2',
    itemId: 'item-2',
    criteriaVersionId: 'crit-v1',
    documentIds: ['doc-2'],
    ruleVersion: 'v2.1',
    modelVersion: 'gemini-1.5-pro-preview',
    promptVersion: 'p-resume-eval-v3',
    findings: [
      {
        criterionId: 'c-req-1',
        verdict: 'met',
        evidenceIds: ['ev-2-1'],
        reason: '武汉大学软件工程本科学历，专业对口。',
      },
      {
        criterionId: 'c-req-2',
        verdict: 'unknown', // 关键条件未知
        evidenceIds: [],
        reason: '简历显示工作年限约 4 年，且主要为前端架构，5 年全栈实战证据不足，需人工核实。',
      },
      {
        criterionId: 'c-req-3',
        verdict: 'met',
        evidenceIds: ['ev-2-3'],
        reason: '具备多级缓存与微服务治理经验。',
      },
      {
        criterionId: 'c-req-4',
        verdict: 'met',
        evidenceIds: ['ev-2-4'],
        reason: '具备团队协同与切片交付经历。',
      },
      {
        criterionId: 'c-bonus-1',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未提及大模型实战经验。',
      },
      {
        criterionId: 'c-bonus-2',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未提及开源或社区影响力。',
      },
    ],
    createdAt: '2026-10-31T10:05:15Z',
  },
  // 赵浩然 - 条件冲突 (不可放宽学历不符合)
  'eval-3': {
    id: 'eval-3',
    itemId: 'item-3',
    criteriaVersionId: 'crit-v1',
    documentIds: ['doc-3'],
    ruleVersion: 'v2.1',
    modelVersion: 'gemini-1.5-pro-preview',
    promptVersion: 'p-resume-eval-v3',
    findings: [
      {
        criterionId: 'c-req-1',
        verdict: 'unmet', // 不可放宽条件明确不满足
        evidenceIds: ['ev-3-1'],
        reason: '学历为专科（南京信息职业技术学院），不符合统招本科硬性必要门槛。',
      },
      {
        criterionId: 'c-req-2',
        verdict: 'met',
        evidenceIds: ['ev-3-2'],
        reason: '8 年经验，满足全栈架构经验要求。',
      },
      {
        criterionId: 'c-req-3',
        verdict: 'met',
        evidenceIds: ['ev-3-3'],
        reason: '支撑 10 万 QPS 秒杀高并发，性能调优功底深厚。',
      },
      {
        criterionId: 'c-req-4',
        verdict: 'met',
        evidenceIds: ['ev-3-4'],
        reason: '带领 12 人架构组，组织协作与工程推进能力出众。',
      },
      {
        criterionId: 'c-bonus-1',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未见大模型应用经验提及。',
      },
      {
        criterionId: 'c-bonus-2',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未见开源社区项目披露。',
      },
    ],
    createdAt: '2026-10-31T10:05:30Z',
  },
  // 周紫晴 - 证据不足，暂不评分 (全部未知)
  'eval-5': {
    id: 'eval-5',
    itemId: 'item-5',
    criteriaVersionId: 'crit-v1',
    documentIds: ['doc-5'],
    ruleVersion: 'v2.1',
    modelVersion: 'gemini-1.5-pro-preview',
    promptVersion: 'p-resume-eval-v3',
    findings: [
      {
        criterionId: 'c-req-1',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未识别出统招本科毕业证书或学历信息。',
      },
      {
        criterionId: 'c-req-2',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未识别出 5 年工作履历，仅有学生社团经历。',
      },
      {
        criterionId: 'c-req-3',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未提及高并发与数据库经验。',
      },
      {
        criterionId: 'c-req-4',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未提及跨部门研发推进能力。',
      },
      {
        criterionId: 'c-bonus-1',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未提及大模型。',
      },
      {
        criterionId: 'c-bonus-2',
        verdict: 'unknown',
        evidenceIds: [],
        reason: '未提及开源。',
      },
    ],
    createdAt: '2026-10-31T10:06:00Z',
  },
}

export const DEFAULT_RUNS: Record<string, ProcessingRun> = {
  'run-1': {
    id: 'run-1',
    itemId: 'item-1',
    attempt: 1,
    status: 'completed',
    stage: 'text',
    startedAt: '2026-10-31T10:01:00Z',
    updatedAt: '2026-10-31T10:05:00Z',
  },
  'run-2': {
    id: 'run-2',
    itemId: 'item-2',
    attempt: 1,
    status: 'completed',
    stage: 'ocr', // 逐级解析触发 OCR
    startedAt: '2026-10-31T10:01:00Z',
    updatedAt: '2026-10-31T10:05:15Z',
  },
  'run-3': {
    id: 'run-3',
    itemId: 'item-3',
    attempt: 1,
    status: 'completed',
    stage: 'text',
    startedAt: '2026-10-31T10:01:00Z',
    updatedAt: '2026-10-31T10:05:30Z',
  },
  'run-4': {
    id: 'run-4',
    itemId: 'item-4',
    attempt: 1,
    status: 'failed',
    stage: 'multimodal',
    error: {
      code: 'demo_pdf_corrupted',
      message: 'PDF 扫描版面灰度失真严重且图层缺损，OCR 与多模态解析均未提取出有效文本，已流转至异常待办。',
      retryable: true,
    },
    startedAt: '2026-10-31T10:01:00Z',
    updatedAt: '2026-10-31T10:05:45Z',
  },
  'run-5': {
    id: 'run-5',
    itemId: 'item-5',
    attempt: 1,
    status: 'completed',
    stage: 'text',
    startedAt: '2026-10-31T10:01:00Z',
    updatedAt: '2026-10-31T10:06:00Z',
  },
}

export const DEFAULT_ITEMS: Record<string, ScreeningItem> = {
  'item-1': {
    id: 'item-1',
    batchId: 'batch-001',
    candidateId: 'cand-1',
    resumeDocumentId: 'doc-1',
    currentEvaluationId: 'eval-1',
    currentRunId: 'run-1',
  },
  'item-2': {
    id: 'item-2',
    batchId: 'batch-001',
    candidateId: 'cand-2',
    resumeDocumentId: 'doc-2',
    currentEvaluationId: 'eval-2',
    currentRunId: 'run-2',
  },
  'item-3': {
    id: 'item-3',
    batchId: 'batch-001',
    candidateId: 'cand-3',
    resumeDocumentId: 'doc-3',
    currentEvaluationId: 'eval-3',
    currentRunId: 'run-3',
  },
  'item-4': {
    id: 'item-4',
    batchId: 'batch-001',
    candidateId: 'cand-4',
    resumeDocumentId: 'doc-4',
    currentEvaluationId: null, // 失败项无评估
    currentRunId: 'run-4',
  },
  'item-5': {
    id: 'item-5',
    batchId: 'batch-001',
    candidateId: 'cand-5',
    resumeDocumentId: 'doc-5',
    currentEvaluationId: 'eval-5',
    currentRunId: 'run-5',
  },
}

export const DEFAULT_BATCH: Batch = {
  id: 'batch-001',
  name: '第 1 批次 (自营官网与私信推荐简历)',
  jobId: 'job-001',
  criteriaVersionId: 'crit-v1',
  itemIds: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
  createdAt: '2026-10-31T10:00:00Z',
}

export const DEFAULT_DECISIONS: Record<string, ReviewDecision> = {
  // 张承宇已有人工复核决定
  'dec-1': {
    id: 'dec-1',
    itemId: 'item-1',
    evaluationId: 'eval-1',
    outcome: 'advance',
    reasonTags: ['核心经验契合', '高并发实操深厚', '团队协作力强'],
    note: '各方面指标高度契合，重点安排用人部门技术一面。',
    createdAt: '2026-10-31T11:20:00Z',
    supersedesId: null,
  },
}
