# Code Structure & Infrastructure — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-07-17_
_Last action: 2026-06-12 — MEDIUM cardOpacity range-check extracted into shared `isCardOpacity` guard in adminBuildingConfig.ts_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-07-17: Friday pass (C1). New dev-paul commits since 2026-07-16: docs only. No source changes touching context/DashboardContext.tsx, utils/adminBuildingConfig.ts, functions/src/, or any other structure-relevant files. DashboardContext.tsx confirmed 5,865 lines (unchanged — BLOCKED status unchanged). All existing open items re-confirmed valid. Zero new items._

_2026-07-15: Weekly audit pass (Wednesday). No new dev-paul commits since 2026-07-14 (dev-paul HEAD 6249f325 already captured). DashboardContext.tsx not re-measured (last confirmed 5,865 lines on 2026-07-03 — BLOCKED status unchanged). Two new LOW items found in `utils/adminBuildingConfig.ts`: (1) `validRevealFonts` local constant (11 font family strings) duplicates the module-level `VALID_FONT_FAMILIES` constant exported from the same file — redundant definition; (2) `validTextSizePresets` inline array `['small', 'medium', 'large', 'x-large']` declared twice in two separate switch cases (need-do-put-then and work-symbols) — same array, no shared constant. Additionally: 4-field appearance validation block (`fontFamily`/`fontColor`/`cardColor`/`cardOpacity`) repeated across 4+ switch cases with identical guard logic — the existing LOW "simple switch cases" item partially covers this but doesn't enumerate the 4-field block pattern explicitly; added as a note to that item rather than a separate entry. New LOW item: `utils/mockGuidedLearningDriveService.ts` is a dev mock / test double that lives in `utils/` rather than `tests/` — it exports no production logic and imports only from test-adjacent service modules. All pre-existing open items re-confirmed valid. 2 new LOW open items added._

_2026-07-04: Weekly audit pass (Saturday). New dev-paul commits since 2026-07-03: pr-review log (docs only), fix(css-scaling) SpecialistSchedule border, fix(widgets) 3 review findings — none touch context/hooks/utils source files. DashboardContext.tsx confirmed at **5,865 lines** (unchanged from 2026-07-03 — same build). MEDIUM `functions/src/index.ts` item: **file is now 144 lines** — confirmed a thin barrel of re-exports with JSDoc documenting the architecture. The domain split was completed upstream (each Cloud Function lives in its own leaf module); this resolves the MEDIUM item tracked since 2026-04-15. Moved to Completed. NEW LOW: `utils/videoActivityDriveService.ts` is only imported by its test file (`tests/utils/videoActivityDriveService.test.ts`) — zero production imports found in components/context/hooks/utils. The file exports `buildVideoActivityResultsSheetData` which appears to have been extracted for the VA export flow but never wired into any component or hook. Added as new open item. All other open items (HIGH DashboardContext BLOCKED, MEDIUM large-files BLOCKED, LOW gen1 logger, LOW OAuth timeout, LOW double-getDoc userProfile, LOW simple switch cases, LOW feature_permissions read docs, LOW single-consumer utils) re-confirmed valid. 1 MEDIUM item resolved, 1 LOW item added._

_2026-07-03: Weekly audit pass (Friday). New dev-paul commits since 2026-06-26: pr-review log (docs), fix(css-scaling) SpecialistSchedule border inline style, fix(widgets) 3 review findings from #2098/#2125 (GuidedLearningEditor, not context/hooks/utils). DashboardContext.tsx now **5,865 lines** (+95 from 5,770 on 2026-06-26) — continued slow growth; BLOCKED extraction status unchanged. New large files not previously tracked added to MEDIUM item: `QuizResults.tsx` (2,314), `QuizWidget/Widget.tsx` (2,306), `SmartNotebook/PageEditor.tsx` (2,269), `PlcContext.tsx` (1,446). NEW LOW: double `getDoc` on `userProfile/profile` between AuthContext and DashboardContext — two independent reads for disjoint field groups (distinct from the resolved write-coordination item). Existing LOW gen1 logger import confirmed still open. classroomAddon utils group highlighted as highest-priority colocation candidates in single-consumer utils item. 1 new LOW open item added._

