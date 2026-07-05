import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  BUILTIN_MODEL_PROVIDERS,
  loadModelConfig,
  parseConfigOverrides,
  resolveModelProvider
} from '../src/model-config.js';

test('loads Codex-style model provider config from TOML', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-'));
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
      'http_headers = { "X-App" = "nplan" }',
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
  assert.equal(provider.http_headers['X-App'], 'nplan');
  assert.equal(provider.query_params['api-version'], '2024-01-01');

  await rm(dir, { recursive: true, force: true });
});

test('supports CLI-style -c dotted overrides and built-in providers', () => {
  const config = loadModelConfig.sync({
    env: {
      NPLAN_MODEL: 'gpt-5.5',
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

test('built-in providers cover common local and Chinese OpenAI-compatible endpoints', () => {
  for (const id of [
    'ollama',
    'lmstudio',
    'vllm',
    'llamacpp',
    'localai',
    'dashscope',
    'tongyi',
    'qwen',
    'deepseek',
    'moonshot',
    'kimi',
    'zhipu',
    'bigmodel',
    'glm',
    'qianfan',
    'wenxin',
    'volcengine_ark',
    'doubao',
    'tencent_hunyuan',
    'hunyuan',
    'siliconflow',
    'minimax',
    'baichuan',
    'yi',
    'stepfun',
    'modelscope'
  ]) {
    assert.ok(BUILTIN_MODEL_PROVIDERS[id], `missing provider ${id}`);
    assert.equal(BUILTIN_MODEL_PROVIDERS[id].wire_api, 'chat_completions');
  }

  assert.equal(BUILTIN_MODEL_PROVIDERS.vllm.base_url, 'http://localhost:8000/v1');
  assert.equal(BUILTIN_MODEL_PROVIDERS.dashscope.env_key, 'DASHSCOPE_API_KEY');
  assert.equal(BUILTIN_MODEL_PROVIDERS.tongyi.base_url, BUILTIN_MODEL_PROVIDERS.dashscope.base_url);
  assert.equal(BUILTIN_MODEL_PROVIDERS.deepseek.base_url, 'https://api.deepseek.com');
  assert.equal(BUILTIN_MODEL_PROVIDERS.deepseek.default_model, 'deepseek-v4-flash');
  assert.equal(BUILTIN_MODEL_PROVIDERS.volcengine_ark.base_url, 'https://ark.cn-beijing.volces.com/api/v3');
  assert.equal(BUILTIN_MODEL_PROVIDERS.doubao.base_url, BUILTIN_MODEL_PROVIDERS.volcengine_ark.base_url);
  assert.equal(BUILTIN_MODEL_PROVIDERS.minimax.response_format, 'none');
  assert.equal(BUILTIN_MODEL_PROVIDERS.modelscope.env_key, 'MODELSCOPE_API_KEY');
});
