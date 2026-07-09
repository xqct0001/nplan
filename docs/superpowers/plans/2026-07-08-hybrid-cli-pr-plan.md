# Hybrid CLI PR Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid interactive CLI workflow that can inspect sources, render PR planning todos, revise plans, and explicitly export one Obsidian-friendly Markdown plan.

**Architecture:** Keep `TaskSpec` and `TaskPlan` as the core planning artifacts. Add a focused `src/pr-plan.js` derived-view module, then wire it into `src/cli.js` for `/sources`, `/todo`, `/revise`, and `/export`. Documentation updates describe the new commands and the explicit export boundary.

**Tech Stack:** Node.js ESM, built-in `node:test`, built-in `fs` and `path` modules, existing NPlan model test server helpers, Markdown and Mermaid text rendering.

## Global Constraints

- NPlan remains planning-only: no task execution, shell execution, source-file editing by product behavior, git branch creation, pull request creation, browser automation, or remote-agent orchestration.
- The only new product write is explicit `/export`, which writes a planning Markdown artifact after the user asks for it.
- First version exports one Obsidian-friendly Markdown file, not a multi-file vault.
- Core `TaskPlan` stays stable; PR-oriented output is derived as `PRPlan`.
- Default export path is `.nplan/exports/<plan-id>.md`, with optional user path override.
- Semantic planning still requires a configured model provider; no model-free fallback is added.
- Work with existing uncommitted changes instead of reverting them.

---

## File Structure

- Create `src/pr-plan.js`: derive `PRPlan`, validate it, render `/todo`, render `/sources`, render Obsidian Markdown, and resolve default export names.
- Modify `src/cli.js`: import PRPlan helpers, keep `state.lastPrPlan`, add slash commands, add export writes, and update help text.
- Modify `src/index.js`: export PRPlan helpers for library use.
- Create `test/pr-plan.test.js`: focused tests for PRPlan derivation, validation, todo rendering, source rendering, Markdown rendering, and default path.
- Modify `test/cli.test.js`: interactive integration tests for `/sources`, `/todo`, `/revise`, and `/export`.
- Modify `README.md`, `README.zh-CN.md`, and `docs/agent-module-spec.md`: document new commands and the explicit export boundary.

---

### Task 1: PRPlan Core Module

**Files:**
- Create: `src/pr-plan.js`
- Create: `test/pr-plan.test.js`
- Modify: `src/index.js`

**Interfaces:**
- Consumes: NPlan result objects shaped like `{ status, taskspec, taskplan }`.
- Produces:
  - `derivePrPlan(result, options)` where `options` may include `{ sessionId, now }`.
  - `validatePrPlan(prPlan)` returning `{ valid: boolean, issues: string[] }`.
  - `renderPrPlanTodo(prPlan)` returning a string.
  - `renderPrPlanSources(prPlan)` returning a string.
  - `renderObsidianPrPlan(prPlan)` returning Markdown.
  - `defaultPrPlanExportPath(prPlan)` returning `.nplan/exports/<plan-id>.md`.

- [ ] **Step 1: Write the failing PRPlan tests**

Create `test/pr-plan.test.js` with this content:

```js
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
  assert.equal(prPlan.todo_items[0].title, 'Which export path should be used?');
  assert.equal(prPlan.obsidian.mermaid, '');
  assert.deepEqual(validatePrPlan(prPlan), { valid: true, issues: [] });
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
```

- [ ] **Step 2: Run the failing PRPlan tests**

Run: `node --test test/pr-plan.test.js`

Expected: FAIL with a module-not-found error for `src/pr-plan.js`.

- [ ] **Step 3: Implement `src/pr-plan.js`**

Create `src/pr-plan.js` with these exported functions and keep helper functions private:

```js
export function derivePrPlan(result, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const sessionId = String(options.sessionId || 'local-session');
  const status = result?.status || 'unknown';
  const goal = result?.taskplan?.global_goal || result?.taskspec?.inferred_goal || 'Planning request';
  const planId = safePlanId(now, goal);
  const sourceLinks = sourceLinksFor(result);
  const todoItems =
    status === 'planned'
      ? taskTodos(result?.taskplan?.tasks || [])
      : clarificationTodos(result);
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
      mermaid: status === 'planned' ? mermaidFor(todoItems) : ''
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
    if (!nonEmptyString(item.id)) issues.push('todo_missing_id');
    if (!nonEmptyString(item.title)) issues.push('todo_missing_title');
    if (!Array.isArray(item.acceptance) || !item.acceptance.length) issues.push('todo_missing_acceptance');
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
```

