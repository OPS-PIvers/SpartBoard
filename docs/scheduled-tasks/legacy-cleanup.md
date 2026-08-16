# Legacy Code & Cleanup — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Sunday_
_Last audited: 2026-08-16_
_Last action: 2026-08-09 — Deleted the entire `scripts/tools/` directory (9 stale Python/Playwright dev-session scripts, zero references anywhere, including `fix_buttons.py` which auto-edited widget source). Resolves the source-modification-risk portion of the "scripts/tools/\*.py" MEDIUM; the root `scripts/*.js` audit portion remains Open (narrowed)._

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-08-16 audit notes (Sunday): Note — corrected this journal's cadence label from "weekly — Thursday" to "weekly — Sunday" to match its actual audit history (see matching note in admin-settings-alignment.md). No new items found this cycle — see the Clean section below for verification detail._

_2026-08-09 action notes (Sunday): The single highest-priority Open item across today's reading list (ConceptWeb `fontColor` MEDIUM in admin-settings-alignment D1) was found already resolved by commit 37ceb18f (2026-08-07) — moved to Completed there, no code needed. The next-highest genuinely-open MEDIUM was in this journal. Of this journal's two MEDIUMs, `migrateLocalStorageToFirestore` (document order first) is NOT safely actionable unattended — its fix requires auditing production Firestore/user-activity data to confirm the localStorage migration window has closed, or designing a Firestore-flag short-circuit that changes sign-in/migration behavior; both need runtime data and human judgment, so it stays Open. The `scripts/tools/*.py` MEDIUM was the highest-priority safely-actionable item: deleted the whole `scripts/tools/` directory (9 stale dev-session Python/Playwright scripts, `grep` confirmed zero references in package.json / .github/workflows / any .js/.ts/.mjs/.md source, and one script — `fix_buttons.py` — auto-edits `components/widgets/Breathing/BreathingWidget.tsx`, a standing source-modification hazard). Deleting `.py` files does not affect the TS build/lint/tests; `pnpm type-check` and `pnpm lint` re-run clean. The item's root `scripts/*.js` portion was split off into a narrowed LOW Open item (those are Firestore migration/backfill scripts that may still be operationally needed — unsafe to bulk-delete unattended). Moved the `scripts/tools/` portion to Completed. PR to dev-paul via the rolling scheduled-tasks PR (#2414)._

### MEDIUM `migrateLocalStorageToFirestore` still invoked on every sign-in — dead overhead if migration window has closed

- **Detected:** 2026-07-12
- **File:** `utils/migration.ts:148` (export), `context/DashboardContext.tsx:2046` (call site)
- **Detail:** `migrateLocalStorageToFirestore()` is called unconditionally on every authenticated sign-in in `DashboardContext.tsx`. The function short-circuits immediately when `localStorage.getItem('classroom_dashboards')` is `null`, making it a no-op for the vast majority of users — but the call still runs on every sign-in. If the localStorage-to-Firestore migration window has definitively closed (no active users retain pre-Firestore dashboard data), this is live dead overhead in the hot sign-in path. Prior audits noted "still needed" without assessing whether the migration window has closed. The `timer`/`stopwatch`/`workSymbols` branches in `migrateWidget()` are related but separate (they guard against old Firestore-stored widget types, not localStorage data).
- **Fix:** Audit Firestore data or user activity logs to determine whether any `classroom_dashboards` localStorage keys remain in the wild. If migration is complete, remove the `migrateLocalStorageToFirestore()` call from `DashboardContext.tsx` and delete or archive the export. If uncertainty remains, add a short-circuit at the call site gated on a Firestore document flag to skip the localStorage check after the user has migrated at least once.

### LOW `utils/periodCompat.ts` — `buildPeriodFields` export with no production call site

- **Detected:** 2026-07-26
- **File:** utils/periodCompat.ts (export `buildPeriodFields`)
- **Detail:** `utils/periodCompat.ts` exports `buildPeriodFields` — a helper that constructs period-compatibility field structures. A search of `components/`, `hooks/`, `utils/` (excluding the file itself) finds zero production imports. The file also has no test file of its own. It may be a compatibility shim that was never wired in, or was made redundant by a refactor that didn't clean it up.
- **Fix:** Verify no production import exists (confirmed by audit), then delete the export or the file. Run `pnpm type-check` and `pnpm lint` to verify clean.

