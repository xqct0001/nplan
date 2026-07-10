# NPlan v0.2 Product Completion Design

## Goal

Turn NPlan from a developer-facing planning kernel into a concise Chinese-first
planning product while preserving its planning-only boundary. A user should be
able to enter a natural-language task, understand what local context may leave
the machine, receive a concrete validated action plan, revise it naturally,
resume it later, and export a generic Markdown plan without learning internal
schema or PR terminology.

## Confirmed Product Decisions

- Deliver the full P0, P1, and P2 audit scope in one v0.2 release.
- Breaking changes are allowed. Remove PRPlan and English-first defaults.
- Default language is Simplified Chinese; `--lang en` enables English.
- A cloud provider requires project-level context consent before the first
  model request. Consent is invalidated when the provider or scan scope changes.
- Local providers do not require consent because data stays on the machine.
- Task understanding and task planning use two separate model calls.
- Invalid model-generated TaskPlan output is reported; v0.2 does not add an
  automatic third model call.
- Package version becomes `0.2.0`.

## Product Boundary

NPlan remains planning-only. It may:

- read allowed local project files for context;
- call the configured model after the required consent gate;
- validate `TaskSpec`, `TaskPlan`, and `WorkPlan` locally;
- persist sanitized planning sessions and project consent;
- export an explicitly requested Markdown planning artifact.

It must not execute tasks, run shell commands for users, edit project source,
deploy, purchase, send messages, create branches or pull requests, manage remote
agents, or add browser automation.

## Architecture

The pipeline becomes:

```text
user request
  -> curate local context
  -> cloud-context consent gate
  -> model call 1: TaskSpec draft
  -> compose and validate TaskSpec locally
  -> if clarification is required: WorkPlan clarification view
  -> model call 2: TaskPlan draft
  -> normalize and validate TaskPlan locally
  -> derive generic WorkPlan
  -> render Chinese summary / persist sanitized session / optional export
```

### Core Contracts

`TaskSpec` remains the contract for intent, constraints, deliverables, missing
information, quality, risk, provenance, and readiness.

`TaskPlan` remains a bounded DAG. The JSON Schema will define nested task fields
strictly enough for model structured output. Each task requires:

- stable id;
- action-oriented title in the requested language;
- one task goal;
- inputs and outputs;
- valid dependency ids;
- task-level acceptance checks;
- complexity, risk, model tier, state, and optional parallel group.

`WorkPlan` replaces PRPlan as the user-facing view:

```js
{
  version: '1.0',
  plan_id: '20260710-beijing-family-trip',
  session_id: '20260710120000-abcd1234',
  status: 'planned',
  language: 'zh-CN',
  conclusion: '...',
  questions: [],
  steps: [],
  acceptance: [],
  source_summary: [],
  next_actions: []
}
```

It is derived locally from validated artifacts. It does not replace TaskSpec or
TaskPlan and does not introduce execution state beyond `pending` planning items.

### Model Client

The public model client becomes one planning client with two methods:

```js
understandTask({ request, context })
planTask({ taskspec, context })
```

Both calls use the existing OpenAI-compatible provider transport. The TaskPlan
prompt requires concrete verb-first tasks, explicit dependencies, coverage of
all required deliverables, the TaskSpec language, and no execution claims.

The second call receives a bounded planner context: the validated TaskSpec,
selected evidence references, and planner policy. It must not receive a second
unbounded repository scan.

### Module Boundaries

- `src/schemas.js`: strict TaskPlan schema and WorkPlan field constants.
- `src/understanding.js`: TaskSpec normalization only.
- `src/planning.js`: TaskPlan prompt input and model-draft normalization; remove
  the local `Define <deliverable>` generator.
- `src/validation.js`: TaskSpec, TaskPlan, and WorkPlan validation.
- `src/model-client.js`: shared provider transport plus both model methods.
- `src/agent.js`: two-call orchestration and validation gates.
- `src/work-plan.js`: WorkPlan derivation, todo/source rendering, and generic
  Chinese or English Markdown export.
- `src/consent.js`: provider/scope fingerprinting, consent persistence, preview,
  revoke, and one-shot authorization.
- `src/i18n.js`: message dictionaries and locale resolution.
- `src/model-errors.js`: stable model error classification and user guidance.
- `src/cli.js`: command parsing and interaction only; use the new modules rather
  than adding more rendering and persistence logic inline.
- `src/model-wizard.js`: grouped provider selection and secret input.
- `src/pr-plan.js`: delete.

## Chinese-First Interaction

Default startup is concise:

```text
NPlan 规划助手
直接输入任务；输入 /帮助 查看命令。
nplan>
```

English remains available through `--lang en`. Command names retain their
English forms for automation and gain Chinese aliases:

- `/help`, `/帮助`
- `/status`, `/状态`
- `/sources`, `/来源`
- `/todo`, `/步骤`
- `/revise`, `/修改`
- `/export`, `/导出`
- `/new`, `/新建`
- `/exit`, `/退出`

Direct text entered after a visible plan is treated as additional context for
that plan. `/new` explicitly starts a new planning task.

The default result contains only:

```text
结论
需要确认
行动步骤
验收标准
下一步
```

Internal status names, raw ids, absolute paths, and JSON are available only
through explicit diagnostic commands.

## Provider Setup

The normal wizard shows canonical providers in three groups:

1. Recommended China providers: DeepSeek, DashScope/Qwen, Kimi, GLM, Doubao.
2. Local providers: Ollama and LM Studio.
3. More: the remaining canonical providers and custom endpoint setup.

