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
