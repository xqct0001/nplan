import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as api from '../src/index.js';
import packageJson from '../package.json' with { type: 'json' };

const legacyName = (...parts) => parts.join('');

test('v0.2 public API exposes WorkPlan and removes pull-request-specific exports', () => {
  assert.equal(packageJson.version, '0.2.0');
  assert.equal(typeof api.deriveWorkPlan, 'function');
  assert.equal(Object.hasOwn(api, legacyName('derive', 'Pr', 'Plan')), false);
  assert.equal(Object.hasOwn(api, legacyName('renderObsidian', 'Pr', 'Plan')), false);
});

test('v0.2 public API removes transitional model and planner names', () => {
  assert.equal(Object.hasOwn(api, legacyName('OpenAICompatible', 'Task', 'Model')), false);
  assert.equal(Object.hasOwn(api, legacyName('planFrom', 'Task', 'Spec')), false);
});
