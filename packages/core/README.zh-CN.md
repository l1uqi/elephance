# @elephance/core

[English](README.md) | [简体中文](README.zh-CN.md)

面向 TypeScript 应用的本地 LanceDB 向量记忆、规则记忆和项目 Schema 检索 SDK。

`@elephance/core` 提供一组轻量 API，用来保存持久用户记忆、结构化可复用规则、索引项目 Schema 分块，并通过语义搜索取回相关上下文。它默认本地优先，向量数据会写入你配置的 LanceDB 目录。

## 安装

```bash
npm install @elephance/core openai
```

只有使用默认 OpenAI 兼容 embedding provider 时才需要安装 `openai`。

## 环境要求

- Node.js 18 或更高版本。
- 一个可写入的本地目录用于保存 LanceDB 数据。
- 使用默认 embedding provider 时需要配置 `OPENAI_API_KEY`。

## 快速开始

```ts
import { configure, queryMemory, upsertMemory } from "@elephance/core";

configure({
  dbPath: "./data/.lancedb",
});

await upsertMemory("用户偏好简洁的 TypeScript 示例。", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("应该用什么风格回答这个用户？", {
  topK: 3,
});

console.log(hits);
```

## 配置

```ts
import { configure, configureEmbedding } from "@elephance/core";

configure({
  dbPath: "./data/.lancedb",
  memoryTable: "memory",
  schemaTable: "project_schema",
  ruleTable: "rule_memory",
});

configureEmbedding({
  model: "text-embedding-3-small",
});
```

`configure()` 会重置缓存的 LanceDB 连接，因此建议在第一次查询或写入之前调用。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | 使用默认 OpenAI 兼容 embedding provider 时需要。 |
| `OPENAI_EMBEDDING_MODEL` | Embedding 模型，默认 `text-embedding-3-small`。 |
| `OPENAI_RELAY_BASE_URL` | OpenAI 兼容 base URL，例如代理或中转服务。 |
| `OPENAI_BASE_URL` | 旧版 base URL 兜底。 |
| `MEMORY_OVERWRITE_LABELS` | 需要按用户和标签覆盖写入的标签列表，逗号分隔，默认 `user_preference`。 |

## Rule Memory API

Rule memory 适合保存长期可复用的行为约束，例如用户纠正、项目约定、代码风格、UI 偏好和 Agent 行为规范。规则默认写入独立的 `rule_memory` 表。

```ts
import {
  listRules,
  queryRules,
  recordRuleHit,
  updateRuleStatus,
  upsertRule,
} from "@elephance/core";

const rule = await upsertRule("这个项目按钮圆角不要超过 8px。", {
  label: "ui_preference",
  scope: "project",
  projectId: "my-app",
  action: "按钮圆角保持在 8px 以内。",
  confidence: 0.9,
  source: "manual",
});

const activeRules = await queryRules("实现按钮组件", {
  projectId: "my-app",
  topK: 3,
  recordHit: true,
});

const allProjectRules = await listRules({
  projectId: "my-app",
  includeInactive: true,
});

await recordRuleHit(rule.id);
await updateRuleStatus(rule.id, "deprecated");
```

规则状态包括 `candidate`、`active`、`conflicted`、`deprecated` 和 `archived`。`queryRules()` 默认只返回 active 规则；需要检查非 active 规则时，可以传 `includeInactive: true` 或显式传 `status`。

## Memory API

Memory 适合保存短小、稳定、可长期复用的信息，例如用户偏好、笔记、摘要和事实。

```ts
import { clearUserMemory, queryMemory, upsertMemory } from "@elephance/core";

await upsertMemory("这个项目优先使用 pnpm。", {
  userId: "user-123",
  label: "user_preference",
  source: "settings",
});

const memories = await queryMemory("包管理器偏好", {
  topK: 3,
});

await clearUserMemory("user-123");
```

`MEMORY_OVERWRITE_LABELS` 中的标签会按 `userId + label` 覆盖写入。默认情况下，`user_preference` 对每个用户表现为一个稳定槽位，而 `note`、`summary`、`fact` 等标签可以累积多条记录。

## Project Schema API

