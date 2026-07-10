import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  collectContext,
  curateContext,
  detectRequestConflicts,
  parseKnowledgeDocument
} from '../src/index.js';

test('collectContext builds source map for local text project files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-context-'));
  await mkdir(join(dir, 'docs'));
  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'README.md'), '# 项目说明\n本地规划模块\n', 'utf8');
  await writeFile(join(dir, 'docs', 'agent.md'), '# Agent\nContext Curator\n', 'utf8');
  await writeFile(join(dir, 'src', 'agent.js'), 'export const value = 1;\n', 'utf8');

  const context = collectContext(dir);

  assert.equal(context.root, dir);
  assert.ok(context.source_map.length >= 3);
  assert.ok(context.source_map.every((source) => source.source_id.startsWith('src_')));
  assert.ok(context.source_map.every((source) => source.hash.startsWith('sha256:')));
  assert.ok(context.files.some((file) => file.endsWith('README.md')));

  await rm(dir, { recursive: true, force: true });
});

test('collectContext recognizes OKF concepts and ignores external reference repos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-okf-'));
  await mkdir(join(dir, 'docs', 'nplan_knowledge', 'concepts'), { recursive: true });
  await mkdir(join(dir, 'DOC', 'knowledge-catalog'), { recursive: true });
  await writeFile(join(dir, 'README.md'), '# Project\nLocal task planning.\n', 'utf8');
  await writeFile(
    join(dir, 'DOC', 'knowledge-catalog', 'README.md'),
    '# External reference\nThis should not enter the default context pack.\n',
    'utf8'
  );
  await writeFile(
    join(dir, 'docs', 'nplan_knowledge', 'concepts', 'context-governance.md'),
    [
      '---',
      'type: Agent Context Concept',
      'title: Context Governance',
      'description: Evidence governance for local task planning.',
      'tags: [context, evidence]',
      '---',
      '',
      '# Purpose',
      '',
      'Use bounded evidence from local project sources.'
    ].join('\n'),
    'utf8'
  );

  const context = collectContext(dir);
  const knowledge = context.source_map.find((source) => source.kind === 'knowledge');

  assert.ok(knowledge);
  assert.equal(knowledge.knowledge.title, 'Context Governance');
  assert.deepEqual(knowledge.knowledge.tags, ['context', 'evidence']);
  assert.equal(
    context.source_map.some((source) => source.relative_path.includes('knowledge-catalog')),
    false
  );

  const curated = curateContext('context evidence governance', {
    root: dir,
    context_policy: { max_sources: 2, max_evidence_chars_per_source: 240 }
  });
  const evidence = curated.evidence_map.find((item) => item.claim_type === 'knowledge_concept_excerpt');

  assert.ok(evidence);
  assert.match(evidence.text, /Concept: Context Governance/);

  await rm(dir, { recursive: true, force: true });
});

test('parseKnowledgeDocument extracts OKF frontmatter and markdown links', () => {
  const parsed = parseKnowledgeDocument(
    [
      '---',
      'type: Playbook',
      'title: Local Context',
      'tags: [context, retrieval]',
      '---',
      '',
      'See [Evidence](./evidence.md) and [Docs](https://example.com/docs).'
    ].join('\n')
  );

  assert.equal(parsed.conformant, true);
  assert.equal(parsed.frontmatter.type, 'Playbook');
  assert.deepEqual(parsed.frontmatter.tags, ['context', 'retrieval']);
  assert.deepEqual(
    parsed.links.map((link) => link.kind),
    ['relative', 'external']
  );
});

test('curateContext returns evidence pack and blocks irreversible requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-curator-'));
  await writeFile(join(dir, 'README.md'), '# Project\nDo not execute tasks.\n', 'utf8');

  const context = curateContext('delete generated files', {
    root: dir,
    context_policy: { max_sources: 2, max_evidence_chars_per_source: 80 }
  });

  assert.equal(context.source_map.length, 1);
  assert.equal(context.evidence_map.length, 1);
  assert.equal(context.evidence_map[0].source_id, context.source_map[0].source_id);
  assert.equal(context.context_report.source_count, 1);
  assert.equal(context.conflict_report.blocking[0].code, 'irreversible_action_requested');

  await rm(dir, { recursive: true, force: true });
});

