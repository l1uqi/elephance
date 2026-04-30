<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

Local vector memory for AI apps, agents, and MCP clients.

`elephance` wraps LanceDB with a small TypeScript API for durable user memory and project schema retrieval. This repository is a workspace: the core SDK lives in `packages/core`, the agent orchestration package lives in `packages/agent`, and the MCP server lives in `packages/mcp`.

[![npm version](https://img.shields.io/npm/v/%40elephance%2Fcore)](https://www.npmjs.com/package/@elephance/core)
[![MIT License](https://img.shields.io/npm/l/%40elephance%2Fcore)](LICENSE)

## Packages

| Package | Role | Docs |
| --- | --- | --- |
| `@elephance/core` | Core TypeScript SDK for LanceDB-backed memory and schema retrieval. | [packages/core](packages/core) |
| `@elephance/agent` | Agent memory orchestration for apps that own the model loop. | [packages/agent](packages/agent) |
| `@elephance/mcp` | Stdio MCP server for Cursor and other MCP-compatible clients. | [packages/mcp](packages/mcp/README.md) |

## Use Cases

- Give an AI assistant durable local memory.
- Automatically retrieve memory before an LLM call and extract memory candidates after a response in your own agent runtime.
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
- Cursor or another MCP-compatible client is only required when using `@elephance/mcp`.

## Install

Use the core SDK from application code:

```bash
npm install @elephance/core openai
```

Use the agent wrapper when you own the model loop:

```bash
npm install @elephance/agent @elephance/core openai
```

Use the MCP server from Cursor or another MCP client:

```bash
npm install @elephance/mcp
```

`@elephance/mcp` installs the OpenAI SDK it needs at runtime. When using the default OpenAI-compatible embedding provider, you only need to configure `OPENAI_API_KEY`.

## Published Packages

- [`@elephance/core`](https://www.npmjs.com/package/@elephance/core)
- [`@elephance/agent`](https://www.npmjs.com/package/@elephance/agent)
- [`@elephance/mcp`](https://www.npmjs.com/package/@elephance/mcp)

## Cursor MCP Setup

For Cursor-based development with the published npm package, add a server entry to Cursor's MCP config, usually at `C:\Users\<you>\.cursor\mcp.json` on Windows:

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

`npx` downloads `@elephance/mcp` and its dependencies from the currently configured npm registry. The explicit `--package @elephance/mcp` plus `elephance-mcp` command avoids relying on npm's bin inference for scoped packages.

If your npm registry uses a mirror and Cursor logs a 404 for `@elephance/core`, change `args` to explicitly use the official registry:

```json
"args": ["-y", "--registry=https://registry.npmjs.org", "--package", "@elephance/mcp", "elephance-mcp"]
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

## Local Development Usage

If you are developing this repository locally and want another local project to use your working copy, install the packages from local file paths instead of npm registry versions.

For the core SDK:

```powershell
cd E:\path\to\your-app
pnpm add "@elephance/core@file:E:/github/elephance/packages/core" openai
```

Or add it manually to your app's `package.json`:

```json
{
  "dependencies": {
    "@elephance/core": "file:E:/github/elephance/packages/core",
    "openai": "^4.0.0"
  }
}
```

For the agent wrapper:

```powershell
cd E:\path\to\your-app
pnpm add "@elephance/agent@file:E:/github/elephance/packages/agent" "@elephance/core@file:E:/github/elephance/packages/core" openai
```

Or add it manually to your app's `package.json`:

```json
{
  "dependencies": {
    "@elephance/agent": "file:E:/github/elephance/packages/agent",
    "@elephance/core": "file:E:/github/elephance/packages/core",
    "openai": "^4.0.0"
  }
}
```

Then install dependencies in your app:

```bash
pnpm install
```

If you install the local agent wrapper, MCP server, and core SDK in another project, make sure both higher-level packages resolve `@elephance/core` to the local package:

```json
{
  "dependencies": {
    "@elephance/agent": "file:E:/github/elephance/packages/agent",
    "@elephance/core": "file:E:/github/elephance/packages/core",
    "@elephance/mcp": "file:E:/github/elephance/packages/mcp"
  },
  "pnpm": {
    "overrides": {
      "@elephance/core": "file:E:/github/elephance/packages/core"
    }
  }
}
```

Build this repository after changing source code:

```powershell
cd E:\github\elephance
npm run build
```

### Local MCP Server Setup

If you are testing local MCP changes from this repository, you usually do not need to install `@elephance/mcp` into the target app. Point Cursor directly at the locally built server.

First build this repository:

```powershell
cd E:\github\elephance
npm run build
```

Then add a server entry to Cursor's MCP config, usually at `C:\Users\<you>\.cursor\mcp.json`:

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

## Quick Start

Use `@elephance/core` directly when you want explicit reads and writes:

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

Use `@elephance/agent` when your app owns the model call and you want memory orchestration:

```ts
import { createElephanceAgent } from "@elephance/agent";
import { configure } from "@elephance/core";

configure({ dbPath: "./data/.lancedb" });

const agent = createElephanceAgent({
  userId: "user-123",
  memory: {
    autoRetrieve: true,
    autoWrite: "dry-run",
  },
  llm: {
    async chat(messages) {
      return {
        role: "assistant",
        content: "Return your model response here.",
      };
    },
  },
});

const result = await agent.chat([
  { role: "user", content: "Remember that I prefer concise TypeScript examples." },
]);

console.log(result.message.content);
console.log(result.memory.candidates);
```

For Cursor, Claude Code, Claude Desktop, and other hosted AI clients, use `@elephance/mcp` plus client rules or hooks. `@elephance/agent` is for applications where you control the LLM call.

## Documentation

- Static API website: [docs](docs)
- Core SDK usage: [packages/core](packages/core)
- Agent wrapper usage: [packages/agent](packages/agent)
- Agent wrapper technical plan: [docs/agent-wrapper-technical-plan.zh-CN.md](docs/agent-wrapper-technical-plan.zh-CN.md)
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
