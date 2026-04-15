# Code Structure & Infrastructure — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Wednesday_
_Last audited: 2026-04-15_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### MEDIUM `DashboardContext.tsx` is 3165 lines with at least three extractable responsibilities

- **Detected:** 2026-04-15
- **File:** context/DashboardContext.tsx
- **Detail:** The context file is the largest non-test source file at 3165 lines. It owns: (1) Firestore CRUD + real-time sync, (2) Google Drive backup/restore orchestration, (3) widget CRUD actions (add/update/delete/reorder), (4) `getAdminBuildingConfig` — a 300-line switch covering 20+ widget types that maps per-building admin overrides onto widget defaults, (5) `applyDashboardTemplate` and `loadStarterPack`, (6) migration and legacy handling. The `getAdminBuildingConfig` switch alone is long enough to be its own module.
- **Fix:** Extract `getAdminBuildingConfig` into `utils/adminBuildingConfig.ts` (pure function: `(type, featurePermissions, selectedBuildings) => Record<string, unknown>`). This removes ~300 lines from the context without touching its public API and makes the validation logic independently testable.

### MEDIUM All 9 Cloud Functions use Firebase Functions v1 (`functionsV1`) — migration to v2 warranted for high-memory functions

- **Detected:** 2026-04-15
- **File:** functions/src/index.ts (lines 294, 421, 909, 949, 1086, 1214, 1453, 1737, 1913)
- **Detail:** Every exported Cloud Function (`getClassLinkRosterV1`, `generateWithAI`, `fetchWeatherProxy`, `archiveActivityWallPhoto`, `checkUrlCompatibility`, `generateVideoActivity`, `transcribeVideoWithGemini`, `generateGuidedLearning`, `adminAnalytics`) uses `firebase-functions/v1`. The v1 API is in maintenance mode; v2 offers concurrency, per-request billing, better cold-start, and `onCall` v2 resolves CORS automatically without manual `corsHandler`. Three functions have heavy resource requirements: `generateVideoActivity` (1 GB / 300 s), `transcribeVideoWithGemini` (1 GB / 300 s), and `adminAnalytics` (4 GB / 540 s) — these benefit most from v2's concurrency model which avoids spinning up separate instances per simultaneous request. Comments in the file note that `generateWithAI` intentionally stays on v1 for URL format compatibility and `getClassLinkRosterV1` was kept on v1 while working, but neither block applies to the media-generation or analytics functions.
- **Fix:** Migrate `generateVideoActivity`, `transcribeVideoWithGemini`, `adminAnalytics`, `archiveActivityWallPhoto`, and `generateGuidedLearning` to `firebase-functions/v2`. Update imports from `firebase-functions/v1` to `firebase-functions/v2/https` (`onCall`, `onRequest`). Replace `.runWith({memory, timeoutSeconds})` with the v2 option object syntax. Keep `generateWithAI` and `getClassLinkRosterV1` on v1 per existing comments. Migrate `fetchWeatherProxy` and `checkUrlCompatibility` as lower priority.

### MEDIUM `functions/src/index.ts` is 2445 lines — single file for all Cloud Functions

- **Detected:** 2026-04-15
- **File:** functions/src/index.ts
- **Detail:** All 9 Cloud Functions live in one file. Logical groupings exist: ClassLink roster integration (getClassLinkRosterV1), AI generation (generateWithAI, generateVideoActivity, transcribeVideoWithGemini, generateGuidedLearning), utility (fetchWeatherProxy, archiveActivityWallPhoto, checkUrlCompatibility), admin (adminAnalytics). The file is difficult to navigate and review as a unit.
- **Fix:** Split into domain files: `functions/src/classlink.ts`, `functions/src/ai.ts`, `functions/src/utils.ts`, `functions/src/admin.ts`. Re-export all functions from `functions/src/index.ts` to preserve deployed names. This is a refactor with no behavior change but significantly improves reviewability.

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

_No completed items yet._
