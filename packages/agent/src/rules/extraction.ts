import { queryRules, upsertRule, type RuleHit } from "@elephance/core";
import {
  normalizeRuleCandidate,
  resolveRulePolicy,
  shouldCommitRuleCandidate,
} from "../policy.js";
import type {
  AgentMessage,
  CommitRuleOptions,
  LlmRuleExtractorOptions,
  RuleCandidate,
  RuleCommit,
  RuleCommitDecision,
  RuleCommitResult,
  RuleExtractionInput,
  RuleExtractor,
} from "../types.js";

const RULE_HINTS = [
  "以后",
  "默认",
  "作为规则",
  "规则",
  "约定",
  "统一",
  "不要",
  "别",
  "应该",
  "改成",
  "repo 里",
  "这个项目",
  "always",
  "never",
  "by default",
  "rule",
  "convention",
  "should",
  "prefer",
];

const DEFAULT_SIMILARITY_ADD_THRESHOLD = 0.78;
const DEFAULT_SIMILARITY_MERGE_THRESHOLD = 0.9;

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

function inferRuleLabel(text: string): RuleCandidate["label"] {
  const lower = text.toLowerCase();
  if (
    text.includes("代码") ||
    text.includes("测试") ||
    lower.includes("code") ||
    lower.includes("test")
  ) {
    return "coding_style";
  }
  if (
    text.includes("UI") ||
    text.includes("界面") ||
    text.includes("按钮") ||
    lower.includes("ui") ||
    lower.includes("button")
  ) {
    return "ui_preference";
  }
  if (
    text.includes("项目") ||
    text.includes("repo") ||
    text.includes("约定") ||
    lower.includes("project") ||
    lower.includes("convention")
  ) {
    return "project_convention";
  }
  if (
    text.includes("回答") ||
    text.includes("你") ||
    lower.includes("reply") ||
    lower.includes("respond")
  ) {
    return "agent_behavior";
  }
  return "user_preference";
}

function inferRuleScope(
  text: string,
  input: RuleExtractionInput
): RuleCandidate["scope"] {
  const lower = text.toLowerCase();
  if (
    input.repoPath &&
    (text.includes("repo") || text.includes("仓库") || lower.includes("repo"))
  ) {
    return "repo";
  }
  if (
    input.projectId &&
    (text.includes("项目") || lower.includes("project") || text.includes("约定"))
  ) {
    return "project";
  }
  if (
    input.client &&
    (text.includes("Cursor") ||
      text.includes("Codex") ||
      lower.includes("client"))
  ) {
    return "client";
  }
  if (input.userId) {
    return "user";
  }
  return input.policy.defaultScope;
}

function parseRuleScope(value: unknown): RuleCandidate["scope"] {
  return value === "global" ||
    value === "user" ||
    value === "project" ||
    value === "client" ||
    value === "repo"
    ? value
    : undefined;
}

function normalizedWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1)
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const left = normalizedWords(a);
  const right = normalizedWords(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function includesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function appearsMutuallyExclusive(candidate: RuleCandidate, existing: RuleHit) {
  const candidateText = [
    candidate.text,
    candidate.action,
    candidate.constraint,
    candidate.exception,
  ]
    .filter(Boolean)
    .join("\n");
  const existingText = [
    existing.text,
    existing.metadata.action,
    existing.metadata.constraint,
    existing.metadata.exception,
  ]
    .filter(Boolean)
    .join("\n");

  const candidateNegated = includesAny(candidateText, [
    "不要",
    "不能",
    "禁止",
    "别",
    "never",
    "not ",
    "do not",
    "don't",
  ]);
  const existingNegated = includesAny(existingText, [
    "不要",
    "不能",
    "禁止",
    "别",
    "never",
    "not ",
    "do not",
    "don't",
  ]);
  if (candidateNegated !== existingNegated) {
    return true;
  }

  const languagePairs = [
    ["中文", "英文"],
    ["chinese", "english"],
  ];
  if (
    languagePairs.some(
      ([a, b]) =>
        (includesAny(candidateText, [a]) && includesAny(existingText, [b])) ||
        (includesAny(candidateText, [b]) && includesAny(existingText, [a]))
    )
  ) {
    return true;
  }

  return false;
}

function sameRuleShape(candidate: RuleCandidate, existing: RuleHit): boolean {
  if (candidate.label !== existing.metadata.label) {
    return false;
  }
  if ((candidate.scope ?? "project") !== existing.metadata.scope) {
    return false;
  }
  return (
    jaccardSimilarity(candidate.action, existing.metadata.action) >= 0.5 ||
    jaccardSimilarity(candidate.text, existing.text) >= 0.5
  );
}

function mergeUnique(
  left: string[] | undefined,
  right: string[] | undefined
): string[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);
  return merged.length > 0 ? [...new Set(merged)] : undefined;
}

