---
paths:
  - 'storage.rules'
  - 'hooks/useStorage.ts'
  - 'utils/googleDriveService.ts'
  - 'tests/storageUploads.static.test.ts'
---

# Where uploaded files go

Paul's rule: every file a teacher uploads (images, PDFs, notebooks, slides, any material) is saved in the teacher's own Google Drive. Drive is free and unlimited for the district; Firebase Storage and Firestore are billed by the byte.

- **Teacher upload:** `GoogleDriveService.uploadFile(blob, name, 'Assets/<Kind>')`, then `makePublic(id, undefined)` when students must see it, and save `https://lh3.googleusercontent.com/d/<id>`. Copy `useStorage().uploadHotspotImage`. Add the folder to `DRIVE_UPLOAD_FOLDERS` so delete can trash it. Never put a data URL or base64 file in a Firestore doc either.
- **Firebase Storage is allowed only for:** student work (activity wall, quiz response media, project uploads), admin and district assets, files a Cloud Function reads or writes (paper crops, meeting audio, read-aloud cache, import inbox), Guided Learning video and audio (lh3 links can't stream), and Smart Notebook pages (Drive serves an SVG as a 1024px PNG, so the editor can't open it).
- **The guard:** `tests/storageUploads.static.test.ts` counts every Storage write (client `uploadBytes*`, any use of `useStorage` raw helpers or `uploadParsedNotebook`, Admin SDK `.save`/`.upload` near a bucket) and every writable `storage.rules` path against an allowlist. A new one fails CI. Only add an entry for one of the allowed cases above, with its reason, and name it in the PR so Paul can OK it.
