# Student landing v2 (`/my-assignments`)

Grilled and settled 2026-10-02 against `dev-paul` at `ac39a15c2`, in three rounds with clickable prototypes ([final prototype](https://claude.ai/artifact/1HNDueyupebLr4Mm9JEa67), private to Paul). Five PRs to `dev-paul`. Replaces `docs/specs/M13-student-landing-overhaul-spec.md` (see "What happens to M13" below).

## Goal

A student who signs in with ClassLink sees only their real SpartBoard classes, named the way their teacher named them, lands on the class that is in session right now, and can tell at a glance what they have to turn in, what is just there to study, and what they already finished.

## Current-state facts that drove the decisions

- **Route and tree.** `App.tsx` mounts `/my-assignments` as `StudentAuthProvider > RequireStudentAuth > MyAssignmentsPage`. The page renders a slide-out `StudentSidebar` at every width, `StudentOverview` when no class is picked, and `StudentClassView` otherwise. Both use `AssignmentSections` / `AssignmentListItem`.
- **Why classes show as "Class".**
  - `studentLoginV1` (`functions/src/studentIdentity.ts`) puts every OneRoster section the student is enrolled in into the `classIds` claim, capped at 20 (homeroom, lunch, sections no teacher imported).
  - `getStudentClassDirectoryV1` resolves names with `collectionGroup('rosters').where('classlinkClassId', 'in', …)` and silently drops unmatched IDs. First match wins for co-taught sections.
  - `StudentSidebar.tsx` and `StudentClassView.tsx` still render unresolved claim IDs with the hard-coded name "Class".
  - `MyAssignmentsPage` never reads `directory.status` / `retry`, so a callable error turns every class into "Class".
  - A teacher's rename is the roster's `name` field (`users/{uid}/rosters/{id}`, owner-only in rules); the callable already returns it. Nightly sync does not overwrite it.
- **Period data.** Rosters carry `bellPeriod {buildingId, periodId}`, set automatically by ClassLink import. Building bell schedules live in `feature_permissions/schedule` (`buildingDefaults`), readable by any signed-in user; `utils/bellSchedule.ts` has `resolveBellWindow` / `readBuildingScheduleDefaults`. The directory callable does not return `bellPeriod` today.
- **Seven kinds** come from `hooks/useStudentAssignments.ts` (`KIND_CONFIG`): quiz, video activity, guided learning, mini-app, activity wall, flashcards, projects. Nothing distinguishes "turn in" from "study"; the only hints are `flashcardKind`, walls never completing, and GL sessions never ending.
- **Turned-in check is too loose.** `AssignmentListItem` treats quiz and video activity as done when `responses/{uid}` merely exists, so a half-finished quiz shows as done.
- **Dates.** `dueAt` is never shown on assignment rows. "Due today" on the overview counts every active item. The final sort is by `endedAt ?? createdAt`, not due date.
- **Gradebook.** Auto Late/Missing (GRADEBOOK.md D15) is computed server-side in `functions/src/gradebook/gradeProjection.ts`: Missing = `dueAt` (or `closeAt` with no due date) passed with no submission. Late = submitted after `dueAt`. The student Gradebook tab (`StudentClassView.tsx:131`, label "Gradebook") reads `studentGrades/{uid}/classes/{classId}` and duplicates Completed rows.
- **Student flags.** `useStudentGradebookEnabled` (`hooks/useStudentGrades.ts`) reads `global_permissions/student-gradebook` directly and is true only when Public. Student client code must never read the student's email (`StudentAuthContext.tsx:53`).
- **GL progress.** `useGuidedLearningProgress` writes `guided_learning_sessions/{id}/progress/{uid}` (`furthestStepIdx`, per-step stats) for `playerV2` sessions only; teachers see it only as the aggregate Engagement chart. Flashcards already show per-student study progress to teachers.
- **Design tokens.** Lexend; brand blue `#2d3f89` / dark `#1d2a5d` / lighter `#eaecf5`; brand red `#ad2122`; slate surfaces; per-class colours from `utils/studentClassColors.ts`; kind icons from `KIND_CONFIG`.

## Decisions

### Class list

- **D1.** The class list shows only sections that match a teacher's SpartBoard roster (`classlinkClassId`), named with that roster's `name`. Unmatched sections are hidden. A class with nothing assigned still shows, with an empty state.
- **D2.** A co-taught section is one row. Its name comes from the most recently updated matching roster, and every matching teacher is listed. Work from all of them lands in that class.
- **D3.** If the directory call fails, the page shows an error with a Retry button. It never renders "Class" placeholders.
- **D4.** `studentLoginV1` puts only roster-matched sections into the `classIds` claim, which frees room under the 20 cap. On every page load the directory call re-checks the student's OneRoster sections against rosters; if a newly imported section matches, it re-mints the claims and the client refreshes its ID token silently. A class imported mid-day appears on the next visit without signing out.
- **D5.** Order is bell period, then name. Classes without a bell period go last, alphabetically, with the class's first letter in the period square (in practice, ClassLink import sets the bell period, and Orono has no two classes in one period). The order never changes during the day.

### Landing and auto-select

- **D6.** The directory call also returns each class's `bellPeriod` (building and period). The client resolves "now" with `resolveBellWindow` against the building's schedule, including date overrides.
- **D7.** Auto-select runs on first load, and again when the tab regains focus after more than 10 minutes. A class counts as "now" from 5 minutes before its start until its end. A `/my-assignments/{classId}` path always wins. Once the student picks a class, it never switches under them. No match, or more than one, opens the Overview.

### Work vs resources

- **D8.** Every session gets an explicit Work/Resource field, defaulted by kind: guided learning, Study flashcards, activity walls and mini-apps default to Resource; quizzes, video activities, Check flashcards and projects default to Work. Existing sessions without the field use the kind default.
- **D9.** All seven assign dialogs get one shared toggle, preset by kind, editable later from the session's settings. Wording (Paul's):
  - On: **Submissions Enabled**. "Students will submit this activity for grading. Unsubmitted assignments will be marked as missing or expired automatically."
  - Off: **Study Resource**. "Students can access this resource until it closes. Some activities allow you to track their progress, but students do not submit their work."
  - With Study Resource, the "Due" field becomes "Available until" with a "No end date" option.
- **D10.** A resource shows "Available until {date}" or "No end date" and disappears from the student view once it closes. The teacher can reopen it.
- **D11.** Resources get no gradebook column and never trigger auto Late/Missing. Flipping one to Submissions Enabled adds the column. One rule, shared by the gradebook projection and the student page.
- **D12.** Students see no progress on resources. Teachers do: flashcards already show it; guided learning gets per-student progress (D24).

### Status of work

- **D13.** Work counts as turned in only on a real submission: the response's submitted/completed status for quiz and video activity, `completedAt` for guided learning, `submittedAt` for flashcards Check, the existing pseudonym submission for mini-apps. A started but unsubmitted item shows "In progress".
- **D14.** Past due and still open: the row stays at the top of Assignments and reads **"Missing · still open"** in muted red, with the original due date and "closes {date}" when there is one. This matches the gradebook's Missing. Once it closes, it moves to Completed/Gradebook as Missing. Turned in after the due date, the gradebook shows Late. No banners, and no Missing callout on the Overview.
- **D15.** Due dates are shown on every Work row ("Due today, 11:59 PM", "Due Mon, Oct 5"). Assignments sort Missing-still-open first, then by due date, then no due date.

### Layout (Tabs, "Up next")

- **D16.** Inside a class there are three tabs: **Assignments | Resources | Completed**. When the student gradebook is on, Completed is renamed **Gradebook** and gains the class grade and the Scores/Targets switch at the top; there is never a separate Gradebook tab next to Completed. A class always opens on Assignments; an empty Assignments tab says "You're all caught up" and links to Resources when there are any.
- **D17.** Every Completed/Gradebook row opens the student's own submission in the activity's player (published review, or "Your teacher hasn't shared results yet", or the Missing explanation). A grade row is clickable even when the session is not in the student's assignment list (today it isn't).
- **D18.** Completed shows Missing (closed) rows first, then finished work newest first, with "View results" / "Not graded yet" when the gradebook is off and score, Late, comment marker and NEW when it is on.
- **D19.** The Overview ("Up next") shows, in order: a Live banner only when something is live (hidden entirely otherwise), then Missing-still-open items, items due today, and the next three by due date across classes, with "See all N assignments". No resources, no schedule strip, no Missing callout.
- **D20.** The class header is the class name, with "{period} · {teachers}" under it. No bell times, no "In class now" badge.
- **D21.** Class list rows: a square in the class colour holding the period number, the class name, and one line of plain text: "In class now", else "Missing: N" (muted red), else "N due this week", else the teacher(s). No pills or count bubbles anywhere.
- **D22.** Kind icons stay the `KIND_CONFIG` lucide icons but become flat: pale slate tile, icon in the kind's colour, no gradient or shadow.
- **D23.** Wide (Chromebook and wider): persistent sidebar on the left, segmented tabs (equal thirds, count under the label) at the top of the class. When the sidebar collapses, at the same breakpoint:
  - The top bar shows the current class name with a chevron; tapping it opens the class list as a bottom sheet (with sign-out).
  - Inside a class, the tabs dock in a bottom tab bar: icon above label, count as plain text, selected tab in brand blue, each button at least 48px tall plus `env(safe-area-inset-bottom)`.
  - The bar is a flex sibling below the scrolling area, not an overlay, so the last row always scrolls clear of it, and the scroller keeps its own end padding (CLAUDE.md scroll rule). Add the class view to `tests/e2e/scroll-end-padding.spec.ts`.
  - The Overview has no bottom bar.

