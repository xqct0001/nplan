import { makeDeliverable } from './schemas.js';

const TASK_TYPES = {
  coding: ['implement', 'code', 'module', 'bug', 'test', 'schema', 'verifier', 'dag'],
  research: ['research', 'report', 'analyze', 'analysis'],
  writing: ['document', 'readme', 'write', 'spec'],
  design: ['design', 'architecture', 'plan'],
  automation: ['automate', 'script', 'schedule']
};

const KNOWN_DELIVERABLES = [
  ['TaskSpec schema', ['taskspec schema', 'taskspec']],
  ['TaskSpec verifier', ['taskspec verifier', 'validate taskspec']],
  ['TaskPlan schema', ['taskplan schema', 'taskplan']],
  ['DAG verifier', ['dag verifier', 'dag']]
];

export function compileTaskSpec(surfaceRequest, context = {}) {
  const text = String(surfaceRequest || '').trim();
  const deliverables = extractDeliverables(text);
  const blocking = [];
  const ambiguities = [];

  if (isVague(text)) {
    blocking.push('final deliverable');
    ambiguities.push('final deliverable is unclear');
  }
  if (!deliverables.length) {
    blocking.push('required deliverables');
    ambiguities.push('required deliverables are unclear');
  }

  const successCriteria = successCriteriaFor(deliverables, blocking);
  const score = readinessScore(text, deliverables, successCriteria, blocking);
  const decision = score >= 0.8 && !blocking.length ? 'ready' : 'clarify_then_plan';

  return {
    version: '1.0',
    surface_request: text,
    inferred_goal: inferGoal(deliverables, blocking),
    task_type: classifyTaskType(text),
    background_context: listContext(context),
    deliverables: deliverables.length
      ? deliverables
      : [makeDeliverable('unknown', 'unknown', true)],
    constraints: {
      offline_preferred: true,
      time_budget: null,
      model_tier_hint: 'mixed',
      language: 'zh-CN',
      allowed_tools: ['local_fs', 'local_llm', 'schema_validator'],
      forbidden_tools: ['code_execution', 'network_access', 'task_execution'],
      data_sensitivity: 'internal'
    },
    known_inputs: knownInputs(context),
    missing_information: { blocking, non_blocking: [] },
    assumptions: blocking.length
      ? []
      : ['Only planning artifacts are produced; execution is outside this module'],
    ambiguities,
    success_criteria: successCriteria,
    clarification: {
      requires_clarification: Boolean(blocking.length) || score < 0.6,
      questions: clarificationQuestions(blocking),
      reason: blocking.length ? 'blocking information is missing' : 'ready to plan'
    },
    planning_readiness: { score, decision },
    provenance: {
      conversation_turns_used: text ? [text] : [],
      files_used: [...(context.files || [])]
    }
  };
}

function classifyTaskType(text) {
  const lowered = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TASK_TYPES)) {
    if (keywords.some((keyword) => lowered.includes(keyword))) return type;
  }
  return 'unknown';
}

function extractDeliverables(text) {
  const lowered = text.toLowerCase();
  const deliverables = [];
  for (const [name, keywords] of KNOWN_DELIVERABLES) {
    if (keywords.some((keyword) => lowered.includes(keyword))) {
      deliverables.push(makeDeliverable(name));
    }
  }
  return deliverables;
}

function isVague(text) {
  return !text || text.length <= 6 || ['help', 'do it', 'handle it'].includes(text.toLowerCase());
}

function successCriteriaFor(deliverables, blocking) {
  if (blocking.length) return ['blocking information is clarified'];
  return [
    ...deliverables.map((item) => `${item.name} is produced and validated`),
    'TaskPlan has no cyclic dependencies'
  ];
}

function readinessScore(text, deliverables, successCriteria, blocking) {
  if (blocking.length) return 0.45;
  const score =
    0.3 +
    (text.length >= 12 ? 0.25 : 0) +
    (deliverables.length ? 0.25 : 0) +
    (successCriteria.length ? 0.2 : 0);
  return Math.min(1, Number(score.toFixed(2)));
}

function inferGoal(deliverables, blocking) {
  if (blocking.length) return "Clarify the user's planning request before creating a task plan";
  return `Create verified local planning artifacts for ${deliverables.map((item) => item.name).join(', ')}`;
}

function clarificationQuestions(blocking) {
  if (blocking.includes('final deliverable') || blocking.includes('required deliverables')) {
    return ['What final deliverable do you expect?'];
  }
  return [];
}

function listContext(context) {
  return [...(context.files || []), ...(context.project_notes || [])];
}

function knownInputs(context) {
  return [
    ...(context.files || []),
    ...(context.project_notes || []),
    ...(context.instruction_files || [])
  ];
}
