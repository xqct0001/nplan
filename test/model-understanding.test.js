import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LocalPlanningAgent } from '../src/index.js';

test('async agent uses model understanding for Chinese file organizer request', async () => {
  const modelClient = {
    async understandTask({ request, context }) {
      assert.ok(Array.isArray(context.source_map));
      assert.ok(Array.isArray(context.evidence_map));
      assert.ok(context.context_pack);
      assert.equal(request, '帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件');
      return {
        inferred_goal: 'Design a local file organization tool that scans files, classifies them, and writes a Markdown report',
        task_type: 'design',
        audience: 'local tool maintainer',
        target_object: 'local file organization tool',
        deliverables: [
          { name: 'File scanner', format: 'json', required: true },
          { name: 'Classification plan', format: 'markdown', required: true },
          { name: 'Markdown report', format: 'markdown', required: true }
        ],
        output_format: 'mixed',
        constraints: {
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
        ],
        checkpoint_policy: {
          stop_on: ['blocking_missing_information', 'validation_failure'],
          requires_user_confirmation_for: ['file_editing']
        },
        quality_bar: ['scan and classification boundaries are explicit'],
        risk_level: 'low',
        context_requirements: ['local_documents']
      };
    }
  };

  const result = await new LocalPlanningAgent({ modelClient }).analyzeAsync(
    '> 帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件'
  );

  assert.equal(result.status, 'planned');
  assert.equal(result.taskspec.surface_request, '帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件');
  assert.equal(result.taskspec.audience, 'local tool maintainer');
  assert.equal(result.taskspec.target_object, 'local file organization tool');
  assert.equal(result.taskspec.output_format, 'mixed');
  assert.deepEqual(result.taskspec.checkpoint_policy.stop_on, [
    'blocking_missing_information',
    'validation_failure'
  ]);
  assert.deepEqual(result.taskspec.quality_bar, ['scan and classification boundaries are explicit']);
  assert.equal(result.taskspec.risk_level, 'low');
  assert.equal(Object.hasOwn(result.taskspec.constraints, 'offline_preferred'), false);
  assert.deepEqual(result.taskspec.context_requirements, ['local_documents']);
  assert.ok(Array.isArray(result.taskspec.source_map));
  assert.ok(Array.isArray(result.taskspec.evidence_map));
  assert.ok(result.taskspec.context_report.source_count >= 0);
  assert.equal(result.taskspec.provenance.model_used, true);
  assert.equal(result.taskspec_report.ready_for_planning, true);
  assert.equal(result.taskplan_report.valid, true);
  assert.deepEqual(result.taskplan_report.coverage_gaps, []);
});

test('async agent does not fall back when model is unavailable', async () => {
  const modelClient = {
    async understandTask() {
      throw new Error('model unavailable');
    }
  };

  await assert.rejects(
    () => new LocalPlanningAgent({ modelClient }).analyzeAsync('help'),
    /model unavailable/
  );
});
