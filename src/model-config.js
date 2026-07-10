import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BUILTIN_MODEL_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    context_location: 'cloud',
    base_url: 'https://api.openai.com/v1',
    env_key: 'OPENAI_API_KEY',
    wire_api: 'responses',
    models_url: 'https://api.openai.com/v1/models',
    api_key_url: 'https://platform.openai.com/settings/organization/api-keys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'gpt-5.5'
  },
  openrouter: {
    name: 'OpenRouter',
    context_location: 'cloud',
    base_url: 'https://openrouter.ai/api/v1',
    env_key: 'OPENROUTER_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://openrouter.ai/api/v1/models',
    api_key_url: 'https://openrouter.ai/settings/keys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'anthropic/claude-sonnet-4'
  },
  ollama: {
    name: 'Ollama',
    context_location: 'local',
    base_url: 'http://localhost:11434/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000,
    default_model: 'qwen2.5'
  },
  lmstudio: {
    name: 'LM Studio',
    context_location: 'local',
    base_url: 'http://localhost:1234/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000,
    default_model: 'local-model'
  },
  vllm: {
    name: 'vLLM',
    context_location: 'local',
    base_url: 'http://localhost:8000/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000,
    default_model: 'Qwen/Qwen2.5-7B-Instruct'
  },
  llamacpp: {
    name: 'llama.cpp server',
    context_location: 'local',
    base_url: 'http://localhost:8080/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000,
    default_model: 'local-model'
  },
  localai: {
    name: 'LocalAI',
    context_location: 'local',
    base_url: 'http://localhost:8080/v1',
    wire_api: 'chat_completions',
    request_max_retries: 0,
    timeout_ms: 120000,
    default_model: 'local-model'
  },
  dashscope: {
    name: 'Alibaba Cloud DashScope',
    context_location: 'cloud',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    env_key: 'DASHSCOPE_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    api_key_url: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'qwen-plus'
  },
  tongyi: {
    name: 'Tongyi Qianwen',
    context_location: 'cloud',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    env_key: 'DASHSCOPE_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    api_key_url: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'qwen-plus'
  },
  qwen: {
    name: 'Qwen via DashScope',
    context_location: 'cloud',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    env_key: 'DASHSCOPE_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    api_key_url: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'qwen-plus'
  },
  deepseek: {
    name: 'DeepSeek',
    context_location: 'cloud',
    base_url: 'https://api.deepseek.com',
    env_key: 'DEEPSEEK_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://api.deepseek.com/models',
    api_key_url: 'https://platform.deepseek.com/api_keys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'deepseek-v4-flash'
  },
  moonshot: {
    name: 'Moonshot AI',
    context_location: 'cloud',
    base_url: 'https://api.moonshot.cn/v1',
    env_key: 'MOONSHOT_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://api.moonshot.cn/v1/models',
    api_key_url: 'https://platform.kimi.com/console/api-keys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'moonshot-v1-8k'
  },
  kimi: {
    name: 'Kimi via Moonshot AI',
    context_location: 'cloud',
    base_url: 'https://api.moonshot.cn/v1',
    env_key: 'MOONSHOT_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://api.moonshot.cn/v1/models',
    api_key_url: 'https://platform.kimi.com/console/api-keys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'moonshot-v1-8k'
  },
  zhipu: {
    name: 'Zhipu AI',
    context_location: 'cloud',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    env_key: 'ZHIPUAI_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://open.bigmodel.cn/api/paas/v4/models',
    api_key_url: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'glm-4-flash'
  },
  bigmodel: {
    name: 'BigModel / Zhipu AI',
    context_location: 'cloud',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    env_key: 'ZHIPUAI_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://open.bigmodel.cn/api/paas/v4/models',
    api_key_url: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'glm-4-flash'
  },
  glm: {
    name: 'GLM via Zhipu AI',
    context_location: 'cloud',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    env_key: 'ZHIPUAI_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://open.bigmodel.cn/api/paas/v4/models',
    api_key_url: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'glm-4-flash'
  },
  qianfan: {
    name: 'Baidu Qianfan',
    context_location: 'cloud',
    base_url: 'https://qianfan.baidubce.com/v2',
    env_key: 'QIANFAN_API_KEY',
    wire_api: 'chat_completions',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'ernie-4.0-turbo-8k'
  },
  wenxin: {
    name: 'Wenxin via Baidu Qianfan',
    context_location: 'cloud',
    base_url: 'https://qianfan.baidubce.com/v2',
    env_key: 'QIANFAN_API_KEY',
    wire_api: 'chat_completions',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'ernie-4.0-turbo-8k'
  },
  volcengine_ark: {
    name: 'Volcengine Ark',
    context_location: 'cloud',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    env_key: 'ARK_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://ark.cn-beijing.volces.com/api/v3/models',
    api_key_url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'doubao-seed-1-6-250615'
  },
  doubao: {
    name: 'Doubao via Volcengine Ark',
    context_location: 'cloud',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    env_key: 'ARK_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://ark.cn-beijing.volces.com/api/v3/models',
    api_key_url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'doubao-seed-1-6-250615'
  },
  tencent_hunyuan: {
    name: 'Tencent Hunyuan',
    context_location: 'cloud',
    base_url: 'https://api.hunyuan.cloud.tencent.com/v1',
    env_key: 'HUNYUAN_API_KEY',
    wire_api: 'chat_completions',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'hunyuan-turbos-latest'
  },
  hunyuan: {
    name: 'Hunyuan via Tencent',
    context_location: 'cloud',
    base_url: 'https://api.hunyuan.cloud.tencent.com/v1',
    env_key: 'HUNYUAN_API_KEY',
    wire_api: 'chat_completions',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'hunyuan-turbos-latest'
  },
  siliconflow: {
    name: 'SiliconFlow',
    context_location: 'cloud',
    base_url: 'https://api.siliconflow.cn/v1',
    env_key: 'SILICONFLOW_API_KEY',
    wire_api: 'chat_completions',
    models_url: 'https://api.siliconflow.cn/v1/models',
    api_key_url: 'https://cloud.siliconflow.cn/account/ak',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'Qwen/Qwen2.5-7B-Instruct'
  },
  minimax: {
    name: 'MiniMax',
    context_location: 'cloud',
    base_url: 'https://api.minimax.chat/v1',
    env_key: 'MINIMAX_API_KEY',
    wire_api: 'chat_completions',
    response_format: 'none',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'MiniMax-M1'
  },
  baichuan: {
    name: 'Baichuan AI',
    context_location: 'cloud',
    base_url: 'https://api.baichuan-ai.com/v1',
    env_key: 'BAICHUAN_API_KEY',
    wire_api: 'chat_completions',
    response_format: 'none',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'Baichuan4-Turbo'
  },
  yi: {
    name: '01.AI Yi',
    context_location: 'cloud',
    base_url: 'https://api.lingyiwanwu.com/v1',
    env_key: 'YI_API_KEY',
    wire_api: 'chat_completions',
    response_format: 'none',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'yi-large'
  },
  stepfun: {
    name: 'StepFun',
    context_location: 'cloud',
    base_url: 'https://api.stepfun.com/v1',
    env_key: 'STEPFUN_API_KEY',
    wire_api: 'chat_completions',
    response_format: 'none',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'step-1-8k'
  },
  modelscope: {
    name: 'ModelScope',
    context_location: 'cloud',
    base_url: 'https://api-inference.modelscope.cn/v1',
    env_key: 'MODELSCOPE_API_KEY',
    wire_api: 'chat_completions',
    response_format: 'none',
    request_max_retries: 2,
    timeout_ms: 60000,
    default_model: 'Qwen/Qwen2.5-7B-Instruct'
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
  const home = env.NPLAN_HOME || env.USERPROFILE || env.HOME;
  return [
    resolve('.nplan/config.toml'),
    home ? join(home, '.nplan', 'config.toml') : null
  ];
}

