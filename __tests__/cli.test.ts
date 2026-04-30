import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  codexAgentsTemplate,
  cursorRulesTemplate,
  runCli,
} from "../packages/cli/src/index.js";

function memoryStream() {
  let text = "";
  return {
    stream: {
      write(chunk: string) {
        text += chunk;
        return true;
      },
    },
    text() {
      return text;
    },
  };
}

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "elephance-cli-"));
}

describe("@elephance/cli", () => {
  it("renders Cursor and Codex templates", () => {
    expect(cursorRulesTemplate()).toContain("context_query");
    expect(cursorRulesTemplate()).toContain("rule_extract_candidates");
    expect(codexAgentsTemplate()).toContain("AGENTS");
    expect(codexAgentsTemplate()).toContain("client: \"codex\"");
  });

  it("prints help", async () => {
    const stdout = memoryStream();
    const code = await runCli(["--help"], {
      stdout: stdout.stream,
      stderr: memoryStream().stream,
      env: {},
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain("elephance init cursor");
    expect(stdout.text()).toContain("elephance rule query");
  });

  it("generates Cursor rules template", async () => {
    const dir = await tempDir();
    const stdout = memoryStream();
    const code = await runCli(["init", "cursor", "--dir", dir], {
      stdout: stdout.stream,
      stderr: memoryStream().stream,
      env: {},
    });

    const file = path.join(dir, ".cursor", "rules", "elephance.mdc");
    const content = await fs.readFile(file, "utf8");
    expect(code).toBe(0);
    expect(stdout.text()).toContain(file);
    expect(content).toContain("rule_commit_candidates");
  });

  it("does not overwrite templates without --force", async () => {
    const dir = await tempDir();
    const stderr = memoryStream();
    await runCli(["init", "codex", "--dir", dir], {
      stdout: memoryStream().stream,
      stderr: memoryStream().stream,
      env: {},
    });
    const code = await runCli(["init", "codex", "--dir", dir], {
      stdout: memoryStream().stream,
      stderr: stderr.stream,
      env: {},
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain("already exists");
  });
});