_2026-06-26: Weekly audit pass (Friday). New dev-paul commits since 2026-06-19 (rebased): docs(audit) close-outs only — no source changes. DashboardContext.tsx now **5,770 lines** (+23 from 5,747 on 2026-06-19) — minimal growth; BLOCKED extraction status unchanged. Comprehensive large-file scan surfaced 6 additional files exceeding 500 lines not previously tracked: AuthContext.tsx (2,666 lines), DraggableWindow.tsx (3,302 lines), useQuizSession.ts (2,673 lines), useQuizAssignments.ts (2,200 lines), QuizLiveMonitor.tsx (2,978 lines), QuizManager.tsx (2,544 lines) — added to MEDIUM large-files item. adminBuildingConfig.ts 30-case switch confirmed: 6 near-identical 4-field font/color cases already tracked in LOW "simple switch cases" item. Cloud Functions: all v2, well-configured, no new issues. Cross-context data fetching: no duplication. Deep relative imports: 1 test-file instance only (acceptable). Single-consumer utils: no change to list. 0 new open items._

_2026-06-19 (action): Resolved the MEDIUM userProfile concurrent-write item. Audit confirmed all `setDoc` writes to `/users/{uid}/userProfile/profile` in both contexts already use `{ merge: true }` (no active bug); documented the field-ownership contract on the `UserProfile` interface in types.ts plus reference comments at both contexts' primary write sites. Moved to Completed. HIGH/MEDIUM large-file extraction items remain BLOCKED (require supervised runtime verification)._

_2026-06-19: Weekly audit pass (Friday). New commits since 2026-06-13: fix(Modal), fix(i18n), fix(widgets) stale onBlur guards (DrawingWidget + SmartNotebook), fix(lti), fix(quizMaxPoints), pr-review batch. DashboardContext.tsx now **5,747 lines** (+25 from 5,722) — minimal growth; BLOCKED extraction status unchanged. Cloud Functions all confirmed v2. No data-fetching duplication in new code. No new deep relative imports. All existing open items re-confirmed valid. 0 new open items._

_2026-06-13: Weekly audit pass (Saturday). Rebase onto dev-paul: pr-review batch 12 PRs, refactor(admin-config) isCardOpacity guard, [AI] wide-distro phases 1-3 (tiering, landing page, rollout form, rollout_requests rules, user tier model, minTier permission gating, google-classroom feature gate), [AI] legal pages, [AI] OAuth scope drops. DashboardContext.tsx now **5,722 lines** (+126 from 5,596 on 2026-06-12) — continued steady growth. Single-use utils list extended: `adminBuildingConfig.ts` (only importer: DashboardContext), `collectionsMigration.ts` (only importer: DashboardContext), `ai_security.ts` (only importer: DashboardContext), `pickInitialBoard.ts` (only importer: DashboardContext), `mapWithConcurrency.ts` (only importer: single util), `pexelsService.ts` (single importer), `googleSession.ts` (single importer), `previewMode.ts` (single importer), `userTier.ts` (single importer) — added to existing LOW single-use-utils item. Cloud Functions confirmed v2. No data-fetching duplication in new contexts (tiering/permission gate added to AuthContext reads featurePermissions already owned there). All existing open items re-confirmed valid. 0 new open items._

_2026-06-12: Weekly audit pass. Rebase onto dev-paul (docs/unifier run 13, D4 @/ alias conversion in tests/, perf baseline refresh, fix DraggableWindow duplicate handler, debugger run 14). None touch context/DashboardContext.tsx, functions/src/index.ts, or adminBuildingConfig.ts structure. All existing open items re-confirmed valid. New finding: multiple large component/layout files not previously tracked now exceed 500 lines — QuizStudentApp.tsx (3762 lines), DashboardView.tsx (1908 lines), Dock.tsx (1597 lines), GlobalPermissionsManager.tsx (1497 lines), StarterPackConfigurationModal.tsx (1251 lines), VideoActivityStudentApp.tsx (990 lines). Cloud Functions all confirmed on v2. No data-fetching duplication detected. No deep relative imports (3+ levels of ../) in source files. Single-use utils list extended: assignToClassroom.ts, deleteDrawingPageSubcollection.ts, imageWorker.ts, lastActiveThrottle.ts, migrateDrawingToSubcollection.ts, miniAppNormalize.ts added to existing LOW item. 1 new MEDIUM open item added._

