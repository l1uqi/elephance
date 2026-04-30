import type {
  MemoryCandidate,
  MemoryPolicy,
  RequiredRulePolicy,
  RequiredMemoryPolicy,
  RequiredSchemaPolicy,
  RuleCandidate,
  RulePolicy,
  SchemaPolicy,
} from "./types.js";

export const DEFAULT_ALLOWED_LABELS = [
  "user_preference",
  "project_convention",
  "ui_preference",
  "coding_style",
  "architecture_decision",
  "fact",
  "summary",
  "note",
];

export const DEFAULT_ALLOWED_RULE_LABELS = [
  "user_preference",
  "project_convention",
  "ui_preference",
  "coding_style",
  "agent_behavior",
];

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|token|password|passwd|secret)\s*[:=]\s*\S+/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/,
];

export function resolveMemoryPolicy(
  policy: MemoryPolicy = {},
  userId?: string
): RequiredMemoryPolicy {
  return {
    autoRetrieve: policy.autoRetrieve ?? true,
    autoExtract: policy.autoExtract ?? policy.autoWrite !== false,
    autoWrite: policy.autoWrite ?? false,
    topK: policy.topK ?? 5,
    minimal: policy.minimal ?? true,
    allowedLabels: policy.allowedLabels ?? DEFAULT_ALLOWED_LABELS,
    deniedLabels: policy.deniedLabels ?? [],
    minConfidence: policy.minConfidence ?? 0.72,
    maxCandidatesPerTurn: policy.maxCandidatesPerTurn ?? 5,
    maxTextChars: policy.maxTextChars ?? 420,
    userId: policy.userId ?? userId,
  };
}

export function resolveSchemaPolicy(
  policy: SchemaPolicy = {}
): RequiredSchemaPolicy {
  return {
    autoRetrieve: policy.autoRetrieve ?? false,
    topK: policy.topK ?? 4,
    minimal: policy.minimal ?? true,
    maxTextChars: policy.maxTextChars ?? 700,
  };
}

export function resolveRulePolicy(
  policy: RulePolicy = {},
  defaults: {
    userId?: string;
    projectId?: string;
    repoPath?: string;
    client?: string;
  } = {}
): RequiredRulePolicy {
  return {
    autoRetrieve: policy.autoRetrieve ?? true,
    autoExtract: policy.autoExtract ?? policy.autoWrite !== false,
    autoWrite: policy.autoWrite ?? false,
    extractor: policy.extractor ?? "heuristic",
    extractorSystemPrompt: policy.extractorSystemPrompt,
    topK: policy.topK ?? 5,
    minimal: policy.minimal ?? true,
    maxTextChars: policy.maxTextChars ?? 420,
    allowedLabels: policy.allowedLabels ?? DEFAULT_ALLOWED_RULE_LABELS,
    deniedLabels: policy.deniedLabels ?? [],
    minConfidence: policy.minConfidence ?? 0.78,
    maxCandidatesPerTurn: policy.maxCandidatesPerTurn ?? 5,
    defaultScope: policy.defaultScope ?? "project",
    userId: policy.userId ?? defaults.userId,
    projectId: policy.projectId ?? defaults.projectId,
    repoPath: policy.repoPath ?? defaults.repoPath,
    client: policy.client ?? defaults.client,
  };
}

export function looksSensitive(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeCandidate(
  candidate: MemoryCandidate,
  policy: RequiredMemoryPolicy
): MemoryCandidate {
  return {
    ...candidate,
    text: candidate.text.trim(),
    label: candidate.label.trim(),
    userId: candidate.userId ?? policy.userId,
    confidence: Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : 0,
  };
}

export function normalizeRuleCandidate(
  candidate: RuleCandidate,
  policy: RequiredRulePolicy
): RuleCandidate {
  return {
    ...candidate,
    text: candidate.text.trim(),
    label: candidate.label.trim(),
    scope: candidate.scope ?? policy.defaultScope,
    userId: candidate.userId ?? policy.userId,
    projectId: candidate.projectId ?? policy.projectId,
    repoPath: candidate.repoPath ?? policy.repoPath,
    client: candidate.client ?? policy.client,
    action: candidate.action.trim(),
    condition: candidate.condition?.trim(),
    constraint: candidate.constraint?.trim(),
    exception: candidate.exception?.trim(),
    confidence: Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : 0,
  };
}

export function shouldCommitCandidate(
  candidate: MemoryCandidate,
  policy: RequiredMemoryPolicy
): { ok: true } | { ok: false; reason: string } {
  if (candidate.text.trim().length === 0) {
    return { ok: false, reason: "empty memory text" };
  }
  if (candidate.text.length > 1000) {
    return { ok: false, reason: "memory text is too long" };
  }
  if (looksSensitive(candidate.text)) {
    return { ok: false, reason: "memory text appears sensitive" };
  }
  if (candidate.confidence < policy.minConfidence) {
    return { ok: false, reason: "confidence below threshold" };
  }
  if (policy.deniedLabels.includes(candidate.label)) {
    return { ok: false, reason: "label is denied" };
  }
  if (
    policy.allowedLabels.length > 0 &&
    !policy.allowedLabels.includes(candidate.label)
  ) {
    return { ok: false, reason: "label is not allowed" };
  }
  return { ok: true };
}

export function shouldCommitRuleCandidate(
  candidate: RuleCandidate,
  policy: RequiredRulePolicy
): { ok: true } | { ok: false; reason: string } {
  if (candidate.text.trim().length === 0) {
    return { ok: false, reason: "empty rule text" };
  }
  if (candidate.action.trim().length === 0) {
    return { ok: false, reason: "empty rule action" };
  }
  if (candidate.text.length > 1000) {
    return { ok: false, reason: "rule text is too long" };
  }
  if (looksSensitive(candidate.text) || looksSensitive(candidate.action)) {
    return { ok: false, reason: "rule appears sensitive" };
  }
  if (candidate.confidence < policy.minConfidence) {
    return { ok: false, reason: "confidence below threshold" };
  }
  if (policy.deniedLabels.includes(candidate.label)) {
    return { ok: false, reason: "label is denied" };
  }
  if (
    policy.allowedLabels.length > 0 &&
    !policy.allowedLabels.includes(candidate.label)
  ) {
    return { ok: false, reason: "label is not allowed" };
  }
  return { ok: true };
}
