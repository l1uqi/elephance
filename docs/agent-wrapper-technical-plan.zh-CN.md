# Elephance Agent Wrapper 技术方案

## 背景

Elephance 当前已经具备两层能力：

- `@elephance/core`：本地 LanceDB 向量记忆、项目 schema 写入与检索。
- `@elephance/mcp`：通过 MCP tools 暴露 `memory_upsert`、`memory_query`、`schema_query` 等能力给 Cursor、Claude Code、Claude Desktop 等客户端。

现有问题不在 DB 读写本身，而在“什么时候查、什么时候写、如何把结果放回大模型上下文”。如果每次都要求用户显式说“用 elephance 查询/写入”，体验会接近手动工具，而不是自动记忆层。

因此建议新增一个自动记忆编排层：`@elephance/agent`。

## 目标

`@elephance/agent` 的目标是为自建 Agent 应用提供一套可组合的记忆编排能力：

1. 在模型调用前自动检索相关 memory/schema。
2. 将检索结果以稳定、低 token 成本的格式注入上下文。
3. 在模型调用后从对话中提取可长期保存的记忆候选。
4. 根据策略自动、半自动或仅预览地写回 `@elephance/core`。
5. 不绑定某一个模型厂商，支持 OpenAI、Anthropic、Ollama、Vercel AI SDK、LangChain、Mastra 等生态通过 adapter 接入。

同时，Cursor 和 Claude Code 这类现成客户端不应由 `@elephance/agent` 直接包裹，因为它们的模型调用流程不在库的控制范围内。对这类客户端，应通过 `@elephance/mcp`、rules、hooks、CLI 初始化模板实现接近自动记忆的体验。

## 非目标

- 不在 MCP server 内部假设自己可以读取完整 LLM context。
- 不默认无提示写入所有对话内容。
- 不存储 secrets、tokens、passwords、private keys、敏感个人信息。
- 不强绑定 OpenAI 或 Anthropic。
- 不把 `@elephance/core` 变成 agent framework；核心库继续保持存储和检索职责。

## 推荐包结构

```txt
packages/core
  基础存储、embedding、memory、schema 能力

packages/mcp
  MCP server，面向 Cursor、Claude Code、Claude Desktop 等客户端

packages/agent
  自动记忆编排层，面向自建 Agent 应用

packages/cli
  初始化和运维工具，面向 Cursor/Claude Code 配置、hooks、memory 管理
```

第一阶段可以只新增 `packages/agent`。`packages/cli` 可在第二阶段加入，避免一次性扩大开发面。

## 分层职责

### `@elephance/core`

继续负责确定性的底层能力：

- `configure()`
- `upsertMemory()`
- `queryMemory()`
- `clearUserMemory()`
- `replaceProjectSchemaForSource()`
- `queryProjectSchema()`
- `queryProjectSchemaByTableNames()`
- `batchQueryProjectSchema()`

不引入模型对话、自动提取、agent policy 等概念。

### `@elephance/mcp`

继续负责协议层暴露：

- 提供 MCP tools。
- 后续可增加 MCP prompts，用于 Cursor/Claude Code 中触发固定工作流。
- 不主动监听对话，不做自动写入。

可考虑新增 tools：

- `memory_extract_candidates`
- `memory_commit_candidates`
- `context_query`

但这些 tools 仍需要客户端显式调用。

### `@elephance/agent`

负责编排：

- 从用户输入构造检索 query。
- 调用 `@elephance/core` 检索相关 memory/schema。
- 构造上下文注入块。
- 调用用户提供的 LLM adapter。
- 从消息和模型输出中提取 memory candidates。
- 根据 write policy 写入或返回待确认候选。

### `@elephance/cli`

后续负责生态适配：

- `elephance init cursor`
- `elephance init claude-code`
- `elephance memory query`
- `elephance memory upsert`
- `elephance context inject`
- `elephance context extract`

CLI 是连接现成客户端的重要拼图，尤其是 Claude Code hooks。

## 核心流程

```txt
User message
  -> build retrieval queries
  -> query memory/schema through @elephance/core
  -> format context block
  -> call user-provided LLM adapter
  -> extract memory candidates
  -> apply write policy
  -> upsert accepted memories
  -> return response + memory operations
```

