# @elephance/agent

Elephance 的 Agent 自动记忆编排层。

当你自己控制大模型调用流程，并希望在调用前自动检索 memory/schema、调用后提取可长期保存的记忆时，使用这个包。

```ts
import { createElephanceAgent } from "@elephance/agent";

const agent = createElephanceAgent({
  userId: "user-123",
  memory: {
    autoRetrieve: true,
    autoWrite: "dry-run",
  },
  llm: {
    chat: async (messages) => {
      return {
        role: "assistant",
        content: "来自你的模型 adapter 的回复。",
      };
    },
  },
});

const result = await agent.chat([
  { role: "user", content: "记住，我偏好简洁回答。" },
]);

console.log(result.message.content);
console.log(result.memory.candidates);
```

## LLM 提取

默认 extractor 是保守的规则型实现。要做更强的项目经验沉淀，可以传入 LLM-backed extractor。它仍然只依赖你提供的 `ChatAdapter`，因此不会绑定某个模型厂商。

```ts
import {
  createElephanceAgent,
  createLlmMemoryExtractor,
} from "@elephance/agent";

const llm = {
  async chat(messages) {
    return {
      role: "assistant",
      content: "这里返回你的模型响应。",
    };
  },
};

const agent = createElephanceAgent({
  userId: "user-123",
  llm,
  extractor: createLlmMemoryExtractor({
    llm,
    mode: "project_learning",
  }),
  memory: {
    autoRetrieve: true,
    autoExtract: true,
    autoWrite: "dry-run",
    allowedLabels: [
      "user_preference",
      "project_convention",
      "ui_preference",
      "coding_style",
      "architecture_decision",
      "fact",
      "summary",
      "note",
    ],
  },
});
```

这适合前端样式反复调优这类工作流。比如用户多次修正列表 hover 样式后，extractor 可以沉淀最终可复用的项目约定，而不是保存每一次中间尝试。

## 设计边界

`@elephance/agent` 不绑定任何模型厂商。OpenAI、Anthropic、Ollama、Vercel AI SDK、LangChain、Mastra 或自定义 runtime 都可以通过 `ChatAdapter` 接入。

它和 `@elephance/mcp` 的定位不同：

- 自建 Agent 应用使用 `@elephance/agent`。
- Cursor、Claude Code、Claude Desktop 等 MCP client 使用 `@elephance/mcp`。

## 写入策略

默认不自动写入：

```ts
memory: {
  autoRetrieve: true,
  autoWrite: false,
}
```

支持的写入模式：

- `false`：只检索，不提取写入。
- `"dry-run"`：返回候选记忆，但不写入。
- `"confirm"`：返回候选记忆，由宿主应用确认后写入。
- `"always"`：通过策略过滤后自动写入。

默认策略会过滤低置信度候选、不支持的 label、过长文本和明显敏感信息。

默认 label 包含 `user_preference`、`project_convention`、`ui_preference`、`coding_style`、`architecture_decision`、`fact`、`summary` 和 `note`。
