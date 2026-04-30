#!/usr/bin/env node

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { selfReflectRules } from "@elephance/agent";
import {
  configure,
  listRules,
  proposeRulePromotion,
  queryRules,
  recordRuleObservation,
  updateRuleStatus,
  upsertRule,
  type RuleObservationOutcome,
  type RuleScope,
  type RuleStatus,
} from "@elephance/core";
import { codexAgentsTemplate, cursorRulesTemplate } from "./templates.js";

export interface CliIo {
  stdout?: Pick<typeof process.stdout, "write">;
  stderr?: Pick<typeof process.stderr, "write">;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

type FlagValue = string | boolean;

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, FlagValue>;
}

const RULE_STATUSES = new Set([
  "candidate",
  "active",
  "conflicted",
  "deprecated",
  "archived",
]);

const RULE_SCOPES = new Set(["global", "user", "project", "client", "repo"]);
const OBSERVATION_OUTCOMES = new Set(["success", "failure", "correction"]);

function writeLine(stream: Pick<typeof process.stdout, "write">, text: string) {
  stream.write(`${text}\n`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, FlagValue>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 2) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }
    flags.set(key, next);
    i += 1;
  }

  return { positionals, flags };
}

function stringFlag(flags: Map<string, FlagValue>, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function booleanFlag(flags: Map<string, FlagValue>, key: string): boolean {
  return flags.get(key) === true || flags.get(key) === "true";
}

function numberFlag(
  flags: Map<string, FlagValue>,
  key: string
): number | undefined {
  const value = stringFlag(flags, key);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be a number`);
  }
  return parsed;
}

function scopeFlag(flags: Map<string, FlagValue>, key = "scope"): RuleScope {
  const value = stringFlag(flags, key) ?? "project";
  if (!RULE_SCOPES.has(value)) {
    throw new Error(`--${key} must be one of global, user, project, client, repo`);
  }
  return value as RuleScope;
}

function statusFlag(
  flags: Map<string, FlagValue>,
  fallback: RuleStatus
): RuleStatus {
  const value = stringFlag(flags, "status") ?? fallback;
  if (!RULE_STATUSES.has(value)) {
    throw new Error(
      "--status must be one of candidate, active, conflicted, deprecated, archived"
    );
  }
  return value as RuleStatus;
}

function observationOutcomeFlag(
  flags: Map<string, FlagValue>
): RuleObservationOutcome {
  const value = stringFlag(flags, "outcome") ?? "success";
  if (!OBSERVATION_OUTCOMES.has(value)) {
    throw new Error("--outcome must be one of success, failure, correction");
  }
  return value as RuleObservationOutcome;
}

function configureFromEnv(env: Record<string, string | undefined>) {
  configure({
    dbPath: env.ELEPHANCE_DB_PATH ?? ".lancedb",
    memoryTable: env.ELEPHANCE_MEMORY_TABLE ?? "memory",
    schemaTable: env.ELEPHANCE_SCHEMA_TABLE ?? "project_schema",
    ruleTable: env.ELEPHANCE_RULE_TABLE ?? "rule_memory",
  });
}

async function writeFileIfAllowed(
  filePath: string,
  content: string,
  force: boolean
) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!force) {
    try {
      await fs.access(filePath);
      throw new Error(`${filePath} already exists. Pass --force to overwrite.`);
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
    }
  }
  await fs.writeFile(filePath, content, "utf8");
}

function usage(): string {
  return `elephance

Usage:
  elephance init cursor [--dir <path>] [--force]
  elephance init codex [--dir <path>] [--force]
  elephance rule add <text> [--label <label>] [--scope <scope>] [--action <text>]
  elephance rule query <query> [--topK 5] [--project-id <id>] [--repo-path <path>]
  elephance rule reflect [--sample 50] [--dry-run=false]
  elephance rule conflicts
  elephance rule observe <id> [--outcome success|failure|correction] [--task <text>]
  elephance rule propose <id> [--min-evidence 2] [--min-successes 1] [--dry-run]
  elephance rule deprecate <id>

Environment:
  ELEPHANCE_DB_PATH, ELEPHANCE_MEMORY_TABLE, ELEPHANCE_SCHEMA_TABLE, ELEPHANCE_RULE_TABLE
`;
}

function commonRuleOptions(flags: Map<string, FlagValue>) {
  return {
    userId: stringFlag(flags, "user-id") ?? stringFlag(flags, "userId"),
    projectId: stringFlag(flags, "project-id") ?? stringFlag(flags, "projectId"),
    repoPath: stringFlag(flags, "repo-path") ?? stringFlag(flags, "repoPath"),
    client: stringFlag(flags, "client"),
  };
}

async function handleInit(
  target: string | undefined,
  flags: Map<string, FlagValue>,
  cwd: string,
  stdout: Pick<typeof process.stdout, "write">
) {
  const dir = path.resolve(cwd, stringFlag(flags, "dir") ?? ".");
  const force = booleanFlag(flags, "force");
  if (target === "cursor") {
    const filePath = path.join(dir, ".cursor", "rules", "elephance.mdc");
    await writeFileIfAllowed(filePath, cursorRulesTemplate(), force);
    writeLine(stdout, `Created ${filePath}`);
    return;
  }
  if (target === "codex") {
    const filePath = path.join(dir, "AGENTS.md");
    await writeFileIfAllowed(filePath, codexAgentsTemplate(), force);
    writeLine(stdout, `Created ${filePath}`);
    return;
  }
  throw new Error("init target must be cursor or codex");
}

async function handleRule(
  subcommand: string | undefined,
  rest: string[],
  flags: Map<string, FlagValue>,
  stdout: Pick<typeof process.stdout, "write">
) {
  if (subcommand === "add") {
    const text = rest.join(" ").trim();
    if (!text) {
      throw new Error("rule add requires rule text");
    }
    const rule = await upsertRule(text, {
      label: stringFlag(flags, "label") ?? "project_convention",
      scope: scopeFlag(flags),
      action: stringFlag(flags, "action") ?? text,
      condition: stringFlag(flags, "condition"),
      constraint: stringFlag(flags, "constraint"),
      exception: stringFlag(flags, "exception"),
      confidence: numberFlag(flags, "confidence") ?? 0.9,
      source: "manual",
      ...commonRuleOptions(flags),
    });
    writeLine(stdout, JSON.stringify(rule, null, 2));
    return;
  }

  if (subcommand === "query") {
    const query = rest.join(" ").trim();
    if (!query) {
      throw new Error("rule query requires query text");
    }
    const rules = await queryRules(query, {
      topK: numberFlag(flags, "topK") ?? numberFlag(flags, "top-k") ?? 5,
      label: stringFlag(flags, "label"),
      scope: stringFlag(flags, "scope") as RuleScope | undefined,
      includeInactive: booleanFlag(flags, "include-inactive"),
      recordHit: booleanFlag(flags, "record-hit"),
      ...commonRuleOptions(flags),
    });
    writeLine(stdout, JSON.stringify(rules, null, 2));
    return;
  }

  if (subcommand === "reflect") {
    const dryRun = stringFlag(flags, "dry-run") === "false" ? false : true;
    const result = await selfReflectRules({
      sampleSize: numberFlag(flags, "sample") ?? numberFlag(flags, "sample-size"),
      includeDeprecated: booleanFlag(flags, "include-deprecated"),
      dryRun,
      label: stringFlag(flags, "label"),
      scope: stringFlag(flags, "scope") as RuleScope | undefined,
      staleDays: numberFlag(flags, "stale-days"),
      lowConfidenceThreshold: numberFlag(flags, "low-confidence"),
      ...commonRuleOptions(flags),
    });
    writeLine(stdout, JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "conflicts") {
    const rules = await listRules({
      includeInactive: true,
      status: "conflicted",
      label: stringFlag(flags, "label"),
      scope: stringFlag(flags, "scope") as RuleScope | undefined,
      limit: numberFlag(flags, "limit"),
      ...commonRuleOptions(flags),
    });
    writeLine(stdout, JSON.stringify(rules, null, 2));
    return;
  }

  if (subcommand === "observe") {
    const id = rest[0];
    if (!id) {
      throw new Error("rule observe requires a rule id");
    }
    const rule = await recordRuleObservation(id, {
      outcome: observationOutcomeFlag(flags),
      task: stringFlag(flags, "task"),
      note: stringFlag(flags, "note"),
      evidenceId: stringFlag(flags, "evidence-id") ?? stringFlag(flags, "evidenceId"),
      client: stringFlag(flags, "client"),
    });
    writeLine(stdout, JSON.stringify({ ok: Boolean(rule), rule }, null, 2));
    return;
  }

  if (subcommand === "propose") {
    const id = rest[0];
    if (!id) {
      throw new Error("rule propose requires a rule id");
    }
    const proposal = await proposeRulePromotion(id, {
      minEvidence:
        numberFlag(flags, "min-evidence") ?? numberFlag(flags, "minEvidence"),
      minSuccesses:
        numberFlag(flags, "min-successes") ?? numberFlag(flags, "minSuccesses"),
      maxFailures:
        numberFlag(flags, "max-failures") ?? numberFlag(flags, "maxFailures"),
      privacyLevel:
        stringFlag(flags, "privacy-level") === "public" ? "public" : "team",
      sharedRepository:
        stringFlag(flags, "shared-repository") ??
        stringFlag(flags, "sharedRepository"),
      dryRun: booleanFlag(flags, "dry-run"),
    });
    writeLine(stdout, JSON.stringify({ ok: Boolean(proposal), result: proposal }, null, 2));
    return;
  }

  if (subcommand === "deprecate" || subcommand === "archive") {
    const id = rest[0];
    if (!id) {
      throw new Error(`rule ${subcommand} requires a rule id`);
    }
    const status = subcommand === "archive" ? "archived" : statusFlag(flags, "deprecated");
    const rule = await updateRuleStatus(id, status);
    writeLine(stdout, JSON.stringify({ ok: Boolean(rule), rule }, null, 2));
    return;
  }

  throw new Error(
    "rule command must be add, query, reflect, conflicts, observe, propose, deprecate, or archive"
  );
}

export async function runCli(argv: string[], io: CliIo = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;

  try {
    const parsed = parseArgs(argv);
    const [command, subcommand, ...rest] = parsed.positionals;
    if (!command || command === "help" || command === "--help") {
      writeLine(stdout, usage());
      return 0;
    }

    configureFromEnv(env);

    if (command === "init") {
      await handleInit(subcommand, parsed.flags, cwd, stdout);
      return 0;
    }
    if (command === "rule") {
      await handleRule(subcommand, rest, parsed.flags, stdout);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    writeLine(stderr, error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}

export { codexAgentsTemplate, cursorRulesTemplate } from "./templates.js";