async function findSimilarRules(
  candidate: RuleCandidate
): Promise<RuleHit[]> {
  return queryRules(candidate.text, {
    topK: 5,
    candidateLimit: 16,
    includeInactive: false,
    label: candidate.label,
    scope: candidate.scope,
    userId: candidate.userId,
    projectId: candidate.projectId,
    repoPath: candidate.repoPath,
    client: candidate.client,
  });
}

function judgeRuleCandidate(
  candidate: RuleCandidate,
  similarRules: RuleHit[],
  addThreshold: number,
  mergeThreshold: number
): RuleCommitDecision {
  const nearest = similarRules[0];
  if (!nearest) {
    return { kind: "add", reason: "no similar active rule found" };
  }

  const similarity = 1 - nearest.distance;
  if (similarity < addThreshold) {
    return {
      kind: "add",
      reason: "nearest rule is below add threshold",
      existingRuleId: nearest.id,
      similarity,
    };
  }

  if (appearsMutuallyExclusive(candidate, nearest)) {
    return {
      kind: "conflict",
      reason: "candidate appears mutually exclusive with an active rule",
      existingRuleId: nearest.id,
      similarity,
    };
  }

  if (similarity >= mergeThreshold || sameRuleShape(candidate, nearest)) {
    return {
      kind: "merge",
      reason: "candidate matches an existing active rule",
      existingRuleId: nearest.id,
      similarity,
    };
  }

  return {
    kind: "add",
    reason: "similar rule is related but not close enough to merge",
    existingRuleId: nearest.id,
    similarity,
  };
}

async function writeMergedRule(
  candidate: RuleCandidate,
  existing: RuleHit
): Promise<RuleHit> {
  const nextConfidence = Math.max(
    existing.metadata.confidence,
    candidate.confidence
  );
  const useCandidateText = candidate.confidence >= existing.metadata.confidence;
  return upsertRule(useCandidateText ? candidate.text : existing.text, {
    ...existing.metadata,
    ...(candidate.metadata ?? {}),
    id: existing.id,
    label: existing.metadata.label,
    scope: existing.metadata.scope,
    userId: existing.metadata.userId ?? candidate.userId,
    projectId: existing.metadata.projectId ?? candidate.projectId,
    repoPath: existing.metadata.repoPath ?? candidate.repoPath,
    client: existing.metadata.client ?? candidate.client,
    action: useCandidateText ? candidate.action : existing.metadata.action,
    condition: candidate.condition ?? existing.metadata.condition,
    constraint: candidate.constraint ?? existing.metadata.constraint,
    exception: candidate.exception ?? existing.metadata.exception,
    confidence: nextConfidence,
    version: existing.metadata.version + 1,
    status: "active",
    source: existing.metadata.source,
    evidenceIds: mergeUnique(existing.metadata.evidenceIds, candidate.evidenceIds),
    examples: mergeUnique(existing.metadata.examples, candidate.examples),
  });
}

async function writeConflictedRules(
  candidate: RuleCandidate,
  existing: RuleHit
): Promise<RuleHit> {
  const newRule = await upsertRule(candidate.text, {
    ...(candidate.metadata ?? {}),
    label: candidate.label,
    scope: candidate.scope ?? existing.metadata.scope,
    userId: candidate.userId,
    projectId: candidate.projectId,
    repoPath: candidate.repoPath,
    client: candidate.client,
    action: candidate.action,
    condition: candidate.condition,
    constraint: candidate.constraint,
    exception: candidate.exception,
    confidence: candidate.confidence,
    status: "conflicted",
    source:
      candidate.source === "manual" ||
      candidate.source === "user_correction" ||
      candidate.source === "repeated_pattern" ||
      candidate.source === "conversation_summary" ||
      candidate.source === "reflection"
        ? candidate.source
        : "user_correction",
    evidenceIds: candidate.evidenceIds,
    examples: candidate.examples,
    conflictWith: [existing.id],
  });

  await upsertRule(existing.text, {
    ...existing.metadata,
    id: existing.id,
    label: existing.metadata.label,
    scope: existing.metadata.scope,
    action: existing.metadata.action,
    status: "conflicted",
    version: existing.metadata.version + 1,
    conflictWith: mergeUnique(existing.metadata.conflictWith, [newRule.id]),
  });

  return newRule;
}

