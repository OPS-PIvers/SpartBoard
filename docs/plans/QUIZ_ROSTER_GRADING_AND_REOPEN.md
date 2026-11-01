# Grade every rostered student, and reopen a closed quiz for chosen students

Approved by Paul 2026-10-30 (grilling session, cloud). Covers Quiz and Video Activity. UI slices need his OK on a mockup before they merge.

## Problem

1. Quiz Results and the written-answer grader list only students who have a response doc (`QuizResults.tsx` iterates `responses`; rosters only resolve names). A student who did the work on paper has no response, so there is nothing to grade. Rules let a student create only their own response (`firestore.rules` response create, `studentUid == authUid()`), so the teacher's browser cannot add one. Auto-graded questions also ignore any teacher grade (`gradeAnswer` in `hooks/useQuizSession.ts` uses `grading` only for `free-response`), so a teacher cannot correct a multiple-choice score.
2. Per-student "Reopen" (`unlockStudentAttempt`, `hooks/useQuizSession.ts`) works only on an existing response. A student who never started a closed quiz cannot be let back in without reopening the quiz for the whole class.

## Decisions

### Scope and release

- **D1. Quiz and Video Activity get the same features.** One roster-merge helper and the same server functions serve both. VA's existing "Assign make-up" (a new assignment, `utils/videoActivityLive.ts` `makeUpTargetStudents`) stays as a separate action.
- **D16. One admin preview flag**, `quiz-roster-grading`: `GlobalFeature` id, `FEATURE_DEFAULTS` entry with `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'keep'`, category quiz; also listed in `functions/src/featureMissingDoc.ts`. It gates the full roster list, missing-student grading, per-question overrides and per-student reopen of unstarted students, in Quiz and VA. Today's "Reopen for selected" for students who already started stays ungated.

### Idea 1: every rostered student in Results and the grader

- **D7. The list is the assignment's audience**: every student on the assignment's rosters (`rosterIds`, legacy `periodNames`), minus `excludedTargets` and `removedStudentRefs`; for an individually targeted assignment, only `targetStudents`. Students with a response who are not on any roster still appear.
- **D8. Only ClassLink and test-class students are matched.** The bridge is `resolveStudentTargetRef` (`utils/studentTargetRef.ts`) plus `useAssignmentPseudonymsMulti`, the same rule as the Gradebook (`utils/gradebookRoster.ts`, D8 there) and `utils/buildAssignmentRosterRows.ts`. Manually added PIN students appear only once they have a response.
- **D4. A rostered student with no response and no teacher grade shows as Missing** and is left out of averages, item analysis and the scoreboard. Sheets export lists them with a blank score; pushes skip them.
- **D2. For a Missing student the teacher scores each question**, multiple choice included, with optional feedback. The teacher does not type the student's answers.
- **D5. Saving that score calls a server function** (pattern: `functions/src/importPaperResponses.ts`, the only non-student writer of response docs today) that creates the student's response under the key the student would get (`computeResponseKey`: their pseudonym uid), with `status: 'completed'`, `completedAttempts: 1`, `submittedAt`, `answers: []`, `teacherEntered: { by, at }` and the teacher's `grading`. Response-create rules stay student-only. The function checks the caller owns the session, the flag, and that the student is in the D7 audience; it refuses if a response already exists (the client then edits that doc normally).
- **D3 / D6. Any question's score can be overridden, for any student**, in the existing `grading[gradingKey]` map with an `override: true` marker (`WrittenAnswerGrade` gains the field). `getEarnedPoints` / `gradeAnswer` use an override entry in place of the auto score for every question type. The grader shows the auto score struck through beside the override, with "Reset to auto" (deletes the entry, as clearing a grade does today). Attempt copies (`attempts/{n}.grading`) take the same marker.
- **D17. Teacher-entered and overridden scores flow everywhere scores go**: Sheets export, Classroom and Schoology push (`buildQuizClassroomGradeEntries`), the Gradebook (its automatic Missing flag clears because a completed response now exists) and the grade index. Results and the Sheet tag the row "Entered by teacher".
- **D18. A Missing row's actions**: enter scores (D2), **Excuse** (writes the existing `excused` grade concept so the student is left out of averages and the Gradebook shows Excused, not Missing), and **Reopen** (D9).
- **D19. Students see teacher-entered scores when results are published**, like any other student, with feedback. Their answers read "Completed on paper" instead of blank.

### Idea 2: reopen a closed assignment for chosen students

- **D9. Reopening a student who never started has the server create an empty, unlocked response** (`status: 'in-progress'`, `unlocked: true`, `unlockedAt`, `reopenedBy`), so the existing rule that lets an unlocked student write after close (`runOpen(...) || ... || existing().unlocked == true`) covers them. No new rules paths. A student who already has a response keeps using `unlockStudentAttempt`.
- **D10. A reopen lasts for one submission.** Submitting locks the student again (`unlocked` back to false). The teacher can optionally set a per-student "until" time (`unlockedUntil`), after which the work is turned in as at a normal close.
- **D15. The deadline is enforced by the student app and a scheduled server sweep**: the app auto-submits at `unlockedUntil`; a scheduled function (same pattern as the idle-finalize sweep) finalizes and re-locks any unlocked response past it. No rules change.
- **D11. Reopen is offered in three places**: the Quiz (and VA) Results roster list (row action and multi-select, extending "Reopen for selected"), the Assignments hub roster pane (`components/assignmentsHub/AssignmentDetailPane.tsx`), and the Quiz monitor.
- **D12. The assignment stays Closed for everyone else.** The reopened student sees it open on their student landing, marked "Reopened by your teacher", and can also join by code although the session has ended. The code-join lookup drops ended sessions today (`acceptsStudents`, `hooks/useQuizSession.ts`); it must admit a caller whose response is unlocked. The student's `student_assignments` pointer doc carries the reopen so the landing can show it.
- **D14. Reopening a student who has a teacher-entered score asks first.** On confirm, the entered score becomes that student's earlier attempt (closed copy under `attempts/{n}`, per `docs/plans/shipped/QUIZ_ATTEMPT_HISTORY.md`) and the student starts a fresh attempt; the quiz's Final score setting decides which counts.

## Slices

1. **Shared roster merge.** A pure helper that turns rosters + assignment targeting + responses + pseudonyms into rows (`responded | missing | excused`), generalised from `buildAssignmentRosterRows.ts`, with unit tests. No UI.
2. **Per-question overrides** (D3/D6): scorer change, `override` marker, grader UI with "Reset to auto". Flagged.
3. **Missing students in Results and grader** (D4, D7, D8, D18 Excuse): Quiz Results list, scoreboard/averages exclusion, Sheets blank rows. Flagged.
4. **Teacher-entered scores** (D2, D5, D17, D19): server function + rules tests that teachers still cannot create responses directly, grader entry for Missing rows, "Entered by teacher" tag, student "Completed on paper" view.
5. **Per-student reopen** (D9-D12, D14, D15): server function, code-join and landing changes, sweep, entry points in Results, hub and monitor.
6. **Video Activity parity** (D1): slices 2-5 on VA Results and its grader.

Each UI control gets a `tourAttr` anchor registered in `config/tourAnchors.ts`.

## Not covered

- Manually added (PIN-only) roster students without a response (D8). They can be added once rosters carry a stable id for them.
- Gradebook D37 (`grades/{responseKey}`): if it lands first, D5 and D6 write there instead of on the response.
- Guided Learning, mini-apps and Flashcards.
