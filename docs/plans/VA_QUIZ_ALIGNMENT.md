# Video Activity aligned with Quiz: inventory and slices

Request (Paul, 2026-10-28): the Video Activity (VA) assign flow and question creation should match Quiz, with the video scrubber as the only VA-specific difference (pick each question's time in the video).

Code read on `origin/dev-paul` at 459d5a34. No open PRs touch VA or Quiz editor files today (checked 2026-10-28 20:10Z). Out of scope: VA monitor and Results (already match Quiz, #4611/#4616).

## Where VA stands today

**Assign.** VA already uses the shared stepper shell (`components/common/library/assignStepper/VideoAssignStepper.tsx`): pacing switch (with `video-activity-live`), Classes (student picks, Modifications), When (Manual/Scheduled, availability), Sharing. What is legacy:

1. **Rules live on the activity, not the assignment.** Attempts, focus mode, tab-switch auto-submit, away auto-submit, shuffle answers, right/wrong, correct answer, score visibility are edited on the editor's **Settings** tab (`VideoActivityBehaviorSettingsPanel`, stored as `VideoActivityMetadata.behavior`, synced to PLC). Quiz moved these to the assignment in QUIZ_REVIEW_SPLIT, whose D29 left "a matching VA cleanup" as follow-up. This is that follow-up.
2. **Player rules live in the widget settings drawer, per board.** Autoplay, "require correct answer" (rewind to the previous question on a wrong answer), and allow skipping are `VideoActivityConfig` keys (`settings.schema.ts`) copied onto each session as `session.settings`. A teacher can't tell from Assign which ones apply.
3. **No "Settings" on an assigned activity.** Quiz has Settings on active and archived assignments (`QuizAssignmentSettingsModal`, same steps with Save). VA has none.
4. **No last-used rules.** VA only remembers pacing (`lastVideoAssignPacing`). Quiz prefills every rule from `lastQuizAssignSettings`.
5. **Other assign surfaces show a read-only summary** of the activity's rules: PLC new VA assignment (`PlcNewVideoActivityAssignmentModal`, already on the stepper shell), PLC config/authoring (`PlcAssignmentConfigModal`, `PlcAuthorVideoActivityModal`), Schoology LTI picker, Classroom add-on.

**Settings that do nothing today** (found while checking what the student player reads):

| Setting                                               | Where           | What the player actually does                                                |
| ----------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| Show right and wrong to students                      | editor Settings | always shows Correct/Incorrect after each answer                             |
| Reveal correct answer                                 | editor Settings | always marks the correct option after grading                                |
| Show correct on board                                 | editor Settings | not read by VA anywhere                                                      |
| Shuffle answer options                                | editor Settings | options are always shuffled, once per session (same order for every student) |
| Per-question Time Limit                               | question editor | not read by the player                                                       |
| `rewindOnIncorrectSeconds`, `pointPenaltyOnIncorrect` | types only      | no UI; live forces 0                                                         |

**Question editor today** (`VideoActivityEditorModal` / `VideoActivityEditor.tsx`): Questions and Settings tabs. Left pane: YouTube URL, Timeline (player plus scrubber, question markers you drag to move, "+" at the playhead adds a question there), question pills. Right pane: prompt, learning targets (`TargetsField`), type as three buttons (Multiple Choice / Fill in the Blank / Multi-Answer), Timestamp MM:SS, Time Limit, Points, then MC correct + distractors, FIB answer + "accepted variants" textarea, MA option checkboxes + partial credit. Questions auto-sort by time; duplicate times are nudged a second at save. Draft with AI (counts per type, from the video), autosave, folder field.

**Quiz question editor** (`QuizEditorModal` / `QuizEditor.tsx`): Questions / Stimuli / Languages tabs. Left pane: question list rows (drag handle, checkbox, number, type badge, "Needs answer", target chips, Duplicate, Delete), bulk bar (Tag, Save to bank, Delete, Clear), Draft with AI, Add with menu (Blank question, Section, From question bank). Right pane: prompt (+ Blank for FIB, standards auto-tag from the prompt with Undo), Learning targets (Add/Edit, `TargetPicker`), one row of Type select (MC with "multiple correct" = MA) / Time Limit / Points, Partial credit, `ChoiceOptionsEditor` (MC and choose-all in one list), `FibBlanksEditor` + `AlternateAnswersEditor`, Matching/Ordering editors, free-response fields, rubric, stimulus.

## Gaps, and what VA keeps

**Bring to VA (the alignment):** rules as assign steps with last-used prefill; Settings on an assigned activity; Quiz's question list rows, bulk select/tag/delete, Duplicate; Quiz's right-pane fields and answer editors (Type select, `ChoiceOptionsEditor`, `AlternateAnswersEditor`, prompt standards auto-tag).

**VA keeps (teachers use these):** YouTube search / paste / Recommend in the Creator; Timeline scrubber, marker drag, add at the playhead; questions ordered by time (no drag reorder: time is the order); MA partial credit; AI draft from the video; spreadsheet import; live mode (rules steps hidden there, as live forces 1 attempt today); view-only share; Assign to Google Classroom; PLC sync; Claude review badge; autoplay / rewind on wrong / allow skipping (move into the stepper, below).

**Quiz features that don't fit a video and stay out:** Sections, question banks and bank slots, Stimuli tab, paper print/import, printed numbers, Review/game mode, time limit for the whole activity, shuffle questions (time order), quote from passages. Languages (translation, read aloud) could come later; not in this plan.

**Open (decision card to Paul):** Matching, Ordering and written (free-response) questions in VA. Each needs player, grader (`functions/src/videoActivityGrade.ts` + cases.json), results and, for written, teacher grading. Recommendation: not in this plan; a later plan if wanted.

## Decisions (recommended defaults; build these unless Paul says otherwise)

- **V1. One admin preview flag** `va-quiz-alignment` (GlobalFeature, `defaultAccessLevel: 'admin'`, `stage: 'preview'`, `afterLaunch: 'retire'`, `widget: 'video-activity'`, Previews row label "Video Activity matches Quiz"). Flag off: everything exactly as today.
- **V2. Rules belong to the assignment.** Flag on: the editor has no Settings tab; the stepper gets Attempts and order, Video, Integrity, What students see. `VideoActivityMetadata.behavior` is kept and passed through untouched (flag-off PLC teammates and old tabs still read it), as Quiz did.
- **V3. Prefill order:** last-used VA rules (`lastVideoAssignSettings` on `users/{uid}/userProfile/profile`), else the activity's saved `behavior` if it has one, else defaults. This differs from Quiz (last-used only) so a teacher who set 3 attempts on an activity doesn't silently get 1. Classes, dates, modifications are never remembered (ASSIGN_STEPPER D12).
- **V4. Player rules move into the stepper** as a VA-only "Video" step: Allow skipping ahead, Rewind on a wrong answer, Autoplay after a question. Flag on: the three rows leave the widget settings drawer; the first assign prefills from that board's widget values when there is no last-used.
- **V5. Only rows the player honors appear.** Integrity: Focus mode with its two auto-submit rows. Attempts and order: Attempts allowed, Shuffle answer options. What students see: Show right and wrong, Reveal correct answer. Slice 5 makes those three (shuffle, right/wrong, reveal) real; until it merges the rows stay hidden. Absent fields keep today's behavior, so old sessions don't change.
- **V6. Per-question Time limit:** hidden in the VA editor (flag on) until a player slice enforces it; recommend dropping it rather than enforcing (pausing a video on a countdown is new behavior nobody asked for).
- **V7. Storage stays VA's.** VA questions keep `acceptableVariants` and one blank per FIB; an adapter maps to and from the Quiz editor props (`alternateAnswers`). No grader, rules or Drive-shape change for the editor work. Quiz's "Needs answer" and validation run on the adapted question.
- **V8. The scrubber link:** picking a question in the list seeks the video to it; the right pane has "Time in video" (MM:SS) with "Use current time"; Add adds at the playhead, as "+" does today.

New wording needing Paul's OK (prototype strings, list in each slice PR): "Video" (step), "Allow skipping ahead", "Rewind on a wrong answer", "Autoplay after a question", "Time in video", "Use current time", Previews label "Video Activity matches Quiz" and its description "Video Activity questions and assign rules work like Quiz."

## Shared rules for every slice

- Branch from `origin/dev-paul`, PR into `dev-paul`, subscribe, merge when green (standing grant). Don't spawn sub-agents for other slices.
- Every change renders only with `canAccessFeature('va-quiz-alignment')`; flag off is byte-for-byte today's UI and session writes. Existing VA assignments, sessions and student results must not change: no migration, no rule tightening, absent fields mean today's behavior.
- Reuse Quiz components; extract, don't copy. Extractions leave Quiz looking and behaving the same (before/after shots of Quiz too).
- Real-app before/after screenshots; VA harness states exist on `/session-views-dev` and `/assign-stepper-dev` (`VideoAssignStepper.dev.tsx`).
- Tour anchors: carry existing `video-activity.editor-*` ids over to the moved controls; new controls get anchors in `config/tourAnchors.ts`; check `config/tourAnchorsInUse.json`.
- Scoped checks only (CLAUDE.md): `pnpm exec vitest related --run <files>`.

## Slices

### 1. Flag and shared question fields (foundation)

Register `va-quiz-alignment` (V1: `types.ts`, `config/featureDefaults.ts`, `functions/src/featureMissingDoc.ts`). Extract from `QuizEditorDetailPane` into `components/widgets/QuizWidget/components/QuestionFields.tsx` the pieces VA needs, each taking `(question, onChange)`: prompt field (with FIB Blank and the prompt-standards auto-tag), learning targets field, the Type select with a `types` prop plus the pure `questionTypeChangeUpdates`, the needs-answer notice, and the one-answer FIB field with Other accepted answers (`ChoiceOptionsEditor` is already standalone). Quiz renders through them unchanged. Add `utils/vaQuestionAdapter.ts` (V7) with round-trip tests. No VA UI yet.
Owns: `QuizEditor.tsx` (detail pane extraction), `QuestionFields.tsx`, the adapter, flag registry lines. Depends on: nothing.

### 2. VA editor on the Quiz layout

Behind the flag in `VideoActivityEditorModal`: left pane keeps URL + Timeline on top, then the Quiz question list (rows show MM:SS where Quiz shows the drag handle; checkbox, type badge, Needs answer, target chips, Duplicate, Delete; bulk Tag / Delete / Clear; Draft with AI; Add at the playhead). Right pane uses slice 1's fields (types MC, Multiple choice with several correct, FIB; no Time limit, V6) plus "Time in video" with "Use current time" (V8). Settings tab stays until slice 4 merges. Also `PlcVideoActivitiesBody` and `PlcAuthorVideoActivityModal` editors (same modal, nothing extra).
Owns: `VideoActivityEditorModal.tsx`, `VideoActivityEditor.tsx`, `useVideoActivityEditorState.ts`, `Timeline.tsx` (seek API only). Depends on: 1.

### 3. VA rule step bodies

VA variants of the Quiz rule steps (V4, V5): pass an `activity: 'video'` to `QuizAttemptsStep` / `QuizIntegrityStep` / `QuizFeedbackStep` (or VA wrappers) to hide rows VA doesn't honor, a new `VideoPlaybackStep` ("Video"), formatters, a `VideoActivityBehaviorSettings` + player-settings value type, `getAssignSteps('video', { rules: true })` adding `attempts`, `video`, `integrity`, `feedback`. Tests per row and formatter. No wiring.
Owns: `assignStepper/assignSteps.ts`, `assignStepper/Quiz*Step.tsx` (prop only), new `assignStepper/Video*Step*`. Depends on: 1 (flag id only; can start in parallel with 1 if it codes against the id).

### 4. Wire rules into VA assign

`VideoAssignStepper` shows slice 3's steps when the flag is on and pacing is self-paced (live unchanged). `lastVideoAssignSettings` via `useLastAssignSettings` with V3 prefill; save on successful assign. `Widget.tsx` `onAssign` writes the stepper's rules to `sessionOptions`/`settings` instead of `activity.behavior` and widget config. Flag on: editor Settings tab gone, the three drawer toggles hidden (`settings.schema.ts`). Rules test for the profile field only if none covers its reads and writes.
Owns: `VideoAssignStepper.tsx`, `VideoActivityManager.tsx` assign handler, `Widget.tsx` onAssign, `VideoActivityEditorModal.tsx` (tab removal only, after 2), `hooks/useLastVideoAssign*`, `settings.schema.ts`. Depends on: 2, 3.

### 5. Player honors the rows (V5)

`VideoActivityStudentApp` / `QuestionOverlay`: `showResultToStudent === false` shows "Answer saved" instead of right/wrong; `showCorrectAnswerToStudent === false` hides the key; `shuffleAnswerOptions === false` keeps authored order (in `functions/src/videoActivityGrade.ts` `toVaPublicQuestion` and its client mirror, cases.json updated). Only sessions that carry the new explicit fields change; a session without them, or written by the flag-off path, behaves as today. Then slice 3's hidden rows appear. Functions deploy before hosting.
Owns: `components/videoActivity/*`, `functions/src/videoActivityGrade.ts`, `utils/videoActivityPublicQuestions.ts`. Depends on: 3 (field names). Can run parallel with 4.

### 6. Settings on an assigned VA

Active and archive rows get Settings (Quiz's `QuizAssignmentSettingsModal` pattern): the rule steps and When with Save, writing only changed fields to the session and assignment docs. Check that `firestore.rules` lets the owner update `sessionOptions`/`settings` on `video_activity_sessions`; rules tests cover reads and writes if anything changes.
Owns: new `VideoAssignmentSettingsModal.tsx`, `VideoActivityManager.tsx` row actions. Depends on: 4.

### 7. Other VA assign surfaces

`PlcNewVideoActivityAssignmentModal` gets the rule steps (prefill as V3); `PlcAssignmentConfigModal` / `PlcAuthorVideoActivityModal` drop the read-only summary for the steps; Schoology LTI picker and Classroom add-on swap their summary for the step bodies (ASSIGN_STEPPER D22 pattern). All behind the flag.
Owns: those files. Depends on: 4.

## Order

Wave 1: 1 and 3 in parallel. Wave 2: 2 (after 1), 5 (after 3). Wave 3: 4 (after 2 and 3). Wave 4: 6 and 7 in parallel. Retiring the flag later deletes the Settings tab code, the drawer rows and `VideoActivityBehaviorSettingsPanel`, and needs a changelog note.
