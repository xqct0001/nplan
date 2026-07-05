---
type: Agent Context Concept
title: Provenance and Evidence
description: TaskSpec fields should be grounded by stable source references and compact evidence excerpts.
tags: [provenance, evidence, taskspec, validation]
timestamp: 2026-07-05T00:00:00Z
---

# Purpose

N-Plan already separates sources from evidence:

* `source_map` records stable file identity, path, hash, parser version, and line span.
* `evidence_map` records compact excerpts that can be sent to the model.
* `context_pack` carries the selected subset into task understanding.

OKF improves this by giving Markdown files structured metadata. When a Markdown
file has OKF-style frontmatter with a non-empty `type`, N-Plan can classify it
as a reusable knowledge concept rather than generic documentation.

# Local Contract

Knowledge evidence should include:

* concept title
* concept type
* one-line description
* tags
* body excerpt

This gives the model enough routing context without requiring a full knowledge
graph or remote catalog service.

# Validation Implication

Every evidence item must still reference an existing source id. The OKF metadata
augments the source, but does not replace the existing source/evidence integrity
checks.

# Citations

[1] [Provenance implementation](../../../src/provenance.js)
[2] [TaskSpec validation](../../../src/validation.js)
