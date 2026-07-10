import { composeTaskPlanFromModel } from './planning.js';
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
    const taskDraft = await this.modelClient.planTask({
      taskspec,
      context: prepared.context.context_pack
    });
    const taskplan = composeTaskPlanFromModel(taskspec, taskDraft);
    const taskplanReport = validateTaskPlan(taskplan);
    return plannedResult(taskspec, taskspecReport, taskplan, taskplanReport);
  }
}

function clarificationResult(taskspec, taskspecReport) {
  return {
    status: 'needs_clarification',
    pipeline_steps: ['understanding', 'taskspec_validation'],
    taskspec,
    taskspec_report: taskspecReport,
    clarification_questions: taskspec.clarification?.questions || []
  };
}

function plannedResult(taskspec, taskspecReport, taskplan, taskplanReport) {
  return {
    status: taskplanReport.valid ? 'planned' : 'plan_invalid',
    pipeline_steps: ['understanding', 'taskspec_validation', 'planning', 'taskplan_validation'],
    taskspec,
    taskspec_report: taskspecReport,
    clarification_questions: taskspec.clarification?.questions || [],
    taskplan,
    taskplan_report: taskplanReport
  };
}
