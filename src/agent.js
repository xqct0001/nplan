import { buildPlannerInput, planFromTaskSpec } from './planning.js';
import { curateContext } from './context-curator.js';
import { composeTaskSpecFromModel, stripPromptArtifacts } from './understanding.js';
import { validateTaskPlan, validateTaskSpec } from './validation.js';

const MODEL_REQUIRED_MESSAGE =
  'model configuration is required; configure a model before analyzing tasks';

export class LocalPlanningAgent {
  constructor({ modelClient = null } = {}) {
    this.modelClient = modelClient;
  }

  analyze() {
    throw new Error(MODEL_REQUIRED_MESSAGE);
  }

  async analyzeAsync(surfaceRequest, context = {}) {
    const request = stripPromptArtifacts(surfaceRequest);
    if (!this.modelClient) throw new Error(MODEL_REQUIRED_MESSAGE);
    const curatedContext = curateContext(request, context);
    const draft = await this.modelClient.understandTask({ request, context: curatedContext });
    return this.#planFromTaskSpec(composeTaskSpecFromModel(request, draft, curatedContext));
  }

  #planFromTaskSpec(taskspec) {
    const taskspecReport = validateTaskSpec(taskspec);
    const result = {
      status: 'needs_clarification',
      pipeline_steps: ['understanding', 'taskspec_validation'],
      taskspec,
      taskspec_report: taskspecReport,
      clarification_questions: taskspec.clarification?.questions || []
    };

    if (!taskspecReport.ready_for_planning) return result;

    const plannerInput = buildPlannerInput(taskspec);
    const taskplan = planFromTaskSpec(plannerInput);
    const taskplanReport = validateTaskPlan(taskplan);
    return {
      ...result,
      status: taskplanReport.valid ? 'planned' : 'plan_invalid',
      pipeline_steps: ['understanding', 'taskspec_validation', 'planning', 'taskplan_validation'],
      planner_input: plannerInput,
      taskplan,
      taskplan_report: taskplanReport
    };
  }
}