function extractionSystemPrompt(input: RuleExtractionInput): string {
  const labels = input.policy.allowedLabels.join(", ");
  return [
    "You extract durable rule candidates from an AI conversation.",
    "Return only strict JSON with this shape:",
    '{"candidates":[{"text":"When ...","label":"...","scope":"global|user|project|client|repo","action":"...","condition":"...","constraint":"...","exception":"...","confidence":0.0,"reason":"...","source":"manual|user_correction|repeated_pattern|conversation_summary|reflection","examples":["..."],"metadata":{}}]}',
    "Rules should capture reusable instructions, user corrections, project conventions, coding style, UI preferences, and agent behavior constraints.",
    "Prefer short, self-contained rule text. Use one rule per idea.",
    "Do not extract one-off tasks, temporary status, unconfirmed guesses, secrets, tokens, passwords, private keys, sensitive personal data, full code, or full files.",
    `Allowed labels: ${labels}.`,
    `Default scope: ${input.policy.defaultScope}.`,
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
    throw new Error("LLM rule extractor returned invalid JSON.");
  }
}

function candidateFromUnknown(value: unknown): RuleCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const action = typeof record.action === "string" ? record.action.trim() : "";
  const confidence = Number(record.confidence);
  if (!text || !label || !action || !Number.isFinite(confidence)) {
    return null;
  }
  const examples = Array.isArray(record.examples)
    ? record.examples.filter((example): example is string => typeof example === "string")
    : undefined;
  const evidenceIds = Array.isArray(record.evidenceIds)
    ? record.evidenceIds.filter((id): id is string => typeof id === "string")
    : undefined;
  return {
    text,
    label,
    action,
    confidence,
    scope: parseRuleScope(record.scope),
    condition:
      typeof record.condition === "string" ? record.condition : undefined,
    constraint:
      typeof record.constraint === "string" ? record.constraint : undefined,
    exception:
      typeof record.exception === "string" ? record.exception : undefined,
    reason: typeof record.reason === "string" ? record.reason : undefined,
    source: typeof record.source === "string" ? record.source : undefined,
    userId: typeof record.userId === "string" ? record.userId : undefined,
    projectId:
      typeof record.projectId === "string" ? record.projectId : undefined,
    repoPath: typeof record.repoPath === "string" ? record.repoPath : undefined,
    client: typeof record.client === "string" ? record.client : undefined,
    examples,
    evidenceIds,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : undefined,
  };
}

export function parseRuleCandidatesFromText(text: string): RuleCandidate[] {
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
    .filter((candidate): candidate is RuleCandidate => candidate !== null);
}

export function createLlmRuleExtractor(
  options: LlmRuleExtractorOptions
): RuleExtractor {
  return {
    async extract(input) {
      const systemPrompt = options.systemPrompt ?? extractionSystemPrompt(input);
      const mode = options.mode ?? "mixed";
      const response = await options.llm.chat(
        [
          {
            role: "system",
            name: "elephance_rule_extractor",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              `Mode: ${mode}`,
              `User ID: ${input.userId ?? input.policy.userId ?? ""}`,
              `Project ID: ${input.projectId ?? input.policy.projectId ?? ""}`,
              `Repo Path: ${input.repoPath ?? input.policy.repoPath ?? ""}`,
              `Client: ${input.client ?? input.policy.client ?? ""}`,
              "Conversation:",
              asConversationText(input.messages, input.response),
            ].join("\n\n"),
          },
        ],
        options.chatOptions
      );
      return parseRuleCandidatesFromText(response.content)
        .map((candidate) => normalizeRuleCandidate(candidate, input.policy))
        .filter(
          (candidate) => shouldCommitRuleCandidate(candidate, input.policy).ok
        )
        .slice(0, input.policy.maxCandidatesPerTurn);
    },
  };
}

