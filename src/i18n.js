const SUPPORTED_LOCALES = new Set(['zh-CN', 'en']);

const MESSAGES = {
  'zh-CN': {
    'startup.title': 'NPlan 规划助手',
    'startup.hint': '直接输入任务；输入 /帮助 查看命令。',
    'startup.cwd': '当前目录',
    'startup.session': '会话',
    'startup.bye': '再见',
    'result.conclusion': '结论',
    'result.questions': '需要确认',
    'result.steps': '行动步骤',
    'result.stepAcceptance': '验收',
    'result.acceptance': '验收标准',
    'result.next': '下一步',
    'result.issues': '计划校验',
    'result.none': '无',
    'validation.taskDetailsIncomplete': '任务信息不完整，请补充后重试。',
    'validation.taskConflict': '任务信息存在冲突，请补充说明后重试。',
    'validation.planMissingRequired': '计划缺少必填内容，请重新生成。',
    'validation.stepsIncomplete': '部分行动步骤信息不完整，请重新生成。',
    'validation.missingDependencies': '部分行动步骤引用了不存在的前置步骤，请重新生成。',
    'validation.missingAcceptance': '部分行动步骤缺少验收标准，请重新生成。',
    'validation.missingInputsOutputs': '部分行动步骤缺少输入或产出，请重新生成。',
    'validation.missingCoverage': '计划未完整覆盖所需产出，请重新生成。',
    'validation.duplicateCoverage': '部分产出被重复覆盖，请合并后重试。',
    'validation.stepsTooBroad': '部分行动步骤过于笼统，请拆分后重试。',
    'validation.invalidPolicy': '计划约束不合法，请检查规划设置后重试。',
    'validation.tooManySteps': '行动步骤数量超过限制，请精简后重试。',
    'validation.tooDeep': '行动步骤依赖层级超过限制，请简化后重试。',
    'validation.cycle': '行动步骤之间存在循环依赖，请重新生成。',
    'validation.duplicateSteps': '计划中存在重复步骤，请重新生成。',
    'validation.unsupportedStructure': '计划结构不受支持，请重新生成。',
    'validation.missingGoal': '计划缺少明确目标，请补充后重试。',
    'validation.missingGlobalAcceptance': '计划缺少整体验收标准，请重新生成。',
    'validation.noSteps': '计划没有有效行动步骤，请重新生成。',
    'validation.planConflict': '计划内容存在冲突，请重新生成。',
    'validation.generic': '计划校验未通过，请重新生成；如仍失败，请补充说明。',
    'error.unsupportedLocale': '不支持的语言：{locale}。可选值：zh-CN、en。',
    'error.unknownCommand': '未知命令。输入 /帮助 查看可用命令。',
    'error.analysisFailed': '规划失败：{detail}',
    'error.planUsage': '用法：/规划 <任务>',
    'error.reviseUsage': '用法：/修改 <补充说明>',
    'error.noResult': '还没有规划结果。',
    'error.noSession': '没有找到已保存的会话。'
  },
  en: {
    'startup.title': 'NPlan Planner',
    'startup.hint': 'Type a task; use /help for commands.',
    'startup.cwd': 'cwd',
    'startup.session': 'session',
    'startup.bye': 'bye',
    'result.conclusion': 'Conclusion',
    'result.questions': 'Questions',
    'result.steps': 'Action steps',
    'result.stepAcceptance': 'Acceptance',
    'result.acceptance': 'Acceptance criteria',
    'result.next': 'Next',
    'result.issues': 'Plan validation',
    'result.none': 'None',
    'validation.taskDetailsIncomplete': 'Task details are incomplete. Add the missing information and try again.',
    'validation.taskConflict': 'Task details contain conflicts. Clarify the request and try again.',
    'validation.planMissingRequired': 'The plan is missing required fields. Generate it again.',
    'validation.stepsIncomplete': 'Some action steps are incomplete. Generate the plan again.',
    'validation.missingDependencies': 'Some action steps reference missing prerequisites. Generate the plan again.',
    'validation.missingAcceptance': 'Some action steps have no acceptance criteria. Generate the plan again.',
    'validation.missingInputsOutputs': 'Some action steps have missing inputs or outputs. Generate the plan again.',
    'validation.missingCoverage': 'The plan does not fully cover the required outputs. Generate it again.',
    'validation.duplicateCoverage': 'Some outputs are covered more than once. Merge the duplicate coverage and try again.',
    'validation.stepsTooBroad': 'Some action steps are too broad. Split them and try again.',
    'validation.invalidPolicy': 'Planning constraints are invalid. Check the planning settings and try again.',
    'validation.tooManySteps': 'The plan has too many action steps. Simplify it and try again.',
    'validation.tooDeep': 'The dependency chain is too deep. Simplify it and try again.',
    'validation.cycle': 'Action steps contain a dependency cycle. Generate the plan again.',
    'validation.duplicateSteps': 'The plan contains duplicate action steps. Generate it again.',
    'validation.unsupportedStructure': 'The plan structure is unsupported. Generate it again.',
    'validation.missingGoal': 'The plan has no clear goal. Clarify the goal and try again.',
    'validation.missingGlobalAcceptance': 'The plan has no overall acceptance criteria. Generate it again.',
    'validation.noSteps': 'The plan has no valid action steps. Generate it again.',
    'validation.planConflict': 'The plan contains conflicting information. Generate it again.',
    'validation.generic': 'Plan validation did not pass. Generate it again; add more context if the problem continues.',
    'error.unsupportedLocale': 'Unsupported language: {locale}. Choose zh-CN or en.',
    'error.unknownCommand': 'Unknown command. Use /help for commands.',
    'error.analysisFailed': 'Planning failed: {detail}',
    'error.planUsage': 'Usage: /plan <task>',
    'error.reviseUsage': 'Usage: /revise <additional context>',
    'error.noResult': 'No planning result yet.',
    'error.noSession': 'No saved session found.'
  }
};

