import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { BUILTIN_MODEL_PROVIDERS, MODEL_PROVIDER_SETUP } from './model-config.js';

export const PROJECT_CONFIG_PATH = '.nplan/config.toml';

export function listProviderChoices() {
  return Object.fromEntries(
    ['recommended', 'local', 'more'].map((group) => [
      group,
      MODEL_PROVIDER_SETUP[group].map((id) => providerChoice(id, group))
    ])
  );
}

export function writeProjectModelConfig({
  providerId,
  model,
  providerOverrides = {},
  configPath = resolve(PROJECT_CONFIG_PATH)
}) {
  const provider = {
    ...BUILTIN_MODEL_PROVIDERS[providerId],
    ...providerOverrides
  };
  if (!providerId || !provider.base_url) throw new Error(`unknown or incomplete provider: ${providerId}`);
  const selectedModel = model || provider.default_model || 'local-model';
  const content = renderProjectConfig({ providerId, provider, model: selectedModel });

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, content, 'utf8');

  return { configPath, providerId, model: selectedModel, provider };
}

export function renderProviderList() {
  const choices = listProviderChoices();
  return [...choices.recommended, ...choices.local, ...choices.more]
    .map((provider) => {
      const login = provider.env_key ? `env ${provider.env_key}` : 'local service';
      return `${provider.id}\t${provider.default_model}\t${login}\t${provider.base_url}`;
    })
    .join('\n');
}

function providerChoice(id, category) {
  const provider = BUILTIN_MODEL_PROVIDERS[id];
  return {
    id,
    canonical_id: id,
    category,
    recommended: category === 'recommended',
    name: provider.name || id,
    base_url: provider.base_url,
    env_key: provider.env_key || '',
    default_model: provider.default_model || 'local-model',
    wire_api: provider.wire_api,
    models_url: provider.models_url || '',
    api_key_url: provider.api_key_url || ''
  };
}

export function initHint(result) {
  const lines = [`Configured ${result.providerId} (${result.model}) in ${result.configPath}.`];
  if (result.provider.env_key) {
    if (result.provider.api_key) {
      lines.push('Login: API key saved in the local project config.');
    } else {
      lines.push(`Login: in CMD, run set ${result.provider.env_key}=<your-key> before using NPlan.`);
    }
  } else {
    lines.push(`Login: make sure the local model service is running at ${result.provider.base_url}.`);
  }
  return lines.join('\n');
}

function renderProjectConfig({ providerId, provider, model }) {
  const lines = [
    `model = ${quote(model)}`,
    `model_provider = ${quote(providerId)}`,
    'model_temperature = 0.1',
    'model_max_output_tokens = 2000',
    '',
    `[model_providers.${providerId}]`,
    `name = ${quote(provider.name || providerId)}`,
    `base_url = ${quote(provider.base_url)}`,
    `wire_api = ${quote(provider.wire_api || 'chat_completions')}`,
    `request_max_retries = ${Number(provider.request_max_retries || 0)}`,
    `timeout_ms = ${Number(provider.timeout_ms || 60000)}`
  ];
  if (provider.env_key) lines.splice(8, 0, `env_key = ${quote(provider.env_key)}`);
  if (provider.api_key) lines.splice(provider.env_key ? 9 : 8, 0, `api_key = ${quote(provider.api_key)}`);
  if (provider.models_url) lines.push(`models_url = ${quote(provider.models_url)}`);
  if (provider.response_format === false || provider.response_format) {
    lines.push(
      typeof provider.response_format === 'boolean'
        ? `response_format = ${provider.response_format}`
        : `response_format = ${quote(provider.response_format)}`
    );
  }
  return `${lines.join('\n')}\n`;
}

function quote(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
