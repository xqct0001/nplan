# local-task-agent-js

Local Task Understanding and Task Decomposition agent in JavaScript.

`local-task-agent-js` turns a natural-language request into two verified
planning artifacts:

- `TaskSpec`: what the user is asking for, including deliverables,
  constraints, missing information, assumptions, success criteria,
  clarification state, and planning readiness.
- `TaskPlan`: a bounded task DAG with task inputs, outputs, dependencies, and
  acceptance checks.

The project is intentionally local and deterministic. It does not execute
tasks, edit files, call the network, create a UI, or manage remote agents.

## Why This Exists

The source requirement was a local Word report about a Task Understanding and
Task Decomposition Agent module. The implementation keeps the report's
boundary: understand and decompose tasks only. Execution belongs to a future
external executor.

## Project Structure

```text
src/
  agent.js          LocalPlanningAgent facade
  cli.js            Claude Code-like CLI
  context.js        Read-only local context discovery
  index.js          Public exports
  planning.js       Planner input and TaskPlan DAG generation
  schemas.js        Field lists, JSON Schema artifacts, constructors
  understanding.js  TaskSpec compiler
  validation.js     TaskSpec and TaskPlan validators
test/
  core.test.js      Node built-in test suite
  model-*.test.js   Model provider and semantic understanding tests
docs/
  agent-module-spec.md
  model-providers.md
```

## Requirements

- Node.js 22 or newer is recommended.
- No npm dependencies are required.

## Install

No install step is required for local development.

```powershell
node --test
```

If you prefer npm on Windows PowerShell and script execution is restricted,
use `npm.cmd test` instead of `npm test`.

## CLI Usage

```powershell
node ./src/cli.js
```

The CLI follows a small Claude Code-like interaction model:

```powershell
# Start an interactive session
node ./src/cli.js

# Start an interactive session with an initial prompt
node ./src/cli.js "implement TaskSpec schema and DAG verifier"

# Print one JSON result and exit
node ./src/cli.js -p "implement TaskSpec schema and DAG verifier"

# Process piped content in print mode
Get-Content .\logs.txt | node ./src/cli.js -p "summarize planning signals"
```

Interactive commands:

```text
/help             Show commands
/status           Show session status
/plan <prompt>    Analyze a prompt and print the plan JSON
/clear            Clear the last result
/exit, /quit      Exit the session
```

Plain text in interactive mode behaves like `/plan <prompt>`. Shell execution
with `!` is intentionally unsupported because this project is planning-only.
Ready requests include `taskspec`, `planner_input`, `taskplan`,
`taskspec_report`, and `taskplan_report`. Vague requests return clarification
questions and do not produce a task plan.

## Model Providers

The understanding layer can use OpenAI-compatible model providers before
falling back to local rules. This fixes the earlier narrow keyword parser
problem for requests such as:

```text
帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件
```

Supported built-ins:

- `openai`
- `openrouter`
- `ollama`
- `lmstudio`

Custom providers use the same config shape. See
[docs/model-providers.md](docs/model-providers.md) and
[config.example.toml](config.example.toml).

Examples:

```powershell
# OpenAI
$env:OPENAI_API_KEY = "<your-key>"
node ./src/cli.js --model gpt-5.5 --provider openai -p "Design a file organizer"

# OpenRouter
$env:OPENROUTER_API_KEY = "<your-key>"
node ./src/cli.js --model "anthropic/claude-sonnet-4" --provider openrouter -p "Design a file organizer"

# Ollama
node ./src/cli.js --model qwen2.5 --provider ollama -p "Design a file organizer"

# Custom OpenAI-compatible endpoint
node ./src/cli.js --model my-model --provider custom --base-url http://127.0.0.1:8000/v1 --wire-api chat_completions -p "Design a file organizer"
```

Codex-style config overrides are supported:

```powershell
node ./src/cli.js -c model=qwen-plus -c model_provider=dashscope --config-path .\config.example.toml -p "设计文件整理工具"
```

## Library Usage

```js
import { LocalPlanningAgent } from './src/index.js';

const agent = new LocalPlanningAgent();
const result = agent.analyze(
  'implement TaskSpec schema, TaskSpec verifier, TaskPlan schema, and DAG verifier'
);

console.log(result.status);
```

## Validation Rules

`validateTaskSpec()` checks:

- required fields
- deliverables and success criteria
- blocking missing information versus `ready`
- clarification question consistency
- low readiness score handling

`validateTaskPlan()` checks:

- DAG cycles
- missing dependency references
- task input/output presence
- task acceptance checks
- required deliverable coverage
- task count limit
- invalid planner policy values

## Git

Suggested repository name:

```text
local-task-agent-js
```

Initialize and commit:

```powershell
git init
git add .
git commit -m "feat: add local task agent js"
```

Push after creating a remote repository:

```powershell
git remote add origin <remote-url>
git branch -M main
git push -u origin main
```

## License

MIT.

---

# local-task-agent-js 中文说明

`local-task-agent-js` 是一个本地任务理解与任务拆分 Agent 模块，使用
JavaScript 实现。