_2026-06-10: Weekly audit pass. DashboardContext.tsx confirmed at 5,596 lines (same as 2026-06-05 — no structural changes since). BLOCKED extraction status unchanged. functions/src/index.ts confirmed at 4,305 lines — organically growing domain-split pattern continues. Four new open items added: cardOpacity validation duplication in adminBuildingConfig.ts, stale v1 logger import in finalizeIdleQuizAttempts.ts, OAuth Cloud Functions missing explicit timeoutSeconds, and concurrent userProfile reads/writes between AuthContext and DashboardContext._

_2026-06-05: Weekly audit pass. DashboardContext.tsx now 5,596 lines (+321 from 5,275 on 2026-05-27). BLOCKED extraction status unchanged. functions/src/index.ts now 4,305 lines — domain split organically in progress (spotifyOAuth.ts, syncedQuizGroups.ts etc.). All Cloud Functions confirmed on v2; no v1 imports found. New LOW finding: feature_permissions and global_permissions read coordination between AuthContext and DashboardContext could benefit from documentation. adminBuildingConfig.ts: font-validation constants duplicated across reveal-grid/numberLine/concept-web cases (related to existing LOW simple-switch-cases item). Test imports with 3+ ../../ levels are all in .test.tsx files using vi.mock() — acceptable. No new large-file violations beyond what's already tracked. 1 new LOW open item added._

### MEDIUM Large component files not tracked by DashboardContext or functions/src items — 11 files exceed 1000 lines

- **Detected:** 2026-06-12
- **Files:** components/widgets/QuizWidget/components/QuizLiveMonitor.tsx (2,978 lines, added 2026-06-26), components/widgets/QuizWidget/components/QuizManager.tsx (2,547 lines, added 2026-06-26), context/AuthContext.tsx (2,709 lines, added 2026-06-26), components/common/DraggableWindow.tsx (3,346 lines, added 2026-06-26), hooks/useQuizSession.ts (2,678 lines, added 2026-06-26), hooks/useQuizAssignments.ts (2,200 lines, added 2026-06-26), components/student/QuizStudentApp.tsx (3,762 lines), components/layout/DashboardView.tsx (1,595 lines), components/layout/Dock.tsx (1,609 lines), components/admin/GlobalPermissionsManager.tsx (1,547 lines), components/admin/StarterPackConfigurationModal.tsx (1,251 lines); **added 2026-07-03:** components/widgets/QuizWidget/components/QuizResults.tsx (2,314 lines — bundles quiz results display, period-filter, export, and matching-editor UI), components/widgets/QuizWidget/Widget.tsx (2,306 lines — front-face quiz widget with all question-type renderers inline), components/widgets/SmartNotebook/components/PageEditor.tsx (2,269 lines — SMART Notebook page editor with toolbar, asset placement, and page navigation), context/PlcContext.tsx (1,446 lines — PLC state including synced-library, assignment monitor, member management, and sync-pull orchestration)
- **Detail:** Twelve source component files exceed 500 lines and were not previously tracked in this journal. The most critical: `QuizStudentApp.tsx` (3762 lines) bundles auth, lobby, question rendering, timer state, PIN entry, and score tracking; `DashboardView.tsx` (1908 lines) contains the main app shell, widget placement, toolbar, and menu logic; `Dock.tsx` (1597 lines) bundles dock header, folder panel, tool list rendering, and animation logic; `GlobalPermissionsManager.tsx` (1497 lines) contains all admin feature/access/quota UI in one component; `StarterPackConfigurationModal.tsx` (1251 lines) is a long form modal with no section decomposition; `VideoActivityStudentApp.tsx` (990 lines) mirrors the QuizStudentApp pattern.
- **Fix:** For QuizStudentApp and VideoActivityStudentApp: extract `TimerController`, `PinEntryForm`, `SessionLobby`, and `QuestionRenderer` into sibling components under their respective directories. For DashboardView: extract the toolbar/menu as `DashboardToolbar`. For Dock: extract `FolderPanel` and `ToolItem` into sub-components. For GlobalPermissionsManager: split into `WidgetAccessPanel`, `QuotaEditor`, and `BetaListManager`. These are view-layer extractions (no shared state changes) — lower risk than the DashboardContext extraction. Prioritize QuizStudentApp first given its size.
- **Deferred 2026-06-24 (action agent):** Not taken this pass. Although described as "lower risk," these are still multi-component extractions out of large, behaviorally-critical files (the top candidate `QuizStudentApp.tsx` at 3762 lines owns live-session auth, PIN entry, timer state, and scoring) with no unit-test coverage of those flows and no Firebase/student-session runtime in this environment — so `type-check`/`lint`/`vitest` would not catch a hook-ordering, timer, or session-state regression. Same verification-gap rationale that BLOCKED the `DashboardContext.tsx` (HIGH) and `functions/src/index.ts` (MEDIUM) refactors. Recommend a supervised, runtime-verified session. Took the highest-priority _safe_ Open item instead this pass (see ui-unification.md — ClockWidget/TimeTool font-picker unification).

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