## API 设计

### 最小可用 API

```ts
import { createElephanceAgent } from "@elephance/agent";

const agent = createElephanceAgent({
  userId: "default",
  memory: {
    autoRetrieve: true,
    autoWrite: "dry-run",
    topK: 5,
  },
  schema: {
    autoRetrieve: true,
    topK: 4,
  },
  llm: {
    chat: async (messages, options) => {
      return {
        role: "assistant",
        content: "..."
      };
    },
  },
});

const result = await agent.chat([
  {
    role: "user",
    content: "以后回答我尽量用中文，代码注释用英文。"
  }
]);

console.log(result.message.content);
console.log(result.memory.candidates);
console.log(result.memory.writes);
```

### 推荐导出

```ts
export function createElephanceAgent(options: ElephanceAgentOptions): ElephanceAgent;

export async function createMemoryContext(
  input: MemoryContextInput
): Promise<MemoryContextResult>;

export async function extractMemoryCandidates(
  input: MemoryExtractionInput
): Promise<MemoryCandidate[]>;

export async function commitMemoryCandidates(
  candidates: MemoryCandidate[],
  options?: CommitMemoryOptions
): Promise<MemoryCommitResult>;
```

这四个导出覆盖两种使用方式：

- 高层用户直接用 `agent.chat()`。
- 高级用户拆开 retrieve、extract、commit 自己编排。

## 类型设计

### 消息类型

```ts
export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentRole;
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
```

### LLM Adapter

```ts
export interface ChatAdapter {
  chat(
    messages: AgentMessage[],
    options?: ChatAdapterOptions
  ): Promise<AgentMessage>;
}

export interface ChatAdapterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}
```

不要直接依赖 OpenAI SDK 或 Anthropic SDK。可以在 examples 中提供 adapter 示例。

### Memory Policy

```ts
export type AutoWriteMode = false | "dry-run" | "confirm" | "always";

export interface MemoryPolicy {
  autoRetrieve?: boolean;
  autoWrite?: AutoWriteMode;
  topK?: number;
  minimal?: boolean;
  userId?: string;
  allowedLabels?: string[];
  deniedLabels?: string[];
  minConfidence?: number;
  maxCandidatesPerTurn?: number;
}
```

推荐默认值：

```ts
const defaultMemoryPolicy = {
  autoRetrieve: true,
  autoWrite: false,
  topK: 5,
  minimal: true,
  allowedLabels: ["user_preference", "fact", "summary", "note"],
  minConfidence: 0.72,
  maxCandidatesPerTurn: 5,
};
```

默认不自动写入，这是为了避免早期用户因为误写入而失去信任。开发者可以显式开启 `dry-run` 或 `always`。

### Memory Candidate

```ts
export interface MemoryCandidate {
  text: string;
  label: "user_preference" | "fact" | "summary" | "note" | string;
  userId?: string;
  confidence: number;
  reason?: string;
  source?: "user" | "assistant" | "conversation_summary" | string;
  metadata?: Record<string, unknown>;
}
```

候选记忆必须是短句、明确、可独立理解。不要存整段对话。

## 上下文注入格式

建议使用稳定的 system context block：

```txt
<elephance_context>
Relevant user memory:
- [user_preference] User prefers Chinese responses.
- [user_preference] User prefers English comments in code.

Relevant project schema:
- source: tables/orders.md
  content: Orders store payment status and user ownership.
</elephance_context>
```

注入原则：

- 只注入和当前请求相关的 memory/schema。
- 默认使用 `minimal: true`。
- memory 和 schema 分区。
- 每条内容保留 label/source，方便模型判断可信度。
- 不把原始 metadata 全量塞进上下文。

## 自动写入策略

### 推荐模式

```ts
autoWrite: false
```

只检索，不写入。

```ts
autoWrite: "dry-run"
```

返回候选记忆，但不写 DB。适合开发调试和测试提取质量。

```ts
autoWrite: "confirm"
```

返回候选，由宿主应用展示确认 UI 后调用 `commitMemoryCandidates()`。

```ts
autoWrite: "always"
```

