import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LocalPlanningAgent,
  TASKPLAN_SCHEMA,
  TASKSPEC_SCHEMA,
  composeTaskSpecFromModel,
  compileTaskSpec,
  planFromTaskSpec,
  validateTaskPlan,
  validateTaskSpec
} from '../src/index.js';

test('schema artifacts expose required fields', () => {
  assert.equal(TASKSPEC_SCHEMA.title, 'TaskSpec');
  assert.ok(TASKSPEC_SCHEMA.required.includes('planning_readiness'));
  assert.ok(TASKSPEC_SCHEMA.required.includes('audience'));
  assert.ok(TASKSPEC_SCHEMA.required.includes('checkpoint_policy'));
  assert.ok(TASKSPEC_SCHEMA.required.includes('risk_level'));
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

test('taskspec validator rejects empty and wrong-typed content', () => {
  const spec = compileTaskSpec('implement TaskSpec schema', {
    audience: 'maintainers',
    target_object: 'planning module'
  });
  Object.assign(spec, {
    audience: ' ',
    target_object: '',
    deliverables: [{}],
    constraints: null,
    known_inputs: 'README.md',
    assumptions: {},
    ambiguities: 'unclear'
  });

  const report = validateTaskSpec(spec);

  assert.equal(report.valid, false);
  assert.equal(report.ready_for_planning, false);
  assert.ok(report.conflicts.includes('empty_audience'));
  assert.ok(report.conflicts.includes('empty_target_object'));
  assert.ok(report.conflicts.includes('invalid_deliverables'));
  assert.ok(report.conflicts.includes('no_deliverables'));
  assert.ok(report.conflicts.includes('invalid_constraints'));
  assert.ok(report.conflicts.includes('invalid_known_inputs'));
  assert.ok(report.conflicts.includes('invalid_assumptions'));
  assert.ok(report.conflicts.includes('invalid_ambiguities'));
});

test('compiler marks vague request for clarification', () => {
  const spec = compileTaskSpec('help', { files: [] });
  const report = validateTaskSpec(spec);

  assert.equal(spec.planning_readiness.decision, 'clarify_then_plan');
  assert.equal(spec.clarification.requires_clarification, true);
  assert.ok(spec.missing_information.blocking.length > 0);
  assert.equal(spec.output_format, 'unknown');
  assert.ok(spec.checkpoint_policy.stop_on.includes('blocking_missing_information'));
  assert.ok(spec.quality_bar.includes('blocking information is explicit'));
  assert.equal(spec.risk_level, 'medium');
  assert.equal(report.ready_for_planning, false);
});

test('compiler fills prompt boundary fields for ready requests', () => {
  const spec = compileTaskSpec(
    'implement TaskSpec schema, TaskSpec verifier, TaskPlan schema, and DAG verifier',
    {
      files: ['DOC/report.docx'],
      audience: 'maintainers',
      target_object: 'local planning module'
    }
  );
  const report = validateTaskSpec(spec);

  assert.equal(spec.audience, 'maintainers');
  assert.equal(spec.target_object, 'local planning module');
  assert.equal(spec.output_format, 'json');
  assert.equal(spec.risk_level, 'low');
  assert.equal(Object.hasOwn(spec.constraints, 'offline_preferred'), false);
  assert.ok(spec.checkpoint_policy.requires_user_confirmation_for.includes('external_network_action'));
  assert.ok(spec.quality_bar.includes('success criteria are verifiable'));
  assert.equal(report.valid, true);
  assert.equal(report.ready_for_planning, true);
});

test('model draft constraints remove deprecated offline preference', () => {
  const spec = composeTaskSpecFromModel('implement TaskSpec schema', {
    inferred_goal: 'Implement TaskSpec schema',
    task_type: 'coding',
    audience: 'maintainers',
    target_object: 'planning module',
    deliverables: [{ name: 'TaskSpec schema', format: 'json', required: true }],
    constraints: {
      offline_preferred: true,
      forbidden_tools: ['network_access', 'task_execution']
    },
    missing_information: { blocking: [], non_blocking: [] },
    success_criteria: ['schema is implemented'],
    checkpoint_policy: {
      stop_on: ['validation_failure'],
      requires_user_confirmation_for: []
    },
    quality_bar: ['deprecated offline preference is not emitted'],
    risk_level: 'low'
  });

  assert.equal(Object.hasOwn(spec.constraints, 'offline_preferred'), false);
  assert.ok(spec.constraints.forbidden_tools.includes('unauthorized_network_access'));
  assert.equal(spec.constraints.forbidden_tools.includes('network_access'), false);
});

test('model draft cannot hide local blocking information for vague requests', () => {
  const spec = composeTaskSpecFromModel('help', {
    inferred_goal: 'Create a plan',
    task_type: 'planning',
    audience: 'requester',
    target_object: 'unspecified request',
    deliverables: [{ name: 'Plan', format: 'markdown', required: true }],
    missing_information: { blocking: [], non_blocking: [] },
    assumptions: ['The user wants general help'],
    ambiguities: [],
    success_criteria: ['Plan is drafted'],
    checkpoint_policy: {
      stop_on: ['blocking_missing_information', 'validation_failure'],
      requires_user_confirmation_for: []
    },
    quality_bar: ['clarifying questions are asked when needed'],
    risk_level: 'medium'
  });
  const report = validateTaskSpec(spec);

  assert.ok(spec.missing_information.blocking.includes('final deliverable'));
  assert.ok(spec.missing_information.blocking.includes('required deliverables'));
  assert.equal(spec.planning_readiness.decision, 'clarify_then_plan');
  assert.equal(spec.clarification.requires_clarification, true);
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

test('plan validator rejects non-DAG style, empty tasks, empty acceptance, and invalid replans', () => {
  const report = validateTaskPlan({
    version: '1.0',
    plan_style: 'tree',
    global_goal: 'validate external plan',
    global_acceptance: [],
    tasks: [],
    replan_policy: { trigger_on: ['anything'], max_replans: 'many' }
  });

  assert.equal(report.valid, false);
  assert.ok(report.plan_errors.includes('invalid_plan_style'));
  assert.ok(report.plan_errors.includes('no_tasks'));
  assert.ok(report.plan_errors.includes('no_global_acceptance'));
  assert.ok(report.policy_errors.includes('invalid_replan_trigger'));
  assert.ok(report.policy_errors.includes('invalid_max_replans'));
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

test('generated plans retain planner policy for validation', () => {
  const plan = planFromTaskSpec({
    taskspec: {
      inferred_goal: 'plan a custom artifact',
      deliverables: [{ name: 'Custom planning artifact', format: 'markdown', required: true }]
    },
    planner_policy: { max_tasks: 'many' }
  });
  const report = validateTaskPlan(plan);

  assert.equal(plan.planner_policy.max_tasks, 'many');
  assert.ok(plan.tasks.length > 0);
  assert.deepEqual(report.policy_errors, ['invalid_max_tasks']);
  assert.equal(report.valid, false);
});

test('generated plans create specific bounded tasks for general deliverables', () => {
  const plan = planFromTaskSpec({
    taskspec: {
      inferred_goal: 'plan a launch decision package',
      deliverables: [
        { name: 'Market analysis', format: 'markdown', required: true },
        { name: 'Launch checklist', format: 'markdown', required: true },
        { name: 'Risk register', format: 'markdown', required: true }
      ]
    },
    planner_policy: { max_tasks: 12 }
  });
  const report = validateTaskPlan(plan);
  const titles = plan.tasks.map((task) => task.title);

  assert.ok(plan.tasks.length >= 3);
  assert.equal(titles.includes('Cover remaining deliverables'), false);
  assert.ok(titles.includes('Define Market analysis'));
  assert.ok(titles.includes('Define Launch checklist'));
  assert.ok(titles.includes('Define Risk register'));
  assert.deepEqual(report.coverage_gaps, []);
  assert.equal(report.valid, true);
});

test('local planning agent requires a configured model', () => {
  const agent = new LocalPlanningAgent();

  assert.throws(
    () => agent.analyze('implement TaskSpec schema'),
    /model configuration is required/
  );
});
