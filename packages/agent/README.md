# @elephance/agent

Agent memory orchestration for elephance.

Use this package when you own the model loop and want durable memory to be
retrieved before an LLM call and optionally extracted after the response.

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
        content: "Hello from your model adapter.",
      };
    },
  },
});

const result = await agent.chat([
  { role: "user", content: "Remember that I prefer concise answers." },
]);

console.log(result.message.content);
console.log(result.memory.candidates);
```

## LLM extraction

The default extractor is conservative and rule-based. For richer project
learning, pass an LLM-backed extractor. It still uses your `ChatAdapter`, so the
package remains provider-neutral.

```ts
import {
  createElephanceAgent,
  createLlmMemoryExtractor,
} from "@elephance/agent";

const llm = {
  async chat(messages) {
    return {
      role: "assistant",
      content: "Return your provider response here.",
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

This is useful for iterative workflows such as UI refinement. If a user guides
the assistant toward the final list style, the extractor can store the reusable
project convention instead of every intermediate attempt.

## Design

`@elephance/agent` does not depend on a specific model provider. Pass a
`ChatAdapter` for OpenAI, Anthropic, Ollama, Vercel AI SDK, LangChain, Mastra,
or your own runtime.

The package is intentionally separate from `@elephance/mcp`:

- Use `@elephance/agent` when you own the model loop.
- Use `@elephance/mcp` for Cursor, Claude Code, Claude Desktop, and other MCP
  clients.

## Write policy

Automatic writes are disabled by default.

```ts
memory: {
  autoRetrieve: true,
  autoWrite: false,
}
```

Supported write modes:

- `false`: retrieve only.
- `"dry-run"`: return memory candidates, but do not write.
- `"confirm"`: return memory candidates for the host app to review.
- `"always"`: write candidates that pass policy filters.

The default policy rejects low-confidence candidates, unsupported labels, long
memory text, and obvious secrets.

Default labels include `user_preference`, `project_convention`,
`ui_preference`, `coding_style`, `architecture_decision`, `fact`, `summary`,
and `note`.
