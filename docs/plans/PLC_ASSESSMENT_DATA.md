# PLC Assessment Data: reliable pooled results, merged Assessments tab, folders, action items

**Status:** approved design; PR 1 built 2026-09-10 (see §8.1); PR 2 built 2026-09-10 (see §8.2); PRs 3-4 not started
**Decided:** 2026-09-09 (grilling session with Paul; lead-teacher transcript as input)
**Target:** PRs 1 and 2 live before the 2026-09-28 PD day; PRs 3 and 4 in the same window if they fit
**Branch flow:** four sequential PRs into `dev-paul`, then `dev-paul` → `main`

## 1. Problem

The English 9 PLC assigned a quiz from their PLC page, scored it, and the Data tab shows
nothing. The cause is structural:

1. A `quiz_sessions` doc carries no PLC marker. The only marker is `QuizAssignment.plc`
   on the teacher's private `users/{uid}/quiz_assignments/{id}` doc.
2. That marker is silently dropped on read unless it contains a non-empty Google Sheet URL
   (`getValidPlcLinkage`, `hooks/useQuizAssignments.ts:582-601`; `buildPlcLinkage`,
   `utils/plcLinkage.ts:101-115`). The PLC assign modal writes `sheetUrl: ''` when the
   sheet auto-create is declined or fails.
3. Results reach the PLC only through a client-side "contribution" write fired from a
   mounted Quiz widget Results screen (`QuizResults.tsx:553-598`), never at scoring time,
   never from the server. `permission-denied` is swallowed.
4. `aggregatePlcAssessment` only runs on contribution writes, so with zero contributions
   the Data tab shows its empty state.
5. "Untitled assessment" cards are aggregates with no designated assessment doc and an
   empty question snapshot. "Designate" creates a new assessment doc, which nobody
   understands.
6. The In-progress/Completed sub-tabs read `plcs/{plcId}/assignment_index`, whose rules
   require a `docs.google.com/spreadsheets` URL, so the same empty-sheet case also
   breaks those rows.

Lead-teacher feedback on the page itself: assessments need unit folders; Data should be
"click the assessment, see the combined chart like my own results but pooled across
teachers, with per-question error frequency"; no per-teacher breakdown yet; Assessments
and Data probably should not be separate tabs; To-Dos and meeting docs duplicate each
other; standards and learning targets later.

## 2. Decisions (settled)

| #   | Decision                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | PLC linkage lives on the session: `plcId` and `syncGroupId` written to `quiz_sessions/{id}` at assign time. A Cloud Function aggregates from sessions. No client contributions.                                                               |
| D2  | Google Sheet is fully decoupled. Linkage never depends on it. Sheet export stays as an opt-in export in Results.                                                                                                                              |
| D3  | Pooled view is combined only. Per-teacher stats are kept server-side and rendered only when the PLC setting `showPerTeacher` (default off) is on.                                                                                             |
| D4  | Backfill old English 9 sessions with an admin script (dry run first, Paul approves, then one live run).                                                                                                                                       |
| D5  | The PLC assessment record is auto-created on assign with the quiz title. Designate is removed. Assessments and Data merge into one Assessments tab.                                                                                           |
| D6  | Unit folders are a real `plcs/{plcId}/folders` collection with the personal-library sidebar UX. Folders apply to PLC library quizzes; assessments inherit via `syncGroupId`.                                                                  |
| D7  | To-Dos fold into Notes & Docs as an action-items block per meeting doc plus an open-items rollup. Existing to-dos migrate into one imported doc. To-Dos tab retired.                                                                          |
| D8  | Pooled view mirrors the teacher's Results overview: team average, students counted, teachers contributing, per-question error frequency worst-first, click for choice distribution. Never student names.                                      |
| D9  | Remove the contributions collection, its rules, the Quiz widget's PLC results tab, and `assignment_index`. Replace `aggregatePlcAssessment` with a session-driven function writing the same `aggregates` collection.                          |
| D10 | Sessions pool by `syncGroupId`, fallback `quizId`. Rules require the assigning teacher to be a PLC member to write `plcId`. Only `status === 'completed'` responses count; session status is ignored.                                         |
| D11 | Freshness: debounced. Writes mark the assessment dirty; a scheduled function recomputes dirty aggregates every 5 minutes; scoring and ending a session trigger an immediate recompute.                                                        |
| D12 | Quiz widget assign dialog gets a "Share results with <PLC>" toggle per PLC the teacher belongs to (pre-checked when the quiz came from that PLC). The same action is available after the fact on any existing assignment (accidental copies). |
| D13 | Assessments tab is one list with a status badge per assessment and a filter chip; Library/In-progress/Completed sub-tabs go away.                                                                                                             |
| D14 | Roadmap items (rename Quizzes → Assessments, learning targets/standards tagging, question banks) live in their own stub docs, each starting with a grilling session. Not in this doc.                                                         |