Aliases remain readable from existing configuration but are hidden from normal
selection lists. Invalid input re-prompts instead of silently entering custom
setup.

TTY API-key input is masked. Non-TTY scripted input remains supported for tests
and automation. Confirmation accepts Enter defaults, Chinese `是/否`, and
English `y/n` or `yes/no`. Completion guidance detects PowerShell versus CMD
where possible and prints the matching environment-variable command.

## Context Consent

Context is curated locally before consent so the preview can report exact
counts and relative source names. For a cloud provider, the first request shows:

```text
即将发送给 DeepSeek：
- 当前任务文本
- 24 个本地来源摘要，每个最多 1200 字

不会扫描：.git、.nplan、node_modules
[1] 查看来源  [2] 排除路径  [3] 同意并记住  [4] 取消
```

Consent is stored at `.nplan/consent.json` with:

- schema version;
- provider id and normalized base URL;
- a fingerprint of scan roots, allowed extensions, ignored directories,
  maximum sources, evidence character budget, and user exclusions;
- confirmation timestamp.

No API key, task text, source content, or evidence excerpt is stored in the
consent file. A provider or scope fingerprint change requires confirmation
again.

Interactive mode asks for consent. Print or piped mode without saved consent
fails before any model call and points to `nplan consent`. Automation can use
`--allow-cloud-context` for one invocation. `nplan consent --revoke` removes the
project authorization. Localhost providers skip the gate and show that data
stays local.

## Sessions And Resume

Session storage moves to version 2. A saved turn contains:

- original request and revision text;
- status and inferred goal;
- sanitized TaskSpec without `source_map`, `evidence_map`, absolute paths, or
  background context bodies;
- validated TaskPlan;
- derived WorkPlan;
- relative source ids and relative paths only.

Resume restores the visible WorkPlan, todo view, revision context, and export
capability. It must not restore or persist evidence text. Old v1 session files
are ignored with a Chinese compatibility message instead of being misread.

## Generic Export

`/export` writes `.nplan/exports/<plan-id>.md` unless a Markdown path is given.
The generic template contains:

- frontmatter type `nplan-work-plan`;
- Chinese or English title based on the selected locale;
- conclusion;
- questions;
- action checklist;
- task graph;
- acceptance criteria;
- relative sources;
- next actions;
- raw ids at the end only.

No PRPlan, PR Draft, pull-request tag, or coding-only language appears unless a
future explicit software-specific view is designed separately.

## Diagnostics And Errors

`nplan doctor` performs local checks only and must say that network access was
not tested. It reports Node version, config path validity, provider/model
selection, API-key presence without revealing the value, and consent status.

`nplan doctor --online` performs a provider connectivity check requested by the
user. It sends no task or project context.

Model errors are classified as:

- network unreachable;
- timeout;
- invalid or missing credentials;
- quota or rate limit;
- endpoint or model not found;
- provider server error;
- invalid JSON or schema output.

Each Chinese message includes one concrete next action. Provider retries create
a fresh timeout signal per attempt so a timed-out signal is never reused.

## Documentation

Update together:

- `README.md`
- `README.zh-CN.md`
- `docs/agent-module-spec.md`
- `docs/model-providers.md`
- `docs/nplan_process_task_obsidian.md`
- `config.example.toml`

Remove obsolete PRPlan wording and document consent, two-call planning,
WorkPlan, Chinese defaults, session v2, diagnostics, and breaking changes.

## Testing Strategy

Implementation is test-driven. Each behavior is added through a failing test,
minimal implementation, focused passing test, then full regression run.

Required coverage:

- TaskPlan model prompt and structured payload for chat-completions and
  Responses providers;
- exactly two semantic model calls for a ready request;
- no TaskPlan call when clarification is required;
- concrete Chinese action tasks, DAG validity, task limit, dependency validity,
  acceptance, and deliverable coverage;
- invalid TaskPlan output returns `plan_invalid` without a third model call;
- WorkPlan derivation, validation, todo rendering, and generic Markdown;
- no PR terms anywhere in generated generic output;
- cloud consent, local-provider bypass, fingerprint invalidation, preview,
  revoke, non-TTY refusal, and one-shot authorization;
- session v2 save, resume, revise, export, and sensitive-field removal;
- grouped canonical providers, invalid-selection re-prompt, multilingual
  confirmation, and TTY secret masking;
- local and online doctor behavior plus every error category;
- default Chinese copy, `--lang en`, Chinese command aliases, concise status,
  and direct-text revision behavior;
- test helpers remove real provider API-key variables unless a test explicitly
  supplies one.

Final verification:

```powershell
npm.cmd test
node --check src/cli.js
node --check src/model-client.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/consent.js
node --check src/work-plan.js
node --check src/model-errors.js
node .\src\cli.js --help
node .\src\cli.js doctor
```

## Acceptance Criteria

- A Chinese general task produces concrete, action-oriented TaskPlan steps
  instead of `Define <deliverable>` wrappers.
- The default CLI and export are concise Simplified Chinese.
- No generic user surface contains PRPlan or PR Draft terminology.
- No cloud model request can receive project context before valid consent.
- Local providers remain frictionless and clearly local.
- Resumed sessions restore the visible plan and can be revised or exported
  without storing evidence text or absolute paths.
- Diagnostics distinguish local configuration from online health and give an
  actionable Chinese error.
- The planning-only boundary is unchanged.
- All focused and full verification commands pass in an environment that may
  already contain real provider API-key variables.
