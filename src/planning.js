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

export function composeTaskPlanFromModel(taskspec, modelDraft = {}, plannerPolicy = {}) {
  const policy = { ...DEFAULT_PLANNER_POLICY, ...plannerPolicy };
  const required = (taskspec.deliverables || [])
    .filter((item) => item.required !== false && item.name !== 'unknown')
    .map((item) => item.name);
  const tasks = (Array.isArray(modelDraft.tasks) ? modelDraft.tasks : [])
    .slice(0, safeMaxTasks(policy))
    .map((task, index) => normalizeModelTask(task, index));
  return {
    version: '1.0',
    plan_style: 'dag',
    global_goal: nonEmpty(modelDraft.global_goal, taskspec.inferred_goal),
    global_acceptance: stringArray(modelDraft.global_acceptance).length
      ? stringArray(modelDraft.global_acceptance)
      : stringArray(taskspec.success_criteria),
    required_deliverables: required,
    planner_policy: policy,
    tasks,
    replan_policy: {
      trigger_on: ['schema_invalid', 'cyclic_dependency', 'blocking_info_found', 'task_too_coarse'],
      max_replans: 0
    }
  };
}

function normalizeModelTask(task, index) {
  return makeTask(
    nonEmpty(task?.id, `T${index + 1}`),
    nonEmpty(task?.title, `任务 ${index + 1}`),
    nonEmpty(task?.goal, nonEmpty(task?.title, `任务 ${index + 1}`)),
    stringArray(task?.inputs),
    stringArray(task?.outputs),
    stringArray(task?.dependencies),
    stringArray(task?.acceptance),
    {
      parallel_group: nonEmpty(task?.parallel_group, `G${index + 1}`),
      complexity: allowed(task?.complexity, ['low', 'medium', 'high'], 'medium'),
      risk: allowed(task?.risk, ['low', 'medium', 'high'], 'medium'),
      model_tier: nonEmpty(task?.model_tier, 'strong'),
      state: 'pending'
    }
  );
}

function safeMaxTasks(policy) {
  const configured = Number(policy?.max_tasks);
  return Number.isInteger(configured) && configured >= 1
    ? configured
    : DEFAULT_PLANNER_POLICY.max_tasks;
}

function nonEmpty(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function allowed(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}
