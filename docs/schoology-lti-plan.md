# Schoology LTI 1.3 Integration — Implementation Plan

**Goal:** An internal, Orono-only Schoology LTI 1.3 (LTI Advantage) app at **full parity** with the
Google Classroom Add-On: teacher attaches a SpartBoard quiz/video-activity to a Schoology course
(Deep Linking), students launch it inside the Schoology iframe, do the activity, and the teacher
pushes grades back to the Schoology gradebook (AGS).

**Status:** Plan authored 2026-06-02. Not yet started.
**Why:** Most Orono secondary teachers use Schoology; only ~7–10 teachers + grades 3–5 use Google
Classroom. The two integrations coexist — both mint the same `studentRole` Firebase custom token and
feed the same quiz/VA runners.

---

## 0. TL;DR

- **Reuse is the whole story.** The student runner, session/response model, scoring, grade-scaling
  math, and the teacher "push grades" monitor UX all carry over unchanged. The net-new work is the
  LTI protocol layer between the Schoology iframe and the gradebook.
- **I (Claude) own 100% of the GCP/Firebase side** — keypair, Secret Manager, Cloud Functions,
  hosting rewrites, Firestore rules. Verified: `gcloud` + `firebase` CLIs are authed as Paul on
  project `spartboard`.
- **You (Paul) own 100% of the Schoology side** — there is no API/CLI path into Schoology App
  Publisher; every step there is manual. The exact, certain list is in **§3**.
- **De-risk with two live spikes before any product polish** (mirrors how Classroom shipped):
  Spike 0 = a real Schoology launch validates & lands in the iframe; Spike 1 = deep-link one quiz +
  push one AGS score to the gradebook. Each is a hard go/no-go gate.
- **Cookieless launch is solved server-side** with a Firestore TTL `state`/`nonce` store — no
  browser cookies, no postMessage required for the baseline. postMessage Platform Storage is a
  documented fallback we add only if Spike 0 shows Schoology needs it.

---

## 1. Architecture

### 1.1 Routes & endpoints (all on `https://spartboard.web.app`, no new domain)

| Path                     | Type                             | Owner  | Purpose                                                                                                                     |
| ------------------------ | -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `/lti/login`             | Cloud Function (onRequest, GET)  | Claude | OIDC login-init: generate `state`+`nonce`, store in Firestore, 302 → Schoology authorize URL                                |
| `/lti/launch`            | Cloud Function (onRequest, POST) | Claude | OIDC callback: validate signed `id_token` (JWKS/iss/aud/nonce/exp), mint one-time launch code, 302 → SPA route              |
| `/.well-known/jwks.json` | Cloud Function (onRequest, GET)  | Claude | Publishes the tool's **public** key set (function, NOT a static file — hosting `ignore: **/.*` would drop a static dotfile) |
| `/lti/student`           | React SPA route                  | Claude | Learner runner mount (quiz/VA)                                                                                              |
| `/lti/teacher`           | React SPA route                  | Claude | Instructor: deep-link picker (mode=deeplink) **or** in-iframe grader                                                        |

Callables (no hosting rewrite needed):

- `ltiExchangeLaunchV1` — SPA exchanges the one-time launch code → Firebase custom token + launch context.
- `ltiSignDeepLinkResponseV1` — picker asks the server to sign the `LtiDeepLinkingResponse` JWT.
- `ltiPushGradesForAssignmentV1` — monitor/grader pushes AGS scores (mirrors `pushClassroomGradesForAssignment`).

### 1.2 Launch flow (cookieless, server-side state)

