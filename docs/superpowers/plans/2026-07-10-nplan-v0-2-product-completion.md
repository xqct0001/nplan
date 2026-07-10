# NPlan v0.2 Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Chinese-first NPlan v0.2 that obtains project-level cloud-context consent, uses separate model calls for TaskSpec and concrete TaskPlan generation, exposes a generic WorkPlan, restores sanitized sessions, and provides actionable setup and diagnostics.

**Architecture:** Keep TaskSpec, TaskPlan, ContextPack, provenance, and local validation as the stable planning core. Add a second structured model operation for TaskPlan, derive WorkPlan locally, and isolate consent, locale, session persistence, and model error classification into focused modules so `src/cli.js` only coordinates interaction.

**Tech Stack:** Node.js 24+, JavaScript ESM, built-in `node:test`, built-in `fetch`, built-in `readline`, JSON/TOML/Markdown files, Windows CMD and PowerShell wrappers.

## Global Constraints

- Preserve the planning-only boundary: no task execution, shell execution, source editing, deployment, purchasing, messaging, browser automation, or remote-agent orchestration.
- Default locale is `zh-CN`; `--lang en` is the only English opt-in.
- A ready request uses exactly two semantic model calls: TaskSpec then TaskPlan.
- A clarification result uses one model call and does not call the TaskPlan model operation.
- An invalid TaskPlan returns `plan_invalid`; v0.2 performs no automatic third semantic call.
- No cloud provider may receive task or project context before valid project consent or explicit one-shot authorization.
- Localhost providers bypass cloud consent and state that data stays local.
- Remove PRPlan, PR Draft, PR tags, and software-only wording from generic output and public exports.
- Session v2 stores sanitized planning artifacts without evidence text, source content, API keys, or absolute paths.
- Use Node.js only and add no runtime dependency.
- Ignore `DOC/` upstream references during implementation unless a test explicitly targets ignore behavior.
- Follow TDD for every behavior change: red test, observed expected failure, minimal implementation, focused green test, then regression test.

---

### Task 1: Strict Model-Generated TaskPlan Contract

**Files:**
- Modify: `src/schemas.js`
- Modify: `src/planning.js`
- Modify: `src/validation.js`
- Modify: `src/index.js`
- Create: `test/fixtures.js`
- Test: `test/core.test.js`

**Interfaces:**
- Consumes: validated `TaskSpec` and optional `plannerPolicy`.
- Produces: `composeTaskPlanFromModel(taskspec, modelDraft, plannerPolicy) -> TaskPlan` and a strict nested `TASKPLAN_SCHEMA` suitable for model structured output.

- [ ] **Step 1: Create shared real fixtures and write failing schema and normalization tests**

Create `test/fixtures.js` so later tasks use one complete contract fixture:

```js
export function readyTaskSpec(overrides = {}) {
  return {
    version: '1.0',
    surface_request: '规划北京亲子游',
    inferred_goal: '制定三天北京亲子游计划',
    task_type: 'planning',
    audience: '中国家庭用户',
    target_object: '三天北京亲子游',
    background_context: [],
    deliverables: [
      { name: '三日行程', format: 'markdown', required: true },
      { name: '预算表', format: 'markdown', required: true }
    ],
    output_format: 'markdown',
    constraints: {
      language: 'zh-CN',
      allowed_tools: ['project_context', 'configured_model', 'schema_validator'],
      forbidden_tools: ['task_execution'],
      data_sensitivity: 'internal'
    },
    context_requirements: ['surface_request'],
    known_inputs: [],
    source_map: [],
    evidence_map: [],
    context_report: { source_count: 0, evidence_count: 0, dropped_source_count: 0, warnings: [] },
    conflict_report: { blocking: [], non_blocking: [], resolutions: [] },
    missing_information: { blocking: [], non_blocking: [] },
    assumptions: ['只生成规划，不执行任务'],
    ambiguities: [],
    success_criteria: ['行程完整', '总预算不超过五千元'],
    clarification: { requires_clarification: false, questions: [], reason: 'ready to plan' },
    checkpoint_policy: {
      stop_on: ['blocking_missing_information', 'validation_failure'],
      requires_user_confirmation_for: ['task_execution']
    },
    quality_bar: ['路线紧凑', '预算透明'],
    planning_readiness: { score: 0.9, decision: 'ready' },
    risk_level: 'low',
    provenance: { conversation_turns_used: ['规划北京亲子游'], files_used: [], model_used: true },
    ...overrides
  };
}

export function modelTask(overrides = {}) {
  return {
    id: 'T1',
    title: '确认家庭成员与出行限制',
    goal: '明确儿童年龄、日期和出发位置',
    inputs: ['用户请求'],
    outputs: ['三日行程', '预算表'],
    dependencies: [],
    parallel_group: 'G1',
    acceptance: ['儿童年龄、日期和出发位置均明确'],
    complexity: 'low',
    risk: 'low',
    model_tier: 'strong',
    state: 'pending',
    ...overrides
  };
}

export function taskSpecDraft(overrides = {}) {
  return {
    inferred_goal: '制定三天北京亲子游计划',
    task_type: 'planning',
    audience: '中国家庭用户',
    target_object: '三天北京亲子游',
    deliverables: readyTaskSpec().deliverables,
    output_format: 'markdown',
    constraints: { language: 'zh-CN' },
    missing_information: { blocking: [], non_blocking: [] },
    assumptions: ['默认从北京出发'],
    ambiguities: [],
    success_criteria: readyTaskSpec().success_criteria,
    checkpoint_policy: readyTaskSpec().checkpoint_policy,
    quality_bar: readyTaskSpec().quality_bar,
    risk_level: 'low',
    context_requirements: ['surface_request'],
    ...overrides
  };
}

export function vagueTaskSpecDraft() {
  return taskSpecDraft({
    deliverables: [],
    missing_information: { blocking: ['required deliverables'], non_blocking: [] }
  });
}

export function taskPlanDraft(overrides = {}) {
  return {
    global_goal: '制定三天北京亲子游计划',
    global_acceptance: ['行程完整', '总预算不超过五千元'],
    tasks: [modelTask()],
    ...overrides
  };
}

export function plannedChineseResult() {
  const taskspec = readyTaskSpec();
  return {
    status: 'planned',
    taskspec,
    clarification_questions: [],
    taskplan: {
      version: '1.0',
      plan_style: 'dag',
      global_goal: taskspec.inferred_goal,
      global_acceptance: taskspec.success_criteria,
      required_deliverables: taskspec.deliverables.map((item) => item.name),
      planner_policy: { max_depth: 3, max_tasks: 12, allow_parallel_groups: true, require_acceptance_per_task: true, prefer_atomic_tasks: true },
      tasks: [modelTask()],
      replan_policy: { trigger_on: ['validation_failure'], max_replans: 0 }
    }
  };
}

export function clarificationResult() {
  const taskspec = readyTaskSpec({
    missing_information: { blocking: ['儿童年龄'], non_blocking: [] },
    clarification: { requires_clarification: true, questions: ['儿童年龄是多少？'], reason: 'blocking information is missing' },
    planning_readiness: { score: 0.55, decision: 'clarify_then_plan' }
  });
  return { status: 'needs_clarification', taskspec, clarification_questions: ['儿童年龄是多少？'] };
}
```

Add these focused tests to `test/core.test.js`:

