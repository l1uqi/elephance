# @elephance/core

[English](README.md) | [简体中文](README.zh-CN.md)

Local LanceDB-backed vector memory, rule memory, and project schema retrieval for TypeScript apps.

`@elephance/core` provides a small SDK for storing durable user memory, structured reusable rules, indexing project schema chunks, and retrieving relevant context with semantic search. It is local-first by default and stores vectors in a writable LanceDB directory.

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
  ruleTable: "rule_memory",
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

## Rule Memory API

Use rule memory for durable behavior constraints such as user corrections, project conventions, coding style, UI preferences, and agent behavior. Rules are stored in the separate `rule_memory` table by default.

```ts
import {
  listRules,
  queryRules,
  recordRuleHit,
  updateRuleStatus,
  upsertRule,
} from "@elephance/core";

const rule = await upsertRule(
  "Button border radius should not exceed 8px in this project.",
  {
    label: "ui_preference",
    scope: "project",
    projectId: "my-app",
    action: "Keep button radius at or below 8px.",
    confidence: 0.9,
    source: "manual",
  }
);

const activeRules = await queryRules("building a button component", {
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

Rule statuses are `candidate`, `active`, `conflicted`, `deprecated`, and `archived`. `queryRules()` returns active rules by default; pass `includeInactive: true` or an explicit `status` filter to inspect inactive rules.

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

Rule search also accepts rule filters such as `label`, `scope`, `userId`, `projectId`, `repoPath`, `client`, `status`, `includeInactive`, and `recordHit`.

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
- Keep rules short, actionable, and scoped. Prefer `project` or `repo` scope for project conventions and `user` scope for personal preferences.
- Do not delete old rules directly when they become stale. Mark them `deprecated` or `archived`.
- Add `.lancedb` to `.gitignore` unless you intentionally want to commit local vector data.
- Keep vectors in the same table on the same embedding model and dimensionality.

## Related Package

Use [`@elephance/mcp`](../mcp/README.md) to expose the same memory and schema tools to Cursor or another MCP-compatible client.
