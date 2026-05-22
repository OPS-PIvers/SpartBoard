# Quiz/VA Settings Live on the Content — Design

**Date:** 2026-05-21
**Branch:** `feat/quiz-settings-on-content` (off `dev-paul`)
**Status:** Approved design, pre-implementation

## Problem

Today, "the quiz" (title + questions) and "how the quiz behaves when assigned"
(mode, integrity/feedback/randomization toggles, gamification, attempt limit)
are split across two places:

- **Quiz content** — title + questions — lives in Google Drive (`QuizData`),
  with `QuizMetadata` in Firestore as a pointer plus the synced-group linkage.
- **Assignment settings** (`QuizAssignmentSettings`) — configured at _Assign_
  time and stored on the per-teacher assignment doc
  (`/users/{uid}/quiz_assignments/{id}`). They are **not** part of the quiz and
  do **not** sync to PLC members.

Consequences the user hit:

1. When a PLC shares a quiz, members get identical _questions_ but each teacher
   must re-configure _settings_ independently. Everyone assumes settings are
   part of building the quiz.
2. The only way to configure full settings was the indirect "Add to my board" →
   pick class → inconspicuous "Edit all settings" hand-off to the board.
3. The PLC Assignments "Library" tab duplicates the Quiz Library and feels
   useless; "Create Quiz/Video" opens the question-authoring flow, not an
   assignment configurator.
4. In-progress assignments expose only "Open Sheet" — no Monitor, no easy data,
   and no way for another PLC member to copy a live assignment to their board.

## Goal

Make behavior settings **part of the quiz** (and video activity): authored in the
editor, saved with the content, and synced to PLC members alongside questions.
Shrink "Assign" to a thin targeting step (class periods + due date). Apply to
**both** the standalone Quiz widget and the PLC workflow, and to **both** quizzes
and video activities.

## Decisions (approved)

- **Assign-time surface:** class/period picker **+ due date** only. All behavior
  settings come from the quiz.
- **Sync model:** editing the quiz re-publishes settings + questions to every PLC
  member's copy (rides the existing version-gated publish/pull). Assignments
  already launched keep the settings they went live with (**freeze-live**).
- **Scope:** quizzes **and** video activities, together.
- **Architecture (Approach A):** behavior blob on the content's Firestore
  metadata **and** mirrored on the synced-content group doc; assign reads it
  directly (no Drive fetch).
- **"Edit in quiz" semantics:** changing a quiz's behavior affects _future_
  assigns of that quiz, and (if synced) propagates to the whole PLC. Frozen live
  assignments are unaffected.
- **PLC sheet / results aggregation:** unchanged, out of scope.

## Data Model

### New: `QuizBehaviorSettings`

```ts
interface QuizBehaviorSettings {
  sessionMode: QuizSessionMode; // 'teacher' | 'auto' | 'student'
  sessionOptions: QuizSessionOptions; // integrity/feedback/randomization toggles + gamification
  attemptLimit: number | null; // null = unlimited
}
```

Stored on:

- `QuizMetadata.behavior?` — Firestore `/users/{uid}/quizzes/{id}`. Fast read at
  list/assign time without a Drive round-trip.
- `SyncedQuizGroup.behavior?` — `/synced_quizzes/{groupId}`. Canonical copy that
  propagates to PLC members.

A `DEFAULT_QUIZ_BEHAVIOR` constant captures sensible defaults: `sessionMode:
'teacher'` (the standalone Assign flow currently forces an explicit mode choice;
baked-in settings need a concrete default, and teacher-paced is the safest),
`shuffleAnswerOptions: true` (matches the legacy always-on behavior), every other
toggle/gamification flag off, and `attemptLimit: 1`. Reads use
`quiz.behavior ?? DEFAULT_QUIZ_BEHAVIOR`.

### Video Activity parallel

`VideoActivityBehaviorSettings` on `VideoActivityMetadata.behavior?` and on the
VA synced-group doc, mirroring the quiz structure with the VA option set.

### What stays where

- **Assign-time (not on the quiz):** class/period selection (`rosterIds`,
  `periodNames`), `dueAt`, `teacherName`, PLC sheet linkage (`plc`).
- **Org-level (unchanged):** `AssignmentMode` (`'submissions' | 'view-only'`),
  frozen at assignment creation from app settings.
- **On the assignment/session docs (unchanged):** `createAssignment` still
  snapshots the full resolved `QuizAssignmentSettings` (= behavior + targeting +
  dueAt + plc) onto `/users/{uid}/quiz_assignments/{id}` and `/quiz_sessions/{id}`.
  Freeze-live falls out of this naturally — the snapshot is independent of later
  quiz edits.

### Migration

None. Default-on-read for content lacking `behavior`. Existing live assignments
are untouched. No backfill script.

## Sync

Rides the existing version-gated machinery in `useSyncedQuizGroups.ts` /
`useQuiz.ts`:

- `saveQuiz` already publishes `{ title, questions, expectedVersion }` to the
  group in a transaction. Extend the published payload to include `behavior`, and
  write `behavior` to the local `QuizMetadata` doc.
