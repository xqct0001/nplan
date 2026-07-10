import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildConsentScope,
  consentFingerprint,
  consentPreview,
  hasValidConsent,
  loadConsent,
  revokeConsent,
  saveConsent
} from '../src/consent.js';

function cloudScope(overrides = {}) {
  return {
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    scanDirs: ['docs', 'src', 'test'],
    rootFiles: ['AGENTS.md', 'README.md'],
    allowedExtensions: ['.md', '.js', '.json', '.toml'],
    ignoreDirs: ['.git', '.nplan', 'node_modules'],
    parserVersion: 'local-text-v1',
    coreSourcePaths: ['src/planning.js', 'src/validation.js'],
    sourcePriority: { source: 70, spec: 80 },
    maxSources: 24,
    maxEvidenceCharsPerSource: 1200,
    exclusions: [],
    ...overrides
  };
}

function consentRecord(scope) {
  return {
    version: '1.0',
    provider_id: scope.providerId,
    base_url: scope.baseUrl,
    scope_fingerprint: consentFingerprint(scope),
    confirmed_at: '2026-07-10T00:00:00.000Z',
    exclusions: scope.exclusions
  };
}

function curatedContextFixture() {
  return {
    context_report: {
      source_count: 2,
      budget: { max_sources: 24, max_evidence_chars_per_source: 1200 }
    },
    source_map: [
      { source_id: 'S1', relative_path: 'README.zh-CN.md' },
      { source_id: 'S2', relative_path: 'src/agent.js' }
    ]
  };
}

function minimalContextPolicy() {
  return {
    scan_dirs: [],
    root_files: [],
    allowed_extensions: [],
    ignore_dirs: [],
    parser_version: 'local-text-v1',
    core_source_paths: [],
    source_priority: {},
    max_sources: 1,
    max_evidence_chars_per_source: 1
  };
}

test('buildConsentScope keeps only the effective provider and bounded context policy', () => {
  const scope = buildConsentScope(
    { id: 'deepseek', base_url: 'https://api.deepseek.com', apiKey: 'secret' },
    {
      scan_dirs: ['src', 'docs'],
      root_files: ['README.md'],
      allowed_extensions: ['.js', '.md'],
      ignore_dirs: ['node_modules', '.git'],
      parser_version: 'local-text-v1',
      core_source_paths: ['src/planning.js'],
      source_priority: { source: 70, spec: 80 },
      max_sources: 12,
      max_evidence_chars_per_source: 800,
    },
    ['src/private.js', 'docs/private']
  );

  assert.deepEqual(scope, {
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    scanDirs: ['src', 'docs'],
    rootFiles: ['README.md'],
    allowedExtensions: ['.js', '.md'],
    ignoreDirs: ['node_modules', '.git'],
    parserVersion: 'local-text-v1',
    coreSourcePaths: ['src/planning.js'],
    sourcePriority: { source: 70, spec: 80 },
    maxSources: 12,
    maxEvidenceCharsPerSource: 800,
    exclusions: ['docs/private', 'src/private.js']
  });
  assert.doesNotMatch(JSON.stringify(scope), /secret|api[_-]?key/i);
});

test('consent stores only provider and scope fingerprint metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-'));
  const scope = cloudScope({ exclusions: ['src/private.js'] });
  await saveConsent(root, scope, { now: () => new Date('2026-07-10T00:00:00.000Z') });
  const raw = await readFile(join(root, '.nplan', 'consent.json'), 'utf8');
  const saved = JSON.parse(raw);

  assert.deepEqual(Object.keys(saved).sort(), [
    'base_url',
    'confirmed_at',
    'exclusions',
    'provider_id',
    'scope_fingerprint',
    'version'
  ]);
  assert.doesNotMatch(raw, /api[_-]?key|task text|evidence text|C:\\\\/i);
  assert.equal(hasValidConsent(await loadConsent(root), scope), true);
});

test('provider or effective scan scope change invalidates consent', () => {
  const scope = cloudScope();
  const saved = consentRecord(scope);
  const changes = [
    { providerId: 'dashscope' },
    { baseUrl: 'https://proxy.example/v1' },
    { scanDirs: ['docs', 'src'] },
    { rootFiles: ['README.md'] },
    { allowedExtensions: ['.md', '.js'] },
    { ignoreDirs: ['.git', '.nplan'] },
    { parserVersion: 'local-text-v2' },
    { coreSourcePaths: ['src/planning.js'] },
    { sourcePriority: { source: 90, spec: 80 } },
    { maxSources: 30 },
    { maxEvidenceCharsPerSource: 800 },
    { exclusions: ['docs/private.md'] }
  ];

  for (const change of changes) {
    assert.equal(hasValidConsent(saved, cloudScope(change)), false, JSON.stringify(change));
  }
  assert.equal(
    hasValidConsent({ ...saved, base_url: 'https://another.example/v1' }, scope),
    false
  );
});

