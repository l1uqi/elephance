# @elephance/mcp

[English](README.md) | [简体中文](README.zh-CN.md)

Stdio MCP server for `elephance`, exposing local LanceDB-backed memory and schema retrieval tools to Cursor and other MCP-compatible clients.

## What It Provides

`@elephance/mcp` turns the core `@elephance/core` SDK into MCP tools:

- user memory write, search, and deletion
- project schema write, deletion, semantic search, exact table lookup, and batch query
- local-first LanceDB persistence
- OpenAI-compatible embeddings by default, with the same environment variables as the core SDK

## Install

```bash
npm install @elephance/mcp
```

`@elephance/mcp` installs the OpenAI SDK it needs at runtime. When using the default embedding provider, you only need to configure `OPENAI_API_KEY`.

You can also run the published package directly with `npx`:

```bash
npx -y --package @elephance/mcp elephance-mcp
```

`npx` downloads `@elephance/mcp` and its dependencies from the currently configured npm registry. The explicit `--package @elephance/mcp` plus `elephance-mcp` command avoids relying on npm's bin inference for scoped packages.

If your npm registry points to a mirror and you see a 404 for `@elephance/core`, use the official npm registry explicitly:

```bash
npx -y --registry=https://registry.npmjs.org --package @elephance/mcp elephance-mcp
```

## Cursor

Add this to your Cursor MCP configuration, usually at `C:\Users\<you>\.cursor\mcp.json` on Windows:

```json
{
  "mcpServers": {
    "elephance": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "@elephance/mcp",
        "elephance-mcp"
      ],
      "env": {
        "ELEPHANCE_DB_PATH": "E:\\path\\to\\your-app\\.lancedb",
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

If Cursor logs a 404 for `@elephance/core`, the current npm registry or mirror probably has not synced the dependency package. Change `args` to:

```json
"args": ["-y", "--registry=https://registry.npmjs.org", "--package", "@elephance/mcp", "elephance-mcp"]
```

Use an absolute `ELEPHANCE_DB_PATH` for predictable storage. A relative path such as `.lancedb` depends on the working directory used by the MCP client.

If you use an OpenAI-compatible relay, add it inside `env`:

```json
{
  "OPENAI_RELAY_BASE_URL": "https://your-compatible-endpoint/v1"
}
```

Restart Cursor after changing the MCP config.

### Local Development

When testing local changes from this repository, build the workspace and point Cursor at the local server file:

```bash
npm run build
```

```json
{
  "mcpServers": {
    "elephance-local": {
      "command": "node",
      "args": [
        "E:\\github\\elephance\\packages\\mcp\\dist\\server.js"
      ],
      "env": {
        "ELEPHANCE_DB_PATH": "E:\\path\\to\\your-app\\.lancedb",
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

Add `.lancedb` to your target app's `.gitignore` unless you intentionally want to commit local vector data.

## Environment Variables

| Variable | Description |
| --- | --- |
| `ELEPHANCE_DB_PATH` | LanceDB directory for the MCP server. Defaults to `.lancedb`. |
| `ELEPHANCE_MEMORY_TABLE` | Memory table name. Defaults to `memory`. |
| `ELEPHANCE_SCHEMA_TABLE` | Schema table name. Defaults to `project_schema`. |
| `OPENAI_API_KEY` | Required only when using the default OpenAI-compatible embedding provider. |
| `OPENAI_EMBEDDING_MODEL` | Embedding model. Defaults to `text-embedding-3-small`. |
| `OPENAI_RELAY_BASE_URL` | OpenAI-compatible base URL. |
| `OPENAI_BASE_URL` | Legacy base URL fallback. |
| `MEMORY_OVERWRITE_LABELS` | Comma-separated labels that overwrite per user and label. Defaults to `user_preference`. |

## Tools

| Tool | Purpose |
| --- | --- |
| `memory_upsert` | Store a short, non-sensitive user memory. |
| `memory_query` | Search stored memories by semantic similarity. |
| `memory_clear_user` | Delete all stored memories for a user. |
| `schema_replace_source` | Replace all schema chunks for one source path. |
| `schema_delete_source` | Delete all schema chunks for one source path. |
| `schema_query` | Search project schema by semantic similarity. |
| `schema_query_by_table_names` | Retrieve schema by exact table names. |
| `schema_batch_query` | Search with multiple keywords and merge duplicate sources. |

## Tool Inputs

### `memory_upsert`

```json
{
  "text": "The user prefers pnpm in this project.",
  "userId": "user-123",
  "label": "user_preference",
  "metadata": {
    "source": "cursor"
  }
}
```

`label` defaults to `note`. Labels listed in `MEMORY_OVERWRITE_LABELS` overwrite by `userId + label`.

### `memory_query`

```json
{
  "query": "package manager preference",
  "topK": 3
}
```

### `memory_clear_user`

```json
{
  "userId": "user-123"
}
```

### `schema_replace_source`

```json
{
  "sourceRelativePath": "tables/billing_invoice.md",
  "lastUpdatedIso": "2026-04-28T10:00:00.000Z",
  "chunkTexts": [
    "## Fields\n- id: primary key\n- customer_id: customer reference",
    "## Relations\nInvoices join payments through invoice_id."
  ]
}
```

`lastUpdatedIso` is optional. The server uses the current timestamp when it is omitted.

### `schema_query`

```json
{
  "query": "how invoices connect to payments",
  "minimal": true,
  "topK": 3
}
```

### `schema_query_by_table_names`

```json
{
  "tableNames": ["billing_invoice", "billing_payment"],
  "minimal": true
}
```

### `schema_batch_query`

```json
{
  "keywords": ["invoice", "payment", "customer"],
  "mergedTopK": 4
}
```

## Query Options

Search tools accept these optional fields:

| Field | Description |
| --- | --- |
| `topK` | Maximum returned results. |
| `minimal` | Return compact schema text when true. |
| `maxTextChars` | Maximum text length per schema result in minimal mode. |
| `candidateLimit` | Vector search candidate limit before merging. |
| `maxChunksPerSource` | Maximum chunks merged for each source. |
| `mergedTopK` | Maximum merged results for `schema_batch_query`. |

## Safety Notes

- Do not store secrets, access tokens, passwords, private keys, or sensitive personal data in memory.
- Keep memory entries short and independently understandable.
- Use `user_preference` for stable preferences that should overwrite older values.
- Use `note`, `summary`, or `fact` for accumulating context.
- Add `.lancedb` to `.gitignore` unless you intentionally want to commit local vector data.

## Development

From the repository root:

```bash
npm install
npm run build
npm test
```

Run the built server:

```bash
npm --workspace @elephance/mcp start
```