### Teachers

- **D24.** Guided learning results and the Assignments hub detail pane show per-student progress: "Slide 7 of 12 · active 2 days ago", from `progress/{uid}`. Sessions without `playerV2` show "Not tracked".

### Release

- **D25.** PR 1 is a bug fix and ships without a flag.
- **D26.** The student page redesign is gated by a new GlobalFeature `student-landing-v2` (stage `preview`, `afterLaunch: 'retire'`). Students are targeted **by class**: the flag doc gains a `betaClassIds` list of ClassLink section IDs, and a student gets the new page when the flag is Public or any of their `classIds` claims is in the list. No email or other PII is read. An admin picks classes in the flag's Previews row. The same check can later serve `student-gradebook`.
- **D27.** The teacher-side Work/Resource toggle (PR 3) gets its own preview flag, `study-resources` (admin first, `afterLaunch: 'retire'`). With it off, no toggle shows and every session uses its kind default (D8), so students on v2 still see the split.
- **D28.** Per-student GL progress (PR 5) gets its own preview flag, `gl-student-progress` (admin first, `afterLaunch: 'retire'`).
- Add each new id to `functions/src/featureMissingDoc.ts`. Admins pass admin/beta gates, so "on for Paul" means Paul plus the other `/admins` for the teacher-side flags.

