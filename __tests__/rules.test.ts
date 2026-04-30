import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  configure,
  listRules,
  proposeRulePromotion,
  queryRules,
  recordRuleHit,
  recordRuleObservation,
  resetConnection,
  setEmbeddingProvider,
  updateRuleStatus,
  upsertRule,
} from "@elephance/core";
import {
  commitRuleCandidates,
  createElephanceAgent,
  createMemoryContext,
  resolveRulePolicy,
  selfReflectRules,
} from "../packages/agent/src/index.js";

const TEST_DB_DIR = ".lancedb-rules-test";

class KeywordEmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const lower = text.toLowerCase();
    return [
      lower.includes("button") || lower.includes("按钮") ? 1 : 0,
      lower.includes("中文") ||
      lower.includes("英文") ||
      lower.includes("chinese") ||
      lower.includes("english")
        ? 1
        : 0,
      lower.includes("test") || lower.includes("testing") ? 1 : 0,
    ];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

describe("Rule Memory Module", () => {
  beforeEach(() => {
    configure({ dbPath: TEST_DB_DIR });
    setEmbeddingProvider(new KeywordEmbeddingProvider());
  });

  afterEach(async () => {
    resetConnection();
    await fs.rm(path.resolve(process.cwd(), TEST_DB_DIR), {
      recursive: true,
      force: true,
    });
  });

  it("stores and queries active rules", async () => {
    await upsertRule("Button border radius should not exceed 8px.", {
      label: "ui_preference",
      scope: "project",
      projectId: "elephance",
      action: "Keep button border radius at or below 8px.",
      confidence: 0.92,
      source: "manual",
    });

    const hits = await queryRules("button radius", {
      projectId: "elephance",
      topK: 1,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.metadata.kind).toBe("rule");
    expect(hits[0]?.metadata.status).toBe("active");
    expect(hits[0]?.metadata.label).toBe("ui_preference");
  });

  it("filters inactive rules unless requested", async () => {
    const rule = await upsertRule("Respond in Chinese by default.", {
      label: "agent_behavior",
      scope: "user",
      userId: "u1",
      action: "Use Chinese for replies.",
      status: "candidate",
    });

    expect(await queryRules("Chinese replies", { userId: "u1" })).toHaveLength(
      0
    );

    const hits = await queryRules("Chinese replies", {
      userId: "u1",
      includeInactive: true,
    });
    expect(hits[0]?.id).toBe(rule.id);
  });

  it("records rule hits and updates status without deleting the rule", async () => {
    const rule = await upsertRule("Use existing testing patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow nearby test style.",
    });

    const hit = await recordRuleHit(rule.id);
    expect(hit?.metadata.hitCount).toBe(1);
    expect(hit?.metadata.lastHitAt).toBeDefined();

    const archived = await updateRuleStatus(rule.id, "archived");
    expect(archived?.metadata.status).toBe("archived");

    const activeHits = await queryRules("testing patterns", { repoPath: "/repo" });
    expect(activeHits).toHaveLength(0);

    const allHits = await queryRules("testing patterns", {
      repoPath: "/repo",
      includeInactive: true,
    });
    expect(allHits[0]?.id).toBe(rule.id);
  });

  it("records rule observations and proposes promotion only after evidence gates pass", async () => {
    const rule = await upsertRule("Use existing testing patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow nearby test style.",
      privacyLevel: "team",
    });

    const firstProposal = await proposeRulePromotion(rule.id, {
      minEvidence: 2,
      minSuccesses: 2,
    });
    expect(firstProposal?.ok).toBe(false);
    expect(firstProposal?.reason).toContain("evidence");

    const observed = await recordRuleObservation(rule.id, {
      outcome: "success",
      task: "add cli test",
      evidenceId: "task-1",
      client: "codex",
    });
    expect(observed?.metadata.successCount).toBe(1);
    expect(observed?.metadata.failureCount ?? 0).toBe(0);
    expect(observed?.metadata.evidenceIds).toContain("task-1");
    expect(observed?.metadata.observations?.[0]?.outcome).toBe("success");

    await recordRuleObservation(rule.id, {
      outcome: "success",
      task: "extend rule test",
      evidenceId: "task-2",
    });

    const dryRun = await proposeRulePromotion(rule.id, {
      minEvidence: 2,
      minSuccesses: 2,
      dryRun: true,
      sharedRepository: "team-rules",
    });
    expect(dryRun?.ok).toBe(true);
    expect(dryRun?.proposal.evidenceCount).toBe(2);
    expect(dryRun?.rule.metadata.promotionStatus).toBeUndefined();

    const proposal = await proposeRulePromotion(rule.id, {
      minEvidence: 2,
      minSuccesses: 2,
      sharedRepository: "team-rules",
    });
    expect(proposal?.ok).toBe(true);
    expect(proposal?.rule.metadata.promotionStatus).toBe("proposed");
    expect(proposal?.rule.metadata.origin).toBe("local");
    expect(proposal?.rule.metadata.privacyLevel).toBe("team");
    expect(proposal?.rule.metadata.sharedRepository).toBe("team-rules");
  });

  it("merges highly similar rule candidates into an existing rule", async () => {
    const existing = await upsertRule("Use existing testing patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow existing testing patterns.",
      confidence: 0.8,
      examples: ["First example"],
    });
    const policy = resolveRulePolicy(
      { autoWrite: "always", defaultScope: "repo" },
      { repoPath: "/repo" }
    );

    const result = await commitRuleCandidates(
      [
        {
          text: "Use existing test patterns.",
          label: "coding_style",
          scope: "repo",
          repoPath: "/repo",
          action: "Follow existing test patterns.",
          confidence: 0.9,
          examples: ["Second example"],
        },
      ],
      { policy }
    );

    expect(result.writes[0]?.decision?.kind).toBe("merge");
    expect(result.writes[0]?.ruleId).toBe(existing.id);

    const hits = await queryRules("testing patterns", {
      repoPath: "/repo",
      includeInactive: true,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.metadata.version).toBe(2);
    expect(hits[0]?.metadata.examples).toEqual([
      "First example",
      "Second example",
    ]);
  });

  it("marks mutually exclusive similar rules as conflicted", async () => {
    const existing = await upsertRule("Respond in Chinese by default.", {
      label: "agent_behavior",
      scope: "user",
      userId: "u1",
      action: "Use Chinese by default.",
      confidence: 0.9,
    });
    const policy = resolveRulePolicy(
      { autoWrite: "always", defaultScope: "user" },
      { userId: "u1" }
    );

    const result = await commitRuleCandidates(
      [
        {
          text: "Respond in English by default.",
          label: "agent_behavior",
          scope: "user",
          userId: "u1",
          action: "Use English by default.",
          confidence: 0.9,
        },
      ],
      { policy }
    );

    expect(result.writes[0]?.decision?.kind).toBe("conflict");
    expect(result.writes[0]?.ruleId).not.toBe(existing.id);

    const hits = await queryRules("Chinese English replies", {
      userId: "u1",
      includeInactive: true,
      topK: 2,
    });
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.metadata.status).sort()).toEqual([
      "conflicted",
      "conflicted",
    ]);
    expect(
      hits.find((hit) => hit.id === existing.id)?.metadata.conflictWith
    ).toContain(result.writes[0]?.ruleId);
  });

  it("returns judge decisions during dry-run without writing", async () => {
    await upsertRule("Use existing testing patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow existing testing patterns.",
    });
    const policy = resolveRulePolicy(
      { autoWrite: "dry-run", defaultScope: "repo" },
      { repoPath: "/repo" }
    );

    const result = await commitRuleCandidates(
      [
        {
          text: "Use existing test patterns.",
          label: "coding_style",
          scope: "repo",
          repoPath: "/repo",
          action: "Follow existing test patterns.",
          confidence: 0.9,
        },
      ],
      { policy, dryRun: true }
    );

    expect(result.writes[0]?.status).toBe("skipped");
    expect(result.writes[0]?.reason).toBe("dry run");
    expect(result.writes[0]?.decision?.kind).toBe("merge");

    const hits = await queryRules("testing patterns", {
      repoPath: "/repo",
      includeInactive: true,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.metadata.version).toBe(1);
  });

  it("lists rules for reflection without semantic search", async () => {
    await upsertRule("Button radius should stay under 8px.", {
      label: "ui_preference",
      scope: "project",
      projectId: "elephance",
      action: "Keep button radius under 8px.",
    });

    const rules = await listRules({
      projectId: "elephance",
      label: "ui_preference",
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]?.metadata.label).toBe("ui_preference");
  });

  it("suggests rule reflection actions in dry-run mode", async () => {
    await upsertRule("Use existing testing patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow existing testing patterns.",
      confidence: 0.9,
    });
    await upsertRule("Use existing test patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow existing test patterns.",
      confidence: 0.8,
    });
    await upsertRule("Respond in Chinese by default.", {
      label: "agent_behavior",
      scope: "user",
      userId: "u1",
      action: "Use Chinese by default.",
    });
    await upsertRule("Respond in English by default.", {
      label: "agent_behavior",
      scope: "user",
      userId: "u1",
      action: "Use English by default.",
    });

    const result = await selfReflectRules({
      dryRun: true,
      includeDeprecated: true,
      sampleSize: 10,
    });

    expect(result.dryRun).toBe(true);
    expect(result.scanned).toBe(4);
    expect(result.applied).toHaveLength(0);
    expect(
      result.suggestions.some((s) => s.kind === "consolidation")
    ).toBe(true);
    expect(
      result.suggestions.some((s) => s.kind === "conflict_resolution")
    ).toBe(true);
  });

  it("applies safe reflection status changes when dryRun is false", async () => {
    const keep = await upsertRule("Use existing testing patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow existing testing patterns.",
      confidence: 0.9,
    });
    const duplicate = await upsertRule("Use existing test patterns.", {
      label: "coding_style",
      scope: "repo",
      repoPath: "/repo",
      action: "Follow existing test patterns.",
      confidence: 0.8,
    });
    const chinese = await upsertRule("Respond in Chinese by default.", {
      label: "agent_behavior",
      scope: "user",
      userId: "u1",
      action: "Use Chinese by default.",
    });
    const english = await upsertRule("Respond in English by default.", {
      label: "agent_behavior",
      scope: "user",
      userId: "u1",
      action: "Use English by default.",
    });

    const result = await selfReflectRules({
      dryRun: false,
      includeDeprecated: true,
      sampleSize: 10,
    });

    expect(result.applied.length).toBeGreaterThanOrEqual(2);
    const rules = await listRules({ includeInactive: true, limit: 10 });
    expect(rules.find((rule) => rule.id === keep.id)?.metadata.status).toBe(
      "active"
    );
    expect(
      rules.find((rule) => rule.id === duplicate.id)?.metadata.status
    ).toBe("deprecated");
    expect(rules.find((rule) => rule.id === chinese.id)?.metadata.status).toBe(
      "conflicted"
    );
    expect(rules.find((rule) => rule.id === english.id)?.metadata.status).toBe(
      "conflicted"
    );
  });

  it("injects relevant active rules into context and records hits", async () => {
    const rule = await upsertRule("Button radius should stay under 8px.", {
      label: "ui_preference",
      scope: "project",
      projectId: "elephance",
      action: "Keep button radius under 8px.",
    });

    const context = await createMemoryContext({
      query: "button radius",
      projectId: "elephance",
      memory: { autoRetrieve: false },
      rules: { autoRetrieve: true, projectId: "elephance", topK: 1 },
      schema: { autoRetrieve: false },
    });

    expect(context.ruleHits).toHaveLength(1);
    expect(context.contextText).toContain("Relevant rules:");
    expect(context.contextText).toContain("[ui_preference/project]");

    const [updated] = await listRules({ includeInactive: true });
    expect(updated?.id).toBe(rule.id);
    expect(updated?.metadata.hitCount).toBe(1);
  });

  it("lets the agent commit rule candidates during chat", async () => {
    const agent = createElephanceAgent({
      projectId: "elephance",
      memory: { autoRetrieve: false, autoWrite: false },
      rules: {
        autoRetrieve: false,
        autoWrite: "always",
        defaultScope: "project",
        projectId: "elephance",
      },
      llm: {
        async chat() {
          return { role: "assistant", content: "ok" };
        },
      },
      ruleExtractor: {
        async extract() {
          return [
            {
              text: "Button radius should stay under 8px.",
              label: "ui_preference",
              scope: "project",
              projectId: "elephance",
              action: "Keep button radius under 8px.",
              confidence: 0.9,
              source: "user_correction",
            },
          ];
        },
      },
    });

    const result = await agent.chat([
      { role: "user", content: "这个项目统一：按钮圆角不要超过 8px。" },
    ]);

    expect(result.rules.candidates).toHaveLength(1);
    expect(result.rules.writes[0]?.status).toBe("written");

    const rules = await listRules({ projectId: "elephance" });
    expect(rules).toHaveLength(1);
    expect(rules[0]?.metadata.label).toBe("ui_preference");
  });
});
