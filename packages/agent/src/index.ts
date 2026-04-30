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
  resolveSchemaPolicy,
  shouldCommitCandidate,
} from "./policy.js";

export type {
  AgentMessage,
  AgentRole,
  AutoWriteMode,
  ChatAdapter,
  ChatAdapterOptions,
  CommitMemoryOptions,
  ElephanceAgent,
  ElephanceAgentChatOptions,
  ElephanceAgentOptions,
  ElephanceAgentResult,
  MemoryCandidate,
  MemoryCommit,
  MemoryCommitResult,
  MemoryContextInput,
  MemoryContextResult,
  MemoryExtractionInput,
  MemoryExtractor,
  MemoryLabel,
  MemoryPolicy,
  LlmMemoryExtractorOptions,
  SchemaPolicy,
} from "./types.js";