### LOW root `scripts/*.js` — historical one-shot backfill/setup scripts sharing the stale-artifact pattern

- **Detected:** 2026-07-26 (split out 2026-08-09 from the resolved `scripts/tools/*.py` MEDIUM)
- **File:** root `scripts/` (e.g. `backfill-feature-permission-building-keys.js`, `backfill-org-members.js`, `backfill-user-building-ids.js`, `backfill-user-dock-items.js`, `configure-invite-emails-flag.js`, `diagnose-building-ids.js`, `fix-empty-feature-permission-gradelevels.js`, `graduate-org-admin-writes-flag.js`, `init-global-perms.js`, `inspect-org-buildings.js`, `migrateAnnouncements.js`, `migratePlcContributions.js`, `recount-org-members.js`, `add-test-class.js`)
- **Detail:** The root `scripts/` directory contains ~14 one-shot backfill/migration/setup `.js` scripts beyond the wired CI helpers (`generate-version.js`, `draft-changelog-entry.js`, `checkTestCounts.mjs` — all referenced in `package.json`; `setup-admins.js` referenced in docs). They share the stale-artifact pattern but, unlike the deleted `scripts/tools/*.py`, they do **not** modify source files in the working tree — they operate against Firestore. Several (org/building/PLC backfills, `graduate-org-admin-writes-flag.js`, `configure-invite-emails-flag.js`) are plausibly still operationally useful for onboarding new orgs or running one-time data migrations, so bulk deletion is unsafe for an unattended pass. Severity downgraded to LOW accordingly.
- **Fix:** Requires human/operational judgment: for each root `scripts/*.js` that is not a wired CI helper, confirm the corresponding data migration/backfill has definitively completed (no orgs still need it) before deleting, or relocate finished one-shots to an archived/`legacy/` subfolder. Do NOT bulk-delete unattended. Wired helpers to preserve: `generate-version.js`, `draft-changelog-entry.js`, `checkTestCounts.mjs`, `setup-admins.js`.
- **2026-08-09 note:** The higher-risk `scripts/tools/*.py` portion of the original MEDIUM (9 dev-session Playwright/debug scripts, one auto-editing `BreathingWidget.tsx`) was deleted this run — see Completed.

### LOW `hooks/useScaledFont.ts` — dead hook with no production imports

- **Detected:** 2026-05-17
- **File:** hooks/useScaledFont.ts
- **Detail:** `useScaledFont` was introduced in PR #1213 (Expectations Widget Enhancements). It calculates a font size based on widget width/height using the CSS `transform: scale()` era approach. The project subsequently adopted CSS container queries (`cqmin`/`cqw`/`cqh` units) as the standard scaling mechanism, and `useScaledFont` was never called from any production file. Zero imports found in components/, context/, hooks/, utils/ (only the file's own exports exist). The file has a JSDoc block and looks legitimate but is dead code. Confirmed 2026-07-12: `ScheduleWidget.test.tsx:57` still mocks it (`vi.mock('@/hooks/useScaledFont')`) even though the production import is gone — the test mock is also dead.
- **Fix:** Delete `hooks/useScaledFont.ts` and remove the `vi.mock('@/hooks/useScaledFont')` from `ScheduleWidget.test.tsx`. Run `pnpm type-check` and `pnpm lint` to verify clean.

### LOW `utils/imageProcessing.ts:109` — `console.warn` fires on successful completion

- **Detected:** 2026-07-12
- **File:** utils/imageProcessing.ts:109
- **Detail:** `console.warn('Background removal complete: ${key}')` is called when AI background removal reaches 100% (`current === total`). The comment above it reads "Final progress log." This is a debug trace left from development — `console.warn` is inappropriate for a success condition and will appear in production browser consoles. All other `console.warn`/`console.error` calls in the codebase are legitimate error-reporting paths; this is the sole misuse.
- **Fix:** Delete line 109 (silent success is correct; the caller handles the resolved promise). If observability is desired, replace with a structured logger or a non-warn approach.

### LOW `utils/videoActivityDriveService.ts` — export added 2026-05-08 with no production call site

