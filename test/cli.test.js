import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadModelConfig } from '../src/model-config.js';
import { runModelSetupWizard } from '../src/model-wizard.js';

const NODE = process.execPath;
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('print mode returns one JSON result and exits', async () => {
  await withModelServer(async ({ configPath, env }) => {
    const result = await runCli(
      ['--config-path', configPath, '-p', 'implement TaskSpec schema and DAG verifier'],
      '',
      env
    );
    const payload = JSON.parse(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(payload.status, 'planned');
    assert.equal(payload.taskspec.provenance.model_used, true);
    assert.equal(payload.taskplan_report.valid, true);
    assert.equal(result.stderr, '');
  });
});

test('print mode accepts piped stdin as additional context', async () => {
  await withModelServer(async ({ configPath, env }) => {
    const result = await runCli(
      ['--config-path', configPath, '--print', 'implement TaskSpec schema'],
      'logs mention DAG verifier',
      env
    );
    const payload = JSON.parse(result.stdout);

    assert.equal(result.code, 0);
    assert.equal(payload.status, 'planned');
    assert.equal(payload.taskspec.provenance.model_used, true);
    assert.match(payload.taskspec.surface_request, /Piped input:/);
  });
});

test('print mode requires configured model', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-no-model-'));
  const result = await runCli(
    ['-p', 'implement TaskSpec schema'],
    '',
    {
      HOME: dir,
      USERPROFILE: dir,
      NPLAN_HOME: '',
      NPLAN_MODEL: ''
    },
    dir
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /model configuration is required/);
  assert.equal(result.stdout, '');

  await rm(dir, { recursive: true, force: true });
});

test('help shows Codex-like command shapes and slash commands', async () => {
  const result = await runCli(['--help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /nplan \[options\] \[prompt\]/);
  assert.match(result.stdout, /setup/);
  assert.doesNotMatch(result.stdout, /^\s*init\s/m);
  assert.match(result.stdout, /-p, --print/);
  assert.doesNotMatch(result.stdout, /--no-model/);
  assert.doesNotMatch(result.stdout, /--wizard/);
  assert.doesNotMatch(result.stdout, /\/init/);
  assert.match(result.stdout, /\/help/);
  assert.match(result.stdout, /\/plan/);
  assert.match(result.stdout, /\/json/);
});

test('guided setup has one public command', async () => {
  const result = await runCli(['init', '--wizard']);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /use "nplan\.cmd setup" for guided setup/);
  assert.equal(result.stdout, '');
});

test('init without explicit config points to setup and does not write config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-init-empty-'));
  const result = await runCli(['init'], '', { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' }, dir);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /use "nplan\.cmd setup" for guided setup/);
  assert.equal(result.stdout, '');
  await assert.rejects(readFile(join(dir, '.nplan', 'config.toml'), 'utf8'));

  await rm(dir, { recursive: true, force: true });
});

test('providers command lists local and Chinese model providers', async () => {
  const result = await runCli(['providers']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /ollama/);
  assert.match(result.stdout, /vllm/);
  assert.match(result.stdout, /dashscope/);
  assert.match(result.stdout, /deepseek/);
  assert.match(result.stdout, /kimi/);
  assert.match(result.stdout, /doubao/);
  assert.match(result.stdout, /minimax/);
  assert.match(result.stdout, /baichuan/);
  assert.match(result.stdout, /stepfun/);
  assert.match(result.stdout, /siliconflow/);
});

test('init command writes project-local model config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-init-'));
  const result = await runCli(
    ['init', '--provider', 'dashscope', '--model', 'qwen-plus'],
    '',
    { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' },
    dir
  );
  const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Configured dashscope/);
  assert.match(result.stdout, /DASHSCOPE_API_KEY/);
  assert.match(config, /model = "qwen-plus"/);
  assert.match(config, /model_provider = "dashscope"/);
  assert.match(config, /base_url = "https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1"/);
  assert.doesNotMatch(config, /^api_?key\s*=/im);

  await rm(dir, { recursive: true, force: true });
});

