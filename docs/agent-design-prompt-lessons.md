# Lessons From Claude Design System Prompt

Source reviewed: <https://github.com/Trystan-SA/claude-design-system-prompt>

That repository is a prompt-and-skill library for design work. It contains a
Codex-oriented `AGENTS.md`, a long operating prompt, and procedural skill files
for discovery, design-system extraction, prototypes, accessibility review,
interaction states, hierarchy, and final polish.

## What Transfers Well To NPlan

1. Entry-point instructions belong in `AGENTS.md`.

   Their Codex variant uses a small `AGENTS.md` to tell future agents which
   operating instructions and skills to load. NPlan benefits from the same
   pattern: a short root-level file should point agents to the project boundary,
   local context docs, and quality gates.

2. Skills should be procedural, not magical.

   The repo treats skills as Markdown procedures that the agent reads and
   follows. NPlan can use the same idea without adopting a new runtime: provider
   work, context work, schema work, CLI work, and documentation work can each
   have a known file set and verification path.

3. Context must come before invention.

   The design prompt insists on reading existing brand, code, tokens, or
   screenshots before drawing. For NPlan, the equivalent is reading local docs,
   source contracts, OKF-style knowledge, and provider config before changing
   planning behavior.

4. Quality gates should be explicit and repeatable.

   The design system has final review passes for accessibility, visual
   hierarchy, interaction states, and polish. NPlan should keep analogous gates:
   planning boundary, validation coverage, provenance correctness, provider
   compatibility, documentation freshness, and smoke checks.

5. Filler is a real failure mode.

   The prompt's strongest transferable rule is that every element must earn its
   place. For NPlan, this means no invented features, no decorative docs, no
   vague roadmap language, and no unsupported claims in README examples.

6. Review chains are more useful than one giant prompt.

   Their greenfield design flow chains discovery, aesthetic direction,
   wireframe, prototype, and polish. NPlan can chain task understanding,
   context curation, conflict detection, planning, and validation as explicit
   phases with inspectable artifacts.

## What Should Not Be Copied Directly

- UI-specific design rules such as typography scales, color palettes,
  animation, screenshots, and browser rendering are not core to NPlan.
- Prototype and deck-building procedures would expand the product beyond its
  planning-only boundary.
- Their "designer first" identity should not replace NPlan's identity as a
  local task-understanding and decomposition module.
- Multi-variation UI output does not map cleanly to NPlan's structured JSON
  contract, except as future optional planning alternatives.

## Practical Additions For This Repository

- Add a root `AGENTS.md` with NPlan-specific operating rules.
- Keep a small set of skill-style procedures in docs instead of copying the
  full external skill library.
- Consider a future `docs/nplan_agent_procedures.md` if the procedure list grows
  beyond the root `AGENTS.md`.
- Add a "quality gate" concept to future planning outputs if the schema grows:
  each plan could expose which gates passed, failed, or require clarification.

