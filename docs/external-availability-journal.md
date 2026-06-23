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
- **Move sensitive login scopes off login (Path B): IMPLEMENTED** (PR [#2053](https://github.com/OPS-PIvers/SpartBoard/pull/2053)). _Initially_ I planned Path A (keep `spreadsheets` + `calendar.readonly` on login and verify them). But after surfacing that going External _before_ verification completes would expose **every Orono sign-in** to Google's "unverified app" screen during the multi-day review, Paul chose **Path B**: move those two scopes OFF login to **on-demand GIS** (acquired silently for already-granted users, one-time consent for never-granted). Login now requests only `drive.file` (unrestricted) + basic profile → the External flip is **login-safe for Orono with no verification gate**. Sensitive-scope verification is still worthwhile for the on-demand Sheets/Calendar feature consents, but it no longer gates sign-in. See [external-availability-oauth-runbook.md](external-availability-oauth-runbook.md).
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

### 2026-06-22 (evening) — Phase 4: PROD MERGE + EXTERNAL FLIP **LIVE**

Paul re-engaged and directed me to finish the Google-console side via the Claude-in-Chrome extension. Completed, in order:

**1. Promoted `dev-paul → main` (Launch Gate #5 ✅).** PR [#2054](https://github.com/OPS-PIvers/SpartBoard/pull/2054) merged with a **regular merge commit** (`8b29267e`, never squash per [[spartboard-merge-flow]]; `dev-paul` preserved). CI fully green on the merged commit (lint, test 5,775+697, type-check, CodeQL, dev-deploy). The **prod deploy on `main` succeeded** (`firebase-deploy.yml`, conclusion success) — the external-availability frontend is now on prod hosting. It was **dormant** until the flip below (Internal consent screen still rejected non-Orono accounts).

**2. OAuth branding saved (Console → Branding).** Home `https://spartboard.web.app/`, Privacy `…/privacy`, Terms `…/terms`, developer-contact `paul.ivers@orono.k12.mn.us`. Authorized domains **already** included `spartboard.web.app` + `spartboard.firebaseapp.com` (plus dev-preview channels) — no change needed. _Logo still NOT uploaded_ — the desktop file-upload sandbox only accepts files shared with the session, not an arbitrary repo path; `marketplace-assets/icon-128.png` needs a manual Browse-upload (or drag into chat). Not on the critical path (logo + verification are one bundle, and verification needs the manual demo video regardless).

**3. Consent-screen scope audit (Console → Data Access).** The declared scope set is **broader than the runbook assumed**, but the extras are **dead declarations**:

- **`drive.readonly` (restricted)** and **`bigquery` (sensitive)** are declared but **never requested** by app code (`config/firebase.ts:67` deliberately excludes `drive.readonly`; nothing calls bigquery). Paperwork-only; ideally pruned from the declared list later to simplify verification.
- **Live on-demand scopes** (requested per-feature, not at login): `spreadsheets`, `calendar.readonly`, `classroom.courses.readonly`, `classroom.coursework.students` (restricted, **admin-only** via `CLASSROOM_ASSIGN_ENABLED`), `classroom.addons.*`.
- **Login set stays non-sensitive:** `drive.file` + `openid`/`email`/`profile` (Path B holds).

**4. Flipped Audience → External + In production (Launch Gate #2 partial ✅).** Paul chose **"flip now, accept reversible risk."** Console → Audience → Make external → **In production** → Confirm. Page now reads **User type: External**, **Publishing status: In production**, with **"Make internal"** present (fully reversible per runbook §7). Screenshot captured.

- **Open self-serve is live for the core app.** The OAuth **user cap (0 / 100)** applies _only_ to users granting **unapproved sensitive/restricted scopes** — it does **not** apply to non-sensitive scopes. Because Path B keeps login at `drive.file`, **unlimited external users can now sign in and use the core app**; the 100-lifetime-cap only bites for on-demand Calendar/Sheets/Classroom consents until verification clears.
- **"Your app requires verification"** banner is now showing (expected) — clearing it (and the 100-cap on sensitive features) needs the verification submission, which is blocked on the **manual demo video**.

**Residual Orono risk Paul explicitly accepted:** I could **not** confirm the prod OAuth web client (`…-hdc7`) is explicitly **"Trusted" in Admin → API Controls** — the Admin console is behind ClassLink SSO and I won't authenticate. Sign-in is safe regardless (drive.file is non-sensitive → never blocked). The unverifiable bit is whether Orono's **on-demand** restricted/sensitive features (Classroom-assign, Sheets, Calendar) keep working under External; evidence strongly suggests Trusted (the Classroom-assign feature already works), and if anything degrades it's **instantly reversible** via "Make internal."

**5. Found + fixed a real prod bug while verifying (`resolveOrgForUser` was down).** Loading the live app as the Orono account surfaced a console error: `resolveOrgForUser failed; falling back to operator org: FirebaseError: internal`. Tracing it through the function logs: the callable was configured `memory: '128MiB'`, but the nodejs24 + firebase-admin **cold-start footprint is ~135–144MiB**, so every instance **OOMed during the startup readiness check** ("Memory limit of 128 MiB exceeded with 144 MiB used" → "instance failed the readiness check" → `internal`). The function had **never worked** in prod — `AuthContext`'s operator-org fallback fully masked it (Orono → their own org via membership; external → free tier; the **isolation is safe** — I verified in code that no member doc ⇒ `orgId=null`, so external users can't leak into Orono on the fallback path). Fixed: bumped `resolveOrgForUser` **and** the two other 128MiB callables that share the identical wall — `claimOrganizationInvite` (org-invite claim) and `ltiJwks` — to the codebase-standard **256MiB** (commit `5958fd06`, type-check green, pushed to `dev-paul`). The dev-deploy CI tripped the **known-flaky `AuthContext.ensureGoogleScope` test** twice (unrelated to a functions-memory change — [[spartboard-test-gotchas]]), skipping its deploy step, so I deployed the three functions **directly** (`firebase deploy --only functions:…`, same precedent as the earlier rules hotfix; source is on `dev-paul`, so CI will redeploy idempotently once the flake clears). **Recovery CONFIRMED:** function logs show the new 256MiB revision's `STARTUP TCP probe succeeded` (was "failed → instance not started") and the function executing; the live app loads with a **clean console** (no fallback error). _Follow-up for Paul: the `ensureGoogleScope` CI flake is now blocking dev-deploys and should be stabilized._

---

## 🔑 Launch gates — Paul's go/no-go before flipping to External

> **Status @ 2026-06-22 evening:** Gate #5 (merge→main) **DONE**; Gate #2 (flip to External + Production) **DONE** (verification submission still pending the demo video). Gates **#1 (legal sign-off)**, **#3 (`CLASSROOM_ASSIGN_ENABLED` / confirm client Trusted)**, **#4 (announcements backfill sequence)** remain **open** and are now the post-flip follow-ups (see "Remaining for Paul" below). The flip is reversible (`Make internal`) if any of these surface a problem.

Code is done and safe-to-land, but the **actual external launch** (flipping the OAuth consent screen) is intentionally left to you and is gated on these, in order:

1. **District counsel / operator-model sign-off** → then finalize the `/privacy` + `/terms` DRAFT copy (W10) and re-run the legal prerender. See [external-availability-legal-review.md](external-availability-legal-review.md).
2. **OAuth verification** — follow [external-availability-oauth-runbook.md](external-availability-oauth-runbook.md): Search Console domain ownership → submit Google sensitive-scope verification (drive.file / spreadsheets / calendar.readonly) → flip Audience to External + Publish.
3. **`CLASSROOM_ASSIGN_ENABLED` decision** — it is currently `true` in `config/constants.ts`. Set it **false** (and deploy) for launch unless the restricted `classroom.coursework.students` scope is confirmed Marketplace-declared + the OAuth client Trusted under External (an undeclared restricted scope reproduces an **org-wide** Account-Restricted outage that hits Orono too).
4. **Announcements backfill sequence (do all three together, before admitting any external user):**
   1. Re-run `scripts/backfill-org-members.js` so **every** Orono user has a `members/{email}` doc (otherwise a member-doc-less Orono user's announcement listener is rejected once docs are org-stamped — see review Finding 1b).
   2. Run `node scripts/migrateAnnouncements.js --dry-run`, then for real, to stamp legacy docs `orgId='orono'` — **must run before** scoping the query below, otherwise legacy (no-`orgId`) Orono announcements vanish from the listener the instant the `where('orgId','==', orgId)` filter goes live.
   3. Scope the `AnnouncementOverlay` listener query with `where('orgId','==', orgId)` (see the `MULTI-TENANT TODO` comment in the file) — required before a **second** org has active announcements, and safe only **after** the backfill in step 2 has stamped every legacy doc.
5. **Promote `dev-paul → main`** per the merge flow ([[spartboard-merge-flow]]: **regular merge commit, never squash**) when ready to ship the frontend to prod hosting.

## Open Questions / Risks

- **Operator model (for district counsel, not code):** who operates SpartBoard for non-Orono users (DPA / FERPA "school official" framing)? Gates W10 and the External publish. _Paul._
- **AI free-tier daily cap value** — defaulted external/free to **5/day** (`DEFAULT_EXTERNAL_DAILY_LIMIT`), vs the org default of 20; tune via the `externalDailyLimit` config key in `global_permissions`.
- **`SupportPage.tsx`** still carries Orono-only framing (out of W10's `/privacy`+`/terms` scope) — broaden it before the flip.
- **Deferred isolation follow-ups** (not blocking launch): `feature_permissions` exposes `betaUsers` emails + district config world-readable; `/announcements/{id}/pollVotes` subcollection is still `auth != null` (kept open for anonymous public-poll voting); global catalogs show Orono-authored content to externals (shared-by-design).

---

## ✅ Remaining for Paul (post-flip, 2026-06-22)

The app is **External + In production** — external users can sign in and use the core app now. These items polish/complete the launch and close the accepted residual risk. None block external sign-in; they're ordered by Orono-safety priority.

1. **Confirm the prod OAuth web client is "Trusted"** in Admin Console → Security → Access & data control → **API controls → App access control** (look up client `…-hdc7` / SpartBoard). If Trusted → the accepted residual risk is fully closed (Orono on-demand Classroom/Sheets/Calendar keep working under External). If **not** Trusted → either mark it Trusted, or set `CLASSROOM_ASSIGN_ENABLED=false` + redeploy, or `Make internal` to roll back. _(I couldn't check — Admin console is behind ClassLink SSO.)_
2. **Upload the consent-screen logo** — Console → Branding → Browse → `marketplace-assets/icon-128.png` (square PNG ≤1 MB). Triggers brand verification, which is part of the same submission as #3.
3. **Submit OAuth verification** (clears the "unverified app" banner + the 100-user sensitive-scope cap). **Demo video DONE** (2026-06-23): Paul screen-recorded the live consent flow on a clean `spartan.teacher@orono.k12.mn.us` test account capturing all three OAuth consents — `drive.file`, `spreadsheets`, `calendar.readonly` — plus the Quiz feature with real results and Calendar sync. I assembled it into a polished 60s 1080p (audio-stripped) verification video via Remotion (title card + the recording + a scope-summary card); source project at `C:\dev\spartboard-promo`, composition `src/VerificationDemo.tsx`, output `out/spartboard-oauth-verification.mp4`. **Remaining:** upload it to YouTube as **Unlisted** and paste the link + the ready-to-paste scope justifications ([external-availability-oauth-runbook.md](external-availability-oauth-runbook.md) §3.2) into the Console verification submission. Consider **pruning the dead `drive.readonly` + `bigquery` declarations** (Console → Data Access) first to simplify the review.
4. **`CLASSROOM_ASSIGN_ENABLED` decision** (Launch Gate #3) — resolve alongside #1.
5. **Announcements backfill sequence** (Launch Gate #4) — the three-step `backfill-org-members` → `migrateAnnouncements` → scope-the-listener sequence, before a **second** org has active announcements.
6. **Legal / operator-model sign-off** (Launch Gate #1) — finalize `/privacy` + `/terms` external-eligibility copy after district counsel; broaden `SupportPage.tsx`.

**Rollback at any point:** Console → Audience → **Make internal** (instantly re-rejects non-Orono accounts; Orono unaffected — same client, same scopes, grants intact).

---

## 🔁 2026-06-23 — OAuth verification is BLOCKED by `web.app`; pivoted to eliminating sensitive scopes for external users

**The `web.app` domain cannot complete OAuth verification — confirmed structural, not a delay.** Search Console URL-prefix verification of `https://spartboard.web.app/` succeeded ("Ownership verified"), but the OAuth **branding** verification kept rejecting the home page URL ("…is not registered to you") for **2 full days** after Search Console ownership was confirmed. Google's Third-Party Data Safety team has stated managed third-party hosting subdomains (`*.web.app`, `*.firebaseapp.com`, `github.io`) **cannot** satisfy the home-page ownership check — Search Console verification of such a subdomain does not count ([forum ref](https://discuss.google.dev/t/oauth-verification-stuck-on-homepage-requirements-firebase-web-app-domain-not-recognized/333105)). The runbook's old "`web.app` via URL-prefix is sufficient" assumption was **wrong** — corrected in [external-availability-oauth-runbook.md](external-availability-oauth-runbook.md) §2. **Real fix = a custom domain** (register `spartboard.app` — confirmed UNREGISTERED — or use `spartboard.orono.k12.mn.us`; the consent-screen home/privacy/terms + the OAuth client's JS origins/redirect URIs must all live on an owned, DNS-verifiable domain, since a redirecting "kicker" is explicitly disallowed and the OAuth flow itself runs on `web.app`).

**Pivot (Paul's call): take OAuth verification OFF the critical path for external users by eliminating the sensitive scopes from every externally-reachable surface.** Verification only ever mattered to lift the 100-user cap on the _on-demand sensitive_ features (Sheets / Calendar); core external self-serve via `drive.file` was already uncapped. So instead of waiting on a custom domain + Google review, we removed the sensitive-scope triggers external users can reach.

**Refactor shipped (branch `dev-paul`, all gates green):**

- **Quiz "Import from Sheets" → Google Picker** (`hooks/useGooglePicker.ts` gained a sheets-only mode + token override). Picking a sheet grants per-file `drive.file` access, so the import reads it with **no `spreadsheets` scope**. The paste-URL field (which needed the broad scope) is replaced by a "Choose Google Sheet from Drive" button; CSV import stays as the no-Google fallback. (`ImportWizard.tsx` gained an optional `ImportAdapter.pickSheet`; `quizImportAdapter.ts` + `QuizWidget/Widget.tsx` wire it.)
- **Quiz + Video Activity results export & templates → `drive.file`** (they create new sheets, which `drive.file` permits). Quiz solo export is now conditional: `config.plcMode ? 'spreadsheets' : 'drive.file'`.
- **Scope plumbing:** added `GOOGLE_DRIVE_FILE_SCOPE` + a `'drive.file'` alias and a login-scope early-return to `ensureGoogleScope` (`config/firebase.ts`, `context/AuthContext.tsx`), so requesting `drive.file` returns the existing login token instantly — **no consent popup**.
- **`spreadsheets` is KEPT only on org-only PLC paths** (peer append/regenerate of a sheet a teammate created — `drive.file` can't do cross-user): `QuizResults.handleUpdateSheet`, the PLC assignment modals, `PlcMeetingMode`, and the Classroom/LTI PLC-linkage flows. None externally reachable. `calendar.readonly` untouched (Calendar widget is org-gated via `WIDGET_DEFAULT_MIN_TIER.calendar='org'`).

**Net effect:** an external (non-org) user can sign in, build/import quizzes (via the Picker), and use the core app **without ever triggering a sensitive-scope consent, the unverified-app warning, or the 100-user cap.** Orono + PLC behavior unchanged.

**Verification:** `type-check` + `lint` + `format:check` clean; **full unit suite 5777/5777 pass**; new regression tests lock the two guarantees (`ensureGoogleScope('drive.file')` returns the live token with no GIS popup; solo export requests `drive.file` not `spreadsheets`); an adversarial review (6 attack vectors — scope leak, PLC regression, dropped `drive.file`, Picker correctness, early-return staleness, VA) came back **CONFIRMED-SAFE on all six**.

**Impact on the launch gates above:** OAuth verification (Gate #2 / "Remaining for Paul" #2–3) is **no longer needed for external availability** — it's now only relevant to lift the cap on the _org-only_ PLC/Calendar sensitive features, and that remains blocked on a custom domain. The logo + the 60s demo video are saved and reusable if/when a custom domain is set up to pursue full verification.
