import {
  DEFAULT_PLANNER_POLICY,
  OUTPUT_FORMATS,
  PLAN_STYLES,
  REPLAN_TRIGGERS,
  RISK_LEVELS,
  TASKPLAN_REQUIRED_FIELDS,
  TASKSPEC_REQUIRED_FIELDS,
  TASK_REQUIRED_FIELDS
} from './schemas.js';

const READINESS_DECISIONS = ['ready', 'clarify_then_plan'];
const TASKSPEC_TEXT_FIELDS = ['version', 'surface_request', 'inferred_goal', 'task_type', 'audience', 'target_object'];
const TASK_TEXT_FIELDS = ['id', 'title', 'goal', 'parallel_group', 'complexity', 'risk', 'model_tier', 'state'];
const TASK_NONEMPTY_ARRAY_FIELDS = ['inputs', 'outputs', 'acceptance'];

export function validateTaskSpec(spec) {
  const missingRequired = missingFields(spec, TASKSPEC_REQUIRED_FIELDS);
  const conflicts = [];

  if (!isObject(spec)) {
    return {
      valid: false,
      ready_for_planning: false,
      missing_required_fields: missingRequired,
      conflicts: ['invalid_taskspec']
    };
  }

  for (const field of TASKSPEC_TEXT_FIELDS) {
    if (field in spec && !nonEmptyString(spec[field])) conflicts.push(`empty_${field}`);
  }

  const deliverableReport = deliverablesReport(spec.deliverables);
  if (deliverableReport.invalid) conflicts.push('invalid_deliverables');
  if (!deliverableReport.validItems.length) conflicts.push('no_deliverables');

  const successCriteria = stringArrayReport(spec.success_criteria);
  if (successCriteria.invalid) conflicts.push('invalid_success_criteria');
  if (!successCriteria.items.length) conflicts.push('no_success_criteria');

  if ('constraints' in spec && !isObject(spec.constraints)) conflicts.push('invalid_constraints');
  if (stringArrayReport(spec.known_inputs).invalid) conflicts.push('invalid_known_inputs');
  if (missingInfoReport(spec.missing_information).invalid) conflicts.push('invalid_missing_information');
  if (stringArrayReport(spec.assumptions).invalid) conflicts.push('invalid_assumptions');
  if (stringArrayReport(spec.ambiguities).invalid) conflicts.push('invalid_ambiguities');
  if ('context_requirements' in spec && stringArrayReport(spec.context_requirements).invalid) {
    conflicts.push('invalid_context_requirements');
  }
  if ('source_map' in spec && !Array.isArray(spec.source_map)) conflicts.push('invalid_source_map');
  if ('evidence_map' in spec && !Array.isArray(spec.evidence_map)) conflicts.push('invalid_evidence_map');
  if ('conflict_report' in spec && !isObject(spec.conflict_report)) conflicts.push('invalid_conflict_report');
  if ('provenance' in spec && !isObject(spec.provenance)) conflicts.push('invalid_provenance');

  const missingInfo = missingInfoReport(spec.missing_information);
  const blocking = missingInfo.blocking;
  const readiness = isObject(spec.planning_readiness) ? spec.planning_readiness : {};
  const decision = readiness.decision;
  const score = toNumber(readiness.score);
  if ('planning_readiness' in spec && !isObject(spec.planning_readiness)) {
    conflicts.push('invalid_planning_readiness');
  }
  if (!READINESS_DECISIONS.includes(decision)) conflicts.push('invalid_readiness_decision');
  if (score === null || score < 0 || score > 1) conflicts.push('invalid_readiness_score');

  const clarification = isObject(spec.clarification) ? spec.clarification : {};
  if ('clarification' in spec && !isObject(spec.clarification)) conflicts.push('invalid_clarification');
  const requiresClarification = clarification.requires_clarification === true;
  if (
    'requires_clarification' in clarification &&
    typeof clarification.requires_clarification !== 'boolean'
  ) {
    conflicts.push('invalid_clarification');
  }
  const questions = stringArrayReport(clarification.questions);
  if (questions.invalid) conflicts.push('invalid_clarification_questions');

  const outputFormat = spec.output_format;
  const checkpointPolicy = isObject(spec.checkpoint_policy) ? spec.checkpoint_policy : {};
  if ('checkpoint_policy' in spec && !isObject(spec.checkpoint_policy)) {
    conflicts.push('invalid_checkpoint_policy');
  }
  const stopOn = stringArrayReport(checkpointPolicy.stop_on);
  if (stopOn.invalid) conflicts.push('invalid_checkpoint_stop_on');
  const confirmations = stringArrayReport(checkpointPolicy.requires_user_confirmation_for);
  if ('requires_user_confirmation_for' in checkpointPolicy && confirmations.invalid) {
    conflicts.push('invalid_checkpoint_confirmations');
  }

  const qualityBar = stringArrayReport(spec.quality_bar);
  if (qualityBar.invalid) conflicts.push('invalid_quality_bar');
  const riskLevel = spec.risk_level;
  const contextConflicts = isObject(spec.conflict_report) ? spec.conflict_report : {};
  const contextBlocking = Array.isArray(contextConflicts.blocking) ? contextConflicts.blocking : [];

  if (blocking.length && decision === 'ready') conflicts.push('blocking_info_but_marked_ready');
  if (requiresClarification && !questions.items.length) conflicts.push('clarification_without_questions');
  if (score !== null && score < 0.6 && !requiresClarification) {
    conflicts.push('low_score_without_clarification');
  }
  if (!validOutputFormat(outputFormat)) conflicts.push('invalid_output_format');
  if (!stopOn.items.length) conflicts.push('checkpoint_policy_without_stop_rules');
  if (!qualityBar.items.length) conflicts.push('no_quality_bar');
  if (!RISK_LEVELS.includes(riskLevel)) conflicts.push('invalid_risk_level');
  if (contextBlocking.length) conflicts.push('blocking_context_conflicts');
  if (evidenceWithoutSource(spec).length) conflicts.push('evidence_without_source');

  const valid = !missingRequired.length && !conflicts.length;
  const readyForPlanning =
    valid &&
    !blocking.length &&
    !contextBlocking.length &&
    decision === 'ready' &&
    score >= 0.6;

  return {
    valid,
    ready_for_planning: readyForPlanning,
    missing_required_fields: missingRequired,
    conflicts: unique(conflicts)
  };
}

