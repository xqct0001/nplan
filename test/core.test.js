import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LocalPlanningAgent,
  TASKPLAN_SCHEMA,
  TASKSPEC_SCHEMA,
  compileTaskSpec,
  validateTaskPlan,
  validateTaskSpec
} from '../src/index.js';

test('schema artifacts expose required fields', () => {
  assert.equal(TASKSPEC_SCHEMA.title, 'TaskSpec');
  assert.ok(TASKSPEC_SCHEMA.required.includes('planning_readiness'));
  assert.equal(TASKPLAN_SCHEMA.title, 'TaskPlan');
  assert.ok(TASKPLAN_SCHEMA.required.includes('tasks'));
});

test('blocking missing information cannot be marked ready', () => {
  const spec = {
    version: '1.0',
    surface_request: 'do something',
    inferred_goal: 'The user wants to finish a task but the goal is unclear',
    task_type: 'unknown',
    deliverables: [{ name: 'unknown', format: 'unknown', required: true }],
    constraints: {
      offline_preferred: true,
      allowed_tools: ['local_fs'],
      forbidden_tools: ['code_execution']
    },
    known_inputs: [],
    missing_information: { blocking: ['final deliverable'], non_blocking: [] },
    assumptions: [],
    ambiguities: ['final deliverable is unclear'],
    success_criteria: ['the user confirms the deliverable'],
    clarification: { requires_clarification: true, questions: [] },
    planning_readiness: { score: 0.82, decision: 'ready' },
    provenance: { conversation_turns_used: [], files_used: [] }
  };

  const report = validateTaskSpec(spec);

  assert.equal(report.ready_for_planning, false);
  assert.ok(report.conflicts.includes('blocking_info_but_marked_ready'));
  assert.ok(report.conflicts.includes('clarification_without_questions'));
});

test('compiler marks vague request for clarification', () => {
  const spec = compileTaskSpec('help', { files: [] });
  const report = validateTaskSpec(spec);

  assert.equal(spec.planning_readiness.decision, 'clarify_then_plan');
  assert.equal(spec.clarification.requires_clarification, true);
  assert.ok(spec.missing_information.blocking.length > 0);
  assert.equal(report.ready_for_planning, false);
});

test('plan validator reports cycles, missing refs, missing io, and coverage gaps', () => {
  const plan = {
    version: '1.0',
    plan_style: 'dag',
    global_goal: 'build planning artifacts',
    global_acceptance: ['all deliverables covered'],
    required_deliverables: ['TaskSpec schema', 'TaskPlan DAG'],
    tasks: [
      {
        id: 'T1',
        title: 'Define TaskSpec',
        goal: 'create schema',
        inputs: ['report'],
        outputs: ['TaskSpec schema'],
        dependencies: ['T2'],
        parallel_group: 'G1',
        acceptance: ['schema validates'],
        complexity: 'medium',
        risk: 'medium',
        model_tier: 'strong',
        state: 'pending'
      },
      {
        id: 'T2',
        title: 'Verify plan',
        goal: 'validate DAG',
        inputs: [],
        outputs: [],
        dependencies: ['T1', 'T9'],
        parallel_group: 'G1',
        acceptance: [],
        complexity: 'medium',
        risk: 'high',
        model_tier: 'strong',
        state: 'pending'
      }
    ],
    replan_policy: { trigger_on: ['cyclic_dependency'], max_replans: 2 }
  };

  const report = validateTaskPlan(plan);

  assert.equal(report.cycle_detected, true);
  assert.deepEqual(report.missing_dependency_refs, [['T2', 'T9']]);
  assert.ok(report.tasks_without_acceptance.includes('T2'));
  assert.ok(report.tasks_without_io.includes('T2'));
  assert.ok(report.coverage_gaps.includes('TaskPlan DAG'));
});

test('plan validator enforces task count limit and reports invalid policy', () => {
  const tasks = Array.from({ length: 13 }, (_, index) => ({
    id: `T${index + 1}`,
    title: `Task ${index + 1}`,
    goal: 'keep the plan bounded',
    inputs: ['TaskSpec'],
    outputs: [`output ${index + 1}`],
    dependencies: index ? [`T${index}`] : [],
    parallel_group: 'G1',
    acceptance: ['task is bounded'],
    complexity: 'medium',
    risk: 'medium',
    model_tier: 'strong',
    state: 'pending'
  }));
  const tooMany = validateTaskPlan({
    version: '1.0',
    plan_style: 'dag',
    global_goal: 'bounded plan',
    global_acceptance: ['no more than twelve tasks'],
    tasks,
    replan_policy: { trigger_on: ['task_too_coarse'], max_replans: 2 }
  });
  const invalidPolicy = validateTaskPlan({
    version: '1.0',
    plan_style: 'dag',
    global_goal: 'validate external plan',
    global_acceptance: ['invalid policy is reported'],
    planner_policy: { max_tasks: 'many' },
    tasks: [tasks[0]],
    replan_policy: { trigger_on: ['schema_invalid'], max_replans: 2 }
  });

  assert.deepEqual(tooMany.task_count_exceeded, { count: 13, max_tasks: 12 });
  assert.equal(tooMany.valid, false);
  assert.deepEqual(invalidPolicy.policy_errors, ['invalid_max_tasks']);
  assert.equal(invalidPolicy.valid, false);
});

test('local planning agent returns clarification or verified plan', () => {
  const agent = new LocalPlanningAgent();
  const vague = agent.analyze('help');
  const ready = agent.analyze(
    'implement TaskSpec schema, TaskSpec verifier, TaskPlan schema, and DAG verifier',
    { files: ['DOC/report.docx'] }
  );

  assert.equal(vague.status, 'needs_clarification');
  assert.ok(!('taskplan' in vague));
  assert.equal(ready.status, 'planned');
  assert.equal(ready.taskspec_report.ready_for_planning, true);
  assert.equal(ready.taskplan_report.valid, true);
  assert.deepEqual(ready.pipeline_steps, [
    'understanding',
    'taskspec_validation',
    'planning',
    'taskplan_validation'
  ]);
});
