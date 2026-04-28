/**
 * Schema Module
 * 
 * Provides project schema storage and semantic retrieval.
 * Optimized for SQL table structures, field definitions, and JOIN relationships.
 */

import { createHash } from "node:crypto";
import { connect, openTable, tableExists, getConfig } from "./connection.js";
import { embedText, embedTexts } from "./embedding.js";
import type { SchemaHit, QueryOptions, BatchQueryOptions } from "./types.js";

const DEFAULT_SCHEMA_TOP_K = 3;
const DEFAULT_CANDIDATE_LIMIT = 8;
const DEFAULT_MAX_CHUNKS_PER_SOURCE = 1;
const DEFAULT_MINIMAL_MAX_CHARS = 420;
const DEFAULT_BATCH_MERGED_TOP_K = 4;

/**
 * Compact schema text for minimal mode
 * Extracts field definition sections and truncates if needed
 */
function compactSchemaText(
  full: string,
  minimal: boolean,
  maxChars: number
): string {
  let t = full.trim();
  if (!minimal) {
    return t;
  }
  // Try to extract field definition section
  const section = t.match(
    /(?:^|\n)(##\s*(?:字段定义|字段说明|字段列表|Columns?|Fields?)\b[^\n]*)[\s\S]*?(?=\n##\s|\s*$)/i
  );
  if (section) {
    t = section[0].trim();
  }
  // Truncate if too long
  if (t.length > maxChars) {
    const head = t.slice(0, maxChars);
    const lastLineBreak = head.lastIndexOf("\n");
    const compacted =
      lastLineBreak > Math.floor(maxChars * 0.6)
        ? head.slice(0, lastLineBreak)
        : head;
    return compacted.trimEnd();
  }
  return t;
}

/**
 * Merge multiple chunks from the same source
 */
function mergeChunksBySource(
  rows: SchemaHit[],
  maxChunksPerSource: number,
  topK: number
): SchemaHit[] {
  const bySource = new Map<string, SchemaHit[]>();

  for (const r of rows) {
    const src = r.source;
    let chunks = bySource.get(src);
    if (!chunks) {
      chunks = [];
      bySource.set(src, chunks);
    }
    if (chunks.length < maxChunksPerSource) {
      chunks.push(r);
    }
  }

  const merged: SchemaHit[] = [];
  for (const [, chunks] of bySource) {
    const sorted = [...chunks].sort((a, b) => a.distance - b.distance);
    const primary = sorted[0]!;
    const rest = sorted.slice(1);
    const text =
      rest.length === 0
        ? primary.text
        : [primary.text, ...rest.map((x) => x.text)].join("\n\n---\n\n");
    const lastUpdated = sorted.reduce(
      (acc, x) => (x.last_updated > acc ? x.last_updated : acc),
      primary.last_updated
    );
    merged.push({
      id: primary.id,
      text,
      source: primary.source,
      last_updated: lastUpdated,
      distance: primary.distance,
    });
  }

  merged.sort((a, b) => a.distance - b.distance);
  return merged.slice(0, topK);
}

/**
 * Merge batch query results by source
 */
function mergeBatchSchemaHits(
  batches: SchemaHit[][],
  mergedTopK: number
): SchemaHit[] {
  const bySource = new Map<string, SchemaHit>();
  for (const hits of batches) {
    for (const h of hits) {
      const prev = bySource.get(h.source);
      if (!prev || h.distance < prev.distance) {
        bySource.set(h.source, { ...h });
      }
    }
  }
  return [...bySource.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, mergedTopK);
}

/**
 * Extract table name from source path
 */
function sourceTableName(source: string): string {
  const file = source.split(/[\\/]/).pop() ?? source;
  return file.replace(/\.md$/i, "").toLowerCase();
}

/**
 * Escape SQL string for LanceDB queries
 */
function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Generate schema chunk ID
 */
function schemaChunkId(
  sourceRelativePath: string,
  chunkIndex: number,
  text: string
): string {
  return createHash("sha256")
    .update(`${sourceRelativePath}\n${chunkIndex}\n${text}`, "utf8")
    .digest("hex");
}

/**
 * Delete all rows for a specific source
 */
export async function deleteProjectSchemaBySource(
  sourceRelativePath: string
): Promise<void> {
  const config = getConfig();
  const db = await connect();
  const hasTable = await tableExists(config.schemaTable);
  if (!hasTable) {
    return;
  }
  const table = await openTable(config.schemaTable);
  await table.delete(`source = '${escapeSqlString(sourceRelativePath)}'`);
}

/**
 * Replace schema records for a source (delete + insert)
 * 
 * @param sourceRelativePath - Relative path like "tables/example_table.md"
 * @param lastUpdatedIso - ISO timestamp
 * @param chunkTexts - Array of text chunks to store
 * 
 * @example
 * ```ts
 * await replaceProjectSchemaForSource(
 *   "tables/billing_invoice.md",
 *   "2024-01-15T10:30:00Z",
 *   ["## 字段定义\nid, amount...", "## 说明\n账单表..."]
 * );
 * ```
 */
export async function replaceProjectSchemaForSource(
  sourceRelativePath: string,
  lastUpdatedIso: string,
  chunkTexts: string[]
): Promise<void> {
  const trimmed = chunkTexts
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  await deleteProjectSchemaBySource(sourceRelativePath);
  if (trimmed.length === 0) {
    return;
  }
  const vectors = await embedTexts(trimmed);
  const rows = trimmed.map((text, i) => ({
    id: schemaChunkId(sourceRelativePath, i, text),
    vector: vectors[i]!,
    text,
    source: sourceRelativePath,
    last_updated: lastUpdatedIso,
  }));

  const config = getConfig();
  const db = await connect();
  const hasTable = await tableExists(config.schemaTable);
  if (!hasTable) {
    await db.createTable(config.schemaTable, rows, { mode: "create" });
    return;
  }
  const table = await openTable(config.schemaTable);
  await table.add(rows);
}

/**
 * Query project schema by semantic similarity
 * 
 * @param queryText - Query text (e.g., "invoice payment join")
 * @param options - Query options (minimal, topK, etc.)
 * @returns Array of schema hits
 * 
 * @example
 * ```ts
 * const schema = await queryProjectSchema("invoice payment join", {
 *   minimal: true,
 *   topK: 3
 * });
 * // → [{ source: "billing_invoice.md", text: "## 字段定义\nid, amount...", ... }]
 * ```
 */
export async function queryProjectSchema(
  queryText: string,
  options: QueryOptions = {}
): Promise<SchemaHit[]> {
  const config = getConfig();
  const minimal = options.minimal !== false;
  const maxTextChars = options.maxTextChars ?? DEFAULT_MINIMAL_MAX_CHARS;
  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const maxChunksPerSource =
    options.maxChunksPerSource ?? DEFAULT_MAX_CHUNKS_PER_SOURCE;
  const topK = options.topK ?? DEFAULT_SCHEMA_TOP_K;

  const hasTable = await tableExists(config.schemaTable);
  if (!hasTable) {
    return [];
  }
  const vector = await embedText(queryText);
  const table = await openTable(config.schemaTable);
  const rows = await table
    .vectorSearch(vector)
    .limit(Math.max(candidateLimit, topK))
    .distanceType("cosine")
    .select(["id", "text", "source", "last_updated", "_distance"])
    .toArray();

  const flat = rows.map((r: Record<string, unknown>) => ({
    id: String(r.id ?? ""),
    text: String(r.text ?? ""),
    source: String(r.source ?? ""),
    last_updated: String(r.last_updated ?? ""),
    distance: Number(r._distance ?? 0),
  }));

  const merged = mergeChunksBySource(flat, maxChunksPerSource, topK);
  return merged.map((h) => ({
    ...h,
    text: compactSchemaText(h.text, minimal, maxTextChars),
  }));
}

/**
 * Query schema by exact table names (avoid vector recall for exact matches)
 * 
 * @param tableNames - Array of table names (e.g., ["billing_invoice", "billing_payment"])
 * @param options - Query options
 * @returns Array of schema hits in requested order
 * 
 * @example
 * ```ts
 * const schema = await queryProjectSchemaByTableNames(
 *   ["td_billing_invoice", "td_billing_payment"]
 * );
 * ```
 */
export async function queryProjectSchemaByTableNames(
  tableNames: string[],
  options: QueryOptions = {}
): Promise<SchemaHit[]> {
  const wanted = [
    ...new Set(
      tableNames
        .map((name) => name.trim().replace(/\.md$/i, "").toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (wanted.length === 0) {
    return [];
  }

  const config = getConfig();
  const minimal = options.minimal !== false;
  const maxTextChars = options.maxTextChars ?? DEFAULT_MINIMAL_MAX_CHARS;
  const maxChunksPerSource =
    options.maxChunksPerSource ?? DEFAULT_MAX_CHUNKS_PER_SOURCE;
  const topK = options.topK ?? Math.max(wanted.length, DEFAULT_SCHEMA_TOP_K);

  const hasTable = await tableExists(config.schemaTable);
  if (!hasTable) {
    return [];
  }
  const table = await openTable(config.schemaTable);
  const rows = await table
    .query()
    .select(["id", "text", "source", "last_updated"])
    .toArray();

  const wantedSet = new Set(wanted);
  const flat = (rows as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id ?? ""),
      text: String(r.text ?? ""),
      source: String(r.source ?? ""),
      last_updated: String(r.last_updated ?? ""),
      distance: 0,
    }))
    .filter((r) => wantedSet.has(sourceTableName(r.source)));

  const merged = mergeChunksBySource(flat, maxChunksPerSource, topK);
  const order = new Map(wanted.map((name, index) => [name, index]));
  return merged
    .map((h) => ({
      ...h,
      text: compactSchemaText(h.text, minimal, maxTextChars),
    }))
    .sort(
      (a, b) =>
        (order.get(sourceTableName(a.source)) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(sourceTableName(b.source)) ?? Number.MAX_SAFE_INTEGER)
    );
}

/**
 * Batch query schema by multiple keywords
 * 
 * @param keywords - Array of search keywords
 * @param options - Query options
 * @returns Deduplicated schema hits
 * 
 * @example
 * ```ts
 * const schema = await batchQueryProjectSchema(
 *   ["invoice", "payment", "user"],
 *   { mergedTopK: 4 }
 * );
 * ```
 */
export async function batchQueryProjectSchema(
  keywords: string[],
  options: BatchQueryOptions = {}
): Promise<SchemaHit[]> {
  const uniq = [
    ...new Set(
      keywords.map((k) => k.trim()).filter((k) => k.length > 0)
    ),
  ];
  if (uniq.length === 0) {
    return [];
  }
  const mergedTopK = options.mergedTopK ?? DEFAULT_BATCH_MERGED_TOP_K;
  const { mergedTopK: _, ...perQueryOpts } = options;
  const batches = await Promise.all(
    uniq.map((kw) => queryProjectSchema(kw, perQueryOpts))
  );
  return mergeBatchSchemaHits(batches, mergedTopK);
}

// Re-export types
export type { SchemaHit, QueryOptions, BatchQueryOptions } from "./types.js";