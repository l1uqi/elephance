import type {
  MemoryHit,
  QueryOptions,
  RuleHit,
  RuleMetadataInput,
  RuleScope,
  RuleStatus,
  SchemaHit,
} from "@elephance/core";

export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentRole;
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatAdapterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ChatAdapter {
  chat(
    messages: AgentMessage[],
    options?: ChatAdapterOptions
  ): Promise<AgentMessage>;
}

export type AutoWriteMode = false | "dry-run" | "confirm" | "always";
export type RuleExtractorMode = "heuristic" | "llm";

export type MemoryLabel =
  | "user_preference"
  | "project_convention"
  | "ui_preference"
  | "coding_style"
  | "architecture_decision"
  | "fact"
  | "summary"
  | "note"
  | string;

export interface MemoryPolicy {
  autoRetrieve?: boolean;
  autoExtract?: boolean;
  autoWrite?: AutoWriteMode;
  topK?: number;
  minimal?: boolean;
  userId?: string;
  allowedLabels?: string[];
  deniedLabels?: string[];
  minConfidence?: number;
  maxCandidatesPerTurn?: number;
  maxTextChars?: number;
}

export interface RulePolicy {
  autoRetrieve?: boolean;
  autoExtract?: boolean;
  autoWrite?: AutoWriteMode;
  /** Rule extraction implementation for self-hosted agents. Defaults to heuristic. */
  extractor?: RuleExtractorMode;
  /** Optional system prompt used when extractor is "llm". */
  extractorSystemPrompt?: string;
  topK?: number;
  minimal?: boolean;
  maxTextChars?: number;
  allowedLabels?: string[];
  deniedLabels?: string[];
  minConfidence?: number;
  maxCandidatesPerTurn?: number;
  defaultScope?: RuleScope;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
}

export interface SchemaPolicy {
  autoRetrieve?: boolean;
  topK?: number;
  minimal?: boolean;
  maxTextChars?: number;
}

export interface ElephanceAgentOptions {
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
  llm: ChatAdapter;
  extractor?: MemoryExtractor;
  ruleExtractor?: RuleExtractor;
  memory?: MemoryPolicy;
  rules?: RulePolicy;
  schema?: SchemaPolicy;
  chatOptions?: ChatAdapterOptions;
}

export interface ElephanceAgent {
  chat(
    messages: AgentMessage[],
    options?: ElephanceAgentChatOptions
  ): Promise<ElephanceAgentResult>;
}

export interface ElephanceAgentChatOptions {
  chatOptions?: ChatAdapterOptions;
  memory?: MemoryPolicy;
  rules?: RulePolicy;
  schema?: SchemaPolicy;
}

export interface MemoryCandidate {
  text: string;
  label: MemoryLabel;
  userId?: string;
  confidence: number;
  reason?: string;
  source?: "user" | "assistant" | "conversation_summary" | string;
  metadata?: Record<string, unknown>;
}

