---
type: Agent Roadmap
title: Retrieval Roadmap
description: Small implementation steps for moving from file scanning to stronger local knowledge retrieval.
tags: [retrieval, roadmap, context, ranking]
timestamp: 2026-07-05T00:00:00Z
---

# Current State

N-Agent scans configured local directories, builds source references, ranks
sources with a lightweight score, and keeps only a bounded number of evidence
items.

# Useful Next Steps

1. Parse frontmatter and classify OKF concepts as `knowledge`.
2. Include concept metadata in source ranking.
3. Keep large external repositories out of the default context scan.
4. Add link extraction so a selected concept can reveal related concepts.
5. Add an optional content search step for terms that do not appear in filenames
   or frontmatter.

# Non-Goals

The retrieval layer should not execute user tasks, write remote metadata, or
depend on a cloud catalog. Those actions stay outside the planning-only boundary.

# Citations

[1] [Context curator](../../../src/context-curator.js)
[2] [N-Agent module spec](../../agent-module-spec.md)
