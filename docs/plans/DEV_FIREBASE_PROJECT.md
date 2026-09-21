# Dev Firebase project (`spartboard-dev`)

Status: decided 2026-09-21. Step 1 done: project `spartboard-dev` (number 258543092004) and web app `1:258543092004:web:63b9aa080a08cd83c973b1` created. Waiting on step 2 (billing).

## Problem

Every push to `dev-*` runs `firebase-dev-deploy.yml`, which deploys Firestore rules, indexes, Storage
rules and **all Cloud Functions** to the production project `spartboard`. Only hosting goes to a
preview channel. Every dev merge therefore has to be written so the production client built from
`main` keeps working (additive rules, behaviour changes gated on a marker only the new client writes).

## Target

| Branch  | Project          | Deploys                                                    | URL                            |
| ------- | ---------------- | ---------------------------------------------------------- | ------------------------------ |
| `dev-*` | `spartboard-dev` | hosting (live channel), rules, indexes, functions, storage | https://spartboard-dev.web.app |
| `main`  | `spartboard`     | unchanged                                                  | https://spartboard.web.app     |

Production changes only when `main` moves. The one constraint that remains: at a `main` release,
rules and function changes must still tolerate a teacher's already-open tab running the previous
client until it refreshes.

## Decisions

| #   | Decision                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Project ID `spartboard-dev`, in the district GCP org `63276922281`, same as prod.                                                                                                                                                                  |
| D2  | Firestore `(default)` in `us-central1`, matching prod. Functions stay in `us-central1`.                                                                                                                                                            |
| D3  | Dev data = config copied from prod (admins, feature permissions, admin settings, standards, buildings) plus generated fake classes and students. No real student data ever enters dev.                                                             |
| D4  | Drive: dev's frontend reuses prod's Google OAuth client (`VITE_GOOGLE_CLIENT_ID`) and the same `GOOGLE_OAUTH_CLIENT_ID/SECRET` function secrets, because `drive.file` access is scoped per OAuth client. Dev origins are added to that client.     |
| D5  | Firebase Auth Google sign-in in dev uses the dev project's own auto-created web client, consent screen type Internal. Anonymous auth enabled for students.                                                                                         |
| D6  | AI stays on Vertex via ADC, billed to the dev project. Paul sets a monthly budget alert. No Gemini API key path.                                                                                                                                   |
| D7  | ClassLink: mock rosters only. No ClassLink dev registration until needed; nightly sync kill switch stays off in dev. `CLASSLINK_*` and `SPOTIFY_*` secrets get placeholder values so functions deploy. Spotify and LTI dev registrations deferred. |
| D8  | CI authenticates to dev with keyless Workload Identity Federation (GitHub OIDC). Prod keeps `FIREBASE_SERVICE_ACCOUNT` for now.                                                                                                                    |
| D9  | `dev-*` deploys to the dev project's live hosting channel; no preview channels. Only Paul uses dev builds.                                                                                                                                         |
| D10 | Dev web config (public by design) lives in GitHub environment `dev`; prod secrets move to environment `production` under the same names so both workflows read `VITE_*` identically.                                                               |

## Steps

Owner key: **P** = Paul (billing, credentials, console-only consent), **C** = Claude.

1. **C** Create `spartboard-dev` in org `63276922281`; register a web app.
2. **P** Link the district billing account (Blaze). Set a budget alert (~$10/month).
3. **C** Enable APIs: Firestore, Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc,
   Pub/Sub, Cloud Scheduler, Secret Manager, Storage, Identity Toolkit, Vertex AI, IAM Credentials.
   Create Firestore `(default)` in `us-central1`, default Storage bucket.
4. **P** Configure the OAuth consent screen (Internal); enable the Google provider in Firebase Auth
   console. **C** enables Anonymous auth and adds authorized domains.
5. **P** Add `https://spartboard-dev.web.app` and `https://spartboard-dev.firebaseapp.com` as
   authorized JavaScript origins on prod's Google OAuth client.
6. **P** Set function secrets in dev: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   (prod values), `LTI_TOOL_PRIVATE_KEY` (new key). **C** sets placeholders for deferred secrets.
7. **P** `gcloud auth login` so **C** can create the WIF pool/provider and deploy service account
   restricted to this repo.
8. **C** Seed scripts under `scripts/dev-seed/`: copy the config collections from prod, generate
   fake teacher classes, rosters and students. Idempotent; refuses to run against `spartboard`.
9. **C** First manual deploy of rules, indexes, storage, functions and hosting to dev. Verify
   teacher sign-in, Drive, an AI generation call, and a student quiz join.
10. **C** PR: `.firebaserc` aliases (`default`/`prod` → `spartboard`, `dev` → `spartboard-dev`),
    `firebase-dev-deploy.yml` → dev project via WIF + live channel, GitHub environments. **P** merges.
11. **C** Update CLAUDE.md (CI section), retire the "dev deploys to prod" memory, update docs.

Rollback at any point before step 10 is free: the existing pipeline is untouched. Step 10 is a
single-workflow revert.

## Follow-ups (not in scope)

- Prod Firestore has delete protection and point-in-time recovery **disabled**. Turn both on, and add a
  daily backup schedule, independently of this plan.
- Move prod CI to WIF and delete the JSON key.
- ClassLink / Spotify / LTI dev registrations when a feature needs them.
