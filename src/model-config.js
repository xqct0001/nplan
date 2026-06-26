import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BUILTIN_MODEL_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    env_key: 'OPENAI_API_KEY',
    wire_api: 'responses',
    request_max_retries: 2,
    timeout_ms: 60000
  },
  openrouter: {
    name: 'OpenRouter',
    base_url: 'https://openrouter.ai/api/v1',
    env_key: 'OPENROUTER_API_KEY',
    wire_api: 'chat_completions',
    request_max_retries: 2,
    timeout_ms: 60000
  },
  ollama: {
    name: 'Ollama',
    base_url: 'http://localhost:11434/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000
  },
  lmstudio: {
    name: 'LM Studio',
    base_url: 'http://localhost:1234/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000
  }
};

const DEFAULT_CONFIG = {
  model: null,
  model_provider: 'openai',
  model_temperature: 0.1,
  model_max_output_tokens: 2000,
  model_providers: BUILTIN_MODEL_PROVIDERS
};

export async function loadModelConfig(options = {}) {
  return loadModelConfigSync(options);
}

loadModelConfig.sync = loadModelConfigSync;

export function loadModelConfigSync({ configPath, env = process.env, overrides = {} } = {}) {
  const fileConfig = readConfigFile(configPath, env);
  const envConfig = configFromEnv(env);
  return mergeConfig(DEFAULT_CONFIG, fileConfig, envConfig, overrides);
}

export function resolveModelProvider(config, providerId = config.model_provider) {
  const provider = config.model_providers?.[providerId];
  if (!provider) throw new Error(`unknown model provider: ${providerId}`);
  const apiKey = provider.apiKey || provider.api_key || (provider.env_key ? config.env?.[provider.env_key] : undefined);
  const envHeaders = {};
  for (const [name, envKey] of Object.entries(provider.env_http_headers || {})) {
    if (config.env?.[envKey]) envHeaders[name] = config.env[envKey];
  }
  return {
    id: providerId,
    ...provider,
    apiKey,
    http_headers: { ...(provider.http_headers || {}), ...envHeaders },
    query_params: provider.query_params || {}
  };
}

export function parseConfigOverrides(values = []) {
  const config = {};
  for (const value of values) {
    const index = value.indexOf('=');
    if (index === -1) throw new Error(`invalid config override: ${value}`);
    setDotted(config, value.slice(0, index), parseValue(value.slice(index + 1)));
  }
  return config;
}

export function parseToml(text) {
  const root = {};
  let current = root;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = ensurePath(root, section[1].split('.'));
      continue;
    }
    const index = line.indexOf('=');
    if (index === -1) continue;
    current[line.slice(0, index).trim()] = parseValue(line.slice(index + 1).trim());
  }
  return root;
}

function readConfigFile(configPath, env) {
  const paths = configPath ? [configPath] : defaultConfigPaths(env);
  for (const file of paths) {
    if (file && existsSync(file)) return parseToml(readFileSync(file, 'utf8'));
  }
  return {};
}

function defaultConfigPaths(env) {
  const home = env.LOCAL_TASK_AGENT_HOME || env.USERPROFILE || env.HOME;
  return [resolve('.local-task-agent/config.toml'), home ? join(home, '.local-task-agent', 'config.toml') : null];
}

function configFromEnv(env) {
  const config = { env };
  if (env.LOCAL_TASK_AGENT_MODEL) config.model = env.LOCAL_TASK_AGENT_MODEL;
  if (env.LOCAL_TASK_AGENT_MODEL_PROVIDER) config.model_provider = env.LOCAL_TASK_AGENT_MODEL_PROVIDER;
  if (env.LOCAL_TASK_AGENT_BASE_URL) {
    setDotted(config, `model_providers.${env.LOCAL_TASK_AGENT_MODEL_PROVIDER || 'custom'}.base_url`, env.LOCAL_TASK_AGENT_BASE_URL);
    config.model_provider = env.LOCAL_TASK_AGENT_MODEL_PROVIDER || 'custom';
  }
  if (env.LOCAL_TASK_AGENT_WIRE_API) {
    setDotted(config, `model_providers.${env.LOCAL_TASK_AGENT_MODEL_PROVIDER || config.model_provider || 'custom'}.wire_api`, env.LOCAL_TASK_AGENT_WIRE_API);
  }
  return config;
}

function mergeConfig(...configs) {
  const output = {};
  for (const config of configs) deepMerge(output, config || {});
  output.env = configs.find((config) => config?.env)?.env || process.env;
  return output;
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (plainObject(value) && plainObject(target[key])) {
      deepMerge(target[key], value);
    } else if (plainObject(value)) {
      target[key] = deepMerge({}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function ensurePath(root, parts) {
  let cursor = root;
  for (const part of parts) {
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  return cursor;
}

function setDotted(root, dotted, value) {
  const parts = dotted.split('.');
  const last = parts.pop();
  ensurePath(root, parts)[last] = value;
}

function stripComment(line) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"' && line[index - 1] !== '\\') quoted = !quoted;
    if (!quoted && line[index] === '#') return line.slice(0, index);
  }
  return line;
}

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const body = value.slice(1, -1).trim();
    return body ? splitTopLevel(body).map(parseValue) : [];
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    const object = {};
    const body = value.slice(1, -1).trim();
    for (const item of body ? splitTopLevel(body) : []) {
      const index = item.indexOf('=');
      object[item.slice(0, index).trim().replace(/^"|"$/g, '')] = parseValue(item.slice(index + 1));
    }
    return object;
  }
  return value;
}

function splitTopLevel(text) {
  const parts = [];
  let quoted = false;
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index - 1] !== '\\') quoted = !quoted;
    if (!quoted && (char === '[' || char === '{')) depth += 1;
    if (!quoted && (char === ']' || char === '}')) depth -= 1;
    if (!quoted && depth === 0 && char === ',') {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