## 3. Data model changes

### 3.1 `quiz_sessions/{id}` (new optional fields)

```ts
plcId?: string; // PLC that pools this session
syncGroupId?: string; // synced_quizzes group; pooling key (quizId when un-synced)
plcLinkedAt?: number; // assign time or retroactive link time
```

- Written in the same `writeBatch` as the assignment doc (`useQuizAssignments.ts:958-968`).
- `QuizAssignment.plc` shrinks to `{ id, name }` and is used for UI only. `sheetUrl`
  moves to `QuizAssignment.plcSheetUrl?` (opt-in export). `getValidPlcLinkage` no longer
  requires a sheet URL. `migrateLegacyAssignmentShape` maps old `plc.sheetUrl` into
  `plcSheetUrl` instead of dropping the link.

### 3.2 `plcs/{plcId}/assessments/{assessmentId}` (existing, now auto-created)

Unchanged shape (`id, title, kind, syncGroupId, unitLabel?, opensAt, dueAt, status,
createdBy, createdAt, updatedAt, deletedAt`) plus:

```ts
sourceQuizId?: string; // first quiz that created it; used for retroactive matching
folderId?: string | null; // PR 3: denormalized from the library entry
dirtyAt?: number | null; // PR 1: set by triggers, cleared by the recompute
```

Creation: on assign (PLC page or widget toggle) the client looks up a live assessment with
the same `syncGroupId`; if none, it creates one with `title = quiz.title`, `kind = 'quiz'`,
`status = 'active'`. Un-synced PLC-linked quizzes use `syncGroupId = quizId`, so the id
logic is identical everywhere. `designateAssessment` and its prompt are deleted.

### 3.3 `plcs/{plcId}/aggregates/{assessmentId}` (existing, server-written)

Add `title`, `kind`, `questionText[]`, per-question `choiceDistribution`, `sessionCount`,
`computedFromSessionIds[]`, `alignment: 'byId' | 'positional'`, `alignmentWarning?`.
Keep `perTeacher[]` (server only; UI gated by D3). Question text and options come from
`synced_quizzes/{groupId}` when present, else from the session's `publicQuestions`.

### 3.4 `plcs/{plcId}/folders/{folderId}` (PR 3, new)

Same shape as personal library folders: `{ id, name, parentId, order, createdAt,
updatedAt }`. `PlcQuizEntry` gains `folderId?: string | null`.

### 3.5 Notes (PR 4)

`PlcNote` gains `actionItems?: PlcActionItem[]` with
`{ id, text, done, assigneeUid?, dueAt?, createdBy, createdAt, doneAt? }`.
`plcs/{plcId}/todos` becomes read-only legacy and is migrated once (see PR 4).

### 3.6 Removed

- `plcs/{plcId}/contributions` (writer `utils/plcContributions.ts`, reader
  `hooks/usePlcContributions.ts`, rules `firestore.rules:2057-2119`).
- `plcs/{plcId}/assignment_index` (writer in `createAssignment`, hook
  `usePlcAssignmentIndex.ts`, rules `:1998-2050`).
- `plcs/{plcId}/assignments` templates stay (used by "Assign to my classes") but lose the
  sheet requirement.

## 4. Firestore rules

- `quiz_sessions` create/update: when `plcId` is present or changes, require
  `request.auth.uid in get(/plcs/$(plcId)).data.memberUids` and a non-empty
  `syncGroupId`. Only the session's `teacherUid` may set or clear `plcId`.
