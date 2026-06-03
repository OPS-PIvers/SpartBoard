# Schoology LTI — Morning Test Runbook (Spike 0 + Spike 1)

**For:** Paul, 2026-06-03 AM. **Branch:** `feat/schoology-lti` (commits through `72751cfa`).
**Everything below is deployed to prod** (`spartboard.web.app`). The app is private +
installed to your test course only, so blast radius is contained.

---

## TL;DR — what to test, in order

1. **Spike 0 (should already pass):** Add Materials → SpartBoard in the test course → you see a
   **"✅ Launch validated"** card (or the picker — see step 2). That proves the OIDC + JWT + cookieless
   handshake live.
2. **Spike 1 — attach:** the same click now opens a **quiz picker**. Sign in, pick a quiz, "Add quiz to
   Schoology." The picker returns you to Schoology and the material should appear as a graded item.
3. **Spike 1 — student:** open the material as your **test student** → it should load the quiz and let
   them take it (no PIN — SSO auto-join).

**If any step misbehaves, don't debug it — just tell me the step + the on-screen message, and I'll pull
the function logs and diagnose.** Tonight proved every Schoology-facing assumption needs a live look.

---

## What's deployed and working (verified)

- **Spike 0 launch pipeline** — verified live last night (the `[ltiLaunch] validated` log fired). The
  three bugs we found (deployment_id format, undefined Firestore write) are fixed. `deployment_id` is
  now correctly `8409082949-1527876651` (the FULL Configure-screen string) and the check is strict again.
- **Functions** (all unit-tested, 36 tests): JWT validation, cookieless state store, the tool JWT
  signer, the AGS client (token + score POST), the deep-link response builder, and the two service
  callables. The crypto/AGS logic is verified against a synthetic platform.

## What is NOT yet verified (needs YOUR live test tomorrow)

These are the Schoology-facing pieces no unit test can cover:

1. **Schoology accepting the deep-link response** (the signed JWT we POST back). Format/signing is
   spec-correct and our JWKS is public, but Schoology's acceptance is unconfirmed.
2. **Custom params replaying on the student launch** — we put `quiz_code` in the content item's
   `custom` map (the documented way); confirming Schoology replays it is a live check.
3. **The student class-gate + quiz join** — the student's token and the quiz session both carry
   `schoology:<contextId>`; confirming they match end-to-end needs a real student.
4. **Grade passback** — the grader UI is now built behind a flag (`LTI_GRADER_ENABLED`, off).
   Testable once attach+take works — see "Grade passback" below.

---

## The test sequence (detailed) + expected results

### Step 1 — Teacher attach (Add Materials → SpartBoard)

- **Expected:** the iframe shows **"Add a SpartBoard quiz"** with a "Sign in to SpartBoard" button.
- Sign in with your Google account → your quiz library loads in a dropdown.
- Pick a quiz → **"Add quiz to Schoology"**.
- **Expected:** brief "Creating the assignment…" → "Returning to Schoology…" → the iframe navigates
  back and the material appears in the course as a **graded** item (a gradebook column is created with
  the quiz's total points).

### Step 2 — Student takes it

- As the **test student**, open the material.
- **Expected:** after a moment it loads the **quiz** directly (no PIN) and the student can answer.
- Submit a couple of answers so there's data to grade later.

### Step 3 — (Optional) Instructor re-open

- Re-open the same material as the **teacher** (not via Add Materials — open the existing item).
- **Expected for now:** the **"✅ Launch validated"** card (role: teacher). The in-iframe grader +
  "push grades" button is Phase D (not built yet).

---

## Failure-mode quick reference (tell me the symptom; I'll pull the matching log)

| Symptom on screen                                             | Likely cause                                                                        | I'll check                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Teacher click shows "Launch validation failed"                | a JWT claim changed / config cache                                                  | `functions:log --only ltiLaunch`                                                                   |
| "This launch is not a deep-linking request"                   | launch wasn't a DL request (wrong placement)                                        | the `messageType` in ltiLaunch log                                                                 |
| Picker loads, Google sign-in fails/blank                      | GIS/auth inside the iframe                                                          | browser console + auth domain                                                                      |
| Signed in, **no quizzes** in the dropdown                     | quiz library load / account mismatch                                                | which Google account; useQuiz                                                                      |
| "Add quiz" → "Invalid quiz code"                              | join code didn't match `[A-Za-z0-9]{1,16}`                                          | the generated code format                                                                          |
| "Add quiz" → returns but **no material appears** in Schoology | **Schoology rejected the deep-link response** (risk #1)                             | `functions:log --only ltiSignDeepLinkResponseV1`; the signed JWT claims (aud/iss/content_item url) |
| Student opens → "Launch validation failed"                    | JWT path (should match teacher)                                                     | `functions:log --only ltiLaunch`                                                                   |
| Student opens → card instead of quiz, or "can't join"         | **custom `quiz_code` didn't replay** (risk #2) OR **class-gate mismatch** (risk #3) | `claims.custom` in ltiLaunch log; session vs token `classIds`                                      |

**The single most likely surprise** is the "no material appears" row — Schoology's acceptance of our
deep-link response. If that's where it breaks, it's a focused fix (likely the content-item `url` or an
`aud`/`iss` nuance), and the `ltiSignDeepLinkResponseV1` log + the signed JWT will tell me exactly what.

---

## Grade passback — Phase D, built behind a flag

The full grade-push path is now built (`LTI_GRADER_ENABLED` in `config/constants.ts`, default **off**):
an instructor opens the already-attached quiz → an in-iframe grader loads the responses → "Push grades
to Schoology" writes the auto-graded scores via AGS. It resolves each student's OWN line item, so
merged/linked sections each get their own gradebook column.

**Test it ONLY after Steps 1–2 above pass** (attach + take must work first). To enable:

1. Flip `LTI_GRADER_ENABLED = true` and redeploy hosting — **tell me and I'll do it** (one-line change).
2. As the **teacher**, open the attached quiz (open the existing item, not via Add Materials) → the
   grader appears → **Push grades to Schoology** → confirm scores land in the gradebook.
3. **Merged/linked sections (the Orono case):** run it on a course with students in 2+ linked sections
   and confirm EACH section's gradebook gets the scores. This is **Gate C** — the real go/no-go test.

If the push fails: `functions:log --only ltiPushGradesForAssignmentV1` shows the per-student `results[]`
(ok/skipped/failed + reason) and the AGS HTTP status — pinpointing token vs. line-item vs.
Schoology-acceptance. Written-response manual grading is deferred (auto-graded scores only for now).

---

## Reference

- **Config:** `admin_settings/lti_config` = `{ clientId: 8409082949, deploymentId: 8409082949-1527876651, issuer: https://schoology.schoology.com }`.
- **Endpoints:** `/lti/login`, `/lti/launch` (functions via hosting rewrite), `/.well-known/jwks.json`,
  `/lti/student`, `/lti/teacher` (SPA).
- **Logs:** `firebase functions:log --only <fn> -n 30 --project spartboard`
  (functions: `ltiLogin`, `ltiLaunch`, `ltiExchange`, `ltiSignDeepLinkResponseV1`,
  `ltiPushGradesForAssignmentV1`).
- **Deploy gotcha:** always `pnpm -C functions build` (real tsc) before `firebase deploy` — discovery
  reads compiled `lib/`.
- **Branch:** `feat/schoology-lti` is committed locally + deployed to prod; **not pushed to origin** yet
  (deploys went straight to prod for the spike, per the agreed plan).
