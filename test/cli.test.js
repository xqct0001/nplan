import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('print mode can use configured OpenAI-compatible model provider for Chinese understanding', async () => {
  const seen = [];
  const server = createServer(async (request, response) => {
    const body = await readRequest(request);
    seen.push({ url: request.url, headers: request.headers, body: JSON.parse(body) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                inferred_goal: 'Design a local file organizer that scans files, classifies files, and writes a Markdown report',
                task_type: 'design',
                deliverables: [
                  { name: 'File scanner', format: 'json', required: true },
                  { name: 'Classification rules', format: 'markdown', required: true },
                  { name: 'Markdown report', format: 'markdown', required: true }
                ],
                missing_information: { blocking: [], non_blocking: [] },
                assumptions: ['Planning only; execution is outside this module'],
                ambiguities: [],
                success_criteria: [
                  'file scanning is represented',
                  'classification is represented',
                  'markdown report is represented'
                ]
              })
            }
          }
        ]
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const dir = await mkdtemp(join(tmpdir(), 'local-task-agent-cli-'));
  const configPath = join(dir, 'config.toml');
  await writeFile(
    configPath,
    [
      'model = "semantic-test-model"',
      'model_provider = "localtest"',
      '[model_providers.localtest]',
      `base_url = "http://127.0.0.1:${port}/v1"`,
      'env_key = "FAKE_MODEL_KEY"',
      'wire_api = "chat_completions"'
    ].join('\n'),
    'utf8'
  );

  const result = await runCli(
    ['--config-path', configPath, '-p', '> 帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件'],
    '',
    { FAKE_MODEL_KEY: 'secret' }
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(payload.status, 'planned');
  assert.equal(payload.taskspec.provenance.model_used, true);
  assert.equal(payload.taskspec.surface_request, '帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件');
  assert.equal(payload.taskplan_report.valid, true);
  assert.equal(seen[0].url, '/v1/chat/completions');
  assert.equal(seen[0].headers.authorization, 'Bearer secret');

  server.close();
  await rm(dir, { recursive: true, force: true });
});

async function runCli(args, stdin = '', env = {}) {
  const child = spawn(NODE, [CLI, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env }
  });
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

function readRequest(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('error', reject);
    request.on('end', () => resolve(body));
  });
}
