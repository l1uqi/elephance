import { createMemoryContext } from "./context.js";
import { commitMemoryCandidates, extractMemoryCandidates } from "./extraction.js";
import {
  commitRuleCandidates,
  createLlmRuleExtractor,
  extractRuleCandidates,
} from "./rules/extraction.js";
import { resolveMemoryPolicy, resolveRulePolicy } from "./policy.js";
import type {
  AgentMessage,
  ElephanceAgent,
  ElephanceAgentChatOptions,
  ElephanceAgentOptions,
  ElephanceAgentResult,
  MemoryCandidate,
  MemoryCommit,
  RuleCandidate,
  RuleCommit,
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
      const rulePolicy = resolveRulePolicy(
        { ...options.rules, ...runOptions.rules },
        {
          userId: options.userId,
          projectId: options.projectId,
          repoPath: options.repoPath,
          client: options.client,
        }
      );
      const context = await createMemoryContext({
        messages,
        userId: memoryPolicy.userId,
        projectId: rulePolicy.projectId,
        repoPath: rulePolicy.repoPath,
        client: rulePolicy.client,
        memory: memoryPolicy,
        rules: rulePolicy,
        schema: { ...options.schema, ...runOptions.schema },
      });
      const augmentedMessages = withContext(messages, context.contextText);
      const message = await options.llm.chat(augmentedMessages, {
        ...options.chatOptions,
        ...runOptions.chatOptions,
      });

      const extractor = options.extractor ?? { extract: extractMemoryCandidates };
      const candidates = memoryPolicy.autoExtract
        ? await extractor.extract({
            messages,
            response: message,
            userId: memoryPolicy.userId,
            policy: memoryPolicy,
          })
        : [];

      let writes: MemoryCommit[] = [];
      if (memoryPolicy.autoWrite === "always") {
        writes = (
          await commitMemoryCandidates(candidates, {
            userId: memoryPolicy.userId,
            policy: memoryPolicy,
          })
        ).writes;
      }

      const ruleExtractor =
        options.ruleExtractor ??
        (rulePolicy.extractor === "llm"
          ? createLlmRuleExtractor({
              llm: options.llm,
              systemPrompt: rulePolicy.extractorSystemPrompt,
            })
          : { extract: extractRuleCandidates });
      const ruleCandidates: RuleCandidate[] = rulePolicy.autoExtract
        ? await ruleExtractor.extract({
            messages,
            response: message,
            userId: rulePolicy.userId,
            projectId: rulePolicy.projectId,
            repoPath: rulePolicy.repoPath,
            client: rulePolicy.client,
            policy: rulePolicy,
          })
        : [];

      let ruleWrites: RuleCommit[] = [];
      if (rulePolicy.autoWrite === "always") {
        ruleWrites = (
          await commitRuleCandidates(ruleCandidates, {
            userId: rulePolicy.userId,
            projectId: rulePolicy.projectId,
            repoPath: rulePolicy.repoPath,
            client: rulePolicy.client,
            policy: rulePolicy,
          })
        ).writes;
      }

      return {
        message,
        messages: [...messages, message],
        context,
        memory: {
          candidates,
          writes,
        },
        rules: {
          candidates: ruleCandidates,
          writes: ruleWrites,
        },
      };
    },
  };
}
