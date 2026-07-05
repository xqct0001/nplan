# NPlan Agent Instructions

## Project Boundary

NPlan is a planning-only module. Agents working in this repository should keep
the product boundary clear:

- Produce and refine `TaskSpec`, `TaskPlan`, `ContextPack`, provenance, and
  validation behavior.
- Do not add task execution, shell execution, file editing by the product, UI
  generation, browser automation, or remote-agent orchestration unless the
  project scope is explicitly changed.
- Prefer local, inspectable rules and validators before adding new model-only
  behavior.

## Context First

Before changing behavior, read the local context that defines the contract:

- `docs/agent-module-spec.md`
- `docs/local-knowledge.md`
- `docs/model-providers.md`
- `docs/nplan_knowledge/index.md`
- the relevant source file under `src/`

Large reference repositories under `DOC/` are for human study. They should not
drive default context unless the task explicitly asks for that upstream source.

## Skill-Style Procedures

When a task matches one of these procedures, follow it as an in-repo operating
pattern:

- Provider work: update `src/model-config.js`, `config.example.toml`, and
  `docs/model-providers.md` together.
- Context work: update `src/context-policy.js`, `src/context-curator.js`,
  `src/okf.js`, and the local knowledge docs together.
- Planning schema work: update `src/schemas.js`, `src/understanding.js`,
  `src/planning.js`, and `src/validation.js` together.
- CLI work: update `src/cli.js`, README command examples, and the process doc
  together.
- Documentation work: keep README, Chinese README, and focused docs consistent
  when the user-facing surface changes.

## Quality Gates

Every substantive change should answer these checks before delivery:

- Does it preserve the planning-only boundary?
- Does every new field or behavior have a validation or compatibility rule?
- Does context evidence point back to stable source ids?
- Are provider differences represented as config, not scattered conditionals?
- Is the public documentation current and free of obsolete project names?
- Were syntax checks or focused smoke checks run when code changed?

## Documentation Style

Keep project docs compact and operational:

- Prefer concise procedures, contracts, and examples over long essays.
- Avoid filler claims, decorative wording, and unverified feature promises.
- State unsupported behavior explicitly when it protects the project boundary.
- Cite external inspiration as references, but adapt it to NPlan instead of
  copying another project's prompt wholesale.

