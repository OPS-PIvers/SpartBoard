# Quiz assignment Class Picker follow-ups

Deferred from the PR #1541 review (dev-paul). Not a correctness bug today; surfaced as a UX/data-model parity gap between the assignment-create modal and the edit-in-progress modal. Worth picking up before the next round of changes to either modal.

## 1. Unify Class Periods control across create + edit modals

**Where:**

- `components/widgets/QuizWidget/components/QuizManager.tsx` — `AssignExtraSlot` renders `<AssignClassPicker rosters={rosters} value={options.picker} onChange={…} />` (unified roster picker, multi-select with Select All / Clear All, ClassLink badges, smart filtering of rosters with `loadError`).
- `components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx` — `extraSlot` renders an inline checkbox list against `options.selectedPeriodNames` (period-name strings), with a comma-separated text-input fallback when `rosters.length === 0`.

**What:** The two modals look and feel different for the same conceptual task. Teachers switching between create and edit see two different pickers (different visuals, different affordances, different data shape). The edit modal also loses the smart roster filtering and the Select-All affordance that the create flow gets for free.

**Fix sketch:** swap the edit modal's inline checkbox block for `<AssignClassPicker>`. Requires hydrating an `AssignClassPickerValue` (roster IDs) from the assignment's stored period names — see follow-up #2 for the cleanest version.

**Trigger to do it:** next non-trivial change to either modal's class-targeting UX, or whenever follow-up #2 lands.

**Origin:** Reviewer 2 major #1 on PR #1541.

## 2. Migrate quiz assignments from `periodNames[]` to `rosterIds[]`

**Where:**

- `types.ts` — `QuizAssignment.periodName` / `QuizAssignment.periodNames` are the source of truth for class targeting on existing assignments.
- `components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx` — `initialOptionsFor` reads `a.periodNames`; `handleAssign` writes `periodName` + `periodNames` back into the patch.
- `hooks/useQuizAssignments.ts` — assignment creation persists from the create-modal's roster IDs via `resolveAssignmentTargets`, which dedups period names. The edit modal does not run that resolver — it round-trips the names verbatim.

**What:** The create modal already operates in roster-ID space (the unified picker emits `rosterIds: string[]`); names are derived at write-time. The edit modal stores and round-trips human-readable period names, so renaming a roster or losing a roster ID leaves the assignment's `periodNames` stale with no automatic recovery, and the inline checkbox list has to do its own ad-hoc roster→name matching to recover the selection on open.

**Fix sketch:** add `rosterIds[]` to the assignment shape (alongside `periodNames[]` for back-compat read-time); have the edit modal hydrate the picker from `rosterIds` and re-derive `periodNames` on save via `resolveAssignmentTargets`. Once everything writes both fields, drop the read-side fallback to `periodNames`.

**Trigger to do it:** next time we touch assignment-targeting logic (e.g. PLC sharing changes, ClassLink resync) — easier to land alongside another targeting change than as a standalone migration. Follow-up #1 wants to depend on this.

**Origin:** Reviewer 2 major #2 on PR #1541.
