# Code Structure & Infrastructure — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-06-12_
_Last action: 2026-05-22 — HIGH DashboardContext extraction assessed and BLOCKED pending supervised runtime-verified session_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-06-12: Weekly audit pass. Rebase onto dev-paul (docs/unifier run 13, D4 @/ alias conversion in tests/, perf baseline refresh, fix DraggableWindow duplicate handler, debugger run 14). None touch context/DashboardContext.tsx, functions/src/index.ts, or adminBuildingConfig.ts structure. All existing open items re-confirmed valid. New finding: multiple large component/layout files not previously tracked now exceed 500 lines — QuizStudentApp.tsx (3762 lines), DashboardView.tsx (1908 lines), Dock.tsx (1597 lines), GlobalPermissionsManager.tsx (1497 lines), StarterPackConfigurationModal.tsx (1251 lines), VideoActivityStudentApp.tsx (990 lines). Cloud Functions all confirmed on v2. No data-fetching duplication detected. No deep relative imports (3+ levels of ../) in source files. Single-use utils list extended: assignToClassroom.ts, deleteDrawingPageSubcollection.ts, imageWorker.ts, lastActiveThrottle.ts, migrateDrawingToSubcollection.ts, miniAppNormalize.ts added to existing LOW item. 1 new MEDIUM open item added._

_2026-06-10: Weekly audit pass. DashboardContext.tsx confirmed at 5,596 lines (same as 2026-06-05 — no structural changes since). BLOCKED extraction status unchanged. functions/src/index.ts confirmed at 4,305 lines — organically growing domain-split pattern continues. Four new open items added: cardOpacity validation duplication in adminBuildingConfig.ts, stale v1 logger import in finalizeIdleQuizAttempts.ts, OAuth Cloud Functions missing explicit timeoutSeconds, and concurrent userProfile reads/writes between AuthContext and DashboardContext._

_2026-06-05: Weekly audit pass. DashboardContext.tsx now 5,596 lines (+321 from 5,275 on 2026-05-27). BLOCKED extraction status unchanged. functions/src/index.ts now 4,305 lines — domain split organically in progress (spotifyOAuth.ts, syncedQuizGroups.ts etc.). All Cloud Functions confirmed on v2; no v1 imports found. New LOW finding: feature_permissions and global_permissions read coordination between AuthContext and DashboardContext could benefit from documentation. adminBuildingConfig.ts: font-validation constants duplicated across reveal-grid/numberLine/concept-web cases (related to existing LOW simple-switch-cases item). Test imports with 3+ ../../ levels are all in .test.tsx files using vi.mock() — acceptable. No new large-file violations beyond what's already tracked. 1 new LOW open item added._

### MEDIUM Large component files not tracked by DashboardContext or functions/src items — 5 files exceed 1000 lines

- **Detected:** 2026-06-12
- **Files:** components/student/QuizStudentApp.tsx (3762 lines), components/layout/DashboardView.tsx (1908 lines), components/layout/Dock.tsx (1597 lines), components/admin/GlobalPermissionsManager.tsx (1497 lines), components/admin/StarterPackConfigurationModal.tsx (1251 lines), components/student/VideoActivityStudentApp.tsx (990 lines)
- **Detail:** Six source component files exceed 500 lines and were not previously tracked in this journal. The most critical: `QuizStudentApp.tsx` (3762 lines) bundles auth, lobby, question rendering, timer state, PIN entry, and score tracking; `DashboardView.tsx` (1908 lines) contains the main app shell, widget placement, toolbar, and menu logic; `Dock.tsx` (1597 lines) bundles dock header, folder panel, tool list rendering, and animation logic; `GlobalPermissionsManager.tsx` (1497 lines) contains all admin feature/access/quota UI in one component; `StarterPackConfigurationModal.tsx` (1251 lines) is a long form modal with no section decomposition; `VideoActivityStudentApp.tsx` (990 lines) mirrors the QuizStudentApp pattern.
- **Fix:** For QuizStudentApp and VideoActivityStudentApp: extract `TimerController`, `PinEntryForm`, `SessionLobby`, and `QuestionRenderer` into sibling components under their respective directories. For DashboardView: extract the toolbar/menu as `DashboardToolbar`. For Dock: extract `FolderPanel` and `ToolItem` into sub-components. For GlobalPermissionsManager: split into `WidgetAccessPanel`, `QuotaEditor`, and `BetaListManager`. These are view-layer extractions (no shared state changes) — lower risk than the DashboardContext extraction. Prioritize QuizStudentApp first given its size.

