---
type: Agent Context Concept
title: Context Pack Governance
description: A bounded local context pack should prefer project-specific knowledge over broad external reference material.
tags: [context, governance, okf, n-plan]
timestamp: 2026-07-05T00:00:00Z
---

# Purpose

N-Plan should treat context as a curated input, not as a raw dump of every
available file. The local context pack exists to ground task understanding while
preserving the module boundary: N-Plan plans and validates, but does not execute
tasks.

# Adopted Pattern

The useful OKF pattern is progressive disclosure:

1. Keep a small index that describes available knowledge.
2. Store each reusable idea as one Markdown concept.
3. Use frontmatter for routing fields such as `type`, `title`, `description`,
   `tags`, and `resource`.
4. Use normal Markdown links to express relationships between concepts.

This project applies that pattern inside `docs/n-agent-knowledge/`.

# Selection Rules

Project-owned knowledge should be eligible for the default context pack. Large
external reference repositories should not be scanned by default, even when they
are present under `DOC/`, because they can crowd out the source files and local
specs that describe the current module.

# Citations

[1] [OKF specification](../../../DOC/knowledge-catalog/okf/SPEC.md)
[2] [Context policy](../../../src/context-policy.js)