```
Schoology ──GET /lti/login?iss&login_hint&target_link_uri&lti_storage_target&client_id&lti_message_hint
              │
   ltiLogin: gen state+nonce → Firestore lti_oidc_state/{state}={nonce,ttl} (single-use)
              │  302 → https://lti-service.svc.schoology.com/lti-service/authorize-redirect
              ▼
Schoology authenticates user, ──POST /lti/launch  (form: id_token=<JWT>, state)
              │
   ltiLaunch: verify JWT sig vs Schoology JWKS (kid) │ iss=schoology.schoology.com │ aud=client_id
              │           nonce== Firestore[state].nonce (then DELETE state) │ exp/iat
              │  read claims: roles, message_type, context, resource_link, AGS endpoint, NRPS url, deep_link_settings
              │  mint lti_launch_codes/{code}={role, contextId, resourceLinkId, ags, nrps, dl?, ttl} (single-use)
              │  302 →  Learner+ResourceLink   →  /lti/student?lc=<code>
              │         Instructor+ResourceLink →  /lti/teacher?lc=<code>
              │         DeepLinkingRequest      →  /lti/teacher?lc=<code>&mode=deeplink
              ▼
SPA route ──callable ltiExchangeLaunchV1({code})
              │  Learner:  mint custom token {studentRole:true, orgId, classIds:['schoology:<contextId>', <classlink?>]}
              │            → signInWithCustomToken → mount runner   (REUSES classroomAddonLoginV1 minting)
              │  Instructor: return launch context; teacher Google-signs-in for their SpartBoard library
              ▼
   (Learner) quiz/VA runs exactly as today, keyed on opaque pseudonym uid
```

### 1.3 Keys & service auth

- **Tool RSA keypair (RS256).** Private key → Secret Manager (`lti-tool-private-key`); public key →
  served at `/.well-known/jwks.json` with a stable `kid`. Used to (a) sign the Deep Linking response
  JWT and (b) sign the `client_assertion` for AGS/NRPS token exchange.
- **AGS/NRPS calls** use OAuth2 **client-credentials via signed JWT assertion** (Schoology rejects
  HTTP Basic) against `…/lti-service/access-token`, scoped per service. Bearer cached short-TTL.
- **Schoology's public keys** fetched from `…/.well-known/jwks` (cache by `kid`, TTL) to verify
  inbound `id_token`s.

### 1.4 Firestore collections (new)

| Collection                                                  | Written by                        | Read by               | Rules                                                             |
| ----------------------------------------------------------- | --------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `lti_oidc_state/{state}`                                    | `ltiLogin` (Admin SDK)            | `ltiLaunch`           | client `read/write:false`; TTL field, single-use delete           |
| `lti_launch_codes/{code}`                                   | `ltiLaunch` (Admin SDK)           | `ltiExchangeLaunchV1` | client `read/write:false`; TTL, single-use delete                 |
| `lti_course_links/{contextId}`                              | `ltiLaunch`/link CF               | grade-push gate       | `read: auth!=null; write:false` (mirror `classroom_course_links`) |
| `lti_grade_links/{pseudonymUid}/resources/{resourceLinkId}` | `ltiExchangeLaunchV1` (Admin SDK) | grade-push CF         | `read: auth!=null; write:false`                                   |

Session linkage reuses the existing session docs with a new `ltiResourceLink` field (mirror of
`classroomAttachment`).

### 1.5 Platform endpoints (Schoology — constants baked into config)

|                         | Value                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Issuer (`iss`)          | `https://schoology.schoology.com` _(NOT the district subdomain; verify against a real `id_token`)_ |
| OIDC authorize          | `https://lti-service.svc.schoology.com/lti-service/authorize-redirect`                             |
| Access token (AGS/NRPS) | `https://lti-service.svc.schoology.com/lti-service/access-token`                                   |
| Platform JWKS           | `https://lti-service.svc.schoology.com/lti-service/.well-known/jwks`                               |

Two values come from **you** after registration: **`client_id`** and **`deployment_id`** (§3).

---

## 2. Ownership legend

- **[PAUL]** — only you can do it (Schoology UI / district admin). No automation path exists.
- **[CLAUDE]** — I do it via CLI or code. You may get a one-tap permission prompt; no expertise needed.
- **[BOTH]** — I prepare; you click/verify in a live Schoology session (I can watch via Chrome DevTools).

---

## 3. ⭐ YOUR MANUAL STEPS (Schoology) — the certain list

These are **the only things I cannot do.** Everything is a UI action in Schoology; I've supplied exact
field values. You can start **M1–M3 on day one, in parallel with all my coding.**

### M1 — Get developer permission **[PAUL → District System Administrator]**

- Ask the Orono Schoology **System Administrator** to enable, on your faculty role, under
  **User Management → Permissions → "Schoology Apps and APIs"**:
  - ✅ **Develop apps**
  - ✅ **Install applications**
