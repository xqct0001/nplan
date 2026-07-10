import readline from 'node:readline';

import { BUILTIN_MODEL_PROVIDERS } from './model-config.js';
import { formatModelError } from './model-errors.js';
import { listProviderChoices, writeProjectModelConfig } from './model-init.js';

const DEFAULT_WIRE_API = 'chat_completions';
const MAX_MODEL_CHOICES = 30;

export async function runModelSetupWizard({
  streams,
  fetchImpl = globalThis.fetch,
  locale = 'zh-CN'
} = {}) {
  const output = streams?.output || process.stdout;
  const input = streams?.input || process.stdin;
  const ui = createQuestioner({ input, output });

  try {
    output.write('NPlan setup\n');
    output.write('This wizard configures one OpenAI-compatible model provider.\n\n');

    const { providerId, provider } = await chooseProvider(ui, output, locale);
    const apiKey = await askApiKey(ui, output, provider);
    const models = await maybeFetchModels({ ui, output, provider, apiKey, fetchImpl, locale });
    const model = await chooseModel(ui, output, provider, models);
    const providerOverrides = { ...provider };

    if (apiKey && provider.env_key) {
      const saveKey = await confirm(
        ui,
        'Save this API key in .nplan/config.toml? .nplan is ignored by git in this project',
        false,
        locale
      );
      if (saveKey) providerOverrides.api_key = apiKey;
    }

    const result = writeProjectModelConfig({
      providerId,
      model,
      providerOverrides
    });

    output.write(locale === 'en' ? '\nSetup complete.\n' : '\n配置完成 / Setup complete.\n');
    output.write(`Configured ${result.providerId} (${result.model}) in ${result.configPath}.\n`);
    if (apiKey && provider.env_key && !providerOverrides.api_key) {
      output.write(`Run this before using NPlan in CMD:\nset ${provider.env_key}=<your-key>\n`);
    } else if (provider.env_key && !apiKey) {
      output.write(`Before using NPlan in CMD, run: set ${provider.env_key}=<your-key>\n`);
    } else if (!provider.env_key) {
      output.write(`Make sure the local service is running at ${provider.base_url}.\n`);
    }
    output.write('Try it:\nnplan -p "Plan a local knowledge base organizer"\n');
    return result;
  } finally {
    ui.close();
  }
}