## PRs

1. **Class list fix** (no flag). D1–D5. `studentLoginV1` claim filter and re-check/re-mint; `getStudentClassDirectoryV1` merges co-teachers and picks the newest roster's name; client drops unresolved IDs, shows error + Retry, refreshes the token when the callable says claims changed. Tests: `functions/src/studentIdentity.test.ts`, `StudentClassView.test.tsx`.
2. **Bell period and auto-select** (`student-landing-v2`). D6, D7, D21 order. The directory returns `bellPeriod`; client resolves "now"; the period-ordered list. Includes the flag registration and `betaClassIds` support (D26), and its Previews-row class picker.
3. **Work/Resource field and toggle** (`study-resources`). D8–D11. Session field across the 7 kinds; shared toggle component in all assign dialogs; "Available until"; gradebook projection skips resources. Needs a rules check that the field is teacher-writable only.
4. **New student page** (`student-landing-v2`). D12–D23. Tabs, Up next Overview, Completed→Gradebook, bottom sheet and bottom bar, flat icons, Missing · still open, due dates, the real turned-in check, grade rows that always open the submission. Scroll-padding e2e coverage.
5. **Per-student GL progress** (`gl-student-progress`). D24.

PR 4 depends on 2 and 3; 1 and 5 are independent.

## What happens to M13

`docs/specs/M13-student-landing-overhaul-spec.md` is superseded by this plan.

- **Folded in:** result visibility on the landing page (per-student publish already shipped through the quiz results drill-down; D17 covers opening results), sections/hooks rework.
- **Dropped from the student landing:** the teacher directory, announcements and lunch menu sections, the `buildingIds` claim, `ResultsModal`, and the section-order admin UI. The Overview was deliberately narrowed to Live + Up next (D19). Revive any of them as a separate plan if wanted.

## Open items

- Paul's prod check of each flag before opening it, and the changelog entry when `student-landing-v2` opens to everyone.
