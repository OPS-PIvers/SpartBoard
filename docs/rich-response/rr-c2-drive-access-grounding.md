# RR-C2 Grounding Brief — how a student actually gets a file out of the teacher's Drive

> **Provenance:** read-only audit by an exploration agent, 2026-08-07, against the
> working tree at `C:\dev\SpartBoard` (branch `dev-paul`).
>
> **Verification status:** the two headline findings (§1 the scope wall, §2 the
> three shipped link-shareable paths) were **read directly from source** by the
> author, not taken from a sub-agent summary:
>
> - `config/firebase.ts:84-86` + `functions/src/googleOAuth.ts:63` — confirmed:
>   the only Drive scope the app ever requests, on either the client login grant
>   or the offline refresh-token grant, is `drive.file`.
> - `utils/googleDriveService.ts:512-532` — confirmed: `makePublic()` posts
>   `{role:'reader', type:'anyone'}` when no domain is passed.
> - `hooks/useStorage.ts:164-190`, `functions/src/driveArchive.ts:143-156,267-273`,
>   `components/widgets/PdfWidget/PdfWidget.tsx:232-236` — confirmed: three
>   separate shipped paths hand a student a bearer URL to a Drive or Storage file.
> - `storage.rules:112-116` — confirmed: the repo documents in its own rules file
>   that Firebase Storage download URLs bypass Storage rules.
>
> **Everything else below is a lead to confirm in session, not established fact.**
>
> **This is grounding, not a resolution.** RR-C2 is a HITL grilling ticket;
> nothing here decides it.

---

## 0. Headline

**Both of RR-C2's load-bearing premises are wrong, and they fail in opposite
directions: the "probably disqualifying" link-shareable option is _already
shipped, three times over_, and is how every student-visible teacher file reaches
a student today — while the Cloud Function proxy the ticket treats as a decided
precedent _cannot read a teacher's Drive file at all_, because SpartBoard holds
only the `drive.file` scope and deliberately refuses to ask for more.**

The ticket frames RR-C2 as choosing among three options. In shipped code, option
three is the house style, option two is unbuildable as written, and option one
(copy into Storage) is the only one with no precedent at all — which is the exact
inverse of the ticket's ordering.

---

## 1. The scope wall — the RR-03 proxy cannot reach an arbitrary teacher file

This is the finding that most changes the session, and it is invisible from the
type definitions. RR-03's resolution is correct that a refresh token is stored
server-side and can act without the teacher present. It is silent on _what that
token is allowed to touch_.

**1.1 — `drive.file` is the only Drive scope, on both grants.**

- `config/firebase.ts:84-86`:
  ```ts
  'https://www.googleapis.com/auth/drive.file';
  export const GOOGLE_OAUTH_SCOPES = [GOOGLE_DRIVE_FILE_SCOPE];
  ```
- `functions/src/googleOAuth.ts:63` — the offline grant requires exactly the
  same single scope: `const REQUIRED_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];`
- `functions/src/googleOAuth.ts:56-62` explains why: the login/code flow "now
  asks only for the unrestricted `drive.file` scope."

**1.2 — `drive.readonly` is excluded _on purpose_, and un-excluding it is not a
code change.** `config/firebase.ts:67` says the scope list "[d]eliberately
excludes restricted scopes (e.g. drive.readonly)". `docs/wide-distro-plan.md:16,21`
records the reason: `drive.file` is unrestricted and needs no review, while
restricted scopes require Google's security assessment.
`docs/external-availability-oauth-runbook.md:68,210` confirms `drive.file` clears
verification with "none — no review even when External."
`docs/external-availability-journal.md:125` notes `drive.readonly` is declared on
the OAuth consent screen but **never requested by app code**, and wants it pruned.

**1.3 — What `drive.file` actually grants is per-file, and the repo says so.**
`hooks/useGooglePicker.ts:28-35`, on the token passed to the Picker:

> "Picking a file grants this token per-file `drive.file` access — no broader
> scope."

So the server-side refresh token can read a teacher's Drive file **only if
SpartBoard created it, or the teacher opened it through the Google Picker.** A
PDF the teacher uploaded to Drive last year through drive.google.com is not
reachable by any code in this repo, client or server.

