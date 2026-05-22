# Quiz/VA Settings on Content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move quiz/VA behavior settings (mode, integrity/feedback/randomization toggles, gamification, attempt limit) onto the content itself, sync them to PLC members alongside questions, and shrink "Assign" to a class + due-date picker.

**Architecture:** A `QuizBehaviorSettings` blob lives on the Firestore content metadata (`QuizMetadata.behavior`) and is mirrored on the synced-group doc (`SyncedQuizGroup.behavior`) so it propagates via the existing version-gated publish/pull. Assign reads `quiz.behavior` and snapshots it onto the assignment/session docs (freeze-live — launched assignments are unaffected by later edits). Video Activities get the exact parallel.

**Tech Stack:** React 19 + TypeScript + Vite (flat structure, `@/` = repo root), Tailwind, Firestore (+ rules + `@firebase/rules-unit-testing`), react-i18next, Vitest + Testing Library, lucide-react. Package manager: **pnpm**. Validate with `pnpm run validate`. Spec: `docs/superpowers/specs/2026-05-21-quiz-settings-on-content-design.md`.

---

## File Structure

**New files:**

```
utils/quizBehavior.ts                 DEFAULT_QUIZ_BEHAVIOR + getQuizBehavior(meta) reader
utils/videoActivityBehavior.ts        DEFAULT_VA_BEHAVIOR + getVideoActivityBehavior(meta)
components/common/library/QuizBehaviorSettingsPanel.tsx   reusable behavior editor (extracted from QuizAssignmentSettingsModal)
components/common/library/VideoActivityBehaviorSettingsPanel.tsx
tests/utils/quizBehavior.test.ts
tests/utils/videoActivityBehavior.test.ts
tests/components/common/library/QuizBehaviorSettingsPanel.test.tsx
tests/rules/syncedContentBehavior.test.ts
```

**Modified files:**

```
types.ts                              + QuizBehaviorSettings, VideoActivityBehaviorSettings; + behavior? on QuizMetadata, SyncedQuizGroup, VideoActivityMetadata, SyncedVideoActivityGroup
firestore.rules                       + 'behavior' in /synced_quizzes + /synced_video_activities hasOnly create+update lists
hooks/useSyncedQuizGroups.ts          publishSyncedQuiz + pullSyncedQuizContent + createSyncedQuizGroup carry behavior
hooks/useSyncedVideoActivityGroups.ts (VA equivalent)
hooks/useQuiz.ts                      saveQuiz publishes + persists behavior; pull applies behavior
hooks/useVideoActivity.ts             saveActivity parallel
components/widgets/QuizWidget/components/QuizEditorModal.tsx        + Settings tab mounting QuizBehaviorSettingsPanel
components/widgets/VideoActivityWidget/.../VideoActivityEditorModal.tsx  + Settings tab
components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx  behavior fields become read-only summary
components/common/library/AssignModal usage in QuizWidget assign + PlcAssignmentConfigModal   slim to picker + due date + summary
components/plc/.../PlcAssignments*SubTab (in-progress)              + Monitor / Results / "Assign to my classes"
```

> **Reuse (verbatim contracts gathered from the codebase):**
>
> - `QuizSessionMode = 'teacher' | 'auto' | 'student'` (types.ts:2376), `QuizSessionOptions extends BaseSessionOptions` (types.ts:2410), `QuizAssignmentSettings` already has `dueAt?: number | null` (types.ts:3118).
> - `AssignmentSettingsToggleGroup`, `CollapsibleSection`, `ToggleRow`, `AssignModal`, `AssignModeOption` are exported from `@/components/common/library`.
> - `AssignClassPicker` props `{ rosters, value: AssignClassPickerValue, onChange, disabled? }` + `makeEmptyPickerValue()`.
> - `publishSyncedQuiz(groupId, { title, questions, expectedVersion, uid })` (useSyncedQuizGroups.ts:246); `pullSyncedQuizContent(groupId) → { title, questions, version }` (:188); `createSyncedQuizGroup({ groupId, uid, title, questions, plcId? })` (:215).
> - `createAssignment(quizRef: AssignmentQuizRef, settings: QuizAssignmentSettings, options?: CreateAssignmentOptions)` (useQuizAssignments.ts:648).

