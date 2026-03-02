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