**1.4 — Consequence.** "Serve it through a Cloud Function that proxies from
Drive using the teacher's token" is buildable **only for files that passed
through SpartBoard's own upload or Picker flow.** That is not a small caveat: it
converts RR-C2 from an auth question into an _authoring_ question — the moment
that decides whether a stimulus is reachable is when the teacher designates it,
not when the student requests it.

**1.5 — And the proxy does not exist.** There is no download or streaming
callable anywhere in `functions/src`. No `alt=media`, no `files.get` body read.
`functions/src/driveArchive.ts` is the only Drive-touching function and it is
strictly **upload** (`uploadBlobToDrive` at `:100-141`, `makeDriveFilePublic` at
`:143-156`). RR-03 decided a mechanism; it did not leave one behind. The
wayfinder's "handed it a working precedent" (line 160) overstates what is in the
tree — what exists is a **token broker** (`functions/src/googleOAuth.ts`) and an
**upload path**, not a proxy.

---

## 2. The app already ships the "link-shareable" option — three times

The ticket calls this option "probably disqualifying for anything copyrighted."
It is production behaviour on every student surface that shows a teacher's file.

**2.1 — `makePublic()` is the shared primitive.**
`utils/googleDriveService.ts:512-516`:

```ts
const permission =
  domain && !CONSUMER_DOMAINS.has(domain.toLowerCase())
    ? { role: 'reader', type: 'domain', domain }
    : { role: 'reader', type: 'anyone' };
```

Passing no domain means **anyone with the link**, unauthenticated, forever.

**2.2 — Guided-learning slide images: `type:'anyone'`, deliberately, for
students.** `hooks/useStorage.ts:176-179`:

```ts
// Pass undefined to force type:'anyone' sharing so the image URL is
// publicly renderable in all contexts (matches uploadBackgroundToDrive).
await driveService.makePublic(driveFile.id, undefined);
return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
```

Rendered into a student's browser at
`components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx:729,764,778`,
reached from `components/guidedLearning/GuidedLearningStudentApp.tsx:364,378`. The
same forcing appears at `hooks/useGoogleDrive.ts:83-89` for dashboard
backgrounds, whose docblock (`:67-69`) says files are "always shared as
type: 'anyone' … including student view and unauthenticated sessions."

**2.3 — Activity-wall photos: the server makes the Drive file public and writes
the public URL into a student-readable doc.** `functions/src/driveArchive.ts:267-273`:

```ts
await makeDriveFilePublic(accessToken, driveFile.id);
const driveUrl = `https://lh3.googleusercontent.com/d/${driveFile.id}`;
await submissionRef.set({ content: driveUrl, ... });
```

`makeDriveFilePublic` (`:143-156`) is hardcoded to `{role:'reader', type:'anyone'}`
— no domain branch at all. Loaded by a gallery visitor at
`components/activityWall/ActivityWallGalleryView.tsx:504-510,591-592`. **This is
already children's work on a public URL**, and it is the ticket's own suggested
model for option one.

**2.4 — PdfWidget: verified, and it is a bearer URL either way.**
`components/widgets/PdfWidget/PdfWidget.tsx:232-236` renders
`<iframe src={config.activePdfUrl} …>`. That URL comes from `uploadPdf`
(`hooks/useStorage.ts:331-358`), which has **two branches**:

- **Drive branch** (`:335-352`) — `makePublic(driveFile.id, userDomain)`, then
  `https://drive.google.com/file/d/${driveFile.id}/preview`. On a Workspace
  domain this is `type:'domain'`; on a consumer account it falls through to
  `type:'anyone'`.
- **Storage branch** (`:354-357`) — `users/{userId}/pdfs/...`, URL from
  `getDownloadURL` (`:25`).

`uploadAdminPdf` (`:360-386`) is identical but writes `global_pdfs/`.

**2.5 — Yes, a Firebase Storage download URL is a bearer credential. The repo
states it as a design fact.** `storage.rules:112-116`:

> "teachers view via download URLs that include an unguessable download token
> managed by Firebase Storage (not a Firebase Auth token). **These token-based
> URLs are not subject to these rules**, so `<img>` display works without SDK
> read permission."

So holding the URL grants read access regardless of who you are, independent of
`storage.rules`. The rules gate the _SDK_ path only. **The ticket's fear about
option three applies equally to option one** — copying into Firebase Storage and
handing out a `getDownloadURL` link is link-shareability with extra steps, unless
the design deliberately avoids download tokens (which nothing in the repo
currently does).