export async function extractRuleCandidates(
  input: RuleExtractionInput
): Promise<RuleCandidate[]> {
  const candidates: RuleCandidate[] = [];
  for (const message of input.messages) {
    if (message.role !== "user") {
      continue;
    }
    const content = message.content.trim();
    const lower = content.toLowerCase();
    if (!RULE_HINTS.some((hint) => lower.includes(hint))) {
      continue;
    }
    candidates.push(
      normalizeRuleCandidate(
        {
          text: content,
          label: inferRuleLabel(content),
          scope: inferRuleScope(content, input),
          action: content,
          confidence: 0.8,
          reason: "User message contains durable rule wording.",
          source: "user_correction",
        },
        input.policy
      )
    );
  }
  return candidates.slice(0, input.policy.maxCandidatesPerTurn);
}

export async function commitRuleCandidates(
  candidates: RuleCandidate[],
  options: CommitRuleOptions = {}
): Promise<RuleCommitResult> {
  const policy = resolveRulePolicy(options.policy, {
    userId: options.userId,
    projectId: options.projectId,
    repoPath: options.repoPath,
    client: options.client,
  });
  const writes: RuleCommit[] = [];
  const addThreshold =
    options.similarityAddThreshold ?? DEFAULT_SIMILARITY_ADD_THRESHOLD;
  const mergeThreshold =
    options.similarityMergeThreshold ?? DEFAULT_SIMILARITY_MERGE_THRESHOLD;

  for (const original of candidates.slice(0, policy.maxCandidatesPerTurn)) {
    const candidate = normalizeRuleCandidate(original, policy);
    const policyDecision = shouldCommitRuleCandidate(candidate, policy);
    const similarRules = policyDecision.ok ? await findSimilarRules(candidate) : [];
    const judgeDecision = policyDecision.ok
      ? judgeRuleCandidate(candidate, similarRules, addThreshold, mergeThreshold)
      : ({
          kind: "skip",
          reason: policyDecision.reason,
        } satisfies RuleCommitDecision);
    if (options.dryRun || policy.autoWrite === "dry-run") {
      writes.push({
        candidate,
        status: "skipped",
        reason: policyDecision.ok ? "dry run" : policyDecision.reason,
        decision: judgeDecision,
      });
      continue;
    }
    if (!policyDecision.ok) {
      writes.push({
        candidate,
        status: "skipped",
        reason: policyDecision.reason,
        decision: judgeDecision,
      });
      continue;
    }

    if (judgeDecision.kind === "merge" && judgeDecision.existingRuleId) {
      const existing = similarRules.find(
        (rule) => rule.id === judgeDecision.existingRuleId
      );
      if (existing) {
        const rule = await writeMergedRule(candidate, existing);
        writes.push({
          candidate,
          status: "written",
          ruleId: rule.id,
          decision: judgeDecision,
        });
        continue;
      }
    }

    if (judgeDecision.kind === "conflict" && judgeDecision.existingRuleId) {
      const existing = similarRules.find(
        (rule) => rule.id === judgeDecision.existingRuleId
      );
      if (existing) {
        const rule = await writeConflictedRules(candidate, existing);
        writes.push({
          candidate,
          status: "written",
          ruleId: rule.id,
          decision: judgeDecision,
        });
        continue;
      }
    }

    const rule = await upsertRule(candidate.text, {
      ...(candidate.metadata ?? {}),
      label: candidate.label,
      scope: candidate.scope ?? policy.defaultScope,
      userId: candidate.userId,
      projectId: candidate.projectId,
      repoPath: candidate.repoPath,
      client: candidate.client,
      action: candidate.action,
      condition: candidate.condition,
      constraint: candidate.constraint,
      exception: candidate.exception,
      confidence: candidate.confidence,
      source:
        candidate.source === "manual" ||
        candidate.source === "user_correction" ||
        candidate.source === "repeated_pattern" ||
        candidate.source === "conversation_summary" ||
        candidate.source === "reflection"
          ? candidate.source
          : "user_correction",
      evidenceIds: candidate.evidenceIds,
      examples: candidate.examples,
    });
    writes.push({
      candidate,
      status: "written",
      ruleId: rule.id,
      decision: judgeDecision,
    });
  }

  return { writes };
}
