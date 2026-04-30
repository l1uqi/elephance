<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

Local vector memory for AI apps, agents, and MCP clients.

`elephance` wraps LanceDB with a small TypeScript API for durable user memory, project schema retrieval, and evolvable rule memory. This repository is a workspace: the core SDK lives in `packages/core`, the agent orchestration package lives in `packages/agent`, the MCP server lives in `packages/mcp`, and the CLI lives in `packages/cli`.

[![npm version](https://img.shields.io/npm/v/%40elephance%2Fcore)](https://www.npmjs.com/package/@elephance/core)
[![MIT License](https://img.shields.io/npm/l/%40elephance%2Fcore)](LICENSE)

## Packages

| Package | Role | Docs |
| --- | --- | --- |
| `@elephance/core` | Core TypeScript SDK for LanceDB-backed memory, rules, and schema retrieval. | [packages/core](packages/core) |
| `@elephance/agent` | Agent memory/rule orchestration for apps that own the model loop. | [packages/agent](packages/agent) |
| `@elephance/mcp` | Stdio MCP server for Cursor and other MCP-compatible clients. | [packages/mcp](packages/mcp/README.md) |
| `@elephance/cli` | Command-line tools for client templates and rule maintenance. | [packages/cli](packages/cli/README.md) |

## Use Cases

- Give an AI assistant durable local memory.
- Automatically retrieve memory before an LLM call and extract memory candidates after a response in your own agent runtime.
- Persist project conventions, coding style, UI preferences, and agent behavior as structured rule memory.
- Retrieve active rules before a task and record rule hits for future ranking and pruning.
- Generate Cursor rules and Codex `AGENTS.md` templates from the command line.
- Build an opt-in path for promoting repeated local rule improvements into shared team or ecosystem rules.
- Extend Cursor and other MCP clients with local, searchable memory across sessions.
- Retrieve relevant project context when the active chat context is too small.
- Store user preferences, notes, summaries, or facts.
- Retrieve project schema for SQL generation and code understanding.
- Keep vectors local-first with LanceDB.
- Reuse the same memory layer through SDK calls or MCP tools.

## Integration Model

Elephance has two integration modes:

- `@elephance/agent` is the automatic path. Use it when you own the model loop. It receives every message and response, so it can retrieve context before the LLM call and extract memory/rule candidates after the response.
- `@elephance/mcp` is a best-effort tool path for Cursor, Claude Code, Claude Desktop, and other hosted clients. MCP servers are passive: they cannot listen to chat in the background or receive transcripts unless the client calls a tool. Client rules can encourage automatic tool use, but the host agent still decides when to call MCP tools.

If you need guaranteed background summarization, wrap the model call with `@elephance/agent` or another application-level adapter. If you use Cursor, treat Elephance MCP as local searchable memory plus rule tools that are invoked by Cursor Agent rules.

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

Use the CLI for client templates and rule maintenance:

```bash
npm install @elephance/cli
```

`@elephance/mcp` installs the OpenAI SDK it needs at runtime. When using the default OpenAI-compatible embedding provider, you only need to configure `OPENAI_API_KEY`.

## Published Packages

Current published release: `0.3.0`.

| Package | Version |
| --- | --- |
| [`@elephance/core`](https://www.npmjs.com/package/@elephance/core) | `0.3.0` |
| [`@elephance/agent`](https://www.npmjs.com/package/@elephance/agent) | `0.3.0` |
| [`@elephance/mcp`](https://www.npmjs.com/package/@elephance/mcp) | `0.3.0` |
| [`@elephance/cli`](https://www.npmjs.com/package/@elephance/cli) | `0.3.0` |

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

Restart Cursor after updating the MCP config. The server exposes tools such as `memory_upsert`, `memory_query`, `context_query`, `memory_extract_candidates`, `memory_commit_candidates`, `rule_query`, `rule_extract_candidates`, `rule_commit_candidates`, `rule_reflect`, `schema_replace_source`, and `schema_query`.

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
    "@elephance/mcp": "file:E:/github/elephance/packages/mcp",
    "@elephance/cli": "file:E:/github/elephance/packages/cli"
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

Store and retrieve structured rules when you want reusable behavior rather than a general note:

```ts
import { queryRules, upsertRule } from "@elephance/core";

await upsertRule("Button border radius should not exceed 8px in this project.", {
  label: "ui_preference",
  scope: "project",
  projectId: "my-app",
  action: "Keep button radius at or below 8px.",
  confidence: 0.9,
  source: "manual",
});

const rules = await queryRules("building a button component", {
  projectId: "my-app",
  topK: 3,
  recordHit: true,
});
```

Use `@elephance/agent` when your app owns the model call and you want memory orchestration:

```ts
import { createElephanceAgent } from "@elephance/agent";
import { configure } from "@elephance/core";

configure({ dbPath: "./data/.lancedb" });

const agent = createElephanceAgent({
  userId: "user-123",
  projectId: "my-app",
  memory: {
    autoRetrieve: true,
    autoWrite: "dry-run",
  },
  rules: {
    autoRetrieve: true,
    autoExtract: true,
    autoWrite: "dry-run",
    extractor: "heuristic",
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
console.log(result.rules.candidates);
```

For self-hosted agents, set `rules.extractor: "llm"` to use the same `ChatAdapter` for structured rule extraction. MCP clients such as Cursor keep their explicit tool workflow and do not need a separate LLM configuration.

For Cursor, Claude Code, Claude Desktop, and other hosted AI clients, use `@elephance/mcp` plus client rules or hooks. `@elephance/agent` is for applications where you control the LLM call.

Use `@elephance/cli` to generate client templates or maintain rules from a terminal:

```bash
npx -y --package @elephance/cli elephance init cursor --dir /path/to/repo
npx -y --package @elephance/cli elephance init codex --dir /path/to/repo
npx -y --package @elephance/cli elephance rule reflect --sample 50
```

## Research Influences

The rule memory system is informed by recent agent-memory and skill-evolution work. Elephance does not implement those papers verbatim; it maps their ideas into a local-first TypeScript SDK, agent wrapper, MCP server, and CLI.

| Paper | Idea used by Elephance | Where it appears |
| --- | --- | --- |
| [AutoSkill: Experience-Driven Lifelong Learning via Skill Self-Evolution](https://arxiv.org/abs/2603.01145) | Repeated interaction traces can become reusable artifacts instead of staying as raw conversation history. | Rule candidates extracted from ordinary chat, reusable `rule_memory` rows, and client templates that inject active rules before work starts. |
| [MemSkill: Learning and Evolving Memory Skills for Self-Evolving Agents](https://arxiv.org/abs/2602.02474) | Memory should evolve through extraction, consolidation, reflection, and pruning. | `@elephance/agent` provides candidate extraction, judge/merge decisions, and `selfReflectRules()`; CLI commands expose `rule reflect`, `rule deprecate`, and `rule archive`. |
| [Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers](https://arxiv.org/abs/2603.07670) | Agent memory can be organized as a write, manage, read loop. | Write: `memory_commit_candidates` and `rule_commit_candidates`; manage: rule status, hit count, deprecation, archive, reflection; read: semantic retrieval and context injection through SDK, agent, MCP, and CLI. |
| [De Jure: Iterative LLM Self-Refinement for Structured Extraction of Regulatory Rules](https://arxiv.org/abs/2604.02276) | Natural-language rules benefit from structured fields and judge/repair before commitment. | Rule metadata includes `action`, `condition`, `constraint`, `scope`, `confidence`, `status`, and versioning; `commitRuleCandidates()` returns `add`, `merge`, `conflict`, or `skip`. |
| [SkillClaw: Let Skills Evolve Collectively with Agentic Evolver](https://arxiv.org/abs/2604.08377) | Skill or rule updates can improve faster when recurring trajectories and failures are aggregated across users over time. | Elephance keeps the current implementation local-first, but the roadmap now treats shared rule repositories, opt-in telemetry, promotion gates, and synchronized team rules as future extensions instead of automatic background behavior. |

## Documentation

- Static API website: [docs](docs)
- Core SDK usage: [packages/core](packages/core)
- Agent wrapper usage: [packages/agent](packages/agent)
- Agent wrapper technical plan: [docs/agent-wrapper-technical-plan.zh-CN.md](docs/agent-wrapper-technical-plan.zh-CN.md)
- Rule memory and evolution design: [docs/rule-evolution-system.zh-CN.md](docs/rule-evolution-system.zh-CN.md)
- MCP server usage: [packages/mcp/README.md](packages/mcp/README.md)
- MCP server Chinese docs: [packages/mcp/README.zh-CN.md](packages/mcp/README.zh-CN.md)
- CLI usage: [packages/cli/README.md](packages/cli/README.md)
- Project rules template: [examples/rules.md](examples/rules.md)

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).
