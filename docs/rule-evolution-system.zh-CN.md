# Elephance 自主规则回写与进化系统设计方案

## 背景

Elephance 当前已经具备三层能力：

- `@elephance/core`：基于 LanceDB 的本地 memory/schema 存储与检索。
- `@elephance/agent`：在自建 Agent 应用里完成 retrieve、context injection、memory extraction、commit。
- `@elephance/mcp`：将 memory/schema 能力暴露给 Cursor、Codex、Claude Desktop 等 MCP Client。

现有 memory 更像“事实、偏好、摘要”的语义存储。本方案引入 `rule memory`，把用户纠正、项目约定、代码风格、客户端行为规范沉淀成结构化、可检索、可演化的规则。

本方案参考以下研究方向：

- AutoSkill：从交互痕迹中提取可复用 skill/rule artifact。
- MemSkill：通过 controller、executor、designer 让 memory skill 持续演化。
- Memory for Autonomous LLM Agents：将 agent memory 视为 write、manage、read 闭环。
- De Jure：将自然语言规则抽取为结构化 rule unit，并通过 judge/retry 进行自评修复。

## 设计目标

1. 将用户纠正和重复行为模式转化为持久规则。
2. 支持 Cursor、Codex、CLI、自建 Agent 使用同一套本地规则库。
3. 规则可版本化、可追踪来源、可废弃、可反思。
4. 检索时根据语义相似度、命中次数、时效性、作用域进行排序。
5. 默认保护用户信任：不做无提示的大规模自动写入。

## 非目标

- 不让 `@elephance/core` 依赖 LLM。
- 不默认保存完整对话。
- 不存储 secrets、tokens、passwords、private keys、敏感个人信息。
- 不假设 MCP server 可以自动读取 Cursor/Codex 的完整上下文。
- 不直接删除旧规则；先标记 `deprecated` 或 `archived`。

## 当前实现状态

截至当前实现，主干闭环已经完成：

- `@elephance/core`：新增独立 `rule_memory` 表配置，并实现 `upsertRule`、`queryRules`、`listRules`、`recordRuleHit`、`updateRuleStatus`。
- `@elephance/agent`：实现 `extractRuleCandidates`、`createLlmRuleExtractor`、`commitRuleCandidates`、`selfReflectRules`，并将 active rules 注入 `createMemoryContext` 和 `createElephanceAgent().chat()`。
- 提交流程已支持 judge：`add | merge | conflict | skip`。
- 自建 Agent 可通过 `rules.extractor: "llm"` 复用同一个 `ChatAdapter` 做 LLM 规则抽取；默认仍是 `heuristic`。
- MCP 已暴露 `rule_upsert`、`rule_query`、`rule_record_hit`、`rule_update_status`、`rule_extract_candidates`、`rule_commit_candidates`、`rule_reflect`。
- MCP/Cursor/Codex 路径保持显式工具调用，不要求额外配置大模型。

尚未实现或保持为后续增强：

- 独立 `rule_events`、`rule_reflections` LanceDB 表。
- `packages/cli` 以及 `elephance init cursor/codex`。
- LLM judge/retry 版本的冲突判断和合并摘要。
- 自动生成并写回更高质量 examples 的 reflection apply 阶段。
- `rule_list_conflicts`、`rule_deprecate` 等更细粒度 MCP tools；当前可用 `rule_query` + `status` 和 `rule_update_status` 完成。

## 总体架构

```txt
Cursor / Codex / CLI / 自建 Agent
        |
        v
@elephance/mcp / @elephance/agent / @elephance/cli
        |
        v
Rule Engine
  - extract
  - judge
  - merge
  - reflect
  - prune
        |
        v
@elephance/core
        |
        v
LanceDB
  - memory
  - project_schema
  - rule_memory
  - rule_events        # 后续增强
  - rule_reflections   # 后续增强
```

## 推荐包结构

```txt
packages/core/src/rules.ts
  规则存储、查询、命中反馈、状态更新。

packages/agent/src/rules/
  extraction.ts
  reflection.ts
  （当前实现中 types 位于 packages/agent/src/types.ts，judge/merge 逻辑位于 extraction.ts）

packages/mcp/src/server.ts
  暴露 rule tools。

packages/cli
  后续新增，负责 init cursor/codex、rule query、rule reflect 等命令。
```

## 数据模型

建议新增独立 LanceDB 表 `rule_memory`。短期也可以复用 `memory` 表并使用 `metadata.kind = "rule"`，但长期独立表更清晰。

```ts
export type RuleScope = "global" | "user" | "project" | "client" | "repo";

export type RuleStatus =
  | "candidate"
  | "active"
  | "conflicted"
  | "deprecated"
  | "archived";

export interface RuleMetadata {
  kind: "rule";
  label:
    | "user_preference"
    | "project_convention"
    | "coding_style"
    | "ui_preference"
    | "agent_behavior"
    | string;

  scope: RuleScope;
  userId?: string;
  projectId?: string;
  repoPath?: string;
  client?: "cursor" | "codex" | "cli" | "sdk" | string;

  action: string;
  condition?: string;
  constraint?: string;
  exception?: string;

  version: number;
  status: RuleStatus;
  confidence: number;
  clarityScore?: number;
  applicabilityScore?: number;

  hitCount: number;
  lastHitAt?: string;
  createdAt: string;
  updatedAt: string;

  source:
    | "manual"
    | "user_correction"
    | "repeated_pattern"
    | "conversation_summary"
    | "reflection";
  evidenceIds?: string[];
  examples?: string[];
  supersedes?: string[];
  conflictWith?: string[];
}

export interface RuleRow {
  id: string;
  text: string;
  vector: number[];
  metadata_json: string;
}
```