---

## WAVE 1 — Foundation (types, rules, sync)

### Task 1: Behavior types + defaults (quiz + VA)

**Files:** Modify `types.ts`; Create `utils/quizBehavior.ts`, `utils/videoActivityBehavior.ts`; Test `tests/utils/quizBehavior.test.ts`, `tests/utils/videoActivityBehavior.test.ts`

- [ ] **Step 1: Add types to `types.ts`** (insert after `QuizSessionOptions`, ~line 2415):

```ts
/**
 * Behavior settings that travel WITH a quiz (authored in the editor, synced
 * to PLC members). Distinct from per-assignment targeting (class periods,
 * dueAt) which is chosen at Assign time. Snapshotted onto the assignment/
 * session docs at create time, so editing these later only affects FUTURE
 * assigns (freeze-live).
 */
export interface QuizBehaviorSettings {
  sessionMode: QuizSessionMode;
  sessionOptions: QuizSessionOptions;
  /** null = unlimited; positive int = hard cap. */
  attemptLimit: number | null;
}
```

Add `behavior?: QuizBehaviorSettings;` to `QuizMetadata` (after `sync?`, ~line 2372) and to `SyncedQuizGroup` (after `questions`, ~line 3242). Add the VA counterpart after `VideoActivitySessionOptions` (~line 3520):

```ts
/** VA counterpart of QuizBehaviorSettings. */
export interface VideoActivityBehaviorSettings {
  sessionMode: QuizSessionMode;
  sessionOptions: VideoActivitySessionOptions;
  attemptLimit: number | null;
}
```

Add `behavior?: VideoActivityBehaviorSettings;` to `VideoActivityMetadata` (~3435) and `SyncedVideoActivityGroup` (after `questions`, ~3319).

- [ ] **Step 2: Write failing test `tests/utils/quizBehavior.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_QUIZ_BEHAVIOR, getQuizBehavior } from '@/utils/quizBehavior';
import type { QuizMetadata } from '@/types';

describe('getQuizBehavior', () => {
  it('returns DEFAULT_QUIZ_BEHAVIOR when metadata has no behavior', () => {
    const meta = {
      id: 'q1',
      title: 'T',
      driveFileId: 'd',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    } as QuizMetadata;
    expect(getQuizBehavior(meta)).toEqual(DEFAULT_QUIZ_BEHAVIOR);
  });
  it('returns the stored behavior when present', () => {
    const behavior = {
      sessionMode: 'student' as const,
      sessionOptions: { shuffleQuestions: true },
      attemptLimit: null,
    };
    const meta = {
      id: 'q1',
      title: 'T',
      driveFileId: 'd',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
      behavior,
    } as QuizMetadata;
    expect(getQuizBehavior(meta)).toEqual(behavior);
  });
  it('DEFAULT has teacher mode, attemptLimit 1, shuffleAnswerOptions on', () => {
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionMode).toBe('teacher');
    expect(DEFAULT_QUIZ_BEHAVIOR.attemptLimit).toBe(1);
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionOptions.shuffleAnswerOptions).toBe(
      true
    );
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `pnpm exec vitest run tests/utils/quizBehavior.test.ts` (module not found).

- [ ] **Step 4: Implement `utils/quizBehavior.ts`:**

```ts
import type { QuizBehaviorSettings, QuizMetadata } from '@/types';

export const DEFAULT_QUIZ_BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'teacher',
  sessionOptions: {
    tabWarningsEnabled: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    showPodiumBetweenQuestions: false,
    soundEffectsEnabled: false,
  },
  attemptLimit: 1,
};

