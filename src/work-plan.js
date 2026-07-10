import { validateWorkPlan } from './validation.js';

export { validateWorkPlan };

export function deriveWorkPlan(result, options = {}) {
  const locale = options.locale === 'en' ? 'en' : 'zh-CN';
  const now = validDate(options.now) ? options.now : new Date();
  const conclusion = firstText(
    result?.taskplan?.global_goal,
    result?.taskspec?.inferred_goal,
    locale === 'en' ? 'Planning goal to confirm' : '待确认规划目标'
  );
  const tasks =
    result?.status !== 'needs_clarification' && Array.isArray(result?.taskplan?.tasks)
      ? result.taskplan.tasks
      : [];

  return {
    version: '1.0',
    plan_id: safePlanId(now, conclusion),
    session_id: firstText(options.sessionId, 'local-session'),
    status: firstText(result?.status, 'unknown'),
    language: locale,
    conclusion,
    questions: stringArray(
      result?.clarification_questions || result?.taskspec?.clarification?.questions
    ),
    steps: tasks.map(normalizeStep),
    acceptance: stringArray(
      result?.taskplan?.global_acceptance || result?.taskspec?.success_criteria
    ),
    source_summary: relativeSources(result?.taskspec?.source_map),
    next_actions: nextActionsFor(result, locale)
  };
}

export function renderWorkPlanTodo(workPlan) {
  const locale = workPlan?.language === 'en' ? 'en' : 'zh-CN';
  const labels = messages(locale);
  const steps = Array.isArray(workPlan?.steps) ? workPlan.steps : [];
  const lines = [`${labels.steps}${labels.colon}`];

  if (!steps.length) {
    lines.push(`- ${workPlan?.status === 'needs_clarification' ? labels.answerQuestions : labels.none}`);
    return lines.join('\n');
  }

  for (const step of steps) {
    lines.push(`- [ ] ${markdownText(step.title)}`);
    if (step.outputs?.length) {
      lines.push(
        `  - ${labels.outputs}${labels.colon}${labels.valueGap}${step.outputs
          .map(markdownText)
          .join(labels.listSeparator)}`
      );
    }
    if (step.acceptance?.length) {
      lines.push(
        `  - ${labels.acceptance}${labels.colon}${labels.valueGap}${step.acceptance
          .map(markdownText)
          .join(labels.acceptanceSeparator)}`
      );
    }
  }
  return lines.join('\n');
}

export function renderWorkPlanSources(workPlan) {
  const locale = workPlan?.language === 'en' ? 'en' : 'zh-CN';
  const labels = messages(locale);
  const sources = Array.isArray(workPlan?.source_summary) ? workPlan.source_summary : [];
  const lines = [`${labels.sources}${labels.colon}`];

  if (!sources.length) {
    lines.push(`- ${labels.none}`);
    return lines.join('\n');
  }

  for (const source of sources) {
    const kind = source.kind ? `[${markdownText(source.kind)}] ` : '';
    const title = source.title ? ` — ${markdownText(source.title)}` : '';
    lines.push(`- ${kind}${markdownText(source.relative_path)}${title}`);
  }
  return lines.join('\n');
}

export function renderWorkPlanMarkdown(workPlan) {
  const locale = workPlan?.language === 'en' ? 'en' : 'zh-CN';
  const labels = messages(locale);
  const steps = Array.isArray(workPlan?.steps) ? workPlan.steps : [];
  const questions = Array.isArray(workPlan?.questions) ? workPlan.questions : [];
  const acceptance = Array.isArray(workPlan?.acceptance) ? workPlan.acceptance : [];
  const nextActions = Array.isArray(workPlan?.next_actions) ? workPlan.next_actions : [];
  const lines = [
    '---',
    'type: nplan-work-plan',
    `status: ${yamlScalar(workPlan?.status)}`,
    `language: ${yamlScalar(locale)}`,
    'tags:',
    '  - nplan',
    '  - work-plan',
    '---',
    '',
    `# ${labels.title}`,
    '',
    `## ${labels.conclusion}`,
    '',
    markdownText(workPlan?.conclusion) || labels.none,
    '',
    `## ${labels.questions}`,
    '',
    ...listLines(questions, labels.none),
    '',
    `## ${labels.steps}`,
    '',
    ...stepLines(steps, labels),
    '',
    `## ${labels.graph}`,
    '',
    ...graphLines(steps, labels.none),
    '',
    `## ${labels.acceptance}`,
    '',
    ...checkLines(acceptance, labels.none),
    '',
    `## ${labels.sources}`,
    '',
    ...sourceLines(workPlan?.source_summary, labels.none),
    '',
    `## ${labels.next}`,
    '',
    ...listLines(nextActions, labels.none),
    '',
    `## ${labels.rawIds}`,
    '',
    `- plan_id: ${markdownText(workPlan?.plan_id)}`,
    `- session_id: ${markdownText(workPlan?.session_id)}`,
    ...rawStepIdLines(steps),
    ...rawSourceIdLines(workPlan?.source_summary)
  ];
  return `${lines.join('\n')}\n`;
}

export function defaultWorkPlanExportPath(workPlan) {
  return `.nplan/exports/${firstText(workPlan?.plan_id, 'work-plan')}.md`;
}

function normalizeStep(task, index) {
  return {
    id: firstText(task?.id, `T${index + 1}`),
    title: firstText(task?.title, `任务 ${index + 1}`),
    goal: firstText(task?.goal, task?.title, `任务 ${index + 1}`),
    dependencies: stringArray(task?.dependencies),
    outputs: stringArray(task?.outputs),
    acceptance: stringArray(task?.acceptance),
    state: 'pending'
  };
}