```js
import {
  TASKPLAN_SCHEMA,
  composeTaskPlanFromModel,
  validateTaskPlan
} from '../src/index.js';
import { modelTask, readyTaskSpec } from './fixtures.js';

test('TaskPlan schema defines required nested task fields', () => {
  const taskItems = TASKPLAN_SCHEMA.properties.tasks.items;
  assert.equal(taskItems.type, 'object');
  assert.deepEqual(taskItems.required, [
    'id', 'title', 'goal', 'inputs', 'outputs', 'dependencies',
    'parallel_group', 'acceptance', 'complexity', 'risk', 'model_tier', 'state'
  ]);
  assert.equal(taskItems.properties.state.const, 'pending');
});

test('model TaskPlan draft becomes a concrete validated DAG', () => {
  const taskspec = readyTaskSpec({
    inferred_goal: '制定三天北京亲子游计划',
    deliverables: [
      { name: '三日行程', format: 'markdown', required: true },
      { name: '预算表', format: 'markdown', required: true }
    ],
    success_criteria: ['行程完整', '总预算不超过五千元']
  });
  const taskplan = composeTaskPlanFromModel(taskspec, {
    global_goal: '制定三天北京亲子游计划',
    global_acceptance: ['行程完整', '总预算不超过五千元'],
    tasks: [
      {
        id: 'T1',
        title: '确认家庭成员与出行限制',
        goal: '明确儿童年龄、日期和出发位置',
        inputs: ['用户请求'],
        outputs: ['出行约束'],
        dependencies: [],
        parallel_group: 'G1',
        acceptance: ['儿童年龄、日期和出发位置均明确'],
        complexity: 'low',
        risk: 'low',
        model_tier: 'strong',
        state: 'pending'
      },
      {
        id: 'T2',
        title: '编排三日路线并核算预算',
        goal: '形成可执行的三日安排和预算',
        inputs: ['出行约束'],
        outputs: ['三日行程', '预算表'],
        dependencies: ['T1'],
        parallel_group: 'G2',
        acceptance: ['覆盖三天且预算不超过五千元'],
        complexity: 'medium',
        risk: 'medium',
        model_tier: 'strong',
        state: 'pending'
      }
    ]
  });

  assert.equal(taskplan.tasks[0].title, '确认家庭成员与出行限制');
  assert.equal(validateTaskPlan(taskplan).valid, true);
});

test('validator rejects generic deliverable wrappers', () => {
  const taskplan = composeTaskPlanFromModel(readyTaskSpec(), {
    tasks: [modelTask({ title: 'Define Markdown report', outputs: ['Markdown report'] })]
  });
  const report = validateTaskPlan(taskplan);
  assert.equal(report.valid, false);
  assert.ok(report.policy_errors.includes('task_too_coarse:T1'));
});
```

- [ ] **Step 2: Run the focused tests and observe RED**

Run:

```powershell
node --test --test-name-pattern "TaskPlan schema|model TaskPlan draft|generic deliverable" test/core.test.js
```

Expected: FAIL because `composeTaskPlanFromModel` is not exported and `TASKPLAN_SCHEMA.properties.tasks.items` is absent.

- [ ] **Step 3: Define the strict schema and model-draft composer**

In `src/schemas.js`, give `TASKPLAN_SCHEMA.properties.tasks` an `items` object with every `TASK_REQUIRED_FIELDS` property, array item types, allowed complexity/risk/state values, and `additionalProperties: false`.

Replace the local deliverable-template generator in `src/planning.js` with:

```js
export function composeTaskPlanFromModel(taskspec, modelDraft = {}, plannerPolicy = {}) {
  const policy = { ...DEFAULT_PLANNER_POLICY, ...plannerPolicy };
  const required = (taskspec.deliverables || [])
    .filter((item) => item.required !== false && item.name !== 'unknown')
    .map((item) => item.name);
  const tasks = (Array.isArray(modelDraft.tasks) ? modelDraft.tasks : [])
    .slice(0, safeMaxTasks(policy))
    .map((task, index) => normalizeModelTask(task, index));
  return {
    version: '1.0',
    plan_style: 'dag',
    global_goal: nonEmpty(modelDraft.global_goal, taskspec.inferred_goal),
    global_acceptance: stringArray(modelDraft.global_acceptance).length
      ? stringArray(modelDraft.global_acceptance)
      : stringArray(taskspec.success_criteria),
    required_deliverables: required,
    planner_policy: policy,
    tasks,
    replan_policy: {
      trigger_on: ['schema_invalid', 'cyclic_dependency', 'blocking_info_found', 'task_too_coarse'],
      max_replans: 0
    }
  };
}

function normalizeModelTask(task, index) {
  return makeTask(
    nonEmpty(task?.id, `T${index + 1}`),
    nonEmpty(task?.title, `任务 ${index + 1}`),
    nonEmpty(task?.goal, nonEmpty(task?.title, `任务 ${index + 1}`)),
    stringArray(task?.inputs),
    stringArray(task?.outputs),
    stringArray(task?.dependencies),
    stringArray(task?.acceptance),
    {
      parallel_group: nonEmpty(task?.parallel_group, `G${index + 1}`),
      complexity: allowed(task?.complexity, ['low', 'medium', 'high'], 'medium'),
      risk: allowed(task?.risk, ['low', 'medium', 'high'], 'medium'),
      model_tier: nonEmpty(task?.model_tier, 'strong'),
      state: 'pending'
    }
  );
}
```

In `src/validation.js`, add duplicate-id detection and reject a task when its normalized lowercase title is exactly `define <single output>` or `定义<single output>`, reporting `task_too_coarse:<id>`.

Update `src/index.js` to export `composeTaskPlanFromModel` and stop exporting `planFromTaskSpec`.

- [ ] **Step 4: Run focused and core tests GREEN**

Run:

```powershell
node --test --test-name-pattern "TaskPlan schema|model TaskPlan draft|generic deliverable" test/core.test.js
node --test test/core.test.js
```

Expected: both commands exit `0`; the complete core test file passes.

- [ ] **Step 5: Commit TaskPlan contract**

```powershell
git add src/schemas.js src/planning.js src/validation.js src/index.js test/fixtures.js test/core.test.js
git commit -m "feat: normalize model-generated task plans"
```

---

### Task 2: Two-Operation OpenAI-Compatible Model Client

**Files:**
- Modify: `src/model-client.js`
- Modify: `src/model-config.js`
- Test: `test/model-client.test.js`

**Interfaces:**
- Consumes: provider config, TaskSpec schema, TaskPlan schema.
- Produces: `OpenAICompatiblePlanningModel`, `modelSpecPrompt`, `modelPlanPrompt`, `callModelForTaskSpec`, `callModelForTaskPlan`, `isLocalModelProvider`.

- [ ] **Step 1: Write failing tests for the planning operation and retry signal**

Add to `test/model-client.test.js`:

```js
import {
  OpenAICompatiblePlanningModel,
  callModelForTaskPlan,
  isLocalModelProvider,
  modelPlanPrompt
} from '../src/model-client.js';
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
});

test('local provider detection accepts loopback URLs only', () => {
  assert.equal(isLocalModelProvider({ base_url: 'http://127.0.0.1:11434/v1' }), true);
  assert.equal(isLocalModelProvider({ base_url: 'http://localhost:1234/v1' }), true);
  assert.equal(isLocalModelProvider({ base_url: 'https://api.deepseek.com' }), false);
  assert.equal(isLocalModelProvider({ context_location: 'cloud', base_url: 'http://127.0.0.1:9999/v1' }), false);
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
```

- [ ] **Step 2: Run focused tests and observe RED**

```powershell
node --test --test-name-pattern "TaskPlan prompt|separate understandTask|local provider detection|fresh timeout" test/model-client.test.js
```

Expected: FAIL because the new class, prompt, operation, and local-provider detector do not exist.

- [ ] **Step 3: Generalize the model transport**

Implement this public shape in `src/model-client.js`:

```js
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
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
```

Set `context_location = 'local'` on Ollama, LM Studio, vLLM, llama.cpp, and LocalAI built-ins; set `context_location = 'cloud'` on remote built-ins. Custom providers without the field retain safe URL-based detection.

Add `modelPlanPrompt(taskspec, context)` with Chinese concrete-action rules and a `required_shape` containing all TaskPlan and task fields. Refactor the request builder to accept `{ prompt, schema, schemaName }`; pass `TASKSPEC_SCHEMA` for understanding and `TASKPLAN_SCHEMA` for planning.

