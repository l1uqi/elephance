<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

给 AI 应用、Agent 和 MCP Client 使用的本地向量记忆层。

`elephance` 基于 LanceDB，提供一个轻量 TypeScript SDK，用来持久化用户记忆、项目 Schema 和可演化规则。这个仓库是 workspace：核心 SDK 在 `packages/core`，Agent 编排层在 `packages/agent`，MCP Server 在 `packages/mcp`，CLI 在 `packages/cli`。

[![npm version](https://img.shields.io/npm/v/%40elephance%2Fcore)](https://www.npmjs.com/package/@elephance/core)
[![MIT License](https://img.shields.io/npm/l/%40elephance%2Fcore)](LICENSE)

## 包结构

| 包 | 作用 | 文档 |
| --- | --- | --- |
| `@elephance/core` | 基于 LanceDB 的核心 TypeScript SDK，提供 memory、rule 和 schema 检索能力。 | [packages/core](packages/core) |
| `@elephance/agent` | 面向自建 Agent 应用的自动记忆和规则编排层。 | [packages/agent](packages/agent) |
| `@elephance/mcp` | stdio MCP Server，可接入 Cursor 和其他 MCP Client。 | [packages/mcp](packages/mcp/README.zh-CN.md) |
| `@elephance/cli` | 用于客户端模板和规则维护的命令行工具。 | [packages/cli](packages/cli/README.zh-CN.md) |

## 适用场景

- 给 AI 助手增加本地持久记忆。
- 在自建 Agent runtime 中，模型调用前自动检索记忆，回复后提取候选记忆。
- 把项目约定、代码风格、UI 偏好和 Agent 行为规范沉淀为结构化规则。
- 在任务开始前检索 active rules，并记录命中次数用于排序和后续修剪。
- 从命令行生成 Cursor rules 和 Codex `AGENTS.md` 模板。
- 为 Cursor 等 MCP Client 扩展可本地检索、可跨会话保留的记忆。
- 在当前聊天上下文不够用时，检索相关的项目上下文。
- 保存用户偏好、笔记、摘要或事实。
- 为 SQL 生成和代码理解检索项目 Schema。
- 用 LanceDB 保持本地优先的向量存储。
- 同一套记忆层既可以通过 SDK 调用，也可以通过 MCP tools 调用。

## 环境要求

- Node.js 18 或更高版本。
- 一个可写入的本地目录用于保存 LanceDB 数据，例如 `./data/.lancedb` 或 `.lancedb`。
- 使用默认 embedding 配置时，需要一个 OpenAI 兼容的 embedding provider。
- 只有使用默认 OpenAI 兼容 embedding provider 时，才需要配置 `OPENAI_API_KEY`。
- 可选环境变量：`OPENAI_EMBEDDING_MODEL`、`OPENAI_RELAY_BASE_URL`、`OPENAI_BASE_URL`。
- 只有使用 `@elephance/mcp` 时，才需要 Cursor 或其他 MCP 兼容客户端。

## 安装

应用代码里调用核心 SDK：

```bash
npm install @elephance/core openai
```

自建 Agent 应用里使用自动记忆编排层：

```bash
npm install @elephance/agent @elephance/core openai
```

在 Cursor 或其他 MCP Client 中使用 MCP Server：

```bash
npm install @elephance/mcp
```

使用 CLI 生成客户端模板和维护规则：

```bash
npm install @elephance/cli
```

`@elephance/mcp` 会自动安装运行时所需的 OpenAI SDK；使用默认 OpenAI 兼容 embedding provider 时，只需要配置 `OPENAI_API_KEY`。

## 研究思路来源

Elephance 的 rule memory 系统参考了近期关于 Agent 记忆和技能演化的研究：

- [AutoSkill: Experience-Driven Lifelong Learning via Skill Self-Evolution](https://arxiv.org/abs/2603.01145)：启发了从交互痕迹中沉淀可复用 skill/rule artifact 的方向。
- [MemSkill: Learning and Evolving Memory Skills for Self-Evolving Agents](https://arxiv.org/abs/2602.02474)：对应到候选提取、合并、反思、修剪这一套持续演化生命周期。
- [Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers](https://arxiv.org/abs/2603.07670)：提供了 write、manage、read 记忆闭环的整体视角，Elephance 将其落到本地提取、状态治理、语义检索和上下文注入。
- [De Jure: Iterative LLM Self-Refinement for Structured Extraction of Regulatory Rules](https://arxiv.org/abs/2604.02276)：启发了将自然语言纠正转成结构化规则字段，并在写入前进行 judge/repair 的设计。

## 已发布的 npm 包

当前已发布版本：`0.3.0`。

| 包 | 版本 |
| --- | --- |
| [`@elephance/core`](https://www.npmjs.com/package/@elephance/core) | `0.3.0` |
| [`@elephance/agent`](https://www.npmjs.com/package/@elephance/agent) | `0.3.0` |
| [`@elephance/mcp`](https://www.npmjs.com/package/@elephance/mcp) | `0.3.0` |
| [`@elephance/cli`](https://www.npmjs.com/package/@elephance/cli) | `0.3.0` |

## Cursor MCP 配置

如果使用 npm 上发布的包，在 Cursor 的 MCP 配置中加入 server。配置文件通常是 `C:\Users\<you>\.cursor\mcp.json`：

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

`npx` 会按当前 npm registry 临时下载 `@elephance/mcp` 及其依赖。显式使用 `--package @elephance/mcp` 并运行 `elephance-mcp`，可以避免依赖 npm 对 scoped package 的 bin 推断。

如果你的 npm registry 使用镜像站，并且 Cursor 日志里出现类似 `@elephance/core` 404 的错误，可以把 `args` 改成显式使用官方 registry：

```json
"args": ["-y", "--registry=https://registry.npmjs.org", "--package", "@elephance/mcp", "elephance-mcp"]
```

建议把 `ELEPHANCE_DB_PATH` 写成绝对路径，这样数据会稳定写入同一个目录。相对路径如 `.lancedb` 会取决于 MCP Client 启动 server 时的工作目录。

如果使用 OpenAI 兼容代理，把代理地址加到 `env` 里：

```json
{
  "OPENAI_RELAY_BASE_URL": "https://your-compatible-endpoint/v1"
}
```

更新 MCP 配置后重启 Cursor。Server 会提供 `memory_upsert`、`memory_query`、`context_query`、`memory_extract_candidates`、`memory_commit_candidates`、`rule_query`、`rule_extract_candidates`、`rule_commit_candidates`、`rule_reflect`、`schema_replace_source`、`schema_query` 等 tools。

除非你明确想提交本地向量数据，否则建议把目标项目里的 LanceDB 目录加入 `.gitignore`：

```gitignore
.lancedb
```

## 本地开发使用

如果你正在本地开发这个仓库，并且想让另一个本地项目使用你的工作副本，需要通过本地文件路径安装，而不是使用 npm registry 上的版本。

安装核心 SDK：

```powershell
cd E:\path\to\your-app
pnpm add "@elephance/core@file:E:/github/elephance/packages/core" openai
```

也可以手动写到目标项目的 `package.json`：

```json
{
  "dependencies": {
    "@elephance/core": "file:E:/github/elephance/packages/core",
    "openai": "^4.0.0"
  }
}
```

安装 Agent 编排层：

```powershell
cd E:\path\to\your-app
pnpm add "@elephance/agent@file:E:/github/elephance/packages/agent" "@elephance/core@file:E:/github/elephance/packages/core" openai
```

也可以手动写到目标项目的 `package.json`：

```json
{
  "dependencies": {
    "@elephance/agent": "file:E:/github/elephance/packages/agent",
    "@elephance/core": "file:E:/github/elephance/packages/core",
    "openai": "^4.0.0"
  }
}
```

然后在目标项目里安装依赖：

```bash
pnpm install
```

如果你在另一个项目里同时安装本地 Agent 编排层、MCP Server 和核心 SDK，需要确保上层包内部依赖的 `@elephance/core` 也解析到本地包：

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

修改源码后，在本仓库重新构建：

```powershell
cd E:\github\elephance
npm run build
```

### 本地 MCP Server 配置

如果你在本地测试这个仓库里的 MCP 改动，通常不需要把 `@elephance/mcp` 安装进目标项目。直接让 Cursor 指向本地构建后的 MCP Server 即可。

先构建本仓库：

```powershell
cd E:\github\elephance
npm run build
```

然后在 Cursor 的 MCP 配置中加入本地 server。配置文件通常是 `C:\Users\<you>\.cursor\mcp.json`：

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

## 快速开始

如果你希望显式控制读写，直接使用 `@elephance/core`：

```ts
import { configure, queryMemory, upsertMemory } from "@elephance/core";

configure({
  dbPath: "./data/.lancedb",
});

await upsertMemory("用户偏好简洁的 TypeScript 示例。", {
  userId: "user-123",
  label: "user_preference",
});

const hits = await queryMemory("应该用什么风格回答这个用户？", {
  topK: 3,
});

console.log(hits);
```

当你要保存的是“可复用行为约束”而不是普通笔记时，可以写入结构化规则：

```ts
import { queryRules, upsertRule } from "@elephance/core";

await upsertRule("这个项目按钮圆角不要超过 8px。", {
  label: "ui_preference",
  scope: "project",
  projectId: "my-app",
  action: "按钮圆角保持在 8px 以内。",
  confidence: 0.9,
  source: "manual",
});

const rules = await queryRules("实现按钮组件", {
  projectId: "my-app",
  topK: 3,
  recordHit: true,
});
```

如果你的应用自己控制模型调用流程，可以使用 `@elephance/agent` 做记忆编排：

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
        content: "这里返回你的模型回复。",
      };
    },
  },
});

const result = await agent.chat([
  { role: "user", content: "记住，我偏好简洁的 TypeScript 示例。" },
]);

console.log(result.message.content);
console.log(result.memory.candidates);
console.log(result.rules.candidates);
```

自建 Agent 如果希望从普通聊天中更高质量地结构化提炼规则，可以设置 `rules.extractor: "llm"`。它会复用同一个 `ChatAdapter`；Cursor 等 MCP Client 仍保持显式工具调用流程，不需要额外配置大模型。

Cursor、Claude Code、Claude Desktop 等现成 AI Client 仍然建议使用 `@elephance/mcp`，再配合客户端 rules 或 hooks。`@elephance/agent` 适合你自己掌控 LLM 调用流程的应用。

可以用 `@elephance/cli` 从命令行生成客户端模板或维护规则：

```bash
npx -y --package @elephance/cli elephance init cursor --dir /path/to/repo
npx -y --package @elephance/cli elephance init codex --dir /path/to/repo
npx -y --package @elephance/cli elephance rule reflect --sample 50
```

## 文档入口

- 静态 API 网站：[docs](docs)
- 核心 SDK 用法：[packages/core](packages/core)
- Agent 编排层用法：[packages/agent](packages/agent)
- Agent Wrapper 技术方案：[docs/agent-wrapper-technical-plan.zh-CN.md](docs/agent-wrapper-technical-plan.zh-CN.md)
- 自主规则回写与进化系统设计：[docs/rule-evolution-system.zh-CN.md](docs/rule-evolution-system.zh-CN.md)
- MCP Server 英文文档：[packages/mcp/README.md](packages/mcp/README.md)
- MCP Server 中文文档：[packages/mcp/README.zh-CN.md](packages/mcp/README.zh-CN.md)
- CLI 文档：[packages/cli/README.zh-CN.md](packages/cli/README.zh-CN.md)
- 项目规则模板：[examples/rules.md](examples/rules.md)

## 开发

```bash
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).
