# First-Run Setup And Ctrl+C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize the NPlan CLI first-run setup and Ctrl+C exit behavior as a verified, documented, planning-only release-quality change.

**Architecture:** Keep setup behavior in `src/cli.js` by reusing `runModelSetupWizard()` only when an interactive TTY launch has no configured model. Keep Ctrl+C cleanup inside the interactive readline lifecycle, with idempotent close handling and input cleanup. Keep documentation changes synchronized with the CLI contract.

**Tech Stack:** Node.js ES modules, built-in `node:test`, built-in `readline`, existing NPlan model setup/config modules, Markdown documentation.

## Global Constraints

- NPlan remains planning-only: no task execution, shell execution, file editing by the product, UI generation, browser automation, or remote-agent orchestration.
- No offline planning or local-rule runtime fallback is added.
- `nplan setup` remains the only guided setup flow.
- First interactive TTY launch with no model may run the existing setup wizard before opening the planning session.
- Print mode and non-TTY interactive mode must not run the setup wizard automatically.
- Documentation must stay compact and consistent across English, Chinese, provider, process, and module-spec docs.

---

### Task 1: Prove First-Run TTY Setup And Ctrl+C Behavior

**Files:**
- Modify: `test/cli.test.js`

**Interfaces:**
- Consumes: `main(argv, streams)` from `src/cli.js`
- Consumes: `PassThrough`, `Writable`, `mkdtemp`, `readFile`, `rm`, `tmpdir`, `join`
- Produces: regression tests proving interactive TTY setup and interrupt cleanup

- [ ] **Step 1: Add the TTY setup regression test**

Add this test after `interactive session exits on one terminal Ctrl+C`:

```js
test('first interactive TTY launch runs setup then opens configured session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nplan-first-run-tty-'));
  const oldCwd = process.cwd();
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const setupAndSessionInput = [
    'deepseek',
    '',
    'N',
    '',
    '/status',
    '/exit'
  ].join('\n') + '\n';

  let stdout = '';
  let stderr = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      callback();
    }
  });
  output.isTTY = true;
  output.columns = 80;
  const error = new Writable({
    write(chunk, _encoding, callback) {
      stderr += chunk.toString();
      callback();
    }
  });

  try {
    process.chdir(dir);
    input.end(setupAndSessionInput);
    const code = await main([], { input, output, error });
    const config = await readFile(join(dir, '.nplan', 'config.toml'), 'utf8');

    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.match(stdout, /No model is configured yet\. Starting first-run setup\./);
    assert.match(stdout, /NPlan setup/);
    assert.match(stdout, /Setup complete/);
    assert.match(stdout, /model: deepseek\/deepseek-v4-flash/);
    assert.match(stdout, /bye/);
    assert.match(config, /model = "deepseek-v4-flash"/);
    assert.match(config, /model_provider = "deepseek"/);
  } finally {
    process.chdir(oldCwd);
    input.destroy();
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the focused test file**

Run:

```powershell
node --test test/cli.test.js
```

Expected:

- If the test fails, it should fail because first-run TTY setup is not wired
  correctly or because the stream lifecycle needs adjustment.
- If the new test already passes, inspect `src/cli.js` and confirm the existing
  implementation already satisfies the spec before making production edits.

- [ ] **Step 3: Keep the existing Ctrl+C test**

Confirm this existing test remains present and meaningful:

```js
test('interactive session exits on one terminal Ctrl+C', async () => {
  // Uses a TTY-shaped PassThrough, sends '\x03', and asserts:
  // - exit code 0
  // - stderr is empty
  // - stdout contains bye
  // - raw mode was released
  // - input was paused
});
```

- [ ] **Step 4: Commit only the test if no production change is needed**

If `src/cli.js` already passes the new TTY setup test, include the new test in
the final implementation commit with the existing CLI/docs changes. Do not
create a separate test-only commit unless the production diff is already
committed.

### Task 2: Finalize CLI Runtime And Interrupt Implementation

**Files:**
- Modify: `src/cli.js`

**Interfaces:**
- Consumes: `runModelSetupWizard({ streams })` from `src/model-wizard.js`
- Produces: `shouldRunInitialSetup({ parsed, streams, runtimeError })`
- Produces: `releaseInteractiveInput(inputStream)`

- [ ] **Step 1: Ensure startup retries runtime after setup**

`main()` should contain this behavior after initial runtime creation fails with
a model-config error:

```js
if (!runtime && shouldRunInitialSetup({ parsed, streams, runtimeError })) {
  try {
    streams.output.write('No model is configured yet. Starting first-run setup.\n\n');
    await runModelSetupWizard({ streams });
    runtime = makeRuntime(parsed);
    runtimeError = null;
  } catch (error) {
    streams.error.write(`setup failed: ${error.message}\n`);
    return 1;
  }
}
```

- [ ] **Step 2: Ensure setup guard is TTY-only and not print mode**

`src/cli.js` should include:

```js
function shouldRunInitialSetup({ parsed, streams, runtimeError }) {
  return Boolean(
    runtimeError &&
    !parsed.print &&
    streams.input?.isTTY &&
    streams.output?.isTTY
  );
}
```

- [ ] **Step 3: Ensure Ctrl+C close is idempotent**

`runInteractive()` should include:

```js
let closed = false;
const requestExit = () => {
  if (closed) return;
  streams.output.write('\nbye\n');
  rl.close();
};
const onProcessInterrupt = () => {
  requestExit();
};
rl.on('close', () => {
  closed = true;
  process.off('SIGINT', onProcessInterrupt);
  releaseInteractiveInput(streams.input);
});
rl.on('SIGINT', requestExit);
process.once('SIGINT', onProcessInterrupt);
```

- [ ] **Step 4: Ensure input cleanup tolerates test streams**

`src/cli.js` should include:

```js
function releaseInteractiveInput(inputStream) {
  if (!inputStream?.isTTY) return;
  try {
    inputStream.setRawMode?.(false);
  } catch {
    // Some test streams advertise TTY shape without supporting raw mode.
  }
  inputStream.pause?.();
}
```

- [ ] **Step 5: Run focused verification**

Run:

```powershell
node --test test/cli.test.js
node --check src/cli.js
```

Expected:

- `test/cli.test.js`: all tests pass
- `src/cli.js`: syntax check exits 0

### Task 3: Synchronize User-Facing Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/agent-module-spec.md`
- Modify: `docs/model-providers.md`
- Modify: `docs/nplan_process_task_obsidian.md`

