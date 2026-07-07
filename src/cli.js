#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalPlanningAgent } from './agent.js';
import { OpenAICompatibleTaskModel } from './model-client.js';
import { loadModelConfig, parseConfigOverrides } from './model-config.js';
import { initHint, renderProviderList, writeProjectModelConfig } from './model-init.js';
import { runModelSetupWizard } from './model-wizard.js';

const APP_NAME = 'NPlan';
const BIN_NAME = 'nplan';
const SETUP_COMMAND = 'nplan setup';
const SESSION_STORE_VERSION = '1.0';
const OUTPUT_FORMATS = new Set(['json', 'summary', 'text']);
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const COMMANDS = new Set(['doctor', 'exec', 'init', 'providers', 'resume', 'setup']);

const HELP = `Usage: ${BIN_NAME} [options] [prompt]

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
  Use --config key=value for config overrides. The legacy "-c key=value" form still works.
  Shell execution with ! is intentionally unsupported.`;

export async function main(argv = process.argv.slice(2), streams = { input, output, error: process.stderr }) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    streams.error.write(`${error.message}\n`);
    return 1;
  }
  if (parsed.help) {
    streams.output.write(`${HELP}\n`);
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
      streams.output.write(`${renderPrintResult(result, parsed.outputFormat)}\n`);
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
  await runInteractive({ runtime, runtimeError, initialPrompt: parsed.prompt, streams, ...sessionInfo });
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
    inputFormat
  };
}

async function runInteractive({
  runtime,
  runtimeError = null,
  initialPrompt,
  streams,
  session,
  sessionNotice = null
}) {
  const state = { lastResult: null, requests: 0, runtime, runtimeError, session };
  streams.output.write(`${APP_NAME}\n`);
  streams.output.write(`cwd: ${process.cwd()}\n`);
  streams.output.write(`session: ${session.id}\n`);
  if (sessionNotice) streams.output.write(`${sessionNotice}\n`);
  streams.output.write(`${runtimeSummary(state)}\n`);
  streams.output.write('Type a task to plan it. Use /help for commands.\n');

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
  rl.on('close', () => {
    closed = true;
  });

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
  const slash = parseSlashLine(line);
  if (line === '/exit' || line === '/quit') {
    streams.output.write('bye\n');
    return true;
  }
  if (line === '/help' || line === '/?') {
    streams.output.write(`${HELP}\n`);
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
      state.session = loaded;
      streams.output.write(`continuing session ${loaded.id} (${loaded.turns.length} turns)\n`);
    }
    return false;
  }
  if (line === '/json') {
    streams.output.write(
      state.lastResult ? `${JSON.stringify(state.lastResult, null, 2)}\n` : 'No result yet.\n'
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
    streams.output.write('Unknown command. Use /help for commands.\n');
    return false;
  }

  const prompt = line.startsWith('/plan ') ? line.slice('/plan '.length).trim() : line;
  if (!prompt) {
    streams.output.write('Usage: /plan <prompt>\n');
    return false;
  }

  await analyzeAndRender(prompt, { state, streams });
  return false;
}

async function analyzeAndRender(prompt, { state, streams }) {
  if (!state.runtime) {
    streams.output.write(`${setupRequiredMessage(state.runtimeError)}\n`);
    return;
  }
  try {
    state.lastResult = await state.runtime.agent.analyzeAsync(prompt, contextForSession(state.session));
    state.requests += 1;
    const warning = recordSessionTurn(state.session, prompt, state.lastResult);
    streams.output.write(`${renderInteractiveResult(state.lastResult)}\n`);
    if (warning) streams.output.write(`${warning}\n`);
  } catch (error) {
    streams.output.write(`analysis failed: ${error.message}\n`);
  }
}

function renderPrintResult(result, outputFormat = 'json') {
  if (outputFormat === 'summary' || outputFormat === 'text') {
    return renderInteractiveResult(result, { includeJsonHint: false });
  }
  return JSON.stringify(result, null, 2);
}

export function renderInteractiveResult(result, { includeJsonHint = true } = {}) {
  const lines = [`status: ${result.status}`];
  if (result.taskspec?.inferred_goal) lines.push(`goal: ${result.taskspec.inferred_goal}`);

  if (result.status === 'needs_clarification') {
    const questions = result.clarification_questions || result.taskspec?.clarification?.questions || [];
    if (questions.length) {
      lines.push('', 'clarification needed:');
      for (const question of questions) lines.push(`- ${question}`);
    }
    lines.push('', 'No task plan was produced yet.');
    if (includeJsonHint) lines.push('Full JSON: /json');
    return lines.join('\n');
  }

  const deliverables = (result.taskspec?.deliverables || []).filter((item) => item?.name);
  if (deliverables.length) {
    lines.push('', 'deliverables:');
    for (const item of deliverables) {
      const suffix = item.format && item.format !== 'unknown' ? ` (${item.format})` : '';
      lines.push(`- ${item.name}${suffix}`);
    }
  }

  const tasks = result.taskplan?.tasks || [];
  if (tasks.length) {
    lines.push('', 'plan:');
    for (const task of tasks) lines.push(`- ${task.id}: ${task.title}`);
  }

  const issues = reportIssues(result);
  if (issues.length) {
    lines.push('', 'validation issues:');
    for (const issue of issues) lines.push(`- ${issue}`);
  }

  if (includeJsonHint) lines.push('', 'Full JSON: /json');
  return lines.join('\n');
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
      modelClient: new OpenAICompatibleTaskModel({ config })
    }),
    config
  };
}

function runtimeSummary(state) {
  if (!state.runtime) return `model: not configured\n${setupRequiredMessage(state.runtimeError)}`;
  return `model: ${state.runtime.config.model_provider}/${state.runtime.config.model}`;
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
  if (!state.runtime) return `model: not configured\n${setupRequiredMessage(state.runtimeError)}`;
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
  if (!state.runtime) return setupRequiredMessage(state.runtimeError);
  state.runtime.config = { ...state.runtime.config, model: nextModel };
  state.runtime.agent = new LocalPlanningAgent({
    modelClient: new OpenAICompatibleTaskModel({ config: state.runtime.config })
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

function setupRequiredMessage(error) {
  const detail = error ? ` (${error})` : '';
  return `Model setup required${detail}. Run ${SETUP_COMMAND}.`;
}

function isModelConfigError(error) {
  return /model configuration is required|model is not configured/.test(error?.message || '');
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
