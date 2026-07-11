#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalPlanningAgent } from './agent.js';
import {
  buildConsentScope,
  consentPreview,
  hasValidConsent,
  loadConsent,
  revokeConsent,
  saveConsent
} from './consent.js';
import { normalizeUserExclusions } from './context-policy.js';
import {
  message,
  normalizeSlashCommand,
  resolveLocale,
  summarizeValidationIssues
} from './i18n.js';
import { OpenAICompatiblePlanningModel, isLocalModelProvider } from './model-client.js';
import { loadModelConfig, parseConfigOverrides, resolveModelProvider } from './model-config.js';
import { formatModelError } from './model-errors.js';
import { initHint, renderProviderList, writeProjectModelConfig } from './model-init.js';
import { modelListUrl, probeProviderHealth, runModelSetupWizard } from './model-wizard.js';
import {
  createSession,
  loadLatestSession,
  loadSession,
  recordSessionTurn,
  saveSession
} from './session-store.js';
import {
  defaultWorkPlanExportPath,
  deriveWorkPlan,
  invalidWorkPlanMessage,
  renderWorkPlanMarkdown,
  renderWorkPlanSources,
  renderWorkPlanTodo
} from './work-plan.js';
import { validateWorkPlan } from './validation.js';

const APP_NAME = 'NPlan';
const BIN_NAME = 'nplan';
const SETUP_COMMAND = 'nplan setup';
const OUTPUT_FORMATS = new Set(['json', 'summary', 'text']);
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const COMMANDS = new Set(['consent', 'doctor', 'exec', 'init', 'providers', 'resume', 'setup']);

