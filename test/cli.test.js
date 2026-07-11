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

import { LocalPlanningAgent } from '../src/agent.js';
import { authorizePreparedContext, main, parseArgs, renderInteractiveResult } from '../src/cli.js';
import { buildConsentScope, hasValidConsent, loadConsent, saveConsent } from '../src/consent.js';
import { OpenAICompatiblePlanningModel } from '../src/model-client.js';
import { loadModelConfig } from '../src/model-config.js';
import { fetchProviderModels, runModelSetupWizard } from '../src/model-wizard.js';
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
    assert.equal(session.version, '2.0');
    assert.match(session.turns[0].request, /TaskSpec schema/);
    assert.match(session.turns[1].request, /validation/);
  });
});

test('cloud print mode refuses before any model request without consent', async () => {
  await withCloudModelServer(async ({ configPath, seen, cwd, env }) => {
    const result = await runCli(
      ['--config-path', configPath, '-p', '规划北京亲子游'],
      '',
      env,
      cwd
    );

    assert.equal(result.code, 2);
    assert.match(result.stderr, /尚未授权发送本地上下文/);
    assert.equal(seen.length, 0);
  });
});

test('one-shot cloud authorization permits exactly two model requests', async () => {
  await withCloudModelServer(async ({ configPath, seen, cwd, env }) => {
    const result = await runCli(
      [
        '--config-path', configPath,
        '--allow-cloud-context',
        '-p', '--output-format', 'summary',
        '规划北京亲子游'
      ],
      '',
      env,
      cwd
    );

    assert.equal(result.code, 0);
    assert.equal(seen.length, 2);
    assert.equal(await loadConsent(cwd), null);

    const refused = await runCli(
      ['--config-path', configPath, '-p', '规划北京亲子游'],
      '',
      env,
      cwd
    );
    assert.equal(refused.code, 2);
    assert.equal(seen.length, 2);
  });
});

test('local provider skips cloud consent and makes exactly two requests', async () => {
  await withLocalModelServer(async ({ configPath, seen, cwd, env }) => {
    const result = await runCli(
      ['--config-path', configPath, '-p', '规划北京亲子游'],
      '',
      env,
      cwd
    );

    assert.equal(result.code, 0);
    assert.equal(seen.length, 2);
  });
});

test('resumed session restores todo, sources, and export capability', async () => {
  await withLocalModelServer(async ({ configPath, cwd, env }) => {
    const first = await runCli(
      ['--config-path', configPath],
      '规划北京亲子游\n/退出\n',
      env,
      cwd
    );
    assert.equal(first.code, 0);

    const second = await runCli(
      ['--config-path', configPath, '--resume', 'latest'],
      '/步骤\n/来源\n/导出\n/退出\n',
      env,
      cwd
    );

    assert.equal(second.code, 0);
    assert.match(second.stdout, /已恢复规划/);
    assert.match(second.stdout, /行动步骤/);
    assert.match(second.stdout, /来源/);
    assert.match(second.stdout, /已导出/);
  });
});

test('saved project consent is reused without a prompt', async () => {
  await withCloudModelServer(async ({ configPath, cwd, env, seen }) => {
    await saveMatchingConsent({ configPath, cwd, env, request: '规划北京亲子游' });

    const result = await runCli(
      ['--config-path', configPath, '-p', '规划北京亲子游'],
      '',
      env,
      cwd
    );

    assert.equal(result.code, 0);
    assert.equal(seen.length, 2);
  });
});

test('non-TTY interactive cloud mode refuses with zero model requests', async () => {
  await withCloudModelServer(async ({ configPath, cwd, env, seen }) => {
    const result = await runCli(
      ['--config-path', configPath],
      '规划北京亲子游\n/退出\n',
      env,
      cwd
    );

    assert.equal(result.code, 2);
    assert.match(result.stdout, /尚未授权发送本地上下文/);
    assert.equal(seen.length, 0);
  });
});

