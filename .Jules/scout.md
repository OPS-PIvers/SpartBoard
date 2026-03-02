## 2025-02-18 - Added Tests for useStorage Hook

**Gap:** `hooks/useStorage.ts` had extremely low coverage (1.35%), leaving critical file upload logic (Firebase & Google Drive) untested.

**Fix:** Created `tests/hooks/useStorage.test.ts` using Vitest.

- Mocked `firebase/storage` (including `getStorage`, `ref`, `uploadBytes`, `getDownloadURL`, `deleteObject`).
- Mocked `context/useAuth` and `hooks/useGoogleDrive`.
- Added tests for `uploadFile` (Firebase path).
- Added tests for `uploadBackgroundImage` (Admin/Firebase vs Non-Admin/Drive paths).
- Added tests for `deleteFile` (Firebase path).

**Result:** Coverage improved to ~46%.

## 2025-02-18 - Added Tests for GoogleDriveService

**Gap:** `utils/googleDriveService.ts` had extremely low coverage (1.88%), leaving critical Drive API integration (list, upload, export, import) untested.

**Fix:** Created `tests/utils/googleDriveService.test.ts` using Vitest.

- Mocked `global.fetch` to simulate Google Drive API responses (success, 401, 404, errors).
- Added tests for `listFiles`, `getOrCreateFolder`, `uploadFile`, `exportDashboard`, `importDashboard`, `deleteFile`.
- Verified folder creation logic and dashboard export (update vs create).

**Result:** Coverage improved to ~60%.

## 2025-02-28 - [Firebase Config Mocking in Tests]

**Gap:** Components utilizing Firebase logic immediately fail the Vitest suite locally and in CI when the real `VITE_FIREBASE_API_KEY` environment variable is not set. In addition, providing dummy variables still initializes the real Firebase SDK path, which adds overhead and can make tests flaky.
**Fix:** Modified `tests/setup.ts` to globally mock `@/config/firebase` using `vi.mock()`. This returns lightweight dummy objects (`db`, `auth`, `storage`, etc.) and sets `isConfigured: false`, keeping tests fast and fully decoupled from real Firebase initialization logic.

## 2025-03-01 - Added Tests for DashboardPII

**Gap:** `utils/dashboardPII.ts` had no tests, leaving PII scrubbing/extraction logic untested.
**Fix:** Created `tests/utils/dashboardPII.test.ts` to verify `dashboardHasPII`, `extractDashboardPII`, `scrubDashboardPII`, and `mergeDashboardPII` functions.
**Result:** Coverage improved to 100% for this file.

## 2025-03-01 - Added Tests for ClassLinkService

**Gap:** `utils/classlinkService.ts` had no tests, leaving ClassLink Roster fetching and caching untested.
**Fix:** Created `tests/utils/classlinkService.test.ts` to verify `getRosters` caching, cache expiration, force refresh, and error handling.
**Result:** Coverage improved to 100% for this file.

## 2025-03-01 - Added Tests for Accessibility Utilities

**Gap:** `utils/accessibility.ts` had low coverage, leaving `getButtonAccessibilityProps` keyboard accessibility logic untested.
**Fix:** Created `tests/utils/accessibility.test.ts` to verify that proper ARIA roles, tabindex, and keyboard event handlers (Enter/Space) are returned and function correctly.
**Result:** Coverage improved to 100% for this file.