它把用户的自然语言请求转换成两个经过校验的规划产物：

- `TaskSpec`：描述用户到底想要什么，包括交付物、约束、缺失信息、假设、
  成功标准、澄清状态和是否可以进入规划。
- `TaskPlan`：一个有边界的任务 DAG，包含每个任务的输入、输出、依赖关系和
  验收标准。

本项目只负责“理解任务”和“拆分任务”。它不会执行任务、修改文件、运行命令、
联网、创建 UI，也不会管理远程 Agent。

## 来源

需求来自本地 Word 研究报告。本实现严格保留报告边界：只输出 `TaskSpec` 和
`TaskPlan`，执行器留给未来外部模块。

## 目录结构

```text
src/
  agent.js          LocalPlanningAgent 统一入口
  cli.js            Claude Code 风格命令行入口
  context.js        只读本地上下文发现
  index.js          对外导出
  planning.js       PlannerInput 与 TaskPlan DAG 生成
  schemas.js        字段列表、JSON Schema、构造函数
  understanding.js  TaskSpec 编译器
  validation.js     TaskSpec / TaskPlan 校验器
test/
  core.test.js      Node 内置测试
  model-*.test.js   模型 Provider 与语义理解测试
docs/
  agent-module-spec.md
  model-providers.md
```

## 环境要求

- 推荐 Node.js 22 或更新版本。
- 不需要安装任何 npm 依赖。

## 运行测试

```powershell
node --test
```

如果在 Windows PowerShell 中使用 `npm test` 被执行策略拦截，可以改用：

```powershell
npm.cmd test
```

## 命令行使用

```powershell
node ./src/cli.js
```

CLI 现在使用一个精简的 Claude Code 风格交互：

```powershell
# 进入交互式 session
node ./src/cli.js

# 带初始 prompt 进入交互式 session
node ./src/cli.js "implement TaskSpec schema and DAG verifier"

# 一次性输出 JSON 后退出
node ./src/cli.js -p "implement TaskSpec schema and DAG verifier"

# 在 print mode 中处理管道输入
Get-Content .\logs.txt | node ./src/cli.js -p "summarize planning signals"
```

交互命令：

```text
/help             显示命令
/status           显示 session 状态
/plan <prompt>    分析 prompt 并输出 plan JSON
/clear            清空上一次结果
/exit, /quit      退出 session
```

交互模式里的普通文本等同于 `/plan <prompt>`。`!` shell 执行被刻意禁用，因为
本项目只负责规划，不负责执行任务。如果请求足够明确，输出会包含 `taskspec`、
`planner_input`、`taskplan`、`taskspec_report` 和 `taskplan_report`。如果请求太
模糊，只返回澄清问题，不会生成任务计划。

## 模型 Provider

理解层现在可以先调用 OpenAI-compatible 模型 Provider，再回退到本地规则。这解决了
早期关键词解析过窄的问题，例如：

```text
帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件
```

内置 Provider：

- `openai`
- `openrouter`
- `ollama`
- `lmstudio`

自定义 Provider 使用同一套配置。查看
[docs/model-providers.md](docs/model-providers.md) 和
[config.example.toml](config.example.toml)。

示例：

```powershell
# OpenAI
$env:OPENAI_API_KEY = "<your-key>"
node ./src/cli.js --model gpt-5.5 --provider openai -p "Design a file organizer"

# OpenRouter
$env:OPENROUTER_API_KEY = "<your-key>"
node ./src/cli.js --model "anthropic/claude-sonnet-4" --provider openrouter -p "Design a file organizer"

# Ollama
node ./src/cli.js --model qwen2.5 --provider ollama -p "Design a file organizer"

# 自定义 OpenAI-compatible endpoint
node ./src/cli.js --model my-model --provider custom --base-url http://127.0.0.1:8000/v1 --wire-api chat_completions -p "Design a file organizer"
```

支持 Codex 风格配置覆盖：

```powershell
node ./src/cli.js -c model=qwen-plus -c model_provider=dashscope --config-path .\config.example.toml -p "设计文件整理工具"
```

## 代码使用

```js
import { LocalPlanningAgent } from './src/index.js';

const agent = new LocalPlanningAgent();
const result = agent.analyze(
  'implement TaskSpec schema, TaskSpec verifier, TaskPlan schema, and DAG verifier'
);

console.log(result.status);
```

## 校验范围

`validateTaskSpec()` 会检查：

- 必填字段
- 交付物和成功标准
- 阻塞缺失信息是否被错误标记为 `ready`
- 澄清问题一致性
- 低 readiness 分数处理

`validateTaskPlan()` 会检查：

- DAG 是否有环
- 依赖 ID 是否缺失
- 每个任务是否有输入和输出
- 每个任务是否有验收标准
- 必需交付物是否被覆盖
- 任务数量上限
- planner policy 非法值

## Git

建议仓库名：

```text
local-task-agent-js
```

本地初始化并提交：

```powershell
git init
git add .
git commit -m "feat: add local task agent js"
```

创建远程仓库后推送：

```powershell
git remote add origin <remote-url>
git branch -M main
git push -u origin main
```

## 许可证

MIT。
