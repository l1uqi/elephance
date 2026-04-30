import {
  queryMemory,
  queryProjectSchema,
  type MemoryHit,
  type SchemaHit,
} from "@elephance/core";
import {
  resolveMemoryPolicy,
  resolveSchemaPolicy,
} from "./policy.js";
import type {
  AgentMessage,
  CoreQueryOptions,
  MemoryContextInput,
  MemoryContextResult,
} from "./types.js";

function latestUserText(messages: AgentMessage[] = []): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user" && message.content.trim().length > 0) {
      return message.content.trim();
    }
  }
  return messages
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function queryOptions(
  topK: number,
  minimal: boolean,
  maxTextChars: number
): CoreQueryOptions {
  return { topK, minimal, maxTextChars };
}

function formatMemoryHit(hit: MemoryHit): string {
  const label = String(hit.metadata.label ?? "memory");
  return `- [${label}] ${hit.text}`;
}

function formatSchemaHit(hit: SchemaHit): string {
  return `- source: ${hit.source}\n  content: ${hit.text}`;
}

export function formatElephanceContext(
  memoryHits: MemoryHit[],
  schemaHits: SchemaHit[]
): string {
  if (memoryHits.length === 0 && schemaHits.length === 0) {
    return "";
  }

  const sections: string[] = ["<elephance_context>"];
  if (memoryHits.length > 0) {
    sections.push("Relevant user memory:");
    sections.push(memoryHits.map(formatMemoryHit).join("\n"));
  }
  if (schemaHits.length > 0) {
    sections.push("Relevant project schema:");
    sections.push(schemaHits.map(formatSchemaHit).join("\n"));
  }
  sections.push("</elephance_context>");
  return sections.join("\n");
}

export async function createMemoryContext(
  input: MemoryContextInput
): Promise<MemoryContextResult> {
  const memoryPolicy = resolveMemoryPolicy(input.memory, input.userId);
  const schemaPolicy = resolveSchemaPolicy(input.schema);
  const query = (input.query ?? latestUserText(input.messages)).trim();

  if (query.length === 0) {
    return { contextText: "", memoryHits: [], schemaHits: [] };
  }

  const [memoryHits, schemaHits] = await Promise.all([
    memoryPolicy.autoRetrieve
      ? queryMemory(
          query,
          queryOptions(
            memoryPolicy.topK,
            memoryPolicy.minimal,
            memoryPolicy.maxTextChars
          )
        )
      : Promise.resolve([] as MemoryHit[]),
    schemaPolicy.autoRetrieve
      ? queryProjectSchema(
          query,
          queryOptions(
            schemaPolicy.topK,
            schemaPolicy.minimal,
            schemaPolicy.maxTextChars
          )
        )
      : Promise.resolve([] as SchemaHit[]),
  ]);

  return {
    contextText: formatElephanceContext(memoryHits, schemaHits),
    memoryHits,
    schemaHits,
  };
}
