---
type: Agent Architecture Decision
title: OKF Adoption
description: N-Agent Planner adopts the file-based OKF shape but not the Google Cloud catalog runtime.
tags: [architecture, okf, metadata-as-code]
timestamp: 2026-07-05T00:00:00Z
---

# Decision

N-Agent Planner should adopt the local, vendor-neutral parts of OKF:

* Markdown files with YAML frontmatter.
* One concept per file.
* `index.md` files for navigation.
* Markdown links for relationships.
* Citations for claims that come from other files or external sources.

N-Agent Planner should not directly adopt the Google Cloud-specific runtime unless the
project later adds an explicit data catalog integration:

* no Dataplex dependency
* no BigQuery metadata sync requirement
* no `gcloud` dependency
* no remote catalog write path

# Rationale

The current project is a local task understanding and decomposition module. Its
best match is OKF as a local knowledge format, not Knowledge Catalog as a cloud
service.

# Relationship To Existing Modules

The OKF metadata is consumed by [Provenance and Evidence](provenance-and-evidence.md)
and ranked by [Context Pack Governance](context-pack-governance.md).

# Citations

[1] [Knowledge Catalog README](../../../DOC/knowledge-catalog/README.md)
[2] [OKF README](../../../DOC/knowledge-catalog/okf/README.md)