export interface RuleCandidate {
  text: string;
  label: RuleMetadataInput["label"];
  scope?: RuleScope;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
  action: string;
  condition?: string;
  constraint?: string;
  exception?: string;
  confidence: number;
  reason?: string;
  source?:
    | "manual"
    | "user_correction"
    | "repeated_pattern"
    | "conversation_summary"
    | "reflection"
    | string;
  evidenceIds?: string[];
  examples?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryExtractor {
  extract(input: MemoryExtractionInput): Promise<MemoryCandidate[]>;
}

export interface LlmMemoryExtractorOptions {
  llm: ChatAdapter;
  chatOptions?: ChatAdapterOptions;
  systemPrompt?: string;
  mode?: "user_memory" | "project_learning" | "mixed";
}

export interface RuleExtractor {
  extract(input: RuleExtractionInput): Promise<RuleCandidate[]>;
}

export interface LlmRuleExtractorOptions {
  llm: ChatAdapter;
  chatOptions?: ChatAdapterOptions;
  systemPrompt?: string;
  mode?: "agent_rules" | "project_rules" | "mixed";
}

export interface MemoryExtractionInput {
  messages: AgentMessage[];
  response?: AgentMessage;
  userId?: string;
  policy: RequiredMemoryPolicy;
}

export interface CommitMemoryOptions {
  userId?: string;
  policy?: MemoryPolicy;
}

export interface RuleExtractionInput {
  messages: AgentMessage[];
  response?: AgentMessage;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
  policy: RequiredRulePolicy;
}

export interface MemoryCommit {
  candidate: MemoryCandidate;
  status: "written" | "skipped";
  reason?: string;
}

export interface MemoryCommitResult {
  writes: MemoryCommit[];
}

export interface CommitRuleOptions {
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
  policy?: RulePolicy;
  dryRun?: boolean;
  similarityAddThreshold?: number;
  similarityMergeThreshold?: number;
}

export type RuleCommitDecisionKind = "add" | "merge" | "conflict" | "skip";

export interface RuleCommitDecision {
  kind: RuleCommitDecisionKind;
  reason: string;
  existingRuleId?: string;
  similarity?: number;
}

export interface RuleCommit {
  candidate: RuleCandidate;
  status: "written" | "skipped";
  reason?: string;
  ruleId?: string;
  decision?: RuleCommitDecision;
}

export interface RuleCommitResult {
  writes: RuleCommit[];
}

export interface SelfReflectRulesOptions {
  sampleSize?: number;
  includeDeprecated?: boolean;
  dryRun?: boolean;
  label?: string;
  scope?: RuleScope;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
  staleDays?: number;
  lowConfidenceThreshold?: number;
}

export type RuleReflectionSuggestionKind =
  | "consolidation"
  | "conflict_resolution"
  | "clarification"
  | "pruning";

export interface RuleReflectionSuggestion {
  kind: RuleReflectionSuggestionKind;
  ruleIds: string[];
  action: "merge" | "mark_conflicted" | "add_examples" | "deprecate" | "archive";
  reason: string;
  confidence: number;
  status?: RuleStatus;
  keepRuleId?: string;
  examples?: string[];
}

export interface SelfReflectRulesResult {
  dryRun: boolean;
  scanned: number;
  suggestions: RuleReflectionSuggestion[];
  applied: RuleReflectionSuggestion[];
  rules: RuleHit[];
}

export interface MemoryContextInput {
  messages?: AgentMessage[];
  query?: string;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
  memory?: MemoryPolicy;
  rules?: RulePolicy;
  schema?: SchemaPolicy;
}

export interface MemoryContextResult {
  contextText: string;
  memoryHits: MemoryHit[];
  ruleHits: RuleHit[];
  schemaHits: SchemaHit[];
}

export interface ElephanceAgentResult {
  message: AgentMessage;
  messages: AgentMessage[];
  context: MemoryContextResult;
  memory: {
    candidates: MemoryCandidate[];
    writes: MemoryCommit[];
  };
  rules: {
    candidates: RuleCandidate[];
    writes: RuleCommit[];
  };
}

export interface RequiredMemoryPolicy {
  autoRetrieve: boolean;
  autoExtract: boolean;
  autoWrite: AutoWriteMode;
  topK: number;
  minimal: boolean;
  allowedLabels: string[];
  deniedLabels: string[];
  minConfidence: number;
  maxCandidatesPerTurn: number;
  maxTextChars: number;
  userId?: string;
}

export interface RequiredSchemaPolicy {
  autoRetrieve: boolean;
  topK: number;
  minimal: boolean;
  maxTextChars: number;
}

export interface RequiredRulePolicy {
  autoRetrieve: boolean;
  autoExtract: boolean;
  autoWrite: AutoWriteMode;
  extractor: RuleExtractorMode;
  extractorSystemPrompt?: string;
  topK: number;
  minimal: boolean;
  maxTextChars: number;
  allowedLabels: string[];
  deniedLabels: string[];
  minConfidence: number;
  maxCandidatesPerTurn: number;
  defaultScope: RuleScope;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: string;
}

export type CoreQueryOptions = Pick<
  QueryOptions,
  "topK" | "minimal" | "maxTextChars"
>;