### LOW `utils/videoActivityDriveService.ts` has zero production imports — never wired into any component or hook

- **Detected:** 2026-07-04
- **File:** utils/videoActivityDriveService.ts
- **Detail:** The file exports `buildVideoActivityResultsSheetData` (a wrapper around `buildResultsSheetData` from `utils/assignmentExportShared.ts` using `gradeVideoActivityAnswer` to correctly grade MA/FIB-with-variants). It was extracted to fix a grading gap for the VA export flow (the comment references "the TODO PR2a left at Results.tsx:170"). However, zero production files import it — only `tests/utils/videoActivityDriveService.test.ts` does. The function has no hook, component, or context consumer; teachers cannot reach the VA results export that uses the corrected grader.
- **Fix:** Wire `buildVideoActivityResultsSheetData` into the video-activity results export path. Locate the VA results export trigger (likely in `components/widgets/VideoActivityWidget/components/VideoActivityManager.tsx` or a hook) and replace the call to `buildResultsSheetData` (which misses MA/FIB-with-variants) with `buildVideoActivityResultsSheetData` from `@/utils/videoActivityDriveService`. Alternatively, if the PR2a fix was superseded by other changes, verify `buildResultsSheetData` now handles MA/FIB correctly and delete `videoActivityDriveService.ts` as dead code.

### HIGH `DashboardContext.tsx` grew 1262 lines since May 13 extraction — now 5596 lines