- `plcs/{plcId}/assessments`: create by `plcCanEditContent(plcId)` stays; add
  `sourceQuizId`, `folderId`, `dirtyAt` to the key lock. Clients may write `dirtyAt`
  only as `null`; the function writes real values.
- `plcs/{plcId}/aggregates`: unchanged (member read, no client writes).
- Delete the `contributions` and `assignment_index` blocks.
- `plcs/{plcId}/folders` (PR 3): member read, `plcCanEditContent` write, shape lock.
- Size: the file has about 12 KB headroom under the 256 KiB deploy cap. Two blocks removed
  and one small block added is net negative. Confirm with a rules deploy dry run.

Rules tests (`tests/rules/`) run in CI only on Paul's machine.

## 5. Cloud Functions

### 5.1 `markPlcAssessmentDirty`

- `onDocumentWritten('quiz_sessions/{sessionId}/responses/{key}')` and
  `onDocumentWritten('quiz_sessions/{sessionId}')`.
- When the session has `plcId` + `syncGroupId`: resolve the assessment id (live assessment
  with that `syncGroupId`, else `syncGroupId`) and set `assessments/{id}.dirtyAt = now`
  if not already set. Only the first write per window pays a read-modify-write.
- Immediate recompute: session transitions where `scorePublishedAt` changes, `status`
  becomes `'ended'`, or `plcId` is added or removed call the recompute directly.

### 5.2 `recomputePlcAssessments` (scheduled)

- `onSchedule('*/5 * * * *')`, `timeZone: 'America/Chicago'`, `maxInstances: 1`,
  `timeoutSeconds: 540`, `memory: '512MiB'`. Pure `runRecomputePlcAssessments(db)` for
  tests, matching `gcPlcOrphans.ts`.
- Collection-group query `assessments where dirtyAt != null`, oldest first, cap 50 per
  run. For each: `quiz_sessions where plcId == X and syncGroupId == Y` (composite index),
  read `responses where status == 'completed'`, compute, write the aggregate, clear
  `dirtyAt` only if it still equals the value read.

### 5.3 Compute

- Per question: `answered`, `correct`, `incorrectPercent`, `choiceDistribution`. Port the
  `buildDistribution` logic (`components/widgets/QuizWidget/components/monitor/monitorUtils.ts:114`)
  into a pure module shared by client and functions.
- Team average = mean of response `score` where present. Responses with `score == null`
  (unpublished grades) count for per-question stats but not for the average.
- Per teacher: `{ teacherUid, classCount, studentCount, averagePercent }`.
- Question alignment across sessions is by `questionId`. When a session's ids are not a
  subset of the group's (retroactively linked copy), align by position, set
  `alignment: 'positional'`, and set `alignmentWarning` when question counts differ.
- No de-duplication of students across teachers; documented in the view's tooltip.

### 5.4 Removed

`aggregatePlcAssessment.ts` is deleted after the backfill lands. `gcPlcOrphans.ts` drops
its contributions sweep and gains a sweep for aggregates whose assessment is tombstoned.

Dev-branch pushes deploy Functions and rules to the shared prod project. New functions
only act on sessions that carry the new fields, so old clients are unaffected.

## 6. Backfill (PR 1, `scripts/`)

`scripts/backfill-plc-sessions.mjs --plc <plcId> [--apply]`, firebase-admin with the
service-account key already used for prod reads.

1. Read `plcs/{plcId}` members.
2. For each member, scan `users/{uid}/quiz_assignments` where the raw `plc.id == plcId`
   (the field is still stored even when the client drops it) or whose
   `syncedFrom.groupId` matches a `plcs/{plcId}/quizzes` entry's `syncGroupId`.
3. Print a table: `sessionId, quizTitle, teacherEmail, syncGroupId (or quizId fallback),
completedResponses`.
4. With `--apply`: write `plcId`, `syncGroupId`, `plcLinkedAt` to `quiz_sessions/{id}`,
   create the assessment doc if missing, set `dirtyAt`. Idempotent.
5. English 9: Paul reviews the dry-run table, approves, one live run, then verify the
   Assessments tab on prod.

## 7. Client changes

### 7.1 PR 1 (pipeline)

