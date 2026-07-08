import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  defaultPrPlanExportPath,
  derivePrPlan,
  renderObsidianPrPlan,
  renderPrPlanSources,
  renderPrPlanTodo,
  validatePrPlan
} from '../src/pr-plan.js';

test('derivePrPlan creates todos, links, verification, and PR draft for planned results', () => {
  const prPlan = derivePrPlan(samplePlannedResult(), {
    sessionId: '20260708220500-abcd1234',
    now: new Date('2026-07-08T14:05:00.000Z')
  });

  assert.equal(prPlan.version, '1.0');
  assert.equal(prPlan.status, 'planned');
  assert.equal(prPlan.session_id, '20260708220500-abcd1234');
  assert.equal(prPlan.plan_id, '20260708-improve-cli-planning-workflow');
  assert.equal(prPlan.todo_items.length, 2);
  assert.equal(prPlan.todo_items[0].kind, 'task');
  assert.deepEqual(prPlan.todo_items[1].dependencies, ['T1']);
  assert.equal(prPlan.source_links.length, 2);
  assert.ok(prPlan.verification_steps.includes('T1: CLI command help mentions /todo'));
  assert.equal(prPlan.pr_draft.title, 'Improve CLI planning workflow');
  assert.ok(prPlan.obsidian.mermaid.includes('T1 --> T2'));
  assert.deepEqual(validatePrPlan(prPlan), { valid: true, issues: [] });
});

test('derivePrPlan creates clarification todos without a task graph', () => {
  const prPlan = derivePrPlan(sampleClarificationResult(), {
    sessionId: '20260708220500-abcd1234',
    now: new Date('2026-07-08T14:05:00.000Z')
  });

  assert.equal(prPlan.status, 'needs_clarification');
  assert.equal(prPlan.todo_items.length, 1);
  assert.equal(prPlan.todo_items[0].id, 'Q1');
  assert.equal(prPlan.todo_items[0].kind, 'clarification');
  assert.equal(prPlan.todo_items[0].title, 'Which export path should be used?');
  assert.equal(prPlan.obsidian.mermaid, '');
  assert.deepEqual(validatePrPlan(prPlan), { valid: true, issues: [] });
});

test('validatePrPlan fails when a planned todo is missing source_task_id', () => {
  const prPlan = derivePrPlan(samplePlannedResult(), fixedOptions());
  prPlan.todo_items[0].source_task_id = '';

  assert.deepEqual(validatePrPlan(prPlan), {
    valid: false,
    issues: ['todo_missing_source_task_id']
  });
});

test('validatePrPlan allows clarification todos without source_task_id', () => {
  const prPlan = derivePrPlan(sampleClarificationResult(), fixedOptions());
  prPlan.todo_items[0].source_task_id = '';

  assert.deepEqual(validatePrPlan(prPlan), { valid: true, issues: [] });
});

test('validatePrPlan rejects malformed todo metadata and empty acceptance', () => {
  const prPlan = derivePrPlan(samplePlannedResult(), fixedOptions());
  prPlan.todo_items = [
    null,
    { ...prPlan.todo_items[0], kind: '', acceptance: ['  '] }
  ];

  const report = validatePrPlan(prPlan);

  assert.equal(report.valid, false);
  assert.deepEqual(new Set(report.issues), new Set([
    'todo_invalid',
    'todo_missing_kind',
    'todo_missing_acceptance'
  ]));
});

test('derivePrPlan uses taskplan tasks for plan_invalid results and builds a Mermaid graph', () => {
  const prPlan = derivePrPlan(samplePlanInvalidResult(), fixedOptions());

  assert.equal(prPlan.status, 'plan_invalid');
  assert.equal(prPlan.todo_items.length, 2);
  assert.equal(prPlan.todo_items[0].id, 'T1');
  assert.equal(prPlan.todo_items[1].source_task_id, 'T2');
  assert.match(renderPrPlanTodo(prPlan), /- \[ \] T1 Add CLI todo command/);
  assert.match(renderPrPlanTodo(prPlan), /depends on: T1/);
  assert.match(prPlan.obsidian.mermaid, /flowchart TD/);
  assert.match(prPlan.obsidian.mermaid, /T1 --> T2/);
});

