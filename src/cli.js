#!/usr/bin/env node
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalPlanningAgent } from './agent.js';
import { OpenAICompatibleTaskModel } from './model-client.js';
import { loadModelConfig, parseConfigOverrides } from './model-config.js';

const HELP = `Usage: local-task-agent [options] [prompt]

Options:
  -p, --print       Print one JSON result and exit
  --model <name>    Use a model for semantic task understanding
  --provider <id>   Select model provider (openai, openrouter, ollama, lmstudio, custom)
  --config-path <p> Load Codex-style model config TOML
  -c key=value      Override config, supports dotted keys
  --no-model        Force local rule-based understanding
  -h, --help        Show this help

Interactive commands:
  /help             Show commands
  /status           Show session status
  /plan <prompt>    Analyze a prompt and print the plan JSON
  /clear            Clear the last result
  /exit, /quit      Exit the session

Notes:
  Plain text in interactive mode behaves like /plan <prompt>.
  Shell execution with ! is intentionally unsupported.`;

export async function main(argv = process.argv.slice(2), streams = { input, output, error: process.stderr }) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    streams.output.write(`${HELP}\n`);
    return 0;
  }

  const agent = makeAgent(parsed);
  if (parsed.print) {
    const stdinText = await readAll(streams.input);
    const prompt = promptWithStdin(parsed.prompt, stdinText);
    if (!prompt) {
      streams.error.write('Usage: local-task-agent -p "<prompt>"\n');
      return 1;
    }
    streams.output.write(`${JSON.stringify(await agent.analyzeAsync(prompt), null, 2)}\n`);
    return 0;
  }

  await runInteractive({ agent, initialPrompt: parsed.prompt, streams });
  return 0;
}

export function parseArgs(argv) {
  const values = [...argv];
  let print = false;
  let help = false;
  let noModel = false;
  let configPath = null;
  const configValues = [];
  const promptParts = [];

  while (values.length) {
    const value = values.shift();
    if (value === '-p' || value === '--print') {
      print = true;
    } else if (value === '--no-model') {
      noModel = true;
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
    noModel,
    configPath,
    configOverrides: parseConfigOverrides(configValues),
    prompt: promptParts.join(' ').trim()
  };
}

async function runInteractive({ agent, initialPrompt, streams }) {
  const state = { lastResult: null, requests: 0 };
  streams.output.write('local-task-agent-js\n');
  streams.output.write('mode: interactive\n');
  streams.output.write('Type /help for commands. Type /exit to quit.\n');

  if (initialPrompt) {
    state.lastResult = await agent.analyzeAsync(initialPrompt);
    state.requests += 1;
    streams.output.write(`${JSON.stringify(state.lastResult, null, 2)}\n`);
  }

  const rl = readline.createInterface({
    input: streams.input,
    output: streams.output,
    prompt: '> ',
    terminal: Boolean(streams.input.isTTY && streams.output.isTTY)
  });

  rl.prompt();
  for await (const rawLine of rl) {
    const shouldExit = await handleInteractiveLine(rawLine.trim(), { agent, state, streams });
    if (shouldExit) {
      rl.close();
      break;
    }
    rl.prompt();
  }
}

async function handleInteractiveLine(line, { agent, state, streams }) {
  if (!line) return false;
  if (line === '/exit' || line === '/quit') {
    streams.output.write('bye\n');
    return true;
  }
  if (line === '/help') {
    streams.output.write(`${HELP}\n`);
    return false;
  }
  if (line === '/status') {
    streams.output.write(
      `status: requests=${state.requests} last=${state.lastResult?.status || 'none'}\n`
    );
    return false;
  }
  if (line === '/clear') {
    state.lastResult = null;
    streams.output.write('cleared\n');
    return false;
  }
  if (line.startsWith('!')) {
    streams.output.write('Shell execution is not supported by this planning-only agent.\n');
    return false;
  }

  const prompt = line.startsWith('/plan ') ? line.slice('/plan '.length).trim() : line;
  if (!prompt) {
    streams.output.write('Usage: /plan <prompt>\n');
    return false;
  }

  state.lastResult = await agent.analyzeAsync(prompt);
  state.requests += 1;
  streams.output.write(`${JSON.stringify(state.lastResult, null, 2)}\n`);
  return false;
}

function makeAgent(parsed) {
  if (parsed.noModel) return new LocalPlanningAgent();
  const config = loadModelConfig.sync({
    configPath: parsed.configPath,
    overrides: parsed.configOverrides
  });
  if (!config.model) return new LocalPlanningAgent();
  return new LocalPlanningAgent({
    modelClient: new OpenAICompatibleTaskModel({ config })
  });
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
