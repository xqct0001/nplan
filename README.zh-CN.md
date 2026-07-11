<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlan 图标" width="112">
</p>

<h1 align="center">NPlan</h1>

<p align="center"><strong>把模糊需求转成可检查、可修改、可导出的工作计划。</strong></p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

NPlan 是一个本地规划 CLI。它读取有边界的项目上下文，澄清需求，并生成经过校验的规划产物：`TaskSpec`、`TaskPlan`、`ContextPack` 和面向用户的 `WorkPlan`。

> [!IMPORTANT]
> NPlan 只负责规划。它不会执行任务、运行 Shell 命令、修改源文件、生成 UI，也不会管理远程 Agent。

## 快速开始

环境要求：Windows 和 Node.js LTS。

在项目目录中打开 CMD：

```cmd
install.cmd
nplan setup
nplan "为这个项目规划一份发布检查清单"
```

如果使用 PowerShell，请运行 `.\install.cmd`。配置向导会把当前项目的设置写入 `.nplan/config.toml`，该目录不会被 Git 跟踪。

## 工作方式

```text
用户需求
  → 只读 ContextPack
  → 已校验 TaskSpec
  → 有边界的 TaskPlan DAG
  → 已校验 WorkPlan
```

如果缺少必要信息，NPlan 会先请求澄清，不会自行补全计划。任务就绪后，需求理解和任务规划分别调用模型，最后在本地完成校验。

## 核心能力

- 默认使用简体中文，可通过 `--lang en` 切换英文。
- 支持兼容 OpenAI 接口的云端与本地模型服务商。
- 只读收集本地上下文，并保留稳定的来源与证据编号。
- 向云端发送本地上下文前，需要按项目和范围确认授权。
- 本地会话经过脱敏，支持继续、恢复、修改和 Markdown 导出。
- 本地校验完整性、来源一致性、DAG 合法性和交付物覆盖情况。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `nplan setup` | 配置服务商、API Key 和模型。 |
| `nplan providers` | 查看内置模型服务商。 |
| `nplan doctor` | 在不联网的情况下检查本地配置。 |
| `nplan doctor --online` | 探测允许的只读模型列表或健康接口。 |
| `nplan "<需求>"` | 使用初始需求开始交互式规划。 |
| `nplan -p --output-format summary "<需求>"` | 输出一次精简规划结果。 |
| `nplan -c` | 继续最近的本地会话。 |
| `nplan resume [编号]` | 恢复已保存的会话。 |
| `nplan consent status` | 查看云端上下文授权状态。 |
| `nplan consent revoke` | 撤销已保存的云端上下文授权。 |

进入交互会话后，使用 `/帮助` 或 `/help` 查看命令。常用操作包括 `/修改`、`/来源`、`/步骤`、`/导出`、`/继续` 和 `/恢复`。

## 常见用法

交互式规划：

```cmd
nplan "把 v0.3 发布工作拆成可审查的任务"
```

一次输出摘要：

```cmd
nplan -p --output-format summary "规划一次安全的数据库迁移"
```

使用英文界面：

```cmd
nplan --lang en "Plan the release checklist"
```

## 模型、安全与隐私

运行 `nplan setup` 选择服务商。推荐的云端选项包括 DeepSeek、DashScope、Kimi、智谱 AI 和豆包；本地选项包括 Ollama 和 LM Studio。也可以配置其他兼容 OpenAI 接口的服务商。

- 本地服务商不需要云端上下文授权。
- 云端服务商在两次规划请求前都需要有效的项目与范围授权。
- 非交互式云端调用需要已保存授权，或使用仅本次有效的 `--allow-cloud-context`。
- 在 `nplan doctor` 命令中，只有指定 `--online` 才会发起网络探测。
- 脱敏会话保存在 `.nplan/sessions/`，不包含源文件内容、证据文本、凭据或授权值。

## 文档

- [模块契约](docs/agent-module-spec.md)
- [模型服务商](docs/model-providers.md)
- [本地知识库](docs/local-knowledge.md)
- [规划与 Obsidian 工作流](docs/nplan_process_task_obsidian.md)
- [项目知识索引](docs/nplan_knowledge/index.md)

## 许可证

[MIT](LICENSE)