---

## 3. The format constraint nobody has written down

`hooks/useStorage.ts:146-151`, on guided-learning AV media:

> "Always writes to Firebase Storage (never Drive): `lh3.googleusercontent.com`
> Drive links only serve **images**, so a Drive-hosted MP4/MP3 can't stream in a
> `<video>`/`<audio>` tag."

**The shipped Drive delivery path handles images only.** Every RR-C1 format that
is not an image — `wav`, `mp3`, `mp4`, and `pdf` in its `lh3` form — has no
working Drive-hosted delivery today. The app already hit this and already
resolved it the same way twice: **AV goes to Firebase Storage** (`:153-162`,
reusing the `hotspot_images` path so existing rules cover it), and **PDF goes to
the `/preview` iframe** rather than `lh3` (`:344`).

This lands on RR-C1 more than RR-C2, but it constrains RR-C2's option set: the
"just share the Drive link" answer is not uniform across the format list.

---

## 4. The identity model is not one model — it is two, and the majority case has no claims

The ticket says "SSO students have a Firebase identity with
`{studentRole, orgId, classIds}` claims." True for `/student/login`, false for
most student traffic.

**4.1 — Six of nine student routes can only ever hold a bare anonymous token.**
`signInAnonymously()` call sites: `components/student/StudentApp.tsx:130` (`/join`),
`components/student/NextUpStudentApp.tsx:40`,
`components/guidedLearning/GuidedLearningStudentApp.tsx:76`,
`components/miniApp/MiniAppStudentApp.tsx:70`,
`components/activityWall/ActivityWallStudentApp.tsx:338`,
`components/activityWall/ActivityWallGalleryView.tsx:107`,
plus `components/quiz/QuizStudentApp.tsx:152` and
`hooks/useQuizSession.ts:1653` as the quiz baseline.

**4.2 — Quiz upgrades to claims only under three simultaneous conditions.**
`hooks/useQuizSession.ts:1729` gates the `pinLoginV1` bridge on
`isAnonymous && sanitizedPin && sessionHasRosters`, where `sessionHasRosters`
requires a non-empty `rosterIds` (`:1726-1728`). Custom token applied at `:1778`.
If `pinLoginV1` returns `matched:false` or throws, the code **silently falls
through to the legacy anonymous flow** (`:1791-1795`, `:1797`). A PIN-only quiz
with no roster produces a claimless student by construction.

**4.3 — Claims minted are identical in shape on both paths**, so the shape itself
is fine: `functions/src/studentIdentity.ts:291-296` (`studentLoginV1`) and
`:1295-1299` (`pinLoginV1`) both set `{studentRole:true, orgId, classIds}`.

**4.4 — `RequireStudentAuth` guards exactly one route.**
`context/StudentAuthContext.tsx:353-363`; used once, at `App.tsx:818-822`
(`/my-assignments`). The protected-route prefix list is
`['/my-assignments','/student/assignments']` (`:71-74`) — every join route is
outside it.

**4.5 — Consequence for the gate.** Any authorization predicate built on
`classIds` is a **no-op for anonymous joiners**, and the rules already treat a
missing class as pass-by-default: `firestore.rules:46-49` and `:57-62` both
return `true` when the session carries no class. A class-keyed stimulus gate
would be fail-open for exactly the population it was meant to bound.

---

## 5. What a server-side gate could actually key on

Reliably present on every `quiz_sessions/{id}` doc (written unconditionally at
`hooks/useQuizAssignments.ts:734-783`, committed `:790`):

| Identifier     | Type line       | Notes                          |
| -------------- | --------------- | ------------------------------ |
| `teacherUid`   | `types.ts:3252` | the token owner to act as      |
| `assignmentId` | `types.ts:3249` | == session id                  |
| `quizId`       | `types.ts:3250` | Firestore doc id, not Drive    |
| `code`         | `types.ts:3262` | join secret                    |
| `mode`         | `types.ts:3380` | `'view-only' \| 'submissions'` |

Conditionally present — **do not build a sole gate on these**:

- `classIds` / `classId` (`types.ts:3350`, `:3339`) — written only when the
  teacher targeted a ClassLink or admin test-class roster
  (`hooks/useQuizAssignments.ts:771-773`; derivation at
  `utils/resolveAssignmentTargets.ts:108-114` reads `classlinkClassId` /
  `testClassId`, both optional on `ClassRosterMeta`, `types.ts:142,152`). Absent
  entirely for local rosters and PIN-only assignments.
