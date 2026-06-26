# Local Task Agent JS Module Spec

## Scope

`local-task-agent-js` implements the local Task Understanding and Task
Decomposition layer described by the source Word report.

The module accepts a user request plus optional local context and returns:

- `TaskSpec`: structured understanding of the user request.
- `TaskPlan`: a bounded DAG for planning only.
- deterministic validation reports for both artifacts.

It does not execute tasks, run shell commands, edit code, call the network,
create a UI, or manage remote agents.

## JavaScript File Boundary

- `src/schemas.js`: field lists, minimal JSON Schema artifacts, constructors.
- `src/understanding.js`: deterministic `TaskSpec` compiler.
- `src/validation.js`: `TaskSpec` and `TaskPlan` guardrails.
- `src/planning.js`: planner input mapping and bounded DAG generation.
- `src/agent.js`: `LocalPlanningAgent` facade.
- `src/context.js`: read-only local instruction file discovery.
- `src/cli.js`: thin JSON command-line entry.
- `src/index.js`: public exports.

## Required TaskSpec Checks

- Required fields exist.
- At least one deliverable and one success criterion are present.
- Blocking missing information cannot be marked `ready`.
- Clarification requests must include at least one question.
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
node ./src/cli.js "implement TaskSpec schema, TaskSpec verifier, TaskPlan schema, and DAG verifier"
```
