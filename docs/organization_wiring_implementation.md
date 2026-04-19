# Organization Admin Panel — Firestore Wiring Implementation Plan

Wire the newly-merged `components/admin/Organization/` scaffold (PR #1348) to real Firestore, replacing `mockData.ts`. The scaffold is UI-complete and landed on `dev-paul` as a non-functional preview; this plan delivers real persistence in four shippable phases.

**Base branch:** `dev-paul`
**Last updated:** 2026-04-19
**Status:** Phase 3 review fixes landed on `claude/implement-org-wiring-phase-3-qtCsb` (commit `702e07f4`); rules-unit suite green locally (83/83), `pnpm run validate` green (1331 tests). Awaiting Paul's manual QA in preview before merging to `dev-paul` and kicking off Phase 4.

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

| Field               | Value                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active phase        | Phase 3 implementation complete + review fixes applied — awaiting Paul's manual QA (task R) before Phase 4                                                                                                                                          |
| Active branch       | `claude/implement-org-wiring-phase-3-qtCsb` (PR #1352, currently draft, MERGEABLE)                                                                                                                                                                  |
| Last completed task | Phase 3 / T — review-feedback fixes (`702e07f4`): domain `keys().hasOnly([...])`, uid-CF-only rules comment, empty-`buildingIds` rules comment, `handleArchiveOrg` dev warning, deploy-order doc, +1 rules test. Rules suite green locally (83/83). |
| Last updated (UTC)  | 2026-04-19                                                                                                                                                                                                                                          |
| Next action         | Phase 3 / R (Paul manual QA in preview) → flip PR out of draft → merge → kick off Phase 4 on `claude/org-wiring-p4-invites`                                                                                                                         |

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

**Branch:** `claude/implement-org-wiring-phase-3-qtCsb`
**Depends on:** Phase 2
**Status:** Implementation complete; awaiting Paul's manual QA in preview (task R).

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

### Acceptance checklist

- [x] `pnpm run validate` passes — green on `702e07f4` (type-check + lint + format-check + 1331 unit tests)
- [x] All rules-unit tests pass — 83/83 green locally on 2026-04-19 against the Firestore emulator (Java 21 installed in the devcontainer; CI still runs them via `pnpm run test:rules` wrapping `firebase emulators:exec`)
- [ ] With flag off, no writes happen (toasts only) _(verify in preview as part of task R)_
- [ ] With flag on for paul.ivers, every mutation persists and re-renders via snapshot _(verify in preview as part of task R)_
- [ ] Cross-org writes are rejected by rules (verified in preview console)

### Deploy order (important)

Order matters for Phase 3 rollout. Do each step from a host with Firebase
admin credentials, in this sequence:

1. **Seed the perm doc first** — `node scripts/init-global-perms.js`.
   If rules deploy before the `global_permissions/org-admin-writes` doc
   exists, `canAccessFeature('org-admin-writes')` falls back to the
   default-allow path in `AuthContext` (no permission record ⇒ public), so
   every domain admin would briefly get write UI without the beta gate.
2. **Deploy the rules** — `firebase deploy --only firestore:rules --project spartboard`.
3. **Smoke test as paul.ivers** (in `betaUsers`) — writes should persist.
4. **Smoke test as a non-beta domain admin** — writes should still show the
   Phase-2 "coming soon" toast.

---

## Phase 4 — Invitations, CSV import, write-through

Activates the invitation flow, CSV bulk-import, and the Cloud Function that keeps `/admins/{email}` in sync with membership changes (so `isAdmin()` keeps working for any new domain admins added via the panel).

**Branch:** `claude/org-wiring-p4-invites`
**Depends on:** Phase 3 (merged to `dev-paul`)
**Status:** Not started — ready to pick up once Phase 3 merges.

### Pre-work already done (carry into Phase 4)

- **Rules are Phase-4-compatible.** Invitations collection stays locked (`allow read, write: if false`) so CFs own it end-to-end. Member update rule intentionally excludes `uid` from the whitelist — link-uid writes MUST go through a CF (see Decisions Log 2026-04-19).
- **User counters are Phase 4's responsibility.** `users` on org/building/domain docs currently reads 0 because only migrated admins have `members` docs. A Phase-4 CF (counter trigger on `members/{email}` writes) needs to maintain these. Treat this as deliverable alongside `organizationMembersSync`.
- **Existing teachers need backfill.** The migration only upserted `/admins/*` + `superAdmins` into `members`. The ~90 active teachers at `/users/{uid}` have no member doc. Phase 4's acceptance-flow hook (step F) handles new invitees, but a one-shot backfill script is needed for existing teachers so they appear in the Users view with real counts. Recommend adding task A2 to the parallel batch below: `scripts/backfill-org-members.js` that iterates `/users/{uid}`, resolves each user's email + selectedBuildings, and upserts `/organizations/orono/members/{emailLower}` with `roleId: 'teacher'`. Idempotent via `{ merge: true }`.
- **Rules-unit tests run locally.** Java 21 is installed in the devcontainer; `pnpm run test:rules` works without needing a separate host. Add Phase 4 cases (invitation claim, uid link via CF, counter triggers) to the existing `tests/rules/firestore-rules-organizations.test.ts` file.
- **Feature flag graduation path.** `global_permissions/org-admin-writes` is currently `accessLevel: 'beta', betaUsers: ['paul.ivers@orono.k12.mn.us']`. Phase 4 step K graduates to `accessLevel: 'admin'`. That change is a single doc update via `scripts/init-global-perms.js` — rewrite the `betaUsers` entry and re-run.

### Deliverables

- [ ] `functions/src/organizationInvites.ts` — Cloud Function issuing invite tokens + sending email via existing transactional pipeline
- [ ] `functions/src/organizationMembersSync.ts` — `onWrite` trigger on `members/{email}` that upserts/deletes `/admins/{email}` based on current `roleId` mapping
- [ ] `UsersView` CSV import button wired: parses CSV, creates pending `members` docs, issues invites
- [ ] First-sign-in hook in `AuthContext.tsx` consumes invitation token and links `uid` to the membership
- [ ] Emulator e2e for invite → sign-in → `/admins/{email}` write-through

### Task ledger

**Parallelizable — batch 1:**

- [ ] **A — Cloud Function `organizationInvites`** (`functions/src/organizationInvites.ts`): token gen, Firestore write, email send
- [ ] **B — Cloud Function `organizationMembersSync`** (`functions/src/organizationMembersSync.ts`): onWrite trigger → `/admins/{email}` upsert
- [ ] **C — CSV parser util** (`utils/csvImport.ts` or extend existing): rows → invite intents
- [ ] **D — Invite-acceptance UI** (new route or modal — design TBD in serial step E)

**Serial:**

- [ ] **E — Acceptance flow design.** Decide: deep-link route vs. first-sign-in token check in `AuthContext`. Document here in Decisions Log before implementing.
- [ ] **F — `AuthContext` acceptance hook.** On sign-in, check pending invitations by email; claim and link `uid`.
- [ ] **G — Wire `UsersView` CSV button** to parser + `organizationInvites`.
- [ ] **H — E2E test.** Emulator: issue invite → sign in → assert member record linked and `/admins/{email}` written.
- [ ] **I — Deploy functions to preview.** `firebase deploy --only functions --project <preview>`.
- [ ] **J — Paul manual QA.** Send invite to self (alt email) → sign in → verify write-through.
- [ ] **K — Graduate `orgAdminWrites` flag** to `accessLevel: 'admin'`.
- [ ] **L — Update this doc.** Mark Phase 4 complete; set Current State → Done.

### Acceptance checklist

- [ ] Invite email delivers and links resolve
- [ ] Newly-added `domain_admin` via the panel actually becomes an admin (verified via `useAuth().isAdmin`)
- [ ] CSV with 10+ rows imports cleanly, idempotent on retry
- [ ] Emulator e2e green in CI
- [ ] All 4 phases' acceptance checklists still pass (no regressions)

---

## Open questions / risks

Track decisions here as they're resolved. Each entry: **question → decision → rationale → date**.

- **ClassLink building id alignment.** `hooks/useRosters.ts` stores `buildingId` in `userProfile`, but those ids come from ClassLink, not from `/organizations/{orgId}/buildings`. Will they match? If not, we need a `classLinkBuildingId` alias on `BuildingRecord`. **Decide by:** start of Phase 2 (hook shape depends on it).
- **Multi-org super admin.** Current `AllOrganizationsView` assumes a single platform owner. If Orono provisions more districts, we need `activeOrgId` on `AuthContextValue` and an org-switcher. **Decide by:** end of Phase 3.
- **System role deletion protection.** `RoleRecord.system=true` must be blocked in both UI and rules. Easy to forget. **Track in:** Phase 3 rules tests.
- **Acceptance flow.** Invite deep-link vs. first-sign-in claim. **Decide in:** Phase 4 step E.

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