- `createAssignment`: write session `plcId`/`syncGroupId`; drop the `assignment_index`
  and contribution writes; template write without the sheet gate.
- `PlcNewQuizAssignmentModal.tsx`: remove the sheet step from assign; sheet creation moves
  to a "Create PLC sheet" action in Results (existing export code).
- `QuizResults.tsx`: delete the auto-publish effect (553-598) and the PLC tab (1657-1689);
  keep sheet export keyed on `plcSheetUrl`.
- `PlcSharedDataBody.tsx`: read `aggregate.title`, remove designate; stays until PR 2 so
  English 9 data is visible right after PR 1 + backfill.
- `usePlcContributions.ts`, `utils/plcContributions.ts`, `PlcTab.tsx`, and the
  `AttentionCard` contribution count: removed or repointed at aggregates.

### 7.2 PR 2 (merged Assessments tab and pooled view)

- `components/plc/sections.ts`: `sharedData` becomes an alias of `assessments`; rail item
  removed; `plcDashboard.tabs.data` keys deleted from en/de/es/fr.
- `PlcAssessmentsBody.tsx` becomes one list (`PlcAssessmentList.tsx`):
  - Row: title, kind icon, status badge (`not started` = no linked sessions,
    `in progress` = any linked session without `scorePublishedAt`, `scored` = all linked
    sessions published), teachers contributing / member count, students counted, last
    computed.
  - Filter chip: All / In progress / Scored / Library only (shared but never assigned).
    Search box.
  - Row actions (editors): Assign to my classes, Rename, Move to folder (PR 3), Archive.
    Viewers: Assign only.
- Row click → `PlcAssessmentDetail.tsx` (route `/plc/{id}/assessments/{assessmentId}`):
  - Header: team average, students, teachers, last computed, `alignmentWarning` if set.
  - Body: per-question bars of % incorrect sorted worst-first with question text, same
    bar styling as `QuizResults.tsx:2150-2200`. Click a question for the choice
    distribution panel (reuse the `AnswerDistribution` rendering from
    `monitor/QuestionResults.tsx`).
  - Per-teacher table only when `showPerTeacher` is on. PLC Settings gains that toggle,
    stored as a new boolean in `Plc.features`, default false, any member can toggle
    (matches the existing flags).
  - Reads only the aggregate doc; no student names exist in it.
- "Share results with <PLC>" (D12):
  - Widget assign dialog: replaces `plcMode` + sheet URL field. One toggle per PLC from
    `usePlcs()`; pre-checked when `syncedFrom.groupId` belongs to that PLC.
  - Assignment card kebab (widget and Assignments Hub): "Share results with PLC…" opens a
    picker: PLC, then a suggested assessment (match `sourceQuizId`, then exact title,
    then "Create new"). Writes the session fields and sets `dirtyAt`. This is the fix for
    a member who accidentally assigned a plain copy instead of the PLC quiz.
  - "Stop sharing" clears the fields and dirties the assessment.
- Empty state for a PLC with no assessments: short copy plus the Assign CTA.

### 7.3 PR 3 (folders)

- Add `usePlcFolders(plcId)` wrapping the same tree and DnD components with
  `plcs/{plcId}/folders` and `plcs/{plcId}/quizzes` as the item collection. Keep the
  personal-library `useFolders` widget union closed.
- `FolderSidebar` mounted in the Assessments list; selection filters library entries and
  assessments (assessment folder = its library entry's folder via `syncGroupId`,
  denormalized to `assessments.folderId` on move).
- `unitLabel` stays as data; the dropdown filter is replaced by the folder tree. Existing
  `unitLabel` values are offered once as suggested folder names.

### 7.4 PR 4 (action items)

- Meeting notes in `NotesBody.tsx` get an "Action items" block below the markdown editor:
  checkbox, text, assignee (member picker), due date. Stored in `PlcNote.actionItems`,
  same debounced patch + OCC path as note fields.
- Notes & Docs header: "Open action items (N)" rollup across live notes, grouped by note.
- Migration: an editor visiting Notes & Docs with live `todos` docs sees a one-time
  "Import N to-dos" banner; import creates a freeform note "Imported to-dos" with them as
  action items and soft-deletes the todos. No background migration.