test('interactive consent can inspect sources, exclude relative paths, and remember', async () => {
  await withCloudModelServer(async ({ configPath, cwd, env, seen }) => {
    await mkdir(join(cwd, 'docs'), { recursive: true });
    await writeFile(join(cwd, 'README.md'), '# Public guide\n', 'utf8');
    await writeFile(join(cwd, 'docs', 'private.md'), '# Private notes\n', 'utf8');
    const runtime = runtimeForConfig(configPath, env);
    const prepared = runtime.agent.prepare('规划北京亲子游', { root: cwd });
    const output = writableBuffer();
    output.isTTY = true;
    const ttyInput = new PassThrough();
    ttyInput.isTTY = true;
    const answers = ['1', '2', 'C:\\secret.md', '2', 'docs', '3'];

    const authorized = await authorizePreparedContext({
      prepared,
      baseContext: { root: cwd },
      runtime,
      streams: { input: ttyInput, output },
      readLine: async () => answers.shift() ?? null
    });

    assert.equal(authorized.allowed, true);
    assert.equal(authorized.persisted, true);
    assert.deepEqual(authorized.prepared.context.context_policy.user_exclusions, ['docs']);
    assert.equal(authorized.prepared.context.source_map.some((source) => source.relative_path.startsWith('docs/')), false);
    assert.equal(seen.length, 0);
    assert.match(output.text, /将发送的来源/);
    assert.match(output.text, /排除路径无效/);
    const saved = await loadConsent(cwd);
    assert.deepEqual(saved.exclusions, ['docs']);
    const scope = buildConsentScope(
      runtime.modelClient.provider,
      authorized.prepared.context.context_policy,
      ['docs']
    );
    assert.equal(hasValidConsent(saved, scope), true);
    ttyInput.destroy();
  });
});

test('interactive consent cancellation makes no model request', async () => {
  await withCloudModelServer(async ({ configPath, cwd, env, seen }) => {
    const runtime = runtimeForConfig(configPath, env);
    const prepared = runtime.agent.prepare('规划北京亲子游', { root: cwd });
    const output = writableBuffer();
    output.isTTY = true;
    const ttyInput = new PassThrough();
    ttyInput.isTTY = true;

    const authorization = await authorizePreparedContext({
      prepared,
      baseContext: { root: cwd },
      runtime,
      streams: { input: ttyInput, output },
      readLine: async () => '4'
    });

    assert.equal(authorization.allowed, false);
    assert.equal(seen.length, 0);
    ttyInput.destroy();
  });
});

test('consent command reports status and revokes saved project consent', async () => {
  await withCloudModelServer(async ({ configPath, cwd, env }) => {
    await saveMatchingConsent({ configPath, cwd, env, request: '规划北京亲子游' });
    const status = await runCli(['consent', 'status'], '', env, cwd);
    assert.equal(status.code, 0);
    assert.match(status.stdout, /云端上下文授权：已保存/);

    const revoked = await runCli(['consent', 'revoke'], '', env, cwd);
    assert.equal(revoked.code, 0);
    assert.match(revoked.stdout, /已撤销/);
    assert.equal(await loadConsent(cwd), null);
  });
});

test('direct text revises an existing WorkPlan and new clears revision state', async () => {
  await withLocalModelServer(async ({ configPath, cwd, env, seen }) => {
    const revised = await runCli(
      ['--config-path', configPath],
      '规划北京亲子游\n补充预算上限\n/退出\n',
      env,
      cwd
    );
    assert.equal(revised.code, 0);
    assert.equal(seen.length, 4);
    assert.match(modelUserPrompt(seen[2].body), /Revision:\n补充预算上限/);

    seen.length = 0;
    const fresh = await runCli(
      ['--config-path', configPath],
      '规划北京亲子游\n/新建\n规划上海亲子游\n/退出\n',
      env,
      cwd
    );
    assert.equal(fresh.code, 0);
    assert.equal(seen.length, 4);
    assert.doesNotMatch(modelUserPrompt(seen[2].body), /Revision:/);
  });
});

