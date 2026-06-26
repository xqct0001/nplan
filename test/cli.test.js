import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('print mode returns one JSON result and exits', async () => {
  const result = await runCli(['-p', 'implement TaskSpec schema and DAG verifier']);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.status, 'planned');
  assert.equal(payload.taskplan_report.valid, true);
  assert.equal(result.stderr, '');
});

test('print mode accepts piped stdin as additional context', async () => {
  const result = await runCli(['--print', 'implement TaskSpec schema'], 'logs mention DAG verifier');
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.status, 'planned');
  assert.match(payload.taskspec.surface_request, /Piped input:/);
});

test('help shows Claude-like command shapes and slash commands', async () => {
  const result = await runCli(['--help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /local-task-agent \[options\] \[prompt\]/);
  assert.match(result.stdout, /-p, --print/);
  assert.match(result.stdout, /\/help/);
  assert.match(result.stdout, /\/plan/);
});

test('interactive session supports status, plan, unsupported shell, and exit commands', async () => {
  const child = spawn(NODE, [CLI], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.stdin.write('/status\n');
  child.stdin.write('/plan implement TaskSpec schema and DAG verifier\n');
  child.stdin.write('!echo unsafe\n');
  child.stdin.write('/exit\n');
  child.stdin.end();

  const [code] = await once(child, 'close');

  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /local-task-agent-js/);
  assert.match(stdout, /mode: interactive/);
  assert.match(stdout, /"status": "planned"/);
  assert.match(stdout, /Shell execution is not supported/);
  assert.match(stdout, /bye/);
});

async function runCli(args, stdin = '') {
  const child = spawn(NODE, [CLI, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(stdin);
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}
