# Student view on a running quiz, and Live view of one student's attempt

Approved by Paul 2026-11-13 (grilling session). Quiz only; shaped so Video Activity can follow. UI slices need his OK on a mockup before they merge. Terms (Student view, Live view, Nudge) are in `GLOSSARY.md`.

## What the code does today

- **Student view** exists only on a library quiz (`QuizManager.tsx` Preview submenu, flag `quiz-student-view`, admin). It renders the real `ActiveQuiz` inside `components/quiz/QuizStudentView.tsx` against a mock session (`utils/quizStudentViewSession.ts`) and writes nothing.
- **A running assignment is a frozen copy.** Assign stamps student-safe questions on `quiz_sessions/{id}` (or `content/questions` for per-period sessions). Saving the library quiz never changes it. Only a synced quiz (PLC or District copy) can be refreshed, by "Sync now" on the assignment row (`syncAssignmentToLatest`, `hooks/useQuizAssignments.ts`).
- **Student view uses the library's settings**, not the assignment's, which can differ after the row's Settings item.
- **Monitor already receives every student's work.** One listener on `quiz_sessions/{sid}/responses` feeds it, and the student app autosaves every pick and typed draft after 500 ms (`QuizStudentApp.tsx` draft autosave).
- **The student's current question is not stored.** Monitor's "Q" chip is `answers.length + 1` (`monitor/useMonitorData.ts`), wrong after going back or skipping.
- **Every write to a response doc triggers three functions** (`gradeIndexQuizResponse`, `markPlcAssessmentDirty`, the `plcNorming` trigger).
- **The teacher may write any field on a response** (`firestore.rules` response update, `liveUid(sessionTeacherUid())`), and the student already listens to their own response doc. Clear-hand and Unlock use this.
- **A student can read their own response doc**, so nothing teacher-private can live on it.
- Mark for review and cross-outs stay on the student's device.

## Decisions

### Scope and release

- **D1. Quiz first.** Video Activity follows in a later plan; it has no drafts, no stored playhead and no input signals, so it needs its own student-side work.
- **D2. Flags.** Idea 1 rides the existing `quiz-student-view` flag. Idea 2 gets one new admin preview flag, `quiz-live-view` (`GlobalFeature`, `FEATURE_DEFAULTS` with `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'keep'`, category quiz; also in `functions/src/featureMissingDoc.ts`). It gates the Live view button and everything inside the panel.
- **D3. Only the assigning teacher can open Live view.** Not admins, co-teachers or substitutes.

### Idea 1: Student view on an in-progress assignment

