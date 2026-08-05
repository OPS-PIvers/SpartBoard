# Gemini API surface audit — terms exposure and Vertex AI migration scope

**Date:** 2026-08-05
**Scope:** Investigation and reporting only. No application code, keys, or billing configuration were changed.
**Repo state audited:** `claude/quirky-ritchie-wghdl3` off `main` @ `e1e7a6d`

---

## Bottom line

**SpartBoard is NOT on Vertex AI.** All four Gemini call sites use the **Gemini Developer API**
(`generativelanguage.googleapis.com`) authenticated with a raw API key held in Secret Manager as
`GEMINI_API_KEY`. That is the surface governed by the Gemini API Additional Terms at
<https://ai.google.dev/gemini-api/terms>.

The research agent's reading of those terms is **correct in every quoted particular**, and one
detail matters more than the rest:

> **Age Requirements**
> You must be 18 years of age or older to use the APIs. You also will not use the Services as part
> of a website, application, or other service (collectively, "API Clients") that is directed
> towards or is likely to be accessed by individuals under the age of 18.

This is a **top-level section**, sitting above and outside the `Unpaid Services` / `Paid Services`
split. It applies on **both** tiers. Moving from unpaid to paid quota does not cure it.

Separately, and it cuts the other way on the data question: **no student-submitted content reaches
Gemini today.** Every AI call site is teacher/admin-gated by a server-side check that student auth
tokens structurally cannot satisfy. The exposure is a **terms-of-use / eligibility** problem, not a
demonstrated student-data-leak problem.

**Recommendation: migrate to Vertex AI.** The code change is small (four constructor calls plus an
IAM grant), and Vertex is governed by the Google Cloud Terms of Service — which these Additional
Terms explicitly disclaim: _"For clarity, these Terms do not govern your direct use of any Google
Cloud Platform service."_ Details in §4 and §5.

---

## 1. Which Google AI surface the app calls today

### Evidence, file by file

**`functions/src/aiGeneration.ts`** — the only file in the repository that imports the Gemini SDK.

```ts
// line 4
import { GoogleGenAI, Content, Type, Schema } from '@google/genai';
// line 10
import { GEMINI_API_KEY } from './secrets';
```

Four client constructions, all identical in shape:

| Line   | Enclosing callable          |
| ------ | --------------------------- |
| `559`  | `generateWithAI`            |
| `1650` | `generateVideoActivity`     |
| `1964` | `transcribeVideoWithGemini` |
| `2189` | `generateGuidedLearning`    |

```ts
const apiKey = GEMINI_API_KEY.value();
const ai = new GoogleGenAI({ apiKey });
```

**`functions/src/secrets.ts:11`**

```ts
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
```

A Firebase Secret Manager secret bound to each callable via `secrets: [GEMINI_API_KEY]`
(`aiGeneration.ts:349, 1482, 1766, 2098`).

### Why this is definitively the Developer API and not Vertex

1. **SDK contract.** `@google/genai@1.51.0` selects the backend from the `vertexai` / `enterprise`
   option. From the shipped type definitions
   (`functions/node_modules/@google/genai/dist/genai.d.ts:5391-5425`):

   > `vertexai?: boolean` — _"When true, the Vertex AI API will be used. When false, the Gemini API
   > will be used. **If unset, default SDK behavior is to use the Gemini API service.**"_

   Neither `vertexai`, `enterprise`, `project`, nor `location` is passed at any of the four sites.
   Verified by grep: no occurrence of `vertexai`, `aiplatform`, or `@google-cloud/vertexai` anywhere
   in the repo outside `node_modules`.

