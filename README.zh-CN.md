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
- 保存用户偏好、笔记、摘要或事实。
- 为 SQL 生成和代码理解检索项目 Schema。
- 用 LanceDB 保持本地优先的向量存储。
- 同一套记忆层既可以通过 SDK 调用，也可以通过 MCP tools 调用。

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
