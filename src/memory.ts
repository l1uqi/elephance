/**
 * Memory Module
 * 
 * Provides user memory storage with smart label-based overwrite.
 * Supports per-user, per-label unique slots for preference storage.
 */

import { createHash } from "node:crypto";
import { connect, openTable, tableExists, getConfig } from "./connection.js";
import { embedText } from "./embedding.js";
import type { MemoryHit, MemoryMetadata, QueryOptions } from "./types.js";

const DEFAULT_TOP_K = 3;

// Labels that support smart overwrite (per user + per label = unique slot)
const DEFAULT_SMART_OVERWRITE_LABELS = new Set(["user_preference"]);

/**
 * Get smart overwrite labels from environment
 */
function getSmartOverwriteLabels(): Set<string> {
  const env = process.env.MEMORY_OVERWRITE_LABELS ?? "user_preference";
  return new Set(
    env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * Normalize user ID from metadata
 */
function normalizeUserId(meta: Record<string, unknown>): string | null {
  const v = meta.userId ?? meta.user_id ?? meta.userID;
  if (v === undefined || v === null) {
    return null;
  }
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * Parse metadata JSON column
 */
function parseMetadataColumn(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Generate slot ID for user + label combination
 */
function slotIdForUserLabel(userId: string, label: string): string {
  return createHash("sha256")
    .update(`slot:${userId}:${label}`, "utf8")
    .digest("hex");
}

/**
 * Generate row ID based on metadata or text hash
 */
function rowId(metadata: Record<string, unknown>, text: string): string {
  const id = metadata.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  const uid = normalizeUserId(metadata);
  const label = metadata.label;
  const smartLabels = getSmartOverwriteLabels();
  if (
    uid &&
    typeof label === "string" &&
    label.length > 0 &&
    smartLabels.has(label)
  ) {
    return slotIdForUserLabel(uid, label);
  }
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Escape SQL string for LanceDB queries
 */
function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Collect row IDs matching a user
 */
async function collectRowIdsMatchingUser(
  table: Awaited<ReturnType<typeof openTable>>,
  userId: string
): Promise<string[]> {
  const rows = await table
    .query()
    .select(["id", "metadata_json"])
    .toArray();
  const uid = String(userId).trim();
  const ids: string[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const meta = parseMetadataColumn(r.metadata_json);
    const rowUid = normalizeUserId(meta);
    if (rowUid !== null && rowUid === uid) {
      const id = r.id;
      if (id !== undefined && id !== null) {
        ids.push(String(id));
      }
    }
  }
  return ids;
}

/**
 * Collect row IDs matching a user and label
 */
async function collectRowIdsMatchingUserAndLabel(
  table: Awaited<ReturnType<typeof openTable>>,
  userId: string,
  label: string
): Promise<string[]> {
  const rows = await table
    .query()
    .select(["id", "metadata_json"])
    .toArray();
  const uid = String(userId).trim();
  const lab = String(label);
  const ids: string[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const meta = parseMetadataColumn(r.metadata_json);
    const rowUid = normalizeUserId(meta);
    const rowLabel = meta.label;
    if (
      rowUid !== null &&
      rowUid === uid &&
      typeof rowLabel === "string" &&
      rowLabel === lab
    ) {
      const id = r.id;
      if (id !== undefined && id !== null) {
        ids.push(String(id));
      }
    }
  }
  return ids;
}

/**
 * Delete rows by IDs (batched to avoid SQL length issues)
 */
async function deleteRowsByIds(
  table: Awaited<ReturnType<typeof openTable>>,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const predicate = chunk
      .map((id) => `id = '${escapeSqlString(id)}'`)
      .join(" OR ");
    await table.delete(`(${predicate})`);
  }
}

/**
 * Upsert memory into LanceDB
 * 
 * @param text - The memory text content
 * @param metadata - Metadata including userId, label, etc.
 * 
 * @example
 * ```ts
 * await upsertMemory("I prefer dark theme", { 
 *   userId: "user123", 
 *   label: "user_preference" 
 * });
 * ```
 */
export async function upsertMemory(
  text: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const config = getConfig();
  const db = await connect();
  const vector = await embedText(text);
  const uid = normalizeUserId(metadata);
  const label = metadata.label;
  const hasTable = await tableExists(config.memoryTable);

  const smartLabels = getSmartOverwriteLabels();
  if (
    hasTable &&
    uid &&
    typeof label === "string" &&
    label.length > 0 &&
    smartLabels.has(label)
  ) {
    const table = await openTable(config.memoryTable);
    const oldIds = await collectRowIdsMatchingUserAndLabel(table, uid, label);
    await deleteRowsByIds(table, oldIds);
  }

  const id = rowId(metadata, text);
  const row = {
    id,
    text,
    vector,
    metadata_json: JSON.stringify({ ...metadata, id }),
  };

  if (!hasTable) {
    await db.createTable(config.memoryTable, [row], { mode: "create" });
    return;
  }

  const table = await openTable(config.memoryTable);
  await table
    .mergeInsert("id")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute([row]);
}

/**
 * Query memory by semantic similarity
 * 
 * @param queryText - Query text to search
 * @param options - Query options (topK, etc.)
 * @returns Array of memory hits sorted by distance
 * 
 * @example
 * ```ts
 * const hits = await queryMemory("theme preference");
 * // → [{ text: "I prefer dark theme", distance: 0.12, ... }]
 * ```
 */
export async function queryMemory(
  queryText: string,
  options: QueryOptions = {}
): Promise<MemoryHit[]> {
  const config = getConfig();
  const topK = options.topK ?? DEFAULT_TOP_K;

  const hasTable = await tableExists(config.memoryTable);
  if (!hasTable) {
    return [];
  }

  const vector = await embedText(queryText);
  const table = await openTable(config.memoryTable);
  const rows = await table
    .vectorSearch(vector)
    .limit(topK)
    .distanceType("cosine")
    .select(["id", "text", "metadata_json", "_distance"])
    .toArray();

  return rows.map((r: Record<string, unknown>) => {
    const metaRaw = r.metadata_json;
    let metadata: Record<string, unknown> = {};
    if (typeof metaRaw === "string") {
      try {
        metadata = JSON.parse(metaRaw) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    }
    return {
      id: String(r.id ?? ""),
      text: String(r.text ?? ""),
      metadata,
      distance: Number(r._distance ?? 0),
    };
  });
}

/**
 * Clear all memory for a specific user
 * 
 * @param userId - User identifier
 * 
 * @example
 * ```ts
 * await clearUserMemory("user123");
 * ```
 */
export async function clearUserMemory(userId: string): Promise<void> {
  const uid = String(userId).trim();
  if (!uid) {
    return;
  }
  const config = getConfig();
  const db = await connect();
  const hasTable = await tableExists(config.memoryTable);
  if (!hasTable) {
    return;
  }
  const table = await openTable(config.memoryTable);
  const ids = await collectRowIdsMatchingUser(table, uid);
  await deleteRowsByIds(table, ids);
}

// Re-export types
export type { MemoryHit, MemoryMetadata, QueryOptions } from "./types.js";