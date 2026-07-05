import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { BUILTIN_MODEL_PROVIDERS } from './model-config.js';

export const PROJECT_CONFIG_PATH = resolve('.n-agent/config.toml');

export function listProviderChoices() {
  return Object.entries(BUILTIN_MODEL_PROVIDERS).map(([id, provider]) => ({
    id,
    name: provider.name || id,
    base_url: provider.base_url,
    env_key: provider.env_key || '',
    default_model: provider.default_model || 'local-model',
    wire_api: provider.wire_api
  }));
}

export function writeProjectModelConfig({ providerId, model, providerOverrides = {}, configPath = PROJECT_CONFIG_PATH }) {
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
  return listProviderChoices()
    .map((provider) => {
      const login = provider.env_key ? `env ${provider.env_key}` : 'local service';
      return `${provider.id}\t${provider.default_model}\t${login}\t${provider.base_url}`;
    })
    .join('\n');
}

export function initHint(result) {
  const lines = [`Configured ${result.providerId} (${result.model}) in ${result.configPath}.`];
  if (result.provider.env_key) {
    lines.push(`Login: set $env:${result.provider.env_key} = "<your-key>" before running.`);
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
