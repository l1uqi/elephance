# @elephance/mcp

[English](README.md) | [简体中文](README.zh-CN.md)

`elephance` 的 stdio MCP Server，可以把本地 LanceDB 记忆和项目 Schema 检索能力暴露给 Cursor 以及其他 MCP Client。

当前已发布版本：`0.3.0`。

## 它提供什么

`@elephance/mcp` 会把核心 `@elephance/core` SDK 包装成 MCP tools：

- 用户记忆写入、查询和删除
- 规则记忆写入、查询、提取、提交、命中反馈、状态更新和反思
- 项目 Schema 写入、删除、语义查询、精确表名查询和批量查询
- 基于 LanceDB 的本地优先持久化
- 默认使用 OpenAI 兼容 embedding，并复用核心 SDK 的环境变量

## 安装

```bash
npm install @elephance/mcp
```

`@elephance/mcp` 会自动安装运行时所需的 OpenAI SDK；使用默认 embedding provider 时，只需要配置 `OPENAI_API_KEY`。

也可以通过 `npx` 直接运行已发布的包：

```bash
npx -y --package @elephance/mcp elephance-mcp
```

`npx` 会按当前 npm registry 临时下载 `@elephance/mcp` 及其依赖。显式使用 `--package @elephance/mcp` 并运行 `elephance-mcp`，可以避免依赖 npm 对 scoped package 的 bin 推断。

如果你的 npm registry 指向镜像站，并遇到 `@elephance/core` 404，可以指定官方 npm registry：

```bash
npx -y --registry=https://registry.npmjs.org --package @elephance/mcp elephance-mcp
```

## Cursor

在 Cursor MCP 配置中加入，Windows 上通常是 `C:\Users\<you>\.cursor\mcp.json`：

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

如果 Cursor 日志里出现类似 `@elephance/core` 404 的错误，通常是当前 npm registry 或镜像站没有同步依赖包。可以把 `args` 改成：

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

修改 MCP 配置后重启 Cursor。

### 本地开发

如果要测试这个仓库里的本地改动，先构建 workspace，然后让 Cursor 指向本地 server 文件：

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

除非你明确想提交本地向量数据，否则把目标项目里的 `.lancedb` 加入 `.gitignore`。

## 研究背景

