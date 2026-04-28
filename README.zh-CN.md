<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

给 AI 应用、Agent 和 MCP Client 使用的本地向量记忆层。

`elephance` 基于 LanceDB，提供一个轻量 TypeScript SDK，用来持久化用户记忆和项目 Schema。这个仓库同时提供 `elephance-mcp`，可以把同一套能力通过 stdio MCP Server 暴露给 Cursor 和其他 MCP Client。

[![npm version](https://img.shields.io/npm/v/elephance)](https://www.npmjs.com/package/elephance)
[![MIT License](https://img.shields.io/npm/l/elephance)](LICENSE)

## 为什么需要它

很多 AI 产品不一定一开始就需要完整 RAG 平台，但通常很快会需要一个可靠的小型记忆层。`elephance` 关注的就是这个中间地带：

- 用 LanceDB 把向量存在本地磁盘。
- 按语义相似度保存和查询用户记忆。
- 用稳定槽位覆盖长期偏好，减少重复记忆。
- 保存 Markdown 形式的数据库表、字段、关系说明。
- 支持语义查询、精确表名查询和批量关键词查询。
- Embedding 层可替换，不和存储逻辑绑定。
- 同一套能力可以通过 MCP 接入 Cursor 和 Agent 工作流。

## 包结构

| 包 | 作用 |
| --- | --- |
| `elephance` | 核心 TypeScript SDK。适合 Node.js 应用、CLI、Agent 和服务端直接调用。 |
| `elephance-mcp` | stdio MCP Server。适合 Cursor 或其他 MCP Client 调用。 |

## 安装

核心 SDK：

```bash
npm install elephance
```

默认 embedding provider 使用 OpenAI SDK 作为 peer dependency：

```bash
npm install openai
```

MCP Server：

```bash
npm install elephance-mcp
```

## 快速开始

```ts
import { configure, queryMemory, upsertMemory } from "elephance";

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

## Cursor MCP

在 Cursor 的 MCP 配置中加入 `elephance-mcp`：

```json
{
  "mcpServers": {
    "elephance": {
      "command": "npx",
      "args": ["elephance-mcp"],
      "env": {
        "ELEPHANCE_DB_PATH": ".lancedb",
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

MCP Server 暴露这些 tools：

| Tool | 作用 |
| --- | --- |
| `memory_upsert` | 写入一条短记忆。 |
| `memory_query` | 按语义相似度查询记忆。 |
| `memory_clear_user` | 删除某个用户的全部记忆。 |
| `schema_replace_source` | 替换某个 source path 下的 schema 分块。 |
| `schema_delete_source` | 删除某个 source path 下的 schema 分块。 |
| `schema_query` | 按语义相似度查询 schema。 |
| `schema_query_by_table_names` | 按精确表名查询 schema。 |
| `schema_batch_query` | 用多个关键词查询 schema 并合并重复来源。 |

## 配置

```ts
import { configure, configureEmbedding } from "elephance";

configure({
  dbPath: "./data/.lancedb",
  memoryTable: "memory",
  schemaTable: "project_schema",
});

configureEmbedding({
  model: "text-embedding-3-small",
});
```

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `dbPath` | `.lancedb` | LanceDB 数据目录。相对路径基于 `process.cwd()` 解析。 |
| `memoryTable` | `memory` | 用户记忆表。 |
| `schemaTable` | `project_schema` | 项目 Schema 表。 |

环境变量：

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | 仅在使用默认 OpenAI 兼容 embedding provider 时需要。 |
| `OPENAI_EMBEDDING_MODEL` | Embedding 模型，默认 `text-embedding-3-small`。 |
| `OPENAI_RELAY_BASE_URL` | OpenAI 兼容代理地址。 |
| `OPENAI_BASE_URL` | 旧版代理地址兜底。 |
| `MEMORY_OVERWRITE_LABELS` | 需要按用户和标签覆盖写入的标签列表，逗号分隔，默认 `user_preference`。 |
| `ELEPHANCE_DB_PATH` | MCP Server 使用的数据库路径。 |
| `ELEPHANCE_MEMORY_TABLE` | MCP Server 使用的 memory 表。 |
| `ELEPHANCE_SCHEMA_TABLE` | MCP Server 使用的 schema 表。 |

## 记忆

```ts
import { clearUserMemory, queryMemory, upsertMemory } from "elephance";

await upsertMemory("这个项目优先使用 pnpm。", {
  userId: "user-123",
  label: "user_preference",
});

await upsertMemory("计费模块中的金额字段统一使用分。", {
  userId: "user-123",
  label: "note",
});

const memories = await queryMemory("包管理器和计费模块约定", {
  topK: 5,
});

await clearUserMemory("user-123");
```

`MEMORY_OVERWRITE_LABELS` 中的标签会按 `userId + label` 写入稳定槽位。默认情况下，同一用户的新 `user_preference` 会替换旧偏好，而不是不断累积重复内容。

## Schema 检索

```ts
import {
  batchQueryProjectSchema,
  queryProjectSchema,
  queryProjectSchemaByTableNames,
  replaceProjectSchemaForSource,
} from "elephance";

await replaceProjectSchemaForSource(
  "tables/billing_invoice.md",
  new Date().toISOString(),
  [
    "## 字段\n- id: 主键\n- customer_id: 客户 ID",
    "## 关系\n发票表通过 invoice_id 和支付表关联。",
  ]
);

const semanticHits = await queryProjectSchema("发票和支付怎么关联", {
  minimal: true,
  topK: 3,
});

const tableHits = await queryProjectSchemaByTableNames([
  "billing_invoice",
  "billing_payment",
]);

const mergedHits = await batchQueryProjectSchema(["invoice", "payment"], {
  mergedTopK: 4,
});
```

如果已经知道精确表名，优先使用表名查询；如果需要让模型自己发现相关 schema，使用语义查询或批量查询。

## 自定义 Embedding

```ts
import {
  configure,
  queryMemory,
  setEmbeddingProvider,
  upsertMemory,
  type EmbeddingProvider,
} from "elephance";

class MyEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    return myEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

configure({ dbPath: "./data/.lancedb" });
setEmbeddingProvider(new MyEmbeddingProvider());

await upsertMemory("用户喜欢直接回答。", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("回答风格");
```

同一张表里的向量应该使用同一个 embedding 模型和同一维度。如果要切换到不同维度的模型，建议使用新的 `dbPath` 或表名。

## 安全建议

`elephance` 不会自动写入任何数据。只有你的应用或 MCP Client 主动调用 `upsertMemory`、`replaceProjectSchemaForSource` 这类写入 API 时，才会创建本地 LanceDB 数据。

- 除非你明确要提交本地向量数据，否则把 `.lancedb` 加入应用项目的 `.gitignore`。
- 不要把密钥、访问 token、密码、私钥或敏感个人数据写入 memory。
- 每条 memory 应该短、明确、可独立理解。
- 长期偏好优先使用 `label: "user_preference"`。
- 需要累积的上下文可以使用 `note`、`summary`、`fact` 等标签。
- 当用户要求删除记忆时，调用 `clearUserMemory(userId)`。
- Schema 建议一个 source 描述一个表或一个边界清晰的模块，例如 `tables/billing_invoice.md`。

可以参考 [examples/rules.md](examples/rules.md) 作为可复制的项目规则模板。

## API

```ts
// 连接
configure(options?: VectorStoreOptions): void
getConfig(): Required<VectorStoreOptions>
connect(): Promise<Connection>
resetConnection(): void
getTableNames(): Promise<string[]>
tableExists(tableName: string): Promise<boolean>
openTable(tableName: string): Promise<Table>

// Embedding
setEmbeddingProvider(provider: EmbeddingProvider): void
getEmbeddingProvider(): EmbeddingProvider | null
configureEmbedding(options?: EmbeddingOptions): void
getEmbeddingModel(): string
embedText(text: string): Promise<number[]>
embedTexts(texts: string[]): Promise<number[][]>

// 记忆
upsertMemory(text: string, metadata?: Record<string, unknown>): Promise<void>
queryMemory(queryText: string, options?: QueryOptions): Promise<MemoryHit[]>
clearUserMemory(userId: string): Promise<void>

// Schema
deleteProjectSchemaBySource(sourceRelativePath: string): Promise<void>
replaceProjectSchemaForSource(
  sourceRelativePath: string,
  lastUpdatedIso: string,
  chunkTexts: string[]
): Promise<void>
queryProjectSchema(queryText: string, options?: QueryOptions): Promise<SchemaHit[]>
queryProjectSchemaByTableNames(
  tableNames: string[],
  options?: QueryOptions
): Promise<SchemaHit[]>
batchQueryProjectSchema(
  keywords: string[],
  options?: BatchQueryOptions
): Promise<SchemaHit[]>
```

## 开发

```bash
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).
