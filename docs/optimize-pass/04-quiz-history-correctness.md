# F7 — Quiz response-history deletion can clobber a PIN-mate's history

**Dimension:** correctness · **Impact:** 5 · **Effort:** medium · **Risk:** medium
· **Behavior change:** no (it narrows a destructive delete to the right owner).

## Problem

PIN joiners get a **deterministic** response-doc key `pin-{period}-{pin}`. Two
students who share the same normalized `(period, PIN)` pair map to the **same**
response doc and the same `/history` subcollection. When one is removed via
`removeStudent()`, the code deletes the entire `/history` subcollection under that
key — which can delete history entries that logically belong to the _other_
student sharing the key, corrupting their draft/recovery history.

The shared-secret design means collisions can't be fully prevented at the rules
layer (acknowledged in `firestore.rules`), but the **deletion blast radius** can
be bounded.

## Current-state evidence

- `hooks/useQuizSession.ts:888-907` — `deleteHistory` loops and deletes the whole
  `/history` subcollection for the response key (chunked at 450).
- `hooks/useQuizSession.ts:472-481` — `computeResponseKey`; comment notes the
  collision is _"expected to be rare."_
- `firestore.rules:2254-2257` — _"Classmate-on-classmate grief with both parties on
  the same PIN+period is not fully preventable here (shared-secret design)."_
- `types.ts:3256` — documents the deterministic PIN-joiner key encoding.

## Proposed approach

Bound the history deletion to the **removed student's own session window** instead
of nuking the whole subcollection:

1. Record the student's session start (`joinedAt`) on the response doc (if not
   already present) and the removal time.
2. In `deleteHistory`, delete only history docs whose `snapshotAt` / `answeredAt`
   fall within `[joinedAt, removalTime]` for that student, leaving entries created
   under a different student's occupancy of the same key intact.

Alternative (larger, behavior-changing): migrate PIN keys to be unique per student
(append a hash of the initial `sessionId`) so collisions can't share a doc at all —
defer this unless product wants it; it's a bigger change with its own migration.

## Risks

- Timestamp-window filtering must be robust to clock skew and to history entries
  written exactly at the boundary; prefer an explicit owner/session marker on each
  history doc over pure time-window heuristics if one already exists or is cheap to
  add.
- Don't leak the _other_ student's history into the removed student's view either;
  verify reads are already scoped.

## Acceptance criteria

- Removing student A under a shared `(period, PIN)` key deletes only A's history
  entries; B's remain.
- Single-occupant (non-colliding) keys behave exactly as before.
- A vitest test simulating two sequential occupants of the same key asserts the
  second removal preserves the first occupant's in-window history.

## Kickoff prompt

> Implement F7 from `docs/optimize-pass/04-quiz-history-correctness.md`: in
> `hooks/useQuizSession.ts`, bound `deleteHistory` (≈888-907) to the removed
> student's own session window so a PIN-collision doesn't delete a classmate's
> response history. Prefer an explicit owner/session marker on history docs if
> cheap; otherwise scope by `[joinedAt, removalTime]`. Add a vitest test with two
> sequential occupants of one `pin-{period}-{pin}` key proving the second removal
> preserves the first's history. Preserve single-occupant behavior exactly.
