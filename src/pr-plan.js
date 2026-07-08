export function derivePrPlan(result, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const sessionId = String(options.sessionId || 'local-session');
  const status = result?.status || 'unknown';
  const goal = result?.taskplan?.global_goal || result?.taskspec?.inferred_goal || 'Planning request';
  const planId = safePlanId(now, goal);
  const sourceLinks = sourceLinksFor(result);
  const hasTaskTodos = Array.isArray(result?.taskplan?.tasks) && result.taskplan.tasks.length > 0;
  const todoItems = hasTaskTodos ? taskTodos(result.taskplan.tasks) : clarificationTodos(result);
  const verificationSteps = verificationStepsFor(result, todoItems);
  const taskLinks = taskLinksFor(result?.taskplan?.tasks || []);
  const prTitle = titleCase(goal);

  const prPlan = {
    version: '1.0',
    plan_id: planId,
    session_id: sessionId,
    status,
    goal,
    todo_items: todoItems,
    task_links: taskLinks,
    source_links: sourceLinks,
    verification_steps: verificationSteps,
    pr_draft: {
      title: prTitle,
      summary: summaryFor(result, todoItems),
      testing: verificationSteps
    },
    obsidian: {
      title: `PR Plan: ${prTitle}`,
      tags: ['nplan', 'pr-plan'],
      task_aliases: todoItems.map((item) => taskAlias(item)),
      mermaid: hasTaskTodos ? mermaidFor(todoItems) : ''
    }
  };

  return prPlan;
}

export function validatePrPlan(prPlan) {
  const issues = [];
  if (!prPlan || typeof prPlan !== 'object') return { valid: false, issues: ['invalid_prplan'] };
  for (const field of ['version', 'plan_id', 'session_id', 'status', 'goal']) {
    if (!nonEmptyString(prPlan[field])) issues.push(`missing_${field}`);
  }
  if (!Array.isArray(prPlan.todo_items) || !prPlan.todo_items.length) issues.push('missing_todo_items');
  for (const item of prPlan.todo_items || []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push('todo_invalid');
      continue;
    }
    if (!nonEmptyString(item.id)) issues.push('todo_missing_id');
    if (!nonEmptyString(item.title)) issues.push('todo_missing_title');
    if (!isTodoKind(item.kind)) issues.push('todo_missing_kind');
    if (item.kind === 'task' && !nonEmptyString(item.source_task_id)) {
      issues.push('todo_missing_source_task_id');
    }
    if (!Array.isArray(item.acceptance) || !item.acceptance.some(nonEmptyString)) issues.push('todo_missing_acceptance');
  }
  if (!prPlan.pr_draft || typeof prPlan.pr_draft !== 'object') issues.push('missing_pr_draft');
  if (!prPlan.obsidian || typeof prPlan.obsidian !== 'object') issues.push('missing_obsidian');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function renderPrPlanTodo(prPlan) {
  if (!prPlan) return 'No todo yet. Run /plan <prompt> first.';
  const lines = ['todo:'];
  for (const item of prPlan.todo_items || []) {
    lines.push(`- [ ] ${item.id} ${item.title}`);
    if (item.dependencies?.length) lines.push(`  depends on: ${item.dependencies.join(', ')}`);
    if (item.outputs?.length) lines.push(`  outputs: ${item.outputs.join(', ')}`);
    if (item.acceptance?.length) lines.push(`  acceptance: ${item.acceptance.join('; ')}`);
  }
  return lines.join('\n');
}

export function renderPrPlanSources(prPlan) {
  if (!prPlan) return 'No sources yet. Run /plan <prompt> first.';
  const lines = ['sources:'];
  if (!prPlan.source_links?.length) {
    lines.push('- none');
    return lines.join('\n');
  }
  for (const source of prPlan.source_links) {
    if (source.kind === 'evidence') {
      lines.push(`- ${source.id} from ${source.source_id}: ${source.excerpt}`);
    } else {
      lines.push(`- ${source.id} ${source.kind} ${source.path}${source.title ? ` - ${source.title}` : ''}`);
    }
  }
  return lines.join('\n');
}

export function renderObsidianPrPlan(prPlan) {
  const lines = [
    '---',
    'type: nplan-pr-plan',
    `plan_id: ${yamlScalar(prPlan.plan_id)}`,
    `session_id: ${yamlScalar(prPlan.session_id)}`,
    `status: ${yamlScalar(prPlan.status)}`,
    'tags:',
    '  - nplan',
    '  - pr-plan',
    '---',
    '',
    `# ${prPlan.obsidian.title}`,
    '',
    '## Summary',
    '',
    ...prPlan.pr_draft.summary.map((item) => `- ${item}`),
    '',
    '## Todo',
    '',
    ...todoMarkdownLines(prPlan),
    '',
    '## Task Graph',
    '',
    prPlan.obsidian.mermaid ? '```mermaid' : '_No task graph is available yet._',
    ...(prPlan.obsidian.mermaid ? prPlan.obsidian.mermaid.split('\n') : []),
    ...(prPlan.obsidian.mermaid ? ['```'] : []),
    '',
    '## Tasks',
    '',
    ...taskMarkdownLines(prPlan),
    '',
    '## Sources',
    '',
    ...sourceMarkdownLines(prPlan, false),
    '',
    '## Evidence',
    '',
    ...sourceMarkdownLines(prPlan, true),
    '',
    '## Verification Plan',
    '',
    ...prPlan.verification_steps.map((item) => `- [ ] ${item}`),
    '',
    '## PR Draft',
    '',
    `Title: ${prPlan.pr_draft.title}`,
    '',
    'Summary:',
    ...prPlan.pr_draft.summary.map((item) => `- ${item}`),
    '',
    'Testing:',
    ...prPlan.pr_draft.testing.map((item) => `- ${item}`),
    '',
    '## Raw IDs',
    '',
    `- plan_id: ${prPlan.plan_id}`,
    `- session_id: ${prPlan.session_id}`
  ];
  return `${lines.join('\n')}\n`;
}

