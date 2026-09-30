# Gradebook: teacher gradebook, data analysis and student Grades tab

Grilled and settled 2026-09-30. Six phases, stacked PRs to `dev-paul` in the order below. Phases 1–5 sit behind the `gradebook` preview flag; phase 6 sits behind its own `student-gradebook` flag.

Clickable prototype with fake data: [`mockups/gradebook-mockup.html`](mockups/gradebook-mockup.html).

## Goal

Give a teacher one place to see every score a class earned in SpartBoard, fix and annotate those scores, and understand the class and each student through learning-target proficiency and charts. It replaces the Assignments modal, which nobody uses. Later, students get a read-only Grades tab showing what the teacher has published.

SpartBoard stays a working gradebook. The district SIS keeps the official report-card grade, and scores get there by export or LMS push.

## Current-state facts that drove the decisions

- **Assignments modal.** `components/assignmentsHub/AssignmentsHubModal.tsx` is a modal, not a route. It opens from an ungated sidebar button (`components/layout/sidebar/Sidebar.tsx`, `showAssignmentsHub`). `useUnifiedAssignments.ts` merges five per-teacher collections (quiz, video activity, guided learning, mini-app, flashcards) into read-only rows. Activity Wall and Projects are missing from it.
- **Where scores live.**

  | Kind            | Session                         | Per-student doc                      | Score                                                                    |
  | --------------- | ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
  | Quiz            | `quiz_sessions/{id}`            | `/responses/{key}` (`QuizResponse`)  | `score` % written on Publish, otherwise computed live with `gradeAnswer` |
  | Video Activity  | `video_activity_sessions/{id}`  | `/responses/{key}`                   | `score` % written on Publish                                             |
  | Guided Learning | `guided_learning_sessions/{id}` | `/responses/{studentAnonymousId}`    | `score` % recomputed on Publish                                          |
  | Flashcards      | `flashcard_sessions/{id}`       | `/progress/{studentUid}`             | check mode: server-written `score` / `total`                             |
  | Projects        | `project_runs/{runId}`          | `/grades` (`ProjectGroupGrade`)      | per group `points` / `maxPoints`, with per-member `overridesByUid`       |
  | Mini-app        | `mini_app_sessions/{id}`        | `/submissions/{assignmentPseudonym}` | none, `submittedAt` only                                                 |
  | Activity Wall   | `activity_wall_sessions/{id}`   | `/submissions`                       | none                                                                     |

- **Manual grading.** Only quiz has it: `QuizResponse.grading[questionId]: WrittenAnswerGrade` with points, rubric scores, comments and `excused`. `QUIZ_STRUCTURED_ASSESSMENTS.md` D4–D5 add per-question overrides on auto-scored answers. There is no whole-assignment override anywhere, and Video Activity and Guided Learning have no manual grading.
- **Grade state.** `GradeResult.state` is `scored | awaiting-grade | not-attempted` (RR-06, `docs/rich-response-wayfinder.md`). "Better no grade than a wrong 0": `awaiting-grade` is omitted from grade pushes and `not-attempted` pushes a real 0.
- **Publishing.** Quiz and GL use `scoreVisibility` + `scorePublishedAt` on the session. Quiz also has a per-student `resultsOverride`. VA and GL have no per-student publish.
- **Attempts.** A quiz re-join resets the same response doc, so only the latest attempt's answers survive. `completedAttempts` and the attempt ledgers count attempts but keep no scores.
- **Dates.** Every kind has `openAt` / `closeAt` (rule-enforced) and a display-only `dueAt`. No late or missing logic exists anywhere.
- **Student identity.**
  - SSO, ClassLink and test-class students get a stable uid, `HMAC("sid:"+sourcedId)` or `HMAC("sid:test:"+email)` (`functions/src/classlinkShared.ts`, `studentIdentity.ts`). The Classroom add-on and matched Schoology LTI reuse that uid. Only the server can compute it.
  - Local rosters match only by PIN plus a free-text `classPeriod`, which can collide.
  - Mini-app submissions are keyed by a per-assignment pseudonym but carry `studentUid`.
  - GL keys by `studentAnonymousId` and has no PIN bridge.
- **Rosters.** `users/{uid}/rosters/{id}` holds no names. Names, groups and accommodations live in a Drive JSON file loaded through `useRosters`. `Student` has separate `firstName` / `lastName` and an optional `classLinkSourcedId`.
- **Standards.**
  - Only `QuizQuestion.targets` can be tagged (`QuestionTargetTag`).
  - `utils/quizTargetStats.ts` (`computeTargetStats`, `masteryBandFor`) scores targets per quiz only.
  - The bands are 80 / 60 (`DEFAULT_MASTERY_CUTOFFS`), and PLC leads can change them.