Build request options inside each retry attempt:

```js
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
```

Remove the public `OpenAICompatibleTaskModel` class and update internal imports in the next task.

- [ ] **Step 4: Run model-client tests GREEN**

```powershell
node --test test/model-client.test.js
node --check src/model-client.js
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit the two-operation model client**

```powershell
git add src/model-client.js src/model-config.js test/model-client.test.js
git commit -m "feat: add separate task planning model call"
```

---

### Task 3: Two-Call Agent Orchestration And Consent Guard

**Files:**
- Modify: `src/agent.js`
- Modify: `src/index.js`
- Test: `test/model-understanding.test.js`

**Interfaces:**
- Consumes: `OpenAICompatiblePlanningModel`, `curateContext`, `composeTaskSpecFromModel`, `composeTaskPlanFromModel`.
- Produces: `LocalPlanningAgent.prepare()`, `LocalPlanningAgent.analyzePreparedAsync()`, guarded `analyzeAsync()`.

- [ ] **Step 1: Write failing orchestration tests**

Add to `test/model-understanding.test.js`:

```js
import { taskPlanDraft, taskSpecDraft, vagueTaskSpecDraft } from './fixtures.js';

test('ready request calls understanding then planning exactly once', async () => {
  const calls = [];
  const modelClient = {
    requiresContextConsent: false,
    async understandTask() { calls.push('understand'); return taskSpecDraft(); },
    async planTask() { calls.push('plan'); return taskPlanDraft(); }
  };
  const result = await new LocalPlanningAgent({ modelClient }).analyzeAsync('规划北京亲子游');
  assert.deepEqual(calls, ['understand', 'plan']);
  assert.equal(result.status, 'planned');
  assert.equal(result.taskplan.tasks[0].title, '确认家庭成员与出行限制');
});

test('clarification result does not call TaskPlan model', async () => {
  let planCalls = 0;
  const modelClient = {
    requiresContextConsent: false,
    async understandTask() { return vagueTaskSpecDraft(); },
    async planTask() { planCalls += 1; return taskPlanDraft(); }
  };
  const result = await new LocalPlanningAgent({ modelClient }).analyzeAsync('帮忙');
  assert.equal(result.status, 'needs_clarification');
  assert.equal(planCalls, 0);
});

test('cloud model cannot run prepared context without authorization', async () => {
  let calls = 0;
  const agent = new LocalPlanningAgent({
    modelClient: {
      requiresContextConsent: true,
      async understandTask() { calls += 1; return taskSpecDraft(); },
      async planTask() { calls += 1; return taskPlanDraft(); }
    }
  });
  const prepared = agent.prepare('规划北京亲子游');
  await assert.rejects(() => agent.analyzePreparedAsync(prepared), /cloud_context_consent_required/);
  assert.equal(calls, 0);
});

test('invalid model TaskPlan returns plan_invalid without a third call', async () => {
  let calls = 0;
  const modelClient = {
    requiresContextConsent: false,
    async understandTask() { calls += 1; return taskSpecDraft(); },
    async planTask() { calls += 1; return { tasks: [] }; }
  };
  const result = await new LocalPlanningAgent({ modelClient }).analyzeAsync('规划北京亲子游');
  assert.equal(result.status, 'plan_invalid');
  assert.equal(calls, 2);
});
```

- [ ] **Step 2: Run the tests and observe RED**

```powershell
node --test --test-name-pattern "understanding then planning|does not call TaskPlan|without authorization|without a third" test/model-understanding.test.js
```

Expected: FAIL because `prepare`, `analyzePreparedAsync`, and the second model operation are absent.

- [ ] **Step 3: Implement the guarded two-call pipeline**

Use this orchestration in `src/agent.js`:

```js
prepare(surfaceRequest, context = {}) {
  const request = stripPromptArtifacts(surfaceRequest);
  return { request, context: curateContext(request, context) };
}

async analyzeAsync(surfaceRequest, context = {}) {
  const prepared = this.prepare(surfaceRequest, context);
  return this.analyzePreparedAsync(prepared, {
    cloudContextAuthorized: context.cloud_context_authorized === true
  });
}

async analyzePreparedAsync(prepared, { cloudContextAuthorized = false } = {}) {
  if (!this.modelClient) throw new Error(MODEL_REQUIRED_MESSAGE);
  if (this.modelClient.requiresContextConsent && !cloudContextAuthorized) {
    const error = new Error('cloud_context_consent_required');
    error.code = 'cloud_context_consent_required';
    error.context_report = prepared.context.context_report;
    throw error;
  }
  const draft = await this.modelClient.understandTask(prepared);
  const taskspec = composeTaskSpecFromModel(prepared.request, draft, prepared.context);
  const taskspecReport = validateTaskSpec(taskspec);
  if (!taskspecReport.ready_for_planning) return clarificationResult(taskspec, taskspecReport);
  const taskDraft = await this.modelClient.planTask({ taskspec, context: prepared.context.context_pack });
  const taskplan = composeTaskPlanFromModel(taskspec, taskDraft);
  const taskplanReport = validateTaskPlan(taskplan);
  return plannedResult(taskspec, taskspecReport, taskplan, taskplanReport);
}
```

Keep result keys `taskspec`, `taskspec_report`, `taskplan`, and `taskplan_report`; set `status` to `planned` or `plan_invalid` from validation. Export `OpenAICompatiblePlanningModel` and the new planning helpers from `src/index.js`.

- [ ] **Step 4: Run agent and model tests GREEN**

```powershell
node --test test/model-understanding.test.js test/model-client.test.js test/core.test.js
node --check src/agent.js
```

Expected: all selected tests pass and syntax check exits `0`.

- [ ] **Step 5: Commit agent orchestration**

```powershell
git add src/agent.js src/index.js test/model-understanding.test.js
git commit -m "feat: orchestrate validated two-call planning"
```

---

### Task 4: Generic WorkPlan And Markdown Export

**Files:**
- Create: `src/work-plan.js`
- Create: `test/work-plan.test.js`
- Modify: `src/validation.js`
- Modify: `src/index.js`

**Interfaces:**
- Consumes: result `{status, taskspec, taskplan}`, `sessionId`, `locale`, optional `now`.
- Produces: `deriveWorkPlan`, `validateWorkPlan`, `renderWorkPlanTodo`, `renderWorkPlanSources`, `renderWorkPlanMarkdown`, `defaultWorkPlanExportPath`.

- [ ] **Step 1: Write failing WorkPlan tests**

Create `test/work-plan.test.js` with:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultWorkPlanExportPath,
  deriveWorkPlan,
  renderWorkPlanMarkdown,
  renderWorkPlanTodo,
  validateWorkPlan
} from '../src/work-plan.js';
import { clarificationResult, plannedChineseResult } from './fixtures.js';

test('planned result derives a generic Chinese WorkPlan', () => {
  const workPlan = deriveWorkPlan(plannedChineseResult(), {
    sessionId: '20260710120000-abcd1234',
    locale: 'zh-CN',
    now: new Date('2026-07-10T00:00:00Z')
  });
  assert.equal(workPlan.status, 'planned');
  assert.equal(workPlan.steps[0].title, '确认家庭成员与出行限制');
  assert.deepEqual(workPlan.acceptance, ['行程完整', '总预算不超过五千元']);
  assert.equal(validateWorkPlan(workPlan).valid, true);
});

test('generic Markdown contains no PR terminology', () => {
  const markdown = renderWorkPlanMarkdown(deriveWorkPlan(plannedChineseResult(), { locale: 'zh-CN' }));
  assert.match(markdown, /^---\ntype: nplan-work-plan/m);
  assert.match(markdown, /# 工作计划/);
  assert.match(markdown, /## 行动步骤/);
  assert.doesNotMatch(markdown, /PRPlan|PR Plan|PR Draft|pull request|pr-plan/i);
});

test('clarification result derives questions without fake steps', () => {
  const workPlan = deriveWorkPlan(clarificationResult(), { locale: 'zh-CN' });
  assert.equal(workPlan.status, 'needs_clarification');
  assert.deepEqual(workPlan.steps, []);
  assert.ok(workPlan.questions.length > 0);
});

test('todo and default export path use WorkPlan naming', () => {
  const workPlan = deriveWorkPlan(plannedChineseResult(), { locale: 'zh-CN' });
  assert.match(renderWorkPlanTodo(workPlan), /行动步骤/);
  assert.match(defaultWorkPlanExportPath(workPlan), /^\.nplan\/exports\//);
});
```

