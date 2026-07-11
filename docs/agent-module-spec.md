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
tools, create a UI, or manage remote agents. Network use is limited to:

- configured provider calls for TaskSpec understanding and TaskPlan generation;
- user-confirmed setup requests to a provider model-list endpoint; and
- one explicit `doctor --online` GET probe to an allowlisted read-only
  `models`, `health`, `healthz`, `status`, `ready`, or `readiness` endpoint
  whose path contains no task, chat, completion, response, message, or
  embedding route segment. The probe never follows redirects, treats any 3xx
  as unsafe, discards the response body, and accepts any 2xx without requiring
  JSON. Path validation performs up to three bounded decode rounds and rejects
  encoded separators, malformed escapes, and invalid UTF-8.

The doctor probe sends no task request or local context.

## v0.2 Public Contract

- Simplified Chinese is the default interface; `--lang en` selects English.
- A ready request uses one model operation for TaskSpec understanding and one
  for TaskPlan generation. Clarification stops after understanding, and an
  invalid TaskPlan is reported without a third model operation.
- The user-facing view and Markdown export are generic WorkPlan artifacts.
- Cloud providers require project-scoped context consent before either model
  operation. Local providers require no cloud consent.
- Session v2 restores sanitized results and WorkPlan data without evidence
  text, source contents, absolute paths, credentials, or authorization values.
  Every restored WorkPlan is revalidated; invalid saved plans are quarantined
  as unavailable and cannot reach revision summaries, views, or export.
- `doctor` is offline; only explicit `doctor --online` performs the bounded
  read-only provider probe described above.

Compatibility is intentionally breaking: session v1 is not loaded, the v0.1
pull-request-specific rendering surface is removed, and non-interactive cloud
print use needs saved consent or `--allow-cloud-context`.

## JavaScript File Boundary

- `src/schemas.js`: field lists, minimal JSON Schema artifacts, constructors.
- `src/understanding.js`: deterministic `TaskSpec` compiler.
- `src/validation.js`: `TaskSpec` and `TaskPlan` guardrails.
- `src/model-config.js`: provider config, built-ins, canonical setup groups, TOML parser, and
  `--config key=value` overrides.
- `src/model-errors.js`: safe provider-error classification and localized next actions.
- `src/model-client.js`: OpenAI-compatible `responses` and `chat_completions`
  TaskSpec extraction client.
- `src/planning.js`: planner input mapping and bounded DAG generation.
- `src/agent.js`: `LocalPlanningAgent` facade.
- `src/context.js`: read-only local instruction file discovery.
- `src/context-policy.js`: context discovery defaults, extension allowlist,
  project-relative exclusions, and source ranking policy.
- `src/consent.js`: project-scoped cloud-context consent fingerprints,
  privacy-safe previews, and local consent-record persistence.
- `src/provenance.js`: stable `SourceRef` and `EvidenceItem` construction.
- `src/okf.js`: minimal OKF-style Markdown frontmatter and link parser for
  local knowledge concepts.
- `src/context-curator.js`: Context Curator Lite that selects sources, builds
  evidence, and prepares a `context_pack` for the model.
- `src/conflicts.js`: request/context conflict detection, including
  irreversible action checkpoints and evidence-source consistency.
- `src/cli.js`: Claude-like planning command-line interaction layer.
- `src/session-store.js`: atomic, sanitized session v2 persistence and resume
  hydration for the latest planning result and WorkPlan.
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

Only `planned` results may expose WorkPlan steps or plan-level acceptance.
Clarification and invalid-plan results keep both lists empty. All WorkPlan
rendering, persistence, restoration, and export boundaries re-run validation.

## Fixed Agent Roles

- `Task-Decomposition Reviewer`: 5.5 xhigh, read-only review.
- `Implementation Worker`: 5.5 high, bounded implementation.
- Main integrator: synthesis, verification, Git handoff.

## Verification

Use Node.js only. Public clones can run syntax checks:

```powershell
node --check src/cli.js
node --check src/model-config.js
node --check src/model-init.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/provenance.js
```

Maintainers with the private local `test/` directory can additionally run:

```powershell
node --test
```

## CLI Interaction

