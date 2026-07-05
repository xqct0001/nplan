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
  const text = stripPromptArtifacts(surfaceRequest);
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
    audience: inferAudience(context),
    target_object: inferTargetObject(text, context, deliverables),
    background_context: listContext(context),
    deliverables: deliverables.length
      ? deliverables
      : [makeDeliverable('unknown', 'unknown', true)],
    output_format: outputFormatFor(deliverables),
    constraints: {
      time_budget: null,
      model_tier_hint: 'mixed',
      language: 'zh-CN',
      allowed_tools: ['project_context', 'configured_model', 'schema_validator'],
      forbidden_tools: ['code_execution', 'unauthorized_network_access', 'task_execution'],
      data_sensitivity: 'internal'
    },
    context_requirements: contextRequirementsFor(text),
    source_map: normalizeSourceMap(context.source_map),
    evidence_map: normalizeEvidenceMap(context.evidence_map),
    context_report: normalizeContextReport(context.context_report),
    conflict_report: normalizeConflictReport(context.conflict_report),
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
    checkpoint_policy: defaultCheckpointPolicy(),
    quality_bar: qualityBarFor(deliverables, blocking),
    planning_readiness: { score, decision },
    risk_level: riskLevelFor(text, blocking),
    provenance: {
      conversation_turns_used: text ? [text] : [],
      files_used: filesUsed(context),
      model_used: false
    }
  };
}

export function composeTaskSpecFromModel(surfaceRequest, modelDraft, context = {}) {
  const text = stripPromptArtifacts(surfaceRequest);
  const local = compileTaskSpec(text, context);
  const deliverables = normalizeDeliverables(modelDraft.deliverables);
  const blocking = normalizeMissing(modelDraft.missing_information).blocking;
  const successCriteria = arrayOfStrings(modelDraft.success_criteria);
  const score = blocking.length ? 0.55 : 0.9;
  return {
    ...local,
    inferred_goal: stringOr(modelDraft.inferred_goal, local.inferred_goal),
    task_type: stringOr(modelDraft.task_type, local.task_type),
    audience: stringOr(modelDraft.audience, local.audience),
    target_object: stringOr(modelDraft.target_object, local.target_object),
    deliverables: deliverables.length ? deliverables : local.deliverables,
    output_format: normalizedOutputFormat(modelDraft.output_format, deliverables, local.output_format),
    constraints: normalizeConstraints(local.constraints, modelDraft.constraints),
    context_requirements: arrayOfStrings(modelDraft.context_requirements).length
      ? arrayOfStrings(modelDraft.context_requirements)
      : local.context_requirements,
    source_map: local.source_map,
    evidence_map: local.evidence_map,
    context_report: local.context_report,
    conflict_report: local.conflict_report,
    missing_information: normalizeMissing(modelDraft.missing_information),
    assumptions: arrayOfStrings(modelDraft.assumptions),
    ambiguities: arrayOfStrings(modelDraft.ambiguities),
    success_criteria: successCriteria.length
      ? successCriteria
      : deliverables.map((item) => `${item.name} is produced and validated`),
    clarification: {
      requires_clarification: Boolean(blocking.length),
      questions: blocking.map((item) => `Please clarify: ${item}`),
      reason: blocking.length ? 'blocking information is missing' : 'ready to plan'
    },
    checkpoint_policy: normalizeCheckpointPolicy(modelDraft.checkpoint_policy, local.checkpoint_policy),
    quality_bar: arrayOfStrings(modelDraft.quality_bar).length
      ? arrayOfStrings(modelDraft.quality_bar)
      : local.quality_bar,
    planning_readiness: {
      score,
      decision: blocking.length ? 'clarify_then_plan' : 'ready'
    },
    risk_level: normalizeRiskLevel(modelDraft.risk_level, local.risk_level),
    provenance: {
      conversation_turns_used: text ? [text] : [],
      files_used: filesUsed(context),
      model_used: true
    }
  };
}