达到置信度和安全策略后自动写入。适合用户明确开启的个人记忆场景。

### 写入判断规则

应该写入：

- 用户明确偏好：语言、框架、代码风格、工具偏好。
- 长期项目事实：项目约定、模块职责、数据表含义。
- 稳定决策：已经确认采用的方案。
- 对未来有复用价值的总结。

不应该写入：

- 一次性请求。
- 短期状态。
- 未确认的模型猜测。
- secrets、tokens、passwords、private keys。
- 敏感个人信息。
- 大段代码或完整文件内容。

## Memory Extraction 设计

第一版建议使用 LLM-based extractor，不手写复杂规则。

Extractor prompt 目标：

- 从 conversation 中提取 durable memories。
- 输出 JSON。
- 给每条候选提供 label、confidence、reason。
- 明确禁止敏感信息。
- 不输出无意义候选。

输出 schema：

```ts
export interface MemoryExtractionResult {
  candidates: MemoryCandidate[];
}
```

示例 JSON：

```json
{
  "candidates": [
    {
      "text": "User prefers responses in Chinese.",
      "label": "user_preference",
      "confidence": 0.94,
      "reason": "The user explicitly requested Chinese responses."
    }
  ]
}
```

第二版可以加入 rule-based prefilter：

- 检测“以后”、“记住”、“我偏好”、“默认”、“总是”、“不要”等表达。
- 对明显无长期价值的轮次跳过 extractor，降低模型调用成本。

## Schema 自动检索策略

Memory 和 schema 的使用场景不同：

- memory：用户偏好、项目决策、长期上下文。
- schema：数据库表、API contract、领域模型、模块说明。

`@elephance/agent` 中 schema 检索建议默认可开，但不自动写 schema。schema 的写入更适合由同步脚本、CLI 或显式工具完成。

推荐策略：

```ts
schema: {
  autoRetrieve: true,
  autoWrite: false,
  exactTableLookup: true,
  semanticFallback: true
}
```

当用户输入中出现明确表名时，优先 `queryProjectSchemaByTableNames()`；否则用 `queryProjectSchema()` 或 `batchQueryProjectSchema()`。

## Cursor 支持方案

Cursor 的最佳路径不是 `@elephance/agent` 直接接管模型调用，而是：

```txt
@elephance/mcp
  +
.cursor/rules/elephance.mdc
  +
可选 MCP prompts
  +
Cursor auto-run
```

建议提供 `elephance init cursor` 生成：

```txt
.cursor/mcp.json
.cursor/rules/elephance.mdc
```

规则模板内容：

```md
---
description: Use Elephance memory automatically
alwaysApply: true
---

Before answering requests that may depend on user preferences, project decisions, schema, or durable context, query Elephance memory/schema through the available MCP tools.

When the user states a durable preference, confirmed project fact, reusable convention, or long-term decision, store a short non-sensitive memory through Elephance.

Do not wait for the user to explicitly say "use Elephance".
Do not store secrets, tokens, passwords, private keys, or sensitive personal data.
Keep each memory short, specific, and self-contained.
```

可选 MCP prompts：

- `remember_preference`
- `summarize_session_to_memory`
- `query_project_context`

## Claude Code 支持方案

Claude Code 的最佳路径是：

```txt
@elephance/mcp
  +
CLAUDE.md
  +
.claude/settings.json hooks
  +
@elephance/cli
```

建议提供 `elephance init claude-code` 生成：

```txt
CLAUDE.md 片段
.claude/settings.json
.claude/hooks/elephance-context.js
.claude/hooks/elephance-extract.js
```

### `UserPromptSubmit` hook

用途：用户提交 prompt 后，Claude 处理前，查询相关 memory/schema 并注入上下文。

流程：

```txt
read hook input
-> extract prompt text
-> elephance context inject
-> stdout returns additional context
```

### `Stop` 或 `PreCompact` hook

用途：回合结束或压缩前，提取可长期保存的 memory。

流程：

```txt
read transcript/context if available
-> elephance context extract
-> dry-run or commit according to config
```

默认建议 `dry-run`，让用户先验证质量。

## CLI 设计

第二阶段新增 `@elephance/cli`。

命令建议：

