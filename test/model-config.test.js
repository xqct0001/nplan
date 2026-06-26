import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadModelConfig, parseConfigOverrides, resolveModelProvider } from '../src/model-config.js';

test('loads Codex-style model provider config from TOML', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'local-task-agent-'));
  const configPath = join(dir, 'config.toml');
  await writeFile(
    configPath,
    [
      'model = "qwen-plus"',
      'model_provider = "dashscope"',
      'model_temperature = 0.1',
      '',
      '[model_providers.dashscope]',
      'name = "DashScope"',
      'base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"',
      'env_key = "DASHSCOPE_API_KEY"',
      'wire_api = "chat_completions"',
      'request_max_retries = 2',
      'timeout_ms = 12000',
      'http_headers = { "X-App" = "local-task-agent" }',
      'query_params = { "api-version" = "2024-01-01" }'
    ].join('\n'),
    'utf8'
  );

  const config = await loadModelConfig({ configPath, env: { DASHSCOPE_API_KEY: 'secret' } });
  const provider = resolveModelProvider(config);

  assert.equal(config.model, 'qwen-plus');
  assert.equal(config.model_provider, 'dashscope');
  assert.equal(provider.name, 'DashScope');
  assert.equal(provider.base_url, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.equal(provider.apiKey, 'secret');
  assert.equal(provider.http_headers['X-App'], 'local-task-agent');
  assert.equal(provider.query_params['api-version'], '2024-01-01');

  await rm(dir, { recursive: true, force: true });
});

test('supports CLI-style -c dotted overrides and built-in providers', () => {
  const config = loadModelConfig.sync({
    env: {
      LOCAL_TASK_AGENT_MODEL: 'gpt-5.5',
      OPENAI_API_KEY: 'openai-key'
    },
    overrides: parseConfigOverrides([
      'model_provider=openai',
      'model_providers.openai.request_max_retries=1',
      'model_providers.openai.timeout_ms=7000'
    ])
  });
  const provider = resolveModelProvider(config);

  assert.equal(config.model, 'gpt-5.5');
  assert.equal(provider.id, 'openai');
  assert.equal(provider.base_url, 'https://api.openai.com/v1');
  assert.equal(provider.wire_api, 'responses');
  assert.equal(provider.apiKey, 'openai-key');
  assert.equal(provider.request_max_retries, 1);
  assert.equal(provider.timeout_ms, 7000);
});
