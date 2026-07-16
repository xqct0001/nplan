<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlanCore icon" width="112">
</p>

<h1 align="center">NPlanCore</h1>

<p align="center"><strong>Validated planning and governed project memory for coding agents.</strong></p>

<p align="center">English · <a href="README.zh-CN.md">简体中文</a></p>

NPlanCore turns an ambiguous request into a reviewable plan, or turns a project-memory change into a proposal that must be explicitly approved. It works in Codex, Claude Code, and other Agent Skills-compatible hosts.

> [!IMPORTANT]
> NPlanCore plans work; it does not execute the resulting plan. Memory changes are proposed first and are never applied or rejected without explicit approval for the exact proposal.

## What You Get

- **Structured planning** — produce `TaskSpec`, `TaskPlan`, and `ContextPack` artifacts with clear goals, dependencies, outputs, and acceptance checks.
- **Plan validation** — check deliverable coverage, dependency references, acyclicity, scope, readiness, and evidence provenance before presenting a plan.
- **Governed memory** — inspect project memory, propose new facts or corrections, review the exact change, then explicitly apply or reject it.
- **Portable workflow** — use the same planning and memory method from Codex, Claude Code, or another compatible Agent Skills host.
- **Safe fallback** — when the `nplan` CLI is unavailable, still produce method-compatible plans without pretending that runtime validation or canonical memory writes occurred.

## Requirements

- Codex in the ChatGPT desktop app, Claude Code, or another Agent Skills-compatible host.
- Git, when installing this marketplace from GitHub.
- Optional: the `nplan` CLI for runtime-validated planning and persistent project-memory operations.

## Install

### Codex

Register this repository branch as a marketplace:

```bash
codex plugin marketplace add xqct0001/nplan --ref codex/nplancore-plugin
```

Then open the ChatGPT desktop app:

1. Refresh or restart the app.
2. Open the plugin directory.
3. Select the **NPlanLocal** marketplace.
4. Install **NPlanCore**.
5. Start a new task and invoke `$nplan-core`.

The CLI command registers the marketplace. Plugin installation and local-plugin testing happen in the desktop app.

### Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add xqct0001/nplan@codex/nplancore-plugin
/plugin install nplan-core@nplan-local
/reload-plugins
```

Invoke the skill as `/nplan-core:nplan-core`.

### Local checkout

For development or inspection:

```bash
git clone --branch codex/nplancore-plugin --single-branch https://github.com/xqct0001/nplan.git
cd nplan
```

Register the checkout in Codex:

```bash
codex plugin marketplace add .
```

Or load the plugin directly in Claude Code:

```bash
claude --plugin-dir ./plugins/nplan-core
```

## Quick Start

### Create a plan

Codex:

```text
$nplan-core Plan a zero-downtime migration from SQLite to PostgreSQL. Do not execute it.
```

Claude Code:

```text
/nplan-core:nplan-core Plan a zero-downtime migration from SQLite to PostgreSQL. Do not execute it.
```

NPlanCore returns a bounded plan with evidence, dependencies, acceptance checks, risks, and validation results. It stops before task execution.

### Govern project memory

```text
$nplan-core Inspect project memory, then propose remembering that production deploys require two approvals.
```

The workflow shows the exact proposal before asking whether to apply or reject it. A request to remember, scan, ingest, or correct information is not permission to apply the proposal.

## Common Workflows

| Goal | Example request |
| --- | --- |
| Plan a feature | `Plan role-based access control for this service.` |
| Validate a plan | `Check this plan for missing deliverables and invalid dependencies.` |
| Clarify a request | `Turn this request into a TaskSpec and ask only blocking questions.` |
| Inspect memory | `Show project-memory status and the concept named deployment-policy.` |
| Propose a fact | `Propose remembering that release tags use the vMAJOR.MINOR.PATCH format.` |
| Correct a concept | `Propose correcting the stored staging URL using this config file as evidence.` |
| Decide a proposal | `Apply proposal <proposal-id>.` or `Reject proposal <proposal-id>.` |

## Safety Model

### Planning

- Project files are planning evidence, not permission to modify them.
- Evidence items point to stable source IDs.
- Blocking uncertainty produces targeted clarification questions.
- Valid plans end in `pending` tasks and stop before execution.
- Cloud context is not enabled unless the user explicitly authorizes it.

### Memory

- `status` and `show` are read-only.
- `scan`, `ingest`, `note`, and `correct` create proposals.
- Every proposal exposes its ID, operation, concept, authority, base version, sources, and proposed content.
- `apply` and `reject` require explicit authorization for the exact proposal ID.
- Direct edits to `.nplan/memory/`, physical deletion, and `forget` are unsupported.

## How It Works

```text
Planning
request → bounded context → TaskSpec → TaskPlan → validation → stop

Memory
sources → proposal → review → explicit apply/reject → canonical memory
```

If the `nplan` CLI is not installed, the host can still follow the bundled planning contract. In that mode, NPlanCore reports that runtime validation and canonical memory persistence were not performed.

## Plugin Structure

```text
.
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
├── assets/nplan-icon.svg
├── plugins/nplan-core/
│   ├── .codex-plugin/plugin.json
│   ├── .claude-plugin/plugin.json
│   └── skills/nplan-core/
│       ├── SKILL.md
│       ├── agents/openai.yaml
│       └── references/
├── README.md
└── README.zh-CN.md
```

This branch intentionally contains only the plugin, its marketplace manifests, its icon, and bilingual documentation.

## Official Plugin Documentation

- [Build plugins for Codex](https://developers.openai.com/codex/plugins/build)
- [Create plugins for Claude Code](https://code.claude.com/docs/en/plugins)
- [Create and distribute a Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)

## License

MIT
