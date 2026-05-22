# Code Structure & Infrastructure — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-05-22_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `DashboardContext.tsx` is 3481 lines and growing — at least three extractable responsibilities

- **Detected:** 2026-04-15
- **Updated:** 2026-05-22 — file is now **5303 lines** (+1262 from 4041 post-extraction on 2026-05-13, +31% in 9 days). Primary drivers: PLC collaborative space redesign (`55b03269` Merge feat/quiz-settings-on-content) added extensive collection management logic (191 lines of collection/lastBoardId references), boards-modal inline Share+Duplicate icons (`9faae3c3`), admin personal-spotify global feature gate with building scoping (`3b885467`), and PLC in-progress assignments Monitor/Results/member copy (`82da7cb9`). The `getAdminBuildingConfig` extraction reduced the file by ~400 lines (May 13) but 1262 new lines have since been added. Drive-sync extraction remains unaddressed.
- **Updated:** 2026-05-13 — file is now 4441 lines (+937 from 2026-05-06). Significant growth; 15 exported Cloud Functions now visible: `getClassLinkRosterV1`, `generateWithAI`, `fetchExternalProxy`, `archiveActivityWallPhoto`, `checkUrlCompatibility`, `generateVideoActivity`, `transcribeVideoWithGemini`, `generateGuidedLearning`, `adminAnalytics`, `studentLoginV1`, `getAssignmentPseudonymV1`, `getStudentClassDirectoryV1`, `getPseudonymsForAssignmentV1`, `commitRosterPinIndexV1`, `pinLoginV1`. One inline model string at line 1980 (`'gemini-3.1-flash-lite-preview'`) instead of `DEFAULT_STANDARD_MODEL` constant — minor consistency gap (see ai-integration.md). No v1 imports detected; all functions use v2. `minInstances` set on `getPseudonymsForAssignmentV1` (intentional for latency). `extractDataForContext` in split files (`adminAnalyticsCompute.ts`, `adminAnalyticsSnapshot.ts`, `organizationBuildingCounters.ts`, etc.) suggests split has begun for some modules.
- **Updated:** 2026-05-06 — file grew from 3481 to 3504 lines (+23) since 2026-04-29 audit. Growth rate remains slow but file continues to increase.
- **File:** context/DashboardContext.tsx
- **Detail:** The context file is the largest non-test source file at 3504 lines (was 3165 on 2026-04-15). It owns: (1) Firestore CRUD + real-time sync, (2) Google Drive backup/restore orchestration, (3) widget CRUD actions (add/update/delete/reorder), (4) `getAdminBuildingConfig` — a 400-line switch at lines 2127–2540 covering 30+ widget types that maps per-building admin overrides onto widget defaults, (5) `applyDashboardTemplate` and `loadStarterPack`, (6) migration and legacy handling.
- **Fix:** Extract `getAdminBuildingConfig` into `utils/adminBuildingConfig.ts` (pure function: `(type, featurePermissions, selectedBuildings) => Record<string, unknown>`). This removes ~400 lines from the context without touching its public API and makes the validation logic independently testable. Also consider extracting migration logic to `utils/dashboardMigration.ts` (~150 lines).

### MEDIUM `functions/src/index.ts` is 3525 lines — single file for all Cloud Functions (growth stalled)