推荐把可读规则文本保持短而完整，例如：

```txt
When building UI in this project, button border radius should not exceed 8px unless an existing design system component requires otherwise.
```

结构化字段用于判断、合并、排序和反思；`text` 用于 embedding 和上下文注入。

## 实时提取循环

实时循环适合放在 `@elephance/agent` 与 MCP tools 中。

### 触发信号

- 明确记忆：`记住`、`以后`、`默认`、`作为规则`、`always`、`by default`。
- 用户纠正：`不是这样`、`不要`、`应该`、`改成`、`以后别`。
- 重复模式：多轮出现相同偏好或约定。
- 项目约束：`这个项目统一`、`这里约定`、`repo 里都用`。

### 抽取流程

```txt
conversation
  -> extractRuleCandidates
  -> sensitive filter
  -> query similar active rules
  -> judge add | merge | conflict | skip
  -> commit candidate or active rule
```

### 相似度与决策

相似度只能做召回，不能单独决定合并。

- `< 0.78`：倾向新增。
- `0.78 - 0.90`：进入 merge judge。
- `> 0.90`：倾向更新已有规则版本、证据或示例。
- 语义相似但 `action/constraint/exception` 互斥：标记 `conflicted`。

### 建议 API

```ts
export async function extractRuleCandidates(
  input: RuleExtractionInput
): Promise<RuleCandidate[]>;

export async function commitRuleCandidates(
  candidates: RuleCandidate[],
  options?: RuleCommitOptions
): Promise<RuleCommitResult>;

export async function createLlmRuleExtractor(
  options: LlmRuleExtractorOptions
): RuleExtractor;
```

`commitRuleCandidates` 默认应支持 `dryRun`，并返回每条候选的决策原因。

## 异步进化循环

异步循环对应 MemSkill 的 Designer 角色。它不应该默认常驻后台运行，推荐通过 SDK、MCP tool 或 CLI 显式触发。

```txt
elephance rule reflect --sample 50
```

或：

```ts
await selfReflectRules({
  sampleSize: 50,
  includeDeprecated: false,
  dryRun: true,
});
```

### SelfReflect 阶段

1. Consolidation  
   聚类相似规则，合并重复项，保留证据与版本链。

2. Conflict Resolution  
   找出同 scope 下的互斥规则，生成解决建议。

3. Clarification  
   给规则打 `clarityScore` 和 `applicabilityScore`。低分规则生成示例场景写入 metadata。

4. Pruning  
   将长期未命中、被 supersede、低置信度的规则标记为 `deprecated` 或 `archived`。

### 冲突优先级

建议默认规则：

```txt
explicit user correction
  > manual rule
  > newer active rule
  > higher hitCount
  > higher confidence
  > project/repo scope
  > user/global scope
```

冲突不要自动静默解决。对于 Cursor/Codex/CLI 用户，默认返回建议；只有 SDK 用户显式配置 `autoResolve: true` 时才自动修改状态。

## 检索排序

当前 `queryMemory` 只按向量相似度返回。规则检索建议加入重排：

```txt
finalScore =
  semanticScore
  + hitCountBoost
  + recencyBoost
  + scopeBoost
  + confidenceBoost
  - deprecatedPenalty
  - conflictPenalty
```

其中：

- `semanticScore` 来自 cosine distance。
- `hitCountBoost` 避免核心规则被新但弱的规则冲掉。
- `recencyBoost` 让最近明确纠正的规则更容易浮上来。
- `scopeBoost` 优先 repo/project/client 精确匹配。
- `deprecatedPenalty` 确保旧规则不进入默认上下文。

## Context 注入格式

建议新增 `formatRuleContext`，与现有 `formatElephanceContext` 分开。

```txt
<elephance_rules>
Relevant rules:
- [project_convention][active][v3] Use pnpm for package management in this repo.
- [ui_preference][active][v1] Button border radius should not exceed 8px unless the existing design system requires otherwise.
</elephance_rules>
```

如果规则存在冲突，不要直接注入为普通规则，应注入为 warning：

```txt
Conflicted rules requiring user confirmation:
- R1 says use English responses by default.
- R2 says use Chinese responses by default.
```

## MCP Tools 设计

建议新增：

```txt
rule_query
rule_extract_candidates
rule_commit_candidates
rule_record_hit
rule_reflect
rule_list_conflicts
rule_deprecate
```

### `rule_query`

```json
{
  "query": "实现按钮组件",
  "userId": "u1",
  "projectId": "elephance",
  "client": "cursor",
  "topK": 5
}
```

