# @elephance/cli

Command-line tools for Elephance rule memory and client templates.

Current published version: `0.3.0`.

```bash
npm install -g @elephance/cli
```

Or run without global install:

```bash
npx -y --package @elephance/cli elephance --help
```

## Configuration

The CLI uses the same local LanceDB environment variables as the MCP server:

| Variable | Description |
| --- | --- |
| `ELEPHANCE_DB_PATH` | LanceDB directory. Defaults to `.lancedb`. |
| `ELEPHANCE_MEMORY_TABLE` | Memory table name. Defaults to `memory`. |
| `ELEPHANCE_SCHEMA_TABLE` | Schema table name. Defaults to `project_schema`. |
| `ELEPHANCE_RULE_TABLE` | Rule table name. Defaults to `rule_memory`. |
| `OPENAI_API_KEY` | Required only when using the default embedding provider. |

## Client Templates

Generate Cursor rules:

```bash
elephance init cursor --dir /path/to/repo
```

This writes:

```txt
/path/to/repo/.cursor/rules/elephance.mdc
```

The Cursor template configures a best-effort MCP workflow. It cannot make
Elephance listen to chats in the background; Cursor Agent still has to call the
available tools.

Generate a Codex `AGENTS.md` template:

```bash
elephance init codex --dir /path/to/repo
```

Pass `--force` to overwrite an existing template.

## Rule Commands

Add a manual rule:

```bash
elephance rule add "Use pnpm in this repo." \
  --scope repo \
  --label project_convention \
  --repo-path /path/to/repo \
  --action "Use pnpm for dependency installation."
```

Query active rules:

```bash
elephance rule query "install dependencies" \
  --repo-path /path/to/repo \
  --record-hit
```

Reflect on rules:

```bash
elephance rule reflect --sample 50 --dry-run true
```

Record an observation after a rule helped or failed:

```bash
elephance rule observe <rule-id> \
  --outcome success \
  --task "Implemented the matching list hover style." \
  --evidence-id task-123
```

Propose a local rule for team/shared promotion after enough evidence exists:

```bash
elephance rule propose <rule-id> \
  --min-evidence 2 \
  --min-successes 2 \
  --shared-repository team-rules
```

List conflicts:

```bash
elephance rule conflicts --repo-path /path/to/repo
```

Deprecate or archive a rule:

```bash
elephance rule deprecate <rule-id>
elephance rule archive <rule-id>
```

## Research Context

The CLI turns the rule-memory ideas into project setup and maintenance commands. `init cursor` and `init codex` generate client templates for the write/manage/read loop described in [Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670), while `rule reflect`, `rule deprecate`, and `rule archive` support the evolving artifact lifecycle suggested by [AutoSkill](https://arxiv.org/abs/2603.01145) and [MemSkill](https://arxiv.org/abs/2602.02474). Structured rule fields follow the extraction direction explored by [De Jure](https://arxiv.org/abs/2604.02276), and `rule observe` / `rule propose` provide a conservative local-first version of the collective evolution direction in [SkillClaw](https://arxiv.org/abs/2604.08377).

## Safety

- Do not store secrets, tokens, passwords, private keys, or sensitive personal data.
- Prefer `deprecated` or `archived` over hard deletion.
- Use dry-run reflection before applying rule maintenance changes.
- Shared/team promotion is local metadata only; it does not upload or sync rules.