MCP Server 暴露的是同一套受 [AutoSkill](https://arxiv.org/abs/2603.01145)、[MemSkill](https://arxiv.org/abs/2602.02474)、[Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670) 和 [De Jure](https://arxiv.org/abs/2604.02276) 启发的 rule-memory 生命周期，但 Cursor 等 MCP Client 保持显式、用户可控的工具流程。提取和反思可以先 dry-run，真正写入通过 commit/update tools 完成，不做静默后台改写。

## Cursor 自动化边界

MCP Server 是被动的。Cursor 不会把每轮聊天自动流式发送给这个 server，因此 `@elephance/mcp` 无法单独实现有保证的后台自动总结。Cursor rules 可以要求 Agent 调用 `context_query`、`rule_extract_candidates` 和 `rule_commit_candidates`，但这仍然是宿主 Agent 驱动的 best-effort 工作流。

如果你需要围绕每次模型调用都必定执行的自动 memory/rule 提取，请使用 `@elephance/agent`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `ELEPHANCE_DB_PATH` | MCP Server 使用的 LanceDB 目录，默认 `.lancedb`。 |
| `ELEPHANCE_MEMORY_TABLE` | memory 表名，默认 `memory`。 |
| `ELEPHANCE_SCHEMA_TABLE` | schema 表名，默认 `project_schema`。 |
| `ELEPHANCE_RULE_TABLE` | rule memory 表名，默认 `rule_memory`。 |
| `OPENAI_API_KEY` | 仅在使用默认 OpenAI 兼容 embedding provider 时需要。 |
| `OPENAI_EMBEDDING_MODEL` | Embedding 模型，默认 `text-embedding-3-small`。 |
| `OPENAI_RELAY_BASE_URL` | OpenAI 兼容代理地址。 |
| `OPENAI_BASE_URL` | 旧版代理地址兜底。 |
| `MEMORY_OVERWRITE_LABELS` | 需要按用户和标签覆盖写入的标签列表，逗号分隔，默认 `user_preference`。 |

## Tools

| Tool | 作用 |
| --- | --- |
| `memory_upsert` | 写入一条短的非敏感用户记忆。 |
| `memory_query` | 按语义相似度查询已存记忆。 |
| `memory_clear_user` | 删除某个用户的全部记忆。 |
| `context_query` | 为当前任务构造紧凑的 memory/rule/schema 上下文。 |
| `memory_extract_candidates` | 从消息中 dry-run 提取可长期保存的候选记忆。 |
| `memory_commit_candidates` | 经过策略过滤后写入已接受的候选记忆。 |
| `rule_upsert` | 写入或更新一条持久结构化规则。 |
| `rule_query` | 按语义相似度查询 active rules。 |
| `rule_record_hit` | 记录某条规则被使用。 |
| `rule_update_status` | 把规则标记为 `candidate`、`active`、`conflicted`、`deprecated` 或 `archived`。 |
| `rule_extract_candidates` | 从消息中 dry-run 提取可长期保存的规则候选。 |
| `rule_commit_candidates` | 对规则候选进行 judge 并写入已接受规则。 |
| `rule_reflect` | 扫描规则并返回合并、冲突、澄清和修剪建议。 |
| `schema_replace_source` | 替换某个 source path 下的全部 schema 分块。 |
| `schema_delete_source` | 删除某个 source path 下的全部 schema 分块。 |
| `schema_query` | 按语义相似度查询项目 schema。 |
| `schema_query_by_table_names` | 按精确表名查询 schema。 |
| `schema_batch_query` | 用多个关键词查询 schema 并合并重复来源。 |

## Tool 入参

### `memory_upsert`

```json
{
  "text": "这个项目优先使用 pnpm。",
  "userId": "user-123",
  "label": "user_preference",
  "metadata": {
    "source": "cursor"
  }
}
```

`label` 默认是 `note`。`MEMORY_OVERWRITE_LABELS` 中的标签会按 `userId + label` 覆盖写入。

### `memory_query`

```json
{
  "query": "包管理器偏好",
  "topK": 3
}
```

### `memory_clear_user`

```json
{
  "userId": "user-123"
}
```

### `context_query`

```json
{
  "query": "开发一个用户列表组件",
  "includeMemory": true,
  "includeRules": true,
  "includeSchema": false,
  "projectId": "my-app",
  "client": "cursor",
  "topK": 5,
  "ruleTopK": 5,
  "maxTextChars": 420
}
```

Cursor rules 可以在实现任务前调用它，用来检索用户偏好、active rules、UI 约定、代码风格或项目事实。`includeRules` 默认是 `true`；被检索到的规则会自动记录命中。

### `memory_extract_candidates`

```json
{
  "messages": [
    {
      "role": "user",
      "content": "列表 hover 不要整行改背景，用轻量左边线就好。"
    }
  ],
  "userId": "user-123",
  "allowedLabels": ["ui_preference", "project_convention"],
  "minConfidence": 0.72
}
```

### `rule_upsert`

```json
{
  "text": "这个项目按钮圆角不要超过 8px。",
  "label": "ui_preference",
  "scope": "project",
  "projectId": "my-app",
  "client": "cursor",
  "action": "按钮圆角保持在 8px 以内。",
  "confidence": 0.9,
  "source": "manual"
}
```

### `rule_query`

```json
{
  "query": "实现按钮组件",
  "projectId": "my-app",
  "client": "cursor",
  "topK": 5,
  "recordHit": true
}
```

`rule_query` 默认只返回 active 规则。需要查看 `candidate`、`conflicted`、`deprecated` 或 `archived` 时，可以传 `includeInactive` 或 `status`。

### `rule_extract_candidates`

```json
{
  "messages": [
    {
      "role": "user",
      "content": "这个项目按钮圆角不要超过 8px。"
    }
  ],
  "projectId": "my-app",
  "client": "cursor",
  "defaultScope": "project",
  "allowedLabels": ["ui_preference", "project_convention"]
}
```

这个 MCP 工具刻意使用确定性的启发式 extractor，不需要单独配置大模型。自建 `@elephance/agent` 应用如果需要 LLM 规则抽取，可以设置 `rules.extractor: "llm"`。

### `rule_commit_candidates`

```json
{
  "candidates": [
    {
      "text": "这个项目按钮圆角不要超过 8px。",
      "label": "ui_preference",
      "scope": "project",
      "projectId": "my-app",
      "action": "按钮圆角保持在 8px 以内。",
      "confidence": 0.91,
      "source": "user_correction"
    }
  ],
  "dryRun": true,
  "projectId": "my-app"
}
```

返回结果会包含每条候选的 judge 决策：`add`、`merge`、`conflict` 或 `skip`。只有宿主应用或客户端确认要持久化时，才把 `dryRun` 设为 `false`。

### `rule_update_status`

```json
{
  "id": "rule-id",
  "status": "deprecated"
}
```

### `rule_reflect`

```json
{
  "sampleSize": 50,
  "projectId": "my-app",
  "dryRun": true
}
```

Reflection 建议类型包括 `consolidation`、`conflict_resolution`、`clarification` 和 `pruning`。非 dry-run 反思只会应用安全的状态变更，不会删除规则。

这是 dry-run 工具。Cursor 可以先查看返回的候选，再调用 `memory_commit_candidates`。

### `memory_commit_candidates`

```json
{
  "candidates": [
    {
      "text": "列表 hover 状态应该使用轻量左边线，而不是强烈的整行背景变化。",
      "label": "ui_preference",
      "confidence": 0.86,
      "source": "conversation_summary"
    }
  ],
  "userId": "user-123"
}
```

### `schema_replace_source`

```json
{
  "sourceRelativePath": "tables/billing_invoice.md",
  "lastUpdatedIso": "2026-04-28T10:00:00.000Z",
  "chunkTexts": [
    "## 字段\n- id: 主键\n- customer_id: 客户 ID",
    "## 关系\n发票表通过 invoice_id 和支付表关联。"
  ]
}
```

`lastUpdatedIso` 可以省略。省略时 Server 会使用当前时间。

### `schema_query`

```json
{
  "query": "发票和支付怎么关联",
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

## 查询选项

查询类 tools 支持这些可选字段：

| 字段 | 说明 |
| --- | --- |
| `topK` | 最多返回多少条结果。 |
| `minimal` | 为 true 时返回更紧凑的 schema 文本。 |
| `maxTextChars` | minimal 模式下每条 schema 结果的最大文本长度。 |
| `candidateLimit` | 合并结果前的向量搜索候选数量。 |
| `maxChunksPerSource` | 每个 source 最多合并多少个分块。 |
| `mergedTopK` | `schema_batch_query` 的最大合并结果数。 |

## 安全建议

- 不要把密钥、访问 token、密码、私钥或敏感个人数据写入 memory。
- 不要把密钥、访问 token、密码、私钥或敏感个人数据写入 rules。
- 每条 memory 应该短、明确、可独立理解。
- 每条 rule 应该短、可执行，并明确作用域：`user`、`project`、`repo`、`client` 或 `global`。
- 长期稳定偏好使用 `user_preference`，这样可以覆盖旧值。
- 需要累积的可复用上下文可以使用 `project_convention`、`ui_preference`、`coding_style`、`architecture_decision`、`note`、`summary` 或 `fact`。
- 旧规则优先标记 `deprecated` 或 `archived`，不要直接删除。
- 除非你明确想提交本地向量数据，否则把 `.lancedb` 加入 `.gitignore`。

## 开发

在仓库根目录运行：

```bash
npm install
npm run build
npm test
```

运行构建后的 server：

```bash
npm --workspace @elephance/mcp start
```
