import { DEFAULT_PLANNER_POLICY, TASKPLAN_SCHEMA, TASKSPEC_SCHEMA } from './schemas.js';
import { resolveModelProvider } from './model-config.js';

export class OpenAICompatiblePlanningModel {
  constructor({ config, fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.provider = resolveModelProvider(config);
  }

  get requiresContextConsent() {
    return !isLocalModelProvider(this.provider);
  }

  understandTask({ request, context = {} }) {
    return callModelForTaskSpec({ request, context, config: this.config, fetchImpl: this.fetchImpl });
  }

  planTask({ taskspec, context = {} }) {
    return callModelForTaskPlan({ taskspec, context, config: this.config, fetchImpl: this.fetchImpl });
  }
}

export function isLocalModelProvider(provider) {
  if (provider.context_location === 'local') return true;
  if (provider.context_location === 'cloud') return false;
  const host = new URL(provider.base_url).hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function modelSpecPrompt(request, context = {}) {
  return {
    system: [
      'You are a Task Understanding extractor.',
      'Return only one JSON object for a TaskSpec draft.',
      'Do not execute tasks. Do not plan implementation steps.',
      'Extract semantic deliverables from any language, including Chinese.',
      'If a fact is inferred, put it in assumptions unless it is directly requested.',
      'Capture audience, target object, output format, checkpoints, quality bar, and risk level when present.',
      'Use supplied context_pack and evidence_map only as evidence; do not invent source IDs or evidence IDs.'
    ].join('\n'),
    user: JSON.stringify(
      {
        request,
        context,
        required_shape: {
          inferred_goal: 'string',
          task_type: 'planning|coding|debugging|research|writing|data_analysis|automation|design|unknown',
          audience: 'string',
          target_object: 'string',
          deliverables: [{ name: 'string', format: 'json|markdown|yaml|text|diagram|unknown', required: true }],
          output_format: 'json|markdown|yaml|text|diagram|code|mixed|unknown',
          constraints: 'object',
          missing_information: { blocking: [], non_blocking: [] },
          assumptions: [],
          ambiguities: [],
          success_criteria: [],
          checkpoint_policy: {
            stop_on: [],
            requires_user_confirmation_for: []
          },
          quality_bar: [],
          risk_level: 'low|medium|high|unknown',
          context_requirements: []
        }
      },
      null,
      2
    )
  };
}

export function modelPlanPrompt(taskspec, context = {}) {
  return {
    system: [
      'You are a Task Planning extractor.',
      'Return only one JSON object for a bounded TaskPlan DAG draft.',
      'Do not execute tasks or claim that any task has been completed.',
      '每个任务标题和目标必须描述可核验的具体动作，并遵循 TaskSpec.constraints.language。',
      '中文计划使用明确的中文动词和具体动作；不要使用 Define、Prepare、Handle 等模糊占位词。',
      'Keep every dependency within the returned task IDs and keep the graph acyclic.',
      'Give every task explicit inputs, outputs, acceptance checks, complexity, risk, model tier, and pending state.',
      'Respect planner_policy.max_tasks and use supplied context only as evidence.'
    ].join('\n'),
    user: JSON.stringify(
      {
        taskspec,
        context,
        planner_policy: { ...DEFAULT_PLANNER_POLICY },
        required_shape: {
          version: '1.0',
          plan_style: 'dag',
          global_goal: 'string',
          global_acceptance: ['string'],
          tasks: [
            {
              id: 'string',
              title: 'string',
              goal: 'string',
              inputs: ['string'],
              outputs: ['string'],
              dependencies: ['task id'],
              parallel_group: 'string',
              acceptance: ['string'],
              complexity: 'low|medium|high',
              risk: 'low|medium|high',
              model_tier: 'string',
              state: 'pending'
            }
          ],
          replan_policy: {
            trigger_on: ['schema_invalid|cyclic_dependency|blocking_info_found|task_too_coarse'],
            max_replans: 'integer'
          }
        }
      },
      null,
      2
    )
  };
}

export async function callModelForTaskSpec({ request, context = {}, config, fetchImpl = globalThis.fetch }) {
  return callModel({
    config,
    fetchImpl,
    prompt: modelSpecPrompt(request, context),
    schema: TASKSPEC_SCHEMA,
    schemaName: 'TaskSpecDraft'
  });
}

export async function callModelForTaskPlan({ taskspec, context = {}, config, fetchImpl = globalThis.fetch }) {
  return callModel({
    config,
    fetchImpl,
    prompt: modelPlanPrompt(taskspec, context),
    schema: TASKPLAN_SCHEMA,
    schemaName: 'TaskPlanDraft'
  });
}

async function callModel({ config, fetchImpl, prompt, schema, schemaName }) {
  if (!config?.model) throw new Error('model is not configured');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available in this Node.js runtime');
  const provider = resolveModelProvider(config);
  const response = await callWithRetries({
    fetchImpl,
    provider,
    url: endpointUrl(provider),
    makeOptions: () => requestOptions({ config, provider, prompt, schema, schemaName })
  });
  return parseModelPayload(await response.text());
}

export function extractJsonObject(text) {
  const stripped = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error('model output did not contain a JSON object');
  }
}

function endpointUrl(provider) {
  const base = provider.base_url.replace(/\/$/, '');
  const path = provider.wire_api === 'responses' ? '/responses' : '/chat/completions';
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(provider.query_params || {})) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function requestOptions({ config, provider, prompt, schema, schemaName }) {
  const headers = {
    'Content-Type': 'application/json',
    ...(provider.http_headers || {})
  };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  return {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(Number(provider.timeout_ms || 60000)),
    body: JSON.stringify(requestBody({ config, provider, prompt, schema, schemaName }))
  };
}

function requestBody({ config, provider, prompt, schema, schemaName }) {
  if (provider.wire_api === 'responses') {
    return {
      model: config.model,
      input: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      temperature: config.model_temperature ?? 0.1,
      max_output_tokens: config.model_max_output_tokens ?? 2000,
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema,
          strict: false
        }
      }
    };
  }
  return {
    model: config.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature: config.model_temperature ?? 0.1,
    max_tokens: config.model_max_output_tokens ?? 2000,
    ...chatResponseFormat(provider)
  };
}

function chatResponseFormat(provider) {
  if (provider.response_format === false || provider.response_format === 'none') return {};
  if (provider.response_format && typeof provider.response_format === 'object') {
    return { response_format: provider.response_format };
  }
  return { response_format: { type: provider.response_format || 'json_object' } };
}

async function callWithRetries({ fetchImpl, provider, url, makeOptions }) {
  const retries = Number(provider.request_max_retries || 0);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, makeOptions());
      if (response.ok) return response;
      lastError = new Error(`model provider returned HTTP ${response.status}`);
      lastError.status = response.status;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function parseModelPayload(text) {
  const payload = JSON.parse(text);
  if (payload.output_text) return extractJsonObject(payload.output_text);
  const outputText = payload.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text || content.output_text || '')
    .join('\n')
    .trim();
  if (outputText) return extractJsonObject(outputText);
  const chatText = payload.choices?.[0]?.message?.content;
  if (chatText) return extractJsonObject(chatText);
  return extractJsonObject(text);
}
