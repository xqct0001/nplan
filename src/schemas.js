export const DEFAULT_VERSION = '1.0';

export const OUTPUT_FORMATS = ['json', 'markdown', 'yaml', 'text', 'diagram', 'code', 'mixed', 'unknown'];

export const RISK_LEVELS = ['low', 'medium', 'high', 'unknown'];

export const PLAN_STYLES = ['dag'];

export const REPLAN_TRIGGERS = [
  'schema_invalid',
  'cyclic_dependency',
  'blocking_info_found',
  'task_too_coarse',
  'missing_dependency',
  'coverage_gap',
  'validation_failure',
  'planner_policy_invalid'
];

export const TASKSPEC_REQUIRED_FIELDS = [
  'version',
  'surface_request',
  'inferred_goal',
  'task_type',
  'audience',
  'target_object',
  'deliverables',
  'output_format',
  'constraints',
  'known_inputs',
  'missing_information',
  'assumptions',
  'ambiguities',
  'success_criteria',
  'clarification',
  'checkpoint_policy',
  'quality_bar',
  'planning_readiness',
  'risk_level',
  'provenance'
];

export const TASKPLAN_REQUIRED_FIELDS = [
  'version',
  'plan_style',
  'global_goal',
  'global_acceptance',
  'tasks',
  'replan_policy'
];

export const TASK_REQUIRED_FIELDS = [
  'id',
  'title',
  'goal',
  'inputs',
  'outputs',
  'dependencies',
  'parallel_group',
  'acceptance',
  'complexity',
  'risk',
  'model_tier',
  'state'
];

export const DEFAULT_PLANNER_POLICY = {
  max_depth: 3,
  max_tasks: 12,
  allow_parallel_groups: true,
  require_acceptance_per_task: true,
  prefer_atomic_tasks: true
};

export const TASKSPEC_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'TaskSpec',
  type: 'object',
  required: TASKSPEC_REQUIRED_FIELDS,
  properties: {
    version: { type: 'string', const: DEFAULT_VERSION },
    surface_request: { type: 'string' },
    inferred_goal: { type: 'string' },
    task_type: {
      type: 'string',
      enum: [
        'planning',
        'coding',
        'debugging',
        'research',
        'writing',
        'data_analysis',
        'automation',
        'design',
        'unknown'
      ]
    },
    audience: { type: 'string' },
    target_object: { type: 'string' },
    deliverables: { type: 'array' },
    output_format: {
      type: 'string',
      enum: OUTPUT_FORMATS
    },
    constraints: { type: 'object' },
    context_requirements: { type: 'array' },
    source_map: { type: 'array' },
    evidence_map: { type: 'array' },
    context_report: { type: 'object' },
    conflict_report: { type: 'object' },
    missing_information: { type: 'object' },
    clarification: { type: 'object' },
    checkpoint_policy: { type: 'object' },
    quality_bar: { type: 'array' },
    planning_readiness: { type: 'object' },
    risk_level: { type: 'string', enum: RISK_LEVELS }
  }
};

export const TASKPLAN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'TaskPlan',
  type: 'object',
  required: TASKPLAN_REQUIRED_FIELDS,
  properties: {
    version: { type: 'string', const: DEFAULT_VERSION },
    plan_style: { type: 'string', enum: PLAN_STYLES },
    global_goal: { type: 'string' },
    global_acceptance: { type: 'array' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: TASK_REQUIRED_FIELDS,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          goal: { type: 'string' },
          inputs: { type: 'array', items: { type: 'string' } },
          outputs: { type: 'array', items: { type: 'string' } },
          dependencies: { type: 'array', items: { type: 'string' } },
          parallel_group: { type: 'string' },
          acceptance: { type: 'array', items: { type: 'string' } },
          complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          model_tier: { type: 'string' },
          state: { type: 'string', const: 'pending' }
        },
        additionalProperties: false
      }
    },
    replan_policy: { type: 'object' }
  }
};

export function makeDeliverable(name, format = 'json', required = true) {
  return { name, format, required };
}

export function makeTask(
  id,
  title,
  goal,
  inputs,
  outputs,
  dependencies = [],
  acceptance = [],
  overrides = {}
) {
  return {
    id,
    title,
    goal,
    inputs: [...inputs],
    outputs: [...outputs],
    dependencies: [...dependencies],
    parallel_group: 'G1',
    acceptance: [...acceptance],
    complexity: 'medium',
    risk: 'medium',
    model_tier: 'strong',
    state: 'pending',
    ...overrides
  };
}
