# Legacy Code & Cleanup — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Thursday_
_Last audited: 2026-07-05_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### LOW scripts/tools/\*.py — 8 deprecated manual-testing scripts with no automated role

- **Detected:** 2026-04-16
- **File:** scripts/tools/ (verify_routines_manager.py, verify_dock_icons.py, verify_routines.py, verify_lunch_count.py, refactor_manager.py, fix_buttons.py, inspect_buttons.py, debug_admin_settings.py, debug_landing.py)
- **Detail:** The `scripts/tools/` directory contains 9 Python/Playwright scripts. All are either one-off refactoring tasks that have already been executed (refactor*manager.py, fix_buttons.py) or manual test/debug inspection scripts (verify*\_.py, inspect\_\_.py, debug\_\*.py). None are wired into any CI pipeline, build step, or npm script. They provide no automated value and their presence in the repository creates confusion about what testing tools are canonical.
- **Fix:** Delete `scripts/tools/` directory entirely. Ongoing E2E testing is handled by `tests/e2e/` via Playwright and pnpm test:e2e.

### LOW `hooks/useScaledFont.ts` — dead hook with no production imports

- **Detected:** 2026-05-17
- **File:** hooks/useScaledFont.ts
- **Detail:** `useScaledFont` was introduced in PR #1213 (Expectations Widget Enhancements). It calculates a font size based on widget width/height using the CSS `transform: scale()` era approach. The project subsequently adopted CSS container queries (`cqmin`/`cqw`/`cqh` units) as the standard scaling mechanism, and `useScaledFont` was never called from any production file. Zero imports found in components/, context/, hooks/, utils/ (only the file's own exports exist). The file has a JSDoc block and looks legitimate but is dead code.
- **Fix:** Delete `hooks/useScaledFont.ts`. Confirm no test file imports it, then remove. Run `pnpm type-check` and `pnpm lint` to verify clean.

### LOW `utils/videoActivityDriveService.ts` — export added 2026-05-08 with no production call site

