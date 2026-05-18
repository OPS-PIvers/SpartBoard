# Firestore Rules Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Monday_
_Last audited: 2026-05-18_
_Last action: never_

---

## In Progress

_Nothing currently in progress._

---

## Open

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

_2026-05-18: Full collection audit. Frontend collections (18 unique names via `db, '...'` pattern scan) and functions collections cross-referenced against match blocks in firestore.rules (now 2963+ lines). New collection since 2026-05-13: `shared_collections` — added in Collection-level sharing PRs (2f8d6751, f691e285) and covered at firestore.rules:852 with full read/write/subcollection rules for boards. Default-deny catch-all at final line confirmed present. `admin_audit_log` HIGH open item remains unfixed. No new unmatched collections._

_2026-05-13: Full collection audit. Frontend collections (23 unique names) and functions collections (12 unique names) cross-referenced against match blocks in firestore.rules (2573 lines). All collections verified to have match rules except `admin_audit_log` (confirmed HIGH open item remains unfixed). Default-deny catch-all at line 2569 confirmed present. No new unmatched collections introduced since 2026-05-04. New functions-only collections since last audit: none — functions code stable._

- **Detected:** 2026-04-13
- **Completed:** 2026-05-18
- **File:** firestore.rules:572-582, components/admin/GlobalPermissionsManager.tsx:572
- **Detail:** `GlobalPermissionsManager.tsx:572` writes to the `admin_audit_log` collection via `addDoc(collection(db, 'admin_audit_log'), {...})` when admins change Gemini model config. The collection had no match block in `firestore.rules`, so Firestore's default-deny policy silently rejected every write. The audit code already swallows write errors (`catch (auditErr) { console.error(...) }`), so the saves still succeeded but no audit row was ever persisted.
- **Resolution:** Added a `match /admin_audit_log/{logId}` block in `firestore.rules` adjacent to `admin_settings`, restricting read and `create` (not `write`) to admins via the existing `isAdmin()` helper. `create` instead of `write` is intentional: audit entries must be append-only so admins cannot edit or delete their own trail. Added a comment explaining the consequence of omitting the rule and why immutability matters so future audits don't re-flag or loosen it. `timestamp` is set server-side via `serverTimestamp()` at the call site (more tamper-resistant than a client epoch), so no `is int` type validation is added here. Will require a `firebase deploy --only firestore:rules` to take effect in production.
- **Verification:** `pnpm run test:rules` → 14 files / 431 tests all pass (rules emulator). `pnpm run lint --max-warnings 0` clean. `pnpm run type-check` clean.

_2026-05-18: Full collection audit. Frontend collections (18 unique names via `db, '...'` pattern scan) and functions collections cross-referenced against match blocks in firestore.rules (now 2967+ lines). New collection since 2026-05-13: `shared_collections` — added in Collection-level sharing PRs (2f8d6751, f691e285) and covered at firestore.rules:852 with full read/write/subcollection rules for boards. Default-deny catch-all at final line confirmed present. `admin_audit_log` HIGH item resolved in this PR — match block at lines 572-582 with append-only (`create` not `write`) permission. No new unmatched collections._

_2026-05-13: Full collection audit. Frontend collections (23 unique names) and functions collections (12 unique names) cross-referenced against match blocks in firestore.rules (2573 lines). All collections verified to have match rules except `admin_audit_log` (confirmed HIGH open item remains unfixed). Default-deny catch-all at line 2569 confirmed present. No new unmatched collections introduced since 2026-05-04. New functions-only collections since last audit: none — functions code stable._
