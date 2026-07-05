import assert from 'node:assert/strict';
import { test } from 'node:test';

import { callModelForTaskSpec, extractJsonObject, modelSpecPrompt } from '../src/model-client.js';

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
  assert.equal(JSON.parse(requests[0].options.body).model, 'qwen-plus');
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
