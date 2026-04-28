<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

Local vector memory for AI apps, agents, and MCP clients.

`elephance` wraps LanceDB with a small TypeScript API for durable user memory and project schema retrieval. The repository also ships `elephance-mcp`, a stdio MCP server that exposes the same storage layer to Cursor and other MCP clients.

[![npm version](https://img.shields.io/npm/v/elephance)](https://www.npmjs.com/package/elephance)
[![MIT License](https://img.shields.io/npm/l/elephance)](LICENSE)

## Why

AI products often need a simple memory layer before they need a full RAG platform. `elephance` focuses on that middle ground:

- Store local vectors on disk with LanceDB.
- Save and retrieve user memories by semantic similarity.
- Keep stable user preferences tidy with overwrite slots.
- Store Markdown schema chunks for database tables, fields, and relationships.
- Query schema by semantic search, exact table name, or batched keywords.
- Swap the embedding backend without changing storage code.
- Run the same capabilities through MCP for Cursor and agent workflows.

## Packages

| Package | Role |
| --- | --- |
| `elephance` | Core TypeScript SDK. Use this inside Node.js apps, CLIs, agents, and servers. |
| `elephance-mcp` | Stdio MCP server. Use this from Cursor or any MCP-compatible client. |

## Install

Core SDK:

```bash
npm install elephance
```

Default embeddings use the OpenAI SDK as a peer dependency:

```bash
npm install openai
```

MCP server:

```bash
npm install elephance-mcp
```

## Quick Start

```ts
import { configure, queryMemory, upsertMemory } from "elephance";

configure({
  dbPath: "./data/.lancedb",
});

await upsertMemory("The user prefers concise TypeScript examples.", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("How should I answer this user?", {
  topK: 3,
});

console.log(hits);
```

## Cursor MCP

Add `elephance-mcp` to your Cursor MCP config:

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

The MCP server exposes these tools:

| Tool | Purpose |
| --- | --- |
| `memory_upsert` | Store a short user memory. |
| `memory_query` | Search memories semantically. |
| `memory_clear_user` | Delete all memory for a user. |
| `schema_replace_source` | Replace schema chunks for one source path. |
| `schema_delete_source` | Delete schema chunks for one source path. |
| `schema_query` | Search schema semantically. |
| `schema_query_by_table_names` | Retrieve known tables by exact name. |
| `schema_batch_query` | Query multiple schema keywords and merge results. |

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

| Option | Default | Description |
| --- | --- | --- |
| `dbPath` | `.lancedb` | LanceDB directory. Relative paths resolve from `process.cwd()`. |
| `memoryTable` | `memory` | Table for user memory rows. |
| `schemaTable` | `project_schema` | Table for project schema rows. |

Environment variables:

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | Required only when using the default OpenAI-compatible embedding provider. |
| `OPENAI_EMBEDDING_MODEL` | Embedding model. Defaults to `text-embedding-3-small`. |
| `OPENAI_RELAY_BASE_URL` | OpenAI-compatible base URL. |
| `OPENAI_BASE_URL` | Legacy base URL fallback. |
| `MEMORY_OVERWRITE_LABELS` | Comma-separated labels that overwrite per user and label. Defaults to `user_preference`. |
| `ELEPHANCE_DB_PATH` | MCP server database path. |
| `ELEPHANCE_MEMORY_TABLE` | MCP server memory table. |
| `ELEPHANCE_SCHEMA_TABLE` | MCP server schema table. |

## Memory

```ts
import { clearUserMemory, queryMemory, upsertMemory } from "elephance";

await upsertMemory("The user prefers pnpm in this project.", {
  userId: "user-123",
  label: "user_preference",
});

await upsertMemory("The billing module uses cents for money values.", {
  userId: "user-123",
  label: "note",
});

const memories = await queryMemory("package manager and billing conventions", {
  topK: 5,
});

await clearUserMemory("user-123");
```

Labels listed in `MEMORY_OVERWRITE_LABELS` are stored in stable user + label slots. By default, a new `user_preference` for the same user replaces the older one instead of accumulating duplicates.

## Schema Retrieval

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
    "## Fields\n- id: primary key\n- customer_id: customer reference",
    "## Relations\nInvoices join payments through invoice_id.",
  ]
);

const semanticHits = await queryProjectSchema("how invoices connect to payments", {
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

Use exact table-name lookup when you already know the tables. Use semantic or batch query when the model needs discovery.

## Custom Embeddings

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

await upsertMemory("The user prefers direct answers.", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("answer style");
```

All vectors in the same table should use the same embedding model and dimensionality. If you switch to a model with a different vector size, use a new `dbPath` or table name.

## Safety Notes

`elephance` does not write anything by itself. Data is created only when your app or MCP client calls write APIs such as `upsertMemory` or `replaceProjectSchemaForSource`.

- Add `.lancedb` to your app's `.gitignore` unless you intentionally want to commit local vector data.
- Do not store secrets, access tokens, passwords, private keys, or sensitive personal data in memory.
- Keep each memory short, specific, and independently understandable.
- Prefer `label: "user_preference"` for durable preferences.
- Use labels such as `note`, `summary`, or `fact` for accumulating context.
- Call `clearUserMemory(userId)` when a user asks to delete memory.
- Prefer one schema source per table or bounded module, such as `tables/billing_invoice.md`.

See [examples/rules.md](examples/rules.md) for a copyable project rules template.

## API

```ts
// Connection
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

// Memory
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

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).
