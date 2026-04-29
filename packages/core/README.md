# @elephance/core

[English](README.md) | [简体中文](README.zh-CN.md)

Local LanceDB-backed vector memory and project schema retrieval for TypeScript apps.

`@elephance/core` provides a small SDK for storing durable user memory, indexing project schema chunks, and retrieving relevant context with semantic search. It is local-first by default and stores vectors in a writable LanceDB directory.

## Install

```bash
npm install @elephance/core openai
```

`openai` is only required when you use the default OpenAI-compatible embedding provider.

## Requirements

- Node.js 18 or later.
- A writable local directory for LanceDB data.
- `OPENAI_API_KEY` when using the default embedding provider.

## Quick Start

```ts
import { configure, queryMemory, upsertMemory } from "@elephance/core";

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

## Configuration

```ts
import { configure, configureEmbedding } from "@elephance/core";

configure({
  dbPath: "./data/.lancedb",
  memoryTable: "memory",
  schemaTable: "project_schema",
});

configureEmbedding({
  model: "text-embedding-3-small",
});
```

`configure()` resets the cached LanceDB connection, so call it before your first query or write.

## Environment Variables

| Variable | Description |
| --- | --- |
| `OPENAI_API_KEY` | Required for the default OpenAI-compatible embedding provider. |
| `OPENAI_EMBEDDING_MODEL` | Embedding model. Defaults to `text-embedding-3-small`. |
| `OPENAI_RELAY_BASE_URL` | OpenAI-compatible base URL, such as a relay or proxy. |
| `OPENAI_BASE_URL` | Legacy base URL fallback. |
| `MEMORY_OVERWRITE_LABELS` | Comma-separated labels that overwrite per user and label. Defaults to `user_preference`. |

## Memory API

Use memory for short, durable facts such as preferences, notes, summaries, and stable user context.

```ts
import { clearUserMemory, queryMemory, upsertMemory } from "@elephance/core";

await upsertMemory("The user prefers pnpm in this project.", {
  userId: "user-123",
  label: "user_preference",
  source: "settings",
});

const memories = await queryMemory("package manager preference", {
  topK: 3,
});

await clearUserMemory("user-123");
```

Labels listed in `MEMORY_OVERWRITE_LABELS` overwrite by `userId + label`. By default, `user_preference` behaves like a stable slot per user, while labels such as `note`, `summary`, or `fact` can accumulate multiple rows.

## Project Schema API

Use schema storage for database table docs, API contracts, domain models, or any project context that should be retrieved by semantic search.

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
    "## Fields\n- id: primary key\n- customer_id: customer reference",
    "## Relations\nInvoices join payments through invoice_id.",
  ]
);

const semanticHits = await queryProjectSchema("invoice payment join", {
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

## Query Options

| Option | Description |
| --- | --- |
| `topK` | Maximum returned results. Defaults to `3`. |
| `minimal` | Return compact schema text when true. Defaults to `true` for schema queries. |
| `maxTextChars` | Maximum text length per schema result in minimal mode. Defaults to `420`. |
| `candidateLimit` | Vector search candidate limit before merging. Defaults to `8`. |
| `maxChunksPerSource` | Maximum chunks merged for each source. Defaults to `1`. |
| `mergedTopK` | Maximum merged results for `batchQueryProjectSchema`. Defaults to `4`. |

## Custom Embedding Provider

You can replace the default OpenAI-compatible provider with your own embedding backend.

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

All rows in the same LanceDB table should use the same embedding model and vector dimension. Use a new `dbPath` or table name when changing models.

## Connection Helpers

```ts
import {
  connect,
  getTableNames,
  openTable,
  resetConnection,
  tableExists,
} from "@elephance/core";
```

These helpers are exposed for diagnostics, tests, and advanced LanceDB workflows.

## Safety Notes

- Do not store secrets, access tokens, passwords, private keys, or sensitive personal data.
- Keep memories short, specific, and independently understandable.
- Add `.lancedb` to `.gitignore` unless you intentionally want to commit local vector data.
- Keep vectors in the same table on the same embedding model and dimensionality.

## Related Package

Use [`@elephance/mcp`](../mcp/README.md) to expose the same memory and schema tools to Cursor or another MCP-compatible client.