test('renderPrPlanTodo includes dependencies, outputs, and acceptance checks', () => {
  const text = renderPrPlanTodo(derivePrPlan(samplePlannedResult(), fixedOptions()));

  assert.match(text, /todo:/);
  assert.match(text, /- \[ \] T1 Add CLI todo command/);
  assert.match(text, /outputs: CLI todo rendering/);
  assert.match(text, /acceptance: CLI command help mentions \/todo/);
  assert.match(text, /depends on: T1/);
});

test('renderPrPlanSources includes sources and evidence excerpts', () => {
  const text = renderPrPlanSources(derivePrPlan(samplePlannedResult(), fixedOptions()));

  assert.match(text, /sources:/);
  assert.match(text, /S1 instruction docs\/agent-module-spec.md/);
  assert.match(text, /E1 from S1: CLI mirrors a safe planning-only interaction shape/);
});

test('renderObsidianPrPlan includes frontmatter, wiki links, Mermaid, sources, and PR draft', () => {
  const markdown = renderObsidianPrPlan(derivePrPlan(samplePlannedResult(), fixedOptions()));

  assert.match(markdown, /^---\ntype: nplan-pr-plan/m);
  assert.match(markdown, /# PR Plan: Improve CLI planning workflow/);
  assert.match(markdown, /- \[ \] T1 Add CLI todo command/);
  assert.match(markdown, /```mermaid\nflowchart TD/);
  assert.match(markdown, /\[\[Task T1 - Add CLI todo command\]\]/);
  assert.match(markdown, /## Sources/);
  assert.match(markdown, /## Evidence/);
  assert.match(markdown, /## Verification Plan/);
  assert.match(markdown, /## PR Draft/);
});

test('defaultPrPlanExportPath returns the local draft path', () => {
  const prPlan = derivePrPlan(samplePlannedResult(), fixedOptions());

  assert.equal(
    defaultPrPlanExportPath(prPlan),
    '.nplan/exports/20260708-improve-cli-planning-workflow.md'
  );
});

function fixedOptions() {
  return {
    sessionId: '20260708220500-abcd1234',
    now: new Date('2026-07-08T14:05:00.000Z')
  };
}

function samplePlannedResult() {
  return {
    status: 'planned',
    taskspec: {
      inferred_goal: 'Improve CLI planning workflow',
      surface_request: 'improve CLI planning workflow',
      source_map: [
        {
          source_id: 'S1',
          kind: 'instruction',
          relative_path: 'docs/agent-module-spec.md',
          knowledge: { title: 'Agent Module Spec' }
        }
      ],
      evidence_map: [
        {
          evidence_id: 'E1',
          source_id: 'S1',
          text: 'CLI mirrors a safe planning-only interaction shape.'
        }
      ]
    },
    taskplan: {
      global_goal: 'Improve CLI planning workflow',
      global_acceptance: ['All CLI commands are documented'],
      tasks: [
        {
          id: 'T1',
          title: 'Add CLI todo command',
          goal: 'Render PR planning todos',
          inputs: ['TaskPlan'],
          outputs: ['CLI todo rendering'],
          dependencies: [],
          acceptance: ['CLI command help mentions /todo'],
          state: 'pending',
          complexity: 'medium',
          risk: 'medium',
          parallel_group: 'G1',
          model_tier: 'strong'
        },
        {
          id: 'T2',
          title: 'Add export command',
          goal: 'Write Obsidian Markdown on request',
          inputs: ['PRPlan'],
          outputs: ['Markdown export'],
          dependencies: ['T1'],
          acceptance: ['Export writes a Markdown file'],
          state: 'pending',
          complexity: 'medium',
          risk: 'medium',
          parallel_group: 'G2',
          model_tier: 'strong'
        }
      ]
    }
  };
}

function sampleClarificationResult() {
  return {
    status: 'needs_clarification',
    clarification_questions: ['Which export path should be used?'],
    taskspec: {
      inferred_goal: 'Improve CLI planning workflow',
      surface_request: 'improve CLI planning workflow',
      clarification: {
        questions: ['Which export path should be used?']
      },
      source_map: [],
      evidence_map: []
    }
  };
}

function samplePlanInvalidResult() {
  return {
    ...samplePlannedResult(),
    status: 'plan_invalid'
  };
}
