<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

一个基于 LanceDB 的轻量 TypeScript 向量存储封装，用于本地向量存储、用户记忆和项目 Schema 检索。

[![npm version](https://img.shields.io/npm/v/elephance)](https://www.npmjs.com/package/elephance)
[![MIT License](https://img.shields.io/npm/l/elephance)](LICENSE)

## 解决什么问题？

很多 AI 应用都需要一个小而可靠的向量存储，但不想从零开始封装完整的检索系统。这个包提供：

- 基于 LanceDB 的本地优先向量持久化。
- 用户记忆存储，支持稳定偏好槽位的智能覆盖。
- 项目 Schema 检索，可用于 SQL 表、字段、关系说明等内容。
- 可插拔 embedding 层，可使用 OpenAI 兼容 API，也可以接入你自己的 embedding 服务。
- 更紧凑的检索结果，方便放进 LLM prompt，减少 token 占用。

它适合用于 AI 助手、代码生成工具、RAG 功能、个人记忆系统，以及需要持久语义搜索的 MCP Server。

## 功能特性

- **本地向量存储**：LanceDB 会把向量保存到你配置的本地路径。
- **记忆管理**：按语义相似度保存和查询用户记忆。
- **偏好智能覆盖**：默认情况下，`user_preference` 会按用户和标签覆盖旧记忆。
- **Schema 检索**：保存 Markdown schema 分块，并支持语义检索或按表名精确检索。
- **批量 Schema 查询**：查询多个关键词，并合并重复来源。
- **可插拔 Embedding**：使用默认 OpenAI 兼容 provider，或注入你自己的 provider。
- **Minimal Mode**：返回更紧凑的 schema 文本，适合 LLM prompt。

## 安装

```bash
npm install elephance
```

如果使用默认 OpenAI embedding provider，还需要安装 OpenAI SDK：

```bash
npm install openai
```

如果你在本机直接使用这个仓库：

```bash
npm run build
npm install path/to/elephance
```

## 快速开始

```ts
import { configure, upsertMemory, queryMemory } from "elephance";

configure({
  dbPath: "./data/.lancedb",
});

await upsertMemory("我喜欢深色主题", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("用户喜欢什么主题");
console.log(hits);
```

## 环境变量

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 是* | OpenAI API key。只有使用默认 embedding provider 时才需要。 |
| `OPENAI_EMBEDDING_MODEL` | 否 | Embedding 模型，默认 `text-embedding-3-small`。 |
| `OPENAI_RELAY_BASE_URL` | 否 | OpenAI 兼容代理地址，例如 `https://example.com/v1`。 |
| `OPENAI_BASE_URL` | 否 | 旧版代理地址，优先级低于 `OPENAI_RELAY_BASE_URL`。 |
| `MEMORY_OVERWRITE_LABELS` | 否 | 需要按用户和标签覆盖写入的标签列表，逗号分隔，默认 `user_preference`。 |

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

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `dbPath` | `string` | `.lancedb` | 数据库目录路径。相对路径会基于 `process.cwd()` 解析。 |
| `memoryTable` | `string` | `memory` | 用户记忆表名。 |
| `schemaTable` | `string` | `project_schema` | 项目 Schema 表名。 |

## 记忆存储

用 memory API 保存用户偏好、事实、笔记或会话摘要。

```ts
import {
  configure,
  upsertMemory,
  queryMemory,
  clearUserMemory,
} from "elephance";

configure({ dbPath: "./data/.lancedb" });

await upsertMemory("我更喜欢 TypeScript，而不是 JavaScript", {
  userId: "user-456",
  label: "user_preference",
});

const results = await queryMemory("用户喜欢什么编程语言", {
  topK: 3,
});

await clearUserMemory("user-456");
```

对于 `MEMORY_OVERWRITE_LABELS` 中列出的标签，行 ID 会由 `userId + label` 推导出来。这意味着同一个用户的新版 `user_preference` 会替换旧记录，而不是不断积累重复偏好。

## Schema 检索

用 schema API 保存描述数据库表、字段、关系或项目文档的 Markdown 分块。

```ts
import {
  configure,
  replaceProjectSchemaForSource,
  queryProjectSchema,
  queryProjectSchemaByTableNames,
  batchQueryProjectSchema,
} from "elephance";

configure({ dbPath: "./data/.lancedb" });

await replaceProjectSchemaForSource(
  "tables/billing_invoice.md",
  new Date().toISOString(),
  [
    "## 字段定义\n- id: 主键\n- amount: 发票金额",
    "## 说明\n发票表可以通过 invoice_id 和支付表关联。",
  ]
);

const semanticHits = await queryProjectSchema("发票和支付怎么关联", {
  minimal: true,
  topK: 3,
});

const exactHits = await queryProjectSchemaByTableNames([
  "billing_invoice",
  "billing_payment",
]);

const mergedHits = await batchQueryProjectSchema(
  ["invoice", "payment", "customer"],
  { mergedTopK: 4 }
);
```

## 自定义 Embedding Provider

如果你不想直接调用 OpenAI，或已经有其他 embedding 服务，可以注入自定义 provider。

```ts
import {
  configure,
  setEmbeddingProvider,
  upsertMemory,
  queryMemory,
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

await upsertMemory("用户喜欢简短回答", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("回答风格");
```

同一个表里的向量维度必须一致。如果你换了 embedding 模型或 provider，并且向量维度不同，建议使用新的 LanceDB 路径或表名。

## API 参考

### 连接

```ts
configure(options?: VectorStoreOptions): void
getConfig(): Required<VectorStoreOptions>
connect(): Promise<Connection>
resetConnection(): void
getTableNames(): Promise<string[]>
tableExists(tableName: string): Promise<boolean>
openTable(tableName: string): Promise<Table>
```

### Embedding

```ts
setEmbeddingProvider(provider: EmbeddingProvider): void
getEmbeddingProvider(): EmbeddingProvider | null
configureEmbedding(options?: EmbeddingOptions): void
getEmbeddingModel(): string
embedText(text: string): Promise<number[]>
embedTexts(texts: string[]): Promise<number[][]>
```

### 记忆

```ts
upsertMemory(text: string, metadata?: Record<string, unknown>): Promise<void>
queryMemory(queryText: string, options?: QueryOptions): Promise<MemoryHit[]>
clearUserMemory(userId: string): Promise<void>
```

### Schema

```ts
deleteProjectSchemaBySource(sourceRelativePath: string): Promise<void>

replaceProjectSchemaForSource(
  sourceRelativePath: string,
  lastUpdatedIso: string,
  chunkTexts: string[]
): Promise<void>

queryProjectSchema(
  queryText: string,
  options?: QueryOptions
): Promise<SchemaHit[]>

queryProjectSchemaByTableNames(
  tableNames: string[],
  options?: QueryOptions
): Promise<SchemaHit[]>

batchQueryProjectSchema(
  keywords: string[],
  options?: BatchQueryOptions
): Promise<SchemaHit[]>
```

## 类型

```ts
interface QueryOptions {
  minimal?: boolean;
  maxTextChars?: number;
  candidateLimit?: number;
  maxChunksPerSource?: number;
  topK?: number;
}

interface BatchQueryOptions extends QueryOptions {
  mergedTopK?: number;
}

interface MemoryHit {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  distance: number;
}

interface SchemaHit {
  id: string;
  text: string;
  source: string;
  last_updated: string;
  distance: number;
}
```

## 开发

```bash
npm install
npm run build
npm test
```

## License

MIT License - see [LICENSE](LICENSE) for details.
