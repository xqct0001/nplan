import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseArgs } from '../src/cli.js';
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

test('print mode can render a concise summary output', async () => {
  await withModelServer(async ({ configPath, env }) => {
    const result = await runCli(
      ['--config-path', configPath, '--print', '--output-format', 'summary', 'implement TaskSpec schema'],
      '',
      env
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /status: planned/);
    assert.doesNotMatch(result.stdout, /Full JSON: \/json/);
    assert.throws(() => JSON.parse(result.stdout));
  });
});

test('exec command is an alias for one-shot print mode', async () => {
  await withModelServer(async ({ configPath, env }) => {
    const result = await runCli(
      ['exec', '--config-path', configPath, '--output-format', 'summary', 'implement TaskSpec schema'],
      '',
      env
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /status: planned/);
    assert.equal(result.stderr, '');
  });
});

test('print mode can continue the latest saved planning session', async () => {
  await withModelServer(async ({ configPath, env, cwd }) => {
    const first = await runCli(
      ['--config-path', configPath, '--continue', '--print', 'plan TaskSpec schema'],
      '',
      env,
      cwd
    );
    const second = await runCli(
      ['--config-path', configPath, '--continue', '--print', 'extend it with validation'],
      '',
      env,
      cwd
    );
    const sessionFiles = await readdir(join(cwd, '.nplan', 'sessions'));
    const session = JSON.parse(await readFile(join(cwd, '.nplan', 'sessions', sessionFiles[0]), 'utf8'));

    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    assert.equal(JSON.parse(second.stdout).status, 'planned');
    assert.equal(session.turns.length, 2);
    assert.match(session.turns[0].prompt, /TaskSpec schema/);
    assert.match(session.turns[1].prompt, /validation/);
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

test('help shows Claude-like command shapes and slash commands', async () => {
  const result = await runCli(['--help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /nplan \[options\] \[prompt\]/);
  assert.match(result.stdout, /exec \[options\] \[prompt\]/);
  assert.match(result.stdout, /setup/);
  assert.match(result.stdout, /resume \[id\]/);
  assert.match(result.stdout, /doctor/);
  assert.doesNotMatch(result.stdout, /^\s*init\s/m);
  assert.match(result.stdout, /-p, --print/);
  assert.match(result.stdout, /--output-format/);
  assert.match(result.stdout, /-c, --continue/);
  assert.match(result.stdout, /-r, --resume/);
  assert.match(result.stdout, /-V, --version/);
  assert.doesNotMatch(result.stdout, /--no-model/);
  assert.doesNotMatch(result.stdout, /--wizard/);
  assert.doesNotMatch(result.stdout, /\/init/);
  assert.match(result.stdout, /\/help/);
  assert.match(result.stdout, /\/config/);
  assert.match(result.stdout, /\/model/);
  assert.match(result.stdout, /\/context/);
  assert.match(result.stdout, /\/sources/);
  assert.match(result.stdout, /\/todo/);
  assert.match(result.stdout, /\/revise/);
  assert.match(result.stdout, /\/export/);
  assert.match(result.stdout, /\/compact/);
  assert.match(result.stdout, /\/plan/);
  assert.match(result.stdout, /\/json/);
});

test('argument parser supports Claude Code session flags and legacy config override', () => {
  const continued = parseArgs(['-c', 'plan the interface']);
  assert.equal(continued.continueSession, true);
  assert.equal(continued.prompt, 'plan the interface');

  const exec = parseArgs(['exec', 'plan the interface']);
  assert.equal(exec.print, true);
  assert.equal(exec.prompt, 'plan the interface');

  const resumed = parseArgs(['resume', 'latest']);
  assert.equal(resumed.continueSession, true);
  assert.equal(resumed.resumeSessionId, 'latest');

  const configured = parseArgs(['-c', 'model=qwen-plus', '--config', 'model_provider=dashscope']);
  assert.equal(configured.continueSession, false);
  assert.equal(configured.configOverrides.model, 'qwen-plus');
  assert.equal(configured.configOverrides.model_provider, 'dashscope');
});

test('guided setup has one public command', async () => {
  const result = await runCli(['init', '--wizard']);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /use "nplan setup" for guided setup/);
  assert.equal(result.stdout, '');
});

test('init without explicit config points to setup and does not write config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-init-empty-'));
  const result = await runCli(['init'], '', { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '' }, dir);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /use "nplan setup" for guided setup/);
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
    assert.match(result.stdout, /Run this before using NPlan in CMD:/);
    assert.match(result.stdout, /set FALLBACK_API_KEY=<your-key>/);
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
    assert.match(result.stdout, /Before using NPlan in CMD, run: set DEEPSEEK_API_KEY=<your-key>/);
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

test('interactive session supports Claude-like session commands and planning boundaries', async () => {
  await withModelServer(async ({ configPath, env, cwd }) => {
    const child = spawn(NODE, [CLI, '--config-path', configPath], {
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

    child.stdin.write('/status\n');
    child.stdin.write('/config\n');
    child.stdin.write('/model alternate-model\n');
    child.stdin.write('/model\n');
    child.stdin.write('/plan implement TaskSpec schema and DAG verifier\n');
    child.stdin.write('/context\n');
    child.stdin.write('/sources\n');
    child.stdin.write('/todo\n');
    child.stdin.write('/revise keep the first version single-file for Obsidian\n');
    child.stdin.write('/export\n');
    child.stdin.write('/export docs/plans/cli-pr-plan.md\n');
    child.stdin.write('/compact keep provider notes\n');
    child.stdin.write('/json\n');
    child.stdin.write('!echo unsafe\n');
    child.stdin.write('/init ollama qwen2.5\n');
    child.stdin.write('/permissions\n');
    child.stdin.write('/reset\n');
    child.stdin.write('/unknown\n');
    child.stdin.write('/exit\n');
    child.stdin.end();

    const [code] = await once(child, 'close');
    const defaultExports = await readdir(join(cwd, '.nplan', 'exports'));
    const defaultMarkdown = await readFile(join(cwd, '.nplan', 'exports', defaultExports[0]), 'utf8');
    const customMarkdown = await readFile(join(cwd, 'docs', 'plans', 'cli-pr-plan.md'), 'utf8');

    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.match(stdout, /NPlan/);
    assert.match(stdout, /session: /);
    assert.match(stdout, /model: localtest\/semantic-test-model/);
    assert.match(stdout, /model: localtest\/alternate-model/);
    assert.match(stdout, /status: planned/);
    assert.match(stdout, /context: sources=/);
    assert.match(stdout, /sources:/);
    assert.match(stdout, /todo:/);
    assert.match(stdout, /- \[ \] T1 Define TaskSpec artifacts/);
    assert.match(stdout, /revised plan:/);
    assert.match(stdout, /exported: \.nplan\/exports\//);
    assert.match(stdout, /exported: docs\/plans\/cli-pr-plan\.md/);
    assert.match(stdout, /compacted session/);
    assert.match(stdout, /Full JSON: \/json/);
    assert.match(stdout, /"status": "planned"/);
    assert.match(stdout, /Shell execution is not available in NPlan/);
    assert.match(stdout, /Model setup is available as nplan setup/);
    assert.match(stdout, /No tool permissions are available/);
    assert.match(stdout, /cleared\. New session:/);
    assert.match(stdout, /Unknown command\. Use \/help for commands\./);
    assert.match(stdout, /bye/);
    assert.equal(defaultExports.length, 1);
    assert.match(defaultMarkdown, /^---\ntype: nplan-pr-plan/m);
    assert.match(defaultMarkdown, /## Todo/);
    assert.match(defaultMarkdown, /```mermaid/);
    assert.match(defaultMarkdown, /\[\[Task T1 - /);
    assert.match(customMarkdown, /## PR Draft/);
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
  assert.match(result.stdout, /Run nplan setup/);

  await rm(dir, { recursive: true, force: true });
});

test('version flag prints the CLI version', async () => {
  const result = await runCli(['--version']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^nplan \d+\.\d+\.\d+/);
  assert.equal(result.stderr, '');
});

test('doctor command reports local CLI status without requiring a model', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-doctor-'));
  const result = await runCli(
    ['doctor'],
    '',
    { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
    dir
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /NPlan doctor/);
  assert.match(result.stdout, /version:/);
  assert.match(result.stdout, /node:/);
  assert.match(result.stdout, /model: not configured/);
  assert.equal(result.stderr, '');

  await rm(dir, { recursive: true, force: true });
});

test('interactive resume ignores corrupt session files without crashing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-corrupt-session-'));
  const sessionDir = join(dir, '.nplan', 'sessions');
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, '20260707120000-badbad12.json'), '{broken', 'utf8');

  const result = await runCli(
    [],
    '/resume 20260707120000-badbad12\n/exit\n',
    {
      HOME: dir,
      USERPROFILE: dir,
      NPLAN_HOME: '',
      NPLAN_MODEL: ''
    },
    dir
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /No saved session found\./);
  assert.match(result.stdout, /bye/);
  assert.equal(result.stderr, '');

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
    return await fn({ configPath, env: { FAKE_MODEL_KEY: 'secret' }, seen, cwd: dir });
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
