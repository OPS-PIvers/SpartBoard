# Firestore Rules Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Monday_
_Last audited: 2026-05-04_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

### HIGH `admin_audit_log` collection has no Firestore security rule

- **Detected:** 2026-04-13
- **File:** components/admin/GlobalPermissionsManager.tsx:488, firestore.rules
- **Detail:** `GlobalPermissionsManager.tsx` writes to the `admin_audit_log` collection via `addDoc(collection(db, 'admin_audit_log'), {...})`. This collection has NO match block in `firestore.rules`. Because Firestore's default is deny-all, all writes to `admin_audit_log` are silently rejected by the database. Admin audit logging is effectively non-functional in production.
- **Fix:** Add a rule block to `firestore.rules` restricting the collection to admins only:
  ```
  match /admin_audit_log/{logId} {
    allow read, write: if isAdmin();
  }
  ```
  Then run `firebase deploy --only firestore:rules` to deploy. Verify in the Firebase Console that writes succeed after deployment.

### MEDIUM `sessions` collection allows any authenticated user to list all sessions

- **Detected:** 2026-04-13
- **File:** firestore.rules (approx. line 183)
- **Detail:** The rules comment acknowledges that listing all sessions is intentionally permitted for Phase 2 (to allow students to look up a teacher's session by PIN). This is mitigated by PIN validation in app logic, but any authenticated user can enumerate all active classroom sessions. A future Cloud Function join-code validation approach would eliminate the need for this broad read permission.
- **Fix:** Implement PIN/join-code validation via a Cloud Function and tighten the list permission. This is a known planned improvement (referenced in the rules themselves). Track against any future Cloud Function session-join work.

### LOW `custom_widgets.buildings` field not enforced by Firestore rules

- **Detected:** 2026-04-13
- **File:** firestore.rules (approx. lines 288-295)
- **Detail:** The `buildings` field on custom_widgets documents is used for UI targeting (showing widgets only to users in certain buildings) but is not validated or enforced by security rules. Any user can write any `buildings` value. The rules comment notes this is acceptable for district-scoped deployment and would require an expensive `get()` call per query to enforce server-side.
- **Fix:** Low priority. Acceptable as documented. Consider enforcing via Cloud Function if custom widget abuse becomes a concern.

---

## Completed

_No completed items yet._
