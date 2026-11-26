---
paths:
  - 'storage.rules'
  - 'hooks/useStorage.ts'
  - 'utils/googleDriveService.ts'
  - 'utils/driveRequest.ts'
  - 'utils/driveAssetUpload.ts'
  - 'tests/storageUploads.static.test.ts'
---

# Where uploaded files go

Paul's rule: every file a teacher uploads (images, PDFs, notebooks, slides, any material) is saved in the teacher's own Google Drive. Drive is free and unlimited for the district; Firebase Storage and Firestore are billed by the byte.

- **Teacher upload:** `uploadDriveAsset(driveService, { blob, name, folder: 'Assets/<Kind>', audience })` from `utils/driveAssetUpload.ts` (`audience: 'anyone'` when students must see it), and save `driveImageUrl(id)`. Copy `useStorage().uploadHotspotImage`. Add the folder to `DRIVE_UPLOAD_FOLDERS` in that file so delete can trash it. A picked Drive file is shared through `copyDriveAsset`. Never put a data URL or base64 file in a Firestore doc either.
- **Drive and Sheets requests** go through `DriveSession.request` in `utils/driveRequest.ts` (retry, timeout, token refresh, cached folders). Build services with `refreshGoogleToken` from `useAuth()`.
- **Firebase Storage is allowed only for:** student work (activity wall, quiz response media, project uploads), admin and district assets, files a Cloud Function reads or writes (paper crops, meeting audio, read-aloud cache, import inbox), Guided Learning video and audio (lh3 links can't stream), and Smart Notebook pages (Drive serves an SVG as a 1024px PNG, so the editor can't open it).
- **The guard:** `tests/storageUploads.static.test.ts` fails on a raw `fetch` to a Drive or Sheets URL outside `driveRequest.ts` and on a `makePublic` call outside the asset helper. It also counts every Storage write (client `uploadBytes*`, any use of `useStorage` raw helpers or `uploadParsedNotebook`, Admin SDK `.save`/`.upload` near a bucket) and every writable `storage.rules` path against an allowlist. A new one fails CI. Only add an entry for one of the allowed cases above, with its reason, and name it in the PR so Paul can OK it.