Include complete fixture builders for TaskSpec and TaskPlan in the same test file.

- [ ] **Step 2: Run WorkPlan tests and observe RED**

```powershell
node --test test/work-plan.test.js
```

Expected: FAIL with module-not-found for `src/work-plan.js`.

- [ ] **Step 3: Implement WorkPlan derivation and generic export**

Create `src/work-plan.js` around this shape:

```js
export function deriveWorkPlan(result, options = {}) {
  const locale = options.locale === 'en' ? 'en' : 'zh-CN';
  const tasks = result?.taskplan?.tasks || [];
  return {
    version: '1.0',
    plan_id: safePlanId(options.now || new Date(), result?.taskspec?.inferred_goal || 'work-plan'),
    session_id: String(options.sessionId || 'local-session'),
    status: String(result?.status || 'unknown'),
    language: locale,
    conclusion: String(result?.taskspec?.inferred_goal || ''),
    questions: stringArray(result?.clarification_questions || result?.taskspec?.clarification?.questions),
    steps: tasks.map((task) => ({
      id: String(task.id),
      title: String(task.title),
      goal: String(task.goal),
      dependencies: stringArray(task.dependencies),
      outputs: stringArray(task.outputs),
      acceptance: stringArray(task.acceptance),
      state: 'pending'
    })),
    acceptance: stringArray(result?.taskplan?.global_acceptance || result?.taskspec?.success_criteria),
    source_summary: relativeSources(result?.taskspec?.source_map),
    next_actions: nextActionsFor(result, locale)
  };
}
```

Render locale-specific headings, generic Mermaid task graph, relative sources only, and raw ids last. Add `validateWorkPlan()` to `src/validation.js` or re-export it from `src/work-plan.js` after implementing checks for required strings, step ids/titles, and acceptance.

Update `src/index.js` with WorkPlan exports; do not remove PRPlan exports until Task 9 so intermediate tests can stay green.

- [ ] **Step 4: Run WorkPlan tests GREEN**

```powershell
node --test test/work-plan.test.js
node --check src/work-plan.js
```

Expected: all WorkPlan tests pass; syntax check exits `0`.

- [ ] **Step 5: Commit WorkPlan**

```powershell
git add src/work-plan.js src/validation.js src/index.js test/work-plan.test.js
git commit -m "feat: add generic WorkPlan output"
```

---

### Task 5: Cloud Context Consent

**Files:**
- Create: `src/consent.js`
- Create: `test/consent.test.js`
- Modify: `src/context-policy.js`
- Modify: `src/context.js`
- Modify: `src/context-curator.js`
- Modify: `src/index.js`

**Interfaces:**
- Consumes: project root, resolved provider, merged context policy, curated context, exclusions.
- Produces: `buildConsentScope`, `consentFingerprint`, `consentPreview`, `loadConsent`, `saveConsent`, `revokeConsent`, `hasValidConsent`.

- [ ] **Step 1: Write failing pure consent tests**

Create `test/consent.test.js`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  consentFingerprint,
  consentPreview,
  hasValidConsent,
  loadConsent,
  revokeConsent,
  saveConsent
} from '../src/consent.js';

function cloudScope(overrides = {}) {
  return {
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    scanDirs: ['docs', 'src', 'test'],
    allowedExtensions: ['.md', '.js', '.json', '.toml'],
    ignoreDirs: ['.git', '.nplan', 'node_modules'],
    maxSources: 24,
    maxEvidenceCharsPerSource: 1200,
    exclusions: [],
    ...overrides
  };
}

function consentRecord(scope) {
  return {
    version: '1.0',
    provider_id: scope.providerId,
    base_url: scope.baseUrl,
    scope_fingerprint: consentFingerprint(scope),
    confirmed_at: '2026-07-10T00:00:00.000Z',
    exclusions: scope.exclusions
  };
}

function curatedContextFixture() {
  return {
    context_report: {
      source_count: 2,
      budget: { max_sources: 24, max_evidence_chars_per_source: 1200 }
    },
    source_map: [
      { source_id: 'S1', relative_path: 'README.zh-CN.md' },
      { source_id: 'S2', relative_path: 'src/agent.js' }
    ]
  };
}

test('consent stores only provider and scope fingerprint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-'));
  const scope = cloudScope();
  await saveConsent(root, scope);
  const raw = await readFile(join(root, '.nplan', 'consent.json'), 'utf8');
  assert.doesNotMatch(raw, /api[_-]?key|task text|evidence text|C:\\\\/i);
  assert.equal(hasValidConsent(await loadConsent(root), scope), true);
});

test('provider or scan scope change invalidates consent', async () => {
  const saved = consentRecord(cloudScope());
  assert.equal(hasValidConsent(saved, cloudScope({ providerId: 'dashscope' })), false);
  assert.equal(hasValidConsent(saved, cloudScope({ maxSources: 30 })), false);
});

test('consent preview lists relative sources and budgets only', () => {
  const preview = consentPreview(curatedContextFixture(), cloudScope());
  assert.equal(preview.source_count, 2);
  assert.deepEqual(preview.sources, ['README.zh-CN.md', 'src/agent.js']);
  assert.equal(preview.max_chars_per_source, 1200);
  assert.doesNotMatch(JSON.stringify(preview), /C:\\\\/);
});

test('revoke removes valid project consent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-consent-'));
  await saveConsent(root, cloudScope());
  await revokeConsent(root);
  assert.equal(await loadConsent(root), null);
});
```

Add to `test/context-curator.test.js`:

```js
test('context policy exclusions remove matching relative sources before consent preview', async () => {
  const root = await makeContextProject({
    'README.md': '# Product',
    'docs/private.md': '# Private',
    'src/agent.js': 'export const agent = true;'
  });
  const context = curateContext('评估项目', {
    root,
    context_policy: { user_exclusions: ['docs/private.md'] }
  });
  assert.equal(context.source_map.some((source) => source.relative_path === 'docs/private.md'), false);
  assert.deepEqual(context.context_policy.user_exclusions, ['docs/private.md']);
});
```

- [ ] **Step 2: Run consent tests and observe RED**

```powershell
node --test test/consent.test.js
```

Expected: FAIL with module-not-found for `src/consent.js`.

- [ ] **Step 3: Implement fingerprinted project consent**

Create `src/consent.js` using only built-ins:

```js
export function buildConsentScope(provider, policy, exclusions = []) {
  return {
    providerId: String(provider.id),
    baseUrl: String(provider.base_url),
    scanDirs: [...policy.scan_dirs],
    allowedExtensions: [...policy.allowed_extensions],
    ignoreDirs: [...policy.ignore_dirs],
    maxSources: Number(policy.max_sources),
    maxEvidenceCharsPerSource: Number(policy.max_evidence_chars_per_source),
    exclusions: sorted(exclusions)
  };
}