### MEDIUM `DashboardContext.tsx` is 3481 lines and growing — at least three extractable responsibilities

- **Detected:** 2026-04-15
- **Updated:** 2026-06-05 — file is now **5,596 lines** (see HIGH item above for BLOCKED status).
- **Updated:** 2026-05-27 — file is now **5275 lines** (slight decrease from 5303 on 2026-05-22, likely due to minor cleanups). Recent commits (smart-notebook feature additions, drawing-widget toolbar redesign, migration fixes) did not add new context responsibilities. BLOCKED status unchanged — collections/Drive extraction still requires supervised runtime-verified session. DashboardContext extraction remains the top-priority structural issue.
- **Updated:** 2026-05-22 — file is now **5303 lines** (+1262 from 4041 post-extraction on 2026-05-13, +31% in 9 days). Primary drivers: PLC collaborative space redesign (`55b03269` Merge feat/quiz-settings-on-content) added extensive collection management logic (191 lines of collection/lastBoardId references), boards-modal inline Share+Duplicate icons (`9faae3c3`), admin personal-spotify global feature gate with building scoping (`3b885467`), and PLC in-progress assignments Monitor/Results/member copy (`82da7cb9`). The `getAdminBuildingConfig` extraction reduced the file by ~400 lines (May 13) but 1262 new lines have since been added. Drive-sync extraction remains unaddressed.
- **Updated:** 2026-05-13 — file is now 4441 lines (+937 from 2026-05-06). Significant growth; 15 exported Cloud Functions now visible: `getClassLinkRosterV1`, `generateWithAI`, `fetchExternalProxy`, `archiveActivityWallPhoto`, `checkUrlCompatibility`, `generateVideoActivity`, `transcribeVideoWithGemini`, `generateGuidedLearning`, `adminAnalytics`, `studentLoginV1`, `getAssignmentPseudonymV1`, `getStudentClassDirectoryV1`, `getPseudonymsForAssignmentV1`, `commitRosterPinIndexV1`, `pinLoginV1`. One inline model string at line 1980 (`'gemini-3.1-flash-lite-preview'`) instead of `DEFAULT_STANDARD_MODEL` constant — minor consistency gap (see ai-integration.md). No v1 imports detected; all functions use v2. `minInstances` set on `getPseudonymsForAssignmentV1` (intentional for latency). `extractDataForContext` in split files (`adminAnalyticsCompute.ts`, `adminAnalyticsSnapshot.ts`, `organizationBuildingCounters.ts`, etc.) suggests split has begun for some modules.
- **Updated:** 2026-05-06 — file grew from 3481 to 3504 lines (+23) since 2026-04-29 audit. Growth rate remains slow but file continues to increase.
- **File:** context/DashboardContext.tsx
- **Detail:** The context file is the largest non-test source file at 3504 lines (was 3165 on 2026-04-15). It owns: (1) Firestore CRUD + real-time sync, (2) Google Drive backup/restore orchestration, (3) widget CRUD actions (add/update/delete/reorder), (4) `getAdminBuildingConfig` — a 400-line switch at lines 2127–2540 covering 30+ widget types that maps per-building admin overrides onto widget defaults, (5) `applyDashboardTemplate` and `loadStarterPack`, (6) migration and legacy handling.
- **Fix:** Extract `getAdminBuildingConfig` into `utils/adminBuildingConfig.ts` (pure function: `(type, featurePermissions, selectedBuildings) => Record<string, unknown>`). This removes ~400 lines from the context without touching its public API and makes the validation logic independently testable. Also consider extracting migration logic to `utils/dashboardMigration.ts` (~150 lines).

