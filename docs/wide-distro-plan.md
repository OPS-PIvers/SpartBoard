# Wide Distribution Plan — External Users, Tiering, and the Landing Page

_Last updated: 2026-06-12. Owner: Paul Ivers (spartboard@orono.k12.mn.us)._

Roadmap for opening SpartBoard to users outside `orono.k12.mn.us` while
keeping internal users at full access and keeping Google's OAuth
verification burden at **zero** (no restricted scopes ever on an External
consent screen → no annual CASA assessment).

## Background — facts established 2026-06-12 (verified against live config)

- **The GCP OAuth consent screen is `Internal`.** This — not Firebase — is
  what blocks external sign-ins today (`org_internal` error). Firebase Auth
  itself has no sign-up restrictions and no blocking functions.
- **Login scopes were reduced** (commit `6cf17486`) to `drive.file`,
  `spreadsheets`, `calendar.readonly`. The restricted `drive.readonly` is
  gone (Google Picker grants per-file access under `drive.file` via
  `setAppId` — already wired in `hooks/useGooglePicker.ts`).
  - Scope tiers: `drive.file` = unrestricted (no review even when External);
    `spreadsheets` / `calendar.readonly` / Classroom scopes = "sensitive"
    (one-time free verification); restricted scopes (e.g. `drive.readonly`)
    = annual CASA. **Never re-add a restricted scope.**
- **Legal pages are verification-ready** (commit `3ddd2579`): real contact
  (spartboard@orono.k12.mn.us), Google Limited Use disclosure added, and
  `/privacy` `/terms` `/support` are prerendered to static HTML at build
  time (`scripts/prerender-legal.tsx`) so crawlers/reviewers see content.
- Dashboards/widget state persist in **Firestore**; Drive holds quizzes,
  guided-learning sets, rosters, results Sheets, optional exports.
- Classroom OAuth is already separate from login (on-demand GIS popups in
  `components/classroomAddon/gisOAuth.ts`).
- The `organizations` collection (domains, members, `domain_admin` /
  `building_admin` roles, invites, counters) already models "a district".
  `studentLoginV1` already resolves orgId from email domain.
- The `firestore-send-email` extension is deployed
  (`ext-firestore-send-email-processqueue`).
- Anonymous auth is enabled only for the student PIN flow; Paul plans to
  phase it out, then tighten `request.auth != null` Firestore rules.

## Product decisions (agreed)

- Signed-out visitors get a **public landing page** instead of the login
  screen. After sign-in: `orono.k12.mn.us` → full dashboard (unchanged);
  everyone else → routed by tier.
- External offerings:
  1. **Free tier** — Firestore-backed features only (dashboards, widgets,
     quizzes, timers…). **Excludes all Google-API features** (Drive saving,
     Sheets export, Calendar widget, Classroom) — this is both product
     tiering and what keeps external users on basic scopes.
  2. **Request a pilot** (replaces "full-feature free trial") — a human-
     approved grant of broader access via the org/permissions system. No
     billing machinery, no expiry automation, keeps control while learning
     what externals want.
  3. **Request district rollout** — form → `rollout_requests` Firestore
     collection → email notification → on approval, create an organization
     for their domain.
- "Trial → paid" is deferred: a public school district selling software
  raises procurement/operator-model questions that belong with the
  district's data-privacy officer / counsel (see Open Questions).

## Phases (prioritized)

### Phase 1 — Landing page + auth fork (can build now, behind the Internal wall)

- New public landing route for signed-out visitors at `/` (current behavior:
  login screen). Marketing content: what SpartBoard is, screenshots, CTAs
  "Try it free" and "Bring SpartBoard to your district", links to
  /privacy /terms /support. Reuse the legal-pages prerender pattern so the
  page is crawlable static HTML with the SPA booting on top.
- Internal users see no change after sign-in.
- Keep a direct "Sign in" affordance prominent (teachers bookmark the root).

### Phase 2 — Pilot/rollout request form

- Form (name, role, school/district, domain, size, what they want) writes to
  `rollout_requests` collection; `firestore-send-email` notifies
  spartboard@orono.k12.mn.us. Firestore rules: create-only for signed-in
  users (or public create with abuse guard), read/admin only.
- Admin Settings view to list/triage requests (optional first pass: just
  email).

### Phase 3 — Tier model in the permission system

- One concept: user **tier** = `internal` | `org` | `free`, derived from
  email domain (orono.k12.mn.us → internal), org membership, else free.