export function consentFingerprint(scope) {
  const canonical = JSON.stringify({
    provider_id: scope.providerId,
    base_url: normalizeBaseUrl(scope.baseUrl),
    scan_dirs: sorted(scope.scanDirs),
    allowed_extensions: sorted(scope.allowedExtensions),
    ignore_dirs: sorted(scope.ignoreDirs),
    max_sources: Number(scope.maxSources),
    max_evidence_chars_per_source: Number(scope.maxEvidenceCharsPerSource),
    exclusions: sorted(scope.exclusions)
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function hasValidConsent(record, scope) {
  return Boolean(
    record?.version === '1.0' &&
    record.provider_id === scope.providerId &&
    record.scope_fingerprint === consentFingerprint(scope)
  );
}

export function consentPreview(context, scope) {
  return {
    provider_id: scope.providerId,
    source_count: Number(context?.context_report?.source_count || 0),
    sources: (context?.source_map || []).map((source) => source.relative_path).filter(Boolean),
    max_chars_per_source: Number(context?.context_report?.budget?.max_evidence_chars_per_source || 0),
    ignored_directories: sorted(scope.ignoreDirs)
  };
}
```

Persist atomically to `<root>/.nplan/consent.json` with only `version`, `provider_id`, `base_url`, `scope_fingerprint`, `confirmed_at`, and sorted exclusions. Export through `src/index.js`.

Add `user_exclusions: []` to `DEFAULT_CONTEXT_POLICY`; merge it in `mergeContextPolicy()` and skip matching relative paths during discovery without allowing paths outside the project root.

Return the effective policy from `curateContext()` so consent fingerprints the exact scan that produced the preview:

```js
return {
  ...context,
  context_policy: policy,
  root: collected.root,
  files: selectedSources.map((source) => source.path),
  source_map: selectedSources,
  evidence_map: evidence,
  context_pack,
  context_report: contextReport,
  conflict_report: conflictReport
};
```

- [ ] **Step 4: Run consent and context tests GREEN**

```powershell
node --test test/consent.test.js test/context-curator.test.js
node --check src/consent.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit consent primitives**

```powershell
git add src/consent.js src/context-policy.js src/context.js src/context-curator.js src/index.js test/consent.test.js test/context-curator.test.js
git commit -m "feat: persist scoped cloud context consent"
```

---

### Task 6: Chinese Locale And Concise CLI Rendering

**Files:**
- Create: `src/i18n.js`
- Create: `test/i18n.test.js`
- Modify: `src/cli.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: locale flag, message key, interpolation variables, WorkPlan.
- Produces: `resolveLocale`, `message`, `normalizeSlashCommand`, Chinese-default `renderInteractiveResult`.

- [ ] **Step 1: Write failing locale and CLI tests**

Create `test/i18n.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { message, normalizeSlashCommand, resolveLocale } from '../src/i18n.js';

test('Simplified Chinese is the default locale', () => {
  assert.equal(resolveLocale(), 'zh-CN');
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(message('zh-CN', 'startup.title'), 'NPlan 规划助手');
});

test('Chinese slash aliases normalize to stable commands', () => {
  assert.equal(normalizeSlashCommand('/帮助'), '/help');
  assert.equal(normalizeSlashCommand('/来源'), '/sources');
  assert.equal(normalizeSlashCommand('/步骤'), '/todo');
  assert.equal(normalizeSlashCommand('/修改 保留预算'), '/revise 保留预算');
  assert.equal(normalizeSlashCommand('/退出'), '/exit');
});
```

Add to `test/cli.test.js`:

```js
import { deriveWorkPlan } from '../src/work-plan.js';
import { plannedChineseResult } from './fixtures.js';

test('help and startup are Chinese by default with English opt-in', async () => {
  const zh = await runCli(['--help']);
  const en = await runCli(['--lang', 'en', '--help']);
  assert.match(zh.stdout, /用法：nplan/);
  assert.match(zh.stdout, /\/帮助/);
  assert.match(en.stdout, /Usage: nplan/);
});

test('interactive result shows conclusion steps acceptance and next action', () => {
  const text = renderInteractiveResult(plannedChineseResult(), {
    workPlan: deriveWorkPlan(plannedChineseResult(), { locale: 'zh-CN' }),
    locale: 'zh-CN'
  });
  assert.match(text, /结论/);
  assert.match(text, /行动步骤/);
  assert.match(text, /验收标准/);
  assert.match(text, /下一步/);
  assert.doesNotMatch(text, /status:|deliverables:|Full JSON/);
});
```

- [ ] **Step 2: Run locale tests and observe RED**

```powershell
node --test --test-name-pattern "Chinese|Simplified" test/i18n.test.js
node --test --test-name-pattern "Chinese by default|conclusion steps" test/cli.test.js
```

Expected: FAIL because `src/i18n.js`, `--lang`, and WorkPlan rendering are absent.

- [ ] **Step 3: Implement locale dictionary and CLI rendering**

Create `src/i18n.js`:

```js
const MESSAGES = {
  'zh-CN': {
    'startup.title': 'NPlan 规划助手',
    'startup.hint': '直接输入任务；输入 /帮助 查看命令。',
    'result.conclusion': '结论',
    'result.questions': '需要确认',
    'result.steps': '行动步骤',
    'result.acceptance': '验收标准',
    'result.next': '下一步'
  },
  en: {
    'startup.title': 'NPlan Planner',
    'startup.hint': 'Type a task; use /help for commands.',
    'result.conclusion': 'Conclusion',
    'result.questions': 'Questions',
    'result.steps': 'Action steps',
    'result.acceptance': 'Acceptance',
    'result.next': 'Next'
  }
};

export function resolveLocale(value) {
  return value === 'en' ? 'en' : 'zh-CN';
}

export function message(locale, key, values = {}) {
  const template = MESSAGES[resolveLocale(locale)][key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
}
```

Add a complete alias map for all approved Chinese commands. Extend `parseArgs` with `--lang <zh-CN|en>` and reject other values. Replace the single English HELP constant with locale renderers. Change `renderInteractiveResult` to render WorkPlan sections and no raw ids by default.

- [ ] **Step 4: Run locale and CLI tests GREEN**

```powershell
node --test test/i18n.test.js
node --test --test-name-pattern "Chinese by default|conclusion steps" test/cli.test.js
node --check src/i18n.js
node --check src/cli.js
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit Chinese-first rendering**

```powershell
git add src/i18n.js src/cli.js test/i18n.test.js test/cli.test.js
git commit -m "feat: make CLI Chinese-first"
```

---

### Task 7: Consent Integration And Sanitized Session v2

**Files:**
- Create: `src/session-store.js`
- Create: `test/session-store.test.js`
- Modify: `src/cli.js`
- Modify: `src/agent.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: prepared agent context, runtime provider, consent module, WorkPlan.
- Produces: `createSession`, `recordSessionTurn`, `loadSession`, `loadLatestSession`, `sanitizePlanningResult`, interactive consent flow, `nplan consent`, `--allow-cloud-context`.

- [ ] **Step 1: Write failing session and consent-integration tests**

Create `test/session-store.test.js`:

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deriveWorkPlan } from '../src/work-plan.js';
import {
  createSession,
  loadLatestSession,
  loadSession,
  recordSessionTurn,
  saveSession,
  sessionFile
} from '../src/session-store.js';
import { plannedChineseResult } from './fixtures.js';

function plannedResultWithSensitiveContext() {
  const result = plannedChineseResult();
  result.taskspec.source_map = [{
    source_id: 'S1',
    path: 'C:\\Users\\qiyue\\secret.md',
    relative_path: 'secret.md'
  }];
  result.taskspec.evidence_map = [{
    evidence_id: 'E1',
    source_id: 'S1',
    text: 'evidence text'
  }];
  result.taskspec.background_context = ['C:\\Users\\qiyue\\secret.md'];
  return result;
}

async function writeV1Session() {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-v1-'));
  const dir = join(root, '.nplan', 'sessions');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '20260710120000-old00001.json'), JSON.stringify({
    version: '1.0',
    id: '20260710120000-old00001',
    turns: []
  }), 'utf8');
  return root;
}

test('session v2 restores WorkPlan without evidence or absolute paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nplan-session-v2-'));
  const session = createSession();
  recordSessionTurn(session, {
    request: '规划北京亲子游',
    result: plannedResultWithSensitiveContext(),
    workPlan: deriveWorkPlan(plannedResultWithSensitiveContext(), { sessionId: session.id })
  });
  await saveSession(root, session);
  const raw = await readFile(sessionFile(root, session.id), 'utf8');
  assert.doesNotMatch(raw, /evidence text|C:\\\\Users|api[_-]?key/i);
  const loaded = await loadSession(root, session.id);
  assert.equal(loaded.version, '2.0');
  assert.equal(loaded.last_work_plan.steps.length, 2);
});

test('v1 session returns an explicit incompatibility result', async () => {
  const root = await writeV1Session();
  const loaded = await loadLatestSession(root);
  assert.equal(loaded.incompatible, true);
  assert.equal(loaded.version, '1.0');
});
```

Add CLI tests:

```js
test('cloud print mode refuses before any model request without consent', async () => {
  await withCloudModelServer(async ({ configPath, seen, cwd, env }) => {
    const result = await runCli(['--config-path', configPath, '-p', '规划亲子游'], '', env, cwd);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /尚未授权发送本地上下文/);
    assert.equal(seen.length, 0);
  });
});

test('one-shot cloud authorization permits exactly two model requests', async () => {
  await withCloudModelServer(async ({ configPath, seen, cwd, env }) => {
    const result = await runCli([
      '--config-path', configPath,
      '--allow-cloud-context',
      '-p', '--output-format', 'summary',
      '规划亲子游'
    ], '', env, cwd);
    assert.equal(result.code, 0);
    assert.equal(seen.length, 2);
  });
});

test('local provider skips cloud consent', async () => {
  await withLocalModelServer(async ({ configPath, seen, cwd }) => {
    const result = await runCli(['--config-path', configPath, '-p', '规划亲子游'], '', {}, cwd);
    assert.equal(result.code, 0);
    assert.equal(seen.length, 2);
  });
});

test('resumed session restores todo and export capability', async () => {
  await withLocalModelServer(async ({ configPath, cwd }) => {
    const first = await runCli(
      ['--config-path', configPath],
      '规划亲子游\n/退出\n',
      {},
      cwd
    );
    assert.equal(first.code, 0);
    const second = await runCli(
      ['--config-path', configPath, '--resume', 'latest'],
      '/步骤\n/导出\n/退出\n',
      {},
      cwd
    );
    assert.match(second.stdout, /已恢复计划/);
    assert.match(second.stdout, /行动步骤/);
    assert.match(second.stdout, /已导出/);
  });
});
```

Replace the existing single-draft server helper with a queue-based helper and wrappers:

```js
async function withDraftModelServer(fn, {
  drafts = [taskSpecDraft(), taskPlanDraft()],
  providerId = 'localtest',
  contextLocation = 'local'
} = {}) {
  const seen = [];
  const server = createServer(async (request, response) => {
    const body = JSON.parse(await readRequest(request));
    seen.push({ url: request.url, headers: request.headers, body });
    const draft = drafts[Math.min(seen.length - 1, drafts.length - 1)];
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const cwd = await mkdtemp(join(tmpdir(), 'nplan-model-'));
  const configPath = join(cwd, 'config.toml');
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  await writeFile(configPath, [
    'model = "semantic-test-model"',
    `model_provider = "${providerId}"`,
    `[model_providers.${providerId}]`,
    `base_url = "${baseUrl}"`,
    'env_key = "FAKE_MODEL_KEY"',
    `context_location = "${contextLocation}"`,
    'wire_api = "chat_completions"'
  ].join('\n'), 'utf8');
  try {
    return await fn({ configPath, cwd, seen, env: { FAKE_MODEL_KEY: 'secret' }, port });
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
}

const withTwoDraftModelServer = (fn) => withDraftModelServer(fn);
const withLocalModelServer = (fn) => withDraftModelServer(fn);
const withCloudModelServer = (fn) => withDraftModelServer(fn, { contextLocation: 'cloud' });
```

Use `withCloudModelServer` for cloud-refusal and one-shot-authorization tests. This keeps all transport local while exercising the explicit provider `context_location = "cloud"` policy. Do not rely on external DNS or network access.

- [ ] **Step 2: Run focused tests and observe RED**

```powershell
node --test test/session-store.test.js
node --test --test-name-pattern "refuses before|one-shot cloud|local provider skips|restores todo" test/cli.test.js
```

Expected: FAIL because session v2 and consent CLI gates are absent.

- [ ] **Step 3: Extract session storage and integrate consent before model calls**

Create `src/session-store.js` with:

```js
export function sanitizePlanningResult(result) {
  if (!result) return null;
  const taskspec = structuredClone(result.taskspec || {});
  delete taskspec.source_map;
  delete taskspec.evidence_map;
  delete taskspec.background_context;
  if (taskspec.provenance) taskspec.provenance.files_used = [];
  taskspec.known_inputs = [];
  return {
    status: result.status,
    taskspec,
    taskplan: result.taskplan || null,
    taskspec_report: result.taskspec_report || null,
    taskplan_report: result.taskplan_report || null,
    clarification_questions: result.clarification_questions || []
  };
}

export function recordSessionTurn(session, { request, revision = '', result, workPlan }) {
  const turn = {
    at: new Date().toISOString(),
    request: String(request),
    revision: String(revision),
    result: sanitizePlanningResult(result),
    work_plan: workPlan,
    sources: (result?.taskspec?.source_map || []).map((source) => ({
      source_id: String(source.source_id),
      relative_path: String(source.relative_path)
    }))
  };
  session.turns.push(turn);
  session.last_result = turn.result;
  session.last_work_plan = turn.work_plan;
  return session;
}
```

Use atomic writes and version `2.0`. Move all session filesystem code out of `src/cli.js`.

In CLI analysis:

```js
const prepared = state.runtime.agent.prepare(prompt, contextForSession(state.session));
const authorization = await authorizePreparedContext({
  prepared,
  baseContext: contextForSession(state.session),
  runtime: state.runtime,
  streams,
  locale: state.locale,
  allowOnce: state.allowCloudContext
});
state.lastResult = await state.runtime.agent.analyzePreparedAsync(authorization.prepared, {
  cloudContextAuthorized: authorization.allowed
});
state.lastWorkPlan = deriveWorkPlan(state.lastResult, {
  sessionId: state.session.id,
  locale: state.locale
});
```

For non-TTY mode, return exit code `2` before calling the model when cloud consent is missing. Add the `consent` command and `--allow-cloud-context` flag. Interactive consent supports preview, exclusions, remember, and cancel. Direct text with an existing WorkPlan uses the same revision prompt as `/revise`; `/new` clears it.

Use one authorization function before `analyzePreparedAsync()`:

```js
async function authorizePreparedContext({ prepared, baseContext = {}, runtime, streams, locale, allowOnce = false }) {
  if (!runtime.modelClient.requiresContextConsent) {
    streams.output.write('本地模型：数据不离开本机。\n');
    return { allowed: true, persisted: false, local: true, prepared };
  }
  let scope = buildConsentScope(runtime.modelClient.provider, prepared.context.context_policy);
  if (allowOnce) return { allowed: true, persisted: false, local: false, prepared };
  const saved = await loadConsent(prepared.context.root);
  if (hasValidConsent(saved, scope)) return { allowed: true, persisted: true, local: false, prepared };
  if (!streams.input.isTTY || !streams.output.isTTY) {
    const error = new Error('cloud_context_consent_required');
    error.code = 'cloud_context_consent_required';
    throw error;
  }
  let preview = consentPreview(prepared.context, scope);
  while (true) {
    renderConsentPreview(streams.output, preview, locale);
    const answer = await askConsentChoice(streams);
    if (answer === '1') {
      renderConsentSources(streams.output, preview.sources, locale);
      continue;
    }
    if (answer === '2') {
      const exclusions = await askConsentExclusions(streams, preview.sources);
      const nextContext = {
        ...baseContext,
        context_policy: {
          ...(baseContext.context_policy || {}),
          user_exclusions: exclusions
        }
      };
      prepared = runtime.agent.prepare(prepared.request, nextContext);
      scope = buildConsentScope(runtime.modelClient.provider, prepared.context.context_policy, exclusions);
      preview = consentPreview(prepared.context, scope);
      continue;
    }
    if (answer === '3') {
      await saveConsent(prepared.context.root, scope);
      return { allowed: true, persisted: true, local: false, prepared };
    }
    if (answer === '4') return { allowed: false, persisted: false, local: false, prepared };
    streams.output.write('请输入 1、2、3 或 4。\n');
  }
}
```

`askConsentExclusions()` accepts comma-separated relative paths, rejects absolute paths or `..`, and re-runs local curation with the exclusions before saving the new fingerprint.

Update `makeRuntime()` so the consent layer can inspect the exact resolved provider without reaching into agent internals:

```js
const modelClient = new OpenAICompatiblePlanningModel({ config });
return {
  modelClient,
  agent: new LocalPlanningAgent({ modelClient }),
  config
};
```

Resume hydrates `lastResult` and `lastWorkPlan` from session v2. Export and todo use WorkPlan renderers.

- [ ] **Step 4: Run session and CLI integration tests GREEN**

```powershell
node --test test/session-store.test.js test/consent.test.js
node --test --test-name-pattern "refuses before|one-shot cloud|local provider skips|restores todo" test/cli.test.js
node --check src/session-store.js
node --check src/cli.js
```

Expected: all commands pass.

- [ ] **Step 5: Commit consent integration and session v2**

```powershell
git add src/session-store.js src/cli.js src/agent.js test/session-store.test.js test/cli.test.js
git commit -m "feat: gate cloud context and restore session plans"
```

---

### Task 8: Provider Wizard, Actionable Errors, And Doctor

**Files:**
- Create: `src/model-errors.js`
- Create: `test/model-errors.test.js`
- Modify: `src/model-wizard.js`
- Modify: `src/model-init.js`
- Modify: `src/model-config.js`
- Modify: `src/cli.js`
- Modify: `test/cli.test.js`
- Modify: `test/model-config.test.js`

**Interfaces:**
- Consumes: provider definitions, fetch errors/responses, locale, TTY streams.
- Produces: `classifyModelError`, `formatModelError`, canonical grouped provider choices, masked `askSecret`, local and online doctor output.

- [ ] **Step 1: Write failing error, wizard, and doctor tests**

Create `test/model-errors.test.js`:

```js
for (const [name, error, code] of [
  ['timeout', new DOMException('timed out', 'TimeoutError'), 'timeout'],
  ['credentials', Object.assign(new Error('HTTP 401'), { status: 401 }), 'credentials'],
  ['rate limit', Object.assign(new Error('HTTP 429'), { status: 429 }), 'rate_limit'],
  ['not found', Object.assign(new Error('HTTP 404'), { status: 404 }), 'not_found'],
  ['server', Object.assign(new Error('HTTP 503'), { status: 503 }), 'provider_error']
]) {
  test(`classifies ${name} errors with Chinese action`, () => {
    const result = classifyModelError(error);
    assert.equal(result.code, code);
    assert.ok(result.message_zh);
    assert.ok(result.next_action_zh);
  });
}
```

Add tests to `test/cli.test.js` and `test/model-config.test.js`:

```js
async function runSetup(lines) {
  const cwd = await mkdtemp(join(tmpdir(), 'nplan-setup-zh-'));
  try {
    return await runCli(
      ['setup'],
      `${lines.join('\n')}\n`,
      { HOME: cwd, USERPROFILE: cwd, NPLAN_HOME: '' },
      cwd
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function runTtySetupWithSecret(secret) {
  const input = new PassThrough();
  input.isTTY = true;
  let rawMode = false;
  input.setRawMode = (value) => { rawMode = value; return input; };
  let stdout = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      callback();
    }
  });
  output.isTTY = true;
  const promise = runModelSetupWizard({
    streams: { input, output, error: new PassThrough() },
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
  });
  input.write('deepseek\n');
  input.write(`${secret}\n`);
  input.write('否\n');
  input.write('\n');
  input.write('否\n');
  input.end();
  await promise;
  return { stdout, rawMode };
}

async function runCliWithHealthyProvider(args) {
  return withHealthServer(async ({ configPath, requests, cwd, env }) => {
    const result = await runCli(['--config-path', configPath, ...args], '', env, cwd);
    return { ...result, seenTaskPayloads: requests.filter((item) => item.url.endsWith('/chat/completions')).length };
  });
}

test('provider choices show canonical groups without aliases', () => {
  const choices = listProviderChoices();
  assert.deepEqual(choices.recommended.map((item) => item.id), ['deepseek', 'dashscope', 'kimi', 'zhipu', 'doubao']);
  assert.deepEqual(choices.local.map((item) => item.id), ['ollama', 'lmstudio']);
  assert.equal(choices.more.some((item) => item.id === 'tongyi'), false);
});

test('doctor distinguishes local config from online health', async () => {
  const local = await runCli(['doctor']);
  assert.match(local.stdout, /未测试联网/);
  const online = await runCliWithHealthyProvider(['doctor', '--online']);
  assert.match(online.stdout, /连接正常/);
  assert.equal(online.seenTaskPayloads, 0);
});

test('setup accepts Chinese confirmation and re-prompts invalid provider', async () => {
  const result = await runSetup(['not-a-provider', 'deepseek', '', '否', '']);
  assert.match(result.stdout, /无法识别，请重新选择/);
  assert.equal(result.code, 0);
});

test('TTY secret entry does not echo API key', async () => {
  const result = await runTtySetupWithSecret('secret-value');
  assert.doesNotMatch(result.stdout, /secret-value/);
  assert.equal(result.rawMode, false);
});
```

Use this dedicated health helper:

```js
async function withHealthServer(fn) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method });
    if (!request.url.endsWith('/models')) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'doctor must only call /models' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'semantic-test-model' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const cwd = await mkdtemp(join(tmpdir(), 'nplan-doctor-online-'));
  const configPath = join(cwd, 'config.toml');
  await writeFile(configPath, [
    'model = "semantic-test-model"',
    'model_provider = "cloudtest"',
    '[model_providers.cloudtest]',
    `base_url = "http://127.0.0.1:${port}/v1"`,
    `models_url = "http://127.0.0.1:${port}/v1/models"`,
    'context_location = "cloud"',
    'env_key = "FAKE_MODEL_KEY"',
    'wire_api = "chat_completions"'
  ].join('\n'), 'utf8');
  try {
    return await fn({ configPath, requests, cwd, env: { FAKE_MODEL_KEY: 'secret' } });
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Run focused tests and observe RED**

```powershell
node --test test/model-errors.test.js
node --test --test-name-pattern "canonical groups|distinguishes local|Chinese confirmation|does not echo" test/cli.test.js test/model-config.test.js
```

Expected: FAIL because error classification, grouped choices, online doctor, Chinese confirmation, and secret masking are absent.

- [ ] **Step 3: Implement errors, grouped setup, and diagnostics**

Create `src/model-errors.js`:

```js
export function classifyModelError(error) {
  const status = Number(error?.status || 0);
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return result('timeout', '模型服务响应超时。', '检查网络或增大 timeout_ms 后重试。');
  }
  if (status === 401 || status === 403) {
    return result('credentials', 'API Key 无效或没有权限。', '重新运行 nplan setup 配置密钥。');
  }
  if (status === 429) {
    return result('rate_limit', '请求过多或额度不足。', '稍后重试并检查账户额度。');
  }
  if (status === 404) {
    return result('not_found', '模型或接口地址不存在。', '检查模型名和 base_url。');
  }
  if (status >= 500) {
    return result('provider_error', '模型服务暂时异常。', '稍后重试或切换 Provider。');
  }
  if (/JSON|schema|object/i.test(error?.message || '')) {
    return result('invalid_output', '模型返回内容不符合规划格式。', '切换更可靠的模型后重试。');
  }
  return result('network', '无法连接模型服务。', '检查网络、本地服务地址或代理设置。');
}
```

Add canonical metadata (`canonical_id`, `category`, `recommended`) to built-in provider definitions or a side table in `src/model-init.js`; `listProviderChoices()` returns `{recommended, local, more}` and excludes aliases.

Implement `askSecret()` using temporary raw mode for TTY input. Non-TTY uses the existing line queue:

```js
function askSecret({ input, output, rl }, prompt) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return rl.ask(prompt, '');
  }
  output.write(`${prompt}: `);
  rl.pause();
  input.setRawMode(true);
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('setup cancelled'));
        if (char === '\u007f' || char === '\b') {
          if (value) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
        } else {
          value += char;
          output.write('*');
        }
      }
    };
    const finish = (error = null) => {
      input.off('data', onData);
      input.setRawMode(false);
      rl.resume();
      output.write('\n');
      if (error) reject(error); else resolve(value.trim());
    };
    input.on('data', onData);
  });
}

