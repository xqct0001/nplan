#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalPlanningAgent } from './agent.js';
import { message, normalizeSlashCommand, resolveLocale } from './i18n.js';
import { OpenAICompatiblePlanningModel } from './model-client.js';
import { loadModelConfig, parseConfigOverrides } from './model-config.js';
import { initHint, renderProviderList, writeProjectModelConfig } from './model-init.js';
import { runModelSetupWizard } from './model-wizard.js';
import {
  defaultWorkPlanExportPath,
  deriveWorkPlan,
  renderWorkPlanMarkdown,
  renderWorkPlanSources,
  renderWorkPlanTodo
} from './work-plan.js';

const APP_NAME = 'NPlan';
const BIN_NAME = 'nplan';
const SETUP_COMMAND = 'nplan setup';
const SESSION_STORE_VERSION = '1.0';
const OUTPUT_FORMATS = new Set(['json', 'summary', 'text']);
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const COMMANDS = new Set(['doctor', 'exec', 'init', 'providers', 'resume', 'setup']);

const HELP_EN = `Usage: ${BIN_NAME} [options] [prompt]

Commands:
  exec [options] [prompt]
                    Print one planning result and exit
  setup             Guided provider/API key/model setup wizard
  providers         List built-in model providers
  resume [id]       Resume a saved planning session
  doctor            Check local CLI configuration

Options:
  -p, --print       Print one JSON result and exit
  --output-format <json|summary|text>
                    Select print-mode output format (default: json)
  --input-format text
                    Accept text input from argv or stdin
  -c, --continue    Continue the latest local planning session
  -r, --resume [id] Resume a saved planning session
  --model <name>    Use a model for semantic task understanding
  --provider <id>   Select model provider (run "${BIN_NAME} providers")
  --models-url <u>  Model list URL for guided/custom provider setup
  --config-path <p> Load model config TOML
  --config key=value
                    Override config, supports dotted keys
  --lang <zh-CN|en> Select interface language (default: zh-CN)
  -V, --version     Show version
  -h, --help        Show this help

Interactive commands:
  /help             Show commands
  /providers        List built-in model providers
  /status           Show session status
  /config, /settings
                    Show active model configuration
  /model [name]     Show or switch the in-memory model for this session
  /context          Show the last context curation summary
  /sources         Show source and evidence details for the last result
  /todo            Show the action steps for the last result
  /revise <text>   Replan using the last result plus additional context
  /export [path]   Export the last plan as Obsidian-friendly Markdown
  /plan <prompt>    Analyze a prompt and show a planning summary
  /json             Print the last full JSON result
  /compact [note]   Compact saved planning session notes
  /clear, /reset, /new
                    Clear the last result and start a new session
  /continue         Continue the latest saved session
  /resume [id]      Resume a saved session
  /exit, /quit      Exit the session

Notes:
  Type a task directly in interactive mode; it behaves like /plan <prompt>.
  Interactive mode shows a concise planning summary. Use -p or /json for full JSON.
  First interactive launch with no configured model starts setup automatically.
  Use --config key=value for config overrides. The legacy "-c key=value" form still works.
  Shell execution with ! is intentionally unsupported.`;

const HELP_ZH = `用法：${BIN_NAME} [选项] [任务]

命令：
  exec [选项] [任务]      输出一次规划结果后退出
  setup                  配置服务商、API Key 和模型
  providers              查看内置模型服务商
  resume [会话编号]      恢复已保存的规划会话
  doctor                 检查本地配置

选项：
  -p, --print            输出一次结果后退出（默认 JSON）
  --output-format <json|summary|text>
                         设置输出格式
  --input-format text    从参数或标准输入读取文本
  -c, --continue         继续最近的会话
  -r, --resume [编号]    恢复指定或最近的会话
  --model <名称>         指定模型
  --provider <编号>      指定模型服务商
  --models-url <地址>    指定模型列表地址
  --config-path <路径>   读取指定配置文件
  --config key=value     临时覆盖配置
  --lang <zh-CN|en>      设置界面语言（默认：简体中文）
  -V, --version          显示版本
  -h, --help             显示帮助

交互命令：
  /帮助                  查看命令
  /服务商                查看内置模型服务商
  /状态                  查看会话状态
  /配置，/设置           查看当前模型配置
  /模型 [名称]           查看或切换本次会话的模型
  /上下文                查看上次上下文摘要
  /来源                  查看上次规划使用的来源
  /步骤                  查看上次规划的行动步骤
  /修改 <补充说明>       根据补充说明重新规划
  /导出 [路径]           导出 Markdown 工作计划
  /规划 <任务>           规划一项任务
  /完整                  查看上次完整 JSON 结果
  /压缩 [备注]           压缩会话摘要
  /清除，/重置，/新建    开始新会话
  /继续                  继续最近的会话
  /恢复 [会话编号]       恢复指定或最近的会话
  /退出，/结束           退出

说明：
  直接输入任务即可开始规划；NPlan 只生成计划，不执行任务。
  英文命令仍可使用。完整结构化结果请使用 -p 或 /完整。`;