- [ ] **Step 4: Export helpers from `src/index.js`**

Append this export block near the other helper exports in `src/index.js`:

```js
export {
  defaultPrPlanExportPath,
  derivePrPlan,
  renderObsidianPrPlan,
  renderPrPlanSources,
  renderPrPlanTodo,
  validatePrPlan
} from './pr-plan.js';
```

- [ ] **Step 5: Run PRPlan tests and syntax checks**

Run: `node --test test/pr-plan.test.js`

Expected: PASS.

Run: `node --check src/pr-plan.js`

Expected: no output and exit code 0.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/pr-plan.js src/index.js test/pr-plan.test.js
git commit -m "Add PRPlan derived view"
```

Expected: one commit containing only Task 1 files.

---

### Task 2: CLI Read-Only PRPlan Commands

**Files:**
- Modify: `src/cli.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: Task 1 exports from `src/pr-plan.js`.
- Produces:
  - `state.lastPrPlan` inside interactive state.
  - `/sources` interactive command.
  - `/todo` interactive command.
  - updated help text.

- [ ] **Step 1: Write failing CLI tests for `/sources` and `/todo`**

In `test/cli.test.js`, extend the existing `interactive session supports Claude-like session commands and planning boundaries` test by writing these lines after the existing `/context` input and before `/compact`:

```js
    child.stdin.write('/sources\n');
    child.stdin.write('/todo\n');
```

Add these assertions after the existing `/context` assertion:

```js
    assert.match(stdout, /sources:/);
    assert.match(stdout, /todo:/);
    assert.match(stdout, /- \[ \] T1 Define TaskSpec artifacts/);
```

In the `help shows Claude-like command shapes and slash commands` test, add:

```js
  assert.match(result.stdout, /\/sources/);
  assert.match(result.stdout, /\/todo/);
```

- [ ] **Step 2: Run the failing CLI tests**

Run: `node --test test/cli.test.js`

Expected: FAIL because `/sources` and `/todo` are unknown commands or absent from help.

- [ ] **Step 3: Import PRPlan helpers and extend interactive state**

In `src/cli.js`, add this import near the other local imports:

```js
import { derivePrPlan, renderPrPlanSources, renderPrPlanTodo } from './pr-plan.js';
```

Change the `state` object in `runInteractive()` from:

```js
const state = { lastResult: null, requests: 0, runtime, runtimeError, session };
```

to:

```js
const state = { lastResult: null, lastPrPlan: null, requests: 0, runtime, runtimeError, session };
```

- [ ] **Step 4: Update help text**

In the interactive commands section of `HELP`, add these rows after `/context`:

```text
  /sources         Show source and evidence details for the last result
  /todo            Show the PR planning todo list for the last result
```

- [ ] **Step 5: Derive PRPlan after every successful analysis**

In `analyzeAndRender()`, immediately after:

```js
state.lastResult = await state.runtime.agent.analyzeAsync(prompt, contextForSession(state.session));
```

add:

```js
state.lastPrPlan = derivePrPlan(state.lastResult, { sessionId: state.session.id });
```

In the `/clear`, `/reset`, `/new`, `/resume`, and `/continue` command branches, set `state.lastPrPlan = null` wherever `state.lastResult = null` already appears.

- [ ] **Step 6: Add `/sources` and `/todo` branches**

In `handleInteractiveLine()`, after the `/context` branch, add:

```js
  if (line === '/sources') {
    streams.output.write(`${renderPrPlanSources(state.lastPrPlan)}\n`);
    return false;
  }
  if (line === '/todo') {
    streams.output.write(`${renderPrPlanTodo(state.lastPrPlan)}\n`);
    return false;
  }
```

- [ ] **Step 7: Run CLI tests and syntax check**

Run: `node --test test/cli.test.js`

Expected: PASS.

Run: `node --check src/cli.js`

Expected: no output and exit code 0.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add CLI PRPlan todo and source views"
```

Expected: one commit containing only Task 2 files.

---

### Task 3: CLI Revise And Export Commands

**Files:**
- Modify: `src/cli.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: `derivePrPlan()`, `renderObsidianPrPlan()`, and `defaultPrPlanExportPath()`.
- Produces:
  - `/revise <additional context>` interactive command.
  - `/export [path]` interactive command.
  - explicit Markdown write behavior.