- **PLC analytics.** `recomputePlcAssessments.ts` already scores quiz responses on the server through `withQuizSessionContent` and `plcAssessmentMath.ts`, including manual grades. PLC aggregates are anonymized by design: no per-student or per-teacher scores.
- **Grade push.** Google Classroom and Schoology LTI push for quiz and VA exist (`utils/classroomGradePush.ts`, `utils/ltiGradePush.ts`, `hooks/useGradeWriteQueue.ts`). OneRoster is read-only.
- **Charts.** `recharts` is a dependency, used only in `components/admin/Analytics/AnalyticsManager.tsx`. PLC Home chose div bars (PLC_HOME_V2 D23).
- **Student side.**
  - `/my-assignments` is SSO-only (`RequireStudentAuth` needs the `studentRole` claim) and shows no scores, only status chips.
  - The quiz-response read rule does not check publish state, so a student can read score fields before publish. The client hides them; the rule doesn't.
  - Students cannot read any class-level aggregate.
- **Full-page pattern.** PLC mounts `PlcRouteHost` as a `fixed inset-0` layer over the warm dashboard and navigates with `spaNavigate` (`App.tsx`, `utils/plcPath.ts`).

## Decisions

### Scope and shell

- **D1.** Working gradebook. SpartBoard collects, reviews and overrides scores. The SIS stays the official record, fed by export (D30) and LMS push (D22).
- **D2.** Points are the primary grade. Standards proficiency is computed from tagged evidence and shown in the student view, the analysis tab and an optional standards view of the grid.
- **D3.** No manual columns. Every column is a SpartBoard activity.
- **D4.** `/gradebook` is a full-screen route built like `PlcRouteHost`: a `fixed inset-0` light surface over the dashboard, with `spaNavigate` deep links:
  - `/gradebook/{rosterId}` (grid)
  - `/gradebook/{rosterId}/analysis`
  - `/gradebook/{rosterId}/student/{studentUid}`
  - `/gradebook/{rosterId}/assignment/{sessionId}` (the Analyze modal)

  Closing returns to the board.

- **D5.** Everything teacher-facing is behind the `gradebook` `GlobalFeature` (preview, admin). While it's in preview, the sidebar shows a Gradebook button beside Assignments. The PR that opens the flag to Public deletes `components/assignmentsHub/` and points its entry points at `/gradebook`.

### Data

- **D6.** Columns:
  - Scored: Quiz, Video Activity, Guided Learning, Flashcards (check mode only) and Projects.
  - Completion-only (✓ when a submission exists), never counted in averages and hideable: Mini-app and Activity Wall.
  - Flashcards study mode is not a column. It feeds the Work habits card.
- **D7.** Unpublished scores show live with a "not published" marker. Awaiting-grade cells say so and are never shown as 0. Publish and Unpublish exist in the header popover (whole class) and in the cell popover (one student). VA and GL need per-student publish built, mirroring quiz `resultsOverride`.
- **D8.** Only ClassLink and test-class rosters appear in the class dropdown, because their students match work by a stable uid. Local rosters are excluded until they can match reliably.
- **D9.** A teacher edit (whole-score override, comment, flags) is stored in one overlay keyed by assignment + student that never modifies the raw response.
  - A single shared resolver, `resolveFinalScore(raw, mark, column)`, returns the final score.
  - Every consumer uses it: the grid, the Quiz, VA and GL Results views, CSV and Sheets export, the student's published review, Classroom and Schoology push, and the student projection.
- **D10.** A server-built grade index. Firestore triggers on every per-student doc in the table above (plus the overlay and column config) upsert one row per assignment × student.
  - Each row holds: raw score, points, max, state, `submittedAt`, attempts, per-target evidence and effective score.
  - Session-level changes (a key edit, publish, targeting) enqueue a whole-session recompute, reusing the PLC dirty-flag pattern.
  - The quiz scoring reuses `plcAssessmentMath` + `withQuizSessionContent`.
  - A one-time backfill builds rows for existing sessions.
  - The client reads one indexed query per class plus the overlay.
- **D11.** Attempts: the index records each submitted attempt's final score. Each column has an attempt policy of latest (default), highest or average. The cell shows an attempt count and the popover lists every attempt.
- **D12.** Every overlay, config and index doc stores `ownerUid` and `editorUids: []` from day one, so co-teacher sharing later needs no migration. v1 is owner-only.

### Grading rules

