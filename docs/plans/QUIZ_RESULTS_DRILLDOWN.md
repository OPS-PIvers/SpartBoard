# Quiz Results: per-student publishing and drill-downs

Grilled and settled 2026-09-21. Four stacked PRs to dev-paul, in the order below. No feature flag.

## Goal

- Let a teacher show results to one student (or a few) for a reassessment, then hide them again, without publishing to the class.
- Clicking a student row expands to that student's question-by-question results.
- Clicking a question row expands to the answer distribution and the students who got it right and wrong.

## Current-state facts that drove the decisions

- Publishing is all-or-nothing: `scoreVisibility`, `scorePublishedAt` and `protection` are written to both the assignment doc and the session doc by `publishAssignmentScores` (`hooks/useQuizAssignments.ts`). The only entry point is the archived-assignment kebab in `QuizManager.tsx` → `PublishScoresModal`.
- `score-responses-and-answers` writes the answer key to `session.revealedAnswers`. Any signed-in user can read a session doc (`firestore.rules`), so the key is effectively public to anyone with the session ID.
- A retake resets the same response doc (`answers: []`, `score: null`), so earlier attempts are lost. Reassessment here is a separate activity, so this plan never touches attempts.
- Students can read their own response doc (not gated on publish) and cannot write fields outside the update allowlist. The teacher can write any field. New per-student fields therefore need no rules change.
- `/my-assignments` derives "graded" from the session doc (`parsePublicationFields` in `hooks/useStudentAssignments.ts`). The quiz app reads `session.scoreVisibility` to choose `PublishedScoreReview` vs the waiting screen (`QuizStudentApp.tsx`).
- `QuizResults.tsx` has `QuestionsScreen` and `StudentsScreen`; neither row is clickable. `computeQuestionStats` (`utils/quizQuestionStats.ts`) returns counts only.
- The live monitor already has a per-option distribution: `buildDistribution` (`monitor/monitorUtils.ts`) and `QuestionDetail` (`monitor/QuestionResults.tsx`). It is not used in Results.
- `QuizResults` is also mounted for PLC teammates in `PlcQuizSessionContent.tsx`.

## Decisions

### Per-student publishing

- **D1.** Reassessment is separate from the quiz. The original response is never modified, apart from the grading fields that publishing already writes.
- **D2.** Each student is **Follows class**, **Shown** or **Hidden**. Shown carries its own level (score only / + their answers / + correct answers), chosen each time. Hidden works when the class is published.
- **D3.** Class and student settings are independent. A Shown student keeps their level through a class publish, re-publish or unpublish until the teacher sets them back to Follows class.
- **D4.** Correct answers are written only to the student's own response doc. For new class-wide publishes, the answer key also moves off the session doc onto each response. The student app reads the response first and falls back to `session.revealedAnswers` for older publishes. Live-session reveal (`showCorrectAnswerToStudent`) is unchanged.
- **D5.** Hidden hides results in the UI only. A student could already read their own score from Firestore before publishing; that stays as it is.
- **D6.** Controls: a "Results for this student" control at the top of the expanded row, multi-select checkboxes on rows with a bulk "Show results / Hide results / Follow class" bar, and Show/Hide items in each row's kebab menu. A row shows a badge when it differs from the class setting.
- **D7.** Turning off is manual, with an optional expiry chosen at publish: none / end of today / 3 days / 1 week. Expiry is evaluated on the client (student app and `/my-assignments`), so no scheduled job is needed; the teacher's row shows "Expired" and offers Hide.
- **D8.** Allowed as soon as that student's response is complete, whether or not the assignment is archived.
- **D9.** Never pushes grades to Classroom or Schoology. Grade push stays with the class publish and the Push Grades button.
- **D10.** Publishing to a student grades that one response with the same code path as the class publish (writes `score` and `isCorrect`; `score` is left unset while a written answer awaits a grade, as today).

### Student row drill-down

- **D11.** Clicking a student row expands it inline (one open at a time). Each question line shows Q#, shortened question text, a mark (correct / incorrect / partial / ungraded / excused), points, and the student's answer. Under a wrong answer, the correct answer appears in muted text.
- **D12.** Grades are computed live with `gradeAnswer` against the loaded answer key, so the drill-down works before publishing. Bank quizzes show only the questions that student was served.
- **D13.** Clicking a written or recorded question opens `FreeResponseGrader` on that student and question.
- **D14.** A "Hide names" toggle in the Results header replaces names with "Student 1…n" across every Results screen and drill-down. It is remembered per teacher (localStorage).

### Question row drill-down