function parseConfirmation(value, defaultValue) {
  const answer = String(value || '').trim().toLowerCase();
  if (!answer) return defaultValue;
  if (['y', 'yes', '是', '好', '确认'].includes(answer)) return true;
  if (['n', 'no', '否', '取消'].includes(answer)) return false;
  return null;
}
```

When `parseConfirmation()` returns `null`, print the localized invalid-answer message and ask again.

`doctor` reports config, API-key presence, consent, and `未测试联网`. `doctor --online` calls the provider models endpoint or a minimal provider health endpoint, never the task endpoints, and formats classified errors.

- [ ] **Step 4: Run diagnostics and setup tests GREEN**

```powershell
node --test test/model-errors.test.js test/model-config.test.js
node --test --test-name-pattern "canonical groups|distinguishes local|Chinese confirmation|does not echo" test/cli.test.js
node --check src/model-errors.js
node --check src/model-wizard.js
```

Expected: all commands pass.

- [ ] **Step 5: Commit setup and diagnostics**

```powershell
git add src/model-errors.js src/model-wizard.js src/model-init.js src/model-config.js src/cli.js test/model-errors.test.js test/model-config.test.js test/cli.test.js
git commit -m "feat: simplify setup and add actionable diagnostics"
```

---

### Task 9: Remove PR Surface, Bump v0.2, Synchronize Docs, And Verify

**Files:**
- Delete: `src/pr-plan.js`
- Delete: `test/pr-plan.test.js`
- Modify: `src/index.js`
- Modify: `src/cli.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `config.example.toml`
- Modify: `docs/agent-module-spec.md`
- Modify: `docs/model-providers.md`
- Modify: `docs/nplan_process_task_obsidian.md`
- Test: `test/public-api.test.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: all v0.2 modules and approved design specification.
- Produces: public v0.2 API and documentation with no obsolete PRPlan behavior.

- [ ] **Step 1: Write failing public-surface and environment-isolation tests**

Create `test/public-api.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../src/index.js';
import packageJson from '../package.json' with { type: 'json' };