- Verify: **App Center → "My Developer Apps"** now appears for you.
- _(If it doesn't appear, the permission didn't take — go back to the System Admin. This is the #1
  failure mode.)_

### M2 — Create the private LTI 1.3 app **[PAUL]**

- Go to **`https://app.schoology.com/apps/publisher`** → **Add App**. Enter:

  | Field                   | Value                                                      |
  | ----------------------- | ---------------------------------------------------------- |
  | App Name                | `SpartBoard`                                               |
  | Description             | (anything)                                                 |
  | **Available for**       | **Only people in my school** ← makes it private, no review |
  | **Type of App**         | **LTI 1.3 App**                                            |
  | **Configuration Type**  | **Manual**                                                 |
  | Domain/URL              | `https://spartboard.web.app`                               |
  | **OIDC Login Init URL** | `https://spartboard.web.app/lti/login`                     |
  | **Redirect URLs**       | `https://spartboard.web.app/lti/launch`                    |
  | **JWKS URL**            | `https://spartboard.web.app/.well-known/jwks.json`         |

- **Placement:** check **Course Materials Selection** _(this — not Rich Text Editor — is the placement
  that enables "Add Materials" deep linking AND carries gradebook line-item/AGS data)._
- **"This app uses cookies":** leave **UNCHECKED** — the launch is cookieless (server-side Firestore
  state). Checking it triggers Schoology's legacy cookie-preload popup we don't use.
- **Privacy:** **"Send Name and Email/Username of user who launches the tool"** — keep this. The email
  is received transiently (never persisted), enabling the email→ClassLink pseudonym bridge + watermark
  name, mirroring the Classroom add-on.
- **LTI Advantage Extensions:**
  - **Deep Linking** — required (auto-checked because of the Course Materials placement).
  - **Assignment and Grade Services** — check.
  - **✅ "Use Unique Lineitem Identifiers for Linked Sections" — CHECK THIS.** Orono teachers link/merge
    sections constantly. Schoology's linked-section AGS is a known-fragile area: a deep-linked item
    shows to ALL linked sections and Schoology creates one line item per section, but with the default
    (shared) identifier, grade posting silently succeeds for only ONE section. Unique-per-section line
    items is the prerequisite for every merged period's gradebook to receive scores. **Architecture
    rule:** resolve each student's line item from THEIR OWN launch's AGS claim (per-student
    `lti_grade_links`), never the deep-link-time line item. **Required Spike-1 go/no-go test:** push
    grades into a real linked/merged course (students in 2+ sections) and confirm each section's
    gradebook gets them. If flaky, enable NRPS as the fallback to map students→sections.
  - **Names and Roles Services** — leave **OFF** for now (PII-minimization; we get per-launcher
    identity from the Privacy setting). Back-pocket fallback if linked-section AGS proves unreliable.
- Save.

> ⚠️ I must publish the JWKS + deploy the functions **before** your first launch, or the URLs 404.
> Sequence: I finish Phase A → you do the live-test parts of M3/M4. Creating the app (M2) can happen
> any time; the URLs only need to resolve at launch time.

### M3 — Hand me two values **[PAUL → Claude]**

- **`client_id`**: App profile → **Options → API Info**. (Available immediately after M2.)
- **`deployment_id`**: appears only **after install** (M4) → **Organization Apps → Configure**.
- _(These are two separate values on two screens — Schoology does not combine them.)_

### M4 — Install to a scoped test course **[PAUL]**

- From the app profile: **Install LTI 1.3 App → agree → Add to Organization**.
- On **Organization Apps**, install it to **one test course** only (create a throwaway course +
  enroll one test student). Keep blast radius tiny during spikes.
- Click **Configure** → copy the **`deployment_id`** → send to me (completes M3).

### M5 — Live launch tests **[BOTH]**

- **Spike 0 gate:** open the test course → **Add Materials → SpartBoard** → confirm the iframe loads
  and shows the validated launch ("hello, &lt;your role &amp; context&gt;"). I'll watch via Chrome
  DevTools (network/console) while you drive.
- **Spike 1 gate:** Add Materials → pick a SpartBoard quiz → launch as the **test student** → take it
  → back as teacher, **push grades** → confirm the score in the Schoology gradebook.

