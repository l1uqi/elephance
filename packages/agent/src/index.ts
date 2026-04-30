export { createElephanceAgent } from "./agent.js";
export {
  createMemoryContext,
  formatElephanceContext,
} from "./context.js";
export {
  createLlmMemoryExtractor,
  commitMemoryCandidates,
  extractMemoryCandidates,
  parseMemoryCandidatesFromText,
} from "./extraction.js";
export {
  looksSensitive,
  resolveMemoryPolicy,
  resolveRulePolicy,
  resolveSchemaPolicy,
  shouldCommitCandidate,
  shouldCommitRuleCandidate,
} from "./policy.js";
export {
  commitRuleCandidates,
  createLlmRuleExtractor,
  extractRuleCandidates,
  parseRuleCandidatesFromText,
} from "./rules/extraction.js";
export { selfReflectRules } from "./rules/reflection.js";

export type {
  AgentMessage,
  AgentRole,
  AutoWriteMode,
  ChatAdapter,
  ChatAdapterOptions,
  CommitMemoryOptions,
  CommitRuleOptions,
  ElephanceAgent,
  ElephanceAgentChatOptions,
  ElephanceAgentOptions,
  ElephanceAgentResult,
  LlmRuleExtractorOptions,
  MemoryCandidate,
  MemoryCommit,
  MemoryCommitResult,
  MemoryContextInput,
  MemoryContextResult,
  MemoryExtractionInput,
  MemoryExtractor,
  MemoryLabel,
  MemoryPolicy,
  RequiredRulePolicy,
  RuleCandidate,
  RuleCommit,
  RuleCommitDecision,
  RuleCommitDecisionKind,
  RuleCommitResult,
  RuleReflectionSuggestion,
  RuleReflectionSuggestionKind,
  RuleExtractionInput,
  RuleExtractor,
  RuleExtractorMode,
  RulePolicy,
  SelfReflectRulesOptions,
  SelfReflectRulesResult,
  LlmMemoryExtractorOptions,
  SchemaPolicy,
} from "./types.js";