function renderHelp(locale) {
  return resolveLocale(locale) === 'en' ? HELP_EN : HELP_ZH;
}

export async function main(argv = process.argv.slice(2), streams = { input, output, error: process.stderr }) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    streams.error.write(`${error.message}\n`);
    return 1;
  }
  if (parsed.help) {
    streams.output.write(`${renderHelp(parsed.locale)}\n`);
    return 0;
  }
  if (parsed.version) {
    streams.output.write(`${BIN_NAME} ${PACKAGE_VERSION}\n`);
    return 0;
  }
  if (parsed.command === 'doctor') {
    streams.output.write(`${renderDoctor()}\n`);
    return 0;
  }
  if (parsed.command === 'providers') {
    streams.output.write(`${renderProviderList()}\n`);
    return 0;
  }
  if (parsed.command === 'setup') {
    try {
      await runModelSetupWizard({ streams });
      return 0;
    } catch (error) {
      streams.error.write(`setup failed: ${error.message}\n`);
      return 1;
    }
  }
  if (parsed.command === 'init') {
    try {
      if (!parsed.initHasExplicitConfig) {
        throw new Error(`use "${SETUP_COMMAND}" for guided setup`);
      }
      streams.output.write(`${initHint(writeConfigFromArgs(parsed))}\n`);
      return 0;
    } catch (error) {
      streams.error.write(`init failed: ${error.message}\n`);
      return 1;
    }
  }

  let runtime;
  let runtimeError = null;
  try {
    runtime = makeRuntime(parsed);
  } catch (error) {
    if (parsed.print || !isModelConfigError(error)) {
      streams.error.write(`${error.message}\n`);
      return 1;
    }
    runtime = null;
    runtimeError = error.message;
  }
  if (!runtime && shouldRunInitialSetup({ parsed, streams, runtimeError })) {
    try {
      streams.output.write('No model is configured yet. Starting first-run setup.\n\n');
      await runModelSetupWizard({ streams });
      runtime = makeRuntime(parsed);
      runtimeError = null;
    } catch (error) {
      streams.error.write(`setup failed: ${error.message}\n`);
      return 1;
    }
  }
  if (parsed.print) {
    const stdinText = await readAll(streams.input);
    const prompt = promptWithStdin(parsed.prompt, stdinText);
    if (!prompt) {
      streams.error.write(`Usage: ${BIN_NAME} -p "<prompt>"\n`);
      return 1;
    }
    let session = null;
    try {
      session = parsed.continueSession || parsed.resumeSessionId ? prepareSession(parsed).session : null;
    } catch (error) {
      streams.error.write(`${error.message}\n`);
      return 1;
    }
    try {
      const result = await runtime.agent.analyzeAsync(prompt, contextForSession(session));
      const warning = recordSessionTurn(session, prompt, result);
      if (warning) streams.error.write(`${warning}\n`);
      streams.output.write(`${renderPrintResult(result, parsed.outputFormat, parsed.locale)}\n`);
      return 0;
    } catch (error) {
      streams.error.write(`analysis failed: ${error.message}\n`);
      return 1;
    }
  }

  let sessionInfo;
  try {
    sessionInfo = prepareSession(parsed);
  } catch (error) {
    streams.error.write(`${error.message}\n`);
    return 1;
  }
  await runInteractive({ runtime, runtimeError, initialPrompt: parsed.prompt, streams, locale: parsed.locale, ...sessionInfo });
  return 0;
}

