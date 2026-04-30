import { upsertMemory } from "@elephance/core";
import {
  normalizeCandidate,
  resolveMemoryPolicy,
  shouldCommitCandidate,
} from "./policy.js";
import type {
  AgentMessage,
  CommitMemoryOptions,
  LlmMemoryExtractorOptions,
  MemoryCandidate,
  MemoryCommit,
  MemoryCommitResult,
  MemoryExtractor,
  MemoryExtractionInput,
} from "./types.js";

const DURABLE_HINTS = [
  "以后",
  "记住",
  "默认",
  "偏好",
  "喜欢",
  "不要",
  "always",
  "prefer",
  "remember",
  "by default",
  "规则",
  "约定",
  "样式",
  "风格",
  "convention",
  "style",
  "pattern",
];

function inferLabel(text: string): MemoryCandidate["label"] {
  const lower = text.toLowerCase();
  if (
    text.includes("偏好") ||
    text.includes("喜欢") ||
    lower.includes("prefer")
  ) {
    return "user_preference";
  }
  return "note";
}

function asConversationText(
  messages: AgentMessage[],
  response?: AgentMessage
): string {
  const all = response ? [...messages, response] : messages;
  return all
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n")
    .trim();
}

function extractionSystemPrompt(input: MemoryExtractionInput): string {
  const labels = input.policy.allowedLabels.join(", ");
  return [
    "You extract durable, reusable memory candidates from an AI conversation.",
    "Return only strict JSON with this shape:",
    '{"candidates":[{"text":"...","label":"...","confidence":0.0,"reason":"...","source":"user|assistant|conversation_summary","metadata":{}}]}',
    "Write short, self-contained memories. Prefer one idea per memory.",
    "Useful memories include user preferences, project conventions, UI preferences, coding style, architecture decisions, durable facts, and compact summaries.",
    "For iterative UI work, capture the final reusable design preference, not every intermediate failed attempt.",
    "Do not store secrets, tokens, passwords, private keys, sensitive personal data, one-off tasks, temporary status, unconfirmed guesses, full code, or full files.",
    `Allowed labels: ${labels}.`,
    `Only include candidates with confidence >= ${input.policy.minConfidence}.`,
    `Return at most ${input.policy.maxCandidatesPerTurn} candidates.`,
  ].join("\n");
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : trimmed;
}

function parseJsonObject(text: string): unknown {
  const raw = stripCodeFence(text);
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("LLM extractor returned invalid JSON.");
  }
}

function candidateFromUnknown(value: unknown): MemoryCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const confidence = Number(record.confidence);
  if (!text || !label || !Number.isFinite(confidence)) {
    return null;
  }
  return {
    text,
    label,
    confidence,
    reason: typeof record.reason === "string" ? record.reason : undefined,
    source: typeof record.source === "string" ? record.source : undefined,
    userId: typeof record.userId === "string" ? record.userId : undefined,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : undefined,
  };
}

export function parseMemoryCandidatesFromText(text: string): MemoryCandidate[] {
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  const rawCandidates = Array.isArray(record.candidates)
    ? record.candidates
    : [];
  return rawCandidates
    .map(candidateFromUnknown)
    .filter((candidate): candidate is MemoryCandidate => candidate !== null);
}

export function createLlmMemoryExtractor(
  options: LlmMemoryExtractorOptions
): MemoryExtractor {
  return {
    async extract(input) {
      const systemPrompt = options.systemPrompt ?? extractionSystemPrompt(input);
      const mode = options.mode ?? "mixed";
      const response = await options.llm.chat(
        [
          {
            role: "system",
            name: "elephance_memory_extractor",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              `Mode: ${mode}`,
              `User ID: ${input.userId ?? input.policy.userId ?? ""}`,
              "Conversation:",
              asConversationText(input.messages, input.response),
            ].join("\n\n"),
          },
        ],
        options.chatOptions
      );
      return parseMemoryCandidatesFromText(response.content)
        .map((candidate) => normalizeCandidate(candidate, input.policy))
        .filter((candidate) => shouldCommitCandidate(candidate, input.policy).ok)
        .slice(0, input.policy.maxCandidatesPerTurn);
    },
  };
}

export async function extractMemoryCandidates(
  input: MemoryExtractionInput
): Promise<MemoryCandidate[]> {
  const candidates: MemoryCandidate[] = [];
  for (const message of input.messages) {
    if (message.role !== "user") {
      continue;
    }
    const content = message.content.trim();
    if (!DURABLE_HINTS.some((hint) => content.toLowerCase().includes(hint))) {
      continue;
    }
    candidates.push({
      text: content,
      label: inferLabel(content),
      userId: input.userId ?? input.policy.userId,
      confidence: 0.74,
      reason: "User message contains durable-memory wording.",
      source: "user",
    });
  }
  return candidates.slice(0, input.policy.maxCandidatesPerTurn);
}

export async function commitMemoryCandidates(
  candidates: MemoryCandidate[],
  options: CommitMemoryOptions = {}
): Promise<MemoryCommitResult> {
  const policy = resolveMemoryPolicy(options.policy, options.userId);
  const writes: MemoryCommit[] = [];

  for (const original of candidates.slice(0, policy.maxCandidatesPerTurn)) {
    const candidate = normalizeCandidate(original, policy);
    const decision = shouldCommitCandidate(candidate, policy);
    if (!decision.ok) {
      writes.push({
        candidate,
        status: "skipped" as const,
        reason: decision.reason,
      });
      continue;
    }

    await upsertMemory(candidate.text, {
      ...(candidate.metadata ?? {}),
      ...(candidate.userId ? { userId: candidate.userId } : {}),
      label: candidate.label,
      source: candidate.source,
      confidence: candidate.confidence,
    });
    writes.push({ candidate, status: "written" as const });
  }

  return { writes };
}
