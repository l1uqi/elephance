import { describe, expect, it } from "@jest/globals";
import {
  createElephanceAgent,
  extractMemoryCandidates,
  formatElephanceContext,
  looksSensitive,
  resolveMemoryPolicy,
  shouldCommitCandidate,
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
});
