# Classroom Add-on — GCP configuration state (Phase 0A snapshot)

> Phase 0A deliverable. Records the GCP/`gcloud`-automatable config that has been
> applied, and hands off the manual Console + admin-install work to **Phase 0B**.
> See [classroom-addon-integration-plan.md](classroom-addon-integration-plan.md).

**Captured:** 2026-05-29 by orchestrator (Claude), running `gcloud` as `paul.ivers@orono.k12.mn.us`.

---

## Project alignment ✅

| Source                            | Project ID             |
| --------------------------------- | ---------------------- |
| `gcloud config get-value project` | `spartboard`           |
| `firebase projects:list`          | `spartboard` (current) |

- Project number: **759666600376**
- Active gcloud account: `paul.ivers@orono.k12.mn.us` (also has the `firebase-adminsdk-fbsvc@spartboard.iam.gserviceaccount.com` service account credentialed).
- **Gate PASSED** — gcloud and Firebase point at the same project; do not create a new one.

## APIs enabled ✅

| Service                               | Title                            | Status     |
| ------------------------------------- | -------------------------------- | ---------- |
| `classroom.googleapis.com`            | Google Classroom API             | ✅ Enabled |
| `appsmarket-component.googleapis.com` | Google Workspace Marketplace SDK | ✅ Enabled |

**`[VERIFY]` RESOLVED — Marketplace SDK API name.** The plan listed a third API,
`workspacemarketplace.googleapis.com`. **That service does not exist** (gcloud
returns `SERVICE_CONFIG_NOT_FOUND_OR_PERMISSION_DENIED`). The Workspace
Marketplace SDK _is_ `appsmarket-component.googleapis.com` — there is no separate
"workspacemarketplace" API. The plan's API list should be corrected to these two.

## Education Plus license — reachable, not denied (confirm in 0B)

Probe: `GET https://classroom.googleapis.com/v1/courses?pageSize=1` with a
`gcloud auth print-access-token` bearer →

```
HTTP 403  ACCESS_TOKEN_SCOPE_INSUFFICIENT
"Request had insufficient authentication scopes."
```

- This is a **scope** 403, **not** a license 403. The gcloud default token carries
  `cloud-platform` scope, not a `classroom.*` scope, so it cannot call the
  Courses API — but the API answered with a structured Classroom error, proving
  it is enabled and reachable.
- **No license blocker surfaced.** A definitive Education Plus confirmation needs
  a Classroom-scoped token (would require interactive consent) — so it is deferred
  to the **0B Admin Console** check. Orono is confirmed on Education Plus per the
  plan's Context section.

## OAuth consent screen — ⚠️ found External; switching to Internal (2026-05-29)

**The plan's assumption that the consent screen was already Internal was WRONG.**
On 2026-05-29 it was found set to **External** with **no scopes declared**.

- ✅ **Internal IS available:** the `spartboard` project is owned by the
  `orono.k12.mn.us` Workspace org (`gcloud organizations list` → org id
  **63276922281**, customer `C027lkte3`; `gcloud projects describe spartboard` →
  `parent.type = organization`). Internal is only selectable for org-owned
  projects, so the switch is possible.
- ✅ **Decision (Paul, 2026-05-29): switch to Internal.** SpartBoard's production
  Google Sign-In serves **only `@orono.k12.mn.us`** (the multi-tenant
  `/organizations` code is not used by other districts), so restricting the
  consent screen to the Orono org is safe and is what exempts the Sensitive
  Classroom scopes from OAuth verification + CASA.
- **Order matters:** switch User Type External → Internal **first**, then declare
  the 5 scopes. Adding the Sensitive `classroom.addons.*` scopes while still
  External would (in production) trigger verification/CASA, or cap the app at 100
  test users in Testing mode.
- After switching to Internal, the publishing-status / "test users" concepts
  become moot — Internal org apps need no verification and have no user cap.

## Marketplace SDK

API enabled ✅. **App Configuration / Store Listing not yet done** — that is 0B
Console work.

---

## Handoff to Phase 0B (manual — Paul / Workspace admin)

In **Google Cloud Console:**

- [ ] OAuth consent screen → confirm **User Type = Internal**.
- [ ] Declare exactly these 5 scopes:
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/classroom.addons.teacher`
  - `https://www.googleapis.com/auth/classroom.addons.student`
  - **Do NOT add `classroom.coursework.*`.**
- [ ] **Marketplace SDK → App Configuration:**
  - [ ] App Visibility: **Private** ⚠️ **irreversible** — cannot be changed without a new Cloud project; do NOT pick Public.
  - [ ] Installation: **Individual + Admin Install** is fine, but note the Classroom caveat below — for Classroom add-ons, an admin must still install OR allowlist the app before it appears in the assignment "Add-ons" picker; individual install of the Marketplace app alone does NOT enable the Classroom launch. This setting IS changeable later.
  - [ ] Enable the **Classroom add-on** integration
  - [ ] Attachment Setup URI: `https://<spartboard-domain>/classroom-addon/teacher` (for dev testing use the dev preview URL, e.g. `https://spartboard--dev-paul-<hash>.web.app/classroom-addon/teacher`)
  - [ ] Allowed Attachment URI Prefixes: `https://<spartboard-domain>/` (literal, **no wildcards**; add the dev preview prefix too for testing). Also add the dev origin to the OAuth client's **Authorized JavaScript origins** (GIS popup requirement).
  - [ ] Requested scopes match the 5 above.
- [ ] Marketplace SDK → Store Listing: name, description, **128×128 icon + 220×140 card banner** (in `marketplace-assets/`), ≥1 screenshot, **Privacy Policy URL** (`/privacy`), **Terms of Service URL** (`/terms`), support contact. **PUBLISH.**
- [ ] Confirm NO verification/CASA required (Internal-user-type exemption).

In **Workspace Admin Console (REQUIRED for Classroom add-ons — not optional):**

Per Google, a Classroom add-on only launches once an admin has **installed or
allowlisted** it — the "Individual install" Marketplace setting does NOT cover
the Classroom launch ([support.google.com/edu/classroom/answer/12351654](https://support.google.com/edu/classroom/answer/12351654)). Pick one:

- [ ] **Admin Install** (simplest for the pilot): Apps → Google Workspace Marketplace apps → SpartBoard → Install for a test OU containing your account. Enables it with no further teacher action.
- [ ] **OR Allowlist** it, then self-install from inside the Classroom assignment creator.
- [ ] Sign in as a test teacher → confirm SpartBoard appears in Classroom's assignment "Add-ons" menu.

> ✅ **Reachability prerequisite for 0B — now built (2026-05-29).** Both spike
> routes exist: `/classroom-addon/student` (PR #1755) and
> `/classroom-addon/teacher` (the Attachment Setup URI). The
> `createClassroomAttachment` CF and the `/classroom-addon/**` `frame-ancestors`
> CSP header are in place. **Remaining gate:** deploy the current branch (so the
> CF + CSP are live), then complete the 0B install above and run the live iframe
> test. See the orchestrator's "path to first live test" plan.
