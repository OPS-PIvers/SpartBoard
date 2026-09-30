# Gradebook: teacher gradebook, data analysis and student Grades tab

Grilled and settled 2026-09-30. Six phases, stacked PRs to `dev-paul` in the order below. Phases 1–5 sit behind the `gradebook` preview flag; phase 6 sits behind its own `student-gradebook` flag.

Clickable prototype with fake data: [`mockups/gradebook-mockup.html`](mockups/gradebook-mockup.html).

## Design reference

The prototype is the approved visual and interaction spec, reviewed control by control with Paul. Build to it, not a fresh design:

- **Match it screen for screen.** Layout, control types, labels, copy, icons and the order of rows in every popover, menu and the settings modal. Change none of them without Paul's sign-off.
- **Translate, don't copy.** Its CSS custom properties are the Tailwind tokens (`brand-blue-*`, `slate-*`, `emerald`/`amber`/`rose`), so use those classes and the existing primitives: the Admin Organization primitives (`Btn`, `Input`, `Select`, `CellPopover`, `PopoverOption`, `Confirm`), `common/Toggle` (`showLabels={false}`), `SegmentedControl`, `Card`, lucide icons and `utils/scoreColor.ts` for bands. Never ship the prototype's hand-written CSS.
- **Rules it follows,** which review should hold the build to:
  - A single choice is a `<select>`. Several are a select-style button that opens a checklist menu, with search for long lists. There are no pill rows (`components/CLAUDE.md`, "Picking from a list").
  - Nothing that a teacher needs every time hides behind a collapsed section.
  - Edits autosave with an Undo toast; there are no Save buttons.
  - Hints live in hover tips (the Value info icon, the Visibility states), not permanent lines.
- **Verify against it.** Each phase's PR includes screenshots of its screens beside the matching prototype state.

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

- **D13.** The Overall column defaults to total points. Teachers can turn on weighted categories and assign each column to one. Categories with no counted work are dropped and the remaining weights renormalize.
  - The defaults are **Academic Achievement 60 %** and **Academic Practice 40 %**.
  - In settings, teachers rename, reweight, add and remove categories inline. A running total shows beside **+ Add category**. Above 100 % it turns red and reads "Cannot exceed 100%"; below 100 % the weights renormalize as above.
  - Removing a category moves its columns to the first remaining category, with Undo.
  - **Restore defaults** brings back the two defaults and maps existing columns onto them.
- **D14.** Flags are configurable. Each flag has a name, a one-letter **key** (shown in the cell chip and used as its keyboard shortcut), a color, a **value** and a **Visibility** (D36).
  - Every row is editable in place: name, key, value and visibility, and clicking the color chip cycles through the palette. A key must be one letter, unused by another flag, and not P (the privacy shortcut); a bad key is refused with a toast.
  - **+ Add flag** adds a custom flag with the next free key. Custom flags and Incomplete and Absent can be removed. Missing, Excused and Late are built in because auto flags (D15) depend on them: they show a lock instead of a trash icon but can still be renamed and rekeyed.
  - The value is a percent, or blank for no effect. It is the score the flag gives a cell that has no score, so Missing at 0 % counts as a zero. A real score or an override always wins over a flag's value. When several valued flags apply, the lowest value is used.
  - **Excused** is built in and shows "Excluded" instead of a value: it leaves the cell out of the average, and it beats every value.
  - The settings table header reads **Value**, with an info icon whose hover or focus text explains it. There is no permanent hint line.
  - **Visibility** is one icon button per flag that cycles through three states on click, each named by a hover tip:
    - **Not visible** (crossed-out eye): the flag is switched off. It leaves the flag menu, the keyboard shortcuts, Mark all and the filters, and it has no effect on scores. Marks keep it, so turning it back on restores them.
    - **Teacher only** (one person): the teacher sees and uses it; students never see it.
    - **Teachers and students** (two people): it also shows on the student's Grades tab.
  - Defaults:

  | Flag       | Key | Value    | Visibility            |
  | ---------- | --- | -------- | --------------------- |
  | Missing    | M   | 0 %      | Teachers and students |
  | Excused    | X   | Excluded | Teachers and students |
  | Late       | L   | blank    | Teacher only          |
  | Incomplete | I   | blank    | Teacher only          |
  | Absent     | A   | blank    | Teacher only          |

