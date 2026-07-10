import assert from 'node:assert/strict';
import { test } from 'node:test';

import { message, normalizeSlashCommand, resolveLocale } from '../src/i18n.js';

test('Simplified Chinese is the default locale and English is explicit', () => {
  assert.equal(resolveLocale(), 'zh-CN');
  assert.equal(resolveLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('en'), 'en');
  assert.throws(() => resolveLocale('fr'), /不支持的语言：fr/);
  assert.equal(message('zh-CN', 'startup.title'), 'NPlan 规划助手');
  assert.equal(message('en', 'startup.title'), 'NPlan Planner');
});

test('Chinese slash aliases normalize every supported command and preserve arguments', () => {
  const aliases = {
    '/帮助': '/help',
    '/服务商': '/providers',
    '/状态': '/status',
    '/配置': '/config',
    '/设置': '/settings',
    '/模型 qwen-plus': '/model qwen-plus',
    '/上下文': '/context',
    '/来源': '/sources',
    '/步骤': '/todo',
    '/修改 保留预算': '/revise 保留预算',
    '/导出 计划.md': '/export 计划.md',
    '/规划 北京亲子游': '/plan 北京亲子游',
    '/完整': '/json',
    '/压缩 保留偏好': '/compact 保留偏好',
    '/清除': '/clear',
    '/重置': '/reset',
    '/新建': '/new',
    '/继续': '/continue',
    '/恢复 latest': '/resume latest',
    '/退出': '/exit',
    '/结束': '/quit'
  };

  for (const [input, expected] of Object.entries(aliases)) {
    assert.equal(normalizeSlashCommand(input), expected);
  }
  assert.equal(normalizeSlashCommand('/unknown 保持原样'), '/unknown 保持原样');
});