export async function fetchProviderModels({ provider, apiKey = '', fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available in this Node.js runtime');
  const url = provider.models_url || modelListUrl(provider.base_url);
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(Number(provider.timeout_ms || 60000))
  });
  if (!response.ok) {
    const error = new Error(`model list returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return extractModelIds(await response.json());
}

export function extractModelIds(payload) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  const ids = candidates
    .map((item) => (typeof item === 'string' ? item : item?.id || item?.name || item?.model))
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim());
  return [...new Set(ids)];
}

export function modelListUrl(baseUrl) {
  return `${String(baseUrl || '').replace(/\/$/, '')}/models`;
}

async function chooseProvider(ui, output, locale) {
  const groups = listProviderChoices();
  const providers = [];
  output.write(locale === 'en' ? 'Recommended cloud providers:\n' : '推荐云端 Provider：\n');
  appendProviderGroup(output, groups.recommended, providers, locale);
  output.write(locale === 'en' ? 'Local providers:\n' : '本地 Provider：\n');
  appendProviderGroup(output, groups.local, providers, locale);
  output.write(locale === 'en' ? 'More providers:\n' : '更多 Provider：\n');
  appendProviderGroup(output, groups.more, providers, locale);
  output.write(`${providers.length + 1}. custom - Custom OpenAI-compatible endpoint\n\n`);

  while (true) {
    const answer = await ui.ask('Choose provider number or id / 请选择服务商', 'deepseek');
    const selected = resolveProviderChoice(answer, providers);
    if (selected) {
      return {
        providerId: selected.id,
        provider: {
          ...BUILTIN_MODEL_PROVIDERS[selected.id],
          models_url: BUILTIN_MODEL_PROVIDERS[selected.id].models_url || modelListUrl(selected.base_url)
        }
      };
    }
    if (answer.trim().toLowerCase() === 'custom' || answer.trim() === String(providers.length + 1)) break;
    output.write(locale === 'en'
      ? 'Unknown choice. Please choose again.\n'
      : '无法识别，请重新选择。\n');
  }

  const baseUrl = await ui.ask('Base URL, for example https://api.example.com/v1');
  const id = (await ui.ask('Provider id', 'custom')).replace(/[^\w-]/g, '_') || 'custom';
  const name = await ui.ask('Provider display name', id);
  const envKey = await ui.ask('API key environment variable name', `${id.toUpperCase()}_API_KEY`);
  const wireApi = await ui.ask('Wire API (chat_completions or responses)', DEFAULT_WIRE_API);
  const modelsUrl = await ui.ask('Model list URL', modelListUrl(baseUrl));
  const apiKeyUrl = await ui.ask('API key page URL (optional)', '');

  return {
    providerId: id,
    provider: {
      name,
      base_url: baseUrl,
      env_key: envKey,
      wire_api: wireApi || DEFAULT_WIRE_API,
      models_url: modelsUrl,
      api_key_url: apiKeyUrl,
      request_max_retries: 2,
      timeout_ms: 60000,
      default_model: 'local-model'
    }
  };
}

function appendProviderGroup(output, group, providers, locale) {
  for (const provider of group) {
    providers.push(provider);
    const login = provider.env_key ? provider.env_key : (locale === 'en' ? 'local service' : '本地服务');
    output.write(
      `${providers.length}. ${provider.id} - ${provider.name} (${login}, default ${provider.default_model})\n`
    );
  }
}

function resolveProviderChoice(answer, providers) {
  const value = answer.trim();
  const number = Number(value);
  if (Number.isInteger(number) && number >= 1 && number <= providers.length) return providers[number - 1];
  return providers.find((provider) => provider.id === value);
}

async function askApiKey(ui, output, provider) {
  if (!provider.env_key) return '';
  if (provider.api_key_url) output.write(`API key page: ${provider.api_key_url}\n`);
  const existing = process.env[provider.env_key];
  const hint = existing ? `Press Enter to use current $env:${provider.env_key}` : 'Press Enter to skip';
  const entered = await askSecret(
    { input: ui.input, output, rl: ui },
    `${provider.env_key} SK/API key (${hint})`
  );
  return entered || existing || '';
}

export function askSecret({ input, output, rl }, prompt) {
  if (!input?.isTTY || !output?.isTTY || typeof input.setRawMode !== 'function') {
    return rl.ask(prompt, '');
  }
  if (typeof rl.askSecret !== 'function') {
    throw new TypeError('TTY questioner does not support secret input');
  }
  return rl.askSecret(prompt);
}

async function maybeFetchModels({ ui, output, provider, apiKey, fetchImpl, locale }) {
  const modelsUrl = provider.models_url || modelListUrl(provider.base_url);
  const shouldFetch = await confirm(ui, `Fetch model list from ${modelsUrl}`, true, locale);
  if (!shouldFetch) return [];

  try {
    const models = await fetchProviderModels({
      provider: { ...provider, models_url: modelsUrl },
      apiKey,
      fetchImpl
    });
    if (models.length) {
      output.write(`Found ${models.length} model(s).\n`);
      return models;
    }
    output.write('No models were returned; use manual model input.\n');
    return [];
  } catch (error) {
    output.write(`Could not fetch models.\n${formatModelError(error, locale)}\n`);
    output.write('Use the default model or type a model name manually.\n');
    return [];
  }
}

async function chooseModel(ui, output, provider, models) {
  if (models.length) {
    output.write('Models:\n');
    models.slice(0, MAX_MODEL_CHOICES).forEach((model, index) => {
      output.write(`${index + 1}. ${model}\n`);
    });
    if (models.length > MAX_MODEL_CHOICES) {
      output.write(`... ${models.length - MAX_MODEL_CHOICES} more hidden. Type the model name manually if needed.\n`);
    }
    const answer = await ui.ask('Choose model number or type model id', provider.default_model || models[0]);
    const number = Number(answer);
    if (Number.isInteger(number) && number >= 1 && number <= Math.min(models.length, MAX_MODEL_CHOICES)) {
      return models[number - 1];
    }
    return answer;
  }
  return ui.ask('Model name', provider.default_model || 'local-model');
}

async function confirm(ui, prompt, defaultValue = false, locale = 'zh-CN') {
  const suffix = defaultValue ? 'Y/n' : 'y/N';
  while (true) {
    const answer = await ui.ask(`${prompt} (${suffix})`, defaultValue ? 'Y' : 'N');
    const parsed = parseConfirmation(answer, defaultValue);
    if (parsed !== null) return parsed;
    ui.output.write(locale === 'en'
      ? 'Please answer yes or no.\n'
      : '请输入“是”或“否”（也可输入 y/n）。\n');
  }
}

export function parseConfirmation(value, defaultValue = false) {
  const answer = String(value || '').trim().toLowerCase();
  if (!answer) return defaultValue;
  if (['y', 'yes', '是', '好', '确认'].includes(answer)) return true;
  if (['n', 'no', '否', '取消'].includes(answer)) return false;
  return null;
}

function createQuestioner({ input, output }) {
  if (input.isTTY && output.isTTY && typeof input.setRawMode === 'function') {
    return createTtyQuestioner({ input, output });
  }
  const rl = readline.createInterface({
    input,
    terminal: false
  });
  const lines = [];
  const waiters = [];
  let closed = false;

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()('');
  });

  return {
    input,
    output,
    ask(prompt, defaultValue = '') {
      const label = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
      output.write(label);
      if (lines.length) {
        const answer = lines.shift().trim();
        return Promise.resolve(answer || defaultValue);
      }
      if (closed) return Promise.resolve(defaultValue);
      return new Promise((resolve) => {
        waiters.push((line) => {
          const answer = line.trim();
          resolve(answer || defaultValue);
        });
      });
    },
    close() {
      rl.close();
    }
  };
}

function createTtyQuestioner({ input, output }) {
  const lines = [];
  const waiters = [];
  let lineBuffer = '';
  let closed = false;
  let secret = null;
  let swallowLineFeed = false;

  const restoreRawMode = () => {
    if (!secret?.raw) return;
    secret.raw = false;
    try {
      input.setRawMode(false);
    } catch {
      // The input may already be closed; the internal state still must unwind.
    }
  };

  const finishSecret = (error = null) => {
    const active = secret;
    if (!active) return;
    restoreRawMode();
    secret = null;
    output.write('\n');
    if (error) active.reject(error);
    else active.resolve(active.value.trim());
  };

  const deliverLine = (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line.trim() || waiter.defaultValue);
    else lines.push(line.trim());
  };

  const onData = (chunk) => {
    for (const char of chunk.toString()) {
      if (swallowLineFeed && char === '\n') {
        swallowLineFeed = false;
        continue;
      }
      swallowLineFeed = false;
      if (secret) {
        if (char === '\u0003') {
          const error = new Error('setup cancelled');
          error.code = 'setup_cancelled';
          finishSecret(error);
        } else if (char === '\r' || char === '\n') {
          swallowLineFeed = char === '\r';
          finishSecret();
        } else if (char === '\u007f' || char === '\b') {
          if (secret.value) {
            secret.value = secret.value.slice(0, -1);
            output.write('\b \b');
          }
        } else {
          secret.value += char;
          output.write('*');
        }
        continue;
      }
      if (char === '\u0003') {
        const waiter = waiters.shift();
        const error = new Error('setup cancelled');
        error.code = 'setup_cancelled';
        if (waiter) waiter.reject(error);
        continue;
      }
      if (char === '\n') {
        deliverLine(lineBuffer);
        lineBuffer = '';
      } else if (char !== '\r') {
        lineBuffer += char;
      }
    }
  };

  const onEnd = () => {
    if (secret) finishSecret();
    if (lineBuffer) deliverLine(lineBuffer);
    lineBuffer = '';
    closed = true;
    while (waiters.length) {
      const waiter = waiters.shift();
      waiter.resolve(waiter.defaultValue);
    }
  };

  const onError = (error) => {
    if (secret) finishSecret(error);
    closed = true;
    while (waiters.length) waiters.shift().reject(error);
  };

  input.on('data', onData);
  input.once('end', onEnd);
  input.once('error', onError);

  return {
    input,
    output,
    ask(prompt, defaultValue = '') {
      const label = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
      output.write(label);
      if (lines.length) return Promise.resolve(lines.shift() || defaultValue);
      if (closed) return Promise.resolve(defaultValue);
      return new Promise((resolve, reject) => waiters.push({ resolve, reject, defaultValue }));
    },
    askSecret(prompt) {
      output.write(`${prompt}: `);
      if (closed) return Promise.resolve('');
      return new Promise((resolve, reject) => {
        secret = { value: '', resolve, reject, raw: true };
        try {
          input.setRawMode(true);
          input.resume?.();
        } catch (error) {
          finishSecret(error);
        }
      });
    },
    close() {
      if (secret) {
        const error = new Error('setup cancelled');
        error.code = 'setup_cancelled';
        finishSecret(error);
      }
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      closed = true;
      while (waiters.length) {
        const waiter = waiters.shift();
        waiter.resolve(waiter.defaultValue);
      }
    }
  };
}