export function parseArgs(argv) {
  const values = [...argv];
  let print = false;
  let help = false;
  let version = false;
  let configPath = null;
  let command = null;
  const configValues = [];
  const promptParts = [];
  let initHasExplicitConfig = false;
  let continueSession = false;
  let resumeSessionId = null;
  let outputFormat = 'json';
  let inputFormat = 'text';
  let locale = resolveLocale();

  if (COMMANDS.has(values[0])) {
    command = values.shift();
  }

  if (command === 'exec') print = true;
  if (command === 'resume') {
    continueSession = true;
    if (values.length && looksLikeSessionId(values[0])) {
      resumeSessionId = values.shift();
    }
  }

  while (values.length) {
    const value = values.shift();
    if (value === '-p' || value === '--print') {
      print = true;
    } else if (value === '--output-format') {
      outputFormat = requireValue(value, values);
      if (!OUTPUT_FORMATS.has(outputFormat)) {
        throw new Error(`unsupported output format: ${outputFormat}`);
      }
    } else if (value === '--input-format') {
      inputFormat = requireValue(value, values);
      if (inputFormat !== 'text') throw new Error('only --input-format text is supported');
    } else if (value === '-c') {
      if (values.length && looksLikeConfigOverride(values[0])) {
        initHasExplicitConfig = true;
        configValues.push(values.shift());
      } else {
        continueSession = true;
      }
    } else if (value === '--continue') {
      continueSession = true;
    } else if (value === '-r' || value === '--resume') {
      continueSession = true;
      if (values.length && looksLikeSessionId(values[0])) resumeSessionId = values.shift();
    } else if (value === '--wizard' || value === '--guided') {
      throw new Error(`use "${SETUP_COMMAND}" for guided setup`);
    } else if (value === '--no-model') {
      throw new Error('--no-model is not supported; configure a model instead');
    } else if (isUnsupportedClaudeToolOption(value)) {
      throw new Error(`${value} is not supported; NPlan is planning-only and does not run tools`);
    } else if (value === '--model') {
      initHasExplicitConfig = true;
      configValues.push(`model=${requireValue(value, values)}`);
    } else if (value === '--provider' || value === '--model-provider') {
      initHasExplicitConfig = true;
      configValues.push(`model_provider=${requireValue(value, values)}`);
    } else if (value === '--base-url') {
      initHasExplicitConfig = true;
      const provider = currentProvider(configValues) || 'custom';
      configValues.push(`model_provider=${provider}`);
      configValues.push(`model_providers.${provider}.base_url=${requireValue(value, values)}`);
    } else if (value === '--wire-api') {
      initHasExplicitConfig = true;
      const provider = currentProvider(configValues) || 'custom';
      configValues.push(`model_provider=${provider}`);
      configValues.push(`model_providers.${provider}.wire_api=${requireValue(value, values)}`);
    } else if (value === '--models-url' || value === '--model-list-url') {
      initHasExplicitConfig = true;
      const provider = currentProvider(configValues) || 'custom';
      configValues.push(`model_provider=${provider}`);
      configValues.push(`model_providers.${provider}.models_url=${requireValue(value, values)}`);
    } else if (value === '--config-path') {
      configPath = requireValue(value, values);
    } else if (value === '--config') {
      initHasExplicitConfig = true;
      configValues.push(requireValue(value, values));
    } else if (value === '--lang') {
      locale = resolveLocale(requireValue(value, values));
    } else if (value === '-V' || value === '--version') {
      version = true;
    } else if (value === '-h' || value === '--help') {
      help = true;
    } else {
      promptParts.push(value);
    }
  }

  return {
    print,
    help,
    version,
    command,
    initHasExplicitConfig,
    configPath,
    configOverrides: parseConfigOverrides(configValues),
    prompt: promptParts.join(' ').trim(),
    continueSession,
    resumeSessionId,
    outputFormat,
    inputFormat,
    locale
  };
}

