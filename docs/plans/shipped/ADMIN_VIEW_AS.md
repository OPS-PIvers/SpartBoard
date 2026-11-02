# Super admin "View as"

Grilled and settled 2026-09-30 against `dev-paul` at `f9c03edaa`. Seven stacked PRs to `dev-paul`, behind one kill switch.

## Goal

A super admin can open any teacher's (or sub's, or admin's) account from their own session, click around as that person to troubleshoot, and fix settings for them, without the person noticing and without disturbing their boards.

Paul can already sign in to each person's real account, so this is a speed tool, not a new power. It saves the log-out, sign-in-as, sign-back-in cycle every time a teacher asks for help. Where view-as cannot do something (for example, Drive content with no stored token), the fallback is the existing real-account sign-in.

## Current-state facts that drove the decisions

- **No admin can read another user's data today.**
  - Everything under `users/{uid}/**` is owner-only through `ownsUser` / `ownsUserTeacher` (`firestore.rules` ~413), plus plain `authUid() == userId` on the root doc and `userProfile`.
  - The only admin exception is `rosters/{id}/pin_index`. Storage rules (`storage.rules` 27-56) do let `isAdmin()` read user media.
- **Swapping the client's uid cannot work.**
  - The teacher app reads `auth.currentUser` directly in ~90 places across 23 files (useStorage, useLiveSession, useQuizAssignments, useQuizSession, SidebarClasses, …).
  - All ~100 callables trust `request.auth.uid`.
  - Signing in as the target with a custom token is the only faithful mechanism.
- **Custom tokens already exist** for students, LTI and the Classroom add-on (`studentIdentity.ts`, `lti/launchEndpoints.ts`, `classroomAddonAuth.ts`). There is no user impersonation anywhere yet.
- **Super admin has two sources.**
  - `admin_settings/user_roles.superAdmins[]` (legacy) and `organizations/orono/members/{email}.roleId == 'super_admin'` (rules `isSuperAdmin()` ~279, client `utils/superAdmin.ts`).
  - `functions/src/authz.ts` `isSiteSuperAdmin` is looser: it counts `domain_admin` and a missing roleId. The Delete account flow uses the strict gate (`organizationUserDelete.ts` `DELETE_ROLE_IDS`).
- **Drive content is `drive.file`-scoped**: quiz and bank bodies, VA, GL, roster student lists, and the board PII supplement `{id}-pii.json` (Firestore boards are PII-scrubbed).
  - Only the teacher's own OAuth grant opens these files.
  - About 1.8% of prod teachers have a server-side refresh token (`users/{uid}/private`, used by `googleOAuth.ts` `refreshGoogleAccessToken`).
- **Opening an account writes to it before anyone clicks.** On boot the app writes:
  - `users/{uid}` `lastLogin` and the member doc's `lastActive` (hourly).
  - The saved-widget-config migration, and the `setupCompleted` probes (Firestore and Drive).
  - Default "My First Board" when there are no boards (DashboardContext ~2611).
  - The dock persist, the Drive board export and the PII backup.
- **Board autosave writes whole dashboard docs.** The debounced tiers are in DashboardContext ~2940-3066, with a teardown flush on `pagehide` (~3253) and `saveDashboard(s)` (~1679, ~1785). Widgets are an array on the dashboard doc, so there is no per-widget field path.
- **`admin_audit_log/{id}` exists and is append-only**: admin read, create only (`firestore.rules` ~965). `deleteOrganizationUser` already writes `{ email, targetEmail, targetUid, orgId, timestamp }`.
- **Users table row menu** is `components/admin/Organization/views/UsersView.tsx` (~1050-1088: Edit, Resend invite, Reset password, Deactivate, Delete). Delete is super-admin-only through `canDeleteAccount={isSuperAdmin}` from `OrganizationPanel.tsx` (~192). Its callable is in `hooks/useOrgMembers.ts` (~330).
- **Subs sign in to `/subs` with Google** (`components/subs/SubsAuthGate.tsx`), so they have real uids and need no special mechanism.
- **Nothing to suppress in analytics.** There is no analytics SDK. What's New and announcement dismissals are localStorage only.

## Decisions

### Access and visibility

- **D1.** Only super admins, using the strict gate from the Delete account flow. The looser `isSiteSuperAdmin` is not used.
- **D2.** The target sees nothing. Every session and every persisted change is written to `admin_audit_log`.
- **D3.** Targets:
  - Teachers and subs get the full model below.
  - Admins, including super admins, are view-only. The server refuses unlock for any target with an `/admins` doc.
  - Students are always read-only (D15).
  - You cannot view as yourself.

### Mechanism

