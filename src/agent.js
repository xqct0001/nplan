import { buildPlannerInput, planFromTaskSpec } from './planning.js';
import { compileTaskSpec, composeTaskSpecFromModel, stripPromptArtifacts } from './understanding.js';
import { validateTaskPlan, validateTaskSpec } from './validation.js';

export class LocalPlanningAgent {
  constructor({ modelClient = null } = {}) {
    this.modelClient = modelClient;
  }

  analyze(surfaceRequest, context = {}) {
    return this.#planFromTaskSpec(compileTaskSpec(surfaceRequest, context));
  }

  async analyzeAsync(surfaceRequest, context = {}) {
    const request = stripPromptArtifacts(surfaceRequest);
    if (!this.modelClient) return this.analyze(request, context);
    try {
      const draft = await this.modelClient.understandTask({ request, context });
      return this.#planFromTaskSpec(composeTaskSpecFromModel(request, draft, context));
    } catch (error) {
      const taskspec = compileTaskSpec(request, context);
      taskspec.provenance.model_used = false;
      taskspec.provenance.model_error = error.message;
      return this.#planFromTaskSpec(taskspec);
    }
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