- `rosterIds` (`types.ts:3355`) — teacher-namespaced ids, not resolvable to a
  student server-side.

**The strongest available predicate is membership-by-participation, not
membership-by-class:** the existence of `/quiz_sessions/{sessionId}/responses/{auth.uid}`.
Rules already bind the response doc key to the uid
(`firestore.rules:2964-2966`) and require `studentUid == auth.uid` (`:2939`). It
proves the caller actually joined this assignment, and it survives the `classIds`
gap. It has one honest weakness: it authorizes only _after_ a student joins,
which is fine for a stimulus (you cannot see question 3 before joining) and would
be wrong for a preview surface.

**5.1 — A trap for where the stimulus reference rides.** `publicQuestions` is an
array field on the session doc (`hooks/useQuizAssignments.ts:747`, rebuilt
`:1776`, `:1840-1843`; built by `toPublicQuestion`,
`hooks/useQuizSession.ts:288-326`), and `firestore.rules:2876-2884` reads:

```
// Reads are intentionally permissive: any authed caller can get/list session
// docs. ... Privacy: a sessionId is an unguessable v4 UUID; the doc exposes
// only code/classId/publicQuestions (answer-key stripped)/revealedAnswers — no PII.
allow read: if request.auth != null;
```

`QuizPublicQuestion` (`types.ts:3205-3229`) carries no media field today. If a
stimulus's Drive file id goes there, **it is readable by every authenticated
caller in the project, including any anonymous student in any other class** — and
under §2 a Drive file id plus public sharing _is_ the credential. The rule's
stated privacy argument ("no PII") stops being true the moment the array carries
a pointer to a file.

---

## 6. The hot path — what the code says, not what we can guess

**6.1 — Whole-class-at-once already ships, and it is a callable.** `pinLoginV1`
is called by every joining student (`hooks/useQuizSession.ts:1739`,
`hooks/useVideoActivitySession.ts:752`), as are `studentLoginV1`
(`components/student/StudentLoginPage.tsx:267`), `getStudentClassDirectoryV1`
(`hooks/useStudentClassDirectory.ts:121`), `ltiExchange`
(`components/lti/LtiLaunchPage.tsx:79`) and `classroomAddonLoginV1`
(`components/classroomAddon/StudentSpikeRoute.tsx:265`). So the load _pattern_ has
precedent. **The payloads do not** — these return a token, not a file.

**6.2 — Whole-class-at-once for actual media has a shipped answer, and it is not
a function.** Guided-learning slides are fetched by an entire class
simultaneously, straight from `lh3.googleusercontent.com` or Firebase Storage,
with **no Cloud Function in the path** (§2.2). Same for activity-wall gallery
photos (§2.3) and the `/join` background (`components/student/StudentApp.tsx:176`,
fed from `hooks/useLiveSession.ts:412,448`). **The house answer to "30 students
want the same file at once" is: give them a CDN URL.**

**6.3 — Nothing in `functions/src` is tuned for this.**

- **No function anywhere sets `concurrency` or `cpu`.** Gen2 defaults apply
  (concurrency 80).
- `functions/src/functionsInit.ts:18` sets region only (`setGlobalOptions({ region: 'us-central1' })`).
- Repo standard **256MiB confirmed, and 128MiB OOM is a real prod incident, twice**
  — `functions/src/resolveOrgForUser.ts:67-70` ("~135-144MiB … OOMs a 128MiB
  instance during the startup readiness check"),
  `functions/src/organizationInvites.ts:974-975`, `functions/src/lti/endpoints.ts:19`;
  incident write-up at `docs/external-availability-journal.md:136`.
- **The one function that moves file bytes buffers them entirely in memory.**
  `functions/src/driveArchive.ts:249` — `const [fileBuffer] = await file.download();`
  at `memory: '512MiB'` (`:160`), with a 50 MB guard added at `:237-247`
  precisely because of the OOM risk (comment at `:231-236`). At default
  concurrency 80, a proxy of this shape is arithmetically indefensible for
  anything larger than a photo.
- **No caching of any kind.** Exactly one `Cache-Control` in all of
  `functions/src` — `functions/src/lti/endpoints.ts:22`, on the JWKS document.
  Zero `getSignedUrl` calls. Zero CDN config.
- **The only `minInstances: 1` in the repo is on a teacher-side function**
  (`getPseudonymsForAssignmentV1`, `functions/src/studentIdentity.ts:589`), and
  `studentLoginV1`'s warm reservation was **deliberately removed** (commit
  `0c0457f3`, per `docs/scheduled-tasks/typescript-eslint.md:167`).