**Interfaces:**
- Consumes: CLI behavior from Tasks 1-2
- Produces: consistent public documentation for first-run setup behavior

- [ ] **Step 1: Update README quick start**

`README.md` should say:

```markdown
If no model is configured yet, running `nplan` in an interactive terminal starts
the same first-run setup wizard before opening the planning session. Print mode
still exits with a clear setup-required error.
```

- [ ] **Step 2: Update Chinese README quick start**

`README.zh-CN.md` should say:

```markdown
如果还没有配置模型，在交互式终端里直接运行 `nplan` 会先启动同一个首次配置向导，然后再进入规划会话。`-p` 打印模式仍会清晰报错并提示先配置模型。
```

- [ ] **Step 3: Update module spec**

`docs/agent-module-spec.md` should state both:

```markdown
- first interactive TTY launch with no configured model starts the same guided
  setup before opening the planning session
```

and:

```markdown
If no model is configured, first interactive TTY launch starts `nplan setup`
before opening the planning session. Non-TTY interactive mode still starts and
tells the user to run `nplan setup`, while print mode exits with a
model-required error.
```

- [ ] **Step 4: Update provider docs**

`docs/model-providers.md` should say:

```markdown
On a first interactive terminal launch with no configured model, `nplan` starts
the same setup wizard before opening the planning session. Use `nplan setup`
directly when you want to reconfigure an existing project.
```

and:

```markdown
If no model is configured, first interactive TTY launch starts the setup wizard.
Non-TTY interactive mode still starts and guides the user to run `nplan setup`.
Print mode exits with a model-required error and tells the user to run setup.
```

- [ ] **Step 5: Update process doc**

`docs/nplan_process_task_obsidian.md` should say:

```markdown
如果首次在交互式终端运行 `nplan` 时还没有模型配置，CLI 会先启动同一个 setup 向导；非交互场景仍只提示运行 `nplan setup`。
```

and its sequence diagram should distinguish interactive setup from non-TTY
guidance.

### Task 4: Final Verification And Commit

**Files:**
- Verify all files changed by Tasks 1-3

**Interfaces:**
- Consumes: all implementation and documentation changes
- Produces: one final implementation commit

- [ ] **Step 1: Run full tests**

Run:

```powershell
node --test
```

Expected:

- all tests pass

- [ ] **Step 2: Run required syntax checks**

Run:

```powershell
node --check src/cli.js
node --check src/model-config.js
node --check src/model-init.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/provenance.js
```

Expected:

- every command exits 0

- [ ] **Step 3: Check diff whitespace**

Run:

```powershell
git diff --check HEAD
```

Expected:

- no whitespace errors

- [ ] **Step 4: Inspect final diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected:

- changed files are limited to this feature's CLI, tests, docs, and
  Superpowers plan/spec artifacts

- [ ] **Step 5: Commit the final implementation**

Run:

```powershell
git add README.md README.zh-CN.md docs/agent-module-spec.md docs/model-providers.md docs/nplan_process_task_obsidian.md src/cli.js test/cli.test.js docs/superpowers/plans/2026-07-09-first-run-setup-ctrl-c.md
git commit -m "Finalize first-run CLI setup flow"
```

Expected:

- commit succeeds
- existing unrelated `.superpowers/` scratch artifacts remain untracked unless
  intentionally included later