test('interactive initial prompt revises a resumed WorkPlan before model preparation', async () => {
  await withLocalModelServer(async ({ configPath, cwd, env, seen }) => {
    const first = await runCli(
      ['--config-path', configPath],
      '规划北京亲子游\n/退出\n',
      env,
      cwd
    );
    assert.equal(first.code, 0);
    seen.length = 0;

    const resumed = await runCli(
      ['--config-path', configPath, '--resume', 'latest', '调整交通方式'],
      '/退出\n',
      env,
      cwd
    );

    assert.equal(resumed.code, 0, resumed.stderr || resumed.stdout);
    assert.equal(seen.length, 2);
    const request = modelUserPrompt(seen[0].body);
    assert.match(request, /Previous request:/);
    assert.match(request, /Previous plan:/);
    assert.match(request, /Revision:\n调整交通方式/);
  });
});

test('print resume revises an existing WorkPlan while a new print stays fresh', async () => {
  await withLocalModelServer(async ({ configPath, cwd, env, seen }) => {
    const first = await runCli(
      ['--config-path', configPath],
      '规划北京亲子游\n/退出\n',
      env,
      cwd
    );
    assert.equal(first.code, 0);
    seen.length = 0;

    const resumed = await runCli(
      ['--config-path', configPath, '-p', '--resume', 'latest', '补充预算上限'],
      '',
      env,
      cwd
    );
    assert.equal(resumed.code, 0, resumed.stderr || resumed.stdout);
    assert.equal(seen.length, 2);
    const resumedRequest = modelUserPrompt(seen[0].body);
    assert.match(resumedRequest, /Previous goal:/);
    assert.match(resumedRequest, /Previous plan:/);
    assert.match(resumedRequest, /Revision:\n补充预算上限/);

    seen.length = 0;
    const fresh = await runCli(
      ['--config-path', configPath, '-p', '规划北京亲子游'],
      '',
      env,
      cwd
    );
    assert.equal(fresh.code, 0);
    assert.equal(seen.length, 2);
    assert.equal(modelUserPrompt(seen[0].body), '规划北京亲子游');
  });
});

test('CLI reports v1 sessions as explicitly incompatible', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'nplan-v1-cli-'));
  await mkdir(join(cwd, '.nplan', 'sessions'), { recursive: true });
  await writeFile(
    join(cwd, '.nplan', 'sessions', '20260710120000-old00001.json'),
    JSON.stringify({ version: '1.0', id: '20260710120000-old00001', turns: [] }),
    'utf8'
  );
  const result = await runCli(
    ['--resume', 'latest'],
    '',
    { HOME: cwd, USERPROFILE: cwd, NPLAN_HOME: '', NPLAN_MODEL: '' },
    cwd
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /不兼容的 1\.0 格式/);
  await rm(cwd, { recursive: true, force: true });
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

test('plan invalid result summarizes duplicate ids plan errors and missing references in Chinese', () => {
  const result = {
    ...plannedChineseResult(),
    status: 'plan_invalid',
    taskplan_report: {
      valid: false,
      duplicate_task_ids: ['T1'],
      plan_errors: ['duplicate_task_ids', 'invalid_plan_style'],
      missing_dependency_refs: [['T2', 'T9']]
    }
  };
  const text = renderInteractiveResult(result, { locale: 'zh-CN' });

  assert.match(text, /计划中存在重复步骤/);
  assert.match(text, /计划结构不受支持/);
  assert.match(text, /引用了不存在的前置步骤/);
  assert.doesNotMatch(text, /T1|T2|T9|duplicate_task_ids|invalid_plan_style/);
});

test('plan invalid result deduplicates safe policy summaries and hides unknown raw details', () => {
  const result = {
    ...plannedChineseResult(),
    status: 'plan_invalid',
    taskspec_report: {
      valid: true,
      future_validator_details: ['source-17', 'T2']
    },
    taskplan_report: {
      valid: false,
      policy_errors: ['task_too_coarse:T1', 'task_too_coarse:T1']
    }
  };
  const text = renderInteractiveResult(result, { locale: 'zh-CN' });

  assert.equal(text.match(/部分行动步骤过于笼统/g)?.length, 1);
  assert.match(text, /计划校验未通过/);
  assert.doesNotMatch(text, /T1|T2|source-17|task_too_coarse|future_validator_details/);
});