```bash
elephance init cursor
elephance init claude-code
elephance memory query "package manager preference"
elephance memory upsert "User prefers npm for this project" --label user_preference --user monigth
elephance context inject --query "How should I respond?"
elephance context extract --input transcript.json --dry-run
```

CLI 依赖 `@elephance/core`，可选依赖 `@elephance/agent` 的 extraction utilities。

## 文件结构建议

```txt
packages/agent/
  package.json
  tsconfig.json
  README.md
  README.zh-CN.md
  src/
    index.ts
    agent.ts
    context.ts
    extraction.ts
    policy.ts
    adapters/
      openai.ts.example
      anthropic.ts.example
    types.ts
```

如果 adapter 示例需要具体 SDK，建议放在 docs 或 examples，不作为 package 依赖，避免增加安装成本。

## 测试策略

### Unit tests

- context formatting。
- memory candidate filtering。
- write policy。
- schema retrieval query planning。
- adapter mock 调用顺序。

### Integration tests

- 使用 mock embedding provider，避免测试依赖真实 OpenAI。
- 使用临时 LanceDB path。
- 验证 `agent.chat()` 会：
  - 先 query memory。
  - 注入 context。
  - 调用 adapter。
  - 生成 candidates。
  - 在 `dry-run` 不写入。
  - 在 `always` 写入。

### Snapshot tests

- 上下文注入格式。
- extractor prompt。
- Cursor/Claude Code 生成配置模板。

## 安全和隐私

必须内置安全边界：

- 默认 `autoWrite: false`。
- `always` 模式必须显式配置。
- extractor prompt 明确禁止敏感信息。
- policy 层再次过滤敏感模式。
- 单条 memory 限制长度。
- metadata 不默认注入 prompt。
- 支持按 `userId` 清除记忆。

可加入简单敏感信息检测：

- API key 常见前缀。
- private key block。
- password/token/secret 字段。
- `.env` 风格内容。

第一版不需要追求完美 DLP，但要避免明显误存。

## 发布路径

### Phase 1: `@elephance/agent` MVP

- 新增 package。
- 实现 `createMemoryContext()`。
- 实现 `createElephanceAgent()`。
- 实现 `dry-run` extraction。
- 使用 mock adapter 完成测试。
- README 提供 OpenAI/Anthropic adapter 示例。

### Phase 2: 自动写入和策略

- 实现 `commitMemoryCandidates()`。
- 支持 `autoWrite: "confirm" | "always"`。
- 加入敏感信息过滤。
- 加入 candidate 去重。
- 加入 memory overwrite label 策略说明。

### Phase 3: Cursor/Claude Code 体验

- 增加 MCP prompts。
- 新增 `@elephance/cli`。
- 实现 `elephance init cursor`。
- 实现 `elephance init claude-code`。
- 生成 rules/hooks 模板。

### Phase 4: 高级能力

- session summary。
- project decision memory。
- schema sync helper。
- adapter examples for Vercel AI SDK、LangChain、Mastra、Ollama。
- memory review UI 或导出格式。

## 推荐优先级

最优开发顺序：

1. 先做 `@elephance/agent` 的 retrieve + context 注入。
2. 再做 extraction 的 `dry-run`。
3. 再做 commit policy。
4. 再做 Cursor rules 模板。
5. 最后做 Claude Code hooks 和 CLI 初始化。

这样每一步都有可验证产物，并且不会过早陷入不同客户端的配置细节。

## 关键设计判断

`@elephance/agent` 应该是“自建 Agent 的编排库”，不是替代 MCP 的东西。

Cursor、Claude Code、Claude Desktop 的通用入口仍然是 MCP。它们的自动程度由各自的 rules、hooks、tool approval、auto-run 能力决定。Elephance 可以通过规则模板和 CLI 初始化把体验做得更顺，但不要把这部分硬塞进 `@elephance/agent`。

最终产品叙事可以是：

```txt
Use @elephance/core when you need storage.
Use @elephance/mcp when you need tools in AI clients.
Use @elephance/agent when you own the model loop.
Use @elephance/cli when you want one-command setup.
```

这套边界清楚、可渐进开发，也方便后续作为 npm workspace 独立发布。
