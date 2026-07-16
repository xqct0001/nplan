# NPlanCore

NPlanCore is a portable planning and governed project-memory plugin for Codex, Claude Code, and other Agent Skills-compatible hosts. It turns ambiguous requests into reviewable `TaskSpec`, `TaskPlan`, and `ContextPack` artifacts while keeping execution outside the plugin boundary.

[中文说明](README.zh-CN.md)

## What it provides

- Planning contracts for bounded, dependency-aware task plans.
- Provenance and validation checks for planning evidence.
- A guarded memory workflow based on previewable proposals and explicit decisions.
- Compatible manifests for Codex and Claude Code.

NPlanCore plans work; it does not execute the resulting plan. Persistent memory updates require the separate `nplan` CLI. Never edit `.nplan/memory/` directly.

## Repository layout

```text
.
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
├── plugins/nplan-core/
│   ├── .codex-plugin/plugin.json
│   ├── .claude-plugin/plugin.json
│   └── skills/nplan-core/
├── README.md
└── README.zh-CN.md
```

This branch intentionally contains only the plugin, its marketplace manifests, and bilingual READMEs.

## Codex

From a checkout of this branch, add the local marketplace and install the plugin:

```text
codex plugin marketplace add <absolute-path-to-this-checkout>
codex plugin add nplan-core@nplan-local
```

Invoke the skill as `$nplan-core`.

## Claude Code

For local development:

```text
claude --plugin-dir ./plugins/nplan-core
```

Or add this checkout as a marketplace and install the plugin inside Claude Code:

```text
/plugin marketplace add <absolute-path-to-this-checkout>
/plugin install nplan-core@nplan-local
```

Invoke the skill as `/nplan-core:nplan-core`.

## Other Agent Skills hosts

Use or copy `plugins/nplan-core/skills/nplan-core/` according to the host's skill installation convention. If the `nplan` CLI is unavailable, the plugin can still produce method-compatible plans, but it cannot perform canonical memory writes or runtime validation.

## Memory safety

Read-only inspection is allowed with `nplan memory status` and `nplan memory show`. A proposed memory change must be reviewed first, and `apply` or `reject` must name the exact proposal after explicit user authorization. Physical deletion and `forget` are unsupported.
