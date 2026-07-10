import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { normalizeUserExclusions } from './context-policy.js';

const SESSION_VERSION = '2.0';
const MAX_CANONICAL_DECODE_ROUNDS = 3;
const MAX_QUERY_COMPONENT_LENGTH = 8192;

export function createSession(options = {}) {
  const now = options.now ? options.now() : new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('session time must be a valid Date');
  }
  const timestamp = now.toISOString();
  return {
    version: SESSION_VERSION,
    id: `${timestamp.replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    created_at: timestamp,
    updated_at: timestamp,
    turns: [],
    last_result: null,
    last_work_plan: null
  };
}

export function sanitizePlanningResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    status: safeText(result.status),
    pipeline_steps: textArray(result.pipeline_steps),
    taskspec: sanitizeTaskSpec(result.taskspec),
    taskplan: sanitizeTaskPlan(result.taskplan),
    taskspec_report: sanitizeTaskSpecReport(result.taskspec_report),
    taskplan_report: sanitizeTaskPlanReport(result.taskplan_report),
    clarification_questions: textArray(result.clarification_questions)
  };
}

export function recordSessionTurn(session, {
  request,
  revision = '',
  result,
  workPlan
}) {
  assertSessionObject(session);
  const now = new Date().toISOString();
  const safeResult = sanitizePlanningResult(result);
  const safeWorkPlan = sanitizeWorkPlan(workPlan);
  const turn = {
    at: now,
    request: sanitizeText(request),
    revision: sanitizeText(revision),
    result: safeResult,
    work_plan: safeWorkPlan,
    sources: sanitizeSources(result?.taskspec?.source_map)
  };
  session.turns.push(turn);
  session.updated_at = now;
  session.last_result = safeResult;
  session.last_work_plan = safeWorkPlan;
  return session;
}

export async function saveSession(root, session) {
  const normalized = normalizeV2Session(session);
  const directory = sessionDirectory(root);
  const target = sessionFile(root, normalized.id);
  const temporary = join(directory, `${normalized.id}.${process.pid}.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  assertSafeSessionValue(normalized);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return normalized;
}

export async function loadSession(root, id) {
  const safeId = validateSessionId(id);
  const parsed = JSON.parse(await readFile(sessionFile(root, safeId), 'utf8'));
  if (String(parsed?.version || '') !== SESSION_VERSION) {
    return incompatibleSession(parsed, safeId);
  }
  return normalizeV2Session(parsed, safeId);
}

export async function loadLatestSession(root) {
  const directory = sessionDirectory(root);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  let latest = null;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -5);
    try {
      const loaded = await loadSession(root, id);
      const info = await stat(sessionFile(root, id));
      const updated = Date.parse(loaded.updated_at || '') || info.mtimeMs;
      if (!latest || updated > latest.updated || (updated === latest.updated && info.mtimeMs > latest.mtime)) {
        latest = { session: loaded, updated, mtime: info.mtimeMs };
      }
    } catch {
      // Malformed or unsafe files are ignored so one file cannot block all sessions.
    }
  }
  return latest?.session || null;
}

export function sessionFile(root, id) {
  const safeId = validateSessionId(id);
  return join(sessionDirectory(root), `${safeId}.json`);
}

function sessionDirectory(root) {
  return join(resolve(root || process.cwd()), '.nplan', 'sessions');
}

function normalizeV2Session(value, fallbackId = '') {
  assertSessionObject(value);
  const id = validateSessionId(value.id || fallbackId);
  const now = new Date().toISOString();
  const turns = Array.isArray(value.turns)
    ? value.turns.map((turn) => sanitizeTurn(turn))
    : [];
  const last = turns.at(-1) || null;
  return {
    version: SESSION_VERSION,
    id,
    created_at: validTimestamp(value.created_at) || now,
    updated_at: validTimestamp(value.updated_at) || last?.at || now,
    turns,
    last_result: sanitizePlanningResult(value.last_result || last?.result),
    last_work_plan: sanitizeWorkPlan(value.last_work_plan || last?.work_plan)
  };
}

function sanitizeTurn(turn = {}) {
  return {
    at: validTimestamp(turn.at) || new Date().toISOString(),
    request: sanitizeText(turn.request),
    revision: sanitizeText(turn.revision),
    result: sanitizePlanningResult(turn.result),
    work_plan: sanitizeWorkPlan(turn.work_plan),
    sources: sanitizeSources(turn.sources)
  };
}

