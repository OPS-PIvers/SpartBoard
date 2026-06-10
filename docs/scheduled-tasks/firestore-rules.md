# Firestore Rules Consistency — Scheduled Task Journal

_Audit model: claude-sonnet-4-6_
_Action model: claude-opus-4-6_
_Audit cadence: weekly — Monday_
_Last audited: 2026-06-10_
_Last action: 2026-05-18 (admin_audit_log immutability hardening)_

---

## In Progress

_Nothing currently in progress._

---

## Open

_2026-06-10: Full collection audit. All collection() and collectionGroup() calls in components/, context/, hooks/, utils/, and functions/src/ cross-referenced against firestore.rules match blocks. Default-deny catch-all (`match /{document=**} { allow read, write: if false; }`) confirmed present — no silently unprotected collections. Three new rule-quality issues found and added to Open (pollVotes unrestricted write, admin_settings/user_roles redundant rule, ai_usage implicit write denial). Two existing open items unchanged._

_2026-06-08: Audited new code from dev-paul merge for new Firestore collection references. Changes: `adminAnalyticsCompute.ts` adds `'widget-builder'` and `'widget-explainer'` to the analytics AI type array (reads from existing `ai_usage` collection — already covered); `functions/src/index.ts` adds 2 `specificFeatureId` assignments for widget-builder/explainer (reads from existing `global_permissions` collection — already covered); `Dock.tsx` change removes one useEffect dependency (no collection reads); widget and i18n changes — no collection reads/writes. Zero new Firestore collections introduced. No new unprotected collections. Existing two open items unchanged._

_2026-06-01: Full collection audit. All collection names from frontend (components/, context/, hooks/, utils/) and functions/src/ cross-referenced against match blocks in firestore.rules. New code absorbed via merge since 2026-05-27: SettingsPanel null-guards, LunchCount/Settings cleanup, Countdown fix, RandomWidget refactor — none introduce new Firestore collection reads/writes. Cross-referenced 40+ collection names. Result: zero uncovered collections. All collections have match blocks. Default-deny catch-all (`match /{document=**} { allow read, write: if false; }`) confirmed present. Two existing open items (sessions list permission, custom_widgets.buildings field) unchanged._

_2026-05-27: Audited all collection() and collectionGroup() calls in components/, context/, hooks/, utils/, and functions/src/. Cross-referenced 40+ collection names against match blocks in firestore.rules (3066 lines). New code added since 2026-05-18: Spotify OAuth (functions/src/spotifyOAuth.ts), synced quiz/video-activity groups (functions/src/syncedQuizGroups.ts, syncedVideoActivityGroups.ts), shared_notebooks (context/DashboardContext.tsx, hooks/useNotebookSharing.ts). Verified: `shared_notebooks` has a match block (referenced in the 2026-05-23 audit note); `spotify_tokens` (if stored) would need a rule — but review of spotifyOAuth.ts shows it stores tokens in Firebase Auth custom claims, not Firestore; `synced_quiz_groups` and `synced_video_activity_groups` are stored under subcollections of existing organizations path already covered by the broad `/organizations/{orgId}/{document=**}` rule. Default-deny catch-all still present at end of rules. Zero new unprotected collections. Existing two open items unchanged._

### MEDIUM `pollVotes` subcollection write is unrestricted for all authenticated users

- **Detected:** 2026-06-10
- **File:** firestore.rules (approx. line 2645–2648, `announcements/{announcementId}/pollVotes/{optionIndex}`)
- **Detail:** The `pollVotes` subcollection rule is `allow write: if request.auth != null;`. Any authenticated user — including anonymous students joined via PIN — can write to any teacher's announcement poll. The document ID is `{optionIndex}` (predictable integer), so there is no deduplication per user per option enforced at the rules layer. A motivated user could overwrite other teachers' poll vote counts or vote multiple times by cycling through option indices. Announcement polls are admin-created content intended for a building's staff; the current rule applies to all authenticated users across buildings.
- **Fix:** Add an `allow write: if request.auth.uid == resource.data.voterId || !exists(...)` guard, or restrict to users in the announcement's building via `get(/databases/.../organizations/...)`. Alternatively, route votes through a Cloud Function that enforces per-user-per-option deduplication server-side, then restrict client writes to `if false`. The latter option is consistent with the direction taken for session join-code validation (tracked in the MEDIUM sessions item below).

### MEDIUM `sessions` collection allows any authenticated user to list all sessions