test('v0.2 public API exposes WorkPlan and removes PRPlan', () => {
  assert.equal(packageJson.version, '0.2.0');
  assert.equal(typeof api.deriveWorkPlan, 'function');
  assert.equal(Object.hasOwn(api, 'derivePrPlan'), false);
  assert.equal(Object.hasOwn(api, 'renderObsidianPrPlan'), false);
});
```

Update `runCli()` in `test/cli.test.js` to delete all built-in provider API-key variables from its child environment before applying the test-specific `env` object:

```js
const PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'DASHSCOPE_API_KEY', 'DEEPSEEK_API_KEY',
  'MOONSHOT_API_KEY', 'ZHIPUAI_API_KEY', 'QIANFAN_API_KEY', 'ARK_API_KEY',
  'HUNYUAN_API_KEY', 'SILICONFLOW_API_KEY', 'MINIMAX_API_KEY', 'BAICHUAN_API_KEY',
  'YI_API_KEY', 'STEPFUN_API_KEY', 'MODELSCOPE_API_KEY'
];

function isolatedEnv(overrides = {}) {
  const next = { ...process.env };
  for (const key of PROVIDER_ENV_KEYS) delete next[key];
  return { ...next, ...overrides };
}
```

- [ ] **Step 2: Run the public API test and observe RED**

```powershell
node --test test/public-api.test.js
```

Expected: FAIL because package version is `0.1.0` and PRPlan exports still exist.

- [ ] **Step 3: Remove obsolete code and synchronize every public document**

Delete `src/pr-plan.js` and `test/pr-plan.test.js`. Remove every PRPlan import, state field, command description, and export. Confirm `/todo` and `/export` use WorkPlan.

Set package version:

```json
{
  "name": "nplan",
  "version": "0.2.0"
}
```

Update all listed documents with these exact public facts:

```text
- 默认简体中文；--lang en 切换英文。
- 云Provider首次发送项目信息前需要 nplan consent；本地Provider不需要。
- 任务理解与任务规划使用两次模型调用。
- 默认输出和导出是通用 WorkPlan，不包含PR术语。
- 会话v2可恢复、修改和导出计划，不保存证据正文或绝对路径。
- doctor只检查本地；doctor --online显式检查Provider连接。
```

Add a breaking-change section to both READMEs: v1 sessions are not loaded, PRPlan API is removed, and scripts using cloud print mode must save consent or pass `--allow-cloud-context`.

Remove every obsolete project claim with:

```powershell
Get-ChildItem README.md,README.zh-CN.md,config.example.toml,docs -Recurse -File |
  Select-String -Pattern 'PRPlan|PR Plan|PR Draft|nplan-pr-plan' -CaseSensitive
