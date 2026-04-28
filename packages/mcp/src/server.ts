#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  batchQueryProjectSchema,
  clearUserMemory,
  configure,
  deleteProjectSchemaBySource,
  queryMemory,
  queryProjectSchema,
  queryProjectSchemaByTableNames,
  replaceProjectSchemaForSource,
  upsertMemory,
  type BatchQueryOptions,
  type QueryOptions,
} from "elephance";

const DEFAULT_DB_PATH = process.env.ELEPHANCE_DB_PATH ?? ".lancedb";
const DEFAULT_MEMORY_TABLE = process.env.ELEPHANCE_MEMORY_TABLE ?? "memory";
const DEFAULT_SCHEMA_TABLE =
  process.env.ELEPHANCE_SCHEMA_TABLE ?? "project_schema";

configure({
  dbPath: DEFAULT_DB_PATH,
  memoryTable: DEFAULT_MEMORY_TABLE,
  schemaTable: DEFAULT_SCHEMA_TABLE,
});

const queryOptionsSchema = {
  topK: z.number().int().positive().optional(),
  minimal: z.boolean().optional(),
  maxTextChars: z.number().int().positive().optional(),
  candidateLimit: z.number().int().positive().optional(),
  maxChunksPerSource: z.number().int().positive().optional(),
};

function asTextJson(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function pickQueryOptions(args: QueryOptions): QueryOptions {
  return {
    topK: args.topK,
    minimal: args.minimal,
    maxTextChars: args.maxTextChars,
    candidateLimit: args.candidateLimit,
    maxChunksPerSource: args.maxChunksPerSource,
  };
}

const server = new McpServer({
  name: "elephance",
  version: "0.1.0",
});

server.tool(
  "memory_upsert",
  "Store a short, non-sensitive user memory. Do not store secrets, tokens, passwords, private keys, or sensitive personal data.",
  {
    text: z.string().min(1),
    userId: z.string().min(1).optional(),
    label: z.string().min(1).default("note"),
    metadata: z.record(z.unknown()).optional(),
  },
  async ({ text, userId, label, metadata }) => {
    await upsertMemory(text, {
      ...(metadata ?? {}),
      ...(userId ? { userId } : {}),
      label,
    });
    return asTextJson({ ok: true });
  }
);

server.tool(
  "memory_query",
  "Search stored user memories by semantic similarity.",
  {
    query: z.string().min(1),
    ...queryOptionsSchema,
  },
  async ({ query, ...options }) => {
    const hits = await queryMemory(query, pickQueryOptions(options));
    return asTextJson(hits);
  }
);

server.tool(
  "memory_clear_user",
  "Delete all stored memories for a user.",
  {
    userId: z.string().min(1),
  },
  async ({ userId }) => {
    await clearUserMemory(userId);
    return asTextJson({ ok: true });
  }
);

server.tool(
  "schema_replace_source",
  "Replace all schema chunks for one source path.",
  {
    sourceRelativePath: z.string().min(1),
    chunkTexts: z.array(z.string().min(1)).min(1),
    lastUpdatedIso: z.string().datetime().optional(),
  },
  async ({ sourceRelativePath, chunkTexts, lastUpdatedIso }) => {
    await replaceProjectSchemaForSource(
      sourceRelativePath,
      lastUpdatedIso ?? new Date().toISOString(),
      chunkTexts
    );
    return asTextJson({ ok: true });
  }
);

server.tool(
  "schema_delete_source",
  "Delete all schema chunks for one source path.",
  {
    sourceRelativePath: z.string().min(1),
  },
  async ({ sourceRelativePath }) => {
    await deleteProjectSchemaBySource(sourceRelativePath);
    return asTextJson({ ok: true });
  }
);

server.tool(
  "schema_query",
  "Search stored project schema chunks by semantic similarity.",
  {
    query: z.string().min(1),
    ...queryOptionsSchema,
  },
  async ({ query, ...options }) => {
    const hits = await queryProjectSchema(query, pickQueryOptions(options));
    return asTextJson(hits);
  }
);

server.tool(
  "schema_query_by_table_names",
  "Retrieve schema chunks by exact table names.",
  {
    tableNames: z.array(z.string().min(1)).min(1),
    ...queryOptionsSchema,
  },
  async ({ tableNames, ...options }) => {
    const hits = await queryProjectSchemaByTableNames(
      tableNames,
      pickQueryOptions(options)
    );
    return asTextJson(hits);
  }
);

server.tool(
  "schema_batch_query",
  "Search project schema with multiple keywords and merge duplicate sources.",
  {
    keywords: z.array(z.string().min(1)).min(1),
    mergedTopK: z.number().int().positive().optional(),
    ...queryOptionsSchema,
  },
  async ({ keywords, mergedTopK, ...options }) => {
    const queryOptions: BatchQueryOptions = {
      ...pickQueryOptions(options),
      mergedTopK,
    };
    const hits = await batchQueryProjectSchema(keywords, queryOptions);
    return asTextJson(hits);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