export function stripPromptArtifacts(value) {
  let text = String(value || '').trim();
  while (text.startsWith('>')) text = text.slice(1).trim();
  return text;
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

function inferAudience(context) {
  return stringOr(context.audience, 'human reviewer or downstream executor');
}

function inferTargetObject(text, context, deliverables) {
  if (context.target_object) return String(context.target_object);
  if (context.files?.length) return 'local project context';
  if (deliverables.length) return 'planning artifacts';
  return text ? 'user request' : 'unknown';
}

function outputFormatFor(deliverables) {
  if (!deliverables.length) return 'unknown';
  const formats = new Set(deliverables.map((item) => item.format || 'unknown'));
  if (formats.size === 1) return [...formats][0];
  return 'mixed';
}

function defaultCheckpointPolicy() {
  return {
    stop_on: [
      'blocking_missing_information',
      'task_scope_change',
      'irreversible_action_requested',
      'unauthorized_tool_required',
      'unauthorized_network_action',
      'validation_failure'
    ],
    requires_user_confirmation_for: [
      'task_execution',
      'file_editing',
      'external_network_action',
      'remote_agent_management'
    ]
  };
}

function qualityBarFor(deliverables, blocking) {
  if (blocking.length) {
    return [
      'blocking information is explicit',
      'clarification questions are actionable',
      'no task plan is produced before readiness'
    ];
  }
  return [
    'required deliverables are explicit',
    'success criteria are verifiable',
    'task boundaries and assumptions are visible',
    deliverables.length ? 'deliverables can be covered by task outputs' : 'missing deliverables are surfaced'
  ];
}

function riskLevelFor(text, blocking) {
  const lowered = text.toLowerCase();
  const highRiskTerms = [
    'delete',
    'remove',
    'overwrite',
    'deploy',
    'send',
    'purchase',
    'commit',
    '删除',
    '移除',
    '覆盖',
    '部署',
    '发送',
    '购买',
    '提交'
  ];
  if (highRiskTerms.some((term) => lowered.includes(term))) return 'high';
  if (blocking.length) return 'medium';
  return 'low';
}

function contextRequirementsFor(text) {
  const lowered = text.toLowerCase();
  const requirements = ['surface_request'];
  if (['doc', 'document', 'readme', 'report', '文档', '报告'].some((term) => lowered.includes(term))) {
    requirements.push('local_documents');
  }
  if (['code', 'src', 'test', 'schema', '代码', '测试'].some((term) => lowered.includes(term))) {
    requirements.push('project_code');
  }
  return requirements;
}

function clarificationQuestions(blocking) {
  if (blocking.includes('final deliverable') || blocking.includes('required deliverables')) {
    return ['What final deliverable do you expect?'];
  }
  return [];
}

function listContext(context) {
  return [
    ...(context.files || []),
    ...(context.project_notes || []),
    ...normalizeEvidenceMap(context.evidence_map).map((item) => item.evidence_id)
  ];
}

function knownInputs(context) {
  return [
    ...(context.files || []),
    ...(context.project_notes || []),
    ...(context.instruction_files || [])
  ];
}

function normalizeDeliverables(deliverables) {
  return Array.isArray(deliverables)
    ? deliverables
        .filter((item) => item && item.name)
        .map((item) => ({
          name: String(item.name),
          format: item.format || 'unknown',
          required: item.required !== false
        }))
    : [];
}

function normalizeSourceMap(value) {
  return Array.isArray(value)
    ? value
        .filter((item) => item && item.source_id)
        .map((item) => ({
          source_id: String(item.source_id),
          kind: String(item.kind || 'unknown'),
          path: String(item.path || ''),
          relative_path: String(item.relative_path || item.path || ''),
          hash: String(item.hash || ''),
          mtime: String(item.mtime || ''),
          size_bytes: Number(item.size_bytes || 0),
          parser_version: String(item.parser_version || 'unknown'),
          span: item.span || null
        }))
    : [];
}

function normalizeEvidenceMap(value) {
  return Array.isArray(value)
    ? value
        .filter((item) => item && item.evidence_id && item.source_id)
        .map((item) => ({
          evidence_id: String(item.evidence_id),
          source_id: String(item.source_id),
          span: item.span || null,
          text: String(item.text || ''),
          claim_type: String(item.claim_type || 'unknown'),
          confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null
        }))
    : [];
}

function normalizeContextReport(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { source_count: 0, evidence_count: 0, dropped_source_count: 0, warnings: [] };
}

function normalizeConflictReport(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? {
        blocking: Array.isArray(value.blocking) ? value.blocking : [],
        non_blocking: Array.isArray(value.non_blocking) ? value.non_blocking : [],
        resolutions: Array.isArray(value.resolutions) ? value.resolutions : []
      }
    : { blocking: [], non_blocking: [], resolutions: [] };
}

function filesUsed(context) {
  const sourceFiles = normalizeSourceMap(context.source_map).map((source) => source.path).filter(Boolean);
  return sourceFiles.length ? sourceFiles : [...(context.files || [])];
}

function normalizedOutputFormat(value, deliverables, fallback) {
  const allowed = new Set(['json', 'markdown', 'yaml', 'text', 'diagram', 'code', 'mixed', 'unknown']);
  if (typeof value === 'string' && allowed.has(value)) return value;
  if (deliverables.length) return outputFormatFor(deliverables);
  return fallback;
}

function normalizeCheckpointPolicy(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const stopOn = arrayOfStrings(value.stop_on);
  const confirmations = arrayOfStrings(value.requires_user_confirmation_for);
  return {
    stop_on: stopOn.length ? stopOn : fallback.stop_on,
    requires_user_confirmation_for: confirmations.length
      ? confirmations
      : fallback.requires_user_confirmation_for
  };
}

function normalizeRiskLevel(value, fallback) {
  return ['low', 'medium', 'high', 'unknown'].includes(value) ? value : fallback;
}

function normalizeConstraints(base, value) {
  const incoming = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const merged = { ...base, ...incoming };
  delete merged.offline_preferred;
  if (Array.isArray(merged.forbidden_tools)) {
    merged.forbidden_tools = [
      ...new Set(
        merged.forbidden_tools.map((tool) =>
          tool === 'network_access' ? 'unauthorized_network_access' : String(tool)
        )
      )
    ];
  }
  return merged;
}

function normalizeMissing(value) {
  return {
    blocking: arrayOfStrings(value?.blocking),
    non_blocking: arrayOfStrings(value?.non_blocking)
  };
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
