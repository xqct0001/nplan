import {
  DEFAULT_PLANNER_POLICY,
  TASKPLAN_REQUIRED_FIELDS,
  TASKSPEC_REQUIRED_FIELDS,
  TASK_REQUIRED_FIELDS
} from './schemas.js';

export function validateTaskSpec(spec) {
  const missingRequired = missingFields(spec, TASKSPEC_REQUIRED_FIELDS);
  const conflicts = [];
  const missingInfo = isObject(spec?.missing_information) ? spec.missing_information : {};
  const blocking = asArray(missingInfo.blocking);
  const readiness = isObject(spec?.planning_readiness) ? spec.planning_readiness : {};
  const decision = readiness.decision;
  const score = toNumber(readiness.score);
  const clarification = isObject(spec?.clarification) ? spec.clarification : {};
  const requiresClarification = Boolean(clarification.requires_clarification);
  const questions = asArray(clarification.questions);
  const deliverables = asArray(spec?.deliverables);
  const successCriteria = asArray(spec?.success_criteria);
  const outputFormat = spec?.output_format;
  const checkpointPolicy = isObject(spec?.checkpoint_policy) ? spec.checkpoint_policy : {};
  const qualityBar = asArray(spec?.quality_bar);
  const riskLevel = spec?.risk_level;
  const contextConflicts = isObject(spec?.conflict_report) ? spec.conflict_report : {};
  const contextBlocking = asArray(contextConflicts.blocking);

  if (blocking.length && decision === 'ready') conflicts.push('blocking_info_but_marked_ready');
  if (requiresClarification && !questions.length) conflicts.push('clarification_without_questions');
  if (score !== null && score < 0.6 && !requiresClarification) {
    conflicts.push('low_score_without_clarification');
  }
  if (!deliverables.length) conflicts.push('no_deliverables');
  if (!successCriteria.length) conflicts.push('no_success_criteria');
  if (!validOutputFormat(outputFormat)) conflicts.push('invalid_output_format');
  if (!asArray(checkpointPolicy.stop_on).length) conflicts.push('checkpoint_policy_without_stop_rules');
  if (!qualityBar.length) conflicts.push('no_quality_bar');
  if (!['low', 'medium', 'high', 'unknown'].includes(riskLevel)) conflicts.push('invalid_risk_level');
  if (contextBlocking.length) conflicts.push('blocking_context_conflicts');
  if (evidenceWithoutSource(spec).length) conflicts.push('evidence_without_source');

  const readyForPlanning =
    !missingRequired.length &&
    !conflicts.length &&
    !blocking.length &&
    !contextBlocking.length &&
    decision === 'ready' &&
    (score === null || score >= 0.6);

  return {
    valid: !missingRequired.length && !conflicts.length,
    ready_for_planning: readyForPlanning,
    missing_required_fields: missingRequired,
    conflicts
  };
}

export function validateTaskPlan(plan) {
  const missingRequired = missingFields(plan, TASKPLAN_REQUIRED_FIELDS);
  const tasks = asArray(plan?.tasks);
  const knownIds = new Set(tasks.map((task, index) => taskId(task, index)).filter(Boolean));
  const missingTaskFields = {};
  const missingDependencyRefs = [];
  const tasksWithoutAcceptance = [];
  const tasksWithoutIo = [];
  const graph = Object.fromEntries([...knownIds].map((id) => [id, []]));

  tasks.forEach((task, index) => {
    const id = taskId(task, index);
    const missing = missingFields(task, TASK_REQUIRED_FIELDS);
    if (missing.length) missingTaskFields[id] = missing;
    if (!asArray(task?.acceptance).length) tasksWithoutAcceptance.push(id);
    if (!asArray(task?.inputs).length || !asArray(task?.outputs).length) tasksWithoutIo.push(id);

    asArray(task?.dependencies).forEach((dependency) => {
      if (!knownIds.has(dependency)) {
        missingDependencyRefs.push([id, dependency]);
      } else {
        graph[id].push(dependency);
      }
    });
  });

  const cycleDetected = hasCycle(graph);
  const coverageGaps = coverageGapsFor(plan, tasks);
  const { policyErrors, taskCountExceeded } = taskLimitReport(plan, tasks);

  return {
    valid:
      !missingRequired.length &&
      !Object.keys(missingTaskFields).length &&
      !missingDependencyRefs.length &&
      !cycleDetected &&
      !tasksWithoutAcceptance.length &&
      !tasksWithoutIo.length &&
      !coverageGaps.length &&
      !policyErrors.length &&
      !Object.keys(taskCountExceeded).length,
    missing_required_fields: missingRequired,
    missing_task_fields: missingTaskFields,
    cycle_detected: cycleDetected,
    missing_dependency_refs: missingDependencyRefs,
    tasks_without_acceptance: tasksWithoutAcceptance,
    tasks_without_io: tasksWithoutIo,
    coverage_gaps: coverageGaps,
    policy_errors: policyErrors,
    task_count_exceeded: taskCountExceeded
  };
}

function missingFields(value, fields) {
  if (!isObject(value)) return [...fields];
  return fields.filter((field) => !(field in value));
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function taskId(task, index) {
  return task?.id || `<missing-id-${index + 1}>`;
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
  const outputs = new Set(tasks.flatMap((task) => asArray(task?.outputs).map(nameOf)));
  return asArray(plan?.required_deliverables).filter((item) => !outputs.has(nameOf(item)));
}

function taskLimitReport(plan, tasks) {
  const rawMax = plan?.planner_policy?.max_tasks ?? DEFAULT_PLANNER_POLICY.max_tasks;
  const maxTasks = Number(rawMax);
  if (!Number.isInteger(maxTasks) || maxTasks < 1) {
    return { policyErrors: ['invalid_max_tasks'], taskCountExceeded: {} };
  }
  if (tasks.length > maxTasks) {
    return { policyErrors: [], taskCountExceeded: { count: tasks.length, max_tasks: maxTasks } };
  }
  return { policyErrors: [], taskCountExceeded: {} };
}

function nameOf(value) {
  return String(isObject(value) ? value.name || '' : value).trim();
}

function validOutputFormat(value) {
  return ['json', 'markdown', 'yaml', 'text', 'diagram', 'code', 'mixed', 'unknown'].includes(value);
}

function evidenceWithoutSource(spec) {
  const sources = new Set(asArray(spec?.source_map).map((item) => item?.source_id).filter(Boolean));
  return asArray(spec?.evidence_map).filter((item) => item?.source_id && !sources.has(item.source_id));
}
