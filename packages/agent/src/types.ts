import type { MemoryHit, QueryOptions, SchemaHit } from "@elephance/core";

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
  maxTextChars?: number;
}

export interface SchemaPolicy {
  autoRetrieve?: boolean;
  topK?: number;
  minimal?: boolean;
  maxTextChars?: number;
}

export interface ElephanceAgentOptions {
  userId?: string;
  llm: ChatAdapter;
  extractor?: MemoryExtractor;
  memory?: MemoryPolicy;
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
  schema?: SchemaPolicy;
}

export interface MemoryCandidate {
  text: string;
  label: "user_preference" | "fact" | "summary" | "note" | string;
  userId?: string;
  confidence: number;
  reason?: string;
  source?: "user" | "assistant" | "conversation_summary" | string;
  metadata?: Record<string, unknown>;
}

export interface MemoryExtractor {
  extract(input: MemoryExtractionInput): Promise<MemoryCandidate[]>;
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

export interface MemoryCommit {
  candidate: MemoryCandidate;
  status: "written" | "skipped";
  reason?: string;
}

export interface MemoryCommitResult {
  writes: MemoryCommit[];
}

export interface MemoryContextInput {
  messages?: AgentMessage[];
  query?: string;
  userId?: string;
  memory?: MemoryPolicy;
  schema?: SchemaPolicy;
}

export interface MemoryContextResult {
  contextText: string;
  memoryHits: MemoryHit[];
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
}

export interface RequiredMemoryPolicy {
  autoRetrieve: boolean;
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

export type CoreQueryOptions = Pick<
  QueryOptions,
  "topK" | "minimal" | "maxTextChars"
>;
