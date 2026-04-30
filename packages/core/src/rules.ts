/**
 * Rule Memory Module
 *
 * Stores durable, structured rules separately from general user memory.
 */

import { createHash } from "node:crypto";
import { connect, openTable, tableExists, getConfig } from "./connection.js";
import { embedText } from "./embedding.js";
import type {
  RuleHit,
  RuleListOptions,
  RuleMetadata,
  RuleMetadataInput,
  RuleQueryOptions,
  RuleRow,
  RuleStatus,
} from "./types.js";

const DEFAULT_RULE_TOP_K = 5;
const DEFAULT_CANDIDATE_LIMIT = 16;

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function parseMetadataColumn(raw: unknown): Partial<RuleMetadata> {
  if (typeof raw !== "string") {
    return {};
  }
  try {
    return JSON.parse(raw) as Partial<RuleMetadata>;
  } catch {
    return {};
  }
}

function normalizeRuleMetadata(
  input: RuleMetadataInput,
  now: string,
  existing?: Partial<RuleMetadata>
): RuleMetadata {
  return {
    ...(existing ?? {}),
    ...input,
    kind: "rule",
    label: input.label,
    scope: input.scope,
    action: input.action,
    version: input.version ?? existing?.version ?? 1,
    status: input.status ?? existing?.status ?? "active",
    confidence: input.confidence ?? existing?.confidence ?? 0.8,
    hitCount: input.hitCount ?? existing?.hitCount ?? 0,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
    source: input.source ?? existing?.source ?? "manual",
  };
}

function ruleId(text: string, metadata: RuleMetadataInput): string {
  if (typeof metadata.id === "string" && metadata.id.length > 0) {
    return metadata.id;
  }
  return createHash("sha256")
    .update(
      [
        "rule",
        metadata.scope,
        metadata.userId ?? "",
        metadata.projectId ?? "",
        metadata.repoPath ?? "",
        metadata.client ?? "",
        metadata.label,
        metadata.action,
        text,
      ].join("\n"),
      "utf8"
    )
    .digest("hex");
}

function statusSet(options: RuleQueryOptions | RuleListOptions): Set<RuleStatus> | null {
  if (options.status) {
    return new Set(
      Array.isArray(options.status) ? options.status : [options.status]
    );
  }
  if (options.includeInactive) {
    return null;
  }
  return new Set(["active"]);
}

function matchesRuleFilters(
  metadata: Partial<RuleMetadata>,
  options: RuleQueryOptions | RuleListOptions
): boolean {
  const statuses = statusSet(options);
  if (statuses && !statuses.has(metadata.status ?? "candidate")) {
    return false;
  }
  if (options.label && metadata.label !== options.label) {
    return false;
  }
  if (options.scope && metadata.scope !== options.scope) {
    return false;
  }
  if (options.userId && metadata.userId !== options.userId) {
    return false;
  }
  if (options.projectId && metadata.projectId !== options.projectId) {
    return false;
  }
  if (options.repoPath && metadata.repoPath !== options.repoPath) {
    return false;
  }
  if (options.client && metadata.client !== options.client) {
    return false;
  }
  return true;
}

function ruleHitFromRow(row: Record<string, unknown>): RuleHit {
  const metadata = parseMetadataColumn(row.metadata_json) as RuleMetadata;
  const distance = Number(row._distance ?? 0);
  return {
    id: String(row.id ?? ""),
    text: String(row.text ?? ""),
    metadata,
    distance,
    score: scoreRule(distance, metadata),
  };
}

function scoreRule(distance: number, metadata: RuleMetadata): number {
  const similarity = 1 - distance;
  const confidenceBoost = metadata.confidence * 0.15;
  const hitBoost = Math.min(metadata.hitCount, 20) * 0.01;
  return similarity + confidenceBoost + hitBoost;
}

async function getRuleRow(id: string): Promise<RuleRow | null> {
  const config = getConfig();
  const hasTable = await tableExists(config.ruleTable);
  if (!hasTable) {
    return null;
  }
  const table = await openTable(config.ruleTable);
  const rows = await table
    .query()
    .where(`id = '${escapeSqlString(id)}'`)
    .limit(1)
    .select(["id", "text", "metadata_json"])
    .toArray();
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }
  return {
    id: String(row.id ?? ""),
    text: String(row.text ?? ""),
    vector: [],
    metadata_json: String(row.metadata_json ?? "{}"),
  };
}

async function upsertRuleRow(row: RuleRow): Promise<void> {
  const config = getConfig();
  const db = await connect();
  const hasTable = await tableExists(config.ruleTable);
  if (!hasTable) {
    await db.createTable(config.ruleTable, [row as unknown as Record<string, unknown>], {
      mode: "create",
    });
    return;
  }
  const table = await openTable(config.ruleTable);
  await table
    .mergeInsert("id")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute([row as unknown as Record<string, unknown>]);
}