### M6 — District-wide rollout **[PAUL → System Administrator]** _(only after parity verified)_

- Re-install (or broaden the existing install) to **All Courses** for the org.

> **No Schoology review/approval** is required at any point — that only applies to the _public_ App
> Center. A private "Only people in my school" app installs straight from your profile page.

---

## 4. What I (Claude) do — no Schoology needed

All verified do-able with the authed CLIs:

- **[CLAUDE]** Generate RSA keypair (`openssl`/`node`), create `lti-tool-private-key` in Secret Manager,
  enable any needed APIs (`gcloud services enable secretmanager.googleapis.com`).
- **[CLAUDE]** Add `jose` to `functions/package.json` (NOT currently present; `google-auth-library` already is).
- **[CLAUDE]** Write & deploy the Cloud Functions (`ltiLogin`, `ltiLaunch`, `ltiJwks`,
  `ltiExchangeLaunchV1`, `ltiSignDeepLinkResponseV1`, `ltiPushGradesForAssignmentV1`).
- **[CLAUDE]** Add hosting rewrites for `/lti/login`, `/lti/launch`, `/.well-known/jwks.json` **above**
  the `**`→`index.html` catch-all in `firebase.json`; add a `/lti/**` CSP `frame-ancestors 'self'
https://*.schoology.com` header.
- **[CLAUDE]** Write Firestore rules + indexes + TTL policies for the four new collections.
- **[CLAUDE]** Build the React `/lti/student` + `/lti/teacher` routes (reusing
  `StudentSpikeRoute`/`TeacherDiscoveryRoute`/`TeacherReviewRoute` patterns).
- **[CLAUDE]** Deploy to the live `spartboard` project for live testing (the endpoints are inert —
  they reject anything without a Schoology-signed JWT), then ship through `dev-paul → main`.
- **[CLAUDE]** Run `pnpm run validate` (type-check, lint, format, tests) before any push.

You might see a one-time OS/permission prompt when I create the secret or deploy — that's it.

---

## 5. Phased plan (with parallel tracks)

### Phase A — Foundations _(4 tracks run concurrently; ~all independent)_

- **A1 [CLAUDE]** Keys & hosting: keypair → Secret Manager → `ltiJwks` function → `firebase.json`
  rewrites + CSP header. Deploy. Verify `/.well-known/jwks.json` returns the JWK set in a browser.
- **A2 [CLAUDE]** `functions/src/lti/` module scaffold: `jose` JWT verify, Schoology-JWKS client (kid
  cache), Firestore `state`/`nonce` store, launch-code store, shared config (endpoints + `client_id`/
  `deployment_id` placeholders read from a config doc/secret).
- **A3 [CLAUDE]** Firestore rules + indexes for `lti_oidc_state`, `lti_launch_codes`,
  `lti_course_links`, `lti_grade_links`; deploy rules; add rules tests under `tests/rules/`.
- **A4 [PAUL]** **M1 + M2** — get the permission, create the app, send me `client_id`.

**Gate A:** JWKS resolves publicly; app exists in Schoology; `client_id` in hand.

### Phase B — Spike 0: bare validated launch _(the primary de-risk)_

- **B1 [CLAUDE]** `ltiLogin` + `ltiLaunch` + `ltiExchangeLaunchV1` + a minimal `/lti/student` page
  that renders the validated claims. **Log the inbound `lti_storage_target`** and full login-init
  query to settle the storage question empirically.
- **B2 [PAUL]** **M4** (install to test course, send `deployment_id`) + **M5 Spike-0 launch**.
- **B3 [BOTH]** I watch via Chrome DevTools; we confirm a real launch validates end-to-end.

