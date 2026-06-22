# External Availability — Work Journal

**Goal:** Make the SpartBoard Firebase web app fully available to **open self-serve external (non-org) users**, behind appropriate gates, with **zero change for existing Orono org users**.

**Started:** 2026-06-22 (overnight autonomous run)
**Owner:** Paul Ivers · **Driver:** Claude Code (orchestrating via Workflow + subagents)
**Branch:** `dev-paul`

> This journal is updated as each phase/task completes so you can check in on progress. Newest status at the top of each section.

---

## Locked Decisions (approved by Paul, 2026-06-22)

| #   | Decision                            | Choice                                                                                                                                                                           |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Access scope** for external users | Full teacher app, **org-only surfaces gated** (admin, buildings, PLC, announcements, ClassLink, building-scoped permissions hidden)                                              |
| 2   | **Entry model**                     | **Open self-serve** — any Google account whose domain isn't mapped to an org auto-gets the external (no-org) experience                                                          |
| 3   | **AI features** (Gemini)            | **Enabled but per-user rate-limited** (extend `ai_usage` tracking)                                                                                                               |
| 4   | **OAuth / Google**                  | Move consent screen to **External/Production + prep Google verification** for sensitive scopes (Drive, Calendar, Sheets); gate sensitive-scope features gracefully if unverified |

**Hard constraint:** existing Orono org users must notice **zero** difference.

---

## Plan of Record (phases)

0. **Audit** _(in progress)_ — read-only fan-out across 8 dimensions → consolidated blockers + work items + roadmap.
1. **Plan** — turn the audit into an ordered, dependency-aware implementation plan (waves).
2. **Implement** — code + Firestore rules changes per work item, isolated so org behavior is untouched.
3. **Verify** — type-check, lint, format, unit tests, rules tests, build; adversarial review for regressions & data leaks.
4. **OAuth/GCP** — configure consent screen → External, prep verification submission, document anything requiring Google's review.
5. **Sign-off** — final journal summary + remaining-work / handoff for anything blocked on Google review.

---

## Status Log

### 2026-06-22 — Phase 0: Audit kicked off

- Confirmed the four locked decisions above with Paul.
- Launched read-only audit workflow (`external-availability-audit`): 8 parallel dimensions —
  auth/sign-in gating · GCP/OAuth config · Firestore rules · org/building coupling · existing external-user work · AI quota · student/anon routes · data isolation — feeding a synthesis pass.
- Journal created. Next update will land the consolidated audit findings + the concrete work-item roadmap.

---

### 2026-06-22 — Phase 0: Audit COMPLETE

Ran an 8-dimension read-only audit (auth/sign-in · GCP/OAuth · Firestore rules · org/building coupling · existing work · AI quota · student routes · data isolation) + synthesis.

**Headline finding — this is NOT greenfield.** A coherent "wide-distribution" effort already shipped to `main` across 5 phases (plan of record: [docs/wide-distro-plan.md](wide-distro-plan.md)):

- Public `LandingPage` + pilot/rollout-request form (`/request` → `rollout_requests` + email).
- **Dynamic org resolution** — `resolveOrgForUser` callable maps a verified email domain → org; a non-Orono domain cleanly resolves to `orgId=null` / **free tier** with no crash/spinner/loop. Org-less `NewUserSetup` already skips the building step.
- **Three-tier model** `internal | org | free` (`utils/userTier.ts`) with `meetsMinTier` ANDed into `canAccessWidget` / `canAccessFeature`, plus admin `MinTier` UI. **Sign-in is already open in code** (no `hd` gate, no blocking function).
- Firestore rules already isolate the multi-tenant data layer (org/members/buildings/PLC/invitations/rosters are owner- or member-scoped; a no-org outsider is denied every org read).

**So the remaining work is targeted gating + isolation + the launch switch — not architecture.**

#### Blockers found

1. **(CRITICAL, non-code) OAuth consent screen is `Internal`** — prod project `spartboard` (759666600376) sits directly under the `orono.k12.mn.us` Workspace org, so Google rejects every external account (`org_internal`) _before app code runs_. The launch switch is a Cloud Console flip to **External/Production**. Flipping changes nothing for Orono accounts/scopes/client.
2. **(CRITICAL, code) `/announcements` is a global cross-org collection** — no `orgId` field, auth-only read, overlay mounts for every teacher. An external user would stream (and broadcast announcements would _render_) all of Orono's announcements. The one true data leak.
3. **(HIGH, code) Org-only surfaces not hidden for free tier** — Sidebar renders My Building(s), My Classes (+ClassLink import), My PLCs unconditionally; `useAdminBuildings` leaks the **hardcoded Orono building seed list** (real school names) to no-org users; orgless PLC creation is possible; Google-API features aren't denied by default (tier model is plumbing, no default policy).
4. **(HIGH, code) AI rate-limit is flat per-user (20/day), not tier-aware** — no separate external cap (Decision 3).