- **D4.** Custom token in an isolated tab.
  - `startViewAsSessionV1(targetEmail)` does the following, in order:
    1. Checks D1 and the kill switch (D17).
    2. Resolves the uid with `getUserByEmail`.
    3. Writes the audit entry **before** returning.
    4. Creates `view_as_sessions/{sid}` (super-admin read only), holding admin, target, `expiresAt`, `unlocked`, `reason`.
    5. Mints a token for the target uid with the claim `viewAs: { by, sid, ro: true, adminTarget, exp }`.
  - The admin tab opens `/?viewAs=<sid>`. That tab initializes Auth with `inMemoryPersistence` instead of `getAuth` (`config/firebase.ts` ~116), so the admin's own session in other tabs is never replaced.
  - The token goes from the opener to the new tab by `postMessage` after a ready handshake, never in the URL.
  - Renew and unlock run from the view-as tab itself: `updateViewAsSessionV1` trusts the server-minted claim, re-checks that the `by` email is still a super admin and the session is live, and re-mints. They survive the opener tab closing.
- **D5.** Drive content.
  - If the target has a stored refresh token, `getViewAsDriveTokenV1` returns a short-lived access token. `drive.file` limits it to files SpartBoard created.
  - Otherwise every Drive-backed surface shows "Drive content isn't available in view-as". The fallback is signing in to the real account.
- **D6.** Boot and background writes are always suppressed in view-as, even when unlocked: `lastLogin`, `lastActive`, migrations, `setupCompleted` probes, default board creation, dock persist, Drive board export, PII backup, and the navigation memory write.
- **D7.** Read-only is enforced in three layers:
  - **Client.** One `useViewAs()` guard at the write choke points: the `useFirestore` save paths, the AuthContext profile setters, and the autosave and teardown flush. In read-only these no-op quietly, with a single "View-only" toast per session.
  - **Rules.** `ownsUser` and `ownsUserTeacher` gain `(request.method in ['get', 'list'] || !viewAsReadOnly())`, where `viewAsReadOnly()` is true when the `viewAs` claim has `ro` or is past `exp`. This one edit covers every `users/{uid}/**` write.
    - Top-level teacher-writable collections (`quiz_sessions`, PLCs, shares, `organizations/*/members`) get the same check only where it is cheap. The client guard is their main defence (see Risks).
  - **Callables.** A shared `assertViewAsAllowed(request, { outward })` in `authz.ts` rejects write callables when the claim is read-only. A static test fails when an `onCall` file neither calls it nor appears on a reviewed read-only allowlist.
- **Session end is never a token revoke.** `revokeRefreshTokens(targetUid)` would sign the teacher out of their real sessions. The session ends by the client signing out, plus the `exp` claim in rules and callables.

### Session UX

- **D8.** Entry points: a "View as" item in the Users row menu (super admins only, same `inScope` pattern as Delete), and a user search box in Admin Settings.
- **D9.** The view-as tab has a persistent top banner: "Viewing as Jane Doe · Read-only · Pending changes (n) · Unlock edits · Exit".
  - Sessions last 1 hour. A "Renew" button appears in the last 5 minutes.
  - Closing the tab or pressing Exit ends the session, and the end is audited.
- **D10.** The banner shows how recently the target was active: the newest of the member doc's `lastActive` and their dashboards' `updatedAt`, since `lastActive` alone is hourly.
  - Unlocking while they were active in the last 10 minutes shows a warning that their open tab and your edits can overwrite each other.
  - Nothing is locked on their side.

### Changing things

- **D11.** Unlock and the pending panel.
  - Unlock asks for a short reason, which is audited, and re-mints without `ro`.
  - Even unlocked, board changes never autosave. The view-as tab edits a **local working copy** of each board.
  - Changes to widget **layout** (position, size, z-order, minimize/maximize, flip) and widget **config** appear as items in the Pending changes panel, grouped by board and then widget, each with a before/after, Approve and Discard. There is also an Approve all.
  - Approving is a transaction: it reads the target's latest dashboard doc, replaces only that widget's geometry or `config`, and writes. It is then audited with before and after.
  - If the widget no longer exists on the latest doc, the item shows as stale and can't be approved.
- **D12.** Adding or removing widgets, adding or removing boards, switching the active board, board order, dock order and zoom stay local and never become pending items.
- **D13.** Settings outside boards save directly when unlocked, with a "Saved to Jane's account" toast. This covers quiz and VA assignment settings, profile and preferences, library items and rosters.
  - Each save audits a field-level before (from the live listener value) and after.
  - Staging these was rejected: dozens of hooks write them, and every new write path would have to be staging-aware.
- **D14.** Outward actions are allowed only when unlocked, and each needs its own confirm and is audited. These are: assign or start, end a session, post to Classroom, share to PLC or sub, invites, AI generation and Drive export.
  - AI use counts against the target's quota.
  - In read-only these controls are disabled with the tooltip "Unlock edits to do this".
  - The callable guard receives `{ outward: true }`.