### `rule_extract_candidates`

```json
{
  "messages": [
    {
      "role": "user",
      "content": "这个项目按钮不要圆角超过 8px，记住。"
    }
  ],
  "client": "cursor",
  "scope": "project",
  "dryRun": true
}
```

### `rule_commit_candidates`

```json
{
  "candidates": [
    {
      "text": "Button border radius should not exceed 8px in this project.",
      "label": "ui_preference",
      "confidence": 0.91,
      "metadata": {
        "scope": "project",
        "action": "Limit button border radius",
        "constraint": "Do not exceed 8px"
      }
    }
  ],
  "dryRun": false
}
```

## Cursor 接入

Cursor 不能被 `@elephance/agent` 包裹，因此用 MCP tools + rules 模板。

推荐 `elephance init cursor` 生成 `.cursor/rules/elephance.mdc`：

```md
Before implementing a task, call elephance rule_query or context_query with the user request.
Treat returned active rules as project/user preferences.

When the user corrects durable behavior or says "remember", call rule_extract_candidates.
Only commit candidates automatically when the user explicitly asked to remember the rule.
Otherwise show the candidate and ask for confirmation.

Never store secrets, tokens, passwords, private keys, or sensitive personal data.
```

## Codex 接入

Codex 同样通过 MCP 或 CLI 模板接入。

推荐 `elephance init codex` 生成 `AGENTS.md` 片段：

```md
Use Elephance before substantial work:
- Query relevant rules for the current task.
- Apply active project/user/client rules.
- If the user corrects a durable behavior, extract rule candidates.
- Commit only when the user explicitly asks to remember or persist the rule.
```

Codex 写入时建议 metadata 带上：

```json
{
  "client": "codex",
  "repoPath": "/absolute/path/to/repo",
  "projectId": "elephance"
}
```

## CLI 接入

建议新增 `packages/cli`，命令如下：

```bash
elephance init cursor
elephance init codex

elephance rule add "这个项目统一使用 pnpm" --scope project --label project_convention
elephance rule query "安装依赖应该用什么工具"
elephance rule reflect --sample 50 --dry-run
elephance rule conflicts
elephance rule deprecate <id>
```

CLI 是非 MCP 用户的主要入口，也适合做定期维护任务。

## 实施路线

### Phase 1：规则存储与查询

状态：已完成。

- 新增 `packages/core/src/rules.ts`。
- 新增 `RuleMetadata`、`RuleHit`、`RuleRow`、`RuleListOptions` 类型。
- 实现 `upsertRule`、`queryRules`、`listRules`、`updateRuleStatus`、`recordRuleHit`。
- `@elephance/core` 导出规则 API。

### Phase 2：规则抽取与提交

状态：已完成。

- 在 `@elephance/agent` 新增 `rules/extraction.ts`。
- 实现 heuristic extractor，先不强依赖 LLM。
- 实现 `commitRuleCandidates`，包含 sensitive filter、similarity check、dry-run decision。
- MCP 暴露 `rule_extract_candidates`、`rule_commit_candidates`、`rule_query`、`rule_upsert`、`rule_update_status`、`rule_record_hit`。

### Phase 3：LLM 结构化抽取

状态：已完成基础版，LLM judge/retry 为后续增强。

- 实现 `createLlmRuleExtractor`。
- 输出 `action/condition/constraint/exception`。
- 增加 judge：`add | merge | conflict | skip`。
- 增加单元测试覆盖 JSON parsing、policy filtering、conflict detection。
- 自建 Agent 通过 `rules.extractor: "llm"` 启用；MCP Client 默认不使用 LLM extractor。

### Phase 4：反思与修剪

状态：已完成基础版。

- 实现 `selfReflectRules`。
- 支持 sample、clarity heuristic、example suggestion。
- 支持 `dryRun` 返回建议，不默认自动修改。
- MCP 暴露 `rule_reflect`。
- 非 dry-run 只应用安全状态变更，不自动删除规则，不自动改写规则正文。

### Phase 5：CLI 与客户端模板

状态：未实现。

- 新增 `packages/cli`。
- 实现 `init cursor`、`init codex`。
- 生成 Cursor rules 和 Codex `AGENTS.md` 模板。
- 文档补充 Cursor/Codex/CLI 工作流。

## 默认策略建议

- `autoExtract`: true for SDK, manual for MCP clients。
- `autoCommit`: false by default。
- 用户明确说“记住”时，可自动 commit。
- 未明确要求时，返回 candidate 给客户端确认。
- `deprecated` 规则默认不检索。
- `conflicted` 规则只作为 warning 返回。
- `hitCount` 高的规则不应被低置信新规则自动覆盖。

## 最小可行版本

最小版本只需要：

1. `rule_memory` 表。
2. `upsertRule` 和 `queryRules`。
3. `rule_extract_candidates` 的 heuristic 版本。
4. `rule_commit_candidates` 支持 dry-run。
5. Cursor/Codex 文档模板。

这能先把“用户纠正 -> 规则候选 -> 用户确认 -> 下次检索使用”的闭环跑通，再逐步加入 LLM judge、SelfReflect 和 pruning。
