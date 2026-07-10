import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { normalizeUserExclusions } from './context-policy.js';

const CONSENT_VERSION = '1.0';
const CONSENT_FILE = 'consent.json';

export function buildConsentScope(provider, policy, exclusions = []) {
  if (!provider || !policy) throw new TypeError('provider and context policy are required');
  return normalizeScope({
    providerId: requiredString(provider.id, 'provider.id'),
    baseUrl: requiredSafeBaseUrl(provider.base_url, 'provider.base_url'),
    scanDirs: requiredArray(policy.scan_dirs, 'context policy scan_dirs'),
    allowedExtensions: requiredArray(
      policy.allowed_extensions,
      'context policy allowed_extensions'
    ),
    ignoreDirs: requiredArray(policy.ignore_dirs, 'context policy ignore_dirs'),
    maxSources: requiredNonNegativeNumber(policy.max_sources, 'context policy max_sources'),
    maxEvidenceCharsPerSource: requiredNonNegativeNumber(
      policy.max_evidence_chars_per_source,
      'context policy max_evidence_chars_per_source'
    ),
    exclusions
  });
}

export function consentFingerprint(scope) {
  const normalized = normalizeScope(scope);
  const canonical = JSON.stringify({
    provider_id: normalized.providerId,
    base_url: normalizeBaseUrl(normalized.baseUrl),
    scan_dirs: sorted(normalized.scanDirs),
    allowed_extensions: sorted(normalized.allowedExtensions),
    ignore_dirs: sorted(normalized.ignoreDirs),
    max_sources: normalized.maxSources,
    max_evidence_chars_per_source: normalized.maxEvidenceCharsPerSource,
    exclusions: normalized.exclusions
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function consentPreview(context, scope) {
  const normalized = normalizeScope(scope);
  const sources = (context?.source_map || [])
    .map((source) => safeRelativePath(source?.relative_path))
    .filter(Boolean);
  return {
    provider_id: normalized.providerId,
    source_count: sources.length,
    sources,
    max_chars_per_source: requiredNonNegativeNumber(
      context?.context_report?.budget?.max_evidence_chars_per_source ??
        normalized.maxEvidenceCharsPerSource,
      'context preview max_evidence_chars_per_source'
    ),
    ignored_directories: sorted(normalized.ignoreDirs)
  };
}

export async function loadConsent(root) {
  try {
    const parsed = JSON.parse(await readFile(consentPath(root), 'utf8'));
    return validRecord(parsed) ? sanitizeRecord(parsed) : null;
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function saveConsent(root, scope, options = {}) {
  const normalized = normalizeScope(scope);
  const now = options.now ? options.now() : new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('consent confirmation time must be a valid Date');
  }
  const record = {
    version: CONSENT_VERSION,
    provider_id: normalized.providerId,
    base_url: normalized.baseUrl,
    scope_fingerprint: consentFingerprint(normalized),
    confirmed_at: now.toISOString(),
    exclusions: normalized.exclusions
  };
  const directory = join(resolve(root), '.nplan');
  const target = join(directory, CONSENT_FILE);
  const temporary = join(directory, `${CONSENT_FILE}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return record;
}

export async function revokeConsent(root) {
  await rm(consentPath(root), { force: true });
}

export function hasValidConsent(record, scope) {
  if (!validRecord(record)) return false;
  try {
    const normalized = normalizeScope(scope);
    return (
      record.provider_id === normalized.providerId &&
      normalizeBaseUrl(record.base_url) === normalizeBaseUrl(normalized.baseUrl) &&
      record.scope_fingerprint === consentFingerprint(normalized)
    );
  } catch {
    return false;
  }
}

function normalizeScope(scope = {}) {
  return {
    providerId: requiredString(scope.providerId, 'consent scope providerId'),
    baseUrl: requiredSafeBaseUrl(scope.baseUrl, 'consent scope baseUrl'),
    scanDirs: requiredArray(scope.scanDirs, 'consent scope scanDirs'),
    allowedExtensions: requiredArray(
      scope.allowedExtensions,
      'consent scope allowedExtensions'
    ),
    ignoreDirs: requiredArray(scope.ignoreDirs, 'consent scope ignoreDirs'),
    maxSources: requiredNonNegativeNumber(scope.maxSources, 'consent scope maxSources'),
    maxEvidenceCharsPerSource: requiredNonNegativeNumber(
      scope.maxEvidenceCharsPerSource,
      'consent scope maxEvidenceCharsPerSource'
    ),
    exclusions: normalizeUserExclusions(scope.exclusions || [])
  };
}

function validRecord(record) {
  const validShape = Boolean(
    record &&
      record.version === CONSENT_VERSION &&
      typeof record.provider_id === 'string' &&
      record.provider_id.length > 0 &&
      typeof record.base_url === 'string' &&
      record.base_url.length > 0 &&
      typeof record.scope_fingerprint === 'string' &&
      /^[a-f0-9]{64}$/.test(record.scope_fingerprint) &&
      typeof record.confirmed_at === 'string' &&
      !Number.isNaN(Date.parse(record.confirmed_at)) &&
      Array.isArray(record.exclusions)
  );
  if (!validShape) return false;
  try {
    requiredSafeBaseUrl(record.base_url, 'consent record base_url');
    normalizeUserExclusions(record.exclusions);
    return true;
  } catch {
    return false;
  }
}

function sanitizeRecord(record) {
  try {
    return {
      version: CONSENT_VERSION,
      provider_id: record.provider_id,
      base_url: record.base_url,
      scope_fingerprint: record.scope_fingerprint,
      confirmed_at: new Date(record.confirmed_at).toISOString(),
      exclusions: normalizeUserExclusions(record.exclusions)
    };
  } catch {
    return null;
  }
}

function consentPath(root) {
  return join(resolve(root), '.nplan', CONSENT_FILE);
}

function normalizeBaseUrl(value) {
  const url = new URL(requiredSafeBaseUrl(value, 'consent scope baseUrl'));
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function sorted(values) {
  return [...new Set(values.map((value) => String(value)))].sort();
}

function requiredString(value, field) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) throw new TypeError(`${field} must be a non-empty string`);
  return result;
}

function requiredSafeBaseUrl(value, field) {
  const raw = requiredString(value, field);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError(`${field} must be a valid HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError(`${field} must be a valid HTTP(S) URL`);
  }
  const hasSecretParameter = [...url.searchParams.keys()].some((name) =>
    /(?:api[_-]?key|auth|credential|secret|signature|token)/i.test(name)
  );
  if (url.username || url.password || hasSecretParameter) {
    throw new TypeError(`${field} must not contain credentials or secret query parameters`);
  }
  return raw;
}

function requiredArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value.map((item) => String(item));
}

function requiredNonNegativeNumber(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new TypeError(`${field} must be a non-negative number`);
  }
  return result;
}

function safeRelativePath(value) {
  try {
    return normalizeUserExclusions([value])[0] || null;
  } catch {
    return null;
  }
}
