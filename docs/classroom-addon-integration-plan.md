# SpartBoard ↔ Google Classroom Add-ons Integration Plan

> **Status tracking document.** Every AI agent (orchestrator + sub-agents) working on this integration MUST update this file as they go. See [§ Tracking Protocol](#tracking-protocol) at the bottom before starting work.

---

## 📌 Current Status — read this first

**Last updated:** 2026-04-28 by review agent (initial draft, no implementation work started)

**Active phase:** _none — awaiting kickoff_

**Active agent(s):** _none_

**Next action for the next agent:** Review [§ Tracking Protocol](#tracking-protocol), then begin Phase 0A (Sonnet 4.6, GCP config). Phase 0A and Phase 1 (most agents) and Phase 0.5 can run in parallel — see [§ Order of Operations](#order-of-operations).

**Blockers / open items:** None.

**Resume instructions if picking up cold:**

1. Read [§ Phase Status Dashboard](#phase-status-dashboard) — find the first `⬜ Not started` or `🟡 In progress` agent task that has all its dependencies satisfied.
2. Read that agent's "Steps" and "Completion criteria" checkboxes — pick up wherever the last checked box left off.
3. Skim the [§ Progress Log](#progress-log) for the last 3–5 entries to understand recent context.
4. Before merging anything, run the [§ Cross-phase verification gates](#cross-phase-verification-gates).

---

## 🗂 Phase Status Dashboard

Status legend: ⬜ Not started · 🟡 In progress · ✅ Complete · ⚠️ Blocked · ⏭ Skipped/N/A

| Phase     | Agent                                   | Model      | Status | Owner (Claude session id or human) | Last update |
| --------- | --------------------------------------- | ---------- | ------ | ---------------------------------- | ----------- |
| 0A        | GCP `gcloud` automation                 | Sonnet 4.6 | ⬜     | —                                  | —           |
| 0B        | Manual Console + Marketplace install    | _(human)_  | ⬜     | —                                  | —           |
| 0.5-cf    | Server-side OAuth code grant CF         | Opus 4.7   | ⬜     | —                                  | —           |
| 0.5-rules | Lock down `/users/{uid}/google_oauth/`  | Opus 4.7   | ⬜     | —                                  | —           |
| 0.5-ui    | "Connect to Classroom gradebook" button | Sonnet 4.6 | ⬜     | —                                  | —           |
| 1A        | Types + Firestore rules + CSP           | Opus 4.7   | ⬜     | —                                  | —           |
| 1B        | `classroomAddonLoginV1` Cloud Function  | Opus 4.7   | ⬜     | —                                  | —           |
| 1C        | Roster `classIds` synthesis             | Sonnet 4.6 | ⬜     | —                                  | —           |
| 1D        | VideoActivity SSO branch                | Opus 4.7   | ⬜     | —                                  | —           |
| 2-shell   | Teacher route + widget-type picker      | Opus 4.7   | ⬜     | —                                  | —           |
| 2-cf      | `createClassroomAttachment` CF          | Opus 4.7   | ⬜     | —                                  | —           |
| 2-quiz    | Quiz selection panel                    | Sonnet 4.6 | ⬜     | —                                  | —           |
| 2-va      | Video Activity selection panel          | Sonnet 4.6 | ⬜     | —                                  | —           |
| 3-shell   | Student route + auth handshake          | Opus 4.7   | ⬜     | —                                  | —           |
| 3-quiz    | Quiz student adapter                    | Sonnet 4.6 | ⬜     | —                                  | —           |
| 3-va      | Video Activity student adapter          | Sonnet 4.6 | ⬜     | —                                  | —           |
| 4-cf      | `pushClassroomGrade` Cloud Function     | Opus 4.7   | ⬜     | —                                  | —           |
| 4-quiz    | Quiz submission hook wiring             | Sonnet 4.6 | ⬜     | —                                  | —           |
| 4-va      | VA submission hook wiring               | Sonnet 4.6 | ⬜     | —                                  | —           |
| 5         | Polish                                  | Sonnet 4.6 | ⬜     | —                                  | —           |

---

## Context

**Goal:** A teacher in Google Classroom clicks "Add → SpartBoard," picks Quiz or Video Activity, selects a library item, and attaches it. Students click the attachment, complete the activity inside the Classroom iframe, and grades flow into Classroom's gradebook automatically.

**Why this approach:** Education Plus is confirmed at Orono and the Workspace OAuth consent screen is configured Internal. SpartBoard ships as a **private app** — installable by the district admin domain-wide, no Marketplace review, no OAuth verification, no CASA. Same deployment pattern as the existing Docs extension at Orono.

**Project context:** The GCP project already exists and is linked to the SpartBoard Firebase project. **Do not create a new project** — extend the existing one. Use `gcloud` and `firebase` CLI in place of Console UI work wherever possible.

**Scope:** Quiz + Video Activity only. Guided Learning and MiniApp are deferred. Paul's longer-term direction is for all four student runners to share the same auth/data foundation; track that as a separate refactor _after_ this integration ships.

**Resolved decisions (from review with Paul, 2026-04-28):**

1. ✅ One-time "Connect SpartBoard to Classroom gradebook" consent step is approved (Phase 0.5).
2. ✅ Lifting the "no widget runners change" restriction _for VideoActivity only_ is approved (Agent 1D mirrors PR #1431). Quiz, MiniApp, GL untouched.
3. 📌 Exact grade-write OAuth scope set must be `[VERIFY]`'d from current Google docs and brought back for written confirmation before any production deploy.

---

## 🚧 Architectural gates (blocking constraints — every phase verifies)

1. **No student PII in Firestore.** Names, PINs, emails live exclusively in Google Drive. The Classroom launch token may carry display names — those must NOT be persisted to Firestore. Already enforced (`ClassRosterMeta` at [types.ts:117](../types.ts) explicitly comments "contains NO student PII"; response docs key by deterministic pseudonym/PIN keys without `name`/`email` fields). Don't regress.

2. **No Google `userId` storage.** Classroom Add-ons use _attachment-scoped student IDs_. SpartBoard never needs to map to Google's domain-wide `userId`. Do not add a Google `userId` field anywhere.

3. **Existing student auth flows must keep working unchanged.** ClassLink SSO (`/my-assignments` → `studentLoginV1`) and anonymous PIN joins must continue to function for the same Quiz and Video Activity sessions. The Classroom Add-on entry is _additive_.

4. **Widget-runner change scope:**
   - **Quiz student runner:** read-only. SSO branch already exists (PR #1431).
   - **Video Activity student runner:** ✅ authorized to modify — Agent 1D adds the `studentRole` SSO branch, mirroring Quiz. Existing PIN-joined students keep working unchanged.
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

7. **API surface uncertainty.** `[VERIFY]` markers throughout indicate fields that may have shifted since training cutoff. Fetch current docs at https://developers.google.com/workspace/classroom/add-ons/reference/rest before implementing. The single highest-stakes verify is the **JWKS URL for launch-token signature verification** — getting this wrong silently lets attackers mint `studentRole` tokens.

---

## 🔍 Reference implementations (verified to exist; study before writing)

| Pattern                                                  | File:Line                                                                                                                                                            | What to learn                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Custom token mint with `studentRole` claims              | [functions/src/index.ts:2761](../functions/src/index.ts) (`studentLoginV1`)                                                                                          | Exact claim shape (line 2870), HMAC pseudonym (line 2687), validation, error responses                                             |
| PII-free claim extraction                                | [context/StudentAuthContext.tsx:100](../context/StudentAuthContext.tsx) (`extractStudentClaims`); `<RequireStudentAuth>` at line 353                                 | What we read vs. ignore from the ID token                                                                                          |
| Class-gate enforcement                                   | [firestore.rules:45](../firestore.rules) (`studentRoleCanAccessClass`), [firestore.rules:76](../firestore.rules) (`passesStudentClassGateList`)                      | Format-agnostic string overlap; safe-default `request.auth.token.get('studentRole', false)`                                        |
| Quiz assignment lifecycle                                | [hooks/useQuizAssignments.ts:75](../hooks/useQuizAssignments.ts) (`createAssignment`)                                                                                | Accepts `(quiz, settings, status?, classIds?, rosterIds?)`; `allocateJoinCode()` is unconditional (line 210); writeBatch atomicity |
| VA assignment lifecycle                                  | [hooks/useVideoActivityAssignments.ts:66](../hooks/useVideoActivityAssignments.ts) (`createAssignment`)                                                              | Same shape, no join code                                                                                                           |
| Quiz library listing                                     | [hooks/useQuiz.ts:59](../hooks/useQuiz.ts) (`useQuiz`)                                                                                                               | `onSnapshot` on `/users/{userId}/quizzes`                                                                                          |
| VA library listing                                       | [hooks/useVideoActivity.ts](../hooks/useVideoActivity.ts) (singular — _not_ `useVideoActivities`)                                                                    | Same pattern as `useQuiz`                                                                                                          |
| Quiz student SSO branch (template for VA Agent 1D)       | [components/quiz/QuizStudentApp.tsx:56-77](../components/quiz/QuizStudentApp.tsx)                                                                                    | `tokenResult.claims?.studentRole === true` skips PIN — PR #1431                                                                    |
| Quiz student-side join                                   | [hooks/useQuizSession.ts:565](../hooks/useQuizSession.ts) (`joinQuizSession(code, pin?, classPeriod?)`)                                                              | Code-based join; `lookupSession(code)` resolves session-by-code                                                                    |
| VA student-side join (target of Agent 1D)                | [hooks/useVideoActivitySession.ts:335](../hooks/useVideoActivitySession.ts) (`joinSession(sessionId, pin, name, classPeriod?)`)                                      | Currently always requires `pin + name`; response-doc write at line 496                                                             |
| Class-ID derivation                                      | [utils/resolveAssignmentTargets.ts:77](../utils/resolveAssignmentTargets.ts) (`deriveTargetsFromRosterList`)                                                         | Flatmaps `classlinkClassId` and `testClassId` into deduped `classIds`                                                              |
| Existing SSO assignment href                             | [hooks/useStudentAssignments.ts:130](../hooks/useStudentAssignments.ts)                                                                                              | `/quiz?code=${encodeURIComponent(code)}` — Classroom adapter mirrors                                                               |
| Tested rules patterns                                    | [tests/rules/studentRoleClassGate.test.ts:495-536](../tests/rules/studentRoleClassGate.test.ts)                                                                      | Auth-fixture pattern; bare-anon-token edge case                                                                                    |
| Existing CSP frame-ancestors                             | [firebase.json:40-46](../firebase.json)                                                                                                                              | `/activity/**` already lists `https://classroom.google.com`                                                                        |
| Current access-token-only OAuth (Phase 0.5 changes here) | [context/AuthContext.tsx:190](../context/AuthContext.tsx), [context/AuthContext.tsx:278](../context/AuthContext.tsx), [config/firebase.ts:31](../config/firebase.ts) | No `access_type: 'offline'`; no refresh tokens stored                                                                              |

---

## 🧭 Order of Operations

```
Phase 0A (gcloud, ~1 hr)  ──┐
Phase 0B (manual Console, ~30 min) ──┘  (sequential within Phase 0)
   │
   ├─ Phase 0.5 (parallel with 0; OAuth refresh tokens)
   │   ├─ 0.5-cf, 0.5-rules ──┐  (parallel)
   │   └─ 0.5-ui ──────────────┘  (after 0.5-cf merge)
   │
   └─ Phase 1 (parallel with 0/0.5)
       ├─ 1A ──┐
       ├─ 1B ──┤  (parallel)
       ├─ 1D ──┤  (parallel)
       └─ 1C ──┘  (after 1A merge)

Phase 2 (after Phase 0B install completes)
   ├─ 2-shell ──┐
   ├─ 2-cf ─────┤  (parallel with 2-shell)
   ├─ 2-quiz ───┤  (after 2-shell merge)
   └─ 2-va ─────┘  (parallel with 2-quiz)

Phase 3 (after 1D + 2 merge)
   ├─ 3-shell ──┐
   ├─ 3-quiz ───┤  (after 3-shell merge)
   └─ 3-va ─────┘  (parallel with 3-quiz)

Phase 4 (after Phase 0.5 + 3)
   ├─ 4-cf ─────┐
   ├─ 4-quiz ───┤  (all parallel)
   └─ 4-va ─────┘

Phase 5 — Polish (sequential, single agent)
```

**Realistic timeline:** Phase 0 same day · Phases 0.5 + 1 in parallel ~2-3 days · Phase 2 ~3-5 days · Phase 3 ~2-3 days · Phase 4 ~2-3 days (gated on 0.5) · Phase 5 ~2-3 days. **Total: ~3 weeks** of code work, end-to-end testable from end of Phase 0.

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
- [ ] Add scopes:
  - [ ] `https://www.googleapis.com/auth/classroom.addons.teacher`
  - [ ] `https://www.googleapis.com/auth/classroom.addons.student`
  - [ ] **`[VERIFY]` and pin the exact grade-write scope set** before adding. Bring the verified list to Paul for written confirmation before adding any scope. (Historically `classroom.coursework.students` has been required; Add-ons-specific path may differ.)
- [ ] **Marketplace SDK → App Configuration:**
  - [ ] App Visibility: **Private** (critical — Public triggers Marketplace review)
  - [ ] Setup URI: `https://<spartboard-domain>/classroom-addon/teacher`
  - [ ] Attachment URI prefixes: `https://<spartboard-domain>/classroom-addon/`
  - [ ] Additional Scopes match the consent screen.
- [ ] **Marketplace SDK → Store Listing:** Application Name, descriptions, 192px icon, screenshot (placeholder OK for private). Click **PUBLISH**.

In **Workspace Admin Console:**

- [ ] As Orono Workspace admin, **Apps → Google Workspace Marketplace apps → Add app → Install for the entire domain**.
- [ ] Confirm install propagated by signing in as a test teacher and verifying SpartBoard appears in Classroom's "Add" menu.

#### Completion criteria

- [ ] Add-on installed and discoverable in Classroom's "Add" menu for at least one test teacher account.
- [ ] Update Phase Status Dashboard row → ✅ Complete with timestamp and the verified grade-write scope set noted in the row's "Last update" cell.
- [ ] Append a Progress Log entry.

---

## Phase 0.5 — Server-side OAuth refresh-token capture (NEW)

> **Why a new phase:** The current OAuth flow ([context/AuthContext.tsx:190](../context/AuthContext.tsx)) only stores 1-hour access tokens in `localStorage` and never requests `access_type: 'offline'`. Without this phase, Phase 4 fails the moment a teacher's session expires (~1 hour). Decision (Paul, 2026-04-28): one-time consent step is acceptable friction.

### Agent 0.5-cf — OAuth code-grant Cloud Function

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (long-lived credential storage; security-critical)
- **Owner:** _unassigned_
- **Dependencies:** Phase 0A complete (so we know the GCP project state)
- **Outputs:** new module `functions/src/classroomGradebookOAuth.ts` exported from `functions/src/index.ts`; helper `getValidClassroomAccessToken(uid)` for Phase 4 reuse.

#### Steps

- [ ] Create new file `functions/src/classroomGradebookOAuth.ts`.
- [ ] Implement callable `connectClassroomGradebookV1`:
  - [ ] Input: `{ authCode: string, redirectUri: string }`
  - [ ] Validate `request.auth.uid` is the teacher; code grant returns claims matching teacher's email.
  - [ ] Exchange `authCode` for `refresh_token` + `access_token` server-side (Google OAuth token endpoint).
  - [ ] Persist `{ refreshToken, accessToken, accessTokenExpiresAt, scopes, connectedAt }` to `/users/{uid}/google_oauth/classroomGradebook`.
  - [ ] Return `{ ok: true, scopes: string[] }` — **never return tokens to the client.**
- [ ] Implement helper `getValidClassroomAccessToken(uid)`:
  - [ ] Read stored refresh token; if `accessTokenExpiresAt` is past, refresh against Google; write the new access token back; return live access token.
  - [ ] Structured error shape on missing/revoked refresh token (Phase 4 surfaces this to user).
- [ ] Export both from `functions/src/index.ts`.
- [ ] Unit tests in `functions/test/` (mirror existing patterns):
  - [ ] Valid code → token persisted.
  - [ ] Invalid code → rejected.
  - [ ] `getValidClassroomAccessToken`: expired access token → refreshed.
  - [ ] `getValidClassroomAccessToken`: missing refresh token → structured error.
- [ ] **Do not auto-deploy.** Stop and request human deploy gate.

#### Completion criteria

- [ ] Unit tests pass.
- [ ] Code reviewed by human before deploy.
- [ ] Non-disruption smoke ([§ Cross-phase verification gates](#cross-phase-verification-gates)).
- [ ] Update Phase Status Dashboard → ✅.
- [ ] Append Progress Log entry.

#### Notes / handoff

_(append findings here)_

---

### Agent 0.5-rules — Lock down `/users/{uid}/google_oauth/`

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (Firestore rules + tokens at rest = security blast radius)
- **Owner:** _unassigned_
- **Dependencies:** can run in parallel with 0.5-cf (no schema dependency)

#### Steps

- [ ] Edit [firestore.rules](../firestore.rules):
  ```
  match /users/{userId}/google_oauth/{doc} {
    allow read, write: if false;  // Functions admin SDK only
  }
  ```
- [ ] Add tests in `tests/rules/` confirming no client read or write succeeds (authenticated owner, anonymous, admin — all denied).
- [ ] Run `pnpm test tests/rules/` and confirm full suite still passes (no previously-passing test breaks).

#### Completion criteria

- [ ] New tests pass; full rules suite still green.
- [ ] `git diff firestore.rules` shows only the new `match` block — no other changes.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 0.5-ui — "Connect to Classroom gradebook" button

- **Status:** ⬜ Not started
- **Model:** Sonnet 4.6 (wiring work)
- **Owner:** _unassigned_
- **Dependencies:** 0.5-cf merged (callable must exist)

#### Steps

- [ ] Add a "Connect to Classroom gradebook" button in admin/teacher settings (suggest: `components/admin/AdminSettings.tsx` or a new sub-tab).
- [ ] Trigger Google OAuth code-grant flow with `access_type=offline&prompt=consent` and the verified Classroom scopes (from Phase 0B).
- [ ] On callback, POST `authCode` to `connectClassroomGradebookV1`.
- [ ] Display connection status: connected/not connected, scopes granted, last connected timestamp.
- [ ] **Critical scoping:** the new flow runs in **parallel to** the existing GIS + Firebase popup auth in `AuthContext.tsx`. It is _not_ a replacement. Verify by:
  - [ ] Sign in as an existing teacher who hasn't clicked the button. Behavior identical to today.
  - [ ] Click the button. Consent prompt appears. Approve. Doc exists in Firestore. Doc unreadable from client SDK (verify via dev-tools eval).

#### Completion criteria

- [ ] Existing teacher sign-in unchanged for users who don't click the button.
- [ ] Button consent flow completes successfully.
- [ ] Refresh token persisted; client cannot read it.
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
  - [ ] **Verify** `ClassRosterMeta.origin` already includes `'classroom'` ([types.ts:117](../types.ts)) — no enum change needed. If you find yourself "adding `'classroom'`," stop — it's already there.
- [ ] **`firestore.rules`:**
  - [ ] Read [firestore.rules:45](../firestore.rules) and [firestore.rules:76](../firestore.rules); confirm `passesStudentClassGate*` does format-agnostic matching. **Do not rewrite the helpers.**
  - [ ] If you find yourself rewriting any helper, stop and re-read this section.
- [ ] **`firebase.json`** — append a parallel block for `/classroom-addon/**` mirroring the existing `/activity/**` host list at [firebase.json:40](../firebase.json):

  ```json
  {
    "source": "/classroom-addon/**",
    "headers": [
      {
        "key": "Content-Security-Policy",
        "value": "frame-ancestors 'self' https://*.instructure.com https://*.schoology.com https://classroom.google.com"
      }
    ]
  }
  ```

  - [ ] `[VERIFY]` whether Classroom Add-on iframes come from additional `*.google.com` subdomains (e.g., `addons.gstatic.com`) and append as needed.

- [ ] **Tests** in [tests/rules/studentRoleClassGate.test.ts](../tests/rules/studentRoleClassGate.test.ts):
  - [ ] Add: `studentRole` user with `classIds: ['classroom:abc123']` claim can read/write a session targeted at `classIds: ['classroom:abc123']`.
  - [ ] Add: same user is denied for `classIds: ['classroom:other']`.
  - [ ] Cover both `quiz_sessions` and `video_activity_sessions`.
  - [ ] Mirror the bare-anon-token edge case at lines 495–536.

#### Completion criteria

- [ ] `pnpm run type-check` clean.
- [ ] `pnpm test tests/rules/` passes including new cases AND every previously-passing test still passes.
- [ ] `git diff types.ts` shows only `?:` field _additions_ — no renames, no required-field additions, no enum changes.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

### Agent 1B — `classroomAddonLoginV1` Cloud Function

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (JWT verify, custom-token mint, security-critical)
- **Owner:** _unassigned_
- **Dependencies:** none (independent of 1A)

#### Steps

- [ ] Create new module `functions/src/classroomAddonAuth.ts`. Model on `studentLoginV1` at [functions/src/index.ts:2761](../functions/src/index.ts).
- [ ] **Input:** Classroom Add-on launch token (`login_hint`, `addOnToken` query params). `[VERIFY]` exact param shape against current docs.
- [ ] **JWT validation against Google's published JWKS for Classroom add-ons** — **highest-stakes step.**
  - [ ] `[VERIFY]` the JWKS URL.
  - [ ] Verify signature.
  - [ ] Verify audience matches SpartBoard's registered Classroom add-on client.
  - [ ] Verify expiry.
- [ ] **Claim extraction from validated JWT:**
  - [ ] `courseId` (Classroom course id)
  - [ ] Attachment-scoped student identifier (NOT domain-wide `userId`)
  - [ ] `attachmentId` if launch is from an existing attachment
- [ ] **Pseudonym mint:** HMAC-SHA256 of canonical input, same secret as `studentLoginV1`. Deterministic for the same student in the same course.
- [ ] **Custom claims (exact shape — must match `studentLoginV1`):**

  ```ts
  { studentRole: true, orgId: <derived>, classIds: [`classroom:${courseId}`] }
  ```

  - `studentRole` is boolean (not string `"true"`)
  - `orgId` non-empty string
  - `classIds` array of non-empty strings

- [ ] **Operational hygiene:**
  - [ ] Rate-limit per-IP (reuse `studentLoginV1`'s pattern if any).
  - [ ] Never log raw JWT, studentInfo, or courseId at info level. Debug-only, redacted.
- [ ] Export from `functions/src/index.ts`.
- [ ] **Adversarial unit tests (required — all must pass):**
  - [ ] Valid JWT → custom token returned.
  - [ ] Invalid signature → 401, no token minted.
  - [ ] Expired token → 401.
  - [ ] Wrong audience → 401.
  - [ ] Missing required claims → 401.
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

- [ ] Edit [utils/resolveAssignmentTargets.ts:77](../utils/resolveAssignmentTargets.ts) — extend the flatmap:
  ```ts
  .flatMap((r) => [r.classlinkClassId, r.testClassId, r.classroomCourseId])
  ```
- [ ] **Decide and document** where the `classroom:` prefix is added — at roster creation (preferred — Firestore field stores namespaced id) or at derivation. Document the choice in this file's Progress Log.
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

### Agent 1D — VideoActivity SSO branch (NEW)

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (PII-aware response-doc write — getting the conditional wrong leaks names)
- **Owner:** _unassigned_
- **Dependencies:** none (parallel with 1A/1B)

> **Authorization:** This is the **only** widget-runner change authorized by this plan. Quiz, MiniApp, GuidedLearning runners stay untouched.

#### Steps

- [ ] **Lock-in regression test FIRST** (before any code changes):
  - [ ] In `tests/hooks/useVideoActivitySession.test.ts`, write a test that exercises the existing PIN flow and asserts the response doc contains `pin` and `name` fields with their current values.
  - [ ] Run it; it must pass against the unmodified code. This locks in the existing shape so regressions surface immediately.
- [ ] **Edit [hooks/useVideoActivitySession.ts](../hooks/useVideoActivitySession.ts):**
  - [ ] Add `isStudentRole` detection mirroring [hooks/useQuizSession.ts:72-77](../hooks/useQuizSession.ts):
    ```ts
    const isStudentRole =
      !auth.currentUser?.isAnonymous &&
      (await auth.currentUser?.getIdTokenResult()).claims?.studentRole === true;
    ```
  - [ ] Branch [line 496](../hooks/useVideoActivitySession.ts) response-doc write:
    - **For SSO callers (`isStudentRole === true`):** key the response doc by `auth.currentUser.uid` (pseudonym from `classroomAddonLoginV1`); write the response doc **without** `pin` or `name` fields.
    - **For existing PIN callers:** behavior unchanged. `pin` and `name` still written exactly as today.
  - [ ] **Branching must be on `studentRole === true`, never on absence of PIN.**
- [ ] **Edit [components/videoActivity/VideoActivityStudentApp.tsx](../components/videoActivity/VideoActivityStudentApp.tsx):**
  - [ ] Use [components/quiz/QuizStudentApp.tsx:56-77](../components/quiz/QuizStudentApp.tsx) as the template.
  - [ ] If `studentRole === true`: skip PIN/name entry, auto-join.
  - [ ] PIN-joined fallback unchanged.
- [ ] **Add SSO-flow test** to `tests/hooks/useVideoActivitySession.test.ts`:
  - [ ] `studentRole: true` joiner with no PIN/name; assert response doc exists, keyed by uid, with no `pin`/`name` fields.
- [ ] **Add rules test** in [tests/rules/studentRoleClassGate.test.ts](../tests/rules/studentRoleClassGate.test.ts):
  - [ ] Extend `video_activity_sessions` cases to mirror existing `quiz_sessions` SSO pattern with `classroom:*` class ids.

#### Completion criteria

- [ ] Lock-in regression test passes (PIN flow shape preserved).
- [ ] New SSO test passes.
- [ ] Rules test passes.
- [ ] **Manual smoke (mandatory):** PIN-joined VA still works end-to-end.
- [ ] **Manual smoke:** SSO branch exercised by minting a fake `studentRole` token via `firebase-admin` in a test script (no Classroom dependency required).
- [ ] Non-disruption smoke for Quiz flows.
- [ ] Update Dashboard + Progress Log.

---

## Phase 2 — Teacher discovery view (depends on Phase 0B install)

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
  - [ ] Read launch token from URL query params (`login_hint`, `addOnToken`, `courseId`, `itemId`, `itemType` — `[VERIFY]`).
  - [ ] Call a small CF (or extend `classroomAddonLoginV1` with a teacher mode) to validate the launch and return `{ courseId, teacherUid }`. Reuse 1B's JWKS-verify code.
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
- **Dependencies:** Phase 1A merged; can run parallel to 2-shell

#### Steps

- [ ] Create new module `functions/src/classroomAttachments.ts`.
- [ ] Implement callable with input:
  ```ts
  {
    addOnToken: string,
    widgetType: 'quiz' | 'video-activity',
    spartboardAssignmentId: string,
    spartboardSessionId: string,
    itemTitle: string,
    pointsPossible: number | null,
  }
  ```
- [ ] **Behavior:**
  - [ ] Validate `addOnToken`. Extract `courseId`, `itemId`, `teacherUid`.
  - [ ] Build student URL: `${origin}/classroom-addon/student/{spartboardAssignmentId}?widget={widgetType}`.
  - [ ] Call Classroom REST: `POST /v1/courses/{courseId}/courseWork/{itemId}/addOnAttachments`. `[VERIFY]` exact endpoint and payload.
  - [ ] **Idempotency (must be transactional):** Firestore transaction reads the assignment doc; if `classroomAttachmentId` is already set, return it without calling Classroom; otherwise call Classroom and atomically write the result. Prevents double-click duplicates.
  - [ ] Return `{ attachmentId }`.
- [ ] **Error handling:** Classroom rejects after SpartBoard already created the assignment → return structured error; client offers "retry attaching" or "delete orphaned assignment." Do NOT auto-delete.
- [ ] Unit tests:
  - [ ] Happy path.
  - [ ] Partial-failure path (Classroom rejects).
  - [ ] Idempotency (same `spartboardAssignmentId` twice → returns existing `attachmentId`, does not call Classroom).
- [ ] Manual end-to-end against a real Orono Classroom course (Paul's account is sufficient post-Phase 0B).

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
- [ ] Use [hooks/useQuiz.ts:59](../hooks/useQuiz.ts) (`useQuiz`) filtered by `context.teacherUid`.
- [ ] Render `LibraryShell` + `LibraryGrid` (reference [components/widgets/QuizWidget/components/QuizManager.tsx](../components/widgets/QuizWidget/components/QuizManager.tsx)). **Reuse existing primitives — do NOT build custom UI.**
- [ ] On selection, show `AssignModal` for session settings. **Skip `AssignClassPicker`** entirely.
- [ ] On confirm:
  - [ ] Call `createAssignment` from `useQuizAssignments` with `classIds: [\`classroom:${context.courseId}\`]`and empty`rosterIds`.
  - [ ] **Note:** a 6-character join code WILL be allocated ([line 210](../hooks/useQuizAssignments.ts)). Accept as harmless. Do not branch the hook.
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
- [ ] Use `useVideoActivityAssignments`'s `createAssignment` (no join code).
- [ ] Pass `widgetType: 'video-activity'` to `createClassroomAttachment`.

#### Completion criteria

Same as 2-quiz.

---

## Phase 3 — Student view (depends on Phases 1D + 2)

### Agent 3-shell — Student route + auth handshake

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (custom-token exchange, security-critical)
- **Owner:** _unassigned_
- **Dependencies:** Phase 2 merged, Phase 1D merged

#### Steps

- [ ] Create `components/classroomAddon/StudentRoute.tsx` at `/classroom-addon/student/:assignmentId`.
- [ ] Read launch token from URL query params.
- [ ] Call `classroomAddonLoginV1` with the launch token → Firebase custom token.
- [ ] `signInWithCustomToken`. User now has `studentRole` claim.
- [ ] Wrap in `<RequireStudentAuth>` ([context/StudentAuthContext.tsx:353](../context/StudentAuthContext.tsx)).
- [ ] Read `widget` query param → which adapter to render.
- [ ] Look up SpartBoard assignment by `assignmentId`; resolve matching session.
- [ ] Capture attachment-scoped student id and `submissionId` from launch context (via `getAddOnContext` — `[VERIFY]` exact response field names). These flow into the response doc when written so Phase 4 has its grade-passback keys.
- [ ] Delegate to existing widget student runner (Quiz: code-based via the assignment's join code; VA: sessionId-based via 1D's SSO branch).
- [ ] **Critical:** Quiz student runner needs no changes (PR #1431). VA student runner has 1D's SSO branch. Do NOT modify either runner here.

#### Completion criteria

- [ ] Valid launch token → student signs in → widget renders.
- [ ] Invalid token → error state, never teacher login screen.
- [ ] Student's Firebase user is non-anonymous with expected claims (verified in dev tools).
- [ ] Response doc keyed by pseudonym UID (no PIN, no `name`/`email`).
- [ ] Response doc carries `classroomSubmissionId` and `classroomAttachmentStudentId` (or canonical names per `getAddOnContext`).
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
- [ ] Reference: [hooks/useStudentAssignments.ts:130](../hooks/useStudentAssignments.ts) `openHref` pattern.

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
- **Dependencies:** 3-shell merged, 1D merged

#### Steps

- [ ] Create `components/classroomAddon/VideoActivityStudentAdapter.tsx`.
- [ ] Resolve `assignmentId → sessionId`.
- [ ] Render at `/activity/:sessionId` with `studentRole` Firebase auth in place. The 1D-added SSO branch in `VideoActivityStudentApp.tsx` skips PIN/name entry.

#### Completion criteria

- [ ] Adapter is thin.
- [ ] Nothing inside `components/widgets/VideoActivityWidget/` modified.
- [ ] Non-disruption smoke.
- [ ] Update Dashboard + Progress Log.

---

## Phase 4 — Grade passback (depends on Phase 0.5 + Phase 3)

> **Hard dependency:** Phase 0.5 must be complete. Without stored refresh tokens, this phase cannot work.

### Agent 4-cf — `pushClassroomGrade` Cloud Function

- **Status:** ⬜ Not started
- **Model:** Opus 4.7 (grading semantics, REST, refresh-token use)
- **Owner:** _unassigned_
- **Dependencies:** Phase 0.5 complete, Phase 3 merged

#### Steps

- [ ] Create new module `functions/src/classroomGradePassback.ts`.
- [ ] Implement callable with input:
  ```ts
  {
    classroomCourseId: string,
    classroomCourseWorkId: string,
    classroomAttachmentId: string,
    classroomSubmissionId: string,
    pointsEarned: number | null,
  }
  ```
- [ ] Auth: caller is the teacher who owns the assignment (verify against assignment doc).
- [ ] Use `getValidClassroomAccessToken(uid)` from Phase 0.5.
- [ ] Call: `PATCH /v1/courses/{courseId}/courseWork/{courseWorkId}/addOnAttachments/{attachmentId}/studentSubmissions/{submissionId}` with `pointsEarned` in body. `[VERIFY]` exact endpoint.
- [ ] Return `{ ok: true, classroomSubmissionId }` or structured error.
- [ ] Unit tests:
  - [ ] Happy path.
  - [ ] "Teacher doesn't own assignment" → rejected.
  - [ ] Refresh-token expired/revoked → structured error pointing teacher to re-connect.
- [ ] Manual end-to-end: complete an activity as a test student, grade appears in Classroom gradebook within 30 seconds (Google's stated upper bound).

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

1. [ ] Phase 0B install propagated: SpartBoard appears in test teacher's Classroom Add menu.
2. [ ] Phase 0.5: test teacher clicks "Connect to Classroom gradebook," consent flow completes, refresh token persisted in `/users/{uid}/google_oauth/classroomGradebook`, doc unreadable from client.
3. [ ] Phase 2: teacher creates a Quiz attachment from inside Classroom; assignment doc has `classroomCourseId` and `classroomAttachmentId` set.
4. [ ] Phase 3: test student (different account) clicks attachment, lands in `/classroom-addon/student/:id`, signs in with custom token, completes the quiz. Response doc keyed by pseudonym UID, no `name`/`email`/`pin` fields, carries `classroomSubmissionId`.
5. [ ] Phase 4: grade appears in Classroom gradebook within 30 seconds.
6. [ ] Repeat 2–5 for Video Activity.
7. [ ] **Non-disruption final check:** PIN-joined Quiz, ClassLink-SSO Quiz, PIN-joined VideoActivity all complete end-to-end on the same deployed build.
8. [ ] **PII gate final audit:** `grep -r "email\|displayName\|fullName" components/classroomAddon/` empty; no Classroom-related Firestore document contains a student name, email, or PIN.

---

## 🚫 What NOT to do

- ❌ Create a new GCP project. Extend the existing Firebase-linked one.
- ❌ Add Google `userId` to any type or Firestore field.
- ❌ Store student names / emails / PINs in Firestore. Drive only, or not at all.
- ❌ Modify Quiz, MiniApp, or GuidedLearning student runners. The single authorized runner change is the VA SSO branch (Agent 1D).
- ❌ Build a parallel student auth system. `classroomAddonLoginV1` mirrors `studentLoginV1`'s claim shape exactly.
- ❌ Skip JWKS signature verification on launch tokens. Highest-severity bug class.
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

# Inventory existing custom-token / auth references
ls functions/src/
grep -l "studentLoginV1\|customToken" functions/src/

# Confirm OAuth flow currently has no offline-access (Phase 0.5 changes this)
grep -r "access_type\|prompt:\s*'consent'" config/ context/

# Verify hooks naming (singular, not plural)
ls hooks/useVideoActiv*.ts

# Read the Quiz SSO template you'll mirror for VA in Agent 1D
sed -n '50,100p' components/quiz/QuizStudentApp.tsx
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
- Surface to Paul (the human owner) before continuing — do not silently work around blockers, especially around grade-write scopes, JWKS verification, or anything in the [§ What NOT to do](#-what-not-to-do) list.

### Orchestrator (main Claude) responsibilities

- **Spawn sub-agents** with the model specified in the Dashboard.
- **Verify the sub-agent updated this file** before considering its work complete (trust but verify — read the actual file diff).
- **Run the non-disruption smoke** between phases.
- **Surface decisions to Paul** for: any `[VERIFY]` item that resolves differently than the plan assumes; any time a "What NOT to do" item is tempting; any blocker.
- **Final completion:** the orchestrator marks the plan complete only after [§ Final verification](#final-verification-before-shipping) passes end-to-end.

---

## Progress Log

> Append-only. Newest entries first. Each entry: `### YYYY-MM-DD HH:MM — <agent name or "orchestrator"> — <one-line summary>` followed by 2-5 bullet points of detail.

### 2026-04-28 — review agent — Initial plan drafted, no implementation work started

- Verified all architectural claims against the actual codebase. PII model, custom-token shape, class-gate Firestore rules, and library-primitive reuse all align with how the codebase works.
- Surfaced and resolved 3 gaps in the original prompt: OAuth refresh-token storage (now Phase 0.5), VideoActivity SSO branch (now Agent 1D), grade-passback scope verification (still `[VERIFY]`, gated on Phase 0B).
- Resolved decisions with Paul: (1) one-time consent step approved, (2) VA runner change authorized, (3) scope set must be verified before adding.
- Plan written to `docs/classroom-addon-integration-plan.md`. Ready for Phase 0A kickoff.
- Next agent: pick up Phase 0A (Sonnet 4.6) — see [§ Phase 0A — `gcloud`-automatable](#phase-0a--gcloud-automatable).