function relativeSources(value) {
  return (Array.isArray(value) ? value : [])
    .filter(
      (source) =>
        nonEmptyString(source?.relative_path) && !absolutePathLike(source.relative_path)
    )
    .map((source) => ({
      source_id: firstText(source.source_id, source.id, 'unknown-source'),
      kind: firstText(source.kind, 'unknown'),
      relative_path: String(source.relative_path).trim(),
      title: firstText(source.knowledge?.title, source.title, source.knowledge?.description, '')
    }));
}

function nextActionsFor(result, locale) {
  if (result?.status === 'needs_clarification') {
    return [locale === 'en' ? 'Answer the questions before planning continues.' : '请先回答需要确认的问题。'];
  }
  if (result?.status === 'plan_invalid') {
    return [locale === 'en' ? 'Review the validation issues before continuing.' : '请先处理计划校验问题。'];
  }
  return [
    locale === 'en'
      ? 'Review the plan and provide any needed changes.'
      : '请检查计划，如需调整请补充说明。'
  ];
}

function messages(locale) {
  if (locale === 'en') {
    return {
      title: 'Work Plan',
      conclusion: 'Conclusion',
      questions: 'Questions to Confirm',
      steps: 'Action Steps',
      graph: 'Task Graph',
      acceptance: 'Acceptance Criteria',
      outputs: 'Outputs',
      sources: 'Sources',
      next: 'Next Actions',
      rawIds: 'Raw IDs',
      none: 'None',
      answerQuestions: 'Answer the questions above before action steps are planned.',
      colon: ':',
      valueGap: ' ',
      listSeparator: ', ',
      acceptanceSeparator: '; '
    };
  }
  return {
    title: '工作计划',
    conclusion: '结论',
    questions: '需要确认',
    steps: '行动步骤',
    graph: '任务关系',
    acceptance: '验收标准',
    outputs: '产出',
    sources: '来源',
    next: '下一步',
    rawIds: '原始标识',
    none: '无',
    answerQuestions: '请先回答需要确认的问题，再生成行动步骤。',
    colon: '：',
    valueGap: '',
    listSeparator: '、',
    acceptanceSeparator: '；'
  };
}

function stepLines(steps, labels) {
  if (!steps.length) return [`- ${labels.none}`];
  return steps.flatMap((step) => [
    `- [ ] ${markdownText(step.title)}`,
    ...(step.goal
      ? [
          `  - ${labels.conclusion}${labels.colon}${labels.valueGap}${markdownText(step.goal)}`
        ]
      : []),
    ...(step.outputs?.length
      ? [
          `  - ${labels.outputs}${labels.colon}${labels.valueGap}${step.outputs
            .map(markdownText)
            .join(labels.listSeparator)}`
        ]
      : []),
    ...(step.acceptance?.length
      ? [
          `  - ${labels.acceptance}${labels.colon}${labels.valueGap}${step.acceptance
            .map(markdownText)
            .join(labels.acceptanceSeparator)}`
        ]
      : [])
  ]);
}

function graphLines(steps, emptyLabel) {
  if (!steps.length) return [`- ${emptyLabel}`];
  const indexById = new Map(steps.map((step, index) => [step.id, index]));
  const lines = ['```mermaid', 'flowchart TD'];
  steps.forEach((step, index) => lines.push(`  n${index + 1}["${escapeMermaid(step.title)}"]`));
  steps.forEach((step, index) => {
    for (const dependency of step.dependencies || []) {
      const dependencyIndex = indexById.get(dependency);
      if (dependencyIndex !== undefined) lines.push(`  n${dependencyIndex + 1} --> n${index + 1}`);
    }
  });
  lines.push('```');
  return lines;
}

function sourceLines(value, emptyLabel) {
  const sources = Array.isArray(value) ? value : [];
  if (!sources.length) return [`- ${emptyLabel}`];
  return sources.map((source) => {
    const kind = source.kind ? `[${markdownText(source.kind)}] ` : '';
    const title = source.title ? ` — ${markdownText(source.title)}` : '';
    return `- ${kind}${markdownText(source.relative_path)}${title}`;
  });
}

function listLines(items, emptyLabel) {
  return items.length ? items.map((item) => `- ${markdownText(item)}`) : [`- ${emptyLabel}`];
}

function checkLines(items, emptyLabel) {
  return items.length ? items.map((item) => `- [ ] ${markdownText(item)}`) : [`- ${emptyLabel}`];
}

function rawStepIdLines(steps) {
  return steps.length
    ? ['- step_ids:', ...steps.map((step) => `  - ${markdownText(step.title)}: ${markdownText(step.id)}`)]
    : [];
}

function rawSourceIdLines(value) {
  const sources = Array.isArray(value) ? value : [];
  return sources.length
    ? [
        '- source_ids:',
        ...sources.map(
          (source) => `  - ${markdownText(source.relative_path)}: ${markdownText(source.source_id)}`
        )
      ]
    : [];
}

function safePlanId(now, goal) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const normalized = String(goal || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '');
  const slug = Array.from(normalized).slice(0, 60).join('');
  return `${date}-${slug || 'work-plan'}`;
}

function validDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter(nonEmptyString).map((item) => item.trim())
    : [];
}

function firstText(...values) {
  const found = values.find(nonEmptyString);
  return found === undefined ? '' : found.trim();
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function absolutePathLike(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z]:[\\/]/.test(text) || /^[/\\]{1,2}/.test(text);
}

function markdownText(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function escapeMermaid(value) {
  return markdownText(value).replace(/["\\]/g, ' ');
}

function yamlScalar(value) {
  return markdownText(value).replace(/:/g, ' ');
}