2. **Compiled endpoint.** The default base URL is hardcoded in the SDK bundle
   (`functions/node_modules/@google/genai/dist/node/index.mjs:12974`):

   ```js
   initHttpOptions.baseUrl = `https://generativelanguage.googleapis.com/`;
   ```

3. **Independent corroboration from the repo's own incident log.**
   `docs/routines/debugger.md:439` records a test flake caused by an unmocked SDK call making
   _"a genuine HTTPS round-trip to Google's live Generative Language API."_ That was written from
   observed network behavior, not from reading this code.

4. **Auth model.** API key, not Application Default Credentials. Vertex does not accept a
   Generative Language API key.

### Client side: no direct Gemini access (verified empirically)

`VITE_GEMINI_API_KEY` is threaded through `Dockerfile:24,35`, `playwright.config.ts:60`, and four
GitHub Actions workflows — but **no application source file reads it**. `utils/ai.ts` routes
everything through Firebase callables (`utils/ai.ts:137-145`), and its own comment at line 400-403
states the intent: _"no client-side Gemini SDK or VITE-prefixed Gemini key."_

Because `utils/youtubeSearch.ts:120` reads `import.meta.env` through a cast (which can defeat Vite's
per-property static replacement and inline the whole env object), I confirmed this rather than
assuming it. I built the app with a sentinel value:

```
VITE_GEMINI_API_KEY=SENTINEL_… VITE_YOUTUBE_API_KEY=SENTINEL_… pnpm run build
```

The YouTube sentinel appears in `dist/assets/index-*.js`. The **Gemini sentinel appears in zero
files.** The Gemini key does not ship to browsers. (Build artifacts were deleted afterward.)

The `VITE_GEMINI_API_KEY` plumbing in CI, the Dockerfile, and the Playwright config is **vestigial**
and could be removed as unrelated cleanup.

### Paid or unpaid tier — NOT determinable from the repository

This is the one question the code cannot answer, and I want to be explicit rather than guess. The
terms define the boundary by **billing account**, not by SDK or endpoint:

> Your access to Gemini API is a "Paid Service" **only when accessing the API through a Cloud
> Project associated with an active billing account.**

Nothing in the repo reveals which Cloud project minted the key behind the `GEMINI_API_KEY` secret.
Two plausible cases:

- **Key minted inside the `spartboard` project** (`.firebaserc`). SpartBoard runs Cloud Functions
  v2 and Secret Manager, both of which require a Blaze plan — i.e. an active Cloud Billing account.
  On that reading the app is **already on the Paid tier**, and the "Google trains on your content /
  human reviewers read it" exposure does not apply.
- **Key minted in AI Studio's default Google-managed project.** Then it is **Unpaid**, and the
  training/human-review language and the _"Do not submit sensitive, confidential, or personal
  information to the Unpaid Services"_ warning apply in full.

**How to settle it (2 minutes, read-only):**

1. Google Cloud Console → APIs & Services → Credentials → locate the key value stored in
   `GEMINI_API_KEY` and note its owning project.
2. If that project is `spartboard`, check Billing shows an active, linked billing account.
3. Cross-check in AI Studio → _Get API key_ — the key list labels each project's plan as Free or
   Paid.

I did not retrieve the secret value or inspect billing, per the audit constraints.

**This determines the severity of the data-handling exposure but not the age-clause exposure**,
which applies either way.

---

## 2. Student reachability of the Gemini call sites

**Finding: no student-facing route can reach Gemini, and no student-submitted content is sent —
directly or indirectly.** Two independent layers establish this.

### Layer 1 — no AI code in any student route tree

Grepped `components/student`, `components/quiz`, `components/videoActivity`,
`components/guidedLearning`, `components/miniApp`, `components/activityWall`, `components/remote`,
and `components/subs` for `utils/ai`, `generateWithAI`, and `gemini`. **Zero matches in all eight
directories.**

Every importer of `@/utils/ai` is in the teacher dashboard tree — `components/widgets/*`
(Quiz/VideoActivity/GuidedLearning/MiniApp/Poll/Drawing/Webcam/Blooms/Embed editors),
`components/layout/AnnotationOverlay.tsx`, `components/layout/dock/MagicLayoutModal.tsx`, plus
`components/widgets/InstructionalRoutines/LibraryManager.tsx:75` which calls the callable directly.

Note the distinction: `components/widgets/QuizWidget` is the **teacher's authoring** widget.
`components/quiz/QuizStudentApp.tsx` is what students at `/quiz` load, and it has no AI imports.

### Layer 2 — server-side gate that student tokens structurally cannot pass

Client-side absence is not sufficient, since Firebase callables are reachable by anyone holding the
public project config. The real gate is server-side, and it holds. All four callables require a
**verified email claim**:

| Callable                    | Gate (`functions/src/aiGeneration.ts`)                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `generateWithAI`            | `354-369` — `request.auth` required; `!email` → `invalid-argument`                        |
| `generateVideoActivity`     | `1487-1501` — same                                                                        |
| `transcribeVideoWithGemini` | `1771-1785` — same, plus admin/beta feature-permission gate (`1789-1830`), off by default |
| `generateGuidedLearning`    | `2110-2133` — same, plus **hard admin-only** check against `admins/{email}`               |

And student sessions **never carry an email claim** — this is a deliberate, documented PII-free
design, not an accident:

- **Anonymous students** (`/join`, `/quiz`, `/activity-wall`, `/guided-learning`, `/miniapp`,
  `/nextup`, poll voting) use `signInAnonymously`. Anonymous Firebase users have no email.
- **SSO students** (`/my-assignments` via `studentLoginV1`) get a custom token whose claims are
  exactly `{ studentRole: true, orgId, classIds }` — `functions/src/studentIdentity.ts:291-295`,
  and the test-bypass path at `:204`. No email.
- **PIN students** — `functions/src/studentIdentity.ts:1295`, same shape.
- **LTI-launched students** — `functions/src/lti/launchEndpoints.ts:284-288`,
  `{ studentRole: true, orgId?, classIds }`. No email.

`functions/src/studentIdentity.ts:606-609` states the invariant outright:

> _"Teachers authenticate with standard Firebase Auth (email present on token). **Students never
> have email on their token**…"_

So a student token hitting any of the four callables gets `invalid-argument` before a single byte
reaches Google.

### Indirect paths — checked, none found

- **No AI grading or AI summarization of student work.** `WrittenResponseGrader.tsx` is manual
  teacher grading. `utils/ai.ts:29-32` documents the deliberate exclusion: short-answer and essay
  _"require manual teacher grading and are never generated by Gemini."_
- **No AI moderation** on Activity Wall, NextUp, or any submission pipeline.
- **`aiGeneration.ts` is the only file importing `@google/genai`.** No raw `fetch` to
  `generativelanguage.googleapis.com` anywhere.

### What _does_ flow to Gemini (all teacher-initiated) — and the residual PII vectors

Worth naming, because these are real even though students cannot trigger them:

| Path                                                                 | Payload                                | PII risk                                                                                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ocr` via Webcam widget (`components/widgets/Webcam/Widget.tsx:184`) | Live camera frame                      | **Highest.** A teacher scanning student work — or a camera pointed at the room — sends student handwriting, names, or faces as `inlineData` (`aiGeneration.ts:886`). |
| `ocr` via Drawing widget (`:954`) / Annotation overlay (`:551`)      | Canvas PNG                             | Moderate — could contain student names/work if written on the board.                                                                                                 |
| `generateGuidedLearning`                                             | Up to 10 images, ≤20 MB (`:2153-2175`) | Moderate — admin-only, but teachers do photograph student artifacts.                                                                                                 |
| `quiz` / `mini-app` / `poll` / `dashboard-layout` / `blooms-ai`      | Teacher-typed free text                | Low, but unbounded — nothing stops a teacher pasting a student's essay in.                                                                                           |
| `video-activity` / `transcribe`                                      | YouTube URL only (`:1668, :1982`)      | None.                                                                                                                                                                |

If the app is on the **Unpaid** tier, each of those rows is content that Google may train on and
that human reviewers may read — squarely against _"Do not submit sensitive, confidential, or
personal information to the Unpaid Services."_ If it is on the **Paid** tier, that risk is retired.

---

## 3. Independent verification of the terms

I re-read <https://ai.google.dev/gemini-api/terms> directly (raw HTML fetch, stripped to text — not
relying on a summarizer). **Effective March 23, 2026. Last updated 2026-04-28 UTC.**

### The age clause — confirmed verbatim, and it applies to both tiers

The document's section order is:

1. Age Requirements ← **here**
2. Use Restrictions
3. Use of Generated Content
4. **Unpaid Services** (→ _How Google Uses Your Data_)
5. **Paid Services** (→ _How Google Uses Your Data_, _Payment Terms_)
6. Agentic Services … 10. Disclaimers

Age Requirements is a **top-level section preceding the tier split**, so the research agent's claim
that it applies to both paid and unpaid is **correct**. Verbatim:

> You must be 18 years of age or older to use the APIs. You also will not use the Services as part
> of a website, application, or other service (collectively, "API Clients") that is directed
> towards or is likely to be accessed by individuals under the age of 18.

Note the clause attaches to the **API Client** — the website or application — not to who triggers a
given API call. SpartBoard's `/join`, `/quiz`, `/activity`, `/activity-wall`, `/guided-learning`,
`/miniapp`, `/nextup`, and `/my-assignments` routes are, by design, accessed by K-12 students.
**The §2 routing analysis does not resolve this clause.** Even with a perfect teacher-only gate on
every Gemini call, the application is one "that is directed towards or is likely to be accessed by
individuals under the age of 18."

### The unpaid-tier data language — confirmed verbatim

> When you use Unpaid Services, including, for example, Google AI Studio and the unpaid quota on
> Gemini API, Google uses the content you submit to the Services and any generated responses to
> provide, improve, and develop Google products and services and machine learning technologies…
>
> To help with quality and improve our products, human reviewers may read, annotate, and process
> your API input and output. Google takes steps to protect your privacy as part of this process.
> This includes disconnecting this data from your Google Account, API key, and Cloud project before
> reviewers see or annotate it. **Do not submit sensitive, confidential, or personal information to
> the Unpaid Services.**

All three quotes in the task brief are accurate. No corrections needed.

### What the paid tier actually buys

> When you use Paid Services… Google doesn't use your prompts (including associated system
> instructions, cached content, and files such as images, videos, or documents) or responses to
> improve our products, and will process your prompts and responses in accordance with the Data
> Processing Addendum for Products Where Google is a Data Processor. For Paid Services, Google logs
> prompts and responses for a limited period of time, solely for detecting and preventing
> violations of the Prohibited Use Policy…

So paid tier fixes the **data** problem and brings a **data-processor** relationship — but leaves
the **age** problem untouched.

### The exit clause

> **For clarity, these Terms do not govern your direct use of any Google Cloud Platform service**
> (including those listed on the Google Cloud Services Summary).

This is the load-bearing sentence for the recommendation. Vertex AI is a GCP service. Using Gemini
models through Vertex takes the application out from under these Additional Terms — including the
age clause — and places it under the Google Cloud Terms of Service and Google's Cloud DPA, which is
the contractual posture a school district should want anyway.

### Two additional clauses worth flagging

- **Consumer-use restriction:** _"Use of Google AI Studio and Gemini API is for developers building
  with Google AI models for professional or business purposes, not for consumer use."_ Arguably
  fine for a district tool; another point of friction for a wide public release.
- **EEA/Switzerland/UK:** _"You may use only Paid Services when making API Clients available to
  users in the European Economic Area, Switzerland, or the United Kingdom."_ Not a concern for
  Orono today; relevant to `docs/wide-distro-plan.md`.

_(Not legal advice — this is a faithful reading of the published text, and the age clause is
unambiguous enough on its face that it deserves counsel's eyes rather than an engineer's judgment
call.)_

---

## 4. What moving to Vertex AI would involve

Genuinely small on the code side. The risk is in model availability and the YouTube video path, not
in the plumbing.

### 4.1 SDK — no dependency change

`@google/genai` is Google's unified SDK and already speaks both backends. No package add or remove
in either `package.json`. The diff is four constructor calls:

```ts
// functions/src/aiGeneration.ts — lines 559, 1650, 1964, 2189
- const ai = new GoogleGenAI({ apiKey });
+ const ai = new GoogleGenAI({
+   vertexai: true,          // (SDK 1.51 also accepts the newer `enterprise: true`)
+   project: 'spartboard',
+   location: 'us-central1',
+ });
```

`generateContent`, `responseSchema`, the `Type` enum, `Content`/`Schema` types, `inlineData`, and
`fileData` parts are all the same API surface on both backends. `functions/src/parseGeminiJson.ts`
and the validators are unaffected.

### 4.2 Auth — API key out, ADC in

Vertex uses Application Default Credentials, not API keys.

- Drop `secrets: [GEMINI_API_KEY]` from the four `onCall` configs (`:349, :1482, :1766, :2098`) and
  the `GEMINI_API_KEY.value()` reads plus their missing-key guards (`:548-555, :1638, :1954,
:2179-2183`).
- `functions/src/secrets.ts:11` can drop the `GEMINI_API_KEY` definition once no callable binds it.
- **No new secret material anywhere** — a genuine security improvement. The key currently in Secret
  Manager can be deleted from Google Cloud after cutover (a separate, deliberate step; not part of
  this audit).

### 4.3 Can the existing Cloud Functions service account call Vertex? — Yes

Firebase Functions v2 run on Cloud Run with a runtime service account, and ADC resolves to it
automatically inside the function. The **only** change required is an IAM grant:

```
roles/aiplatform.user   →   <the functions runtime service account on project `spartboard`>
```

That is the default compute/App Engine service account unless a `serviceAccount` override is set —
and `firebase.json` sets none, so it's the default. The `aiplatform.googleapis.com` API must also
be enabled on the project. Both are console/CLI operations, not code.

`google-auth-library` ships as a dependency of `@google/genai`, so ADC works without adding
anything; worth a smoke test in the emulator regardless, since Firebase's dependency hoisting has
bitten this repo before.

### 4.4 Region

Functions are pinned to `us-central1` (`functions/src/functionsInit.ts:18`). Setting the Vertex
`location` to `us-central1` keeps inference in-region — better latency, and a cleaner data-residency
story for a district than the Developer API's unspecified routing.

### 4.5 The two real risks

**(a) Model IDs.** Defaults are `gemini-3-flash-preview` and `gemini-3.1-flash-lite-preview`
(`aiGeneration.ts:41-42`), with admin overrides stored in `global_permissions/gemini-functions` and
filtered by `normalizeModelName` (`functions/src/shared.ts:34`). Preview-tier model IDs and their
regional availability differ between the Developer API and Vertex. **Every configured model must be
verified against Vertex `us-central1` before cutover**, and the admin-facing model picker may need
its allow-list updated. This is the most likely source of a broken deploy.

**(b) YouTube video ingestion.** `generateVideoActivity` and `transcribeVideoWithGemini` pass a bare
YouTube watch URL as `fileData.fileUri` (`:1668-1669`, `:1982-1983`). Vertex does support YouTube
URIs — Google publishes a Vertex sample for exactly this — but the constraints differ in ways that
matter: the video generally must be **public** (the Developer API is more permissive about
unlisted), there is a **daily cap on total YouTube minutes processed per project (~8 hours)**, and
per-request video counts vary by model generation. These two callables need end-to-end testing on a
`dev-*` preview against real classroom videos, not just a unit test.

Everything else — OCR (`inlineData`), guided-learning images, quiz/mini-app/poll text — is backend-
agnostic and should port unchanged.

### 4.6 Billing and quotas

| Aspect            | Today (Developer API)                                                                                                                                   | After (Vertex AI)                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Billed to         | Whichever project owns the API key — possibly not `spartboard`                                                                                          | `spartboard`, on the existing Blaze billing account, alongside Functions/Firestore/Storage                     |
| Free tier         | Yes, if currently unpaid                                                                                                                                | **None.** Every call is billed from request one                                                                |
| Per-token pricing | Public Gemini API rates                                                                                                                                 | Broadly comparable published rates; verify per model before cutover                                            |
| Quota model       | Per-key RPM / RPD / TPM                                                                                                                                 | Per-project, per-region, per-model quotas via Cloud Quotas — **different limits, separately visible/raisable** |
| Cost visibility   | Opaque if the key lives in a Google-managed project                                                                                                     | Line items in the project's existing billing report                                                            |
| Cost control      | App-level daily caps: `dailyLimit ?? 20` for org users, `externalDailyLimit ?? 5` for external users, plus per-feature caps (`aiGeneration.ts:104-218`) | **Unchanged** — these are enforced in Firestore transactions before the Gemini call and carry over as-is       |

If the app is currently on the free tier, this converts a $0 line into a real one. The existing
quota machinery bounds it: 20 generations/user/day for org users, 5 for external. Worth modeling
against `ai_usage` documents to size the actual monthly delta before flipping.

### 4.7 Tests and CI

- `functions/src/index.test.ts:395-410` mocks `@google/genai` at module level — the mock survives
  the migration unchanged (it replaces the `GoogleGenAI` class regardless of constructor args).
- `functions/src/studentIdentity.test.ts:62` stubs `GEMINI_API_KEY: { value: () => 'gemini' }` —
  needs removal once the secret is unbound.
- `VITE_GEMINI_API_KEY` in `.github/workflows/{pr-validation,firebase-deploy,firebase-dev-deploy,docker-build}.yml`,
  `Dockerfile:24,35`, and `playwright.config.ts:60` is already dead (§1) and can be removed
  independently of this migration.

### 4.8 Effort estimate

Roughly **half a day of code plus a deliberate validation pass**: ~30 lines of diff in one file, one
IAM grant, one API enablement. The schedule is set by (a) validating model IDs on Vertex, (b) end-
to-end testing the two video callables on a preview deploy, and (c) confirming ADC resolves inside
the deployed function. Staged rollout via a `dev-*` preview URL is the natural path.

---

## 5. Recommendation

**Migrate to Vertex AI.** In priority order:

1. **First, settle the tier question** (§1, ~2 minutes, read-only). If the key lives in a Google-
   managed AI Studio project, the app is on the Unpaid tier and _is currently sending teacher-
   captured classroom images — potentially of student work and faces — into a pipeline Google trains
   on and human reviewers may read._ That is the urgent case and should be treated as one. If the
   key lives in `spartboard`, the app is on the Paid tier, the data exposure is already retired, and
   the migration is a compliance measure rather than an incident response.

2. **Migrate regardless of the answer.** Paid tier fixes the data-use problem; it does not fix the
   age clause. Only leaving these Additional Terms does, and the terms themselves name the exit:
   _"these Terms do not govern your direct use of any Google Cloud Platform service."_ Vertex also
   gives better cost visibility, no long-lived API key, in-region inference, and a contractual
   posture (Cloud DPA) that fits a K-12 district. `docs/external-availability-legal-review.md`
   currently has **no Gemini/AI section at all** — this is a genuine gap in that review, not a
   duplicate of it.

3. **Get counsel's eyes on the age clause** before any wide distribution. The clause is written
   against the API Client as a whole. My routing analysis shows no student _content_ reaching
   Gemini, which is materially good news — but it does not make an app with student login routes
   something other than "likely to be accessed by individuals under the age of 18." That is a legal
   call, not an engineering one, and `docs/wide-distro-plan.md` raises the stakes on it.

4. **Independent of all the above:** consider narrowing the Webcam OCR path. It is the widest PII
   aperture in the system — a live camera frame, teacher-triggered, straight to a third-party model.
   A confirm-before-send step, or defaulting `ocrMode` to the on-device Tesseract path already
   implemented at `components/widgets/Webcam/Widget.tsx:186`, would cost little. Worth doing on
   Vertex too.

---

## What was NOT done

Per the audit constraints: no application code changed, no keys rotated or read, no billing or IAM
configuration altered, no migration performed. The only side effect was a local production build
with sentinel environment values to test bundle leakage (§1); its `dist/` and `dist-ssr/` output was
deleted. This document is the sole addition.

## Verification appendix

| Claim                                     | How verified                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer API, not Vertex                 | SDK type docs `genai.d.ts:5391-5425`; compiled default base URL `dist/node/index.mjs:12974`; no `vertexai`/`project`/`location` passed; corroborated by `docs/routines/debugger.md:439`     |
| Only one file calls Gemini                | Repo-wide grep for `@google/genai`, `GoogleGenAI`, `generativelanguage`, `aiplatform` outside `node_modules`                                                                                |
| Gemini key absent from client bundle      | Production build with sentinel env values; grep of `dist/` — 0 matches for the Gemini sentinel, 1 for the YouTube sentinel                                                                  |
| No AI in student routes                   | Grep of 8 student-facing component directories for `utils/ai`, `generateWithAI`, `gemini` — 0 matches                                                                                       |
| Student tokens carry no email             | All four `createCustomToken` claim sets (`studentIdentity.ts:204,291,1295`; `lti/launchEndpoints.ts:284`); `signInAnonymously` call sites; invariant stated at `studentIdentity.ts:606-609` |
| All AI callables require an email claim   | `aiGeneration.ts:354-369, 1487-1501, 1771-1785, 2110-2133`                                                                                                                                  |
| Terms language + section placement        | Raw HTML fetch of <https://ai.google.dev/gemini-api/terms>, stripped to text and read directly (not summarizer output). Effective 2026-03-23, last updated 2026-04-28 UTC                   |
| Functions region                          | `functions/src/functionsInit.ts:18`                                                                                                                                                         |
| No `serviceAccount` override on functions | `firebase.json` functions block                                                                                                                                                             |
