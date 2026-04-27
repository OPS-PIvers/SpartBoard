# Test Coverage Gaps — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Monday_
_Last audited: 2026-04-22_
_Last action: 2026-04-27_

---

## In Progress

_Nothing currently in progress._

---

## Open

### HIGH hooks/ coverage — session hooks still missing tests (partial progress)

- **Detected:** 2026-04-13
- **Progress (2026-04-27):** Added test coverage for `useQuizSessionTeacher` (16 tests). Covers `removeStudent` (deleteDoc-by-responseKey path + null-sessionId no-op), `revealAnswer` (dotted-path updateDoc), `hideAnswer` (deleteField sentinel at dotted path), `endQuizSession` (status='ended' + endedAt + autoProgressAt-null patch, finalizeAllResponses sweep that touches only joined/in-progress responses and skips already-completed ones, no batch.commit when nothing needs finalizing, null-sessionId no-op), and `advanceQuestion` (no-op before session loads, review-phase gate when `showPodiumBetweenQuestions` is enabled, student-paced mode skipping review, advance-to-next-index path, `startedAt` set on first advance and preserved on later ones, pass-through when already in `reviewing` phase, and the advance-past-end path that flips to 'ended' + clears `questionPhase` via `deleteField` + invokes `finalizeAllResponses`). Test count for this file is now 40 (24 prior + 16 new). The auto-progress effect is the remaining untested teacher-side path; deferred because driving it requires a real-time mock of the responses subcollection callback in tandem with the session state.
- **Progress (2026-04-22):** Added test coverage for `useQuizSession.ts` (24 tests). Covers pure helpers (`normalizeAnswer`, `gradeAnswer` across MC/FIB/Matching/Ordering, `toPublicQuestion` including `correctAnswer` strip-off for each question type) and `useQuizSessionStudent` student-join logic (`lookupSession` empty/no-match/all-ended/joinable-picker paths; `joinQuizSession` invalid-code/empty-PIN/no-session/all-ended throws, most-recent-joinable selection, PIN truncation to 10 chars, code normalization, and `classPeriod` backfill on existing responses).
- **Progress (2026-04-20):** Added initial test coverage for `useLiveSession.ts` (9 tests covering `joinSession` input validation and sanitization — code normalization, PIN truncation, duplicate-PIN rejection, self-rejoin allowance, and all error paths). Also confirmed pre-existing coverage for `useGuidedLearningSession.ts` (pure-helper test) and `useGoogleDrive.ts` / `useStorage.ts` (full test files in `tests/hooks/`). Remaining critical hooks with zero coverage:
  - `useQuizSession.ts` — teacher-side action tests landed 2026-04-27 (advance/end/reveal/remove). Auto-progress effect (responses-listener-driven) still untested.
  - `useVideoActivity.ts` / `useVideoActivitySession.ts` — video activity session management
  - `useMiniAppSession.ts` — mini-app assignment session lifecycle
  - `useRosters.ts` — roster CRUD, student list management
  - `useImageUpload.ts` — image upload handling with Firebase Storage
  - `useFirestore.ts` — core Firestore CRUD for dashboards
  - `useStarterPacks.ts` — starter pack template management
  - `useScreenRecord.ts` — screen recording lifecycle
  - `useLiveSession.ts` — needs deeper coverage (teacher actions: `startSession`, `updateSessionConfig`, `endSession`, `toggleFreezeStudent`, `toggleGlobalFreeze`)
- **File:** hooks/ directory
- **Fix:** Next priority: cover `useQuizSession`'s auto-progress effect (drive both `onSnapshot` callbacks so the responses-listener-driven advance fires), then expand `useLiveSession` to cover teacher-mode actions (`startSession`, `updateSessionConfig`, `endSession`, `toggleFreezeStudent`, `toggleGlobalFreeze`). Use Vitest with mock Firebase adapters. See `tests/hooks/useLiveSession.test.ts` and the `useQuizSessionTeacher` block in `tests/hooks/useQuizSession.test.ts` as reference patterns.

### MEDIUM utils/ coverage — 28 of 41 utility files have no tests

- **Detected:** 2026-04-13
- **Progress (2026-04-22):** Count improved from 31 untested (2026-04-20) to 28. Since last audit, `ai.ts`, `ai_security.ts`, and `classlinkService.ts` gained test files. Currently 13 utils are tested. Still untested high-priority utilities:
  - `googleDriveService.ts` — Google Drive dashboard sync service
  - `googleCalendarService.ts` — Google Calendar API integration
  - `guidedLearningDriveService.ts` — guided learning material sync from Drive
  - `imageProcessing.ts` — image manipulation (resize, crop, compress)
  - `pexelsService.ts` — Pexels stock image API integration
  - `quizAudio.ts` — quiz audio generation utilities
  - `quizDriveService.ts` — quiz import/export via Google Drive
  - `soundboardConfig.ts` — sound configuration parser
  - `security.ts` — XSS prevention and input sanitization (pure, no deps, high value)
  - `slug.ts` — URL slug generation (pure, easy to test)
  - `backgrounds.ts` — background format detection and CSS generation (pure)
  - `urlHelpers.ts` — URL parsing and manipulation (pure)
  - `widgetHelpers.ts` — widget layout and config default helpers (pure)
- **File:** utils/ directory
- **Fix:** Start with pure utilities with no external dependencies (security.ts, slug.ts, backgrounds.ts, urlHelpers.ts, widgetHelpers.ts) — all are testable without mocking. Then add service wrappers (googleDriveService, pexelsService) using vi.mock() for fetch/API calls.

### LOW widget test coverage — most of 58 widgets have no component tests

- **Detected:** 2026-04-13
- **Progress (2026-04-22):** Confirmed 7 test files exist (up from 6 last audit). Total widget count is now 58 (blooms-detail added). ~51 widgets remain untested.
- **File:** components/widgets/ directory
- **Detail:** Only 7 test files exist for widget components. The vast majority (51+) have no automated tests. This means regressions in widget rendering, config persistence, and settings panels go undetected.
- **Fix:** Focus first on high-complexity widgets: PollWidget (live session sync), QuizWidget, RevealGridWidget, ChecklistWidget. Use React Testing Library with Vitest. Mock useDashboard() and useAuth() hooks.

---

## Completed

_No completed items yet._