**6.4 — There is a shipped precedent for escaping a hot path**, if the session
wants one: `adminAnalytics` was converted from compute-on-request to reading a
precomputed Firestore snapshot written nightly — rationale at
`functions/src/adminAnalyticsEndpoint.ts:20-29`.

---

## 7. Things that surprised me

Asked deliberately: _has this app already solved this shape of problem
somewhere else?_

**7.1 — It has solved it three times and always the same way**, and the
convergence looks like a decision nobody recorded: put the bytes somewhere with a
CDN, mint an unguessable URL, put the URL in a doc the student can read, and let
the browser fetch it directly. Backgrounds, hotspot images, activity-wall photos
and PDFs all do this. **RR-C2 is not choosing a new mechanism; it is deciding
whether to keep the house one or break from it for the first time.**

**7.2 — The Google Picker is already the "teacher designates a file" UI, and it
is the thing that solves §1.** `hooks/useGooglePicker.ts:26-36` — picking a file
grants per-file `drive.file` access. Any stimulus authoring flow routed through
the Picker makes the file server-reachable **as a side effect of how the teacher
chose it**. This is the same shape as RR-B4's finding that `proportionalLayout`
had already answered the coordinate-space question one level up.

**7.3 — Two upload paths for the same asset class disagree about sharing.**
`hooks/useStorage.ts:47` (`uploadBackground`) passes `userDomain` →
`type:'domain'`; `hooks/useGoogleDrive.ts:85` (`uploadBackgroundToDrive`) passes
`undefined` → `type:'anyone'`, with a comment explaining the student-view reason.
Two functions, one asset type, two disclosure surfaces. Nothing reconciles them.
Worth an issue on its own account, independent of this map.

**7.4 — `global_pdfs` is already reachable by an anonymous student.**
`firestore.rules:3320` and `storage.rules:108` both gate on
`request.auth != null`, which an anonymous student satisfies. An admin PDF
library is readable from any student route today. Not created by RR-C2, but it
is a live example of "authenticated" being a much weaker gate than it reads as.

**7.5 — `type:'domain'` sharing depends on a Google session SpartBoard does not
control.** The PDF Drive branch (§2.4) produces a `drive.google.com/.../preview`
iframe shared to the teacher's Workspace domain. That renders for a viewer signed
into a Google account **on that domain in that browser profile** — which on a
managed district Chromebook a student is, and on a home device or an external
district may not be. ⚠️ **This is a mechanism inference, not a code fact**, and it
is precisely the kind of claim this map has been burned by. It belongs on RR-A5's
device errand: open a domain-shared Drive preview on a student Chromebook and see
what happens. Note also `docs/rich-response-wayfinder.md:3136` already records
that Drive files with download/print/copy disabled **cannot preview on mobile at
all**.

---

## 8. Assumptions in the ticket text