- **Detected:** 2026-05-22
- **Updated:** 2026-07-03 — file is now **5,865 lines** (+95 from 5,770 on 2026-06-26). New dev-paul commits: pr-review log, css-scaling fix, 3-review-findings fix — none add to DashboardContext. BLOCKED status unchanged.
- **Updated:** 2026-06-26 — file is now **5,770 lines** (+23 from 5,747 on 2026-06-19). New dev-paul commits: docs(audit) close-outs — no DashboardContext changes. BLOCKED status unchanged.
- **Updated:** 2026-06-19 — file is now **5,747 lines** (+25 from 5,722 on 2026-06-13). New commits: fix(Modal), fix(i18n), fix(widgets) onBlur guards, fix(lti), fix(quizMaxPoints), pr-review batch. Minimal DashboardContext growth this cycle (+25 lines). BLOCKED status unchanged.
- **Updated:** 2026-06-13 — file is now **5,722 lines** (+126 from 5,596 on 2026-06-12). [AI] wide-distro phases added tiering, minTier permission gating, google-classroom feature gate (+~130 lines). BLOCKED status unchanged.
- **Updated:** 2026-06-05 — file is now **5,596 lines** (+321 from 5,275 on 2026-05-27). Continued growth despite no new extractions. BLOCKED status unchanged — collections/Drive extraction still requires supervised runtime-verified session.
- **File:** context/DashboardContext.tsx
- **Detail:** After the May 13 extraction of `getAdminBuildingConfig` reduced the file from 4441 to 4041 lines, nine days of new features grew it back to 5303 (+1262, +31%). The file now exceeds 5000 lines. Primary drivers: (1) PLC collaborative space redesign added collection navigation state, `lastBoardIdByCollection` tracking, `setActiveCollectionId`, and related callbacks (~400 lines); (2) boards-modal inline share/duplicate actions; (3) admin personal-spotify building scoping; (4) PLC in-progress assignment monitor/results. Collections management in particular introduces a new distinct responsibility (board/collection relationship state) that belongs in a dedicated hook or context. The `useGoogleDrive` orchestration and Drive reconnect error handling are also clearly separable.
- **Fix:** Extract collections + board navigation state into `hooks/useCollectionNavigation.ts` (manages `activeCollectionId`, `lastBoardIdByCollection`, `setActiveCollectionId`, `boards-only` filtering). Extract Google Drive sync orchestration into `hooks/useDashboardDriveSync.ts` (wraps `useGoogleDrive`, `useDriveReconnected`, Drive reconnect error handler). These two extractions would remove ~600–800 lines and reduce DashboardContext back below 4500 lines.
- **BLOCKED 2026-05-22 (action agent assessment): Needs manual, runtime-verified refactor session — not safe for an unattended automated pass.** Investigated all three candidate seams in detail:
  - **`setActiveCollectionId` / collection navigation** — `setActiveCollectionId` (lines 4019–4054) delegates to `loadDashboard`, which is itself a context-internal callback (lines 3938–4017) coupled to `updateActiveId`, `dashboardsRef`, `navigationWriteRef`, `navigationDebounceRef`, `profileLoaded`, `user`, the debounce/dedup logic, and the Firestore `setDoc({merge:true})` nested-map navigation-memory write. `loadDashboard` is consumed throughout the context. Extracting it into a standalone hook means either drilling ~8 context internals as params or splitting `loadDashboard` itself — high risk of closure/ordering regressions.
  - **`useDashboardDriveSync`** — Drive logic is not one isolated block: the background-export effect (2255–2302) is intertwined with `saveDashboardFirestore` + `scrubDashboardPII`, the PII-restore effect (2319+) mutates widget config, and Drive calls are also embedded in save/share/restore paths (1171–1460). The auth-error handler (615–632) and `useDriveReconnected` latch (2315) are separable but small.
  - **Pure-function seams** — already harvested: `getAdminBuildingConfig` (utils/adminBuildingConfig.ts, May 13), `pickInitialBoard` (utils/pickInitialBoard.ts), migration (utils/migration.ts, migrateProportionalLayout.ts, collectionsMigration.ts). No clean unit-testable pure block remains inline.
  - **Verification gap:** there is no unit-test coverage for the navigation or Drive-sync effects, and no Firebase/Drive runtime in the scheduled-task environment, so `type-check`/`lint`/`vitest` would not catch a navigation, sync-timing, or PII-restore regression on the app's most critical state file. Recommend a dedicated supervised session that can exercise board switching, collection switching, and Drive sync against a live/emulated Firebase project before landing this extraction.

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

### LOW Double `getDoc` on `userProfile/profile` — AuthContext and DashboardContext each read disjoint field groups independently

- **Detected:** 2026-07-03
- **File:** context/AuthContext.tsx (~line 1491), context/DashboardContext.tsx (~line 1010)
- **Detail:** On every sign-in, both contexts independently issue a `getDoc` to `/users/{uid}/userProfile/profile`. `AuthContext` reads the identity/preference fields (`selectedBuildings`, `language`, `savedWidgetConfigs`, `setupCompleted`); `DashboardContext` reads the board/dock fields (`dockItems`, `libraryOrder`, `dockInitialized`). Because `DashboardContext` gates its read behind `profileLoaded` (set by `AuthContext` after its own read), the second read is almost always served from the Firestore SDK local cache in practice. However, there is no explicit coordination guarantee: a future change moving the `DashboardContext` read before `profileLoaded`, or a cold cache (offline-first scenario), would cause two parallel network requests for the same document. This is distinct from the resolved MEDIUM write-coordination item (which confirmed all writes use `{ merge: true }` and documented field ownership); the read coordination was not addressed in that resolution.
- **Fix:** After `AuthContext` fetches the profile document, pass the full data snapshot (or the `dockItems`/`libraryOrder`/`dockInitialized` fields) down through context rather than having `DashboardContext` re-fetch. Alternatively, consolidate into a single shared hook (`useUserProfile`) that both contexts consume, so the Firestore read is registered exactly once. Near-term mitigation: add a comment in `DashboardContext.tsx` near its getDoc call noting the dependency on `profileLoaded` and why the cache-hit assumption holds.

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
  - `utils/assignToClassroom.ts` — 1 consumer (`components/classroomAddon/AssignToClassroomModal.tsx`); **HIGH colocation priority** — 2026-07-03 audit identifies this as one of three `classroomAddon/` utils (134 lines) that are pure feature-local service logic; together with `classroomCourseLinks.ts` (64 lines) and `classroomCourses.ts` (86 lines) they total 284 lines and all share the same single consumer. Recommend moving all three to `components/classroomAddon/` to co-locate with their only consumer.
  - `utils/classroomCourseLinks.ts` — 1 consumer (`components/classroomAddon/AssignToClassroomModal.tsx`); HIGH colocation priority (see assignToClassroom.ts note above)
  - `utils/classroomCourses.ts` — 1 consumer (`components/classroomAddon/AssignToClassroomModal.tsx`); HIGH colocation priority (see assignToClassroom.ts note above)
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
  - `utils/adminBuildingConfig.ts` — 1 consumer (DashboardContext) (2026-06-13)
  - `utils/collectionsMigration.ts` — 1 consumer (DashboardContext) (2026-06-13)
  - `utils/ai_security.ts` — 1 consumer (DashboardContext) (2026-06-13)
  - `utils/pickInitialBoard.ts` — 1 consumer (DashboardContext) (2026-06-13)
  - `utils/mapWithConcurrency.ts` — 1 consumer (2026-06-13)
  - `utils/pexelsService.ts` — 1 consumer (2026-06-13)
  - `utils/googleSession.ts` — 1 consumer (2026-06-13)
  - `utils/previewMode.ts` — 1 consumer (2026-06-13)
  - `utils/userTier.ts` — 1 consumer (2026-06-13)
    Single-consumer utils are not necessarily wrong — domain separation is valid — but warrant a quick sanity check that they are not duplicating logic that already exists elsewhere, and that they are documented or self-explanatory.
