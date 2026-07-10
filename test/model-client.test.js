import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OpenAICompatiblePlanningModel,
  OpenAICompatibleTaskModel,
  callModelForTaskPlan,
  callModelForTaskSpec,
  extractJsonObject,
  isLocalModelProvider,
  modelPlanPrompt,
  modelSpecPrompt
} from '../src/model-client.js';
import { BUILTIN_MODEL_PROVIDERS } from '../src/model-config.js';
import { TASKPLAN_REQUIRED_FIELDS, TASKPLAN_SCHEMA, TASK_REQUIRED_FIELDS } from '../src/schemas.js';
import { readyTaskSpec, taskPlanDraft, taskSpecDraft } from './fixtures.js';

function chineseTaskSpec() {
  return readyTaskSpec();
}

function localTestConfig(overrides = {}) {
  return {
    model: 'semantic-test-model',
    model_provider: 'localtest',
    model_temperature: 0.1,
    model_max_output_tokens: 2000,
    env: { FAKE_MODEL_KEY: 'secret' },
    model_providers: {
      localtest: {
        base_url: 'http://127.0.0.1:9999/v1',
        env_key: 'FAKE_MODEL_KEY',
        wire_api: 'chat_completions',
        request_max_retries: 0,
        timeout_ms: 1000
      }
    },
    ...overrides
  };
}

function retryConfig() {
  const config = localTestConfig();
  config.model_providers.localtest.request_max_retries = 1;
  return config;
}

function fakeJsonFetch(seen, drafts) {
  let index = 0;
  return async (_url, options) => {
    seen.push({ body: JSON.parse(options.body) });
    const draft = drafts[index++];
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(draft) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('TaskPlan prompt asks for concrete Chinese actions and bounded DAG fields', () => {
  const prompt = modelPlanPrompt(chineseTaskSpec(), { evidence_map: [] });
  assert.match(prompt.system, /具体动作/);
  assert.match(prompt.system, /不要使用 Define/);
  const body = JSON.parse(prompt.user);
  assert.equal(body.taskspec.constraints.language, 'zh-CN');
  assert.equal(body.planner_policy.max_tasks, 12);
  assert.deepEqual(Object.keys(body.required_shape).sort(), [...TASKPLAN_REQUIRED_FIELDS].sort());
  assert.deepEqual(Object.keys(body.required_shape.tasks[0]).sort(), [...TASK_REQUIRED_FIELDS].sort());
});

test('planning model exposes separate understandTask and planTask operations', async () => {
  const seen = [];
  const model = new OpenAICompatiblePlanningModel({
    config: localTestConfig(),
    fetchImpl: fakeJsonFetch(seen, [taskSpecDraft(), taskPlanDraft()])
  });
  await model.understandTask({ request: '规划亲子游', context: {} });
  await model.planTask({ taskspec: chineseTaskSpec(), context: {} });
  assert.equal(seen.length, 2);
  assert.match(seen[0].body.messages[0].content, /Task Understanding/);
  assert.match(seen[1].body.messages[0].content, /Task Planning/);
  assert.equal(model.requiresContextConsent, false);
});

test('legacy task model name is a transitional alias of the planning model', () => {
  assert.equal(OpenAICompatibleTaskModel, OpenAICompatiblePlanningModel);
});

test('local provider detection accepts loopback URLs only', () => {
  assert.equal(isLocalModelProvider({ base_url: 'http://127.0.0.1:11434/v1' }), true);
  assert.equal(isLocalModelProvider({ base_url: 'http://localhost:1234/v1' }), true);
  assert.equal(isLocalModelProvider({ base_url: 'http://[::1]:8080/v1' }), true);
  assert.equal(isLocalModelProvider({ base_url: 'https://api.deepseek.com' }), false);
  assert.equal(isLocalModelProvider({ context_location: 'cloud', base_url: 'http://127.0.0.1:9999/v1' }), false);
});

test('built-in providers declare their context location', () => {
  const localIds = new Set(['ollama', 'lmstudio', 'vllm', 'llamacpp', 'localai']);
  for (const [id, provider] of Object.entries(BUILTIN_MODEL_PROVIDERS)) {
    assert.equal(provider.context_location, localIds.has(id) ? 'local' : 'cloud', id);
  }
});

test('each retry receives a fresh timeout signal', async () => {
  const signals = [];
  let attempt = 0;
  const fetchImpl = async (_url, options) => {
    signals.push(options.signal);
    attempt += 1;
    if (attempt === 1) throw new DOMException('timed out', 'TimeoutError');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(taskPlanDraft()) } }] }), { status: 200 });
  };
  await callModelForTaskPlan({ taskspec: chineseTaskSpec(), context: {}, config: retryConfig(), fetchImpl });
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
});

