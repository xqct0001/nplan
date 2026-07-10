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

test('adversarial session payload is allowlisted, redacted, persisted, and safely reloaded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-adversarial-'));
  const session = createSession();
  const result = plannedResultWithSensitiveContext();
  result.taskspec.source_map.push({
    source_id: 'S3',
    relative_path: 'docs/access_token=SOURCE-ACCESS-789.md'
  });
  result.access_token = 'AUTH-789';
  result.taskspec.refreshToken = 'REFRESH-789';
  result.taskspec.constraints = {
    ...result.taskspec.constraints,
    apiKey: 'APIKEY-789',
    'client-secret': 'CLIENT-789',
    credential: 'CREDENTIAL-789'
  };
  result.taskspec.deliverables[0].password = 'PASSWORD-789';
  result.taskspec_report = {
    valid: true,
    evidence_text: 'EVIDENCE-789',
    nested: { authorization: 'AUTH-REPORT-789' }
  };
  result.taskplan.metadata = {
    access_token: 'PLAN-ACCESS-789',
    evidence: 'PLAN-EVIDENCE-789'
  };
  result.taskplan.tasks[0].title =
    '保留中文步骤 secret: INLINE-789 Authorization: Bearer AUTH-789';
  result.taskplan.tasks[0].refreshToken = 'TASK-REFRESH-789';
  const workPlan = deriveWorkPlan(result, { sessionId: session.id });
  workPlan.clientSecret = 'WORKPLAN-SECRET-789';
  workPlan.steps[0].api_key = 'WORKPLAN-API-789';
  workPlan.steps[0].goal = '保留正常目标 Basic BASIC-789 token=TOKEN-789';
  workPlan.validation = { evidence_text: 'WORKPLAN-EVIDENCE-789' };

  recordSessionTurn(session, {
    request: [
      '普通中文任务',
      'Authorization: Bearer AUTH-789',
      'access_token=ACCESS-789',
      'secret: INLINE-789',
      'evidence_text=EVIDENCE-789',
      'https://example.test/plan?topic=travel&refreshToken=URL-REFRESH-789'
    ].join(' '),
    revision: '继续完善 client-secret=CLIENT-789 passwd=PASSWD-789 Basic BASIC-789',
    result,
    workPlan
  });

  await saveSession(root, session);

  const raw = await readFile(sessionFile(root, session.id), 'utf8');
  assert.doesNotMatch(
    raw,
    /AUTH-789|ACCESS-789|REFRESH-789|APIKEY-789|CLIENT-789|CREDENTIAL-789|PASSWORD-789|EVIDENCE-789|INLINE-789|BASIC-789|TOKEN-789|WORKPLAN-(?:SECRET|API|EVIDENCE)-789|access[_-]?token|refreshToken|client[-_]?secret|apiKey|api_key|authorization|bearer|basic|passwd|credential|evidence_text/i
  );
  assert.match(raw, /普通中文任务/);
  assert.match(raw, /topic=travel/);
  assert.match(raw, /保留中文步骤/);
  assert.match(raw, /保留正常目标/);

  const loaded = await loadSession(root, session.id);
  assert.equal(loaded.last_result.taskspec.inferred_goal, '制定三天北京亲子游计划');
  assert.match(loaded.last_result.taskplan.tasks[0].title, /保留中文步骤/);
  assert.match(loaded.last_work_plan.steps[0].goal, /保留正常目标/);
  assert.deepEqual(loaded.turns[0].sources, [
    { source_id: 'S1', relative_path: 'docs/guide.md' }
  ]);
  assert.deepEqual(loaded.last_work_plan.source_summary, [
    { source_id: 'S1', relative_path: 'docs/guide.md' }
  ]);
});