- **Fix:** Verify each file's consumer. For `migration.ts` (owned entirely by DashboardContext), consider whether inlining or consolidating the migration logic into the context would reduce indirection. No action required if each file's scope is intentionally bounded.

### LOW `adminBuildingConfig.ts` — duplicate local constants: `validRevealFonts` and `validTextSizePresets`

- **Detected:** 2026-07-15
- **File:** utils/adminBuildingConfig.ts
- **Detail:** Two redundant constant declarations found in the reveal-grid switch case: (1) A local `validRevealFonts` constant (array of 11 font family strings) duplicates the module-level exported `VALID_FONT_FAMILIES` constant already defined in the same file — the local copy was likely written before the module-level constant existed or copied without noticing the duplication. (2) The inline `validTextSizePresets` array `['small', 'medium', 'large', 'x-large']` is declared twice in two separate switch cases (`need-do-put-then` and `work-symbols`) with no shared constant — a future addition of a new preset value would require updating both sites independently. Additionally, the 4-field appearance validation block (`fontFamily`/`fontColor`/`cardColor`/`cardOpacity`) is repeated verbatim across 4+ switch cases; this is related to the existing LOW "simple switch cases" item and can be addressed in that pass.
- **Fix:** (1) Replace the local `validRevealFonts` reference with `VALID_FONT_FAMILIES` (already in scope). (2) Extract `validTextSizePresets` to a module-level `const VALID_TEXT_SIZE_PRESETS = ['small', 'medium', 'large', 'x-large'] as const` and reference it in both switch cases. Both changes are pure refactors with no behavior impact. The 4-field appearance block can be factored alongside the "simple switch cases" data-declaration refactor already tracked.

### LOW `utils/mockGuidedLearningDriveService.ts` — dev mock lives in `utils/` not `tests/`

- **Detected:** 2026-07-15
- **File:** utils/mockGuidedLearningDriveService.ts
- **Detail:** The file is a dev/test double for the guided-learning Drive service. It exports no production logic and has no production imports — only the corresponding test file references it. Dev mocks and test doubles conventionally live under `tests/` (or alongside their source in `__mocks__/`) so that `utils/` remains production-only logic. Its presence in `utils/` could mislead a developer into importing it from production code.
- **Fix:** Move `utils/mockGuidedLearningDriveService.ts` to `tests/utils/` (or `tests/testHelpers/`) and update the one import in the test file that references it. Verify the move does not break the test suite with `pnpm test`.

---

## Completed

### MEDIUM `functions/src/index.ts` is 3525 lines — single file for all Cloud Functions (growth stalled)

