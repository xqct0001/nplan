# Local Knowledge and OKF

NPlan adopts the useful local pieces of Google Cloud Knowledge Catalog's OKF
pattern without adopting the cloud catalog runtime. In this project, OKF means:
Markdown files with YAML frontmatter, one concept per file, normal Markdown
links between concepts, and citations for sourced claims.

## What It Is Used For

The local knowledge layer gives the Context Curator better project-owned
context before the model call.

It helps NPlan answer questions such as:

- Which local rules should shape task understanding?
- Which source files explain the planning-only boundary?
- Which concepts should be sent to the model as compact evidence?
- Which references are broad external material and should stay out of the
  default context pack?

## Project Layout

```text
docs/
  local-knowledge.md                 Human-facing guide
  nplan_knowledge/
    index.md                         Bundle index
    concepts/
      context-pack-governance.md
      okf-adoption.md
      provenance-and-evidence.md
      retrieval-roadmap.md
```

`DOC/knowledge-catalog/` is kept as a human reference copy of the upstream
repository. It is ignored by default context discovery so the model does not
receive a large external sample repository when the user asks about this
project.

## Concept Format

Each reusable knowledge concept is a Markdown file with YAML frontmatter:

```markdown
---
type: Agent Context Concept
title: Context Pack Governance
description: A bounded local context pack should prefer project-specific knowledge.
tags: [context, governance, nplan]
timestamp: 2026-07-05T00:00:00Z
---

# Purpose

Explain the concept in normal Markdown.

# Citations

[1] [Context policy](../../src/context-policy.js)
```

Required for NPlan recognition:

- `type`: non-empty concept type

Recommended:

- `title`
- `description`
- `tags`
- `timestamp`
- `# Citations`

## How The Agent Reads It

1. `collectContext()` scans configured directories.
2. `makeSourceRef()` parses OKF-style frontmatter.
3. Files with a non-empty `type` become `knowledge` sources.
4. `curateContext()` ranks sources using path, kind, title, description, and
   tags.
5. `makeEvidenceItem()` includes concept metadata plus a body excerpt in the
   evidence text.

The result is still a local, read-only `context_pack`. It does not execute
tasks, write files, publish metadata, or call Knowledge Catalog.

## Adding A New Concept

1. Add a Markdown file under `docs/nplan_knowledge/concepts/`.
2. Include at least `type`, `title`, `description`, and `tags` in frontmatter.
3. Link it from `docs/nplan_knowledge/index.md`.
4. Add citations to local files or external references when the body makes a
   sourced claim.
5. Run tests:

```powershell
node --test
```

## Boundaries

Adopted:

- Markdown + YAML frontmatter
- index files for progressive disclosure
- Markdown links for lightweight relationships
- citations for sourced claims
- local source/evidence maps

Not adopted:

- Dataplex or BigQuery sync
- `gcloud` dependency
- remote catalog writes
- vector search requirement
- execution of user tasks
