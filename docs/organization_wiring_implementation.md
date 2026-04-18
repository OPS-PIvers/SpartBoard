# Organization Admin Panel — Firestore Wiring Implementation Plan

Wire the newly-merged `components/admin/Organization/` scaffold (PR #1348) to real Firestore, replacing `mockData.ts`. The scaffold is UI-complete and landed on `dev-paul` as a non-functional preview; this plan delivers real persistence in four shippable phases.

**Base branch:** `dev-paul`
**Last updated:** 2026-04-18
**Status:** Phase 2 complete — PR #1351 cleared for merge (pending preview QA); Phase 3 ready to start on `claude/org-wiring-p3-writes`

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

| Field               | Value                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Active phase        | Phase 2 complete — ready for Phase 3                                                                                                 |
| Active branch       | `claude/implement-org-wiring-phase-2-NRzzg` — PR #1351 (commits `180e370`, `27beb25`, `5fd0e6b`); merge pending manual QA in preview |
| Last completed task | Phase 2 / R — review-feedback fixes applied (defensive `id` spread, super-admin listener gating, membership hydration loading, docs) |
| Last updated (UTC)  | 2026-04-18                                                                                                                           |
| Next action         | Phase 2 / Q (manual QA in preview) then kick off Phase 3 on `claude/org-wiring-p3-writes`                                            |

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
- [ ] **Q — Manual QA in preview.** Sign in as paul.ivers@orono.k12.mn.us; verify every section loads real data. _(Pending — requires preview deploy from this branch; this is the only remaining blocker before the PR merges.)_
- [x] **R — Update this doc.** Phase 2 task ledger closed (commits `180e370` → `27beb25` → `5fd0e6b`); Current State advanced to Phase 3 handoff.

### Acceptance checklist

- [ ] Every view renders real Firestore data (verified in preview) _(pending preview QA — task Q)_
- [x] No `SEED_*` references remain in `components/admin/Organization/` (verified via `rg 'SEED_' components/admin/Organization` → no matches)
- [x] Write buttons/menus show "Coming soon" toasts (not errors) — all handlers route through `OrganizationPanel`'s `showComingSoon()` helper
- [x] `pnpm run validate` passes — green on `5fd0e6b` (type-check + lint + format-check + 1312 unit tests)
- [x] No regression in legacy admin flows (`feature_permissions`, `admin_settings`) — `useAuth` additions are additive; legacy admin reads + `isAdmin()` paths untouched

---

## Phase 3 — Writes behind feature flag

Enable writes for each view, gated on a new `orgAdminWrites` entry in the existing `feature_permissions` collection. Paul tests live first as the sole beta user; graduate to `admin` or `public` once verified.

**Branch:** `claude/org-wiring-p3-writes`
**Depends on:** Phase 2
**Status:** Not started

### Deliverables

- [ ] `feature_permissions/orgAdminWrites` document exists with `accessLevel: 'beta'`, `betaUsers: ['paul.ivers@orono.k12.mn.us']`
- [ ] Each hook's `add`/`update`/`remove` runs real Firestore writes when flag allows, else throws a gated error caught by view layer
- [ ] `firestore.rules` enforces scoping: super-admin for org create/delete, domain-admin for org-wide fields, building-admin restricted to diff of `buildingIds` + `status` on members within their buildings
- [ ] Rules-unit tests cover: domain-admin cannot edit another org; building-admin cannot change member `roleId`; building-admin can update member `status` only within their buildings
- [ ] Debounced "saving…" indicator (reuse existing pattern from other admin views)

### Task ledger

**Serial (rules must land before writes are attempted):**

- [ ] **A — Rules update.** Replace `allow write: if false` stubs in `firestore.rules` with real scoping using helpers added in P1. Deploy to preview.
- [ ] **B — Rules tests.** Expand `tests/e2e/firestore-rules-organizations.test.ts` to cover every write path. Must pass before any hook write lands.

**Parallelizable — batch 1 (each hook gets a write path; no cross-file writes):**

- [ ] **C — Writes in `useOrganization.ts`** (updateOrg, archiveOrg) + tests
- [ ] **D — Writes in `useOrgBuildings.ts`** (add, update, remove) + tests
- [ ] **E — Writes in `useOrgDomains.ts`** + tests
- [ ] **F — Writes in `useOrgRoles.ts`** (create/clone/delete system-role-protected) + tests
- [ ] **G — Writes in `useOrgMembers.ts`** (status, roleId, buildingIds, bulk update) + tests
- [ ] **H — Writes in `useOrgStudentPage.ts`** + tests
- [ ] **I — Writes in `useOrganizations.ts`** (create org, archive) + tests — super-admin only

**Parallelizable — batch 2 (each view swaps its no-op handlers for real writes):**

- [ ] **J — AllOrganizationsView** mutations live
- [ ] **K — OverviewView** mutations live
- [ ] **L — BuildingsView** mutations live
- [ ] **M — DomainsView** mutations live
- [ ] **N — RolesView** mutations live
- [ ] **O — UsersView** mutations live (bulk + inline)
- [ ] **P — StudentPageView** mutations live

**Serial:**

- [ ] **Q — Add `useFeaturePermissions` gate** in `OrganizationPanel.tsx`. When flag is off, views remain read-only and "Coming soon" toasts persist.
- [ ] **R — Paul manual QA in preview.** Walk every mutation path; confirm rules fail out-of-scope writes.
- [ ] **S — Update this doc.** Mark Phase 3 complete; set Current State → Phase 4.

### Acceptance checklist

- [ ] `pnpm run validate` passes
- [ ] All rules-unit tests pass
- [ ] With flag off, no writes happen (toasts only)
- [ ] With flag on for paul.ivers, every mutation persists and re-renders via snapshot
- [ ] Cross-org writes are rejected by rules (verified in preview console)

---

## Phase 4 — Invitations, CSV import, write-through

Activates the invitation flow, CSV bulk-import, and the Cloud Function that keeps `/admins/{email}` in sync with membership changes (so `isAdmin()` keeps working for any new domain admins added via the panel).

**Branch:** `claude/org-wiring-p4-invites`
**Depends on:** Phase 3
**Status:** Not started

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
