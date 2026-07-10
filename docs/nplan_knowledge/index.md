---
okf_version: "0.1"
title: NPlan Knowledge Bundle
description: Project-specific context bundle for task understanding, evidence, and planning.
---

# NPlan Knowledge Bundle

This bundle adapts the useful parts of Knowledge Catalog and OKF for NPlan.
It is intentionally small, local, and model-provider neutral.

# Guide

* [Local Knowledge and OKF](../local-knowledge.md) - Human-facing usage and maintenance guide.

# Core Concepts

* [Context Pack Governance](concepts/context-pack-governance.md) - How NPlan selects local context and keeps it bounded.
* [Provenance and Evidence](concepts/provenance-and-evidence.md) - How source references and evidence items ground model output.
* [OKF Adoption](concepts/okf-adoption.md) - Which OKF conventions are adopted and which cloud-specific pieces are excluded.
* [Retrieval Roadmap](concepts/retrieval-roadmap.md) - Practical next steps for stronger local knowledge retrieval.

# Implementation Hooks

* [Context policy](../../src/context-policy.js) controls scan roots, ignored directories, project-relative exclusions, source budgets, and source priority.
* [Provenance](../../src/provenance.js) turns files into source references and evidence items.
* [Context curator](../../src/context-curator.js) ranks sources and builds the context pack before the model call.
* [Cloud context consent](../../src/consent.js) fingerprints the bounded context scope and stores privacy-safe project consent metadata.