- **Detected:** 2026-04-15
- **Updated:** 2026-05-22 — file is now **4300 lines** (+775 from 3525 on 2026-05-13). 15 exported Cloud Functions (count unchanged). Growth is from expansion of existing functions (not new ones). New large hooks added since last audit: `hooks/useVideoActivityAssignments.ts` (1100 lines), `hooks/useStudentAssignments.ts` (619 lines), `hooks/useCollections.ts` (604 lines), `hooks/useFolders.ts` (531 lines) — all exceeding 500 lines. No 3+ level relative import depth issues found in new PLC components.
- **Updated:** 2026-05-13 — `DashboardContext.tsx` is now 4441 lines (+937 from 3504 on 2026-05-06). Major growth. `getAdminBuildingConfig` switch is now 18 cases (was 30+ noted earlier; count stabilized). Single-consumer utils list updated: now also includes `lastActiveThrottle.ts`, `migrateProportionalLayout.ts`, `proportionalLayout.ts`, `mockGuidedLearningDriveService.ts`, `periodCompat.ts`, `quizShuffle.ts`, `rosterRestrictions.ts`, `smartPaste.ts`, `testClassAccess.ts`, `youtubeSearch.ts`.
- **Updated:** 2026-05-06 — file stable at 3525 lines (from 3524, +1) since 2026-04-29 audit. Growth has stalled.
- **Updated:** 2026-04-29 — file grew from 2488 to 3524 lines (+1036) since 2026-04-22 audit. Four new Cloud Functions were added: `studentLoginV1` (256MiB, public invoker, handles Google + ClassLink SSO for students), `getAssignmentPseudonymV1` (128MiB, student-role only), `getStudentClassDirectoryV1` (256MiB, public invoker), and `getPseudonymsForAssignmentV1` (256MiB, minInstances:1, public invoker). These are all student SSO / pseudonym functions.
- **File:** functions/src/index.ts
- **Detail:** 15 Cloud Functions now live in one file. Logical groupings: ClassLink roster integration (getClassLinkRosterV1), AI generation (generateWithAI, generateVideoActivity, transcribeVideoWithGemini, generateGuidedLearning), utility (fetchExternalProxy, archiveActivityWallPhoto, checkUrlCompatibility), admin (adminAnalytics), student SSO/pseudonym (studentLoginV1, getAssignmentPseudonymV1, getStudentClassDirectoryV1, getPseudonymsForAssignmentV1, commitRosterPinIndexV1, pinLoginV1). The file is increasingly difficult to navigate. The `getPseudonymsForAssignmentV1` has `minInstances: 1` — verify this is intentional (cold start cost vs. latency tradeoff).
- **Fix:** Split into domain files: `functions/src/classlink.ts`, `functions/src/ai.ts`, `functions/src/utils.ts`, `functions/src/admin.ts`, `functions/src/studentSso.ts`. Re-export all functions from `functions/src/index.ts` to preserve deployed names. This is a refactor with no behavior change but significantly improves reviewability. **Priority has increased** given the 42% growth in 7 days.

### HIGH `DashboardContext.tsx` grew 1262 lines since May 13 extraction — now 5303 lines

- **Detected:** 2026-05-22
- **File:** context/DashboardContext.tsx
- **Detail:** After the May 13 extraction of `getAdminBuildingConfig` reduced the file from 4441 to 4041 lines, nine days of new features grew it back to 5303 (+1262, +31%). The file now exceeds 5000 lines. Primary drivers: (1) PLC collaborative space redesign added collection navigation state, `lastBoardIdByCollection` tracking, `setActiveCollectionId`, and related callbacks (~400 lines); (2) boards-modal inline share/duplicate actions; (3) admin personal-spotify building scoping; (4) PLC in-progress assignment monitor/results. Collections management in particular introduces a new distinct responsibility (board/collection relationship state) that belongs in a dedicated hook or context. The `useGoogleDrive` orchestration and Drive reconnect error handling are also clearly separable.
- **Fix:** Extract collections + board navigation state into `hooks/useCollectionNavigation.ts` (manages `activeCollectionId`, `lastBoardIdByCollection`, `setActiveCollectionId`, `boards-only` filtering). Extract Google Drive sync orchestration into `hooks/useDashboardDriveSync.ts` (wraps `useGoogleDrive`, `useDriveReconnected`, Drive reconnect error handler). These two extractions would remove ~600–800 lines and reduce DashboardContext back below 4500 lines.

### LOW `getAdminBuildingConfig` has 10+ near-identical single-field switch cases

- **Detected:** 2026-04-15
- **File:** context/DashboardContext.tsx (lines 2177–2196)
- **Detail:** Cases for `sound`, `text`, `traffic`, `random`, `dice`, `hotspot-image`, and `classes` each copy 1–2 fields from `raw` with minimal validation (mostly just a type check or existence check). The pattern is identical:
  ```
  case 'dice':
    if (typeof raw.count === 'number') out.count = raw.count;
    break;
  ```
  These 7+ cases could be replaced by a declarative config describing the field name, type constraint, and allowed values per widget type.
