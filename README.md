# N-Plan

Language: English | [简体中文](README.zh-CN.md)

N-Plan is a local task understanding and task decomposition module for
turning a natural-language request into structured planning artifacts.

It is intentionally planning-only. N-Plan does not execute tasks, edit files,
run shell commands, create user interfaces, or manage remote agents. Its job is
to understand the request, ground that understanding in local context, and
produce a bounded plan that another executor can review or run later.

## Core Capabilities

- Produces a validated `TaskSpec` describing the user's goal, deliverables,
  constraints, missing information, assumptions, success criteria, risk level,
  provenance, and planning readiness.
- Produces a validated `TaskPlan`: a bounded DAG with task inputs, outputs,
  dependencies, and acceptance checks.
- Builds a read-only `ContextPack` from local project files before model
  inference, including `source_map`, `evidence_map`, `context_report`, and
  `conflict_report`.
- Supports OKF-style local knowledge documents: Markdown files with YAML
  frontmatter, one concept per file, links between concepts, and citations.
- Uses configurable OpenAI-compatible model providers for semantic task
  understanding, including common local runtimes and major Chinese providers.

## Installation

N-Plan has no npm runtime dependencies.

```powershell
npm link
```

After linking, use either command:

```powershell
n-plan
nplan
nagent
```

## Quick Start

Configure a model provider:

```powershell
n-plan init --provider ollama --model qwen2.5
```

Or use a cloud provider:

```powershell
$env:DASHSCOPE_API_KEY = "<your-key>"
n-plan init --provider qwen --model qwen-plus
```

Run one planning request and print JSON:

```powershell
n-plan -p "Design a local file organizer that scans files, classifies them, and writes a Markdown report"
```

Start an interactive session:

```powershell
n-plan
```

## CLI

```text
n-plan [options] [prompt]

Commands:
  init              Configure this project for a model provider
  providers         List built-in model providers

Options:
  -p, --print       Print one JSON result and exit
  --model <name>    Use a model for semantic task understanding
  --provider <id>   Select a model provider
  --config-path <p> Load model config TOML
  -c key=value      Override config with dotted keys
```

Interactive commands:

```text
/help
/init [provider] [model]
/providers
/status
/plan <prompt>
/json
/clear
/exit
```

Shell execution through `!` is intentionally unsupported.

## Model Providers

List built-ins:

```powershell
n-plan providers
```

Supported provider families include:

- Local runtimes: `ollama`, `lmstudio`, `vllm`, `llamacpp`, `localai`
- General OpenAI-compatible gateways: `openai`, `openrouter`
- Chinese providers and aliases: `dashscope`, `tongyi`, `qwen`, `deepseek`,
  `moonshot`, `kimi`, `zhipu`, `bigmodel`, `glm`, `qianfan`, `wenxin`,
  `volcengine_ark`, `doubao`, `tencent_hunyuan`, `hunyuan`, `siliconflow`,
  `minimax`, `baichuan`, `yi`, `stepfun`, `modelscope`

Some domestic OpenAI-compatible APIs reject JSON-mode request parameters.
N-Plan supports provider-level compatibility flags such as
`response_format = "none"` for those providers.

See [docs/model-providers.md](docs/model-providers.md) and
[config.example.toml](config.example.toml).

## Local Knowledge

N-Plan adopts the local, vendor-neutral part of the Knowledge Catalog OKF
pattern:

- Markdown with YAML frontmatter
- one concept per file
- `index.md` files for progressive disclosure
- Markdown links for relationships
- citations for sourced claims

Project-owned knowledge lives in [docs/n-agent-knowledge](docs/n-agent-knowledge/).
The human-facing guide is [docs/local-knowledge.md](docs/local-knowledge.md).

The upstream reference copy under `DOC/knowledge-catalog/` is kept for human
study but ignored by default context discovery so it does not crowd out this
project's own sources.

## Library Usage

```js
import { LocalPlanningAgent, OpenAICompatibleTaskModel, loadModelConfig } from './src/index.js';

const config = await loadModelConfig();
const modelClient = new OpenAICompatibleTaskModel({ config });
const agent = new LocalPlanningAgent({ modelClient });

const result = await agent.analyzeAsync(
  'Design a local file organizer that scans files, classifies them, and writes a Markdown report'
);

console.log(result.status);
```

## Project Layout

```text
src/
  agent.js              LocalPlanningAgent facade
  cli.js                command-line interface
  context.js            local context discovery
  context-curator.js    source ranking and evidence pack builder
  context-policy.js     context discovery defaults
  conflicts.js          request/context conflict detection
  model-client.js       OpenAI-compatible model client
  model-config.js       model provider configuration
  model-init.js         project config writer
  okf.js                OKF-style Markdown parser
  planning.js           TaskPlan DAG generation
  provenance.js         SourceRef and EvidenceItem helpers
  schemas.js            schema artifacts and constructors
  understanding.js      TaskSpec normalization
  validation.js         TaskSpec and TaskPlan validators

docs/
  agent-module-spec.md
  local-knowledge.md
  model-providers.md
  n-agent-knowledge/
```

## Development

```powershell
npm test
```

For Windows PowerShell environments with restricted script execution:

```powershell
npm.cmd test
```

## License

MIT