- **D15.** Student view.
  - Opened from inside a teacher's view-as through "View as student" on a student row in results, the monitor or the roster.
  - It mints a student-identity token with the same `viewAs` claim and `ro: true`, and it can never be unlocked.
  - Student apps run in a preview mode: they load the student's existing response and progress, create nothing (no join, no response doc, no "started"), and never appear on the teacher's live monitor or in results.
  - Response and session rules reject writes that carry the claim.

### Audit and release

- **D16.** Audit.
  - Every event writes to `admin_audit_log`: session start, renew, unlock and end, each pending approval, each direct save, and each outward action.
  - Types are `view_as_*`, carrying `sid`, `email` (admin), `targetEmail`, `targetUid`, `path`, `before`, `after` and `reason`.
  - The view-as tab is signed in as the target, so a new create rule allows `view_as_*` entries when the token's `viewAs.by` is set. That claim is server-minted, so it can be trusted.
  - A new super-admin-only Admin Settings tab, "View-as log", filters by admin and by target.
  - Each change has a one-click **Revert**. It re-applies `before` only if the field still holds the logged `after`. Otherwise it shows the logged and current values side by side, and you decide.
  - Revert runs as a callable using the Admin SDK, not a view-as session.
  - Revert keeps working with the kill switch off, so changes can be undone after an incident shutdown. It only touches `users/{targetUid}/**` (never `private`), and only entries whose `sid` matches a real session.
- **D17.** Release.
  - An `admin_settings/view_as` kill switch is added to `config/rolloutSwitches.ts`, with its toggle on the Previews tab. It is on in dev and ships off in prod until Paul flips it.
  - The feature is super-admin-only, so it is exempt from the teacher preview flag.
  - Every callable checks the switch, so turning it off stops new sessions and renewals immediately.

## PR sequence (stacked, all to `dev-paul`)

1. **Server foundation.**
   - Kill switch and Previews toggle.
   - `view_as_sessions` collection and rules.
   - `startViewAsSessionV1` and `updateViewAsSessionV1` (renew, unlock, end).
   - Strict super-admin gate shared with Delete.
   - The `viewAs` claim, including the admin-target unlock refusal.
   - Audit writes.
   - `assertViewAsAllowed` in `authz.ts`, applied to every write callable, plus the static coverage test.
   - Rules: the `ownsUser`/`ownsUserTeacher` method check and the `view_as_*` audit create rule.
   - Test with `node scripts/releaseFirestoreRules.mjs spartboard-dev` and `check:rules-size`.
2. **View-as tab runtime.**
   - `?viewAs` bootstrap with `inMemoryPersistence` and the `postMessage` token handoff.
   - `ViewAsContext` and the banner (D9, D10).
   - D6 boot-write suppression, and the D7 client guard at the choke points.
   - Entry points (D8).
   - Read-only only; no unlock yet.
3. **Drive in view-as (D5).** `getViewAsDriveTokenV1` over `refreshGoogleAccessToken`, and the placeholder state on Drive-backed surfaces.
4. **Unlock and board pending changes (D11, D12).**
   - Unlock dialog with reason and activity warning.
   - Local working copy.
   - Diff that classifies each change as layout, config or local-only.
   - Pending panel and transactional per-widget approve.
5. **Direct saves and outward actions (D13, D14).**
   - Unlocked write path with toast and before/after audit.
   - Outward-action confirms, and read-only disabled states.
6. **View-as log tab and Revert (D16).**
7. **Student view (D15).**
   - Student-identity token with the claim.
   - Preview mode in the quiz, VA, GL and activity-wall student apps.
   - Response and session rule rejections.
   - Tests that no response doc or join is created.

## Risks

- **Rules size.** The compiled rules are at or near the 250 KB cap. The D7 check lives in the two existing helpers and in one shorthand. Don't inline it per rule. Run `check:rules-size` on PR 1 and PR 7.
- **Writes outside `users/{uid}/**`.** The client guard misses a direct `auth.currentUser`write to a top-level collection the rules don't check, and in read-only it lands. PR 2 greps every write site in the 23 files that use`auth.currentUser` directly and either routes it through the guard or adds the rules check.
- **The mint callable is the crown jewel.** A compromised super admin session can open any account. Mitigations:
  - The strict gate.
  - The audit entry is written before the token is returned.
  - The kill switch.
  - The 1-hour `exp` checked in rules and callables.
  - Sessions that survive a closed opener still need a live `view_as_sessions` doc to renew.
- **Refresh-token lifetime.** A custom-token sign-in yields a Firebase refresh token that outlives the session. The `exp` claim in rules and callables is what makes the session end, so it has to be checked everywhere the claim is.
- **Concurrent edits.** Direct saves (D13) are last-write-wins against the teacher's open tab. D10's warning is the only mitigation, by design.

## Open items

- Confirm that `request.auth.token` custom claims survive the Firebase ID-token refresh for custom-token sessions. They should, because they are stored on the minted token. If they don't, the claims move to a server lookup keyed on `sid`.
- Confirm the student apps' join paths can load an existing response without creating one before PR 7 is sized.
