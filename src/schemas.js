export const DEFAULT_VERSION = '1.0';

export const TASKSPEC_REQUIRED_FIELDS = [
  'version',
  'surface_request',
  'inferred_goal',
  'task_type',
  'deliverables',
  'constraints',
  'known_inputs',
  'missing_information',
  'assumptions',
  'ambiguities',
  'success_criteria',
  'clarification',
  'planning_readiness',
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
    deliverables: { type: 'array' },
    constraints: { type: 'object' },
    missing_information: { type: 'object' },
    clarification: { type: 'object' },
    planning_readiness: { type: 'object' }
  }
};

export const TASKPLAN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'TaskPlan',
  type: 'object',
  required: TASKPLAN_REQUIRED_FIELDS,
  properties: {
    version: { type: 'string', const: DEFAULT_VERSION },
    plan_style: { type: 'string', enum: ['dag'] },
    global_goal: { type: 'string' },
    global_acceptance: { type: 'array' },
    tasks: { type: 'array' },
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