- Enforce in `canAccessWidget` / `canAccessFeature` /
  `resolvePermissionAccess` (`context/AuthContext.tsx` ~lines 1973–2059)
  alongside existing accessLevel/beta/building rules. Admin UI
  (feature/global permissions managers) grows a "minimum tier" (or
  "internal domains only") field.
- This **generalizes the planned admin Google-Classroom gate** — a
  `global_permissions/google-classroom` doc restricted to internal domains
  is just one instance of the tier rule. Build once.
- Default for external/free users: all Google-API-backed features denied
  (Drive save/export, Sheets results, Calendar widget, Classroom assign /
  grade push). UI should hide these cleanly, not error.

#### Status — dynamic org resolution (shipped)

The single-org hardcode (`DEFAULT_ORG_ID = 'orono'`) that blocked any
non-Orono org member is **removed**. Every signed-in user's org is now
resolved dynamically from their verified email domain:

- **New callable `resolveOrgForUser`** (`functions/src/resolveOrgForUser.ts`)
  runs the same verified-domain lookup `studentLoginV1` uses
  (`resolveOrgIdForDomain` → collectionGroup on `/organizations/*/domains`,
  `status == 'verified'`) against the caller's OWN token (`hd` claim, then
  email suffix) and returns `{ orgId | null }`. It reads the domain from the
  verified token only — never from `request.data` — so a caller cannot probe
  for an org they don't belong to. No new Firestore collection or rules
  surface was needed: the existing `members/{email}` self-read rule already
  lets a user read their own membership in any org.
- **`AuthContext`** resolves the orgId via that callable (cached per-email in
  `sessionStorage` for positive hits), then subscribes to
  `/organizations/{resolvedOrgId}/members/{email}`. No org for the domain →
  free/no-org tier. Resolver outage → falls back to the operator org
  (`OPERATOR_ORG_ID = 'orono'`) so internal members are never locked out.
- **`InviteAcceptance`** resolves the invitee's org from their domain instead
  of hardcoding it (operator-org fallback on resolver failure).
- **`NewUserSetup`** skips the building step entirely for org-less users
  (buildings are an org concept) instead of forcing them to pick from another
  district's seed list.

Still **operator-scoped by design** (not bugs — left intentionally): the
`/subs` substitute portal + substitute shares (Orono-internal feature, gated
client-side and in `firestore.rules`), and the `internal` tier mapped to
`orono.k12.mn.us` in `utils/userTier.ts` (the operator's own domain; the
TODO to make it admin-configurable still stands). De-hardcoding those is a
separate follow-up.

> **NOTE:** Code is necessary but **not sufficient** to admit external
> sign-ins. The actual gate remains the GCP OAuth consent screen being set
> to **Internal** (see Background). That is Phase 4 below — a Google Console
> action, not code.

### Phase 4 — Flip the consent screen to External (the launch switch)

Prereqs, in order:

1. Decide operator model with district counsel (see Open Questions) and
   rewrite the "District members only" eligibility language in
   /privacy + /terms (deliberately NOT yet rewritten).
2. For sign-in to stay verification-free (Path B): drop `spreadsheets` +
   `calendar.readonly` from login scopes too — move them to on-demand GIS
   token popups (same pattern as Classroom in `gisOAuth.ts`), requested only
   by internal/org users when they first touch those features. Login then
   requests basic scopes only.
   - Alternative (Path A): keep sensitive scopes at login and do the
     one-time free Google verification (logo upload, Search Console domain
     verification, scope justifications, demo video). Paths compose; B can
     ship first, A later without time pressure.
3. Search Console verification: `web.app` is on the Public Suffix List, so
   `spartboard.web.app` can likely be verified via URL-prefix method; a
   custom domain (e.g. spartboard.orono.k12.mn.us) is the cleaner long-term
   answer.
4. Console → Google Auth Platform → Audience: switch User type to External,
   publish to production.
5. Before/alongside: phase out anonymous auth **for the student academic
   flow only** and tighten Firestore rules that assume `request.auth != null`
   implies a real Google account. **Keep anonymous auth enabled** — it is the
   right primitive for public presentations and the no-sign-in join option
   (see "Two-link join model" below). The phase-out is scoped to the rostered
   student path, NOT a global disable of the Anonymous provider.

### Phase 3b — Two-link join model + admin-gated anonymous join

Every assignable / student-facing widget (quiz, video activity, activity
wall, guided learning, NextUp) offers the teacher two ways to share an
activity:

