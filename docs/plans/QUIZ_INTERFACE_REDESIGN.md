# Quiz Interface Redesign — Implementation Plan

**Date**: 2026-08-26 · **Branch**: dev-paul · **Status**: Planned (not started)

Redesign of the teacher-facing quiz experience, agreed via design interview.
Priority 1: live/in-progress quiz monitoring. Priority 2: quiz library.

## Agreed design decisions

| Decision              | Choice                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver                | #1 dated/inconsistent visuals, #2 glanceability, #3 actions, #4 info                                                                                                                                  |
| Scope                 | UX + new features; data-model changes allowed where needed                                                                                                                                            |
| Contexts              | Private teacher screen, projected to class, resizable dashboard widget                                                                                                                                |
| Default density       | Calm overview (status per student); all detail one tap away                                                                                                                                           |
| Primary glance signal | Student tile grid, color-coded by status                                                                                                                                                              |
| Privacy               | Single **Private / Projector** toggle replacing the per-session score-reveal confirm gate; Projector = anonymous progress tiles (no names-with-scores)                                                |
| Question drill-in     | Question strip; tap any question (teacher-paced **and** self-paced) → live answer-distribution bars, correct answer highlighted                                                                       |
| Stuck signal          | Activity-based (derived from `lastWriteAt`) **plus** student-side "raise hand" button                                                                                                                 |
| Raise hand UX         | Tile badge + prominence; teacher taps to clear; student sees "help is coming" until cleared                                                                                                           |
| Pause UX              | Full-screen "eyes up" overlay on student screens; answers preserved                                                                                                                                   |
| Existing features     | Keep all (podium, scoreboard sync, tab warnings, period chips), each toggleable in quiz/session settings                                                                                              |
| Fullscreen            | Maximize toggle expanding the monitor to fill the dashboard                                                                                                                                           |
| Library               | Restyle to the shared Widget Library pattern (search/filters/folders) + "Live now" / "Assigned" status badges on quiz cards linking to the session. No deeper search or AI-on-library-surface for now |
| Rollout               | Ship directly on dev-paul (no feature flag); monitor first, then library                                                                                                                              |

## Current-state map (from code exploration)