const HELP_EN = `Usage: ${BIN_NAME} [options] [prompt]

Commands:
  exec [options] [prompt]
                    Print one planning result and exit
  setup             Guided provider/API key/model setup wizard
  consent [status|revoke]
                    Show or revoke project cloud-context consent
  providers         List built-in model providers
  resume [id]       Resume a saved planning session
  doctor [--online] Check local configuration; optionally test a models/health endpoint

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
  --allow-cloud-context
                    Allow cloud context for this invocation only
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
  consent [status|revoke] 查看或撤销项目云端上下文授权
  providers              查看内置模型服务商
  resume [会话编号]      恢复已保存的规划会话
  doctor [--online]      检查本地配置；可选测试模型列表或健康接口

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
  --allow-cloud-context  仅本次允许向云端发送上下文
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
    const result = await runDoctor(parsed);
    streams.output.write(`${result.text}\n`);
    return result.code;
  }
  if (parsed.command === 'providers') {
    streams.output.write(`${renderProviderList()}\n`);
    return 0;
  }
  if (parsed.command === 'consent') {
    return handleConsentCommand(parsed.prompt, streams, parsed.locale);
  }
  if (parsed.command === 'setup') {
    try {
      await runModelSetupWizard({ streams, locale: parsed.locale });
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
      await runModelSetupWizard({ streams, locale: parsed.locale });
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
      session = parsed.continueSession || parsed.resumeSessionId
        ? (await prepareSession(parsed)).session
        : null;
    } catch (error) {
      streams.error.write(`${error.message}\n`);
      return 1;
    }
    try {
      const baseContext = contextForSession(session);
      const reviseExisting = Boolean(session?.last_result && session?.last_work_plan);
      const effectivePrompt = effectivePlanningPrompt(prompt, {
        lastResult: session?.last_result,
        lastWorkPlan: session?.last_work_plan,
        reviseExisting
      });
      const prepared = runtime.agent.prepare(effectivePrompt, baseContext);
      const authorization = await authorizePreparedContext({
        prepared,
        baseContext,
        runtime,
        streams,
        locale: parsed.locale,
        allowOnce: parsed.allowCloudContext
      });
      if (!authorization.allowed) return 2;
      const result = await runtime.agent.analyzePreparedAsync(authorization.prepared, {
        cloudContextAuthorized: authorization.allowed
      });
      const workPlan = requireValidWorkPlan(deriveWorkPlan(result, {
        sessionId: session?.id || 'print-session',
        locale: parsed.locale
      }));
      if (session) {
        recordSessionTurn(session, {
          request: prompt,
          revision: reviseExisting ? prompt : '',
          result,
          workPlan
        });
        await saveSession(process.cwd(), session);
      }
      streams.output.write(`${renderPrintResult(result, parsed.outputFormat, parsed.locale)}\n`);
      return 0;
    } catch (error) {
      if (error?.code === 'cloud_context_consent_required') {
        streams.error.write(`${cloudConsentRequiredMessage(parsed.locale)}\n`);
        return 2;
      }
      streams.error.write(`${formatModelError(error, parsed.locale)}\n`);
      return 1;
    }
  }

  let sessionInfo;
  try {
    sessionInfo = await prepareSession(parsed);
  } catch (error) {
    streams.error.write(`${error.message}\n`);
    return 1;
  }
  return runInteractive({
    runtime,
    runtimeError,
    initialPrompt: parsed.prompt,
    streams,
    locale: parsed.locale,
    allowCloudContext: parsed.allowCloudContext,
    ...sessionInfo
  });
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
  let allowCloudContext = false;
  let online = false;

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
    } else if (value === '--allow-cloud-context') {
      allowCloudContext = true;
    } else if (value === '--online') {
      if (command !== 'doctor') throw new Error('--online is only supported with nplan doctor');
      online = true;
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
    locale,
    allowCloudContext,
    online
  };
}

async function runInteractive({
  runtime,
  runtimeError = null,
  initialPrompt,
  streams,
  session,
  locale = 'zh-CN',
  sessionNotice = null,
  allowCloudContext = false
}) {
  const state = {
    lastResult: session.last_result || null,
    lastWorkPlan: session.last_work_plan || null,
    requests: 0,
    runtime,
    runtimeError,
    session,
    locale,
    allowCloudContext,
    exitCode: 0,
    readLine: null
  };
  const labelSeparator = locale === 'en' ? ': ' : '：';
  streams.output.write(`${message(locale, 'startup.title')}\n`);
  streams.output.write(`${message(locale, 'startup.cwd')}${labelSeparator}${process.cwd()}\n`);
  streams.output.write(`${message(locale, 'startup.session')}${labelSeparator}${session.id}\n`);
  if (sessionNotice) streams.output.write(`${sessionNotice}\n`);
  streams.output.write(`${runtimeSummary(state)}\n`);
  streams.output.write(`${message(locale, 'startup.hint')}\n`);

  const rl = readline.createInterface({
    input: streams.input,
    output: streams.output,
    prompt: `${BIN_NAME}> `,
    terminal: Boolean(streams.input.isTTY && streams.output.isTTY)
  });
  let closed = false;
  const queuedLines = [];
  const lineWaiters = [];
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
    while (lineWaiters.length) lineWaiters.shift()(null);
    process.off('SIGINT', onProcessInterrupt);
    releaseInteractiveInput(streams.input);
  });
  rl.on('line', (line) => {
    const value = String(line).trim();
    if (lineWaiters.length) lineWaiters.shift()(value);
    else queuedLines.push(value);
  });
  rl.on('SIGINT', requestExit);
  process.once('SIGINT', onProcessInterrupt);

  state.readLine = async () => {
    if (queuedLines.length) return queuedLines.shift();
    if (closed) return null;
    return new Promise((resolveLine) => lineWaiters.push(resolveLine));
  };

  if (initialPrompt) {
    await analyzeAndRender(initialPrompt, {
      state,
      streams,
      reviseExisting: Boolean(state.lastResult && state.lastWorkPlan)
    });
  }

  if (!closed) rl.prompt();
  while (true) {
    const rawLine = await state.readLine();
    if (rawLine === null) break;
    const shouldExit = await handleInteractiveLine(rawLine, { state, streams });
    if (shouldExit) {
      rl.close();
      break;
    }
    if (!closed) rl.prompt();
  }
  return state.exitCode;
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
    const rendered = state.lastWorkPlan
      ? renderWorkPlanSources(state.lastWorkPlan)
      : invalidWorkPlanMessage(state.locale);
    streams.output.write(`${rendered}\n`);
    return false;
  }
  if (line === '/todo') {
    const rendered = state.lastWorkPlan
      ? renderWorkPlanTodo(state.lastWorkPlan)
      : invalidWorkPlanMessage(state.locale);
    streams.output.write(`${rendered}\n`);
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
    streams.output.write('revised plan:\n');
    await analyzeAndRender(revision, {
      state,
      streams,
      reviseExisting: Boolean(state.lastResult && state.lastWorkPlan)
    });
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
    streams.output.write(`${await handleCompactCommand(slash.arg, state)}\n`);
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
    const loaded = await loadSessionForCli(slash.arg || 'latest');
    if (!loaded) {
      streams.output.write('No saved session found.\n');
    } else if (loaded.incompatible) {
      streams.output.write(`${incompatibleSessionMessage(loaded, state.locale)}\n`);
    } else {
      state.lastResult = loaded.last_result || null;
      state.lastWorkPlan = loaded.last_work_plan || null;
      state.session = loaded;
      streams.output.write(`${resumedSessionMessage(loaded, state.locale)}\n`);
    }
    return false;
  }
  if (line === '/continue') {
    const loaded = await loadLatestSession(process.cwd());
    if (!loaded) {
      streams.output.write(`No saved session found. Current session: ${state.session.id}\n`);
    } else if (loaded.incompatible) {
      streams.output.write(`${incompatibleSessionMessage(loaded, state.locale)}\n`);
    } else {
      state.lastResult = loaded.last_result || null;
      state.lastWorkPlan = loaded.last_work_plan || null;
      state.session = loaded;
      streams.output.write(`${continuedSessionMessage(loaded, state.locale)}\n`);
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

  const explicitPlan = line.startsWith('/plan ');
  let prompt = explicitPlan ? line.slice('/plan '.length).trim() : line;
  if (!prompt) {
    streams.output.write(`${message(state.locale, 'error.planUsage')}\n`);
    return false;
  }

  await analyzeAndRender(prompt, {
    state,
    streams,
    reviseExisting: !explicitPlan && Boolean(state.lastWorkPlan && state.lastResult)
  });
  return false;
}

async function analyzeAndRender(prompt, { state, streams, reviseExisting = false }) {
  if (!state.runtime) {
    streams.output.write(`${setupRequiredMessage(state.runtimeError, state.locale)}\n`);
    return;
  }
  try {
    const effectivePrompt = effectivePlanningPrompt(prompt, {
      lastResult: state.lastResult,
      lastWorkPlan: state.lastWorkPlan,
      reviseExisting
    });
    const baseContext = contextForSession(state.session);
    const prepared = state.runtime.agent.prepare(effectivePrompt, baseContext);
    const authorization = await authorizePreparedContext({
      prepared,
      baseContext,
      runtime: state.runtime,
      streams,
      locale: state.locale,
      allowOnce: state.allowCloudContext,
      readLine: state.readLine
    });
    if (!authorization.allowed) {
      streams.output.write(`${state.locale === 'en' ? 'Cloud-context authorization cancelled.' : '已取消云端上下文授权。'}\n`);
      return;
    }
    const result = await state.runtime.agent.analyzePreparedAsync(authorization.prepared, {
      cloudContextAuthorized: authorization.allowed
    });
    const workPlan = requireValidWorkPlan(deriveWorkPlan(result, {
      sessionId: state.session.id,
      locale: state.locale
    }));
    state.lastResult = result;
    state.lastWorkPlan = workPlan;
    state.requests += 1;
    recordSessionTurn(state.session, {
      request: prompt,
      revision: reviseExisting ? prompt : '',
      result: state.lastResult,
      workPlan: state.lastWorkPlan
    });
    let warning = null;
    try {
      await saveSession(process.cwd(), state.session);
    } catch (error) {
      warning = `session save failed: ${error.message}`;
    }
    streams.output.write(`${renderInteractiveResult(state.lastResult, { workPlan: state.lastWorkPlan, locale: state.locale })}\n`);
    if (warning) streams.output.write(`${warning}\n`);
  } catch (error) {
    if (error?.code === 'cloud_context_consent_required') {
      state.exitCode = 2;
      streams.output.write(`${cloudConsentRequiredMessage(state.locale)}\n`);
      return;
    }
    streams.output.write(`${formatModelError(error, state.locale)}\n`);
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
  if (!validateWorkPlan(workPlan).valid) return invalidWorkPlanMessage(locale);
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

  if (result?.status !== 'plan_invalid' && workPlan.steps.length) {
    lines.push('', message(locale, 'result.steps'));
    workPlan.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step.title}`);
      if (step.acceptance.length) {
        const separator = locale === 'en' ? ': ' : '：';
        lines.push(`   ${message(locale, 'result.stepAcceptance')}${separator}${step.acceptance.join(locale === 'en' ? '; ' : '；')}`);
      }
    });
  }

  if (result?.status !== 'plan_invalid' && workPlan.acceptance.length) {
    lines.push('', message(locale, 'result.acceptance'));
    appendList(lines, workPlan.acceptance, message(locale, 'result.none'));
  }

  const issues = summarizeValidationIssues(result, locale);
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