### MEDIUM `functions/src/index.ts` is 3525 lines — single file for all Cloud Functions (growth stalled)

- **Detected:** 2026-04-15
- **Updated:** 2026-06-05 — file is now **4,305 lines** per audit (15 exported Cloud Functions). Domain split already in progress for newer functions (spotifyOAuth.ts, syncedQuizGroups.ts, etc.). BLOCKED status unchanged.
- **Assessed 2026-06-03 (action agent):** Deferred — not safe for an unattended automated pass. The file is now **4305 lines** with 15+ exported Cloud Functions plus inline AI-generation pipeline state: module-level caches (`__resetGenerateWithAICaches`), model constants, prompt builders, and `validateAndBucketVideoQuestions` / `validateAndBucketQuizQuestions` validators that are shared across the generation functions. A by-domain split must carefully relocate this shared module state while preserving every deployed function name via `index.ts` re-exports. There is no functions deploy/runtime in this environment (CI only runs `tsc`/lint/format/build, not a deploy), so a deployed-surface or shared-state regression would not be caught by the available checks — the same risk profile that BLOCKED the `DashboardContext.tsx` extraction. Recommend a supervised session that can verify the deployed function surface (and the AI-generation cache/validator wiring) before landing this split. Took the highest-priority safe Open item instead this pass (see ui-unification.md — CarRiderProConfig dead-field removal).
- **Updated:** 2026-05-27 — functions/src/index.ts now primarily re-exports from domain modules (spotifyOAuth.ts, syncedQuizGroups.ts, syncedVideoActivityGroups.ts, expireSubShares.ts added as new modules). The split-by-domain pattern is already in progress for newer functions. 3 new Cloud Functions added since 2026-05-22: `spotifyOAuth` (Spotify OAuth exchange), synced quiz/video-activity group helpers (exported from domain files). The functions split work has organically begun — consider documenting the in-progress state and formalizing the remaining consolidation.
- **Updated:** 2026-05-22 — file is now **4300 lines** (+775 from 3525 on 2026-05-13). 15 exported Cloud Functions (count unchanged). Growth is from expansion of existing functions (not new ones). New large hooks added since last audit: `hooks/useVideoActivityAssignments.ts` (1100 lines), `hooks/useStudentAssignments.ts` (619 lines), `hooks/useCollections.ts` (604 lines), `hooks/useFolders.ts` (531 lines) — all exceeding 500 lines. No 3+ level relative import depth issues found in new PLC components.
- **Updated:** 2026-05-13 — `DashboardContext.tsx` is now 4441 lines (+937 from 3504 on 2026-05-06). Major growth. `getAdminBuildingConfig` switch is now 18 cases (was 30+ noted earlier; count stabilized). Single-consumer utils list updated: now also includes `lastActiveThrottle.ts`, `migrateProportionalLayout.ts`, `proportionalLayout.ts`, `mockGuidedLearningDriveService.ts`, `periodCompat.ts`, `quizShuffle.ts`, `rosterRestrictions.ts`, `smartPaste.ts`, `testClassAccess.ts`, `youtubeSearch.ts`.
- **Updated:** 2026-05-06 — file stable at 3525 lines (from 3524, +1) since 2026-04-29 audit. Growth has stalled.
- **Updated:** 2026-04-29 — file grew from 2488 to 3524 lines (+1036) since 2026-04-22 audit. Four new Cloud Functions were added: `studentLoginV1` (256MiB, public invoker, handles Google + ClassLink SSO for students), `getAssignmentPseudonymV1` (128MiB, student-role only), `getStudentClassDirectoryV1` (256MiB, public invoker), and `getPseudonymsForAssignmentV1` (256MiB, minInstances:1, public invoker). These are all student SSO / pseudonym functions.
- **File:** functions/src/index.ts
- **Detail:** 15 Cloud Functions now live in one file. Logical groupings: ClassLink roster integration (getClassLinkRosterV1), AI generation (generateWithAI, generateVideoActivity, transcribeVideoWithGemini, generateGuidedLearning), utility (fetchExternalProxy, archiveActivityWallPhoto, checkUrlCompatibility), admin (adminAnalytics), student SSO/pseudonym (studentLoginV1, getAssignmentPseudonymV1, getStudentClassDirectoryV1, getPseudonymsForAssignmentV1, commitRosterPinIndexV1, pinLoginV1). The file is increasingly difficult to navigate. The `getPseudonymsForAssignmentV1` has `minInstances: 1` — verify this is intentional (cold start cost vs. latency tradeoff).
- **Fix:** Split into domain files: `functions/src/classlink.ts`, `functions/src/ai.ts`, `functions/src/utils.ts`, `functions/src/admin.ts`, `functions/src/studentSso.ts`. Re-export all functions from `functions/src/index.ts` to preserve deployed names. This is a refactor with no behavior change but significantly improves reviewability. **Priority has increased** given the 42% growth in 7 days.