export function getQuizBehavior(
  meta: Pick<QuizMetadata, 'behavior'>
): QuizBehaviorSettings {
  return meta.behavior ?? DEFAULT_QUIZ_BEHAVIOR;
}
```

- [ ] **Step 5: Implement `utils/videoActivityBehavior.ts`** — same shape with `DEFAULT_VA_BEHAVIOR` (sessionMode `'teacher'`, the VA `sessionOptions` defaults that the current VA assign modal uses, `attemptLimit: 1`) and `getVideoActivityBehavior(meta)`. Write the parallel `tests/utils/videoActivityBehavior.test.ts`.

- [ ] **Step 6: Run both util tests + type-check, expect PASS** — `pnpm exec vitest run tests/utils/quizBehavior.test.ts tests/utils/videoActivityBehavior.test.ts && pnpm run type-check`.

- [ ] **Step 7: Commit** — `git commit -m "feat(quiz): QuizBehaviorSettings + VA behavior types and defaults"`

### Task 2: Allow `behavior` on synced-group rules

**Files:** Modify `firestore.rules`; Test `tests/rules/syncedContentBehavior.test.ts`

- [ ] **Step 1: Write failing rules test** (mirror an existing `tests/rules/*.test.ts` harness; reuse its env + seed helpers). Seed a `/synced_quizzes/g1` doc with the caller as the sole participant, then assert a member can `update` with a `behavior` map and `version+1`:

```ts
import { describe, it, beforeAll, afterAll } from 'vitest';
import { assertSucceeds } from '@firebase/rules-unit-testing';
// reuse testEnv + authedDb(uid) helpers from an existing rules test file

describe('/synced_quizzes behavior field', () => {
  it('participant can publish a behavior field with version+1', async () => {
    // seed g1: { id:'g1', version:1, title:'T', questions:[], participants:{u1:{joinedAt:1}}, createdAt:1, updatedAt:1, updatedBy:'u1' }
    // as u1: update g1 -> { ...same, version:2, behavior:{ sessionMode:'teacher', sessionOptions:{}, attemptLimit:1 }, updatedAt:2, updatedBy:'u1' }
    // await assertSucceeds(update)
  });
});
```

Add the same for `/synced_video_activities/g1`.

- [ ] **Step 2: Run, expect FAIL** — `pnpm run test:rules` (see CLAUDE.md / memory: needs `TEMP/TMP=C:/Temp` + Java 21). Expected: permission-denied (behavior not in `hasOnly`).

- [ ] **Step 3: Edit `firestore.rules`** — add `'behavior'` to BOTH the create (line ~1124) and update (line ~1147) `hasOnly([...])` lists in the `/synced_quizzes/{groupId}` block, and type-guard it. After the `version` checks add:

```javascript
        && (!('behavior' in request.resource.data) || request.resource.data.behavior is map)
```

Repeat for `/synced_video_activities/{groupId}` (block at ~line 1182). Keep the `participants` immutability and `version+1` invariants untouched.

- [ ] **Step 4: Run, expect PASS** — `pnpm run test:rules`.

- [ ] **Step 5: Commit** — `git commit -m "feat(rules): allow behavior field on synced quiz + VA group docs"`

### Task 3: Sync publishes + pulls behavior (quiz)

**Files:** Modify `hooks/useSyncedQuizGroups.ts`; Test `tests/hooks/useSyncedQuizGroups.test.ts` (extend if exists, else create)

- [ ] **Step 1: Write failing test** — assert `publishSyncedQuiz` includes `behavior` in the transaction update and `pullSyncedQuizContent` returns it. Mock Firestore (`runTransaction`/`getDoc`) per the existing hook-test pattern:

```ts
// behavior round-trips through publish + pull
// publish: tx.update called with object containing behavior
// pull: returns { title, questions, behavior, version }
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** — in `useSyncedQuizGroups.ts`:
  - Add `behavior?: QuizBehaviorSettings;` to `PublishSyncedQuizInput` (line ~41) and import the type.
  - In `publishSyncedQuiz` `tx.update(ref, {...})` (line ~281) add `...(input.behavior ? { behavior: input.behavior } : {})`.
  - In `createSyncedQuizGroup` payload (line ~223) add `...(input.behavior ? { behavior: input.behavior } : {})` and add `behavior?` to its input type.
  - Change `pullSyncedQuizContent` return type (line ~190) to `{ title; questions; behavior?: QuizBehaviorSettings; version }`, widen the `Pick` to include `'behavior'`, and return `behavior: data.behavior`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(quiz): synced-quiz publish/pull carry behavior settings"`

### Task 4: `saveQuiz` persists + publishes behavior; pull applies it

**Files:** Modify `hooks/useQuiz.ts`; Test `tests/hooks/useQuiz.test.ts`

- [ ] **Step 1: Read `useQuiz.ts` `saveQuiz` (~189-261) and its synced-pull path.** Confirm the exact `QuizMetadata` write site and the `publishSyncedQuiz` call site.

- [ ] **Step 2: Write failing test** — `saveQuiz(quiz, driveId, behavior)` writes `behavior` onto the `/users/{uid}/quizzes/{id}` metadata doc AND forwards it to `publishSyncedQuiz` when the quiz is synced; the pull path writes the pulled `behavior` to local metadata.

- [ ] **Step 3: Implement** — extend `saveQuiz`'s signature to accept the current `behavior` (thread from the editor; default `getQuizBehavior` of the existing meta when omitted so non-editor callers preserve it). Add `behavior` to the metadata `setDoc` payload and to the `publishSyncedQuiz` input. In the pull path, set `behavior` from `pullSyncedQuizContent` onto the metadata write.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(quiz): saveQuiz persists + syncs behavior; pull applies it"`

### Task 5: VA sync + saveActivity parallel

**Files:** Modify `hooks/useSyncedVideoActivityGroups.ts`, `hooks/useVideoActivity.ts`; matching tests.

- [ ] **Step 1–5:** Mirror Tasks 3–4 for Video Activities (publish/pull/create carry `behavior`; `saveActivity` persists + publishes; pull applies). Same TDD cadence. Commit `git commit -m "feat(va): synced VA + saveActivity carry behavior settings"`.

---

## WAVE 2 — Editor authoring

### Task 6: Extract `QuizBehaviorSettingsPanel`

**Files:** Create `components/common/library/QuizBehaviorSettingsPanel.tsx`; Test `tests/components/common/library/QuizBehaviorSettingsPanel.test.tsx`. Modify `components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx` to consume it (no behavior change).

- [ ] **Step 1: Write failing test** — panel renders the mode picker + integrity/feedback/randomization toggles + attempt limit + gamification; editing a toggle calls `onChange` with the updated `QuizBehaviorSettings`. Mock i18n.

```tsx
const onChange = vi.fn();
render(
  <QuizBehaviorSettingsPanel
    value={DEFAULT_QUIZ_BEHAVIOR}
    onChange={onChange}
  />
);
fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({ sessionMode: 'student' })
);
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `QuizBehaviorSettingsPanel`** — props `{ value: QuizBehaviorSettings; onChange: (next: QuizBehaviorSettings) => void; modeLocked?: boolean }`. Move the mode-selector + `AssignmentSettingsToggleGroup` + gamification `CollapsibleSection` JSX out of `QuizAssignmentSettingsModal` (lines ~298-366 + mode selector) into this panel, driven by the `QuizBehaviorSettings` shape (not the flattened `SettingsOptions`). `shuffleQuestionsAvailable = value.sessionMode === 'student'`.

- [ ] **Step 4: Refactor `QuizAssignmentSettingsModal`** to render `<QuizBehaviorSettingsPanel>` for the behavior portion, keeping its class-period + PLC slots. Existing `QuizAssignmentSettingsModal.test.tsx` must still pass (1:1 behavior preserved).

- [ ] **Step 5: Run, expect PASS** — `pnpm exec vitest run tests/components/common/library/QuizBehaviorSettingsPanel.test.tsx tests/components/widgets/QuizAssignmentSettingsModal.test.tsx`.

- [ ] **Step 6: Commit** — `git commit -m "refactor(quiz): extract QuizBehaviorSettingsPanel from settings modal"`

### Task 7: Quiz editor Settings tab

**Files:** Modify `components/widgets/QuizWidget/components/QuizEditorModal.tsx` + its parent save wiring in `QuizWidget/Widget.tsx`; Test the editor.

- [ ] **Step 1: Read `QuizEditorModal.tsx` fully** to confirm chrome + `onSave` shape.
- [ ] **Step 2: Write failing test** — editor shows "Questions" / "Settings" segmented control; switching to Settings renders `QuizBehaviorSettingsPanel`; saving calls `onSave({ ...quiz, behavior })`.
- [ ] **Step 3: Implement** — add `editorTab` state (`'questions' | 'settings'`), a segmented toggle in the editor chrome, mount `QuizBehaviorSettingsPanel` (seeded from `getQuizBehavior(meta)` for existing quizzes, `DEFAULT_QUIZ_BEHAVIOR` for new). Extend `onSave` to pass `behavior`; thread it to `saveQuiz(quiz, driveId, behavior)` in `Widget.tsx`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(quiz): edit behavior settings in the quiz editor"`

### Task 8: VA editor Settings tab

- [ ] Mirror Task 6–7 for `VideoActivityEditorModal` + `VideoActivityBehaviorSettingsPanel`. Commit `git commit -m "feat(va): edit behavior settings in the video activity editor"`.

---

## WAVE 3 — Slim Assign + in-progress actions

### Task 9: Slim the standalone Quiz Assign flow

**Files:** Modify `components/widgets/QuizWidget/Widget.tsx` assign handler + the `AssignModal` it renders for assigning; reuse `getQuizBehavior`.

- [ ] **Step 1: Read the QuizWidget assign entry** (the kebab → AssignModal `onAssign`, ~Widget.tsx:1057-1360).
- [ ] **Step 2: Write failing test** — the assign modal renders the class picker + a due-date input + a read-only behavior summary, and NO mode/toggle/gamification/attempt controls; confirming calls `createAssignment` with `settings.sessionMode/sessionOptions/attemptLimit` sourced from `getQuizBehavior(meta)` and `dueAt` from the input.
- [ ] **Step 3: Implement** — remove the behavior controls from the assign `AssignModal` usage; render a summary line + "Edit in quiz" button (opens `QuizEditorModal` Settings tab); add a `dueAt` date input; compose the `QuizAssignmentSettings` from `getQuizBehavior(meta)` + picker + `dueAt` + PLC slot. `createAssignment` call is otherwise unchanged.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(quiz): Assign is now a class + due-date picker; behavior comes from the quiz"`

### Task 10: Slim the PLC assign flow

**Files:** Modify `components/plc/assignments/PlcAssignmentConfigModal.tsx` (and `PlcNewQuizAssignmentModal` if still wired).

- [ ] **Step 1–5:** Same slimming as Task 9 inside the PLC config modal — picker + due date + behavior summary; settings sourced from the PLC quiz's synced `behavior`. Tests assert no behavior controls + correct `createAssignment` composition. Commit `git commit -m "feat(plc): PLC assign collapses to class + due-date picker"`.

### Task 11: In-progress row actions (Monitor / Results / Assign-to-my-classes)

**Files:** Modify the in-progress sub-tab (`components/plc/.../PlcAssignmentsInProgressSubTab.tsx`) + standalone assignment archive row if applicable.

- [ ] **Step 1: Read the in-progress sub-tab + the existing Monitor/Results entry points** (how the board opens monitor/results for an assignment).
- [ ] **Step 2: Write failing test** — an in-progress row owned by the viewer shows Monitor + Results actions; a row owned by another PLC member shows "Assign to my classes" which opens the slim assign picker for the viewer's synced copy of that quiz.
- [ ] **Step 3: Implement** — add the action buttons; wire Monitor/Results to the existing session monitor/results views; wire "Assign to my classes" to: resolve the viewer's local synced copy of the quiz (join the PLC quiz sync group if not yet joined via `callJoinPlcQuizSyncGroup`), then open the slim assign picker (Task 9/10 component). No settings re-entry — behavior comes from the synced quiz.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(plc): in-progress assignments expose Monitor, Results, and member copy"`

### Task 12: Per-assignment edit — behavior read-only

**Files:** Modify `components/widgets/QuizWidget/components/QuizAssignmentSettingsModal.tsx`.

- [ ] **Step 1: Write failing test** — for a launched assignment, the behavior section renders as a read-only summary with an "Edit in quiz" affordance; class periods + due date + PLC sheet remain editable; `onSave` patch no longer includes `sessionMode`/`sessionOptions`/`attemptLimit`.
- [ ] **Step 2: Run FAIL → implement** — replace the editable `QuizBehaviorSettingsPanel` in this modal with a read-only summary + "Edit in quiz" link; drop behavior fields from the save patch (keep `className`, `periodNames`, `dueAt`, `plc`). → PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(quiz): launched-assignment settings show behavior read-only (freeze-live)"`

---

## WAVE 4 — Validation

### Task 13: Full validation + manual checklist

- [ ] **Step 1:** `pnpm run validate` (type-check:all + lint --max-warnings 0 + format:check + tests + functions tests). Fix all failures. (Per memory: run type-check + lint + format:check before any push.)
- [ ] **Step 2: Manual verification on dev preview (push `dev-paul`-based branch → dev auto-deploy):**
  - Create a quiz → editor has Questions/Settings tabs; set mode + toggles + attempt limit; Save.
  - Share quiz with a PLC; second account sees identical questions AND settings; editing settings on one account re-syncs to the other's library copy.
  - Click Assign → only class picker + due date + a behavior summary (no mode/toggle controls); assign goes live with the quiz's settings.
  - Edit the quiz's settings AFTER a live assignment exists → the live assignment is unchanged; a NEW assign uses the new settings.
  - In-progress assignment row → Monitor + Results work; on a teammate's row, "Assign to my classes" opens the slim picker and goes live with no settings re-entry.
  - Repeat the create/share/assign path for a Video Activity.
- [ ] **Step 3: Commit any fixes; open PR into `dev-paul`.**

---

## Self-Review

**1. Spec coverage:**

- Settings become part of the quiz/VA → Tasks 1, 7, 8. ✓
- Sync to PLC members (freeze-live) → Tasks 2–5 (publish/pull + rules); freeze-live falls out of `createAssignment` snapshot (unchanged). ✓
- Assign = class + due date → Tasks 9, 10. ✓
- In-progress Monitor/Data/member-copy → Task 11. ✓
- Per-assignment behavior read-only → Task 12. ✓
- Both quiz + VA → Tasks 5, 8, 10/11 cover VA parallels. ✓
- Default-on-read migration → Task 1 (`getQuizBehavior`/`DEFAULT_*`). ✓

**2. Placeholder scan:** No "TBD/implement later". Tasks 5, 8, 10 explicitly say "mirror Task N" AND name the files + the parallel functions, which is actionable for a VA that is a line-for-line counterpart (the rules comment at firestore.rules:1167 confirms VA mirrors quiz "line-for-line"). Steps that modify existing code begin with a "read the current code" step because the exact body must be confirmed in-file (the surrounding code wasn't fully inlined here to avoid drift).

**3. Type consistency:** `QuizBehaviorSettings { sessionMode, sessionOptions, attemptLimit }` is used identically in `QuizMetadata.behavior`, `SyncedQuizGroup.behavior`, `PublishSyncedQuizInput.behavior`, `getQuizBehavior`, `QuizBehaviorSettingsPanel`, and the assign composition. `dueAt` already exists on `QuizAssignmentSettings` (types.ts:3118) so no new field is needed for it. `createAssignment` signature is unchanged — only the source of `settings` changes.