| #   | Assumption (ticket text)                                                                                | Verdict                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "SSO students have a Firebase identity with `{studentRole, orgId, classIds}` claims"                    | **NARROWED**                                                          | True only for `/student/login` and a conditional quiz/VA upgrade. Six of nine student routes are bare anonymous with zero claims — §4.1, §4.2                                                                                                                                                                                                            |
| 2   | "the student never holds a Google OAuth token and therefore has no Drive scope"                         | **SURVIVED** (first half) / **REFUTED** (the inference)               | The token really is discarded (`components/student/StudentLoginPage.tsx:282-296`, header note `:15-17`; only `window.google.accounts.id`, no `oauth2` token client). But "and therefore no right to read the teacher's files" does not follow — students read teacher Drive files today via public sharing, with no in-app identity involved at all — §2 |
| 3   | "The ticket assumes one student identity model"                                                         | **REFUTED**                                                           | Two models, and the claimless one is the majority — §4                                                                                                                                                                                                                                                                                                   |
| 4   | "RR-03 already chose the second option … handed it a working precedent"                                 | **REFUTED**                                                           | No proxy exists. `functions/src/driveArchive.ts` is upload-only; there is no `alt=media` or `files.get` body read anywhere in `functions/src` — §1.5                                                                                                                                                                                                     |
| 5   | "proxies from Drive using the teacher's stored refresh token" is available as a mechanism               | **NARROWED, severely**                                                | The stored grant carries `drive.file` only (`functions/src/googleOAuth.ts:63`, `config/firebase.ts:84-86`). It cannot read a file SpartBoard did not create or the teacher did not Picker-open. Broadening it means a restricted scope and a Google security assessment (`config/firebase.ts:67`, `docs/wide-distro-plan.md:16,21`) — §1                 |
| 6   | "the token-lifetime objection is answered"                                                              | **SURVIVED**                                                          | Refresh tokens are AES-encrypted at `/users/{uid}/private/googleAuth`, Admin-SDK-only (`functions/src/googleOAuth.ts:2-30,65-66,91-99`)                                                                                                                                                                                                                  |
| 7   | "Make the Drive file link-shareable? … probably disqualifying"                                          | **REFUTED**                                                           | It is the shipped default on three student-visible surfaces, one of which serves children's own photos on a `type:'anyone'` URL — §2.2, §2.3, §2.4                                                                                                                                                                                                       |
| 8   | "Copy the file into Firebase Storage … with a session-scoped rule like `activity_wall_photos`"          | **NARROWED**                                                          | The `activity_wall_photos` rule does gate the SDK path (`storage.rules:117-143`), but the feature does not use it for display — it uses download-token URLs that bypass rules entirely, as the rules file itself documents (`storage.rules:112-116`). Copy-into-Storage inherits link-shareability unless the design refuses download tokens — §2.5      |
| 9   | "the authorization predicate is session/class membership instead"                                       | **NARROWED**                                                          | Class membership is fail-open and frequently absent (`firestore.rules:46-49,57-62`; `hooks/useQuizAssignments.ts:771-773`). Response-doc existence keyed to `auth.uid` is the only sound predicate — §5                                                                                                                                                  |
| 10  | "whether the hot-path cost … behaves like the once-per-student playback case RR-03 sized"               | **SURVIVED, and sharpened**                                           | No function sets concurrency; the one byte-moving function fully buffers at 512MiB (`functions/src/driveArchive.ts:249`); no caching/CDN/signed URLs exist. But the shipped answer to whole-class media is already CDN-direct, not a function — §6                                                                                                       |
| 11  | "A Drive-preview iframe for docx is only on the table if students can reach Drive at all" (RR-C1 carry) | **SURVIVED, and it is closer to on-the-table than the ticket thinks** | The `/preview` iframe is already how PdfWidget renders Drive PDFs (`hooks/useStorage.ts:344`, `components/widgets/PdfWidget/PdfWidget.tsx:232-236`). The open part is §7.5's ambient-Google-session dependency                                                                                                                                           |

---

## 9. What remains genuinely open for a human

Each is phrased to be asked verbatim. A recommendation is offered with its
trade-off; **none of these is answered here.**

**Q1 — SpartBoard already serves teacher files to students by making them
`type:'anyone'` public on Drive, including children's own photos. Does a stimulus
follow that house pattern, or is a stimulus the thing that finally breaks it?**
_Recommendation:_ follow it for teacher-authored material, break it for anything
the teacher marks as copyrighted. _Trade-off:_ following it costs nothing and
ships now, but it puts a district's licensed content on an unauthenticated URL
with no revocation story; breaking it means building the first gated media path
in the app and accepting §6's cold-start and concurrency exposure.

**Q2 — Given `drive.file`, a stimulus is only server-reachable if the teacher
designated it through SpartBoard's own Picker or upload. Is that acceptable as
the product rule — "you attach a stimulus the way you attach a quiz file", not
"you paste a Drive link"?**
_Recommendation:_ yes, make the Picker the only path. _Trade-off:_ it closes §1
completely at zero infrastructure cost and keeps the app out of restricted-scope
verification; it also means a teacher cannot use a link a colleague sent them
without re-uploading, which will feel arbitrary and will generate support
questions nothing in the UI can explain.