- `sections.ts`: `todos` becomes an alias of `docs`; `features.todos` removed from
  Settings; `TodosBody.tsx` and `usePlcTodos.ts` deleted once the import path ships.

## 8. PR checklists

### PR 1: PLC results pipeline

- [ ] `types.ts`: session, assessment, aggregate fields
- [ ] `useQuizAssignments.ts`: session linkage; drop index + contribution writes; sheet
      decoupled; legacy shape migration keeps the link
- [ ] `PlcNewQuizAssignmentModal.tsx`, `PlcQuizLibraryBody.tsx`: assign without sheet;
      auto-create assessment
- [ ] `firestore.rules`: session `plcId` membership gate; assessments key lock; delete
      contributions + assignment_index blocks; rules tests
- [ ] `functions/src/markPlcAssessmentDirty.ts` + tests
- [ ] `functions/src/recomputePlcAssessments.ts` + tests (pure `run*`)
- [ ] Shared distribution helper used by client and functions
- [ ] Composite index `quiz_sessions (plcId, syncGroupId)` in `firestore.indexes.json`
- [ ] Remove `aggregatePlcAssessment.ts`, `plcContributions.ts`, `usePlcContributions.ts`,
      `PlcTab.tsx`, the widget PLC tab, the auto-publish effect
- [ ] `PlcSharedDataBody.tsx`: title from aggregate, designate removed (interim)
- [ ] `scripts/backfill-plc-sessions.mjs` with `--apply`
- [ ] English 9 dry run reviewed by Paul, live run, prod verification
- [ ] `public/changelog.json` entry

### 8.1 PR 1 implementation notes (2026-09-10)

Deviations from the sections above, decided while building:

- The assessment record is created **server-side** by `markPlcAssessmentDirty` when a
  session carrying `plcId` is first written (doc id = the pooling key). Clients never
  write `dirtyAt` and do not auto-create; rules pin `dirtyAt` to its stored value.
- `PlcLinkage.sheetUrl` stays as an **optional** field instead of moving to
  `plcSheetUrl`; the link is valid with `id` + `name` alone.
- The `contributions` and `assignment_index` rule blocks, the `usePlcContributions` read
  hook, and `usePlcAssignmentIndex` are left for PR 2 (their readers still render). PR 1
  only removes the contribution writers, the widget PLC tab, and the old function, and
  relaxes the `assignment_index` sheet-URL requirement to allow an empty string.
- **Backfill pools by normalized title.** The English 9 dry run showed each member's
  assignment carries its own `sync.groupId` (the PLC assign modal mints a new group when
  a teacher picks their own copy), so five runs of one pre-assessment had five keys. The
  script writes one pool key per title onto the sessions: the PLC library entry's group
  when the title matches, else the largest run's group. The live assign path still pools
  by `syncGroupId`; PR 2's retroactive picker (D12) and a title-aware default in
  `PlcNewQuizAssignmentModal` (prefer the PLC library group when the picked quiz title
  matches) are needed so new assignments do not repeat the split.
- The response trigger only reads the parent session when a response's `status` or
  `score` changes, so autosave writes cost nothing.

### PR 2: merged Assessments tab and pooled view

- [ ] `sections.ts` alias + rail; locale keys in en/de/es/fr
- [ ] `PlcAssessmentList.tsx`: statuses, filter chip, search, actions
- [ ] `PlcAssessmentDetail.tsx`: header, error-frequency bars, choice distribution
- [ ] `showPerTeacher` setting + gated per-teacher table
- [ ] Widget assign toggle replacing `plcMode` + sheet field
- [ ] Retroactive "Share results with PLC…" and "Stop sharing"
- [ ] Delete `PlcSharedDataBody.tsx`, `PlcQuizzesBody.tsx` sub-tabs,
      `usePlcAssignmentIndex.ts`
- [ ] Component tests: statuses, detail from a fixture aggregate, per-teacher gating,
      retroactive link writes
- [ ] Help center article for My PLC

### 8.2 PR 2 implementation notes (2026-09-10)

- `assignment_index` and its rules block **stay** for video activities (their
  In-progress / Completed sub-tabs still read it). Only the quiz-side index write and
  the quiz sub-tabs are removed. Full removal waits until video activities pool
  server-side.
