# Firestore read/listener cost — F2, F10, F21

**Dimension:** data · Firestore is a school-district cost line, so every avoidable
read/write/listener counts.

These three items all reduce Firestore cost but are independent; do them
separately. **F2 is blocked on a data migration — read its section carefully.**

---

## F2 — Dual-query listener consolidation (BLOCKED — do not implement yet)

**Impact:** 7 · **Effort:** medium · **Risk:** medium · **Behavior change:** no
(if done correctly) — but **collapsing the queries now is a correctness
regression.**

### Problem

`useStudentAssignments` runs **two** Firestore subscriptions per
quiz/video-activity/guided-learning channel: a list-shape query
(`classIds array-contains-any`) and a single-shape query (`classId in`). For a
multi-class student this doubles active listeners and reads.

### Why it's blocked

The dual query guards a **genuine, incomplete data-migration straddle**, not a
redundancy. Session documents can still carry only the legacy single `classId`
field with no `classIds` array, and the list-shape query would never match those
— silently dropping assignments from the student's `/my-assignments` list.

Evidence:

- `hooks/useStudentAssignments.ts:38-40` — header: _"Dual-query (classIds array +
  legacy classId field) is preserved …"_
- `hooks/useStudentAssignments.ts:442-461` — `docToSummary` _"Falls back to the
  legacy single-class field when classIds is absent"_ → such docs are expected to
  exist.
- `hooks/useStudentAssignments.ts:511-512` — the two query shapes; a `classId`-only
  doc matches only the single shape.
- `hooks/useVideoActivitySession.ts:222-225`, `hooks/useGuidedLearningSession.ts:222-225`
  — _"Phase 5A … classId is transitionally mirrored … so pre-Phase-5A rules keep
  working"_ (transitional, not complete).
- `utils/resolveAssignmentTargets.ts:11-12` — _"Legacy in-flight assignments are
  NOT migrated; they continue reading via their existing classIds/periodNames
  fields until they expire."_ No backfill exists.

### Unblock path → then implement

1. Run a backfill that writes `classIds` onto every session doc that currently
   carries only `classId` (and stop the legacy `classId`-only write paths).
2. Confirm via the existing `source` discriminator
   (`utils/resolveAssignmentTargets.ts:56-58`) that the legacy `classId`-only /
   `periodNames` read paths are no longer hit in telemetry.
3. _Then_ collapse to the single list-shape query, dedupe listeners, keep result
   merging + the per-status plan expansion intact, and add a vitest test asserting
   only the list-shape plan is created when `classIds` is non-empty.

### Acceptance criteria

- No assignment that was previously visible disappears for any student
  (legacy-doc regression test).
- Listener/read count per dual-query kind halves for multi-class students.

---

## F10 — Cache PLC metadata instead of per-call `getDoc`

**Impact:** 5 · **Effort:** medium · **Risk:** medium · **Behavior change:** no.

### Problem

PLC-synced quiz assignment creation fires sequential one-off `getDoc`s
(synced-group check, shared-sheet URL), adding read roundtrips on a hot path.

### Evidence

- `hooks/useQuizAssignments.ts:~650-700` — `createAssignment` writes the
  assignment+session batch, then calls `createSyncedQuizGroup` /
  `pullSyncedQuizContent`.
- `hooks/usePlcs.ts:443-450` — `getPlcSharedSheetUrl` issues a full `getDoc` every
  call, no caching.
- `hooks/usePlcAssignments.ts` — `writePlcAssignmentTemplate` may `getDoc` the
  canonical PLC.

### Approach

Hydrate frequently-accessed PLC metadata (`sharedSheetUrl`, features, synced-group
id) into `usePlcs` state once and read from there, instead of lazy per-call
`getDoc`. Batch reads that target the same doc.

### Acceptance criteria

- Assignment-creation path issues no redundant `getDoc` for data already in
  `usePlcs` state. Add a test asserting the cached path avoids the extra read.

---

## F21 — `usePlcs` admin `orderBy('name')` index comment is misleading

**Impact:** 3 · **Effort:** trivial · **Risk:** low · **Behavior change:** no.

### Problem

The admin-mode subscription orders the whole `/plcs` collection by `name` with
`limit(500)`, but the comment claims a single-field `orderBy` _"needs only the
automatic index"_, which is not accurate for `orderBy` on a non-`__name__` field
and can cause latency/index surprises in prod.

### Evidence

- `hooks/usePlcs.ts:27` — `ADMIN_PLCS_LIMIT = 500`
- `hooks/usePlcs.ts:209-210` — the misleading comment
- `hooks/usePlcs.ts:214-215` — `query(collection(...), orderBy('name'), limit(500))`

### Approach (pick one)

- (a) Confirm/add the single-field index in `firestore.indexes.json` and correct
  the comment to match reality; **or**
- (b) Drop the `orderBy` and sort client-side in the snapshot handler (relies only
  on the automatic `__name__` index) — preferred for flexibility at this scale.

### Acceptance criteria

- Comment matches the actual index requirement, or the query no longer needs a
  custom index. No behavior change to the admin list ordering as seen by the user.
