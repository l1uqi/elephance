# @elephance/agent

Elephance 的 Agent 自动记忆和规则编排层。

当你自己控制大模型调用流程，并希望在调用前自动检索 memory/schema/rules、调用后提取可长期保存的记忆或规则时，使用这个包。

当前已发布版本：`0.3.0`。

```bash
npm install @elephance/agent @elephance/core openai
```

```ts
import { createElephanceAgent } from "@elephance/agent";

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
console.log(result.rules.candidates);
```

## Rule Memory

Rule 是结构化、有作用域的长期行为约束，例如项目约定、代码风格、UI 偏好、用户纠正和 Agent 行为规范。相关 active rules 会在模型调用前注入 Elephance context，并记录命中次数，用于后续排序和修剪。

```ts
const agent = createElephanceAgent({
  projectId: "my-app",
  llm,
  rules: {
    autoRetrieve: true,
    autoExtract: true,
    autoWrite: "dry-run",
    defaultScope: "project",
    allowedLabels: ["project_convention", "ui_preference", "coding_style"],
  },
});
```

`rules.autoWrite` 使用和 memory 相同的写入模式：

- `false`：只检索。
- `"dry-run"`：返回规则候选和 judge 决策，但不写入。
- `"confirm"`：返回候选，由宿主应用确认。
- `"always"`：通过策略和 judge 检查后写入。

`commitRuleCandidates()` 写入前会为每条候选做判断：

- `add`：没有相似 active rule，新增。
- `merge`：存在相似规则，复用旧规则并递增版本。
- `conflict`：候选和已有 active rule 互斥，标记冲突。
- `skip`：策略拒绝候选。

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

Rule extraction 有两种模式。默认是 `heuristic`，保持简单 Agent 和托管客户端的行为确定。自建 Agent 可以通过配置启用 LLM 规则抽取：

```ts
const agent = createElephanceAgent({
  userId: "user-123",
  projectId: "my-app",
  llm,
  rules: {
    autoExtract: true,
    autoWrite: "dry-run",
    extractor: "llm",
    extractorSystemPrompt: "只提取长期有效的项目和用户规则。",
  },
});
```

它会复用同一个 `ChatAdapter`，不需要第二套模型配置。如果你直接传 `ruleExtractor` 自定义实现，它会优先于 `rules.extractor`。

Cursor 等 MCP Client 保持显式工具调用流程，不需要也不会使用这个 agent 侧 LLM extractor 配置。

## Rule Reflection

`selfReflectRules()` 会扫描已存规则并返回维护建议。它默认 dry-run，不会静默改写规则正文。

```ts
import { selfReflectRules } from "@elephance/agent";

const result = await selfReflectRules({
  sampleSize: 50,
  includeDeprecated: false,
  dryRun: true,
  projectId: "my-app",
});

console.log(result.suggestions);
```

建议类型包括 `consolidation`、`conflict_resolution`、`clarification` 和 `pruning`。当 `dryRun` 为 false 时，当前实现只自动应用安全的状态变更，例如 `deprecated`、`archived` 或 `conflicted`。

## 研究思路来源

Agent 层把论文里的思路落到实际运行循环里：

- [AutoSkill](https://arxiv.org/abs/2603.01145)：启发从重复交互痕迹中提炼可复用 rule/skill artifact。
- [MemSkill](https://arxiv.org/abs/2602.02474)：对应到 rule memory 的 extract、judge、merge、reflect、prune 生命周期。
- [Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670)：对应 Elephance 的 write/manage/read 流程，也就是提取与提交、状态维护、检索和上下文注入。
- [De Jure](https://arxiv.org/abs/2604.02276)：启发把自然语言规则提取成 `action`、`condition`、`constraint`、`confidence` 等结构化字段，并为后续 judge/repair 留接口。

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

默认 rule label 包含 `user_preference`、`project_convention`、`ui_preference`、`coding_style` 和 `agent_behavior`。