```

Expected after editing: no matches outside historical files under `docs/superpowers/specs/` and `docs/superpowers/plans/`.

- [ ] **Step 4: Run complete verification**

Run:

```powershell
npm.cmd test
node --check src/cli.js
node --check src/model-client.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/consent.js
node --check src/session-store.js
node --check src/work-plan.js
node --check src/model-errors.js
node .\src\cli.js --help
node .\src\cli.js doctor
```

Expected:

- all tests pass with zero failures, even when the parent shell contains `DEEPSEEK_API_KEY`;
- every syntax check exits `0`;
- help is Simplified Chinese by default;
- doctor explicitly says networking was not tested;
- no command sends external context during verification.

- [ ] **Step 5: Run final boundary and stale-name checks**

```powershell
Get-ChildItem src,test,README.md,README.zh-CN.md,config.example.toml,docs\agent-module-spec.md,docs\model-providers.md,docs\nplan_process_task_obsidian.md -Recurse -File |
  Select-String -Pattern 'PRPlan|PR Plan|PR Draft|nplan-pr-plan|OpenAICompatibleTaskModel|planFromTaskSpec'
git diff --check
git status --short
```

Expected: no stale-name matches; `git diff --check` has no output; status lists only the intended v0.2 implementation changes.

- [ ] **Step 6: Commit the v0.2 release surface**

```powershell
git add package.json README.md README.zh-CN.md config.example.toml docs/agent-module-spec.md docs/model-providers.md docs/nplan_process_task_obsidian.md src test
git commit -m "feat: complete NPlan v0.2 Chinese planning workflow"
```
