# NPlan

Language: English | [简体中文](README.zh-CN.md)

NPlan is a local task understanding and task decomposition module. It turns a
natural-language request into structured planning artifacts.

NPlan is intentionally planning-only. It does not execute tasks, edit files, run
shell commands, create user interfaces, or manage remote agents. Its job is to
understand the request, ground that understanding in local context, and produce a
bounded plan that another executor can review or run later.

## Core Capabilities

- Produces a validated `TaskSpec` with goal, deliverables, constraints, missing
  information, assumptions, success criteria, risk, provenance, and readiness.
- Produces a validated `TaskPlan`: a bounded DAG with task inputs, outputs,
  dependencies, and acceptance checks.
- Builds a read-only `ContextPack` from local project files before model
  inference.
- Supports OKF-style local knowledge documents.
- Uses configurable OpenAI-compatible model providers for semantic task
  understanding.

## Install

```cmd
cd /d C:\Users\qiyue\Desktop\porgram\N_online_agent
install
```

Then open CMD anywhere and run:

```cmd
nplan providers
nplan setup
nplan
```

Remove the global command:

```cmd
uninstall
```

If you run the installer from PowerShell, use `.\install.cmd`. After
installation, `nplan` is the command entry point.

## Quick Start

`nplan setup` groups canonical providers into recommended cloud, local, and
more choices. It lets you choose a provider, paste a masked API key, fetch model choices
from the provider's OpenAI-compatible model list endpoint when available, and
write `.nplan/config.toml`. That directory is ignored by git.

Run `nplan doctor` for offline configuration, API-key, and consent checks. Use
`nplan doctor --online` only when you want to test the provider's models
or read-only health endpoint. Unsafe task endpoints are rejected before fetch;
the probe sends no task or local context.

If no model is configured yet, running `nplan` in an interactive terminal starts
the same first-run setup wizard before opening the planning session. Print mode
still exits with a clear setup-required error.

Start NPlan:

```cmd
nplan
nplan "Plan the release checklist"
nplan -p "Design a local file organizer that scans files, classifies them, and writes a Markdown report"
```

The interface uses Simplified Chinese by default. Add `--lang en` for English:

```cmd
nplan --lang en "Plan the release checklist"
```

## CLI

```text
nplan [options] [prompt]

Commands:
  exec [options] [prompt]
                    Print one planning result and exit
  setup             Guided provider/API key/model setup wizard
  consent [status|revoke]
                    Show or revoke project cloud-context consent
  providers         List built-in model providers
  resume [id]       Resume a saved planning session
  doctor [--online] Check local configuration; optionally test a models/health endpoint

Options:
  -p, --print       Print one JSON result and exit
  --output-format <json|summary|text>
                    Select print-mode output format
  --input-format text
                    Accept text from argv or stdin
  -c, --continue    Continue the latest local planning session
  -r, --resume [id] Resume a saved planning session
  --model <name>    Use a model for semantic task understanding
  --provider <id>   Select a model provider
  --models-url <u>  Model list URL for guided/custom provider setup
  --config-path <p> Load model config TOML
  --config key=value
                    Override config with dotted keys
  --allow-cloud-context
                    Allow cloud context for this invocation only
  --lang <zh-CN|en> Select interface language (default: zh-CN)
  -V, --version     Show version
```

Legacy `-c key=value` config overrides still work, but `-c` by itself now
matches Claude Code and means `--continue`.

Interactive commands use concise Chinese aliases by default; the English forms
remain supported:

```text
/帮助              /help
/服务商            /providers
/状态              /status
/配置, /设置       /config, /settings
/模型 [name]       /model [name]
/上下文            /context
/来源              /sources
/步骤              /todo
/修改 <text>       /revise <text>
/导出 [path]       /export [path]
/规划 <prompt>     /plan <prompt>
/完整              /json
/压缩 [note]       /compact [note]
/清除, /重置, /新建 /clear, /reset, /new
/继续              /continue
/恢复 [id]         /resume [id]
/退出, /结束       /exit, /quit
```

`/步骤` and `/来源` are read-only views of the latest WorkPlan and its sources.
Direct text after a WorkPlan, `/revise <additional context>`, or a prompt passed
with `--resume` revises the latest plan; `/new` clears that state. `/export` is the only interactive command that writes
a new planning artifact; without a path it writes `.nplan/exports/<plan-id>.md`,
and with a path it writes the requested Markdown file. The export is an
Obsidian-friendly WorkPlan, not an executed task.

