# SpartBoard ↔ Google Classroom Add-ons Integration Plan

> **Status tracking document.** Every AI agent (orchestrator + sub-agents) working on this integration MUST update this file as they go. See [§ Tracking Protocol](#tracking-protocol) at the bottom before starting work.

---

## 📌 Current Status — read this first

**Last updated:** 2026-05-28 by audit agent (re-scoped to current codebase; see [Progress Log](#progress-log) top entry).

**Active phase:** _none — awaiting kickoff_

**Active agent(s):** _none_

> **⚠️ Re-scope notice (2026-05-28).** A month of unrelated student-auth work landed the foundation this plan assumed it would build. **Two whole phases are effectively done already:**
>
> - **Phase 1D (VideoActivity SSO branch) is BUILT** — and more completely than this plan described. The `studentRole` branch, a PIN→SSO custom-token bridge (`pinLoginV1`), a shared `computeResponseKey`, and a PII-free response doc all exist in [hooks/useVideoActivitySession.ts](../hooks/useVideoActivitySession.ts) + [components/videoActivity/VideoActivityStudentApp.tsx](../components/videoActivity/VideoActivityStudentApp.tsx). Phase 1D is now **verify-only** — do NOT re-implement it.
> - **Phase 0.5 (server-side OAuth refresh tokens) is BUILT** — [functions/src/googleOAuth.ts](../functions/src/googleOAuth.ts) already exchanges/stores/refreshes encrypted refresh tokens at `/users/{uid}/private/googleAuth` (locked by [firestore.rules:559](../firestore.rules)). Phase 0.5 collapses to "**extend** the existing module with Classroom grade-write scopes" — do NOT build a parallel module or a new `/google_oauth/` path.
>
> The genuinely-new work is: **Phase 0** (GCP/Marketplace config), **`classroomAddonLoginV1`** (sign the user in via `login_hint` + OAuth, then trust **`getAddOnContext`** for role — there is NO launch JWT/JWKS to verify; see below), small additive **types/rules/CSP**, the **teacher discovery view + attachment CF + selection panels** (the real bulk), **thin student adapters** (the runners already do SSO), **grade passback** (a _draft_ grade that auto-populates the gradebook when pushed with stored offline teacher creds), and **copied-assignment resilience** (Phase 3.5).

> **⚠️ API-grounding correction (2026-05-28).** The plan was re-verified against the live Google Classroom Add-ons docs (5 research agents, citations in [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28)). **The single biggest change: Classroom Add-ons do NOT use a signed launch token / JWKS** — that is an LTI concept. Authentication is `login_hint` (an obfuscated Google id in plain query params) → OAuth/GIS sign-in → a server-side `getAddOnContext` call that is the authoritative source of role (`studentContext` vs `teacherContext`) and the grade-passback `submissionId`. Phase 1B/2/3/4 are rewritten accordingly, the grade-write scope is resolved (`classroom.addons.teacher`), and a new Phase 3.5 covers the copy/reuse re-ID gotcha. **Every API-contract `[VERIFY]` is now resolved**; the only markers left are two runtime/operational confirmations (the exact gcloud Marketplace service name, and the precise CSP `frame-ancestors` origins), both with guidance in that section.

**Next action for the next agent:** Review [§ Tracking Protocol](#tracking-protocol), then begin Phase 0A (Sonnet 4.6, GCP config). Phase 0A and Phase 1 can run in parallel — see [§ Order of Operations](#order-of-operations).

**Blockers / open items:** None.

**Resume instructions if picking up cold:**

1. Read [§ Phase Status Dashboard](#phase-status-dashboard) — find the first `⬜ Not started` or `🟡 In progress` agent task that has all its dependencies satisfied.
2. Read that agent's "Steps" and "Completion criteria" checkboxes — pick up wherever the last checked box left off.
3. Skim the [§ Progress Log](#progress-log) for the last 3–5 entries to understand recent context.
4. Before merging anything, run the [§ Cross-phase verification gates](#cross-phase-verification-gates).

---

## 🗂 Phase Status Dashboard

Status legend: ⬜ Not started · 🟡 In progress · ✅ Complete · ⚠️ Blocked · ⏭ Skipped/N/A

| Phase     | Agent                                      | Model      | Status           | Owner (Claude session id or human) | Last update                                                |
| --------- | ------------------------------------------ | ---------- | ---------------- | ---------------------------------- | ---------------------------------------------------------- |
| 0A        | GCP `gcloud` automation                    | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 0B        | Manual Console + Marketplace install       | _(human)_  | ⬜               | —                                  | —                                                          |
| 0.5-cf    | **Extend** existing OAuth w/ grade scopes  | Opus 4.7   | ⬜ (reduced)     | —                                  | googleOAuth.ts already does refresh tokens                 |
| 0.5-rules | ~~Lock down `/google_oauth/`~~             | —          | ⏭ N/A           | —                                  | redundant — `/private/**` already locked (rules:559)       |
| 0.5-ui    | "Connect to Classroom gradebook" button    | Sonnet 4.6 | ⬜ (reduced)     | —                                  | reuse existing connect-Google flow                         |
| 1A        | Types + Firestore rules + CSP              | Opus 4.7   | ⬜               | —                                  | —                                                          |
| 1B        | `classroomAddonLoginV1` Cloud Function     | Opus 4.7   | ⬜               | —                                  | OAuth + `getAddOnContext` (NO JWKS); model on `pinLoginV1` |
| 1C        | Roster `classIds` synthesis                | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 1D        | VideoActivity SSO branch                   | Opus 4.7   | ✅ (verify-only) | —                                  | already built — see Phase 1D                               |
| 2-shell   | Teacher route + widget-type picker         | Opus 4.7   | ⬜               | —                                  | —                                                          |
| 2-cf      | `createClassroomAttachment` CF             | Opus 4.7   | ⬜               | —                                  | —                                                          |
| 2-quiz    | Quiz selection panel                       | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 2-va      | Video Activity selection panel             | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 3-shell   | Student route + auth handshake             | Opus 4.7   | ⬜               | —                                  | —                                                          |
| 3-quiz    | Quiz student adapter                       | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 3-va      | Video Activity student adapter             | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 3.5       | Copied-assignment resilience (copyHistory) | Opus 4.7   | ⬜               | —                                  | NEW — copy/reuse re-IDs course/item/attachment             |
| 4-cf      | `pushClassroomGrade` Cloud Function        | Opus 4.7   | ⬜               | —                                  | grade is a DRAFT; scope = `classroom.addons.teacher`       |
| 4-quiz    | Quiz submission hook wiring                | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 4-va      | VA submission hook wiring                  | Sonnet 4.6 | ⬜               | —                                  | —                                                          |
| 5         | Polish                                     | Sonnet 4.6 | ⬜               | —                                  | —                                                          |

---

## Context

**Goal:** A teacher in Google Classroom clicks "Add → SpartBoard," picks Quiz or Video Activity, selects a library item, and attaches it. Students click the attachment, complete the activity inside the Classroom iframe, and grades flow into Classroom's gradebook automatically.

**Why this approach:** Education Plus is confirmed at Orono and the Workspace OAuth consent screen is configured Internal. SpartBoard ships as a **private app** — installable by the district admin domain-wide, no Marketplace review, no OAuth verification, no CASA. Same deployment pattern as the existing Docs extension at Orono.

**Project context:** The GCP project already exists and is linked to the SpartBoard Firebase project. **Do not create a new project** — extend the existing one. Use `gcloud` and `firebase` CLI in place of Console UI work wherever possible.

**Scope:** Quiz + Video Activity only. Guided Learning and MiniApp are deferred. Paul's longer-term direction is for all four student runners to share the same auth/data foundation — and as of 2026-05-28 **that foundation largely exists for Quiz + VA**: both runners have a `studentRole` SSO branch, a shared `computeResponseKey`, and a PIN→SSO custom-token bridge (`pinLoginV1`). This integration plugs Classroom in as a third entry point onto that same foundation rather than building it.

**Resolved decisions (from review with Paul, 2026-04-28):**

1. ✅ One-time "Connect SpartBoard to Classroom gradebook" consent step is approved (Phase 0.5).
2. ✅ Lifting the "no widget runners change" restriction _for VideoActivity only_ is approved (Agent 1D mirrors PR #1431). Quiz, MiniApp, GL untouched.
3. ✅ **RESOLVED (2026-05-28):** the grade-write scope is **`https://www.googleapis.com/auth/classroom.addons.teacher`** — NOT `classroom.coursework.students`. Add-on attachment grades are a distinct API surface from core CourseWork grades; setting `pointsEarned` on an add-on attachment submission requires only the `addons.teacher` scope. (Cited in [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28).)

---

## 🚧 Architectural gates (blocking constraints — every phase verifies)

1. **No student PII in Firestore.** Names, PINs, emails live exclusively in Google Drive. The Google OAuth sign-in / `getAddOnContext` will expose the student's identity — names/emails from it must NOT be persisted to Firestore (derive an HMAC pseudonym instead). Already enforced (`ClassRosterMeta` at [types.ts:117](../types.ts) explicitly comments "contains NO student PII"; response docs key by deterministic pseudonym/PIN keys without `name`/`email` fields). Don't regress.

2. **No Google `userId` storage; identity comes from `getAddOnContext`.** SpartBoard never stores Google's domain-wide `userId`. The student is identified server-side by calling `getAddOnContext` (which returns `studentContext.submissionId`); the Firebase pseudonym is an HMAC over that, exactly like the existing minters. The grade-passback key is the composite **`attachmentId` + `submissionId`** — `submissionId` is NOT unique across courses, so always store both. Do not add a Google `userId` field anywhere.

3. **Existing student auth flows must keep working unchanged.** ClassLink SSO (`/my-assignments` → `studentLoginV1`) and anonymous PIN joins must continue to function for the same Quiz and Video Activity sessions. The Classroom Add-on entry is _additive_.

4. **Widget-runner change scope:**
   - **Quiz student runner:** read-only. SSO branch already exists ([components/quiz/QuizStudentApp.tsx:133-138](../components/quiz/QuizStudentApp.tsx)).
   - **Video Activity student runner:** SSO branch **already shipped** ([hooks/useVideoActivitySession.ts:666](../hooks/useVideoActivitySession.ts), [components/videoActivity/VideoActivityStudentApp.tsx:82](../components/videoActivity/VideoActivityStudentApp.tsx)). No runner change remains — Phase 1D is verify-only. Existing PIN-joined students already work unchanged.
   - **MiniApp / GuidedLearning runners:** read-only, out of scope.

5. **`firestore.rules` PII gate must extend cleanly.** `classroomAddonLoginV1` mints custom tokens with the same `{ studentRole: true, orgId, classIds }` shape as `studentLoginV1`. The existing `passesStudentClassGate*` helpers do format-agnostic string matching ([firestore.rules:45](../firestore.rules), [firestore.rules:76](../firestore.rules)) — `classroom:abc123` works without modifying any helper.

6. **Zero disruption to existing functionality during development.** No teacher- or student-facing widget functionality breaks at any point during rollout. Concretely:
   - All schema changes are strictly additive (`?: optional` fields). No renames, no required-field additions, no enum removals.
   - All Firestore rules changes are additive. After each rules edit, the full `tests/rules/` suite still passes.
   - `useQuizAssignments.createAssignment` keeps generating join codes unconditionally; Classroom-attached assignments get a harmless unused PIN.
   - Existing `/quiz?code=...` and `/activity/:sessionId` routes are read-only references. New routes live under `/classroom-addon/**`.
   - The new server-side OAuth code grant is a _parallel_ path. Existing GIS + Firebase popup flow continues unchanged for teachers who don't use Classroom.
   - No backfill / migration / rewrite of existing response, assignment, or session docs.
   - **Verification cadence (mandatory every phase):** PIN-joined Quiz, ClassLink-SSO Quiz from `/my-assignments`, PIN-joined VideoActivity all complete end-to-end successfully.

7. **`getAddOnContext` is the trust anchor — there is no launch JWT/JWKS.** (Corrected 2026-05-28; the original "verify the JWKS" instruction was based on an LTI misconception.) Classroom opens the iframe with plain query params (`login_hint`, `courseId`, `itemId`, `itemType`, plus `addOnToken` in discovery and `attachmentId`/`submissionId` in the later iframes). **Treat every query param as untrusted.** The only authoritative signal is a **server-side `getAddOnContext` call** made with the user's own OAuth access token: exactly one of `studentContext`/`teacherContext` is returned → that is the role. **Mint `studentRole: true` ONLY when `studentContext` is populated** — never infer role from a query param. Getting this wrong (trusting a param, or skipping `getAddOnContext`) is the highest-severity bug class. All other former `[VERIFY]` markers are resolved in [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28).

---

## 🔍 Reference implementations (verified to exist; study before writing)

> **All line numbers below verified 2026-05-28.** The 2026-04-28 draft had drifted by hundreds of lines in `functions/src/index.ts` and the hooks; these are current.

| Pattern                                                              | File:Line                                                                                                                                                                                                                                   | What to learn                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom token mint with `studentRole` claims                          | [functions/src/index.ts:3126](../functions/src/index.ts) (`studentLoginV1`)                                                                                                                                                                 | Claim shape minted at line 3322 (`{ studentRole: true, orgId, classIds }`); HMAC pseudonym `computeStudentUid` at line 3052; secret `STUDENT_PSEUDONYM_HMAC_SECRET` (defineSecret line 59) — reuse the **same** secret                                                      |
| **PIN→SSO custom-token mint (closest model for 1B)**                 | [functions/src/index.ts:4153](../functions/src/index.ts) (`pinLoginV1`)                                                                                                                                                                     | A second, newer custom-token minter: validates `kind: 'quiz' \| 'video-activity'`, reads a `pin_index` doc, mints the same claim shape. `classroomAddonLoginV1` is its sibling with a `getAddOnContext` call swapped in for the PIN lookup                                  |
| PII-free claim extraction                                            | [context/StudentAuthContext.tsx:100](../context/StudentAuthContext.tsx) (`extractStudentClaims`); `<RequireStudentAuth>` at line 353                                                                                                        | Reads only `studentRole`/`orgId`/`classIds`; never `email`/`displayName`                                                                                                                                                                                                    |
| Class-gate enforcement                                               | [firestore.rules:45](../firestore.rules) (`studentRoleCanAccessClass`), [firestore.rules:76](../firestore.rules) (`passesStudentClassGateList`)                                                                                             | Format-agnostic string membership (`classId in …`, `.hasAny(…)`) — `classroom:abc` works unchanged; safe-default `.get('studentRole', false)` at line 39                                                                                                                    |
| Quiz assignment lifecycle                                            | [hooks/useQuizAssignments.ts:650](../hooks/useQuizAssignments.ts) (`createAssignment`)                                                                                                                                                      | **Signature changed:** now `(quiz, settings, options)` where `options` is an **object** `{ initialStatus?, classIds?, rosterIds?, mode?, … }`; `allocateJoinCode()` is unconditional (defined line 556, called line 681); writeBatch atomicity                              |
| VA assignment lifecycle                                              | [hooks/useVideoActivityAssignments.ts:291](../hooks/useVideoActivityAssignments.ts) (`createAssignment`)                                                                                                                                    | **Positional** `(activity, settings, initialStatus?, classIds?, periodNames?, rosterIds?, mode?)`; no join code. Note: different calling convention than Quiz                                                                                                               |
| Quiz library listing                                                 | [hooks/useQuiz.ts:132](../hooks/useQuiz.ts) (`useQuiz`)                                                                                                                                                                                     | `onSnapshot` on `/users/{userId}/quizzes` (line 155)                                                                                                                                                                                                                        |
| VA library listing                                                   | [hooks/useVideoActivity.ts:99](../hooks/useVideoActivity.ts) (singular — _not_ `useVideoActivities`)                                                                                                                                        | Same pattern as `useQuiz`                                                                                                                                                                                                                                                   |
| Quiz student SSO branch (reference, do NOT modify)                   | [components/quiz/QuizStudentApp.tsx:133-138](../components/quiz/QuizStudentApp.tsx)                                                                                                                                                         | `tokenResult.claims?.studentRole === true` → `setIsStudentRole(true)`; renders `<QuizJoinFlow isStudentRole />`. Inside an auth-init effect after `authStateReady()`                                                                                                        |
| **VA student SSO branch (ALREADY BUILT — Phase 1D done)**            | [hooks/useVideoActivitySession.ts:666](../hooks/useVideoActivitySession.ts) (`joinSession`), [components/videoActivity/VideoActivityStudentApp.tsx:82](../components/videoActivity/VideoActivityStudentApp.tsx)                             | `joinSession(targetSessionId, studentPin?, classPeriod?)` — **`name` param is gone**; SSO joiners skip PIN; PIN→SSO bridge at line 740 (`pinLoginV1`); PII-free response write at line 999 (`pin` only when present, never `name`); shared `computeResponseKey` at line 822 |
| Quiz student-side join                                               | [hooks/useQuizSession.ts:1182](../hooks/useQuizSession.ts) (`joinQuizSession(code, pin?, classPeriod?)`)                                                                                                                                    | Code-based join; `lookupSession(code)` resolves session-by-code (line 1353)                                                                                                                                                                                                 |
| Class-ID derivation                                                  | [utils/resolveAssignmentTargets.ts:101](../utils/resolveAssignmentTargets.ts) (`deriveTargetsFromRosterList`)                                                                                                                               | Current flatmap (line 111): `.flatMap((r) => [r.classlinkClassId, r.testClassId])` → deduped `classIds`. Phase 1C extends this                                                                                                                                              |
| Existing SSO assignment href                                         | [hooks/useStudentAssignments.ts:184](../hooks/useStudentAssignments.ts)                                                                                                                                                                     | `/quiz?code=${encodeURIComponent(code)}` — Classroom adapter mirrors                                                                                                                                                                                                        |
| Tested rules patterns                                                | [tests/rules/studentRoleClassGate.test.ts:496-537](../tests/rules/studentRoleClassGate.test.ts)                                                                                                                                             | Auth-fixture pattern; bare-anon-token edge case                                                                                                                                                                                                                             |
| Existing CSP frame-ancestors                                         | [firebase.json:40-46](../firebase.json)                                                                                                                                                                                                     | `/activity/**` already lists `https://classroom.google.com`                                                                                                                                                                                                                 |
| **Server-side OAuth refresh-token capture (Phase 0.5 EXTENDS this)** | [functions/src/googleOAuth.ts](../functions/src/googleOAuth.ts) (`exchangeGoogleAuthCode` / `refreshGoogleAccessToken` / `revokeGoogleRefreshToken`); client offline grant in [utils/googleOAuthRefresh.ts](../utils/googleOAuthRefresh.ts) | Refresh tokens already captured + **encrypted** at rest at `/users/{uid}/private/googleAuth`; client GIS code-grant already uses `access_type:'offline'` + `prompt:'consent'`. Phase 0.5 adds Classroom grade scopes to this — does NOT build new                           |
| Token-at-rest lockdown                                               | [firestore.rules:559](../firestore.rules) (`/users/{userId}/private/{document=**}` → `if false`)                                                                                                                                            | Existing deny-all already covers the OAuth tokens — Phase 0.5-rules is redundant                                                                                                                                                                                            |

---

## ✅ Verified Google Classroom Add-ons API facts (2026-05-28)

> Researched against the official docs by 5 agents; citations at the end of this section. **This block resolves every API-contract `[VERIFY]`** that used to live in the phases; only two runtime/operational confirmations remain (the gcloud Marketplace SDK service name to enable, and the exact CSP `frame-ancestors` origins to confirm in a live iframe). When a phase step conflicts with this block, this block wins.

### Auth model (the spine — read first)

- **No signed launch token, no JWKS.** Signed launch JWTs are LTI 1.3, a different integration. Classroom Add-ons pass plain query params and rely on OAuth.
- **Flow:** iframe loads with `login_hint` (obfuscated Google user id) → if no server session matches, run the **OAuth 2.0 auth-code flow** (server-side, `access_type=offline`, pass the iframe's `login_hint` as the OAuth `login_hint` to pre-select the account) → **call `getAddOnContext`** with the user's token → mint the Firebase custom token, setting `studentRole: true` **iff `studentContext` is populated**.
- **OAuth consent cannot redirect inside the iframe** — open the consent step in a popup/new tab. On repeat visits with a matching session, sign-in is frictionless (skip the button).
- **Third-party-cookie / storage partitioning:** to keep a Firebase session alive inside the partitioned iframe, plan for the **Storage Access API** + **CHIPS** partitioned cookies, and **opt GIS into FedCM**. A session cookie set in the iframe will NOT carry to a new top-level tab — re-establish there if you ever break out.

### Scopes (exact — declare exactly these 5)

```
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/classroom.addons.teacher
https://www.googleapis.com/auth/classroom.addons.student
```

- `classroom.addons.teacher` — used in teacher/discovery iframes for attachment create/update/delete **and grade passback**. Never grant to students.
- `classroom.addons.student` — student/student-work iframes (launch validation + read).
- **No `classroom.coursework.*` scope is needed.** Both `addons.*` scopes are "Sensitive" but an **Internal** app is exempt from verification (see below).

### Iframe types & query params (call `getAddOnContext` on EVERY load)

| Iframe (URI field)     | Loaded when                     | Params present                                                   | Gotcha                                                                                                                   |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Attachment Discovery   | Teacher picks the add-on        | `courseId`, `itemId`, `itemType`, **`addOnToken`**, `login_hint` | **No `attachmentId`** (not created yet); `addOnToken` lives only here (+ Link Upgrade) and **expires**                   |
| `teacherViewUri`       | Teacher previews the attachment | `courseId`, `itemId`, `itemType`, `attachmentId`, `login_hint`   | No `addOnToken`, no `submissionId`                                                                                       |
| `studentViewUri`       | Student opens the attachment    | same as teacherView                                              | **`submissionId` is NOT in the URL** — fetch it via `getAddOnContext`; opening this is what makes a `submissionId` exist |
| `studentWorkReviewUri` | Teacher grades a student        | adds **`submissionId`**                                          | Teacher may open it for a student who never opened the add-on (no work yet)                                              |

### Endpoints (host `https://classroom.googleapis.com`)

> **Implement with raw `fetch` + a Bearer header — do NOT add the `googleapis` SDK.** `functions/` has no `googleapis` dependency; every existing Google call uses `fetch`/`axios` with a Bearer token (mirror `getDriveHeaders` at `functions/src/index.ts:326`). This keeps the functions bundle lean. The user's access token (teacher live token, or a refreshed offline token) goes in `Authorization: Bearer …`.

- **Resolve context:** `GET /v1/courses/{courseId}/{courseWork|courseWorkMaterials|announcements}/{itemId}/getAddOnContext` (pass `addOnToken` as a query param only when present — it's a request param, not a response field) → `{ courseId, itemId, supportsStudentWork, studentContext?: { submissionId }, teacherContext? }`. **Exactly one** of `studentContext`/`teacherContext`. (Field is `supportsStudentWork`, NOT `supportsStudentWorkReview`. Separate method per item type — switch on `itemType`.)
- **Create attachment:** `POST /v1/courses/{courseId}/courseWork/{itemId}/addOnAttachments?addOnToken=…`. **Required body:** `title`, `teacherViewUri:{uri}`, `studentViewUri:{uri}` (URI fields are `EmbedUri` objects with a single `uri` string). **For grade passback you must ALSO set** `studentWorkReviewUri:{uri}` **and a non-zero `maxPoints`** (maxPoints is invalid without studentWorkReviewUri). Use `itemId` (not deprecated `postId`). Store the returned `id` (= `attachmentId`).
- **Push a grade:** `PATCH /v1/courses/{courseId}/courseWork/{itemId}/addOnAttachments/{attachmentId}/studentSubmissions/{submissionId}?updateMask=pointsEarned` with body `{ "pointsEarned": <number> }`. Path uses **`itemId`**, not "courseWorkId".
- **Recovery/idempotency:** there is no idempotency key — store `attachmentId` yourself; `GET …/addOnAttachments` (`list`, scoped to your add-on) is the reconciliation fallback.

### `maxPoints` + gradebook truth

- A **non-zero `maxPoints`** (only valid alongside `studentWorkReviewUri`) marks the attachment as the **"Grade sync"** attachment and drives the assignment's point total. `maxPoints` 0/omitted ⇒ **no grade passback**.
- **Only ONE** attachment per assignment can be the grade-sync attachment, and **your add-on must be its original creator** to push grades.
- `pointsEarned` posts a **DRAFT grade**, not a returned/final grade. **There is no API to "return" grades** — returning is a teacher action in the Classroom UI.
- **With stored OFFLINE teacher credentials, the draft auto-populates the gradebook as students finish — no teacher action needed** (this is the flow SpartBoard wants). With _live_ teacher creds, grades only appear when the teacher opens each submission. Propagation is typically 5–10s, up to **30s**.
- **Prerequisite chain:** add-on is original creator → attachment has `maxPoints`>0 + `studentWorkReviewUri` → student opened `studentViewUri` (so `submissionId` exists) → PATCH `pointsEarned` with a teacher (`addons.teacher`) credential.

### Copy / reuse (HIGH-severity gotcha — see Phase 3.5)

Copying a course, assigning to multiple classes, or reusing a post **re-IDs everything**: new `courseId`, new `itemId`, **new `attachmentId`**. There is **no copy callback**. Read the `copyHistory` field on the new `AddOnAttachment` to map it back to the original, then lazily recreate/relink SpartBoard's assignment+session docs on first open. SpartBoard docs keyed by old IDs would otherwise point at nothing → silent breakage.

### Submission semantics

Classroom **owns** the `studentSubmission`; the add-on does not create it and there is **no "submit/turn-in" endpoint** (`postSubmittedAddOnAttachment` does not exist). The student "turns in" in the Classroom UI; SpartBoard "complete" is independent — document that they're decoupled.

### Limits, errors, testing

- **Quotas:** ~3,000 req/min/client, 1,200 req/min/user (60s moving average). `429 RESOURCE_EXHAUSTED` → truncated exponential backoff + jitter. Max **10 attachments/assignment**, ≤8 of one type.
- **Token errors:** `ExpiredAddOnToken` → prompt the user to refresh/sign in again to get a fresh `addOnToken`. `InvalidAddOnToken` → account mismatch (signed into the wrong Google account).
- **Testing:** use a **demo Workspace-for-Education domain** with ≥3 same-domain test users (1 teacher, 2 students); install via a **test deployment** — you can iterate without re-publishing. Adopt Google's published **Add-ons Test Plan** checklist.

### Setup / Marketplace SDK / policy

- **OAuth consent screen User Type = Internal** — this is the lever that exempts the app from OAuth **verification + CASA** (and the unverified-app screen / 100-user cap). Keep it Private/Internal.
- **Marketplace SDK App Configuration:** App Visibility = **Private**; Installation = **Admin Only Install** (domain rollout); enable the **Classroom add-on** integration; set the **Attachment Setup URI** (discovery launch route) and **Allowed Attachment URI Prefixes** (literal prefixes, **no wildcards** — use the SpartBoard top-level HTTPS origin).
- **CSP:** Google does **not** publish an exact `frame-ancestors` list. Use `frame-ancestors 'self' https://classroom.google.com https://*.google.com https://*.googleusercontent.com` and **remove any `X-Frame-Options: DENY/SAMEORIGIN`** (it blocks Classroom's iframe). `[VERIFY-AT-RUNTIME]` by loading the add-on and watching for CSP-block console errors; tighten to the minimum that loads.
- **Licensing:** Add-ons require **Education Plus** or **Teaching & Learning Upgrade**. Orono on Education Plus → supported, no extra purchase.
- **Domain install:** Admin console → Apps → Google Workspace Marketplace apps → Install app → "Works with: Classroom" → install for the domain/OU. Teachers then see it in the assignment "Add-ons" picker.

### Citations (all official, last-updated 2026-04-20 unless noted)

- iframes & query params — https://developers.google.com/workspace/classroom/add-ons/developer-guides/iframes
- Sign-in journey + walkthrough — https://developers.google.com/workspace/classroom/add-ons/get-started/sign-in-journey · https://developers.google.com/workspace/classroom/add-ons/walkthroughs/sign-in
- Frictionless sign-in — https://developers.google.com/workspace/classroom/add-ons/developer-guides/frictionless-signin
- Third-party cookies guidance — https://developers.google.com/workspace/classroom/add-ons/developer-guides/third-party-cookies
- `getAddOnContext` REST — https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/getAddOnContext
- `addOnAttachments.create` / resource / `list` — https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork.addOnAttachments/create · https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork.addOnAttachments
- Grade passback walkthrough — https://developers.google.com/workspace/classroom/add-ons/walkthroughs/grade-passback
- `studentSubmissions.patch` REST — https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork.addOnAttachments.studentSubmissions/patch
- Attachment interactions — https://developers.google.com/workspace/classroom/add-ons/developer-guides/attachment-interactions
- Copy/reuse content — https://developers.google.com/workspace/classroom/add-ons/developer-guides/copy-content
- Project configuration (scopes) — https://developers.google.com/workspace/classroom/add-ons/developer-guides/project-configuration
- Marketplace SDK config — https://developers.google.com/workspace/marketplace/enable-configure-sdk
- Usage limits — https://developers.google.com/workspace/classroom/reference/limits
- Common errors — https://developers.google.com/workspace/classroom/troubleshooting/common-errors
- Verification not needed (Internal) — https://support.google.com/cloud/answer/13464323
- Editions / add-ons licensing — https://support.google.com/a/answer/7676757 · https://developers.google.com/workspace/classroom/support/faq
- Install Classroom add-ons (admin) — https://support.google.com/edu/classroom/answer/12351654
- Test Plan PDF — https://developers.google.com/static/workspace/classroom/assets/classroom_add_ons_test_plan.pdf (2024-02-16)

---

## 🧭 Order of Operations

```
Phase 0A (gcloud, ~1 hr)  ──┐
Phase 0B (manual Console, ~30 min) ──┘  (sequential within Phase 0)
   │
   ├─ Phase 0.5 (REDUCED — grade scopes only; refresh-token plumbing already exists)
   │   └─ 0.5-cf (add Classroom scope + helper) ──> 0.5-ui (reuse existing connect flow)
   │      (0.5-rules is N/A — /private/** already locked)
   │
   └─ Phase 1 (parallel with 0/0.5)
       ├─ 1A ──┐
       ├─ 1B ──┤  (parallel)
       └─ 1C ──┘  (after 1A merge)
       (1D is DONE — verify-only, no agent needed)

Phase 2 (after Phase 0B install AND Phase 1A + 1B merged)
   ├─ 2-shell ──┐
   ├─ 2-cf ─────┤  (parallel with 2-shell)
   ├─ 2-quiz ───┤  (after 2-shell merge)
   └─ 2-va ─────┘  (parallel with 2-quiz)

Phase 3 (after Phase 2 merge; 1D dependency already satisfied)
   ├─ 3-shell ──┐
   ├─ 3-quiz ───┤  (after 3-shell merge)
   └─ 3-va ─────┘  (parallel with 3-quiz)

Phase 3.5 — Copied-assignment resilience (copyHistory relink) (after Phase 3 merge)

Phase 4 (after Phase 0.5 + 3)
   ├─ 4-cf ─────┐
   ├─ 4-quiz ───┤  (all parallel)
   └─ 4-va ─────┘

Phase 5 — Polish (sequential, single agent)
```

**Realistic timeline (revised after the 2026-05-28 audit + API grounding):** Phase 0 same day · reduced Phase 0.5 + Phase 1 in parallel ~1-2 days (1D done, 0.5 plumbing done) · Phase 2 ~3-5 days (the real bulk: 3 iframe URIs + attachment create) · Phase 3 ~1-2 days (adapters are thin; runners already SSO) · Phase 3.5 ~1 day (copyHistory relink) · Phase 4 ~2-3 days (gated on 0.5) · Phase 5 ~2-3 days. **Total: ~2-2.5 weeks** of code work — shorter than the original 3-week estimate because the auth foundation already shipped, but with the copy-resilience work added back in.

---

## 🏎️ Day-1 critical path & thinnest vertical slice (optimize for shortest time)

> The phase graph above is the _complete_ build. This section is the **fastest route to a working end-to-end demo** — teacher attaches ONE quiz → one student completes it → a draft grade lands in the gradebook — and what to defer to get there.

**De-risk the ONE true unknown in the first hour.** Everything except one thing is conventional REST + Firestore work. The single real risk is **whether a Firebase `studentRole` session survives inside Classroom's partitioned (cross-site) student iframe** — the quiz runner is a client SPA that writes responses to Firestore gated by that session. Before building anything else, stand up a throwaway `/classroom-addon/student` page that does ONLY: read `login_hint` → run Google OAuth **in a popup** (consent cannot redirect inside an iframe) → CF mints a Firebase custom token → `postMessage` it back to the iframe → `signInWithCustomToken` → call `getAddOnContext` → print `studentContext.submissionId`. Load it inside one real Classroom attachment on the test domain. Firebase persists its session in **IndexedDB** (partitioned but functional in an iframe); if it doesn't survive, fall back to CHIPS (`SameSite=None; Partitioned`) / the Storage Access API. **If this handshake works, the rest is low-risk.**

**Human gate (start tomorrow AM; ~1 hr; blocks only the live iframe test):** Phase 0B — a Workspace admin installs the private add-on domain-wide + sets the Attachment Setup URI + the 5 scopes. Same pattern as Orono's existing Docs extension → no verification/CASA/review delay. Everything else is built against mocks before the install propagates.

**Critical path (ordered, Quiz only):** `0B (human)` ∥ `0A` → `1B` (`classroomAddonLoginV1`: OAuth → `getAddOnContext` → mint) + `1A` (types/CSP/rules) + `0.5-cf` (add the scope) → `2-cf` (attach, **with a hardcoded single quiz to skip the panel UI**) + `2-shell` (teacher route) → `3-shell` + `3-quiz` (thin adapter) → `4-cf` + `4-quiz`.

**Defer until the Quiz pipe works end-to-end:** all `*-va` (Video Activity), **Phase 3.5** copy-resilience (but do NOT ship to real teachers before it lands — copied assignments render blank without it), **Phase 5** polish, the **2-quiz/2-va** selection-panel library UI (hardcode one quiz first), the Resync button, and **1C** roster `classIds` synthesis (not on the grade path).

**Day-1 parallel streams:**

- **Stream A (human):** kick off the 0B install + 0A `gcloud` enables.
- **Stream B (Opus):** the de-risk MVP slice above, then `1B` against a **mocked `getAddOnContext`** (no live install needed).
- **Stream C (Opus):** `1A` types + `/classroom-addon/**` CSP + rules tests — zero external deps, unblocks Phases 2/3. `0.5-cf` joins once 1A lands the scope constant.

**Estimate:** the hardcoded-single-quiz pipe is ~2 days of engineering once 0B is installed, vs ~1 week for the full panelized build. Prove the pipe, then widen to the selection panels, Video Activity, and copy-resilience.

---

## Phase 0 — GCP configuration

### Phase 0A — `gcloud`-automatable

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6 (mechanical config work)
- **Owner:** _unassigned_
- **Dependencies:** none
- **Outputs:** `docs/classroom-addon-gcp-state.md`; gates passed for Phase 0B handoff

#### Steps (check off as completed)

- [ ] Confirm project alignment: `gcloud config get-value project` and `firebase projects:list` both show the same project ID. If not, **stop and surface to Paul** before proceeding.
- [ ] Enable required APIs:
  - [ ] `gcloud services enable classroom.googleapis.com`
  - [ ] `gcloud services enable appsmarket-component.googleapis.com`
  - [ ] `gcloud services enable workspacemarketplace.googleapis.com`
  - [ ] `[VERIFY]` Marketplace SDK API name with `gcloud services list --available | grep -i marketplace`; over-enabling is harmless.
- [ ] Attempt to query consent-screen User Type. **Soft gate** — if no clean `gcloud` path exists, fall through to Phase 0B's Console check rather than blocking. (Original prompt's `gcloud alpha iap oauth-brands list` is the wrong API for non-IAP apps.)
- [ ] List currently authorized OAuth scopes; capture for the snapshot.
- [ ] Verify Education Plus license:

  ```bash
  curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
       "https://classroom.googleapis.com/v1/courses?pageSize=1"
  ```

  - 200 → Plus is associated.
  - 403 with license error → **stop and surface to Paul**.

- [ ] Generate config snapshot at `docs/classroom-addon-gcp-state.md` summarizing: enabled APIs, consent-screen User Type (or "unverified — check 0B"), existing scopes, Marketplace SDK status.

#### Completion criteria

- [ ] All three Classroom-related APIs show as enabled in `gcloud services list --enabled`.
- [ ] `curl` to Classroom API returns 200 (or 403 has been raised to Paul as a license gate).
- [ ] `docs/classroom-addon-gcp-state.md` exists and contains all required sections.
- [ ] Update Phase Status Dashboard row → ✅ Complete with timestamp.
- [ ] Append a Progress Log entry summarizing the snapshot.

#### Notes / handoff

_(append findings here as you work; especially anything Phase 0B will need)_

---

### Phase 0B — Manual Console work

- **Status:** ⬜ Not started
- **Owner:** _human (Paul or Workspace admin)_
- **Dependencies:** Phase 0A complete
- **Estimated time:** ~30 min

#### Steps (developer/admin checks off)

In **Google Cloud Console:**

- [ ] **OAuth consent screen → Edit App** — confirm User Type = Internal.
- [ ] Add the verified scope set (RESOLVED 2026-05-28 — exact, see [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28)):
  - [ ] `openid`
  - [ ] `https://www.googleapis.com/auth/userinfo.email`
  - [ ] `https://www.googleapis.com/auth/userinfo.profile`
  - [ ] `https://www.googleapis.com/auth/classroom.addons.teacher` ← also authorizes grade passback
  - [ ] `https://www.googleapis.com/auth/classroom.addons.student`
  - [ ] **Do NOT add `classroom.coursework.*`** — add-on attachment grades are a distinct surface needing only `addons.teacher`. (The old "historically coursework.students" note was wrong.)
- [ ] **Marketplace SDK → App Configuration:**
  - [ ] App Visibility: **Private** (critical — Public triggers Marketplace review + OAuth verification)
  - [ ] Installation setting: **Admin Only Install** (for controlled domain rollout)
  - [ ] Enable the **Classroom add-on** integration (exposes the add-on URI fields)
  - [ ] Attachment Setup URI: `https://<spartboard-domain>/classroom-addon/teacher`
  - [ ] Allowed Attachment URI Prefixes: `https://<spartboard-domain>/` — **literal prefix, NO wildcards**; Classroom validates every `teacherViewUri`/`studentViewUri`/`studentWorkReviewUri` against this.
  - [ ] Requested scopes match the consent screen (the 5 above).
- [ ] **Marketplace SDK → Store Listing:** Application Name, descriptions, 192px icon, screenshot (placeholder OK for private). Click **PUBLISH**.
- [ ] **Verification/CASA gate:** confirm NONE required — an Internal-user-type app using these sensitive scopes is exempt from OAuth verification + CASA + the unverified-app screen + the 100-user cap. Keeping User Type = Internal is what grants the exemption.

In **Workspace Admin Console:**

- [ ] As Orono Workspace admin, **Apps → Google Workspace Marketplace apps → Add app → Install for the entire domain**.
- [ ] Confirm install propagated by signing in as a test teacher and verifying SpartBoard appears in Classroom's "Add" menu.

#### Completion criteria

- [ ] Add-on installed and discoverable in Classroom's "Add" menu for at least one test teacher account.
- [ ] Update Phase Status Dashboard row → ✅ Complete with timestamp and the verified grade-write scope set noted in the row's "Last update" cell.
- [ ] Append a Progress Log entry.

---

## Phase 0.5 — Classroom grade-write OAuth scopes (REDUCED — most plumbing already exists)

> **Audit correction (2026-05-28):** The original draft assumed the app "only stores 1-hour access tokens and never requests `access_type: 'offline'`." **That is no longer true.** The server-side refresh-token pipeline is already built:
>
> - [functions/src/googleOAuth.ts](../functions/src/googleOAuth.ts) — `exchangeGoogleAuthCode` exchanges an auth code → tokens and stores the **encrypted** refresh token at `/users/{uid}/private/googleAuth`; `refreshGoogleAccessToken` mints a fresh access token from it; `revokeGoogleRefreshToken` tears it down.
> - [utils/googleOAuthRefresh.ts](../utils/googleOAuthRefresh.ts) — the client GIS code-grant already runs with `access_type: 'offline'` + `prompt: 'consent'`.
> - [firestore.rules:559](../firestore.rules) — `/users/{userId}/private/{document=**}` is already `allow read, write: if false`, so the tokens are unreadable from the client.
>
> So Phase 0.5 is no longer "build a server-side OAuth code grant." It is "**add the `classroom.addons.teacher` scope to the existing flow and expose a Classroom-scoped access-token getter for Phase 4.**" (Scope RESOLVED 2026-05-28; see [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28).) Do NOT create `classroomGradebookOAuth.ts` and do NOT introduce a `/users/{uid}/google_oauth/` path — reuse `/private/googleAuth` (or a sibling `/private/` doc) and the existing helpers.
>
> **Why offline creds specifically:** the Phase 4 grade is a Classroom _draft_ grade. Pushed with **stored offline teacher credentials**, the draft auto-populates the gradebook as students finish — no teacher action. With merely live creds it would only appear when the teacher opens each submission. So the stored-refresh-token path isn't just convenient — it's what makes "grades show up automatically" true.
>
> Decision (Paul, 2026-04-28) still stands: a one-time consent step is acceptable friction.

### Agent 0.5-cf — Add Classroom grade scope to the existing OAuth module

- **Status:** ⬜ Not started (reduced)
- **Model:** Opus 4.7 (long-lived credential storage; security-critical)
- **Owner:** _unassigned_
- **Dependencies:** Phase 0A + 0B complete (so the verified grade-write scope set is known)
- **Outputs:** extension of [functions/src/googleOAuth.ts](../functions/src/googleOAuth.ts); a `getValidClassroomAccessToken(uid)`-equivalent for Phase 4 reuse (may be a thin wrapper over the existing `refreshGoogleAccessToken` that asserts the Classroom scope is present).

#### Steps

- [ ] **Read [functions/src/googleOAuth.ts](../functions/src/googleOAuth.ts) first.** Understand `exchangeGoogleAuthCode`, `refreshGoogleAccessToken`, `revokeGoogleRefreshToken`, the encryption helper, and the `/users/{uid}/private/googleAuth` doc shape. **You are extending these, not replacing them.**
- [ ] **The requested-scope list lives in TWO places — edit both** (verified 2026-05-28): the client array `GOOGLE_OAUTH_SCOPES` at [config/firebase.ts:31](../config/firebase.ts) (consumed by `utils/googleOAuthRefresh.ts`, ~line 174) AND the server gate `REQUIRED_DRIVE_SCOPES` at [functions/src/googleOAuth.ts:56](../functions/src/googleOAuth.ts). Append `classroom.addons.teacher` to the client array; decide whether to add it to the server "required" gate or treat it as an optional/partial-consent scope.
- [ ] **Granted scopes are already persisted** on the token doc (`StoredGoogleAuth.scope`, written in `exchangeGoogleAuthCode`), so the `needs-classroom-consent` check is a membership test on `stored.scope` — there's a working precedent for a structured needs-consent error at `googleOAuth.ts` ~line 292. Reuse it.
- [ ] Decide token-doc strategy and document it in the Progress Log:
  - **Option A (preferred):** widen the existing `/private/googleAuth` grant to include the Classroom grade scope, store the granted scope list on the doc, and let Phase 4 reuse the same refresh token. Simplest; one consent for Drive + Classroom.
  - **Option B:** a separate `/private/googleClassroom` doc minted by a parallel exchange, if mixing Drive + Classroom scopes on one grant proves undesirable. Justify in the log if you pick this.
- [ ] Ensure the access-token getter for Phase 4 verifies the stored scopes include **`https://www.googleapis.com/auth/classroom.addons.teacher`**; if absent, return a structured `needs-classroom-consent` error (so Phase 4 / the UI can prompt a re-consent).
- [ ] Unit tests in `functions/test/` (mirror existing `googleOAuth` test patterns):
  - [ ] Code grant including Classroom scope → scope persisted on the doc.
  - [ ] Access-token getter: expired access token → refreshed via existing path.
  - [ ] Access-token getter: stored grant lacks Classroom scope → `needs-classroom-consent`.
  - [ ] Access-token getter: missing/revoked refresh token → structured error.
- [ ] **Do not auto-deploy.** Stop and request human deploy gate.

#### Completion criteria

- [ ] Unit tests pass; existing `googleOAuth` tests still pass.
- [ ] No new `/users/{uid}/google_oauth/` path introduced; tokens stay under `/private/`.
- [ ] Code reviewed by human before deploy.
- [ ] Non-disruption smoke ([§ Cross-phase verification gates](#cross-phase-verification-gates)).
- [ ] Update Phase Status Dashboard → ✅.
- [ ] Append Progress Log entry (note the Option A/B decision).

#### Notes / handoff

_(append findings here)_

---

### Agent 0.5-rules — ⏭ N/A (already covered)

- **Status:** ⏭ Skipped — redundant.
- **Reason:** [firestore.rules:559](../firestore.rules) already denies all client access to `/users/{userId}/private/{document=**}`, which is where the OAuth tokens live. As long as Phase 0.5-cf keeps tokens under `/private/` (per its instructions), no rules change is needed. If — and only if — 0.5-cf is forced to use a new top-level path, add a matching `allow read, write: if false` block and rules tests then; otherwise leave `firestore.rules` untouched and confirm the existing `/private/**` test coverage still passes.

---

### Agent 0.5-ui — "Connect to Classroom gradebook" button (reduced)

- **Status:** ⬜ Not started (reduced)
- **Model:** Sonnet 4.6 (wiring work)
- **Owner:** _unassigned_
- **Dependencies:** 0.5-cf merged

#### Steps

- [ ] **Reuse the existing connect-Google UI** — do not hand-roll a second GIS flow. The button is [components/layout/sidebar/SidebarGoogleDrive.tsx:160](../components/layout/sidebar/SidebarGoogleDrive.tsx) (`onClick={() => void connectGoogleDrive()}`); `connectGoogleDrive` is in [context/AuthContext.tsx:557](../context/AuthContext.tsx) → `refreshGoogleToken` → `requestAndExchangeAuthCode` ([utils/googleOAuthRefresh.ts:142](../utils/googleOAuthRefresh.ts)). The only delta is the added scope (Phase 0.5-cf) and surfacing Classroom-connected status from `stored.scope`.
- [ ] Surface connection status: connected/not connected, whether the Classroom grade scope is granted, last connected timestamp.
- [ ] **Critical scoping:** this remains a parallel path to the existing Firebase popup sign-in. Verify:
  - [ ] An existing teacher who never clicks the button has identical behavior to today.
  - [ ] Clicking the button shows the consent prompt; on approve, the stored grant gains the Classroom scope; the token doc remains unreadable from the client SDK (verify via dev-tools eval).

#### Completion criteria

- [ ] Existing teacher sign-in unchanged for users who don't click the button.
- [ ] Consent flow completes; Classroom scope persisted; client cannot read the token doc.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

## Phase 1 — Foundation (parallel with Phases 0/0.5)

### Agent 1A — Types + Firestore rules + CSP

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (touches `firestore.rules`)
- **Owner:** _unassigned_
- **Dependencies:** none

#### Steps

- [ ] **`types.ts`** — additive only:
  - [ ] On `ClassRosterMeta`: add `classroomCourseId?: string` with comment explaining the `classroom:{courseId}` synthesis pattern.
  - [ ] On `QuizAssignment`: add `classroomCourseId?: string` and `classroomAttachmentId?: string`.
  - [ ] On `VideoActivityAssignment`: add the same two fields.
  - [ ] **Add `'classroom'` to `ClassRosterMeta.origin`.** As of 2026-05-28 the union is `'classlink' | 'local'` ([types.ts:135](../types.ts)) — it does **not** include `'classroom'` (the original draft wrongly said it did). Extend it to `'classlink' | 'local' | 'classroom'`. This is an additive enum widening (existing values unchanged), consistent with the "additive only" rule.
- [ ] **`firestore.rules`:**
  - [ ] Read [firestore.rules:45](../firestore.rules) and [firestore.rules:76](../firestore.rules); confirm `passesStudentClassGate*` does format-agnostic matching. **Do not rewrite the helpers.**
  - [ ] If you find yourself rewriting any helper, stop and re-read this section.
- [ ] **`firebase.json`** — append a `/classroom-addon/**` block. Google does NOT publish an exact `frame-ancestors` list (see [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28)); use the conservative Classroom set (drop the Canvas/Schoology origins from the `/activity/**` block — those are LTI, not Classroom):

  ```json
  {
    "source": "/classroom-addon/**",
    "headers": [
      {
        "key": "Content-Security-Policy",
        "value": "frame-ancestors 'self' https://classroom.google.com https://*.google.com https://*.googleusercontent.com"
      }
    ]
  }
  ```

  - [ ] Ensure no `X-Frame-Options: DENY/SAMEORIGIN` header applies to `/classroom-addon/**` — it would block Classroom's iframe outright.
  - [ ] `[VERIFY-AT-RUNTIME]` (the only remaining unknown): load the add-on in a real Classroom iframe and watch the console for CSP-blocked frame-ancestors errors; tighten the origin list to the minimum that actually loads.

- [ ] **Tests** in [tests/rules/studentRoleClassGate.test.ts](../tests/rules/studentRoleClassGate.test.ts):
  - [ ] Add: `studentRole` user with `classIds: ['classroom:abc123']` claim can read/write a session targeted at `classIds: ['classroom:abc123']`.
  - [ ] Add: same user is denied for `classIds: ['classroom:other']`.
  - [ ] Cover both `quiz_sessions` and `video_activity_sessions`.
  - [ ] Mirror the bare-anon-token edge case at lines 495–536.

#### Completion criteria

- [ ] `pnpm run type-check` clean.
- [ ] `pnpm test tests/rules/` passes including new cases AND every previously-passing test still passes.
- [ ] `git diff types.ts` shows only additive changes — `?:` field additions plus the `origin` enum **widening** (adding `'classroom'`; no existing value renamed or removed), no required-field additions.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 1B — `classroomAddonLoginV1` Cloud Function

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (`getAddOnContext` trust anchor, custom-token mint, security-critical)
- **Owner:** _unassigned_
- **Dependencies:** none (independent of 1A)

#### Steps

- [ ] Create new module `functions/src/classroomAddonAuth.ts`. Model the custom-token mint on **`pinLoginV1`** at [functions/src/index.ts:4153](../functions/src/index.ts) and cross-reference `studentLoginV1` at [functions/src/index.ts:3126](../functions/src/index.ts) for the claim/pseudonym details. **The identity proof is OAuth + `getAddOnContext`, NOT a launch-token signature — there is no JWT/JWKS to verify** (see [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28)).
- [ ] **Input:** the user's Google OAuth access token (obtained by the calling route via the `login_hint`-seeded OAuth code flow) plus `courseId`, `itemId`, `itemType`, and `addOnToken` when present. **Treat all of these as untrusted** until confirmed by `getAddOnContext`.
- [ ] **Trust anchor — call `getAddOnContext` server-side** with the user's access token (this replaces the old JWKS step):
  - [ ] `GET /v1/courses/{courseId}/{itemType}/{itemId}/getAddOnContext` (include `addOnToken` if present).
  - [ ] Inspect `studentContext` vs `teacherContext` in the response — **the only authoritative role signal.**
  - [ ] On a student launch, capture `studentContext.submissionId` — the grade-passback key (persist with `attachmentId`; the pair is the composite key).
  - [ ] Reject (mint nothing) if neither context is present, or the call returns 4xx.
- [ ] **Mint `studentRole: true` ONLY when `studentContext` is populated.** Never infer role from a query param — a teacher who opens the student route must NOT receive a student token.
- [ ] **Pseudonym mint:** HMAC-SHA256 over a canonical student identifier from the validated context (e.g. `submissionId` or the obfuscated user id), using the **same secret `STUDENT_PSEUDONYM_HMAC_SECRET`** as `studentLoginV1`. Deterministic for the same student in the same course.
- [ ] **`orgId` derivation (source must be explicit):** `getAddOnContext` returns no org. Derive `orgId` from the authenticated user's email **domain** → the `/organizations/{orgId}/domains` mapping, mirroring `studentLoginV1`'s domain→org resolution. Read the email transiently from the OAuth userinfo / ID token (the `userinfo.email` scope is requested) and **never persist it** (PII gate). If the domain maps to no org, reject — don't mint a token with an empty `orgId`.
- [ ] **Custom claims (exact shape — must match `studentLoginV1`):**

  ```ts
  { studentRole: true, orgId: <derived>, classIds: [`classroom:${courseId}`] }
  ```

  - `studentRole` is boolean (not string `"true"`)
  - `orgId` non-empty string
  - `classIds` array of non-empty strings

- [ ] **Operational hygiene:**
  - [ ] Rate-limit per-IP. **Note:** neither `studentLoginV1` nor `pinLoginV1` has an explicit rate-limit pattern to copy (verified 2026-05-28) — implement fresh (or consciously defer with a logged justification).
  - [ ] Never log the access token, `studentContext`, or `courseId` at info level. Debug-only, redacted.
- [ ] Export from `functions/src/index.ts`.
- [ ] **Adversarial unit tests (required — all must pass; mock `getAddOnContext`):**
  - [ ] `studentContext` present → custom token with `studentRole: true` returned.
  - [ ] `teacherContext` present on the student path → **no student token minted.**
  - [ ] Neither context present → rejected, no token.
  - [ ] `getAddOnContext` returns 401/403 (bad/expired access token) → rejected.
  - [ ] Missing `courseId`/`itemId` → rejected before any mint.
- [ ] **Do not auto-deploy.** Human deploy gate.

#### Completion criteria

- [ ] All adversarial unit tests pass.
- [ ] Code reviewed by human before deploy.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 1C — Roster `classIds` synthesis

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6 (well-specified utility extension)
- **Owner:** _unassigned_
- **Dependencies:** **1A merged** (so `classroomCourseId` field exists on `ClassRosterMeta`)

#### Steps

- [ ] Edit `deriveTargetsFromRosterList` in [utils/resolveAssignmentTargets.ts:101](../utils/resolveAssignmentTargets.ts). **Decision (pre-made here to remove the ambiguity): `classroomCourseId` stores the RAW Google course id, and the `classroom:` prefix is added AT DERIVATION.** Rationale: the minted student claim is `classIds: ['classroom:${courseId}']` (prefixed), while ClassLink/test classIds are raw — so derivation must namespace ONLY the classroom id. A uniform `.flatMap((r) => [a, b, r.classroomCourseId])` would emit an UNprefixed id that never matches the claim. The current flatmap is at line 111 (`.flatMap((r) => [r.classlinkClassId, r.testClassId])`); replace it with:
  ```ts
  const classIds = Array.from(
    new Set(
      [
        ...rosters.flatMap((r) => [r.classlinkClassId, r.testClassId]),
        ...rosters.map((r) =>
          r.classroomCourseId ? `classroom:${r.classroomCourseId}` : undefined
        ),
      ].filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  ```
- [ ] Note the prefix-placement decision in the Progress Log (so a later agent doesn't "helpfully" move it to roster-creation time and double-prefix).
- [ ] Add tests in `tests/utils/resolveAssignmentTargets.test.ts`:
  - [ ] Roster with only `classroomCourseId` → `classIds: ['classroom:<id>']`.
  - [ ] Roster with both `classlinkClassId` and `classroomCourseId` → both entries.
  - [ ] Two rosters sharing a `classroomCourseId` → de-duped.

#### Completion criteria

- [ ] `pnpm test tests/utils/resolveAssignmentTargets.test.ts` passes.
- [ ] `pnpm run type-check` clean.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log (note the prefix-placement decision).

#### Out of scope

UI for teachers to _create_ a Classroom-sourced roster — that's Phase 2.

---

### Agent 1D — VideoActivity SSO branch — ✅ ALREADY BUILT (verify-only)

- **Status:** ✅ Complete (shipped in unrelated student-auth work before this plan kicked off)
- **Model:** _n/a — no implementation agent needed_
- **Owner:** _n/a_
- **Dependencies:** none

> **Audit correction (2026-05-28):** The original draft described this as the "only authorized runner change" and "NEW." It is **already implemented**, and more completely than this plan envisioned. Re-implementing it would risk regressing the PIN→SSO bridge. The job here is to **verify**, not to build.

#### What already exists (confirmed 2026-05-28)

- **`joinSession` SSO branch** — [hooks/useVideoActivitySession.ts:666](../hooks/useVideoActivitySession.ts). Signature is `joinSession(targetSessionId, studentPin?, classPeriod?)`. **There is no `name` param** (the draft's `(sessionId, pin, name, classPeriod)` is obsolete). Anonymous joiners must supply a PIN; `studentRole` custom-token users skip the PIN gate entirely.
- **PII-free response write** — [line 999](../hooks/useVideoActivitySession.ts). The response doc is keyed by `studentUid: currentUser.uid` and spreads `pin` **only when present** (`...(studentPin ? { pin: studentPin } : {})`). It writes **no `name` field at all** — the design already matches the architectural PII gate.
- **PIN→SSO identity bridge** — [line 740](../hooks/useVideoActivitySession.ts). On a rostered session, an anonymous PIN joiner is upgraded via the `pinLoginV1` callable + `signInWithCustomToken` so their per-session key converges with the SSO key; best-effort, falls through to the legacy anonymous PIN flow on any miss.
- **Shared response-key helper** — `computeResponseKey` at [line 822](../hooks/useVideoActivitySession.ts), shared with the Quiz student app.
- **Student-app UI** — [components/videoActivity/VideoActivityStudentApp.tsx:82](../components/videoActivity/VideoActivityStudentApp.tsx) (`isStudentRole` state), auto-join effect at line 295, skip-PIN render at line 656.

#### Verification steps (do these instead of coding)

- [ ] Run the existing `tests/hooks/useVideoActivitySession.test.ts` suite; confirm it already covers both the PIN flow and the `studentRole` SSO flow (PII-free response doc keyed by uid). If a `classroom:*` class-id case is missing, that gap is covered by **Phase 1A's rules tests**, not by re-touching the runner.
- [ ] Confirm the response doc shape at line 999 still omits `name`. If so, no PII work remains.
- [ ] **Do NOT modify** `useVideoActivitySession.ts` or `VideoActivityStudentApp.tsx` for SSO. Phase 3-va is a thin adapter that drives this existing branch.

#### Completion criteria

- [ ] Existing VA tests pass (PIN + SSO).
- [ ] Response write confirmed PII-free (no `name`).
- [ ] Dashboard row left as ✅; no code diff produced by this "agent."

---

## Phase 2 — Teacher discovery view (depends on Phase 0B install + Phase 1A & 1B merged)

### Agent 2-shell — Teacher route shell

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (defines the panel contract; expensive to revise later)
- **Owner:** _unassigned_
- **Dependencies:** Phase 0B install confirmed, Phase 1A + 1B merged
- **Must merge before:** 2-quiz, 2-va

#### Steps

- [ ] Create `components/classroomAddon/types.ts`:
  ```ts
  export interface ClassroomAddonContext {
    courseId: string;
    teacherUid: string;
    addOnToken: string;
  }
  export interface AddonSelectionPanelProps {
    context: ClassroomAddonContext;
    onAttachmentCreated: (attachmentId: string) => void;
    onCancel: () => void;
  }
  ```
- [ ] Create `components/classroomAddon/TeacherDiscoveryRoute.tsx`:
  - [ ] Read the discovery-iframe query params: `courseId`, `itemId`, `itemType`, **`addOnToken`**, `login_hint`. **No `attachmentId` exists yet** (nothing is created). (Params resolved — see [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28).)
  - [ ] Sign the teacher in via the `login_hint`-seeded OAuth code flow (consent in a popup/new tab — it can't redirect inside the iframe), then validate the launch with a CF (extend `classroomAddonLoginV1` with a teacher mode) that calls **`getAddOnContext`** and returns `{ courseId, teacherUid }` only when `teacherContext` is present. No JWKS.
  - [ ] **Preserve `addOnToken` for the attachment-create call** — it expires, so the create (Phase 2-cf) must happen in this same live session, not deferred.
  - [ ] Render widget-type picker: Quiz, Video Activity. Leave a clear extension point for GL/MiniApp later.
  - [ ] On selection, render the per-widget panel as a child component.
- [ ] Register `/classroom-addon/teacher` route in `App.tsx`. Render OUTSIDE the normal teacher dashboard chrome (no sidebar, no header). Mirror the lazy-load pattern of student routes.

#### Completion criteria

- [ ] Valid launch params → picker renders.
- [ ] Invalid/missing params → clear error state, NOT a redirect to dashboard.
- [ ] No Firebase popup ever fires on this route.
- [ ] `pnpm run type-check` clean.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 2-cf — `createClassroomAttachment` Cloud Function

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (REST integration with transactional idempotency)
- **Owner:** _unassigned_
- **Dependencies:** Phase 1A merged. May be **authored** in parallel with 2-shell, but **end-to-end testing is gated on 2-shell** — the create call needs a live, non-expired `addOnToken` from 2-shell's discovery-iframe session (unit-test against a mocked Classroom client until then).

#### Steps

- [ ] Create new module `functions/src/classroomAttachments.ts`.
- [ ] Implement callable with input:
  ```ts
  {
    addOnToken: string,        // from the LIVE discovery iframe — short-lived
    courseId: string,
    itemId: string,            // the courseWork id (NOT deprecated "postId")
    widgetType: 'quiz' | 'video-activity',
    spartboardAssignmentId: string,
    spartboardSessionId: string,
    itemTitle: string,
    pointsPossible: number,    // → maxPoints; MUST be > 0 for grade passback
  }
  ```
- [ ] **Behavior:**
  - [ ] Authenticate as the **teacher** (live OAuth token with `classroom.addons.teacher`); confirm `teacherContext` via `getAddOnContext`. `addOnToken` is required and **expires**, so this create must run in the live discovery session — not deferred to offline creds.
  - [ ] Build the **THREE** iframe URLs (a single student URL is NOT sufficient — create requires `title` + `teacherViewUri` + `studentViewUri`, and grade passback also requires `studentWorkReviewUri`):
    - `teacherViewUri` → `${origin}/classroom-addon/teacher-view/{spartboardAssignmentId}`
    - `studentViewUri` → `${origin}/classroom-addon/student/{spartboardAssignmentId}?widget={widgetType}`
    - `studentWorkReviewUri` → `${origin}/classroom-addon/review/{spartboardAssignmentId}`
  - [ ] `POST /v1/courses/{courseId}/courseWork/{itemId}/addOnAttachments?addOnToken=…` with body `{ title, teacherViewUri: {uri}, studentViewUri: {uri}, studentWorkReviewUri: {uri}, maxPoints: pointsPossible }`. **`maxPoints` is invalid unless `studentWorkReviewUri` is set; set it >0 so the attachment is the gradebook "Grade sync" attachment.** Only ONE grade-sync attachment per assignment; SpartBoard must be its original creator to grade later.
  - [ ] **Idempotency (transactional):** read the assignment doc in a transaction; if `classroomAttachmentId` is already set, return it without calling Classroom. No server idempotency key exists — `GET …/addOnAttachments` (`list`, scoped to this add-on) is the recovery fallback.
  - [ ] Persist `{ classroomCourseId, classroomItemId, classroomAttachmentId }` on the assignment doc; return `{ attachmentId }`.
- [ ] **Error handling:** `ExpiredAddOnToken`/`InvalidAddOnToken` → ask the teacher to refresh / use the correct Google account; Classroom rejects after the SpartBoard assignment exists → structured error, offer "retry attaching" or "delete orphaned assignment." Do NOT auto-delete.
- [ ] Unit tests: happy path · expired `addOnToken` · Classroom rejects (partial failure) · idempotency (second call returns existing `attachmentId`, no Classroom call) · `maxPoints` set without `studentWorkReviewUri` → caught before the API call.
- [ ] Manual end-to-end against a real Orono Classroom course (Paul's account post-Phase 0B); confirm the assignment shows a point value (grade-sync) in Classroom.

#### Completion criteria

- [ ] Unit tests pass.
- [ ] Manual end-to-end attachment created in real Classroom course.
- [ ] Code reviewed by human before deploy.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 2-quiz — Quiz selection panel

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6 (wiring against existing primitives)
- **Owner:** _unassigned_
- **Dependencies:** 2-shell merged, 2-cf merged

#### Steps

- [ ] Create `components/classroomAddon/QuizSelectionPanel.tsx` implementing `AddonSelectionPanelProps`.
- [ ] Use [hooks/useQuiz.ts:132](../hooks/useQuiz.ts) (`useQuiz`) filtered by `context.teacherUid`.
- [ ] Render `LibraryShell` + `LibraryGrid` (reference [components/widgets/QuizWidget/components/QuizManager.tsx](../components/widgets/QuizWidget/components/QuizManager.tsx)). **Reuse existing primitives — do NOT build custom UI.**
- [ ] On selection, show `AssignModal` for session settings. **Skip `AssignClassPicker`** entirely.
- [ ] On confirm:
  - [ ] Call `createAssignment(quiz, settings, { classIds: ['classroom:' + context.courseId], rosterIds: [] })` from `useQuizAssignments`. **The third argument is an options object** (signature changed since the draft) — passing `classIds`/`rosterIds` positionally will not compile.
  - [ ] **Note:** a 6-character join code WILL be allocated ([useQuizAssignments.ts:681](../hooks/useQuizAssignments.ts)). Accept as harmless. Do not branch the hook.
  - [ ] Call `createClassroomAttachment` with `widgetType: 'quiz'` and the new assignment id.
  - [ ] On success, `props.onAttachmentCreated(attachmentId)`.

#### Completion criteria

- [ ] Local mock against `ClassroomAddonContext` fixtures works.
- [ ] Renders correctly at ~800×600 iframe dimensions.
- [ ] No new custom UI primitives — only existing library components reused.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

#### Out of scope

Creating new quizzes inline. V1 attaches existing library items only.

---

### Agent 2-va — Video Activity selection panel

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6
- **Owner:** _unassigned_
- **Dependencies:** 2-shell merged, 2-cf merged

#### Steps

Identical structure to 2-quiz, with these differences:

- [ ] New file: `components/classroomAddon/VideoActivitySelectionPanel.tsx`.
- [ ] Use `useVideoActivity()` (singular — _not_ `useVideoActivities`).
- [ ] Use `useVideoActivityAssignments`'s `createAssignment` (no join code). **Different calling convention than Quiz:** it stays **positional** — `createAssignment(activity, settings, 'active', ['classroom:' + context.courseId], [], [])` (`initialStatus, classIds, periodNames, rosterIds`). Verify the current arg order against [useVideoActivityAssignments.ts:291](../hooks/useVideoActivityAssignments.ts) before wiring.
- [ ] Pass `widgetType: 'video-activity'` to `createClassroomAttachment`.

#### Completion criteria

Same as 2-quiz.

---

## Phase 3 — Student view (depends on Phases 1D + 2)

### Agent 3-shell — Student route + auth handshake

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (custom-token exchange, security-critical)
- **Owner:** _unassigned_
- **Dependencies:** Phase 2 merged (Phase 1D is already shipped — dependency satisfied)

#### Steps

- [ ] Create `components/classroomAddon/StudentRoute.tsx` at `/classroom-addon/student/:assignmentId`. **Also register the `/classroom-addon/teacher-view/:id` and `/classroom-addon/review/:id` routes** that Phase 2-cf set as `teacherViewUri`/`studentWorkReviewUri` — Classroom validates and embeds all three, so they must at least load (the review route previews student work; can be minimal for V1).
- [ ] Read the student-view query params (`courseId`, `itemId`, `itemType`, `attachmentId`, `login_hint`). **`submissionId` is NOT in the URL** — it comes from `getAddOnContext`.
- [ ] Sign the student into Google via the `login_hint`-seeded OAuth code flow (consent opens in a popup/new tab — it cannot redirect inside the iframe). Plan for partitioned storage: Storage Access API + CHIPS partitioned cookies, and FedCM for GIS, so the Firebase session survives inside the iframe (see [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28)).
- [ ] Call `classroomAddonLoginV1` with the Google access token → it calls `getAddOnContext`, confirms `studentContext`, and returns a Firebase custom token plus the `submissionId`.
- [ ] `signInWithCustomToken`. User now has the `studentRole` claim.
- [ ] Wrap in `<RequireStudentAuth>` ([context/StudentAuthContext.tsx:353](../context/StudentAuthContext.tsx)).
- [ ] Read `widget` query param → which adapter to render.
- [ ] Look up SpartBoard assignment by `assignmentId`; resolve matching session.
- [ ] Persist the **composite grade key `classroomAttachmentId` + `classroomSubmissionId`** (the latter = `getAddOnContext`'s `studentContext.submissionId`) on the response doc — `submissionId` is NOT unique across courses, so store both. Phase 4 reads these to PATCH the grade.
- [ ] Delegate to the existing widget student runner (Quiz: code-based via the assignment's join code; VA: sessionId-based via the already-shipped VA SSO branch).
- [ ] **Critical:** both runners already have a `studentRole` SSO branch ([QuizStudentApp.tsx:133-138](../components/quiz/QuizStudentApp.tsx); [useVideoActivitySession.ts:666](../hooks/useVideoActivitySession.ts)). Do NOT modify either runner here.

#### Completion criteria

- [ ] Valid launch → student OAuth-signs-in → `getAddOnContext` confirms `studentContext` → widget renders.
- [ ] Invalid token → error state, never teacher login screen.
- [ ] Student's Firebase user is non-anonymous with expected claims (verified in dev tools).
- [ ] Response doc keyed by pseudonym UID (no PIN, no `name`/`email`).
- [ ] Response doc carries the composite key `classroomAttachmentId` + `classroomSubmissionId` (the latter from `studentContext.submissionId`).
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 3-quiz — Quiz student adapter

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6 (5-line redirect)
- **Owner:** _unassigned_
- **Dependencies:** 3-shell merged

#### Steps

- [ ] Create `components/classroomAddon/QuizStudentAdapter.tsx`.
- [ ] Resolve `assignmentId → assignment.code` (the unconditionally-allocated join code from Phase 2-quiz).
- [ ] Redirect/render at `/quiz?code=...` with the existing `studentRole` Firebase auth in place.
- [ ] Reference: [hooks/useStudentAssignments.ts:184](../hooks/useStudentAssignments.ts) `openHref` pattern.

#### Completion criteria

- [ ] Adapter ≤ ~30 lines (it's a thin redirect).
- [ ] Nothing inside `components/widgets/QuizWidget/` or `components/quiz/` modified.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 3-va — Video Activity student adapter

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6
- **Owner:** _unassigned_
- **Dependencies:** 3-shell merged (Phase 1D already shipped)

#### Steps

- [ ] Create `components/classroomAddon/VideoActivityStudentAdapter.tsx`.
- [ ] Resolve `assignmentId → sessionId`.
- [ ] Render at `/activity/:sessionId` with `studentRole` Firebase auth in place. The already-shipped SSO branch in `VideoActivityStudentApp.tsx` (skip-PIN auto-join at line 295) handles the rest.

#### Completion criteria

- [ ] Adapter is thin.
- [ ] Nothing inside `components/widgets/VideoActivityWidget/` modified.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

## Phase 3.5 — Copied-assignment resilience (NEW — `copyHistory` relink)

### Agent 3.5 — Detect and relink copied attachments

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (data-integrity logic; getting it wrong cross-wires courses)
- **Owner:** _unassigned_
- **Dependencies:** Phase 2 + Phase 3 merged

> **Why this phase exists (HIGH severity, surfaced by the 2026-05-28 API research):** When a teacher copies a course, assigns to multiple classes, or reuses a post, Classroom **silently re-IDs the attachment** — new `courseId`, new `itemId`, **new `attachmentId`** — with NO callback. SpartBoard docs keyed by the original IDs would point at nothing: the copy renders blank and grades can't pass back. Google's mechanism for recovering is the **`copyHistory`** array on the new `AddOnAttachment`. (See [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28).)

#### Steps

- [ ] On every teacher-view / student-view iframe load, after `getAddOnContext`, compare the launch `courseId`/`itemId`/`attachmentId` against what the resolved SpartBoard assignment has stored.
- [ ] If they don't match, `GET` the `AddOnAttachment` and read its **`copyHistory`** to map the new attachment back to the original SpartBoard assignment.
- [ ] **Lazily relink on first open:** create a fresh SpartBoard assignment + session for the copy (new `classIds: ['classroom:' + newCourseId]`), copying the quiz/VA _content_ but NOT student responses, and store the new `{ classroomCourseId, classroomItemId, classroomAttachmentId }`. Make this idempotent — a second open finds the already-relinked copy.
- [ ] Ensure Phase 4 grade passback targets the **copy's** IDs (the composite `attachmentId` + `submissionId` for that course), never the original's.
- [ ] Tests: copy detected via `copyHistory` → new linked assignment created · second open is idempotent (no duplicate) · grade push for a copied assignment PATCHes the copy's IDs · a non-copied (original) open is untouched.

#### Completion criteria

- [ ] A copied/reused assignment opens correctly for both teacher and student (not blank).
- [ ] Grades for the copy land on the copy's gradebook column, not the original's.
- [ ] Relink is idempotent; no duplicate SpartBoard assignments on repeated opens.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

## Phase 4 — Grade passback (depends on Phase 0.5 + Phase 3)

> **Hard dependency:** Phase 0.5 must be complete — specifically, the existing OAuth grant must carry the Classroom grade-write scope. The refresh-token storage/refresh plumbing ([functions/src/googleOAuth.ts](../functions/src/googleOAuth.ts)) already exists; this phase only needs a valid Classroom-scoped access token from it.

### Agent 4-cf — `pushClassroomGrade` Cloud Function

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (grading semantics, REST, refresh-token use)
- **Owner:** _unassigned_
- **Dependencies:** Phase 0.5 complete, Phase 3 merged. For **copied** assignments, also Phase 3.5 — 4-cf must PATCH the `courseId`/`itemId`/`attachmentId`/`submissionId` that **3.5 resolved for the copy**, never the original's. (For the Day-1 single-quiz MVP, copies are deferred — see [§ Day-1 critical path](#-day-1-critical-path--thinnest-vertical-slice-optimize-for-shortest-time).)

#### Steps

- [ ] Create new module `functions/src/classroomGradePassback.ts`.
- [ ] Implement callable with input:
  ```ts
  {
    classroomCourseId: string,
    classroomItemId: string,        // the courseWork id (NOT "courseWorkId")
    classroomAttachmentId: string,
    classroomSubmissionId: string,
    pointsEarned: number | null,
  }
  ```
- [ ] Auth: run with the **stored offline credentials of the teacher who owns the assignment** (verify ownership against the assignment doc), scope `classroom.addons.teacher`. Offline creds are what let the draft auto-populate without the teacher present (Phase 0.5).
- [ ] Get a live Classroom-scoped access token via the Phase 0.5 helper. On `needs-classroom-consent`, surface "reconnect Classroom gradebook" to the teacher.
- [ ] **Prerequisite:** the student must have opened the student-view iframe so a `submissionId` exists. If `classroomSubmissionId` is missing on the response doc, **skip the push (no-op, not an error)** — there's nothing to grade yet.
- [ ] Call: `PATCH /v1/courses/{classroomCourseId}/courseWork/{classroomItemId}/addOnAttachments/{classroomAttachmentId}/studentSubmissions/{classroomSubmissionId}?updateMask=pointsEarned` with body `{ "pointsEarned": <number> }`.
- [ ] **This sets a DRAFT grade.** With offline teacher creds it auto-populates the gradebook (5–30s). There is **no API to "return"** the grade — returning stays a teacher action in Classroom; the UX (Phase 5) must say "draft grade."
- [ ] Return `{ ok: true, classroomSubmissionId }` or structured error.
- [ ] Unit tests: happy path · teacher doesn't own assignment → rejected · refresh token expired/revoked → structured `needs-classroom-consent` · missing `submissionId` → no-op.
- [ ] Manual end-to-end: complete an activity as a test student; the DRAFT grade auto-appears in the real Classroom gradebook within ~30s via the teacher's stored offline creds.

#### Completion criteria

- [ ] Unit tests pass.
- [ ] Manual end-to-end grade appears in real Classroom gradebook.
- [ ] Code reviewed by human before deploy.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 4-quiz — Quiz submission hook wiring

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6
- **Owner:** _unassigned_
- **Dependencies:** 4-cf merged

#### Steps

- [ ] Edit [hooks/useQuizSession.ts](../hooks/useQuizSession.ts).
- [ ] When student-side `submitQuiz` (or equivalent) completes, check if response doc has `classroomSubmissionId` set.
  - If yes: fire-and-forget `pushClassroomGrade`. Compute `pointsEarned` from existing `gradeAnswer()`.
  - If no: existing behavior unchanged.
- [ ] Don't block submission UI on grade-push. Toast on failure: "Grade saved in SpartBoard but couldn't sync to Classroom — try the Resync button."
- [ ] Add manual "Resync to Classroom" button in teacher's Quiz Results view for failed pushes.
- [ ] **Critical non-disruption:** new code path only fires when `classroomSubmissionId` is present. Existing PIN/SSO flows write no such field; their submission path is byte-identical to today.

#### Completion criteria

- [ ] PIN-joined Quiz submission unchanged (response doc shape and timing identical).
- [ ] ClassLink-SSO Quiz submission unchanged.
- [ ] Classroom-launched Quiz submission triggers grade-push.
- [ ] Resync button works.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 4-va — VA submission hook wiring

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6
- **Owner:** _unassigned_
- **Dependencies:** 4-cf merged

#### Steps

Identical pattern to 4-quiz, against [hooks/useVideoActivitySession.ts](../hooks/useVideoActivitySession.ts). Same non-disruption guarantee.

#### Completion criteria

Same as 4-quiz.

---

## Phase 5 — Polish (sequential, single agent)

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6 (visual iteration)
- **Owner:** _unassigned_
- **Dependencies:** all of Phases 0–4 complete

#### Steps

- [ ] Tighten visual layouts of teacher discovery + student views for Classroom iframe dimensions. Test at 800×600, 1024×768, narrow embed.
- [ ] Add "Published to Classroom" badge on Quiz and VA assignment archive rows when `classroomAttachmentId` is set.
- [ ] Add "Push grades to Classroom" bulk action in Results view for assignments where Phase 4 wiring exists.
- [ ] Suppress / re-label the unused join-code chip on Classroom-attached assignments (pick: hide entirely OR label as "Backup PIN").
- [ ] Make the "Connect to Classroom gradebook" button discoverable in teacher settings + onboarding hint on first add-on attempt without a stored refresh token.
- [ ] **Label Classroom grades as "draft"** wherever SpartBoard shows passback status — make clear the teacher still reviews/returns in Classroom (there is no API to return).
- [ ] **Token-error UX:** friendly handlers for `ExpiredAddOnToken` ("refresh and try again") and `InvalidAddOnToken` ("you appear to be signed into another Google account — switch accounts").
- [ ] **Run Google's official Add-ons Test Plan** on a demo Workspace-for-Education domain (1 teacher + 2 student accounts, same domain), including a copy/reuse pass (Phase 3.5) and a multi-class assign. (PDF linked in [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28).)
- [ ] Help text and onboarding hints for first-time teachers.

#### Completion criteria

- [ ] All visual checks pass at three iframe widths.
- [ ] Badge appears correctly on Classroom-attached assignments only.
- [ ] Bulk-resync action works on a real assignment with multiple responses.
- [ ] Non-disruption smoke (final).
- [ ] Final verification end-to-end ([§ Final verification](#final-verification-before-shipping)).
- [ ] Update Dashboard + Progress Log → 🎉 Plan complete.

---

## ✅ Cross-phase verification gates

Before merging any phase's PR, the implementing agent confirms:

1. [ ] `pnpm run type-check` clean across the whole repo.
2. [ ] `pnpm test` passes including all new tests added in that phase.
3. [ ] `pnpm test tests/rules/` passes if the phase touched `firestore.rules` or referenced types — **AND no previously-passing test starts failing.**
4. [ ] No unintended diff outside files listed for that phase. `git diff --stat main` and visually scan.
5. [ ] **PII gate audit:** `grep -r "email\|displayName\|fullName" components/classroomAddon/` returns empty.
6. [ ] **Non-disruption smoke (mandatory every phase):**
   - [ ] PIN-joined Quiz completes end-to-end.
   - [ ] ClassLink-SSO Quiz from `/my-assignments` completes end-to-end.
   - [ ] PIN-joined VideoActivity completes end-to-end.
7. [ ] **In-progress assignments invariant:** with a live test session in flight (PIN + SSO students mid-quiz), submit a response after the deploy and confirm the write succeeds.
8. [ ] `pnpm run lint` clean (zero errors AND warnings — repo enforces `--max-warnings 0`).
9. [ ] `pnpm run format:check` clean.

---

## 🔒 Final verification before shipping

End-to-end test, in order:

1. [ ] Phase 0B install propagated: SpartBoard appears in a test teacher's Classroom **Add-ons** picker.
2. [ ] Phase 0.5: test teacher clicks "Connect to Classroom gradebook," consent completes, the stored OAuth grant under `/users/{uid}/private/` now includes `classroom.addons.teacher`, doc unreadable from client.
3. [ ] Phase 2: teacher attaches a Quiz from inside Classroom; assignment doc has `classroomCourseId`, `classroomItemId`, `classroomAttachmentId`; the Classroom assignment shows a point value (grade-sync).
4. [ ] Phase 3: a test student (different account) opens the attachment, lands in `/classroom-addon/student/:id`, OAuth-signs-in, `getAddOnContext` returns `studentContext`, completes the quiz. Response doc keyed by pseudonym UID, no `name`/`email`/`pin`, carries `classroomAttachmentId` + `classroomSubmissionId`.
5. [ ] Phase 4: the **draft** grade auto-appears in the Classroom gradebook within ~30s (via the teacher's stored offline creds).
6. [ ] Phase 3.5: copy the assignment to a second class; open it as a student there — it renders (not blank) and its grade lands on the **copy's** column, not the original's.
7. [ ] Repeat 2–6 for Video Activity.
8. [ ] **Non-disruption final check:** PIN-joined Quiz, ClassLink-SSO Quiz, PIN-joined VideoActivity all complete end-to-end on the same deployed build.
9. [ ] **PII gate final audit:** `grep -r "email\|displayName\|fullName" components/classroomAddon/` empty; no Classroom-related Firestore document contains a student name, email, or PIN.

---

## 🚫 What NOT to do

- ❌ Create a new GCP project. Extend the existing Firebase-linked one.
- ❌ **Re-implement the VideoActivity SSO branch.** It already ships (`useVideoActivitySession.ts:666` + `VideoActivityStudentApp.tsx`). Phase 1D is verify-only.
- ❌ **Build a new server-side OAuth code-grant module or a `/users/{uid}/google_oauth/` path.** Refresh-token capture already exists in `functions/src/googleOAuth.ts`, stored encrypted under `/users/{uid}/private/`. Phase 0.5 _extends_ it with grade scopes.
- ❌ Add Google `userId` to any type or Firestore field.
- ❌ Store student names / emails / PINs in Firestore. Drive only, or not at all.
- ❌ Modify Quiz, MiniApp, or GuidedLearning student runners. (The VA SSO branch is already done — do not re-touch it either.)
- ❌ Build a parallel student auth system. `classroomAddonLoginV1` mirrors the existing `pinLoginV1` / `studentLoginV1` claim shape exactly.
- ❌ Verify a "launch JWT" or fetch a JWKS — **there is none** (that's LTI). Trust `getAddOnContext`, never the raw query params.
- ❌ Infer `studentRole` from a query param. Mint it ONLY when `getAddOnContext` returns `studentContext`. (Highest-severity bug class.)
- ❌ Create the attachment from offline/deferred creds. The `addOnToken` **expires** — create live in the discovery iframe session.
- ❌ Set `maxPoints` without `studentWorkReviewUri`, or attach two graded ("grade-sync") attachments to one assignment (only the first counts).
- ❌ Treat `pointsEarned` as a final/returned grade. It's a **draft**; the teacher returns it in the Classroom UI (no API for that).
- ❌ Add a `classroom.coursework.*` scope. Add-on grade passback needs only `classroom.addons.teacher`.
- ❌ Key Classroom data by `submissionId` alone — it is NOT unique across courses; use `attachmentId` + `submissionId`.
- ❌ Pull Classroom rosters via the Classroom REST API. Not needed.
- ❌ Auto-deploy Cloud Functions. Every CF in this plan requires a human deploy gate.
- ❌ Touch MiniApp or GuidedLearning. Out of scope.
- ❌ Set Marketplace SDK App Visibility to "Public." Triggers Marketplace review.
- ❌ Use Console UI when `gcloud`/`firebase` CLI would do. UI clicks are last resort.
- ❌ Remove or branch around the unconditional `allocateJoinCode()` in `useQuizAssignments.createAssignment`. Accept the harmless unused PIN.
- ❌ Migrate or backfill any existing response/assignment/session doc.
- ❌ Tighten any existing Firestore rule or remove any enum value. All schema and rules changes are strictly additive.

---

## 🧰 Quick-start commands

```bash
# Confirm project alignment
gcloud config get-value project
firebase projects:list

# Inspect current state
gcloud services list --enabled | grep -E '(classroom|marketplace|appsmarket)'
cat firebase.json | grep -A 5 "frame-ancestors"

# Inventory existing custom-token / auth minters (model classroomAddonLoginV1 on these)
ls functions/src/
grep -rn "studentLoginV1\|pinLoginV1\|createCustomToken" functions/src/

# Confirm offline OAuth + refresh-token storage ALREADY EXIST (Phase 0.5 extends, not builds)
grep -rn "access_type\|prompt: 'consent'" utils/googleOAuthRefresh.ts
grep -n "exchangeGoogleAuthCode\|refreshGoogleAccessToken\|private/googleAuth" functions/src/googleOAuth.ts

# Confirm the VA SSO branch is ALREADY shipped (Phase 1D = verify-only)
grep -n "isStudentRole\|pinLoginV1\|computeResponseKey" hooks/useVideoActivitySession.ts
grep -n "studentRole" components/videoActivity/VideoActivityStudentApp.tsx

# Verify hooks naming (singular, not plural)
ls hooks/useVideoActiv*.ts

# Read the Quiz SSO branch (reference; do NOT modify either runner)
sed -n '115,170p' components/quiz/QuizStudentApp.tsx
```

---

## Tracking Protocol

**Every AI agent (orchestrator + sub-agents) working on this integration MUST follow these rules.** The whole point of this document is so work can be paused and resumed. If you do not update this file, the next agent has no idea where things stand.

### Before starting any sub-agent work

1. **Read [§ Phase Status Dashboard](#phase-status-dashboard)** to find the agent task you're about to start.
2. **Verify dependencies are satisfied** (the task's "Dependencies" line must all be ✅).
3. **Update the Dashboard row** for your task: status `🟡 In progress`, owner `your-session-id-or-name`, last-update timestamp.
4. **Append a Progress Log entry** announcing what you're starting.

### While working

- **Check off Steps and Completion criteria** as you complete them. Do this _as you go_, not at the end. If you stop mid-task, the partial checkboxes are how the next agent picks up.
- **Append findings to the task's "Notes / handoff" section** for anything the next phase needs to know — design decisions, surprises, blockers you worked around.
- **Use `[VERIFY]` markers** when you fetch info from external docs and cite the source URL.

### When pausing/stopping mid-task

- Set the Dashboard row status back to `🟡 In progress` (it should already be) and update the timestamp.
- Append a Progress Log entry: "**Paused**: <task>, last completed step: <step>, next step: <step>, blockers: <none / list>."

### When completing a task

- Verify all "Completion criteria" boxes are checked.
- Run the [§ Cross-phase verification gates](#cross-phase-verification-gates).
- Update the Dashboard row → ✅ Complete with timestamp.
- Append a Progress Log entry summarizing what shipped + any caveats for downstream phases.
- If your work unblocks downstream agents, mention them by name in the log entry so the orchestrator knows what's now eligible.

### When blocked

- Update the Dashboard row → ⚠️ Blocked.
- Append a Progress Log entry describing the block and what's needed to unblock.
- Surface to Paul (the human owner) before continuing — do not silently work around blockers, especially around grade-write scopes, the `getAddOnContext` auth model, or anything in the [§ What NOT to do](#-what-not-to-do) list.

### Orchestrator (main Claude) responsibilities

- **Spawn sub-agents** with the model specified in the Dashboard.
- **Verify the sub-agent updated this file** before considering its work complete (trust but verify — read the actual file diff).
- **Run the non-disruption smoke** between phases.
- **Surface decisions to Paul** for: any `[VERIFY]` item that resolves differently than the plan assumes; any time a "What NOT to do" item is tempting; any blocker.
- **Final completion:** the orchestrator marks the plan complete only after [§ Final verification](#final-verification-before-shipping) passes end-to-end.

---

## Progress Log

> Append-only. Newest entries first. Each entry: `### YYYY-MM-DD HH:MM — <agent name or "orchestrator"> — <one-line summary>` followed by 2-5 bullet points of detail.

### 2026-05-28 — implementability agent — Cycle-3 verification + Day-1 critical path (no implementation work)

- Ran 3 agents (codebase readiness, concrete call mechanics, fresh-eyes critique). The auth-model / scope / composite-key audit came back **clean** — no JWKS or `coursework.students` residue survived the rewrite.
- Added the **[🏎️ Day-1 critical path & thinnest vertical slice](#-day-1-critical-path--thinnest-vertical-slice-optimize-for-shortest-time)** section: de-risk the partitioned-iframe Firebase session FIRST (popup OAuth → mint token → `signInWithCustomToken` → `getAddOnContext`), hardcode one quiz to skip the panel UI, defer VA + Phase 3.5 + polish. ~2-day MVP vs ~1-week full build.
- Codebase corrections: `functions/` has **no `googleapis` dependency** → call Classroom via raw `fetch` + Bearer (mirror `getDriveHeaders`, index.ts:326); the requested-scope list lives in **two** files (`config/firebase.ts:31` client + `googleOAuth.ts:56` server) — both must be edited; named the concrete connect-Google components for 0.5-ui (`SidebarGoogleDrive.tsx` + `AuthContext.connectGoogleDrive`).
- API correction: `getAddOnContext` returns **`supportsStudentWork`** (not `supportsStudentWorkReview`); `addOnToken` is a request param, not a response field.
- Sequencing fixes: Phase 2 gate is now "0B install **AND** 1A+1B merged"; Phase 4 depends on 3.5 for copied assignments; 2-cf clarified as "author in parallel with 2-shell, e2e-test gated on 2-shell's live `addOnToken`."
- Under-specified steps resolved: 1B `orgId` is derived from the user's email domain → `/organizations/{orgId}/domains` (read transiently, never persisted); 1C pre-decided to store the RAW course id and add the `classroom:` prefix at derivation, with a corrected dedupe snippet.
- Next agent: Phase 0A + the Day-1 de-risk slice.

### 2026-05-28 — API-grounding agent — Verified against live Classroom Add-ons docs; major auth correction (no implementation work)

- Ran 5 parallel research agents against the official Google Classroom Add-ons docs and baked the findings into a new [§ Verified API facts](#-verified-google-classroom-add-ons-api-facts-2026-05-28) block (with citations) that resolves every API-contract `[VERIFY]` (only the Marketplace service-name and CSP-origin runtime confirmations remain).
- **Biggest correction:** Classroom Add-ons do NOT use a signed launch token / JWKS (that's LTI). Auth is `login_hint` → OAuth/GIS → server-side **`getAddOnContext`** (authoritative role via `studentContext`/`teacherContext`; source of `submissionId`). Rewrote Phase 1B (no JWKS), Phase 2-shell, and Phase 3-shell accordingly; updated gates #2 and #7 and the "What NOT to do" list.
- **Grade scope RESOLVED:** `classroom.addons.teacher` (NOT `classroom.coursework.students`). Final scope set is the 5 listed in Verified API facts. Internal/private app is exempt from OAuth verification + CASA; Education Plus supports add-ons.
- **Attachment create corrected:** requires `title` + `teacherViewUri` + `studentViewUri`, plus `studentWorkReviewUri` + non-zero `maxPoints` for grade passback; `addOnToken` expires so create must run live; only one grade-sync attachment; path uses `itemId` not `postId`. Rewrote Phase 2-cf.
- **Grade passback corrected:** `pointsEarned` is a **draft** grade that auto-populates only with **stored offline teacher creds**; endpoint path uses `itemId`; student must have opened the student view first. Rewrote Phase 4-cf and Phase 0.5's rationale.
- **New Phase 3.5** added for the HIGH-severity copy/reuse gotcha (copy re-IDs course/item/attachment with no callback → `copyHistory` relink). Added a Dashboard row + Order-of-Operations + final-verification step.
- Next agent: Phase 0A (Sonnet 4.6) is still the kickoff — unchanged.

### 2026-05-28 — audit agent — Re-scoped to current codebase (no implementation work)

- Verified every file:line reference against current `HEAD`. `functions/src/index.ts` had drifted by ~365–450 lines (`studentLoginV1` 2761 → 3126, token mint 2870 → 3322, HMAC pseudonym 2687 → `computeStudentUid` 3052); hooks and `QuizStudentApp.tsx` also moved. All refs in the reference table + phase steps updated.
- **Two phases are effectively done:** Phase 1D (VA SSO branch) ships in `useVideoActivitySession.ts:666` + `VideoActivityStudentApp.tsx`, including a `pinLoginV1` PIN→SSO bridge and shared `computeResponseKey` — re-scoped to verify-only. Phase 0.5 (server-side OAuth refresh tokens) ships in `functions/src/googleOAuth.ts` (encrypted, stored under `/private/`, locked by rules:559) — re-scoped to "add Classroom grade scope to the existing module"; 0.5-rules marked N/A.
- **Corrected three claims that would have misled an agent:** (1) `ClassRosterMeta.origin` is `'classlink' | 'local'` — it does NOT include `'classroom'` (must be added in 1A); (2) `studentLoginV1` has no rate-limit pattern to reuse (1B implements fresh); (3) `useQuizAssignments.createAssignment` now takes an options **object** (Quiz) while VA stays positional — Phase 2 call sites rewritten.
- New reference rows added: `pinLoginV1` (closest model for 1B), the existing `googleOAuth.ts` refresh pipeline, the token-at-rest lockdown, and the shipped VA SSO branch.
- Revised timeline ~2 weeks (was ~3) since the auth foundation already exists. Confirmed the Classroom-specific surface is still un-started (no `/classroom-addon` route, no `components/classroomAddon/`, no classroom CFs).
- Next agent: Phase 0A (Sonnet 4.6) is still the kickoff — unchanged.

### 2026-04-28 — review agent — Initial plan drafted, no implementation work started

- Verified all architectural claims against the actual codebase. PII model, custom-token shape, class-gate Firestore rules, and library-primitive reuse all align with how the codebase works.
- Surfaced and resolved 3 gaps in the original prompt: OAuth refresh-token storage (now Phase 0.5), VideoActivity SSO branch (now Agent 1D), grade-passback scope verification (still `[VERIFY]`, gated on Phase 0B).
- Resolved decisions with Paul: (1) one-time consent step approved, (2) VA runner change authorized, (3) scope set must be verified before adding.
- Plan written to `docs/classroom-addon-integration-plan.md`. Ready for Phase 0A kickoff.
- Next agent: pick up Phase 0A (Sonnet 4.6) — see [§ Phase 0A — `gcloud`-automatable](#phase-0a--gcloud-automatable).
