# NPlan Planning Contract

Use this reference when producing or reviewing a TaskSpec or TaskPlan without the NPlan runtime.

## Pipeline

```text
request + bounded project context
  -> source map + evidence map
  -> TaskSpec
  -> readiness and conflict gate
  -> TaskPlan DAG
  -> pair validation
  -> user-facing plan
```

The workflow is planning-only. It does not execute tasks, edit files, run deployment operations, generate a UI, browse on the user's behalf, or manage remote agents.

## TaskSpec checklist

Capture these required fields conceptually, even when the host presents a concise narrative instead of raw JSON:

- `version`: `1.0`
- `surface_request`, `inferred_goal`, `task_type`, `audience`, `target_object`
- `deliverables`: one or more named deliverables with format and required status
- `output_format`
- `constraints`: include allowed and forbidden tools; NPlan planning allows only `project_context`, `configured_model`, and `schema_validator`
- `known_inputs`
- `missing_information`: separate blocking from non-blocking gaps
- `assumptions` and `ambiguities`
- `success_criteria`: at least one verifiable criterion
- `clarification`: boolean, questions, and reason
- `checkpoint_policy`: stop rules and actions requiring user confirmation
- `quality_bar`: at least one standard
- `planning_readiness`: score from 0 to 1 and `ready` or `clarify_then_plan`
- `risk_level`: `low`, `medium`, `high`, or `unknown`
- `provenance`: conversation turns, files used, and whether a model was used

Optional grounding fields are `background_context`, `context_requirements`, `source_map`, `evidence_map`, `context_report`, and `conflict_report`.

Do not plan when blocking information exists, blocking context conflicts exist, or readiness is below `0.60`. Ask the smallest set of questions that would unblock planning.

## Context and provenance

- Give each source a stable `source_id` and project-relative path.
- Give each evidence item an `evidence_id`, an existing `source_id`, a real line span when available, and a bounded excerpt or claim summary.
- Do not cite evidence that was not actually inspected.
- Preserve memory identity as `memory:<concept-id>`, canonical relative path, and version hash when memory supplied the evidence.
- Prefer project instructions and focused local knowledge over large reference dumps.
- Treat unresolved contradictions as blocking or non-blocking conflicts instead of silently choosing one side.

## TaskPlan contract

Use `plan_style: dag`. Default policy:

```json
{
  "max_depth": 3,
  "max_tasks": 12,
  "allow_parallel_groups": true,
  "require_acceptance_per_task": true,
  "prefer_atomic_tasks": true
}
```

Each task requires:

- a unique `id`, short `title`, and outcome-oriented `goal`;
- non-empty `inputs`, `outputs`, and `acceptance` checks;
- `dependencies` that name existing task ids;
- a `parallel_group` consistent with its dependencies;
- `complexity` and `risk` from `low`, `medium`, or `high`;
- a non-empty `model_tier`;
- `state: pending`.

The plan also needs a preserved `global_goal`, non-empty `global_acceptance`, required deliverables, and a bounded replan policy. Use only these replan triggers when representing the NPlan contract: `schema_invalid`, `cyclic_dependency`, `blocking_info_found`, `task_too_coarse`, `missing_dependency`, `coverage_gap`, `validation_failure`, and `planner_policy_invalid`. Never allow more than five replans.

## Final validation

Before reporting `planned`, confirm all of the following:

- TaskSpec required fields are present and no undeclared fields are invented.
- The plan goal matches the TaskSpec goal.
- Every required deliverable appears in task outputs.
- Global acceptance covers all TaskSpec success criteria.
- Every dependency points to an existing task and the graph is acyclic.
- Every task has input, output, and acceptance evidence.
- Task count and depth satisfy the effective policy.
- Source and evidence maps are internally consistent.
- No blocking missing information or context conflict remains.

If any check fails, report `plan_invalid` with the concrete failure. Do not conceal the failure by returning an executable-looking checklist.
