# @elephance/agent

Agent memory and rule orchestration for elephance.

Use this package when you own the model loop and want durable memory to be
retrieved before an LLM call and optionally extracted after the response. It can
also retrieve, extract, judge, commit, and reflect structured rule memory.

Current published version: `0.2.0`.

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
console.log(result.rules.candidates);
```

## Rule Memory

Rules are structured, scoped instructions such as project conventions, coding
style, UI preferences, user corrections, and agent behavior. Relevant active
rules are injected into the same Elephance context block before the model call,
and retrieved rules record hits for later ranking and pruning.

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

`rules.autoWrite` uses the same write modes as memory:

- `false`: retrieve only.
- `"dry-run"`: return rule candidates and judge decisions, but do not write.
- `"confirm"`: return candidates for the host app to review.
- `"always"`: write candidates that pass policy and judge checks.

`commitRuleCandidates()` judges each candidate before writing:

- `add`: no similar active rule exists.
- `merge`: a similar rule exists, so the existing rule is versioned and updated.
- `conflict`: the candidate appears mutually exclusive with an active rule.
- `skip`: policy rejected the candidate.

## LLM Extraction

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

Rule extraction has two modes. The default mode is `heuristic`, which keeps
hosted clients and simple agents deterministic. Self-hosted agents can opt into
LLM rule extraction with configuration:

```ts
const agent = createElephanceAgent({
  userId: "user-123",
  projectId: "my-app",
  llm,
  rules: {
    autoExtract: true,
    autoWrite: "dry-run",
    extractor: "llm",
    extractorSystemPrompt: "Extract only durable project and user rules.",
  },
});
```

This reuses the same `ChatAdapter`; it does not require a second model
configuration. If you pass `ruleExtractor` directly, that custom extractor takes
priority over `rules.extractor`.

MCP clients such as Cursor keep their explicit tool workflow. They do not need
or use this agent-side LLM extractor configuration.

## Rule Reflection

`selfReflectRules()` scans stored rules and returns maintenance suggestions.
It defaults to dry-run and does not silently rewrite rule text.

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

Suggestion kinds include `consolidation`, `conflict_resolution`,
`clarification`, and `pruning`. When `dryRun` is false, the implementation only
applies safe status changes such as `deprecated`, `archived`, or `conflicted`.

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

Default rule labels include `user_preference`, `project_convention`,
`ui_preference`, `coding_style`, and `agent_behavior`.