- **D15.** Clicking a question row expands it inline. Distribution by type:
  - MC: every option with count and %, the correct one marked.
  - FIB: distinct answers grouped after normalization, most common first, accepted answers marked.
  - Matching: % correct for each pair.
  - Ordering: the most common wrong orders.
  - Written: no distribution.
- **D16.** Clicking an option or grouped answer expands name chips under it. Several can be open at once.
- **D17.** Columns: Correct | Incorrect always. A Partial column appears only if anyone earned partial credit. Ungraded and No answer strips appear below only when non-empty.
- **D18.** For bank questions, every percentage uses only the students who were served that question.
- **D19.** Reuse and extend `buildDistribution` from the monitor rather than writing a second one; add per-option student lists.

### Extras

- **D20.** Group actions: each column and each option's name list has "Select these students", which feeds the multi-select bar (D6). The bar offers "Show results to these students" and "Copy names".
- **D21.** Question results get a "Most missed" sort. When one wrong option or answer draws at least 40% of the students served that question, the row shows "Common wrong answer: C".
- **D22.** The Google Sheet export adds a column per question with the student's answer text next to the existing points columns.
- **D23.** The expanded student row has a Print button that produces a one-page report: score, each question with their answer and mark, target mastery when the quiz has targets. An "Include correct answers" checkbox is on by default.

### PLC view

- **D24.** PLC teammates get the question drill-down (distribution, most-missed, misconception flag) with no names: option chips, columns and group actions are hidden. No student-row expansion and no publish controls.

## PR 1 — Question drill-down + most missed

- Expandable rows in `QuestionsScreen`: distribution (D15, D16, D19), columns (D17), served-only denominators (D18).
- Extend `utils/quizQuestionStats.ts` (or a sibling) to return per-student outcomes and per-option groups; share grouping with `monitorUtils.buildDistribution`.
- Most-missed sort and the common-wrong-answer flag (D21).
- PLC mode renders counts only (D24).
- Tests: stats util per question type (MC, FIB grouping, Matching pairs, Ordering, written, bank served subset), `QuizResults` question screen.

## PR 2 — Student drill-down, Hide names, print

- Expandable rows in `StudentsScreen` (D11, D12), grader deep link (D13).
- Hide names toggle applied everywhere names render in Results, including PR 1's chips and columns (D14).
- Print report with the answer-key checkbox (D23), using the existing print approach used elsewhere in the quiz widget.
- Hidden in PLC mode (D24).
- Tests: row expansion per type, bank quiz, ungraded/excused marks, anonymization, print output.

## PR 3 — Per-student publishing

- **Data:** on the response doc, a per-student publication field, e.g. `resultsOverride: { mode: 'shown' | 'hidden', visibility, publishedAt, expiresAt?, revealedAnswers? }`. Absent = follows class.
- **Teacher:** `publishResultsForStudents(responseKeys, level, expiresAt)` and `hideResultsForStudents` / `clearResultsOverride` in `useQuizAssignments.ts`, reusing the grading from `publishAssignmentScores` for the chosen responses. Controls per D6, group actions per D20.
- **Class publish change (D4):** write `revealedAnswers` to each response; stop writing it to the session doc for new publishes; unpublish clears both.
- **Student:** resolve effective visibility = override (if not expired) else session. Apply in `QuizStudentApp` (`PublishedScoreReview`, ended `ResultsScreen`) and in `/my-assignments`, which currently derives graded state from the session doc only. SSO students' list needs the per-student state too: read it from the student's own response doc, or mirror it onto the pointer doc `student_assignments/{uid}/items/{id}`. Decide in the PR; whichever it is, Hidden must suppress the class "graded" state.
- **PIN students** have no `/my-assignments`; they see results by rejoining the quiz code, which goes through the same resolution.
- **Rules:** no change expected. Confirm the new field is outside the student update allowlist and add a rules test that a student cannot write it.
- Tests: effective-visibility resolver (including expiry and class interplay per D3), publish/hide hooks, student app views, `/my-assignments` state, rules test.

## PR 4 — Answer text in the Sheet export

- `buildResultsSheetData` (`utils/assignmentExportShared.ts`) adds an answer column per question (D22). Matching and Ordering answers are rendered readably, not in their stored `t:d|t:d` / `a|b|c` form.
- Check solo export, PLC append, and PLC rewrite/regenerate, since existing sheets have fixed column positions and `exportedResponseIds` only appends new rows.
- Tests: `assignmentExportShared` and `quizDriveService` export paths.

## Open

- Where SSO students' per-student state reaches `/my-assignments` (response doc read vs pointer-doc mirror), decided in PR 3.
- How PR 4 handles a PLC sheet created before the answer columns existed (append new columns at the end vs regenerate).