- **Detected:** 2026-05-17
- **File:** utils/videoActivityDriveService.ts (added in commit 97afb1d5, PR #1558)
- **Detail:** This file exports `buildVideoActivityResultsSheetData` — a wrapper that builds Google Sheets export data for Video Activity results using VA's grader (`gradeVideoActivityAnswer`). The intent per the JSDoc is to fix a bug where Quiz's grader returned 0 points for MA (Multiple Answer) question types in VA exports. A test file (`tests/utils/videoActivityDriveService.test.ts`) exists for this function. However, `buildVideoActivityResultsSheetData` is never imported in any production file (components/, hooks/, utils/ excluding the file itself). The file also re-exports `formatExportPoints` from `assignmentExportShared.ts`, but that re-export is also unused in production. The underlying bug this file was meant to fix (MA answers scored as 0 in VA Drive exports) may still exist.
- **Fix:** (a) Wire up the existing function: find the Video Activity export-to-Drive call site (likely in `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx` or a hook) and import `buildVideoActivityResultsSheetData` from this file instead of building export data inline; or (b) if the VA Drive export feature has been removed or deferred, delete the file and its test.

---

## Clean (no issues found)

Migration code + dead exports + console.log audit (2026-07-05, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx`. Still needed.
- New dev-paul commits since 2026-06-28: fix(analytics), pr-review batch, fix(widgets) local-time date helpers, fix(layout) isLocked gaps, fix(functions), fix(state) — all docs/UI/logic; no new utility files introduced; no new dead exports, commented-out code, or console.log calls.
- NEW: `scripts/checkTestCounts.mjs` (added by fix(test): add CI guard for silently-omitted Vitest test suites (#2139)) — classified as ONGOING CI HELPER, not a legacy issue. Has accompanying `scripts/checkTestCounts.test.ts` and `scripts/test-count-baseline.json`. Wired as `pnpm test:counts` in package.json. Not yet in `.github/workflows/` CI pipelines. Status: new tooling in adoption phase, no action needed.
- `useScaledFont.ts`: Still dead. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-06-28, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx`. Still needed.
- New commits since 2026-06-21: fix(activity-wall) empty-state heading scale, audit(saturday) journal updates, upstream: refactor(rules), review fixes #2076, rules/auth hardening #2081, fix(ci), fix(lint). All are rules/CI/docs/UI-only; no new utility files introduced.
- Commented-out code: None found. New commits contain no commented-out blocks.
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead — `ScheduleWidget.test.tsx` mocks it but no production component imports it. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-06-21, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx`. Still needed.
- New commits since 2026-06-14: fix(widgets/expectations) use shared Toggle, audit(saturday) journal updates, ecbd1384 (Toggle fix) — all docs/UI-only; no new utility files introduced.
- Commented-out code: None found. New commits contain no commented-out blocks.
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead — `ScheduleWidget.test.tsx` mocks it but no production component imports it. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-06-14, re-verified after dev-paul rebase):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` and as `TimeToolMode` values in components — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2042`. Still needed.
- New dev-paul commits merged since 2026-06-07: Remote v2 series (components/remote/controls/ + MobileRemoteView.tsx + useRemoteConnection.ts), wide-distro (utils/userTier.ts + config/featureDefaults.ts), fix(state) utils/activityWallNormalize.ts. All new utilities confirmed actively imported in production code: `userTier.ts` imported by `context/AuthContext.tsx`; `activityWallNormalize.ts` imported by `hooks/useActivityWallLibrary.ts`; all `components/remote/controls/` files imported by `RemoteWidgetCard.tsx`; `useRemoteConnection.ts` imported by `MobileRemoteView.tsx`. Clean.
- Commented-out code: None in new commits. `components/remote/` files have inline explanatory comments only — not commented-out code.
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead — `ScheduleWidget.test.tsx` mocks it but no production component imports it. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-06-07, re-verified after dev-paul merge):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx`. Still needed.
- New dev-paul commits merged (docs/unifier, D3/D4 refactors, WorkSymbols empty state, classroom Phase 2 with 13 new files): All new utilities (localDate.ts, classroomCourseLinks.ts, classroomAttachments.ts, publishGradePush.ts, ltiCourseLinks.ts, classroomGradePush.ts) confirmed imported in production code. No new dead exports introduced.
- Commented-out code: None found in new commits.
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead — only mocked in `ScheduleWidget.test.tsx:34`. Stale mock. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-05-31, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct. TimeTool uses 'timer'/'stopwatch' as `TimeToolMode` enum values, not legacy WidgetType strings.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2027`. Still needed.
- New commits since 2026-05-24 (classroom-addon, SmartNotebook fixes, Spotify fixes): No new utility files added to this branch (classroom-addon utils like `classroomGradePush.ts` exist only in dev-paul, not merged here). No new commented-out code blocks. console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead — `ScheduleWidget.test.tsx:34` mocks it (`vi.mock('../../hooks/useScaledFont')`) but no production component imports it. The mock is stale (the test may no longer need it).
- `videoActivityDriveService.ts`: Still no production imports in components/, hooks/, utils/ (excluding the file itself and its test).
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Open item still valid.

Migration code + dead exports + console.log audit (2026-05-24, re-verified):

- Old type strings 'timer', 'stopwatch': Only referenced in `utils/migration.ts:71-80` — correct. Not generated elsewhere.
- Old type string 'workSymbols': Only referenced in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Actively called in `context/DashboardContext.tsx:1971`. Still needed.
- New utils since 2026-05-17: `quizBehavior.ts`, `videoActivityBehavior.ts`, `notebookPlacedAssets.ts` — all imported from production code (plc components, notebook hooks). Clean.
- Commented-out code: None found in new commits (feat(plc), feat(notebook)).
- console.log(): Zero in components/, context/, hooks/, utils/.

Migration code audit (2026-05-17, re-verified):

- Old type strings 'timer', 'stopwatch': Only referenced in `utils/migration.ts:71-80` — correct. Not generated anywhere else.
- Old type string 'workSymbols': Only referenced in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Actively called in `context/DashboardContext.tsx:1928`. Still needed.
- Commented-out code: None found. All detected blocks are legitimate JSDoc.
- console.log(): Zero in components/, context/, hooks/, utils/.

Migration code audit (2026-05-03):

- Old type strings 'timer', 'stopwatch': Only referenced in `utils/migration.ts` migrateWidget() handler — correct. `utils/migration.ts:71-80` transforms to 'time-tool'. Confirmed still clean; 'timer'/'stopwatch' strings found in TimeTool components are `TimeToolMode` values, not legacy WidgetType strings.
- Old type string 'workSymbols': Only referenced in `utils/migration.ts:93` — transforms to 'expectations'. Zero usage elsewhere.
- `migrateLocalStorageToFirestore()`: Actively called in `context/DashboardContext.tsx:1168` with proper guard. Still needed.

Commented-out code (2026-05-03): No blocks of actual commented-out code found. Blocks detected by pattern scan were legitimate JSDoc documentation comments. Clean.

Dead exports (2026-05-03): No new abandoned exports found. New utils file `quizSyncMigration.ts` is actively imported by two hooks. Clean.

console.log() calls (2026-05-03): Zero `console.log()` calls in components/, context/, hooks/, utils/. `console.error()` calls in admin UI are legitimate error handlers. Clean.

---

## Completed

_No completed items yet._
