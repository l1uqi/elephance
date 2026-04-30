#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const options = {
  dryRun: hasFlag("--dry-run", "npm_config_dry_run"),
  skipTests: hasFlag("--skip-tests", "npm_config_skip_tests"),
  skipGitCheck: hasFlag("--skip-git-check", "npm_config_skip_git_check"),
  tag: valueAfter("--tag", "npm_config_tag") ?? "latest",
  otp: valueAfter("--otp", "npm_config_otp"),
};

const packages = [
  { workspace: "@elephance/core", path: "packages/core/package.json" },
  { workspace: "@elephance/agent", path: "packages/agent/package.json" },
  { workspace: "@elephance/mcp", path: "packages/mcp/package.json" },
  { workspace: "@elephance/cli", path: "packages/cli/package.json" },
];

function hasFlag(name, envName) {
  if (args.includes(name)) return true;
  return process.env[envName] === "true";
}

function valueAfter(name, envName) {
  if (process.env[envName]) return process.env[envName];

  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`Missing value after ${name}`);
  }
  return value;
}

function run(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: childEnv(),
  });

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function childEnv() {
  const env = { ...process.env };
  delete env.npm_config_skip_git_check;
  delete env.npm_config_skip_tests;
  return env;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function validateVersions() {
  const core = readJson("packages/core/package.json");
  const agent = readJson("packages/agent/package.json");
  const mcp = readJson("packages/mcp/package.json");
  const cli = readJson("packages/cli/package.json");
  const declaredAgentCore = agent.dependencies?.["@elephance/core"];
  const declaredMcpAgent = mcp.dependencies?.["@elephance/agent"];
  const declaredCore = mcp.dependencies?.["@elephance/core"];
  const declaredCliAgent = cli.dependencies?.["@elephance/agent"];
  const declaredCliCore = cli.dependencies?.["@elephance/core"];

  if (!declaredAgentCore) {
    fail("packages/agent/package.json must depend on @elephance/core before publishing.");
  }

  if (!declaredCore) {
    fail("packages/mcp/package.json must depend on @elephance/core before publishing.");
  }

  if (!declaredMcpAgent) {
    fail("packages/mcp/package.json must depend on @elephance/agent before publishing.");
  }
  if (!declaredCliAgent || !declaredCliCore) {
    fail("packages/cli/package.json must depend on @elephance/agent and @elephance/core before publishing.");
  }

  const accepted = new Set([core.version, `^${core.version}`, `~${core.version}`]);
  const acceptedAgent = new Set([agent.version, `^${agent.version}`, `~${agent.version}`]);
  if (!accepted.has(declaredAgentCore)) {
    fail(
      `@elephance/agent depends on @elephance/core ${declaredAgentCore}, but core version is ${core.version}. Update packages/agent/package.json first.`
    );
  }

  if (!accepted.has(declaredCore)) {
    fail(
      `@elephance/mcp depends on @elephance/core ${declaredCore}, but core version is ${core.version}. Update packages/mcp/package.json first.`
    );
  }

  if (!acceptedAgent.has(declaredMcpAgent)) {
    fail(
      `@elephance/mcp depends on @elephance/agent ${declaredMcpAgent}, but agent version is ${agent.version}. Update packages/mcp/package.json first.`
    );
  }

  if (!accepted.has(declaredCliCore)) {
    fail(
      `@elephance/cli depends on @elephance/core ${declaredCliCore}, but core version is ${core.version}. Update packages/cli/package.json first.`
    );
  }

  if (!acceptedAgent.has(declaredCliAgent)) {
    fail(
      `@elephance/cli depends on @elephance/agent ${declaredCliAgent}, but agent version is ${agent.version}. Update packages/cli/package.json first.`
    );
  }
}

function checkGitClean() {
  if (options.dryRun || options.skipGitCheck) return;

  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: childEnv(),
  });

  if (result.status !== 0) {
    fail("Unable to check git status.");
  }

  if (result.stdout.trim()) {
    fail(
      "Working tree is not clean. Commit or stash changes before publishing, or pass --skip-git-check."
    );
  }
}

function checkNpmLogin() {
  if (options.dryRun) return;

  const result = spawnSync("npm", ["whoami"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: childEnv(),
  });

  if (result.status !== 0) {
    fail("npm login is required before publishing. Run npm login and try again.");
  }
}

function publishPackage(workspace) {
  const publishArgs = [
    "publish",
    "--workspace",
    workspace,
    "--access",
    "public",
    "--tag",
    options.tag,
  ];

  if (options.dryRun) publishArgs.push("--dry-run");
  if (options.otp) publishArgs.push("--otp", options.otp);

  run("npm", publishArgs);
}

console.log(options.dryRun ? "Running npm publish dry run..." : "Publishing npm packages...");

for (const packageInfo of packages) {
  const pkg = readJson(packageInfo.path);
  console.log(`- ${pkg.name}@${pkg.version}`);
}

validateVersions();
checkGitClean();
checkNpmLogin();

run("npm", ["run", "build"]);

if (!options.skipTests) {
  run("npm", ["test"]);
}

for (const packageInfo of packages) {
  publishPackage(packageInfo.workspace);
}

console.log(options.dryRun ? "Dry run complete." : "Publish complete.");
