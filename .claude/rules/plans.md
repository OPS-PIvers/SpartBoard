---
paths:
  - 'docs/plans/**'
---

# Editing a plan in `docs/plans/`

`docs/plans/` holds only live plans. `docs/plans/shipped/` is the read-only decision record for
shipped plans that code comments cite (e.g. "D3"); don't revise those. Move a plan there once its
feature is built, even if a flag flip or cleanup step remains; track that step in `PAUL_TODO.md` (human) or `AGENT_BACKLOG.md` (agent).

**Before rewriting or substantially revising any `docs/plans/*.md`, list open PRs that touch that
file and rebase onto them instead of rewriting from the version on `main`.** These docs get multiple
agent passes, and two sessions revising the same plan in parallel produces a conflict that has to be
resolved by hand, decision by decision — the losing pass's work is silently discarded if whoever
resolves it does not read both. A rewrite that never checked cannot know what it is dropping.

This applies to a rewrite, an audit pass, or a resequencing. Appending one decision to a plan you
just read does not need the check.
