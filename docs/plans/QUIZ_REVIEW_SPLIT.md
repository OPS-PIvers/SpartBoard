# Quiz / Review split

Grilled and settled 2026-09-29. Revised 2026-09-30 against `dev-paul` at `3bbacebd1` (see the revision log at the end). Six stacked PRs to `dev-paul`, all behind one preview flag.

## Goal

Most teachers use the Quiz widget for real in-class assessments, and the paced modes and gamification clutter that job for them. The split:

- **Quiz** keeps assessment only. There is no pacing choice, no gamification and no scoreboard sync.
- **Review** is a new widget for live review games: a teacher-paced game and a new timed, self-paced game.

Both widgets work from the same quiz library, so a teacher writes a quiz once and can run it either way.

## Current-state facts that drove the decisions

- **Mode is per assignment, not per widget.**
  - `QuizSessionMode = 'teacher' | 'auto' | 'student'` (`types.ts`) lives on `QuizAssignmentSettings`, `QuizSession`, `PlcAssignmentTemplate`, `PlcQuizEntry` and `QuizMetadata.behavior`.
  - "Assessment Mode" is only Quiz's label for `'student'` (`QUIZ_STUDENT_MODE_LABEL`, `utils/quizBehavior.ts`).
  - `getAssignBehaviorSeed` already forces `'student'` on every assign path.
- **Shared storage.**
  - Quizzes are at `/users/{uid}/quizzes/{id}` plus a Drive file.
  - Assignments are at `/users/{uid}/quiz_assignments/{id}`.
  - Sessions are at `/quiz_sessions/{id}`, one per assignment, with responses in a subcollection.
  - None of these depend on the mode.
- **Student devices never hold the answer key.**
  - Sessions carry `toPublicQuestion` projections (`useQuizSession.ts`). A device learns right or wrong only from `session.revealedAnswers`, which the teacher's client writes on reveal in paced modes. Today's self-paced mode gives no instant feedback.
  - Live scores, podium points and the live leaderboard are computed on the teacher's client in `useQuizSession`.
  - Since #3619 (flag `quiz-score-on-submit`) there is one server grader. The assign writes a teacher-only key to `users/{uid}/quiz_assignments/{id}/key/answers` (`buildScoreOnSubmitKey`, `utils/quizScoreOnSubmit.ts`), and `scoreQuizOnSubmitV1` (`functions/src/quizScoreOnSubmit.ts`) grades a submitted attempt with `plcAssessmentMath`. Since #3635 it refuses to score when a served question is missing from the key.
  - Video Activity already has a per-answer server check, `checkVideoActivityAnswerV1` (`functions/src/videoActivityKey.ts`).
  - `firestore.rules` never reads `sessionMode` on `quiz_sessions` or its responses. The local `sessionMode()` helper reads the unrelated `mode` field (`submissions` / `view-only`).
  - Only the PLC assignment and quiz-header rules validate `sessionMode in ['teacher','auto','student']`.
  - `functions/src/subLaunchAssignment.ts` is the only function that copies pacing fields.
- **Gamification is only partly tied to mode.**
  - Mode-independent: speed and streak bonuses apply in any mode, including self-paced (`QuizStudentApp.tsx`).
  - Paced modes only (skipped when the mode is `student`):
    - podium (`useQuizSession.ts`)
    - reveal / show-on-board (`MonitorShell.tsx` `canReveal`)
    - review phase
    - auto-advance
  - Self-paced only (`student`):
    - shuffle questions
    - per-student modifications (`StudentOverride`)
    - period access
    - question-bank draws (`bankSlots`)
- **Today's self-paced mode is not a game.** Students move back and forth, can change answers, get a light theme, and there is no session-wide timer.
- **The per-quiz saved behavior does more than seed Assign.** It is the only source of settings for the Classroom add-on (`TeacherDiscoveryRoute.tsx`), the Schoology/LTI picker (`LtiDeepLinkPicker.tsx`) and `PlcNewQuizAssignmentModal.tsx`, and it is copied to PLC teammates through synced groups (`useSyncedQuizGroups.ts`, `usePlcQuizActions.tsx`).
  - The editor's Settings tab (`QuizEditorModal.tsx`) holds nothing but this behavior (`QuizBehaviorSettingsPanel`).