async function runInteractive({
  runtime,
  runtimeError = null,
  initialPrompt,
  streams,
  session,
  locale = 'zh-CN',
  sessionNotice = null
}) {
  const state = { lastResult: null, lastWorkPlan: null, requests: 0, runtime, runtimeError, session, locale };
  const labelSeparator = locale === 'en' ? ': ' : '：';
  streams.output.write(`${message(locale, 'startup.title')}\n`);
  streams.output.write(`${message(locale, 'startup.cwd')}${labelSeparator}${process.cwd()}\n`);
  streams.output.write(`${message(locale, 'startup.session')}${labelSeparator}${session.id}\n`);
  if (sessionNotice) streams.output.write(`${sessionNotice}\n`);
  streams.output.write(`${runtimeSummary(state)}\n`);
  streams.output.write(`${message(locale, 'startup.hint')}\n`);

  if (initialPrompt) {
    await analyzeAndRender(initialPrompt, { state, streams });
  }

  const rl = readline.createInterface({
    input: streams.input,
    output: streams.output,
    prompt: `${BIN_NAME}> `,
    terminal: Boolean(streams.input.isTTY && streams.output.isTTY)
  });
  let closed = false;
  const requestExit = () => {
    if (closed) return;
    streams.output.write(`\n${message(locale, 'startup.bye')}\n`);
    rl.close();
  };
  const onProcessInterrupt = () => {
    requestExit();
  };
  rl.on('close', () => {
    closed = true;
    process.off('SIGINT', onProcessInterrupt);
    releaseInteractiveInput(streams.input);
  });
  rl.on('SIGINT', requestExit);
  process.once('SIGINT', onProcessInterrupt);

  rl.prompt();
  for await (const rawLine of rl) {
    const shouldExit = await handleInteractiveLine(rawLine.trim(), { state, streams });
    if (shouldExit) {
      rl.close();
      break;
    }
    if (!closed) rl.prompt();
  }
}

async function handleInteractiveLine(line, { state, streams }) {
  if (!line) return false;
  line = normalizeSlashCommand(line);
  const slash = parseSlashLine(line);
  if (line === '/exit' || line === '/quit') {
    streams.output.write(`${message(state.locale, 'startup.bye')}\n`);
    return true;
  }
  if (line === '/help' || line === '/?') {
    streams.output.write(`${renderHelp(state.locale)}\n`);
    return false;
  }
  if (line === '/providers') {
    streams.output.write(`${renderProviderList()}\n`);
    return false;
  }
  if (line === '/status') {
    streams.output.write(`${renderStatus(state)}\n`);
    return false;
  }
  if (line === '/config' || line === '/settings') {
    streams.output.write(`${renderConfig(state)}\n`);
    return false;
  }
  if (line === '/context') {
    streams.output.write(`${renderContextStatus(state.lastResult)}\n`);
    return false;
  }
  if (line === '/sources') {
    streams.output.write(`${renderWorkPlanSources(state.lastWorkPlan)}\n`);
    return false;
  }
  if (line === '/todo') {
    streams.output.write(`${renderWorkPlanTodo(state.lastWorkPlan)}\n`);
    return false;
  }
  if (slash.command === '/revise') {
    const revision = slash.arg;
    if (!revision) {
      streams.output.write(`${message(state.locale, 'error.reviseUsage')}\n`);
      return false;
    }
    if (!state.lastResult) {
      streams.output.write('No previous plan yet; planning from this text.\n');
    }
    const prompt = revisionPrompt(state.lastResult, revision);
    streams.output.write('revised plan:\n');
    await analyzeAndRender(prompt, { state, streams });
    return false;
  }
  if (slash.command === '/export') {
    const message = handleExportCommand(slash.arg, state);
    streams.output.write(`${message}\n`);
    return false;
  }
  if (slash.command === '/model') {
    streams.output.write(`${handleModelCommand(slash.arg, state)}\n`);
    return false;
  }
  if (slash.command === '/compact') {
    streams.output.write(`${handleCompactCommand(slash.arg, state)}\n`);
    return false;
  }
  if (line === '/clear' || line === '/reset' || line === '/new') {
    state.lastResult = null;
    state.lastWorkPlan = null;
    state.session = createSession();
    streams.output.write(`cleared. New session: ${state.session.id}\n`);
    return false;
  }
  if (slash.command === '/resume') {
    const loaded = loadSessionById(slash.arg || 'latest');
    if (!loaded) {
      streams.output.write('No saved session found.\n');
    } else {
      state.lastResult = null;
      state.lastWorkPlan = null;
      state.session = loaded;
      streams.output.write(`resumed session ${loaded.id} (${loaded.turns.length} turns)\n`);
    }
    return false;
  }
  if (line === '/continue') {
    const loaded = loadLatestSession();
    if (!loaded) {
      streams.output.write(`No saved session found. Current session: ${state.session.id}\n`);
    } else {
      state.lastResult = null;
      state.lastWorkPlan = null;
      state.session = loaded;
      streams.output.write(`continuing session ${loaded.id} (${loaded.turns.length} turns)\n`);
    }
    return false;
  }
  if (line === '/json') {
    streams.output.write(
      state.lastResult ? `${JSON.stringify(state.lastResult, null, 2)}\n` : `${message(state.locale, 'error.noResult')}\n`
    );
    return false;
  }
  if (line.startsWith('!')) {
    streams.output.write('Shell execution is not available in NPlan; describe the task instead.\n');
    return false;
  }
  if (line === '/init' || line.startsWith('/init ')) {
    streams.output.write(`Model setup is available as ${SETUP_COMMAND} in your shell.\n`);
    return false;
  }
  if (line === '/permissions' || line.startsWith('/permissions ')) {
    streams.output.write('No tool permissions are available because NPlan only creates plans.\n');
    return false;
  }
  if (line.startsWith('/') && !line.startsWith('/plan ')) {
    streams.output.write(`${message(state.locale, 'error.unknownCommand')}\n`);
    return false;
  }

  const prompt = line.startsWith('/plan ') ? line.slice('/plan '.length).trim() : line;
  if (!prompt) {
    streams.output.write(`${message(state.locale, 'error.planUsage')}\n`);
    return false;
  }

  await analyzeAndRender(prompt, { state, streams });
  return false;
}

