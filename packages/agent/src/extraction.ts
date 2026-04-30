import { upsertMemory } from "@elephance/core";
import {
  normalizeCandidate,
  resolveMemoryPolicy,
  shouldCommitCandidate,
} from "./policy.js";
import type {
  CommitMemoryOptions,
  MemoryCandidate,
  MemoryCommit,
  MemoryCommitResult,
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
