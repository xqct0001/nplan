import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LocalPlanningAgent } from '../src/index.js';

test('async agent uses model understanding for Chinese file organizer request', async () => {
  const modelClient = {
    async understandTask({ request }) {
      assert.equal(request, '帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件');
      return {
        inferred_goal: 'Design a local file organization tool that scans files, classifies them, and writes a Markdown report',
        task_type: 'design',
        deliverables: [
          { name: 'File scanner', format: 'json', required: true },
          { name: 'Classification plan', format: 'markdown', required: true },
          { name: 'Markdown report', format: 'markdown', required: true }
        ],
        constraints: {
          offline_preferred: true,
          language: 'zh-CN',
          allowed_tools: ['local_fs'],
          forbidden_tools: ['task_execution'],
          data_sensitivity: 'internal'
        },
        missing_information: { blocking: [], non_blocking: [] },
        assumptions: ['Design only; execution is outside this planning agent'],
        ambiguities: [],
        success_criteria: [
          'scan scope is represented',
          'classification rules are represented',
          'markdown report output is planned'
        ]
      };
    }
  };

  const result = await new LocalPlanningAgent({ modelClient }).analyzeAsync(
    '> 帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件'
  );

  assert.equal(result.status, 'planned');
  assert.equal(result.taskspec.surface_request, '帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件');
  assert.equal(result.taskspec.provenance.model_used, true);
  assert.equal(result.taskspec_report.ready_for_planning, true);
  assert.equal(result.taskplan_report.valid, true);
  assert.deepEqual(result.taskplan_report.coverage_gaps, []);
});

test('async agent falls back to local rules when model is unavailable', async () => {
  const modelClient = {
    async understandTask() {
      throw new Error('model unavailable');
    }
  };

  const result = await new LocalPlanningAgent({ modelClient }).analyzeAsync('help');

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.taskspec.provenance.model_used, false);
  assert.match(result.taskspec.provenance.model_error, /model unavailable/);
});