async function analyzeAndRender(prompt, { state, streams }) {
  if (!state.runtime) {
    streams.output.write(`${setupRequiredMessage(state.runtimeError, state.locale)}\n`);
    return;
  }
  try {
    state.lastResult = await state.runtime.agent.analyzeAsync(prompt, contextForSession(state.session));
    state.lastWorkPlan = deriveWorkPlan(state.lastResult, { sessionId: state.session.id, locale: state.locale });
    state.requests += 1;
    const warning = recordSessionTurn(state.session, prompt, state.lastResult);
    streams.output.write(`${renderInteractiveResult(state.lastResult, { workPlan: state.lastWorkPlan, locale: state.locale })}\n`);
    if (warning) streams.output.write(`${warning}\n`);
  } catch (error) {
    streams.output.write(`${message(state.locale, 'error.analysisFailed', { detail: error.message })}\n`);
  }
}

function renderPrintResult(result, outputFormat = 'json', locale = 'zh-CN') {
  if (outputFormat === 'summary' || outputFormat === 'text') {
    return renderInteractiveResult(result, { locale });
  }
  return JSON.stringify(result, null, 2);
}

export function renderInteractiveResult(result, options = {}) {
  const locale = resolveLocale(options.locale);
  const workPlan = options.workPlan || deriveWorkPlan(result, { locale });
  const lines = [];

  if (result?.status === 'needs_clarification') {
    lines.push(message(locale, 'result.questions'));
    appendList(lines, workPlan.questions, message(locale, 'result.none'));
    lines.push('', message(locale, 'result.next'));
    appendList(lines, workPlan.next_actions, message(locale, 'result.none'));
    return lines.join('\n');
  }

  lines.push(message(locale, 'result.conclusion'));
  lines.push(workPlan.conclusion || message(locale, 'result.none'));

  if (workPlan.steps.length) {
    lines.push('', message(locale, 'result.steps'));
    workPlan.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step.title}`);
      if (step.acceptance.length) {
        const separator = locale === 'en' ? ': ' : '：';
        lines.push(`   ${message(locale, 'result.stepAcceptance')}${separator}${step.acceptance.join(locale === 'en' ? '; ' : '；')}`);
      }
    });
  }

  if (workPlan.acceptance.length) {
    lines.push('', message(locale, 'result.acceptance'));
    appendList(lines, workPlan.acceptance, message(locale, 'result.none'));
  }

  const issues = reportIssues(result);
  if (issues.length) {
    lines.push('', message(locale, 'result.issues'));
    appendList(lines, issues, message(locale, 'result.none'));
  }

  lines.push('', message(locale, 'result.next'));
  appendList(lines, workPlan.next_actions, message(locale, 'result.none'));
  return lines.join('\n');
}

function appendList(lines, items, emptyLabel) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) lines.push(`- ${emptyLabel}`);
  else values.forEach((item) => lines.push(`- ${item}`));
}

function reportIssues(result) {
  const issues = [];
  for (const issue of result.taskspec_report?.conflicts || []) issues.push(`TaskSpec: ${issue}`);
  for (const issue of result.taskplan_report?.coverage_gaps || []) issues.push(`TaskPlan missing: ${issue}`);
  for (const issue of result.taskplan_report?.policy_errors || []) issues.push(`TaskPlan policy: ${issue}`);
  if (result.taskplan_report?.cycle_detected) issues.push('TaskPlan contains a dependency cycle');
  return issues;
}

function makeRuntime(parsed) {
  const config = loadModelConfig.sync({
    configPath: parsed.configPath,
    overrides: parsed.configOverrides
  });
  if (!config.model) {
    throw new Error(`model configuration is required. Run "${SETUP_COMMAND}".`);
  }
  return {
    agent: new LocalPlanningAgent({
      modelClient: new OpenAICompatiblePlanningModel({ config })
    }),
    config
  };
}

function runtimeSummary(state) {
  if (!state.runtime) {
    return state.locale === 'en'
      ? `model: not configured\n${setupRequiredMessage(state.runtimeError, 'en')}`
      : `模型：未配置\n${setupRequiredMessage(state.runtimeError, 'zh-CN')}`;
  }
  return state.locale === 'en'
    ? `model: ${state.runtime.config.model_provider}/${state.runtime.config.model}`
    : `模型：${state.runtime.config.model_provider}/${state.runtime.config.model}`;
}

function runtimeStatus(state) {
  return state.runtime
    ? `model=${state.runtime.config.model_provider}/${state.runtime.config.model}`
    : 'model=not_configured';
}

function renderStatus(state) {
  return [
    `status: requests=${state.requests}`,
    `last=${state.lastResult?.status || 'none'}`,
    `session=${state.session.id}`,
    `turns=${state.session.turns.length}`,
    runtimeStatus(state)
  ].join(' ');
}

function renderConfig(state) {
  if (!state.runtime) return runtimeSummary(state);
  const provider = state.runtime.config.model_provider;
  const model = state.runtime.config.model;
  return [
    `model: ${provider}/${model}`,
    `setup: ${SETUP_COMMAND}`,
    'config overrides: --config key=value'
  ].join('\n');
}

function renderContextStatus(result) {
  if (!result) return 'No context summary yet. Run /plan <prompt> first.';
  const report = result.taskspec?.context_report || {};
  const warnings = Array.isArray(report.warnings) && report.warnings.length
    ? ` warnings=${report.warnings.join(',')}`
    : '';
  return [
    `context: sources=${report.source_count || 0} evidence=${report.evidence_count || 0}`,
    `dropped=${report.dropped_source_count || 0}${warnings}`
  ].join(' ');
}

function handleModelCommand(arg, state) {
  const nextModel = String(arg || '').trim();
  if (!nextModel) return state.runtime ? `model: ${state.runtime.config.model_provider}/${state.runtime.config.model}` : runtimeSummary(state);
  if (!state.runtime) return setupRequiredMessage(state.runtimeError, state.locale);
  state.runtime.config = { ...state.runtime.config, model: nextModel };
  state.runtime.agent = new LocalPlanningAgent({
    modelClient: new OpenAICompatiblePlanningModel({ config: state.runtime.config })
  });
  return `model: ${state.runtime.config.model_provider}/${state.runtime.config.model}`;
}

function handleCompactCommand(arg, state) {
  if (!state.session.turns.length) return 'Nothing to compact yet.';
  try {
    compactSession(state.session, arg);
    return `compacted session ${state.session.id}`;
  } catch (error) {
    return `compact failed: ${error.message}`;
  }
}

function handleExportCommand(arg, state) {
  if (!state.lastWorkPlan) return state.locale === 'en'
    ? 'Nothing to export yet. Run /plan <task> first.'
    : '还没有可导出的计划，请先输入任务。';
  try {
    const target = resolveExportPath(arg, state.lastWorkPlan);
    const markdown = renderWorkPlanMarkdown(state.lastWorkPlan);
    mkdirSync(dirname(target.absolute), { recursive: true });
    writeFileSync(target.absolute, markdown, 'utf8');
    return `exported: ${target.display}`;
  } catch (error) {
    return `export failed: ${error.message}`;
  }
}

function resolveExportPath(arg, workPlan) {
  const raw = String(arg || '').trim() || defaultWorkPlanExportPath(workPlan);
  if (extname(raw).toLowerCase() !== '.md') {
    throw new Error('export path must end with .md');
  }
  const absolute = resolve(raw);
  if (existsSync(absolute) && lstatSync(absolute).isDirectory()) {
    throw new Error('export path points to a directory');
  }
  return { absolute, display: raw.replace(/\\/g, '/') };
}

function setupRequiredMessage(error, locale = 'en') {
  if (locale !== 'en') return `请先运行 ${SETUP_COMMAND} 配置模型。`;
  const detail = error ? ` (${error})` : '';
  return `Model setup required${detail}. Run ${SETUP_COMMAND}.`;
}

function isModelConfigError(error) {
  return /model configuration is required|model is not configured/.test(error?.message || '');
}

function shouldRunInitialSetup({ parsed, streams, runtimeError }) {
  return Boolean(
    runtimeError &&
    !parsed.print &&
    streams.input?.isTTY &&
    streams.output?.isTTY
  );
}

function releaseInteractiveInput(inputStream) {
  if (!inputStream?.isTTY) return;
  try {
    inputStream.setRawMode?.(false);
  } catch {
    // Some test streams advertise TTY shape without supporting raw mode.
  }
  inputStream.pause?.();
}

function writeConfigFromArgs(parsed) {
  const providerId = parsed.configOverrides.model_provider || 'ollama';
  return writeProjectModelConfig({
    providerId,
    model: parsed.configOverrides.model,
    providerOverrides: parsed.configOverrides.model_providers?.[providerId] || {}
  });
}

function requireValue(flag, values) {
  if (!values.length || values[0].startsWith('-')) throw new Error(`${flag} requires a value`);
  return values.shift();
}

function looksLikeConfigOverride(value) {
  return /^[A-Za-z0-9_.-]+=/.test(value || '');
}

function looksLikeSessionId(value) {
  return value === 'latest' || /^[A-Za-z0-9][A-Za-z0-9_.-]{4,}$/.test(value || '');
}

function isUnsupportedClaudeToolOption(value) {
  return [
    '--allowedTools',
    '--disallowedTools',
    '--permission-mode',
    '--mcp-config',
    '--append-system-prompt',
    '--dangerously-skip-permissions'
  ].includes(value);
}

function currentProvider(configValues) {
  const entry = [...configValues].reverse().find((value) => value.startsWith('model_provider='));
  return entry ? entry.slice('model_provider='.length) : null;
}

function promptWithStdin(prompt, stdinText) {
  const trimmedPrompt = prompt.trim();
  const trimmedStdin = stdinText.trim();
  if (trimmedPrompt && trimmedStdin) return `${trimmedPrompt}\n\nPiped input:\n${trimmedStdin}`;
  return trimmedPrompt || trimmedStdin;
}

function revisionPrompt(lastResult, revision) {
  if (!lastResult) return revision;
  const goal = lastResult.taskspec?.inferred_goal || lastResult.taskplan?.global_goal || '';
  const previous = lastResult.taskspec?.surface_request || goal || '';
  const questions =
    lastResult.clarification_questions ||
    lastResult.taskspec?.clarification?.questions ||
    [];
  const tasks = (lastResult.taskplan?.tasks || []).map((task) => `${task.id}: ${task.title}`);
  return [
    previous ? `Previous request:\n${previous}` : null,
    goal ? `Previous goal:\n${goal}` : null,
    questions.length ? `Clarification questions:\n${questions.map((item) => `- ${item}`).join('\n')}` : null,
    tasks.length ? `Previous plan:\n${tasks.map((item) => `- ${item}`).join('\n')}` : null,
    `Revision:\n${revision}`
  ].filter(Boolean).join('\n\n');
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      data += chunk;
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(data));
    if (stream.isTTY) resolve('');
  });
}

function parseSlashLine(line) {
  const match = line.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { command: match?.[1] || '', arg: (match?.[2] || '').trim() };
}

function prepareSession(parsed) {
  if (parsed.resumeSessionId) {
    const session = loadSessionById(parsed.resumeSessionId);
    if (!session) throw new Error(`session not found: ${parsed.resumeSessionId}`);
    return { session, sessionNotice: `resumed session ${session.id} (${session.turns.length} turns)` };
  }
  if (parsed.continueSession) {
    const session = loadLatestSession();
    if (session) return { session, sessionNotice: `continuing session ${session.id} (${session.turns.length} turns)` };
    const created = createSession();
    return { session: created, sessionNotice: 'No saved session found; starting a new planning session.' };
  }
  return { session: createSession(), sessionNotice: null };
}

function createSession() {
  const now = new Date().toISOString();
  return {
    version: SESSION_STORE_VERSION,
    id: `${now.replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    created_at: now,
    updated_at: now,
    turns: []
  };
}