Schema 存储适合保存数据库表文档、API 契约、领域模型，或任何需要通过语义搜索取回的项目上下文。

```ts
import {
  batchQueryProjectSchema,
  deleteProjectSchemaBySource,
  queryProjectSchema,
  queryProjectSchemaByTableNames,
  replaceProjectSchemaForSource,
} from "@elephance/core";

await replaceProjectSchemaForSource(
  "tables/billing_invoice.md",
  new Date().toISOString(),
  [
    "## 字段\n- id: 主键\n- customer_id: 客户引用",
    "## 关系\n发票表通过 invoice_id 和支付表关联。",
  ]
);

const semanticHits = await queryProjectSchema("发票和支付怎么关联", {
  minimal: true,
  topK: 3,
});

const exactHits = await queryProjectSchemaByTableNames(
  ["billing_invoice", "billing_payment"],
  { minimal: true }
);

const mergedHits = await batchQueryProjectSchema(
  ["invoice", "payment", "customer"],
  { mergedTopK: 4 }
);

await deleteProjectSchemaBySource("tables/billing_invoice.md");
```

## 查询选项

| 选项 | 说明 |
| --- | --- |
| `topK` | 最多返回多少条结果，默认 `3`。 |
| `minimal` | 为 true 时返回更紧凑的 schema 文本。Schema 查询默认 `true`。 |
| `maxTextChars` | minimal 模式下每条 schema 结果的最大文本长度，默认 `420`。 |
| `candidateLimit` | 合并结果前的向量搜索候选数量，默认 `8`。 |
| `maxChunksPerSource` | 每个 source 最多合并多少个分块，默认 `1`。 |
| `mergedTopK` | `batchQueryProjectSchema` 的最大合并结果数，默认 `4`。 |

Rule 查询还支持 `label`、`scope`、`userId`、`projectId`、`repoPath`、`client`、`status`、`includeInactive` 和 `recordHit` 等过滤项。

## 研究背景

`@elephance/core` 刻意不依赖大模型。它只提供 rule memory 所需的本地存储、状态管理、检索和命中反馈；提取、判断和反思逻辑放在上层包里。

这一层的设计参考了近期 Agent 记忆研究：[Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670) 提供 write/manage/read 闭环视角；[AutoSkill](https://arxiv.org/abs/2603.01145) 和 [MemSkill](https://arxiv.org/abs/2602.02474) 启发了可复用、可演化 artifact 的存储方式；[De Jure](https://arxiv.org/abs/2604.02276) 启发了可判断、可合并、可废弃和可归档的结构化规则字段。

## 自定义 Embedding Provider

你可以用自己的 embedding 后端替换默认 OpenAI 兼容 provider。

```ts
import { setEmbeddingProvider } from "@elephance/core";

setEmbeddingProvider({
  async embed(text) {
    return myEmbeddingClient.embed(text);
  },
  async embedBatch(texts) {
    return myEmbeddingClient.embedBatch(texts);
  },
});
```

同一个 LanceDB 表里的所有向量应该使用同一个 embedding 模型和相同维度。更换模型或向量维度时，建议使用新的 `dbPath` 或表名。

## 连接辅助 API

```ts
import {
  connect,
  getTableNames,
  openTable,
  resetConnection,
  tableExists,
} from "@elephance/core";
```

这些辅助方法适合诊断、测试和更高级的 LanceDB 使用场景。

## 安全建议

- 不要保存密钥、访问 token、密码、私钥或敏感个人数据。
- 每条 memory 应该短、明确、可独立理解。
- 每条 rule 应该短、可执行、有明确作用域。项目约定优先用 `project` 或 `repo` scope，个人偏好用 `user` scope。
- 旧规则不要直接删除，优先标记为 `deprecated` 或 `archived`。
- 除非你明确想提交本地向量数据，否则把 `.lancedb` 加入 `.gitignore`。
- 同一个表中的向量应保持相同 embedding 模型和维度。

## 相关包

使用 [`@elephance/mcp`](../mcp/README.zh-CN.md) 可以把同一套 memory 和 schema 能力暴露给 Cursor 或其他 MCP 兼容客户端。
