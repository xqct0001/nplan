import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { normalizeUserExclusions } from './context-policy.js';

const SESSION_VERSION = '2.0';

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
  const taskspec = result.taskspec && typeof result.taskspec === 'object'
    ? {
        version: result.taskspec.version,
        surface_request: result.taskspec.surface_request,
        inferred_goal: result.taskspec.inferred_goal,
        task_type: result.taskspec.task_type,
        audience: result.taskspec.audience,
        target_object: result.taskspec.target_object,
        deliverables: result.taskspec.deliverables,
        output_format: result.taskspec.output_format,
        constraints: result.taskspec.constraints,
        missing_information: result.taskspec.missing_information,
        assumptions: result.taskspec.assumptions,
        ambiguities: result.taskspec.ambiguities,
        success_criteria: result.taskspec.success_criteria,
        clarification: result.taskspec.clarification,
        checkpoint_policy: result.taskspec.checkpoint_policy,
        quality_bar: result.taskspec.quality_bar,
        planning_readiness: result.taskspec.planning_readiness,
        risk_level: result.taskspec.risk_level,
        context_report: result.taskspec.context_report,
        provenance: {
          model_used: result.taskspec.provenance?.model_used === true,
          conversation_turns_used: result.taskspec.provenance?.conversation_turns_used || [],
          files_used: []
        },
        known_inputs: []
      }
    : null;
  return sanitizeValue({
    status: result.status,
    pipeline_steps: result.pipeline_steps,
    taskspec,
    taskplan: result.taskplan || null,
    taskspec_report: result.taskspec_report || null,
    taskplan_report: result.taskplan_report || null,
    clarification_questions: result.clarification_questions || []
  });
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
  const safe = sanitizeValue(workPlan);
  safe.source_summary = sanitizeSources(workPlan.source_summary);
  return safe;
}

function sanitizeSources(sources) {
  const seen = new Set();
  const safe = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const sourceId = typeof source?.source_id === 'string' ? source.source_id.trim() : '';
    if (!sourceId || /[\u0000-\u001f]/.test(sourceId) || seen.has(sourceId)) continue;
    let relativePath;
    try {
      relativePath = normalizeUserExclusions([source.relative_path])[0];
    } catch {
      continue;
    }
    seen.add(sourceId);
    safe.push({ source_id: sourceId, relative_path: relativePath });
  }
  return safe;
}

function sanitizeValue(value, key = '') {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value !== 'object') return sanitizeText(value);
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (sensitiveKey(childKey) || childKey === 'path' || childKey === 'absolute_path') continue;
    result[childKey] = sanitizeValue(childValue, childKey);
  }
  return result;
}

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\b(?:authorization|api[_-]?key)\b(?:\s*[:=]\s*[^\s,;]+)?/gi, '[redacted]')
    .replace(/\bbearer\s+[^\s,;]+/gi, '[redacted]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>|]+/g, '[local-path]')
    .replace(/(^|[\s"'=:(])\/(?!\/)[^\s"'<>|]+/g, '$1[local-path]');
}

function sensitiveKey(key) {
  return /^(?:authorization|api[_-]?key|token|secret|password|evidence|evidence_map)$/i.test(key);
}

function assertSafeSessionValue(value) {
  if (typeof value === 'string') {
    if (
      /\b(?:authorization|api[_-]?key)\b/i.test(value) ||
      /\bbearer\s+/i.test(value) ||
      /[A-Za-z]:[\\/][^\s"'<>|]+/.test(value) ||
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
    if (sensitiveKey(key) || key === 'path' || key === 'absolute_path') {
      throw new Error('session contains unsafe local context or credentials');
    }
    assertSafeSessionValue(child);
  }
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
