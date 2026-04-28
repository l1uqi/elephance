# elephance-mcp

MCP server for `elephance`, exposing local LanceDB-backed memory and schema retrieval tools over stdio.

## Cursor

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

## Tools

- `memory_upsert`
- `memory_query`
- `memory_clear_user`
- `schema_replace_source`
- `schema_delete_source`
- `schema_query`
- `schema_query_by_table_names`
- `schema_batch_query`

Do not store secrets, access tokens, passwords, private keys, or sensitive personal data in memory.