- `components/widgets/QuizWidget/Widget.tsx` (2274 L) — orchestrator; view state persisted in Firestore `QuizConfig.view` (`'manager' | 'import' | 'editor' (dead) | 'preview' | 'results' | 'monitor'`); every view change is a Firestore write via `updateWidget`.
- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx` (2978 L) — the monitor. **Body markup duplicated** between active (~L1035–1720) and waiting/ended (~L1700–2100) branches (join-code bar, period chips, stat tiles, roster block ×2).
- `components/widgets/QuizWidget/components/QuizManager.tsx` (2539 L) — library + active + archive tabs plus 6 modals in one file; library concerns start at `LibraryTabContent` (~L1760). Uses shared `components/common/library/*` primitives (`LibraryShell`, `LibraryToolbar`, `useLibraryView`, folders, bulk selection).
- `hooks/useQuizSession.ts` (2680 L) — `useQuizSessionTeacher` (L766): onSnapshot on `quiz_sessions/{id}` + `/responses`; actions advance/end/pause/removeStudent/unlock/reveal.
- `hooks/useQuizAssignments.ts` (2200 L) — assignment lifecycle (19 methods).
- Student app: `components/quiz/QuizStudentApp.tsx` (3762 L); student hook `useQuizSessionStudent` (`useQuizSession.ts:1447`).
- Data model: `QuizSession` (`types.ts:3253`), `QuizResponse` (`types.ts:3528`, has `lastWriteAt`), `QuizConfig` (`types.ts:3838`).
- Other consumers of `QuizLiveMonitor`: `components/plc/assignments/PlcQuizSessionContent.tsx`, `components/dev/SessionViewsDevHarness.tsx` (**use the dev harness for iteration** — fixtures, no real session needed).
- Constraints: `skipScaling: true` → all sizing must be container-query `min(px, Ncqmin)` inline styles; existing anti-leak gate `scoreRevealApproved` resets per session; response-key duality (`pin-{period}-{pin}` vs auth uid) — never mix keys in student actions.

## Phase 1 — Live monitor rebuild

Rebuild `QuizLiveMonitor` as a new composition, **keeping `useQuizSessionTeacher` and the existing prop contract** (so `Widget.tsx`, `PlcQuizSessionContent`, and the dev harness keep working). Extract into `components/widgets/QuizWidget/components/monitor/`:

1. **`MonitorShell`** — single body used for all session states (waiting/active/paused/ended) with state-conditional sections. Deletes the duplicated branches.
2. **`StudentTileGrid`** — replaces `StudentRow` list. Tile = name (private mode), status color (joined = neutral, working = blue, stuck = amber, done = green, hand = highlighted + badge), progress ring/count, score pill (private mode only). Tap tile → per-student detail popover (per-question answers, remove / unlock actions — reuse existing action props).
   - Stuck heuristic: `status === 'in-progress'` && `now - lastWriteAt > threshold` (start ~120 s, computed client-side on a ticker; no schema change).
3. **`PrivacyToggle`** — one Private/Projector switch in the header. Replaces the `scoreRevealApproved` confirm-dialog flow; Projector mode renders anonymous tiles (no names, no scores) and suppresses score reveals everywhere. Default per session = Projector (safe).
4. **`QuestionStrip` + `QuestionDrillIn`** — horizontal strip of question chips (answered-count badges); tap → distribution bars (extend existing `MCDistribution` to arbitrary question index, computed from `responses[].answers`). Works in teacher-paced and self-paced; in teacher-paced the current question is auto-selected.
5. **Maximize toggle** — expand the widget to fill the dashboard viewport (overlay/portal within `DashboardView`, restore on exit). Grid + drill-in get larger scale in maximized mode.
6. **Actions bar** — pause/resume, end+finalize, reveal/hide answer, advance, join-code copy/open/preview, mute — restyled, single row with overflow.
7. **Settings toggles** — surface podium (`showPodiumBetweenQuestions`), tab warnings (`tabWarningsEnabled`), and a new scoreboard-sync toggle together in quiz/session settings.
8. **Restyle** everything to the glass design language (Tailwind glass card patterns, `cqmin` scale per CLAUDE.md tables, WCAG AA, `text-slate-300/200` on dark).

### Student-side changes (Phase 1)

- **Raise hand**: button in `QuizStudentApp` question runner → writes `handRaisedAt: Timestamp | null` on the student's response doc (new optional `QuizResponse` field; additive, backwards-compatible). Teacher tap-to-clear writes `null`; student shows "help is coming" while set. Update `firestore.rules` if response-field validation is enforced.
- **Pause overlay**: upgrade `QuizPausedPlaceholder.tsx` to a full-screen calm "Paused — eyes up" overlay; answers preserved, resume in place.

## Phase 2 — Quiz library restyle

1. Extract library tab from `QuizManager.tsx` into its own file; align interaction language with the Widget Library (search field, filter affordances, edit mode) while keeping folders, bulk selection, manual reorder, preview pane, and the kebab actions as-is.
2. **Status badges**: join `useQuizAssignments` data to quiz cards — "Live now" (active session; click → open monitor) and "Assigned" (active assignment; click → Active tab). Reuse `buildQuizBadges`.
3. Restyle cards/toolbar to current polish; no search-depth or AI-entry changes.

## Phase 3 — Cleanup (opportunistic, same PRs)

- Remove dead `'editor'` member from `QuizConfig.view`.
- Move ephemeral view state (tab clicks, view-mode toggles) out of Firestore config into local state where persistence isn't genuinely wanted — audit `setView` call sites first.

## Validation

- Iterate via `components/dev/SessionViewsDevHarness.tsx` (add fixtures for stuck/hand-raised states).
- Unit tests: stuck heuristic, privacy-mode redaction (no name/score leakage in Projector mode), drill-in distribution math, hand-raise write/clear.
- `pnpm run validate` green before every push; rules tests (`pnpm run test:rules`) if `firestore.rules` changes.
- Manual pass on the dev preview: teacher-paced + self-paced sessions, widget-size and maximized, both privacy modes.
