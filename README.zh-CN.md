<p align="center">
  <img src="assets/elephance-logo.png" alt="elephance - Local Vector DB and Memory for Node.js" width="720" />
</p>

# elephance

[English](README.md) | [简体中文](README.zh-CN.md)

给 AI 应用、Agent 和 MCP Client 使用的本地向量记忆层。

`elephance` 基于 LanceDB，提供一个轻量 TypeScript SDK，用来持久化用户记忆和项目 Schema。这个仓库是 workspace：核心 SDK 在 `packages/core`，MCP Server 在 `packages/mcp`。

[![npm version](https://img.shields.io/npm/v/elephance)](https://www.npmjs.com/package/elephance)
[![MIT License](https://img.shields.io/npm/l/elephance)](LICENSE)

## 包结构

| 包 | 作用 | 文档 |
| --- | --- | --- |
| `elephance` | 基于 LanceDB 的核心 TypeScript SDK，提供 memory 和 schema 检索能力。 | [packages/core](packages/core) |
| `elephance-mcp` | stdio MCP Server，可接入 Cursor 和其他 MCP Client。 | [packages/mcp](packages/mcp/README.zh-CN.md) |

## 适用场景

- 给 AI 助手增加本地持久记忆。
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
- 只有使用 `elephance-mcp` 时，才需要 Cursor 或其他 MCP 兼容客户端。

## 安装

核心 SDK：

```bash
npm install elephance openai
```

MCP Server：

```bash
npm install elephance-mcp openai
```

只有使用默认 OpenAI 兼容 embedding provider 时才需要安装 `openai`。

## npm 使用方式

包发布到 npm 后，应用开发者只需要安装自己会用到的部分。

如果要在应用代码里调用 memory 和 schema API，安装核心 SDK：

```bash
npm install elephance openai
```

如果要接入 Cursor 或其他 MCP Client，安装 MCP Server：

```bash
npm install -g elephance-mcp openai
```

全局安装不是必须的。多数用户可以直接在 MCP 配置里使用 `npx -y elephance-mcp`，MCP Client 会自动下载并运行 npm 上发布的包。

从这个仓库发布 npm 包时，先发布核心包，因为 `elephance-mcp` 依赖它：

```bash
npm run build
npm publish --workspace elephance
npm publish --workspace elephance-mcp
```

## 本地开发使用

如果你正在本地开发这个仓库，并且想让另一个本地项目在包发布前使用它，需要通过本地文件路径安装，而不是使用 npm registry 上的版本。

安装核心 SDK：

```powershell
cd E:\path\to\your-app
pnpm add "elephance@file:E:/github/lancedb-vector-store/packages/core" openai
```

也可以手动写到目标项目的 `package.json`：

```json
{
  "dependencies": {
    "elephance": "file:E:/github/lancedb-vector-store/packages/core",
    "openai": "^4.0.0"
  }
}
```

然后在目标项目里安装依赖：

```bash
pnpm install
```

如果你在另一个项目里同时安装本地 MCP Server 和本地核心 SDK，需要确保 MCP Server 内部依赖的 `elephance` 也解析到本地包：

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

修改源码后，在本仓库重新构建：

```powershell
cd E:\github\lancedb-vector-store
npm run build
```

## Cursor MCP 配置

如果使用 npm 上发布的包，在 Cursor 的 MCP 配置中加入 server。配置文件通常是 `C:\Users\<you>\.cursor\mcp.json`：

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

建议把 `ELEPHANCE_DB_PATH` 写成绝对路径，这样数据会稳定写入同一个目录。相对路径如 `.lancedb` 会取决于 MCP Client 启动 server 时的工作目录。

如果使用 OpenAI 兼容代理，把代理地址加到 `env` 里：

```json
{
  "OPENAI_RELAY_BASE_URL": "https://your-compatible-endpoint/v1"
}
```

更新 MCP 配置后重启 Cursor。Server 会提供 `memory_upsert`、`memory_query`、`schema_replace_source`、`schema_query` 等 tools。

除非你明确想提交本地向量数据，否则建议把目标项目里的 LanceDB 目录加入 `.gitignore`：

```gitignore
.lancedb
```

### 本地 MCP Server 配置

如果你还没有发布 npm 包，只是在本地测试这个仓库，通常不需要把 `elephance-mcp` 安装进目标项目。直接让 Cursor 指向本地构建后的 MCP Server 即可。

先构建本仓库：

```powershell
cd E:\github\lancedb-vector-store
npm run build
```

然后在 Cursor 的 MCP 配置中加入本地 server。配置文件通常是 `C:\Users\<you>\.cursor\mcp.json`：

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

## 快速开始

```ts
import { configure, queryMemory, upsertMemory } from "elephance";

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

## 文档入口

- 静态 API 网站：[docs](docs)
- 核心 SDK 用法：[packages/core](packages/core)
- MCP Server 英文文档：[packages/mcp/README.md](packages/mcp/README.md)
- MCP Server 中文文档：[packages/mcp/README.zh-CN.md](packages/mcp/README.zh-CN.md)
- 项目规则模板：[examples/rules.md](examples/rules.md)

## 开发

```bash
npm install
npm run build
npm test
```

## License

MIT. See [LICENSE](LICENSE).