**Gate B (HARD):** A real Schoology launch validates (`iss`/`aud`/`nonce`/`sig`) and lands in the
iframe with a `studentRole` session. _If the Firestore state-store proves insufficient (it shouldn't),
add postMessage Platform Storage here before proceeding._ **80% of total risk dies at this gate.**

### Phase C — Spike 1: deep-link one quiz + one AGS score _(2 tracks)_

- **C1 [CLAUDE]** Deep-link picker (`/lti/teacher?mode=deeplink`, reusing the Classroom discovery
  library UI) + `ltiSignDeepLinkResponseV1` (signs `LtiResourceLink` w/ embedded `lineItem`
  `{scoreMaximum, label}`, custom `{quiz_id}`) + auto-POST to `deep_link_return_url`.
- **C2 [CLAUDE]** AGS client (client-credentials JWT assertion → bearer → `POST <lineitem>/scores`) +
  `ltiPushGradesForAssignmentV1` (reuses `buildQuizClassroomGradeEntries` scaling unchanged; swaps the
  Classroom PATCH for the AGS score POST; gates on caller==link teacher). **Each student's line item is
  resolved from THEIR OWN launch's AGS claim (per-student `lti_grade_links`), never the deep-link-time
  line item** — this is what makes linked/merged sections work (see Gate C).
- **C3 [PAUL]** **M5 Spike-1**: attach a quiz, run as test student, push grade, verify gradebook —
  **including a linked/merged course with students in 2+ sections** (the common Orono case).

**Gate C (HARD):** A scaled correctness score lands in the Schoology gradebook column — **and lands in
EVERY section's gradebook for a linked/merged course.** Linked-section grade sync is a known-fragile
area of Schoology (the "Use Unique Lineitem Identifiers for Linked Sections" app setting must be on);
if per-section posting is unreliable, enable NRPS to map students→sections as the fallback.

### Phase D — Full parity _(parallel tracks once Gates B+C pass)_

- **D1 [CLAUDE]** Student runner wiring for **quiz + VA** (Learner launch → existing runners).
- **D2 [CLAUDE]** Instructor **grader** (Instructor resource-link launch → `TeacherReviewRoute`
  pattern → AGS push).
- **D3 [CLAUDE]** Monitor "push grades" integration for Schoology-linked sessions (UI button parity
  with the Classroom monitor; routes to `ltiPushGradesForAssignmentV1`).
- **D4 [CLAUDE]** NRPS roster bridge (optional): use NRPS membership for class-gating / watermark
  names, or reuse the ClassLink `computeStudentUid` bridge keyed on the LTI `sub`.
- **D5 [CLAUDE]** `LtiResourceLink` type + persistence on `quiz_sessions`/`video_activity_sessions`
  (+ assignment archive copies), mirroring `ClassroomAttachmentLink`.

### Phase E — Hardening & ship

- **E1 [CLAUDE]** Edge cases: re-launch/idempotency, missing AGS claim (non-deep-linked item),
  expired launch code, anonymous/PII-free fallback, key rotation runbook.
- **E2 [CLAUDE]** `pnpm run validate` + rules tests + targeted unit tests for JWT validation & scaling.
- **E3 [BOTH]** Full smoke test in the test course; then **M6** district rollout.
- **E4 [CLAUDE]** `docs/schoology-lti-state.md` runbook (config values, rotation, troubleshooting).

---

## 6. Reuse map (grounded in actual code)

| Capability                       | Existing file (reuse)                                                                                                        | LTI change                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Route detection                  | `App.tsx` ~L379 `/classroom-addon/` branch                                                                                   | Add parallel `/lti/` branch, same provider mounts                                         |
| Student handshake                | `components/classroomAddon/StudentSpikeRoute.tsx` L233–287                                                                   | Swap GIS popup → launch-code exchange; keep `signInWithCustomToken`                       |
| **Custom-token mint**            | `functions/src/classroomAddonAuth.ts` `classroomAddonLoginV1` L684–695 `createCustomToken(uid,{studentRole,orgId,classIds})` | Swap `getAddOnContext` → LTI JWT validate; **claims shape identical**                     |
| Pseudonym uid + ClassLink bridge | same file L577–649, `computeStudentUid`                                                                                      | Key on LTI `sub` instead of Google sub; otherwise unchanged                               |
| Attach / deep link               | `createClassroomAttachment` L717–887 (URI building)                                                                          | Replace Classroom attachment POST → signed DeepLinkingResponse                            |
| **Grade scaling**                | `utils/classroomGradePush.ts` `buildQuizClassroomGradeEntries` L64–90                                                        | **Unchanged** (`scoreGiven=correctness, scoreMaximum=total`)                              |
| Push orchestration               | `utils/runClassroomGradePush.ts` L137–201                                                                                    | Reuse; `requestToken` becomes app-level client-credentials (no per-teacher popup)         |
| Grade push CF                    | `pushClassroomGradesForAssignment` L1115–1277                                                                                | Swap `resolveSubmissionId`→`lti_grade_links` lookup; Classroom PATCH → AGS `/scores` POST |
| Class-gate rules                 | `firestore.rules` L24–97 `passesStudentClassGate` etc.                                                                       | Reuse as-is; `classIds` carries `schoology:<contextId>`                                   |
| Teacher grader UI                | `components/classroomAddon/TeacherReviewRoute.tsx` L282–345                                                                  | Reuse; Instructor role from launch JWT                                                    |
| Attachment type                  | `types.ts` `ClassroomAttachmentLink` L2833                                                                                   | Add sibling `LtiResourceLink` type                                                        |

Already in the tree and reusable: `ALLOWED_ORIGINS` (`functions/src/classlinkShared.ts`),
`google-auth-library`, the `/activity/**` CSP already lists `https://*.schoology.com`.

---

## 7. Risks & mitigations

| Risk                                                                 | Severity           | Mitigation                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookieless OIDC `state`/`nonce` in the iframe                        | was High → **Med** | Firestore TTL single-use store (no cookies). postMessage Platform Storage as fallback; Spike 0 logs `lti_storage_target` to decide empirically                                                                                        |
| JWT validation bugs fail silently                                    | Med-High           | `jose` with strict `iss`/`aud`/`exp`/`nonce`/`kid` checks; unit tests with real captured `id_token`; verbose Spike-0 logging                                                                                                          |
| Tool key management / rotation                                       | Med                | Private key in Secret Manager; public JWKS via function with `kid`; documented rotation runbook (E4)                                                                                                                                  |
| **AGS requires Deep Linking** on Schoology                           | Med                | Always embed `lineItem` in the DeepLinkingResponse so the gradebook column + AGS claim exist on later launches; never rely on non-deep-linked items                                                                                   |
| **Linked/merged sections grade sync** (common at Orono)              | **Med-High**       | Check "Use Unique Lineitem Identifiers for Linked Sections" in the app; resolve each student's line item from their OWN launch (per-student `lti_grade_links`); required Spike-1 test on a real merged course; NRPS fallback if flaky |
| `gradingProgress`/`PendingManual` reportedly incomplete on Schoology | Low-Med            | Post `Completed`+`FullyGraded` for autograded quizzes; verify written-response/manual states empirically in Spike 1                                                                                                                   |
| `iss` historical variant (`www.schoology.com`)                       | Low                | Validate against the real `id_token`; make `iss` a config constant, easy to flip                                                                                                                                                      |
| No isolated Schoology sandbox                                        | Low                | Test in a scoped throwaway course in the live instance; private + single-course install contains blast radius                                                                                                                         |
| Deploying LTI functions to prod pre-parity                           | Low                | Endpoints reject all non-Schoology-signed requests; routes inert without a launch code                                                                                                                                                |

---

## 8. Config values you'll hand me (single place)

| Value           | Where you get it                    | When     |
| --------------- | ----------------------------------- | -------- |
| `client_id`     | Schoology app → Options → API Info  | after M2 |
| `deployment_id` | Org Apps → Configure (post-install) | after M4 |
| (confirm) `iss` | Spike-0 launch log                  | Gate B   |

I bake the four platform endpoint constants (§1.5) myself. Once you send `client_id` + `deployment_id`
I store them as function config/secret — no code edit needed from you.

---

## 9. Deploy approach — DECIDED (2026-06-02)

**Approved: deploy-to-prod for spikes.** The LTI Cloud Functions + hosting rewrites deploy **directly
to the live `spartboard` project** for live launch testing (Schoology can only reach public prod URLs;
preview-channel→function rewrites are unreliable). The endpoints are **inert without a Schoology-signed
JWT** and the `/lti/*` routes do nothing without a valid launch code, so blast radius is nil. Final
parity code still ships through the normal `dev-paul → main` (regular merge) flow per the dev-branch
rule. Spike functions are deployed via targeted `firebase deploy --only functions:ltiLogin,...` from
the working branch.