test('TaskPlan call sends the TaskPlan schema to Responses providers', async () => {
  let body;
  const config = localTestConfig({
    model_providers: {
      localtest: {
        ...localTestConfig().model_providers.localtest,
        wire_api: 'responses'
      }
    }
  });
  const fetchImpl = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ output_text: JSON.stringify(taskPlanDraft()) }), { status: 200 });
  };

  await callModelForTaskPlan({ taskspec: chineseTaskSpec(), context: {}, config, fetchImpl });

  assert.equal(body.text.format.name, 'TaskPlanDraft');
  assert.deepEqual(body.text.format.schema, TASKPLAN_SCHEMA);
});

test('TaskPlan call preserves the final HTTP status after retries', async () => {
  const fetchImpl = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(
    callModelForTaskPlan({ taskspec: chineseTaskSpec(), config: retryConfig(), fetchImpl }),
    (error) => error.message === 'model provider returned HTTP 503' && error.status === 503
  );
});

test('calls chat-completions providers with auth, query params, and JSON prompt', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              inferred_goal: 'Design a local file organizer',
              task_type: 'design',
              deliverables: [
                { name: 'File scanner', format: 'json', required: true },
                { name: 'Markdown report', format: 'markdown', required: true }
              ],
              success_criteria: ['files are scanned', 'markdown report is produced']
            })
          }
        }
      ]
    });
  };

  const result = await callModelForTaskSpec({
    request: '帮我设计本地文件整理工具，扫描文件，分类，输出md报告',
    context: { files: ['README.md'] },
    config: {
      model: 'qwen-plus',
      model_max_output_tokens: 777,
      model_provider: 'dashscope',
      model_providers: {
        dashscope: {
          base_url: 'https://example.test/v1',
          wire_api: 'chat_completions',
          apiKey: 'secret',
          http_headers: { 'X-App': 'nplan' },
          query_params: { foo: 'bar' },
          request_max_retries: 0
        }
      }
    },
    fetchImpl
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.test/v1/chat/completions?foo=bar');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret');
  assert.equal(requests[0].options.headers['X-App'], 'nplan');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.model, 'qwen-plus');
  assert.equal(body.max_tokens, 777);
  assert.equal(result.deliverables[1].format, 'markdown');
});

test('calls responses providers and extracts output_text JSON', async () => {
  const fetchImpl = async () =>
    jsonResponse({
      output_text: JSON.stringify({
        inferred_goal: 'Design a local file organizer',
        task_type: 'design',
        deliverables: [{ name: 'Markdown report', format: 'markdown', required: true }],
        success_criteria: ['markdown report is produced']
      })
    });

  const result = await callModelForTaskSpec({
    request: 'design report',
    config: {
      model: 'gpt-5.5',
      model_provider: 'openai',
      model_providers: {
        openai: {
          base_url: 'https://api.openai.com/v1',
          wire_api: 'responses',
          apiKey: 'secret',
          request_max_retries: 0
        }
      }
    },
    fetchImpl
  });

  assert.equal(result.task_type, 'design');
  assert.equal(result.deliverables[0].name, 'Markdown report');
});

test('can omit chat response_format for providers that reject JSON mode params', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              inferred_goal: 'Design a local file organizer',
              task_type: 'design',
              deliverables: [{ name: 'Markdown report', format: 'markdown', required: true }],
              success_criteria: ['markdown report is produced']
            })
          }
        }
      ]
    });
  };

  await callModelForTaskSpec({
    request: 'design report',
    config: {
      model: 'MiniMax-M1',
      model_provider: 'minimax',
      model_providers: {
        minimax: {
          base_url: 'https://example.test/v1',
          wire_api: 'chat_completions',
          apiKey: 'secret',
          response_format: 'none',
          request_max_retries: 0
        }
      }
    },
    fetchImpl
  });

  assert.equal(Object.hasOwn(JSON.parse(requests[0].options.body), 'response_format'), false);
});

test('extracts JSON object from fenced model output', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.match(modelSpecPrompt('x', {}).system, /Task Understanding/);
  assert.match(modelSpecPrompt('x', {}).system, /do not invent source IDs/i);
  const promptShape = JSON.parse(modelSpecPrompt('x', {}).user).required_shape;
  assert.equal(promptShape.output_format, 'json|markdown|yaml|text|diagram|code|mixed|unknown');
  assert.equal(promptShape.risk_level, 'low|medium|high|unknown');
  assert.deepEqual(promptShape.context_requirements, []);
  assert.deepEqual(promptShape.checkpoint_policy, {
    stop_on: [],
    requires_user_confirmation_for: []
  });
});

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}