The CLI mirrors a safe subset of Claude Code's command-line interaction shape:

- no arguments: start an interactive session
- quoted prompt: start an interactive session with an initial prompt
- `exec [prompt]`: Codex-style one-shot print mode
- `-p` / `--print`: print one JSON result and exit
- `--output-format json|summary|text`: choose print-mode rendering
- `--input-format text`: accept text from argv or stdin
- `--lang zh-CN|en`: use Simplified Chinese by default or opt into English
- `--allow-cloud-context`: authorize cloud context for this invocation only
- `--continue` / `-c`: continue the latest local planning session
- `--resume` / `-r [id]`: resume a saved local planning session
- `resume [id]`: Codex-style session resume command
- `--version` / `-V`: print the installed CLI version
- `doctor`: print offline local config/key/consent diagnostics without executing tasks
- `doctor --online`: send one GET probe only to an allowlisted read-only provider health endpoint
- `consent [status|revoke]`: inspect or revoke project cloud-context consent
- `setup`: guided provider/API key/model configuration
- first interactive TTY launch with no configured model starts the same guided
  setup before opening the planning session
- Windows CMD wrappers install and remove the global CLI through `install` and
  `uninstall`; after installation the normal entry point is `nplan`
- piped stdin with print mode: include stdin as additional prompt context
- slash commands: `/help`, `/providers`, `/status`, `/config`, `/settings`,
  `/model`, `/context`, `/sources`, `/todo`, `/revise`, `/export`, `/plan`,
  `/json`, `/compact`, `/clear`, `/reset`, `/new`, `/continue`, `/resume`,
  `/exit`, `/quit`
- complete Chinese aliases are available for the same commands, including
  argument-bearing forms such as `/规划 <任务>`, `/修改 <补充说明>`, and
  `/导出 [路径]`
- interactive mode shows a concise planning summary; `/json` shows the full
  structured result
- `/sources` and `/todo` are read-only views over the latest planning result;
  `/revise <additional context>` replans from that latest result with extra
  user context; `/export [path]` writes an Obsidian-friendly Markdown planning
  note either to `.nplan/exports/<plan-id>.md` or to the user-specified path
- sanitized session v2 records are stored atomically under `.nplan/sessions/`;
  they restore `last_result` and `last_work_plan`, but exclude evidence text,
  source contents, absolute paths, API keys, and authorization values
- session v1 is explicitly incompatible and is never silently normalized to v2
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

Explicit `/export` writes a user-requested Markdown planning artifact. This is
the only product write introduced for the hybrid CLI workflow and does not
execute tasks, edit source files, or create pull requests.

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
is configured, first interactive TTY launch starts `nplan setup` before opening
the planning session. Non-TTY interactive mode still starts and tells the user
to run `nplan setup`, while print mode exits with a model-required error. If a
configured model call fails or returns invalid JSON, the analysis fails instead
of falling back to local rules.

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

`context_policy.user_exclusions` accepts project-relative files or directories.
Exclusions are applied before source contents are read and are returned as part
of the effective context policy. The explicitly supplied project root is
resolved once, so a linked project root can scan `.` normally. Symbolic links
or junctions encountered through root files, other scan directories, or
recursive entries are not followed, so aliases cannot bypass ignore or
extension rules.

Cloud-context consent records are stored at `.nplan/consent.json`. They contain
only the provider id and base URL, a fingerprint of the bounded context scope,
the confirmation time, and sorted exclusions. They do not contain API keys,
task text, evidence text, or absolute source paths. Provider or effective scope
changes invalidate the saved consent. The fingerprint covers root files, scan
directories, extension and ignore rules, parser version, core-source ranking,
source priorities, budgets, and exclusions. Consent base URLs cannot contain
credentials, query strings, or fragments.

The CLI checks this consent before either model operation. Local providers skip
the prompt. Interactive cloud use shows a relative-path preview, can re-curate
after project-relative exclusions, and can remember the resulting scope.
Non-interactive cloud use without saved consent or `--allow-cloud-context`
returns exit code `2` before any provider request. Direct interactive text or a
prompt supplied with `--resume` is treated as a revision when a WorkPlan exists;
`/new` clears that state.

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