test('curateContext keeps core source files for project-wide assessment requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-core-context-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await mkdir(join(dir, 'DOC', 'knowledge-catalog'), { recursive: true });
  await mkdir(join(dir, 'src'), { recursive: true });

  for (const name of ['planning.js', 'validation.js', 'schemas.js', 'understanding.js']) {
    await writeFile(join(dir, 'src', name), `export const ${name.replace('.js', '')} = true;\n`, 'utf8');
  }
  for (let index = 0; index < 40; index += 1) {
    await writeFile(join(dir, 'docs', `note-${index}.md`), `# Note ${index}\nProject note.\n`, 'utf8');
  }
  await writeFile(
    join(dir, 'DOC', 'knowledge-catalog', 'README.md'),
    '# External reference\nIgnored by default context discovery.\n',
    'utf8'
  );

  const context = curateContext('整体评估项目不足', { root: dir });
  const selected = context.source_map.map((source) => source.relative_path);

  assert.ok(selected.includes('src/planning.js'));
  assert.ok(selected.includes('src/validation.js'));
  assert.ok(selected.includes('src/schemas.js'));
  assert.ok(selected.includes('src/understanding.js'));
  assert.equal(selected.some((path) => path.includes('knowledge-catalog')), false);
  assert.ok(selected.length <= 24);

  await rm(dir, { recursive: true, force: true });
});

test('detectRequestConflicts reports dangling evidence source references', () => {
  const report = detectRequestConflicts({
    request: 'summarize context',
    sources: [{ source_id: 'src_known' }],
    evidence: [{ evidence_id: 'ev_missing', source_id: 'src_missing' }]
  });

  assert.ok(report.blocking.some((item) => item.code === 'evidence_without_source'));
});

test('offline wording is downgraded instead of conflicting with network needs', () => {
  const report = detectRequestConflicts({
    request: '要求离线但又要求联网搜索资料',
    sources: [{ source_id: 'src_known' }],
    evidence: []
  });

  assert.equal(report.blocking.some((item) => item.code === 'network_offline_conflict'), false);
  assert.ok(report.non_blocking.some((item) => item.code === 'offline_requirement_removed'));
  assert.ok(report.resolutions.some((item) => item.code === 'use_configured_provider_policy'));
});

test('context policy exclusions remove matching relative sources before consent preview', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-context-exclusions-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'README.md'), '# Product', 'utf8');
  await writeFile(join(dir, 'docs', 'private.md'), '# Private', 'utf8');
  await writeFile(join(dir, 'src', 'agent.js'), 'export const agent = true;', 'utf8');

  const context = curateContext('评估项目', {
    root: dir,
    context_policy: { user_exclusions: ['docs/private.md'] }
  });

  assert.equal(context.source_map.some((source) => source.relative_path === 'docs/private.md'), false);
  assert.deepEqual(context.context_policy.user_exclusions, ['docs/private.md']);

  await rm(dir, { recursive: true, force: true });
});

test('exclusions also filter provided source maps before evidence is read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-provided-exclusions-'));
  const publicPath = join(dir, 'public.md');
  const privatePath = join(dir, 'private.md');
  await writeFile(publicPath, '# Public', 'utf8');
  await writeFile(privatePath, '# Private evidence marker', 'utf8');
  const collected = collectContext(dir, { policy: { root_files: ['public.md', 'private.md'] } });

  const context = curateContext('summarize', {
    ...collected,
    context_policy: { user_exclusions: ['private.md'] }
  });

  assert.deepEqual(context.source_map.map((source) => source.relative_path), ['public.md']);
  assert.doesNotMatch(JSON.stringify(context.evidence_map), /Private evidence marker/);

  await rm(dir, { recursive: true, force: true });
});

test('context discovery never follows configured paths outside the project root', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'nplan-context-boundary-'));
  const root = join(parent, 'project');
  await mkdir(root);
  await writeFile(join(parent, 'outside.md'), '# Outside secret marker', 'utf8');
  await writeFile(join(root, 'README.md'), '# Project', 'utf8');

  const context = collectContext(root, {
    policy: { root_files: ['README.md', '../outside.md'], scan_dirs: ['..'] }
  });

  assert.deepEqual(context.source_map.map((source) => source.relative_path), ['README.md']);

  await rm(parent, { recursive: true, force: true });
});

test('project root remains a valid bounded scan directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-root-scan-'));
  await writeFile(join(root, 'README.md'), '# Project root scan', 'utf8');

  const context = collectContext(root, {
    policy: { root_files: [], scan_dirs: ['.'] }
  });

  assert.deepEqual(context.source_map.map((source) => source.relative_path), ['README.md']);

  await rm(root, { recursive: true, force: true });
});