1. **No sign-in (anonymous):** a join-code URL. Participants enter via
   `signInAnonymously` — temporary results, nothing saved to a roster. This
   is what powers public presentations (e.g. the Activity Wall with a room of
   attendees). Stays working regardless of the Phase 4 external flip.
2. **Sign in (rostered):** routes through `spartboard.web.app/student/login`
   (PII-free GIS → custom token). Gives rostered courses and saved/persistent
   student data.

**Admin gate on the anonymous link.** Whether a teacher may offer the
no-sign-in link is an admin-configurable capability, modeled as a
`GlobalFeaturePermission` doc (proposed featureId `anonymous-join`) — the
exact `accessLevel` (`admin` | `beta` | `public`) + `buildings[]` shape the
permission system already supports, consumed via `canAccessFeature` and
edited in `GlobalPermissionsManager`. This composes with the Phase 3 `minTier`
field too. When denied, the teacher's share UI hides the no-sign-in option
and offers only the rostered sign-in link (hide cleanly, no error).

Implementation notes:

- Add `'anonymous-join'` to the `GlobalFeature` union + a `FEATURE_DEFAULTS`
  entry (default-public to preserve today's behavior until an admin restricts
  it), and register it in the Global Permissions manager's feature registry.
- Gate the "no sign-in / anonymous link" affordance in each widget's share
  modal (e.g. `components/widgets/ActivityWall/ShareModal.tsx` and the quiz /
  video-activity share surfaces) behind `canAccessFeature('anonymous-join')`.
- The participant routes themselves stay anonymous and untouched — this gates
  the TEACHER's ability to generate the link, not the participant experience.

#### Status (2026-06-13, commit `885ea0b6`)

- DONE: `anonymous-join` global feature registered (default-public), admin UI
  entry "Anonymous join links (no sign-in)" in `GlobalPermissionsManager` with
  accessLevel + buildings + minTier controls, tests, full suite green.
- DONE: **Activity Wall** anonymous join affordances gated
  (`components/widgets/ActivityWall/Widget.tsx` — the "Copy link" + "Pop-out
  QR" buttons exposing the participant `/activity-wall/{id}?data=...` URL). The
  view-only "Share gallery" button stays. Participant route untouched.
- KEY FINDING: the two-link model only cleanly exists in Activity Wall today.
  In **Quiz**, **Video Activity**, **Guided Learning**, and **NextUp**, the
  "anonymous join URL" _is_ the normal in-class PIN-join lobby (the live-
  session join-code bar, archive "copy student link", PLC/peer share), not a
  separate wide-distribution link. Gating those as-is would break ordinary
  in-class teaching the moment an admin restricted the feature. They were
  deliberately left UNGATED and flagged. NextUp has no share/join affordance
  at all.

#### Phase 3b follow-up — build the rostered-join path (NOT yet done)

Offering a genuine "no sign-in vs. rostered sign-in" CHOICE on quiz / video-
activity / guided-learning (and a share affordance for NextUp if wanted)
requires first building the **rostered-join link** alongside the existing
anonymous one — routing participants through `spartboard.web.app/student/login`
(PII-free GIS → custom token, like the existing student academic flow) so they
land in the activity as a rostered student with saved data. Only once both
links exist per widget can the anonymous side be gated behind
`canAccessFeature('anonymous-join')` without removing the teacher's only way to
start an in-class activity.

Per widget this means: a share surface that presents both links; the rostered
URL carrying enough context to resolve the student into the right
session/roster after `/student/login`; and then ANDing the anonymous affordance
with the `anonymous-join` gate. Treat each widget as its own slice (Quiz is the
natural first). This is the real remaining build; the gate is already in place
waiting for it.

### Phase 5 (deferred) — Formal trials / licensing

Only after the operator-model decision and real external demand. Needs an
entitlement model (grant timestamps, expiry, downgrade behavior for content
built with features a user loses).

## Open questions (for the district, not code)

- **Operator model:** who operates SpartBoard for non-Orono users? Each
  consuming district will want its own DPA; FERPA "school official" framing
  works district-by-district. Counsel + data-privacy officer must sign off
  before externals are admitted.
- Custom domain vs. spartboard.web.app for verification/branding.
- Whether "pilot" grants ever expire automatically (Phase 5) or stay
  manually managed.

## Rollout watch-items from the scope change (already shipped)

- All teachers re-consent on next sign-in (`prompt: 'consent'`) and see the
  shorter permission list.
- Drive files picked under the old `drive.readonly` grant may need
  re-picking where a widget re-reads them by stored ID (most flows copy at
  pick time).
