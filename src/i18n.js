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

function interpolate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
}