function sessionDir() {
  return resolve('.nplan', 'sessions');
}

function sessionPath(id) {
  if (!looksLikeSessionId(id) || id === 'latest') throw new Error(`invalid session id: ${id}`);
  return join(sessionDir(), `${id}.json`);
}

function loadSessionById(id) {
  if (!id || id === 'latest') return loadLatestSession();
  try {
    const file = sessionPath(id);
    if (!existsSync(file)) return null;
    return readSessionFile(file, id);
  } catch {
    return null;
  }
}

function renderDoctor() {
  let config = null;
  let configError = null;
  try {
    config = loadModelConfig.sync();
  } catch (error) {
    configError = error;
  }
  return [
    `${APP_NAME} doctor`,
    `version: ${PACKAGE_VERSION}`,
    `node: ${process.version}`,
    config?.model && config?.model_provider
      ? `model: ${config.model_provider}/${config.model}`
      : 'model: not configured',
    configError ? `config: ${configError.message}` : 'config: ok'
  ].join('\n');
}

function loadLatestSession() {
  const dir = sessionDir();
  if (!existsSync(dir)) return null;
  let latest = null;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = join(dir, name);
    try {
      const session = readSessionFile(file, name.slice(0, -5));
      const mtime = statSync(file).mtimeMs;
      if (!latest || Date.parse(session.updated_at || '') > Date.parse(latest.session.updated_at || '') || mtime > latest.mtime) {
        latest = { session, mtime };
      }
    } catch {
      // Ignore malformed session files; they should not block the CLI.
    }
  }
  return latest?.session || null;
}

