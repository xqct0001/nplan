---
name: nplan-core
description: Turn ambiguous requests into reviewable TaskSpec and bounded TaskPlan artifacts, or govern NPlan project memory through previewable proposals and explicit apply/reject decisions. Use for task decomposition, implementation planning, plan validation, context/provenance checks, memory status and inspection, remembering project facts, ingesting project knowledge, correcting a stored concept, or reviewing a pending memory proposal in Codex, Claude Code, or another Agent Skills-compatible host.
---

# NPlanCore

Use NPlan's planning method without crossing into task execution. Use its memory CLI for canonical memory changes instead of editing `.nplan/memory/` directly.

## Preserve the boundary

- Produce or refine `TaskSpec`, `TaskPlan`, `ContextPack`, provenance, validation findings, and clarification questions.
- Do not execute the resulting plan, edit project source as part of the plan, operate a browser, or orchestrate remote agents.
- Treat project files as read-only planning evidence. The only governed state mutation in this workflow is an explicitly authorized NPlan memory proposal decision under `.nplan/memory/`.
- Never infer permission to run `memory apply` or `memory reject` from a request to remember, scan, ingest, note, or correct.

## Select the workflow

1. Use the planning workflow for requests to understand, decompose, validate, revise, or export a plan.
2. Use the memory workflow for requests to inspect memory, remember a fact, ingest local knowledge, correct a concept, or decide a proposal.
3. For a mixed request, inspect memory first, build the plan second, and keep any proposal decision as a separate explicit checkpoint.

## Plan a request

1. Read [planning-contract.md](references/planning-contract.md) before constructing artifacts.
2. Inspect only relevant project instructions and evidence. Assign stable source ids and ensure every evidence item refers to an existing source id.
3. If the `nplan` CLI is available and configured, prefer its validated runtime:
   - Use print mode for a one-shot plan, adapting quoting to the current shell: `nplan -p --output-format json "<request>"`.
   - Do not add `--allow-cloud-context` unless the user explicitly authorizes that context transfer.
   - Respect explicit no-network instructions even if the project has saved consent.
4. If the CLI is unavailable, use the host model to follow the bundled contract. State that the result is method-compatible but was not checked by NPlan's runtime validators.
5. Stop with targeted clarification questions when blocking information exists or readiness is below `0.60`.
6. Otherwise return a bounded DAG whose tasks have inputs, outputs, dependencies, acceptance checks, complexity, risk, model tier, and `pending` state.
7. Validate goal preservation, deliverable coverage, success-criteria coverage, dependency references, acyclicity, depth, task count, and provenance before presenting the plan.
8. End after the plan and validation result. Do not begin task 1.

## Govern project memory

1. Read [memory-governance.md](references/memory-governance.md) before any memory command.
2. Use `nplan memory status` and `nplan memory show [id]` for read-only inspection.
3. Use `scan`, `ingest`, `note`, or `correct` only when the user asked to propose that kind of memory change.
4. Show the exact proposal id, operation, concept id, authority, base version, source refs, and proposed content before requesting a decision.
5. Run `nplan memory apply <proposal-id>` or `nplan memory reject <proposal-id>` only after the user explicitly authorizes that exact proposal and action.
6. If `nplan` is unavailable, do not emulate canonical memory writes. Return a proposed memory note in the response and explain that NPlan must be installed to persist it safely.
7. Do not offer physical deletion or forget; they are unsupported.

## Report results

Keep the response answer-first and concise. Include:

- status: `needs_clarification`, `planned`, `plan_invalid`, or the memory action result;
- the plan or proposal summary;
- validation failures or unresolved conflicts;
- source ids used;
- the next safe user decision, if one is required.
