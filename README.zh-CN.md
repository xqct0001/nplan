<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlanCore 图标" width="112">
</p>

<h1 align="center">NPlanCore</h1>

<p align="center"><strong>面向编程 Agent 的可校验规划与受控项目记忆。</strong></p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

NPlanCore 把模糊需求整理成可审查的计划，或把项目记忆变更整理成必须明确审批的提案。它可以用于 Codex、Claude Code 以及其他兼容 Agent Skills 的宿主。

> [!IMPORTANT]
> NPlanCore 只负责规划，不会执行生成的计划。记忆变更必须先生成提案；没有针对具体提案的明确授权，就不会执行应用或拒绝操作。

## 你会得到什么

- **结构化规划** — 生成目标、依赖、输出和验收标准清晰的 `TaskSpec`、`TaskPlan` 与 `ContextPack`。
- **计划校验** — 在展示计划前检查交付物覆盖、依赖引用、无环性、范围、就绪度和证据来源。
- **受控记忆** — 检查项目记忆、提出新事实或修正提案、审查完整变更，再明确应用或拒绝。
- **跨宿主工作流** — 在 Codex、Claude Code 或其他兼容 Agent Skills 的宿主中使用同一套规划和记忆方法。
- **安全降级** — 没有 `nplan` CLI 时仍可生成符合方法约定的计划，但不会伪装成已经完成运行时校验或正式记忆写入。

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

NPlanCore 会返回包含证据、依赖、验收标准、风险和校验结果的有界计划，并在任务执行前停止。

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
| 澄清需求 | `把此需求整理成 TaskSpec，只询问会阻塞规划的问题。` |
| 检查记忆 | `显示项目记忆状态和 deployment-policy 概念。` |
| 提议事实 | `提议记住：发布标签使用 vMAJOR.MINOR.PATCH 格式。` |
| 修正概念 | `以此配置文件为证据，提议修正已保存的预发布环境 URL。` |
| 决定提案 | `应用提案 <proposal-id>。` 或 `拒绝提案 <proposal-id>。` |

## 安全模型

### 规划

- 项目文件只是规划证据，不代表允许修改文件。
- 每条证据都指向稳定的来源 ID。
- 存在阻塞性不确定信息时，只提出针对性的澄清问题。
- 有效计划中的任务保持 `pending` 状态，并在执行前停止。
- 除非用户明确授权，否则不启用云端上下文传输。

### 记忆

- `status` 和 `show` 是只读操作。
- `scan`、`ingest`、`note` 和 `correct` 只生成提案。
- 每个提案都会展示 ID、操作、概念、权威等级、基础版本、来源和拟议内容。
- `apply` 和 `reject` 必须获得针对具体提案 ID 的明确授权。
- 不支持直接编辑 `.nplan/memory/`、物理删除或 `forget`。

## 工作原理

```text
规划
需求 → 有界上下文 → TaskSpec → TaskPlan → 校验 → 停止

记忆
来源 → 提案 → 审查 → 明确应用/拒绝 → 正式记忆
```

如果没有安装 `nplan` CLI，宿主仍可遵循插件内置的规划契约。此时 NPlanCore 会明确说明：没有执行 NPlan 运行时校验，也没有写入正式项目记忆。

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