- The list's status badge reads two new aggregate fields, `linkedSessionCount` and
  `publishedSessionCount`, plus `scoredStudentCount` for the "Not scored yet" state.
  Schema-1 aggregates (until the nightly gc) show as In progress when they have
  students.
- The shared-quiz library (share, unshare, edit, versions) is reachable from the
  Assessments list through a "Manage shared quizzes" disclosure rather than a sub-tab.
- Rename and Archive are the only editor actions on a row; Move to folder arrives in
  PR 3.
- `buildPlcLinkage` no longer creates a sheet; the Classroom add-on, LTI picker, PLC
  page pickup and PLC assignment config modal all stop prompting for the Sheets scope
  at assign time. The video-activity PLC wizard keeps its opt-in sheet step (no
  server-side VA pooling yet).
- The Help Center article is authored in the admin Help Center UI (Firestore
  `help_resources`), not in the repo; the draft text is in the PR description.

### PR 3: PLC folders

- [x] `plcs/{plcId}/folders` rules + tests
- [x] `usePlcFolders(plcId)`; `PlcQuizEntry.folderId`; `assessments.folderId`
- [x] Sidebar in the Assessments list; move actions; drag and drop
- [x] `unitLabel` suggestions on first folder creation
- [x] Tests for filtering and inheritance via `syncGroupId`

### 8.3 PR 3 implementation notes (2026-09-10)

- `useFolders` is now a thin wrapper over a path-parameterized `useFolderTree`
  (`hooks/useFolderTree.ts`); `usePlcFolders(plcId)` binds it to
  `plcs/{plcId}/folders` with `quizzes` and `assessments` as the item collections.
  The personal-library widget union stays closed.
- A row's folder is `assessment.folderId ?? libraryEntry.folderId` (via `syncGroupId`);
  `moveEntry` writes both docs in one batch so the two never drift.
- The `unitLabel` field stays as data. Suggested folder chips appear only while the PLC
  has no folders; there is no unit dropdown.
- Viewers see the folder tree read-only; only `plcCanEditContent` members create, move
  or delete.

### PR 4: action items

- [x] `PlcNote.actionItems` + rules key lock
- [x] Action items block in meeting notes; rollup header
- [x] Import banner and migration; todos soft-deleted
- [x] `todos` alias, rail removal, feature flag removal, dead code deleted
- [x] Tests: OCC on action item edits, import idempotence

### 8.4 PR 4 implementation notes (2026-09-10)

- Action items render on every note kind, not only meeting notes: the imported
  to-do list lands on a freeform note titled "Imported to-dos", and the block is the
  same component either way (`components/plc/notes/NoteActionItems.tsx`).
- Edits go through the existing debounced patch + OCC path; a stale writer gets the
  same conflict toast as a body edit.
- The meeting Act step no longer spawns `todos`. `promoteMeetingActionItems` merges
  the meeting's items onto its linked meeting note (by id, so re-running is a no-op)
  and keeps the `todoId` back-link pointing at the note item.
- `usePlcTodos` survives as a read-only legacy reader plus `archiveTodos`, which the
  import banner uses to tombstone the old docs. Rules deny todo creates and allow only
  the `deletedAt` tombstone on update. Trash no longer lists todos.
- `todos` remains a section alias for `docs` so old links resolve; the feature flag
  is gone from Settings and `PlcFeatureSettings.todos` is optional/deprecated.

## 9. Verification

- Unit: `run*` with fixture sessions (multi-teacher, unpublished scores, positional
  alignment, stop sharing).
- Rules: member vs non-member `plcId` writes; retroactive link by owner only; client cannot
  set a non-null `dirtyAt`.
- Live on the dev-paul preview: two accounts in one PLC assign the same PLC quiz, students
  complete via `/quiz`, teacher A publishes scores, the Assessments row shows both
  teachers and pooled bars within five minutes.
- Prod: English 9 assessment visible with the correct title and pooled numbers after the
  backfill.

## 10. Out of scope (separate docs)

- `docs/plans/PLC_RENAME_QUIZZES_TO_ASSESSMENTS.md`
- `docs/plans/QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md` (targets, banks, per-target data)
