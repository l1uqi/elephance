import { createMemoryContext } from "./context.js";
import { commitMemoryCandidates, extractMemoryCandidates } from "./extraction.js";
import { resolveMemoryPolicy } from "./policy.js";
import type {
  AgentMessage,
  ElephanceAgent,
  ElephanceAgentChatOptions,
  ElephanceAgentOptions,
  ElephanceAgentResult,
  MemoryCandidate,
  MemoryCommit,
} from "./types.js";

function withContext(
  messages: AgentMessage[],
  contextText: string
): AgentMessage[] {
  if (contextText.length === 0) {
    return messages;
  }
  return [
    {
      role: "system",
      content: contextText,
      name: "elephance_context",
    },
    ...messages,
  ];
}

export function createElephanceAgent(
  options: ElephanceAgentOptions
): ElephanceAgent {
  return {
    async chat(
      messages: AgentMessage[],
      runOptions: ElephanceAgentChatOptions = {}
    ): Promise<ElephanceAgentResult> {
      const memoryPolicy = resolveMemoryPolicy(
        { ...options.memory, ...runOptions.memory },
        options.userId
      );
      const context = await createMemoryContext({
        messages,
        userId: memoryPolicy.userId,
        memory: memoryPolicy,
        schema: { ...options.schema, ...runOptions.schema },
      });
      const augmentedMessages = withContext(messages, context.contextText);
      const message = await options.llm.chat(augmentedMessages, {
        ...options.chatOptions,
        ...runOptions.chatOptions,
      });

      const extractor = options.extractor ?? { extract: extractMemoryCandidates };
      const candidates = await extractor.extract({
        messages,
        response: message,
        userId: memoryPolicy.userId,
        policy: memoryPolicy,
      });

      let writes: MemoryCommit[] = [];
      if (memoryPolicy.autoWrite === "always") {
        writes = (
          await commitMemoryCandidates(candidates, {
            userId: memoryPolicy.userId,
            policy: memoryPolicy,
          })
        ).writes;
      }

      return {
        message,
        messages: [...messages, message],
        context,
        memory: {
          candidates:
            memoryPolicy.autoWrite === false ? ([] as MemoryCandidate[]) : candidates,
          writes,
        },
      };
    },
  };
}
