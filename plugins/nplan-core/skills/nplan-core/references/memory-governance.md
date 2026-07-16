# NPlan Memory Governance

Use the NPlan CLI from the project root. Canonical memory lives only under `.nplan/memory/`; never edit its manifest, concepts, proposals, index, log, lock, or transaction files directly.

## Read-only inspection

```text
nplan memory status
nplan memory show
nplan memory show <concept-id>
nplan memory show <proposal-id>
```

`status` hashes canonical memory and registered sources without a model call or write. `show` previews status, concepts, proposals, or one exact item.

## Proposal creation

```text
nplan memory scan
nplan memory ingest <project-relative-path>
nplan memory note "<fact>"
nplan memory correct <concept-id> "<correction>"
```

- `scan` proposes changes from `docs/nplan_knowledge/`.
- `ingest` proposes concepts from one eligible project-relative file or directory and registers that scope only after a successful apply.
- `note` creates a user-authority fact proposal.
- `correct` creates a user-authority correction against the current concept version.

These commands create previewable proposals. They do not authorize apply.

## Decision gate

Before asking for a decision, show:

- exact proposal id and status;
- operation and concept id;
- `authority`;
- `base_version_hash` and current version when relevant;
- proposed content;
- source refs and registered scope implications;
- any conflict or stale-base warning.

Only after explicit authorization for the exact proposal:

```text
nplan memory apply <proposal-id>
nplan memory reject <proposal-id>
```

Do not interpret “remember this,” “scan,” “ingest,” “correct,” or “looks good” as permission to apply unless the exact proposal and action are unambiguous in the current conversation.

## Safety properties

- Apply compares the proposal's base version. A stale base becomes a conflict and never overwrites canonical memory.
- User authority cannot be silently reversed by a model-authority proposal.
- Proposal ids remain immutable across pending and terminal states.
- Mutations serialize across processes and use a write-ahead transaction for idempotent recovery.
- The derived index is only a candidate hint. Canonical Markdown is reread, hash checked, retokenized, and routed through normal provenance before it becomes evidence.
- Missing, stale, corrupt, legacy, excluded, or invalid indexes fall back to canonical scanning without writes.
- A changed memory concept marks a referencing WorkPlan `memory_stale`; replan before export.
- Physical deletion and forget are unsupported.

## Failure handling

- On `conflict`, stop and show the current and proposed versions. Do not retry with a forced overwrite.
- On `memory_index_rebuild_failed`, report that the canonical apply succeeded but the derived index needs operator attention; do not fabricate index success.
- If a write-ahead intent is malformed, stop for operator inspection. Do not delete it or guess recovery state.
- If the CLI is missing, return a non-persistent proposal summary only. Do not recreate `.nplan/memory/` by hand.
