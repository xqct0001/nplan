<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlan icon" width="112">
</p>

<h1 align="center">NPlan</h1>

<p align="center"><strong>Turn an ambiguous request into a reviewable, revisable, and exportable work plan.</strong></p>

<p align="center">English · <a href="README.zh-CN.md">简体中文</a></p>

NPlan is a local planning CLI. It reads bounded project context, clarifies the request, and produces validated planning artifacts: `TaskSpec`, `TaskPlan`, `ContextPack`, and a user-facing `WorkPlan`.

> [!IMPORTANT]
> NPlan plans only. It does not execute tasks, run shell commands, edit source files, generate a UI, or manage remote agents.

## Quick Start

Requirements: Windows and Node.js LTS.

From CMD in the repository directory:

```cmd
install.cmd
nplan setup
nplan "Plan a release checklist for this project"
```

From PowerShell, run `.\install.cmd` instead. Setup writes project-local configuration to `.nplan/config.toml`, which is ignored by Git.

## How It Works

```text
Request
  → read-only ContextPack
  → validated TaskSpec
  → bounded TaskPlan DAG
  → validated WorkPlan
```

If required information is missing, NPlan asks for clarification instead of inventing a plan. A ready request uses separate model calls for understanding and planning, followed by local validation.

## Core Capabilities

- Chinese-first interactive CLI with `--lang en` for English.
- OpenAI-compatible cloud and local model providers.
- Read-only local context with stable source and evidence identifiers.
- Project-scoped consent before local context is sent to a cloud provider.
- Sanitized local sessions with continue, resume, revise, and Markdown export.
- Deterministic checks for completeness, provenance, DAG validity, and deliverable coverage.

## Common Commands

| Command | Purpose |
| --- | --- |
| `nplan setup` | Configure a provider, API key, and model. |
| `nplan providers` | List built-in providers. |
| `nplan doctor` | Check local configuration without network access. |
| `nplan doctor --online` | Probe an allowlisted read-only models or health endpoint. |
| `nplan "<request>"` | Start or continue an interactive planning session. |
| `nplan -p --output-format summary "<request>"` | Print one concise planning result. |
| `nplan -c` | Continue the latest local session. |
| `nplan resume [id]` | Resume a saved session. |
| `nplan consent status` | Show cloud-context consent status. |
| `nplan consent revoke` | Revoke saved cloud-context consent. |

Inside an interactive session, use `/帮助` or `/help` to list commands. Useful actions include `/修改`, `/来源`, `/步骤`, `/导出`, `/继续`, and `/恢复`.

## Typical Use

Interactive planning:

```cmd
nplan "Break the v0.3 release into reviewable tasks"
```

One-shot summary:

```cmd
nplan -p --output-format summary "Plan a safe database migration"
```

English interface:

```cmd
nplan --lang en "Plan the release checklist"
```

## Models, Safety, and Privacy

Run `nplan setup` to choose a provider. Recommended cloud choices include DeepSeek, DashScope, Kimi, Zhipu AI, and Doubao; local choices include Ollama and LM Studio. Custom OpenAI-compatible providers are also supported.

- Local providers do not require cloud-context consent.
- Cloud providers require project-and-scope consent before either planning request.
- Non-interactive cloud use needs saved consent or the one-shot `--allow-cloud-context` flag.
- `nplan doctor` is offline by default; networking occurs only with `doctor --online`.
- Sanitized sessions are stored under `.nplan/sessions/` without source contents, evidence text, credentials, or authorization values.

## Documentation

- [Module contract](docs/agent-module-spec.md)
- [Model providers](docs/model-providers.md)
- [Local knowledge](docs/local-knowledge.md)
- [Planning and Obsidian workflow](docs/nplan_process_task_obsidian.md)
- [Project knowledge index](docs/nplan_knowledge/index.md)

## License

[MIT](LICENSE)
