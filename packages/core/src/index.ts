/**
 * elephance
 * 
 * A lightweight LanceDB wrapper for vector storage, memory management, and schema retrieval.
 * 
 * @packageDocumentation
 */

// ============================================================
// Core Exports
// ============================================================

// Connection
export {
  configure,
  getConfig,
  connect,
  resetConnection,
  getTableNames,
  tableExists,
  openTable,
  type VectorStoreOptions,
} from "./connection.js";

// Embedding
export {
  setEmbeddingProvider,
  getEmbeddingProvider,
  configureEmbedding,
  getEmbeddingModel,
  embedText,
  embedTexts,
  type EmbeddingProvider,
  type EmbeddingOptions,
} from "./embedding.js";

// Memory
export {
  upsertMemory,
  queryMemory,
  clearUserMemory,
  type MemoryHit,
  type MemoryMetadata,
} from "./memory.js";

// Rules
export {
  upsertRule,
  listRules,
  queryRules,
  recordRuleHit,
  recordRuleObservation,
  proposeRulePromotion,
  updateRuleStatus,
  type RuleHit,
  type RuleListOptions,
  type RuleMetadata,
  type RuleMetadataInput,
  type RuleObservation,
  type RuleObservationInput,
  type RuleObservationOutcome,
  type RulePromotionOptions,
  type RulePromotionProposal,
  type RuleQueryOptions,
  type RuleStatus,
} from "./rules.js";

// Schema
export {
  deleteProjectSchemaBySource,
  replaceProjectSchemaForSource,
  queryProjectSchema,
  queryProjectSchemaByTableNames,
  batchQueryProjectSchema,
  type SchemaHit,
} from "./schema.js";

// Types
export type {
  Connection,
  QueryOptions,
  BatchQueryOptions,
  RuleScope,
} from "./types.js";

// ============================================================
// Default Configuration
// ============================================================

// Initialize with default configuration
import { configure } from "./connection.js";
configure();