The CLI follows Claude Code's command-line interaction shape where that fits a
planning-only module: no arguments opens a session, a quoted prompt seeds a
session, `-p` prints one result, stdin can be piped into print mode, and
`--continue` / `--resume` reuse local session notes. It also keeps Codex-style
command entry points for `exec`, `resume`, and `doctor`. Sanitized session v2
records are stored under `.nplan/sessions/`, which is ignored by git. They keep
the latest result and WorkPlan so `/todo`, `/sources`, and `/export` work
immediately after resume. Evidence text, absolute paths, API keys, authorization
headers, and source contents are not persisted; v1 sessions are explicitly
incompatible rather than being restored as partial state.

Local providers run without a cloud-consent prompt. Cloud providers require
authorization before either model request. Interactive mode previews bounded
relative sources, accepts project-relative exclusions, and can remember the
provider-and-scope fingerprint in `.nplan/consent.json`. Use
`--allow-cloud-context` for one invocation only, and `nplan consent status` or
`nplan consent revoke` to inspect or remove saved project consent. Non-interactive
cloud calls without valid consent exit with code `2` before any model request.

Shell execution through `!`, file editing, tool permission modes, MCP tool
configuration, and remote-agent orchestration are intentionally unsupported.
`/export` is the explicit boundary exception: it writes a user-requested
Markdown planning artifact only, without editing source files, creating a real
PR, or executing tasks.

## Model Providers

List built-ins:

```cmd
nplan providers
```

Configure a provider:

```cmd
nplan setup
```

Supported provider families include:

- Local runtimes: `ollama`, `lmstudio`, `vllm`, `llamacpp`, `localai`
- OpenAI-compatible gateways: `openai`, `openrouter`
- Chinese providers and aliases: `dashscope`, `tongyi`, `qwen`, `deepseek`,
  `moonshot`, `kimi`, `zhipu`, `bigmodel`, `glm`, `qianfan`, `wenxin`,
  `volcengine_ark`, `doubao`, `tencent_hunyuan`, `hunyuan`, `siliconflow`,
  `minimax`, `baichuan`, `yi`, `stepfun`, `modelscope`

Some OpenAI-compatible APIs reject JSON-mode request parameters. NPlan supports
provider-level compatibility flags such as `response_format = "none"` for those
providers.

See [docs/model-providers.md](docs/model-providers.md) and
[config.example.toml](config.example.toml).

## Local Knowledge

NPlan adopts the local, vendor-neutral part of the Knowledge Catalog OKF pattern:

- Markdown with YAML frontmatter
- one concept per file
- `index.md` files for progressive disclosure
- Markdown links for relationships
- citations for sourced claims

Project-owned knowledge lives in [docs/nplan_knowledge](docs/nplan_knowledge/).
The human-facing guide is [docs/local-knowledge.md](docs/local-knowledge.md).

The upstream reference copy under `DOC/knowledge-catalog/` is kept for human
study but ignored by default context discovery so it does not crowd out this
project's own sources.

## Library Usage

```js
import { LocalPlanningAgent, OpenAICompatiblePlanningModel, loadModelConfig } from './src/index.js';

const config = await loadModelConfig();
const modelClient = new OpenAICompatiblePlanningModel({ config });
const agent = new LocalPlanningAgent({ modelClient });

const result = await agent.analyzeAsync(
  'Design a local file organizer that scans files, classifies them, and writes a Markdown report'
);

console.log(result.status);
```

## Project Layout

```text
AGENTS.md              Agent operating instructions for this repository
src/
  agent.js              LocalPlanningAgent facade
  cli.js                command-line interface
  context.js            local context discovery
  context-curator.js    source ranking and evidence pack builder
  context-policy.js     context discovery defaults
  conflicts.js          request/context conflict detection
  i18n.js               CLI locales and slash-command aliases
  model-client.js       OpenAI-compatible model client
  model-config.js       model provider configuration
  model-errors.js       safe provider error messages and next actions
  model-init.js         project config writer
  model-wizard.js       guided model setup wizard
  okf.js                OKF-style Markdown parser
  planning.js           TaskPlan DAG generation
  provenance.js         SourceRef and EvidenceItem helpers
  schemas.js            schema artifacts and constructors
  understanding.js      TaskSpec normalization
  validation.js         TaskSpec and TaskPlan validators
  work-plan.js          user-facing generic WorkPlan

docs/
  agent-design-prompt-lessons.md
  agent-module-spec.md
  local-knowledge.md
  model-providers.md
  nplan_knowledge/
```

## Development

```powershell
npm.cmd test
```

## License

MIT
