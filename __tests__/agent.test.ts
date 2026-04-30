import { describe, expect, it } from "@jest/globals";
import {
  createLlmMemoryExtractor,
  createLlmRuleExtractor,
  createElephanceAgent,
  extractMemoryCandidates,
  extractRuleCandidates,
  formatElephanceContext,
  looksSensitive,
  parseMemoryCandidatesFromText,
  parseRuleCandidatesFromText,
  resolveMemoryPolicy,
  resolveRulePolicy,
  shouldCommitCandidate,
  shouldCommitRuleCandidate,
  type AgentMessage,
} from "../packages/agent/src/index.js";

describe("@elephance/agent", () => {
  it("formats elephance context blocks", () => {
    const context = formatElephanceContext(
      [
        {
          id: "memory-1",
          text: "User prefers Chinese responses.",
          metadata: { label: "user_preference" },
          distance: 0.1,
        },
      ],
      [
        {
          id: "schema-1",
          text: "Orders store payment state.",
          source: "tables/orders.md",
          last_updated: "2026-04-29T00:00:00.000Z",
          distance: 0.2,
        },
      ]
    );

    expect(context).toContain("<elephance_context>");
    expect(context).toContain("[user_preference] User prefers Chinese responses.");
    expect(context).toContain("source: tables/orders.md");
    expect(context).toContain("</elephance_context>");
  });

  it("extracts durable memory candidates in dry-run mode", async () => {
    const policy = resolveMemoryPolicy({ autoWrite: "dry-run" }, "u1");
    const candidates = await extractMemoryCandidates({
      messages: [
        {
          role: "user",
          content: "以后回答我尽量用中文，代码注释用英文。",
        },
      ],
      userId: "u1",
      policy,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.userId).toBe("u1");
    expect(candidates[0]?.confidence).toBeGreaterThanOrEqual(
      policy.minConfidence
    );
  });

  it("rejects obvious sensitive memory text", () => {
    const policy = resolveMemoryPolicy({ autoWrite: "always" }, "u1");
    const decision = shouldCommitCandidate(
      {
        text: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
        label: "note",
        confidence: 0.99,
      },
      policy
    );

    expect(looksSensitive("password: hunter2")).toBe(true);
    expect(decision.ok).toBe(false);
  });

  it("injects context before calling the chat adapter", async () => {
    const seenMessages: AgentMessage[][] = [];
    const agent = createElephanceAgent({
      userId: "u1",
      memory: { autoRetrieve: false, autoWrite: "dry-run" },
      llm: {
        async chat(messages) {
          seenMessages.push(messages);
          return { role: "assistant", content: "ok" };
        },
      },
      extractor: {
        async extract() {
          return [
            {
              text: "User prefers concise responses.",
              label: "user_preference",
              confidence: 0.9,
              userId: "u1",
            },
          ];
        },
      },
    });

    const result = await agent.chat([
      { role: "user", content: "Remember that I prefer concise responses." },
    ]);

    expect(result.message.content).toBe("ok");
    expect(result.memory.candidates).toHaveLength(1);
    expect(result.memory.writes).toHaveLength(0);
    expect(seenMessages[0]?.[0]?.role).toBe("user");
  });

  it("parses LLM memory extraction JSON", () => {
    const candidates = parseMemoryCandidatesFromText(
      JSON.stringify({
        candidates: [
          {
            text: "In this project, list hover states should use a subtle left border instead of a strong background.",
            label: "ui_preference",
            confidence: 0.91,
            reason: "The user corrected the list hover style repeatedly.",
            source: "conversation_summary",
          },
        ],
      })
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.label).toBe("ui_preference");
  });

  it("uses an LLM extractor adapter and filters candidates through policy", async () => {
    const policy = resolveMemoryPolicy(
      { autoWrite: "dry-run", allowedLabels: ["ui_preference"] },
      "u1"
    );
    const extractor = createLlmMemoryExtractor({
      llm: {
        async chat(messages) {
          expect(messages[0]?.role).toBe("system");
          return {
            role: "assistant",
            content: JSON.stringify({
              candidates: [
                {
                  text: "List item hover states should use a subtle left border rather than a strong background.",
                  label: "ui_preference",
                  confidence: 0.9,
                  reason: "The user converged on this visual preference.",
                  source: "conversation_summary",
                },
                {
                  text: "Temporary task detail.",
                  label: "temporary",
                  confidence: 0.99,
                },
              ],
            }),
          };
        },
      },
    });

    const candidates = await extractor.extract({
      messages: [
        { role: "user", content: "列表 hover 不要改背景，左边线就好。" },
      ],
      userId: "u1",
      policy,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.userId).toBe("u1");
    expect(candidates[0]?.label).toBe("ui_preference");
  });

  it("extracts durable rule candidates in dry-run mode", async () => {
    const policy = resolveRulePolicy(
      { autoWrite: "dry-run", defaultScope: "project" },
      { projectId: "elephance" }
    );
    const candidates = await extractRuleCandidates({
      messages: [
        {
          role: "user",
          content: "这个项目统一：按钮圆角不要超过 8px。",
        },
      ],
      projectId: "elephance",
      policy,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.scope).toBe("project");
    expect(candidates[0]?.projectId).toBe("elephance");
    expect(candidates[0]?.label).toBe("ui_preference");
    expect(shouldCommitRuleCandidate(candidates[0]!, policy).ok).toBe(true);
  });

  it("parses LLM rule extraction JSON", () => {
    const candidates = parseRuleCandidatesFromText(
      JSON.stringify({
        candidates: [
          {
            text: "When editing tests in this repo, follow the surrounding test style.",
            label: "coding_style",
            scope: "repo",
            action: "Follow nearby test style.",
            confidence: 0.88,
            reason: "The user asked to preserve repo conventions.",
            source: "user_correction",
          },
        ],
      })
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.label).toBe("coding_style");
    expect(candidates[0]?.action).toBe("Follow nearby test style.");
  });

  it("uses an LLM rule extractor adapter and filters candidates through policy", async () => {
    const policy = resolveRulePolicy(
      { autoWrite: "dry-run", allowedLabels: ["agent_behavior"] },
      { userId: "u1" }
    );
    const extractor = createLlmRuleExtractor({
      llm: {
        async chat(messages) {
          expect(messages[0]?.role).toBe("system");
          return {
            role: "assistant",
            content: JSON.stringify({
              candidates: [
                {
                  text: "When replying to this user, use Chinese by default.",
                  label: "agent_behavior",
                  scope: "user",
                  action: "Use Chinese by default.",
                  confidence: 0.9,
                  source: "user_correction",
                },
                {
                  text: "Store this temporary task.",
                  label: "temporary",
                  scope: "user",
                  action: "Remember a temporary task.",
                  confidence: 0.99,
                },
              ],
            }),
          };
        },
      },
    });

    const candidates = await extractor.extract({
      messages: [{ role: "user", content: "以后默认用中文回答我。" }],
      userId: "u1",
      policy,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.userId).toBe("u1");
    expect(candidates[0]?.label).toBe("agent_behavior");
  });

  it("uses configured LLM rule extraction for self-hosted agents", async () => {
    const calls: AgentMessage[][] = [];
    const agent = createElephanceAgent({
      userId: "u1",
      memory: { autoRetrieve: false, autoWrite: false },
      rules: {
        autoRetrieve: false,
        autoWrite: "dry-run",
        extractor: "llm",
        allowedLabels: ["agent_behavior"],
      },
      llm: {
        async chat(messages) {
          calls.push(messages);
          if (messages[0]?.name === "elephance_rule_extractor") {
            return {
              role: "assistant",
              content: JSON.stringify({
                candidates: [
                  {
                    text: "When replying to this user, use Chinese by default.",
                    label: "agent_behavior",
                    scope: "user",
                    action: "Use Chinese by default.",
                    confidence: 0.9,
                    source: "user_correction",
                  },
                ],
              }),
            };
          }
          return { role: "assistant", content: "ok" };
        },
      },
    });

    const result = await agent.chat([
      { role: "user", content: "以后默认用中文回答我。" },
    ]);

    expect(calls).toHaveLength(2);
    expect(result.rules.candidates).toHaveLength(1);
    expect(result.rules.candidates[0]?.label).toBe("agent_behavior");
  });
});
