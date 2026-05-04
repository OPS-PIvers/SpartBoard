# Test Coverage Gaps — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Monday_
_Last audited: 2026-05-04_
_Last action: 2026-04-29_

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

### MEDIUM utils/ coverage — 18 of 53 utility files have no tests

- **Detected:** 2026-04-13
- **Progress (2026-05-04, audit):** Count unchanged at 18 untested but total file count grew from 45 to 53. Since the 2026-04-29 audit, seven new util files were added (`assignmentModesConfig.ts`, `driveAuthErrors.ts`, `logError.ts`, `quizSyncMigration.ts`, `zoomPanMath.ts`, `chunkLoadError.ts`, `quizShuffle.ts`, `zoomMapping.ts`) — five of those eight have tests already (`assignmentModesConfig.test.ts`, `driveAuthErrors.test.ts`, `zoomPanMath.test.ts`, `chunkLoadError.test.ts`, `quizShuffle.test.ts`, `zoomMapping.test.ts`). Good velocity. Still untested as of 2026-05-04:
  - `logError.ts` — structured error logging wrapper (new since 2026-04-29)
  - `quizSyncMigration.ts` — pure read-side mapper for synced-quiz doc shape migration (new since 2026-04-29)
  - `guidedLearningDriveService.ts` — guided learning material sync from Drive
  - `imageProcessing.ts` — image manipulation (resize, crop, compress)
  - `pexelsService.ts` — Pexels stock image API integration
  - `quizAudio.ts` — quiz audio generation utilities
  - `soundboardConfig.ts` — sound configuration parser
  - `plc.ts` — PLC utilities
  - `testClassAccess.ts` — test class access controls
  - `widgetDragFlag.ts` — widget drag state
  - `styles.ts` — style utilities
  - `first5.ts` — First5 widget utilities
  - `periodCompat.ts` — period compatibility utilities
  - (+ 5 more utility/service files)
- **Progress (2026-04-29, action):** Added test coverage for `backgrounds.ts` (21 tests) and `slug.ts` (20 tests). Also corrected prior count: `googleCalendarService.ts` already had a test file.
- **Progress (2026-04-22 → 2026-04-29):** `googleDriveService.ts`, `quizDriveService.ts`, `security.ts`, `widgetHelpers.ts`, `urlHelpers.ts` all gained test files.
- **File:** utils/ directory
- **Fix:** Next priority is `quizSyncMigration.ts` (pure mapper, trivially testable) and `logError.ts` (simple console.error wrapper). Then `soundboardConfig.ts` (pure parser) and `plc.ts` (business logic). Use vi.mock() for service wrappers.

### LOW widget test coverage — significant improvement, ~26 widgets remain untested

- **Detected:** 2026-04-13
- **Progress (2026-05-04, audit):** Total test suite is 185 files / 1771 tests, all passing. No new widget-level tests added since 2026-04-29. Widget count unchanged at ~26 untested. `useSessionViewCount.ts` (added after 2026-04-29) already has a test in `tests/hooks/useSessionViewCount.test.ts`.
- **Progress (2026-04-29):** Test file count grew to 61 widget test files (was 7 on 2026-04-22). New coverage includes ActivityWall, Breathing, Catalyst, Checklist, Classes, ClockWidget, Countdown, DiceWidget, DrawingWidget, Embed, ExpectationsWidget, GraphicOrganizer, GuidedLearning, InstructionalRoutines, LunchCount, MaterialsWidget, MiniApp, NumberLine, PdfWidget, PollWidget, QRWidget, RecessGear, Schedule, Scoreboard, SeatingChart, SmartNotebook, SoundWidget, SoundboardWidget, TalkingTool, TextWidget, TimeTool, TrafficLightWidget, UrlWidget, VideoActivityWidget, Weather, and math-tools/random/stickers sub-components.
- **File:** components/widgets/ directory
- **Detail:** Widgets with no test coverage include: BloomsTaxonomy, Calendar, CarRiderPro, ConceptWeb, CustomWidget (main), First5, HotspotImage, MathToolInstance, MusicWidget, NeedDoPutThen, NextUp, Onboarding, RevealGrid, SpecialistSchedule, StarterPack, SyntaxFramer, WorkSymbols and several sub-components.
- **Fix:** Focus on RevealGrid (has significant CSS scaling debt), NeedDoPutThen, WorkSymbols, and ConceptWeb. These widgets have config logic worth regression-testing. Use React Testing Library with Vitest. Mock useDashboard() and useAuth() hooks.

---

## Completed

### MEDIUM utils/backgrounds.ts and utils/slug.ts have no tests (subset of utils/ coverage gap)

- **Detected:** 2026-04-13 (under the parent "utils/ coverage" item)
- **Completed:** 2026-04-29
- **File:** utils/backgrounds.ts, utils/slug.ts
- **Resolution:** Added colocated test files `utils/backgrounds.test.ts` and `utils/slug.test.ts`. Both files are pure with no external deps, so tests are deterministic.
  - `backgrounds.test.ts` (21 tests): `isExternalBackground` for http/https/data:/blob:/Tailwind/empty, `isCustomBackground` for `custom:` prefix and case sensitivity, `getCustomBackgroundStyle` for 3-/6-digit hex (lower/upper/mixed case), `rgb()`/`rgba()`, `linear-gradient(...)`, plus rejection of invalid hex (wrong length, non-hex chars), `radial-gradient`, `not-a-color`, and empty value after the `custom:` prefix.
  - `slug.test.ts` (20 tests): `slugify` lowercases, strips a single leading `@`, collapses non-alphanumerics into `-`, trims leading/trailing `-`, caps at 48 chars, returns `''` for inputs with no alphanumerics (incl. `'¿¿¿'`), and treats accented characters as separators. `slugOrFallback` returns the slug when non-empty, falls back to `crypto.randomUUID()` truncated to 24 chars, and falls back to `${prefix}-${Date.now()}` truncated to 24 chars when `randomUUID` is unavailable.
- **Verification:** `pnpm test -- --run utils/backgrounds.test.ts utils/slug.test.ts` → 41 passing tests; full suite remains green at 1576 tests / 166 files (was 1535 / 164). `pnpm type-check` clean. `pnpm exec eslint utils/backgrounds.test.ts utils/slug.test.ts --max-warnings 0` clean. `pnpm exec prettier --check ...` clean. The parent "utils/ coverage" Open item has been updated to reflect the new untested count (18 of 45) and a refreshed next-priority list.