function configFromEnv(env) {
  const config = { env };
  const envModel = env.NPLAN_MODEL;
  const envProvider = env.NPLAN_MODEL_PROVIDER;
  const envBaseUrl = env.NPLAN_BASE_URL;
  const envWireApi = env.NPLAN_WIRE_API;
  if (envModel) config.model = envModel;
  if (envProvider) config.model_provider = envProvider;
  if (envBaseUrl) {
    setDotted(config, `model_providers.${envProvider || 'custom'}.base_url`, envBaseUrl);
    config.model_provider = envProvider || 'custom';
  }
  if (envWireApi) {
    setDotted(config, `model_providers.${envProvider || config.model_provider || 'custom'}.wire_api`, envWireApi);
  }
  return config;
}

function mergeConfig(...configs) {
  const output = {};
  for (const config of configs) {
    const source = config || {};
    const urlOverrides = providerUrlOverridesWithoutLocation(output, source);
    deepMerge(output, source);
    for (const providerId of urlOverrides) delete output.model_providers[providerId].context_location;
  }
  output.env = configs.find((config) => config?.env)?.env || process.env;
  return output;
}

function providerUrlOverridesWithoutLocation(target, source) {
  const providerIds = [];
  for (const [providerId, provider] of Object.entries(source.model_providers || {})) {
    const inherited = target.model_providers?.[providerId];
    if (!plainObject(provider) || !plainObject(inherited)) continue;
    if (!Object.hasOwn(provider, 'base_url') || Object.hasOwn(provider, 'context_location')) continue;
    if (provider.base_url !== inherited.base_url) providerIds.push(providerId);
  }
  return providerIds;
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