### HIGH `DashboardContext.tsx` grew 1262 lines since May 13 extraction — now 5596 lines

- **Detected:** 2026-05-22
- **Updated:** 2026-06-05 — file is now **5,596 lines** (+321 from 5,275 on 2026-05-27). Continued growth despite no new extractions. BLOCKED status unchanged — collections/Drive extraction still requires supervised runtime-verified session.
- **File:** context/DashboardContext.tsx
- **Detail:** After the May 13 extraction of `getAdminBuildingConfig` reduced the file from 4441 to 4041 lines, nine days of new features grew it back to 5303 (+1262, +31%). The file now exceeds 5000 lines. Primary drivers: (1) PLC collaborative space redesign added collection navigation state, `lastBoardIdByCollection` tracking, `setActiveCollectionId`, and related callbacks (~400 lines); (2) boards-modal inline share/duplicate actions; (3) admin personal-spotify building scoping; (4) PLC in-progress assignment monitor/results. Collections management in particular introduces a new distinct responsibility (board/collection relationship state) that belongs in a dedicated hook or context. The `useGoogleDrive` orchestration and Drive reconnect error handling are also clearly separable.
- **Fix:** Extract collections + board navigation state into `hooks/useCollectionNavigation.ts` (manages `activeCollectionId`, `lastBoardIdByCollection`, `setActiveCollectionId`, `boards-only` filtering). Extract Google Drive sync orchestration into `hooks/useDashboardDriveSync.ts` (wraps `useGoogleDrive`, `useDriveReconnected`, Drive reconnect error handler). These two extractions would remove ~600–800 lines and reduce DashboardContext back below 4500 lines.
- **BLOCKED 2026-05-22 (action agent assessment): Needs manual, runtime-verified refactor session — not safe for an unattended automated pass.** Investigated all three candidate seams in detail:
  - **`setActiveCollectionId` / collection navigation** — `setActiveCollectionId` (lines 4019–4054) delegates to `loadDashboard`, which is itself a context-internal callback (lines 3938–4017) coupled to `updateActiveId`, `dashboardsRef`, `navigationWriteRef`, `navigationDebounceRef`, `profileLoaded`, `user`, the debounce/dedup logic, and the Firestore `setDoc({merge:true})` nested-map navigation-memory write. `loadDashboard` is consumed throughout the context. Extracting it into a standalone hook means either drilling ~8 context internals as params or splitting `loadDashboard` itself — high risk of closure/ordering regressions.
  - **`useDashboardDriveSync`** — Drive logic is not one isolated block: the background-export effect (2255–2302) is intertwined with `saveDashboardFirestore` + `scrubDashboardPII`, the PII-restore effect (2319+) mutates widget config, and Drive calls are also embedded in save/share/restore paths (1171–1460). The auth-error handler (615–632) and `useDriveReconnected` latch (2315) are separable but small.
  - **Pure-function seams** — already harvested: `getAdminBuildingConfig` (utils/adminBuildingConfig.ts, May 13), `pickInitialBoard` (utils/pickInitialBoard.ts), migration (utils/migration.ts, migrateProportionalLayout.ts, collectionsMigration.ts). No clean unit-testable pure block remains inline.
  - **Verification gap:** there is no unit-test coverage for the navigation or Drive-sync effects, and no Firebase/Drive runtime in the scheduled-task environment, so `type-check`/`lint`/`vitest` would not catch a navigation, sync-timing, or PII-restore regression on the app's most critical state file. Recommend a dedicated supervised session that can exercise board switching, collection switching, and Drive sync against a live/emulated Firebase project before landing this extraction.

