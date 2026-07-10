import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { deriveWorkPlan } from '../src/work-plan.js';
import {
  createSession,
  loadLatestSession,
  loadSession,
  recordSessionTurn,
  saveSession,
  sessionFile
} from '../src/session-store.js';
import { plannedChineseResult } from './fixtures.js';

function plannedResultWithSensitiveContext() {
  const result = plannedChineseResult();
  result.taskspec.source_map = [
    {
      source_id: 'S1',
      path: 'C:\\Users\\qiyue\\secret.md',
      relative_path: 'docs/guide.md',
      kind: 'document'
    },
    {
      source_id: 'S2',
      path: '/home/qiyue/private.md',
      relative_path: '../private.md'
    }
  ];
  result.taskspec.evidence_map = [{
    evidence_id: 'E1',
    source_id: 'S1',
    text: 'evidence text Authorization: Bearer private-token'
  }];
  result.taskspec.background_context = ['C:\\Users\\qiyue\\secret.md'];
  result.taskspec.known_inputs = ['api_key=private-token'];
  result.taskspec.provenance.files_used = ['C:\\Users\\qiyue\\secret.md'];
  return result;
}

async function writeV1Session() {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-v1-'));
  const dir = join(root, '.nplan', 'sessions');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '20260710120000-old00001.json'), JSON.stringify({
    version: '1.0',
    id: '20260710120000-old00001',
    turns: []
  }), 'utf8');
  return root;
}

test('session v2 restores result and WorkPlan without sensitive context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-v2-'));
  const session = createSession({ now: () => new Date('2026-07-10T12:00:00.000Z') });
  const result = plannedResultWithSensitiveContext();
  recordSessionTurn(session, {
    request: '规划北京亲子游 api_key=private-token path=C:\\Users\\qiyue\\secret.md /workspace/private Authorization header',
    result,
    workPlan: deriveWorkPlan(result, { sessionId: session.id })
  });

  await saveSession(root, session);

  const raw = await readFile(sessionFile(root, session.id), 'utf8');
  assert.doesNotMatch(
    raw,
    /evidence text|C:\\\\Users|\/home\/qiyue|\/workspace\/private|token|api[_-]?key|Authorization/i
  );
  const loaded = await loadSession(root, session.id);
  assert.equal(loaded.version, '2.0');
  assert.equal(loaded.last_result.status, 'planned');
  assert.equal(loaded.last_work_plan.steps.length, 1);
  assert.deepEqual(loaded.last_work_plan.source_summary, [
    { source_id: 'S1', relative_path: 'docs/guide.md' }
  ]);
  assert.deepEqual(loaded.turns[0].sources, [
    { source_id: 'S1', relative_path: 'docs/guide.md' }
  ]);
});

test('session writes atomically and leaves no temporary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-atomic-'));
  const session = createSession();
  await saveSession(root, session);
  const names = await readdir(join(root, '.nplan', 'sessions'));
  assert.deepEqual(names, [`${session.id}.json`]);
});

test('v1 session returns an explicit incompatibility result', async () => {
  const root = await writeV1Session();
  const loaded = await loadLatestSession(root);
  assert.equal(loaded.incompatible, true);
  assert.equal(loaded.version, '1.0');
  assert.equal(loaded.id, '20260710120000-old00001');
});

test('session ids cannot escape the project session directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-boundary-'));
  assert.throws(() => sessionFile(root, '../outside'), /invalid session id/);
  await assert.rejects(loadSession(root, '../outside'), /invalid session id/);
});
