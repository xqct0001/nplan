<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlanCore 图标" width="112">
</p>

<h1 align="center">NPlanCore</h1>

<p align="center"><strong>面向编程 Agent 的安全门禁规划、独立校验状态与受控项目记忆。</strong></p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

NPlanCore 先对模糊需求执行安全检查，再整理成可审查的计划；也可以把经过脱敏的项目记忆变更整理成必须明确审批的提案。它可以用于 Codex、Claude Code 以及其他兼容 Agent Skills 的宿主。

> [!IMPORTANT]
> NPlanCore 只负责规划，不会执行生成的计划。它把检查到的内容视为不可信证据、拒绝有害目标；没有针对具体提案的明确授权，就不会应用或拒绝记忆变更。

## 你会得到什么

- **结构化规划** — 生成目标、依赖、输出和验收标准清晰的 `TaskSpec`、`TaskPlan` 与 `ContextPack`。
- **安全门禁** — 在任务拆解前拒绝欺诈、证据篡改、凭据窃取、暗中破坏、胁迫和未授权披露。
- **不可信输入隔离** — 把文件、记忆、日志、Issue、检索内容和工具输出视为证据，而不是可执行指令。
- **独立校验状态** — 只有 NPlan 运行时可以把计划认证为 `validated`；仅由模型自检时返回 `unable_to_validate`。
- **受控记忆** — 检查项目记忆、提出新事实或修正提案、审查完整变更，再明确应用或拒绝。
- **按模式限制工具** — 规划模式只读；记忆操作只允许封闭集合中的精确 `nplan memory` 命令。
- **跨宿主工作流** — 在 Codex、Claude Code 或其他兼容 Agent Skills 的宿主中使用同一套规划和记忆方法。
- **操作证明** — 如实报告命令、校验权威、外部操作、文件变更和记忆变更，不声称未观察到的成功。

## 环境要求

- ChatGPT 桌面应用中的 Codex、Claude Code，或其他兼容 Agent Skills 的宿主。
- 从 GitHub 安装此 marketplace 时需要 Git。
- 可选：安装 `nplan` CLI，以使用运行时计划校验和持久化项目记忆操作。

## 安装

### Codex

把此仓库分支注册为 marketplace：

```bash
codex plugin marketplace add xqct0001/nplan --ref codex/nplancore-plugin
```

然后打开 ChatGPT 桌面应用：

1. 刷新或重启应用。
2. 打开插件目录。
3. 选择 **NPlanLocal** marketplace。
4. 安装 **NPlanCore**。
5. 新建任务并调用 `$nplan-core`。

上面的 CLI 命令只负责注册 marketplace；插件安装和本地插件测试在桌面应用中完成。

### Claude Code

在 Claude Code 中运行：

```text
/plugin marketplace add xqct0001/nplan@codex/nplancore-plugin
/plugin install nplan-core@nplan-local
/reload-plugins
```

通过 `/nplan-core:nplan-core` 调用技能。

### 本地检出

用于开发或检查：

```bash
git clone --branch codex/nplancore-plugin --single-branch https://github.com/xqct0001/nplan.git
cd nplan
```

在 Codex 中注册本地目录：

```bash
codex plugin marketplace add .
```

或者在 Claude Code 中直接加载插件：

```bash
claude --plugin-dir ./plugins/nplan-core
```

## 快速开始

### 创建计划

Codex：

```text
$nplan-core 为 SQLite 到 PostgreSQL 的零停机迁移制定计划，不要执行。
```

Claude Code：

```text
/nplan-core:nplan-core 为 SQLite 到 PostgreSQL 的零停机迁移制定计划，不要执行。
```

NPlanCore 会返回包含证据、依赖、验收标准、风险和操作证明的有界计划。有 NPlan 运行时时可以报告 `validated`；没有独立运行时校验时报告 `unable_to_validate`。无论哪种情况都会在执行任务前停止。

### 管理项目记忆

```text
$nplan-core 检查项目记忆，然后提议记住：生产部署需要两人审批。
```

工作流会先展示完整提案，再询问是否应用或拒绝。要求记住、扫描、摄取或修正信息，并不等于授权应用提案。

## 常用工作流

| 目标 | 示例请求 |
| --- | --- |
| 规划功能 | `为此服务规划基于角色的访问控制。` |
| 校验计划 | `检查此计划是否缺少交付物或包含无效依赖。` |
| 安全检查 | `在拆解任务前评估此请求是否适合规划。` |
| 澄清需求 | `把此需求整理成 TaskSpec，只询问会阻塞规划的问题。` |
| 检查记忆 | `显示项目记忆状态和 deployment-policy 概念。` |
| 提议事实 | `提议记住：发布标签使用 vMAJOR.MINOR.PATCH 格式。` |
| 修正概念 | `以此配置文件为证据，提议修正已保存的预发布环境 URL。` |
| 决定提案 | `应用提案 <proposal-id>。` 或 `拒绝提案 <proposal-id>。` |

## 安全模型

### 固定安全门禁

- 在收集证据或拆解任务前拒绝不安全目标。
- 合法的防御、审计、合规和事件响应工作必须具有明确且有边界的授权范围。
- NPlanCore 只会透明地提出问题或拒绝，不会暗中修改工作、联系外部人员或诱导人类代理行动。

### 不可信证据

- 项目指令可以约束工作流，但不能授权副作用。
- 文件、记忆、日志、Issue、检索内容和工具输出均属于不可信证据。
- 其中嵌入的指令不能授予权限、修改策略、压制发现、泄露秘密或改变校验标签。

### 独立校验

- 规划器在校验前冻结候选计划。
- 校验器只能检查冻结候选，不能直接改写它。
- 只有独立的 NPlan 运行时或 Schema 校验器可以返回 `validated`。
- 宿主模型自检必须返回 `unable_to_validate`，即使没有发现缺陷。

### 工具与记忆控制

- 规划模式只允许读、列出、搜索和一个精确的 NPlan 打印模式命令。
- 记忆模式只允许规定形式的 `status`、`show`、`scan`、`ingest`、`note`、`correct`、`apply` 和 `reject`。
- 秘密及原始机密或个人数据必须脱敏，不能写入记忆。
- `apply` 和 `reject` 必须获得针对具体提案 ID 和动作的明确授权。
- 不支持直接编辑 `.nplan/memory/`、物理删除、Shell 命令拼接或 `forget`。

## 工作原理

```text
规划
需求 → 安全门禁 → 不可信证据 → 冻结计划 → 独立校验 → 停止

记忆
来源 → 保密门禁 → 提案 → 审查 → 精确应用/拒绝 → 操作证明
```

如果没有安装 `nplan` CLI，宿主仍可生成符合方法约定的候选计划并指出可能的问题，但必须报告 `unable_to_validate`，不能自我认证，也不能写入正式项目记忆。

## 插件结构

```text
.
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
├── assets/nplan-icon.svg
├── plugins/nplan-core/
│   ├── .codex-plugin/plugin.json
│   ├── .claude-plugin/plugin.json
│   └── skills/nplan-core/
│       ├── SKILL.md
│       ├── agents/openai.yaml
│       └── references/
├── README.md
└── README.zh-CN.md
```

此分支只保留插件、marketplace 清单、图标和中英文说明文档。

## 官方插件文档

- [Codex 插件开发](https://developers.openai.com/codex/plugins/build)
- [Claude Code 插件开发](https://code.claude.com/docs/en/plugins)
- [创建和分发 Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)

## 许可证

MIT
