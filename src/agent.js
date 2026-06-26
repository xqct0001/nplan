import { buildPlannerInput, planFromTaskSpec } from './planning.js';
import { compileTaskSpec } from './understanding.js';
import { validateTaskPlan, validateTaskSpec } from './validation.js';

export class LocalPlanningAgent {
  analyze(surfaceRequest, context = {}) {
    const taskspec = compileTaskSpec(surfaceRequest, context);
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