export function validateTaskPlan(plan) {
  const missingRequired = missingFields(plan, TASKPLAN_REQUIRED_FIELDS);
  const planErrors = [];

  if (!isObject(plan)) {
    return {
      valid: false,
      missing_required_fields: missingRequired,
      missing_task_fields: {},
      cycle_detected: false,
      missing_dependency_refs: [],
      tasks_without_acceptance: [],
      tasks_without_io: [],
      coverage_gaps: [],
      policy_errors: [],
      task_count_exceeded: {},
      plan_errors: ['invalid_taskplan'],
      duplicate_task_ids: [],
      depth_exceeded: {}
    };
  }

  if (!PLAN_STYLES.includes(plan.plan_style)) planErrors.push('invalid_plan_style');
  if ('global_goal' in plan && !nonEmptyString(plan.global_goal)) planErrors.push('empty_global_goal');

  const globalAcceptance = stringArrayReport(plan.global_acceptance);
  if (globalAcceptance.invalid) planErrors.push('invalid_global_acceptance');
  if (!globalAcceptance.items.length) planErrors.push('no_global_acceptance');

  if ('required_deliverables' in plan && !Array.isArray(plan.required_deliverables)) {
    planErrors.push('invalid_required_deliverables');
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  if ('tasks' in plan && !Array.isArray(plan.tasks)) planErrors.push('invalid_tasks');
  if (!tasks.length) planErrors.push('no_tasks');

  const duplicateTaskIds = duplicateIds(tasks);
  if (duplicateTaskIds.length) planErrors.push('duplicate_task_ids');

  const knownIds = new Set(
    tasks.map((task) => (nonEmptyString(task?.id) ? task.id.trim() : null)).filter(Boolean)
  );
  const missingTaskFields = {};
  const missingDependencyRefs = [];
  const tasksWithoutAcceptance = [];
  const tasksWithoutIo = [];
  const graph = Object.fromEntries(tasks.map((task, index) => [taskId(task, index), []]));

  tasks.forEach((task, index) => {
    const id = taskId(task, index);
    const missing = missingTaskFieldsFor(task);
    if (missing.length) missingTaskFields[id] = missing;
    if (!nonEmptyStringArray(task?.acceptance)) tasksWithoutAcceptance.push(id);
    if (!nonEmptyStringArray(task?.inputs) || !nonEmptyStringArray(task?.outputs)) {
      tasksWithoutIo.push(id);
    }

    const dependencies = Array.isArray(task?.dependencies) ? task.dependencies : [];
    dependencies.forEach((dependency) => {
      if (!nonEmptyString(dependency) || !knownIds.has(dependency.trim())) {
        missingDependencyRefs.push([id, String(dependency || '')]);
      } else if (graph[id]) {
        graph[id].push(dependency.trim());
      }
    });
  });

  const cycleDetected = hasCycle(graph);
  const coverageGaps = coverageGapsFor(plan, tasks);
  const policyReport = plannerPolicyReport(plan);
  const replanErrors = replanPolicyErrors(plan.replan_policy);
  const policyErrors = [...policyReport.errors, ...replanErrors, ...coarseTaskErrors(tasks)];
  const taskCountExceeded =
    tasks.length > policyReport.maxTasks
      ? { count: tasks.length, max_tasks: policyReport.maxTasks }
      : {};
  const depthExceeded = cycleDetected
    ? {}
    : depthLimitReport(graph, policyReport.maxDepth);

  return {
    valid:
      !missingRequired.length &&
      !planErrors.length &&
      !Object.keys(missingTaskFields).length &&
      !missingDependencyRefs.length &&
      !cycleDetected &&
      !tasksWithoutAcceptance.length &&
      !tasksWithoutIo.length &&
      !coverageGaps.length &&
      !policyErrors.length &&
      !Object.keys(taskCountExceeded).length &&
      !Object.keys(depthExceeded).length,
    missing_required_fields: missingRequired,
    missing_task_fields: missingTaskFields,
    cycle_detected: cycleDetected,
    missing_dependency_refs: missingDependencyRefs,
    tasks_without_acceptance: tasksWithoutAcceptance,
    tasks_without_io: tasksWithoutIo,
    coverage_gaps: coverageGaps,
    policy_errors: unique(policyErrors),
    task_count_exceeded: taskCountExceeded,
    plan_errors: unique(planErrors),
    duplicate_task_ids: duplicateTaskIds,
    depth_exceeded: depthExceeded
  };
}

export function validateWorkPlan(workPlan) {
  const issues = [];
  const requiredStrings = [
    'version',
    'plan_id',
    'session_id',
    'status',
    'language',
    'conclusion'
  ];
  const requiredArrays = ['questions', 'steps', 'acceptance', 'source_summary', 'next_actions'];

  if (!isObject(workPlan)) return { valid: false, issues: ['invalid_workplan'] };

  for (const field of requiredStrings) {
    if (!nonEmptyString(workPlan[field])) issues.push(`missing_${field}`);
  }
  for (const field of requiredArrays) {
    if (!Array.isArray(workPlan[field])) issues.push(`invalid_${field}`);
  }

  if (nonEmptyString(workPlan.version) && workPlan.version !== '1.0') {
    issues.push('invalid_version');
  }
  if (
    nonEmptyString(workPlan.status) &&
    !['planned', 'needs_clarification', 'plan_invalid'].includes(workPlan.status)
  ) {
    issues.push('invalid_status');
  }
  if (nonEmptyString(workPlan.language) && !['zh-CN', 'en'].includes(workPlan.language)) {
    issues.push('invalid_language');
  }

  const questions = stringArrayReport(workPlan.questions);
  const acceptance = stringArrayReport(workPlan.acceptance);
  const nextActions = stringArrayReport(workPlan.next_actions);
  if (questions.invalid) issues.push('invalid_questions');
  if (acceptance.invalid) issues.push('invalid_acceptance');
  if (nextActions.invalid) issues.push('invalid_next_actions');

  const steps = Array.isArray(workPlan.steps) ? workPlan.steps : [];
  const stepIds = new Set();
  const duplicateStepIds = new Set();
  const dependencyLists = new Map();
  for (const [index, step] of steps.entries()) {
    if (!isObject(step)) {
      issues.push('step_invalid');
      continue;
    }
    if (!nonEmptyString(step.id)) issues.push('step_missing_id');
    if (!nonEmptyString(step.title)) issues.push('step_missing_title');
    if (!nonEmptyString(step.goal)) issues.push('step_missing_goal');
    const dependencies = stringArrayReport(step.dependencies);
    const outputs = stringArrayReport(step.outputs);
    const stepAcceptance = stringArrayReport(step.acceptance);
    if (dependencies.invalid) issues.push('step_invalid_dependencies');
    if (outputs.invalid) issues.push('step_invalid_outputs');
    if (!outputs.items.length) issues.push('step_missing_outputs');
    if (stepAcceptance.invalid) issues.push('step_invalid_acceptance');
    if (!stepAcceptance.items.length) issues.push('step_missing_acceptance');
    if (step.state !== 'pending') issues.push('step_invalid_state');

    const graphId = nonEmptyString(step.id) ? step.id.trim() : `<missing-step-${index + 1}>`;
    dependencyLists.set(graphId, dependencies.items);
    if (nonEmptyString(step.id)) {
      const id = step.id.trim();
      if (stepIds.has(id)) duplicateStepIds.add(id);
      stepIds.add(id);
    }
  }

  if (duplicateStepIds.size) issues.push('duplicate_step_ids');
  const graph = Object.fromEntries([...dependencyLists.keys()].map((id) => [id, []]));
  let hasMissingDependencyRefs = false;
  for (const [id, dependencies] of dependencyLists) {
    for (const dependency of dependencies) {
      if (!stepIds.has(dependency)) {
        hasMissingDependencyRefs = true;
      } else if (graph[id]) {
        graph[id].push(dependency);
      }
    }
  }
  if (hasMissingDependencyRefs) issues.push('missing_dependency_refs');
  if (!duplicateStepIds.size && hasCycle(graph)) issues.push('cycle_detected');

  if (workPlan.status === 'planned') {
    if (!steps.length) issues.push('missing_steps');
    if (!acceptance.items.length) issues.push('missing_acceptance');
  }
  if (workPlan.status === 'needs_clarification') {
    if (steps.length) issues.push('clarification_with_steps');
    if (!questions.items.length) issues.push('clarification_without_questions');
  }
  if (!nextActions.items.length) issues.push('missing_next_actions');

  const sourceIds = new Set();
  const duplicateSourceIds = new Set();
  for (const source of Array.isArray(workPlan.source_summary) ? workPlan.source_summary : []) {
    if (!isObject(source)) {
      issues.push('source_invalid');
      continue;
    }
    if (!nonEmptyString(source.source_id)) {
      issues.push('source_missing_id');
    } else {
      const sourceId = source.source_id.trim();
      if (sourceIds.has(sourceId)) duplicateSourceIds.add(sourceId);
      sourceIds.add(sourceId);
    }
    if (!nonEmptyString(source.relative_path)) issues.push('source_missing_relative_path');
    if (nonEmptyString(source.relative_path) && !safeRelativeSourcePath(source.relative_path)) {
      issues.push('source_path_not_relative');
    }
  }
  if (duplicateSourceIds.size) issues.push('duplicate_source_ids');

  return { valid: issues.length === 0, issues: unique(issues) };
}

function missingFields(value, fields) {
  if (!isObject(value)) return [...fields];
  return fields.filter((field) => !(field in value));
}

function missingTaskFieldsFor(task) {
  if (!isObject(task)) return [...TASK_REQUIRED_FIELDS];
  const missing = [];
  for (const field of TASK_REQUIRED_FIELDS) {
    if (!(field in task)) {
      missing.push(field);
      continue;
    }
    if (TASK_TEXT_FIELDS.includes(field) && !nonEmptyString(task[field])) missing.push(field);
    if (TASK_NONEMPTY_ARRAY_FIELDS.includes(field) && !nonEmptyStringArray(task[field])) {
      missing.push(field);
    }
    if (field === 'dependencies' && !stringArray(task[field])) missing.push(field);
  }
  return unique(missing);
}

function deliverablesReport(value) {
  if (!Array.isArray(value)) return { invalid: true, validItems: [] };
  const validItems = value.filter(
    (item) =>
      isObject(item) &&
      nonEmptyString(item.name) &&
      (!('format' in item) || OUTPUT_FORMATS.includes(item.format)) &&
      (!('required' in item) || typeof item.required === 'boolean')
  );
  return {
    invalid: validItems.length !== value.length,
    validItems
  };
}

function missingInfoReport(value) {
  if (!isObject(value)) return { invalid: true, blocking: [], nonBlocking: [] };
  const blocking = stringArrayReport(value.blocking);
  const nonBlocking = stringArrayReport(value.non_blocking);
  return {
    invalid: blocking.invalid || nonBlocking.invalid,
    blocking: blocking.items,
    nonBlocking: nonBlocking.items
  };
}

function stringArrayReport(value) {
  if (!Array.isArray(value)) return { invalid: true, items: [] };
  const items = value.filter(nonEmptyString).map((item) => item.trim());
  return {
    invalid: items.length !== value.length,
    items
  };
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function nonEmptyStringArray(value) {
  return stringArray(value) && value.length > 0;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeRelativeSourcePath(value) {
  const text = String(value || '').trim();
  if (!text || /[\u0000-\u001f]/.test(text)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) return false;
  if (/^[/\\]/.test(text)) return false;
  const segments = text.replace(/\\/g, '/').split('/');
  return !segments.some((segment) => segment === '.' || segment === '..');
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function taskId(task, index) {
  return nonEmptyString(task?.id) ? task.id.trim() : `<missing-id-${index + 1}>`;
}

function duplicateIds(tasks) {
  const seen = new Set();
  const duplicates = new Set();
  for (const task of tasks) {
    if (!nonEmptyString(task?.id)) continue;
    const id = task.id.trim();
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function coarseTaskErrors(tasks) {
  return tasks.flatMap((task, index) => {
    if (!Array.isArray(task?.outputs) || task.outputs.length !== 1) return [];
    const output = normalizedLowercase(task.outputs[0]);
    const title = normalizedLowercase(task.title);
    if (!output || (title !== `define ${output}` && title !== `定义${output}`)) return [];
    return [`task_too_coarse:${taskId(task, index)}`];
  });
}

function normalizedLowercase(value) {
  return nonEmptyString(value) ? value.trim().toLowerCase() : '';
}

function hasCycle(graph) {
  const visiting = new Set();
  const visited = new Set();

  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const dependency of graph[node] || []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return Object.keys(graph).some(visit);
}

function coverageGapsFor(plan, tasks) {
  if (!Array.isArray(plan.required_deliverables)) return [];
  const outputs = new Set(tasks.flatMap((task) => arrayField(task?.outputs).map(nameOf)));
  return plan.required_deliverables.filter((item) => !outputs.has(nameOf(item)));
}

function plannerPolicyReport(plan) {
  const rawPolicy = plan.planner_policy;
  const errors = [];
  if (rawPolicy !== undefined && !isObject(rawPolicy)) {
    return {
      errors: ['invalid_planner_policy'],
      maxTasks: DEFAULT_PLANNER_POLICY.max_tasks,
      maxDepth: DEFAULT_PLANNER_POLICY.max_depth
    };
  }

  const policy = rawPolicy || {};
  const maxTasks = integerPolicyValue(
    policy,
    'max_tasks',
    DEFAULT_PLANNER_POLICY.max_tasks,
    errors,
    'invalid_max_tasks'
  );
  const maxDepth = integerPolicyValue(
    policy,
    'max_depth',
    DEFAULT_PLANNER_POLICY.max_depth,
    errors,
    'invalid_max_depth'
  );

  for (const field of ['allow_parallel_groups', 'require_acceptance_per_task', 'prefer_atomic_tasks']) {
    if (field in policy && typeof policy[field] !== 'boolean') errors.push(`invalid_${field}`);
  }

  return { errors, maxTasks, maxDepth };
}

function integerPolicyValue(policy, field, fallback, errors, errorCode) {
  const raw = policy[field] ?? fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    errors.push(errorCode);
    return fallback;
  }
  return value;
}

function replanPolicyErrors(policy) {
  if (!isObject(policy)) return ['invalid_replan_policy'];
  const errors = [];
  const triggers = stringArrayReport(policy.trigger_on);
  if (triggers.invalid || !triggers.items.length) {
    errors.push('invalid_replan_triggers');
  } else if (triggers.items.some((trigger) => !REPLAN_TRIGGERS.includes(trigger))) {
    errors.push('invalid_replan_trigger');
  }
  const maxReplans = Number(policy.max_replans);
  if (!Number.isInteger(maxReplans) || maxReplans < 0) errors.push('invalid_max_replans');
  return errors;
}

function depthLimitReport(graph, maxDepth) {
  const memo = new Map();

  function depth(node) {
    if (memo.has(node)) return memo.get(node);
    const dependencies = graph[node] || [];
    const value = dependencies.length
      ? 1 + Math.max(...dependencies.map((dependency) => depth(dependency)))
      : 1;
    memo.set(node, value);
    return value;
  }

  const depths = Object.keys(graph).map(depth);
  const deepest = depths.length ? Math.max(...depths) : 0;
  return deepest > maxDepth ? { depth: deepest, max_depth: maxDepth } : {};
}

function nameOf(value) {
  return String(isObject(value) ? value.name || '' : value).trim();
}

function validOutputFormat(value) {
  return OUTPUT_FORMATS.includes(value);
}

function evidenceWithoutSource(spec) {
  const sources = new Set(arrayField(spec.source_map).map((item) => item?.source_id).filter(Boolean));
  return arrayField(spec.evidence_map).filter((item) => item?.source_id && !sources.has(item.source_id));
}

function arrayField(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values)];
}
