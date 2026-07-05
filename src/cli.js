#!/usr/bin/env node
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalPlanningAgent } from './agent.js';
import { OpenAICompatibleTaskModel } from './model-client.js';
import { loadModelConfig, parseConfigOverrides } from './model-config.js';
import { initHint, renderProviderList, writeProjectModelConfig } from './model-init.js';

const APP_NAME = 'N-Plan';
const BIN_NAME = 'nplan';

const HELP = `Usage: ${BIN_NAME} [options] [prompt]

Commands:
  init              Configure this project for a model provider
  providers         List built-in model providers

Options:
  -p, --print       Print one JSON result and exit
  --model <name>    Use a model for semantic task understanding
  --provider <id>   Select model provider (run "${BIN_NAME} providers")
  --config-path <p> Load Codex-style model config TOML
  -c key=value      Override config, supports dotted keys
  -h, --help        Show this help

Interactive commands:
  /help             Show commands
  /init [id] [model] Configure this project for a model provider
  /providers        List built-in model providers
  /status           Show session status
  /plan <prompt>    Analyze a prompt and show a planning summary
  /json             Print the last full JSON result
  /clear            Clear the last result
  /exit, /quit      Exit the session

Notes:
  Type a task directly in interactive mode; it behaves like /plan <prompt>.
  Interactive mode shows a concise planning summary. Use -p or /json for full JSON.
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
  if (parsed.command === 'providers') {
    streams.output.write(`${renderProviderList()}\n`);
    return 0;
  }
  if (parsed.command === 'init') {
    try {
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
    try {
      streams.output.write(`${JSON.stringify(await runtime.agent.analyzeAsync(prompt), null, 2)}\n`);
      return 0;
    } catch (error) {
      streams.error.write(`analysis failed: ${error.message}\n`);
      return 1;
    }
  }

  await runInteractive({ runtime, runtimeError, initialPrompt: parsed.prompt, streams });
  return 0;
}

export function parseArgs(argv) {
  const values = [...argv];
  let print = false;
  let help = false;
  let configPath = null;
  let command = null;
  const configValues = [];
  const promptParts = [];

  if (values[0] === 'init' || values[0] === 'providers') {
    command = values.shift();
  }

  while (values.length) {
    const value = values.shift();
    if (value === '-p' || value === '--print') {
      print = true;
    } else if (value === '--no-model') {
      throw new Error('--no-model is not supported; configure a model instead');
    } else if (value === '--model') {
      configValues.push(`model=${requireValue(value, values)}`);
    } else if (value === '--provider' || value === '--model-provider') {
      configValues.push(`model_provider=${requireValue(value, values)}`);
    } else if (value === '--base-url') {
      const provider = currentProvider(configValues) || 'custom';
      configValues.push(`model_provider=${provider}`);
      configValues.push(`model_providers.${provider}.base_url=${requireValue(value, values)}`);
    } else if (value === '--wire-api') {
      const provider = currentProvider(configValues) || 'custom';
      configValues.push(`model_provider=${provider}`);
      configValues.push(`model_providers.${provider}.wire_api=${requireValue(value, values)}`);
    } else if (value === '--config-path') {
      configPath = requireValue(value, values);
    } else if (value === '-c' || value === '--config') {
      configValues.push(requireValue(value, values));
    } else if (value === '-h' || value === '--help') {
      help = true;
    } else {
      promptParts.push(value);
    }
  }

  return {
    print,
    help,
    command,
    configPath,
    configOverrides: parseConfigOverrides(configValues),
    prompt: promptParts.join(' ').trim()
  };
}

async function runInteractive({ runtime, runtimeError = null, initialPrompt, streams }) {
  const state = { lastResult: null, requests: 0, runtime, runtimeError };
  streams.output.write(`${APP_NAME}\n`);
  streams.output.write(`cwd: ${process.cwd()}\n`);
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
  if (line === '/exit' || line === '/quit') {
    streams.output.write('bye\n');
    return true;
  }
  if (line === '/help') {
    streams.output.write(`${HELP}\n`);
    return false;
  }
  if (line === '/providers') {
    streams.output.write(`${renderProviderList()}\n`);
    return false;
  }
  if (line.startsWith('/init')) {
    const tokens = line.slice('/init'.length).trim().split(/\s+/).filter(Boolean);
    const parsed = parseArgs(['init', ...initArgsFromTokens(tokens)]);
    try {
      const result = writeConfigFromArgs(parsed);
      state.runtime = makeRuntime({ noModel: false, configPath: null, configOverrides: {} });
      state.runtimeError = null;
      streams.output.write(`${initHint(result)}\n`);
      streams.output.write(`${runtimeSummary(state)}\n`);
    } catch (error) {
      streams.output.write(`init failed: ${error.message}\n`);
    }
    return false;
  }
  if (line === '/status') {
    streams.output.write(
      `status: requests=${state.requests} last=${state.lastResult?.status || 'none'} ${runtimeStatus(state)}\n`
    );
    return false;
  }
  if (line === '/json') {
    streams.output.write(
      state.lastResult ? `${JSON.stringify(state.lastResult, null, 2)}\n` : 'No result yet.\n'
    );
    return false;
  }
  if (line === '/clear') {
    state.lastResult = null;
    streams.output.write('cleared\n');
    return false;
  }
  if (line.startsWith('!')) {
    streams.output.write('Shell execution is not available in N-Plan; describe the task instead.\n');
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
    state.lastResult = await state.runtime.agent.analyzeAsync(prompt);
    state.requests += 1;
    streams.output.write(`${renderInteractiveResult(state.lastResult)}\n`);
  } catch (error) {
    streams.output.write(`analysis failed: ${error.message}\n`);
  }
}

export function renderInteractiveResult(result) {
  const lines = [`status: ${result.status}`];
  if (result.taskspec?.inferred_goal) lines.push(`goal: ${result.taskspec.inferred_goal}`);

  if (result.status === 'needs_clarification') {
    const questions = result.clarification_questions || result.taskspec?.clarification?.questions || [];
    if (questions.length) {
      lines.push('', 'clarification needed:');
      for (const question of questions) lines.push(`- ${question}`);
    }
    lines.push('', 'No task plan was produced yet.');
    lines.push('Full JSON: /json');
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

  lines.push('', 'Full JSON: /json');
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
    throw new Error(
      `model configuration is required. Run "${BIN_NAME} init --provider <id> --model <name>" or pass --model/--provider.`
    );
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

function setupRequiredMessage(error) {
  const detail = error ? ` (${error})` : '';
  return `Model setup required${detail}. Run /init ollama qwen2.5 or ${BIN_NAME} init --provider ollama --model qwen2.5.`;
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

function initArgsFromTokens(tokens) {
  if (!tokens[0]) return [];
  if (tokens[0].startsWith('-')) return tokens;
  const args = ['--provider', tokens[0]];
  if (tokens[1]) args.push('--model', tokens[1]);
  return args;
}

function requireValue(flag, values) {
  if (!values.length || values[0].startsWith('-')) throw new Error(`${flag} requires a value`);
  return values.shift();
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main();
  process.exitCode = code;
}