function readSessionFile(file, fallbackId) {
  return normalizeSession(JSON.parse(readFileSync(file, 'utf8')), fallbackId);
}

function normalizeSession(value, fallbackId) {
  const now = new Date().toISOString();
  return {
    version: String(value?.version || SESSION_STORE_VERSION),
    id: looksLikeSessionId(value?.id) && value.id !== 'latest' ? value.id : fallbackId,
    created_at: String(value?.created_at || now),
    updated_at: String(value?.updated_at || now),
    turns: Array.isArray(value?.turns)
      ? value.turns.map((turn) => ({
          at: String(turn.at || now),
          prompt: String(turn.prompt || ''),
          status: String(turn.status || 'unknown'),
          inferred_goal: String(turn.inferred_goal || ''),
          deliverables: Array.isArray(turn.deliverables) ? turn.deliverables.map(String) : [],
          task_count: Number(turn.task_count || 0)
        }))
      : []
  };
}

function contextForSession(session) {
  if (!session?.turns?.length) return {};
  const notes = session.turns.slice(-5).map((turn, index) => {
    const goal = turn.inferred_goal ? ` goal="${turn.inferred_goal}"` : '';
    return `Previous planning turn ${index + 1}: status=${turn.status}${goal}; request="${turn.prompt}"`;
  });
  return {
    project_notes: notes,
    conversation_summary: notes.join('\n')
  };
}

