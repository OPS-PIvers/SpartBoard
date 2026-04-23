# AssignClassPicker — Unified Class Picker for Quiz + Video Activity

**Date:** 2026-04-22
**Target branch:** `dev-paul`
**Driver:** Three-teacher Quiz pilot tomorrow needs a working multi-class assignment flow.

## Problem

Today's Quiz assign modal exposes two separate controls that both answer the question _"which classes get this assignment?"_:

1. **Single-select dropdown** ("Target class (optional)") — `AssignTargetClassRow` at `components/widgets/QuizWidget/components/QuizManager.tsx:1376–1411`. Binds to a ClassLink class via its `sourcedId`. Used by Firestore rules (`passesStudentClassGate`) so ClassLink-SSO students see the assignment on their `/my-assignments` page.
2. **Multi-select checkbox list** ("Class Periods") inside `AssignPlcSlot` — `components/widgets/QuizWidget/components/QuizManager.tsx:1451–1495`. Binds to local `ClassRoster` names. Drives the post-PIN class-period picker for students and labels columns in the PLC Google-Sheet export.

The two controls have different sources (ClassLink classes vs. local rosters), different cardinality (one vs. many), and different downstream effects, but the UI presents them as if they're optional add-ons in the same dialog. **A teacher with 4 ClassLink classes can only assign to one of them.** That's the headline pain point for tomorrow's pilot.

Video Activity has the same single-select limitation (`components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx:1091–1127`) but no period-checkbox concept at all — it has no PLC mode, no `selectedPeriodNames` field, and no student-side period flow.

Guided Learning has _no class targeting at all_ today and is intentionally out of scope for this PR (see "Out of scope").

## Goals

1. Replace the two Quiz controls with one shared component that supports a strict source toggle (ClassLink XOR local rosters) and multi-select within each source.
2. Apply the same component to Video Activity in a `classlink-only` mode (no source toggle, no period UI).
3. Update Firestore rules for both `quiz_sessions` and `video_activity_sessions` so ClassLink-SSO students whose `classIds` claim intersects any of the session's targeted classes can read it. Today's `passesStudentClassGate(classId)` only checks a single class.
4. Preserve all existing assignments — old session docs (with only `classId`, no `classIds`) must keep working for ClassLink-SSO students after rules ship.
5. Keep PLC mode functional and orthogonal to the picker — PLC is "shared quiz settings + shared spreadsheet for data," not a feature that depends on local rosters.

## Non-goals

- Guided Learning class targeting (separate follow-up — net-new infrastructure).
- Renaming `selectedPeriodNames` to something more honest (out of scope; too many downstream touches).
- Mini-app (already on `classIds` + `passesStudentClassGateList`).
- Cleanup PR to drop the `classId` write + rules fallback (planned for later, not timed against pilot).
- Restructuring how PIN-flow students join (the PIN code path is unchanged).

---

## Design

### 1. Component shape

A single shared component at `components/common/AssignClassPicker.tsx`, ~200 lines, with one mode prop that toggles between dual-source (Quiz) and ClassLink-only (VA):

```ts
type AssignClassPickerValue = {
  source: 'classlink' | 'local'; // ignored when mode === 'classlink-only'
  classIds: string[]; // ClassLink sourcedIds
  periodNames: string[]; // local roster names; always [] when mode === 'classlink-only'
};

type AssignClassPickerProps = {
  mode: 'dual' | 'classlink-only';
  classLinkClasses: ClassLinkClass[];
  rosters?: ClassRoster[]; // required when mode === 'dual', ignored otherwise
  value: AssignClassPickerValue;
  onChange: (next: AssignClassPickerValue) => void;
  disabled?: boolean;
};
```

Quiz passes `mode="dual"`. VA passes `mode="classlink-only"` and omits `rosters`.

**Rejected alternatives:**

- Base + variants split (`<DualSourceClassPicker>` composing `<ClassLinkClassPicker>`) — over-engineered for two callers; one would always import the other.
- Hook + presentation split (`useAssignClassSelection()` returning a state machine, each widget rendering its own UI) — defeats the purpose of unifying the UI; styles would diverge within a release.

### 2. Layout

**Quiz (`mode="dual"`):**

```
┌─ Assign to classes ─────────────────────────────────┐
│  [ ClassLink classes ]  [ Local rosters ]           │ ← segmented pill, 2 options
│                                                      │
│  ☑ Math 6 — Period 1                                │ ← multi-select, filtered by source
│  ☑ Math 6 — Period 3                                │
│  ☐ Algebra — Period 5                               │
│  ☐ Algebra — Period 7                               │
│                                                      │
│  Select all (4) · Clear                             │ ← inline links
└──────────────────────────────────────────────────────┘
```

**VA (`mode="classlink-only"`):**