test('root file symbolic link cannot read a target outside the project root', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'nplan-root-file-link-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'project');
  const outside = join(parent, 'outside.md');
  await mkdir(root);
  await writeFile(join(root, 'README.md'), '# Project', 'utf8');
  await writeFile(outside, '# Outside root-file secret marker', 'utf8');
  if (!(await createLinkOrSkip(t, outside, join(root, 'outside-link.md'), 'file'))) return;

  const context = collectContext(root, {
    policy: { root_files: ['README.md', 'outside-link.md'], scan_dirs: [] }
  });

  assert.deepEqual(context.source_map.map((source) => source.relative_path), ['README.md']);
  assert.doesNotMatch(JSON.stringify(context.evidence_map || []), /Outside root-file secret marker/);

});

test('top-level scan directory junction cannot escape the project root', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'nplan-scan-link-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'project');
  const outside = join(parent, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.md'), '# Outside scan secret marker', 'utf8');
  if (!(await createLinkOrSkip(t, outside, join(root, 'external-scan'), 'dir'))) return;

  const context = collectContext(root, {
    policy: { root_files: [], scan_dirs: ['external-scan'] }
  });

  assert.deepEqual(context.source_map, []);

});

test('recursive symbolic directory is not traversed outside the project root', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'nplan-recursive-link-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'project');
  const docs = join(root, 'docs');
  const outside = join(parent, 'outside');
  await mkdir(docs, { recursive: true });
  await mkdir(outside);
  await writeFile(join(docs, 'public.md'), '# Public', 'utf8');
  await writeFile(join(outside, 'secret.md'), '# Recursive outside secret marker', 'utf8');
  if (!(await createLinkOrSkip(t, outside, join(docs, 'external'), 'dir'))) return;

  const context = collectContext(root, {
    policy: { root_files: [], scan_dirs: ['docs'] }
  });

  assert.deepEqual(context.source_map.map((source) => source.relative_path), ['docs/public.md']);

});

test('recursive junction cannot alias an ignored directory inside the project root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-ignore-link-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const docs = join(root, 'docs');
  const ignored = join(root, 'node_modules');
  await mkdir(docs);
  await mkdir(ignored);
  await writeFile(join(docs, 'public.md'), '# Public', 'utf8');
  await writeFile(join(ignored, 'private.md'), '# Ignored private marker', 'utf8');
  if (!(await createLinkOrSkip(t, ignored, join(docs, 'alias'), 'dir'))) return;

  const context = collectContext(root, {
    policy: { root_files: [], scan_dirs: ['docs'] }
  });

  assert.deepEqual(context.source_map.map((source) => source.relative_path), ['docs/public.md']);
});

test('top-level scan directory junction is rejected even when its target is inside root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-top-link-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const real = join(root, 'real');
  await mkdir(real);
  await writeFile(join(real, 'private.md'), '# Linked scan marker', 'utf8');
  if (!(await createLinkOrSkip(t, real, join(root, 'alias'), 'dir'))) return;

  const context = collectContext(root, {
    policy: { root_files: [], scan_dirs: ['alias'] }
  });

  assert.deepEqual(context.source_map, []);
});

test('root file symlink cannot disguise a disallowed target extension', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-root-file-alias-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, 'private.txt');
  await writeFile(target, 'Root file extension marker', 'utf8');
  if (!(await createLinkOrSkip(t, target, join(root, 'alias.md'), 'file'))) return;

  const context = collectContext(root, {
    policy: { root_files: ['alias.md'], scan_dirs: [] }
  });

  assert.deepEqual(context.source_map, []);
});

test('recursive file symlink cannot disguise a disallowed target extension', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-file-alias-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const docs = join(root, 'docs');
  await mkdir(docs);
  const target = join(docs, 'private.txt');
  await writeFile(target, 'Recursive extension marker', 'utf8');
  if (!(await createLinkOrSkip(t, target, join(docs, 'alias.md'), 'file'))) return;

  const context = collectContext(root, {
    policy: { root_files: [], scan_dirs: ['docs'] }
  });

  assert.deepEqual(context.source_map, []);
});

async function createLinkOrSkip(t, target, path, kind) {
  try {
    const type = process.platform === 'win32' && kind === 'dir' ? 'junction' : kind;
    await symlink(target, path, type);
    return true;
  } catch (error) {
    if (['EACCES', 'EINVAL', 'ENOSYS', 'ENOTSUP', 'EPERM'].includes(error?.code)) {
      t.skip(`symbolic links are unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
}