test('init command preserves provider compatibility flags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-init-minimax-'));
  const result = await runCli(
    ['init', '--provider', 'minimax', '--model', 'MiniMax-M1'],
    '',
    { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' },
    dir
  );
  const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Configured minimax/);
  assert.match(result.stdout, /MINIMAX_API_KEY/);
  assert.match(config, /response_format = "none"/);

  await rm(dir, { recursive: true, force: true });
});

test('setup wizard fetches models and writes selected provider config', async () => {
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, headers: request.headers });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-'));
  const stdin = [
    'custom',
    `http://127.0.0.1:${port}/v1`,
    'localtest',
    'Local Test',
    'FAKE_MODEL_KEY',
    'chat_completions',
    '',
    '',
    'secret',
    'Y',
    '2',
    'Y'
  ].join('\n') + '\n';

  try {
    const result = await runCli(['setup'], stdin, { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' }, dir);
    const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /NPlan setup/);
    assert.match(result.stdout, /Found 2 model/);
    assert.doesNotMatch(result.stdout, /secret/);
    assert.equal(seen[0].url, '/v1/models');
    assert.equal(seen[0].headers.authorization, 'Bearer secret');
    assert.match(config, /model = "model-b"/);
    assert.match(config, /model_provider = "localtest"/);
    assert.match(config, /api_key = "secret"/);
    assert.match(config, /models_url = "http:\/\/127\.0\.0\.1:\d+\/v1\/models"/);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup wizard falls back when model fetch fails and does not save key by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-fallback-'));
  const stdin = [
    'custom',
    'http://127.0.0.1:9/v1',
    'fallback',
    'Fallback Provider',
    'FALLBACK_API_KEY',
    'chat_completions',
    '',
    '',
    'secret',
    'Y',
    'fallback-model',
    'N'
  ].join('\n') + '\n';

  try {
    const result = await runCli(['setup'], stdin, { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' }, dir);
    const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Could not fetch models/);
    assert.match(result.stdout, /Run this before using NPlan:/);
    assert.doesNotMatch(result.stdout, /secret/);
    assert.match(config, /model = "fallback-model"/);
    assert.doesNotMatch(config, /^api_?key\s*=/im);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup wizard can configure a built-in provider without fetching models', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-built-in-'));
  const stdin = [
    'deepseek',
    '',
    'N',
    ''
  ].join('\n') + '\n';

  try {
    const result = await runCli(['setup'], stdin, { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' }, dir);
    const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

    assert.equal(result.code, 0);
    assert.match(result.stdout, /NPlan setup/);
    assert.match(result.stdout, /Before using NPlan, set \$env:DEEPSEEK_API_KEY/);
    assert.match(config, /model = "deepseek-v4-flash"/);
    assert.match(config, /model_provider = "deepseek"/);
    assert.match(config, /models_url = "https:\/\/api\.deepseek\.com\/models"/);
    assert.doesNotMatch(config, /^api_?key\s*=/im);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('init can write models-url for advanced scripted setup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-init-models-url-'));
  const result = await runCli(
    [
      'init',
      '--provider',
      'custom',
      '--model',
      'script-model',
      '--base-url',
      'http://127.0.0.1:8000/v1',
      '--models-url',
      'http://127.0.0.1:8000/v1/models'
    ],
    '',
    { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' },
    dir
  );
  const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

  assert.equal(result.code, 0);
  assert.match(config, /models_url = "http:\/\/127\.0\.0\.1:8000\/v1\/models"/);

  await rm(dir, { recursive: true, force: true });
});

test('setup result can be loaded as the project model config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-load-'));
  const oldCwd = process.cwd();
  const input = readableFromLines([
    'deepseek',
    '',
    'N',
    ''
  ]);
  const output = writableBuffer();

  try {
    process.chdir(dir);
    await runModelSetupWizard({ streams: { input, output }, fetchImpl: async () => {
      throw new Error('should not fetch');
    } });
    const config = loadModelConfig.sync({ env: { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' } });

    assert.equal(config.model, 'deepseek-v4-flash');
    assert.equal(config.model_provider, 'deepseek');
    assert.equal(config.model_providers.deepseek.models_url, 'https://api.deepseek.com/models');
  } finally {
    process.chdir(oldCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test('interactive session supports status, plan summary, JSON view, unsupported shell, and exit commands', async () => {
  await withModelServer(async ({ configPath, env }) => {
    const child = spawn(NODE, [CLI, '--config-path', configPath], {
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

    child.stdin.write('/status\n');
    child.stdin.write('/plan implement TaskSpec schema and DAG verifier\n');
    child.stdin.write('/json\n');
    child.stdin.write('!echo unsafe\n');
    child.stdin.write('/init ollama qwen2.5\n');
    child.stdin.write('/unknown\n');
    child.stdin.write('/exit\n');
    child.stdin.end();

    const [code] = await once(child, 'close');

    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.match(stdout, /NPlan/);
    assert.match(stdout, /model: localtest\/semantic-test-model/);
    assert.match(stdout, /status: planned/);
    assert.match(stdout, /Full JSON: \/json/);
    assert.match(stdout, /"status": "planned"/);
    assert.match(stdout, /Shell execution is not available in NPlan/);
    assert.match(stdout, /Model setup is available as nplan\.cmd setup/);
    assert.match(stdout, /Unknown command\. Use \/help for commands\./);
    assert.match(stdout, /bye/);
  });
});

test('interactive session starts before model setup and guides init', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-no-model-interactive-'));
  const result = await runCli(
    [],
    '/status\n/exit\n',
    {
      HOME: dir,
      USERPROFILE: dir,
      NPLAN_HOME: '',
      NPLAN_MODEL: ''
    },
    dir
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /NPlan/);
  assert.match(result.stdout, /model: not configured/);
  assert.match(result.stdout, /Run nplan\.cmd setup/);

  await rm(dir, { recursive: true, force: true });
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
  const dir = await mkdtemp(join(tmpdir(), 'nplan-cli-'));
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

async function runCli(args, stdin = '', env = {}, cwd = process.cwd()) {
  const child = spawn(NODE, [CLI, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd,
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

async function withModelServer(fn, draft = defaultTaskSpecDraft()) {
  const seen = [];
  const server = createServer(async (request, response) => {
    const body = await readRequest(request);
    seen.push({ url: request.url, headers: request.headers, body: JSON.parse(body) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(draft) } }]
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const dir = await mkdtemp(join(tmpdir(), 'nplan-model-'));
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

  try {
    return await fn({ configPath, env: { FAKE_MODEL_KEY: 'secret' }, seen });
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function defaultTaskSpecDraft() {
  return {
    inferred_goal: 'Create verified local planning artifacts for TaskSpec schema and DAG verifier',
    task_type: 'coding',
    audience: 'maintainers',
    target_object: 'local planning module',
    deliverables: [
      { name: 'TaskSpec schema', format: 'json', required: true },
      { name: 'DAG verifier', format: 'json', required: true }
    ],
    output_format: 'json',
    missing_information: { blocking: [], non_blocking: [] },
    assumptions: ['Planning only; execution is outside this module'],
    ambiguities: [],
    success_criteria: [
      'TaskSpec schema is represented',
      'DAG verifier is represented'
    ],
    checkpoint_policy: {
      stop_on: ['blocking_missing_information', 'validation_failure'],
      requires_user_confirmation_for: ['task_execution']
    },
    quality_bar: ['deliverables are explicit'],
    risk_level: 'low'
  };
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

function readableFromLines(lines) {
  return Readable.from(`${lines.join('\n')}\n`);
}

function writableBuffer() {
  let text = '';
  return new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
    final(callback) {
      this.text = text;
      callback();
    }
  });
}