**Q3 — Is asking Google for `drive.readonly` on the table at all, or is that
permanently closed?** _(This is a business question, not a technical one —
`config/firebase.ts:67` and `docs/wide-distro-plan.md:21` treat it as closed, but
that predates the C track.)_
_Recommendation:_ keep it closed. _Trade-off:_ closed means Q2's constraint is
permanent and RR-C1's format list is bounded by what SpartBoard can be handed
directly; opening it dissolves the whole problem but adds a restricted-scope
security assessment to the external-availability path that is currently clean.

**Q4 — The only sound authorization predicate is "this uid has a response doc in
this session." That authorizes a student only after they join. Is a stimulus ever
needed before join — a preview, a practice mode, a teacher showing the class the
passage on the projector?**
_Recommendation:_ no; gate on join. _Trade-off:_ gating on join makes the
predicate airtight and reuses a binding rules already enforce
(`firestore.rules:2964-2966`); if any pre-join surface is wanted later, the gate
has to be redesigned rather than extended, because class membership is fail-open
for anonymous joiners.

**Q5 — Where does a stimulus reference live? `publicQuestions` is the natural
home and is readable by every authenticated caller in the project
(`firestore.rules:2876-2884`), which under the public-sharing model leaks the file
itself.**
_Recommendation:_ put an opaque `stimulusId` in `publicQuestions` and resolve it
through a callable, never the Drive file id. _Trade-off:_ indirection costs a
round-trip on the hot path and reintroduces §6's function-in-the-path problem;
putting the id inline is free and fast and makes the rule's "no PII" comment
false.

**Q6 — Drive `lh3` URLs serve images only (`hooks/useStorage.ts:146-151`), so
audio and video stimuli cannot use the shipped Drive path. Does that push all AV
stimuli to Firebase Storage — reversing RR-03's "Drive is the durable home" for
stimuli specifically?**
_Recommendation:_ yes, and say so explicitly rather than letting it happen. _Trade-off:_
stimuli are teacher-authored and few (one per question, not one per student per
take), so the cost arithmetic RR-03 ran on responses does not transfer — but it
does mean the map now has two storage homes with two different rationales, which
is exactly the kind of drift RR-03 sub-decision 1 was trying to prevent.

---

## 10. Consequences for integration

Per affected ticket, what another session should inject.

**RR-C2 (this ticket)** — rewrite the question. The three-way fork is not a fork:
option three is shipped, option two is blocked on scope, option one has no
precedent. Replace the "RR-03 handed it a working precedent" paragraph with §1
and §2. The genuinely open decision is **Q1 and Q2**, not "the gate."

**RR-C1** — three injections. (a) §3: `lh3` serves images only, so the format
list splits by delivery mechanism, not by renderer. (b) §2.4: the Drive
`/preview` iframe is **already shipped** for PDFs, so "Drive preview iframe for
docx" is a smaller ask than charted — it is the same call with a different mime
type. (c) §7.5 + wayfinder line 3136: preview depends on an ambient Google
session and breaks on mobile for download-disabled files.

**RR-03 (closed)** — record a correction, in place, the way RR-B4's was recorded.
Sub-decision 6's proxy callable is specified against a scope that cannot reach an
arbitrary teacher file. For RR-03's own case this is **harmless** — the archived
recording is a file SpartBoard itself created, so `drive.file` covers it — but the
resolution's text invites RR-C2 to reuse a mechanism that does not generalize.
Add one line saying the proxy works **because SpartBoard created the file.**

**RR-A5** — add a fourth measurement, and it is cheap while the device is in
hand: open a `type:'domain'`-shared `drive.google.com/file/d/{id}/preview` iframe
on a student Chromebook and record whether it renders, and what happens when the
student is signed out of Google. §7.5.

**RR-09** — add a question. Every student-visible teacher file on this product
today is served from a `type:'anyone'` public Drive URL (§2.2, §2.3), including
children's own photographs. Counsel should be asked whether that is consistent
with the notice posture RR-04 settled, **independent of anything the C track
builds** — it is live behaviour, not a proposal.

**Scheduled work / issues (not this map)** — two items. (a) §7.3: the two
background-upload paths disagree about Drive sharing type; one asset class, two
disclosure surfaces. (b) §7.4: `global_pdfs` is readable by anonymous students on
both the Firestore and Storage rules.

**The "several takes everywhere" and "moderation" fog patches** — no change; a
stimulus is teacher-authored and does not multiply per student.