- **D15.** Late and Missing are applied automatically.
  - **Late:** `submittedAt > dueAt`.
  - **Missing:** `dueAt` (or `closeAt` when there's no due date) has passed with no submission.
  - Auto flags render differently from manual ones.
  - Auto flags can be cleared, and a cleared auto flag stays cleared (`suppressedAuto` on the mark). Auto-Missing clears on its own when work arrives.
  - A per-teacher setting turns auto flags off.
  - Auto flags never fire on a not-assigned cell (D25).
- **D16.** Flags, categories, the proficiency scale and method, and the student-visibility defaults form a **settings configuration**. A teacher can keep several, save them for later, and apply one to any number of classes.
  - A class uses at most one configuration. A class with none uses the built-in defaults. Every teacher starts with one configuration named **My settings**, seeded with the defaults, and it can be renamed or deleted like any other.
  - The settings modal opens on the current class's configuration. Its first card holds:
    - **Configuration**: a dropdown grouped into **Personal**, **PLCs** and **District**, with icon buttons to rename, duplicate and delete it, and **+ New**. New starts from the defaults; duplicate copies the one shown. Both open the name field for typing.
    - **Applies to**: a select-style field listing the classes that use this configuration. It opens a checklist of **every** gradebook class, and a class on another configuration shows that configuration's name beside it. Any class can be checked or unchecked, and the menu stays open while picking:
      - Checking a class on another configuration moves it here, so a class is never on two, and a toast with Undo says so ("Moved Period 6 from Honors to My settings").
      - Checking an unassigned class toasts "Period 2 now uses My settings". Unchecking toasts "Period 2 now uses the default settings".
      - So a teacher sets up one configuration and applies it to every section without switching classes.
    - Delete confirms in place and names how many classes go back to the default settings.
  - Every edit saves as it happens and can be undone, like the rest of the gradebook.
  - A PLC's published set appears under **PLCs**. It is read-only, with "Your PLC lead manages this configuration" and **Open in PLC**. Applies to still works, which links those classes to the PLC set so the PLC's changes apply automatically, and duplicate copies it into Personal to customize.
  - **District configurations** appear under **District**, read-only, with "Your district manages this configuration for your building". Applies to and duplicate work the same way as for a PLC set.
    - Admins create them in **Admin Settings › Gradebook** with the same editor, name each one, and target it to one or more buildings. Only teachers whose profile building is targeted see it.
    - An admin can mark one district configuration as the default for its buildings.
  - A new class starts on, in order: the PLC set when the teacher belongs to exactly one PLC that has published one, then the building's default district configuration, then the built-in defaults.
  - **How the PLC sets it up.** The PLC page's **Settings** section gains a **Gradebook** subsection. It uses the same editor component as the teacher modal (flags, categories, proficiency scale and method, student visibility) and saves to `plcs/{plcId}/meta/gradebookSettings`.
    - The lead and co-leads can edit it. Members and viewers see it read-only.
    - Members get a **Use in my gradebook** button that opens the same class checklist and links the chosen classes in one step.
    - The PLC's proficiency cutoffs are the existing `masteryCutoffs` on `plcs/{plcId}/meta/learningTargets`, so Learning Targets and the gradebook always show the same bands. The Gradebook subsection edits that field directly and does not keep a second copy.
- **D17.** Target proficiency uses a scale and a method, both chosen in the settings configuration.
  - **Scale:** the **district scale**, a **PLC scale** or **Custom**. The district scale is set by admins for the whole organization in a new **Admin Settings › Gradebook** tab: three level names and two cutoffs (default Proficient 80, Approaching 60, Beginning), shown to teachers as "{organization} district scale". It is the default for every new configuration.
  - A **PLC scale** is that PLC's `masteryCutoffs`. A custom scale lets the teacher rename the three levels (default Proficient, Approaching, Beginning) and set the two cutoffs directly in the modal; the bottom level is everything below the middle cutoff. The district and PLC scales show read-only.
  - **Method** (labelled "Combine evidence"): mean, most recent, highest, or decaying average (new evidence weighted 65 %, the default).
  - Every band, color, chart gridline and "% at {top level}" metric reads the chosen scale.
  - A flag-valued score (Missing's 0) counts toward the points grade but is never proficiency evidence, and neither is an excused or awaiting-grade cell.
- **D18.** Grading periods (Q1–Q4, S1/S2, with dates) are defined by admins **per building**, and one period set can be shared by several buildings.
  - The gradebook defaults to the current period and also offers All and a custom range.
  - A column belongs to a period by `dueAt`, falling back to `openAt`, then `createdAt`.
  - The Overall column is for the selected period.

### Grid

- **D19.** Layout:
  - Columns run oldest to newest by `dueAt` (fallback as in D18). On open the grid scrolls to the newest.
  - Overall is the column directly right of the name. Both are frozen, so they stay in place while the assignment columns scroll horizontally.
  - The page uses SpartBoard's full-page look (PLC and Admin Settings): the brand-blue gradient header holding the title, the Grades / Data analysis tabs and close, a white sub-bar, a `slate-50` body, white `rounded-xl` panels, Lexend, lucide icons, and the admin primitives for buttons, selects, switches, menus and modals. There is no dark theme.
  - Chrome stays minimal: the sub-bar holds only the class and grading period selects, the View and Filter menus, and four icon buttons (privacy, export, settings, help). View options (percent or points, proficiency colors, name format, sort) sit in one **View** menu, and filters (category, activity type, needs grading) in one **Filter** menu that shows a count when a filter is on.
  - A column header shows only the activity-type icon, the title and the due date, plus a dot when scores are unpublished. Category, points and publish details live in the header popover.
  - A row shows the name and a missing count when there is one; roster groups stay out of the grid.
  - A cell shows a percent by default. Proficiency colors are off by default and tint only the number when on. Flags appear as one small corner chip (a count when several apply), and a comment as a corner mark.
- **D20.** Sorting:
  - The default is last name A–Z.
  - The name header cycles "Last, First" / "First Last" and the sort key.
  - Any column header, or Overall, sorts by score.
  - Extra sorts: missing count, a flag, a roster group.
  - Saved per teacher per class.
- **D21.** Cell popover, anchored to the cell. Everything a teacher needs is open at once; nothing sits behind a collapsed section:
  - **Header**: the student's name, then the assignment, submission date, days late and "Not published". When written answers are ungraded it adds a short **2 ungraded** link that opens that student's grader; per-question changes there flow back into the computed score.
  - **Autosave, no Save button.** The score and the comment save when the popover closes: a click outside, Esc, another cell, or an arrow key. Enter in the score box saves, closes and moves focus to the cell below, so a column can be keyed in quickly. Each save shows a toast with **Undo** and writes a history entry. A score outside 0 to twice the max is not saved, and the toast says so.
  - **Score row**: the score box with **/ max** beside it, and the flag picker at the end of the same row.
    - A small fill-down arrow inside the score box writes this score to the empty cells **below this row** in the current sort (no submission, no override, no flag). It applies at once and one Undo reverts the whole fill.
    - An overridden score shows "Calculated 80 %" struck through with **Revert** on one quiet line below. Multiple attempts (D11) show on that line too.
  - **Flags**: one select-style button that opens a multi-select menu listing every flag with its color chip, key and an "auto" mark, so the row stays one line however many flags a teacher defines.
  - **Comment**: always open, private by default, with a **Share with student** switch. The per-question comments the teacher left in the grader (`overallComment` on written-answer grades) are listed read-only above the box, tagged with the question number. A shared comment appears once that student's results are published.
  - **Footer**: **History** (D24) expands in place, and **Publish / Unpublish for {first name}** sits opposite it.
- **D22.** Header popover, anchored to the column header:
  - **Top-right icon buttons** act on the assignment: sort rows by this column (again to reverse), edit the assignment in its own editor, hide the column, and delete the assignment. Delete confirms in place and says that student work and scores are removed for everyone.
  - **Results, Analyze, Publish / Unpublish** as equal-width buttons across the popover. **Results** opens the existing Quiz, VA or GL Results component in a large modal (edits show in the grid live), and **Analyze** opens the class-level modal (D28). LMS-attached assignments add **Push scores**, pushing final scores (D9) under RR-06: awaiting-grade is omitted and excluded never pushes a 0.
  - **Setup rows**, always visible with no section title: **Category**, **Total points**, **Retakes** (use latest, use highest, or average them: the D11 attempt policy), **Standards**, and a **Counts toward overall** switch. Standards open a searchable multi-select of the whole standards catalog, selected first, since a course can have dozens (D29).
  - **Mark all**: "Empty cells" plus a select of **0 points** and every flag, and **Apply to N**. It applies at once as one undoable bulk entry.
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
- **D29.** Target tagging is extended to Video Activity and Guided Learning questions, reusing `TargetPicker`. A whole column (a project, flashcard set or mini-app) can be tagged from the header popover's Standards row, and its overall percent then counts as evidence for those targets.
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
  - What students see is set per class by the class's settings configuration (the teacher's own or a PLC's):
    - **On by default:** published final scores (overrides applied), student-visible flags, and shared comments.
    - **Off by default:** standards mastery, per target and standard with its evidence, using the teacher's method and bands.
    - **Not in v1:** overall grade, category grades, trend and what-if.
  - A row opens that activity's existing results review, which also shows the final score through D9.
- **D36.** Students see only flags set to "Teachers and students" (D14). Students never see a class average, rank or any other student's data. Changes show as in-page **New** badges until the student views them: a new published score, a new shared comment, or a new Missing flag. There is no email or push notification.
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
| `users/{uid}/gradebook_settings/{configId}`     | teacher     | D16 named configuration: `name`, `isDefault`, flags (`key`, name, color, value, visible), categories, scale choice and custom levels, method, student visibility, auto-flags on/off                        |
| `users/{uid}/gradebook_classes/{rosterId}`      | teacher     | per-class state: `configRef` (a personal or district `configId`, a `plcId`, or none), sort, name format, cell format, card layouts                                                                         |
| `plcs/{plcId}/meta/gradebookSettings`           | PLC lead    | D16 shared settings set; its cutoffs live in the existing `plcs/{plcId}/meta/learningTargets.masteryCutoffs`                                                                                               |
| `gradebook_district_configs/{configId}`         | admin       | D16 district configuration: `name`, `buildingIds[]`, `isDefault`, and the same fields as a personal configuration. Teachers read only the ones targeting their building                                    |
| `admin_settings/gradebook`                      | admin       | D17 organization proficiency scale `{ proficient, approaching, levelNames[3] }`, default 80 / 60, edited in Admin Settings › Gradebook                                                                     |
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
5. **Tagging, export and periods.** VA and GL target tagging (D29), CSV and Sheets export (D30), admin grading-period sets per building (D18), the Admin Settings › Gradebook tab for the organization proficiency scale (D17) and district configurations targeted to buildings (D16), the PLC Gradebook settings subsection (D16), and LMS push from the header (D22).
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
