# Test Coverage Gaps — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Monday_
_Last audited: 2026-04-13_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### HIGH hooks/ coverage — 27 of 33 hooks have no dedicated tests

- **Detected:** 2026-04-13
- **File:** hooks/ directory
- **Detail:** Only 6 hook files have matching test files in tests/hooks/. The following critical hooks have zero test coverage:
  - `useLiveSession.ts` — manages live classroom sessions, teacher/student role switching, PIN validation
  - `useQuizSession.ts` — quiz session state for both teacher and student flows
  - `useGuidedLearningSession.ts` — guided learning session orchestration
  - `useVideoActivity.ts` / `useVideoActivitySession.ts` — video activity session management
  - `useMiniAppSession.ts` — mini-app assignment session lifecycle
  - `useRosters.ts` — roster CRUD, student list management
  - `useGoogleDrive.ts` — Google Drive dashboard sync (has a test file but missing coverage for core sync flows)
  - `useImageUpload.ts` — image upload handling with Firebase Storage
  - `useFirestore.ts` — core Firestore CRUD for dashboards
  - `useStarterPacks.ts` — starter pack template management
  - `useScreenRecord.ts` — screen recording lifecycle
  - `useMusicStations.ts` — music station state (has partial tests)
- **Fix:** Prioritize test coverage for session hooks (useLiveSession, useQuizSession, useGuidedLearningSession) as these are the most complex stateful hooks. Use Vitest with mock Firebase adapters. See existing tests in tests/hooks/useMusicStations.test.ts as a reference pattern.

### MEDIUM utils/ coverage — 31 of 41 utility files have no tests

- **Detected:** 2026-04-13
- **File:** utils/ directory
- **Detail:** Only 10 of 41 util files have test coverage. High-priority untested utilities:
  - `ai.ts` — core AI generation interface, calls Cloud Functions for quiz/poll/mini-app/dashboard generation
  - `ai_security.ts` — AI prompt sanitization and security utilities
  - `googleDriveService.ts` — Google Drive dashboard sync service
  - `googleCalendarService.ts` — Google Calendar API integration
  - `guidedLearningDriveService.ts` — guided learning material sync from Drive
  - `imageProcessing.ts` — image manipulation (resize, crop, compress)
  - `pexelsService.ts` — Pexels stock image API integration
  - `quizAudio.ts` — quiz audio generation utilities
  - `quizDriveService.ts` — quiz import/export via Google Drive
  - `randomHelpers.ts` — random selection, shuffling utilities
  - `soundboardConfig.ts` — sound configuration parser
  - `widgetConfigPersistence.ts` — widget state persistence logic
- **Fix:** Start with pure utility functions (randomHelpers, soundboardConfig, widgetConfigPersistence) as they have no external dependencies. Then add tests for service wrappers (googleDriveService, pexelsService) using vi.mock() for fetch/API calls.

### LOW widget test coverage — most of 57 widgets have no component tests

- **Detected:** 2026-04-13
- **File:** components/widgets/ directory
- **Detail:** Only 6 test files exist in tests/components/widgets/. The vast majority of widget components (50+) have no automated tests. This means regressions in widget rendering, config persistence, and settings panels go undetected.
- **Fix:** Focus first on high-complexity widgets: PollWidget (live session sync), QuizWidget, RevealGridWidget, ChecklistWidget. Use React Testing Library with Vitest. Mock useDashboard() and useAuth() hooks.

---

## Completed

_No completed items yet._