- **D13.** The Overall column defaults to total points. Teachers can optionally define weighted categories (e.g. Assessments 60 / Practice 40) and assign each column to one. Categories with no counted work are dropped and the remaining weights renormalize.
- **D14.** Flags are configurable. Each flag has a name, a one-letter code (also its keyboard key), a color, a score effect (`none`, `zero` or `exclude`) and a "visible to students" toggle (D36). Defaults:

  | Flag       | Key | Effect  | Students see |
  | ---------- | --- | ------- | ------------ |
  | Missing    | M   | zero    | yes          |
  | Excused    | X   | exclude | yes          |
  | Late       | L   | none    | no           |
  | Incomplete | I   | none    | no           |
  | Absent     | A   | none    | no           |

  When several flags apply, `exclude` beats `zero`, which beats `none`. A real score or override always beats `zero`.

- **D15.** Late and Missing are applied automatically.
  - **Late:** `submittedAt > dueAt`.
  - **Missing:** `dueAt` (or `closeAt` when there's no due date) has passed with no submission.
  - Auto flags render differently from manual ones.
  - Auto flags can be cleared, and a cleared auto flag stays cleared (`suppressedAuto` on the mark). Auto-Missing clears on its own when work arrives.
  - A per-teacher setting turns auto flags off.
  - Auto flags never fire on a not-assigned cell (D25).
- **D16.** Flags, categories, the proficiency method and the student-visibility defaults form a **settings set**.
  - Every teacher has a personal set seeded with the defaults.
  - A PLC lead can publish a shared set at `plcs/{plcId}/meta/gradebookSettings`.
  - A teacher can choose to follow a PLC set for a class. A followed set is read-only and live-updates.
- **D17.** Target proficiency across assessments uses one of four methods, chosen in the settings set: mean, most recent, highest, or decaying average (new evidence weighted 65 %, the default). Bands come from the teacher's or the PLC's `masteryCutoffs`, defaulting to 80 / 60. A Missing zero counts toward the points grade but is never proficiency evidence, and neither is an excused or awaiting-grade cell.
- **D18.** Grading periods (Q1–Q4, S1/S2, with dates) are defined by admins **per building**, and one period set can be shared by several buildings.
  - The gradebook defaults to the current period and also offers All and a custom range.
  - A column belongs to a period by `dueAt`, falling back to `openAt`, then `createdAt`.
  - The Overall column is for the selected period.

### Grid

- **D19.** Layout:
  - Columns run oldest to newest by `dueAt` (fallback as in D18). On open the grid scrolls to the newest.
  - The name column and the Overall column are pinned.
  - Filters: category, activity type, "needs grading".
  - A cell shows a percent by default, with a points toggle, an optional mastery-band tint, flag chips in the corner and a dot when there's a comment.
- **D20.** Sorting:
  - The default is last name A–Z.
  - The name header cycles "Last, First" / "First Last" and the sort key.
  - Any column header, or Overall, sorts by score.
  - Extra sorts: missing count, a flag, a roster group.
  - Saved per teacher per class.
- **D21.** Cell popover, anchored to the cell:
  - **Score override** for the whole assignment. The computed score shows struck through beside it, with **Revert**. **Grade answers** opens that student's quiz grader for per-question changes, and those changes flow back into the computed score.
  - **Comment**, private by default, with a **Share with student** toggle. A shared comment appears once that student's results are published.
  - **Flags**: toggle chips, with auto flags marked.
  - **Fill down**: fills only empty, unsubmitted cells in this column that have no override and no excluding flag. It confirms the count first ("Fill 6 empty cells with 0?") and one Undo reverts the whole fill.
  - **Publish / Unpublish for this student.**
  - **Attempts** list (D11).
  - **History** (D24).
- **D22.** Header popover:
  - **Open**: the existing Quiz, VA or GL Results component in a large modal over the gradebook. Edits show in the grid live.
  - **Analyze**: the class-level modal (D28).
  - **Publish / Unpublish** for the whole class.
  - **Grading setup**: category, counts toward the overall grade, a max-points override, attempt policy, and column-level target tags (D29).
  - **Bulk**: fill empty cells, flag every non-submitter Missing, excuse the column, hide the column.
  - **Push to Classroom / Schoology** for LMS-attached assignments, pushing final scores (D9). This keeps RR-06: awaiting-grade is omitted and excluded never pushes a 0.
- **D23.** Keyboard: arrow keys move, typing a number starts an inline override, Enter opens the popover, Esc closes it, flag keys toggle flags, and Ctrl+Z undoes. A privacy toggle (button and a shortcut) blurs names and scores across the grid, student view and analysis. It is remembered for the browser session, and charts with no names stay readable.
- **D24.** Every change to an override, comment, flag, publish state or fill is logged: who, when, old value, new value. The cell popover shows the history. A bulk action is one entry that can be undone as a whole.
- **D25.** Students outside an assignment's targeting (individual targeting, or joined the class after it was assigned) get a hatched "not assigned" cell. The cell is excluded from averages and auto-Missing ignores it. Its popover offers "Assign to student" where the kind supports adding a student.

### Student view (teacher-facing)

- **D26.** `/gradebook/{rosterId}/student/{studentUid}` is a full view with previous and next student arrows (← / → keys). It is a grid of cards the teacher shows, hides and reorders from a card library, saved per teacher. v1 cards:
  - **Performance:** overall and per-category grade, a score trend with the class median, and a what-if calculator.
  - **Standards:** a target and standard proficiency heatmap over time, the band per target, and the evidence list behind each target.
  - **Work habits:** missing and late counts, submission timing against the due date, attempts, time on task where it's recorded, completion rate and flashcard study time.
  - **Comparison:** the student's position in the class distribution per assignment, with no other names shown.
  - **Assignment list:** every column with its score, flags, comment and a link to the grader.
  - **Insights** (D31), filtered to this student.

  A **Preview as student** button renders exactly what that student's Grades tab would show (D35).

### Analysis tab

- **D27.** Structure:
  - A global filter bar: grading period, date range, category, activity type, target or standard, roster group, flag, and accommodation (screen-only, D32).
  - It drives a set of cards the teacher can arrange: score distribution, trends, standards heatmap, item analysis, missing work, growth and Insights.
  - Plus one **Explore** card, a pivot with a metric, a group-by and a chart type.
  - Every mark drills down to its students or assignments.
- **D28.** The Analyze modal from a column header shows the same class-level cards scoped to one assignment: distribution, item analysis, target breakdown, and non-submitters.
- **D29.** Target tagging is extended to Video Activity and Guided Learning questions, reusing `TargetPicker`. A whole column (a project, flashcard set or mini-app) can be tagged from Grading setup, and its overall percent then counts as evidence for those targets.
- **D30.** Export:
  - The current view (filters applied) goes to CSV or a new Google Sheet.
  - Options: "Last, First", percent or points, and flags as codes.
  - Accommodation data is never exported.
  - The student view and analysis cards have a print layout.
- **D31.** Insights are rule-based and deterministic, and each links to its filter. Examples:
  - Dropped 15+ points over the last 3 assessments.
  - 3 or more missing.
  - A target below Approaching for 40 % of the class.
  - A suggested reteach group for each weak target.

  An AI narrative summary is a later phase behind its own flag.

- **D32.** Scope and sensitive data:
  - The analysis defaults to the selected class. **Compare classes** adds the teacher's other rosters.
  - It never includes another teacher's students. Cross-teacher comparison stays in the anonymized PLC aggregates.
  - Roster groups are ordinary filters.
  - Accommodation info can be a filter on screen only. It never becomes a column, never appears in an export, and is hidden while the privacy toggle is on.

### Platform

- **D33.** Laptop and tablet get full editing with touch-sized popovers. On a phone, the page becomes a student list, then that student's assignment list, with overrides and flags still available, and the analysis cards stack into one column.
- **D34.** Charts use Recharts, lazy-loaded only inside the `/gradebook` chunk and the student Grades chunk. The mastery-band colors are reused.

### Student Grades tab (phase 6)

- **D35.** My Assignments gets an **Assignments | Grades** switch per class at `/my-assignments/{classId}/grades`.
  - SSO students only; PIN-only students can't reach My Assignments today.
  - What students see is set per class by the teacher's settings set (or the PLC set they follow):
    - **On by default:** published final scores (overrides applied), student-visible flags, and shared comments.
    - **Off by default:** standards mastery, per target and standard with its evidence, using the teacher's method and bands.
    - **Not in v1:** overall grade, category grades, trend and what-if.
  - A row opens that activity's existing results review, which also shows the final score through D9.
- **D36.** Flag visibility to students is per flag (D14). Students never see a class average, rank or any other student's data. Changes show as in-page **New** badges until the student views them: a new published score, a new shared comment, or a new Missing flag. There is no email or push notification.
- **D37.** Students read only a server-written projection at `student_grades/{studentUid}/classes/{classId}`. It holds exactly what D35 allows and only that student can read it.
  - Unpublished scores, private comments, hidden flags and disabled sections never reach a student's browser.
  - The D10 function writes it from phase 1, so enabling the tab later needs no backfill.
  - Separately, the quiz, VA and GL response read rules are tightened so a student can't read score fields before publish (its own PR, not flagged; it's a bug fix).