export function defaultPrPlanExportPath(prPlan) {
  return `.nplan/exports/${prPlan.plan_id}.md`;
}

function taskTodos(tasks) {
  return tasks.map((task) => ({
    id: String(task.id || '').trim(),
    kind: 'task',
    title: String(task.title || '').trim(),
    source_task_id: String(task.id || '').trim(),
    dependencies: arrayOfStrings(task.dependencies),
    inputs: arrayOfStrings(task.inputs),
    outputs: arrayOfStrings(task.outputs),
    acceptance: arrayOfStrings(task.acceptance),
    state: task.state || 'pending'
  }));
}

function clarificationTodos(result) {
  const questions = result?.clarification_questions || result?.taskspec?.clarification?.questions || [];
  return questions.map((question, index) => ({
    id: `Q${index + 1}`,
    kind: 'clarification',
    title: String(question).trim(),
    source_task_id: '',
    dependencies: [],
    inputs: ['user clarification'],
    outputs: ['planning answer'],
    acceptance: [String(question).trim()],
    state: 'pending'
  }));
}

function taskLinksFor(tasks) {
  return tasks.flatMap((task) =>
    arrayOfStrings(task.dependencies).map((dependency) => ({
      from: dependency,
      to: task.id,
      kind: 'depends_on'
    }))
  );
}

function sourceLinksFor(result) {
  const sources = (result?.taskspec?.source_map || []).map((source) => ({
    id: source.source_id || source.id || '',
    kind: source.kind || 'unknown',
    path: source.relative_path || source.path || '',
    title: source.knowledge?.title || source.title || source.knowledge?.description || ''
  }));
  const evidence = (result?.taskspec?.evidence_map || []).map((item) => ({
    id: item.evidence_id || item.id || '',
    kind: 'evidence',
    source_id: item.source_id || '',
    excerpt: excerpt(item.text || item.excerpt || '')
  }));
  return [...sources, ...evidence];
}

function verificationStepsFor(result, todoItems) {
  const taskChecks = todoItems.flatMap((item) => item.acceptance.map((check) => `${item.id}: ${check}`));
  const globalChecks = arrayOfStrings(result?.taskplan?.global_acceptance).map((check) => `Global: ${check}`);
  return [...taskChecks, ...globalChecks];
}

function summaryFor(result, todoItems) {
  const lines = [`Goal: ${result?.taskplan?.global_goal || result?.taskspec?.inferred_goal || 'Planning request'}`];
  lines.push(`Status: ${result?.status || 'unknown'}`);
  lines.push(`Todo items: ${todoItems.length}`);
  return lines;
}

function mermaidFor(todoItems) {
  const lines = ['flowchart TD'];
  for (const item of todoItems) {
    lines.push(`  ${mermaidId(item.id)}["${escapeMermaid(`${item.id}: ${item.title}`)}"]`);
  }
  for (const item of todoItems) {
    for (const dependency of item.dependencies || []) {
      lines.push(`  ${mermaidId(dependency)} --> ${mermaidId(item.id)}`);
    }
  }
  return lines.join('\n');
}

function todoMarkdownLines(prPlan) {
  return (prPlan.todo_items || []).flatMap((item) => [
    `- [ ] ${item.id} ${item.title}`,
    ...(item.dependencies?.length ? [`  - depends on: ${item.dependencies.join(', ')}`] : []),
    ...(item.outputs?.length ? [`  - outputs: ${item.outputs.join(', ')}`] : []),
    ...(item.acceptance?.length ? [`  - acceptance: ${item.acceptance.join('; ')}`] : [])
  ]);
}

function taskMarkdownLines(prPlan) {
  return (prPlan.todo_items || []).flatMap((item) => [
    `### [[${taskAlias(item)}]]`,
    '',
    `- id: ${item.id}`,
    `- state: ${item.state}`,
    `- dependencies: ${item.dependencies.length ? item.dependencies.join(', ') : 'none'}`,
    `- outputs: ${item.outputs.length ? item.outputs.join(', ') : 'none'}`,
    ''
  ]);
}

function sourceMarkdownLines(prPlan, evidenceOnly) {
  const items = (prPlan.source_links || []).filter((item) =>
    evidenceOnly ? item.kind === 'evidence' : item.kind !== 'evidence'
  );
  if (!items.length) return ['- none'];
  return items.map((item) =>
    item.kind === 'evidence'
      ? `- ${item.id} from ${item.source_id}: ${item.excerpt}`
      : `- ${item.id} ${item.kind} ${item.path}${item.title ? ` - ${item.title}` : ''}`
  );
}

function taskAlias(item) {
  return `Task ${item.id} - ${item.title}`;
}

function safePlanId(now, goal) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = String(goal || 'planning-request')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${date}-${slug || 'planning-request'}`;
}

function titleCase(text) {
  return String(text || 'Planning request')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => String(item || '').trim()).map((item) => String(item).trim()) : [];
}

function excerpt(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function mermaidId(value) {
  return String(value || 'node').replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeMermaid(value) {
  return String(value || '').replace(/["\\]/g, ' ');
}

function yamlScalar(value) {
  return String(value || '').replace(/[\r\n:]/g, ' ').trim();
}

function isTodoKind(value) {
  return value === 'task' || value === 'clarification';
}
