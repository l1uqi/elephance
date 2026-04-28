/**
 * Shared types for elephance
 */

import type { Connection } from "@lancedb/lancedb";

export { type Connection };

// ============================================================
// Configuration Types
// ============================================================

export interface VectorStoreOptions {
  /** Database directory path (default: '.lancedb') */
  dbPath?: string;
  /** Memory table name (default: 'memory') */
  memoryTable?: string;
  /** Schema table name (default: 'project_schema') */
  schemaTable?: string;
}

export interface EmbeddingOptions {
  /** Embedding model name (default: 'text-embedding-3-small') */
  model?: string;
  /** Custom embedding provider */
  provider?: EmbeddingProvider;
}

export interface QueryOptions {
  /** Minimal mode: truncate text to reduce tokens (default: true) */
  minimal?: boolean;
  /** Max characters per result in minimal mode (default: 420) */
  maxTextChars?: number;
  /** Vector search candidate limit (default: 8) */
  candidateLimit?: number;
  /** Max chunks per source to merge (default: 1) */
  maxChunksPerSource?: number;
  /** Max results to return (default: 3) */
  topK?: number;
}

export interface BatchQueryOptions extends QueryOptions {
  /** Max merged results for batch queries (default: 4) */
  mergedTopK?: number;
}

// ============================================================
// Embedding Provider Interface
// ============================================================

/**
 * Custom embedding provider interface
 * Implement this to use different embedding backends
 */
export interface EmbeddingProvider {
  /**
   * Embed a single text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embed multiple texts (order preserved)
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ============================================================
// Result Types
// ============================================================

export interface MemoryHit {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  distance: number;
}

export interface SchemaHit {
  id: string;
  text: string;
  source: string;
  last_updated: string;
  distance: number;
}

// ============================================================
// Memory Types
// ============================================================

export interface MemoryMetadata {
  /** User identifier */
  userId?: string;
  user_id?: string;
  userID?: string;
  /** Memory label for categorization */
  label?: string;
  /** Custom row ID (optional) */
  id?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

// ============================================================
// Schema Types
// ============================================================

export interface SchemaChunk {
  sourceRelativePath: string;
  lastUpdatedIso: string;
  chunkTexts: string[];
}

// ============================================================
// Internal Types (for table operations)
// ============================================================

export interface MemoryRow {
  id: string;
  text: string;
  vector: number[];
  metadata_json: string;
}

export interface SchemaRow {
  id: string;
  text: string;
  source: string;
  last_updated: string;
  vector: number[];
}