- **Detected:** 2026-04-15
- **Completed:** 2026-07-04 (resolved outside journal workflow)
- **File:** functions/src/index.ts
- **Resolution:** 2026-07-04 audit confirmed `functions/src/index.ts` is now **144 lines** — a thin barrel of re-exports. JSDoc at the top of the file reads: "Cloud Functions entrypoint — a THIN BARREL of re-exports (F12). Every Cloud Function lives in its own leaf module." The domain split was completed upstream. All Cloud Functions now live in leaf modules (classlinkRoster.ts, aiGeneration.ts, embedProxy.ts, driveArchive.ts, adminAnalyticsEndpoint.ts, studentIdentity.ts, organizationInvites.ts, gcPlcOrphans.ts, plcWeeklyDigest.ts, aggregatePlcAssessment.ts, mirrorPlcIndex.ts, migratePlcs.ts, adminAnalyticsSnapshot.ts, expireSubShares.ts, finalizeIdleQuizAttempts.ts, googleOAuth.ts, spotifyOAuth.ts, classroomAddonAuth.ts, lti/ modules, etc.). The index.ts is a pure re-export barrel, resolving the navigability and growth concerns entirely. Prior journal entries tracked growth from 3525 → 4305 lines as of 2026-06-05; the split was completed outside the scheduled-task workflow at some point thereafter.

### MEDIUM Concurrent reads and writes to `userProfile` document between `AuthContext` and `DashboardContext`

- **Detected:** 2026-06-10
- **Completed:** 2026-06-19
- **File:** types.ts (UserProfile interface), context/AuthContext.tsx, context/DashboardContext.tsx
- **Detail:** The `/users/{uid}/userProfile/profile` document is read and written by both contexts. The risk was a future non-merge `setDoc` silently clobbering fields owned by the other context. `AuthContext` owns the account/identity fields (`selectedBuildings`, `language`, `savedWidgetConfigs`, `setupCompleted`, `dockPosition`, `favoriteBackgrounds`, `recentBackgrounds`, etc.); `DashboardContext` owns the board/dock fields (`dockItems`, `libraryOrder`, `dockInitialized`, `lastActiveCollectionId`, `lastBoardIdByCollection`).
- **Resolution:** Audited every `setDoc` targeting this path in both contexts — **all already use `{ merge: true }`**, so no active clobber bug exists. Implemented the journal's recommended short-term fix (Option B): documented the field-ownership contract as JSDoc on the shared `UserProfile` interface in `types.ts` (the single import point both contexts share), enumerating which context owns which fields and stating the invariant that every write MUST be merge-based. Added concise reference comments at each context's primary write site (DashboardContext dock-persist write; AuthContext account-preferences write) pointing to the contract. Documentation-only change — zero behavioral risk. `pnpm type-check`, `eslint --max-warnings 0`, and `prettier --check` all clean. Option A (single-owner refactor routing dock writes through an Auth-provided action) deliberately not pursued — it would move the dock-persist write path and carries runtime-sync risk not verifiable in this environment; the contract makes the convention enforceable by review instead.

### MEDIUM `adminBuildingConfig.ts` — `cardOpacity` range-check block copy-pasted 4 times

- **Detected:** 2026-06-10
- **Completed:** 2026-06-12
- **File:** utils/adminBuildingConfig.ts, tests/utils/adminBuildingConfig.test.ts
- **Detail:** The five-line `cardOpacity` range guard (`typeof === 'number' && Number.isFinite && >= 0 && <= 1`) was duplicated verbatim across four switch cases (`numberLine`, `checklist`, `stations`, `concept-web`), with the `stations` copy having already drifted in guard structure.
- **Resolution:** Extracted a module-level `isCardOpacity(value: unknown): value is number` type-guard helper (placed alongside the existing `isHexColor` / `isGlobalFontFamily` / `isWidgetFontFamily` guards). Replaced all four inline blocks with a single-line `if (isCardOpacity(raw.cardOpacity)) out.cardOpacity = raw.cardOpacity;`. The type guard also narrows `raw.cardOpacity` to `number`, so the assignment no longer relies on the inline `typeof` widening. Pure refactor — no behavior change. `pnpm type-check`, `eslint --max-warnings 0`, and `prettier --check` all clean; the existing 30 tests in `tests/utils/adminBuildingConfig.test.ts` all pass.
- **Follow-up:** The LOW "simple switch cases" item above can still be addressed separately to cover the broader appearance-field quartet (`cardColor`, `cardOpacity`, `fontFamily`, `fontColor`) via a data-declaration approach.

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
