import {
  listRules,
  updateRuleStatus,
  type RuleHit,
  type RuleListOptions,
} from "@elephance/core";
import type {
  RuleReflectionSuggestion,
  SelfReflectRulesOptions,
  SelfReflectRulesResult,
} from "../types.js";

const DEFAULT_SAMPLE_SIZE = 50;
const DEFAULT_STALE_DAYS = 180;
const DEFAULT_LOW_CONFIDENCE = 0.55;

function sameScope(a: RuleHit, b: RuleHit): boolean {
  return (
    a.metadata.label === b.metadata.label &&
    a.metadata.scope === b.metadata.scope &&
    (a.metadata.userId ?? "") === (b.metadata.userId ?? "") &&
    (a.metadata.projectId ?? "") === (b.metadata.projectId ?? "") &&
    (a.metadata.repoPath ?? "") === (b.metadata.repoPath ?? "") &&
    (a.metadata.client ?? "") === (b.metadata.client ?? "")
  );
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

function appearsMutuallyExclusive(a: RuleHit, b: RuleHit): boolean {
  const left = [a.text, a.metadata.action, a.metadata.constraint]
    .filter(Boolean)
    .join("\n");
  const right = [b.text, b.metadata.action, b.metadata.constraint]
    .filter(Boolean)
    .join("\n");
  const negationTerms = [
    "不要",
    "不能",
    "禁止",
    "别",
    "never",
    "not ",
    "do not",
    "don't",
  ];
  const leftNegated = includesAny(left, negationTerms);
  const rightNegated = includesAny(right, negationTerms);
  if (leftNegated !== rightNegated) {
    return true;
  }
  return [
    ["中文", "英文"],
    ["chinese", "english"],
  ].some(
    ([x, y]) =>
      (includesAny(left, [x]) && includesAny(right, [y])) ||
      (includesAny(left, [y]) && includesAny(right, [x]))
  );
}

function textSimilarity(a: RuleHit, b: RuleHit): number {
  return Math.max(
    jaccardSimilarity(a.text, b.text),
    jaccardSimilarity(a.metadata.action, b.metadata.action)
  );
}

function pickKeeper(rules: RuleHit[]): RuleHit {
  return [...rules].sort((a, b) => {
    const confidenceDiff = b.metadata.confidence - a.metadata.confidence;
    if (confidenceDiff !== 0) {
      return confidenceDiff;
    }
    return b.metadata.hitCount - a.metadata.hitCount;
  })[0]!;
}

function clarityScore(rule: RuleHit): number {
  let score = 1;
  if (rule.text.length < 18 || rule.metadata.action.length < 10) {
    score -= 0.25;
  }
  if (includesAny(rule.text, ["thing", "stuff", "it", "这个", "那个", "这样"])) {
    score -= 0.2;
  }
  if (!rule.metadata.condition && !rule.metadata.constraint) {
    score -= 0.1;
  }
  return Math.max(0, Number(score.toFixed(2)));
}

function daysSince(iso: string | undefined, now: number): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }
  return (now - parsed) / 86_400_000;
}

function listOptions(options: SelfReflectRulesOptions): RuleListOptions {
  return {
    label: options.label,
    scope: options.scope,
    userId: options.userId,
    projectId: options.projectId,
    repoPath: options.repoPath,
    client: options.client,
    includeInactive: options.includeDeprecated ?? false,
    limit: options.sampleSize ?? DEFAULT_SAMPLE_SIZE,
  };
}

function buildSuggestions(
  rules: RuleHit[],
  options: SelfReflectRulesOptions
): RuleReflectionSuggestion[] {
  const suggestions: RuleReflectionSuggestion[] = [];
  const seenPairs = new Set<string>();
  const now = Date.now();
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const lowConfidence =
    options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;

  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const left = rules[i]!;
      const right = rules[j]!;
      if (!sameScope(left, right)) {
        continue;
      }
      const pairKey = [left.id, right.id].sort().join(":");
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);

      const similarity = textSimilarity(left, right);
      if (similarity >= 0.5 && appearsMutuallyExclusive(left, right)) {
        suggestions.push({
          kind: "conflict_resolution",
          ruleIds: [left.id, right.id],
          action: "mark_conflicted",
          reason: "Rules share scope and appear mutually exclusive.",
          confidence: Math.max(0.7, similarity),
          status: "conflicted",
        });
        continue;
      }
      if (similarity >= 0.5) {
        const keeper = pickKeeper([left, right]);
        suggestions.push({
          kind: "consolidation",
          ruleIds: [left.id, right.id],
          action: "merge",
          reason: "Rules are highly similar in the same scope.",
          confidence: similarity,
          keepRuleId: keeper.id,
          status: "deprecated",
        });
      }
    }
  }

  for (const rule of rules) {
    const clarity = clarityScore(rule);
    if (clarity < 0.75 && rule.metadata.status === "active") {
      suggestions.push({
        kind: "clarification",
        ruleIds: [rule.id],
        action: "add_examples",
        reason: "Rule is terse or ambiguous and would benefit from examples.",
        confidence: 1 - clarity,
        examples: [`Example scenario for: ${rule.text}`],
      });
    }

    const age = daysSince(rule.metadata.lastHitAt ?? rule.metadata.createdAt, now);
    if (
      rule.metadata.status === "active" &&
      (rule.metadata.confidence < lowConfidence ||
        (rule.metadata.hitCount === 0 && age >= staleDays))
    ) {
      suggestions.push({
        kind: "pruning",
        ruleIds: [rule.id],
        action: "deprecate",
        reason: "Rule has low confidence or has not been hit for a long time.",
        confidence: 0.8,
        status: "deprecated",
      });
    }

    if (rule.metadata.status === "deprecated" && age >= staleDays) {
      suggestions.push({
        kind: "pruning",
        ruleIds: [rule.id],
        action: "archive",
        reason: "Deprecated rule has remained stale long enough to archive.",
        confidence: 0.8,
        status: "archived",
      });
    }
  }

  return suggestions;
}

async function applySuggestion(
  suggestion: RuleReflectionSuggestion
): Promise<void> {
  if (suggestion.action === "merge" && suggestion.keepRuleId) {
    await Promise.all(
      suggestion.ruleIds
        .filter((id) => id !== suggestion.keepRuleId)
        .map((id) => updateRuleStatus(id, "deprecated"))
    );
    return;
  }

  if (suggestion.status) {
    await Promise.all(
      suggestion.ruleIds.map((id) => updateRuleStatus(id, suggestion.status!))
    );
  }
}

export async function selfReflectRules(
  options: SelfReflectRulesOptions = {}
): Promise<SelfReflectRulesResult> {
  const dryRun = options.dryRun ?? true;
  const rules = await listRules(listOptions(options));
  const suggestions = buildSuggestions(rules, options);
  const applied: RuleReflectionSuggestion[] = [];

  if (!dryRun) {
    for (const suggestion of suggestions) {
      if (suggestion.action === "add_examples") {
        continue;
      }
      await applySuggestion(suggestion);
      applied.push(suggestion);
    }
  }

  return {
    dryRun,
    scanned: rules.length,
    suggestions,
    applied,
    rules,
  };
}
