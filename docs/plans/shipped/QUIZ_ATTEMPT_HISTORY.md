# Quiz attempt history and final score

Approved by Paul 2026-10-21 (project thread "Quiz attempt history and final score"). UI slices need his OK on a mockup before they merge.

## Problem

A retake resets the one response doc per student (`hooks/useQuizSession.ts`, the join reset: `answers: []`, `score: null`), so every Results view, export and push shows only the latest attempt. The reset also left the last attempt's teacher `grading` on the doc, so attempt 2 showed attempt 1's written-answer grades.

## Decisions

- **D1. The server keeps a copy of each finished attempt** at `quiz_sessions/{s}/responses/{key}/attempts/{n}`, written when the response becomes completed and kept current while it stays the latest attempt (grading, publish, finalize). `n` is `completedAttempts` (legacy docs: 1). A reopen and resubmit reuses `n`. Each copy stores the event time and a late event never overwrites a newer copy. A retake marks the copy `closed`; when a doc's count lags (legacy or zeroed docs) the next attempt moves past the closed number, and later events find their copy by turned-in time. Nothing is written for a response that no longer exists.
- **D2. Per-attempt scores live beside the response**, at `quiz_sessions/{s}/attemptScores/{key}`: `{ sessionId, studentUid, attempts: [{ n, at, points, max, state }], updatedAt }`, the `IndexAttempt` shape `policyPoints` already takes. Not on the response, because students read their own response before results are released.
- **D3. Both are server-written and teacher-read**: session teacher, admins and the session's sub monitor. Students reach earlier attempts only through a callable that applies the quiz's results settings (slice 4).
- **D4. Scoring reuses the grade index's quiz scorer** (`loadSessionContext` / `scoreQuizResponse`), but runs whether or not `admin_settings/gradebook_index` is on. Review games and resource sessions are skipped.
- **D5. History is saved for everyone from slice 1**, ahead of any UI flag, so it exists when the flag opens.
- **D6. A retake moves the last attempt's teacher grades onto its copy** and deletes `grading` from the live doc, only when a copy exists and only while the doc is still in that retake (same `completedAttempts`, not completed, grades unchanged).
- **D7. A removed student's attempts move under their new `archived_responses` doc** (one written within 10 minutes of the delete); otherwise they are deleted, so a reused PIN key starts fresh.
- **D8. The step runs inside the existing `gradeIndexQuizResponse` trigger** to avoid another invocation on every answer save.
- **D9. Final score setting**: "Final score: Latest / Highest / Average" (Paul's wording), a row in the Assign stepper's attempts step when more than one attempt is allowed. It writes `gradebook_columns/{sessionId}.attemptPolicy`, the setting the Gradebook already has; the Gradebook menu label "Retakes" becomes "Final score" (anchor `gradebook.column.retakes` stays). Quiz Results and its Classroom and Schoology pushes feed `attemptScores` into `liveRow` in `utils/gradebook/finalScoreOverlay.ts`; with the flag on, Quiz Results applies the choice even where the Gradebook flag is off.

## Slices

1. Save attempts: D1-D8, rules with read and write tests. No UI.
2. Teacher view: an "Attempt" row in the student's open report in Quiz Results lists each attempt with its score; grading on earlier attempts writes `grading` on the closed copy (rules: session teacher, closed copies, `grading` only) and `quizAttemptGradeWrite` rescores its `attemptScores` entry. A closed copy is otherwise frozen.
3. Final score setting (D9).
4. Student view: the same "Attempt" row on the student results screen, once a student has two or more attempts. `getMyQuizAttemptsV1` checks the response is the caller's, follows the quiz's results setting (score only leaves out answers and grades; hidden or locked returns nothing) and the teacher's `quiz-attempt-history` flag, and grades each closed copy against the key. The answer key shown is the live response's; handwriting and recordings of earlier attempts are not shown.
5. Exports: a solo Sheets export adds an "Attempts" column after PIN and an "Every attempt" tab (one row per finished attempt, "Attempt" column). PLC sheets keep their column layout; the assignment saves `exportedAttempts` with `exportedResponseIds`, and Re-export rebuilds the teacher's rows when an exported student has a newer attempt. Print gets an "Every attempt" switch that prints earlier attempts before the latest, headed "Attempt n". The CSV builder has no button in the app, so it is unchanged.

Slices 2-5 sit behind one admin preview flag, `quiz-attempt-history`.

## Not covered

Attempts from before slice 1 are gone; where `grade_index.attempts` exists their scores could be backfilled. Video Activity has the same reset and can reuse this design later.
