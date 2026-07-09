# First-Run Setup And Ctrl+C Design

## Goal

Finalize the local CLI improvement that makes first interactive use smoother
without changing NPlan's planning-only boundary:

- If an interactive TTY launch has no configured model, start the existing
  `nplan setup` wizard before opening the planning session.
- Keep print mode and non-TTY interactive mode explicit: they should tell the
  user to configure a model instead of trying to run setup automatically.
- Make one terminal Ctrl+C close the interactive session cleanly, print `bye`,
  release TTY raw mode, and pause the input stream.

## Scope

This is CLI work. It touches:

- `src/cli.js`
- `test/cli.test.js`
- `README.md`
- `README.zh-CN.md`
- `docs/agent-module-spec.md`
- `docs/model-providers.md`
- `docs/nplan_process_task_obsidian.md`

The existing model setup wizard remains the only guided configuration path.
The CLI may call that wizard during first interactive TTY launch, but it must
not add a new setup flow.

## Non-Goals

- Do not add offline planning or a local-rule fallback for model-free runtime
  planning.
- Do not execute user tasks, run shell commands from inside NPlan, edit source
  files for the user, manage remote agents, or create UI surfaces.
- Do not change provider configuration semantics beyond the first-run entry
  point behavior.
- Do not alter the PRPlan export workflow except where documentation needs to
  remain consistent.

## CLI Behavior

Startup should keep the current command parsing order:

1. Parse CLI arguments.
2. Handle direct commands such as `setup`, `providers`, `doctor`, and `init`.
3. Build the runtime from model config.
4. If runtime creation fails because the model is not configured, and the
   invocation is interactive TTY mode, run the setup wizard.
5. If setup succeeds, rebuild the runtime and continue into the normal
   interactive planning session.
6. If setup fails, print `setup failed: <message>` to stderr and exit with code
   `1`.

Print mode stays strict. It should fail with the existing setup-required
message because print mode is a non-interactive operation.

Non-TTY interactive mode stays non-blocking. It should start and explain that
`nplan setup` is required rather than prompting through a wizard.

## Ctrl+C Behavior

Interactive readline should treat one terminal Ctrl+C as a graceful session
exit:

- print a blank line plus `bye`
- close the readline interface
- release raw mode when the input stream supports it
- pause the input stream
- detach the process-level SIGINT listener during close

The close path must be idempotent so simultaneous readline and process signals
do not print duplicate exits or leave the input stream active.

## Data Flow

No planning artifact schema changes are required.

The only state transition is local CLI runtime initialization:

```text
parsed args
  -> load model config
  -> runtime missing because no model
  -> interactive TTY guard
  -> runModelSetupWizard()
  -> reload runtime
  -> runInteractive()
```

Ctrl+C does not update `TaskSpec`, `TaskPlan`, `ContextPack`, session notes, or
PRPlan. It only closes the local interactive process.

## Error Handling

- Setup wizard errors should be reported as `setup failed: <message>`.
- Existing configured-model failures should still fail analysis; there is no
  local fallback.
- Test streams that advertise TTY behavior but do not implement `setRawMode`
  should not crash cleanup.
- Repeated close or interrupt events should have no additional observable
  effect after the first graceful exit.

## Documentation

Docs should state the user-facing contract compactly:

- `nplan setup` remains the recommended explicit setup command.
- First interactive TTY launch with no configured model starts the same wizard.
- Non-TTY interactive mode and print mode still guide the user to configure a
  model without running an interactive wizard.

README, Chinese README, provider docs, the module spec, and the process doc
must agree on these points.

## Testing

Focused verification:

```powershell
node --test test/cli.test.js
node --check src/cli.js
```

Final verification:

```powershell
node --test
node --check src/cli.js
node --check src/model-config.js
node --check src/model-init.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/provenance.js
```

Expected test coverage:

- interactive Ctrl+C exits with `bye`
- input raw mode is released when available
- input stream is paused
- first interactive TTY launch with no model starts setup before session
- print mode still requires configured model
- no-model non-TTY interactive mode still points to `nplan setup`

## Compatibility

The change is backward compatible:

- existing `nplan setup` remains unchanged
- existing configured users enter the interactive session as before
- print-mode automation behavior remains deterministic
- legacy `-c key=value` compatibility remains unchanged

## Acceptance Criteria

- The planning-only boundary is preserved.
- First interactive TTY launch can configure a model and then enter the session.
- Print mode and non-TTY behavior do not unexpectedly run an interactive
  wizard.
- Ctrl+C exits cleanly with no duplicate output and no stuck TTY input.
- Documentation is synchronized across English, Chinese, provider, process, and
  module-spec docs.
- Focused and final verification commands pass.
