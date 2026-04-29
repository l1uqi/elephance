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
- Extend Cursor and other MCP clients with local, searchable memory across sessions.
- Retrieve relevant project context when the active chat context is too small.
- Store user preferences, notes, summaries, or facts.
- Retrieve project schema for SQL generation and code understanding.
- Keep vectors local-first with LanceDB.
- Reuse the same memory layer through SDK calls or MCP tools.

## Requirements

- Node.js 18 or later.
- A writable local directory for LanceDB data, such as `./data/.lancedb` or `.lancedb`.
- An OpenAI-compatible embedding provider when using the default embedding setup.
- `OPENAI_API_KEY` is required only when using the default OpenAI-compatible embedding provider.
- Optional environment variables: `OPENAI_EMBEDDING_MODEL`, `OPENAI_RELAY_BASE_URL`, `OPENAI_BASE_URL`.
- Cursor or another MCP-compatible client is only required when using `elephance-mcp`.

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

## NPM Usage

After the packages are published, application developers can install only the part they need.

Use the SDK when calling memory and schema APIs from application code:

```bash
npm install elephance openai
```

Use the MCP server when connecting Cursor or another MCP client:

```bash
npm install -g elephance-mcp openai
```

Global installation is optional. Most users can let the MCP client run the package through `npx -y elephance-mcp`, which downloads and runs the published npm package automatically.

For npm publishing from this repository, publish the core package first because `elephance-mcp` depends on it:

```bash
npm run build
npm publish --workspace elephance
npm publish --workspace elephance-mcp
```

## Local Development Usage

If you are developing this repository locally and want another local project to use it before the packages are published, install the packages from local file paths instead of npm registry versions.

For the core SDK:

```powershell
cd E:\path\to\your-app
pnpm add "elephance@file:E:/github/lancedb-vector-store/packages/core" openai
```

Or add it manually to your app's `package.json`:

```json
{
  "dependencies": {
    "elephance": "file:E:/github/lancedb-vector-store/packages/core",
    "openai": "^4.0.0"
  }
}
```

Then install dependencies in your app:

```bash
pnpm install
```

If you install both the local MCP server and the local core SDK in another project, make sure the MCP server also resolves `elephance` to the local package:

```json
{
  "dependencies": {
    "elephance": "file:E:/github/lancedb-vector-store/packages/core",
    "elephance-mcp": "file:E:/github/lancedb-vector-store/packages/mcp"
  },
  "pnpm": {
    "overrides": {
      "elephance": "file:E:/github/lancedb-vector-store/packages/core"
    }
  }
}
```

Build this repository after changing source code:

```powershell
cd E:\github\lancedb-vector-store
npm run build
```

## Cursor MCP Setup

For Cursor-based development with the published npm package, add a server entry to Cursor's MCP config, usually at `C:\Users\<you>\.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "elephance": {
      "command": "npx",
      "args": ["-y", "elephance-mcp"],
      "env": {
        "ELEPHANCE_DB_PATH": "E:\\path\\to\\your-app\\.lancedb",
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

Use an absolute `ELEPHANCE_DB_PATH` for predictable storage. A relative path such as `.lancedb` depends on the directory where the MCP client starts the server.

If you use an OpenAI-compatible relay, add it inside `env`:

```json
{
  "OPENAI_RELAY_BASE_URL": "https://your-compatible-endpoint/v1"
}
```

Restart Cursor after updating the MCP config. The server exposes tools such as `memory_upsert`, `memory_query`, `schema_replace_source`, and `schema_query`.

Add the local LanceDB directory to the target app's `.gitignore` unless you intentionally want to commit local vector data:

```gitignore
.lancedb
```

### Local MCP Server Setup

If you are testing this repository before publishing, you usually do not need to install `elephance-mcp` into the target app. Point Cursor directly at the locally built server.

First build this repository:

```powershell
cd E:\github\lancedb-vector-store
npm run build
```

Then add a server entry to Cursor's MCP config, usually at `C:\Users\<you>\.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "elephance-local": {
      "command": "node",
      "args": [
        "E:\\github\\lancedb-vector-store\\packages\\mcp\\dist\\server.js"
      ],
      "env": {
        "ELEPHANCE_DB_PATH": "E:\\path\\to\\your-app\\.lancedb",
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
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

## Documentation

- Static API website: [docs](docs)
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