function sanitizeWorkPlan(workPlan) {
  if (!workPlan || typeof workPlan !== 'object') return null;
  return {
    version: safeText(workPlan.version),
    plan_id: safeText(workPlan.plan_id),
    session_id: safeText(workPlan.session_id),
    status: safeText(workPlan.status),
    language: safeText(workPlan.language),
    conclusion: safeText(workPlan.conclusion),
    questions: textArray(workPlan.questions),
    steps: objectArray(workPlan.steps).map((step) => ({
      id: safeText(step.id),
      title: safeText(step.title),
      goal: safeText(step.goal),
      dependencies: textArray(step.dependencies),
      outputs: textArray(step.outputs),
      acceptance: textArray(step.acceptance),
      state: safeText(step.state)
    })),
    acceptance: textArray(workPlan.acceptance),
    source_summary: sanitizeSources(workPlan.source_summary),
    next_actions: textArray(workPlan.next_actions)
  };
}

function sanitizeTaskSpec(taskspec) {
  if (!taskspec || typeof taskspec !== 'object') return null;
  return {
    version: safeText(taskspec.version),
    surface_request: safeText(taskspec.surface_request),
    inferred_goal: safeText(taskspec.inferred_goal),
    task_type: safeText(taskspec.task_type),
    audience: safeText(taskspec.audience),
    target_object: safeText(taskspec.target_object),
    deliverables: objectArray(taskspec.deliverables).map((deliverable) => ({
      name: safeText(deliverable.name),
      format: safeText(deliverable.format),
      required: deliverable.required === true
    })),
    output_format: safeText(taskspec.output_format),
    constraints: sanitizeConstraints(taskspec.constraints),
    context_requirements: textArray(taskspec.context_requirements),
    known_inputs: [],
    missing_information: sanitizeMissingInformation(taskspec.missing_information),
    assumptions: textArray(taskspec.assumptions),
    ambiguities: textArray(taskspec.ambiguities),
    success_criteria: textArray(taskspec.success_criteria),
    clarification: sanitizeClarification(taskspec.clarification),
    checkpoint_policy: sanitizeCheckpointPolicy(taskspec.checkpoint_policy),
    quality_bar: textArray(taskspec.quality_bar),
    planning_readiness: sanitizePlanningReadiness(taskspec.planning_readiness),
    risk_level: safeText(taskspec.risk_level),
    context_report: sanitizeContextReport(taskspec.context_report),
    provenance: {
      conversation_turns_used: textArray(taskspec.provenance?.conversation_turns_used),
      files_used: [],
      model_used: taskspec.provenance?.model_used === true
    }
  };
}

function sanitizeConstraints(value) {
  const constraints = value && typeof value === 'object' ? value : {};
  return {
    time_budget: safeScalar(constraints.time_budget),
    model_tier_hint: safeText(constraints.model_tier_hint),
    language: safeText(constraints.language),
    allowed_tools: textArray(constraints.allowed_tools),
    forbidden_tools: textArray(constraints.forbidden_tools),
    data_sensitivity: safeText(constraints.data_sensitivity)
  };
}

function sanitizeMissingInformation(value) {
  const information = value && typeof value === 'object' ? value : {};
  return {
    blocking: textArray(information.blocking),
    non_blocking: textArray(information.non_blocking)
  };
}

function sanitizeClarification(value) {
  const clarification = value && typeof value === 'object' ? value : {};
  return {
    requires_clarification: clarification.requires_clarification === true,
    questions: textArray(clarification.questions),
    reason: safeText(clarification.reason)
  };
}

function sanitizeCheckpointPolicy(value) {
  const policy = value && typeof value === 'object' ? value : {};
  return {
    stop_on: textArray(policy.stop_on),
    requires_user_confirmation_for: textArray(policy.requires_user_confirmation_for)
  };
}

function sanitizePlanningReadiness(value) {
  const readiness = value && typeof value === 'object' ? value : {};
  return {
    score: finiteNumber(readiness.score),
    decision: safeText(readiness.decision)
  };
}