- **Detected:** 2026-04-13
- **File:** firestore.rules (approx. line 183)
- **Detail:** The rules comment acknowledges that listing all sessions is intentionally permitted for Phase 2 (to allow students to look up a teacher's session by PIN). This is mitigated by PIN validation in app logic, but any authenticated user can enumerate all active classroom sessions. A future Cloud Function join-code validation approach would eliminate the need for this broad read permission.
- **Fix:** Implement PIN/join-code validation via a Cloud Function and tighten the list permission. This is a known planned improvement (referenced in the rules themselves). Track against any future Cloud Function session-join work.

### LOW `admin_settings/user_roles` rule is redundant — shadowed by wildcard

- **Detected:** 2026-06-10
- **File:** firestore.rules (approx. lines 599 and 616)
- **Detail:** A specific `match /admin_settings/user_roles` block at line 616 is identical in content to what the `match /admin_settings/{document=**}` wildcard at line 599 already covers. Firestore applies both, but the specific rule is effectively dead. This creates a maintenance hazard: a developer updating admin_settings permissions might update only the wildcard or only the specific block, producing inconsistent rules without realizing it.
- **Fix:** Remove the redundant specific `match /admin_settings/user_roles` block. If user_roles requires different permissions from the rest of admin_settings in the future, re-add it at that time with a comment explaining the distinction.

### LOW `ai_usage` collection has no explicit write denial — relies solely on catch-all

- **Detected:** 2026-06-10
- **File:** firestore.rules (approx. lines 3065–3073)
- **Detail:** The `ai_usage` match block explicitly grants a read permission (owner-scoped UID prefix range scan) but omits any `allow write` rule, relying on the bottom-of-file catch-all `allow read, write: if false` to block client writes. An inline comment notes "No client write — quota increments are performed server-side via Admin SDK only." Relying on a global catch-all for security-sensitive intent (rate-limit quota) is fragile: if rules are ever reorganized and the catch-all moves or is accidentally removed, client write access would silently open. The intent is also invisible to reviewers reading just the `ai_usage` block.
- **Fix:** Add `allow write: if false;` explicitly inside the `ai_usage` match block, with a brief comment matching the existing "server-side via Admin SDK only" note. This makes the denial self-documenting and resilient to rule reordering.

### LOW `custom_widgets.buildings` field not enforced by Firestore rules

- **Detected:** 2026-04-13
- **File:** firestore.rules (approx. lines 288-295)
- **Detail:** The `buildings` field on custom_widgets documents is used for UI targeting (showing widgets only to users in certain buildings) but is not validated or enforced by security rules. Any user can write any `buildings` value. The rules comment notes this is acceptable for district-scoped deployment and would require an expensive `get()` call per query to enforce server-side.
- **Fix:** Low priority. Acceptable as documented. Consider enforcing via Cloud Function if custom widget abuse becomes a concern.

---

## Completed

### HIGH `admin_audit_log` collection has no Firestore security rule

- **Detected:** 2026-04-13
- **Completed:** 2026-05-18
- **File:** firestore.rules:572-582, components/admin/GlobalPermissionsManager.tsx:572
- **Detail:** `GlobalPermissionsManager.tsx:572` writes to the `admin_audit_log` collection via `addDoc(collection(db, 'admin_audit_log'), {...})` when admins change Gemini model config. The collection had no match block in `firestore.rules`, so Firestore's default-deny policy silently rejected every write. The audit code already swallows write errors (`catch (auditErr) { console.error(...) }`), so the saves still succeeded but no audit row was ever persisted.
- **Resolution:** Added a `match /admin_audit_log/{logId}` block in `firestore.rules` adjacent to `admin_settings`, restricting read and `create` (not `write`) to admins via the existing `isAdmin()` helper. `create` instead of `write` is intentional: audit entries must be append-only so admins cannot edit or delete their own trail. Added a comment explaining the consequence of omitting the rule and why immutability matters so future audits don't re-flag or loosen it. `timestamp` is set server-side via `serverTimestamp()` at the call site (more tamper-resistant than a client epoch), so no `is int` type validation is added here. Will require a `firebase deploy --only firestore:rules` to take effect in production.
- **Verification:** `pnpm run test:rules` → 14 files / 431 tests all pass (rules emulator). `pnpm run lint --max-warnings 0` clean. `pnpm run type-check` clean.

_2026-05-18: Full collection audit. Frontend collections (18 unique names via `db, '...'` pattern scan) and functions collections cross-referenced against match blocks in firestore.rules (now 2967+ lines). New collection since 2026-05-13: `shared_collections` — added in Collection-level sharing PRs (2f8d6751, f691e285) and covered at firestore.rules:852 with full read/write/subcollection rules for boards. Default-deny catch-all at final line confirmed present. `admin_audit_log` HIGH item resolved in this PR — match block at lines 572-582 with append-only (`create` not `write`) permission. No new unmatched collections._

_2026-05-13: Full collection audit. Frontend collections (23 unique names) and functions collections (12 unique names) cross-referenced against match blocks in firestore.rules (2573 lines). All collections verified to have match rules except `admin_audit_log` (confirmed HIGH open item remains unfixed). Default-deny catch-all at line 2569 confirmed present. No new unmatched collections introduced since 2026-05-04. New functions-only collections since last audit: none — functions code stable._