- **Detected:** 2026-05-17
- **File:** utils/videoActivityDriveService.ts (added in commit 97afb1d5, PR #1558)
- **Detail:** This file exports `buildVideoActivityResultsSheetData` — a wrapper that builds Google Sheets export data for Video Activity results using VA's grader (`gradeVideoActivityAnswer`). The intent per the JSDoc is to fix a bug where Quiz's grader returned 0 points for MA (Multiple Answer) question types in VA exports. A test file (`tests/utils/videoActivityDriveService.test.ts`) exists for this function. However, `buildVideoActivityResultsSheetData` is never imported in any production file (components/, hooks/, utils/ excluding the file itself). The file also re-exports `formatExportPoints` from `assignmentExportShared.ts`, but that re-export is also unused in production. The underlying bug this file was meant to fix (MA answers scored as 0 in VA Drive exports) may still exist.
- **Fix:** (a) Wire up the existing function: find the Video Activity export-to-Drive call site (likely in `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx` or a hook) and import `buildVideoActivityResultsSheetData` from this file instead of building export data inline; or (b) if the VA Drive export feature has been removed or deferred, delete the file and its test.

---

## Clean (no issues found)

Migration code + dead exports + console.log audit (2026-08-16, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2046`. Existing MEDIUM open item still valid.
- New dev-paul commits since 2026-08-09 (~50 commits): a11y SettingsLabel/radio-semantics retrofits across shared settings primitives and TimeTool/MusicWidget/SpecialistSchedule/DrawingWidget Settings.tsx; css-scaling fixes (MathTools, Onboarding, EmbedWidget); PLC activity-log test coverage; dependency bump (axios CVE fix); SSRF fix in LTI Schoology fetch calls; ActivityWall empty-state unification; nightly docs runs. None introduce new utility files with dead exports, commented-out code blocks, or console.log calls.
- Commented-out code: Zero in components/, context/, hooks/, utils/.
- console.log(): Zero in components/, context/, hooks/, utils/ (grep confirmed).
- `useScaledFont.ts`: Still dead (no production import found; `components/widgets/ScheduleWidget.test.tsx` still carries the stale `vi.mock`). Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports (not re-verified this cycle; no commits touched it).
- `scripts/tools/`: Confirmed still deleted (`ls scripts/tools` → no such directory).
- `utils/imageProcessing.ts:109`: Not re-verified this cycle; no commits touched the file.
- `utils/periodCompat.ts` — `buildPeriodFields`: Still no production imports (grep confirmed zero call sites outside the file itself).

Migration code + dead exports + console.log audit (2026-08-09, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2046`. Existing MEDIUM open item still valid.
- New dev-paul commits since 2026-08-02: fix(pr-2412) case-insensitive dedup for preset sub emails (components/admin/PresetSubEmailsManager.tsx — 4-line change; no new utility files, no dead exports); docs(rich-response) series (docs only); fix: address PR review (modal Escape guard, domain trim, beta-user dedup — admin components; no new utility files); fix(plc) clear stale directory entries on scope change (hooks/usePlcBuildingDirectory.ts + new utils/plcDirectorySubscriptionKey.ts — new utility confirmed actively imported: `hooks/usePlcBuildingDirectory.ts:12` imports `shouldClearPlcDirectoryOnScopeChange` from it; live, not dead).
- Commented-out code: Zero in new commits (usePlcBuildingDirectory.ts has inline explanatory comments only — not commented-out code blocks).
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead (no production import found). Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing MEDIUM open item still valid.
- `utils/imageProcessing.ts:109`: `console.warn` on success still present. Existing LOW open item still valid.
- `utils/periodCompat.ts` — `buildPeriodFields`: Still no production imports (`resolvePeriodNames` is imported at `hooks/useQuizSession.ts:49` but `buildPeriodFields` is not). Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-08-02, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2046`. Existing MEDIUM open item still valid.
- New dev-paul commits since 2026-07-26: docs(admin) DashboardProvider note (4cacab05 — docs only); fix(schedule) events below list + keep settings open (0bda0ed1 — Schedule/Settings.tsx; new `isBuildingSyncEnabled` toggle is a live config field, not a dead export); docs commits — all UI/logic/docs with no new utility files introduced.
- Commented-out code: Zero in components/, context/, hooks/, utils/.
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing MEDIUM open item still valid.
- `utils/imageProcessing.ts:109`: `console.warn` on success still present. Existing LOW open item still valid.
- `utils/periodCompat.ts` — `buildPeriodFields`: Still no production imports (`resolvePeriodNames` is imported at `hooks/useQuizSession.ts:49` but `buildPeriodFields` is not). Existing LOW open item still valid.

Migration code + dead exports + console.log audit (2026-07-26, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2046`. Still needed. Existing MEDIUM open item still valid.
- New dev-paul commits since 2026-07-19: fix(Countdown), fix(FolderTree), fix(i18n), fix(gcPlcOrphans), fix(NextUp auto-expiry), fix(dock Escape leak), fix(auth InviteAcceptance), fix(functions expireActivityWallShares), PR #2272 review fixes — all UI/logic/fixes; no new utility files introduced; no new dead exports, commented-out code, or console.log calls.
- Commented-out code: Zero in components/, context/, hooks/, utils/.
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing MEDIUM open item still valid (supplement note added about root scripts/ .js files).
- `utils/imageProcessing.ts:109`: `console.warn` on success still present. Existing LOW open item still valid.
- NEW: `utils/periodCompat.ts` exports `buildPeriodFields` — zero production imports found in components/, hooks/, utils/ (excluding the file itself). See new LOW open item.
- NEW: `scripts/` root directory contains ~10 one-shot backfill/utility `.js` scripts beyond the CI helpers. These are stale dev-session artifacts distinct from `scripts/tools/`. See supplement note on existing MEDIUM open item.

Migration code + dead exports + console.log audit (2026-07-19, re-verified):

- Old type strings 'timer', 'stopwatch': Only in `utils/migration.ts:71-80` — correct.
- Old type string 'workSymbols': Only in `utils/migration.ts:93` — correct.
- `migrateLocalStorageToFirestore()`: Still actively called in `context/DashboardContext.tsx:2046`. Still needed. Existing MEDIUM open item still valid.
- New dev-paul commits since 2026-07-12: fix(Countdown), fix(FolderTree), fix(i18n), fix(gcPlcOrphans), plus docs — all UI/logic/docs; no new utility files introduced; no new dead exports, commented-out code, or console.log calls.
- Commented-out code: Zero in components/, context/, hooks/, utils/. One line in a test file (`ScheduleWidget.test.tsx:57` — stale `vi.mock('@/hooks/useScaledFont')`, already tracked as part of the useScaledFont LOW open item).
- console.log(): Zero in components/, context/, hooks/, utils/.
- `useScaledFont.ts`: Still dead. Existing LOW open item still valid.
- `videoActivityDriveService.ts`: Still no production imports. Existing LOW open item still valid.
- `scripts/tools/`: Still present with 9 Python/Playwright scripts. Existing MEDIUM open item still valid.
- `utils/imageProcessing.ts:109`: `console.warn` on success still present. Existing LOW open item still valid.

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

### MEDIUM scripts/tools/\*.py — 9 stale dev-session scripts including one that writes to source files

- **Detected:** 2026-04-16 (severity upgraded 2026-07-12)
- **Completed:** 2026-08-09
- **File:** scripts/tools/ (verify_routines_manager.py, verify_dock_icons.py, verify_routines.py, verify_lunch_count.py, refactor_manager.py, fix_buttons.py, inspect_buttons.py, debug_admin_settings.py, debug_landing.py)
- **Detail:** The `scripts/tools/` directory held 9 Python/Playwright dev-session scripts, none wired into any CI pipeline. `fix_buttons.py` directly wrote to `components/widgets/Breathing/BreathingWidget.tsx` — a standing safety/confusion risk if accidentally re-run — and `refactor_manager.py` read from a `FeaturePermissionsManager.tsx.bak` backup that no longer exists. Severity had been upgraded to MEDIUM because a script that mutates source files in the working tree is a hazard.
- **Resolution:** Deleted the entire `scripts/tools/` directory via `git rm -r scripts/tools/`. Pre-deletion verification: `grep -rn "scripts/tools"` and per-filename greps across `package.json`, `functions/package.json`, `.github/workflows/`, and all `.js`/`.ts`/`.mjs`/`.md` sources returned zero references (only this journal mentioned them). Deleting `.py` files does not touch the TypeScript build, ESLint, or the test suites; `pnpm type-check` and `pnpm lint` remain clean. Ongoing E2E coverage is provided by `tests/e2e/` (Playwright + `pnpm test:e2e`), unaffected.
- **Scope note:** Only the `scripts/tools/*.py` portion of the original combined item is resolved here. The root `scripts/*.js` one-shot backfill/migration scripts (a distinct, lower-risk set that operates against Firestore and may still be operationally needed) were split into a separate narrowed LOW Open item rather than bulk-deleted unattended.

_No other completed items yet._
