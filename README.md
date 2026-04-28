<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

Local vector memory for AI apps, agents, and MCP clients.

`elephance` wraps LanceDB with a small TypeScript API for durable user memory and project schema retrieval. This repository is a workspace: the core SDK lives in `packages/core`, and the MCP server lives in `packages/mcp`.

[![npm version](https://img.shields.io/npm/v/elephance)](https://www.npmjs.com/package/elephance)
[![MIT License](https://img.shields.io/npm/l/elephance)](LICENSE)

## Packages

| Package | Role | Docs |
| --- | --- | --- |
| `elephance` | Core TypeScript SDK for LanceDB-backed memory and schema retrieval. | [packages/core](packages/core) |
| `elephance-mcp` | Stdio MCP server for Cursor and other MCP-compatible clients. | [packages/mcp](packages/mcp/README.md) |

## Use Cases

- Give an AI assistant durable local memory.
- Store user preferences, notes, summaries, or facts.
- Retrieve project schema for SQL generation and code understanding.
- Keep vectors local-first with LanceDB.
- Reuse the same memory layer through SDK calls or MCP tools.

## Install

Core SDK:

```bash
npm install elephance openai
```

MCP server:

```bash
npm install elephance-mcp openai
```

`openai` is only required when you use the default OpenAI-compatible embedding provider.

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

## Documentation

- Core SDK usage: [packages/core](packages/core)
- MCP server usage: [packages/mcp/README.md](packages/mcp/README.md)
- MCP server Chinese docs: [packages/mcp/README.zh-CN.md](packages/mcp/README.zh-CN.md)
- Project rules template: [examples/rules.md](examples/rules.md)

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).
