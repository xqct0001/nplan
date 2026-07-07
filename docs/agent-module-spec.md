# NPlan Module Spec

## Scope

`NPlan` implements the local Task Understanding and Task
Decomposition layer described by the source Word report.

The module accepts a user request plus optional local context and returns:

- `TaskSpec`: structured understanding of the user request.
- `TaskPlan`: a bounded DAG for planning only.
- `ContextPack`: read-only local sources and evidence selected before the model
  call.
- deterministic validation reports for both artifacts.

It does not execute tasks, run shell commands, edit code, use arbitrary network
tools, create a UI, or manage remote agents. Network use is limited to configured
model provider calls for semantic task understanding and user-confirmed setup
model-list requests to provider endpoints.

## JavaScript File Boundary

- `src/schemas.js`: field lists, minimal JSON Schema artifacts, constructors.
- `src/understanding.js`: deterministic `TaskSpec` compiler.
- `src/validation.js`: `TaskSpec` and `TaskPlan` guardrails.
- `src/model-config.js`: provider config, built-ins, TOML parser, and
  `--config key=value` overrides.
- `src/model-client.js`: OpenAI-compatible `responses` and `chat_completions`
  TaskSpec extraction client.
- `src/planning.js`: planner input mapping and bounded DAG generation.
- `src/agent.js`: `LocalPlanningAgent` facade.
- `src/context.js`: read-only local instruction file discovery.
- `src/context-policy.js`: context discovery defaults, extension allowlist, and
  source ranking policy.
- `src/provenance.js`: stable `SourceRef` and `EvidenceItem` construction.
- `src/okf.js`: minimal OKF-style Markdown frontmatter and link parser for
  local knowledge concepts.
- `src/context-curator.js`: Context Curator Lite that selects sources, builds
  evidence, and prepares a `context_pack` for the model.
- `src/conflicts.js`: request/context conflict detection, including
  irreversible action checkpoints and evidence-source consistency.
- `src/cli.js`: Claude-like planning command-line interaction layer.
- `src/index.js`: public exports.

## Required TaskSpec Checks

- Required fields exist.
- At least one deliverable and one success criterion are present.
- Audience, target object, output format, checkpoint policy, quality bar, and
  request-level risk are present.
- Blocking missing information cannot be marked `ready`.
- Clarification requests must include at least one question.
- Checkpoint policy must contain stop rules.
- Quality bar must contain at least one standard.
- Output format and risk level must use known values.
- Blocking context conflicts cannot enter planning.
- Every evidence item must reference an existing source id.
- Readiness score below `0.60` requires clarification.

## Required TaskPlan Checks

- Task graph is acyclic.
- Every dependency id references an existing task.
- Every task has inputs, outputs, and acceptance checks.
- Required deliverables are covered by task outputs.
- Default `max_tasks` is `12`.
- Invalid planner policy is reported in `policy_errors`.

## Fixed Agent Roles

- `Task-Decomposition Reviewer`: 5.5 xhigh, read-only review.
- `Implementation Worker`: 5.5 high, bounded implementation.
- Main integrator: synthesis, verification, Git handoff.

## Verification

Use Node.js only:

```powershell
node --test
node --check src/cli.js
node --check src/model-config.js
node --check src/model-init.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/provenance.js
```

## CLI Interaction

The CLI mirrors a safe subset of Claude Code's command-line interaction shape:

- no arguments: start an interactive session
- quoted prompt: start an interactive session with an initial prompt
- `-p` / `--print`: print one JSON result and exit
- `--output-format json|summary|text`: choose print-mode rendering
- `--input-format text`: accept text from argv or stdin
- `--continue` / `-c`: continue the latest local planning session
- `--resume` / `-r [id]`: resume a saved local planning session
- `setup`: guided provider/API key/model configuration
- Windows CMD wrappers allow extension-free commands such as `install`,
  `setup`, `run`, and local/global `nplan`
- piped stdin with print mode: include stdin as additional prompt context
- slash commands: `/help`, `/providers`, `/status`, `/config`, `/settings`,
  `/model`, `/context`, `/plan`, `/json`, `/compact`, `/clear`, `/reset`,
  `/new`, `/continue`, `/resume`, `/exit`, `/quit`
- interactive mode shows a concise planning summary; `/json` shows the full
  structured result
- local session notes are stored under `.nplan/sessions/` and contain planning
  prompts, statuses, goals, deliverable names, and task counts only
- config overrides use `--config key=value`; legacy `-c key=value` remains
  accepted for compatibility

Unsupported on purpose:

- shell execution via `!`
- file editing
- command execution
- Claude Code tool permission flags such as `--permission-mode` and
  `--dangerously-skip-permissions`
- MCP tool configuration
- remote agent management

Those features conflict with this module's planning-only boundary.

## Model Integration

Semantic task understanding requires a configured model provider. The local
rule compiler is retained as an internal normalizer for model drafts and tests,
but it is not used as a no-model runtime fallback for producing plans:

- `openai`: Responses API
- `openrouter`: chat completions
- `ollama`: chat completions
- `lmstudio`: chat completions
- local OpenAI-compatible servers: `vllm`, `llamacpp`, `localai`
- Chinese OpenAI-compatible providers and aliases: `dashscope`, `tongyi`,
  `qwen`, `deepseek`, `moonshot`, `kimi`, `zhipu`, `bigmodel`, `glm`,
  `qianfan`, `wenxin`, `volcengine_ark`, `doubao`, `tencent_hunyuan`,
  `hunyuan`, `siliconflow`, `minimax`, `baichuan`, `yi`, `stepfun`,
  `modelscope`
- custom OpenAI-compatible providers through `model_providers.<id>`

Config shape follows NPlan's OpenAI-compatible provider TOML configuration:

```toml
model = "qwen-plus"
model_provider = "dashscope"

[model_providers.dashscope]
base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
env_key = "DASHSCOPE_API_KEY"
wire_api = "chat_completions"
```

When the model succeeds, `TaskSpec.provenance.model_used` is `true`. If no model
is configured, interactive mode starts and tells the user to run `nplan setup`,
while print mode exits with a model-required error. If a configured model call
fails or returns invalid JSON, the analysis fails instead of falling back to
local rules.

## Context Curator Lite

Before calling the model, `LocalPlanningAgent.analyzeAsync()` enriches the
local context through `curateContext()`:

```text
request + collectContext()
  -> source_map
  -> evidence_map
  -> context_pack
  -> context_report
  -> conflict_report
  -> configured model
  -> TaskSpec
  -> validation gate
  -> TaskPlan
```

This is intentionally a lightweight implementation of the report's recommended
context governance layer. It does not introduce remote retrieval, multi-agent
protocols, vector search, or model-free task parsing. It gives the model better
grounding while keeping provenance, conflict checks, and planning gates local
and testable.

## OKF-Style Local Knowledge

NPlan adopts the useful local pieces of the Knowledge Catalog OKF pattern:
Markdown files with YAML frontmatter, one concept per file, index files for
navigation, Markdown links for relationships, and citations for sourced claims.

The project-owned bundle lives in `docs/nplan_knowledge/`. The human-facing
guide is `docs/local-knowledge.md`. Files with a frontmatter `type` field are
classified as `knowledge` sources, and their title, description, tags, and body
excerpt are included in evidence text. Large external reference repositories
such as `DOC/knowledge-catalog/` remain available for human study but are
ignored by the default context scan so they do not crowd out project-owned
sources.