test('plan invalid result covers every validation category with safe English summaries', () => {
  const result = {
    ...plannedChineseResult(),
    status: 'plan_invalid',
    taskspec_report: {
      valid: false,
      missing_required_fields: ['target_object'],
      conflicts: ['evidence_without_source:source-4']
    },
    taskplan_report: {
      valid: false,
      missing_required_fields: ['tasks'],
      missing_task_fields: { T1: ['outputs'] },
      cycle_detected: true,
      missing_dependency_refs: [['T2', 'T9']],
      missing_dependency_references: [['T2', 'T9']],
      tasks_without_acceptance: ['T1'],
      tasks_without_io: ['T2'],
      coverage_gaps: ['Budget report'],
      missing_deliverable_coverage: ['Budget report'],
      duplicate_deliverable_coverage: ['Budget report:T1'],
      policy_errors: ['task_too_coarse:T1', 'invalid_max_tasks'],
      task_count_exceeded: { count: 13, max_tasks: 12 },
      depth_exceeded: { T1: { depth: 4, max_depth: 3 } },
      plan_errors: ['invalid_plan_style', 'future_problem:T2'],
      duplicate_task_ids: ['T1'],
      conflicts: ['planner_conflict:T2']
    }
  };
  const text = renderInteractiveResult(result, { locale: 'en' });

  for (const phrase of [
    'Task details are incomplete',
    'The plan is missing required fields',
    'Some action steps are incomplete',
    'Some action steps reference missing prerequisites',
    'Some action steps have no acceptance criteria',
    'Some action steps have missing inputs or outputs',
    'The plan does not fully cover the required outputs',
    'Some outputs are covered more than once',
    'Some action steps are too broad',
    'Planning constraints are invalid',
    'The plan has too many action steps',
    'The dependency chain is too deep',
    'Action steps contain a dependency cycle',
    'The plan contains duplicate action steps',
    'The plan structure is unsupported',
    'The plan contains conflicting information',
    'Plan validation did not pass'
  ]) {
    assert.match(text, new RegExp(phrase));
  }
  assert.doesNotMatch(
    text,
    /T1|T2|T9|source-4|Budget report|task_too_coarse|invalid_max_tasks|future_problem|planner_conflict/
  );
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
    assert.match(result.stdout, /下一步/);
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

test('setup accepts Chinese confirmation and re-prompts an invalid provider', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-zh-'));
  try {
    const result = await runCli(
      ['setup'],
      ['not-a-provider', 'deepseek', '', '否', ''].join('\n') + '\n',
      { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
      dir
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /无法识别，请重新选择/);
    assert.match(result.stdout, /配置完成/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup re-prompts an invalid Chinese confirmation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-confirm-zh-'));
  try {
    const result = await runCli(
      ['setup'],
      ['deepseek', '', '随便', '否', ''].join('\n') + '\n',
      { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
      dir
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /请输入“是”或“否”/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup uses English group labels with --lang en', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-en-'));
  try {
    const result = await runCli(
      ['setup', '--lang', 'en'],
      ['deepseek', '', 'N', ''].join('\n') + '\n',
      { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
      dir
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Recommended cloud providers:/);
    assert.doesNotMatch(result.stdout, /推荐云端 Provider/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('custom setup never displays URL credentials, queries, or fragments', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-url-redaction-'));
  const baseUrl = 'https://base-user-marker:base-pass-marker@example.test/v1?api_key=base-query-marker#base-fragment-marker';
  const modelsUrl = 'https://models-user-marker:models-pass-marker@example.test/v1/models?api_key=models-query-marker#models-fragment-marker';
  const keyUrl = 'https://key-user-marker:key-pass-marker@example.test/keys?token=key-query-marker#key-fragment-marker';
  try {
    const result = await runCli(
      ['setup'],
      [
        'custom',
        baseUrl,
        'safe-custom',
        'Safe Custom',
        'SAFE_CUSTOM_KEY',
        'chat_completions',
        modelsUrl,
        keyUrl,
        '',
        '否',
        'safe-model'
      ].join('\n') + '\n',
      { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
      dir
    );
    const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /base-user-marker|base-pass-marker|base-query-marker|base-fragment-marker|models-user-marker|models-pass-marker|models-query-marker|models-fragment-marker|key-user-marker|key-pass-marker|key-query-marker|key-fragment-marker/
    );
    assert.match(result.stdout, /https:\/\/example\.test\/v1\/models/);
    assert.match(result.stdout, /https:\/\/example\.test\/keys/);
    assert.match(config, /models-query-marker/);
    assert.match(config, /base-query-marker/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('custom setup never displays a malformed URL value', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-invalid-url-redaction-'));
  try {
    const result = await runCli(
      ['setup'],
      [
        'custom',
        'https://example.test/v1',
        'invalid-custom',
        'Invalid Custom',
        'INVALID_CUSTOM_KEY',
        'chat_completions',
        'malformed-models-url-secret-marker',
        '',
        '',
        '否',
        'safe-model'
      ].join('\n') + '\n',
      { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
      dir
    );

    assert.equal(result.code, 0);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /malformed-models-url-secret-marker/);
    assert.match(result.stdout, /\[invalid URL\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('safe URL display does not alter the model-list request target', async () => {
  const modelsUrl = 'https://example.test/v1/models?api_key=request-query-marker#request-fragment-marker';
  let requestedUrl = null;

  await fetchProviderModels({
    provider: { models_url: modelsUrl, timeout_ms: 1000 },
    fetchImpl: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
  });

  assert.equal(requestedUrl, modelsUrl);
});

test('TTY setup masks the API key and restores raw mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-setup-tty-secret-'));
  const oldCwd = process.cwd();
  const input = new PassThrough();
  input.isTTY = true;
  const rawModes = [];
  input.setRawMode = (value) => {
    rawModes.push(value);
    return input;
  };
  let stdout = '';
  const prompts = [
    { pattern: /Choose provider number or id|请选择服务商/, text: 'deepseek\n' },
    { pattern: /DEEPSEEK_API_KEY/, text: 'secret-value\n' },
    { pattern: /Fetch model list|获取模型列表/, text: '否\n' },
    { pattern: /Model name|模型名称/, text: '\n' },
    { pattern: /Save this API key|保存 API Key/, text: '否\n', end: true }
  ];
  let promptIndex = 0;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      const next = prompts[promptIndex];
      if (next && next.pattern.test(stdout)) {
        promptIndex += 1;
        setImmediate(() => next.end ? input.end(next.text) : input.write(next.text));
      }
      callback();
    }
  });
  output.isTTY = true;

  try {
    process.chdir(dir);
    await runModelSetupWizard({
      streams: { input, output, error: new PassThrough() },
      fetchImpl: async () => {
        throw new Error('model list must not be fetched');
      }
    });

    assert.equal(promptIndex, prompts.length);
    assert.doesNotMatch(stdout, /secret-value/);
    assert.match(stdout, /\*{4,}/);
    assert.deepEqual(rawModes, [true, false]);
  } finally {
    process.chdir(oldCwd);
    input.destroy();
    await rm(dir, { recursive: true, force: true });
  }
});

test('TTY secret entry restores raw mode after Ctrl-C', async () => {
  const result = await runTtySecretInterruption('interrupt');

  await assert.rejects(result.promise, /setup cancelled/);
  assert.equal(result.rawModes.at(-1), false);
  await result.cleanup();
});

test('TTY secret entry restores raw mode after EOF', async () => {
  const result = await runTtySecretInterruption('eof');

  await result.promise;
  assert.equal(result.rawModes.at(-1), false);
  await result.cleanup();
});

test('TTY secret entry restores raw mode when enabling raw mode throws', async () => {
  const result = await runTtySecretInterruption('raw-error');

  await assert.rejects(result.promise, /raw mode failed/);
  assert.deepEqual(result.rawModes, [true, false]);
  await result.cleanup();
});

test('doctor distinguishes local checks from online provider health', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-doctor-local-'));
  try {
    const local = await runCli(
      ['doctor'],
      '',
      { HOME: dir, USERPROFILE: dir, NPLAN_HOME: '', NPLAN_MODEL: '' },
      dir
    );
    assert.equal(local.code, 0);
    assert.match(local.stdout, /未配置/);
    assert.match(local.stdout, /未测试联网/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  await withHealthServer(async ({ configPath, requests, cwd, env }) => {
    const configuredLocal = await runCli(['doctor', '--config-path', configPath], '', env, cwd);
    assert.equal(configuredLocal.code, 0);
    assert.match(configuredLocal.stdout, /API Key：已配置/);
    assert.match(configuredLocal.stdout, /云端上下文授权：未保存/);
    assert.match(configuredLocal.stdout, /未测试联网/);
    assert.equal(requests.length, 0);

    const online = await runCli(['doctor', '--online', '--config-path', configPath], '', env, cwd);

    assert.equal(online.code, 0);
    assert.match(online.stdout, /连接正常/);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/models$/);
    assert.equal(requests.some((item) => item.url.endsWith('/chat/completions')), false);
    assert.equal(requests.some((item) => item.url.endsWith('/responses')), false);
  });
});

test('doctor distinguishes a missing API key and makes no online request', async () => {
  await withHealthServer(async ({ configPath, requests, cwd }) => {
    const local = await runCli(
      ['doctor', '--config-path', configPath],
      '',
      { FAKE_MODEL_KEY: '' },
      cwd
    );
    assert.equal(local.code, 0);
    assert.match(local.stdout, /API Key：缺失/);
    assert.match(local.stdout, /nplan setup/);
    assert.equal(requests.length, 0);

    const online = await runCli(
      ['doctor', '--online', '--config-path', configPath],
      '',
      { FAKE_MODEL_KEY: '' },
      cwd
    );
    assert.equal(online.code, 1);
    assert.match(online.stdout, /API Key：缺失/);
    assert.equal(requests.length, 0);
  });
});

test('online doctor classifies failures without leaking provider response secrets', async () => {
  await withHealthServer(async ({ configPath, cwd, env }, response) => {
    response.status = 401;
    response.body = JSON.stringify({ error: 'provider-response-secret' });
    const result = await runCli(['doctor', '--online', '--config-path', configPath], '', env, cwd);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /API Key/);
    assert.match(result.stdout, /下一步/);
    assert.doesNotMatch(result.stdout, /provider-response-secret/);
    assert.doesNotMatch(result.stdout, /secret/);
  });
});

test('online doctor classifies a models endpoint timeout', async () => {
  await withHealthServer(async ({ configPath, cwd, env }, response) => {
    response.delayMs = 100;
    const result = await runCli([
      'doctor',
      '--online',
      '--config-path',
      configPath,
      '--config',
      'model_providers.cloudtest.timeout_ms=30'
    ], '', env, cwd);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /响应超时/);
    assert.match(result.stdout, /下一步/);
  });
});

test('doctor reports an invalid provider address without exposing its query secret', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-doctor-invalid-url-'));
  const configPath = join(dir, 'config.toml');
  await writeFile(configPath, [
    'model = "test-model"',
    'model_provider = "broken"',
    '[model_providers.broken]',
    'base_url = "not-a-url?api_key=query-secret"',
    'wire_api = "chat_completions"'
  ].join('\n'), 'utf8');
  try {
    const result = await runCli(['doctor', '--config-path', configPath], '', {}, dir);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Provider 地址：无效/);
    assert.match(result.stdout, /下一步/);
    assert.doesNotMatch(result.stdout, /query-secret|api_key=/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

for (const unsafePath of [
  '/v1/chat/completions',
  '/v1/chat/completions/models',
  '/v1/responses',
  '/v1/responses?api_key=doctor-query-secret#doctor-fragment-secret'
]) {
  test(`online doctor rejects unsafe health target ${unsafePath} before fetch`, async () => {
    await withHealthServer(async ({ configPath, requests, cwd, env }) => {
      const result = await runCli(['doctor', '--online', '--config-path', configPath], '', env, cwd);

      assert.equal(result.code, 1);
      assert.equal(requests.length, 0);
      assert.match(result.stdout, /健康检查地址不安全/);
      assert.match(result.stdout, /下一步/);
      assert.doesNotMatch(
        result.stdout,
        /chat\/completions|responses|doctor-query-secret|doctor-fragment-secret/
      );
    }, { modelsPath: unsafePath });
  });
}

for (const encodedUnsafePath of [
  '/v1/chat%2Fcompletions/models',
  '/v1/chat%5Ccompletions/models',
  '/v1/chat%252Fcompletions/models',
  '/v1/chat%255Ccompletions/models',
  '/v1/chat%25252Fcompletions/models',
  '/v1/chat%25255Ccompletions/models',
  '/v1/ChAt%252fCoMpLeTiOnS/models',
  '/v1/%E0%A4%A/models',
  '/v1/%ZZ/models'
]) {
  test(`online doctor rejects encoded health-target bypass ${encodedUnsafePath} before fetch`, async () => {
    await withHealthServer(async ({ configPath, requests, cwd, env }) => {
      const result = await runCli(['doctor', '--online', '--config-path', configPath], '', env, cwd);

      assert.equal(result.code, 1);
      assert.equal(requests.length, 0);
      assert.match(result.stdout, /健康检查地址不安全/);
      assert.match(result.stdout, /下一步/);
      assert.doesNotMatch(result.stdout, /chat|completions|%2f|%5c|%25/i);
    }, { modelsPath: encodedUnsafePath });
  });
}

test('online doctor preserves legal percent-encoded non-separator path segments', async () => {
  const modelsPath = '/v1/%E9%A1%B9%E7%9B%AE/models';
  await withHealthServer(async ({ configPath, requests, cwd, env }) => {
    const result = await runCli(['doctor', '--online', '--config-path', configPath], '', env, cwd);

    assert.equal(result.code, 0);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /%E9%A1%B9%E7%9B%AE\/models/i);
    assert.match(result.stdout, /连接正常/);
  }, { modelsPath });
});

test('print mode formats provider failures without exposing response secrets', async () => {
  await withFailingModelServer(async ({ configPath, cwd, env }) => {
    const result = await runCli(
      ['--config-path', configPath, '--print', '规划一个安全诊断'],
      '',
      env,
      cwd
    );

    assert.equal(result.code, 1);
    assert.match(result.stderr, /API Key/);
    assert.match(result.stderr, /下一步/);
    assert.doesNotMatch(result.stderr, /response-secret|query-secret|FAKE_MODEL_KEY/);
  });
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

async function withHealthServer(fn, { modelsPath = '/v1/models' } = {}) {
  const requests = [];
  const responseControl = {
    status: 200,
    body: JSON.stringify({ data: [{ id: 'semantic-test-model' }] }),
    delayMs: 0
  };
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method });
    if (!request.url.endsWith('/models')) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'doctor must only call /models' }));
      return;
    }
    const send = () => {
      response.writeHead(responseControl.status, { 'content-type': 'application/json' });
      response.end(responseControl.body);
    };
    if (responseControl.delayMs) setTimeout(send, responseControl.delayMs);
    else send();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const cwd = await mkdtemp(join(tmpdir(), 'nplan-doctor-online-'));
  const configPath = join(cwd, 'config.toml');
  await writeFile(configPath, [
    'model = "semantic-test-model"',
    'model_provider = "cloudtest"',
    '[model_providers.cloudtest]',
    `base_url = "http://127.0.0.1:${port}/v1"`,
    `models_url = "http://127.0.0.1:${port}${modelsPath}"`,
    'context_location = "cloud"',
    'env_key = "FAKE_MODEL_KEY"',
    'wire_api = "chat_completions"',
    'timeout_ms = 1000'
  ].join('\n'), 'utf8');
  try {
    return await fn(
      { configPath, requests, cwd, env: { FAKE_MODEL_KEY: 'secret' } },
      responseControl
    );
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
}

async function withFailingModelServer(fn) {
  const server = createServer((_request, response) => {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'response-secret' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const cwd = await mkdtemp(join(tmpdir(), 'nplan-model-error-'));
  const configPath = join(cwd, 'config.toml');
  await writeFile(configPath, [
    'model = "semantic-test-model"',
    'model_provider = "localtest"',
    '[model_providers.localtest]',
    `base_url = "http://127.0.0.1:${port}/v1"`,
    'context_location = "local"',
    'env_key = "FAKE_MODEL_KEY"',
    'wire_api = "chat_completions"',
    'request_max_retries = 0'
  ].join('\n'), 'utf8');
  try {
    return await fn({ configPath, cwd, env: { FAKE_MODEL_KEY: 'query-secret' } });
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
}

async function runTtySecretInterruption(mode) {
  const cwd = await mkdtemp(join(tmpdir(), `nplan-secret-${mode}-`));
  const oldCwd = process.cwd();
  process.chdir(cwd);
  const input = new PassThrough();
  input.isTTY = true;
  const rawModes = [];
  input.setRawMode = (value) => {
    rawModes.push(value);
    if (mode === 'raw-error' && value) throw new Error('raw mode failed');
    return input;
  };
  let providerSent = false;
  let secretSent = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString();
      if (!providerSent && /Choose provider number or id|请选择服务商/.test(text)) {
        providerSent = true;
        setImmediate(() => input.write('deepseek\n'));
      } else if (!secretSent && /DEEPSEEK_API_KEY SK\/API key/.test(text)) {
        secretSent = true;
        setImmediate(() => {
          if (mode === 'interrupt') input.write('\u0003');
          else if (mode === 'eof') input.end();
        });
      }
      callback();
    }
  });
  output.isTTY = true;
  const promise = runModelSetupWizard({
    streams: { input, output, error: new PassThrough() },
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  return {
    promise,
    rawModes,
    async cleanup() {
      input.destroy();
      process.chdir(oldCwd);
      await rm(cwd, { recursive: true, force: true });
    }
  };
}

function runtimeForConfig(configPath, env) {
  const config = loadModelConfig.sync({
    configPath,
    env: { ...process.env, ...env }
  });
  const modelClient = new OpenAICompatiblePlanningModel({ config });
  return {
    config,
    modelClient,
    agent: new LocalPlanningAgent({ modelClient })
  };
}

async function saveMatchingConsent({ configPath, cwd, env, request }) {
  const runtime = runtimeForConfig(configPath, env);
  const prepared = runtime.agent.prepare(request, { root: cwd });
  const scope = buildConsentScope(
    runtime.modelClient.provider,
    prepared.context.context_policy,
    prepared.context.context_policy.user_exclusions
  );
  return saveConsent(cwd, scope);
}

function modelUserPrompt(body) {
  const content = body?.messages?.[1]?.content;
  return JSON.parse(content).request || '';
}

async function withModelServer(fn, taskSpecDraft = defaultTaskSpecDraft()) {
  return withDraftModelServer(fn, { taskSpecDraft });
}

async function withDraftModelServer(fn, {
  taskSpecDraft = defaultTaskSpecDraft(),
  providerId = 'localtest',
  contextLocation = 'local'
} = {}) {
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
      `model_provider = "${providerId}"`,
      `[model_providers.${providerId}]`,
      `base_url = "http://127.0.0.1:${port}/v1"`,
      'env_key = "FAKE_MODEL_KEY"',
      `context_location = "${contextLocation}"`,
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

const withLocalModelServer = (fn) => withDraftModelServer(fn);
const withCloudModelServer = (fn) => withDraftModelServer(fn, {
  providerId: 'cloudtest',
  contextLocation: 'cloud'
});

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
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  Object.defineProperty(stream, 'text', { get: () => text });
  return stream;
}