function sanitizeContextReport(value) {
  const report = value && typeof value === 'object' ? value : {};
  return {
    source_count: finiteNumber(report.source_count),
    evidence_count: finiteNumber(report.evidence_count),
    dropped_source_count: finiteNumber(report.dropped_source_count),
    budget: {
      max_sources: finiteNumber(report.budget?.max_sources),
      max_evidence_chars_per_source: finiteNumber(
        report.budget?.max_evidence_chars_per_source
      )
    },
    warnings: textArray(report.warnings)
  };
}

function sanitizeTaskPlan(taskplan) {
  if (!taskplan || typeof taskplan !== 'object') return null;
  return {
    version: safeText(taskplan.version),
    plan_style: safeText(taskplan.plan_style),
    global_goal: safeText(taskplan.global_goal),
    global_acceptance: textArray(taskplan.global_acceptance),
    required_deliverables: textArray(taskplan.required_deliverables),
    planner_policy: sanitizePlannerPolicy(taskplan.planner_policy),
    tasks: objectArray(taskplan.tasks).map(sanitizeTask),
    replan_policy: sanitizeReplanPolicy(taskplan.replan_policy)
  };
}

function sanitizePlannerPolicy(value) {
  const policy = value && typeof value === 'object' ? value : {};
  return {
    max_depth: finiteNumber(policy.max_depth),
    max_tasks: finiteNumber(policy.max_tasks),
    allow_parallel_groups: policy.allow_parallel_groups === true,
    require_acceptance_per_task: policy.require_acceptance_per_task === true,
    prefer_atomic_tasks: policy.prefer_atomic_tasks === true
  };
}

function sanitizeTask(task) {
  return {
    id: safeText(task.id),
    title: safeText(task.title),
    goal: safeText(task.goal),
    inputs: textArray(task.inputs),
    outputs: textArray(task.outputs),
    dependencies: textArray(task.dependencies),
    parallel_group: safeText(task.parallel_group),
    acceptance: textArray(task.acceptance),
    complexity: safeText(task.complexity),
    risk: safeText(task.risk),
    model_tier: safeText(task.model_tier),
    state: safeText(task.state)
  };
}

function sanitizeReplanPolicy(value) {
  const policy = value && typeof value === 'object' ? value : {};
  return {
    trigger_on: textArray(policy.trigger_on),
    max_replans: finiteNumber(policy.max_replans)
  };
}

function sanitizeTaskSpecReport(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    valid: value.valid === true,
    ready_for_planning: value.ready_for_planning === true,
    missing_required_fields: issuePlaceholders(value.missing_required_fields),
    conflicts: issuePlaceholders(value.conflicts)
  };
}

function sanitizeTaskPlanReport(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    valid: value.valid === true,
    cycle_detected: value.cycle_detected === true,
    missing_required_fields: issuePlaceholders(value.missing_required_fields),
    missing_dependency_refs: issuePlaceholders(value.missing_dependency_refs),
    tasks_without_acceptance: issuePlaceholders(value.tasks_without_acceptance),
    tasks_without_io: issuePlaceholders(value.tasks_without_io),
    coverage_gaps: issuePlaceholders(value.coverage_gaps),
    policy_errors: issuePlaceholders(value.policy_errors),
    plan_errors: issuePlaceholders(value.plan_errors),
    duplicate_task_ids: issuePlaceholders(value.duplicate_task_ids),
    conflicts: issuePlaceholders(value.conflicts)
  };
}

function sanitizeSources(sources) {
  const seen = new Set();
  const safe = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const sourceId = typeof source?.source_id === 'string' ? source.source_id.trim() : '';
    if (
      !sourceId ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceId) ||
      containsCredentialMaterial(sourceId) ||
      seen.has(sourceId)
    ) continue;
    let relativePath;
    try {
      relativePath = normalizeUserExclusions([source.relative_path])[0];
    } catch {
      continue;
    }
    if (containsCredentialMaterial(relativePath)) continue;
    seen.add(sourceId);
    safe.push({ source_id: sourceId, relative_path: relativePath });
  }
  return safe;
}

