import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  defaultWorkPlanExportPath,
  deriveWorkPlan,
  renderWorkPlanMarkdown,
  renderWorkPlanSources,
  renderWorkPlanTodo,
  validateWorkPlan
} from '../src/work-plan.js';

test('planned result derives a generic Chinese WorkPlan', () => {
  const workPlan = deriveWorkPlan(plannedChineseResult(), {
    sessionId: '20260710120000-abcd1234',
    locale: 'zh-CN',
    now: new Date('2026-07-10T00:00:00Z')
  });

  assert.equal(workPlan.version, '1.0');
  assert.equal(workPlan.status, 'planned');
  assert.equal(workPlan.language, 'zh-CN');
  assert.equal(workPlan.session_id, '20260710120000-abcd1234');
  assert.equal(workPlan.plan_id, '20260710-制定三天北京亲子游计划');
  assert.equal(workPlan.steps[0].title, '确认家庭成员与出行限制');
  assert.deepEqual(workPlan.acceptance, ['行程完整', '总预算不超过五千元']);
  assert.equal(validateWorkPlan(workPlan).valid, true);
});

test('generic Markdown is Chinese-first and contains no software-review terminology', () => {
  const workPlan = deriveWorkPlan(plannedChineseResult(), {
    sessionId: '20260710120000-abcd1234',
    locale: 'zh-CN',
    now: new Date('2026-07-10T00:00:00Z')
  });
  const markdown = renderWorkPlanMarkdown(workPlan);

  assert.match(markdown, /^---\ntype: nplan-work-plan/m);
  assert.match(markdown, /# 工作计划/);
  assert.match(markdown, /## 行动步骤/);
  assert.match(markdown, /```mermaid\nflowchart TD/);
  assert.doesNotMatch(markdown, /PRPlan|PR Plan|PR Draft|pull request|pr-plan/i);
  assert.doesNotMatch(markdown, /C:\\Users\\qiyue/);
  assert.ok(markdown.indexOf(workPlan.plan_id) > markdown.indexOf('## 原始标识'));
  assert.ok(markdown.indexOf('## 原始标识') > markdown.indexOf('## 下一步'));
});

test('clarification result derives questions without fake steps or graph', () => {
  const result = clarificationResult();
  result.taskplan = plannedChineseResult().taskplan;
  const workPlan = deriveWorkPlan(result, { locale: 'zh-CN' });
  const markdown = renderWorkPlanMarkdown(workPlan);

  assert.equal(workPlan.status, 'needs_clarification');
  assert.deepEqual(workPlan.steps, []);
  assert.deepEqual(workPlan.questions, ['儿童年龄是多少？']);
  assert.match(markdown, /儿童年龄是多少？/);
  assert.doesNotMatch(markdown, /```mermaid/);
});

test('todo and default export path use generic WorkPlan naming', () => {
  const workPlan = deriveWorkPlan(plannedChineseResult(), {
    locale: 'zh-CN',
    now: new Date('2026-07-10T00:00:00Z')
  });

  assert.match(renderWorkPlanTodo(workPlan), /^行动步骤：/);
  assert.match(renderWorkPlanTodo(workPlan), /- \[ \] 确认家庭成员与出行限制/);
  assert.equal(defaultWorkPlanExportPath(workPlan), `.nplan/exports/${workPlan.plan_id}.md`);
});

test('sources expose relative paths only', () => {
  const result = plannedChineseResult();
  result.taskspec.source_map.push({
    source_id: 'S2',
    kind: 'instruction',
    relative_path: 'C:\\Users\\qiyue\\private.md'
  });
  const workPlan = deriveWorkPlan(result, { locale: 'zh-CN' });
  const sources = renderWorkPlanSources(workPlan);

  assert.deepEqual(workPlan.source_summary, [
    { source_id: 'S1', kind: 'instruction', relative_path: 'docs/guide.md', title: '项目指南' }
  ]);
  assert.match(sources, /^来源：/);
  assert.match(sources, /docs\/guide\.md/);
  assert.doesNotMatch(sources, /C:\\Users\\qiyue/);
});

test('English locale renders English headings and next actions', () => {
  const workPlan = deriveWorkPlan(plannedChineseResult(), { locale: 'en' });
  const markdown = renderWorkPlanMarkdown(workPlan);

  assert.equal(workPlan.language, 'en');
  assert.match(renderWorkPlanTodo(workPlan), /^Action Steps:/);
  assert.match(markdown, /# Work Plan/);
  assert.match(markdown, /## Action Steps/);
  assert.match(markdown, /Outputs: 三日行程, 预算表/);
  assert.deepEqual(workPlan.next_actions, ['Review the plan and provide any needed changes.']);
});

test('WorkPlan validator reports missing fields and invalid steps', () => {
  const report = validateWorkPlan({
    version: '',
    plan_id: 'plan-1',
    session_id: 'session-1',
    status: 'planned',
    language: 'zh-CN',
    conclusion: '完成计划',
    questions: [],
    steps: [{ id: '', title: '', acceptance: [] }],
    acceptance: [],
    source_summary: [],
    next_actions: []
  });

  assert.equal(report.valid, false);
  assert.ok(report.issues.includes('missing_version'));
  assert.ok(report.issues.includes('step_missing_id'));
  assert.ok(report.issues.includes('step_missing_title'));
  assert.ok(report.issues.includes('step_missing_acceptance'));
  assert.ok(report.issues.includes('missing_acceptance'));
});

function plannedChineseResult() {
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
      planner_policy: {
        max_depth: 3,
        max_tasks: 12,
        allow_parallel_groups: true,
        require_acceptance_per_task: true,
        prefer_atomic_tasks: true
      },
      tasks: [modelTask()],
      replan_policy: { trigger_on: ['validation_failure'], max_replans: 0 }
    }
  };
}

function clarificationResult() {
  const taskspec = readyTaskSpec({
    missing_information: { blocking: ['儿童年龄'], non_blocking: [] },
    clarification: {
      requires_clarification: true,
      questions: ['儿童年龄是多少？'],
      reason: 'blocking information is missing'
    },
    planning_readiness: { score: 0.55, decision: 'clarify_then_plan' }
  });
  return {
    status: 'needs_clarification',
    taskspec,
    clarification_questions: ['儿童年龄是多少？']
  };
}

function readyTaskSpec(overrides = {}) {
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
    source_map: [
      {
        source_id: 'S1',
        kind: 'instruction',
        path: 'C:\\Users\\qiyue\\project\\docs\\guide.md',
        relative_path: 'docs/guide.md',
        knowledge: { title: '项目指南' }
      }
    ],
    evidence_map: [],
    context_report: { source_count: 1, evidence_count: 0, dropped_source_count: 0, warnings: [] },
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

function modelTask(overrides = {}) {
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
