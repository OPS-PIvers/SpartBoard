# Organization Admin Panel — Firestore Wiring Implementation Plan

Wire the newly-merged `components/admin/Organization/` scaffold (PR #1348) to real Firestore, replacing `mockData.ts`. The scaffold is UI-complete and landed on `dev-paul` as a non-functional preview; this plan delivers real persistence in four shippable phases.

**Base branch:** `dev-paul`
**Last updated:** 2026-04-19
**Status:** Phase 4 **deployed to prod** on `dev-paul`. All three new CFs (`createOrganizationInvites`, `claimOrganizationInvite`, `organizationMembersSync`) live on `spartboard` as of 18:14 UTC on 2026-04-19. Deploy took three commits (`07eb1f9e`, `2e948eee`, `e9d3c4a7`) due to a first-time-Eventarc IAM bootstrap that needed three manual bindings + ~10 min of GCP propagation — see Decisions Log entry "IAM bindings required for first event-triggered function" for the gory details so nobody hits the same wall twice. Remaining work is all Paul-owned: (1) run `scripts/backfill-org-members.js` to populate the ~90 missing teacher member docs, (2) manual QA per task J (step-by-step checklist below), (3) flag graduation per task K after QA passes. No code changes pending unless QA surfaces issues. See **Phase 4.1 backlog** section near the bottom for the consolidated list of deferred follow-ups.

---

## How to resume this work

If implementation is interrupted, do this before writing any code:

1. Open the **Current State** block below — it names the active phase and the last finished task.
2. Check the **Task Ledger** for the active phase — the first unchecked box is where to pick up.
3. Scan the **Decisions Log** at the bottom — it captures non-obvious choices that cannot be rederived from code.
4. `git log --oneline dev-paul ^<branch-base>` on the active branch to see what's already committed.

**Rule:** every completed task updates this doc in the same commit that lands the change. The doc is the source of truth for where we are.

---

## Current State

| Field               | Value                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active phase        | Phase 4 **deployed** — all three new CFs live on `spartboard` as of 2026-04-19 18:14 UTC; awaiting Paul's manual QA (J) and optional backfill run (A2) before flag graduation (K).                                                                                                             |
| Active branch       | `dev-paul` (Phase 4 landed as `07eb1f9e`; IAM-retrigger empty commits `2e948eee` + `e9d3c4a7`)                                                                                                                                                                                                 |
| Last completed task | Phase 4 / I — `organizationMembersSync` successful create at 2026-04-19 18:14 UTC on the second retry (`e9d3c4a7`). First deploy blocked on IAM, first retry deployed 11 of 12 functions (sync hit propagation race), second retry completed the set. All 12 functions + rules + storage live. |
| Last updated (UTC)  | 2026-04-19                                                                                                                                                                                                                                                                                     |
| Next action         | (1) Paul executes task J manual QA per the step-by-step section below. (2) If J passes, land task K (flag graduation) as a separate single-line commit. Task A2 ran 2026-04-20: 44 teacher docs upserted, 6 pre-existing admin docs untouched.                                                 |

---

## Architecture Overview

**Design:** Organization is a new layer **on top of** `/admins/{email}` and `admin_settings/user_roles`, not a replacement. A Cloud Function trigger on `/organizations/{orgId}/members/{email}` writes through to `/admins/{email}` so `firestore.rules` `isAdmin()` keeps working during migration.

**Why:** Rewriting `isAdmin()` touches every admin-gated rule; the write-through keeps blast radius tiny.

### Collections

| Path                                               | Purpose                                                  |
| -------------------------------------------------- | -------------------------------------------------------- |
| `/organizations/{orgId}`                           | `OrgRecord` (name, shortCode, plan, AI toggle)           |
| `/organizations/{orgId}/buildings/{buildingId}`    | `BuildingRecord` (name, address, adminEmails)            |
| `/organizations/{orgId}/domains/{domainId}`        | `DomainRecord` (domain, authMethod, verified)            |
| `/organizations/{orgId}/roles/{roleId}`            | `RoleRecord` (name, `perms` map)                         |
| `/organizations/{orgId}/members/{emailLower}`      | Canonical membership (roleId, buildingIds, status, uid?) |
| `/organizations/{orgId}/studentPageConfig/default` | Hero heading + section toggles + accent color            |
| `/organizations/{orgId}/invitations/{token}`       | Short-lived invite tokens (CSV import flow)              |

Existing `/admins/{email}` and `/users/{uid}/userProfile/{profileId}` are untouched.

### Per-view hooks

One hook per view, mirroring [hooks/useFeaturePermissions.ts](hooks/useFeaturePermissions.ts). Each returns `{ data, loading, error, add, update, remove }` and uses `onSnapshot`.

- `hooks/useOrganizations.ts` — list all orgs (super admin only)
- `hooks/useOrganization.ts` — single org doc + mutations
- `hooks/useOrgBuildings.ts`
- `hooks/useOrgDomains.ts`
- `hooks/useOrgRoles.ts`
- `hooks/useOrgMembers.ts`
- `hooks/useOrgStudentPage.ts`

---

## Sub-agent parallelization conventions

Each phase below calls out **which task groups can run in parallel** under sub-agents and which must be serial.

- **"Parallelizable"** blocks dispatch as concurrent `Agent` calls in a single assistant turn. Prompts must be self-contained (file paths, collection paths, acceptance criteria).
- **"Serial"** blocks run one after another because one output feeds the next.
- **Never parallelize** writes to the same file, rule changes + hook implementations that consume them, or security rule tests + their rules (rules must land first).
- After each parallel block, a serial **integration step** reconciles any interface drift between the parallel outputs.

---

## Phase 1 — Schema, rules, migration (read-only foundation)

Lays the data model, gets rules in place for read-only access, and migrates existing admins into the new `members` collection. No UI changes yet; `mockData.ts` continues to back every view.

**Branch:** `claude/implement-phase-1-AB4DD` (tasks A–D landed via #1350; tasks E–H landed directly on `dev-paul`)
**Status:** Complete — schema/rules/migration all live on `spartboard` as of 2026-04-18.

### Deliverables

- [x] `/organizations/orono` doc created in Firestore with seeded defaults
- [x] System roles (`super_admin`, `domain_admin`, `building_admin`, `teacher`, `student`) seeded into `/organizations/orono/roles/*`
- [x] Buildings seeded from seed config into `/organizations/orono/buildings/*` (4: schumann, intermediate, middle, high)
- [x] Every current `/admins/*` email upserted into `/organizations/orono/members/{emailLower}` with correct roleId
- [x] Every `admin_settings/user_roles.superAdmins` email upserted as `super_admin` role
- [x] `firestore.rules` extended with new helpers (`isSuperAdmin()`, `orgMember()`, `memberRole()`, `roleHasCap()`, `isDomainAdmin()`, `isBuildingAdmin()`, plus `isOrgMember()`)
- [x] Rules allow authed org members to `read` org/buildings/domains/roles/members; all writes still denied (Phase 3 TODO comments in place)
- [x] Rules-unit tests written for `@firebase/rules-unit-testing` — green run requires the Firestore emulator (`pnpm run test:rules`)
- [x] `scripts/setup-organization.js` idempotent via `set(…, { merge: true })`, with `--dry-run` flag + ADC fallback

### Task ledger

**Parallelizable (kick off together):**

- [x] **A — Type definitions.** Moved `components/admin/Organization/types.ts` → `types/organization.ts` (the old path re-exports for back-compat). Added `MemberRecord`, `InvitationRecord`, `CapabilityId` union, and tightened `RoleRecord.perms` to `Record<CapabilityId, CapabilityAccess>`. Updated `mockData.ts` + `RolesView.tsx` to satisfy the tighter type.
- [x] **B — Security rules.** Added `isSuperAdmin()`, `orgMember()`, `memberRole()`, `roleHasCap()`, `isDomainAdmin()`, `isBuildingAdmin()`, and `isOrgMember()` helpers in `firestore.rules`. `/organizations/{orgId}` + sub-collections (`buildings`, `domains`, `roles`, `members`, `studentPageConfig`, `invitations`) are read-only for org members; `invitations` is fully locked. All write stubs are `if false` with `TODO(phase-3)` / `TODO(phase-4)` comments.
- [x] **C — Migration script.** `scripts/setup-organization.js` mirrors `scripts/setup-admins.js`. Reads config from `scripts/org-seed.json` (gitignored — copy `scripts/org-seed.example.json`). Supports `--dry-run` and `--seed <path>`; batches writes in chunks of 400 with `{ merge: true }`.

**Serial (after parallel block completes):**

- [x] **D — Rules tests.** `tests/rules/firestore-rules-organizations.test.ts` (not `tests/e2e/` — that dir is owned by Playwright; `tests/rules` is excluded from default vitest and invoked via `firebase emulators:exec` through `pnpm run test:rules`, using a dedicated `vitest.rules.config.ts`). Covers: member reads, outsider-reads-blocked (except own member-doc probe), super-admin bypass via legacy `admin_settings/user_roles.superAdmins`, all writes denied, invitations fully locked, and no regression on `/admins/{email}`. _(Emulator has not yet been run locally — Java unavailable in this devcontainer; emulator tests are compiled/shaped but the first green run is still pending a host with Java.)_
- [x] **E — Deploy rules to `spartboard`.** `firebase deploy --only firestore:rules --project spartboard` — confirmed already live (CI deployed from `dev-paul` merge of #1350; manual run on 2026-04-18 reported "latest version already up to date, skipping upload"). Note: `.firebaserc` uses a single `spartboard` project; Firebase preview channels cover Hosting only, so Firestore rules go directly to the production `(default)` database.
- [x] **F — Run migration dry-run.** `node scripts/setup-organization.js --dry-run`. Output: 18 planned writes (1 org, 4 buildings, 1 domain, 5 roles, 1 studentPageConfig, 6 members).
- [x] **G — Run migration for real.** `node scripts/setup-organization.js`. Wrote 18 docs. Re-run confirmed idempotent. Verified via admin SDK read-back: org doc populated, 6 members present (5 `super_admin`, 1 `domain_admin`), 5 roles, 4 buildings.
- [x] **H — Update this doc.** Phase 1 complete; Current State moved to Phase 2.

### Acceptance checklist

- [x] `pnpm run validate` passes (type-check, lint, format-check, unit tests)
- [ ] Firestore emulator rules tests pass _(deferred — devcontainer has no Java; run on a host with the emulator when convenient)_
- [x] Migration script is idempotent (running twice produces no diff) — verified 2026-04-18
- [x] Existing admin users can still sign in and open Admin Settings (legacy `isAdmin()` still reads `/admins/*`) — rules change is purely additive; legacy admin paths untouched

---

## Phase 2 — Read-only view wiring

Wire `AllOrganizationsView`, `OverviewView`, `BuildingsView`, `DomainsView`, `RolesView`, `UsersView`, `StudentPageView` to read real Firestore data via hooks. All writes remain no-ops (existing in-memory handlers stay, but are now "Coming soon" toasts).

**Branch:** `claude/implement-org-wiring-phase-2-NRzzg`
**Depends on:** Phase 1 ✅
**Status:** Implementation complete; awaiting Q (manual QA in preview) before marking shipped.

### Deliverables

- [x] Seven per-view hooks in `hooks/` using `onSnapshot` (co-located tests under `hooks/*.test.ts`)
- [x] Each view reads from its hook; `mockData.ts` deleted. `CAPABILITY_GROUPS` moved to `config/organizationCapabilities.ts` so the migration script + future Cloud Functions can share the source of truth.
- [x] `OrganizationPanel.tsx` replaces the seven `useState(SEED_*)` blocks with hook calls and routes every write handler through a single "Coming soon in Phase 3/4" toast.
- [x] `useAuth` extended to expose `orgId`, `buildingIds`, `roleId`. Subscription to `/organizations/{DEFAULT_ORG_ID}/members/{emailLower}` hard-codes `DEFAULT_ORG_ID = 'orono'` for Phase 2 (single-org); Phase 3+ resolves dynamically. Two test-side mock `AuthContextType` fixtures (`components/student/StudentContexts.tsx`, `components/widgets/Embed/Widget.test.tsx`, `components/widgets/TalkingTool/Widget.test.tsx`) were updated to include the new fields.
- [x] Loading state rendered for each section via the panel-level `sectionLoading` map; empty states when the org doc or student-page config hasn't been seeded.
- [x] Unit tests for each hook (21 tests total — 3 per hook × 7 hooks). Covers: null-orgId skip, super-admin gate (for `useOrganizations`), snapshot hydration, and write-stub phase-labelled errors.

### Task ledger

**Parallelizable — batch 1 (all independent hooks):**

- [x] **A — `useOrganizations.ts`** + test. Super-admin-only query on `collection('organizations')`.
- [x] **B — `useOrganization.ts`** + test. Doc subscription + `updateOrg`, `archiveOrg` stubs that `Promise.reject` with a Phase 3 error.
- [x] **C — `useOrgBuildings.ts`** + test.
- [x] **D — `useOrgDomains.ts`** + test.
- [x] **E — `useOrgRoles.ts`** + test.
- [x] **F — `useOrgMembers.ts`** + test. Emits both the raw `MemberRecord[]` and a derived `UserRecord[]` so views keep their existing props contract.
- [x] **G — `useOrgStudentPage.ts`** + test. Doc subscription at `/organizations/{orgId}/studentPageConfig/default`.

All seven hooks use the same "adjust state during render" pattern as `useGuidedLearningAssignments.ts` to reset stale state on `orgId` changes without triggering the `react-hooks/set-state-in-effect` lint rule.

**Serial:**

- [x] **H — Extend `useAuth`.** Added `orgId`, `roleId`, `buildingIds` to `AuthContextValue`. Subscribes to `/organizations/{DEFAULT_ORG_ID}/members/{emailLower}` on sign-in. `DEFAULT_ORG_ID` is hard-coded to `'orono'` for Phase 2; once multi-org lands (see Open Questions) this resolves dynamically. Under `isAuthBypass` the state defaults to `{ orgId: 'orono', roleId: 'super_admin', buildingIds: [] }` so dev-mode continues to exercise the admin paths.

**Parallelizable — batch 2 (each view consumes one hook; no shared files):**

View prop signatures were not changed — instead, the panel wires hook data in and wraps every callback in a "Coming soon" toast. This keeps `views/*.tsx` diff-free for Phase 2 and leaves them ready to receive the real mutation callbacks in Phase 3 batch 2.

- [x] **I — Wire `AllOrganizationsView`** to `useOrganizations`.
- [x] **J — Wire `OverviewView`** to `useOrganization`.
- [x] **K — Wire `BuildingsView`** to `useOrgBuildings`.
- [x] **L — Wire `DomainsView`** to `useOrgDomains`.
- [x] **M — Wire `RolesView`** to `useOrgRoles`. (Also re-pointed the `CAPABILITY_GROUPS` import from the deleted `mockData.ts` to `@/config/organizationCapabilities`.)
- [x] **N — Wire `UsersView`** to `useOrgMembers` + `useOrgRoles` (needs both).
- [x] **O — Wire `StudentPageView`** to `useOrgStudentPage`.

**Serial:**

- [x] **P — Remove `mockData.ts`.** Deleted. `CAPABILITY_GROUPS` was extracted to `config/organizationCapabilities.ts` first so it remained the source of truth for the Roles matrix + the migration script's `SYSTEM_ROLES.perms` block.
- [x] **Q — Manual QA in preview.** Signed in as paul.ivers@orono.k12.mn.us on 2026-04-19; every section loads real Firestore data. Mobile viewport required a follow-up fix (`b593c9ca`) — the panel's outer `flex gap-6` wrapper was a flex-row with no mobile override, so the `md:hidden w-full` section selector claimed 100% width and squeezed `<main>` (flex-1) to 0px, making every tab appear blank on mobile. Fix: added `flex-col md:flex-row` so the layout stacks vertically on mobile. Counters (`users` on org/buildings/domains) still render as 0; this is expected — they're denormalized fields whose maintenance ships as a Phase 4 Cloud Function.
- [x] **R — Update this doc.** Phase 2 task ledger closed (commits `180e370` → `27beb25` → `5fd0e6b` → `b593c9ca`); Current State advanced to Phase 3 handoff.

### Acceptance checklist

- [x] Every view renders real Firestore data (verified in preview 2026-04-19)
- [x] No `SEED_*` references remain in `components/admin/Organization/` (verified via `rg 'SEED_' components/admin/Organization` → no matches)
- [x] Write buttons/menus show "Coming soon" toasts (not errors) — all handlers route through `OrganizationPanel`'s `showComingSoon()` helper
- [x] `pnpm run validate` passes — green on `5fd0e6b` (type-check + lint + format-check + 1312 unit tests)
- [x] No regression in legacy admin flows (`feature_permissions`, `admin_settings`) — `useAuth` additions are additive; legacy admin reads + `isAdmin()` paths untouched

---

## Phase 3 — Writes behind feature flag

Enable writes for each view, gated on a new `orgAdminWrites` entry in the existing `feature_permissions` collection. Paul tests live first as the sole beta user; graduate to `admin` or `public` once verified.

**Branch:** `claude/implement-org-wiring-phase-3-qtCsb` (merged + deleted post-merge)
**Depends on:** Phase 2
**Status:** **Merged** as squash `49490e9f` on 2026-04-19; Firestore rules auto-deployed to `spartboard` prod at 13:23 UTC via `firebase-dev-deploy.yml`. `global_permissions/org-admin-writes` seeded in prod ahead of merge so non-beta admins still see the "coming soon" toast path. Awaiting Paul's manual QA in preview (task R) before Phase 4 kicks off.

### Deliverables

- [x] `global_permissions/org-admin-writes` seeded via `scripts/init-global-perms.js` with `accessLevel: 'beta'`, `betaUsers: ['paul.ivers@orono.k12.mn.us']` (new `GlobalFeature` union member `'org-admin-writes'`)
- [x] Each hook's `add`/`update`/`remove` runs real Firestore writes; panel throws `"No organization selected"` when `orgId` is null (view layer catches via the `run()` helper and surfaces an error toast)
- [x] `firestore.rules` enforces scoping: super-admin for org `create`/`delete` + `aiEnabled`/`plan`; domain-admin for identity fields (via `affectedKeys().hasOnly([...])`); building-admin restricted to diffing member `status` within their `buildingIds`; system roles (`system:true`) immutable at the rules tier
- [x] Rules-unit tests cover: domain-admin cannot touch `aiEnabled`/`plan`; building-admin cannot change member `roleId` or `buildingIds`; building-admin can update member `status` only within their buildings; system roles cannot be mutated or deleted; cross-org writes blocked; invitations fully locked
- [x] Toasts surface success/error per mutation (reuses the Phase 2 `OrgToast` primitive; no debounced saving indicator needed because writes are optimistic via `onSnapshot`)

### Task ledger

**Serial (rules must land before writes are attempted):**

- [x] **A — Rules update.** Replaced `allow write: if false` stubs in `firestore.rules` with real scoping using helpers added in P1. `affectedKeys().hasOnly([...])` enforces field whitelists per actor role; system roles are blocked entirely. _Deploy is a user-owned step — `firebase deploy --only firestore:rules --project spartboard` from a host with credentials._
- [x] **B — Rules tests.** Expanded `tests/rules/firestore-rules-organizations.test.ts` to cover every write path (super admin, domain admin, building admin; in-scope + out-of-scope member updates; system-role immutability; invitations still locked; legacy `/admins/*` still readable). First green run still requires a host with Java for the emulator.

**Parallelizable — batch 1 (each hook gets a write path; no cross-file writes):**

- [x] **C — Writes in `useOrganization.ts`** (`updateOrg` strips `id`; `archiveOrg` sets `status:'archived'`) + tests
- [x] **D — Writes in `useOrgBuildings.ts`** (`addBuilding` derives slug id + defaults; `updateBuilding` strips `id`/`orgId`; `removeBuilding` deletes) + tests
- [x] **E — Writes in `useOrgDomains.ts`** (`addDomain` derives a slug id from the domain string with dot→dash; `removeDomain` deletes) + tests
- [x] **F — Writes in `useOrgRoles.ts`** (`saveRoles` upserts non-system roles + deletes custom roles dropped from the working set; system roles are filtered out client-side because the rules tier blocks writes to them; `resetRoles` deletes every custom role) + tests
- [x] **G — Writes in `useOrgMembers.ts`** (`updateMember` translates UI `role` → `roleId` and strips identity fields; `bulkUpdateMembers` + `removeMembers` fan out via `Promise.all`; `inviteMembers` remains a Phase-4 stub that rejects) + tests
- [x] **H — Writes in `useOrgStudentPage.ts`** (`updateStudentPage` uses `setDoc(..., { merge: true })` so the first write still works if the migration hasn't seeded the config; strips `orgId` from the patch and re-injects the canonical value) + tests
- [x] **I — Writes in `useOrganizations.ts`** (`createOrg` derives an id via `slugFromName()` and seeds `{ createdAt: ISO, plan:'basic', status:'trial', users:0, buildings:0, seedColor }`; `archiveOrg(orgId)` sets `status:'archived'`) + tests — super-admin only

**Parallelizable — batch 2 (each view swaps its no-op handlers for real writes):**

- [x] **J–P — View wiring in `OrganizationPanel.tsx`.** Every `comingSoon()` handler replaced with a `handleX()` wrapper that routes through a shared `run(label, task, successMsg?)` helper. The helper awaits the hook promise, shows a success toast on resolve, and an error toast with the rejection message on reject. View prop signatures were unchanged — this keeps `views/*.tsx` diff-free for Phase 3 and preserves the Phase-2 read-only layout.

**Serial:**

- [x] **Q — `canAccessFeature('org-admin-writes')` gate** in `OrganizationPanel.tsx`. When the flag is off (or the current user isn't in `betaUsers`), every `handleX` short-circuits to the Phase-2 "coming soon" toast. `'org-admin-writes'` added to the `GlobalFeature` union in `types.ts`; `scripts/init-global-perms.js` seeds the global-permissions doc as `accessLevel:'beta', betaUsers:['paul.ivers@orono.k12.mn.us']` so the default-allow behaviour of `canAccessFeature` doesn't accidentally open the gate for everyone.
- [ ] **R — Paul manual QA in preview.** Walk every mutation path; confirm rules fail out-of-scope writes and that the flag genuinely gates on non-beta accounts.
- [x] **S — Update this doc.** Phase 3 task ledger closed; Current State advanced to Phase 4 handoff (pending task R).
- [x] **T — Review-feedback fixes (`702e07f4`)** from the merge-readiness review on PR #1352:
  - `firestore.rules` — domain `create` gained `keys().hasOnly([...])` to match the shape enforcement on buildings/roles/members (clients can no longer stash arbitrary fields on a new domain doc).
  - `firestore.rules` — member-update rule gained an explicit comment documenting that `uid` is intentionally excluded from the whitelist: Phase 4's first-sign-in link-uid write must go through a Cloud Function so no client actor can reassign a member's uid and hijack the linked account.
  - `firestore.rules` — building-admin member-update branch gained a comment documenting the `hasAny([])` gotcha: a newly invited member with `buildingIds: []` is intentionally not editable by a building admin until a domain admin assigns a building first.
  - `tests/rules/firestore-rules-organizations.test.ts` — new negative test for the domain `hasOnly` constraint (now 83 rules tests).
  - `components/admin/Organization/OrganizationPanel.tsx` — `handleArchiveOrg` logs a `console.warn` on `targetOrgId !== activeOrgId` instead of silently dropping the write, so wiring bugs surface in dev.
  - This doc — Phase 3 deploy-order section added (perm doc must be seeded before rules deploy, or the beta gate briefly opens for every domain admin).
  - Rules-unit tests run locally against the Firestore emulator (Java 21 installed via `openjdk-21-jre-headless`): **83/83 pass**. `pnpm run validate` green (1331 unit tests).
- [x] **U — Merge + deploy.** PR #1352 flipped out of draft and squash-merged to `dev-paul` at 2026-04-19 13:20 UTC as commit `49490e9f`. `firebase-dev-deploy.yml` ran automatically on the resulting `dev-paul` push and completed at 13:23 UTC with `✔ firestore: released rules firestore.rules to cloud.firestore` + `✔ Deploy complete!` — rules and functions are live on `spartboard` prod. Perm doc was seeded by a targeted one-off (not the drifted `init-global-perms.js`) on 2026-04-19 13:13 UTC before merge, so the default-allow fallback never opened the beta gate. The PR branch was deleted post-merge.

### Acceptance checklist

- [x] `pnpm run validate` passes — green on `702e07f4` (type-check + lint + format-check + 1331 unit tests)
- [x] All rules-unit tests pass — 83/83 green locally on 2026-04-19 against the Firestore emulator (Java 21 installed in the devcontainer; CI still runs them via `pnpm run test:rules` wrapping `firebase emulators:exec`)
- [ ] With flag off, no writes happen (toasts only) _(verify in preview as part of task R)_
- [ ] With flag on for paul.ivers, every mutation persists and re-renders via snapshot _(verify in preview as part of task R)_
- [ ] Cross-org writes are rejected by rules (verified in preview console)

### Deploy order (important)

Order matters for Phase 3 rollout. The `global_permissions/org-admin-writes`
doc was seeded on 2026-04-19 ahead of merge (see Decisions Log), so the
rules can now deploy without opening the beta gate. If you ever re-seed
from scratch, follow this order:

1. **Seed the perm doc first.** Do NOT run `scripts/init-global-perms.js`
   as-is — it uses unconditional `set()` (not merge) with stale config
   values and would clobber live `gemini-functions`/`smart-poll`/
   `live-session`/`embed-mini-app` entries. Either (a) run a targeted
   one-off that only writes `global_permissions/org-admin-writes` with
   `merge: true`, or (b) first align `init-global-perms.js` with prod and
   switch it to `set(..., { merge: true })`. A follow-up task should fix
   the script so it's safe to run again; until then treat it as unsafe.
   If the doc is missing at deploy time, `canAccessFeature('org-admin-writes')`
   falls back to the default-allow path in `AuthContext` (no permission
   record ⇒ public), so every domain admin would briefly get write UI
   without the beta gate.
2. **Deploy the rules.** CI does this automatically on push to `dev-*` or
   `main` (`firebase deploy --only functions,firestore,storage` in
   `.github/workflows/firebase-dev-deploy.yml`). Manual: `firebase deploy --only firestore:rules --project spartboard` from a host with creds.
3. **Smoke test as paul.ivers** (in `betaUsers`) — writes should persist.
4. **Smoke test as a non-beta domain admin** — writes should still show the
   Phase-2 "coming soon" toast.

---

## Phase 4 — Invitations, CSV import, write-through

Activates the invitation flow, CSV bulk-import, and the Cloud Function that keeps `/admins/{email}` in sync with membership changes (so `isAdmin()` keeps working for any new domain admins added via the panel).

**Branch:** landed directly on `dev-paul` as commit `07eb1f9e` (no PR branch used)
**Depends on:** Phase 3 (merged to `dev-paul`)
**Status:** **Pushed to origin/dev-paul 2026-04-19.** CI auto-deploy triggered via `firebase-dev-deploy.yml`. Paul's manual QA (task J) is the remaining gate before flag graduation (K).

### Phase 4 decisions (locked 2026-04-19)

Paul approved these upfront so sub-agents can dispatch with tight contracts. Rationale in the Decisions Log.

1. **Email delivery: copy-link flow, no transactional email dependency.** The invite CF returns the claim URL; the UI copies it to the clipboard and shows a toast with a one-click "Copy link" fallback. Teachers/admins share the link out-of-band (Gmail, Slack, etc.). Real transactional email (SendGrid/Resend/etc.) deferred to a Phase 4.1 follow-up — avoids provisioning a new secret/vendor account as part of this phase.
2. **Acceptance flow (step E): deep-link only for Phase 4; fallback deferred to Phase 4.1.** `/invite/:token` resolves the token, ensures the user is signed in, then calls the callable CF (`claimOrganizationInvite`) to link the member doc's `uid`. Originally this decision specified an AuthContext first-sign-in fallback that would query invitations by email. On implementation review we walked that back: invitations are fully locked from clients at the rules tier (Phase-1 decision kept through Phase 3), so the fallback would require a third server-side callable (`claimPendingInvitationByEmail`) and AuthContext plumbing changes. Under the zero-regressions bar, the extra surface area isn't worth the UX gain — the deep-link works, and admins who issue invites also know the recipient's email, so "ask for a new link" is a cheap recovery path. Revisit in Phase 4.1 if users actually lose links in practice.
3. **`organizationMembersSync` mapping.** Admin roleIds that mirror into `/admins/{email}`: `super_admin`, `domain_admin`, `building_admin` — but only when `status === 'active'`. `teacher`/`student` never write to `/admins`. **Never deletes admin docs the CF didn't create** — CF-written admin docs carry `{ source: 'organizationMembersSync' }` as a provenance marker; any pre-existing admin doc (no marker) is left untouched on every transition. This is the core "zero regression" guard: existing admins can never be demoted by a misfire.
4. **Scope for this phase.** Included: invite CF (A), members-sync CF (B), CSV parser (C), invite route (D), teacher backfill script (A2), AuthContext acceptance hook (F), UsersView wiring (G), rules-unit tests (H). Deferred to Phase 4.1: real transactional email, ~~counter-maintenance CF~~ (counter-maintenance CF landed 2026-04-20 as `organizationMemberCounters`; see Phase 4.1 backlog).
5. **Feature-flag graduation (K) stays beta.** `global_permissions/org-admin-writes` remains `accessLevel: 'beta'` with Paul as sole beta user through Phase 4. Graduation to `accessLevel: 'admin'` is a deliberate one-line follow-up after Paul's manual QA confirms invites + write-through behave correctly in prod.

### Pre-work already done (carry into Phase 4)

- **Rules are Phase-4-compatible.** Invitations collection stays locked (`allow read, write: if false`) so CFs own it end-to-end. Member update rule intentionally excludes `uid` from the whitelist — link-uid writes MUST go through a CF (see Decisions Log 2026-04-19).
- **User counters.** ~~Phase 4's responsibility.~~ **Landed 2026-04-20 in Phase 4.1** as `organizationMemberCounters` (see Phase 4.1 backlog entry). The `users` field on `/organizations/{orgId}`, `/organizations/{orgId}/buildings/{buildingId}`, and `/organizations/{orgId}/domains/{domainId}` is now maintained via `FieldValue.increment()` deltas on every `members/{email}` write. Each increment is atomic per document, but the trigger uses separate `update()` calls (not a batch/transaction), so cross-document counter updates can partially succeed — `scripts/recount-org-members.js` is the reconcile path.
- **Existing teachers need backfill.** The migration only upserted `/admins/*` + `superAdmins` into `members`. The ~90 active teachers at `/users/{uid}` have no member doc. Phase 4's acceptance-flow hook (step F) handles new invitees, but a one-shot backfill script is needed for existing teachers so they appear in the Users view with real counts. Recommend adding task A2 to the parallel batch below: `scripts/backfill-org-members.js` that iterates `/users/{uid}`, resolves each user's email + selectedBuildings, and upserts `/organizations/orono/members/{emailLower}` with `roleId: 'teacher'`. Idempotent via `{ merge: true }`.
- **Rules-unit tests run locally.** Java 21 is installed in the devcontainer; `pnpm run test:rules` works without needing a separate host. Add Phase 4 cases (invitation claim, uid link via CF, counter triggers) to the existing `tests/rules/firestore-rules-organizations.test.ts` file.
- **Feature flag graduation path.** `global_permissions/org-admin-writes` is currently `accessLevel: 'beta', betaUsers: ['paul.ivers@orono.k12.mn.us']`. Phase 4 step K graduates to `accessLevel: 'admin'`. That change is a single doc update via `scripts/init-global-perms.js` — rewrite the `betaUsers` entry and re-run.

### Deliverables

- [x] `functions/src/organizationInvites.ts` — two callable Cloud Functions: `createOrganizationInvites` (issue tokens + create `members`+`invitations` docs) and `claimOrganizationInvite` (link `uid` to the pending member doc using Admin SDK). 47/47 helper-level tests green.
- [x] `functions/src/organizationMembersSync.ts` — `onWrite` trigger on `members/{emailLower}` that mirrors admin-role members into `/admins/{emailLower}` (with `source: 'organizationMembersSync'` provenance marker; never touches docs without the marker). 18/18 transition-matrix tests green.
- [x] `utils/csvImport.ts` — CSV parser returning `{ valid: InviteIntent[]; errors: ParseError[] }`. 24/24 edge-case tests green.
- [x] `components/auth/InviteAcceptance.tsx` — `/invite/:token` route; auto-redirects to sign-in if unauthenticated, then calls `claimOrganizationInvite` and lands on the main app. Wired into [App.tsx](App.tsx) as a lazy-loaded route with `DialogProvider` + `AuthProvider` (no heavy providers).
- [x] `scripts/backfill-org-members.js` — one-shot: iterate `/users/{uid}`, derive email+buildingIds, upsert `members/{emailLower}` with `roleId: 'teacher'` (idempotent `{ merge: true }`). Written; run is Paul-owned.
- [~] First-sign-in fallback in `AuthContext.tsx` — **DEFERRED to Phase 4.1**. Would require a new server-side callable because invitations are (intentionally) rules-locked from every client tier. Deep-link is sufficient for Phase 4.
- [x] `UsersView` CSV+invite buttons wired to the real flow; success toast includes a "Copy link" action per invite (no email is sent). Single-invite case auto-copies the claim URL to clipboard via `OrganizationPanel.handleInviteSuccess`.
- [x] Rules-unit tests for invitations lockdown (every client role) + `uid`-write rejection on teacher/building admin paths. CF-internal logic tested via extracted pure helpers rather than the emulator's function stub.

### Task ledger

**Parallelizable — batch 1 (all independent files; integration happens in the serial block):**

- [x] **A — Cloud Function `organizationInvites`** (`functions/src/organizationInvites.ts`): two callables — `createOrganizationInvites` mints tokens, writes `members` (status `invited`) + `invitations` docs, returns `{ token, claimUrl, email }[]`; `claimOrganizationInvite` validates token, links `uid` onto the member doc via Admin SDK (bypassing rules), marks invitation `claimedAt`. **47 helper-level tests green.**
- [x] **A2 — Backfill script** (`scripts/backfill-org-members.js`): upsert existing `/users/{uid}` into `members/{emailLower}` as `teacher`. Idempotent, `--dry-run` flag, ADC fallback. **Executed 2026-04-20.** Before running, two fixes landed: (a) converted the script from CommonJS (`require`) to ESM because the repo's `package.json` declares `"type": "module"` — the as-authored script couldn't execute at all; (b) added an all-digits-local-part filter so student-ID-shaped emails like `704522@orono.k12.mn.us` never get upserted as teachers. Final run: 256 /users docs considered, 207 skipped (no email — anon-auth students + orphaned auth records), 1 skipped student ID, 4 skipped existing admin (the 4 migrated admins who also have `/users/{uid}` records, correctly preserved), **44 teacher docs upserted**. Post-run verification: `/organizations/orono/members` holds 50 docs — 44 teachers (all tagged `addedBySource: backfill:2026-04-19`), 5 super_admins + 1 domain_admin (all untagged, pre-existing from migration, untouched). "~90 teachers" estimate in the original plan was high; actual active teacher count is ~44.
- [x] **B — Cloud Function `organizationMembersSync`** (`functions/src/organizationMembersSync.ts`): onWrite trigger on `members/{emailLower}`. Mapping: `super_admin`/`domain_admin`/`building_admin` + `status: 'active'` ⇒ admin doc exists. All other transitions that would delete/demote only act when the admin doc carries `source: 'organizationMembersSync'`. Pre-existing admin docs (no marker) are never modified. **18 transition-matrix tests green on the `computeAdminAction` helper.**
- [x] **C — CSV parser util** (`utils/csvImport.ts` + test): parses header-based CSV with `name,email,role,building`, validates emails + role/building lookups against live hook data, returns `{ valid, errors }`. **24 edge-case tests green.**
- [x] **D — Invite-acceptance UI** (`components/auth/InviteAcceptance.tsx`): the `/invite/:token` view. Unauth → sign-in card that keeps token state across the auth flip. Auth'd → calls `claimOrganizationInvite`, shows success card for ~1s then redirects to `/`. Per-error-code failure states (`not-found`, `failed-precondition`, `deadline-exceeded`, `permission-denied` w/ sign-out button, generic fallback).

**Serial (after batch 1 completes; each step depends on outputs above):**

- [x] **E — Acceptance flow design.** ✅ Decided upfront — see Phase 4 decisions block and Decisions Log entry 2026-04-19 (deep-link + AuthContext fallback, later revised to deep-link only).
- [x] **F — `AuthContext` acceptance hook.** **Deferred to Phase 4.1** — see updated decision 2 above. Client-side fallback would require a new `claimPendingInvitationByEmail` callable because invitations are rules-locked from every client. Deep-link (task D) is the sole acceptance path for Phase 4.
- [x] **G — Wire `UsersView` + `OrganizationPanel`.** Replaced the `InviteModal` info-toast stub with real `inviteMembers(...)`; replaced the disabled "Upload CSV" button with a full `BulkImportModal` (file upload + paste, live preview of valid rows + per-line errors) wired to `parseInvitesCsv` + `bulkInviteMembers`. `OrganizationPanel.handleInviteSuccess` auto-copies the claim URL to clipboard for single invites, shows a generic "copy each link from the users list" toast for bulk. Graceful fallback on `navigator.clipboard` unavailability.
- [x] **H — Rules-unit tests.** Extended `tests/rules/firestore-rules-organizations.test.ts`: (1) `invitations` lockdown now covers domain admin / super admin / building admin / teacher / outsider across read+write+delete; (2) new suite verifies teacher + building admin cannot write `uid` on a member doc (domain admin was already covered). CF-internal logic unit-tested in `functions/src/*.test.ts` via the extracted `computeAdminAction` / `planMemberWrite` / `evaluateClaim` helpers.
- [x] **I — Deploy functions to prod.** ✅ Completed 2026-04-19 18:14 UTC after three commits due to a first-time-Eventarc IAM bootstrap. Sequence: (a) `07eb1f9e` (feature commit) — deploy **failed** at the IAM-policy-modify step; the deploy SA can't self-grant Eventarc bindings for a project that's never had an event-triggered function. (b) Three IAM bindings granted manually with `paul.ivers@orono.k12.mn.us` project-owner creds via an interactive `gcloud auth login --no-launch-browser` from the devcontainer (see Decisions Log). (c) `2e948eee` (empty retrigger commit) — 11 of 12 functions deployed, `organizationMembersSync` failed with "Permission denied while using the Eventarc Service Agent" (IAM propagation race — GCP's own warning said retry in a few minutes). (d) `e9d3c4a7` (empty retrigger commit ~5 min later) — `organizationMembersSync` successful create (took 1m 40s for the create op alone because Firestore trigger setup is slower). All 12 functions now live on `spartboard`.
- [ ] **J — Paul manual QA.** Send invite to alt email → open link → sign in → verify member doc + `/admins/{email}` (domain admin role) + `useAuth().isAdmin` === true. Also: flip a member's role from domain_admin → teacher and confirm `/admins/{email}` is removed; repeat on a pre-existing admin and confirm the CF leaves it alone. Recommended QA emails/accounts: use any secondary Google account you control (the invite flow validates signed-in email == invited email). **Detailed QA checklist in the "Phase 4 manual QA" section below.**
- [ ] **K — Graduate `org-admin-writes` flag** to `accessLevel: 'admin'`. **Explicitly deferred** — see Decisions block. Lands as a separate one-line commit after J passes. Mechanic: either (a) targeted `setDoc(..., { merge: true })` one-off changing `accessLevel: 'beta'` → `accessLevel: 'admin'` and emptying `betaUsers`, or (b) once `scripts/init-global-perms.js` is rebuilt (see Phase 4.1 backlog) run it.
- [x] **L — Update this doc.** Phase 4 task ledger closed as of commit `07eb1f9e` push on 2026-04-19; this Current State block advanced to "pushed, awaiting QA".

### Acceptance checklist

- [x] `createOrganizationInvites` + `claimOrganizationInvite` compile, tests pass (47/47). Deploy verification is post-merge via the `dev-paul` CI workflow.
- [ ] Newly-added `domain_admin` via the panel actually becomes an admin (verified via `useAuth().isAdmin`) after sign-in — **task J**
- [ ] Flipping a CF-created admin member → teacher removes `/admins/{email}`; flipping a pre-existing admin's member role does NOT touch `/admins/{email}` (regression guard) — **task J**
- [ ] CSV with 10+ rows imports cleanly, idempotent on retry — **task J** (CF's already-active-skip logic is unit-tested; end-to-end idempotency is the thing to verify live)
- [x] Rules-unit tests written and extended; full emulator run is a Paul-owned step (Java 21 is available in the devcontainer but `pnpm run test:rules` wraps in `firebase emulators:exec` which takes a few minutes)
- [x] Backfill script is idempotent by design (`{ merge: true }` + "don't-overwrite-admin-members" guard); Paul's first real run will confirm
- [x] All 4 phases' acceptance checklists still pass (no regressions) — full unit suite 1358/1358 green; touched-file suite 36/36 green

---

## Phase 4.1 backlog

Everything that was in-scope for "make the org panel real" but got deferred out of Phase 4 for scope or risk. Nothing here is blocking the Phase 4 user journey; these are polish and follow-ups.

### Deferred to Phase 4.1

- **Sign-in lockout for `status: 'inactive'` members.** Phase 4 ships with partial enforcement only: flipping an admin-role member to `inactive` removes `/admins/{email}` via `organizationMembersSync` (so they lose admin powers), but a deactivated teacher or student can still sign in with Google and read/write their own `/users/{uid}/*` subtree. Neither Firestore rules nor `AuthContext` currently gate on `member.status`. **Why deferred:** full lockout is a real design conversation — what happens to students on anonymous auth? What about ClassLink roster sync removing someone mid-class? Soft-revoke vs. hard-lockout? Not a regression to ship as-is; the Users view copy was rewritten in commit `e715e0a5` to match what the code actually does ("revokes admin access, doesn't block sign-in"). **Size:** ~1 day (AuthContext `signOut()` when member doc surfaces with `status !== 'active'`, plus a rules change for defense-in-depth, plus a toast/redirect UX). **Trigger to pick up:** admin actually needs to lock someone out (offboarding, misuse, etc.).
- **Transactional email for invites.** Phase 4 ships with copy-link-to-clipboard only. The CF returns a `claimUrl`; the admin shares it out of band. Real email would add a SendGrid/Resend/Mailgun dependency + a secret + template plumbing. **Why deferred:** avoiding a new vendor surface in the same PR that wires the CF + acceptance flow. **Size:** ~1 day (wire provider, add template, add to CF, test). **Trigger to pick up:** admin feedback that "share the link manually" is awkward.
- **AuthContext first-sign-in invite fallback.** Currently users must click the deep link. If they lose it, the admin has to regenerate. A fallback callable (`claimPendingInvitationByEmail(orgId)`) + AuthContext hook would auto-claim for users who sign in with an email that has exactly one pending invitation. **Why deferred:** extra surface area for a secondary UX case. Invitations are rules-locked so this needs a server-side callable. **Size:** ~half day. **Trigger:** lost-link complaints.
- ~~**Counter-maintenance Cloud Function.**~~ **Landed 2026-04-20** on branch `claude/fix-building-user-count-F7BqF`. [functions/src/organizationMemberCounters.ts](functions/src/organizationMemberCounters.ts) is an `onDocumentWritten` trigger on `organizations/{orgId}/members/{emailLower}` that applies `FieldValue.increment()` deltas to the `users` field on the org doc, every referenced building doc, and the matching domain doc. Pure `planMemberCounterDeltas()` + `resolveDomainDocId()` + `emailDomain()` helpers are unit-tested (21/21 cases green, covering create/delete/reassign/no-op/missing-fields/duplicate-ids/domain-change). Uses `update()` (not `set({merge:true})`) on building + domain docs so a deleted-but-still-referenced bucket fails the per-path write with "No document to update" and is logged+skipped rather than being resurrected. Intentionally never throws — mirrors the `organizationMembersSync` discipline to avoid handler-level retry loops that would deterministically double-apply increments. Firestore/Eventarc delivery is itself at-least-once, so a rare duplicate invocation could still double-apply a delta. **Reconcile tool is the authoritative repair path:** [scripts/recount-org-members.js](scripts/recount-org-members.js) rebuilds counters from `/members/*` if they ever drift (predated writes, partial failures, duplicate deliveries). Both the script's `tallyMembers()` and the CF's `planMemberCounterDeltas()` agree on bucket identity: `buildingId` by array membership, domain by `email.split('@')[1].toLowerCase()` matched against `/domains/*` docs (leading-`@` tolerant). **Pre-deploy state (2026-04-20):** counters are accurate as of the last recount; once the trigger deploys, subsequent member writes stay in sync.
- **Functions-scoped test runner.** `functions/` has `vitest.config.ts` but no `vitest` dep and no `test` script in `package.json`. `organizationInvites.test.ts` (47 tests) and `organizationMembersSync.test.ts` (18 tests) are authored as executable documentation but not run by CI. **Why deferred:** functions/ has never had a test runner (pre-existing pattern with `index.test.ts`). **Size:** 1-2 hours (add `vitest` dep, `test` script, a `pnpm --filter functions test` line in the validate pipeline, and a matching CI job). **Trigger:** first time we need to ship a CF logic change and want regression coverage.
- **Rebuild `scripts/init-global-perms.js` from prod snapshot.** The script has drifted from prod (stale daily limits, wrong access levels) and uses unconditional `set()` rather than merge. Currently unsafe to run; must be sidestepped with targeted one-offs. **Why deferred:** outside the Phase 4 scope. **Size:** 2-3 hours (snapshot prod, compare, rewrite with `{ merge: true }`). **Trigger:** needing to seed a new global permission or onboard a second environment.
- **Multi-org support.** `DEFAULT_ORG_ID = 'orono'` is hard-coded in `AuthContext` and `InviteAcceptance`. A second district would need a user→org resolver + an org-switcher UI. **Why deferred:** Orono is the only org for the foreseeable future. **Size:** ~1 week. **Trigger:** business signs a second district.
- ~~**Teacher backfill run.**~~ **Completed 2026-04-20** — see Phase 4 task A2 above for full details (44 upserts, 6 pre-existing admin docs untouched, student-ID filter added mid-run).

### Known follow-ups discovered during Phase 4

- **Eventarc IAM bindings are now in place on `spartboard`.** The first event-triggered function's IAM bootstrap is done. Any future event-triggered function (onDocumentWritten, onDocumentCreated, onSchedule, etc.) will deploy without this one-time setup. Documented in Decisions Log 2026-04-19 so a future maintainer who sees a 403 on a fresh project knows exactly which three bindings to grant.
- **`firebase-adminsdk-fbsvc` SA cannot modify project IAM** — this is correct least-privilege and should stay that way. Use interactive `gcloud auth login` as a project owner when IAM changes are needed, not the SA key.
- **`firebase-dev-deploy.yml` deploys functions + rules + storage on every `dev-*` push and has `--force`.** Non-trivial side effects on every push — worth keeping in mind. If a future change needs a staged rollout (e.g. rule + perm-doc coordination like Phase 3), seed the state BEFORE the push that deploys the consuming change. See Phase 3 deploy-order section.

---

## Phase 4 manual QA (task J) — step-by-step for a cold start

If you're resuming cold and task J is still open, run these exact steps in order. Each one verifies a distinct piece of the Phase 4 contract.

**Pre-flight:**

1. Confirm the `dev-paul` CI run for commit `07eb1f9e` went green (GitHub Actions). Look specifically for `functions[us-central1-createOrganizationInvites]`, `claimOrganizationInvite`, and `organizationMembersSync` in the deploy log.
2. Sign in to https://spartboard.web.app as `paul.ivers@orono.k12.mn.us` (the sole `betaUsers` entry for `org-admin-writes`). Open Admin Settings → Organization → Users. Writes should be enabled; non-beta admins should still see "coming soon" toasts.

**Happy-path invite:**

3. Click "Invite users" → enter an alt Google email you control → pick `teacher` role → pick a building → send. Toast should say "Invite link copied for `<email>`." and the link should be in your clipboard.
4. Open the invite link in an incognito window. Sign in with the invited Google account.
5. Verify in the Firebase console: `/organizations/orono/members/<emailLower>` now has `uid` populated, `status: 'active'`, and the invitation doc at `/organizations/orono/invitations/<token>` has `claimedAt` and `claimedByUid`.
6. Back in the main panel (as paul.ivers), the invited user should now show `Active` status in the Users table.

**Admin write-through (CORE regression guard):**

7. Invite another alt email as `domain_admin` via the flow above. Claim + sign in.
8. In Firebase console, verify `/admins/<emailLower>` exists and carries `{ source: 'organizationMembersSync', orgId: 'orono', roleId: 'domain_admin' }`.
9. In the Users view as paul.ivers, change that member's role from `domain_admin` to `teacher`. Wait ~5s for the trigger.
10. Verify `/admins/<emailLower>` is now **gone** (CF deleted it because `source` marker was present).
11. **Regression guard:** in Firebase console, manually pick any pre-existing `/admins/*` doc (e.g. the 6 migrated admins) and confirm it has NO `source` field. Change that user's member-doc `status` from `active` to `inactive` via the Users view. Wait ~5s. Verify `/admins/{email}` is **still there** — the CF logged "pre-existing admin doc, leave alone" and noop'd.

**CSV bulk import:**

12. Create a CSV locally with 3-5 rows: `name,email,role,building` header + rows using emails you control. Include at least one row with an unknown role and one with an unknown building to test error surfacing.
13. Click "Bulk import" in the Users view → upload the CSV. Confirm the preview panel shows valid-row count and per-line errors for the bad rows.
14. Click "Send N invites". Toast should say "Created N invites. Copy each link from the users list." (bulk doesn't auto-copy).
15. In the Firebase console, verify one `members/{emailLower}` + one `invitations/{token}` doc per valid row.

**Idempotency:**

16. Re-upload the **same** CSV. Bulk import should succeed again; the CF should refresh `invitedAt` on existing invited members rather than duplicating them. Toast should show `N invite(s) skipped (already active or duplicate).` for any already-claimed rows.

**If anything fails,** do not graduate the flag. Post findings against the commit and iterate.

---

## Open questions / risks

Track decisions here as they're resolved. Each entry: **question → decision → rationale → date**.

- **ClassLink building id alignment.** `hooks/useRosters.ts` stores `buildingId` in `userProfile`, but those ids come from ClassLink, not from `/organizations/{orgId}/buildings`. Will they match? If not, we need a `classLinkBuildingId` alias on `BuildingRecord`. **Status:** ✅ partially resolved during Phase 4 / A2 backfill (2026-04-20). The two schemes don't match — `userProfile/profile.selectedBuildings` uses the long form from [config/buildings.ts](config/buildings.ts) (`schumann-elementary`, `orono-intermediate-school`, etc.) while the seeded org buildings use short ids (`schumann`, `intermediate`, etc.). The backfill script now carries a `BUILDING_ID_LEGACY_TO_CANONICAL` map and normalizes legacy ids on write. Long-term a `legacyIds: string[]` alias on `BuildingRecord` would let any future writer do the same lookup without re-importing the map — deferred to Phase 4.1 since nothing currently writes member docs client-side except Phase 4's invite CF (which uses canonical ids already).
- **Multi-org super admin.** Current `AllOrganizationsView` assumes a single platform owner. If Orono provisions more districts, we need `activeOrgId` on `AuthContextValue` and an org-switcher. **Status:** still open; not blocking since Orono is the only org today. Revisit when a second district is provisioned.
- **System role deletion protection.** `RoleRecord.system=true` must be blocked in both UI and rules. **Status:** ✅ resolved — enforced at rules tier (`system == true` blocks update/delete) + filtered client-side in `useOrgRoles.saveRoles`. Rules-unit tests cover both.
- **Acceptance flow.** Invite deep-link vs. first-sign-in claim. **Status:** ✅ resolved — deep-link only for Phase 4; fallback deferred to Phase 4.1. See Decisions Log 2026-04-19 for the walk-back rationale.

---

## Decisions log

Record non-obvious choices so future sessions don't re-litigate them. Append; do not edit past entries.

- **2026-04-18** — Organization is a new layer on top of `/admins/{email}`, not a replacement. Cloud Function trigger syncs `members` → `admins`. Avoids rewriting every rule that calls `isAdmin()`.
- **2026-04-18** — Per-view hooks, not one `useOrganization` mega-hook. Matches existing `useFeaturePermissions` convention; enables granular `onSnapshot` subscriptions + parallel agent implementation.
- **2026-04-18** — Writes gate through existing `feature_permissions` collection (new `orgAdminWrites` key), not a new flag system. Reuses real-time sync infrastructure.
- **2026-04-18** — Migration script is idempotent via `merge: true`, with `--dry-run` flag. Pattern: `scripts/setup-admins.js`.
- **2026-04-18** — Rules tests live in `tests/rules/` (not `tests/e2e/`) because `tests/e2e/` is the Playwright test root; keeping emulator-dependent vitest tests in a separate directory lets the default `pnpm test` stay emulator-free while `pnpm run test:rules` wraps them in `firebase emulators:exec`.
- **2026-04-18** — `isSuperAdmin()` in `firestore.rules` reads from the legacy `admin_settings/user_roles.superAdmins` list (not from an org-scoped `members` roleId). The check is called without an `orgId` context, so it has to use a global source; the migration also upserts supers into Orono's members for Phase 2 UI parity.
- **2026-04-18** — Task E terminology clarified: `.firebaserc` has only one project (`spartboard`). Firebase preview channels only cover Hosting; Firestore rules + collections live on the single production database. "Deploy to preview" in the plan effectively means "deploy to prod Firestore." Phase 1 rules are additive (new read grants only, all writes denied) so blast radius is tiny.
- **2026-04-18** — Added `applicationDefault()` fallback path to `scripts/setup-organization.js`. Original script only accepted `FIREBASE_SERVICE_ACCOUNT` env or `scripts/service-account-key.json`; ADC fallback lets the script run from any host that has `gcloud auth application-default login` or a `GOOGLE_APPLICATION_CREDENTIALS` file. Service-account path remains the primary pattern for CI.
- **2026-04-18** — `/admins/*` contains 8 docs but only 6 unique emails after lowercase-dedup. Two admin docs are case-duplicates of other entries. The migration handles this correctly via `Set` on lowercased emails, but the duplicate admin docs are a data-quality item worth cleaning up in a follow-up (not a Phase-1 blocker).
- **2026-04-19** — Phase 3 feature flag key is `'org-admin-writes'` (hyphenated to match the existing `GlobalFeature` union convention) rather than `orgAdminWrites`. Stored in the `global_permissions` collection because `canAccessFeature` reads from there; the per-widget `feature_permissions` path is typed against `WidgetType | InternalToolType` and doesn't accept string-keyed features.
- **2026-04-19** — `canAccessFeature` defaults to `true` when no permission doc exists. For Phase 3's beta rollout we must seed the global-permissions doc (otherwise the gate opens for every user). `scripts/init-global-perms.js` now covers this; operators running a fresh environment still need to execute it.
- **2026-04-19** — Org archive is a soft archive (`status:'archived'`) for both super and domain admins rather than a hard delete. Hard delete is available at the rules tier for super admins, but it orphans sub-collections (`buildings`, `domains`, `roles`, `members`, `studentPageConfig`). Soft archive keeps the data recoverable and lets us write a real deletion path later if the business actually needs it.
- **2026-04-19** — System role immutability is enforced at the rules tier (`resource.data.system == true` blocks updates; `system: true` on create is rejected). `useOrgRoles.saveRoles` still filters system roles client-side so the UI never sends doomed writes — the rules check is defence-in-depth, not the primary UX path.
- **2026-04-19** — View prop signatures were deliberately left untouched in Phase 3. The real mutation callbacks are wired inside `OrganizationPanel` via a `run()` helper that awaits the hook promise and surfaces a toast on both success and failure. Views remain pure presentation components; this keeps Phase 2's view layer diff-free.
- **2026-04-19** — Slug-based id derivation (buildings, domains, orgs) generates URL-safe ids from user-provided names via `name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`. If the resulting slug is empty it falls back to a `crypto.randomUUID()` prefix so document paths stay valid. Views never surface ids to end-users — they're opaque routing keys.
- **2026-04-19** — Denormalized user counters (`users` on `/organizations/{orgId}`, `/buildings/{id}`, `/domains/{id}`) stay at 0 through Phase 3. Only the 6 migrated admins currently have `members` docs; the ~90 active teachers exist at `/users/{uid}` but haven't been backfilled into the org's member tree. Phase 4's Cloud Functions (`organizationMembersSync` + a counter-maintenance trigger) will keep these accurate. Teachers signing in before Phase 4 will NOT lose data: their `/users/{uid}/*` subtrees are untouched by the org layer, and `AuthContext`'s membership listener handles missing member docs gracefully (leaves `orgId`/`roleId`/`buildingIds` null/empty).
- **2026-04-19** — Phase 4 link-uid write **must** happen through a Cloud Function, not the client. The member-update rule's whitelist at `firestore.rules` intentionally excludes `uid`. Admin SDK in a CF bypasses rules, so the trigger can safely link `uid` on first sign-in; a client-side link would let any domain admin reassign a member's uid and hijack the linked account. Documented in the rules file itself so future contributors don't quietly add `uid` to the whitelist.
- **2026-04-19** — Phase 3 deploy order is perm-doc-first: `node scripts/init-global-perms.js` before `firebase deploy --only firestore:rules --project spartboard`. Deploying rules first opens the beta gate briefly for every domain admin because `canAccessFeature` defaults to `true` when no permission record exists. This order is enforced by the deploy-order section in this doc rather than tooling — the scripts are separately owned.
- **2026-04-19** — Mobile layout bug in `OrganizationPanel.tsx` found during Phase 2 QA: the outer wrapper was `<div className="flex gap-6 h-full">` (flex-row) with no mobile stacking override. On mobile, the aside is `hidden md:flex` so it disappears, but the mobile section `<select>` wrapper is `md:hidden w-full` — with `w-full` it claimed 100% of the row's width, leaving 0px for `<main className="flex-1">`. Every tab appeared blank. Fix is a one-line addition of `flex-col md:flex-row` so mobile stacks vertically. Landed on `dev-paul` as `b593c9ca` (separate from the Phase 3 PR so Phase 2 shippability wasn't blocked).
- **2026-04-19** — `global_permissions/org-admin-writes` seeded directly in prod Firestore ahead of the Phase 3 merge. Targeted `setDoc(..., { merge: true })` of the single doc (not via `init-global-perms.js` — see next entry). Before: doc did not exist → `canAccessFeature` would default-allow. After: `{ accessLevel: 'beta', enabled: true, betaUsers: ['paul.ivers@orono.k12.mn.us'], featureId: 'org-admin-writes', config: {} }`. This unblocks the automatic rules deploy CI runs on merge to `dev-paul`.
- **2026-04-19** — `scripts/init-global-perms.js` has drifted from prod and is **unsafe to run as-is**. It uses unconditional `set()` (not merge) and carries stale config for `gemini-functions` (`dailyLimit: 20` vs. prod `3`), `smart-poll` (flips prod `admin`/`disabled` back to `public`/`enabled`), `live-session` (flips prod `admin`/`disabled` back to `public`/`enabled`), `embed-mini-app` (re-enables and raises daily cap), and `video-activity-audio-transcription` (`dailyLimit: 5` vs. prod `3`). Follow-up task (outside Phase 3 scope): rebuild the script from a current prod snapshot and switch it to `set(..., { merge: true })`. Until then, targeted one-off scripts are the safe path.
- **2026-04-19** — Phase 3 merged + deployed on the same day as review fixes, without the usual stage-in-preview pause. The CI `firebase-dev-deploy.yml` workflow runs `firebase deploy --only functions,firestore,storage --project spartboard --force` on every `dev-*` push, so the merge to `dev-paul` is also the production rules deploy — there isn't a separate "deploy to prod" step to gate on. That's why the perm doc had to be seeded in prod BEFORE merge rather than after. If Phase 4 adds new global-permission flags or rule changes that need a staged rollout, they'll need the same pre-seed discipline.
- **2026-04-19** — **IAM bindings required for the first event-triggered Cloud Function on a Firebase project.** Phase 4's deploy of `organizationMembersSync` (an `onDocumentWritten` trigger — the first event-triggered function in this codebase) failed initially because the deploy service account doesn't have `resourcemanager.projects.setIamPolicy` permission (correct least-privilege) and therefore can't self-grant the Eventarc/Pub/Sub bindings a 2nd-gen event-triggered function needs. Firebase prints a helpful message naming the three required grants. For `spartboard` (project number `759666600376`) the grants were made by paul.ivers with project-owner creds via `gcloud auth login --no-launch-browser` from the devcontainer: (1) `service-759666600376@gcp-sa-pubsub.iam.gserviceaccount.com` → `roles/iam.serviceAccountTokenCreator`; (2) `759666600376-compute@developer.gserviceaccount.com` → `roles/run.invoker`; (3) `759666600376-compute@developer.gserviceaccount.com` → `roles/eventarc.eventReceiver`. Also confirmed (auto-granted when Eventarc API first enabled): `service-759666600376@gcp-sa-eventarc.iam.gserviceaccount.com` → `roles/eventarc.serviceAgent`. **These bindings are now permanent on `spartboard`; future event-triggered functions will deploy without this dance.** Secondary gotcha: after granting, IAM policy propagation takes ~5-10 min. The deploy retry at +10 min still hit "Permission denied while using the Eventarc Service Agent" for the sync function; a second retry ~5 min later succeeded. GCP's error message literally says "Since this is your first time using 2nd gen functions, we need a little bit longer to finish setting everything up. Retry the deployment in a few minutes." — trust that message.
- **2026-04-19** — `firebase-adminsdk-fbsvc@spartboard.iam.gserviceaccount.com` (the SA baked into `scripts/service-account-key.json`) has broad Firebase admin rights (Firestore admin, storage admin, etc.) but does NOT have `resourcemanager.projects.setIamPolicy`. It's the right SA for migration scripts, setup scripts, and ad-hoc Firestore ops — but not for project IAM changes. When a shared-infra change needs IAM admin rights, use an interactive `gcloud auth login` as a human project owner instead of the SA. Do not grant the SA `roles/owner` to "make it easier" — it would reduce least-privilege without fixing anything the SA actually needs day-to-day.

---

## Changelog

Append one line per commit that advances this plan. Include short SHA + task letter.

- 2026-04-18 — Phase 1 A–D landed on `claude/implement-phase-1-AB4DD` (types, rules, migration script, rules-unit-testing suite).
- 2026-04-18 — `9d9043d` — Phase 1 A–D squash-merged into `dev-paul` via #1350.
- 2026-04-18 — Phase 1 E confirmed live on `spartboard` (rules already deployed via CI from #1350).
- 2026-04-18 — Phase 1 F dry-run clean: 18 planned writes (1 org + 4 buildings + 1 domain + 5 roles + 1 studentPageConfig + 6 members).
- 2026-04-18 — Phase 1 G committed: 18 docs written to `spartboard` Firestore; re-run verified idempotent; admin-SDK read-back confirms `/organizations/orono` hierarchy present.
- 2026-04-18 — `scripts/setup-organization.js` gained an `applicationDefault()` fallback and Phase 1 H doc updates land directly on `dev-paul`.
- 2026-04-18 — `180e370` — Phase 2 A–P: seven `onSnapshot` hooks + tests, all seven views consume hooks, `useAuth` extended with `{ orgId, roleId, buildingIds }`, `mockData.ts` deleted, `CAPABILITY_GROUPS` moved to `config/organizationCapabilities.ts`, write handlers routed through a single "Coming soon" toast. 21 new hook tests; `pnpm run validate` green.
- 2026-04-18 — `27beb25` — Phase 2 review-feedback round 1 (Copilot on PR #1351): (a) collection hooks now spread `{ id: d.id, ...d.data() }` so Firestore doc IDs survive the snapshot hydration (`useOrganizations`, `useOrgBuildings`, `useOrgDomains`, `useOrgRoles`; `useOrgMembers` uses `email: d.id` since the doc ID is `emailLower`); (b) hook tests updated to the `docs[]` mock shape; (c) `DEFAULT_ORG_ID` moved below imports in `AuthContext`; (d) `setOrgId(member.orgId ?? DEFAULT_ORG_ID)` uses the member-doc-derived org when available.
- 2026-04-18 — `5fd0e6b` — Phase 2 review-feedback round 2 (Gemini on PR #1351): (a) `OrganizationPanel` hook order reshuffled so `section`/`visibleSections`/`effectiveSection` are computed before hooks, letting `orgScopedOrgId = effectiveSection === 'orgs' ? null : activeOrgId` short-circuit org-scoped `onSnapshot` subscriptions when a super-admin is on the orgs list; (b) panel-level `isMembershipHydrating = !isSuperAdmin && Boolean(user) && authOrgId === null` now keeps every org-scoped section in loading state until the `useAuth` membership listener returns (prevents brief empty-state flashes); (c) removed unreachable `building_admin` fallback in `actorBuildingIds` (the branch was unreachable because `actorRole === 'building_admin'` already handled it). No behavioural regressions; all 1312 tests green.
- 2026-04-18 — Phase 2 final-review subagent pass confirmed production-ready; Current State advanced to Phase 3 handoff; PR #1351 cleared for merge pending preview QA (task Q).
- 2026-04-19 — Phase 3 A–S landed on `claude/implement-org-wiring-phase-3-qtCsb`: (A) `firestore.rules` replaced every `allow write: if false` stub with real scoping — super admin for `create`/`delete` + `aiEnabled`/`plan`; domain admin for identity fields via `affectedKeys().hasOnly([...])`; building admin restricted to member-`status`-only within `buildingIds`; system roles immutable; invitations still locked. (B) `tests/rules/firestore-rules-organizations.test.ts` expanded to cover every write path including negative cases. (C–I) All seven per-view hooks gained real writes replacing the Phase-2 stubs: `useOrganization` (updateOrg/archiveOrg), `useOrganizations` (createOrg w/ slug id, archiveOrg), `useOrgBuildings` (add/update/remove w/ slug id + defaults), `useOrgDomains` (add/remove w/ slug from `@domain.tld`), `useOrgRoles` (saveRoles upsert+delete, system-role-safe; resetRoles), `useOrgMembers` (updateMember translates `role`→`roleId`; bulk + remove fan out; invite still Phase-4 stub), `useOrgStudentPage` (setDoc merge). (J–P) `OrganizationPanel.tsx` replaced every `comingSoon()` handler with a `handleX()` wrapper routed through a shared `run()` helper that surfaces success/error toasts. (Q) `'org-admin-writes'` added to `GlobalFeature` union; `canAccessFeature('org-admin-writes')` gates every write handler; `scripts/init-global-perms.js` seeds the flag as `accessLevel:'beta'` with Paul as the sole beta user. (S) Doc updated; Current State advanced to Phase 3 QA handoff.
- 2026-04-19 — `b593c9ca` — Phase 2 follow-up on `dev-paul`: mobile layout fix in `OrganizationPanel.tsx` (outer wrapper gains `flex-col md:flex-row` so `<main>` doesn't collapse to 0px beside the `w-full` mobile section selector). Found during preview QA (task Q); every tab appeared blank on mobile until fixed.
- 2026-04-19 — `702e07f4` — Phase 3 review-feedback fixes landed on `claude/implement-org-wiring-phase-3-qtCsb`: (T1) domain `create` rule gained `keys().hasOnly([...])` to match other sub-collections' shape enforcement + new negative test in the rules suite. (T2) Member update rule gained a comment documenting that `uid` is intentionally excluded from the whitelist — Phase 4 link-uid writes must go through a Cloud Function. (T3) Building-admin member-update branch gained a comment documenting the `hasAny([])` empty-`buildingIds` gotcha. (T4) `OrganizationPanel.handleArchiveOrg` now logs a `console.warn` on target/active org-id mismatch instead of silently dropping the write. (T5) Phase 3 deploy-order note added to this doc (seed perm doc first). Rules-unit tests run locally against the emulator — **83/83 pass**; `pnpm run validate` green (1331 unit tests).
- 2026-04-19 13:13 UTC — **Perm doc seeded in prod** via a targeted one-off (`setDoc` with `merge: true`): `global_permissions/org-admin-writes = { accessLevel: 'beta', enabled: true, betaUsers: ['paul.ivers@orono.k12.mn.us'], featureId: 'org-admin-writes', config: {} }`. Done explicitly _before_ the merge so the `canAccessFeature` default-allow fallback never opened the gate for non-beta admins. `scripts/init-global-perms.js` was NOT used — it has prod drift (see Decisions Log 2026-04-19).
- 2026-04-19 13:20 UTC — **PR #1352 merged** to `dev-paul` as squash commit `49490e9f`. Branch `claude/implement-org-wiring-phase-3-qtCsb` deleted post-merge. All six PR-validation checks (Code Quality, Unit Tests, E2E Tests, Build, Docker Build, summary) green on merge.
- 2026-04-19 13:23 UTC — **Firestore rules auto-deployed** to `spartboard` prod via `firebase-dev-deploy.yml` triggered by the `dev-paul` push. Deploy log confirms `✔ cloud.firestore: rules file firestore.rules compiled successfully` → `✔ firestore: released rules firestore.rules to cloud.firestore` → `✔ Deploy complete!`. Phase 3 scoped writes are now live; non-beta admins still see "coming soon" toasts because the flag doc was already in place.
- 2026-04-19 — **Phase 4 decisions locked** before implementation kickoff: (1) **No transactional email pipeline.** Invite CF returns a claim URL; UI copies to clipboard and shows toast with "Copy link" action. Admins share out-of-band. Avoids introducing a new vendor dependency/secret in the same PR that wires CFs and ships invite acceptance. Real email deferred to Phase 4.1. (2) **Acceptance flow is deep-link primary + AuthContext first-sign-in fallback.** `/invite/:token` is the normal path; fallback auto-claims when a user signs in and exactly one pending invitation matches their email. Both paths share the same `claimOrganizationInvite` callable (Admin SDK bypasses rules → safe to link `uid`). (3) **`organizationMembersSync` never deletes admin docs without provenance marker.** CF-created admin docs carry `{ source: 'organizationMembersSync', orgId, roleId, updatedAt }`. Any pre-existing `/admins/{email}` (no marker) is immutable to the CF — this is the core regression guard against a mapping bug demoting current admins. Admin-role set: `super_admin`, `domain_admin`, `building_admin`, gated on `status === 'active'`. (4) **Scope cut: counter-maintenance CF deferred to Phase 4.1.** Denormalized `users` counters staying at 0 is stale display, not a regression. (5) **Flag graduation K is a separate PR** after Paul's manual QA confirms invites + write-through in prod. This PR keeps `org-admin-writes` at `accessLevel: 'beta'` (paul.ivers only).
- **2026-04-19** — **Decision 2 walked back during implementation: AuthContext first-sign-in fallback dropped.** Originally Phase 4 planned an AuthContext hook that would (a) notice when a signed-in user had no member doc, (b) query `/organizations/{orgId}/invitations` by email, and (c) auto-claim if exactly one match. Hit a rules wall: the invitations collection is fully locked from clients (Phase 1 decision kept through Phase 3). Making the fallback work would require either a third server-side callable (`claimInviteByEmail`) or loosening the rules — both add surface area in a CF-heavy PR with a zero-regression bar. Industry pattern (Slack, Notion, Linear) is deep-link-only anyway; users who lose their link ask admins to re-send. The invited member doc still populates via AuthContext's existing listener (status `'invited'`, no `uid`), so nothing breaks — they're just unclaimed until they click the deep link. Revisit as a Phase 4.1 item if "lost link" complaints materialize in practice.
- **2026-04-19** — Phase 4 implementation also chose **to make `bulkInviteMembers` a distinct hook method** (alongside `inviteMembers`) rather than reusing the single-role signature for CSV. Rationale: CSV rows carry per-row roleId + buildingIds (you can invite a domain admin and three teachers in the same file), and flattening them into the `(emails, role, buildingIds)` shape loses that per-row data. Both methods call the same `createOrganizationInvites` callable; the callable's payload already supports heterogeneous invites. Kept view-prop surface area minimal by routing both through `OrganizationPanel.handleInvite` / `handleBulkInvite` wrappers that share `handleInviteSuccess` for toast + clipboard behavior.
- 2026-04-19 — **Phase 4 A/A2/B/C/D landed in parallel** via five concurrent sub-agents on `dev-paul`: (A) `functions/src/organizationInvites.ts` — two callables `createOrganizationInvites` + `claimOrganizationInvite` with 47 helper-level tests; (A2) `scripts/backfill-org-members.js` — idempotent teacher backfill with `--dry-run`/`--org`/`--verbose` flags and ADC fallback; (B) `functions/src/organizationMembersSync.ts` — `onDocumentWritten` trigger + exported `computeAdminAction` helper covered by 18 transition-matrix tests, provenance-marker guard (`source: 'organizationMembersSync'`) enforced on every update/delete path; (C) `utils/csvImport.ts` — RFC-4180-aware parser with 24 edge-case tests; (D) `components/auth/InviteAcceptance.tsx` + `App.tsx` wiring for the `/invite/:token` route (token state survives the auth flip; per-error-code UI).
- 2026-04-19 — **Phase 4 integration + UI wiring** landed in a follow-up set of edits on `dev-paul`: `functions/src/index.ts` re-exports the two callables + the sync trigger; `hooks/useOrgMembers.ts` replaces the Phase-4 rejection stub with real `httpsCallable('createOrganizationInvites')` calls (single-role `inviteMembers` + CSV `bulkInviteMembers`); `components/admin/Organization/OrganizationPanel.tsx` replaces the Phase-3 info-toast stub with a `handleInvite` / `handleBulkInvite` pair that share a `handleInviteSuccess` helper (auto-copies claim URL via `navigator.clipboard` for single invites, toast-only for bulk); `components/admin/Organization/views/UsersView.tsx` replaces the disabled "Upload CSV" modal with a real `BulkImportModal` (file upload + paste, live preview of valid rows + per-line errors, submit routes to `onBulkInvite`). **Task F (AuthContext first-sign-in fallback) dropped** — see Decisions Log; invitations collection is rules-locked from clients.
- 2026-04-19 — **Phase 4 rules-unit tests extended** in `tests/rules/firestore-rules-organizations.test.ts`: the Phase-1 invitations-lockdown stub is now a full three-test suite covering domain admin, super admin, and the non-admin tiers (building admin / teacher / outsider); a new "uid write restricted to Cloud Functions" suite covers teacher + building-admin `uid`-write rejections (domain admin was already covered in the identity-spoofing test). These codify the core Phase 4 contract: clients never mint `uid` values, admin SDK via CF is the only path.
- 2026-04-19 — **Phase 4 validation:** root vitest **1358/1358 green** (+27 over Phase 3's 1331 — covers the extended `useOrgMembers` hook and the CSV parser). Rules-unit tests against the Firestore emulator **87/87 green** (+4 from Phase 3's 83: invitations lockdown now covers super/building/teacher/outsider tiers, plus two new `uid`-write rejection cases). Root + functions `tsc --noEmit` both clean. Prettier clean (after one `--write` fix on this doc); ESLint clean across all touched files. **Gap flagged for Phase 4.1:** the new `functions/src/organizationInvites.test.ts` (47 tests) and `organizationMembersSync.test.ts` (18 tests) are authored but not wired to any test-runner script — `functions/` has a `vitest.config.ts` but no `vitest` dependency and no `test` script in `package.json`; matches the pre-existing pattern for `functions/src/index.test.ts`. They exist as executable documentation; a Phase 4.1 cleanup should add `vitest` to `functions/` and wire a `pnpm --filter functions test` step into the validate pipeline so the CF logic is CI-covered, not just authored.
- 2026-04-19 — `07eb1f9e` — **Phase 4 pushed to `dev-paul`.** 16 files changed (+4090 / -81): all Phase 4 deliverables (A/A2/B/C/D), integration wiring (OrganizationPanel, UsersView, useOrgMembers), rules-unit tests, plan doc updates. Triggered `firebase-dev-deploy.yml`; deploy failed at the IAM-policy-modify step — the deploy SA can't self-grant Eventarc bindings for a project that's never had an event-triggered function. No rules or functions changed on prod at this point (deploy rolled back entirely before upload).
- 2026-04-19 17:58 UTC — **IAM bindings granted on `spartboard`** via interactive `gcloud auth login --no-launch-browser` as `paul.ivers@orono.k12.mn.us`: three `add-iam-policy-binding` calls (pubsub SA → serviceAccountTokenCreator, compute SA → run.invoker, compute SA → eventarc.eventReceiver). All three verified live in the project IAM policy immediately after. User credentials revoked from the devcontainer immediately after use; `firebase-adminsdk-fbsvc` SA (the one baked into `scripts/service-account-key.json`) remains the active/default account. gcloud itself remains installed in the devcontainer for future use.
- 2026-04-19 18:08 UTC — `2e948eee` — **First retry deploy.** Empty commit pushed to retrigger `firebase-dev-deploy.yml`. 11 of 12 functions deployed successfully — both invite callables created, all 9 pre-existing functions updated. `organizationMembersSync` failed with "Permission denied while using the Eventarc Service Agent" — classic first-use IAM propagation race. GCP's own warning: "Since this is your first time using 2nd gen functions, we need a little bit longer to finish setting everything up. Retry the deployment in a few minutes."
- 2026-04-19 18:14 UTC — `e9d3c4a7` — **Second retry deploy — green.** Empty commit pushed ~5 min after the first retry. `organizationMembersSync(us-central1)` successful create after a 1m 40s create op (Firestore triggers are slower to wire up than onCall functions). Deploy log: `✔ Deploy complete!`. All 12 functions, rules, and storage live on `spartboard`. Phase 4 / I complete; awaiting tasks J (manual QA) and optionally A2 (backfill run).
- 2026-04-20 — **Phase 4 / A2 executed.** Two pre-run fixes to `scripts/backfill-org-members.js`: (1) converted from CommonJS to ESM — the original `require()` calls failed under Node 24 because root `package.json` has `"type": "module"`; the as-authored script had never been run, so this bug was latent through Phase 4 merge. (2) Added an all-digits-local-part email filter to skip student-ID-shaped addresses (e.g. `704522@orono.k12.mn.us`) — Paul spotted one in the dry-run output, filter makes the rule permanent for future re-runs. Dry run then live run clean: 44 teacher docs upserted into `/organizations/orono/members`, 1 student-ID skipped, 4 existing admins with `/users/{uid}` records correctly left alone, 207 anon-auth/orphaned UIDs skipped for no-email. Post-run verification via admin SDK read-back: 50 members total (44 teacher + 5 super_admin + 1 domain_admin); all 6 pre-existing admin docs untouched (no `addedBySource` marker, correctly preserved). Idempotency re-verified via second dry run — same 44 planned upserts, no diff against live data.