```
┌─ Assign to classes ─────────────────────────────────┐
│  ☑ Math 6 — Period 1                                │ ← no source toggle
│  ☑ Math 6 — Period 3                                │
│  ☐ Algebra — Period 5                               │
│  ☐ Algebra — Period 7                               │
│                                                      │
│  Select all (4) · Clear                             │
└──────────────────────────────────────────────────────┘
```

**Empty / fallback states:**

- ClassLink source with zero classes: render _"No ClassLink classes connected. Switch to Local rosters or use the join code."_ with the segmented control still visible so the teacher can switch.
- Local rosters source with zero rosters: _"No saved rosters. Add one in Sidebar → Classes, or switch to ClassLink."_
- Zero selection (any mode): no error — assignment falls back to "code/PIN only" join (current default behavior). Inline note: _"No classes selected — students will join with the code only."_

The segmented control is small custom markup (two `<button>`s in a styled flex container). The existing `Toggle` component in `components/common/Toggle.tsx` is boolean-only and not suitable.

### 3. PLC mode interaction (Quiz only)

PLC mode is just _"shared quiz settings + shared Google Sheet for data."_ It's orthogonal to the picker.

- The PLC toggle stays in `AssignPlcSlot`. The period checkbox block inside that slot (lines 1451–1495) is **removed** — periods now come from the picker for any widget that wants to label results by period.
- The PLC toggle is **never disabled** by the picker's source choice.
- PLC export consumes whatever the picker emitted as the "period axis":
  - If `value.source === 'local'` → use `value.periodNames` as column headers (today's behavior).
  - If `value.source === 'classlink'` → translate each `classId` through the existing `formatClassLinkClassLabel(cls)` helper (`components/widgets/QuizWidget/components/QuizManager.tsx:1362–1366`) to get `"Math 6 - Period 1"`-style headers. The session doc still stores raw `classIds`; the label translation happens at export time.
  - If teacher selected zero classes → PLC sheet has no per-period columns; results land in a single "All students" column (matches today's fallback for PLC-on-with-no-periods).

The picker doesn't know about PLC. The PLC slot reads `value.classIds` / `value.periodNames` from parent state. Clean separation.

### 4. Pre-population on existing assignments

When the assign modal opens for an existing assignment (or re-opens for editing), source the initial `AssignClassPickerValue` in this priority order:

1. `classIds: [...]` present and non-empty → `{ source: 'classlink', classIds: [saved], periodNames: [] }`.
2. Else `classId: 'x'` present (old single-field assignment) → `{ source: 'classlink', classIds: ['x'], periodNames: [] }`. Migration shim — the old single field maps to the new multi field with one element.
3. Else `selectedPeriodNames: [...]` present and non-empty → `{ source: 'local', classIds: [], periodNames: [saved] }`.
4. Else (fresh assignment) → `{ source: 'classlink', classIds: [], periodNames: [] }`.

ClassLink wins over local when both are present (more specific targeting). Source defaults to `classlink` on fresh assignments because that's the most common new-teacher-with-SSO path.

### 5. What gets written

**`hooks/useQuizAssignments.ts createAssignment`** — current signature accepts `classId: string | null` as the 4th positional arg (`hooks/useQuizAssignments.ts:181–268`). New signature replaces that parameter with an options object:

```ts
createAssignment(quiz, settings, initialStatus, {
  classIds: string[],            // [] for no targeting
  selectedPeriodNames: string[], // [] when source === 'classlink'
})
```

Writes onto `quiz_sessions/{id}`:

- `classIds: string[]` — always present (possibly empty)
- `classId: string` — set to `classIds[0]` when non-empty, omitted when empty (migration shim)
- `selectedPeriodNames: string[]` — existing field, unchanged semantics

**`hooks/useVideoActivityAssignments.ts createAssignment`** — current signature (`hooks/useVideoActivityAssignments.ts:135–181`) accepts `classId` as a positional arg. New signature replaces it with `classIds: string[]`. Writes both `classIds` and `classId = classIds[0]` to `video_activity_sessions/{id}`. No `selectedPeriodNames` — VA has no concept of local-roster periods today and we are not adding it.

### 6. Firestore rules

Per Q2's option (a): dual-write with rules fallback. Old sessions (no `classIds` field) keep working via fallback to the single `classId`.

**`quiz_sessions` `allow get`** (currently `firestore.rules:603–605`):

```
allow get: if request.auth != null &&
  (!isStudentRoleUser() ||
   passesStudentClassGateList(
     resource.data.get('classIds', [resource.data.get('classId', '')])
   ));
```

**`quiz_sessions/responses`** (currently `firestore.rules:625–627`): change `sessionClassId()` helper to return the same fallback list, and switch all `passesStudentClassGate(...)` calls in the responses rules (lines 631, 639, 649) to `passesStudentClassGateList(...)`.

**`video_activity_sessions` `allow get`** (currently `firestore.rules:741–743`): same pattern.

**`video_activity_sessions/responses`** (currently `firestore.rules:773–775`): change `vaSessionClassId()` helper and switch `passesStudentClassGate(...)` → `passesStudentClassGateList(...)` (lines 781, 790, 795).

**`guided_learning_sessions`**: unchanged. GL is out of scope for this PR.

The `passesStudentClassGateList` helper already exists at `firestore.rules:51–57` and is in production use for `mini_app_sessions`.

### 7. Type changes

**`types.ts`:**

- Add `classIds?: string[]` to `QuizSession` and `VideoActivitySession` interfaces.
- Update `QuizAssignOptions` (currently `components/widgets/QuizWidget/components/QuizManager.tsx:97–117`): drop `classId: string`, add `classIds: string[]`. `selectedPeriodNames: string[]` stays.

The mini-app session type already has `classIds`; this brings Quiz and VA in line with that shape.

### 8. Files touched

| File                                                                         | Change                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/common/AssignClassPicker.tsx`                                    | **NEW** (~200 lines)                                                                                                                                                                                                              |
| `components/widgets/QuizWidget/components/QuizManager.tsx`                   | Replace `AssignTargetClassRow` (1376–1411) and the period checkbox block in `AssignPlcSlot` (1451–1495) with a single `<AssignClassPicker mode="dual" />`. Update `handleAssignConfirm` (649–688) to pass the new options object. |
| `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx` | Replace `AssignTargetClassRow` (1091–1127) with `<AssignClassPicker mode="classlink-only" />`. Update `handleAssignConfirm` (468–497) to pass `classIds: string[]`.                                                               |
| `hooks/useQuizAssignments.ts`                                                | Change `createAssignment` (181–268) signature; write both `classIds` and `classId` per Section 5.                                                                                                                                 |
| `hooks/useVideoActivityAssignments.ts`                                       | Change `createAssignment` (135–181) signature; write both `classIds` and `classId`.                                                                                                                                               |
| `types.ts`                                                                   | Add `classIds?: string[]` to `QuizSession` and `VideoActivitySession`.                                                                                                                                                            |
| `firestore.rules`                                                            | Update `quiz_sessions` and `video_activity_sessions` `get` + responses rules per Section 6.                                                                                                                                       |
| `utils/quizDriveService.ts`                                                  | If this is where PLC sheet column headers are computed (see Section 3), update to translate `classIds` → labels via `formatClassLinkClassLabel`. Confirm location during implementation.                                          |

## Verification

Run before opening the PR:

- `pnpm run validate` (typecheck + lint + format-check + tests)
- `pnpm -C functions test`
- `pnpm run test:rules` if it covers the affected collections

Manual smoke on the dev-paul Firebase preview after deploy:

1. **Multi-class ClassLink assignment.** Teacher with 4 ClassLink classes: open Quiz → Assign → ClassLink source → select all 4 → Create. In Firebase Console, confirm the new `quiz_sessions/{id}` doc has `classIds: [4 ids]` and `classId: <first of the 4>`.
2. **ClassLink-SSO student visibility.** Sign in as a ClassLink-SSO student in class #2 of the 4. Navigate to `/my-assignments`. Confirm the new quiz appears (rules check via `passesStudentClassGateList`).
3. **Local-rosters with PLC.** Same teacher: Assign → Local rosters source → pick 2 → enable PLC → Create. Confirm session doc has `selectedPeriodNames: [2]`, no `classIds`. Confirm PLC export has 2 period columns.
4. **ClassLink with PLC.** Same teacher: Assign → ClassLink source → pick 3 → enable PLC → Create. Confirm session doc has `classIds: [3]`. Confirm PLC export has 3 columns labeled with the human-readable ClassLink class names.
5. **Empty selection fallback.** Same teacher: Assign with no classes selected (either source) → Create. Confirm session doc has `classIds: []` and no `classId`. Confirm a PIN-flow student can still join via code.
6. **VA multi-class.** Repeat scenarios 1 and 2 for Video Activity.
7. **Backward compat.** Verify an assignment created on the OLD code (with only `classId`, no `classIds`) is still visible to a ClassLink-SSO student in that class after the new rules deploy. This exercises the `resource.data.get('classIds', [resource.data.get('classId', '')])` fallback.

## Migration / rollout

- Single PR targeting `dev-paul`. Firebase rules + Firestore indexes deploy automatically on push to dev-paul.
- After CI green and the smoke tests above pass on the preview URL, open a follow-up `dev-paul → main` promotion PR.
- Cleanup PR to drop the `classId` write + rules fallback can come weeks later, untimed against the pilot. Defer until we've confirmed no pre-PR sessions remain in active use.

## Open questions deferred to implementation

- Exact location of the PLC export column-header logic (Section 8 lists `utils/quizDriveService.ts` as the likely site; confirm during implementation).
- Whether the segmented control should be promoted to `components/common/SegmentedControl.tsx` for future reuse, or kept inline in `AssignClassPicker.tsx`. Default: keep inline for this PR; promote if a second caller materializes.