function recordSessionTurn(session, prompt, result) {
  if (!session) return null;
  const now = new Date().toISOString();
  session.turns.push({
    at: now,
    prompt,
    status: result.status || 'unknown',
    inferred_goal: result.taskspec?.inferred_goal || '',
    deliverables: (result.taskspec?.deliverables || []).map((item) => item.name).filter(Boolean),
    task_count: result.taskplan?.tasks?.length || 0
  });
  session.updated_at = now;
  try {
    saveSession(session);
    return null;
  } catch (error) {
    return `session save failed: ${error.message}`;
  }
}

function saveSession(session) {
  mkdirSync(sessionDir(), { recursive: true });
  const file = sessionPath(session.id);
  const tempFile = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  renameSync(tempFile, file);
}

function compactSession(session, instructions = '') {
  const now = new Date().toISOString();
  const digest = [
    'Session summary:',
    ...session.turns.slice(-8).map((turn) => `- ${turn.status}: ${turn.inferred_goal || turn.prompt}`),
    instructions ? `User note: ${instructions}` : null
  ].filter(Boolean).join('\n');
  session.turns = [{
    at: now,
    prompt: digest,
    status: 'compacted',
    inferred_goal: 'Planning session compacted',
    deliverables: [],
    task_count: 0
  }];
  session.updated_at = now;
  saveSession(session);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMainModule()) {
  const code = await main();
  process.exitCode = code;
}