### MEDIUM `adminBuildingConfig.ts` — `cardOpacity` range-check block copy-pasted 4 times

- **Detected:** 2026-06-10
- **File:** utils/adminBuildingConfig.ts (lines 183–187, 266–270, 282–286, 412–416)
- **Detail:** The following five-line cardOpacity guard is duplicated verbatim in four switch cases (`numberLine`, `checklist`, `stations`, `concept-web`):
  ```typescript
  typeof raw.cardOpacity === 'number' &&
    Number.isFinite(raw.cardOpacity) &&
    raw.cardOpacity >= 0 &&
    raw.cardOpacity <= 1;
  ```
  This is distinct from the existing LOW "simple switch cases" item (which concerns single-field type-check cases). The cardOpacity block is a multi-condition range validator — any future fix (e.g., allowing `null` as a reset sentinel, or widening the valid range to `0.05–1`) must be applied in four places, and the current duplication has already caused one appearance (the `stations` case) to diverge slightly in guard structure from the others.
- **Fix:** Extract a private `validateCardOpacity(raw: unknown): boolean` helper at the top of `adminBuildingConfig.ts` (or reuse the existing `isCardOpacity` if one already exists in `utils/widgetHelpers.ts`). Replace the four inline blocks with a call to the helper. Pure refactor — no behavior change. Then extend the existing LOW "simple switch cases" item's data-declaration approach to cover the appearance-field quartet (`cardColor`, `cardOpacity`, `fontFamily`, `fontColor`) shared by multiple cases.

### MEDIUM Concurrent reads and writes to `userProfile` document between `AuthContext` and `DashboardContext`

- **Detected:** 2026-06-10
- **File:** context/AuthContext.tsx (line 266 approx), context/DashboardContext.tsx (lines 997–998, 1117–1122, 4029–4039)
- **Detail:** The `/users/{uid}/userProfile/profile` document is read by both contexts on mount and written by both at runtime. `AuthContext` owns `setupCompleted`, `selectedBuildings`, `language`, `savedWidgetConfigs`, `lastBoardIdByCollection`, and related fields. `DashboardContext` reads `dockItems` from the same doc (via `getDoc` at lines 997–998) and writes both `dockItems` and `lastBoardIdByCollection` (lines 1117–1122 and 4029–4039, both using `setDoc({ merge: true })`). The `lastBoardIdByCollection` field is written by DashboardContext (line 4029) and read by AuthContext (line 266) with no coordination. While `{ merge: true }` prevents whole-document overwrites, a race where DashboardContext writes a stale full-document snapshot (if it ever uses `setDoc` without merge) could silently clobber fields owned by AuthContext.
- **Fix:** Designate a single owning context for the userProfile document. Option A: make `AuthContext` the sole writer (DashboardContext calls an `AuthContext`-provided `updateDockItems` action instead of writing directly). Option B: document the field ownership contract with comments in both files so future developers cannot accidentally add a non-merge write. Short-term: audit every `setDoc` call targeting this path to confirm all use `{ merge: true }` — add a lint comment or assertion if not.

### LOW Stale v1 `logger` import in `finalizeIdleQuizAttempts.ts`

- **Detected:** 2026-06-10
- **File:** functions/src/finalizeIdleQuizAttempts.ts (line 30)
- **Detail:** `import { logger } from 'firebase-functions'` imports the `logger` utility from the v1 root package, while the function itself uses `onSchedule` from `firebase-functions/v2`. All other functions files import `logger` from `firebase-functions/v2` or the neutral `firebase-functions/logger`. This unnecessarily pulls in the v1 module tree alongside the v2 import.
- **Fix:** Change `import { logger } from 'firebase-functions'` to `import { logger } from 'firebase-functions/v2'` (or `from 'firebase-functions/logger'` to use the package-neutral export). No behavior change.

