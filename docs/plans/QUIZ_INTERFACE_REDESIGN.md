# Quiz Interface Redesign — Implementation Plan

**Date**: 2026-08-26 · **Branch**: dev-paul · **Status**: Design approved via interactive prototype (not started)

Redesign of the teacher-facing quiz experience, agreed via design interview and signed off on an
interactive prototype (Claude artifact "Quiz Monitor Redesign", session e4cd72ba). Priority 1:
live monitor. Priority 2: quiz library. The prototype is the visual/interaction source of truth;
this doc records the model so implementation can proceed without the artifact.

## Approved design model — live monitor

The monitor is a **calm default face + drill-downs**, not a dashboard of panels.

### Default face (the whole widget at rest)

1. **Header bar** — OPS Primary Blue, white Lexend quiz title, "Live/Paused" pill.
2. **Current-question card** (teacher-paced only) — Blue Lighter rounded panel (NO left-border
   accent stripes anywhere): question text, "Q4 of 8", "14 of 24 answered" + slim progress meter,
   `Next →` button. Self-paced: quiet one-line "Self-paced · N questions" variant.
3. **Three tappable status buckets** — `Not started | In progress | Done`, big Blue Dark
   tabular numbers; small red "N need help" flag on In progress. Tapping a bucket keeps the cards
   in place and **expands the roster list inline below**; tapping again collapses; tapping another
   bucket swaps the list.
4. **Footer** — `Pause` (primary), `End` (secondary), and a `⋯` overflow menu (proper dropdown,
   Lucide icons, divider-grouped): Present to class / Question results · Show join code / Copy
   join link · Quiz settings.

Nothing else. No icon-only toggles, no persistent join code, no stat tiles.

### Inline roster list (per bucket)

- **Needs-help section pinned first** (In progress only): hand-raised and stuck students with
  reason ("Raised hand · Q4", "No activity 3 min · Q3") and one-tap action (Clear / Nudge).
  Soft red row tint, no border stripe. Everyone else below.
- **Toolbar** (In progress + Done only; hidden on Not started):
  - `Scores` toggle — off by default (projector-safe); on = blue score pill per row. Replaces the
    `scoreRevealApproved` confirm-dialog flow.
  - `Tab warnings` toggle — red warning icon + count for students who left the quiz tab.
  - `Proficiency colors` toggle — row background tint by score: green ≥80, yellow 60–79,
    orange 40–59, red <40 (soft tints, text stays `#333`).
  - `Sort` select — First name / Last name / Status / Score (desc).
  - `Filter` select — Everyone / Score 80%+ / 60–79% / below 60% / Left quiz tab; empty-state
    line when no match. Needs-help stays pinned regardless of sort/filter.
- All toggle/sort/filter choices persist per teacher (widget config), shared across buckets.

### Drill-down screens (in-widget navigation, Back button top-left, one screen at a time)

- **Question results** (via ⋯): list of questions with answered counts → tap → distribution
  bars (Blue Lighter fill, counts). **Correct answer is never indicated while the session is
  live** — a lock note says it appears in results after the session ends.