- [ ] **Step 1: Write failing CLI tests for `/revise` and `/export`**

In the existing interactive integration test in `test/cli.test.js`, after `/todo`, add:

```js
    child.stdin.write('/revise keep the first version single-file for Obsidian\n');
    child.stdin.write('/export\n');
    child.stdin.write('/export docs/plans/cli-pr-plan.md\n');
```

Add these assertions after the `/todo` assertions:

```js
    assert.match(stdout, /revised plan:/);
    assert.match(stdout, /exported: \.nplan\/exports\//);
    assert.match(stdout, /exported: docs\/plans\/cli-pr-plan\.md/);
```

After the child process closes, read the two exported files and assert Markdown structure:

```js
    const defaultExports = await readdir(join(cwd, '.nplan', 'exports'));
    assert.equal(defaultExports.length, 1);
    const defaultMarkdown = await readFile(join(cwd, '.nplan', 'exports', defaultExports[0]), 'utf8');
    const customMarkdown = await readFile(join(cwd, 'docs', 'plans', 'cli-pr-plan.md'), 'utf8');
    assert.match(defaultMarkdown, /^---\ntype: nplan-pr-plan/m);
    assert.match(defaultMarkdown, /## Todo/);
    assert.match(defaultMarkdown, /```mermaid/);
    assert.match(defaultMarkdown, /\[\[Task T1 - /);
    assert.match(customMarkdown, /## PR Draft/);
```

Ensure the imports at the top already include `readFile` and `readdir` from `node:fs/promises`; if they do not, add them to the existing import list.

- [ ] **Step 2: Run the failing CLI tests**

Run: `node --test test/cli.test.js`

Expected: FAIL because `/revise` and `/export` are unknown commands.

- [ ] **Step 3: Import export helpers and filesystem helpers**

In `src/cli.js`, extend the PRPlan import to:

```js
import {
  defaultPrPlanExportPath,
  derivePrPlan,
  renderObsidianPrPlan,
  renderPrPlanSources,
  renderPrPlanTodo
} from './pr-plan.js';
```

Extend the `node:fs` import to include `lstatSync`:

```js
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
```

Extend the `node:path` import to include `dirname` and `extname`:

```js
import { dirname, extname, join, resolve } from 'node:path';
```

- [ ] **Step 4: Update help text**

In `HELP`, add these rows after `/todo`:

```text
  /revise <text>   Replan using the last result plus additional context
  /export [path]   Export the last plan as Obsidian-friendly Markdown
```

In the help test, add:

```js
  assert.match(result.stdout, /\/revise/);
  assert.match(result.stdout, /\/export/);
```

- [ ] **Step 5: Add `/revise` handling**

In `handleInteractiveLine()`, add this branch before the generic unknown slash command branch:

```js
  if (slash.command === '/revise') {
    const revision = slash.arg;
    if (!revision) {
      streams.output.write('Usage: /revise <additional context>\n');
      return false;
    }
    const prompt = revisionPrompt(state.lastResult, revision);
    streams.output.write('revised plan:\n');
    await analyzeAndRender(prompt, { state, streams });
    return false;
  }
```

Add this helper near `promptWithStdin()`:

```js
function revisionPrompt(lastResult, revision) {
  if (!lastResult) return revision;
  const goal = lastResult.taskspec?.inferred_goal || lastResult.taskplan?.global_goal || '';
  const previous = lastResult.taskspec?.surface_request || goal || '';
  const questions =
    lastResult.clarification_questions ||
    lastResult.taskspec?.clarification?.questions ||
    [];
  const tasks = (lastResult.taskplan?.tasks || []).map((task) => `${task.id}: ${task.title}`);
  return [
    previous ? `Previous request:\n${previous}` : null,
    goal ? `Previous goal:\n${goal}` : null,
    questions.length ? `Clarification questions:\n${questions.map((item) => `- ${item}`).join('\n')}` : null,
    tasks.length ? `Previous plan:\n${tasks.map((item) => `- ${item}`).join('\n')}` : null,
    `Revision:\n${revision}`
  ].filter(Boolean).join('\n\n');
}
```

- [ ] **Step 6: Add `/export` handling**

In `handleInteractiveLine()`, add this branch after `/revise`:

```js
  if (slash.command === '/export') {
    const message = handleExportCommand(slash.arg, state);
    streams.output.write(`${message}\n`);
    return false;
  }
```

Add this helper near `handleCompactCommand()`:

```js
function handleExportCommand(arg, state) {
  if (!state.lastPrPlan) return 'No export yet. Run /plan <prompt> first.';
  try {
    const target = resolveExportPath(arg, state.lastPrPlan);
    const markdown = renderObsidianPrPlan(state.lastPrPlan);
    mkdirSync(dirname(target.absolute), { recursive: true });
    writeFileSync(target.absolute, markdown, 'utf8');
    return `exported: ${target.display}`;
  } catch (error) {
    return `export failed: ${error.message}`;
  }
}

function resolveExportPath(arg, prPlan) {
  const raw = String(arg || '').trim() || defaultPrPlanExportPath(prPlan);
  if (extname(raw).toLowerCase() !== '.md') {
    throw new Error('export path must end with .md');
  }
  const absolute = resolve(raw);
  if (existsSync(absolute) && lstatSync(absolute).isDirectory()) {
    throw new Error('export path points to a directory');
  }
  return { absolute, display: raw.replace(/\\/g, '/') };
}
```

- [ ] **Step 7: Run CLI tests and syntax check**

Run: `node --test test/cli.test.js`

Expected: PASS.

Run: `node --check src/cli.js`

Expected: no output and exit code 0.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add CLI revise and Obsidian export commands"
```

Expected: one commit containing only Task 3 files.

---

### Task 4: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/agent-module-spec.md`

**Interfaces:**
- Consumes: finalized CLI command names and explicit export behavior from Tasks 2 and 3.
- Produces: user-facing documentation that is consistent across English README, Chinese README, and module spec.

- [ ] **Step 1: Update English README command list**

In `README.md`, update the interactive commands block to include:

```text
/sources
/todo
/revise <additional context>
/export [path]
```

Add a short paragraph after the interactive command list:

```markdown
`/todo` and `/sources` are read-only views of the latest planning result.
`/export` is the only interactive command that writes a new planning artifact;
without a path it writes `.nplan/exports/<plan-id>.md`, and with a path it writes
the requested Markdown file. The export is an Obsidian-friendly planning note,
not a submitted PR or executed task.
```

- [ ] **Step 2: Update Chinese README command list**

In `README.zh-CN.md`, add the same commands to the interactive command list.

Add one Simplified Chinese paragraph near the CLI interaction section that says:

- `/todo` and `/sources` are read-only views of the latest planning result.
- They show the PR planning checklist and context evidence.
- `/export` is the only interactive command that writes a new planning document.
- Without a path, `/export` writes `.nplan/exports/<plan-id>.md`.
- With a path, `/export` writes the requested Markdown file.
- The export is an Obsidian-friendly planning note.
- The export does not create a real PR and does not execute tasks.

- [ ] **Step 3: Update module spec boundary and CLI sections**

In `docs/agent-module-spec.md`, update the CLI interaction command list to include:

```text
/sources, /todo, /revise, /export
```

In the unsupported behavior or boundary section, add:

```markdown
Explicit `/export` writes a user-requested Markdown planning artifact. This is
the only product write introduced for the hybrid CLI workflow and does not
execute tasks, edit source files, or create pull requests.
```

- [ ] **Step 4: Run full verification**

Run: `node --test`

Expected: all tests pass.

Run:

```bash
node --check src/cli.js
node --check src/pr-plan.js
node --check src/model-config.js
node --check src/model-init.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/provenance.js
```

Expected: every command exits with code 0 and no syntax errors.

- [ ] **Step 5: Inspect final git diff**

Run: `git status --short`

Expected: only files intentionally changed by this implementation are modified, plus any pre-existing user changes that should remain separate.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add README.md README.zh-CN.md docs/agent-module-spec.md
git commit -m "Document hybrid CLI PR planning workflow"
```

Expected: one documentation commit.

---

## Final Acceptance Checklist

- `src/pr-plan.js` exists and exports the documented helper functions.
- `/sources` shows source and evidence detail for the latest result.
- `/todo` shows checkbox PR planning todos for planned results and clarification checklists for clarification results.
- `/revise <text>` replans using the latest result and user revision text.
- `/export` writes `.nplan/exports/<plan-id>.md`.
- `/export <path>` writes the requested Markdown file.
- Exported Markdown contains frontmatter, todo checkboxes, Mermaid task graph when planned, Obsidian wiki links, sources, evidence, verification plan, PR draft, and raw ids.
- Product behavior remains planning-only except for explicit Markdown export.
- `node --test` passes.
- `node --check src/cli.js` passes.
- `node --check src/pr-plan.js` passes.
