import {
  queryMemory,
  queryProjectSchema,
  queryRules,
  type MemoryHit,
  type RuleHit,
  type SchemaHit,
} from "@elephance/core";
import {
  resolveMemoryPolicy,
  resolveRulePolicy,
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

function compactText(text: string, minimal: boolean, maxChars: number): string {
  const trimmed = text.trim();
  if (!minimal || trimmed.length <= maxChars) {
    return trimmed;
  }
  return trimmed.slice(0, maxChars).trimEnd();
}

function formatRuleHit(hit: RuleHit): string {
  const meta = hit.metadata;
  const parts = [
    `- [${meta.label}/${meta.scope}] ${hit.text}`,
    `  action: ${meta.action}`,
  ];
  if (meta.condition) {
    parts.push(`  condition: ${meta.condition}`);
  }
  if (meta.constraint) {
    parts.push(`  constraint: ${meta.constraint}`);
  }
  if (meta.exception) {
    parts.push(`  exception: ${meta.exception}`);
  }
  return parts.join("\n");
}

export function formatElephanceContext(
  memoryHits: MemoryHit[],
  schemaHits: SchemaHit[],
  ruleHits: RuleHit[] = []
): string {
  if (memoryHits.length === 0 && schemaHits.length === 0 && ruleHits.length === 0) {
    return "";
  }

  const sections: string[] = ["<elephance_context>"];
  if (ruleHits.length > 0) {
    sections.push("Relevant rules:");
    sections.push(ruleHits.map(formatRuleHit).join("\n"));
  }
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
  const rulePolicy = resolveRulePolicy(input.rules, {
    userId: input.userId,
    projectId: input.projectId,
    repoPath: input.repoPath,
    client: input.client,
  });
  const schemaPolicy = resolveSchemaPolicy(input.schema);
  const query = (input.query ?? latestUserText(input.messages)).trim();

  if (query.length === 0) {
    return { contextText: "", memoryHits: [], ruleHits: [], schemaHits: [] };
  }

  const [memoryHits, ruleHits, schemaHits] = await Promise.all([
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
    rulePolicy.autoRetrieve
      ? queryRules(query, {
          topK: rulePolicy.topK,
          minimal: rulePolicy.minimal,
          maxTextChars: rulePolicy.maxTextChars,
          userId: rulePolicy.userId,
          projectId: rulePolicy.projectId,
          repoPath: rulePolicy.repoPath,
          client: rulePolicy.client,
          recordHit: true,
        })
      : Promise.resolve([] as RuleHit[]),
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

  const compactRuleHits = ruleHits.map((hit) => ({
    ...hit,
    text: compactText(hit.text, rulePolicy.minimal, rulePolicy.maxTextChars),
  }));

  return {
    contextText: formatElephanceContext(memoryHits, schemaHits, compactRuleHits),
    memoryHits,
    ruleHits: compactRuleHits,
    schemaHits,
  };
}