function makeRuntime(parsed) {
  const config = loadModelConfig.sync({
    configPath: parsed.configPath,
    overrides: parsed.configOverrides
  });
  if (!config.model) {
    throw new Error(`model configuration is required. Run "${SETUP_COMMAND}".`);
  }
  const modelClient = new OpenAICompatiblePlanningModel({ config });
  return {
    modelClient,
    agent: new LocalPlanningAgent({ modelClient }),
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
  state.runtime.modelClient = new OpenAICompatiblePlanningModel({ config: state.runtime.config });
  state.runtime.agent = new LocalPlanningAgent({ modelClient: state.runtime.modelClient });
  return `model: ${state.runtime.config.model_provider}/${state.runtime.config.model}`;
}

async function handleCompactCommand(arg, state) {
  if (!state.session.turns.length) return 'Nothing to compact yet.';
  try {
    await compactSession(state.session, arg);
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
    return state.locale === 'en' ? `exported: ${target.display}` : `已导出：${target.display}`;
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

function requireValidWorkPlan(workPlan) {
  if (validateWorkPlan(workPlan).valid) return workPlan;
  const error = new Error('WorkPlan validation failed; replan before viewing or exporting it.');
  error.code = 'invalid_output';
  throw error;
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

function effectivePlanningPrompt(prompt, {
  lastResult = null,
  lastWorkPlan = null,
  reviseExisting = false
} = {}) {
  const request = String(prompt || '').trim();
  if (!reviseExisting || !lastResult || !lastWorkPlan) return request;
  return revisionPrompt(lastResult, request);
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

async function prepareSession(parsed) {
  if (parsed.resumeSessionId) {
    const session = await loadSessionForCli(parsed.resumeSessionId);
    if (!session) throw new Error(`session not found: ${parsed.resumeSessionId}`);
    if (session.incompatible) throw new Error(incompatibleSessionMessage(session, parsed.locale));
    return { session, sessionNotice: resumedSessionMessage(session, parsed.locale) };
  }
  if (parsed.continueSession) {
    const session = await loadLatestSession(process.cwd());
    if (session?.incompatible) {
      throw new Error(incompatibleSessionMessage(session, parsed.locale));
    }
    if (session) return { session, sessionNotice: continuedSessionMessage(session, parsed.locale) };
    const created = createSession();
    return { session: created, sessionNotice: 'No saved session found; starting a new planning session.' };
  }
  return { session: createSession(), sessionNotice: null };
}

async function loadSessionForCli(id) {
  if (!id || id === 'latest') return loadLatestSession(process.cwd());
  try {
    return await loadSession(process.cwd(), id);
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    return null;
  }
}

async function runDoctor(parsed) {
  const locale = parsed.locale;
  const english = locale === 'en';
  const lines = [
    `${APP_NAME} doctor`,
    `version: ${PACKAGE_VERSION}`,
    `node: ${process.version}`
  ];
  let config;
  let provider;
  try {
    config = loadModelConfig.sync({
      configPath: parsed.configPath,
      overrides: parsed.configOverrides
    });
    lines.push(english ? 'config: ok' : '配置：正常（config: ok）');
    if (!config.model || !config.model_provider) {
      lines.push(english ? 'model: not configured' : '模型：未配置（model: not configured）');
      lines.push(english ? 'API key: not checked' : 'API Key：未检查（模型未配置）');
      lines.push(english ? 'cloud-context consent: not checked' : '云端上下文授权：未检查（模型未配置）');
      lines.push(offlineDoctorLine(locale));
      return { code: parsed.online ? 1 : 0, text: lines.join('\n') };
    }
    provider = resolveModelProvider(config);
  } catch {
    lines.push(english ? 'config: invalid' : '配置：无效');
    lines.push(english ? 'Next step: run nplan setup.' : '下一步：运行 nplan setup 重新配置。');
    lines.push(offlineDoctorLine(locale));
    return { code: 1, text: lines.join('\n') };
  }

  lines.push(english
    ? `model: ${provider.id}/${config.model}`
    : `模型：${provider.id}/${config.model}`);

  const addressError = providerAddressError(provider);
  if (addressError) {
    lines.push(english ? 'provider address: invalid' : 'Provider 地址：无效');
    lines.push(formatModelError(addressError, locale));
    lines.push(offlineDoctorLine(locale));
    return { code: 1, text: lines.join('\n') };
  }
  lines.push(english ? 'provider address: valid' : 'Provider 地址：有效');

  if (parsed.online) {
    const healthTargetError = providerHealthTargetError(provider);
    if (healthTargetError) {
      lines.push(english ? 'online health target: rejected' : '联网健康检查地址：已拒绝');
      lines.push(formatModelError(healthTargetError, locale));
      return { code: 1, text: lines.join('\n') };
    }
  }

  const keyMissing = Boolean(provider.env_key && !provider.apiKey);
  if (provider.env_key) {
    lines.push(english
      ? `API key: ${keyMissing ? 'missing' : 'configured'}`
      : `API Key：${keyMissing ? '缺失' : '已配置'}`);
    if (keyMissing) {
      lines.push(english
        ? `Next step: run nplan setup or set ${provider.env_key}.`
        : `下一步：运行 nplan setup，或设置环境变量 ${provider.env_key}。`);
    }
  } else {
    lines.push(english ? 'API key: not required' : 'API Key：不需要');
  }

  if (isLocalModelProvider(provider)) {
    lines.push(english
      ? 'cloud-context consent: not required for a local provider'
      : '云端上下文授权：本地 Provider 不需要');
  } else {
    const record = await loadConsent(process.cwd());
    const saved = consentMatchesProvider(record, provider);
    lines.push(english
      ? `cloud-context consent: ${saved ? 'saved (scope is checked when planning)' : 'not saved'}`
      : `云端上下文授权：${saved ? '已保存（规划时仍会校验范围）' : '未保存'}`);
  }

  if (!parsed.online) {
    lines.push(offlineDoctorLine(locale));
    return { code: 0, text: lines.join('\n') };
  }
  if (keyMissing) {
    lines.push(english ? 'online: not tested because the API key is missing' : '联网：未测试（API Key 缺失）');
    return { code: 1, text: lines.join('\n') };
  }

  try {
    await probeProviderHealth({ provider, apiKey: provider.apiKey });
    lines.push(english
      ? 'online: connection healthy (read-only models/health endpoint only)'
      : '联网：连接正常（仅测试只读模型列表或健康接口）');
    return { code: 0, text: lines.join('\n') };
  } catch (error) {
    lines.push(english ? 'online: connection failed' : '联网：连接失败');
    lines.push(formatModelError(error, locale));
    return { code: 1, text: lines.join('\n') };
  }
}

function offlineDoctorLine(locale) {
  return locale === 'en'
    ? 'online: not tested; use nplan doctor --online to test a read-only models/health endpoint'
    : '联网：未测试联网；如需检查，请运行 nplan doctor --online（仅访问只读模型列表或健康接口）';
}

function providerAddressError(provider) {
  try {
    for (const raw of [provider.base_url, provider.models_url].filter(Boolean)) {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new TypeError('Invalid URL');
      }
    }
    return null;
  } catch {
    return Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL' });
  }
}

function providerHealthTargetError(provider) {
  try {
    const target = new URL(provider.models_url || modelListUrl(provider.base_url));
    const segments = canonicalHealthPathSegments(target.pathname);
    const finalSegment = segments.at(-1) || '';
    const allowed = new Set(['models', 'health', 'healthz', 'status', 'ready', 'readiness']);
    if (!allowed.has(finalSegment)) throw new Error('unsafe health target');
    return null;
  } catch {
    return Object.assign(new Error('unsafe health target'), { code: 'unsafe_health_endpoint' });
  }
}

function canonicalHealthPathSegments(pathname) {
  let current = String(pathname || '').replaceAll('\\', '/');
  let segments = [];
  for (let round = 0; round < 3; round += 1) {
    const rawSegments = current.replaceAll('\\', '/').split('/').filter(Boolean);
    segments = rawSegments.map((segment) => {
      const decoded = decodeURIComponent(segment);
      if (decoded.includes('/') || decoded.includes('\\')) {
        throw new Error('encoded path separator');
      }
      return decoded.toLowerCase();
    });
    if (hasForbiddenHealthPathSegment(segments)) throw new Error('unsafe health target');
    const next = `/${segments.join('/')}`;
    if (next === current.toLowerCase()) return segments;
    current = next;
  }
  if (/%[0-9a-f]{2}/i.test(current) || current.includes('%')) {
    throw new Error('over-encoded path');
  }
  return segments;
}

function hasForbiddenHealthPathSegment(segments) {
  const forbidden = new Set([
    'chat',
    'completion',
    'completions',
    'response',
    'responses',
    'message',
    'messages',
    'embedding',
    'embeddings',
    'task',
    'tasks'
  ]);
  return segments.some((segment) => forbidden.has(segment));
}

function consentMatchesProvider(record, provider) {
  if (!record || record.provider_id !== provider.id) return false;
  try {
    const saved = new URL(record.base_url);
    const active = new URL(provider.base_url);
    saved.pathname = saved.pathname.replace(/\/$/, '');
    active.pathname = active.pathname.replace(/\/$/, '');
    return saved.toString() === active.toString();
  } catch {
    return false;
  }
}

function contextForSession(session) {
  if (!session?.turns?.length) return {};
  const notes = session.turns.slice(-5).map((turn, index) => {
    const status = turn.result?.status || 'unknown';
    const goal = turn.result?.taskspec?.inferred_goal || '';
    const goalText = goal ? ` goal="${goal}"` : '';
    return `Previous planning turn ${index + 1}: status=${status}${goalText}; request="${turn.request}"`;
  });
  return {
    project_notes: notes,
    conversation_summary: notes.join('\n')
  };
}

async function compactSession(session, instructions = '') {
  const last = session.turns.at(-1);
  if (last) {
    session.turns = [{
      ...last,
      revision: instructions ? `Session note: ${instructions}` : last.revision
    }];
  }
  session.updated_at = new Date().toISOString();
  await saveSession(process.cwd(), session);
}

export async function authorizePreparedContext({
  prepared,
  baseContext = {},
  runtime,
  streams,
  locale = 'zh-CN',
  allowOnce = false,
  readLine = null
}) {
  if (!runtime?.modelClient?.requiresContextConsent) {
    return { allowed: true, persisted: false, local: true, prepared };
  }

  const root = prepared.context.root || process.cwd();
  let scope = buildConsentScope(
    runtime.modelClient.provider,
    prepared.context.context_policy,
    prepared.context.context_policy.user_exclusions
  );
  if (allowOnce) {
    return { allowed: true, persisted: false, local: false, prepared };
  }

  const saved = await loadConsent(root);
  if (saved) {
    let candidate = prepared;
    if (saved.exclusions.length) {
      candidate = runtime.agent.prepare(prepared.request, {
        ...baseContext,
        root,
        context_policy: {
          ...prepared.context.context_policy,
          user_exclusions: saved.exclusions
        }
      });
    }
    const candidateScope = buildConsentScope(
      runtime.modelClient.provider,
      candidate.context.context_policy,
      candidate.context.context_policy.user_exclusions
    );
    if (hasValidConsent(saved, candidateScope)) {
      return { allowed: true, persisted: true, local: false, prepared: candidate };
    }
  }

  if (!streams.input?.isTTY || !streams.output?.isTTY) {
    const error = new Error('cloud_context_consent_required');
    error.code = 'cloud_context_consent_required';
    throw error;
  }
  if (typeof readLine !== 'function') {
    throw new Error('interactive consent requires a line reader');
  }

  let preview = consentPreview(prepared.context, scope);
  while (true) {
    renderConsentPreview(streams.output, preview, locale);
    const answer = await readLine();
    if (answer === null || answer === '4') {
      return { allowed: false, persisted: false, local: false, prepared };
    }
    if (answer === '1') {
      renderConsentSources(streams.output, preview.sources, locale);
      continue;
    }
    if (answer === '2') {
      streams.output.write(locale === 'en'
        ? 'Project-relative exclusions (comma-separated; blank clears): '
        : '请输入要排除的项目相对路径（逗号分隔，留空表示不排除）：');
      const rawExclusions = await readLine();
      try {
        const exclusions = normalizeUserExclusions(
          String(rawExclusions || '')
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean)
        );
        prepared = runtime.agent.prepare(prepared.request, {
          ...baseContext,
          root,
          context_policy: {
            ...prepared.context.context_policy,
            user_exclusions: exclusions
          }
        });
        scope = buildConsentScope(
          runtime.modelClient.provider,
          prepared.context.context_policy,
          exclusions
        );
        preview = consentPreview(prepared.context, scope);
      } catch (error) {
        streams.output.write(locale === 'en'
          ? `Invalid exclusion: ${error.message}\n`
          : `排除路径无效：${error.message}\n`);
      }
      continue;
    }
    if (answer === '3') {
      await saveConsent(root, scope);
      return { allowed: true, persisted: true, local: false, prepared };
    }
    streams.output.write(locale === 'en'
      ? 'Enter 1, 2, 3, or 4.\n'
      : '请输入 1、2、3 或 4。\n');
  }
}

function renderConsentPreview(outputStream, preview, locale) {
  if (locale === 'en') {
    outputStream.write([
      'Cloud context authorization required',
      `Provider: ${preview.provider_id}`,
      `Sources: ${preview.source_count}`,
      `Maximum characters per source: ${preview.max_chars_per_source}`,
      '1. View sources',
      '2. Exclude paths and refresh preview',
      '3. Remember authorization for this project and scope',
      '4. Cancel',
      'Choose: '
    ].join('\n'));
    return;
  }
  outputStream.write([
    '需要授权后才能向云端模型发送本地上下文',
    `服务商：${preview.provider_id}`,
    `来源数量：${preview.source_count}`,
    `每个来源最多字符数：${preview.max_chars_per_source}`,
    '1. 查看来源',
    '2. 排除路径并重新预览',
    '3. 记住本项目当前范围的授权',
    '4. 取消',
    '请选择：'
  ].join('\n'));
}

function renderConsentSources(outputStream, sources, locale) {
  const values = Array.isArray(sources) ? sources : [];
  const title = locale === 'en' ? 'Sources to send:' : '将发送的来源：';
  outputStream.write(`${title}\n`);
  outputStream.write(values.length
    ? `${values.map((source) => `- ${source}`).join('\n')}\n`
    : `${locale === 'en' ? '- None' : '- 无'}\n`);
}

async function handleConsentCommand(rawAction, streams, locale) {
  const action = String(rawAction || 'status').trim().toLowerCase();
  if (action === 'revoke') {
    await revokeConsent(process.cwd());
    streams.output.write(locale === 'en'
      ? 'Project cloud-context authorization revoked.\n'
      : '已撤销本项目的云端上下文授权。\n');
    return 0;
  }
  if (action !== 'status') {
    streams.error.write(locale === 'en'
      ? 'Usage: nplan consent [status|revoke]\n'
      : '用法：nplan consent [status|revoke]\n');
    return 1;
  }
  const record = await loadConsent(process.cwd());
  if (!record) {
    streams.output.write(locale === 'en'
      ? 'Cloud-context authorization: not saved for this project.\n'
      : '云端上下文授权：本项目尚未保存授权。\n');
    return 0;
  }
  const exclusions = record.exclusions.length ? record.exclusions.join(', ') : (locale === 'en' ? 'none' : '无');
  streams.output.write(locale === 'en'
    ? `Cloud-context authorization: saved\nProvider: ${record.provider_id}\nConfirmed: ${record.confirmed_at}\nExclusions: ${exclusions}\n`
    : `云端上下文授权：已保存\n服务商：${record.provider_id}\n确认时间：${record.confirmed_at}\n排除路径：${exclusions}\n`);
  return 0;
}

function cloudConsentRequiredMessage(locale) {
  return locale === 'en'
    ? 'Local context has not been authorized for this cloud provider. Use --allow-cloud-context for this invocation or run interactively to review and remember authorization.'
    : '尚未授权发送本地上下文到云端模型。可为本次命令添加 --allow-cloud-context，或在交互模式中预览并确认。';
}

function resumedSessionMessage(session, locale) {
  const base = locale === 'en'
    ? `restored plan from session ${session.id} (${session.turns.length} turns)`
    : `已恢复规划：${session.id}（${session.turns.length} 轮）`;
  return appendWorkPlanRestoreWarning(base, session, locale);
}

function continuedSessionMessage(session, locale) {
  const base = locale === 'en'
    ? `continuing restored plan ${session.id} (${session.turns.length} turns)`
    : `已继续规划：${session.id}（${session.turns.length} 轮）`;
  return appendWorkPlanRestoreWarning(base, session, locale);
}

function appendWorkPlanRestoreWarning(base, session, locale) {
  if (!session?.last_result || session?.last_work_plan) return base;
  const warning = locale === 'en'
    ? 'The saved WorkPlan was invalid and was not restored. Replan before viewing, revising, or exporting it.'
    : '已保存的工作计划校验失败，未恢复；请重新规划后再查看、修改或导出。';
  return `${base}\n${warning}`;
}

function incompatibleSessionMessage(session, locale) {
  return locale === 'en'
    ? `Session ${session.id} uses incompatible format ${session.version}; start a new session.`
    : `会话 ${session.id} 使用不兼容的 ${session.version} 格式，请新建会话。`;
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