function sanitizeText(value) {
  return redactUrlCredentials(String(value ?? ''))
    .replace(
      /\bauthorization\b\s*[:=]\s*(?:(?:bearer|basic)\s+[^\s,;]+|[^\s,;]+)/gi,
      '[redacted]'
    )
    .replace(/\b(?:bearer|basic)\s+[^\s,;]+/gi, '[redacted]')
    .replace(
      /\b(?:access[\s_-]?token|refresh[\s_-]?token|session[\s_-]?token|api[\s_-]?key|client[\s_-]?secret|secret[\s_-]?key|access[\s_-]?key|password|passwd|credentials?|evidence(?:[\s_-]?(?:text|map))?|token|secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      '[redacted]'
    )
    .replace(/\bauthorization\b/gi, '[redacted]')
    .replace(/(^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>|]+/g, '$1[local-path]')
    .replace(/(^|[\s"'=:(])\/(?!\/)[^\s"'<>|]+/g, '$1[local-path]');
}

function sensitiveKey(key) {
  const normalized = String(key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (!normalized) return false;
  if (['evidencecount', 'maxevidencecharspersource'].includes(normalized)) return false;
  return [
    'authorization',
    'apikey',
    'accesstoken',
    'refreshtoken',
    'sessiontoken',
    'clientsecret',
    'secretkey',
    'accesskey',
    'password',
    'passwd',
    'credential',
    'credentials',
    'evidence',
    'evidencetext',
    'evidencemap',
    'token',
    'secret'
  ].some((form) => normalized === form || normalized.endsWith(form));
}

function assertSafeSessionValue(value) {
  if (typeof value === 'string') {
    if (
      independentCredentialMaterial(value) ||
      /(^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>|]+/.test(value) ||
      /\\\\[^\s"'<>|]+/.test(value) ||
      /(^|[\s"'=:(])\/(?!\/)[^\s"'<>|]+/.test(value)
    ) {
      throw new Error('session contains unsafe local context or credentials');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertSafeSessionValue);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKey(key) || ['path', 'absolutepath'].includes(normalizedKey(key))) {
      throw new Error('session contains unsafe local context or credentials');
    }
    assertSafeSessionValue(child);
  }
}

function redactUrlCredentials(text) {
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
    const trailing = match.match(/[),.;!?]+$/)?.[0] || '';
    const candidate = trailing ? match.slice(0, -trailing.length) : match;
    try {
      const url = new URL(candidate);
      url.username = '';
      url.password = '';
      const safeParameters = new URLSearchParams();
      for (const [key, value] of url.searchParams.entries()) {
        if (!queryParameterContainsCredentials(key, value, 0)) {
          safeParameters.append(key, value);
        }
      }
      url.search = safeParameters.toString();
      return `${url.toString()}${trailing}`;
    } catch {
      return '[redacted-url]';
    }
  });
}

function containsCredentialMaterial(value) {
  const text = String(value || '');
  return boundedDecodeVariants(text).some(
    (variant) => containsDirectCredentialSyntax(variant) || urlContainsCredentials(variant)
  );
}

function urlContainsCredentials(text, nestingDepth = 0) {
  for (const match of String(text || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[),.;!?]+$/, ''));
      if (url.username || url.password) return true;
      for (const [key, value] of url.searchParams.entries()) {
        if (queryParameterContainsCredentials(key, value, nestingDepth)) return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function queryParameterContainsCredentials(key, value, nestingDepth) {
  if (
    String(key).length > MAX_QUERY_COMPONENT_LENGTH ||
    String(value).length > MAX_QUERY_COMPONENT_LENGTH
  ) return true;
  const keys = boundedDecodeVariants(key);
  const values = boundedDecodeVariants(value);
  if (keys.some((candidate) => sensitiveKey(candidate))) return true;
  return values.some((candidate) => {
    if (containsDirectCredentialSyntax(candidate)) return true;
    if (!/https?:\/\//i.test(candidate)) return false;
    if (nestingDepth >= MAX_CANONICAL_DECODE_ROUNDS) return true;
    return urlContainsCredentials(candidate, nestingDepth + 1);
  });
}

function containsDirectCredentialSyntax(text) {
  if (/\bauthorization\b/i.test(text)) return true;
  if (/\b(?:bearer|basic)\s+[^\s,;]+/i.test(text)) return true;
  return /\b(?:access[\s_-]?token|refresh[\s_-]?token|session[\s_-]?token|api[\s_-]?key|client[\s_-]?secret|secret[\s_-]?key|access[\s_-]?key|password|passwd|credentials?|evidence(?:[\s_-]?(?:text|map))?|token|secret)\b\s*[:=]/i.test(text);
}

function boundedDecodeVariants(value) {
  const variants = [String(value || '')];
  if (variants[0].length > MAX_QUERY_COMPONENT_LENGTH) return variants;
  let current = variants[0];
  for (let round = 0; round < MAX_CANONICAL_DECODE_ROUNDS; round += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      break;
    }
    if (decoded === current) break;
    variants.push(decoded);
    current = decoded;
  }
  return variants;
}

function independentCredentialMaterial(value) {
  const original = String(value || '');
  if (original.length > MAX_QUERY_COMPONENT_LENGTH && /%[0-9a-f]{2}/i.test(original)) {
    return true;
  }
  return independentDecodeVariants(original).some((variant) => {
    if (/\bauthorization\b/i.test(variant)) return true;
    if (/\b(?:bearer|basic)\s+\S+/i.test(variant)) return true;
    if (
      /\b(?:access[\s_-]?token|refresh[\s_-]?token|session[\s_-]?token|api[\s_-]?key|client[\s_-]?secret|secret[\s_-]?key|access[\s_-]?key|password|passwd|credentials?|evidence(?:[\s_-]?(?:text|map))?|token|secret)\b\s*[:=]/i.test(variant)
    ) return true;
    return independentUrlContainsCredentials(variant, 0);
  });
}

function independentUrlContainsCredentials(text, nestingDepth) {
  for (const match of String(text || '').matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    let url;
    try {
      url = new URL(match[0].replace(/[),.;!?]+$/, ''));
    } catch {
      return true;
    }
    if (url.username || url.password) return true;
    for (const [key, value] of url.searchParams.entries()) {
      if (independentDecodeVariants(key).some(independentSensitiveName)) return true;
      for (const candidate of independentDecodeVariants(value)) {
        if (/\bauthorization\b/i.test(candidate)) return true;
        if (/\b(?:bearer|basic)\s+\S+/i.test(candidate)) return true;
        if (
          /\b(?:access[\s_-]?token|refresh[\s_-]?token|session[\s_-]?token|api[\s_-]?key|client[\s_-]?secret|secret[\s_-]?key|access[\s_-]?key|password|passwd|credentials?|evidence(?:[\s_-]?(?:text|map))?|token|secret)\b\s*[:=]/i.test(candidate)
        ) return true;
        if (/https?:\/\//i.test(candidate)) {
          if (nestingDepth >= MAX_CANONICAL_DECODE_ROUNDS) return true;
          if (independentUrlContainsCredentials(candidate, nestingDepth + 1)) return true;
        }
      }
    }
  }
  return false;
}

function independentDecodeVariants(value) {
  const variants = [String(value || '')];
  if (variants[0].length > MAX_QUERY_COMPONENT_LENGTH) return variants;
  for (let round = 0; round < MAX_CANONICAL_DECODE_ROUNDS; round += 1) {
    const current = variants.at(-1);
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      variants.push(next);
    } catch {
      break;
    }
  }
  return variants;
}

function independentSensitiveName(value) {
  const name = String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return /(?:authorization|apikey|accesstoken|refreshtoken|sessiontoken|clientsecret|secretkey|accesskey|password|passwd|credentials?|evidence(?:text|map)?|token|secret)$/.test(name);
}

function safeText(value) {
  return sanitizeText(value);
}

function textArray(value) {
  return Array.isArray(value) ? value.map(safeText) : [];
}

function objectArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function safeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return finiteNumber(value);
  if (typeof value === 'boolean') return value;
  return safeText(value);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function issuePlaceholders(value) {
  return Array.isArray(value) ? value.map(() => 'validation_issue') : [];
}

function normalizedKey(key) {
  return String(key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function incompatibleSession(value, fallbackId) {
  return {
    incompatible: true,
    version: String(value?.version || 'unknown'),
    id: validSessionId(value?.id) ? value.id : fallbackId,
    reason: 'session_version_incompatible'
  };
}

function validateSessionId(value) {
  if (!validSessionId(value)) throw new Error(`invalid session id: ${value}`);
  return value;
}

function validSessionId(value) {
  return (
    typeof value === 'string' &&
    value !== 'latest' &&
    !value.includes('..') &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]{4,127}$/.test(value)
  );
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function assertSessionObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('session must be an object');
  }
}
