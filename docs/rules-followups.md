# Firestore rules follow-ups

Deferred from the PR #1401 review (dev-paul → main). Neither blocks correctness today; both are worth picking up before the next major rules change.

## 1. Collapse triple `get()` per response rule evaluation

**Where:** `firestore.rules` — `sessionTeacherUid()`, `sessionClassId()`, `sessionClassIds()` (and the `va*`, `gl*`, `ma*`, `aw*` variants).

**What:** Each response `allow read/create/update/delete` calls three separate helpers that each do `get(/databases/.../<collection>/$(sessionId))`. Firestore caches the doc within a single rule evaluation, so this is **not billed 3x** — but the code duplicates the path and eats into the 20-`get()`-per-evaluation budget.

**Fix sketch:** one helper per collection that pulls the doc once and returns the `data` map; read `.teacherUid`, `.get('classId','')`, `.get('classIds',[])` from the cached result at the callsite.

**Trigger to do it:** next time we add a rule that reads another session field (we'd be adding a 4th `get()` helper otherwise), or if a rule evaluation starts pushing the budget.

**Origin:** flagged on [#1397](https://github.com/OPS-PIvers/SpartBoard/pull/1397#discussion_r3131871374); the third `get()` landed in #1401.

## 2. Migrate `activity_wall_sessions` to `passesStudentClassGateCompat`

**Where:** `firestore.rules` — `activity_wall_sessions/{sessionId}/submissions` still uses `passesStudentClassGate(awSessionClassId())`.

**What:** Quiz / video-activity / guided-learning response rules now call `passesStudentClassGateCompat(sessionClassIds(), sessionClassId())` to handle Phase 5A `classIds[]` sessions. Activity Wall was left on the single-class gate because its hook hasn't been migrated. If a future PR migrates the AW hook to write `classIds[]` without also updating the gate, the "empty classId → open" branch in `passesStudentClassGate` would let any studentRole user through.

**Fix:** when the AW hook migrates to Phase 5A, also swap the rule to `passesStudentClassGateCompat(awSessionClassIds(), awSessionClassId())` and add the `awSessionClassIds()` helper.

**Trigger to do it:** whoever migrates `useActivityWallAssignments` / `useActivityWallSession` to Phase 5A owns this rule change in the same PR.

**Origin:** latent trap surfaced during the PR #1401 review; not exploitable today (no Phase 5A AW writes exist).