- **Fix:** After extracting `getAdminBuildingConfig` to a utility (see above issue), refactor the simple cases using a field-schema map:
  ```ts
  const SIMPLE_FIELDS: Partial<Record<WidgetType, Array<{key: string; type: string}>>> = {
    dice: [{ key: 'count', type: 'number' }],
    ...
  };
  ```
  Reduces ~50 lines to a data declaration without any behavior change.

### LOW Utils files with single consumer — consider co-location or absorption

- **Detected:** 2026-04-15
- **File:** utils/ (multiple files)
- **Detail:** The following utils files have only one import consumer in components/context/hooks/utils (0 = unused tests only, 1 = single consumer):
  - `utils/accessibility.ts` — 1 consumer
  - `utils/ai_security.ts` — 1 consumer (likely `utils/ai.ts`)
  - `utils/backgroundCategories.ts` — 1 consumer
  - `utils/dashboardPII.ts` — 1 consumer
  - `utils/googleCalendarService.ts` — 1 consumer
  - `utils/guidedLearningDriveService.ts` — 1 consumer
  - `utils/migration.ts` — 1 consumer (`context/DashboardContext.tsx`)
  - `utils/smartPaste.ts` — 1 consumer
    Single-consumer utils are not necessarily wrong — domain separation is valid — but warrant a quick sanity check that they are not duplicating logic that already exists elsewhere, and that they are documented or self-explanatory.
- **Fix:** Verify each file's consumer. For `migration.ts` (owned entirely by DashboardContext), consider whether inlining or consolidating the migration logic into the context would reduce indirection. No action required if each file's scope is intentionally bounded.

---

## Completed

### HIGH `DashboardContext.tsx` grew 937 lines in one week — now 4441 lines

- **Detected:** 2026-05-13
- **Completed:** 2026-05-13
- **File:** context/DashboardContext.tsx, utils/adminBuildingConfig.ts (new), tests/utils/adminBuildingConfig.test.ts (new)
- **Detail:** `DashboardContext.tsx` jumped from 3504 to 4441 lines (+27%) in one week. `getAdminBuildingConfig` (a 400-line switch over 25+ widget types validating per-building admin overrides) was the largest self-contained extractable seam.
- **Resolution:** Extracted `getAdminBuildingConfig` to `utils/adminBuildingConfig.ts` as a pure function with signature `(type: WidgetType, featurePermissions: FeaturePermission[], selectedBuildings: string[]) => Record<string, unknown>`. Replaced the inline 400-line `useCallback` body in `DashboardContext.tsx` with a thin 4-line bridge that closes over the context's reactive deps and delegates to the pure helper. Removed now-unused imports (`NextUpConfig`, `MaterialsGlobalConfig`, `getMaterialsCatalog`). Net effect: `DashboardContext.tsx` shrank from 4441 to 4041 lines (-400). Added 11 unit tests in `tests/utils/adminBuildingConfig.test.ts` covering empty-input early returns, legacy-key canonicalization, per-widget validation (reveal-grid columns, drawing width clamp + customColors padding, countdown viewMode rejection), and unknown-type fallthrough. `pnpm type-check`, `pnpm lint --max-warnings 0`, and `pnpm format:check` all clean; full unit-test suite (now 230 files / 2386 tests) passes.
- **Follow-ups:** Drive-sync extraction (`hooks/useDashboardDriveSync.ts`) remains unaddressed — tracked under the MEDIUM `DashboardContext.tsx is 3481 lines and growing` entry above. The LOW "simple switch cases" entry above can now be implemented against `utils/adminBuildingConfig.ts` directly without touching the context.

### MEDIUM All 9 Cloud Functions use Firebase Functions v1 — migration to v2 warranted

- **Detected:** 2026-04-15
- **Completed:** 2026-04-22
- **File:** functions/src/index.ts
- **Resolution:** Resolved outside journal workflow. 2026-04-22 audit confirmed all functions already import from `firebase-functions/v2/https` (onCall, onRequest) and `firebase-functions/v2` (setGlobalOptions). The 2026-04-15 journal entry was incorrect — the migration was already complete at time of first detection or completed shortly after. Verified: `generateVideoActivity` (1 GiB / 300s), `transcribeVideoWithGemini` (1 GiB / 300s), `adminAnalytics` (4 GiB / 540s), and all others use v2 syntax.