const CHINESE_SLASH_ALIASES = new Map([
  ['/帮助', '/help'],
  ['/服务商', '/providers'],
  ['/状态', '/status'],
  ['/配置', '/config'],
  ['/设置', '/settings'],
  ['/模型', '/model'],
  ['/上下文', '/context'],
  ['/来源', '/sources'],
  ['/步骤', '/todo'],
  ['/修改', '/revise'],
  ['/导出', '/export'],
  ['/规划', '/plan'],
  ['/完整', '/json'],
  ['/压缩', '/compact'],
  ['/清除', '/clear'],
  ['/重置', '/reset'],
  ['/新建', '/new'],
  ['/继续', '/continue'],
  ['/恢复', '/resume'],
  ['/退出', '/exit'],
  ['/结束', '/quit']
]);

export function resolveLocale(value) {
  const locale = value == null || value === '' ? 'zh-CN' : String(value);
  if (!SUPPORTED_LOCALES.has(locale)) {
    const template = MESSAGES['zh-CN']['error.unsupportedLocale'];
    throw new Error(interpolate(template, { locale }));
  }
  return locale;
}

export function message(locale, key, values = {}) {
  const resolved = resolveLocale(locale);
  const template = MESSAGES[resolved][key] ?? MESSAGES.en[key] ?? key;
  return interpolate(template, values);
}

export function normalizeSlashCommand(line) {
  const text = String(line ?? '').trim();
  const match = text.match(/^(\/\S+)([\s\S]*)$/);
  if (!match) return text;
  const command = CHINESE_SLASH_ALIASES.get(match[1]) ?? match[1];
  return `${command}${match[2]}`;
}

export function summarizeValidationIssues(result, locale) {
  const resolved = resolveLocale(locale);
  const keys = [];
  const seen = new Set();
  const add = (key) => {
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };

  summarizeTaskSpecReport(result?.taskspec_report, add);
  summarizeTaskPlanReport(result?.taskplan_report, add);
  if (result?.status === 'plan_invalid' && !keys.length) add('validation.generic');

  return keys.map((key) => message(resolved, key));
}

