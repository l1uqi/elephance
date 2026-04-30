# @elephance/cli

Elephance 的命令行工具，用于规则记忆和客户端模板。

当前已发布版本：`0.3.0`。

```bash
npm install -g @elephance/cli
```

也可以不全局安装，直接运行：

```bash
npx -y --package @elephance/cli elephance --help
```

## 配置

CLI 使用和 MCP Server 相同的本地 LanceDB 环境变量：

| 变量 | 说明 |
| --- | --- |
| `ELEPHANCE_DB_PATH` | LanceDB 目录，默认 `.lancedb`。 |
| `ELEPHANCE_MEMORY_TABLE` | memory 表名，默认 `memory`。 |
| `ELEPHANCE_SCHEMA_TABLE` | schema 表名，默认 `project_schema`。 |
| `ELEPHANCE_RULE_TABLE` | rule 表名，默认 `rule_memory`。 |
| `OPENAI_API_KEY` | 只有使用默认 embedding provider 时需要。 |

## 客户端模板

生成 Cursor rules：

```bash
elephance init cursor --dir /path/to/repo
```

会写入：

```txt
/path/to/repo/.cursor/rules/elephance.mdc
```

生成 Codex `AGENTS.md` 模板：

```bash
elephance init codex --dir /path/to/repo
```

如果文件已存在，传 `--force` 覆盖。

## Rule 命令

新增手动规则：

```bash
elephance rule add "这个仓库统一使用 pnpm。" \
  --scope repo \
  --label project_convention \
  --repo-path /path/to/repo \
  --action "安装依赖时使用 pnpm。"
```

查询 active rules：

```bash
elephance rule query "安装依赖" \
  --repo-path /path/to/repo \
  --record-hit
```

反思规则：

```bash
elephance rule reflect --sample 50 --dry-run true
```

列出冲突规则：

```bash
elephance rule conflicts --repo-path /path/to/repo
```

废弃或归档规则：

```bash
elephance rule deprecate <rule-id>
elephance rule archive <rule-id>
```

## 研究背景

CLI 把 rule-memory 思路落到项目初始化和维护命令里。`init cursor` 和 `init codex` 会生成客户端模板，用于承接 [Memory for Autonomous LLM Agents](https://arxiv.org/abs/2603.07670) 中的 write/manage/read 闭环；`rule reflect`、`rule deprecate`、`rule archive` 对应 [AutoSkill](https://arxiv.org/abs/2603.01145) 和 [MemSkill](https://arxiv.org/abs/2602.02474) 提到的可演化 artifact 生命周期。结构化规则字段则参考了 [De Jure](https://arxiv.org/abs/2604.02276) 的规则抽取方向。

## 安全建议

- 不要存储密钥、token、密码、私钥或敏感个人数据。
- 旧规则优先标记为 `deprecated` 或 `archived`，不要硬删除。
- 对规则维护操作优先使用 dry-run reflection。