- `pullSyncedQuizContent` returns `{ title, questions, version }` → extend to
  `{ title, questions, behavior, version }`. The pull copies `behavior` into the
  member's local metadata alongside title/questions.
- VA: mirror in `createSyncedVideoActivityGroup` / its publish + pull.

Net: editing a synced quiz's settings re-publishes to every member's library
copy, exactly like questions. Version conflict handling is unchanged.

## UI Changes

### Editor gains a "Settings" tab (quiz + VA)

`QuizEditorModal` currently edits title + questions only. Add a **Settings tab**
(segmented toggle between "Questions" and "Settings" in the editor chrome). The
Settings tab hosts a new reusable **`QuizBehaviorSettingsPanel`**, extracted from
the behavior portion of `QuizAssignmentSettingsModal`:

- mode picker (`AssignModeOption[]`)
- `AssignmentSettingsToggleGroup` (integrity / feedback / randomization +
  attempt limit)
- gamification `CollapsibleSection`

The class-period block and PLC-sheet block of `QuizAssignmentSettingsModal` are
**not** moved into the editor — they belong to assign time. The editor's `onSave`
now persists `{ title, questions, behavior }`. `VideoActivityEditorModal` gets
the parallel panel.

### "Assign" shrinks to targeting (standalone widget AND PLC)

`AssignModal` usage for assigning collapses to:

- **Class/period picker** (`AssignClassPicker`)
- **Due date** (`dueAt`)
- **Share with PLC** toggle + sheet block (unchanged; relevant when assigning a
  PLC-shared quiz)
- A read-only **settings summary** line ("Teacher-paced · 1 attempt · shuffle on
  …") with an **"Edit in quiz"** link that opens the editor's Settings tab.

Mode picker, toggles, gamification, attempt limit are removed from Assign (read
from `quiz.behavior`). `createAssignment` is otherwise unchanged — it composes the
final `QuizAssignmentSettings` from `quiz.behavior` + the picker + `dueAt` + `plc`.

This applies identically to:

- Standalone Quiz widget kebab → Assign.
- PLC `PlcAssignmentConfigModal` (collapses to the same thin picker).
- PLC "author from scratch": open editor (questions + settings) → Save → thin
  Assign picker.

### In-progress assignments: monitor, data, member copy

In-progress rows get an action set (replacing "Open Sheet" only):

- **Monitor** — opens the live session monitor (owner).
- **Results / Data** — opens results (owner); PLC shared-data view already
  aggregates across members.
- **Assign to my classes** — shown to _other_ PLC members on a teammate's live
  assignment. Because settings + questions are already synced onto each member's
  library copy, this is just: take my synced copy → thin class+due-date picker →
  go live. No settings re-entry. This is the missing "copy a live assignment to
  my board".

### Per-assignment editing after launch

`QuizAssignmentSettingsModal` keeps **targeting** fields editable (class periods,
due date, PLC sheet) but renders **behavior** as a read-only summary with "Edit
in quiz" (which affects future assigns, not this frozen one). Keeps freeze-live
coherent.

## Out of Scope

- PLC sheet creation / results aggregation (unchanged).
- The broader 2026-05-20 PLC rail redesign (already landed on `dev-paul`); this
  builds on top of it.
- Any backfill/migration of existing quizzes or assignments.

## Sequencing (one branch, one PR into `dev-paul`)

1. **Types + defaults** — `QuizBehaviorSettings`, `VideoActivityBehaviorSettings`,
   `DEFAULT_*` constants; add `behavior?` to metadata + synced-group types.
2. **Sync extension** — `saveQuiz` publishes `behavior`; `pullSyncedQuizContent`
   returns + applies `behavior`; VA parallel. Unit tests for round-trip + pull.
3. **`QuizBehaviorSettingsPanel`** extracted from `QuizAssignmentSettingsModal`;
   editor Settings tab (quiz + VA). Tests.
4. **Slim the Assign modals** (standalone + PLC) to picker + due date + summary.
   Tests assert `createAssignment` receives behavior-from-quiz.
5. **In-progress actions** — Monitor / Results / "Assign to my classes". Tests.
6. **VA parallel** for any steps not already covered inline.
7. **Per-assignment edit** adjustment (behavior read-only).

Each step independently testable. Validate with `pnpm run validate`.

## Testing

- **Unit:** behavior round-trips through `saveQuiz` → metadata + group; `pull`
  applies behavior; `DEFAULT_*` on missing; `createAssignment` composes settings
  from `quiz.behavior` + picker (not from removed modal fields).
- **Component:** editor Settings tab edits + persists behavior; slim Assign modal
  renders picker + due date + summary, no behavior controls; in-progress row
  exposes Monitor/Results/Assign-to-my-classes.
- **Rules:** confirm `/synced_quizzes` and `quiz_assignments` rules accept the
  new `behavior` field (open-shape `is map` likely already passes — verify; add a
  rules test if a `hasOnly` lock exists).