function summarizeTaskSpecReport(report, add) {
  if (!isRecord(report)) return;
  let recognized = false;
  if (hasEntries(report.missing_required_fields)) {
    recognized = true;
    add('validation.taskDetailsIncomplete');
  }
  if (hasEntries(report.conflicts)) {
    recognized = true;
    add('validation.taskConflict');
  }
  const known = new Set([
    'valid',
    'ready_for_planning',
    'missing_required_fields',
    'conflicts'
  ]);
  const hasUnknownDetails = Object.entries(report).some(
    ([key, value]) => !known.has(key) && hasEntries(value)
  );
  if (hasUnknownDetails || (report.valid === false && !recognized)) add('validation.generic');
}

function summarizeTaskPlanReport(report, add) {
  if (!isRecord(report)) return;
  let recognized = false;
  const mark = (condition, key) => {
    if (!condition) return;
    recognized = true;
    add(key);
  };

  mark(hasEntries(report.missing_required_fields), 'validation.planMissingRequired');
  mark(hasEntries(report.missing_task_fields), 'validation.stepsIncomplete');
  mark(
    hasEntries(report.missing_dependency_refs) || hasEntries(report.missing_dependency_references),
    'validation.missingDependencies'
  );
  mark(hasEntries(report.tasks_without_acceptance), 'validation.missingAcceptance');
  mark(hasEntries(report.tasks_without_io), 'validation.missingInputsOutputs');
  mark(
    hasEntries(report.coverage_gaps) || hasEntries(report.missing_deliverable_coverage),
    'validation.missingCoverage'
  );
  mark(hasEntries(report.duplicate_deliverable_coverage), 'validation.duplicateCoverage');
  mark(report.cycle_detected === true, 'validation.cycle');
  mark(hasEntries(report.duplicate_task_ids), 'validation.duplicateSteps');
  mark(hasEntries(report.task_count_exceeded), 'validation.tooManySteps');
  mark(hasEntries(report.depth_exceeded), 'validation.tooDeep');
  mark(hasEntries(report.conflicts), 'validation.planConflict');

  for (const code of stringEntries(report.policy_errors)) {
    mark(code.startsWith('task_too_coarse'), 'validation.stepsTooBroad');
    if (!code.startsWith('task_too_coarse')) mark(true, 'validation.invalidPolicy');
  }

  for (const code of stringEntries(report.plan_errors)) {
    if (code === 'duplicate_task_ids') mark(true, 'validation.duplicateSteps');
    else if (code === 'invalid_plan_style') mark(true, 'validation.unsupportedStructure');
    else if (code === 'empty_global_goal') mark(true, 'validation.missingGoal');
    else if (code === 'invalid_global_acceptance' || code === 'no_global_acceptance') {
      mark(true, 'validation.missingGlobalAcceptance');
    } else if (code === 'invalid_tasks' || code === 'no_tasks') {
      mark(true, 'validation.noSteps');
    } else if (code === 'invalid_taskplan' || code === 'invalid_required_deliverables') {
      mark(true, 'validation.planMissingRequired');
    } else {
      mark(true, 'validation.generic');
    }
  }

  const known = new Set([
    'valid',
    'missing_required_fields',
    'missing_task_fields',
    'cycle_detected',
    'missing_dependency_refs',
    'missing_dependency_references',
    'tasks_without_acceptance',
    'tasks_without_io',
    'coverage_gaps',
    'missing_deliverable_coverage',
    'duplicate_deliverable_coverage',
    'policy_errors',
    'task_count_exceeded',
    'plan_errors',
    'duplicate_task_ids',
    'depth_exceeded',
    'conflicts'
  ]);
  const hasUnknownDetails = Object.entries(report).some(
    ([key, value]) => !known.has(key) && hasEntries(value)
  );
  if (hasUnknownDetails || (report.valid === false && !recognized)) add('validation.generic');
}

function stringEntries(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function hasEntries(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value === true || (typeof value === 'number' && Number.isFinite(value) && value !== 0);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function interpolate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
}