#### Decisions I made reconciling the audit against the locked decisions + plan-of-record

- **Deny Google-API features for free tier (W5): IN SCOPE.** Confirmed as an _agreed product decision_ in wide-distro-plan.md (free tier "excludes all Google-API features… hide cleanly, not error"). Implement via `minTier` defaults on the Google-API features/widgets (Drive/Sheets/Calendar/Classroom) — uses the existing `meetsMinTier` gate, no-op for org/internal users. (NOT over-gating; personal vs org distinction is moot — it's the established tiering.)
- **Do NOT move sensitive login scopes off login (audit's W8): DROPPED.** Paul chose "Go External + **prep verification**" over "minimize scopes," and keeping login scopes as-is fully protects Orono's Sheets/Calendar (zero-change). → I prep the Google sensitive-scope **verification** package instead. (Path A, which Paul selected.)
- **Announcements (W6): no risky overnight prod migration.** Stamp `orgId` on new announcements at write time; gate the overlay listener so no-org users never subscribe (closes the practical leak immediately); tighten the rule tolerant of legacy docs; ship a `migrateAnnouncements` backfill script to be **run by Paul** (or together) before the prod launch — not executed unattended tonight.
- **AI cap (W7):** additive lower external/free daily cap (new config key), keyed on no-org callers; org users keep the existing limit untouched.
- **Launch boundary:** I will land + validate all code on `feat/external-availability-rollout` → squash into `dev-paul` (preview deploy; all changes are no-ops for Orono). I will **not** merge to `main` (prod) or flip the consent screen overnight — the flip is coupled to the legal/operator-model sign-off (needs district counsel) and is the single most outward-facing action. Everything is teed up + documented for Paul's morning go/no-go.

#### Work items (this push)

| ID  | Item                                                                                                                         | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| W1  | `isExternalUser`/`hasOrg` from AuthContext + hide org-only Sidebar surfaces (Buildings, Classes/ClassLink, PLCs, What's New) | ✅     |
| W2  | Block orgless PLC creation for free tier (`usePlcs.createPlc` guard + entry hide)                                            | ✅     |
| W3  | Stop the Orono building seed-list leak (`useAdminBuildings` returns `[]` when `orgId===null`)                                | ✅     |
| W4  | Hide ClassLink import for no-org users (`useClassLinkEnabled`)                                                               | ✅     |
| W5  | Default-deny Google-API features for free tier via `minTier` defaults + clean affordance hiding                              | ✅     |
| W6  | `/announcements` org-isolation (write-stamp + listener gate + rule + backfill script)                                        | ✅     |
| W7  | Additive external/free-tier AI daily cap (functions)                                                                         | ✅     |
| W9  | No-org persona Firestore-rules test suite                                                                                    | ✅     |
| W10 | Draft `/privacy` + `/terms` external-eligibility copy (flagged for counsel — not finalized)                                  | ✅     |
| —   | OAuth verification prep package + Console runbook (no flip)                                                                  | ✅     |

**Deferred / documented (not blocking external launch):** `feature_permissions` exposes `betaUsers` emails + district config world-readable (pre-existing; careful data-model fix later); global catalogs (routines/templates/backgrounds) show Orono-authored content to externals (shared-by-design); student SSO stays org-gated by the _student's_ domain (intended); keep `CLASSROOM_ASSIGN_ENABLED` **off** until the restricted Classroom scope is Marketplace-declared (an undeclared restricted scope would reproduce an org-wide outage hitting Orono too); single shared prod project = no staging buffer for the flip.

---

### 2026-06-22 — Phases 1–3 COMPLETE (code done, validated, landed on `dev-paul`)

All ten work items implemented on `feat/external-availability-rollout` via parallel subagents (each self-reviewed), then a full validation pass + two adversarial reviews.

**Validation — all green (local):**

- `type-check:all` ✅ · `lint` (--max-warnings 0) ✅ · `format:check` ✅
- `test:all` ✅ — **root 5,747 tests / 518 files + functions 693 tests / 37 files** pass
- `build` (vite prod + SSR legal prerender) ✅
- `test:rules` — _not runnable locally_ (no emulator, [[spartboard-test-gotchas]]); the new no-org persona suite (W9) is statically validated and will run in CI/emulator.

**Adversarial review outcome:** `zeroChangeViolations: []`, `leakStillOpen: false`. Two substantive issues were caught and FIXED before landing:

1. **W7 was unimplemented** (the AI-cap agent died on an API overload) — `externalDailyLimit` was dead config. Now fully wired in `functions/src/aiGeneration.ts` at all three Gemini entry points (lookup hoisted outside the txn, bounded LRU cache, **fail-safe toward the org path**, admins exempt) + 22 new functions tests.
2. **`isExternalUser` zero-change risk** — it keyed on `orgId` alone, so a not-yet-backfilled Orono teacher with no `members/{email}` doc (orgId null, but tier `internal` from domain) would have been misclassified external and lost their org surfaces. **Fixed:** the predicate now also requires `userTier === 'free'` (Orono always derives `internal` from its domain regardless of member-doc state), with a dedicated regression test.

**Why landing on `dev-paul` is safe for Orono now:** every gate keys on `isExternalUser`/`userTier`/`orgId` (all of which resolve non-external for Orono) and treats the loading window as not-external; the `firestore.rules` change is **dormant** (no prod announcement has an `orgId` yet → all stay legacy-readable, identical to today); the W7 functions change is fail-safe toward the org path; and external users **cannot sign in at all** until the consent screen flips. The dev-deploy CI deploys `functions`+`firestore`+`storage` to the prod project (routine for `dev-*` branches) + a 30-day preview hosting channel.

---

## 🔑 Launch gates — Paul's go/no-go before flipping to External

Code is done and safe-to-land, but the **actual external launch** (flipping the OAuth consent screen) is intentionally left to you and is gated on these, in order:

1. **District counsel / operator-model sign-off** → then finalize the `/privacy` + `/terms` DRAFT copy (W10) and re-run the legal prerender. See [external-availability-legal-review.md](external-availability-legal-review.md).
2. **OAuth verification** — follow [external-availability-oauth-runbook.md](external-availability-oauth-runbook.md): Search Console domain ownership → submit Google sensitive-scope verification (drive.file / spreadsheets / calendar.readonly) → flip Audience to External + Publish.
3. **`CLASSROOM_ASSIGN_ENABLED` decision** — it is currently `true` in `config/constants.ts`. Set it **false** (and deploy) for launch unless the restricted `classroom.coursework.students` scope is confirmed Marketplace-declared + the OAuth client Trusted under External (an undeclared restricted scope reproduces an **org-wide** Account-Restricted outage that hits Orono too).
4. **Announcements backfill sequence (do all three together, before admitting any external user):**
   1. Re-run `scripts/backfill-org-members.js` so **every** Orono user has a `members/{email}` doc (otherwise a member-doc-less Orono user's announcement listener is rejected once docs are org-stamped — see review Finding 1b).
   2. Scope the `AnnouncementOverlay` listener query with `where('orgId','==', orgId)` (see the `MULTI-TENANT TODO` comment in the file) — required before a **second** org has active announcements, and a prerequisite for the backfill.
   3. Run `node scripts/migrateAnnouncements.js --dry-run`, then for real, to stamp legacy docs `orgId='orono'`.
5. **Promote `dev-paul → main`** per the merge flow ([[spartboard-merge-flow]]: **regular merge commit, never squash**) when ready to ship the frontend to prod hosting.

## Open Questions / Risks

- **Operator model (for district counsel, not code):** who operates SpartBoard for non-Orono users (DPA / FERPA "school official" framing)? Gates W10 and the External publish. _Paul._
- **AI free-tier daily cap value** — defaulted external/free to **5/day** (`DEFAULT_EXTERNAL_DAILY_LIMIT`), vs the org default of 20; tune via the `externalDailyLimit` config key in `global_permissions`.
- **`SupportPage.tsx`** still carries Orono-only framing (out of W10's `/privacy`+`/terms` scope) — broaden it before the flip.
- **Deferred isolation follow-ups** (not blocking launch): `feature_permissions` exposes `betaUsers` emails + district config world-readable; `/announcements/{id}/pollVotes` subcollection is still `auth != null` (kept open for anonymous public-poll voting); global catalogs show Orono-authored content to externals (shared-by-design).
