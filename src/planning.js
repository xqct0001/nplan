import { DEFAULT_PLANNER_POLICY, makeTask } from './schemas.js';

export function buildPlannerInput(taskspec, contextDigest = null, plannerPolicy = {}) {
  return {
    taskspec,
    context_digest:
      contextDigest || {
        project_notes: taskspec.background_context || [],
        instruction_files: taskspec.provenance?.files_used || [],
        conversation_summary: taskspec.surface_request || '',
        source_count: taskspec.context_report?.source_count || 0,
        evidence_count: taskspec.context_report?.evidence_count || 0,
        conflict_summary: taskspec.conflict_report || { blocking: [], non_blocking: [] }
      },
    planner_policy: { ...DEFAULT_PLANNER_POLICY, ...plannerPolicy }
  };
}

export function planFromTaskSpec(plannerInput) {
  const taskspec = plannerInput.taskspec;
  const policy = plannerInput.planner_policy || DEFAULT_PLANNER_POLICY;
  const required = (taskspec.deliverables || [])
    .filter((item) => item.required !== false && item.name !== 'unknown')
    .map((item) => item.name);
  const tasks = tasksForDeliverables(required, policy);

  return {
    version: '1.0',
    plan_style: 'dag',
    global_goal: taskspec.inferred_goal || '',
    global_acceptance: [
      'all required deliverables are covered by task outputs',
      'task graph has no cyclic dependencies',
      'each task has inputs, outputs, and acceptance checks'
    ],
    required_deliverables: required,
    tasks,
    replan_policy: {
      trigger_on: ['schema_invalid', 'cyclic_dependency', 'blocking_info_found', 'task_too_coarse'],
      max_replans: 2
    }
  };
}

function tasksForDeliverables(required, policy) {
  const maxTasks = Number(policy.max_tasks || DEFAULT_PLANNER_POLICY.max_tasks);
  if (!required.length) {
    return [
      makeTask(
        'T1',
        'Clarify planning request',
        'Collect blocking information before planning',
        ['surface_request'],
        ['clarification questions'],
        [],
        ['blocking questions are explicit'],
        { parallel_group: 'G1', complexity: 'low', risk: 'medium' }
      )
    ];
  }

  const groups = [
    ['TaskSpec artifacts', required.filter((name) => name.includes('TaskSpec'))],
    ['TaskPlan artifacts', required.filter((name) => name.includes('TaskPlan') || name.includes('DAG'))]
  ];
  const tasks = [];

  for (const [label, outputs] of groups) {
    if (!outputs.length || tasks.length >= maxTasks) continue;
    const id = `T${tasks.length + 1}`;
    const dependencies = tasks.length ? [tasks[tasks.length - 1].id] : [];
    tasks.push(
      makeTask(
        id,
        `Define ${label}`,
        `Create and validate ${label}`,
        dependencies.length ? ['TaskSpec'] : ['surface_request'],
        outputs,
        dependencies,
        outputs.map((output) => `${output} is covered`),
        { parallel_group: `G${tasks.length + 1}` }
      )
    );
  }

  const covered = new Set(tasks.flatMap((task) => task.outputs));
  const leftovers = required.filter((name) => !covered.has(name));
  if (leftovers.length && tasks.length < maxTasks) {
    const dependencies = tasks.length ? [tasks[tasks.length - 1].id] : [];
    tasks.push(
      makeTask(
        `T${tasks.length + 1}`,
        'Cover remaining deliverables',
        'Ensure every required deliverable appears in the DAG',
        ['TaskSpec'],
        leftovers,
        dependencies,
        leftovers.map((output) => `${output} is covered`),
        { parallel_group: `G${tasks.length + 1}` }
      )
    );
  }

  return tasks.slice(0, maxTasks);
}