- **D4. It shows what students have now**: the assignment's frozen questions and the assignment's own settings, not the library quiz. It does not push library edits anywhere. No "Update assignment" action is added.
- **D5. Entry point**: a "Student view" item in the assignment row's kebab (`buildArchiveActionsRaw` in `QuizManager.tsx`), for active and paused assignments. Not offered on paper-only assignments or view-only shares.
- **D6. Data**: read the real session doc, plus `content/questions` and `content/readAloud` when `questionsInContent` is set (the teacher can already read them), and feed them to `QuizStudentView` with its local, unsaved response. No session, response or ledger doc is written.
- **D7. Whose version**: a student with no accommodations. When the assignment has class periods the teacher picks one first. Question-bank slots show one sample draw, labelled as a sample.
- **D8. The row says when the library quiz has changed since it was assigned** (library `updatedAt` later than the assignment's creation or last sync). For a synced quiz this is the existing "Sync available" pill; a plain quiz gets a quiet "Edited since assigned" note whose tooltip says students still have the assigned version.

### Idea 2: Live view

- **D9. Live view is redrawn from saved data, not a screen picture.** No `getDisplayMedia`, no streaming service. It can't show another tab or anything outside the quiz.
- **D10. It opens as a panel inside Monitor** from a "Live view" button on a student's row, In progress bucket only. The panel renders `ActiveQuiz` read-only from the response Monitor already holds, with controls and stats beside it and next/previous student. No new reads for the answers.
- **D11. Typed answers appear as the student's drafts save** (about half a second behind). No keystroke stream is added.
- **D12. Position is reported only while watched.** Opening the panel stamps `liveView: { until, notify }` on that student's response doc; the student app sees it on its existing listener and, while `until` is in the future, reports the question it is showing on each question change. The teacher re-stamps `until` every few minutes while the panel is open and clears it on close, so a closed tab stops the reporting by itself. Scroll position is not reported.
- **D13. The student's reports go to their own small doc**, `quiz_sessions/{sid}/responses/{key}/live/state` (`questionId`, `at`), not the response doc. That keeps the three response triggers asleep and stays off the response-update rule, which is near the 1,000-expression limit. The teacher listens to that one doc only while the panel is open. Needs a small rules block (student writes own, session teacher reads) and rules tests. At build, confirm no trigger matches the subcollection path.
- **D14. Silent by default.** The panel has a "Tell the student" toggle; while on, the student sees a small banner, "Your teacher is viewing your quiz". An admin setting, "Always tell students when a teacher opens Live view", forces the banner on and hides the toggle. The setting ships off, with its control in the admin panel.
- **D15. Nudge**: a colored border pulses on the student's quiz for a few seconds, no shake. The teacher can send it bare or with one note from a fixed list ("Please see me", "Eyes on your own work", "Keep going"), shown in the student's quiz language. No free-text. Sent as `liveView.nudge: { at, noteId }` on the response doc; the student app shows each `at` once.
- **D16. Live stats show what the assignment collects.** Always: start time, time left, current question, time on this question, answered count, last activity, tab exits and away time. Typing, paste, deletion and click counts appear only when the assignment has input tracking on; otherwise the panel says it is off. Watching never switches tracking on. Input counts lag by up to 20 s (the `useInputSignals` flush).
- **D17. Screenshot**: a button captures the panel's quiz area with `html-to-image` (already a dependency) and saves it to the teacher's Drive as a private file. It must not use `uploadScreenshot`'s domain-public sharing. The image is labelled with the student, time and question, and with "Teacher's Live view, not the student's screen".
- **D18. A teacher-only action log** records each screenshot (Drive file id), each Nudge with its note, and each time the banner was shown, with time and question. Opening and closing Live view is not logged. It lives under the teacher's own assignment, `users/{uid}/quiz_assignments/{assignmentId}/live_log/{id}`, never on the response doc. At build, confirm the owner rule covers that subcollection.
- **D19. The log shows on the student's row in Results and in the Live view panel**, beside the tab-exit log. Students never see it. Removing a student or deleting the assignment deletes their log entries; Drive images stay in the teacher's Drive.
- **D20. The live view never shows Mark for review or cross-outs.** Both stay on the student's device.
- **D21. Known limit of "silent"**: `liveView` sits on a doc the student can read, so a student inspecting network traffic could see it. Accepted; hiding it would need a new listener on every student device.

## Cost

| Action                     | Reads                         | Writes                                                                           |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Student view on assignment | 1 to 3 docs, once             | none                                                                             |
| Open Live view             | 1 listener on one small doc   | 1 response write (3 function runs)                                               |
| While watching             | 1 per student question change | 1 small write per question change (no functions); 1 response write every few min |
| Nudge or banner toggle     | none                          | 1 response write (3 function runs) + 1 log doc                                   |
| Screenshot                 | none                          | 1 Drive upload + 1 log doc; no Firebase Storage                                  |
| Students not being watched | none                          | none                                                                             |

No AI calls, no Storage, no new listener on student devices.

## Slices

1. **Student view on an assignment** (D4-D7): session-backed input for `QuizStudentView`, period picker, row kebab item, unit tests for the session builder. Flag `quiz-student-view`.
2. **"Edited since assigned" note** (D8).
3. **Live view panel, read-only** (D2, D3, D9-D11, D16, D20): flag, row button, panel with `ActiveQuiz` read-only, stats. Position falls back to the newest draft's question until slice 4.
4. **Position while watched** (D12, D13, D21): `liveView` stamp and renewal, `live/state` doc, rules block and rules tests.
5. **Tell the student, and Nudge** (D14, D15): banner, admin setting with its admin-panel toggle, border pulse and notes with translations.
6. **Screenshot and action log** (D17-D19): private Drive save, `live_log`, Results row and panel list, cleanup on remove and delete.

Each UI control gets a `tourAttr` anchor registered in `config/tourAnchors.ts`. The response doc gains only the teacher-written `liveView` field (`QuizResponse` in `types.ts`).

## Not covered

- Pushing library edits into a running assignment that isn't synced.
- Video Activity, Guided Learning, Flashcards and mini-apps.
- A true screen mirror, or anything outside the quiz page (other tabs and apps are the Chrome extension's Focus sessions, `docs/plans/CHROME_EXTENSION.md`).
- Watching several students at once, free-text messages to a student, and Live view for Done students (Results covers them).
- Teacher-paced and game-mode sessions, where the board sets the question.