### LOW OAuth Cloud Functions lack explicit `timeoutSeconds` — tail-risk on external HTTP calls

- **Detected:** 2026-06-10
- **File:** functions/src/googleOAuth.ts (lines 224, 451, 470), functions/src/spotifyOAuth.ts (lines 179, 289, 477)
- **Detail:** Six OAuth functions (`exchangeGoogleAuthCode`, `refreshGoogleAccessToken`, `revokeGoogleRefreshToken`, `exchangeSpotifyAuthCode`, `refreshSpotifyAccessToken`, `revokeSpotifyAuth`) rely on the v2 default `timeoutSeconds: 60`. Each makes at least one external HTTP call to Google or Spotify token endpoints. If those endpoints hang (which they occasionally do under throttle), a 60-second timeout creates unnecessary cost — the function will keep a warm instance alive for the full timeout before failing. An explicit 30-second cap would better match the SLA of the token endpoints.
- **Fix:** Add `timeoutSeconds: 30` to the `onCall` options object in each of the six functions. This is a no-op for healthy requests and caps runaway costs on external endpoint hangs. Also consider adding `memory: '256MiB'` explicitly to document the resource tier (currently relying on the 256 MiB default).

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

### LOW `feature_permissions` and `global_permissions` read in both `AuthContext` and `DashboardContext`

- **Detected:** 2026-06-05
- **File:** context/AuthContext.tsx (line 899 approx), context/DashboardContext.tsx
- **Detail:** `feature_permissions` and `global_permissions` Firestore collections are fetched via `onSnapshot` in `AuthContext.tsx` for permission checking, and referenced again in `DashboardContext.tsx` for `getAdminBuildingConfig` and AI feature gating. While the pattern is not a direct double-listener (DashboardContext uses the values passed down from Auth), the data dependency path is not clearly documented and could lead to a future developer adding a second `onSnapshot` listener. Additionally, `AuthContext.tsx` probes the user's first dashboard at mount (lines 1242-1244) while `DashboardContext.tsx` also queries for the initial board on load — creating a potential Firestore double-read on first sign-in.
- **Fix:** Document the data flow: `feature_permissions` / `global_permissions` are owned by `AuthContext` (single listener); `DashboardContext` reads from the values already in context. Add a comment in `DashboardContext.tsx` near the `getAdminBuildingConfig` call making this dependency explicit. For the dashboard probe: audit whether both reads are truly needed, and if so, add comments explaining the different roles (Auth probes for building-based first-board selection; Dashboard loads the selected board state).

### LOW Utils files with single consumer — consider co-location or absorption

- **Detected:** 2026-04-15
- **File:** utils/ (multiple files)
- **Detail:** The following utils files have only one import consumer in components/context/hooks/utils (0 = unused tests only, 1 = single consumer):
  - `utils/accessibility.ts` — 1 consumer
  - `utils/ai_security.ts` — 1 consumer (likely `utils/ai.ts`)
  - `utils/assignToClassroom.ts` — 1 consumer (2026-06-12)
  - `utils/backgroundCategories.ts` — 1 consumer
  - `utils/dashboardPII.ts` — 1 consumer
  - `utils/deleteDrawingPageSubcollection.ts` — 1 consumer (2026-06-12, migration helper)
  - `utils/googleCalendarService.ts` — 1 consumer
  - `utils/guidedLearningDriveService.ts` — 1 consumer
  - `utils/imageWorker.ts` — 1 consumer (2026-06-12, Web Worker — correct isolation)
  - `utils/lastActiveThrottle.ts` — 1 consumer (2026-06-12)
  - `utils/migration.ts` — 1 consumer (`context/DashboardContext.tsx`)
  - `utils/migrateDrawingToSubcollection.ts` — 1 consumer (2026-06-12, migration helper)
  - `utils/miniAppNormalize.ts` — 1 consumer (2026-06-12, consider colocation)
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
