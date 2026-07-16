<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlanCore 图标" width="112">
</p>

<h1 align="center">NPlanCore</h1>

NPlanCore 是一个可移植的规划与受控项目记忆插件，可用于 Codex、Claude Code 以及其他兼容 Agent Skills 的宿主。它把模糊需求整理成可审查的 `TaskSpec`、`TaskPlan` 和 `ContextPack`，同时严格保持“只规划、不执行”的边界。

[English README](README.md)

## 核心能力

- 使用规划契约生成有边界、有依赖关系的任务计划。
- 对规划证据执行来源追踪与校验。
- 通过可预览提案和明确决策保护项目记忆。
- 同时提供 Codex 与 Claude Code 插件清单。

NPlanCore 只负责规划，不会执行生成的计划。持久化记忆更新需要单独安装 `nplan` CLI；不要直接编辑 `.nplan/memory/`。

## 目录结构

```text
.
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
├── assets/nplan-icon.svg
├── plugins/nplan-core/
│   ├── .codex-plugin/plugin.json
│   ├── .claude-plugin/plugin.json
│   └── skills/nplan-core/
├── README.md
└── README.zh-CN.md
```

此分支只保留插件、市场清单和中英文 README，不包含主项目的源码、文档或测试目录。

## Codex 安装

检出此分支后，添加本地市场并安装插件：

```text
codex plugin marketplace add <此分支检出目录的绝对路径>
codex plugin add nplan-core@nplan-local
```

通过 `$nplan-core` 调用技能。

## Claude Code 安装

本地开发模式：

```text
claude --plugin-dir ./plugins/nplan-core
```

也可以在 Claude Code 中把此检出目录添加为市场并安装：

```text
/plugin marketplace add <此分支检出目录的绝对路径>
/plugin install nplan-core@nplan-local
```

通过 `/nplan-core:nplan-core` 调用技能。

## 其他 Agent Skills 宿主

按照宿主的技能安装规范使用或复制 `plugins/nplan-core/skills/nplan-core/`。如果没有安装 `nplan` CLI，插件仍可生成符合方法约定的计划，但不能执行正式的记忆写入或 NPlan 运行时校验。

## 记忆安全规则

可使用 `nplan memory status` 和 `nplan memory show` 进行只读检查。任何记忆变更都必须先生成并展示提案；只有用户明确授权某个具体提案后，才能对该提案执行 `apply` 或 `reject`。不支持物理删除或 `forget`。