- **Scoreboard sync.**
  - Config keys: `QuizConfig.liveScoreboardEnabled/WidgetId/Mode/Scoring`.
  - UI: `monitor/QuizSettingsScreen.tsx`.
  - Push logic: all of it is in `QuizWidget/Widget.tsx`.
  - The Scoreboard side shows a LIVE badge through `ScoreboardConfig.liveQuizWidgetId`.
- **Shared with Video Activity.** `components/common/library/sessionModes.ts`, `BaseSessionOptions` and `QuizBehaviorSettingsPanel`'s sibling panels are also used by VA, which has its own teacher-paced live mode.
- **Launched assignments are editable (#3636).** The In Progress dialog (`QuizAssignmentSettingsModal.tsx`) renders `QuizBehaviorSettingsPanel` with `hideModeSelector` and edits attempts, shuffles, integrity, feedback and gamification in place. Only edited options are mirrored to the live session; the session mode never changes. The same PR adds per-class due dates (`dueAtByRosterId` on the assignment, `dueAtByClassId` on the session, flag `quiz-per-class-due-dates`).
- **Per-class monitor controls (#3603, #3612).** Multi-class assigns now default to an in-class assessment with period access. The monitor's `PeriodBar` (class picker, Start/Pause, extend) renders only when the session has `periodAccess`, and times against the server clock with `useServerNow`.
- **New Quiz menu (#3618).** The library's New button opens Create / Import / Paper test.
- **Multi-blank fill-in-the-blank (#3621, flag `quiz-fib-multi-blank`).** Each blank has its own accepted answers and optional partial credit. The client grader, `plcAssessmentMath` and the score-on-submit key all handle it, so it counts as auto-scored.
- **Gradebook plan (#3623, not built).** `docs/plans/GRADEBOOK.md` D6/D10 turns every quiz session into a scored gradebook column through a server-built `grade_index`.
- **Sizes.** `QuizStudentApp.tsx` is ~5.9k lines, `QuizWidget/Widget.tsx` ~3.9k, `QuizManager.tsx` ~3.4k and `QuizResults.tsx` ~4k.

## Decisions

### Structure and data

- **D1.** One shared quiz library.
  - Review opens the same library manager as Quiz: create, edit, import, AI generate, folders and sharing, over the same quizzes.
  - There is no separate Review document type.
  - Review's New menu offers Create and Import but not Paper test (#3618); a paper test is a Quiz-only thing.
- **D2.** Assignments and sessions stay in `quiz_assignments` / `quiz_sessions`. Both gain `widgetKind?: 'quiz' | 'review'`, written on create.
- **D3.** Untagged (legacy) docs are classified by mode, with no backfill.
  - `teacher` / `auto` → Review.
  - `student` → Quiz.
  - One helper (`getAssignmentWidgetKind`) owns this rule, and every archive and list filter uses it.
  - A paced session already live on a Quiz widget when the flag flips can be finished there but not restarted.
- **D4.** The self-paced game is a new `sessionMode: 'game'`.
  - Quiz's `student` code paths never branch on games.
  - Video Activity gets a narrower mode type that excludes `'game'`, so VA's pickers and rules are untouched.
  - The PLC rule enums don't change, because PLC is Quiz-only.
- **D5.** Old clients: a student tab still running the previous client at the `main` release won't understand `'game'`. This is release-time behaviour; call it out in the promotion PR and don't gate on it.

### Rollout

- **D6.** One `GlobalFeature`, `quiz-review-split`, set up per the CLAUDE.md flag-first rules:
  - `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`, `widget: 'quiz'`
  - also add it to `functions/src/featureMissingDoc.ts`

  It gates the Review widget, the Quiz simplification and the Settings tab removal together:
  - With the flag off, a teacher sees Quiz exactly as it is today and has no Review.
  - With it on, both changes happen at once, so nobody loses teacher-paced before they have Review.

- **D7.** Review also gets its own Feature Permissions row (`canAccessWidget('review')`). A teacher sees Review only if they have that widget permission and `quiz-review-split` is on.

### Quiz after the split

- **D8.** Quiz has no mode picker; every Quiz assignment is `student`.
  - The "Assessment Mode" label disappears from Quiz's own UI.
  - `formatSessionMode` keeps its labels for legacy rows.
- **D9.** Quiz drops, for new assignments:
  - speed bonus, streak bonus, podium, sound effects
  - show-correct-on-board / reveal
  - scoreboard sync: the `QuizSettingsScreen` section and the `Widget.tsx` push

  Quiz keeps Present to class (self-paced view), hand raise, the phone remote, focus mode and every other assessment option, including show score on submit (#3619) and per-class due dates (#3636).

  The In Progress edit dialog (#3636) drops the gamification toggles for Quiz-kind assignments too. A legacy paced assignment still open on a Quiz widget keeps them in that dialog until it ends (D3).

- **D10.** The quiz editor's **Settings tab is removed**, so the editor keeps Questions, Stimuli and Languages.
  - `QuizMetadata.behavior` is no longer read or written for new work, and it is no longer copied to PLC teammates. Existing values stay in place, ignored.
- **D11.** Assessment settings live only on the assignment.
  - Every assign path opens prefilled with this teacher's **last-used Quiz assign settings**, stored per user as a profile field. On first use it falls back to `DEFAULT_QUIZ_BEHAVIOR`.
  - The Assign modal saves the last-used settings on a successful assign.
  - Last-used holds the `QuizBehaviorSettings` only (attempts and `sessionOptions`, so it does remember show score on submit). It never holds classes, due dates, per-class due dates or the period plan.
- **D12.** The Classroom add-on, the Schoology/LTI picker and the PLC new-assignment modal get the same settings panel inline. It sits collapsed behind the one-line `formatBehaviorSummary` with an **Edit** link and uses the same last-used prefill.

### Review: modes and launch

- **D13.** Review is **live in class only**. It never appears in My Assignments, Classroom, LTI or PLC, the sub portal or grade push, and it has no period access. A later homework mode would be v2.
  - The launch never writes `periodAccess`, due dates or `showScoreOnSubmit`, so the monitor's `PeriodBar` never shows for Review.
  - Review sessions are never Gradebook columns. When the Gradebook index is built (`GRADEBOOK.md` PR 1), it skips sessions where `getAssignmentWidgetKind` returns `'review'`. Whichever of the two projects lands second wires this in.
- **D14.** The Start review dialog has two mode cards with plain copy (no brand names):
  - **Teacher-paced:** "Show one question at a time on the board. Everyone answers together and sees the results before the next one." It includes an **Advance automatically when everyone has answered** switch, which maps to `auto`.
  - **Self-paced game:** "Students race through the questions on their own devices for a set time. Missed questions come back until time runs out."
- **D15.** Launch settings live in the Start review dialog only. It is prefilled with this teacher's **last-used Review settings** (a per-user profile field, separate from D11). Nothing about the game is stored on the quiz.
- **D16.** Review keeps:
  - read-aloud and translation
  - focus mode, block copy/paste, tab threshold and tab-away timer
  - hand raise
  - per-student extra time (the time multiplier only; subset, hidden options and rubric/language overrides stay Quiz-only)
  - shuffle question order (self-paced; meaningless in teacher-paced)
  - shuffle answer options
  - question-bank draws (D17)
  - sections (D18)
  - speed and streak bonuses, podium between questions (teacher-paced), sound effects
  - scoreboard sync (both modes)
  - Present to class

  Review has **no** phone remote control.

- **D17.** Question-bank draws: one draw for the whole class in teacher-paced, resolved at launch. In self-paced, each student gets their own draw, as Quiz does now, and their repeats come from their own set.
- **D18.** Sections show as divider cards (title and passage) when a section starts, and questions stay in section order.
  - Teacher-paced: the divider shows on the board and on devices, and choose-N-of-M sections play every question.
  - Self-paced: the divider shows on the device. The student picks N once, and repeats cycle only through their picks.
- **D19.** Questions that can't be scored instantly are skipped: free-response, teacher-scored, media and rubric items. At launch the dialog says "N questions can't be auto-scored and will be skipped." The same quiz stays usable in both widgets.
  - The test is per question and is shared with score on submit (`quizNeedsManualGrading`'s rule in `utils/quizScoreOnSubmit.ts`), so the two features never disagree about what's auto-scorable. Multi-blank fill-in-the-blank is auto-scored and plays.
- **D20.** Students join exactly as they join a quiz today: code plus roster/PIN or SSO. There is no nickname join.
- **D21.** The board leaderboard size is a launch toggle (Top 5, Top 10 or Everyone), default **Top 5**. Each student always sees their own rank on their device.

### Review: self-paced game engine

- **D22.** Timing:
  - The teacher sets the game length at launch: 3, 5, 10, 15 or 20 min, or custom; the default is 10.
  - Each question's own `timeLimit` still applies, stretched by the student's time multiplier.
  - The teacher can **+1 min**, **Pause** or **End game**.
  - When time runs out, an unfinished question doesn't count, and every device goes to the final leaderboard.
  - The game clock lives on the session doc as server timestamps, and every screen counts down against `useServerNow`, as the monitor's `PeriodBar` already does. The server check (D31) rejects answers that arrive after the end time or while the game is paused.
- **D23.** Order:
  - Pass 1 goes through every question, shuffled if that's on.
  - Later passes serve that student's missed questions first, never the same question twice in a row, then reshuffle all of them.
- **D24.** Answers:
  - Right/wrong shows immediately with points, speed and streak bonuses.
  - There is no going back and no changing answers.
  - Every correct answer earns full points, repeats included.
  - A partly correct multi-blank answer earns its partial-credit points but counts as missed, both for the repeat queue and for first-try accuracy.
  - Answers are graded on the server (D31), because the device never holds the key.
- **D25.** Results record **first-try accuracy** for each question separately from total points, so the teacher gets clean learning data from a game that repeats questions.

### Review: board and results

- **D26.** The self-paced board view (widget and Present to class) shows a big countdown, the Top-N leaderboard with rank-change animation, a joined/active count and a live class-accuracy meter. Its controls are +1 min, Pause, End game and **Hide names**. The teacher-paced view reuses the existing paced monitor and the `present/` screens.
- **D27.** After a game:
  - Review's archive keeps it with the final ranking, points and per-question first-try accuracy.
  - This reuses `QuizResults` in points mode, including learning-target grouping.
  - There is no publish-scores step, no grading queue and no grade push.
  - Students see their final rank and points when the game ends.

### Placement and scope

- **D28.** Review is its own widget in the Academic group next to Quiz, with its own icon and colour, and is **not** in new users' default dock. It shares Quiz's building-level admin config (`QuizConfigurationModal`, hand-raise mode) and has no admin modal of its own.
- **D29.** Video Activity is unchanged, including its Settings tab. The shared settings panel gets a `variant: 'quiz' | 'review'` so VA's usage is untouched. A matching VA cleanup is a possible follow-up.
- **D30.** Help content ships in this project: tour anchors, a Help Center article and a Guided Learning live tour (PR 6).

### Added in the 2026-09-30 revision

- **D31.** Self-paced game answers are graded on the server, one answer at a time.
  - When a game launches, Review writes the same teacher-only key doc that score on submit uses (`key/answers`, `buildScoreOnSubmitKey`).
  - A new callable, `checkQuizGameAnswerV1`, is modelled on `checkVideoActivityAnswerV1`. It grades with `plcAssessmentMath` (the same parsing as `scoreQuizOnSubmitV1`), then writes the answer, points, streak and first-try flag to the student's response. It returns right or wrong, the points and the correct answer to show.
  - The speed bonus uses the device's question start time, clamped to the question's time limit and to the time the server received the answer.
  - It refuses to grade a question that isn't in the key, following #3635's rule.
  - Teacher-paced Review keeps today's path: the teacher's client scores, and devices learn the answer from `revealedAnswers`.
- **D32.** Review has no In Progress settings dialog (#3636 is Quiz-only). During a game the teacher can change only the game controls (+1 min, Pause, End) and Hide names. Anything else means ending the game and launching a new one.

## PRs

Stacked in order. Each targets `dev-paul`.

### PR 1: Types, flag, Review shell, archive filter

- Types:
  - `widgetKind` on `QuizAssignment` / `QuizSession`.
  - `'game'` in `QuizSessionMode`, with a narrowed `VideoActivitySessionMode` usage wherever VA borrows the quiz type.
  - The `getAssignmentWidgetKind` helper, with tests for legacy classification.
- The `quiz-review-split` `GlobalFeature` (`types.ts`, `config/featureDefaults.ts`, `functions/src/featureMissingDoc.ts`).
- Register `review` via the `new-widget` skill: `types.ts` `WidgetType`, `config/tools.ts`, `config/widgetDefaults.ts`, `config/widgetGradeLevels.ts`, `WidgetRegistry.ts`, the widget title and analytics labels.
  - Review's front face is the shared library manager in a `review` variant, whose New menu drops Paper test (D1).
  - Launch is stubbed until PR 3.
- Filter Quiz's and Review's assignment archives by kind, only when the flag is on.
- Update type-list tests: `settings.schema.wave11.test.ts`, `WidgetLabels.test.ts`, `featureDefaults.test.ts`.

### PR 2: Quiz simplification and the Settings tab removal (flagged)

- `QuizBehaviorSettingsPanel` `variant='quiz'` hides the Session Mode picker and the gamification toggles. This covers both the Assign modal and the In Progress edit dialog (`QuizAssignmentSettingsModal`, D9). Fold #3636's `hideModeSelector` into the variant so the panel has one switch.
- `MonitorShell` / `QuizSettingsScreen` hide reveal, podium and scoreboard sync for new Quiz sessions.
- Stop the `Widget.tsx` scoreboard push for Quiz-kind sessions.
- Remove the Settings tab from `QuizEditorModal`. Stop writing `behavior` on save and stop copying it in synced groups and PLC flows.
- Store last-used Quiz assign settings per user (D11).
- Add inline collapsed settings panels to the Classroom add-on, LTI and PLC new-assignment paths (D12).
- Tests: `QuizEditorModal`, `QuizManager.assign`, `QuizAssignmentSettingsModal`, `QuizBehaviorSettingsPanel`, `PlcNewQuizAssignmentModal`, the LTI/Classroom pickers and `useSyncedQuizGroups`.

### PR 3: Review launch dialog and teacher-paced

- Start review dialog (D14–D21):
  - mode cards and the auto switch
  - option set per D16, with last-used Review settings per user
  - the skip-unscored notice
  - the board-rank toggle
- Assignments are created with `widgetKind: 'review'` and `teacher` / `auto` mode, with no `periodAccess`, due dates or score on submit (D13).
- Review's archive rows have no settings edit action (D32).
- Class-wide bank draw at launch (D17). Section dividers in paced play on board and devices (D18).
- The Top-N limit is applied to the paced podium, standings and the student leaderboard (D21).
- Scoreboard sync moves under Review.

### PR 4: Self-paced game engine (student app)

- A `'game'` branch in `QuizStudentApp.tsx`, kept in its own module rather than grown inline:
  - repeat queue (D23)
  - per-question timers with the multiplier, and the game clock from the session doc (D22)
  - instant feedback from `checkQuizGameAnswerV1`, no back navigation (D24, D31)
  - choose-N once (D18)
  - final rank screen
- Session fields: game end time, pause state and added time, written by the teacher as server timestamps and read through `useServerNow` (D22).
- Server grading (D31):
  - Write the key doc at game launch.
  - Add `checkQuizGameAnswerV1` in `functions/src/`, sharing the key parsing with `quizScoreOnSubmit.ts`, and list it in `functions/src/index.ts` and `index.test.ts`.
  - Add function tests for right, wrong, partial credit, a question missing from the key, a late answer and a paused game.
- Responses record the first try per question separately from the running points (D25). The callable writes both, not the device.
- The live leaderboard broadcast reuses `liveLeaderboard`.
- Rules:
  - The key doc reuses #3619's teacher-only rule.
  - Make sure a device can't write game points or verdicts itself.
  - Run `check:rules-size` if any rule changes.
- Server contract (built in S4b, `functions/src/checkQuizGameAnswer.ts`):
  - Input `{ sessionId, questionId, answer, startedAt? }`, where `startedAt` is the server-clock ms the device showed the question.
  - It refuses unless `sessionMode` is `'game'` and the session teacher has `quiz-review-split`.
  - The clock is `gameEndsAt` (a Timestamp or ms) and `gamePausedAt` (set while paused) on the session; `status: 'ended'` stops it. Refusals carry `details.reason`: `game-not-started`, `game-paused`, `game-over`, `same-question-twice`.
  - It writes `response.game` (`points`, `streak`, `answered`, `correct`, `firstTry`, `lastCorrect`, `last`) and appends the first try per question to `answers`. Rules refuse student writes to either in a game session.
  - A retried call for the question just answered returns the first result without scoring again.

### PR 5: Self-paced board view and Review results

- The widget and `present/` view per D26: countdown, Top-N with animation, joined count, accuracy meter, +1 min, Pause, End and Hide names.
- Review results: `QuizResults` in points mode showing first-try accuracy, with publish, grading and grade push hidden (D27).
- Scoreboard sync for game mode.
- Gradebook exclusion for Review sessions, if the Gradebook index has landed by then (D13).

### PR 6: Tours and help

- `data-tour` anchors in `config/tourAnchors.ts` for the Start review dialog, the mode cards and the self-paced board view (`tests/tourAnchors.test.ts`).
- Help Center article and GL live tour (`gl-author` skill) delivered as importable files in the PR. Paul imports them; help content lives in Firestore, and agents don't write to prod.

## PR description requirements

Every PR states:

- the gate: `quiz-review-split`, starting at `admin`, plus the Review widget permission at `admin`
- that admins always pass
- the admin path: Admin Settings > Access > Previews (flag) and Widgets (Review) > set to Public

The changelog entry is written when the flag opens to everyone, not at merge.

## Out of scope / follow-ups

- Homework (asynchronous) Review games, and nickname join.
- A matching Video Activity settings cleanup (D29).
- A Review phone remote control.

## Revision log

- **2026-09-30**, checked against `dev-paul` at `3bbacebd1` (34 commits after the plan):
  - Facts: devices hold no answer key; the score-on-submit key and grader (#3619, #3635); editing a launched assignment and per-class due dates (#3636); the monitor `PeriodBar` (#3603, #3612); the New Quiz menu (#3618); multi-blank fill-in-the-blank (#3621); the Gradebook plan (#3623). The scoreboard push has no `utils/quizScoreboard.ts`.
  - Decisions: D1 (no Paper test in Review), D9 (the In Progress dialog also loses gamification), D11 (last-used holds behavior only), D13 (no period access, due dates or score on submit; no Gradebook columns), D19 (shared auto-scorable test), D22 (server clock), D24 (partial credit), and new D31 (server grading for the game) and D32 (no In Progress dialog for Review).
  - PRs: PR 1, 2, 3 and 5 gained items. PR 4 gained the `checkQuizGameAnswerV1` callable and its rules and function tests.
