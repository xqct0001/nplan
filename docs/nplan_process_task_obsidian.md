---
title: NPlan 进程与任务使用说明
tags:
  - nplan
  - process
  - task
  - obsidian
---

# NPlan 进程与任务使用说明

这份文档用于在 Obsidian 中阅读。Obsidian 可以直接渲染下面的 Mermaid 图，用来查看
NPlan 的启动进程、任务处理链路和主要模块关系。

## 适用场景

- 想知道 `nplan` 启动后内部发生了什么。
- 想区分“进程”和“任务”在本项目里的含义。
- 想用 Obsidian 图形化查看 CLI、模型、上下文、TaskSpec、TaskPlan 的关系。

## 核心概念

| 名称 | 含义 |
| --- | --- |
| 进程 | 用户执行 `nplan` 后启动的 Node.js CLI 进程。它负责读取输入、加载配置、维持交互会话。 |
| 任务 | 用户输入的一段自然语言请求，例如“帮我设计文件整理工具”。任务不会被执行，只会被理解和拆分。 |
| TaskSpec | 对用户请求的结构化理解，包含目标、交付物、约束、缺失信息、风险和成功标准。 |
| TaskPlan | 从 TaskSpec 生成的有向无环任务图，包含任务输入、输出、依赖和验收标准。 |
| ContextPack | 只读收集到的项目上下文和证据包，供模型理解任务时参考。 |

## 总体结构图

```mermaid
flowchart TD
  User["用户"]
  Shell["终端"]
  CLI["nplan CLI 进程<br/>src/cli.js"]
  Config["模型配置<br/>.nplan/config.toml"]
  Agent["LocalPlanningAgent<br/>src/agent.js"]
  Context["Context Curator<br/>src/context-curator.js"]
  Model["OpenAI-compatible 模型<br/>src/model-client.js"]
  Spec["TaskSpec<br/>结构化任务理解"]
  SpecCheck["TaskSpec 校验<br/>src/validation.js"]
  Planner["TaskPlan 生成<br/>src/planning.js"]
  Plan["TaskPlan DAG"]
  PlanCheck["TaskPlan 校验<br/>src/validation.js"]
  Summary["交互摘要<br/>/json 查看完整结果"]

  User --> Shell
  Shell --> CLI
  CLI --> Config
  CLI --> Agent
  Agent --> Context
  Context --> Model
  Model --> Spec
  Spec --> SpecCheck
  SpecCheck -->|"ready"| Planner
  SpecCheck -->|"needs clarification"| Summary
  Planner --> Plan
  Plan --> PlanCheck
  PlanCheck --> Summary
```

## 启动流程

```mermaid
sequenceDiagram
  participant U as 用户
  participant C as nplan CLI
  participant F as .nplan/config.toml
  participant A as LocalPlanningAgent

  U->>C: nplan
  C->>F: 读取模型配置
  alt 已配置模型
    C->>A: 创建 Agent runtime
    C-->>U: 进入交互模式
  else 未配置模型
    C-->>U: 提示执行 /init 或 nplan init
  end
```

## 任务处理流程

```mermaid
flowchart LR
  Input["用户输入任务"]
  Clean["清理 prompt"]
  Collect["只读收集上下文"]
  ModelDraft["模型抽取 TaskSpec draft"]
  Compose["合成正式 TaskSpec"]
  ValidateSpec{"TaskSpec 是否 ready"}
  Clarify["返回澄清问题"]
  BuildInput["构造 PlannerInput"]
  BuildPlan["生成 TaskPlan DAG"]
  ValidatePlan{"TaskPlan 是否 valid"}
  Planned["状态: planned"]
  Invalid["状态: plan_invalid"]

  Input --> Clean
  Clean --> Collect
  Collect --> ModelDraft
  ModelDraft --> Compose
  Compose --> ValidateSpec
  ValidateSpec -->|"否"| Clarify
  ValidateSpec -->|"是"| BuildInput
  BuildInput --> BuildPlan
  BuildPlan --> ValidatePlan
  ValidatePlan -->|"是"| Planned
  ValidatePlan -->|"否"| Invalid
```

## 交互方式

启动：

```powershell
nplan
```

进入后可以直接输入任务：

```text
nplan> 帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `/help` | 查看命令帮助 |
| `/providers` | 查看内置模型 Provider |
| `/init ollama qwen2.5` | 初始化本地模型配置 |
| `/status` | 查看会话状态 |
| `/plan <prompt>` | 显式分析一个任务 |
| `/json` | 查看上一轮完整 JSON 结果 |
| `/clear` | 清除上一轮结果 |
| `/exit` | 退出进程 |

## 任务状态

```mermaid
stateDiagram-v2
  [*] --> Input
  Input --> Understanding: 调用模型理解任务
  Understanding --> NeedsClarification: 缺少阻塞信息
  Understanding --> Planning: TaskSpec ready
  NeedsClarification --> Input: 用户补充信息
  Planning --> Planned: TaskPlan valid
  Planning --> PlanInvalid: TaskPlan 校验失败
  Planned --> [*]
  PlanInvalid --> Input
```

| 状态 | 说明 |
| --- | --- |
| `needs_clarification` | 任务信息不够明确，只返回澄清问题，不生成 TaskPlan。 |
| `planned` | TaskSpec 和 TaskPlan 都通过校验，规划成功。 |
| `plan_invalid` | 已生成 TaskPlan，但校验失败，需要修正规划逻辑或输入。 |

## 边界

NPlan 只负责规划，不负责执行：

- 不执行 shell 命令。
- 不修改用户文件。
- 不部署、不发送、不购买、不提交。
- 不管理远程 Agent。
- 只在任务理解阶段调用已配置的模型 Provider。

## 文件入口

| 文件 | 作用 |
| --- | --- |
| `src/cli.js` | CLI 进程入口和交互循环 |
| `src/agent.js` | Agent 主流程 |
| `src/context-curator.js` | 只读上下文整理 |
| `src/model-client.js` | OpenAI-compatible 模型调用 |
| `src/understanding.js` | TaskSpec 组合与规范化 |
| `src/planning.js` | TaskPlan DAG 生成 |
| `src/validation.js` | TaskSpec / TaskPlan 校验 |
| `.nplan/config.toml` | 项目模型配置 |