test('tampering with stored exclusions invalidates consent', () => {
  const scope = cloudScope({ exclusions: ['docs/private.md'] });
  const saved = consentRecord(scope);

  assert.equal(
    hasValidConsent({ ...saved, exclusions: ['src/private.js'] }, scope),
    false
  );
});

test('fingerprint is stable across array order and a trailing base URL slash', () => {
  const first = cloudScope();
  const reordered = cloudScope({
    baseUrl: 'https://api.deepseek.com/',
    scanDirs: [...first.scanDirs].reverse(),
    rootFiles: [...first.rootFiles].reverse(),
    allowedExtensions: [...first.allowedExtensions].reverse(),
    ignoreDirs: [...first.ignoreDirs].reverse(),
    coreSourcePaths: [...first.coreSourcePaths].reverse(),
    sourcePriority: { spec: 80, source: 70 }
  });

  assert.equal(consentFingerprint(first), consentFingerprint(reordered));
});

test('consent preview lists relative sources and budgets only', () => {
  const preview = consentPreview(curatedContextFixture(), cloudScope());
  assert.equal(preview.source_count, 2);
  assert.deepEqual(preview.sources, ['README.zh-CN.md', 'src/agent.js']);
  assert.equal(preview.max_chars_per_source, 1200);
  assert.doesNotMatch(JSON.stringify(preview), /C:\\\\/);
  assert.equal(Object.hasOwn(preview, 'evidence'), false);
});

test('invalid absolute or parent exclusions are rejected before persistence', async () => {
  assert.throws(
    () => buildConsentScope(
      { id: 'deepseek', base_url: 'https://api.deepseek.com' },
      minimalContextPolicy(),
      ['../secret.md']
    ),
    /project-relative/
  );
  assert.throws(
    () => buildConsentScope(
      { id: 'deepseek', base_url: 'https://api.deepseek.com' },
      minimalContextPolicy(),
      ['.']
    ),
    /project-relative/
  );
  assert.throws(
    () => buildConsentScope(
      { id: 'deepseek', base_url: 'https://api.deepseek.com' },
      minimalContextPolicy(),
      ['C:secret.md']
    ),
    /project-relative/
  );

  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-'));
  await assert.rejects(saveConsent(root, cloudScope({ exclusions: ['C:\\secret.md'] })), /project-relative/);
  await assert.rejects(
    saveConsent(root, cloudScope({ baseUrl: 'https://api.example/v1?api_key=secret' })),
    /credentials/
  );
  assert.equal(await loadConsent(root), null);
});

test('malformed or incompatible consent records load as no consent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-'));
  await mkdir(join(root, '.nplan'));
  await writeFile(join(root, '.nplan', 'consent.json'), '{broken', 'utf8');
  assert.equal(await loadConsent(root), null);

  await writeFile(
    join(root, '.nplan', 'consent.json'),
    JSON.stringify({ version: '2.0', provider_id: 'deepseek' }),
    'utf8'
  );
  assert.equal(await loadConsent(root), null);

  const unsafe = consentRecord(cloudScope());
  unsafe.base_url = 'https://api.example/v1?api_key=secret';
  await writeFile(join(root, '.nplan', 'consent.json'), JSON.stringify(unsafe), 'utf8');
  assert.equal(await loadConsent(root), null);
});

test('consent base URLs reject every query string and fragment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-url-'));
  const unsafeUrls = [
    'https://api.example/v1?region=cn',
    'https://api.example/v1#private-routing',
    'https://api.example/v1?',
    'https://api.example/v1#'
  ];

  for (const baseUrl of unsafeUrls) {
    const scope = cloudScope({ baseUrl });
    await assert.rejects(saveConsent(root, scope), /query parameters or fragments/);

    const record = consentRecord(cloudScope());
    record.base_url = baseUrl;
    await mkdir(join(root, '.nplan'), { recursive: true });
    await writeFile(join(root, '.nplan', 'consent.json'), JSON.stringify(record), 'utf8');
    assert.equal(await loadConsent(root), null);
    assert.equal(hasValidConsent(record, cloudScope()), false);
  }
});

test('revoke removes valid project consent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-'));
  await saveConsent(root, cloudScope());
  await revokeConsent(root);
  assert.equal(await loadConsent(root), null);
  await revokeConsent(root);
});
