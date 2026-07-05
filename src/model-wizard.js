import readline from 'node:readline';

import { BUILTIN_MODEL_PROVIDERS } from './model-config.js';
import { listProviderChoices, writeProjectModelConfig } from './model-init.js';

const DEFAULT_WIRE_API = 'chat_completions';
const MAX_MODEL_CHOICES = 30;

export async function runModelSetupWizard({ streams, fetchImpl = globalThis.fetch } = {}) {
  const output = streams?.output || process.stdout;
  const input = streams?.input || process.stdin;
  const ui = createQuestioner({ input, output });

  try {
    output.write('NPlan setup\n');
    output.write('This wizard configures one OpenAI-compatible model provider.\n\n');

    const { providerId, provider } = await chooseProvider(ui, output);
    const apiKey = await askApiKey(ui, output, provider);
    const models = await maybeFetchModels({ ui, output, provider, apiKey, fetchImpl });
    const model = await chooseModel(ui, output, provider, models);
    const providerOverrides = { ...provider };

    if (apiKey && provider.env_key) {
      const saveKey = await confirm(
        ui,
        'Save this API key in .nplan/config.toml? .nplan is ignored by git in this project',
        false
      );
      if (saveKey) providerOverrides.api_key = apiKey;
    }

    const result = writeProjectModelConfig({
      providerId,
      model,
      providerOverrides
    });

    output.write('\nSetup complete.\n');
    output.write(`Configured ${result.providerId} (${result.model}) in ${result.configPath}.\n`);
    if (apiKey && provider.env_key && !providerOverrides.api_key) {
      output.write(`Run this before using NPlan:\n$env:${provider.env_key} = "<your-key>"\n`);
    } else if (provider.env_key && !apiKey) {
      output.write(`Before using NPlan, set $env:${provider.env_key} = "<your-key>".\n`);
    } else if (!provider.env_key) {
      output.write(`Make sure the local service is running at ${provider.base_url}.\n`);
    }
    output.write('Try it:\nnplan.cmd -p "Plan a local knowledge base organizer"\n');
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
  if (!response.ok) throw new Error(`model list returned HTTP ${response.status}`);
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

async function chooseProvider(ui, output) {
  const providers = listProviderChoices();
  output.write('Providers:\n');
  providers.forEach((provider, index) => {
    const login = provider.env_key ? provider.env_key : 'local service';
    output.write(`${index + 1}. ${provider.id} - ${provider.name} (${login}, default ${provider.default_model})\n`);
  });
  output.write(`${providers.length + 1}. custom - Custom OpenAI-compatible endpoint\n\n`);

  const answer = await ui.ask('Choose provider number or id', 'deepseek');
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
  if (answer.trim().toLowerCase() !== 'custom' && answer.trim() !== String(providers.length + 1)) {
    output.write(`Unknown provider "${answer}", switching to custom setup.\n`);
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
  const entered = await ui.ask(`${provider.env_key} SK/API key (${hint})`, '');
  return entered || existing || '';
}

async function maybeFetchModels({ ui, output, provider, apiKey, fetchImpl }) {
  const modelsUrl = provider.models_url || modelListUrl(provider.base_url);
  const shouldFetch = await confirm(ui, `Fetch model list from ${modelsUrl}`, true);
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
    output.write(`Could not fetch models: ${error.message}\n`);
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

async function confirm(ui, prompt, defaultValue = false) {
  const suffix = defaultValue ? 'Y/n' : 'y/N';
  const answer = (await ui.ask(`${prompt} (${suffix})`, defaultValue ? 'Y' : 'N')).trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === 'y' || answer === 'yes';
}

function createQuestioner({ input, output }) {
  const rl = readline.createInterface({
    input,
    terminal: Boolean(input.isTTY && output.isTTY)
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
