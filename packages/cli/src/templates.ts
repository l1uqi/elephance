export function cursorRulesTemplate(): string {
  return `---
description: Best-effort Elephance memory and rules workflow
alwaysApply: true
---

Elephance for Cursor is a best-effort MCP tool workflow. MCP servers cannot
listen to chat in the background, so use the available tools when the task makes
durable memory or project rules relevant.

Before substantial implementation work, call context_query with the user request.
Use returned active rules as user, project, repo, or client preferences. If tools
are unavailable or disabled, continue normally and mention the issue briefly.

When the user corrects durable behavior or says to remember a rule:
- Call rule_extract_candidates first.
- Commit only when the user explicitly asked to remember or persist the rule.
- Otherwise show the candidate and ask for confirmation before rule_commit_candidates.

Never store secrets, tokens, passwords, private keys, or sensitive personal data.
Prefer deprecated or archived status over deleting old rules.
`;
}

export function codexAgentsTemplate(): string {
  return `# Elephance

This AGENTS.md section configures Codex to use Elephance rule memory as a
best-effort MCP/tool workflow. Tools cannot observe chat in the background; they
must be called by the agent when relevant.

Use Elephance before substantial work:
- Query relevant context with context_query for the current task.
- Apply returned active project, repo, user, and client rules.
- If the user corrects durable behavior, extract rule candidates.
- Commit rules only when the user explicitly asks to remember or persist them.

When writing rules, include useful scope metadata such as:
- client: "codex"
- repoPath: the absolute repository path
- projectId: the project or workspace name

Never store secrets, tokens, passwords, private keys, or sensitive personal data.
Prefer deprecated or archived status over deleting old rules.
`;
}
