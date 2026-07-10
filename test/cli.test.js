import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { main, parseArgs, renderInteractiveResult } from '../src/cli.js';
import { loadModelConfig } from '../src/model-config.js';
import { runModelSetupWizard } from '../src/model-wizard.js';
import { deriveWorkPlan } from '../src/work-plan.js';
import { clarificationResult, plannedChineseResult } from './fixtures.js';

const NODE = process.execPath;
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('print mode returns one JSON result and exits', async () => {
  await withModelServer(async ({ configPath, env, seen }) => {
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
    assert.equal(seen.length, 2);
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
    assert.match(result.stdout, /结论/);
    assert.match(result.stdout, /行动步骤/);
    assert.doesNotMatch(result.stdout, /status: planned/);
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
    assert.match(result.stdout, /结论/);
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
  const result = await runCli(['--lang', 'en', '--help']);

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

test('help and startup are Chinese by default with English opt-in', async () => {
  const zh = await runCli(['--help']);
  const en = await runCli(['--lang', 'en', '--help']);

  assert.equal(zh.code, 0);
  assert.match(zh.stdout, /用法：nplan/);
  assert.match(zh.stdout, /\/帮助/);
  assert.match(zh.stdout, /--lang <zh-CN\|en>/);
  assert.equal(en.code, 0);
  assert.match(en.stdout, /Usage: nplan/);
  assert.match(en.stdout, /\/help/);
});

test('invalid locale is rejected with a clear localized error', async () => {
  const result = await runCli(['--lang', 'fr', '--help']);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /不支持的语言：fr/);
});

test('Chinese slash aliases work in the interactive session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-zh-alias-'));
  const result = await runCli(
    [],
    '/帮助\n/退出\n',
    { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
    dir
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /NPlan 规划助手/);
  assert.match(result.stdout, /模型：未配置/);
  assert.match(result.stdout, /请先运行 nplan setup/);
  assert.match(result.stdout, /用法：nplan/);
  assert.match(result.stdout, /再见/);
  assert.doesNotMatch(result.stdout, /未知命令/);
  assert.doesNotMatch(result.stdout, /model: not configured|Model setup required/);
  await rm(dir, { recursive: true, force: true });
});

test('interactive result shows conclusion steps acceptance and next action without raw fields', () => {
  const result = plannedChineseResult();
  const text = renderInteractiveResult(result, {
    workPlan: deriveWorkPlan(result, { locale: 'zh-CN' }),
    locale: 'zh-CN'
  });

  assert.match(text, /结论/);
  assert.match(text, /行动步骤/);
  assert.match(text, /验收标准/);
  assert.match(text, /下一步/);
  assert.doesNotMatch(text, /status:|deliverables:|T1:|Full JSON|plan_id|session_id/);
});

test('interactive clarification is concise and contains no empty plan sections', () => {
  const result = clarificationResult();
  const text = renderInteractiveResult(result, {
    workPlan: deriveWorkPlan(result, { locale: 'zh-CN' }),
    locale: 'zh-CN'
  });

  assert.match(text, /^需要确认/m);
  assert.match(text, /儿童年龄是多少？/);
  assert.match(text, /下一步/);
  assert.doesNotMatch(text, /行动步骤|status:|Full JSON/);
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

  assert.equal(parseArgs([]).locale, 'zh-CN');
  assert.equal(parseArgs(['--lang', 'en']).locale, 'en');
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
    const child = spawn(NODE, [CLI, '--lang', 'en', '--config-path', configPath], {
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
    child.stdin.write('/export docs/plans/cli-work-plan.md\n');
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
    const customMarkdown = await readFile(join(cwd, 'docs', 'plans', 'cli-work-plan.md'), 'utf8');

    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.match(stdout, /NPlan/);
    assert.match(stdout, /cwd:/);
    assert.match(stdout, /session:/);
    assert.match(stdout, /model: localtest\/semantic-test-model/);
    assert.match(stdout, /model: localtest\/alternate-model/);
    assert.match(stdout, /Conclusion/);
    assert.match(stdout, /context: sources=/);
    assert.match(stdout, /Sources:/);
    assert.match(stdout, /Action Steps:/);
    assert.match(stdout, /- \[ \] Produce validated planning deliverables/);
    assert.match(stdout, /Acceptance:/);
    assert.doesNotMatch(stdout, /Acceptance：/);
    assert.match(stdout, /revised plan:/);
    assert.match(stdout, /exported: \.nplan\/exports\//);
    assert.match(stdout, /exported: docs\/plans\/cli-work-plan\.md/);
    assert.match(stdout, /compacted session/);
    assert.doesNotMatch(stdout, /Full JSON: \/json/);
    assert.match(stdout, /"status": "planned"/);
    assert.match(stdout, /Shell execution is not available in NPlan/);
    assert.match(stdout, /Model setup is available as nplan setup/);
    assert.match(stdout, /No tool permissions are available/);
    assert.match(stdout, /cleared\. New session:/);
    assert.match(stdout, /Unknown command\. Use \/help for commands\./);
    assert.match(stdout, /bye/);
    assert.equal(defaultExports.length, 1);
    assert.match(defaultMarkdown, /^---\ntype: nplan-work-plan/m);
    assert.match(defaultMarkdown, /## Action Steps/);
    assert.match(defaultMarkdown, /```mermaid/);
    assert.doesNotMatch(defaultMarkdown, /\[\[Task T1 - /);
    assert.match(customMarkdown, /## Conclusion/);
  });
});

test('interactive revise explains when there is no previous plan', async () => {
  await withModelServer(async ({ configPath, env }) => {
    const result = await runCli(
      ['--lang', 'en', '--config-path', configPath],
      '/revise make the plan Obsidian friendly\n/exit\n',
      env
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /No previous plan yet; planning from this text\./);
    assert.match(result.stdout, /revised plan:/);
    assert.equal(result.stderr, '');
  });
});

test('interactive session exits on one terminal Ctrl+C', async () => {
  await withModelServer(async ({ configPath, cwd }) => {
    const oldCwd = process.cwd();
    const input = new PassThrough();
    input.isTTY = true;
    let rawModeReleased = false;
    let inputPaused = false;
    input.setRawMode = (enabled) => {
      if (enabled === false) rawModeReleased = true;
      return input;
    };
    const pauseInput = input.pause.bind(input);
    input.pause = () => {
      inputPaused = true;
      return pauseInput();
    };

    let stdout = '';
    let stderr = '';
    let sentInterrupt = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        stdout += chunk.toString();
        if (!sentInterrupt && stdout.includes('nplan> ')) {
          sentInterrupt = true;
          setImmediate(() => {
            input.write('\x03');
          });
        }
        callback();
      }
    });
    output.isTTY = true;
    output.columns = 80;
    const error = new Writable({
      write(chunk, _encoding, callback) {
        stderr += chunk.toString();
        callback();
      }
    });

    try {
      process.chdir(cwd);
      const code = await main(['--lang', 'en', '--config-path', configPath], { input, output, error });

      assert.equal(code, 0);
      assert.equal(stderr, '');
      assert.match(stdout, /bye/);
      assert.equal(rawModeReleased, true);
      assert.equal(inputPaused, true);
    } finally {
      input.destroy();
      process.chdir(oldCwd);
    }
  });
});

test('first interactive TTY launch runs setup then opens configured session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-first-run-tty-'));
  const oldCwd = process.cwd();
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const scriptedInput = [
    { pattern: /Choose provider number or id/, text: 'deepseek\n' },
    { pattern: /DEEPSEEK_API_KEY/, text: '\n' },
    { pattern: /Fetch model list/, text: 'N\n' },
    { pattern: /Model name/, text: '\n' },
    { pattern: /nplan> /, text: '/status\n/exit\n', end: true }
  ];
  let scriptedIndex = 0;

  let stdout = '';
  let stderr = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      const next = scriptedInput[scriptedIndex];
      if (next && next.pattern.test(stdout)) {
        scriptedIndex += 1;
        setImmediate(() => {
          if (next.end) input.end(next.text);
          else input.write(next.text);
        });
      }
      callback();
    }
  });
  output.isTTY = true;
  output.columns = 80;
  const error = new Writable({
    write(chunk, _encoding, callback) {
      stderr += chunk.toString();
      callback();
    }
  });

  try {
    process.chdir(dir);
    const code = await main(['--lang', 'en'], { input, output, error });
    const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.equal(scriptedIndex, scriptedInput.length);
    assert.match(stdout, /No model is configured yet\. Starting first-run setup\./);
    assert.match(stdout, /NPlan setup/);
    assert.match(stdout, /Setup complete/);
    assert.match(stdout, /model: deepseek\/deepseek-v4-flash/);
    assert.match(stdout, /bye/);
    assert.match(config, /model = "deepseek-v4-flash"/);
    assert.match(config, /model_provider = "deepseek"/);
  } finally {
    process.chdir(oldCwd);
    input.destroy();
    await rm(dir, { recursive: true, force: true });
  }
});

test('interactive session starts before model setup and guides init', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-no-model-interactive-'));
  const result = await runCli(
    ['--lang', 'en'],
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
    ['--lang', 'en'],
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
    const parsedBody = JSON.parse(body);
    seen.push({ url: request.url, headers: request.headers, body: parsedBody });
    const draft = isPlanningRequest(parsedBody)
      ? taskPlanDraftFor(['File scanner', 'Classification rules', 'Markdown report'])
      : {
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
        };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(draft)
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
  assert.equal(seen.length, 2);
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

async function withModelServer(fn, taskSpecDraft = defaultTaskSpecDraft()) {
  const seen = [];
  const server = createServer(async (request, response) => {
    const body = await readRequest(request);
    const parsedBody = JSON.parse(body);
    seen.push({ url: request.url, headers: request.headers, body: parsedBody });
    const draft = isPlanningRequest(parsedBody)
      ? taskPlanDraftFor(taskSpecDraft.deliverables.map((item) => item.name))
      : taskSpecDraft;
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

function taskPlanDraftFor(outputs) {
  return {
    global_goal: 'Produce the requested planning deliverables',
    global_acceptance: outputs.map((output) => `${output} is represented`),
    tasks: [
      {
        id: 'T1',
        title: 'Produce validated planning deliverables',
        goal: 'Create reviewable outputs that cover every required deliverable',
        inputs: ['validated TaskSpec'],
        outputs,
        dependencies: [],
        parallel_group: 'G1',
        acceptance: outputs.map((output) => `${output} has explicit acceptance checks`),
        complexity: 'medium',
        risk: 'low',
        model_tier: 'strong',
        state: 'pending'
      }
    ]
  };
}

function isPlanningRequest(body) {
  return body?.messages?.[0]?.content?.includes('Task Planning');
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