- **Join code** (via ⋯): on-demand only (SSO districts don't use codes) — big Blue Dark code,
  join URL, Copy link.
- **Present to class** (via ⋯): fullscreen class-safe display — Blue Dark background, white
  Lexend, join code (teacher-paced only where relevant), "19 of 24 finished". Explicitly never
  shows names or scores. Exit button returns to the private monitor.

### Student-side (approved as-is)

- **Raise hand** button under the answers (OPS red outline; filled = "Hand raised — help is
  coming"). Writes `handRaisedAt: Timestamp | null` on the response doc (new optional
  `QuizResponse` field, additive). Teacher Clear writes null. Update `firestore.rules` if
  response-field validation applies.
- **Pause overlay**: fullscreen Blue Dark "Paused — eyes up" / "Your answers are saved."
  Upgrade `QuizPausedPlaceholder.tsx`.
- Stuck heuristic: `status === 'in-progress'` && `now - lastWriteAt > ~120s`, client-side
  ticker, no schema change.

### Visual language — OPS brand (Mode 1, light)

Per the ops-brand-guidelines skill / DESIGN.md tokens:

- Light canvas: white widget card, `#f3f3f3` page ground. **Solid, not glass** — stays legible
  over any user dashboard background.
- Blues: `#1d2a5d` (headings/numbers/Present bg), `#2d3f89` (header bar, primary buttons,
  in-progress dot), `#4356a0` (hover), `#eaecf5` (callouts/pills/fills).
- Red `#ad2122`/`#c13435` reserved for "needs help" semantics (flags, hand-raise, stuck, tab
  warnings). Done/proficiency-green `#2e7d4f` is the one off-palette semantic color.
- Type: Lexend (headings, numbers, buttons, labels), Roboto (body/rows). Body text `#333`.
- **No border-accent stripes** (no colored left edges) — flat tinted fills only. Buttons 6px
  radius; menu = white dropdown, shadow, blue stroke icons.

### Rejected along the way (do not re-introduce)

- Dark glassmorphism monitor, neon/emoji, purple hand-raise accent, translucent card-on-card.
- Icon-rail toggles for revealing sections (mystery-meat; replaced by drill-downs + ⋯ menu).
- Anonymous student tiles as a "projector mode" (replaced by the separate Present screen).
- Persistent join-code bar; correct-answer highlight in live drill-in; question chip strip on
  the default face.

## Current-state map (from code exploration)

- `components/widgets/QuizWidget/Widget.tsx` (2274 L) — orchestrator; view state persisted in Firestore `QuizConfig.view` (`'manager' | 'import' | 'editor' (dead) | 'preview' | 'results' | 'monitor'`); every view change is a Firestore write via `updateWidget`.
- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx` (2978 L) — the monitor. Body markup duplicated between active (~L1035–1720) and waiting/ended (~L1700–2100) branches.
- `components/widgets/QuizWidget/components/QuizManager.tsx` (2539 L) — library + active + archive tabs plus 6 modals; library concerns start at `LibraryTabContent` (~L1760). Uses shared `components/common/library/*` primitives.
- `hooks/useQuizSession.ts` (2680 L) — `useQuizSessionTeacher` (L766): onSnapshot on `quiz_sessions/{id}` + `/responses`; actions advance/end/pause/removeStudent/unlock/reveal.
- `hooks/useQuizAssignments.ts` (2200 L) — assignment lifecycle (19 methods).
- Student app: `components/quiz/QuizStudentApp.tsx` (3762 L); student hook `useQuizSessionStudent` (`useQuizSession.ts:1447`).
- Data model: `QuizSession` (`types.ts:3253`), `QuizResponse` (`types.ts:3528`, has `lastWriteAt`), `QuizConfig` (`types.ts:3838`).
- Other consumers of `QuizLiveMonitor`: `components/plc/assignments/PlcQuizSessionContent.tsx`, `components/dev/SessionViewsDevHarness.tsx` (use the dev harness for iteration).
- Constraints: `skipScaling: true` → sizing via container-query `min(px, Ncqmin)` inline styles; response-key duality (`pin-{period}-{pin}` vs auth uid) — never mix keys in student actions.

## Phase 1 — Live monitor rebuild

Rebuild `QuizLiveMonitor` to the approved model, **keeping `useQuizSessionTeacher` and the
existing prop contract** (so `Widget.tsx`, `PlcQuizSessionContent`, and the dev harness keep
working). New composition in `components/widgets/QuizWidget/components/monitor/`:

1. `MonitorShell` — header + in-widget screen navigation (home / question results / question
   detail / join code) + footer; single body for all session states.
2. `CurrentQuestionCard` — teacher-paced card + self-paced variant.
3. `StatusBuckets` + `RosterList` — the three buckets with inline expand; needs-help pinning;
   toolbar with Scores / Tab warnings / Proficiency colors toggles + Sort + Filter (persisted
   in widget config).
4. `QuestionResults` + `QuestionDetail` — counts-only distribution bars, correct-answer lock
   while live.
5. `JoinCodeScreen` — on-demand code display.
6. `PresentMode` — fullscreen class-safe overlay (portal within `DashboardView`).
7. Overflow menu component (Lucide icons, grouped).
8. Student-side: raise hand + `handRaisedAt`; pause overlay upgrade.

Settings toggles (podium `showPodiumBetweenQuestions`, tab warnings `tabWarningsEnabled`, new
scoreboard-sync toggle) surface together under Quiz settings (⋯ menu).

## Phase 1.5 — Results view alignment

`QuizResults.tsx` (2318 L, rendered from `Widget.tsx` for ended sessions / assignment review)
still follows the old design. Functionality is largely right — this phase is a visual/structural
catch-up to the Phase 1 monitor language, not a feature rebuild:

1. Adopt the monitor shell vocabulary: blue header bar + status context, Blue Lighter summary
   card, calm default face with drill-down screens instead of dense everything-at-once panels.
2. Reuse the `monitor/` primitives where they fit (distribution bars from `QuestionDetail`,
   roster row styling, proficiency band tints, toolbar toggle chips) rather than duplicating.
3. Keep existing capabilities intact: per-student breakdowns, per-question analysis, grading/
   manual scoring, export, unlock-results actions.
4. Scores are appropriate here (session is over) — no projector-safety hiding, but keep the
   same sort/filter/toggle patterns and persisted-config conventions as the monitor roster.

## Phase 2 — Quiz library restyle

1. Extract library tab from `QuizManager.tsx`; align with the shared library primitives.
2. **List view is the default**, cards behind a view switcher (choice remembered). Compact rows:
   title, status badge, question count · edited date, kebab.
3. Status badges: "Live now" (→ monitor) and "Assigned · periods" (→ Active tab); reuse
   `buildQuizBadges` + `useQuizAssignments`.
4. Folders, bulk selection, reorder, preview, kebab actions unchanged.

## Phase 3 — Cleanup (opportunistic, same PRs)

- Remove dead `'editor'` member from `QuizConfig.view`.
- Move ephemeral view state (tab clicks, view-mode toggles) out of Firestore config into local
  state where persistence isn't genuinely wanted — audit `setView` call sites first.

## Validation

- Iterate via `components/dev/SessionViewsDevHarness.tsx` (add fixtures: stuck, hand-raised,
  tab-switch counts, score bands for proficiency colors).
- Unit tests: stuck heuristic, projector safety (Present shows no names/scores; Scores off by
  default), live correct-answer lock, sort/filter logic, hand-raise write/clear.
- `pnpm run validate` green before every push; `pnpm run test:rules` if `firestore.rules` changes.
- Manual pass on dev preview: teacher-paced + self-paced, widget-size + Present mode, toggles
  persistence.