async function updateRuleMetadata(
  id: string,
  metadata: RuleMetadata
): Promise<void> {
  const config = getConfig();
  const table = await openTable(config.ruleTable);
  await table.update({
    where: `id = '${escapeSqlString(id)}'`,
    values: {
      metadata_json: JSON.stringify(metadata),
    },
  });
}

export async function upsertRule(
  text: string,
  metadata: RuleMetadataInput
): Promise<RuleHit> {
  const id = ruleId(text, metadata);
  const existing = await getRuleRow(id);
  const now = new Date().toISOString();
  const normalized = normalizeRuleMetadata(
    { ...metadata, id },
    now,
    existing ? parseMetadataColumn(existing.metadata_json) : undefined
  );
  const vector = await embedText(text);
  const row: RuleRow = {
    id,
    text,
    vector,
    metadata_json: JSON.stringify(normalized),
  };
  await upsertRuleRow(row);
  return {
    id,
    text,
    metadata: normalized,
    distance: 0,
    score: scoreRule(0, normalized),
  };
}

export async function queryRules(
  queryText: string,
  options: RuleQueryOptions = {}
): Promise<RuleHit[]> {
  const config = getConfig();
  const topK = options.topK ?? DEFAULT_RULE_TOP_K;
  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const hasTable = await tableExists(config.ruleTable);
  if (!hasTable) {
    return [];
  }

  const vector = await embedText(queryText);
  const table = await openTable(config.ruleTable);
  const rows = await table
    .vectorSearch(vector)
    .limit(Math.max(candidateLimit, topK))
    .distanceType("cosine")
    .select(["id", "text", "metadata_json", "_distance"])
    .toArray();

  const hits = (rows as Record<string, unknown>[])
    .map(ruleHitFromRow)
    .filter((h) => matchesRuleFilters(h.metadata, options))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (options.recordHit) {
    await Promise.all(hits.map((hit) => recordRuleHit(hit.id)));
  }

  return hits;
}

export async function listRules(
  options: RuleListOptions = {}
): Promise<RuleHit[]> {
  const config = getConfig();
  const hasTable = await tableExists(config.ruleTable);
  if (!hasTable) {
    return [];
  }

  const table = await openTable(config.ruleTable);
  const rows = await table
    .query()
    .select(["id", "text", "metadata_json"])
    .toArray();

  const hits = (rows as Record<string, unknown>[])
    .map(ruleHitFromRow)
    .filter((h) => matchesRuleFilters(h.metadata, options))
    .sort((a, b) => {
      const updatedDiff =
        Date.parse(b.metadata.updatedAt) - Date.parse(a.metadata.updatedAt);
      return Number.isFinite(updatedDiff) && updatedDiff !== 0
        ? updatedDiff
        : b.score - a.score;
    });

  return typeof options.limit === "number" && options.limit > 0
    ? hits.slice(0, options.limit)
    : hits;
}

export async function recordRuleHit(id: string): Promise<RuleHit | null> {
  const row = await getRuleRow(id);
  if (!row) {
    return null;
  }
  const metadata = parseMetadataColumn(row.metadata_json) as RuleMetadata;
  const now = new Date().toISOString();
  const nextMetadata: RuleMetadata = {
    ...metadata,
    kind: "rule",
    hitCount: (metadata.hitCount ?? 0) + 1,
    lastHitAt: now,
    updatedAt: now,
  };
  await updateRuleMetadata(row.id, nextMetadata);
  return {
    id: row.id,
    text: row.text,
    metadata: nextMetadata,
    distance: 0,
    score: scoreRule(0, nextMetadata),
  };
}

export async function updateRuleStatus(
  id: string,
  status: RuleStatus
): Promise<RuleHit | null> {
  const row = await getRuleRow(id);
  if (!row) {
    return null;
  }
  const metadata = parseMetadataColumn(row.metadata_json) as RuleMetadata;
  const now = new Date().toISOString();
  const nextMetadata: RuleMetadata = {
    ...metadata,
    kind: "rule",
    status,
    updatedAt: now,
  };
  await updateRuleMetadata(row.id, nextMetadata);
  return {
    id: row.id,
    text: row.text,
    metadata: nextMetadata,
    distance: 0,
    score: scoreRule(0, nextMetadata),
  };
}

export type {
  RuleHit,
  RuleListOptions,
  RuleMetadata,
  RuleMetadataInput,
  RuleQueryOptions,
  RuleStatus,
} from "./types.js";
