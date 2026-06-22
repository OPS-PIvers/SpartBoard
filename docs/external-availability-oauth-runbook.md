# External Availability — Google OAuth "External" Launch Runbook

**Audience:** Paul Ivers (operator + Workspace admin for `orono.k12.mn.us`).
**Status:** Documentation only. **Nothing in this file has been executed.** No
GCP/Firebase config was changed, no `gcloud`/`firebase` mutating command was
run, and the consent screen was **not** flipped. This is the ordered,
copy-pasteable plan for you to run by hand when you give the go.

**Chosen path:** **Path B — sensitive scopes moved OFF login to on-demand.**

> **Update (supersedes the original Path A framing in this file).** After this
> runbook was first drafted, the plan changed (see the journal): to keep Orono
> sign-in completely clean during Google's review, `spreadsheets` +
> `calendar.readonly` were moved OFF the login request and are now acquired
> **on-demand via GIS** only when a teacher uses Sheets/Calendar (shipped in PR
> [#2053](https://github.com/OPS-PIvers/SpartBoard/pull/2053)). **Login now
> requests only `drive.file` (unrestricted) + basic profile**, which needs no
> verification and shows no unverified-app warning.
>
> What this changes for this runbook:
>
> - Flipping the consent screen to **External** no longer gates Orono sign-in on
>   any sensitive-scope verification — **login is clean immediately**.
> - Sensitive-scope verification (`spreadsheets`, `calendar.readonly`) is still
>   worth completing so external users get an unflagged consent when they first
>   use Sheets/Calendar, but it is **decoupled from sign-in** and only affects
>   those on-demand feature consents.
> - The branding / Search Console / Make-External / verification steps below all
>   still apply; the scope-justification section now covers the on-demand scopes.

**Why this exists:** The prod project `spartboard` (project number
**759666600376**) sits directly under the `orono.k12.mn.us` Workspace
organization, and its OAuth consent screen is currently **Internal**. That is
the single switch that rejects every non-Orono Google account today
(`org_internal` / `Error 403: org_internal`) _before any app code runs_. All
the code-side gating (tier model, org isolation, free-tier feature hiding) is
already shipped and is a no-op for Orono users — see
[external-availability-journal.md](external-availability-journal.md) and
[wide-distro-plan.md](wide-distro-plan.md) Phase 4. This runbook covers only
the Google Console side.

---

## 0. The hard constraint (read first)

**Existing Orono org / internal users must notice ZERO change.** Everything in
this runbook is engineered so that flipping the audience to External:

- does **not** change Orono accounts' sign-in, scopes, granted permissions,
  the OAuth client ID, or any token they already hold;
- does **not** re-prompt Orono users beyond the normal `prompt: 'consent'`
  re-consent they already get;
- only changes whether **non-Orono** accounts are _admitted at all_.

Internal users authenticate against the same client and the same scope list
(`config/firebase.ts` → `GOOGLE_OAUTH_SCOPES`). Switching the audience to
External widens _who may consent_; it does not alter _what Orono consents to_.

### Facts this runbook is built on (verified against the repo, 2026-06-22)

- **Prod project:** `spartboard`, number **759666600376**, parent = Workspace
  org `orono.k12.mn.us` (org id **63276922281**, customer `C027lkte3`). Internal
  is only selectable because the project is org-owned; External is therefore a
  reversible toggle on the same project.
- **Login scopes** (`config/firebase.ts`, `GOOGLE_OAUTH_SCOPES`):
  | Scope | Tier | Verification impact when External |
  |---|---|---|
  | `https://www.googleapis.com/auth/drive.file` | **unrestricted** | none — no review even when External |
  | `https://www.googleapis.com/auth/spreadsheets` | **sensitive** | one-time free verification |
  | `https://www.googleapis.com/auth/calendar.readonly` | **sensitive** | one-time free verification |
  Plus the standard `openid` / `userinfo.email` / `userinfo.profile`, which are
  not sensitive.
- **Restricted Classroom scope is separate from login.** The restricted
  `classroom.coursework.students` scope lives only in
  `components/classroomAddon/gisOAuth.ts` (on-demand GIS popups), never in the
  login flow. See §6 for the critical caveat — its in-app gate
  (`CLASSROOM_ASSIGN_ENABLED`) is currently `true` in the tree, which is a
  decision point you must resolve before flipping External.
- **Single shared prod project — no staging buffer.** There is no separate
  staging GCP project for the consent screen; the flip happens on the live
  project Orono uses every day. Flip in a low-traffic window.
- **UI-only steps below cannot be scripted.** `iap.googleapis.com` and
  `apikeys.googleapis.com` are disabled on this project, so the Cloud Console
  UI is the only way to read/change the audience and publishing status — do not
  expect a `gcloud` equivalent for the audience flip.
- **Legal pages are live and prerendered:** `/privacy`, `/terms`, `/support`
  (`components/legal/*`, prerendered via `scripts/prerender-legal.tsx`). Contact
  on all of them: `spartboard@orono.k12.mn.us`. The Limited Use disclosure is
  already in `components/legal/PrivacyPolicyPage.tsx`.

---

## 1. Read current Audience / User type + Publishing status (no changes)

Goal: confirm where you're starting from before touching anything.

1. Open the Cloud Console for the prod project:
   `https://console.cloud.google.com/auth/overview?project=spartboard`
   (If the project picker shows a different project, switch to **spartboard**
   / number **759666600376**.)
2. In the left nav under **Google Auth Platform**, open **Audience**
   (`https://console.cloud.google.com/auth/audience?project=spartboard`).
3. Read and record (screenshot for the journal):
   - **User type** — expect **Internal** today.
   - **Publishing status** — for an Internal app this is effectively "In
     production" with no user cap and no verification concept (Internal apps
     are exempt). After the flip to External it becomes meaningful (see §5).
4. Open **Branding** / **Overview**
   (`https://console.cloud.google.com/auth/branding?project=spartboard`) and
   record: **App name**, **User support email**, **App logo** (present or not),
   **Authorized domains**, **Developer contact email**.
5. Open **Data Access** (the scopes page,
   `https://console.cloud.google.com/auth/scopes?project=spartboard`) and
   record the currently declared scopes. Confirm the three login scopes above
   are present and that **no restricted scope is on the _login_ set**
   (`classroom.coursework.*` should appear only via the Classroom add-on /
   Marketplace declaration, not the login consent set — see §6).

> These are read-only steps. The `iap.googleapis.com` / `apikeys.googleapis.com`
> APIs are disabled, so there is no API read for the audience setting — the
> Console pages above are the source of truth.

---

## 2. Search Console domain ownership (verification prerequisite)

Google's sensitive-scope verification requires every **authorized domain** on
the consent screen to be a verified property you own, in the **same Google
account** doing the verification submission (`spartboard@orono.k12.mn.us` or
`paul.ivers@orono.k12.mn.us` — use whichever account will own the OAuth
verification; keep it consistent throughout).

1. Go to Google Search Console: `https://search.google.com/search-console`.
2. Add a **URL-prefix** property (not Domain property) for:
   `https://spartboard.web.app/`
   - **Why URL-prefix, not Domain:** `web.app` is on the **Public Suffix List**,
     so `spartboard.web.app` behaves as a registrable domain you control at the
     prefix level, but you do **not** control DNS for the parent `web.app` zone.
     The **Domain** property method requires a DNS TXT record on the registrable
     domain, which you cannot add for `web.app`. The **URL-prefix** method
     verifies the single origin via an HTML file or `<meta>` tag you can serve
     from the app — that's the supported route for `*.web.app`.
3. Choose the **HTML file** or **HTML tag** verification method. For a Firebase
   Hosting site, the HTML-file method is simplest:
   - Download the `googleXXXXXXXXXXXX.html` token file Search Console gives you.
   - Place it in the Firebase Hosting public root so it serves at
     `https://spartboard.web.app/googleXXXXXXXXXXXX.html` (200, raw file). Then
     a normal `firebase deploy --only hosting` from `main`. **This is the one
     deploy this runbook may require; it changes only a static token file and
     is safe for Orono.** Confirm the file returns 200 in a browser before
     clicking Verify.
   - Click **Verify** in Search Console.
4. Record the verified property. The same verified account must be used in §3.

> Long-term cleaner answer (optional, not required for launch): verify a custom
> domain such as `spartboard.orono.k12.mn.us` (a real Domain property with DNS
> TXT you control) and use it as the authorized domain. Out of scope for this
> launch; `spartboard.web.app` via URL-prefix is sufficient.

---

## 3. Sensitive-scope verification submission checklist

This is the one-time, **free** Google review for the two sensitive login
scopes. (`drive.file` is unrestricted and needs no justification, but list it
so the reviewer sees the complete picture.) Prepare everything below _before_
submitting so the review isn't bounced for missing assets.

### 3.1 Branding / consent-screen assets (Console → Branding)

- [ ] **App name:** `SpartBoard` (matches `config/constants.ts` `APP_NAME`).
- [ ] **App logo:** upload the SpartBoard logo (square PNG, ≤ 1 MB, no rounded
      corners added by you — Google crops). A logo upload **triggers
      brand-verification** and is required for External anyway.
- [ ] **User support email:** `spartboard@orono.k12.mn.us`.
- [ ] **Developer contact email:** `spartboard@orono.k12.mn.us`.
- [ ] **Application home page:** `https://spartboard.web.app/`.
- [ ] **Privacy policy URL:** `https://spartboard.web.app/privacy`.
- [ ] **Terms of service URL:** `https://spartboard.web.app/terms`.
- [ ] **Authorized domains:** `web.app` (the registrable authorized domain that
      covers `spartboard.web.app`; this is the domain that must match the §2
      Search Console verification ownership).

### 3.2 Scope-by-scope justification (ready-to-paste)

Paste each justification into the matching scope's "How will the scopes be
used?" box. Each ties to a specific in-app feature with a real code path.

**`https://www.googleapis.com/auth/drive.file` — UNRESTRICTED (no review, listed for completeness)**

> SpartBoard saves and opens teacher-created classroom content (quizzes,
> guided-learning sets, rosters, and exported results spreadsheets) in the
> teacher's own Google Drive. We use `drive.file`, which grants access only to
> files the user explicitly creates or opens through the Google Picker — never
> broad Drive access. Per-file access is wired through the Google Picker
> (`PickerBuilder.setAppId`) in `hooks/useGooglePicker.ts`, and file
> create/read happens in `utils/quizDriveService.ts`. No other Drive files are
> accessed.

**`https://www.googleapis.com/auth/spreadsheets` — SENSITIVE (verification required)**

> SpartBoard writes student quiz and activity results into a Google Sheet in
> the teacher's own Drive so teachers can review and grade work in a familiar
> spreadsheet, and exports PLC meeting notes to Sheets. The Sheets API is used
> only to create and update these teacher-owned result/export spreadsheets that
> the teacher initiates from within SpartBoard (see `utils/quizDriveService.ts`
> and `utils/plcMeetingExport.ts`). We do not read or modify any other
> spreadsheets in the user's Drive.

**`https://www.googleapis.com/auth/calendar.readonly` — SENSITIVE (verification required)**

> SpartBoard's optional Calendar widget displays the teacher's upcoming Google
> Calendar events on their classroom dashboard so they can see their schedule
> at a glance during a lesson. Access is read-only and used solely to list and
> display the signed-in teacher's own events (`utils/googleCalendarService.ts`).
> We never create, modify, or delete calendar data, and we do not access other
> users' calendars.

### 3.3 Demo video (script / storyboard)

Google requires an unlisted YouTube video, recorded against the **production**
OAuth client, that (a) shows the OAuth consent screen with the exact scopes,
and (b) demonstrates each sensitive scope's feature end to end. Keep it 1–3
minutes. Storyboard:

1. **Title card / URL (5s):** Show the browser address bar at
   `https://spartboard.web.app` so the reviewer sees the production origin and
   the verified app name.
2. **Sign-in + consent (15s):** Click Sign in with Google. **Pause on the
   consent screen** long enough to read it; the screen must clearly list
   `spreadsheets` and `calendar.readonly` (and `drive.file`). This frame is the
   single most-checked part of the review — the on-screen scopes must match the
   submitted scopes exactly.
3. **`drive.file` (15s):** Create or open a quiz that saves to Drive; show the
   Google Picker opening and a file being created/picked. Narrate: "Files are
   created in the teacher's own Drive via the Picker — per-file access only."
4. **`spreadsheets` (20s):** Run/finish a short activity, then export results
   to Google Sheets; show the result Sheet opening in the teacher's Drive.
   Narrate: "Results are written to a teacher-owned Sheet."
5. **`calendar.readonly` (20s):** Add the Calendar widget to the dashboard; show
   it listing the teacher's own upcoming events. Narrate: "Read-only display of
   the signed-in teacher's calendar."
6. **Close (5s):** Return to the dashboard; optionally show the Privacy Policy
   link in the footer (`/privacy`) to reinforce the Limited Use disclosure.

Record signed in as a normal teacher account (not an admin) so the flow matches
what an external user sees. Upload to YouTube as **Unlisted** and paste the link
into the submission.

### 3.4 Limited Use disclosure

- [ ] Confirm the live Privacy Policy contains the **Google API Services User
      Data Policy / Limited Use** language. It already does — see
      `components/legal/PrivacyPolicyPage.tsx` (the paragraph that links to the
      "Google API Services User Data Policy … including the Limited Use
      requirements"). Provide the reviewer the direct link:
      `https://spartboard.web.app/privacy`.
- [ ] Make sure the policy text is reachable as crawlable HTML (it is —
      prerendered by `scripts/prerender-legal.tsx`), so Google's reviewer (and
      crawler) sees the disclosure without booting the SPA.

> **Submission note:** Submitting for verification is **not** the same as
> publishing to Production, and it does not by itself change Orono's sign-in.
> You can prepare and even submit the verification while the app is still
> Internal _only if_ the audience is External (Internal apps have no
> verification flow). In practice the order is: switch to External + Testing
> (or directly Production) → submit verification → operate under the
> unverified-app behavior in §5 until Google approves.

---

## 4. The flip: Audience → External → Publish to Production

**Do this in a low-traffic window** (evening / weekend — no live classes), and
have §7 rollback ready.

1. Console → **Google Auth Platform → Audience**
   (`https://console.cloud.google.com/auth/audience?project=spartboard`).
2. Change **User type** from **Internal** to **External**.
3. Set publishing status to **Publish to Production** (vs. leaving it in
   **Testing**). See §5 for what each state means for the unverified period.
4. Confirm the scope list is unchanged (the three login scopes + the standard
   OpenID scopes) — the flip must not add scopes.

### What the flip DOES change

- Non-Orono Google accounts can now reach the consent screen and sign in
  (today they're rejected with `org_internal`). The app's already-shipped tier
  logic then routes them to the free/no-org experience.

### What the flip does NOT change (Orono guarantee)

- The OAuth **client ID** is identical — Orono users' existing grants and
  tokens keep working; no forced re-auth beyond the normal `prompt: 'consent'`.
- The **scope list** is identical — Orono consents to exactly what it does now.
- Orono's data isolation is unchanged — org/building/PLC/announcement
  collections remain owner/member-scoped (handled in code + `firestore.rules`).
- **Nothing about the Classroom add-on flow** changes from the audience flip
  itself — but see §6, which is a _separate_ gate you must verify first.

---

## 5. Unverified-app behavior until Google approves

Between publishing to Production and Google's sensitive-scope approval, the app
is an **unverified External app**. Plan for both user-facing effects:

- **Unverified-app interstitial.** New external users hitting the sensitive
  scopes see Google's "Google hasn't verified this app" warning. They can still
  proceed via **Advanced → Go to SpartBoard (unsafe)**, but it is alarming for
  non-technical teachers. This warning disappears once verification is approved.
  - **Orono users are unaffected:** their accounts already granted these scopes
    under the Internal screen, so they do not see the interstitial.
- **100-user cap (Testing mode only).** If you leave the app in **Testing**
  rather than Production, only listed **test users** (max 100) may sign in, and
  refresh tokens expire in 7 days. **For an actual external launch, publish to
  Production**, which removes the 100-user cap; the unverified _interstitial_
  remains until approval, but there is no hard user cap in Production.
  - Decision: if you want a small, controlled external pilot first, keep it in
    **Testing** and add the pilot teachers as test users (≤100). For open
    self-serve launch, go to **Production** and accept the interstitial until
    verification lands.

---

## 6. DO-NOT list (each item maps to a real outage/leak risk)

- **NEVER add a restricted scope to the _login_ consent set.** The login scopes
  stay exactly `drive.file` + `spreadsheets` + `calendar.readonly`
  (+ OpenID). Adding a restricted scope (e.g. `drive.readonly`, or a Classroom
  restricted scope) to login triggers an annual CASA security assessment and,
  if undeclared, reproduces the org-wide "Account Restricted" sign-in outage —
  which would hit **Orono**, not just externals.

- **Classroom restricted scope — verify the gate before flipping External.**
  ⚠️ The in-app gate `CLASSROOM_ASSIGN_ENABLED` in `config/constants.ts` is
  currently **`true`** in the working tree (enabled 2026-06-05 when the
  restricted `classroom.coursework.students` scope was declared on the Workspace
  Marketplace listing **under the Internal consent screen**), with
  `CLASSROOM_ASSIGN_ADMIN_ONLY = true` limiting it to admins. The original plan
  assumed this flag ships **off**. Before flipping the audience to External you
  must consciously resolve this, because the restricted Classroom scope is
  requested (on-demand, incremental consent) by
  `requestClassroomAssignToken` / `requestClassroomFinalGradeToken`
  (`components/classroomAddon/gisOAuth.ts`):
  - **The safe default for the External flip is to set
    `CLASSROOM_ASSIGN_ENABLED = false`** (and ship/deploy that) until you have
    re-confirmed that the restricted scope is still declared on the Marketplace
    listing **and** that the OAuth client is still **Trusted** in Admin → API
    Controls _after_ the audience changes to External. An undeclared or
    untrusted restricted scope under External is exactly the org-wide outage
    that hits Orono.
  - Do **not** leave the restricted Classroom assign path reachable by external
    users at all: it is an Orono-internal, Marketplace-declared,
    admin-installed flow. Even with the flag on for Orono admins, external/free
    users must never reach it (it is also tier/org-gated in code, but the
    belt-and-suspenders answer for launch is the flag off).
  - **Bottom line for this runbook's scope:** treat "keep the restricted
    Classroom assign flow OFF for the External launch" as a hard requirement.
    The cleanest way is `CLASSROOM_ASSIGN_ENABLED = false`. If you decide to
    keep it on for Orono admins, you own re-verifying the Marketplace
    declaration + Trusted client status under External _before_ the flip.

- **Single shared prod project = no staging buffer.** There is no separate
  staging GCP project for the consent screen. The flip is on the live project
  Orono uses daily. **Flip only in a low-traffic window**, with §7 rollback at
  hand, and watch sign-ins immediately after.

- **Do not change App Visibility on the Marketplace SDK.** It is set to
  **Private** and is **irreversible** to Public without a brand-new Cloud
  project (per `docs/classroom-addon-gcp-state.md`). The External _audience_
  flip is unrelated to Marketplace App Visibility — leave Visibility alone.

---

## 7. Rollback

If external sign-ins cause any problem (unexpected data exposure, support load
from the interstitial, a Classroom-scope error, anything anomalous):

1. Console → **Google Auth Platform → Audience**
   (`https://console.cloud.google.com/auth/audience?project=spartboard`).
2. Switch **User type** back to **Internal**.
   - This immediately re-rejects all non-Orono accounts (`org_internal`) at the
     consent screen.
   - **Orono is unaffected by the rollback** for the same reason it was
     unaffected by the flip: same client, same scopes, existing grants intact.
3. Internal apps have no verification/user-cap concepts, so the unverified
   interstitial and any cap disappear immediately for Orono.
4. The Search Console property (§2) and any prepared verification assets (§3)
   can stay in place — they cost nothing and are reusable when you re-attempt
   External later.

> **Caveat:** Reverting the _audience_ to Internal does **not** un-declare any
> scope or change the Marketplace listing. If you had toggled
> `CLASSROOM_ASSIGN_ENABLED` or touched Marketplace/Trusted-client settings as
> part of §6, those are separate changes with their own revert steps — track
> them independently of the audience flip.

---

## Pre-flip go/no-go checklist

- [ ] §1 current Internal state recorded (screenshots).
- [ ] §2 `spartboard.web.app` verified in Search Console (URL-prefix) under the
      account that will own verification.
- [ ] §3 branding assets, scope justifications, demo video, Limited Use link
      all prepared.
- [ ] §6 Classroom decision made: `CLASSROOM_ASSIGN_ENABLED` set to `false` for
      launch **or** Marketplace declaration + Trusted client re-confirmed under
      External.
- [ ] Operator-model / legal eligibility language sign-off (district counsel) —
      gates the `/privacy` + `/terms` external-eligibility copy (W10); this is a
      **non-OAuth** prerequisite tracked in the journal, but it gates the
      Production publish decision.
- [ ] Low-traffic window chosen; §7 rollback understood.
- [ ] Post-flip: watch sign-ins for 24h; confirm an Orono account signs in with
      **no** change and a non-Orono test account reaches the free tier.

---

_Cross-references: [external-availability-journal.md](external-availability-journal.md)
(work-item context + locked decisions), [wide-distro-plan.md](wide-distro-plan.md)
Phase 4 (the launch switch), [classroom-addon-gcp-state.md](classroom-addon-gcp-state.md)
(Marketplace / consent-screen history, App Visibility irreversibility)._