- **D38.** Everything student-facing is behind its own `student-gradebook` `GlobalFeature`, opened only after the teacher side is trusted.

## Data model (proposed; finalize in PR 1)

All docs carry `ownerUid` and `editorUids` (D12). Write the rules with the `incoming()` / `existing()` / `authUid()` / `unchanged()` / `isStr()` shorthands and check `pnpm run check:rules-size`.

| Path                                            | Written by  | Purpose                                                                                                                                                                                                    |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grade_index/{sessionId}__{studentUid}`         | server only | D10 row: `kind`, `sessionId`, `ownerUid`, `rosterIds[]`, `classIds[]`, `studentUid`, `rawPct`, `points`, `max`, `state`, `submittedAt`, `dueAt`, `attempts[]`, `targetEvidence[]`, `published`, `assigned` |
| `gradebook_marks/{sessionId}__{studentUid}`     | teacher     | D9 overlay: `override { points, at }`, `comment { text, shared }`, `flags[]`, `suppressedAuto[]`, `publishOverride`                                                                                        |
| `gradebook_marks/{id}/history/{autoId}`         | teacher     | D24 change log; bulk actions share a `batchId`                                                                                                                                                             |
| `gradebook_columns/{sessionId}`                 | teacher     | D22 column config: `category`, `countsTowardOverall`, `maxPointsOverride`, `attemptPolicy`, `targets[]`, `hiddenInRosterIds[]`                                                                             |
| `users/{uid}/gradebook_settings/default`        | teacher     | D16 personal settings set (flags, categories, proficiency method, student visibility, auto-flags on/off)                                                                                                   |
| `users/{uid}/gradebook_classes/{rosterId}`      | teacher     | per-class view state: sort, name format, cell format, followed PLC set, card layouts                                                                                                                       |
| `plcs/{plcId}/meta/gradebookSettings`           | PLC lead    | D16 shared settings set                                                                                                                                                                                    |
| `grading_period_sets/{setId}`                   | admin       | D18 `{ name, buildingIds[], periods[{ id, label, start, end }] }`                                                                                                                                          |
| `student_grades/{studentUid}/classes/{classId}` | server only | D37 student projection                                                                                                                                                                                     |

Names: a new callable `getGradebookRosterV1(rosterId)` returns `studentUid` for each roster student (ClassLink `sourcedId` or test email, HMAC computed on the server), so the client can join Drive names to index rows. The mapping is cached per session.

## PR sequence

Each PR is usable on `spartboard-dev` by itself.

1. **Data layer.** The `gradebook` and `student-gradebook` `GlobalFeature` entries (`types.ts`, `config/featureDefaults.ts`, `functions/src/featureMissingDoc.ts`), the collections and rules above, the D10 index triggers plus the backfill script, the D37 projection writer, `getGradebookRosterV1`, and the shared `resolveFinalScore` and proficiency math with parity tests between client and functions.
2. **Grid.**
   - The `/gradebook` route and sidebar entry, the class dropdown, the grid, sorting and filters.
   - The cell and header popovers, flags and auto flags, fill, publish (including new per-student publish for VA and GL), history, keyboard and privacy.
   - Results reuse in the Open modal.
   - D9 wiring into the existing Results views, exports and pushes.
3. **Student view** (D26) with the card library and what-if.
4. **Analysis tab** (D27, D28, D31) with Explore and Compare classes.
5. **Tagging, export and periods.** VA and GL target tagging (D29), CSV and Sheets export (D30), admin grading-period sets per building (D18), and LMS push from the header (D22).
6. **Student Grades tab** (D35, D36) behind `student-gradebook`, plus the Preview as student button (D26).

The response-rule tightening (D37) is its own bug-fix PR and can land any time.

## Flags and rollout

- `gradebook`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`. It opens at Admin Settings > Access > Previews > Gradebook > Public. Its retire PR deletes the Assignments modal (D5).
- `student-gradebook`: the same shape, `afterLaunch: 'retire'`. It opens separately, after `gradebook`.
- Admins always pass preview gates, so "on for Paul" means Paul plus the other `/admins`.
- Changelog entries land when each flag opens, not when code merges.

## Out of scope for v1

- Manual (non-SpartBoard) columns.
- Co-teacher sharing (the data model is ready for it).
- Local-roster classes.
- AI narrative insights.
- An overall grade for students.
- Parent access.
- OneRoster grade write-back.
