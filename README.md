<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

A lightweight TypeScript wrapper around LanceDB for local vector storage, user memory, and project schema retrieval.

[![npm version](https://img.shields.io/npm/v/elephance)](https://www.npmjs.com/package/elephance)
[![MIT License](https://img.shields.io/npm/l/elephance)](LICENSE)

## What Problem Does It Solve?

Many AI applications need a small, reliable vector store without building a full retrieval system from scratch. This package gives you:

- Local-first vector persistence backed by LanceDB.
- User memory storage, including smart overwrite for stable preference slots.
- Project schema retrieval for SQL tables, fields, and relationship notes.
- A pluggable embedding layer, so you can use OpenAI-compatible APIs or your own embedding service.
- Compact retrieval output for LLM prompts, reducing prompt size while keeping useful context.

It is useful when building AI assistants, coding tools, RAG features, personal memory systems, and MCP servers that need durable semantic search.

## Features

- **Local Vector Storage**: LanceDB stores vectors on disk under your configured path.
- **Memory Management**: Store and query user memories by semantic similarity.
- **Smart Preference Overwrite**: `user_preference` memories overwrite per user and label by default.
- **Schema Retrieval**: Store Markdown schema chunks and retrieve them semantically or by exact table name.
- **Batch Schema Query**: Query several keywords and merge duplicate sources.
- **Pluggable Embeddings**: Use the default OpenAI-compatible provider or inject your own provider.
- **Minimal Mode**: Return compact schema text for LLM prompts.

## Installation

```bash
npm install elephance
```

The default embedding provider uses the OpenAI SDK as a peer dependency:

```bash
npm install openai
```

For local development from this repository:

```bash
npm run build
npm install path/to/elephance
```

## Quick Start

```ts
import { configure, upsertMemory, queryMemory } from "elephance";

configure({
  dbPath: "./data/.lancedb",
});

await upsertMemory("I prefer dark theme", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("theme preference");
console.log(hits);
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes* | OpenAI API key. Required only when using the default embedding provider. |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model. Defaults to `text-embedding-3-small`. |
| `OPENAI_RELAY_BASE_URL` | No | OpenAI-compatible relay base URL, for example `https://example.com/v1`. |
| `OPENAI_BASE_URL` | No | Legacy relay base URL. Lower priority than `OPENAI_RELAY_BASE_URL`. |
| `MEMORY_OVERWRITE_LABELS` | No | Comma-separated labels that should overwrite per user and label. Defaults to `user_preference`. |

## Configuration

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

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `dbPath` | `string` | `.lancedb` | Database directory path. Relative paths resolve from `process.cwd()`. |
| `memoryTable` | `string` | `memory` | Table name for user memory rows. |
| `schemaTable` | `string` | `project_schema` | Table name for project schema rows. |

## Memory Usage

Use memory APIs to store user preferences, facts, notes, or interaction summaries.

```ts
import {
  configure,
  upsertMemory,
  queryMemory,
  clearUserMemory,
} from "elephance";

configure({ dbPath: "./data/.lancedb" });

await upsertMemory("I prefer TypeScript over JavaScript", {
  userId: "user-456",
  label: "user_preference",
});

const results = await queryMemory("programming language preference", {
  topK: 3,
});

await clearUserMemory("user-456");
```

For labels listed in `MEMORY_OVERWRITE_LABELS`, the row ID is derived from `userId + label`. This means a new `user_preference` for the same user replaces the old one instead of accumulating duplicates.

## Schema Retrieval Usage

Use schema APIs to store Markdown chunks that describe database tables, fields, relationships, or project documents.

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
    "## Fields\n- id: primary key\n- amount: invoice amount",
    "## Notes\nInvoices can be joined with payments by invoice_id.",
  ]
);

const semanticHits = await queryProjectSchema("invoice payment join", {
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

## Custom Embedding Provider

Use a custom provider when you do not want to call OpenAI directly, or when you already have embeddings from another service.

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

await upsertMemory("The user prefers concise answers", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("answer style");
```

All vectors stored in the same table should use the same embedding dimensionality. If you switch embedding models or providers with a different vector size, use a new LanceDB path or table.

## API Reference

### Connection

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

### Memory

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

## Types

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

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT License - see [LICENSE](LICENSE) for details.
