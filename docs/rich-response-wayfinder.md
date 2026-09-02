# Rich Student Responses — Wayfinder Map

> **Format:** This file is a [wayfinder](https://github.com/mattpocock) map rendered as a
> single markdown file instead of a GitHub issue tracker. The map body is the
> low-resolution index; the tickets below it are the decisions still to be made.
>
> **How to use it:** read the Destination, then take the first ticket in
> **Frontier** that isn't claimed. Resolve **one ticket per session** (research
> tickets excepted). Record the answer in the ticket's `Resolution`, flip its
> `Status` to `Closed`, and add a one-line gist to **Decisions so far**.
>
> **Plan, don't do.** Every ticket resolves a _decision_. If you feel the pull to
> start building, that's the signal the map is finished and it's time to hand off
> to implementation tickets.
>
> **Paul:** each ticket has an empty `Paul's notes` slot. Write in them freely —
> agents should read them as the highest-authority input on that ticket.

**Status:** Charted 2026-08-04 · **23 of 24 resolved · implementation shipped to dev-paul 2026-09-02** (eleven PRs, see [`rich-response/IMPLEMENTATION.md`](rich-response/IMPLEMENTATION.md)). RR-B3 remains the only open ticket, deferred with the whiteboard track. Prior state: **23 of 24 resolved** — ✅ **RR-A5, RR-A6 and RR-09 closed 2026-09-01 on Paul's word, not on a harness or an email**: district Chromebooks are current and the app is approved (the whole hardware branch was overblown), and the district posture — internal app, every persisted student artifact in the staff member's Drive — answers RR-09 without counsel. AI transcription is not planned. **The only open ticket is RR-B3**, which travels with the deferred whiteboard track. The map is finished; see [`rich-response/IMPLEMENTATION.md`](rich-response/IMPLEMENTATION.md). Prior state: **19 of 24 resolved** — ✅ **RR-11 closed into Out of scope 2026-08-27, on its own first question**: accommodations stay teacher-mediated and invisible, for the reasons written in the ticket — which leaves **zero agent-takeable tickets**. Everything still open wants a person: RR-A5 (Chromebook), RR-09 (email to counsel/Google), RR-B3 (stopwatch), and RR-A6 behind RR-A5. Prior state: 🔴 **RR-07 closed 2026-08-16, and it deleted a requirement rather than designing one.** Its answer to _"what's the alternate-format policy"_ is **there isn't one**: both supports of the mandatory non-recorded floor had already been withdrawn — the legal one by RR-A1, the functional one by Paul (**mic access is grantable**) — and nobody had noticed they were both gone. What replaces it is four mechanisms at four times (allowlist at onboarding, told-and-moves-on at runtime, three-way teacher adjudication at grading, RR-10's advisory at authoring). ⚠️ **It is also the first resolution on this map to rest on an unrun measurement** — RR-A5 item 4 — so it is decided **and provisional**. The same session settled RR-C2's CORS item without a Chromebook (**there is no infrastructure requirement**) and opened **RR-11** on accommodations. Prior state below. · RR-01, RR-B1, RR-A4 closed and RR-04's research half done 2026-08-04; **RR-02, RR-03 and RR-04 closed 2026-08-05**; **RR-A3, RR-A1, RR-08, RR-A2 and RR-05 closed 2026-08-06**; **RR-06, RR-B2, RR-B4, RR-C1, RR-C2 and RR-C3 closed 2026-08-07** — six in one day, and RR-C3 ran its audit and its grilling as two separate sessions within it. 🔴 **The map briefly reported having no design questions left, and that lasted exactly one turn.** It was true of the **charted tickets** and false of the **fog**: three authoring patches had been accumulating one control per session since 2026-08-06, each too small to ticket alone and each naming the other two as the reason. They graduated together the same day as **[RR-10](#rr-10--what-does-the-quiz-editor-become-and-what-does-it-refuse-to-let-a-teacher-build)** — the inventory of everything nine closed tickets made a teacher author, plus the question of what the product refuses to let them build. **What remains besides it is three errands that want a person rather than an agent** (RR-A5, RR-09, RR-B3), one upload ticket behind RR-A5, and RR-07's narrowed remnant. **The entire quiz-side design is now settled — response model, capture, persistence, privacy, completeness, AI boundary, and grading — and RR-B2 turned the B track's keystone**, which came in far cheaper than three tickets had assumed and dissolved RR-B1's hard blocker outright. What remains on the quiz side is measurement and legal confirmation, not design. Video ships gated as a peer mode (RR-A3); the capture experience, its timing model and its data model are locked (RR-A1); RR-08 settled what "answered" means now that a question can complete in parts — including the shipped `'auto'`-mode stall RR-A1 found; and **RR-A2 settled what happens to a take once it exists**, dissolving the one live contradiction two closed tickets had left. The response model (RR-01), its serialization (RR-02) and its lifecycle (RR-03) were already locked, and RR-04 governs who may hold student media, under what name, and for how long. RR-05 then drew the AI boundary — one capability, two gates, and four wrong premises corrected against the codebase. **No keystones remain, and after RR-B4 the B track has no design questions left either** — what remains there is one prototype with a stopwatch. RR-B4 fixed the whiteboard's coordinate space at a **1600×1200 logical page rendered at 2×**, found that three of its four charted bullets were already answered by shipped code, and 🔴 **became the first decision on this map to change shipped teacher behaviour**: the same fixed page applies to the dashboard drawing widget, retiring the last absolute-pixel coordinate space in the app — one the codebase had already migrated away from a level up, for widget bounds. **The C track ran the pattern the A and B tracks each ran on their opening day, and then ran a new one.** RR-C1 fixed the stimulus list at image/audio/video/YouTube/PDF with Office refused, and found the app had **already solved question-attached media once, in GuidedLearning**, while the quiz model carries no media field at all — and that its two shipped players disagree with each other about the very control policy the ticket was asking about. RR-C2's audit then landed the same day and was harsher still: **both of its load-bearing premises were wrong in opposite directions.** But RR-C2's grilling session inverted that again — **one more call-site read dissolved the expensive option instead of confirming it blocked** (`storage.rules:127-139` performs cross-service `firestore.get()`, which I had asserted was impossible), so the Cloud Function proxy the ticket was charted around is not merely unbuildable but **unnecessary**. RR-C2 gates image and PDF behind a Storage rule, leaves audio/video/YouTube on public URLs, moves **every stimulus byte out of Drive** — amending RR-03 on capability rather than cost grounds — and states plainly what its sub-decisions imply: **SpartBoard has decided not to protect copyrighted stimulus material.** **RR-C3 then closed the same day and ended the design work on this map.** It followed the house pattern its audit found — a stimulus array on the quiz, a pointer on the question — but **explicitly not for the reason the precedent supplies**, since a VA question is located _in_ the video and a quiz stimulus has no positional relationship to anything; what transferred was that **the pointer is the grouping concept**, which is what shuffle needed and what nobody had to invent. It departed from the precedent in exactly one place — a stable id rather than GL's index — and that place is precisely where the precedent's ordering semantics stop applying, which is where the frontier had predicted the departure would fall. ⚠️ **Two premises the audit left standing failed verification before a question was asked**: the house pinning idiom is _don't key at all_, and `toPublicQuestion` is a hand-written allowlist — the second of which **dissolved RR-C2's two-shapes wrinkle outright**, since a parent array holds one copy of every reference. What's left on the whole map is two hardware/legal verifications, one upload-strategy ticket behind them, one grading prototype, and RR-07's authoring remnant.

> ⚠️ **Open cost item, 2026-08-06.** RR-A2 defaulted `takeLimit` to unlimited and made takes append rather than replace, so **RR-A1's 599 MB-per-assignment ceiling no longer holds** — per-assignment media is now unbounded by default. Every closed ticket that priced storage, upload or retention (**RR-A1, RR-03, RR-04, RR-A6**) carries the consequence in place. This is a known, accepted trade, not an oversight.

> 🔴 **Correction, 2026-08-06 (RR-05):** RR-A3 sub-decision 1 gates video with **"the district holding the switch"** via `global_permissions`. **That is not what the mechanism does.** `firestore.rules:749-752` is `allow write: if isAdmin()`, where `isAdmin()` reads SpartBoard's own `/admins/{email}` collection — a district admin cannot flip it, and district scoping exists only as a `buildings[]` allowlist inside one global doc. What RR-A3 described is a support workflow. **The gate is real and video stays gated; the owner was misidentified.** RR-05 sub-decision 5 answers it for AI by adding a second, district-owned consent switch on the organization doc, and the same argument applies to video — recorded in RR-A3 in place.
>
> **Correction, 2026-08-05:** RR-04's finding 3 claimed a live Gemini ToS violation. **It was wrong on both halves** — no student can reach Gemini (enforced by an email guard on every callable), and SpartBoard is on Gemini's _Paid_ Services via its Workspace account and Blaze billing, so nothing is trained on. The finding, the retraction, and the one question that genuinely survives are all recorded in place. **The "move to Vertex AI" recommendation is withdrawn.**
> **Correction, 2026-08-06:** RR-04 sub-decision 5 recorded that auto-start capture was **"dead — not by preference but by statute."** That overstated its own research, which called § 13.32 subd. 14(b)(1) merely _"relevant to"_ auto-start. With the institution consenting (RR-04 research finding 4) and the notice already rendered in advance, **the statutory bar does not hold and auto-start is a live design option** — it is now a per-question teacher setting (RR-A1 sub-decision 1). The **non-recorded alternative remains mandatory**, but on **RR-A4 finding 5** (ChromeOS policy hard-blocks capture for some students) rather than on § 312.3(d). The notice, the framing check and the always-on-preview kill are all undisturbed.
> **Related efforts:** pronunciation quiz question type (tracked in GitHub issues),
> [`docs/multilingual-pronunciation-engine-spec.md`](multilingual-pronunciation-engine-spec.md),
> [`docs/written-response-quiz-questions.md`](written-response-quiz-questions.md)

---

## Destination

**A locked spec for how students respond to assignments in modes other than
typing** — voice, video, whiteboard, and question-attached stimuli — covering the
response model, the teacher's controls over it, where the media persists and for
how long, and where the AI boundary sits. The spec is the destination; building
it is a separate effort.

The scope is the _response-capture layer_, not any one question type. The
pronunciation question type is one consumer of this layer, not the thing being
designed here.

> ✅ **Confirmed by Paul 2026-08-04.** Considered and rejected: **narrower**
> (audio only — would have cut RR-A3 and the whole B and C tracks, ~6 tickets
> left, at the cost of a near-certain migration once whiteboard's two-artifact
> +timeline response breaks the serialization chosen for audio); **wider** (all
> assignment surfaces at once — quiz is the only surface with a grading model
> today, so the others have nothing to generalize from yet); and **spec + build**
> (rejected — "Plan, don't build" stands as a standing preference for this map).

---

## Notes

### Domain

Student response capture across SpartBoard's assignment surfaces — quiz today,
plausibly video activity / guided learning / activity wall later.

### Skills every session should consult

`/grilling` and `/domain-modeling` are the default. `/prototype` for the tickets
marked **prototype** — make the cheap rough artifact and react to it rather than
arguing in the abstract.

### Grounding — what already exists (verified in the codebase 2026-08-04)

These are load-bearing. Several tickets are really "should we reuse this or not?"

| Thing                                                                                            | Where                                                                                                                                                                                                                                  | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student media upload already works**                                                           | `storage.rules` → `activity_wall_photos/{sessionId}/{fileName}`                                                                                                                                                                        | Students get `create`-only (the rule is `request.auth != null`, written for the anonymous era — under SSO-only it can tighten to a `studentRole` + `classIds` check). 10 MB cap, contentType allowlist, existence-check on the parent session doc to stop DoS uploads to guessed ids. Teacher archives to Drive, then deletes the temp Firebase copy. **This is the persistence precedent** — RR-03 is largely "does this pattern generalize from photos to A/V?" |
| **Quizzes live in the teacher's Drive**                                                          | `QuizMetadata.driveFileId`, `hooks/useGoogleDrive.ts`                                                                                                                                                                                  | Firestore holds metadata + responses only. Drive folders today: `Backgrounds`, `Drawings`. Student names/PII live _exclusively_ in Drive.                                                                                                                                                                                                                                                                                                                         |
| **A response answer is a `string`**                                                              | `QuizResponseAnswer.answer` in `types.ts:3467`                                                                                                                                                                                         | Every existing mode (MC / FIB / Matching / Ordering / short / essay) serializes to one string field. Media responses break this. RR-02 is the fork.                                                                                                                                                                                                                                                                                                               |
| **Students are SSO + pseudonymous uid**                                                          | `functions/src/studentIdentity.ts` (`studentLoginV1`, `computeStudentUid`), `context/StudentAuthContext.tsx`                                                                                                                           | Sign-in is `/student/login` → GIS → custom token. Email/name/sub/sourcedId **never persisted**; the Auth record gets no email/displayName/photoURL; uid is an HMAC of the OneRoster sourcedId; claims are `{ studentRole, orgId, classIds }`. Names resolve teacher-side via `getPseudonymsForAssignmentV1`. **A recording is identifying content regardless of a pseudonymous key** — that's RR-04.                                                              |
| **⚠️ The anonymous-PIN path is deprecated but still in the code**                                | `signInAnonymously` in ~40 files; `anonymous-join` is `defaultAccessLevel: 'public'` / `defaultEnabled: true` (`config/featureDefaults.ts:187`); `QUIZ_SSO_REDIRECT_ENABLED = false` (`config/constants.ts:16`)                        | **Deprecated by decision (Paul, 2026-08-04), not yet by code.** Design for SSO-only. An agent reading the repo cold will find PIN-derived response keys in the `QuizResponse` docblock, `tests/rules/quizPinCollision.test.ts`, and a live public `anonymous-join` gate — treat all of it as legacy, and don't let a ticket resolve toward preserving it.                                                                                                         |
| **Draft autosave + integrity toggles already shipped**                                           | `QuizResponseAnswer.status: 'draft' \| 'submitted'`, `BaseSessionOptions.tabWarningsEnabled` / `blockCopyPaste`                                                                                                                        | The written-response effort already built pause/resume and soft secure-assessment posture. Timed recording should extend this, not re-invent it.                                                                                                                                                                                                                                                                                                                  |
| **Per-question time limits exist**                                                               | `QuizQuestion.timeLimit` (0 = none)                                                                                                                                                                                                    | RR-A1's prep-time / recording-limit model has a field to extend rather than a greenfield.                                                                                                                                                                                                                                                                                                                                                                         |
| **Recording and mic/camera access both exist — and have never been joined** _(updated by RR-A4)_ | `hooks/useScreenRecord.ts` and `.../GuidedLearning/components/ScreenCaptureModal.tsx` record, both from `getDisplayMedia` (a screen). `Webcam/Widget.tsx:91` and `SoundWidget/Widget.tsx:184` acquire `getUserMedia` but never record. | All four are teacher-side. **Nothing in the repo has ever recorded a microphone or a camera.** Both recorders emit webm with no mp4 fallback — and RR-A4 established webm doesn't survive to Drive. `useScreenRecord`'s lifecycle logic is hard-won and worth extracting rather than rewriting; `ScreenCaptureModal` already reimplemented it and came out weaker.                                                                                                |
| **The whiteboard substrate probably already exists**                                             | `components/widgets/DrawingWidget/` — `useDrawingCanvas`, `useDrawingObjectsDoc`, `commands.ts` (command stack), `exportCanvas.ts`, `useDrawingPages`                                                                                  | An object model _and_ a command stack. RR-B1 is whether it can cross into the student app. Note `DrawingWidget` is one of only two widgets with `skipScaling: false`.                                                                                                                                                                                                                                                                                             |
| **AI gating pattern is established**                                                             | `functions/src/aiGeneration.ts` → `transcribeVideoWithGemini`; `global_permissions/video-activity-audio-transcription`; `config/featureDefaults.ts`                                                                                    | Admin-gated via a `global_permissions` doc checked **server-side in the callable**, with its own daily usage counter so costs are controlled independently. `ai-file-context` shows the `defaultMinTier: 'org'` pattern for gating Google-API features away from the free tier. RR-05 should follow this, not invent a new mechanism.                                                                                                                             |
| **A PDF viewer already ships**                                                                   | `components/widgets/PdfWidget/`                                                                                                                                                                                                        | Relevant to RR-C1's format list.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Standing preferences for this effort

- **Plan, don't build.** No implementation on this map.
- Prefer extending shipped patterns (activity wall storage, Drive-as-source-of-truth, `global_permissions` server-side checks) over new mechanisms. Where a ticket concludes "new mechanism," say why the existing one failed.
- Accessibility and student-privacy consequences are first-class ticket content, not a review-stage afterthought.
- Assume district Chromebooks and flaky wifi as the floor, not a MacBook on fiber.

---

## Decisions so far

<!-- One line per closed ticket: - [RR-NN Title](#rr-nn-title) — gist of the answer -->

- **[RR-01 — Is a response mode a question type or a per-question capability?](#rr-01--is-a-response-mode-a-question-type-or-a-per-question-capability)** — **Capability, not type.** A question carries a _primary response mode set_ (≥1, student chooses among them) plus an optional _addendum_ that the teacher may mark **required** and point separately. `QuizQuestionType` doesn't grow — `short` + `essay` collapse into one constructed-response type (6 → 5).
- **[RR-B1 — Can `DrawingWidget` be the student whiteboard substrate?](#rr-b1--can-drawingwidget-be-the-student-whiteboard-substrate)** — **Partly. Read-only already works; writable is blocked by a Firestore rule, not by React.** No timestamps exist anywhere, the command stack is never persisted, and undo destroys history — so timed replay needs a **new capture layer**. But ordered-untimed replay is **free today** from `z` ordering.
- **[RR-A4 — What do district Chromebooks produce, and what survives to Drive?](#rr-a4--what-do-district-chromebooks-actually-produce-and-what-survives-to-drive)** — **⛔ webm does not survive to Drive** — the mismatch is Opus audio, and audio-only webm isn't previewable at all. **The archive step must transcode** (MP4/H.264+AAC, or MP3/`.opus`). Video costs **~80× audio** and takes longer to upload than to record on school wifi. Nothing in the repo has ever recorded a mic or camera.

- **[RR-02 — How does a media response serialize into a `QuizResponseAnswer`?](#rr-02--how-does-a-media-response-serialize-into-a-quizresponseanswer)** — **A sibling `artifacts?: ResponseArtifact[]` field; `answer: string` untouched.** An artifact has a stable `id` with location as mutable metadata (Firebase path → `driveFileId`), an explicit stored `slot` and `kind` (text included — an MC question's required written justification has nowhere else to go), and its own `uploadState` axis **written before the bytes finish** so "recorded, never arrived" is visible. **Bulk payloads are always files**, which removes the 1 MB ceiling as a constraint entirely. Rules **cannot** validate arrays, so path integrity rides on a `{sessionId}/{studentUid}/` upload convention plus a reader-side prefix check.

- **[RR-03 — Where does student-submitted media live, for how long, and who owns it?](#rr-03--where-does-student-submitted-media-live-for-how-long-and-who-owns-it)** — **Drive is the durable home; Firebase Storage is a transit buffer.** Decided on cost: audio on Firebase is free at any plausible scale, **video is free nowhere**, and Drive is $0 durably plus Workspace-DPA covered. Archival fires **immediately per upload** via the already-stored server-side refresh token (teacher need not be present) — which forced an **amendment to RR-02**: server-written archival fields move out of `answers[]` into a sibling `artifactArchive` map. Firebase copy dies on successful archive, un-archived media swept at ~7 days (**risk accepted**; requires out-of-band failure email). Teacher's own Drive — **retention is district-lifecycle-bound**. Students get playback on the **published-results** screen only, uid- and publish-gated.

- **[RR-04 — privacy and consent posture](#rr-04--whats-the-privacy-and-consent-posture-for-student-voice-and-video)** — **Research:** pseudonymity buys nothing regulatory (COPPA § 312.2(8), SOPPA, SOPIPA name audio/video files directly); storage is defensible, **template extraction is not**; the dominant obligation is **notice, not consent**. **Decision:** media crosses into the district's Drive **under the student's real name** (the pseudonym shields SpartBoard's infra, not the school from its own records) while Firebase transit stays pseudonymous. A **hard contractual no** to voiceprints, speaker ID and **diarization** — which costs the automated-redaction capacity, so the **single-speaker capture policy is stated honestly as unenforceable** and § 99.12(a)'s fallback is accepted. An **org-admin review-and-delete console is a compliance precondition**, reusing RR-03's stored refresh token. The **Tennessen warning renders once per assignment** — killing auto-start capture, and making a non-recorded alternative **legally mandatory** (decides RR-07). **⚠️ Amends RR-03:** COPPA § 312.10 forbids indefinite retention, so archived media dies at **end of the current school year**, not merely at district lifecycle.

- **[RR-A3 — Is video a separate mode from audio, or one mode with a camera toggle?](#rr-a3--is-video-a-separate-mode-from-audio-or-one-mode-with-a-camera-toggle)** — **Video ships, dark by default, with the district holding the switch** (`global_permissions`, server-side, the shipped `defaultMinTier: 'org'` pattern). `'audio'` and `'video'` are **peer modes** in RR-01's set — so the gate is **pure set subtraction**, and require-vs-permit falls out of the set with no new flag. A gated-off mode is filtered at runtime; an emptied set falls to **RR-04's already-mandated non-recorded alternative**. Video adds a **framing check before arming** (a mirror and a sentence — no detection, which RR-04 forbids by contract), which is compatible with RR-04's preview kill because that kill targeted notice given _in advance_. Cost is bounded by a **quality ceiling, not a shorter clock** — RR-A4's 2.85 GB was measured at Chrome's default bitrate. ⚠️ Provisional in one direction only: RR-A5 and RR-09 q4 can still argue video down, never up.

- **[RR-A1 — What's the timing model for prep time and recording limits?](#rr-a1--whats-the-timing-model-for-prep-time-and-recording-limits)** — **The prep-expiry branch is a per-question teacher setting** (`auto-start` / `auto-advance` / `armed` / `unanswered`), not one product-wide behaviour. ⚠️ **Amends RR-04:** the auto-start kill **does not hold** — the § 13.32 citation was a research flag, not a finding, and institutional consent plus the already-rendered notice discharge the objection. The mandatory alternative **survives on RR-A4 finding 5** (ChromeOS policy blocks capture for some students) rather than on law. Timing lives in a new `recording` block because `timeLimit` feeds **speed-bonus scoring**, which is now unavailable on recording questions by design. Video's ceiling is **480p / 500 kbps** — 4.0 MB a take, **599 MB an assignment (was 2.85 GB)**, 16 s to upload. **Hard stop with a wrap-up warning**, no grace tail, because a grace tail is a longer limit told dishonestly. Framing check **once per assignment** with a **continuous self-view** during capture. **A lost take is lost** — nothing is written until the student commits, which forecloses streaming upload and binds RR-A6. Defaults prep 30 s / limit 60 s; max 300 s audio, **120 s video** because assignment totals aren't duration-independent.

- **[RR-08 — What counts as "answered" when a question has a required addendum?](#rr-08--what-counts-as-answered-when-a-question-has-a-required-addendum)** — **Every question the student leaves behind writes an entry**, so absence in `answers[]` means only "hasn't got there yet" — which fixes RR-A1's `'auto'` stall as a side effect of fixing the nine other presence-based consumers it couldn't see. **Two axes, two fields:** `status` keeps meaning finality, untouched; a new sibling `unresponded` says whether the student responded at all — because RR-A1's four expiry values disagree about finality, and one field can't say _"final, and never responded to."_ **Submit blocks on a missing required addendum** (Paul, against my recommendation), which obliged three payments: **nothing substitutes for a required mode** — no text fallback, the slot stays empty marked `capture-unavailable`, so the block only binds students for whom it was ever satisfiable; **the idle sweep marks empty required slots** at **zero extra read cost**, because `publicQuestions` is on the session doc it already batch-reads; and **the block on an in-flight upload is bounded**, because a lost take is lost and the tail is RR-A6's unknown. **One completeness predicate** drives both the progress count and the submit gate — they must agree or the student can't act on either — binary for students, three states for the teacher. **The recording clock governs the addendum slot only.** The `submitAnswer` spread fix gets **its own ticket ahead of RR-02**, and it is _not_ one line: a naive spread resurrects a stale `speedBonus`.

- **[RR-A2 — What recording controls exist, and what does a retake mean for validity?](#rr-a2--what-recording-controls-exist-and-what-does-a-retake-mean-for-validity)** — **The block stands; refusal is possible and completion doesn't follow from it.** The collision RR-08 handed over **dissolved rather than resolved**: § 13.04 subd. 2 requires _stating_ whether refusal is permitted and what it costs, and both have true answers, so it was never a compliance question. **Discards are never counted and never written** — no Firestore write anywhere records a child's refusal, and a budget counting them would be a countdown to a permanently unfillable slot. `takeLimit: number \| null` in RR-A1's `recording` block, mirroring `attemptLimit`, counting **takes not re-takes**, **defaulting to unlimited** (Paul, against my recommendation) — which means **RR-A1's 599 MB assignment ceiling no longer holds and per-assignment media is unbounded.** Takes **append as sibling entries with an explicit `takeIndex`** (Paul, against my recommendation, held after I corrected the argument I'd given for it), so **four first-occurrence-wins consumers must become highest-index-wins with earliest-`answeredAt` as tie-break** — preserving the #1728/#1777 race guards exactly while letting a real retake win. Superseded takes are **kept**, which **withdraws RR-03's Drive-cleanup sharpening** and dissolves the token problem behind a delete that doesn't exist. **No pause** — and the charted "continuous or stitched?" premise was **wrong**, since `MediaRecorder.pause()` is native and continuous. Takes are **playable in the results view, never a column in the export**, because adjacency to `Warnings` would frame effort as an integrity signal. Enforcement lives in **RR-03's per-upload callable**; rules cannot do it under _either_ model.

- **[RR-05 — Where is the AI boundary, and what exactly is admin-gated?](#rr-05--where-is-the-ai-boundary-and-what-exactly-is-admin-gated)** — **The menu is one item and the gate is two.** Transcript-level ASR only — summarization, feedback drafts and rubric-assisted scoring are all declined, so **AI-assisted grading is now deferred twice**, the second time because RR-06 hasn't yet said how a _human_ grades these. **Teacher-initiated, one response at a time**, because `ai_usage` is keyed off the caller and an automatic path would bill with no owner — and because "a transcript exists only if a human chose to make one" is a different sentence in a privacy notice. **One press transcribes the winning take only**, which is the statement RR-A2 said this ticket owed. A **new `GlobalFeature` id**, deliberately not a reuse of `video-activity-audio-transcription`, since that district's yes was about a public video the teacher chose. ⚠️ **Four premises failed the codebase.** Nothing here has _ever_ sent student-created content to a vendor; there are **four** rival AI gating mechanisms, not one; the precedent is **fail-open in the client and fail-closed in the callable**, inert only because a hard-coded `isAdmin` hides it; and `global_permissions` is **SpartBoard-written, not district-written** (`firestore.rules:749`) — which **corrects RR-A3** and forced a second, district-owned consent gate on the org doc, because a switch a district can't operate can't carry a duty it legally holds. Failure modes **hidden for gates, explained inline for data**. The transcript is a `kind: 'text'` artifact in the same slot, inheriting one lifecycle — at the accepted cost of making a child's speech **greppable**, with no correction path.

- **[RR-06 — How do media responses grade, and how do they reach the gradebook?](#rr-06--how-do-media-responses-grade-and-how-do-they-reach-the-gradebook)** — **Grading is per-slot, and the score model grows a third state.** `GradeResult` gains `state: 'scored' | 'awaiting-grade' | 'not-attempted'` — chosen over a nullable score and over a predicate above the type, because a required field makes the **compiler walk all eight consumers**. At the gradebook the two absences **diverge**: `awaiting-grade` omits the student (extending `canScoreResponse`'s shipped _"better no grade than a wrong 0"_ verbatim), `not-attempted` pushes a real 0 — so **an incomplete question never reaches the gradebook before it's graded**. Whether that 0 is **excused is the teacher's call per response, with the reason shown**; an automatic `capture-unavailable` carve-out was rejected because excusing by shrinking the denominator makes two students in one class non-comparable. **A teacher may grade an earlier take** and the grade records `gradedTakeIndex` (Paul, against my recommendation) — which **reopened RR-05 sub-decision 3 deliberately**: the transcript now follows the **pin**, one per slot, replaced on re-press. Media comments are **time-anchored in milliseconds**, which kills `gradingSnapshot` for media (a take is immutable) and makes the transcript **disposable**. Grades key by **question + slot** — RR-01's owed sub-key. Scores show **provisionally and always marked**, never bare. The queue is **question-major**, which is this ticket's answer to its own wall-clock question and is deliberately an _ordering_ answer, since RR-05 removed the machine. 🔴 **And auto-graded slots stay auto-graded** (Paul, replacing the question): nine MC plus one video is **one** thing to hand-grade — sharpening RR-01, retiring the authoring-warning question, and making a mixed-state question legal. ⚠️ **Four premises failed the codebase**, one of them fatally: **there is no shipped rubric surface** (M12 Phase 3 is unbuilt), `gradeAnswer` can't express "ungraded" either so **the flat-zero bug already ships for essays**, the phantom-zero argument was **already written in-repo** for a different cause, and **RR-08 silently converts the export's "unanswered" cell into `'0'` for every question in every quiz** — scheduled work, lands with RR-08's change or before it.

- **[RR-B2 — Is the audio synchronized to the strokes, or just attached alongside?](#rr-b2--is-the-audio-synchronized-to-the-strokes-or-just-attached-alongside)** — **Synchronized, and it is far cheaper than three tickets had assumed.** Paul took the expensive branch against my recommendation; the toolset answer then revealed the "new timestamped event log" RR-B1 priced as a subsystem is **`DrawingCommand` plus a timestamp**, with `applyCommand` — pure, bidirectional, documented for exactly this — already the replay engine. **One armed take on one clock, blank canvas, mic and strokes armed together**, so a whiteboard response is structurally an audio take and inherits RR-A1's timing and RR-A2's takes wholesale. **Undo is an event in the log**: retractions replay, which RR-B1 called the real diagnostic signal and which is free under append-only — at the knowingly accepted cost that it is **surveillance of thinking**, and RR-04's notice must now say so plainly. **A silent take is complete** (SpartBoard never inspects a recording to decide whether a child responded), which makes the **mic-denied student's silent canvas take need no exception at all**. Drive gets **three separate previewable files** per response, not a bundle — the `.spartnb` container exists and was declined, because an archive only SpartBoard can open is the dependency Drive was chosen to avoid. Pen/eraser/colour **plus text and shapes** (Paul, and it is what made the log cheap — edits are `update` commands already in the union); no images, one page. **180 s default / 600 s max**, whose cost is grading wall-clock rather than storage. ⚠️ **Two findings reshaped the fork before a question was asked:** whiteboard objects are **mutable in place**, so the "free" middle option would have replayed final geometry in creation order — a process record that isn't one; and 🔵 **RR-B1's ⛔ Firestore-rules blocker dissolves entirely** — a take is buffered in memory and written once at commit as a `ResponseArtifact`, so no new collection, no new rule, and no 200-write amplification. What it relocates rather than removes: **a lost take is now ten minutes of work.**

- **[RR-B4 — What is a whiteboard response's canonical coordinate space and page size?](#rr-b4--what-is-a-whiteboard-responses-canonical-coordinate-space-and-page-size)** — **A fixed 1600×1200 logical page at a fixed 2× bitmap (3200×2400), everywhere, for everyone.** Chosen over per-artifact captured dimensions (a district record with no fixed size) and 0–1 normalization (no non-arbitrary rule for stroke width and font size once aspect varies). ⚠️ **Three of the four charted bullets were already answered by shipped code**: pointer input already divides by `canvas.width / rect.width` per axis and selection chrome already compensates, so the fixed page costs roughly _"stop feeding the ResizeObserver into `canvasSize`"_; `ScalableWidget`'s `canSpread: false` branch is already uniform-fit letterboxing in production; and `exportCanvas.ts` already renders a page to PNG at an arbitrary size. What the audit found instead is that **the failure is not student-only — the teacher's own widget already slides its artwork on every resize**, because objects are never rescaled. **Portrait is gated, not letterboxed** (Paul, against my recommendation): a phone held portrait gets a rotate-to-answer screen, because a viewport inside a _recorded_ take would force either archiving the student's camera as a second stream or showing a grader strokes appearing in a corner for no visible reason. **The gate is absolute and recorded** — a third value on the provenance field RR-B2 already owed RR-02, so a blocked student is never a bare blank. 🔴 **And the fix applies to the shipped teacher widget too** (Paul, against my recommendation) — **the first decision on this map to change existing behaviour** — which turned out to cost far less than I priced it: `migrateDrawingConfig` is a **read-time pure function** with no backfill, and the original canvas size is **derivable from persisted data** (`widget.w/h` through `computeWidgetPixelRect` against a constant `REFERENCE_VIEWPORT`) rather than guessed, exactly as the app already did once for widget bounds. 🔵 **The drawing widget's contents were the last absolute-pixel coordinate space left in SpartBoard.**

- **[RR-C1 — Which stimulus formats are in, and are they rendered in-app or handed off?](#rr-c1--which-stimulus-formats-are-in-and-are-they-rendered-in-app-or-handed-off)** — **The v1 list is exactly what the product already accepts: image, audio, video, YouTube URL, PDF — and doc/docx are refused.** Every included format has a shipped upload path _and_ a shipped render path, so v1 adds no format capability, only a new attachment point; refusing Office is the status quo, since `docx`/`msword`/`officedocument`/`mammoth` appear **nowhere** in the codebase. ⚠️ **The charted list had two errors**: it omitted **YouTube**, the app's primary video source, and it assumed a PDF viewer that doesn't exist — `PdfWidget.tsx:232` is an `<iframe>` on a Storage URL, so what was reusable was _"point an iframe at a URL,"_ not a renderer. Playback defaults to **full controls with a per-question teacher toggle** to play/pause-only, mirroring `allowSkipping` — **the restriction lever already ships**, enforced by a 250 ms poll that seeks the student back (`VideoPlayer.tsx:1-12`). 🔴 **PDF renders through pdf.js in-app** (Paul, against my recommendation), whose bundle cost I **overpriced** — `vite.config.ts` already isolates `@imgly/background-removal` by the same pattern — but which **makes RR-C2 harder**, since pdf.js needs bytes it can `fetch`, not a URL it can embed, and no bucket CORS config exists in the repo. 🔴 **A failed stimulus retries silently with no fallback and no record** (Paul, against my recommendation): the student answers without ever seeing the material, producing **a wrong answer indistinguishable from not knowing** — the first failure mode on this map that RR-07 cannot help with, because it is unknowable at authoring time. 🔵 **The strongest finding is that the app solved this once already**: GuidedLearning ships per-step `audioUrl`/`videoUrl` with non-destructive trims — while `QuizQuestion` carries **no media field at all**, making the quiz model the outlier. And its two shipped players **contradict each other** — GL audio has no scrubbing, GL video has full controls, neither deliberately.

- **[RR-C2 — How does a student get access to a file in the teacher's Drive?](#rr-c2--how-does-a-student-get-access-to-a-file-in-the-teachers-drive)** — **Gate where gating is free, follow the house pattern where it isn't, and move every stimulus byte out of Drive.** Image and PDF go to Firebase Storage behind a rules gate; audio, video and YouTube stay on public URLs, because gating them costs streaming or is impossible. The gate is **`request.auth != null`** — the shipped `global_pdfs` shape — chosen over the response-doc-existence predicate the audit called the only _sound_ one, because rules can construct a path but cannot query, so a per-student gate would force `{sessionId}` into the Storage path and a stimulus is authored **once per quiz and assigned to many sessions**: session-keying reintroduces per-assignment copying plus a cleanup story, the exact cost this ticket charted against option 1. 🔴 **The Cloud Function proxy died twice** — the audit killed it on scope (`drive.file` cannot reach an arbitrary teacher file), and the session killed it on redundancy: **`storage.rules:127-139` already does cross-service `firestore.get()`**, which I had asserted was impossible before checking. So the grounding brief's entire §6 cost analysis — concurrency, the 512 MiB buffering `driveArchive.ts:249`, cold starts, absent caching — was the price of a proxy nobody needs. **Three of the audit's six questions dissolved unasked**: an auth-only gate has no join requirement (so previews and projector use are free), a gated reference is a Storage path rather than a credential, and AV-to-Storage follows by construction. ⚠️ **This reverses RR-03's "Drive is the durable home" for stimuli on capability grounds** — Drive has no rules engine, `lh3` serves images only, and the `/preview` iframe cannot carry RR-C1's replay toggle. `drive.readonly` stays **closed for v1 but explicitly revisitable**; it is declared-but-unrequested today and the in-flight OAuth verification wants it pruned. Teacher-facing disclosure is **deferred to RR-09 with a named trigger**, so v1 ships no notice. 🔴 **Stated plainly because no sub-decision says it: SpartBoard has decided not to protect copyrighted stimulus material.** ⚠️ ~~And the map has its **first infrastructure requirement** — SDK byte reads need bucket CORS config, which does not exist, and the two shipped cross-origin consumers disagree about whether it already works.~~ ✅ **Measured false 2026-08-16 (RR-A5):** `firebasestorage.googleapis.com` serves the preflight itself — ACAO `*`, `Authorization` allowed — so **the map has no infrastructure requirement**, and the two "disagreeing" consumers both use `getDownloadURL` + `fetch` (`getBytes` appears nowhere in the app). What replaces it is a **code** requirement: a gated stimulus must be read with `getBytes`, because a download-token URL bypasses rules.

- **[RR-C3 — Does a stimulus attach to a question or to an assignment?](#rr-c3--does-a-stimulus-attach-to-a-question-or-to-an-assignment)** — **Follow the house pattern where it is load-bearing; depart from it exactly where its ordering semantics stop applying.** A stimulus array on `QuizData` (the quiz, not the assignment — content has always lived there, and `QuizAssignment` carries zero content fields), with each question holding a **pointer array** into it (Paul, against my recommendation, so one question can stack a shared passage and its own figure). **The pointer _is_ the grouping concept** — six questions pointing at one entry are a group, with no group object, no lifecycle, no orphan cleanup, and no `groupId` colliding with the six PLC-sync ones already in `types.ts`. ⚠️ **The precedent's own justification does not transfer** — a VA question is located _in_ the video, a GL step _on_ the image, and a quiz stimulus has no positional relationship to its questions — so the shape was adopted for a different reason than the one that produced it. 🔵 **The pointer is a stable id, not GL's `imageIndex`**, derived rather than asked because an index under a deletable array is silently **wrong-material** rather than missing-material: GL gets away with it because its array is a slide sequence where order is meaning, and a quiz stimulus array is a bag. The **replay policy moves onto the stimulus entry**, correcting RR-C1 sub-decision 2 in place — `allowSkipping` is session-level and structurally cannot be per-question — and it is the only home where "plays once" is coherent. **`shuffleQuestions` becomes component-aware** (connected components, because pointer arrays make sharing an overlapping-set graph rather than a partition) — one pure function, one call site, an order never persisted. Entries carry an **authoring-only label**. ⚠️ **Two premises the audit left standing failed verification**: GL's pinning idiom is _don't key at all_ (the one keyed element is keyed to force a **reload**, `GuidedLearningPlayer.tsx:722-727`), so pinning and attachment are separable; and `toPublicQuestion` is a hand-written **allowlist**, so nothing reaches a student by default — which **dissolves RR-C2's two-shapes wrinkle outright**, since a parent array holds exactly one copy of every reference. 🔴 **And the shuffle premise partly dissolved before it was asked**: each question renders its own stimulus, so scattering costs read-once **flow**, not validity. ⚠️ Sub-decision 3's price is the sharpest here — the array sits in `pullSyncedQuiz`'s rebuild path, so **a PLC peer's edit can replace a passage under a student mid-attempt**, the first content on this map that is neither snapshot-at-create nor append-only.

- **[RR-10 — What does the quiz editor become, and what does it refuse to let a teacher build?](#rr-10--what-does-the-quiz-editor-become-and-what-does-it-refuse-to-let-a-teacher-build)** — **The editor mostly already exists, and the one surface this ticket was certain it needed is the one thing the session decided not to build.** 🔴 **Its largest fork was wrong twice over:** the quiz editor is not a flat list but the **same `EditorWorkspace` two-pane shell as GuidedLearning and Video Activity** (whose own doc comment names all three), and it **already carries a `Questions | Settings` tab** with a parent-level panel mounted in it — so "should the quiz editor become GL's shape" was asking about a shape it already had, and the empty 44% detail pane on the Settings tab was a home nobody had noticed. **The stimulus library is not built at all: the picker _is_ the library** (Paul, replacing all three charted options) — an _"attach resource"_ popover on the question, where entries accumulate as a byproduct of attaching and both halves already ship (`DriveFileAttachment` is mounted **in this editor** today). It **manages as well as picks** — label, replay policy, delete, and a **pointer count**, without which editing a shared passage from question 3 silently rewrites question 7's material. **One `recording` block clamped to the lowest ceiling in the authored set**, which is fork A's real problem and one this ticket never named: RR-A3 makes `['audio','video']` mean _student chooses_, and the ceilings differ (300 / 120 / 600 s). 🔴 **A live non-blocking advisory in the editor** — the **first warn-but-permit surface in this codebase**, since every shipped guardrail either refuses the item or blocks the save — carrying degradation, the shuffle no-op, and completability, **alongside** RR-A3's pre-launch warning rather than replacing it, because only the launch-time one can see a gate that flipped after authoring. **Storage gets a neutral figure, not a warning** ("records up to N slots per student"): RR-A2's unlimited default is untouched and deliberate, so there is no total to warn against, and by RR-06 sub-decision 10 the slot count is both knowable and the thing that drives cost — which also answers RR-06's one optional item by construction. **RR-07 is not absorbed**; RR-10 owns the authoring-time signal, RR-07 keeps the policy. ⚠️ **Four premises failed the audit**, including the inventory table's own claim that `timeLimit` _hides_ (RR-A1 says **forced to 0**, and the house idiom is disable-and-explain, not hide), and 🔴 **the inherited dead-control finding was wrong in the worse direction**: VA's `shuffleAnswerOptions` is not dead but **ignored** — `QuestionOverlay.tsx:83-95` shuffles unconditionally, so setting it **false** is the silent failure. Every authored control now owes a **read-site test**.

- **[RR-07 — What's the alternate-format policy when a student can't use the required mode?](#rr-07--whats-the-alternate-format-policy-when-a-student-cant-use-the-required-mode)** — 🔴 **The ticket answers its own title with _"there isn't one"_ — there is no alternate format, and the mandatory floor is deleted.** Both supports had already been withdrawn without anyone noticing they were both gone: RR-A1 took the legal one, and **Paul took the functional one — mic access on student devices is grantable**, so RR-A4 finding 5 is a remediable config rather than a permanent wall. Four mechanisms at four times replace it: **allowlist at onboarding** (RR-A5 item 4, promoted from errand to deployment step), **told-and-moves-on at runtime**, **three-way teacher adjudication in the grading queue** (excuse / blank / offline substitute), and **RR-10's advisory at authoring**. ⚠️ **Paul's live-monitor proposal failed on a fact**: `QuizLiveMonitor` is a dashboard widget whose own header says _"during a live quiz session,"_ while `dueAt` appears five times in the assignment types — so homework has **no teacher awake**, and moving adjudication into the grading queue dissolves the latency and async problems together. 🔵 **RR-06 had already paid for Paul's no-silent-zero requirement**: `capture-unavailable` defaults to `awaiting-grade`, which sub-decision 1 **omits from the gradebook**, so a zero cannot auto-push — protection lands **at the slot, not the grade**. **Substitute means offline attestation** with a mandatory note, at the accepted cost that **no artifact ever exists**. ⚠️ **The automatic-trigger reasoning was wrong and Paul caught it** — a student can manufacture a capability failure, so "automatic" is student-raisable with extra steps; the conclusion survives on a different basis, that what makes faking attractive is **silence**, killed by telling the student, and **the detector is the count across a class, not a flag**. `Warnings` adjacency refused on RR-A2's grounds even after the equity objection withdrew. **Two policies stated explicitly** — degradation prevented upstream, device-blocked served at runtime. ⚠️ 🔴 **The whole resolution rests on RR-A5 item 4, which has never been run**; if it returns "no," sub-decision 1 reopens rather than adjusts, and **item 3 is promoted from a technical check to a design dependency.**

- **[RR-A5 — Verify format round-trip and capture policy on real district hardware](#rr-a5--verify-format-round-trip-and-capture-policy-on-real-district-hardware)** — **Nothing to verify.** Chromebooks are current and the app is approved; RR-07 stands unconditionally.
- **[RR-A6 — What's the upload strategy on the school-wifi floor?](#rr-a6--whats-the-upload-strategy-on-the-school-wifi-floor)** — **None for v1.** Audio is ~1 s a take; in-order queue decided in Phase 3.3; video numbers deferred with video.
- **[RR-09 — Get the four answers that only the district and Google can give](#rr-09--get-the-four-answers-that-only-the-district-and-google-can-give)** — **Answered by posture, not counsel.** Internal app; every persisted artifact lives only in staff Drive (hard constraint on Phase 3.3); transcription not planned, so q7 is moot.

**Destination confirmed** 2026-08-04 (not a ticket, recorded here so it isn't re-litigated): the spec covers all three tracks; narrower, wider, and spec-plus-build were considered and rejected. See the ✅ note under **Destination**.

---

## Frontier

Open, unblocked, unclaimed — takeable right now:

_**Nothing (2026-09-01).** RR-A5, RR-A6 and RR-09 closed on Paul's notes; RR-B3 is deferred with the whiteboard track. The map has handed off to implementation._

_Rebuilt 2026-08-09 after RR-10 closed. **The map now has no design tickets left,
and this time the claim has been checked against the fog before being made** — the
previous version of this block made it, was wrong within the hour, and the
correction is preserved below because it is the most useful thing this section has
ever recorded. What remains: **three errands that want a person rather than an
agent** (RR-A5, RR-09, RR-B3), **one upload ticket behind RR-A5**, and **RR-07's
remnant, which is now policy rather than surface**. Every one of those was open a
week ago for the same reason it is open now._

⚡ **The rule that ran this map is finished, and RR-10 gave it a fifth and final
result: the thing already existed, and the ticket had priced it against the wrong
editor.** RR-B2 found the "new timestamped capture layer" was `DrawingCommand`
plus a timestamp. RR-B4 found three of four charted bullets already answered by
shipped code. RR-C1 found question-attached media already built in GuidedLearning.
RR-C2's audit made a ticket harder and its grilling session inverted that back.
**RR-C3 found a precedent that was real, transferable, and right for the wrong
reason. RR-10 found the precedent _was the thing itself_** — the quiz editor is
already the same `EditorWorkspace` two-pane shell as GuidedLearning and Video
Activity, and it already carries a `Questions | Settings` tab with a parent-level
panel mounted in it. The ticket asked whether the quiz editor should **become**
GL's shape. **It already was.** Five sessions, five different failure modes of the
same assumption — that a thing not yet decided is a thing not yet built.

🔴 **The sharpest correction on this board is still one I had to make about my own
assertion, and RR-10 supplied a third of the family — this one inherited from the
map itself.** In RR-C2 I told Paul that Storage rules cannot read Firestore and
was wrong (five such lookups ship). In RR-C3 the error was the audit's: it read
`key={currentImageUrl}` as a persistence idiom when the comment above says it
exists so the element **reloads**. **In RR-10 the error was in the ticket's own
inventory table** — it asserted `timeLimit` **hides** when a recording mode is
present, citing RR-A1 sub-decision 3, which says no such thing (it says **forced
to 0**) and which contradicts the house idiom of disable-and-explain. **Nobody
wrote that claim maliciously; a charting pass inferred it and it read as
inherited.** The standing rules now number four: _check whether the repo has
already paid a cost before writing it into an option_ (RR-C1); _check whether the
repo has already built a capability before ruling it out_ (RR-C2); _read the
comment next to the mechanism before inferring what the mechanism is for_ (RR-C3);
and **_a claim in a ticket that cites another ticket is a claim, not a citation —
open the ticket_ (RR-10).**

🔴 **Five closed decisions now stand against my recommendation, and the newest one
replaced the entire question rather than picking from it.** RR-C1's pdf.js
renderer is the format that fits RR-C2's access model best. RR-B4's
teacher-widget migration cost far less than I priced it. RR-C3's pointer array
remains genuinely open, and **RR-A5 is still what will judge it**. And in RR-10,
offered three ways to build a stimulus library, Paul built none of them: **the
picker _is_ the library**, which turned out to fit RR-C3's own "the pointer is the
grouping concept" better than any of the three surfaces did. ⚠️ **The one that has
not been vindicated is still RR-C1's silent stimulus failure** — widened by RR-C2,
multiplied by RR-C3, and **RR-10 did not help it either**: the editor advisory
reports what is knowable at authoring time, and a stimulus that fails to load is
knowable only to the student, at the moment it matters.

_Rebuilt 2026-08-16 after RR-07 closed and RR-11 opened._ 🔴 **RR-07's resolution
changed what this section is for.** For three sessions it said the map's remaining
work was three human errands. That is still true of the **volume** — but **RR-A5
is no longer merely the tail dependency of an unblocked ticket. It is now the
premise of a closed one.** RR-07 deleted the mandatory alternate format on the
strength of _"mic access is grantable"_ — which is **RR-A5 item 4 asserted rather
than measured** — and if that comes back "no," a closed decision reopens. **The
map has never before rested a resolution on an unrun measurement**, and it should
be uncomfortable that the first time is also the sixth session in a row that
nobody has held the hardware.

⚡ **The rule that ran this map produced a sixth result, and it is the first one
that found the answer already written _inside the map itself_.** RR-B2 found the
capture layer was `DrawingCommand` plus a timestamp. RR-B4 found three of four
bullets already shipped. RR-C1 found the feature already built in GuidedLearning.
RR-C2's grilling dissolved its own expensive option. RR-10 found the editor
already _was_ the precedent. **RR-07 found that RR-A4 finding 5 had contained its
own remedy since 2026-08-04** — _"treat this as a deployment prerequisite, not an
optimization"_ sat one paragraph above the hazard it solves, and **five tickets
cited the hazard without ever citing the fix.** The standing rules now number
five, and the new one is aimed inward: **_a finding with two halves is not
finished until the halves have been read against each other_.**

**Takeable now:**

- 🔥 **RR-A5** — Verify format round-trip and capture policy on district hardware _(task, HITL)_ — **now the only thing blocking anything, and the only thing on the board no agent can do.** Sixth session running as the tail dependency of a **student-facing number**: RR-08 sub-decision 6 blocks Submit on an in-flight upload and refused to invent the threshold, deferring to RR-A6, which waits on this. RR-A2 sharpened it — takes append with `takeLimit` unlimited, so a student generates **back-to-back uploads on one connection**. 🔵 **RR-B2 added two**: test audio at the **600 s** ceiling, not 60 s, and confirm a policy-blocked microphone fails `getUserMedia` **cleanly and distinguishably**. 🔵 **RR-B4 added a third of a different kind** — allocate a **3200×2400** canvas on a district Chromebook and draw on it for ten minutes, because RR-B4 sub-decision 5 accepted ~31 MB of backing store as "survivable" on a guess. 🔵 **RR-C1 added the cheapest** — open a multi-page PDF in **pdf.js** and page through it. 🔵 **RR-C3 added the one that judges a decision** — render **two** stimuli stacked above a multiple-choice answer area in landscape and see whether a student can reach the options without scrolling. 🔵 **And RR-10 adds a sixth today, which is the first that tests an authoring surface rather than a student one**: with the stimulus picker being the only library UI and carrying no folders, no search and no sort, **attach a realistic amount of material and see where the popover stops working.** That number is also the input the new fog patch is waiting on. Also still: does district hardware encode **480p / 500 kbps**. **Needs a student Chromebook.** Harness: `docs/rich-response/rr-a5-capture-harness.html`
  - ✅ **One item came off this list 2026-08-16 without a Chromebook — RR-C2's `getBytes` CORS check.** Answered by two `curl` preflights against the live bucket: **there is no bucket-CORS requirement**, RR-C2's "first infrastructure requirement" dissolves, and the two shipped consumers said to disagree about it turn out to use the same mechanism as each other — **neither performs an SDK byte read at all**. Detail in the ticket. 🔵 **Method note, because it is the same shape as five previous sessions:** the item had sat here since 2026-08-07 labelled _"needs five minutes and a browser."_ It needed neither — it needed a request the repo could not answer and a person had never sent. **The next-cheapest item in the same class is checklist item 1 (does Drive preview Chrome-recorded webm), which tests _Drive_, not the hardware, and is the highest-value thing on this ticket that a non-Chromebook device can settle.**
- 🔥 **RR-09** — the questions only district counsel and Google can answer _(task, HITL, unclaimed)_ — **question 7 is still the one item on the map that can stop a capability from shipping**, and it is answered by sending an email. RR-06 added question 9 (does "excused" survive the LMS boundary). 🔴 **RR-B2's question 10 is not small:** sub-decision 3 records **undo as an event**, so a whiteboard take replays work the student erased — a category of data no other mode captures, and RR-04's notice has to state it plainly. **Questions 7 and 10 go in the same message.** Unchanged by RR-10 and unchanged for three sessions: it is slow to come back and blocks nothing, which is exactly why it should already be sent.
- **RR-B3** — What does grading 30 whiteboard-plus-audio responses look like? _(prototype)_ — **the most load-bearing open ticket on the map.** Still the only remaining empirical test of decisions two tickets made on reasoning alone (RR-06's question-major queue, RR-05's declined AI menu — this prototype is the only path that can reopen it), with a **concrete number to beat**: 180 s default / 600 s max. RR-B4 removed the last unknown from its inputs, so it now **tests rather than invents**. 🔵 **RR-10 sharpened what it is testing _against_**: sub-decision 6 puts a recording-slot count in front of the teacher at authoring time, and RR-06 sub-decision 10 says that count is the hand-grading count — **so this prototype now validates a number the editor has already promised a teacher.** It wants a person with a stopwatch.
- ~~**RR-11** — Does a documented accommodation need to be a product concept?~~ ✅ **Closed into Out of scope 2026-08-27, on the first question of its session** — the outcome this block predicted was legitimate turned out to be the one Paul chose. Accommodations stay teacher-mediated and invisible; reasoning in the ticket and gisted in **Out of scope**. **The board now has zero agent-takeable tickets, and this time the claim survives the fog check** (see below) — everything open wants a person: a Chromebook (RR-A5), an email (RR-09), a stopwatch (RR-B3).

**Still blocked:** RR-A6 (RR-A5 only) — **and that is the entire list**, unchanged
for four sessions. ⚠️ **But the dependency graph now understates the coupling**:
RR-A5 formally blocks one ticket and informally carries a closed one (RR-07) and
two fog patches. A blocking edge cannot express _"this measurement could reopen a
resolved decision,"_ so that relationship is written down here instead.

**Not tickets, but scheduled work this map created — four items, three of them
sharing a deadline against another change:**

1. **The `submitAnswer` spread fix** (RR-08 sub-decision 9) — lands **before RR-02's build**. Cheap now precisely because the trap is provably harmless _today_. RR-A2 added a second field (`takeIndex`) to what it protects.
2. 🔴 **The four-consumer `takeIndex` change** (RR-A2 sub-decision 5) — `quizScoreboard.ts:55-71`, `questionAccuracyStats.ts:1-35`, `useQuizAssignments.ts:2000-2035`, `useVideoActivityAssignments.ts:997,1028` must move from first-occurrence-wins to **highest-`takeIndex`-wins, ties broken by earliest `answeredAt`**. **It lands with the append change or before it, never after.**
3. 🔴 **The "absent means unanswered" fix — four sites** (RR-06 finding 4): `assignmentExportShared.ts:170-178`, `quizDriveService.readPlcSheet`, `plcContributions.ts:99-114`, `quizDriveService.ts:718-741`. **Lands with RR-08's always-write change or before it, never after.** Wider than item 2 — that one mis-grades a student with several takes; this one mis-reports every student on every question in every quiz.
4. 🔴 **The drawing page-space migration** (RR-B4 sub-decision 6) — read-time and pure, no backfill, behind a one-way `pageSpaceMigrated` flag. **The trap is the scalars**: `width`, `strokeWidth` and `fontSize` must scale by the same `k` or every migrated drawing returns as hairline strokes and tiny text over correctly-placed geometry. The only item here that can visibly move a teacher's saved work — its own PR, its own before/after screenshots.

📌 **Six shipped inconsistencies the audits found, all belonging in issues rather
than here — and 🔴 RR-10 corrected one of them in the direction that makes it
worse.** From RR-C2: the two background-upload paths **disagree about Drive
sharing type** for the same asset class (`useStorage.ts:47` passes `userDomain`
→ `type:'domain'`; `useGoogleDrive.ts:85` passes `undefined` → `type:'anyone'`);
and `global_pdfs` is **readable by any anonymous student today** on both rule sets
(`firestore.rules:3320`, `storage.rules:108`). From RR-C3: the VA answer-key
exposure, and Matching/Ordering banks **re-randomizing with `Math.random` on
back-navigation**, defeating the stability guarantee `utils/quizShuffle.ts:10-12`
documents. 🔴 **From RR-10, correcting RR-C3's "dead shuffle controls" finding:**
VA's `shuffleAnswerOptions` is **not dead — it is ignored.**
`QuestionOverlay.tsx:83-95` shuffles MC and MA options **unconditionally**, keyed
by question id, and never reads the flag. So setting it **true** happens to match
reality and setting it **false silently does not** — the failure lands precisely
on the choice a teacher makes deliberately, which is strictly worse than a control
that does nothing in both directions. Only `shuffleQuestions` is genuinely unread,
and it is meaningless anyway because VA questions fire at timestamps.

📌 **Two shipped defects this map found and deliberately did not fix** — both
belong in issues: RR-05 finding 3 (`video-activity-audio-transcription` declares
`missingDocPublic: true` against a fail-closed callable, inert only because of a
hard-coded `isAdmin`), and RR-06 finding 2/3, that an **ungraded essay pushes a
real 0 into Google Classroom** today. RR-06 sub-decisions 1 and 2 fix it as a side
effect; until they ship, it is live.

⚡ **Exactly one ticket waits on another, and it waits on a measurement rather
than a decision.** Every design dependency this map charted has been paid. One
backward thread survives: **RR-B3's prototype is the only path that can reopen
RR-05's AI menu.**

🔵 **There is exactly one agent session left — RR-11 — and the claim that there
were none was wrong for the third time.** The version of this block before RR-10
said the map had no design questions left and was wrong within the hour. The
version after RR-10 said there was no next agent session, checked the claim
against the fog, and was **still wrong** — not because the fog moved, but because
**RR-07 spawned a ticket while resolving.** Both earlier misses were about fog
that had not been read; this one was about a ticket that did not exist yet, which
no amount of checking the fog would have caught. **The lesson is narrower than the
previous two: a resolution can create work, so the frontier is only knowable
_after_ a session, never before it.**

**The fog check has been run again anyway.** It holds two patches waiting on
RR-A5 — the stimulus picker at thirty entries, and the new un-allowlisted-district
patch — and both name RR-A5 explicitly rather than waiting on someone to notice
them. Nothing else in the fog names another patch as its blocker, which was the
signal the three authoring patches were sending before RR-10.

**What should happen next, in this order of value:**

1. 🔴 **RR-A5 item 4 — and it is no longer one errand among three. It is the only item on this map that can reopen a _closed_ decision by coming back "no."** Ask the district Chrome admin to allowlist the origin in `AudioCaptureAllowedUrls` for the student OU. It blocks RR-A6, judges RR-C3's pointer array, tests RR-B4's canvas guess, checks RR-C1's pdf.js choice, supplies the picker patch's number, sizes the new un-allowlisted-district patch — and now **carries RR-07's entire resolution**. **Seven sessions have added something to it. Nobody has held a Chromebook, and nobody has sent the email.**
2. **RR-09 questions 7 and 10**, one message, slow to return, and question 10 is the only other item that could send a **closed** ticket back.
3. ~~**RR-11**, the one an agent can take.~~ ✅ Closed into Out of scope 2026-08-27.
4. **RR-B3**, which wants a stopwatch and now has a number the editor has already promised a teacher.

⚠️ **What an agent should not take is RR-B3** — it is a prototype whose entire
output is a measured wall-clock number, and running it as an agent session would
produce a confident estimate of exactly the quantity two closed tickets already
estimated confidently. **What an agent _can_ take is RR-11**, with the caution
recorded on it: **decide the scope question at the top of the session**, because
the honest answer may be to close it into **Out of scope** rather than to design
anything — and that is a result, not a failure.

🔴 **A standing note this map has not needed before.** RR-07 is the first closed
ticket whose resolution rests on an **unrun measurement**. That was the right call
— Paul has first-hand knowledge of his own district's Chrome admin console, and
refusing to decide until someone opened it would have parked the ticket
indefinitely — but it means **the map now carries a decision that a single email
could invalidate.** Until RR-A5 item 4 comes back, treat RR-07 sub-decision 1 as
**decided and provisional**, and do not let a later ticket cite it as settled
ground without citing this line too.

⚠️ **The caution written here for RR-10 half-held, and the half that failed is
worth recording.** It said fork B was the one place the map proposed an editor
rather than a field, that the honest comparison was GuidedLearning's editor, and
to **"check what that actually looks like before pricing it."** The check was run
and went further than the caution expected: GL is not a comparison, it is **the
same shell**, and the quiz editor already had the surface. **The half that held**
was the RR-07 overlap — flagged here as something to decide at the top of the
session rather than discover halfway, and it was decided in the first question.
🔵 **Worth keeping as method:** both cautions were about checking a premise before
spending a session on it, and between them they saved the session from designing a
tab it already had and from discovering a ticket collision at the end.

---

## Tickets

### RR-01 — Is a response mode a question type or a per-question capability?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-04** · **Blocks (now unblocked):** RR-02, RR-03, RR-A3, RR-B2, RR-C2, RR-07

**Question**

You framed this yourself: "these question types (or perhaps these are features
that can be toggled on by teachers)". That fork is the foundational modeling
decision and almost everything downstream hangs on it.

- **As types:** `QuizQuestionType` gains `'audio' | 'video' | 'whiteboard'`. Clean grading semantics, clean authoring UI, but combinatorial — "essay _plus_ a whiteboard" needs a fourth type, and the union grows every time you add a modality.
- **As capabilities:** a question keeps its type and gains an _allowed response modes_ set. "Answer in writing, or by voice, or both" becomes expressible, and student choice-of-modality becomes possible — which is a genuine accessibility win (see RR-07). Costs: grading and `correctAnswer` semantics get murkier, and the authoring UI has to make the combinations legible without becoming the Canva-style overload the design principles rule out.

Note the existing type union already carries a helper (`isWrittenQuestionType`)
that branches grading on type — whichever way this goes, that pattern is the
thing being extended or replaced.

**Resolution** — grilled with Paul 2026-08-04, four sub-decisions:

**1. A response mode is a capability, not a question type.** It lives in
question config, never in the type tag.

**2. Two distinct concepts, modeled explicitly** (Paul chose this over "replace
only" and over "attach to any type"):

- **Primary response mode set** — the artifact that _is_ the answer. A set, minimum size one. A set of one means _required_: `['audio']` is "speak or don't answer." `['text','audio']` is "answer in writing or by voice, your choice." This subsumes the single-mode model rather than competing with it.
- **Addendum** — a second, separately-configured response ("…and explain how you know"). The teacher **may mark it required** and **may point it separately**.

**3. `QuizQuestionType` does not grow. It shrinks.** `'short'` and `'essay'`
collapse into a single constructed-response type (union 6 → 5); the short-vs-essay
difference becomes text-mode config, which is most of what `placeholder` and
`maxWords` already are. Evidence: the two types differ in exactly one place in the
entire codebase — the `isEssay` prop on the student editor
(`QuizStudentApp.tsx:2584`), which controls editor size and richness. Every other
branch treats them as an inseparable pair.

**4. Migration is non-destructive.** Keep accepting `'short'` / `'essay'` in Drive
quiz JSON and normalize at parse time in `utils/quizDriveService.ts`. No batch
rewrite, and PLC-synced (`/synced_quizzes`) and shared quizzes keep working
untouched.

**Explicitly rejected:** adding `'audio' | 'video' | 'whiteboard'` to
`QuizQuestionType`. Killed twice over — a _set_ of modes can't be expressed as a
single type tag, and addenda make it combinatorial (`essay+whiteboard` would need
its own member).

**Implementation surface this creates** (for whoever builds it, not for this map):

- `isWrittenQuestionType` becomes `isConstructedResponseType`. Critically, the pair-check is **copy-pasted inline at ~16 sites** rather than routed through the existing helper — `hooks/useQuizSession.ts:320,406`, `hooks/useQuizAssignments.ts:2027`, `components/quiz/QuizStudentApp.tsx:1825`, `components/widgets/QuizWidget/utils/quizScoreboard.ts:79`, `.../WrittenResponseGrader.tsx:68`, `.../QuizResults.tsx:418,1814,1836`, `.../QuizEditorModal.tsx:206`, `.../QuizEditor.tsx:405,510`, `utils/plcContributions.ts:108`, `utils/quizDriveService.ts:39`. **Miss one and a new mode silently disappears** from grading, the scoreboard, or PLC contributions. Routing every site through the helper is a prerequisite, not a cleanup.

**Consequences accepted, and where they land:**

- A required addendum means **no question type is purely auto-graded any more** — an MC question with a required spoken justification has a manual grading path. Lands in **RR-06**. — 🔴 **Sharpened 2026-08-07 by RR-06 sub-decision 10, and the literal reading was wrong.** The _question_ has a manual grading path; **the MC slot does not.** Nine MC questions plus one video response is nine auto-graded answers and **one** thing to hand-grade. Manual grading is a property of the **slot**, never the question and never the type — so a question can return a mixed result (MC slot `scored`, video slot `awaiting-grade`) with its points the sum. This also retired RR-06's charted authoring-warning question: nothing is being turned manual, so there is nothing to warn about.
- Grading is keyed by question id today (`r.grading?.[q.id]`, `quizScoreboard.ts:79`). Two separately-pointed artifacts under one question id need a sub-key. Lands in **RR-06**. — ✅ **Paid 2026-08-07 by RR-06 sub-decision 7:** the sub-key is **`slot`**, the vocabulary RR-02 already stores on every artifact and RR-08's completeness predicate already runs on.
- **RR-07**'s alternate-format policy now has to cover addendum modes, not just primary ones.
- "What counts as _answered_ when the addendum is required?" is a new, sharp question → opened as **RR-08**.

🔵 **Clarified 2026-08-06 by RR-A3 (not a reversal).** Sub-decision 2 fixes the
mode vocabulary's first concrete members — `'audio'` and `'video'` are **peer
modes**, not one mode with a camera flag — which is what lets a district gate
operate as **set subtraction** rather than as a config rewrite.

That creates one case this resolution didn't anticipate: **a set can be emptied at
runtime even though it was never authorable as empty.** RR-A3 sub-decision 3
resolves it, and the split is worth stating plainly here since this is where the
minimum lives — **minimum size one is an _authoring_ rule.** Runtime filtering may
drive the set to zero when a mode is district-disabled, and the floor beneath that
is RR-04's mandated non-recorded alternative, not an error.

🔵 **RR-B2 (2026-08-07) put one more mode in the set, and confirmed it is one
mode and not two.** A narrated whiteboard arms mic and canvas together on one
clock and commits as one artifact, so the set gains `'whiteboard'` rather than a
pair that must be kept in step. It is also the first mode whose **gating differs
from its content**: it records a child's voice exactly as `'audio'` does but
carries no camera, so RR-A3's video gate does not name it and it ships ungated.
The set-subtraction model handled a case it was never tested against.

**Paul's notes:**

---

### RR-02 — How does a media response serialize into a `QuizResponseAnswer`?

**Type:** grilling + domain-modeling (HITL) · **Status:** ✅ **Closed 2026-08-05** · **Blocked by:** RR-01 · **Blocks (now unblocked):** RR-03, RR-08

**Question**

`QuizResponseAnswer.answer` is a single `string` and every shipped mode encodes
into it (`"term1:def1|term2:def2"` and friends). A media response has a storage
path, a duration, a MIME type, possibly a transcript, possibly a retake count —
and for whiteboard+audio, possibly two artifacts plus a stroke timeline.

Decide: overload `answer` with an encoded reference, or add a sibling field, or
make `answer` a discriminated union. Consider that `QuizResponse.answers` is an
**array on a single Firestore document** — ~~30 students ×~~ N questions × media
metadata has a 1 MB doc ceiling to respect. Also decide what a `'draft'` status
means for a recording that was started but never finished.

> ⚠️ **The framing above was wrong about the doc-size risk** — corrected during
> the resolution. `QuizResponse` is **one doc per student**
> (`/quiz_sessions/{sessionId}/responses/{responseKey}`, key = the student's uid,
> `types.ts:3503`). There is no 30× multiplier. At ~250 bytes of artifact metadata
> × 20 questions × 2 artifacts you sit around 10 KB against a 1 MB ceiling. **A/V
> metadata cannot threaten the doc.** The only genuine exposure was an inline
> whiteboard stroke timeline, which sub-decision 5 rules out permanently.

**Resolution** — grilled with Paul 2026-08-05, five sub-decisions.

**1. A sibling `artifacts[]` field. `answer: string` is untouched.**

```ts
interface QuizResponseAnswer {
  questionId: string;
  answer: string; // unchanged meaning: the primary answer, for every shipped type
  artifacts?: ResponseArtifact[]; // new, optional
  // ... answeredAt, isCorrect, speedBonus, status unchanged
}
```

Chosen over three alternatives. **Encoding a reference into `answer`** was killed
by RR-01: a separately-pointed addendum means one question owns two artifacts,
which a delimiter scheme encodes badly in a codebase that already carries four
ad-hoc delimiter formats. A **discriminated union on `answer`** was killed by
blast radius — the ~16 copy-pasted type-branch sites RR-01 catalogued would each
need to narrow, Firestore rules can't validate a union shape, and every read of a
legacy doc needs a runtime guard, all to buy correctness an optional field gets
for free. A **subcollection** (`/responses/{key}/artifacts/{id}`, like the
existing `history/`) was killed by the doc-size correction above: it turns the
student's single `onSnapshot` into two listeners and the teacher's results read
into 1+N, to solve a size problem that doesn't exist.

The decisive precedent is in-repo and already shipped: **`grading` deliberately
sits outside `answers[]`** so teacher writes don't rewrite the student payload and
the rules whitelist can lock students out of it (`firestore.rules:3006-3023`), and
**`ActivityWallSubmission`** (`types.ts:1625`) already pairs `content` with
`storagePath` plus an archival lifecycle. Sibling-not-overload is the established
pattern here.

**2. An artifact has a stable `id`; its location is mutable metadata.**

```ts
interface ResponseArtifact {
  id: string; // minted client-side at record-stop; never changes
  slot: 'primary' | 'addendum';
  kind: 'text' | 'audio' | 'video' | 'whiteboard';
  text?: string; // inline, `kind: 'text'` only
  storagePath?: string; // Firebase Storage; nulled after archival
  // ⚠️ AMENDED BY RR-03 (2026-08-05) — the four server-written archival fields
  // below MOVED OFF this interface into a sibling `artifactArchive` map keyed
  // by artifact id. RR-03 chose immediate per-upload archival, so a server
  // write lands while the student is still answering, and Firestore cannot
  // address array elements by field path (`answers[3].driveFileId` is not
  // expressible). Same reason `grading` sits outside `answers[]`. Student owns
  // `answers[]`; server owns `artifactArchive`. See RR-03 sub-decision 3.
  //   driveFileId?: string;
  //   archiveStatus?: string;
  //   archivedAt?: number;
  //   archiveError?: string;
  mimeType?: string;
  bytes?: number;
  durationMs?: number; // recorded client-side — Chrome webm reports Infinity
  uploadState: 'pending' | 'uploaded' | 'failed';
}
```

The `id` is the identity; `storagePath` and `driveFileId` are facts about where
the bytes currently are, which RR-03's archive step rewrites. **Making the path
the identity was rejected** because archival changes it — the reference would
either dangle or force the archive step to rewrite student-owned data — and
because a failed upload would then have no identity at all, so a recording that
happened couldn't be recorded as having happened. **Storing a resolved
`getDownloadURL()` was rejected on privacy grounds independent of the rest**: a
Firebase download URL is an unguessable but permanent bearer token to a child's
voice recording sitting in a Firestore doc, and RR-04 established these files are
per-se regulated personal information. Paths force an authenticated fetch; URLs
don't.

**3. One array, any `kind`, with an explicit stored `slot` — text included.**

This was forced, not chosen. RR-01 allows **an MC question with a required
written justification**; `answer` already holds the MC selection, so the
justification text has nowhere else to go. A text addendum is therefore an
artifact with inline `text` and no `storagePath`.

`slot` is **stored on the response, never derived from the question config at read
time.** A quiz can be re-synced mid-flight — that's exactly why `preSyncVersion`
exists — so a stored response and its current question definition can legitimately
disagree, and anything the response's meaning depends on has to travel with the
response. Rejected: a media-only array plus a separate `addendumText` field, which
splits the addendum across two locations by mode and gives RR-06's grading key and
RR-08's completeness check two code paths each. Also rejected: promoting the
primary text into `artifacts[]` too — most uniform, but it dual-writes on every
autosave and converts a purely additive change into a migration across every
quiz-reading surface.

**4. Upload state is its own axis, and metadata is written _before_ the bytes
finish transferring.**

`answer.status` keeps its exact current meaning — **student intent** —
so `isAnswerSubmitted` and the rules' status-transition gate are untouched. Each
artifact carries `uploadState` separately, because an upload is a **system process
that can fail after the student is finished and gone**: RR-A4 measured a 720p
minute at ~75 s of uplink against ~1 s for the same answer in audio. The two axes
fail differently — intent-draft is "I'm not done," `uploadState: 'failed'` is "I'm
done and it didn't arrive." Overloading `status` with `'recording' | 'uploading'`
was rejected outright: `status` lives on the _answer_, and one answer can hold two
artifacts in different upload states, so it structurally cannot represent the real
state.

**The write-first ordering is the substance of this sub-decision.** Metadata lands
in Firestore at record-stop, `uploadState: 'pending'`, and is patched to
`'uploaded'` when the transfer completes. A student who closes the Chromebook
mid-upload leaves a durable record, so the teacher sees "recorded, never arrived"
rather than "never answered," and a retry has something to resume against.
Rejected: writing metadata only on success — strongest consistency, least code,
and it makes a failed upload indistinguishable from never having recorded. On the
district-wifi floor this map assumes, that isn't an edge case, and it's precisely
the case where a student did the work and has no evidence of it.

_Note on the ticket's literal question — a recording **started but never
stopped** writes nothing, and that's correct. The student is still present and
mid-question; the failure the write-first ordering defends against is the student
being **gone**._

**5. Bulk payloads are always files. Nothing large is ever inline.**

A whiteboard stroke timeline is an artifact with a `storagePath`, exactly like
audio. The response doc therefore holds metadata only and its size is bounded by
question count regardless of what a student draws — **the 1 MB ceiling stops being
a design constraint at all.** The inline `text` field from sub-decision 3 is the
sole exception, already capped by the existing `maxWords`.

The second reason is privacy, not size: RR-04 established media responses are
per-se regulated personal information and RR-03 will define a deletion path. **All
student content in files means one deletion path.** Inline content would mean two,
and the Firestore one is the one people forget. Rejected: a size threshold with
inline-below / file-above, which buys speed on trivial payloads at the cost of two
read paths and two deletion paths forever, and doesn't help in the case that
matters — the student who drew a lot. Rejected: deferring to RR-B2, which would
have closed this keystone with its one production-breaking question still open.

**6. `artifacts[]` is untrusted data. A path-prefix convention plus a reader-side
check carries the integrity.**

⚠️ **Hard constraint discovered during the grilling: Firestore rules cannot
iterate arrays.** `answers` is already on the student write whitelist
(`firestore.rules:3023`) and `artifacts[]` nests inside it, so **every field
defined above is unvalidatable by security rules.** That's harmless for `answer`
(a student writing nonsense into their own answer is just a wrong answer) and not
harmless for `storagePath` — a student who writes a path pointing at a classmate's
recording gets it rendered in the teacher's results view under their own name.

The resolution: **Storage rules gate uploads by path** — extend the activity-wall
pattern so a student may only write under `.../{sessionId}/{studentUid}/...` — and
**Firestore treats `storagePath` as untrusted**, with the teacher's results view
refusing to render any artifact whose path prefix doesn't match that response's
`studentUid`. One comparison at a single render site; forging a path yields a
broken tile, not a misattributed recording. **Server-minted artifacts** (a
callable returns the only path the student may upload to) is strictly stronger and
composes with RR-05's server-side gating, but it costs a Cloud Function round-trip
before every recording begins on the flaky-wifi floor, and adds a failure mode
where a student can't start recording because the mint call timed out. Rejected as
disproportionate — but it is the escalation path if the prefix check proves
insufficient. **Accepting the forgery risk** was rejected because RR-04 makes the
failure mode "one student causes another student's voice to surface under the
wrong name," not "a wrong grade."

**Consequences, and where they land:**

- **`answer` is now legitimately `''` for a pure-audio response**, so "answered" can no longer be inferred from a non-empty string. Anything checking truthiness of `answer` to mean answered is now wrong. → **RR-08**, which this resolution unblocks.
- **The archive step writes `driveFileId` into the student's `answers[]`** — a teacher/server write into student-owned payload. Rules permit it (the teacher branch is unrestricted), but archival and a student's in-flight answer write **both rewrite the entire array** (`useQuizSession.ts:2359-2376`), so they can clobber each other. → **RR-03**.
- **The Storage path shape is now fixed** at `.../{sessionId}/{studentUid}/...` by sub-decision 6, which constrains RR-03's storage layout before it starts.
- **A `'pending'` artifact needs an owner.** The student is gone; nobody retries. Service worker, a prompt on next `/my-assignments` login, or a teacher-visible "ask them to redo it"? → **RR-A6**.
- **Duration is recorded client-side as `durationMs`** on the artifact — closes the "Duration metadata" fog patch, which was explicitly waiting on this ticket.
- **`ResponseArtifact` is deliberately shaped like `ActivityWallSubmission`.** If RR-03 concludes the archival lifecycle generalizes, the two should converge on a shared type rather than drift.

🔵 **Returned from RR-08 (2026-08-06) — one field added, and the second bullet
above turned out to be worse than it read.**

- **`QuizResponseAnswer` gains a second new field: `unresponded?: UnrespondedReason`.** A sibling to `artifacts?`, absent when the student responded. RR-08 sub-decision 2 chose it over a third `status` value because RR-A1's four prep-expiry behaviours disagree about finality, and one field cannot say _"final, and never responded to."_ `status` stays two-valued and keeps meaning intent.
- 🔴 **The clobber risk in the second bullet is not just archival-vs-student. `submitAnswer` clobbers _itself_.** `newAnswer` at `useQuizSession.ts:2349-2357` is built as a **fresh object literal with no `...priorEntry` spread**, so `artifacts[]` is destroyed by the student's own next write to that question — a debounced draft autosave, a back-nav revisit, a timer-expiry write. Verified twice against source. **RR-08 sub-decision 9 gives it an owner**: a standalone implementation ticket with a regression test, landed **before** this ticket's build starts, while it is still provably harmless (`isCorrect` is recomputed).
- 🔴 **And it is not a one-line fix.** A naive `...priorEntry` spread resurrects the prior entry's `speedBonus`, which is currently included **conditionally**. The fix has to spread and then explicitly re-own every field the write owns.
- 🔴 **No Firestore rule can protect `artifacts[]`, and this is worth recording once so nobody goes looking for one.** The video-activity append-only guard (`firestore.rules:3470-3479`) works because those answers are appended — `hasAll(resource.data.answers)`. Quiz answers are **replaced** (filter-then-append at `:2359-2362`), so `hasAll` can never hold, and Firestore cannot validate array element shape at all. **The irony sub-decision 1 bought is now fully priced:** this field needs no rule change to be written, and none to be destroyed.

🔵 **RR-A2 (2026-08-06) added a field and broke one of this ticket's quiet
assumptions.** Three things:

1. 🔴 **`answers[]` may now hold more than one entry per `questionId`.** RR-A2 sub-decision 5 made takes append as siblings carrying an explicit `takeIndex`. This ticket's serialization was designed against one entry per question, and every reader that assumed it — including the four first-occurrence-wins consumers RR-A2 scheduled for change — is affected. `artifacts[]` and its `slot` are undisturbed; what changed is how many entries carry them.
2. **`takeIndex: number` is a new sibling field on `QuizResponseAnswer`**, alongside RR-08's `unresponded`. It is the sort key, not `answeredAt` — deliberately, so that a race-created duplicate (same index) and a genuine retake (higher index) stay distinguishable.
3. 🔴 **The `submitAnswer` spread fix is now load-bearing for a second field.** RR-08 sub-decision 9 scheduled it for `artifacts[]`; `takeIndex` is destroyed by the same missing spread. The fix does not get bigger, but the cost of skipping it does.

⚠️ **And a rules finding that extends this ticket's own:** RR-02 established that
rules cannot validate array **element shape**. RR-A2 sub-decision 9 adds that
quiz cannot adopt an append-only guard either — `hasAll` requires prior elements
byte-identical, and quiz students promote their own drafts to submitted, which
modifies an element in place. **Rules can validate neither the shape nor the
growth of `answers[]`.** Enforcement moved to RR-03's per-upload callable.

🔵 **RR-05 (2026-08-06) put the first machine-authored artifact in a student's
slot, and this ticket's schema cannot tell it apart from the student's own.**

1. ✅ **`kind: 'text'` was the right call and is now load-bearing for a second reason.** This ticket added it so an MC question's required written justification had somewhere to go. RR-05 sub-decision 7 reuses it for a **transcript**, which archives and expires alongside the recording it describes — one lifecycle instead of two.
2. 🔴 **A slot can now hold a student-authored artifact and a Gemini-authored one side by side, and `ResponseArtifact` has no field that says which is which.** `kind` says _text_; `slot` says _which question part_; nothing says _who or what produced this._ Every consumer — the grading view, the export, RR-04's admin console, a records request — has to distinguish "what the child wrote" from "what a model heard." **This wants a provenance field**, and it is cheaper to add now than to infer later from the absence of one.
3. **The `uploadState` axis gets a second kind of user.** A transcript is created by a teacher press that can fail, and it is not uploaded from a device. Whether it reuses `uploadState`, or whether that axis was only ever about bytes leaving a Chromebook, is this ticket's to say.

🔵 **RR-06 (2026-08-07) promoted `slot` from a serialization detail to the key the
grading model is built on, and asked this schema for one field it may not have.**

1. ✅ **`slot` is now load-bearing outside this ticket.** RR-06 sub-decision 7 keys grades by question **and slot**, and sub-decision 10 makes "does a human grade this" a property of the **slot** rather than the question or the type. The explicit stored `slot` this ticket chose — rather than a positional or inferred one — is what makes both possible. It is no longer only about where an artifact belongs; it is the unit of scoring.
2. 🔴 **Time-anchored annotations need a duration, and it isn't clear this schema carries one.** RR-06 sub-decision 6 anchors a teacher's comments to `from`/`to` **in milliseconds** into the take. A grading surface has to render a scrubber before the media loads — and a records-request export has to say how long a recording was without fetching it. **If `ResponseArtifact` has no duration field, this is where it goes**, next to the provenance field item 2 already wants.
3. ✅ **The provenance ask above got stronger, not weaker.** RR-06 sub-decision 5 makes a transcript **replaceable in place** when the teacher re-pins a take. So a slot can hold a student-authored artifact and a machine-authored one that is not even stable — which is a second reason "who or what produced this" cannot be inferred from `kind` alone.

4. 🔵 **RR-B2 (2026-08-07) gave the multi-artifact slot its first concrete inhabitant, and asked for one more field.** A committed whiteboard take is **three artifacts under one `takeIndex` in one slot** — audio, a `{ t, cmd }[]` command log, and a rendered final-state PNG — plus an optional `kind: 'text'` transcript, so the abstract case this ticket modelled now has a real shape and `kind` needs a value for a vector command log. 🔴 **The owed field is provenance on the _audio_, and it is the same ask as item 3 arriving from a new direction.** RR-B2 sub-decision 6 lets a student whose microphone is blocked by ChromeOS policy commit a **silent** take rather than losing the mode — and that artifact is byte-identical to one from a student who simply chose not to speak. Sub-decision 4 then says both are complete. **A teacher cannot distinguish them, and grading them identically is wrong**, so the distinction has to be carried in the model or it does not exist.
5. 🔵 **RR-B4 (2026-08-07) gave that owed field a third value, and pinned the PNG artifact's dimensions.** Sub-decision 4 gates portrait devices out of the whiteboard entirely and **records why the slot is empty**, so the provenance field separates not two cases but three: silent by choice, silenced by policy (no microphone), and **never presented** (no landscape surface). The third is different in kind — the other two produced a take, this one produces nothing — so a reader must be able to tell "recorded silence" from "no recording was ever possible." Separately, the `kind: 'image'` artifact in a whiteboard slot now has **fixed dimensions, 3200×2400**, for every student on every device (sub-decisions 1, 2 and 5) — which is a property the model can rely on rather than a value it has to carry.

**Paul's notes:**

---

### RR-03 — Where does student-submitted media live, for how long, and who owns it?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-05** · **Blocked by:** ~~RR-01, RR-02~~ (both closed) · **Blocks (now unblocked):** RR-C2

> 🔴 **Correction in place, 2026-08-07 (RR-C2).** Sub-decision 6's Drive proxy
> callable is specified against a scope that **cannot reach an arbitrary teacher
> file.** SpartBoard requests only `drive.file` on both the client grant
> (`config/firebase.ts:84-86`) and the offline grant
> (`functions/src/googleOAuth.ts:63`), and excludes `drive.readonly`
> deliberately. **For RR-03's own case this is harmless — the archived recording
> is a file SpartBoard itself created, so `drive.file` covers it** — but the
> resolution's text invited RR-C2 to reuse a mechanism that does not generalize,
> and RR-C2 spent an audit discovering that. The proxy works **because
> SpartBoard created the file**, not because a stored refresh token is powerful.
>
> ⚠️ **Also amended by RR-C2: "Drive is the durable home" does not extend to
> stimuli.** Every stimulus byte lives in Firebase Storage instead — not on cost
> grounds (RR-03's arithmetic is untouched) but on capability grounds: Drive has
> no rules engine so a Drive file cannot be gated, `lh3` links serve **images
> only** (`hooks/useStorage.ts:146-151`), and the Drive `/preview` iframe cannot
> carry RR-C1's replay toggle, which needs a real `<video>` element. **This is
> the first place the map has two storage homes with two different rationales**,
> which is the drift sub-decision 1 was written to prevent — so it is recorded
> here as a deliberate exception rather than allowed to happen quietly. The
> student-media lifecycle this ticket governs is entirely unchanged.

**Question**

You flagged this: "we have to be conscious of where this all saves and persists
(the teacher's drive)."

The activity wall already answers a version of it: student uploads to Firebase
Storage under a session-scoped path → teacher archives to Drive → the temp
Firebase copy is deleted. The open questions are whether that generalizes and
where it breaks:

- Photos are ~1 MB; a 2-minute 720p video is ~20 MB. The activity-wall rule caps at 10 MB and restricts `contentType` to `image/.*`. What are the new caps, and what does hitting one look like to a student mid-recording?
- Archival is **teacher-triggered** today. With 30 students × 5 questions of video, is archival still a button someone presses? What happens to media that's never archived — TTL sweep, orphan?
- Whose Drive, and what happens when the teacher leaves the district, or a PLC co-teacher needs access?
- Does a student have any right to retrieve or review their own submission afterward — via `/my-assignments`, or not at all? SSO makes this answerable (there's a durable uid to scope it to), where the PIN model made it awkward. Decide whether that's a feature you want.

**Sharpened by RR-02 (2026-08-05) — three inputs this ticket now inherits rather
than decides:**

- **The Storage path shape is already fixed** at `.../{sessionId}/{studentUid}/...`. RR-02's integrity model depends on it (Storage rules gate uploads by prefix; the results view refuses to render a mismatched prefix), so this ticket's layout decision starts from that constraint rather than a blank page.
- 🔴 **The archive step and the student both rewrite the whole `answers` array.** Archival sets `driveFileId` and clears `storagePath` _inside_ the student's `answers[]`, and `submitAnswer` rewrites that entire array on every write (`useQuizSession.ts:2359-2376`). A student answering question 7 while archival is patching question 3 clobbers one or the other. **This is a new, concrete decision for this ticket** — archive only after `status: 'completed'`, use dotted field paths / a transaction, or move the archival fields out of `answers[]` entirely (the `grading`-sibling trick, which exists for exactly this reason).
- **The artifact lifecycle is already shaped like `ActivityWallSubmission`** (`archiveStatus`, `driveFileId`, `archiveError`, `archivedAt`). If the archival flow generalizes, decide here whether the two converge on a shared type or are allowed to drift.
- **An artifact stuck in `uploadState: 'pending'` needs a retention answer too** — it has metadata and no bytes. Does the TTL sweep treat it as an orphan?

**Resolution** — grilled with Paul 2026-08-05, six sub-decisions. **Cost was the
governing constraint throughout**, stated by Paul as the primary criterion, and it
reversed the opening recommendation.

**1. Drive is the durable home. Firebase Storage is demoted to a transit buffer.**

Student records → Firebase Storage → transcode + archive to the teacher's Drive →
Firebase copy deleted. The Drive copy is the record; the Firebase copy is
in-flight state.

_This reverses the recommendation this session opened with_ ("Firebase home with a
retention clock, Drive archival opt-in"), which was argued on deletion control and
lost on cost and on FERPA posture. The verified arithmetic, against RR-A4's
measured 36 MB audio / 2.85 GB video per class assignment and Cloud Storage for
Firebase's published no-cost tier (**5 GB-months stored, 100 GB/month egress, 5K/month
upload ops** — [firebase.google.com/pricing](https://firebase.google.com/pricing)):

| Firebase-as-home         | Audio                            | Video                                        |
| ------------------------ | -------------------------------- | -------------------------------------------- |
| Storage, 60-day clock    | ~140 concurrent assignments free | **1.75 assignments** fills the tier          |
| Egress, one grading pass | ~2,800 passes/month free         | ~35 passes/month free                        |
| Beyond the free tier     | pennies (~$0.026/GB-mo)          | ~$0.12/GB egress — tens of $/mo per district |

So **audio on Firebase is genuinely free at any plausible scale; video is not free
anywhere.** The binding free-tier constraint is actually upload ops (150 recordings
per assignment ≈ 33 assignments/month project-wide), but overage there is
~$0.005/1K — cents. Drive, by contrast, is **$0 durably** and consumes the
district's own pooled Workspace storage rather than SpartBoard's bill.

**On the PII half of the question — Paul's instinct is well-founded and the
converse is genuinely unresolved.** Drive inside Workspace for Education is covered
by the Workspace DPA and Google's FERPA commitments; that is precisely why the
Drive-as-source-of-truth pattern exists in this codebase. Whether **Firebase**
carries an equivalent commitment is **literally RR-09's first open question** and
was deliberately not answered here by assertion. Two things that _are_ established:
SpartBoard **already** stores children's photos in Firebase Storage
(`activity_wall_photos/`) and every quiz response in Firestore, so whatever RR-09
returns, that exposure is already live and is not created by this ticket — and
activity-wall photos today have **no TTL at all**, so any clock is a strict
reduction.

The deletion-control objection that motivated the original recommendation turned
out to be **wrong on the facts**: SpartBoard holds the `drive.file` scope
(`functions/src/googleOAuth.ts:63`), so it _created_ these files and can delete
them through the API. A real deletion story exists on the Drive path.

**Honest costs accepted:** every archived artifact must transcode (RR-A4), which
moves cost from storage to Cloud Function compute — cheap for audio, genuinely
expensive for video; and the durable copy lives in an individual teacher's account.

**2. Archival fires immediately, per artifact, on upload.** _(Paul chose this over
the recommended scheduled sweep over completed responses.)_

Unattended archival is possible because teacher refresh tokens are already stored
server-side, AES-encrypted at `/users/{uid}/private/googleAuth`, Admin-SDK-only
(`functions/src/googleOAuth.ts`). **The teacher does not need to be present or
awake** — which is what makes immediate archival viable for take-home work.

Rejected: a **scheduled sweep over `status: 'completed'` responses** (the
recommendation — it would have dissolved RR-02's clobber race by construction and
avoided transcoding takes that get retaken, at the cost of a delay during which
the transit buffer is the only copy). Rejected: **teacher closes the assignment**,
which is a manual step that would be skipped indefinitely, making "never closed"
the most common path to an orphan.

**Two consequences follow directly and are accepted:**

- **A retaken artifact leaves an already-archived Drive file that must be deleted.** `drive.file` permits it (SpartBoard created it). → recorded on **RR-A2**.
- **Transcode compute is spent on takes that don't survive.** Wasted, and unavoidable under immediate archival.

**3. ⚠️ Amendment to RR-02: the server-written archival fields move out of
`answers[]`.**

Immediate archival means a server write lands while the student is still
answering, and **Firestore cannot address array elements by field path** —
`answers[3].driveFileId` is not expressible — so a server write into `answers[]`
racing `submitAnswer`'s wholesale array rewrite needs a transaction.

The fix is the pattern this codebase already invented for exactly this problem:
`grading` lives outside `answers[]` so teacher writes never touch the student
payload (`firestore.rules:3006-3023`). So **`driveFileId`, `archiveStatus`,
`archivedAt` and `archiveError` move off `ResponseArtifact` into a sibling
`artifactArchive` map keyed by artifact id.** Student owns `answers[]`; server owns
`artifactArchive`; no transaction, no race, and the rules whitelist stays truthful.
`storagePath` and `uploadState` stay on the artifact — those are student-written.

**RR-02's sub-decision 2 is amended accordingly**; its `id`-as-identity choice is
what makes the sibling map keyable at all.

**4. The Firebase copy dies on successful archive; un-archived media is swept
aggressively (~7 days).** _(Paul chose this over the recommended retry-then-hard-
delete-at-30-days.)_

Minimum exposure, minimum storage, and the transit buffer stays genuinely
transient. A metadata-only artifact stuck at `uploadState: 'pending'` whose bytes
never arrived is swept on the same clock — it is an orphan by definition.

🔴 **Risk accepted, recorded rather than smoothed over:** a week is short against a
school calendar. **A Google grant that breaks over a break week destroys a class
set of recordings before anyone is back at work to notice.** Two things make it
defensible rather than reckless, and both are requirements, not nice-to-haves:

- **Immediate archival surfaces failures within minutes**, not at the end of a scheduled cycle — the detection window is the whole reason 7 days is survivable where it wouldn't be under sub-decision 2's rejected alternative.
- **Failure must reach the teacher out-of-band.** The `/mail` outbound queue already exists (it sends org invite emails), so a failed archive can be emailed rather than left as a badge in a UI nobody has open. A silent failure state plus a 7-day sweep is data loss with extra steps.

**5. The teacher's own Drive, at `SpartBoard/Quiz Responses/{quiz}/`.**

Consistent with where the quiz file itself already lives (`QuizMetadata.driveFileId`) —
responses landing elsewhere would split one assignment across two ownership
models. Needs no provisioning, works identically for Orono and for any external
district, and requires nothing beyond the already-granted `drive.file` scope.
Rejected: a **district-designated shared drive** (survives departures cleanly and
matches how districts think about custody, but needs per-org provisioning and an
admin who knows what a shared drive is — too heavy for the external-availability
path, and shared drives aren't on every Education tier). Rejected: **auto-sharing
to PLC co-teachers**, which widens the disclosure surface by default exactly where
RR-04 counsels narrowing it.

**Teacher departure is explicitly the district's offboarding process, not a
product feature** (Paul: "the teacher loses access to their account when leaving
anyway so it gets cleaned up"). **This is a real answer to the ticket's "for how
long": archived media is district-lifecycle-bound, not SpartBoard-bound** — and
that is a retention promise SpartBoard can actually keep, which RR-04's decision
half needs. Accepted cost: `driveFileId` references dangle once an account is
suspended, with no warning.

**6. No student access before publish; playback on the published-results screen,
gated on the teacher publishing.**

The ticket asked whether a student may retrieve their own submission. The answer
splits on a distinction the ticket didn't draw:

- **Before submit**, review is local and free — the blob is still in the browser. That's RR-A2's UX territory and costs nothing.
- **After submit and before publish**, no access. The Firebase copy is gone within minutes and the Drive copy is teacher-owned.
- **After the teacher publishes results**, the recording plays back for its owner.

Published results are **already a shipped surface** (`scoreVisibility`,
`revealedAnswers`, and the results-protection layer `resultsTabWarnings` /
`resultsLockedOut`), so "no student access" would have contradicted working
behavior. The grading data itself — rubric scores, points, margin comments —
already lives in Firestore under `grading` and renders at zero cost regardless.
**Only the artifact needs a new path**, via a callable that proxies the Drive file
after verifying (a) the requester's uid equals the response's `studentUid` and (b)
results are published for that assignment.

Bounded three ways — published assignments only, owning student only, on demand
only — and the gate is **an explicit teacher act**, which under RR-04 makes it a
school official's disclosure decision rather than a standing exposure. It inherits
the existing results-protection posture for free. Rejected: **grade and comments
without playback** — feedback on a 90-second spoken answer the student cannot hear
is close to unusable, since they can't tell which part of their answer a comment
refers to. Rejected: **playback on demand regardless of publish state**, which
makes SpartBoard a standing access path to regulated media with no teacher act
gating it.

**Deliberately not decided here — and why:**

- **Storage size caps and the `contentType` allowlist for the new path.** The existing activity-wall rule is 10 MB / `image/.*`; RR-A4 measured 19 MB for a 60 s video at Chrome's default bitrate, so a cap must follow the bitrate policy rather than lead it. → **RR-A6**, which sets explicit bitrate caps.
- **What hitting a cap looks like to a student mid-recording.** → **RR-A1** / **RR-A6**.

**Consequences, and where they land:**

- **RR-02's `ResponseArtifact` shape is amended** (sub-decision 3) — archival fields move to a sibling `artifactArchive` map. RR-02's own resolution now carries a pointer to this.
- **The transcode step is now on the critical path of every upload**, synchronously, per artifact — not a batch job. That sharpens the "where transcoding runs" fog patch considerably; it still waits on RR-A5 to confirm transcoding is needed at all.
- **Superseded takes must be deleted from Drive on retake.** → **RR-A2**.
- **Archive failure needs an out-of-band notification path** (`/mail`), and it's a requirement of sub-decision 4, not a polish item. → **RR-A6**.
- **Video's cost problem is now quantified on both paths** — Firebase egress or Drive transcode compute, no free option either way. → another input to **RR-A3**.
- **RR-04's decision half inherits a retention answer**: district-lifecycle-bound in Drive, ~7 days maximum in Firebase.

⚠️ **AMENDED by RR-04 (2026-08-05) — "district-lifecycle-bound" was not a complete
answer.** COPPA § 312.10 requires a **published deletion timeframe**, and a teacher
may stay in a district for decades. This resolution was right about _ownership_ and
incomplete about _duration_. **Archived media now dies at the end of the current
school year** (assumed: a July 1 annual sweep, per-org overridable — SpartBoard has
no school-year concept today), preceded by a warning email. Sub-decision 5 above
(teacher's own Drive) is otherwise unchanged. See **RR-04 sub-decision 6**.

⚠️ **Also from RR-04:** the LEA review-and-delete obligation reaches media sitting
in an individual teacher's Drive. It is satisfied without amending this ticket —
by reusing the same stored-refresh-token mechanism this resolution established. See
**RR-04 sub-decision 4**.

🔵 **RR-08 (2026-08-06) narrows the orphan population this ticket's 7-day sweep
exists to catch, and adds a second server writer to `answers[]`.**

- **Fewer `'pending'` orphans by construction.** Sub-decision 4 accepted a risk on the reasoning that _"a metadata-only artifact stuck at `uploadState: 'pending'` whose bytes never arrived is swept on the same clock — it is an orphan by definition."_ RR-08 sub-decision 6 now **blocks Submit while an upload is in flight**, bounded, with a retry offered on failure — so the common way an orphan was created (student submits and walks away mid-upload) is largely closed. The sweep still needs to exist, but it should be catching genuine infrastructure failures rather than ordinary student behaviour. **The 7-day risk this ticket accepted is smaller than when it was accepted.**
- 🔴 **A second server-side writer touches `answers[]` now.** RR-08 sub-decision 5 has `finalizeIdleQuizAttempts` write an `unresponded` marker into required slots left empty at finalize — using `publicQuestions` off the session doc it already batch-reads, at zero additional read cost. That lands in **student-owned payload**, exactly like the archival write this ticket already flagged as a clobber risk, and on a document the student may still be writing to if they return. **The interaction is real**: the sweep only finalizes responses that are already idle past the cutoff and re-checks inside a transaction (`:415-428`), so the race is narrow — but "narrow" is what the archival clobber looked like too.

🔵 **RR-A2 (2026-08-06) withdrew one of this ticket's sharpenings, gave its
callable a new job, and removed the bound from its cost model.**

1. ↯ **This ticket's Drive-cleanup sharpening on RR-A2 is withdrawn.** It said _"the superseded Drive file must be deleted... or every retake leaves a duplicate in the teacher's folder."_ RR-A2 sub-decision 6 chose to **keep** superseded takes, so duplicates in the teacher's folder are the intended outcome. Nothing has to be deleted, and the grounding audit's §4 finding — **no `DELETE` verb anywhere in `functions/src/driveArchive.ts`**, plus a token problem behind adding one, since the file is the teacher's and the actor is a student — never has to be solved.
2. 🔵 **The per-upload archival callable is now the enforcement point for `takeLimit`.** RR-A2 sub-decision 9 found that Firestore rules cannot count entries per `questionId` under any model, and that quiz cannot carry an append-only guard at all. Because this ticket already routes every commit through a server-side callable with a stored refresh token, **that callable is the only place a per-question take budget can be enforced authoritatively.** It is a new responsibility for a function this ticket specified for archival alone.
3. 🔴 **The cost model assumed one take per question and no longer holds.** RR-A2 defaulted `takeLimit` to unlimited and made every committed take archive immediately under this ticket's own rule. **Per-assignment Drive volume is unbounded by default** — the "audio is free at any plausible scale, video is free nowhere" calculus is unchanged per-take but has no ceiling per-assignment. The 7-day orphan sweep and the immediate-archival design are undisturbed; only the totals are.

🔵 **RR-05 (2026-08-06) created an artifact that arrives after archival has
already fired, which this ticket's trigger model does not describe.**

1. 🔴 **"Immediate, per upload" is not a rule a transcript can obey.** RR-05 sub-decision 2 makes transcription a **teacher press in the results view**, which can happen an evening later or not at all — and sub-decision 7 says the resulting text is an artifact in the same slot, archived to Drive under this ticket's retention. So the slot's media archived on commit, and a sibling artifact wants archiving **days later, from a different caller, with no upload event to hang off.** This ticket owns the second trigger and has not specified it.
2. **The stored refresh token is already the right instrument, and it is already this ticket's.** The archival path runs server-side without the teacher present precisely so it doesn't depend on a session — that property is what makes a late transcript archivable at all. What's missing is only the entry point, not the capability.
3. ✅ **Volume is negligible and does not touch item 3 above.** A transcript is kilobytes against 4.0 MB of audio, and RR-05 sub-decision 3 caps it at **one per question per student** — the winning take only — so unlike every other consequence on this ticket, **the unbounded-takes default does not multiply it.**
4. ⚠️ **The folder convention question gets one more inhabitant.** The fog patch on what several takes look like in Drive now has to place a text file beside them, and "delete this response" has to mean the media _and_ its transcript or it means nothing.

🔴 **RR-06 (2026-08-07) created the first artifact on this map that is superseded
in place — which puts a Drive delete back on the table after RR-A2 had removed
it.**

1. 🔴 **A transcript can now be replaced, and item 3 above no longer holds unamended.** RR-06 sub-decision 4 lets a teacher grade an earlier take; sub-decision 5 makes the transcript follow that pin, **one per slot, replaced on re-press.** So the "one per question per student" cap survives — volume is still negligible and still not multiplied by takes — but the artifact is **mutable**, which no other artifact on this map is. RR-A2 kept every superseded take precisely so nothing would ever need deleting; this reintroduces the question for exactly one file type.
2. **Two honest options, and this ticket owns the choice.** Either the superseded transcript is left in Drive as a dead sibling (cheap, but a records request then produces two machine transcriptions of the same child disagreeing with each other), or the archival callable gains a delete using the same stored refresh token it already holds. **The capability exists; only the decision doesn't.**
3. ⚠️ **The second trigger from item 1 above now fires more than once per slot.** Whatever entry point this ticket specifies for late transcript archival has to be **idempotent and re-runnable**, not a one-shot hung off first creation.

4. 🔵 **RR-B2 (2026-08-07) triples the object count, and chose this ticket's model over a container the repo already ships.** Every whiteboard response archives as **three separate files in a per-response folder** — transcoded audio, a final-state PNG, and the event log as JSON. A single bundled `.spartwb` was the obvious alternative and it was **declined on this ticket's own reasoning**: `.spartnb` (a JSZip bundle with a manifest and inlined media) and `.spart` (dashboard JSON in a visible Drive folder, `googleDriveService.ts:333-343`) prove the container is already built, and nothing inside either previews. **A durable copy only SpartBoard can open is precisely the vendor dependency Drive-as-durable-home was chosen to avoid**, so audio and PNG go in previewable and the log rides along. ⚠️ **The cost lands on the folder convention this ticket owns:** it was designed for one file per question per student, and it now holds a **set per take** — ~450 objects for a thirty-student, five-question assignment. RR-04's review-and-delete console consequently deletes **sets**, not files.
5. 🔵 **RR-B4 (2026-08-07) made one of those three files a known quantity.** The archived final-state PNG is **3200×2400 for every response** (sub-decision 5), so the whiteboard's raster contribution to Drive is estimable in advance rather than per-student — line art at that size compresses to a few hundred KB, which is negligible beside the audio track it ships with. This is the one number in this ticket's storage model that is now **fixed by decision rather than by device**, and it is fixed deliberately: RR-B4 declined `devicePixelRatio` scaling partly because per-student PNG dimensions would have made a district record's size a property of the child's hardware.

**Paul's notes:**

---

### RR-04 — What's the privacy and consent posture for student voice and video?

**Type:** research (AFK) → grilling (HITL) · **Status:** ✅ **Closed 2026-08-05** — research half closed 2026-08-04, decision half resolved with Paul 2026-08-05 · **Blocks:** ~~RR-05, RR-06~~ (both unblocked)

**Question**

You didn't raise this one; I'm adding it because I think it's the ticket most
likely to invalidate work done in ignorance of it.

Students sign in via SSO (`/student/login` → `studentLoginV1`), and that path is
**deliberately pseudonymous, not merely PII-light**. `studentIdentity.ts` says it
outright: "Email / name / sub / sourcedId are never persisted… the Firebase Auth
user record never receives email/displayName/photoURL." The uid is an HMAC of the
OneRoster sourcedId (`computeStudentUid`); the custom token carries only
`{ studentRole, orgId, classIds }`; real names are resolved teacher-side via
`getPseudonymsForAssignmentV1`. That's engineered pseudonymity, not an accident of
the anonymous-join era.

**Media defeats it at the payload level rather than the key level.** The doc id
stays a pseudonym and the token stays claim-only — and none of that matters,
because a voice recording is biometric-adjacent and a video recording is a face.
The identifying information moves from the identifier (where the architecture
controls it) into the content (where it can't). No amount of uid hashing changes
that. Decide the posture before anything touches student audio:

- Does a recording count as an education record under FERPA, and does that change where it may be stored or which vendor may process it? (research)
- Does Orono — or a prospective external district — require parental consent for recording minors? Does that consent live in the product or offline? (research)
- Does pseudonymity still buy anything once the payload is identifying, or should media responses be treated as named data end-to-end — with whatever that implies for Firestore, Storage paths, and the teacher-side name resolution?
- What's the teacher-visible retention promise, and who can delete a recording?

**Research findings** — AFK research, 2026-08-04. **Not legal advice**; this is a
compilation of primary sources to inform a product decision, and several items
below genuinely need district counsel. The **decision half is still open.**

> ## 🔴 The pseudonymous architecture does not help here — three statutes say so in plain text.
>
> The framing in this ticket was right, and it's worse than "a recording is
> identifying content." These laws don't regulate the _identifier_ — they
> regulate the **payload**, directly and by name:
>
> - **COPPA, 16 CFR § 312.2(8)** — personal information includes _"a photograph, video, or audio file where such file contains a child's image or voice."_ No name required. No identifier required. **The file itself is the personal information.**
> - **Illinois SOPPA** (105 ILCS 85) enumerates _"photos, voice recordings"_ in covered information — listed **separately from** biometric information.
> - **California SOPIPA** (Cal. B&P § 22584) does the same.
>
> The HMAC'd uid controls the identifier. **Adding voice/video moves SpartBoard
> from "we hold pseudonymous keys" to "we hold per-se regulated personal
> information about children," and no amount of identifier hygiene reverses
> that.** Answering the third bullet above: pseudonymity buys **operational**
> protection (a leaked Firestore export is still not a roster), but **zero
> regulatory** protection. Design as if media responses are named data.

**1. FERPA — yes, a stored recording is an education record.** The test is
(a) directly related to a student and (b) **maintained** by the school or a party
acting for it ([SPPO FAQ](https://studentprivacy.ed.gov/faq/faqs-photos-and-videos-under-ferpa)).
A student recording themselves as an assignment answer is definitionally
"directly related"; storing it in your cloud under a district contract is
"maintained." _Owasso v. Falvo_ (2002) — papers aren't records until the grade is
recorded — **only helps for transient, never-persisted content**. Note it's
**retention** that triggers classification, **not grading or sharing**: a
recording is an education record from the moment of upload, whether or not a
teacher ever opens it.

⚠️ **The school-official exception forbids vendor self-use.** 34 CFR
§ 99.31(a)(1)(i)(B) requires direct district control and no redisclosure, and ED's
guidance holds that providers may not repurpose student data for their own
ends — including **product improvement** — and that **click-wrap ToS alone does
not satisfy the exception**. This collides head-on with finding 3 below.

⚠️ **Multi-student recordings.** 34 CFR § 99.12(a) plus
[Letter to Wachter](https://studentprivacy.ed.gov/resources/letter-wachter-regarding-surveillance-video-multiple-students)
require redacting or segregating other students' portions on an access request —
**and if that's infeasible, every affected student's parents may access the entire
record.** ED's guidance is written for video; **there is no audio-specific
standard for isolating one speaker from overlapping voices.** This is a live
problem for the whiteboard+audio track and for any classroom recording with
background voices.

**2. ✅ The biometric distinction holds — but only for storage, and only if you
never build the other thing.** Five statutes exclude raw recordings **by name**,
all keyed to identification purpose or template generation. Minnesota's is
explicit:

> **Minn. Stat. § 325M.11(d):** _"Biometric data **does not include**: (1) a
> digital or physical photograph; (2) an audio or video recording; or (3) any
> data generated from a digital or physical photograph, or an audio or video
> recording, **unless the data is generated to identify a specific individual**."_

Washington RCW 19.375.010, Texas Gov't Code § 560.001, Colorado § 6-1-1303(2.4)
and Virginia's VCDPA use near-identical language, and both FERPA (34 CFR § 99.3)
and COPPA (§ 312.2(10)) qualify "voiceprint" with _automated recognition_.
**Storing and playing back a submission generates no template and serves no
identification purpose.**

🔴 **The line is template extraction, not the recording — so these are out of
scope and should stay out:** speaker identification, speaker verification, voice
enrollment, **speaker diarization** (attributing who said what), face matching,
and emotion/biometric inference. Diarization specifically is the theory behind a
2025-26 BIPA class-action wave against AI transcription tools (_Brewer v.
Otter.ai_, _Cruz v. Fireflies.AI_, _Basich v. Microsoft_ — all pending, no
holdings).

⚠️ **Where the position is thin: Illinois BIPA has no audio carve-out.** It
excludes photographs but never mentions audio recordings, so the defence rests on
the meaning of "voiceprint." _Rivera v. Google_ supports the parity argument (the
line is the geometry scan, not the image) — but **_Delgado v. Meta Platforms_
expressly refused to "precisely delineate at what point voice data transforms
from a 'mere voice recording' into a 'voiceprint'"** and adopted a **"capable of
identifying"** standard rather than an actual-use one. Summary judgment denied.
BIPA reaches out-of-state vendors on a conduct basis, so a Minnesota HQ is no
defence — though **§ 25(e) exempts contractors of a unit of government**, which
argues for keeping any Illinois usage contract-gated rather than free/direct-to-teacher.

**Highest-leverage cheap artifact:** an affirmative representation in the DPA
that _SpartBoard does not derive voiceprints or perform speaker recognition_.

**3. ⚠️ CORRECTED 2026-08-05 — the "live Gemini ToS violation" recorded here was
wrong on both halves.** Paul caught it. Both errors were mine: I read the terms
page without checking either the codebase or the account tier. The retraction is
kept in place rather than deleted, because the corrected reading is load-bearing
for RR-05 and because the shape of the mistake is worth not repeating.

**Error 1 — "under-18 end users."** _No student ever reaches Gemini._ Not by
convention or by policy — it is structurally impossible:

- All four callables (`generateWithAI:346`, `generateVideoActivity:1478`,
  `transcribeVideoWithGemini:1762`, `generateGuidedLearning:2094` in
  `functions/src/aiGeneration.ts`) reject any request whose token carries no email.
- **Student tokens never carry an email.** `functions/src/studentIdentity.ts:42` —
  "the Firebase Auth user record never receives email/displayName/photoURL" — and
  `:606` states the invariant outright: _"Teachers authenticate with standard
  Firebase Auth (email present on token). Students never have email on their
  token."_
- Every client call site — the 13 importers of `utils/ai.ts` plus
  `admin/WidgetBuilder/GeminiPanel.tsx` — sits under `components/widgets/`,
  `components/layout/`, or `components/admin/`. **Zero** under
  `components/student/`, `components/quiz/`, `components/activityWall/`, or
  `components/miniApp/`.

Sentence one of the age clause — _"You must be 18 years of age or older to use
the APIs"_ — is satisfied. The API's users are teachers and admins.

**Error 2 — the free tier.** The terms tier on **account type, not on price**,
and I quoted only the price half:

> _"Your access to Google AI Studio is a 'Paid Service' **even when it is offered
> free of charge**, as long as the account you are using to access Google AI
> Studio has access to a Cloud Project with an associated and active Cloud
> Billing account **or is a Workspace enterprise account**."_

SpartBoard clears this bar twice over: the key is minted under a Workspace for
Education account, **and** its project is necessarily on Blaze — v2 Cloud
Functions and Secret Manager (`secrets: [GEMINI_API_KEY]`) each require an active
Cloud Billing account. So SpartBoard is on **Paid Services**, where Google
_"doesn't use your prompts or responses to improve our products"_ and processes
them under the Data Processing Addendum. **No training on inputs, no human
review.** The "do not submit sensitive, confidential, or personal information to
the Unpaid Services" line never applied to us.

|                         | Workspace for Education    | **Gemini Developer API** — as SpartBoard uses it                       | Vertex AI / Google Cloud                                                 |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| FERPA "School Official" | ✅ ToS § 7.3, explicit     | ⚠️ DPA governs, but the terms never mention FERPA, COPPA, or education | ⚠️ Cloud publishes a FERPA page; **Vertex/Firebase coverage UNVERIFIED** |
| Under-18 clause         | ✅ supported               | ✅ API users are teachers/admins only, enforced by the email guard     | no age restriction found in GCP ToS                                      |
| Trains on inputs        | ❌ not without instruction | ❌ **Paid Service** via Workspace account + Blaze billing              | ❌ SST § 17 training restriction                                         |

**No move to Vertex AI is indicated.** That recommendation existed only as a fix
for the two errors above.

**What actually survives — one thread, and it is a question for counsel, not a
finding.** Sentence _two_ of the age clause is scoped to the application, not the
user: _"you will not use the Services as part of a website, application, or other
service … that is **directed towards or is likely to be accessed by** individuals
under the age of 18."_ Whether the "API Client" is _SpartBoard entire_ (which has
student routes) or _the teacher authoring surface_ (which students structurally
cannot reach) is a reading, not a fact. The email guard is a strong argument for
the narrow reading. → folded into **RR-09**.

**One cheap check, because it is the single input above taken on trust:** confirm
the `GEMINI_API_KEY` secret holds a key minted in the SpartBoard Firebase/GCP
project rather than in a personal or unbilled project. Paid-Service status rides
on the key's owning project.

⚠️ **Also unverified and directly material: whether Firebase (Firestore, Cloud
Storage) is inside Google's FERPA-covered services.** That's where the recordings
would live. → **RR-09.**

**Design option worth a prototype:** the Web Speech API now supports on-device
recognition via `SpeechRecognition.processLocally = true`, which would sidestep
vendor transmission entirely. MDN marks it experimental and — importantly —
**does not guarantee audio never leaves the device**, only that recognition is
local. Also note the trap in the default path: **Chrome's standard Web Speech API
sends audio to Google's servers**, so "we just use the browser's speech
recognition" is not a privacy answer without that flag.

**4. Consent: school consent is the norm — but its legal footing is softer than
assumed.** The FTC **proposed** a school-authorization exception in its Jan 2024
NPRM and **declined to finalize it**; 16 CFR §§ 312.2 and 312.5 contain no
mention of "school" or "education." School consent therefore rests on non-binding
FTC FAQ guidance, on two conditions: the service must be **for the school's use
and benefit and no other commercial purpose** (which SpartBoard **satisfies** —
see the correction in finding 3; nothing submitted to Gemini is trained on), and
**if the operator doesn't give the school the ability to review and delete, the
school cannot validly consent.**

Only the second condition is open, and it is the one SpartBoard controls outright.

**→ An LEA-facing review-and-delete admin tool is a compliance precondition, not
a feature.**

Do **not** build on COPPA § 312.5(c)(9)'s audio exception — it requires deleting
the audio immediately after responding, which is the opposite of a graded,
retained submission.

**Minnesota specifics:** no consent requirement to record as such, and one-party
consent under § 626A.02 makes wiretap law largely irrelevant (the student is a
party). But **§ 13.04 subd. 2 (Tennessen warning)** is triggered by asking a
student to supply private data about themselves — purpose, whether they may
refuse, consequences, and who else may receive it. **That notice has to live
somewhere in the product UI**, since collection happens there. And **§ 13.32
subd. 14(b)(1)**'s instructional-purpose exception is conditioned on **advance
notice** — relevant to auto-start capture and always-on preview.

**5. Retention — no general deletion right, but indefinite retention is already
unlawful.** Neither FERPA (amendment ≠ erasure; the remedy is a statement of
disagreement) nor the MGDPA (challenge ≠ erasure) gives a parent a delete right.
But **COPPA § 312.10 has been fully in force since 2026-04-22**: _"Personal
information collected online from a child may not be retained indefinitely,"_ and
the operator must maintain **and publish in its privacy notice** a written
retention policy with purposes, business need, and a deletion timeframe.

⏱️ **Two clocks are tighter than expected — build to the shortest:**

| Obligation                                                                                             | Clock                          |
| ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| **MGDPA § 13.04 subd. 3 — provide _copies_** (FERPA only requires inspection)                          | **10 business days** ← binding |
| SDPC NDPA § 2.2 — parent review/delete via LEA                                                         | 30 days                        |
| FERPA § 99.10(b) — inspect and review                                                                  | 45 days                        |
| NDPA § 4.6 — disposal on LEA request or termination                                                    | 60 days                        |
| **Minn. Stat. § 13.32 subd. 13(d)** — destroy or return **all** educational data after contract expiry | **90 days**                    |

Also **§ 13.32 subd. 13(f): educational data must not be used for _any commercial
purpose_** — broader than typical student-privacy law, with a carve-out only for
deidentified aggregate data used to improve the service. **Whether model training
on student recordings survives that carve-out is unresolved and is the single
most important contract term to nail down** — voice and face data resist
deidentification.

⚠️ **COPPA § 312.2 defines "delete" demandingly** — _"not maintained in
retrievable form and cannot be retrieved in the normal course of business"_ —
reaching backups, CDN caches, **transcodes, transcripts, thumbnails, and waveform
data**. Against a media pipeline (and RR-A4 established there _will_ be
transcodes), that standard is where compliance actually breaks. **Derived
artifacts need a deletion story, not just source media.**

**§ 99.10(e): records under an outstanding access request may not be destroyed** —
a TTL sweep has to know about pending requests.

**Minnesota's records schedule is silent, and that's the finding.** The
controlling _General Records Retention Schedule for Minnesota School Districts_
(No. 00-43, **approved 2000**) has **no line item for coursework, assignments, or
student work product** — it predates student media submission entirely. Districts
can't dispose without a Panel-approved schedule (§ 138.17 subd. 7).

**6. Industry practice: the bar is low, and nobody has solved this.** Almost no
vendor publishes a specific retention period for student media — the norm is "we
keep it until the district tells us to delete it." Seesaw is the only one found
with a proactive number (18 months of account inactivity) and the strongest AI
statement (_"never used to develop, train or fine tune third party AI models"_) —
though that lives in help-center content, not the privacy policy. Padlet is the
only one with **automatic** deletion on termination (30 days) rather than
on-request. **No vendor's published policy addresses transcription of student
audio and where transcripts go, biometric treatment, or retention of derived
artifacts separately from source media.**

🔴 **The Flip/Flipgrid cautionary tale — the most instructive item.** Microsoft
retired it in 2024: the export window was **~3 months, self-service per user with
no bulk district export**, nothing migrated to Teams despite the framing, and all
remaining content was deleted unconditionally across 20M+ students. **A retention
promise is only as durable as the product.** Any commitment here should pair with
a **bulk, district-admin-executable export path** and a sunset window well beyond
90 days.

🔴 **The Student Privacy Pledge is dead** — retired by the Future of Privacy Forum
2025-04-25. Vendors still citing signatory status are citing a defunct program.
**Do not add it to SpartBoard.**

**What still needs Paul (the decision half):**

- Retention promise and its clock — teacher-visible, and who can delete.
- Whether media responses are treated as named data end-to-end (the research says pseudonymity buys nothing regulatory here), and what that implies for Storage paths and teacher-side name resolution.
- Whether to accept the AI boundary the research implies → feeds **RR-05**.
- Whether the export/deletion admin surface is in scope for this effort or a separate one.

**Requires district counsel, not more research:** whether school consent under
non-codified FTC guidance is a sound COPPA basis; **whether Orono's existing
media-release language covers student-_created_ coursework recordings or only
district-created media** (these are different, and enrollment forms usually
address only the latter — the research flagged this as the highest-value question
to ask); whether SpartBoard is a "technology provider" under Minn. Stat. § 13.32
subd. 1 (a conjunctive definition that gates both § 13.32 and the MCDPA); and the
IDEA § 300.624(b) vs. § 138.17 collision when a special-ed parent requests
destruction.

---

**Second research pass — consent specifically.** A deeper follow-up came back with
corrections and several findings the first pass missed. Where the two conflict,
this one is more specific.

**🟢 The headline is more permissive than expected: the dominant obligation is
NOTICE, not CONSENT.** Federally the school authorizes; in Minnesota, both
§ 13.04 subd. 2 (Tennessen) and § 13.32 subd. 14(b)(1) require **notice** and
neither requires consent. Corroborating evidence: **HF 22** (2025-26), a
"Parent's Bill of Rights" that _would_ have required written parental consent to
record a minor, **expressly exempted** "a purpose related to regular classroom
instruction" — and it didn't pass anyway. The most parent-protective bill
Minnesota has entertained carved out exactly this use case.

**⚠️ But § 13.32 subd. 14 binds the district itself.** It applies to "a government
entity **or** technology provider," and "school-issued device" expressly includes
**software** "provided to an individual student for that student's dedicated
personal use." **Being first-party buys no safety.** The escape is
14(b)(1) — noncommercial instructional purpose **with advance notice** — so the
notice isn't optional decoration, it's the thing that makes this lawful.

**🔴 The real risk is redaction capacity, not permission.** Two Minnesota Data
Practices advisory opinions reframe the question entirely:

- **AO 17-010** — an entity must have "the policies, procedures, and capacities to respond to any data practices requests," including, if it creates an audio recording, **"the capability to redact that recording appropriately."**
- **AO 19-004** — where a video contains two students, the school must segregate; **and where segregation is not possible, it must provide the unredacted video.**

**Translation: if Student A's video captures Student B in frame and B's parent
files a data request, the district may have to hand over A's assignment.** The
legal question was never "may we record" — it's whether the district can service
the access requests recordings generate. **This is a concrete argument for
defaulting to audio-only and making video opt-in per assignment.**

**🔴 Three COPPA provisions that hit shipped SpartBoard surfaces:**

- **§ 312.3(d)** — may not condition participation on disclosing more personal information than reasonably necessary. **This makes RR-07's alternate-format path arguably a legal requirement, not only a pedagogical one.** Noted there.
- **§ 312.2 "Disclosure"** covers making personal information publicly available "through the internet… a message board." **The `/activity-wall/gallery` route is a public posting surface.** A child's recording posted there is a disclosure, and it is not "solely for the use and benefit of the school" — so **school consent likely does not reach it.** → surfaced as a separate concern below.
- **§ 312.5(a)(2)** — parents must be able to consent to collection **without** consenting to third-party disclosure unless integral. Commentary treats **disclosure for AI training** as requiring separate consent. **Not triggered** — per the correction in finding 3, SpartBoard is on Gemini's Paid Services and nothing it submits is used for training. The clause stays relevant only as a constraint on any _future_ vendor.
- **§ 312.8** additionally requires a written children's-information security program with a named coordinator, annual risk assessment, and **written assurances from service providers**.

**Nuance worth keeping straight on biometrics:** the FTC **removed** the NPRM's
broader phrase "data derived from voice data, gait data, or facial data" from the
final rule as overbroad. So a raw recording is personal information under
**§ 312.2(8)** always; a **voiceprint or facial template** is _additionally_
covered under **(10)**. That's the same storage-vs-template line the state
statutes draw — federal law agrees.

**📋 Industry practice — zero counterexamples.** Two independent search strategies
found **no** K-12 school-channel product that shows students an in-app parental
consent dialog. In-product verifiable parental consent is a **direct-to-consumer**
pattern. What vendors build instead is **admin/teacher toggles plus a notice
artifact**:

- **Seesaw** publishes a standalone **"COPPA Direct Notice to Schools"** page — **this is the template to copy**; FTC FAQ N.1/N.2 require giving the school the same direct notice you'd give a parent, and that page _is_ the artifact district reviewers look for.
- **Amplify** (mCLASS/DIBELS oral reading recordings) is the closest analog to graded student voice — school-as-agent, FERPA school official, **zero in-product parental consent**.
- **Microsoft Reading Progress** — no parental dialog; the consent-adjacent surface is a **per-assignment video-required vs. audio-only teacher toggle**.
- **Google Workspace for Education** is the best precedent: Additional Services require the **admin** to obtain consent offline and flip a toggle, and Google supplies the district a **parent-notice template** — the vendor never touches a parent.
- ⛔ **Padlet is the anti-pattern.** _"You (or Your school) assumes the responsibility for complying with COPPA"_ is exactly the construction **FTC FAQ N.1 tells operators not to use**. Never write that.

**⚠️ The NDPA won't cover you here.** NDPA v2.2 STANDARD contains **no LEA
representation that it obtained parental consent or has authority to provide
student data** — LEA duties are four short sections. It also has **no video
checkbox, no biometric category, and no AI clause**; Exhibit "B" has exactly one
recording row (Assessment → Voice recordings), and video is reached only through
Exhibit "C"'s Student Generated Content definition. **A vendor-specific rider is
the gap most likely to matter.**

**🏫 Orono specifics** (its board-policy domain migrated, so the first pass 404'd):

- Orono's [Annual Notice / Student Privacy](https://www.oronoschools.org/about/technology/annual-notice-student-privacy) uses **opt-out via ParentVUE**, bundled into the directory-information notice. **No separate media-release form found.**
- Directory info includes **"photograph" — and nothing about video, audio, recordings, or classroom/instructional use**, and no internal-vs-external distinction. **No Minnesota district checked designates audio or video as directory information.**
- **Orono does not follow MSBA numbering** — its AUP is **Board Policy 518** (MSBA's 518 is DNR-DNI orders; MSBA's AUP is 524). **Don't hardcode "Policy 515" anywhere user-facing.**
- Ed-tech vetting runs through **LearnPlatform** — likely the real approval gate.
- Shakopee is the most useful comparison: its media opt-out is scoped **explicitly to external publication** and names instructional platforms in the carve-out.

**Direct answer to "does existing enrollment paperwork already cover this?" —
no, not via the directory-information opt-out.** That opt-out governs _release of
directory information to the public_; it designates "photograph," not audio or
video, and says nothing about _creating_ recordings. **The exception doing the
actual work is the FERPA school-official pathway, not parental consent.**

**Also worth tracking:** **COPPA 2.0 (S.836)** passed the **Senate unanimously
2026-03-05** and would extend protections to ages 13-16 **and finally put the
school-agreement exception in statute**. The House has not acted. Not law.

**What the research recommends** (product direction, for the decision half — not
decisions):

1. **Don't build an in-product parental consent dialog.** No comparable product does; it would signal to district privacy officers that the school-consent pathway isn't understood, and it wouldn't discharge the obligation anyway.
2. **Do build a standalone COPPA Direct Notice to Schools page**, Seesaw-style.
3. **Give the district in-product review + delete.** FAQ N.5 makes this load-bearing for the entire legal basis.
4. **Ship the Tennessen warning as a product surface, not a policy PDF** — four required elements, district-configurable, rendered at the record button. Element (b) requires telling students whether they may **refuse**, which converges with § 312.3(d) → **a non-recorded alternative for every recorded assignment.**
5. **Default audio-only; video opt-in per assignment** (AO 17-010 redaction capacity; mirrors Reading Progress).
6. **Default recordings private-to-teacher** — no cross-class visibility, no public gallery, no public short links.
7. A **district-managed per-student "recording allowed" flag synced from the roster** would be ahead of the market — no verified vendor consumes a media-release attribute over Clever/ClassLink/OneRoster today.

---

**Resolution** — decision half, grilled with Paul 2026-08-05. Six sub-decisions.
The research half above is unchanged; this is what Paul decided on top of it.

**1. Student media carries the student's real name — but only once it crosses into
the district's own Drive.** Firebase transit stays pseudonymous exactly as RR-02
specified (`{sessionId}/{studentUid}/`, HMAC uid); the Drive filename is
`Nguyen_Ava__Q3.mp4`.

The principle that draws the line: **the pseudonym's job is shielding SpartBoard's
infrastructure, not shielding the school from its own records.** A district's
Workspace-for-Education Drive is where identified education records are _supposed_
to live, under a DPA, in a system the district already controls. Opacity there
protects nobody who needs protecting and costs a great deal.

What it buys: the Drive folder is **self-sufficient**. It survives SpartBoard being
down, sold, or unrenewed — which is the only way a district can meet **MGDPA
§ 13.04 subd. 3's 10-business-day deadline to provide _copies_** (the tightest
clock on the board, tighter than FERPA's 45 days) without SpartBoard in the loop.
Set against the Flip/Flipgrid cautionary tale in the research above, this matters
more than it first appears: readable filenames are what makes the residue useful
after the vendor is gone.

What it costs, accepted: names propagate into the teacher's personal Drive search,
phone sync, and anything they later share carelessly. **Rejected: opaque ids
in-Drive** (the shipped Activity Wall precedent — `{submissionId}.{ext}`,
[driveArchive.ts:264](../functions/src/driveArchive.ts) — which works there only
because those submissions are already anonymous; here it would make a records
request depend on the app being alive and responsive inside ten business days).
**Rejected: opaque ids plus a `roster.json` manifest** — a folder containing the
mapping is just as identifying while being harder to use.

**2. A hard, affirmative "we don't do this" — no voiceprints, no speaker
identification or verification, no diarization, no face matching, no
emotion/biometric inference.** Written into the DPA and the privacy notice as a
representation, not merely omitted from the roadmap.

This is the cheapest high-value artifact the research found, and it buys the one
position that is genuinely thin: **Illinois BIPA has no audio carve-out**, and
_Delgado v. Meta_ expressly refused to say where a recording becomes a voiceprint,
adopting a **"capable of identifying"** test rather than an actual-use one. An
affirmative representation is worth more against that standard than the statutory
carve-outs alone.

**Plain transcription/ASR is unaffected** — it is transcript-level, not
template-level, and stays available to RR-05.

Accepted cost, and it is real: this **forecloses a feature class**, not just a
technique. Group-work attribution and speaking-time participation analytics are
things teachers genuinely ask for, and they are now off the table by commitment
rather than by backlog priority. **Rejected: leaving diarization open** — that is
precisely the theory in the 2025-26 BIPA wave (_Brewer v. Otter.ai_, _Cruz v.
Fireflies.AI_, _Basich v. Microsoft_, all pending), so it would keep SpartBoard
inside the exact litigation frontier the commitment steps out of.

⚠️ **This decision has a consequence sub-decision 3 has to absorb:** diarization
was the only plausible route to _automated_ speaker segregation in an audio file.
Ruling it out means SpartBoard will have **zero automated redaction capacity**,
permanently and by choice.

**3. A single-speaker capture policy, plus honest acceptance of § 99.12(a)'s
fallback when it fails.** Recordings are stated — in the pre-record notice, in
teacher guidance — to be meant to contain only the recording student. Headphone-mic
and staggered-recording guidance ships with it.

**The policy is unenforceable and the resolution says so.** Thirty Chromebooks
recording in one room will capture neighbors; no wording changes that. So when a
recording does catch another student and a parent files a request, the answer is
**34 CFR § 99.12(a) / Letter to Wachter / AO 19-004 as written**: segregate if you
can, and if you can't, every affected student's parents may access the whole
recording. That is the accepted consequence, not a gap to be papered over.

Why it's still worth stating a policy nobody can enforce: **"we set an expectation
and it was exceeded" is a materially better posture than "we never mentioned it,"**
and the notice surface that carries it is required by sub-decision 5 anyway — so
the marginal cost is a sentence. **Rejected: build a trim/mute redaction tool
first** — a waveform editor with re-encode-on-save and original-vs-redacted
versioning, gating media responses on a track where RR-A5 hasn't yet confirmed the
format even round-trips. **Rejected: accept silently with no policy.**

🔴 **This makes RR-09's question 4 sharper, not softer.** If Orono answers that it
has no redaction capacity either, then neither party to the contract can segregate —
and that is a concrete argument against shipping video at all. → **RR-A3.**

**4. An org-admin review-and-delete console, executing against Drive via the
teacher's stored refresh token.**

This resolves a collision between two already-closed decisions that was not visible
until now: **COPPA's school-consent condition requires SpartBoard to give the
_district_ review-and-delete ability, but RR-03 put the durable copy in the
_individual teacher's_ Drive**, where an org admin has no standing and SpartBoard
holds `drive.file` scope on the teacher's token only.

The resolution reuses the mechanism RR-03 already established: refresh tokens are
stored server-side, AES-encrypted, at `/users/{uid}/private/googleAuth`, which is
why immediate archival works without the teacher present. **The same property lets
an org admin's delete execute server-side against that teacher's Drive.** No new
capability, no RR-03 amendment.

Its one gap closes itself: a **departed** teacher's token is dead — and that is
exactly the case RR-03 already routes through district offboarding.

Note the legal footing honestly: the FTC **proposed** a school-authorization
exception in the Jan 2024 NPRM and **declined to finalize it**, so school consent
rests on non-binding FAQ guidance with two conditions. **Only the second — the
operator giving the school review-and-delete — is within SpartBoard's control, and
this decision is what satisfies it.** **Rejected: a shared org Drive** (reopens
RR-03, needs a shared drive provisioned per org as a Workspace edition dependency,
and forfeits the district-lifecycle-bound retention promise RR-03 supplied to this
very ticket). **Rejected: an out-of-band support queue** — arguably literal
compliance, but no audit trail, no scale, and a weak answer in the procurement
conversation where it would actually be asked.

**→ The admin console is a compliance precondition, not a feature.** It ships
before the first media response does. That also answers the fourth open bullet
above: **the export/deletion admin surface is in scope for this effort.**

**5. The Tennessen warning renders once per assignment, before the first
recording** — an interstitial carrying § 13.04 subd. 2's four required elements
(purpose, whether they may refuse, consequences of refusing, who else may receive
it), plus a persistent "why we're asking" link on the recorder itself.

Per-assignment rather than annual because **the four elements are
purpose-specific**: who receives a graded speaking assessment differs from who
receives a whiteboard explainer, so a blanket September acknowledgment is the
element most likely to be found insufficient — and it is the cheap one to get
right. **Rejected: once per student per year** (near-zero friction, but doesn't
satisfy "the purpose and intended use of the requested data" for a later,
different collection). **Rejected: always-visible static text with no
acknowledgment** — retains no evidence notice was received, which is the entire
point, and reduces the "may they refuse" element to decoration.

Two consequences that land outside this ticket:

- ~~⛔ **Auto-start capture and always-on preview are dead** — not by preference but by statute.~~ **↯ Half of this was overturned by RR-A1 (2026-08-06) — see below.**
- 🔴 **"May they refuse" has to be a true statement**, which means a non-recorded alternative must actually exist. Combined with **COPPA § 312.3(d)** (no conditioning participation on more disclosure than necessary), this **decides RR-07's first bullet by law rather than by pedagogy**: a teacher may not author a mode set of one that a student cannot satisfy. → **RR-07.** **↯ The reasoning was amended by RR-A1; the conclusion survives on other grounds — see below.**

🔵 **RR-A1 (2026-08-06) overturned the auto-start half of this sub-decision and
re-grounded the other half. Both corrections are worth reading before citing this
ticket.**

1. ⛔→✅ **Auto-start is not barred by statute.** This ticket's own research half says § 13.32 subd. 14(b)(1) is _"relevant to"_ auto-start — a flag, not a finding — and the decision half hardened it into a bar. The interstitial **is** advance notice, so the advance-notice test passes. Add **research finding 4** (the institution validly consents, on conditions SpartBoard satisfies and has committed to) and the objection is discharged. **Auto-start is now one of four per-question prep-expiry values** (RR-A1 sub-decision 2).
2. ✅ **Always-on preview stays dead, and the framing check stays alive.** Both rest on the notice duty, which is undisturbed. RR-A3's framing check runs _after_ the notice; RR-A1 extended it to a continuous self-view during capture, which is a strengthening.
3. 🔴 **The non-recorded alternative is still mandatory — on a different basis.** § 312.3(d) is weak here, because on a speaking assessment the recording **is** the data reasonably necessary. The load-bearing ground is now **RR-A4 finding 5**: districts park students in restricted OUs with mic and camera disabled by ChromeOS policy, so a subset of any class has capture hard-blocked. The alternative was always a functional requirement; this ticket reached it by a route that has partly given way. → **RR-07** owns the consequence.

⚠️ **Nothing else in this ticket is affected.** Sub-decisions 1–4 and 6 — real-name
archival, the contractual no to voiceprints and diarization, the unenforceable
single-speaker policy, the admin console, end-of-school-year retention — all stand
exactly as written.

**6. ⚠️ Amends RR-03 — archived media is deleted at the end of the current school
year.** Paul chose the tighter bound over the recommended end-of-_following_-year
(~13 months).

**Why RR-03's answer needed amending at all:** RR-03 closed retention as
"district-lifecycle-bound." **COPPA § 312.10 — fully in force since
2026-04-22 — says personal information collected from a child may not be retained
indefinitely and requires a published deletion timeframe with its business need.**
A teacher can stay in a district for twenty-five years, so "until they leave" is
not a timeframe. RR-03's promise was correct about _ownership_ and incomplete about
_duration_.

The chosen bound means everything is gone before the next cohort arrives — the
strongest defensible posture and the easiest to explain in procurement. **Accepted
cost:** it forecloses year-over-year growth comparison, which is a genuine
pedagogical use for exactly the speaking and reading-fluency assessments this
feature exists to enable — a September-to-September sample pair is the most
valuable artifact a speaking assessment produces. **Rejected: end of the following
school year** on those grounds; **rejected: no product-enforced bound**, which
leaves § 312.10 unanswered on the one data type where it is least likely to be read
charitably.

Deletion runs on the same scheduled-sweep + stored-refresh-token mechanism as
sub-decision 4 and RR-03's ~7-day Firebase sweep, and **must be preceded by a
warning email** on the existing `/mail` queue so a teacher can download anything
they intend to keep. Because growth comparison is now foreclosed in-product, **a
bulk teacher export path matters more than it did** — which is also what the
Flip/Flipgrid lesson in the research argues for. → **RR-A6.**

⚠️ **Derived artifacts are in scope of the sweep, not just source media.** COPPA
§ 312.2 defines "delete" as _"not maintained in retrievable form"_, reaching
transcodes, transcripts, thumbnails, and waveform data. RR-A4 established there
**will** be transcodes. **And § 99.10(e) forbids destroying records under an
outstanding access request — the sweep has to know about pending requests.**

🟡 **Assumption recorded, because Paul's choice requires a concept SpartBoard does
not have.** There is **no school-year concept anywhere in the codebase** — verified
2026-08-05 against `types.ts`, the roster layer (`hooks/useRosters.ts`, no
OneRoster academic-session or term handling), and `functions/src`. "End of the
current school year" cannot be computed today. Assumed shape, flagged as
revisitable: **a fixed July 1 annual sweep, overridable per organization.** It
needs no district calendar integration to ship, and a May recording expiring in
~2 months is the privacy-maximizing reading — consistent with why the tighter bound
was chosen. **If that default is wrong, it is a one-field fix, not a redesign.**

**Deliberately not decided here — and why:**

- **Which AI capabilities are on the menu, and how they're gated.** Sub-decision 2 sets the _outer boundary_ (no template extraction, ever) and leaves everything inside it open. → **RR-05**, which is now unblocked.
- **Whether video ships at all.** Sub-decision 3 hands RR-A3 a sharper input — zero redaction capacity by choice — but the mode question is RR-A3's to answer. → **RR-A3.**
- **The COPPA Direct Notice to Schools page and the NDPA rider.** Both are research recommendations 2 and the "worth doing while you're there" item; they're documents, not product decisions, and they belong with **RR-09**'s counsel conversation.

**Consequences, and where they land:**

- **RR-05 and RR-06 are unblocked** — RR-04 was the last keystone.
- **RR-03's retention promise is amended** (sub-decision 6). RR-03's resolution now carries a pointer to this.
- **RR-07's first bullet is decided by law** (sub-decision 5) — a non-recorded alternative is mandatory, not teacher-configurable.
- **RR-A1 loses auto-start capture** as a design option (sub-decision 5).
- **RR-A6 gains three requirements**: the pre-deletion warning email, a bulk teacher export path, and derived-artifact coverage in the sweep.
- **RR-A3 gains the redaction-capacity argument** against video (sub-decision 3).
- **RR-09's question 4 becomes more load-bearing** — if the district also can't redact, neither party can.
- **Three fog patches are now resolvable**: moderation, the `/activity-wall/gallery` posting surface, and the district-managed "recording allowed" roster flag were all explicitly waiting on this ticket.

🔵 **RR-A2 (2026-08-06) supplied copy for sub-decision 5's interstitial and put
this ticket's minimization posture under real pressure.**

1. ✅ **Both Tennessen elements now have stated answers, and they are true.** RR-A2 sub-decision 1 held RR-08's submit block with no refusal exit, and confirmed this is **not** a compliance problem: § 13.04 subd. 2 element (b) requires _stating whether_ refusal is permitted — this ticket's own RR-A1 amendment already records that — and element (c) requires the consequences. The interstitial's answers are therefore **_may you refuse_ → yes, the discard remains "stop, don't keep this"** and **_what happens_ → the question stays incomplete and the assignment cannot be submitted.** That second sentence is required copy, not optional framing: it is the only thing that keeps element (b) honest.
2. 🔴 **Sub-decision 6's minimization argument is now in tension with a shipped default.** COPPA § 312.10 grounded end-of-school-year deletion on not retaining more than necessary. RR-A2 keeps **every** committed take rather than only the surviving one, and defaults the budget to unlimited — so the volume of a child's voice retained per question is unbounded and, by this ticket's own standard, largely unnecessary. **Paul chose both, knowingly.** The retention _bound_ is undisturbed; what changed is how much sits inside it.
3. 🔴 **The org-admin review-and-delete console inherits a shape it wasn't specified for.** It was scoped as a compliance precondition over responses; it must now surface **multiple takes per question per student**, and a delete has to mean something coherent when three takes exist. RR-A2 explicitly left that shape to this console's design rather than deciding it.

🔴 **RR-05 (2026-08-06) held this ticket's contractual line exactly, and then
found that the notice built around it is now incomplete.**

1. ✅ **The hard no held without argument.** RR-05 sub-decision 1 lands on **transcript-level ASR and nothing else** — the one capability this ticket named as surviving untouched. Speaker-attributed transcripts and participation analytics were never re-proposed; summarization, feedback drafts and rubric-assisted scoring were declined on top. **The menu is smaller than the contract requires**, which is the right direction for a commitment written as an affirmative representation.
2. 🔴 **The Tennessen interstitial's copy is now factually incomplete, and this ticket owns the copy.** Sub-decision 5 of this ticket fixed what the student is told when the only consumer was the district. RR-05 adds a **vendor**: a teacher may send the recording to Gemini. A notice that describes where a recording goes and omits that is exactly the kind of statement RR-A2 was careful not to make false. **The fix is one clause, but it has to be written, and it has to survive the district's own review** — filed as a counsel question on RR-09 as well.
3. 🔴 **Minimization cuts the other way for text.** This ticket's posture is notice-plus-minimization, and RR-05 sub-decision 7 accepted, explicitly, that a transcript makes a child's speech **greppable** — materially more exposing in a § 13.04 data request than the audio it derives from, because text is searchable and 60 seconds of Chromebook audio is not. **A records request that would have been answered with a file to listen to is now answered with a string to scan.** Recorded as an accepted cost; it belongs here because it is a minimization judgment, not an engineering one.
4. **The org-admin console gains a second control, which strengthens the case for it.** RR-05 sub-decision 5 puts a **district-owned AI consent switch** on the organization doc, on this ticket's own § 99.12(a) reasoning. That switch has to live somewhere a district admin can reach, and the review-and-delete console this ticket made a precondition is the only such surface on the map. **Two independent tickets now require the same screen to exist.**

🔵 **RR-06 (2026-08-07) added two things to the district's record and made one of
them unstable.**

1. 🔴 **A machine transcription in the record can now be silently replaced.** RR-05 sub-decision 7 put a transcript into the district's records with **no correction path** — a cost this ticket recorded. RR-06 sub-decision 5 makes that transcript **replaceable in place** when a teacher re-pins a take. So the record is now mutable by an actor with no obligation to preserve what was there before, which is a different fact about a FERPA § 99.20 amendment surface than "uncorrectable." **It cuts both ways and neither way was designed:** a wrong transcript can now be fixed by re-pressing, and a right one can vanish without a trace.
2. 🔵 **`gradedTakeIndex` is a new datum about a child, and it is a small one.** RR-06 sub-decision 4 records which take a grade was about. It is defensible under this ticket's own posture — it exists to answer a grade appeal, which is the student's interest — but note it makes _"the teacher did not grade the take you submitted"_ a discoverable fact, where previously it would have been unrecorded.
3. ✅ **The excuse decision lands on the right side of this ticket's line.** RR-06 sub-decision 3 requires a **human** to decide whether a `capture-unavailable` slot is excused or scored zero. Nothing automated reads a device policy and assigns a consequence to a child, which is consistent with sub-decision 2's refusal to infer anything about a student from a recording's circumstances.

4. 🔴 **RR-B2 (2026-08-07) created a category of data the notice does not currently describe, and closed off the option of describing it partially.** Sub-decision 3 records **undo as an event in the log**, so a whiteboard take replays what a student drew _and retracted_. Every other mode on this map records what a child produced; this one records **what they decided not to produce.** RR-B2 considered logging retractions but replaying them only on teacher opt-in and rejected it on exactly this ticket's grounds — _"we record your mistakes but usually don't show them"_ is a worse sentence in a privacy notice than either clean answer. **So the notice has to say plainly that erased work is recorded and replayed to the teacher**, and it is the first line in it that a student might reasonably change their behaviour over. RR-B2 accepted that knowingly; what it did not do is write the sentence.
5. 🔵 **A smaller one, in the opposite direction.** Sub-decision 6 lets a policy-blocked microphone produce a **silent take** rather than blocking the mode — so a student can be recorded-with-no-audio with nothing in the flow telling them the microphone never engaged. Consistent with sub-decision 2's refusal to infer, and it means the notice's account of "what is recorded" is now conditional on the device.
6. 🔵 **RR-B4 (2026-08-07) adds a second device-conditional case, and this one records a refusal the student did not make.** Sub-decision 4 gates portrait-only devices out of the whiteboard and **writes the reason into the response**. That is a new class of data for this ticket: not content the student produced, and not silence they chose, but **a stored assertion about the student's hardware**. It is defensible and almost certainly the right call — a bare blank slot would read as "didn't try" — but it is a fact about a child recorded by the system without their action, so it belongs in the notice's inventory alongside the erased-work disclosure sub-decision 3 already forced. ⚠️ It also raises an accessibility question this map has not asked anywhere: **a hard orientation gate on a mounted or orientation-locked device is a barrier**, and whether that needs a 504/IEP-side answer is not something RR-04 has scoped. Recorded here rather than invented into a decision.

**Paul's notes:**

---

### RR-05 — Where is the AI boundary, and what exactly is admin-gated?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-06** · **Blocked by:** ~~RR-04~~ (closed) · **Blocks (now unblocked):** RR-06

**Question**

You said "how it could potentially get connected to AI (admin gated) and all
that." Blocked by RR-04 deliberately — you can't decide what to send a vendor
before deciding what may leave the district.

🔴 **RR-04 drew the outer boundary; this ticket decides what lives inside it.**
RR-04 sub-decision 2 is a **hard, contractual commitment** — no voiceprints, no
speaker identification or verification, **no diarization**, no face matching, no
emotion or biometric inference — written into the DPA and privacy notice as an
affirmative representation. That is not a default to be revisited per capability;
**nothing on this ticket's menu may cross it.** What survives untouched is
**transcript-level ASR**, which is template-free.

Two menu items are therefore already dead: **speaker-attributed transcripts for
group or paired recordings**, and **speaking-time / participation analytics**.
Don't re-propose them.

Also settled by RR-04: SpartBoard is on Gemini's **Paid** Services (finding 3's
correction), so nothing submitted is trained on and no vendor change is indicated.

The mechanism is already established and should be reused, not reinvented:
`transcribeVideoWithGemini` checks `global_permissions/video-activity-audio-transcription`
**server-side inside the callable**, is off by default, and carries its own daily
usage counter so cost is controlled independently of other AI features.

Open decisions:

- Which capabilities are on the menu — transcription, feedback, rubric-assisted grading suggestions, summarization for the teacher? (Note the written-response proposal explicitly deferred AI-assisted grading; this is where that question comes back.)
- One gate for "AI touches student media," or a separate gate per capability? Separate gates cost admin-UI complexity but let a district enable transcription for accessibility while refusing grading.
- Is there a tier floor (`defaultMinTier`) — i.e. do external/free-tier users get this at all?
- Does the teacher see, and can they override per-assignment, or is it purely admin-level?
- What's the failure mode when the gate is off — is the feature hidden, or visible-and-disabled with an explanation?

🔵 **RR-A3 (2026-08-06) gives this ticket a worked precedent for its own gating
question, and one new stacking problem.**

- **Precedent:** RR-A3 sub-decision 1 gates video itself with exactly the mechanism this ticket is weighing — a `global_permissions` doc checked server-side, `defaultMinTier: 'org'`, district-level on/off with a per-assignment teacher opt-in beneath it. That is now a second use of the pattern for this feature area, which argues for consistency rather than a bespoke AI gating shape.
- **New problem:** any AI capability that operates on **video** now sits under **two** independent district gates — video's and the AI capability's — and they can disagree. Decide what an admin sees when transcription is on but video is off, and whether the AI gate is expressed per-capability or per-capability-per-mode. The last bullet above ("hidden, or visible-and-disabled") gets harder when the reason for being disabled lives in a different admin screen.

🔵 **RR-A1 (2026-08-06) adds a small constraint and one input:**

- **Speed-based scoring is unavailable on recording questions by design** (sub-decision 3): `timeLimit` is forced to 0 there because it feeds `(remaining / timeLimit) * 50`, and rewarding a student for speaking quickly measures the opposite of fluency. **Any AI-assisted scoring on this map inherits that principle** — latency, hesitation and pause length are not proxies for quality, and a model that treats them as such reintroduces through the back door what the question editor now refuses.
- **The input:** video is capped at 480p / 500 kbps, so any AI capability operating on video is operating on 480p. Whatever the menu ends up containing, it should be viable at that quality rather than assuming source fidelity.

🔵 **RR-08 (2026-08-06) adds one guard and raises this ticket's urgency, because
it is the gate to RR-06 and RR-06 now has a state waiting on it.**

- **An `unresponded` entry has no artifact at all.** RR-08 makes a present, final, deliberately-empty answer a legitimate stored state with a stated reason. Whatever capabilities land on the menu must skip these rather than dispatch a job against a missing blob — and more sharply, an artifact stuck at `uploadState: 'pending'` or `'failed'` is a **different** kind of absent (the bytes were meant to exist) and should surface differently to the teacher than a slot that was never filled.
- **The gating question inherits a third axis.** RR-A3 already left this ticket deciding what an admin sees when transcription is on but video is off. RR-08 adds: what a teacher sees when the gate is on, the mode is on, and the student simply has nothing to transcribe. The last bullet in "Open decisions" — hidden vs visible-and-disabled — now has three causes, not one, and they live in three different places.
- 📐 **Urgency, not content:** RR-08 handed RR-06 a state it cannot price (`GradeResult` has no "unanswered" value), and **RR-06 is blocked on this ticket.** Closing RR-05 is now the only thing standing between the map and its largest open grading question.

🔵 **RR-A2 (2026-08-06) multiplied this ticket's unit of work.** Every AI
operation this ticket might allow on a recording question now faces **N takes,
not one** — RR-A2 sub-decision 5 keeps every committed take as a sibling entry,
and sub-decision 4 defaults the budget to unlimited.

**So this ticket owes an answer it didn't previously owe: does an AI operation
touch only the winning take, or all of them?** Only-the-winner is almost
certainly right and is nearly free to state — but it has to be _stated_, because
the natural implementation iterates `answers[]` and would silently bill for
every discarded-but-committed rehearsal. Left unsaid, the unbounded default turns
any per-take AI feature into an unbounded cost with a per-day counter as the only
brake. RR-A2 deliberately did not decide it: this ticket owns the AI boundary,
including how far into the take history it reaches.

**Resolution** _(2026-08-06, with Paul)_

**The menu is one item, and the gate is two.** Four premises this ticket was
handed turned out to be wrong in the codebase, and three of them changed an
answer.

**What the audit found before anything was decided**

1. 🔴 **Nothing in SpartBoard has ever sent student-created content to a vendor.** Every shipped Gemini callable consumes _teacher_ input: a teacher's prompt, a teacher's Drive file, a teacher-supplied image, or a public YouTube URL. `transcribeVideoWithGemini` does not even upload media — it passes Gemini a `fileUri` pointing at youtube.com (`aiGeneration.ts:1982`). **This ticket does not extend a data path; it opens the first one.** That reframed every question below from "which gate" to "what is the first thing we let out, and who says yes."
2. 🔴 **"The mechanism is already established" is true four times over, and the four disagree.** `global_permissions/{id}` checked server-side in the callable; `feature_permissions/video-activity.config.aiEnabled` (`Widget.tsx:191-192`); `organizations/{orgId}.aiEnabled`, which **defaults false** (`hooks/useOrganizations.ts:91`) plus a building-level twin (`BloomsTaxonomy/Widget.tsx:50-54`); and a hard-coded `isAdmin === true &&` in the client. "Reuse, don't reinvent" does not pick one.
3. 🔴 **The precedent this ticket was told to copy is fail-open and fail-closed at the same time.** `config/featureDefaults.ts:132-136` declares transcription `defaultAccessLevel: 'public'`, `defaultEnabled: true`, `missingDocPublic: true`, while the callable throws `permission-denied` when the doc is absent (`aiGeneration.ts:1796`). They disagree in exactly the state every untouched district is in. It is inert today **only** because the hard-coded `isAdmin` check hides the affordance — which means the drift is masked by an accident, in the file whose own header says it exists to prevent this bug class.
4. 🔴 **`global_permissions` is written by SpartBoard admins, not districts** — `allow write: if isAdmin()` (`firestore.rules:749-752`), where `isAdmin()` reads `/admins/{email}`. District scoping exists only as a `buildings[]` allowlist inside one global doc. **RR-A3's "the district holding the switch" describes a support workflow, not a control any district can reach.** That is a correction to a closed ticket, and it is the finding that produced sub-decision 5.

**Sub-decisions**

1. **The menu is transcript-level ASR and nothing else.** No summarization, no feedback drafts, no rubric-assisted scoring. RR-04 already killed speaker-attributed transcripts and participation analytics by contract; this ticket declines the rest by choice. The reasoning is that ASR is the only capability with an accessibility justification that survives RR-04's line cleanly, and it is the only one a teacher can verify at a glance by listening. **AI-assisted grading is now deferred twice** — once by the written-response proposal's Phase 4 (`docs/written-response-quiz-questions.md:31,480`), once here — and the second deferral has a reason the first didn't: **RR-06 has not yet decided how a _human_ grades these**, so an assist would be designed for a workflow that does not exist.
2. **Teacher-initiated, one response at a time.** A button in the results view, pressed per response. Rejected: automatic-at-submit (recommended, and declined) and automatic-at-archive. The choice buys three things the automatic paths cannot. **Quota attribution stays honest** — `ai_usage` docs are keyed `{uid}_{date}` and `{uid}_{feature}_{date}` off the _caller_, and there is no caller at archive time, so an automatic path would have created billing with no owner. **Nothing is transcribed that no one reads.** And **a transcript exists only because a human chose to make one**, which is a materially different sentence to put in a privacy notice than "all student recordings are machine-transcribed on submission." The cost is real and accepted: it is a click and a wait per student, and a rushed teacher will skip it.
3. **One press transcribes the winning take only** — the highest `takeIndex`, the same take RR-A2 sub-decision 5 says scoring reads. **This is the explicit statement RR-A2 said this ticket owed.** Left unsaid, the natural implementation iterates `answers[]` and silently bills for every discarded-but-committed rehearsal. Stating it also guarantees the transcript and the grade are provably about the same sixty seconds. ⚠️ **It has one live dependency:** RR-06 still holds an open question about whether a teacher may grade an _earlier_ take. If RR-06 answers yes, this sub-decision reopens — and it should be reopened deliberately rather than drifting.
4. **A new dedicated `GlobalFeature` id**, its own `global_permissions` doc, checked server-side in the callable — the shipped pattern, a new member of the union. **Explicitly not a reuse of `video-activity-audio-transcription`**, even though the operation is literally the same (audio → text via Gemini), because a district that enabled that one said yes to Gemini reading a public video the _teacher_ chose. Reusing it would silently convert that into a yes about a child's voice with no admin ever seeing a new switch — and RR-04's entire posture is that notice precedes the disclosure rather than following it. Admin-UI cost is near zero: `GlobalPermissionsManager.tsx:206-212` already groups five AI features in `GEMINI_FEATURES`, so this is a sixth row.
5. **Two gates, and they mean different things.** The `global_permissions` doc is the **availability** switch — is this district offered the capability at all — and remains SpartBoard's, matching finding 4's reality rather than RR-A3's assumption. A **new field on the organization doc is the consent switch**, owned by the district's own admin, and both must be true. The reasoning is RR-04's: the § 99.12(a) obligation is the district's, and **a switch a district cannot physically operate cannot carry a consent it is legally holding.** A district that later says "we never agreed to that" should be answerable from the product, not from a support thread. It also lands next to a surface RR-04 already made a compliance precondition — the org-admin review-and-delete console — so the org-admin screen is coming regardless and this is one more control on it. **Cost, accepted:** transcription of a _video_ take now sits under three stacked gates (video's, availability, consent), and RR-A3 already flagged that two can disagree confusingly.
6. **Hidden for gate causes; explained inline for data causes.** The button does not render when either gate is off — a teacher should not learn their district's policy from a dead control whose fix lives in a screen they cannot reach. It _does_ render for the data causes, as **two distinct inline states**: `unresponded` (RR-08's deliberately-empty slot, with its stated reason) and `pending`/`failed` (bytes that were meant to exist). That is exactly the distinction RR-08 asked for, and the split is principled rather than aesthetic — **the product hides what the teacher cannot act on and explains what they can.** Accepted cost: a teacher who has heard the feature exists sees nothing at all and files a support ticket.
7. **The transcript is a `kind: 'text'` `ResponseArtifact` in the same slot as the recording.** RR-02 already carries that kind. It therefore archives to Drive alongside the media through RR-03's per-upload callable, and dies at end of school year under RR-04's retention rule — **one lifecycle, one sweep, nothing new to remember to delete**, which is the failure mode RR-04 had to fix in RR-03 once already. It also survives a teacher grading across two evenings without paying twice. ⚠️ **Recorded as a real cost, not a footnote:** this makes a child's speech **greppable**, which is materially more exposing in a records request than the audio ever was, and an ASR error becomes part of the district's record with **no correction path** — see "did not decide" below.

**Derived, not asked**

- **The tier floor is structural, so `defaultMinTier` is redundant here.** A free-tier teacher has no organization document, so no district-consent switch can be true for them; sub-decision 5 denies them by construction rather than by configuration. This is the same population `isExternalCaller` already classifies for the AI quota.
- **There is no per-assignment teacher opt-in.** RR-A3 needed one because video changes what the _student_ does. This changes nothing student-side and produces teacher-only output, so the teacher's override is simply whether they press the button.
- **The shipped daily caps stop being the binding constraint, and that is deliberate.** A bulk "transcribe all" would have blown both defaults on its first real use — 20/day overall and 5/day for transcription (`aiGeneration.ts:1869-1888`) against a class of 30. Sub-decision 2 sidesteps the collision rather than renegotiating the numbers. ⚠️ **But note the shipped bypass:** admins skip both counters entirely (`if (!isAdmin)` at `:1837`). That is fine while the counter is a _cost_ brake; if anyone later reaches for it as a _data_ brake, it has a hole in it.
- 🔴 **The fail-open/fail-closed drift in finding 3 is a real shipped defect and this ticket does not fix it.** Sub-decision 5's org gate happens to mask it for the new feature — the org field defaults false, so the affordance is hidden anyway — but `video-activity-audio-transcription` still declares `missingDocPublic: true` against a fail-closed callable, and it stays inert only because of a hard-coded `isAdmin`. **It belongs in an issue, not on this map.**

**What this ticket did not decide**

- **Whether a transcript is correctable.** Sub-decision 7 puts a machine transcription of a child's speech into the district's records with no mechanism for the student, the teacher, or a parent to amend it. That is a FERPA § 99.20 amendment-request surface and it belongs to nobody on this map yet.
- **Whether the Tennessen interstitial must say the recording may be machine-transcribed.** RR-04 fixed the notice's content when the only consumer was the district; sub-decision 1 adds a vendor. **Injected into RR-04 as a copy question and into RR-09 as a counsel question.**
- **AI-assisted grading**, deferred rather than refused — see sub-decision 1.
- **Whether transcription follows an earlier take** if RR-06 permits grading one — see sub-decision 3.

🔴 **RR-06 (2026-08-07) permitted it, so sub-decision 3 is amended — deliberately,
which is what this ticket asked for.** RR-06 sub-decision 4 lets a teacher grade an
earlier take and records `gradedTakeIndex` on the grade. **Sub-decision 3 above now
reads "the graded take" rather than "the winning take."**

- **Its reason survives intact and is in fact better served** — the point was never that the highest `takeIndex` is special, but that the transcript and the grade are provably about the same sixty seconds. Following the pin is what actually guarantees that; following the winner only guaranteed it while the two coincided.
- **The cost brake survives too.** RR-06 rejected accumulating per-take transcripts explicitly, on this ticket's reasoning: one transcript per slot, **replaced** on re-press. So the unbounded-cost failure sub-decision 3 was written to prevent stays prevented, and the "greppable child's speech" cost accepted in sub-decision 7 is still multiplied by one, not by N.
- 🔵 **Two small consequences.** A re-press is a **second quota unit** against the 5/day per-feature cap this ticket surveyed — the first time a single response can legitimately consume more than one. And replacement makes the transcript **the first artifact on this map that is superseded in place**, which touches a Drive delete path RR-A2 was glad to have avoided needing → recorded in **RR-03**.
- ✅ **What did _not_ happen:** RR-06 did **not** reopen this ticket's menu. It answered the queue-cost question by **ordering** the queue (question-major) rather than by asking for machine help, and left the transcript as the only assist. The one path that can still reopen the menu is **RR-B3**, which counts the minutes with a prototype.

- 🔵 **RR-B2 (2026-08-07) answered the question this ticket handed it, and it came back on the one-artifact branch.** Audio and strokes arm on one clock and commit as a single take, so **a whiteboard take is a recording** — transcription applies to it, under both gates, on the graded take per RR-06 sub-decision 5. The slot therefore holds four kinds at once (audio, command log, final-state PNG, optional `kind: 'text'` transcript), which is the shape this ticket described for the _attached_ branch arriving via the synchronized one. **No new gating question**: RR-B2 confirmed a narrated whiteboard is audio-class for permissions, since it carries no camera.

**Paul's notes:** AI transcription: I don't plan to implement this if avoidable. Keep the boundary as decided; don't build the callable. _(2026-09-01)_

---

### RR-06 — How do media responses grade, and how do they reach the gradebook?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-07** · **Blocked by:** ~~RR-02, RR-03, RR-04, RR-05~~ (all closed) · **Blocks (now unblocked):** RR-B3 (waits on RR-B2 only)

> ⚠️ **RR-C1 (2026-08-07) introduced a wrong answer this ticket's grading model
> cannot see.** RR-C1 sub-decision 4 lets a stimulus fail to load with **no
> retry affordance, no error state and no flag on the response**. A student who
> never saw the passage still answers, and the result reaches the queue as an
> ordinary wrong answer — **indistinguishable from not knowing the material.**
> Nothing here is broken by it and no sub-decision changes: `state` still
> resolves, the gradebook still behaves. But this ticket's three states
> (`scored` / `awaiting-grade` / `not-attempted`) were built on the premise that
> every absence has a knowable cause, and this is the first one that does not.
> Recorded, deliberately not fixed — the decision is Paul's and was made with
> the trade-off stated.

**Question**

The written-response effort built prev/next navigation, structured rubrics with
CSV import, and inline highlights + margin comments. Highlights over a _text_
span have no obvious analog over a 90-second audio clip.

- Does the rubric surface carry over unchanged, or does time-based media need timestamped comments?
- What does the grading queue look like at 30 students × 5 recordings — the honest wall-clock cost is the thing that decides whether teachers use this twice.
- Points and partial credit: does a media response participate in the existing `GradeResult` model? **Sharpened by RR-01:** a question may now carry a required, separately-pointed addendum, so one question id can own **two graded artifacts**. `GradeResult` is a flat `{ isCorrect, pointsEarned, pointsMax }` and grading is keyed by question id alone (`r.grading?.[q.id]`, `quizScoreboard.ts:79`). Decide whether that becomes a per-artifact sub-key or a composite.
- **Also from RR-01:** with a required addendum, an MC question has a manual grading path — so "auto-graded" is no longer a property of the _type_. Does the teacher get warned at authoring time that they've just made a self-grading quiz manual? Does the scoreboard still show a live score before grading is done?
- LMS passback — Classroom (`submitAssignmentToGoogleClassroomV2` analog) and LTI already exist for scores. Does anything change, or is a score just a score?

🔴 **RR-08 (2026-08-06) created a state this ticket must price, and found that the
vocabulary to price it does not exist.** RR-08 introduced **"complete iff every
required slot is filled"** and a per-answer `unresponded` marker — so a response can
now be present, final, and empty on purpose, with a stated reason.

**`GradeResult` cannot express any of it.** It is a flat
`{ isCorrect, pointsEarned, pointsMax }` with **no "unanswered" return value at
all** (audit §4.1), so a blank and a wrong answer are indistinguishable to every
consumer — the scoreboard, the export, the `% correct` denominator, LMS passback.
Today that is merely blunt. Once a required addendum can be legitimately empty for a
**stated** reason, scoring it identically to a wrong answer is a factual
misstatement about the student, and it flows outward into the gradebook.

Four things this ticket now owes an answer on:

- **Does an `unresponded` slot score zero, score nothing, or score "not attempted"?** They are three different numbers in the `% correct` denominator and three different cells in the Sheets export, whose documented contract already says _"empty string → unanswered, '0' → answered incorrect"_ (`utils/quizDriveService.ts:816-821`).
- **`capture-unavailable` is not the student's doing.** RR-08 sub-decision 4 guarantees this state exists in every district — RR-A4 finding 5 puts a subset of every class in a restricted OU. Scoring it as a zero penalises students for their device policy, which is the equity exposure RR-07 already flags on an adjacent question.
- **`abandoned` vs `expired` vs `passed` may deserve different treatment**, and RR-08 deliberately left the reason vocabulary open partly so this ticket could say so.
- **Does an incomplete question reach the gradebook at all before it's graded?** RR-01 already made MC-with-addendum a manual-grading path; RR-08 makes "incomplete" a state that can persist to finalization.

📐 **A smaller gift:** RR-08's single completeness predicate is the natural place to
hang "needs grading," which this ticket was going to have to invent anyway.

🔵 **RR-A2 (2026-08-06) decided which take counts, and handed this ticket the
questions that follow from there having been several.**

1. ✅ **Scoring reads the highest `takeIndex`.** RR-A2 sub-decision 5 settled the mechanical question — the winning take is the last committed one, with ties broken by earliest `answeredAt` so `arrayUnion` races still resolve the way bugs #1728 and #1777 were fixed to resolve.
2. 🔴 **Three of this ticket's scoring consumers are in the blast radius and must change in lockstep with the append.** `components/widgets/QuizWidget/utils/quizScoreboard.ts:55-71`, `components/widgets/VideoActivityWidget/components/questionAccuracyStats.ts:1-35` and `hooks/useQuizAssignments.ts:2000-2035` all credit the **chronologically first** entry per `questionId` today. Until they read `takeIndex`, the scoreboard grades take 1 while the results view shows take 3 — **silently, with no error anywhere.** RR-A2 recorded this as scheduled implementation work that lands with the append change or before it, never after.
3. **Two grading questions RR-A2 explicitly declined:** may a teacher grade an **earlier** take rather than the winner — the data now supports it and no product surface offers it — and **what the existence of six takes should do to a rubric**, if anything. RR-A2 decided six takes is _effort_ rather than an integrity signal (sub-decision 8, which kept it out of the export sheet's `Warnings` column); whether effort may legitimately price a grade is this ticket's call.

🔴 **RR-05 (2026-08-06) closed, which unblocks this ticket — and the shape of its
answer means this ticket carries more, not less.**

1. 🔴 **There is no AI assistance in grading, and there will not be one to design around.** RR-05 sub-decision 1 declines rubric-assisted scoring, feedback drafts and summarization, keeping only transcript-level ASR. **Every judgment this ticket designs is a human one**, and the wall-clock cost this ticket already calls "the thing that decides whether teachers use this twice" gets no machine relief. That is now a fixed input rather than an open hope. **Note the ordering RR-05 gave as its reason:** it declined partly _because_ this ticket hasn't said how a human grades these. If this ticket concludes the human queue is genuinely unworkable at 30 × N, **that is the finding that would reopen RR-05**, and it should be stated as such rather than absorbed.
2. **The one assist that exists is a transcript, and it is teacher-pulled, one response at a time, on the winning take.** So the grading view is where the button lives — this ticket owns where it sits and what the panel looks like with a transcript in it. A transcript makes 30 recordings **skimmable**, which is a real answer to the queue question, but only for the responses a teacher chooses to spend a press on.
3. 🔴 **The earlier-take question above (item 3) now decides two things, not one.** RR-05 sub-decision 3 fixes transcription to the highest `takeIndex` and says explicitly that if this ticket permits grading an earlier take, **that sub-decision reopens.** So "may a teacher grade take 2" is no longer only a grading question — it determines whether the transcript a teacher is reading can be made to match the take they are grading. Answering yes without saying so leaves a teacher grading take 2 against a transcript of take 4.
4. **Absence now has three visible flavours in the grading view, and this ticket prices them.** RR-08 gave `unresponded`; RR-05 sub-decision 6 splits the surface further, showing `unresponded` and `pending`/`failed` as **distinct inline states** while hiding gate-caused absence entirely. The four things this ticket owes an answer on (above) inherit that split: `capture-unavailable` and a failed upload look different to the teacher now, and they arguably score differently too.

**Resolution** _(2026-08-07, with Paul)_

**Grading is per-slot, and the score model grows a third state.** Six audit
findings preceded the first question; one of them removed a charted question
rather than answering it, and Paul's last answer removed another by rejecting its
premise outright.

**What the audit found before anything was decided**

1. 🔴 **There is no shipped rubric surface.** The ticket's opening premise — that the written-response effort "built structured rubrics with CSV import" — is half wrong. **Phase 1** (points, overall comment, prev/next) and **Phase 2** (inline highlights + margin comments) shipped; **Phase 3 rubrics did not.** `WrittenResponseGrader.tsx:12` says so in its own header, `TODO.md:34,46` lists M12 as unbuilt **with three open decisions of its own**, and the only rubric artifacts in the codebase are two reserved types (`WrittenAnswerRubricScore`, `WrittenAnswerGrade.rubricScores`). "Does the rubric surface carry over unchanged" was therefore unanswerable as framed — see "did not decide."
2. 🔴 **`gradeAnswer` cannot express "not yet graded" either.** `useQuizSession.ts:406-409`: no manual grade → `{ isCorrect: false, pointsEarned: 0 }`. The ticket knew `GradeResult` had no _unanswered_ value; it also has no **ungraded** value, and the docblock at `:402-405` shows that was a conscious choice between two wrong answers ("so downstream stats don't credit ungraded essays as correct"). **So the flat-zero defect this ticket was opened to fix for media already ships for essays.**
3. 🔴 **The repo already contains the argument this ticket needs, applied to a different cause.** `quizScoreboard.ts:179-218` — `canScoreResponse` exists solely to keep phantom zeros out of the gradebook, and its docblock argues the case explicitly: _"Omitting a student is the safe default — better no grade than a wrong 0."_ But it guards only answer-key failures, so **an ungraded essay passes the filter and pushes a real 0 into Google Classroom today** (`classroomGradePush.ts:82-90`). The principle was already decided here; it was simply never extended to the cause that matters.
4. 🔴 **RR-08 silently inverts the "absent means unanswered" contract in _four_ places, for every question in every quiz — not just for media.** The pattern is always the same: a consumer treats **a missing entry** as "not answered," and RR-08 makes every question write one. (a) `assignmentExportShared.ts:170-178` emits `''` only when no entry exists, so the cell becomes `'0'` — which `quizDriveService.ts:817-821` documents as _"answered, incorrect."_ **The empty cell stops occurring at all.** (b) `readPlcSheet` parses those cells back for PLC cross-teacher aggregation. (c) `plcContributions.ts:99-114` — the **Firestore-native** replacement for that reader, not the Sheets path — does `if (answer === undefined) continue`, and `types.ts:387-391` documents its output as _"Absent keys = not answered. Value `0` = answered incorrectly."_ (d) `quizDriveService.ts:718-741` builds an `answeredSet` per response, which becomes every question for every student. **Found by sweep, not by luck:** (a) surfaced while reading for another reason, and (c) and (d) were found by then grepping deliberately for the convention — see `docs/rich-response/README.md` on why that ordering matters.
5. **"Needs manual grading" is a type check at ~15 sites and the canonical helper is used at 3.** RR-01 already catalogued the sites; two of them decide money. `quizScoreboard.ts:79` and `useQuizAssignments.ts:2027` consult `r.grading` **only for `short`/`essay`**, so a grade written against any other type would be stored and then silently ignored by the live scoreboard and frozen out of the published archive.
6. **`grading` is one `WrittenAnswerGrade` per question id** (`types.ts:3660`), written by dotted field path so concurrent grades merge atomically — and the grader's queue filter (`WrittenResponseGrader.tsx:75-82`) is **presence-based on `answers[]`**. Under RR-08 every student has an entry for every question, so **the queue stops filtering** and every student appears for every question.

**Sub-decisions**

1. **`GradeResult` grows a third state:** `state: 'scored' | 'awaiting-grade' | 'not-attempted'`. Rejected: a nullable `pointsEarned`, and solving it above the type with a derived predicate. The deciding argument is the same one RR-A2 used for its four-consumer change — making it a required field on the type every scoring path returns means **the compiler walks the roughly eight consumers for us** (scoreboard, `getResponseScore`, publish, Sheets export, both LMS pushes, the questions tab, the results list). The predicate-above option was rejected precisely because the two consumers that already have this bug (finding 5) would keep it. **Accepted cost:** it is a breaking change to a shipped type, and `pointsEarned: 0` remains present and still readable by anything that forgets to branch.
2. **At the gradebook the two new states diverge: `awaiting-grade` omits the student, `not-attempted` pushes as a real 0.** This extends `canScoreResponse` verbatim rather than inventing anything — finding 3's precedent, applied to the cause it was always about. The line is drawn at whose incompleteness it is: **`awaiting-grade` is the product's**, temporary and fixable, and a wrong number there is our fault; **`not-attempted` is a fact about the student's work**, which is the thing a gradebook is for. **Accepted cost:** the push is one number per student, so a single ungraded slot suppresses that student's whole grade, and a teacher pushing mid-grading gets a silent partial push. That answers the ticket's fourth owed question — **an incomplete question does not reach the gradebook before it is graded.**
3. **Whether a `not-attempted` slot is excused or scored zero is the teacher's call, per response, with the reason shown.** Rejected: an automatic carve-out for `capture-unavailable`, and no carve-out at all. The automatic version was rejected on a concrete mechanical cost — excusing by removing points from the denominator makes two students' percentages in one class run over different totals, which quietly breaks comparability in the scoreboard, the export and the pushed grade. **The decision puts a human between a device policy and a child's grade**, which is the equity exposure RR-08 sub-decision 4 and RR-A4 finding 5 jointly guarantee will occur in every district. It also survives reason values not yet invented, which matters because RR-08 left that vocabulary deliberately open. **Accepted cost:** a click per affected student, and "excused" is a first-class state in Classroom's UI but has **no equivalent in Schoology's AGS score model** — so the two LMS paths diverge at exactly this point. → RR-09.
4. **A teacher may grade an earlier take, and the grade records which one** — `WrittenAnswerGrade` gains `gradedTakeIndex` _(Paul, against my recommendation)_. I argued that committing a later take **is** the student's act of choosing and that grading a different one makes the student's own submission non-final. Note what pinning does and does not move: a media slot's points come **from** the manual grade, so pinning changes **provenance, not arithmetic** — RR-A2 sub-decision 5's highest-`takeIndex` rule still governs everything computed. The gain is that a grade appeal has an answer to _"which sixty seconds was this about."_ **⚠️ This reopens RR-05 sub-decision 3, deliberately** — which is exactly how RR-05 asked for it to be reopened. See 5.
5. **The transcript follows the pin: one transcript per slot, replaced on re-press.** This **amends RR-05 sub-decision 3** from "the winning take" to "the graded take," preserving its actual reason — that the transcript and the grade are provably about the same recording — while paying for sub-decision 4. Rejected: per-take transcripts that accumulate (unbounded against RR-A2's unlimited `takeLimit`, and it multiplies RR-05's accepted "a child's speech is now greppable" cost by N), and freezing the transcript to the winner while hiding it on a mismatch (the assist would vanish exactly when a teacher is listening hardest). **Accepted cost:** a re-press is a second quota unit against a 5/day per-feature cap, and replacement means either a superseded transcript left in Drive or a delete path RR-A2 was glad to have avoided needing. → RR-03.
6. **Media annotations are time-anchored to the take** — `WrittenAnswerAnnotation` reused with `from`/`to` in **milliseconds** instead of character offsets. Two properties fell out of choosing this. **`gradingSnapshot` is unnecessary for media**: it exists because a student can edit text under a teacher's highlights, and a take is immutable (RR-A2 keeps every committed take), so the anchor cannot drift. And **it makes the transcript disposable** — because comments anchor to time rather than to transcript text, sub-decision 5's replacement destroys nothing a teacher wrote. Rejected: annotating the transcript instead (available only behind two gates plus a teacher press, so absent for most responses in most districts — and a machine transcript is not the response), and overall-comment-only (which makes media second-class in the one place feedback matters). **Accepted cost:** a scrubber-with-markers UI that does not exist, and marking a sub-second range is fiddly on a trackpad and worse on a touchscreen.
7. **Grades are keyed by question _and slot_.** This is the sub-key RR-01 said this ticket owed. `slot` is already the vocabulary RR-02 stores on every artifact and RR-08's completeness predicate runs on, so grading stops being the one layer keying by something else. Either encoding works — nested `grading.{qid}.{slot}`, or composite `grading["{qid}::{slot}"]` where a key with no separator reads as the primary slot and no backfill is needed. Rejected: sub-scores nested inside one per-question grade (the existing top-level `annotations` / `gradingSnapshot` / `overallComment` become ambiguous about which artifact they describe) and giving the addendum a derived question id (zero consumer changes, but it fractures RR-01's "one question, two artifacts" at the storage layer, so everything that counts questions must learn an id convention or double-count).
8. **A partially-graded score displays provisionally and is always marked** — never a bare number, in the live monitor, the results list, the export and the student's published view. The alternative of showing "—" until complete was rejected on this map's own shape: **most quizzes here will contain at least one recording slot**, so the monitor would go blank for nearly every student for the whole session, which is when teachers actually use it. Scoring over a moving graded-only denominator was rejected because a student's percentage would visibly change while their work did not. **Accepted cost:** two numbers exist for one student until grading finishes, and the provisional one is the one that appears on a leaderboard in front of the class.
9. **The queue is question-major by default** — Q3 for everyone, then Q4 for everyone. This is the ticket's answer to its own wall-clock question, and it is deliberately an **ordering** answer rather than a machine one, because RR-05 removed the machine. It is the single biggest lever on both speed and consistency: the criterion stays loaded, so thirty responses are judged against one standard instead of thirty drifting ones. Rejected: keeping the shipped student-major default, and a no-default toggle. **Accepted cost:** it breaks "finish this student and move on," which is how a teacher grabs ten minutes between classes, and a teacher who stops halfway leaves every student partly graded rather than some students finished.
10. 🔴 **Auto-graded slots stay auto-graded — manual grading is a property of the _slot_, never the question and never the type** _(Paul, replacing the question rather than answering it)_. Nine MC questions and one video response means the teacher grades **one thing**, and the nine are still scored by answer key. This **sharpens RR-01's first accepted consequence**, which read that "no question type is purely auto-graded any more" and, taken literally, implied a teacher would hand-grade an MC that happened to carry a spoken justification. It also **retires this ticket's charted authoring-warning question** — there is no self-grading quiz being turned manual, so there is nothing to warn about. One question can now return a **mixed** result: the MC slot `scored` automatically while the video slot sits `awaiting-grade`, with the question's points the sum.

**Derived, not asked**

- **The number of takes does not price a grade.** This is RR-A2's second explicitly-declined question, and sub-decision 4 answers it by construction: once a grade attaches to a **named** take, a grade that varied with how many _other_ takes exist would not be a grade of that take. It also lands on an established line — RR-A1 sub-decision 3 refused speed as a proxy for fluency, and RR-05 inherited the principle. Takes stay **visible and unpriced**, exactly as RR-A2 sub-decision 8 kept them out of the export's `Warnings` column.
- **`isWrittenQuestionType` does not become one predicate; it splits into two.** RR-01 expected the ~16 inline copies to route through a renamed helper. Sub-decision 10 means the grading-path sites are asking a **different question** from the editor and student-app sites: grading asks _"does this slot need a human"_ (per-slot, per-response), while authoring and rendering still ask _"is this a constructed-response type"_ (per-question). Merging them is the trap.
- **`gradingSnapshot` survives for text and is not needed for media** — see sub-decision 6. It is the one Phase 2 mechanism that does not generalize, and it does not generalize because it was solving a problem media does not have.

**What this ticket did not decide**

- **The rubric.** Finding 1 means there is no rubric surface to carry over, and specifying one for media before one exists for text would be designing M12 from the wrong end. **M12's three open decisions stay M12's** (`TODO.md:34`). What this ticket does hand M12 is a constraint it did not have: any rubric it designs must be scoreable **per slot**, not per question.
- **Whether "excused" survives the LMS boundary** — sub-decision 3 creates a state Classroom can express and Schoology AGS apparently cannot. **Injected into RR-09.**
- **Whether a count of manually-graded slots appears at authoring time.** The residual of the question sub-decision 10 dissolved. The existing `Manual` badge (`QuizResults.tsx:1850`) is the obvious home; nobody decided it needs one.
- **Whether the human queue is workable** in the sense RR-05 meant. **This ticket does not reopen RR-05's menu.** It made the queue cheaper by **ordering** (sub-decision 9) and kept the transcript as the only assist, which is a real answer rather than a concession. If RR-B3's prototype counts the minutes and finds otherwise, **that** is the finding that reopens RR-05 — and it is now the only path that can.

- 🔵 **RR-B2 (2026-08-07) resolved this ticket's riskiest rider in its favour, on both halves.** Sub-decision 6's millisecond anchors were flagged as landing on nothing in particular if a whiteboard had two timelines; **it has one**, so a time-anchored comment lands on a moment of the _work_ — the strongest version of whiteboard grading available, arriving free from a decision made for audio. And the immutability worry — that a command-stack whiteboard is the one artifact on this map that might not be immutable — **is answered rather than merely survived**: the take is buffered in memory and written **once at commit**, never mutated after. **`gradingSnapshot` stays dead for media, without an exception.**
- ⚠️ **One number this ticket will care about:** RR-B2 set whiteboard takes at **180 s default / 600 s maximum**. Sub-decision 9's question-major queue is the reason that is affordable rather than alarming, and RR-B3 is where it gets counted.
- 🔵 **RR-B4 (2026-08-07) made the grading surface uniform, which this ticket's queue design was quietly assuming.** Every whiteboard response is the same shape (4:3) at the same resolution, so a question-major queue of thirty responses is thirty identical tiles — no ragged grid, no per-student letterboxing, and a thumbnail strip that can be laid out without measuring anything. Under the per-artifact-dimensions option RR-B4 declined, sub-decision 9's queue would have been scrolling through thirty differently-shaped cards. **The assumption was never stated, and it is now true.**
- 🔵 **And `not-attempted` gains a third reason.** RR-B4 sub-decision 4 produces a response that is empty because the device could not present the page. It joins `capture-unavailable` on the teacher-facing side of sub-decision 3's excuse decision — the teacher still calls it per response with the reason shown, exactly as decided, but the reason string is now one of three rather than one of two.

- 🔵 **RR-C3 (2026-08-07) confirmed sub-decision 9 was already the right shape for
  a shared stimulus, and then handed this ticket a hazard.** The confirmation:
  question-major means a grader holds **one question for thirty responses**, so a
  passage is stable across the whole batch and loads once — under a student-major
  queue the same passage would reload thirty times in a different order. No change
  needed; the property arrived free. 🔴 **The hazard is RR-C1 sub-decision 4
  (silent stimulus failure) meeting this ticket's `state: 'scored'`.** A student
  who never saw the passage produces a scored wrong answer indistinguishable from
  not knowing — and under RR-C3's parent-level attachment **one failed load now
  poisons every question pointing at that stimulus**, not one. That does not
  reopen RR-C1's decision, which was taken deliberately, but it multiplies its
  magnitude, and this ticket is where the wrong number lands.

- ✅ **RR-10 (2026-08-09) answered this ticket's one optional item, and answered it by construction rather than by choosing.** This ticket left open _"whether a count of hand-graded slots appears anywhere,"_ naming the existing `Manual` badge (`QuizResults.tsx:1850`) as the obvious home. RR-10 sub-decision 6 puts a **slot count in the editor's advisory** — _"records up to N slots per student"_ — for a storage reason, and by **this ticket's own sub-decision 10** the recording-slot count **is** the hand-grading count: nine MC plus one video is one thing to hand-grade. **One figure serves both, at authoring time rather than after**, and the `Manual` badge stays the grading-side home unchanged. 🔵 Worth noting the direction of travel: this ticket _"asked the editor for almost nothing, which is an answer rather than a deferral"_ — and the editor ended up supplying the one thing anyway, from the other side.

**Paul's notes:**

---

### RR-07 — What's the alternate-format policy when a student can't use the required mode?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-16** · **Blocked by:** ~~RR-01~~ (closed)

**Question**

A required spoken response excludes a student who is mute, has a speech
difference, is an English learner in a silent period, or is sitting in a room
where recording isn't possible. A required video response excludes anyone who
won't be on camera. The accessibility baseline in `CLAUDE.md` sets WCAG AA as a
floor, and this sits above that floor — it's a pedagogical-equity decision, not a
contrast ratio.

**Updated by RR-01.** The mechanism now exists: the primary response mode is a
**set**, and a student picks from it. So the question is no longer "how would we
express an alternate" but "what's the **policy floor** on that set."

🔴 **RR-04 DID remove the teacher's freedom to say no — resolved 2026-08-05, not
merely flagged.** COPPA **§ 312.3(d)** bars conditioning participation on
disclosing more personal information than reasonably necessary, and Minnesota's
Tennessen warning (§ 13.04 subd. 2) requires telling the student **whether they may
refuse**. RR-04 sub-decision 5 committed to rendering that warning as a real
product surface once per assignment — **which makes "you may refuse" a statement
SpartBoard has to keep true.** A non-recorded alternative is therefore
**mandatory**, and **this ticket's first bullet is decided by law rather than by
pedagogy.** Still worth confirming with counsel (→ RR-09), but design against it,
not around it.

- ~~Is there a floor at all~~ — **decided by RR-04: yes, and it is not teacher-configurable.** A mode set of one that a student cannot satisfy is not authorable. What remains open here is **what the alternate actually is** for each mode (typed text? teacher conference? a scribe?), **who chooses it** (student self-service, or teacher grant on request), and whether a speaking assessment can legitimately mark the alternate as not measuring the target construct — i.e. the alternate may exist and still score differently. That last question is the real one.
- If a student elects the alternate, does the teacher see that they did?
- Does a no-microphone / denied-permission device get a graceful path, or a dead end? **RR-A4 turned this from hypothetical into certain:** districts routinely park students in restricted Chrome OUs with mic/camera disabled by policy, and ChromeOS hardware kill-switches sit below the browser permission layer. **A subset of any class may have capture hard-blocked through no fault of the teacher or the student** — so an alternate path is a functional requirement, not only an accessibility one.
- **New from RR-01:** the addendum can be **required**, so it needs its own answer here. A required spoken justification on an MC question excludes the same students a required spoken _primary_ does — and it's easier for a teacher to add without noticing, because the question still looks like multiple choice.

🔵 **RR-A3 (2026-08-06) gave the alternative a second job, and it is a much less
sympathetic one.** RR-04 made the alternative the **refusal path** — a student who
declines to be recorded. RR-A3 sub-decision 3 makes it also the **degradation
floor**: when a district's video gate is off, a question authored `['video']` has
its set emptied by runtime filtering and lands here.

The two jobs pull in different directions and this ticket now has to serve both:

- The **refusal** path is elected by one student, knowingly, and it is entirely reasonable for the teacher to see that they elected it.
- The **degradation** path is imposed on **every student in the class at once**, by an administrator neither they nor the teacher spoke to, on a question whose author may be in another district. Nobody elected anything, so "does the teacher see that they did?" has no meaning, and scoring the alternate differently — which the bullet above calls the real question — would penalize a whole class for a policy decision.

⚠️ **That asymmetry may be the strongest available argument that the alternate
must score equivalently**, at least on the degradation path. Whatever this ticket
decides, it should decide it for both jobs explicitly rather than answering for
the refusal case and inheriting the other by accident.

🔵 **RR-A1 (2026-08-06) moved one of this ticket's legs, and it is the leg the
first bullet stands on.** RR-04's "decided by law rather than by pedagogy" rested
on § 312.3(d) plus the Tennessen refusal element. RR-A1 sub-decision 1 found that
reasoning weaker than stated: with the institution consenting, element two only
requires **stating** whether refusal is permitted, and on a speaking assessment the
recording **is** the data reasonably necessary — so § 312.3(d) does not obviously
bite.

**The conclusion survives; its basis changed.** The mandatory floor now rests on
the **third bullet above** — RR-A4 finding 5, ChromeOS policy hard-blocking capture
for a subset of any class. That was already written here as "a functional
requirement, not only an accessibility one." It is now the **primary** ground, not
a supporting one.

**What that changes for this ticket:**

- 🔴 **The alternative now has three jobs, not two** — refusal (one student, knowingly), degradation (a whole class, by district policy, per RR-A3), and **device-blocked** (a subset of a class, by OU policy, silently). The third is the one that is _certain_ to occur in every district.
- **The "may it score differently" question gets harder, not easier.** Grounding the floor in device policy means the students landing on it are disproportionately those in restricted OUs — which correlates with exactly the populations an equity review will look at first.
- **A new sub-question RR-A1 surfaced and did not own:** RR-A1 gives the recorded path a prep clock, a limit and four expiry behaviours. **The written alternative still has no clock at all.** If the recorded path is timed and the alternative isn't, they are not equivalent in either direction. → still fog, now sharper.

🔵 **RR-08 (2026-08-06) answered this ticket's last bullet outright and made the
ticket smaller.** The bullet asked what a **required addendum** needs, since a
required spoken justification excludes exactly the students a required spoken
_primary_ does. RR-08 sub-decision 4 answers it: **nothing substitutes for a
required mode.** No text fallback, ever — Paul's reasoning was that if the
assessment is a video, text isn't a bypass, it's a different task. The slot stays
empty carrying an `unresponded` marker with a stated reason, and RR-08's submit
block therefore **only binds students for whom the requirement was satisfiable.**

**What that leaves this ticket:** the **primary mode set**, where nothing has
changed. The floor — "a mode set of one that a student cannot satisfy is not
authorable" — is untouched, and all three jobs (refusal, degradation,
device-blocked) still land here. Two consequences worth carrying in:

- 🔴 **The two slots now behave differently on purpose, and the ticket should say so out loud.** An empty primary set falls to an alternative; an unsatisfiable addendum falls to a marked-empty slot. That asymmetry is defensible — the primary _is_ the answer, the addendum is a second demand on top of it — but it will look like an inconsistency to whoever implements it unless the rationale is written down.
- **The "may it score differently" question got a concrete instance.** `capture-unavailable` is now a real, stored, per-student state that occurs in every district (RR-A4 finding 5), rather than a hypothetical. Whatever this ticket decides about equivalence, RR-06 has to turn into a number. → injected there too.

**Resolution:** ✅ **Resolved 2026-08-16 — see the full resolution at the end of this ticket.**

🔴 **RR-A2 (2026-08-06) decided this ticket's refusal leg for recording
questions, and decided it the hard way.** This ticket's three jobs are refusal,
degradation and device-blocked. **On refusal there is now nothing left to
design:** RR-A2 sub-decision 1 held RR-08's submit block with **no decline exit
of any kind** — no marker a student can set, no self-releasing state, no fallback
mode. A student who can record and chooses not to is parked until they record,
the teacher intervenes, or the 90-minute idle sweep finalizes them.

**Note carefully what did _not_ narrow.** RR-08 already removed the substitution
question for a **required addendum**; RR-A2 removes the refusal question for the
same slot. **This ticket's floor is untouched** — the mandatory non-recorded
alternative on the **primary mode set** survives exactly as RR-A1 re-grounded it,
on **RR-A4 finding 5** (ChromeOS policy hard-blocks capture for a subset of any
class). That alternative answers _"this student cannot record"_; it was never the
answer to _"this student will not record,"_ and RR-A2 declined to make it one on
the grounds that it would become the universal bypass RR-08 sub-decision 4 exists
to prevent.

⚠️ **So this ticket is now almost entirely about degradation and device-blocked.**
Both remaining jobs concern students for whom capture is _unavailable_, not
declined — which is a narrower and more tractable ticket than it was charted as,
and one with no compliance thread left running through it.

🔵 **RR-05 (2026-08-06) touches this ticket once, and in the student's favour.**
Sub-decision 6 renders `capture-unavailable` as an **explicit inline state in the
teacher's results view**, distinct from a failed upload and distinct from a
gate-caused absence. So the device-blocked population this ticket exists to serve
is now **visible to the teacher as device-blocked rather than as a blank** —
which is the minimum this ticket needs before it can argue about what the
alternative should be worth. Nothing else here changes: the non-recorded
alternative produces text, which needs no transcription, so RR-05's capability
simply does not apply to it.

🔵 **RR-06 (2026-08-07) gave the device-blocked student a grading-side outcome, so
this ticket's remaining question narrowed again — for the third time in three
days.**

- ✅ **A `capture-unavailable` slot no longer has to score zero.** RR-06 sub-decision 3 makes excuse-vs-zero a **teacher decision per response, with the reason shown**, deliberately rejecting an automatic carve-out (it would make two students' denominators differ within one class) and rejecting no carve-out at all. So the equity exposure this ticket carries now has a **concrete mitigation that already exists downstream**, rather than resting entirely on the alternative being offered upstream.
- 🔴 **Which sharpens what is actually left here.** The grading-side excuse is a **backstop, not the design.** It fires after a student has already sat through an assignment they could not do — this ticket is about them not being in that position. RR-06's rejected third option named the live gap precisely: RR-A3's gate is **set subtraction, and a set can empty without the teacher noticing**. So the question that remains is an **authoring-time** one — how a teacher learns, while building, that some of their class will hit a wall.
- ⚠️ **One thing not to absorb:** RR-06's excuse is discretionary. A teacher may decline to excuse, and nothing in the design prevents it. If this ticket wants the device-blocked student protected rather than merely visible, that is still this ticket's to say.

- 🔵 **RR-B2 (2026-08-07) narrowed this ticket a fourth time, and in the most useful direction so far.** Sub-decision 6 gives a mic-denied student a **silent timed take** instead of a blocked mode — the canvas arms alone. So on the whiteboard mode the device-blocked student is **not blocked at all**: they need neither the mandatory alternative nor RR-06's discretionary excuse. **The alternate-format problem now applies only where the missing device _is_ the whole response** — audio and video — and not where it is half of one. What survives is unchanged and is still the authoring-time question: how a teacher learns, while building, that some of their class will hit a wall.
- 🔴 **RR-B4 (2026-08-07) narrowed this ticket a fifth time — and it is the first amendment that puts a case _back_.** RR-B2 removed the whiteboard from the alternate-format problem on the grounds that a mic-denied student still gets a silent take. RR-B4 sub-decision 3 then made **portrait a hard gate**, so a student on an orientation-locked or mounted device has a whiteboard wall after all. Three things make it a smaller problem than the one RR-B2 removed: it is **recorded** rather than silent (sub-decision 4), so the teacher sees a reason; it is **knowable at authoring time** in a way a denied microphone is not, because device orientation policy is a property of the deployment rather than of the moment; and it is **the exact case this ticket's surviving half is about.** ⚠️ It also means the answer "there is no alternate format, only an authoring-time warning" now has to hold for a student who is blocked by hardware they cannot change — which is a harder sentence than the one RR-06 excused on the grading side.

- 🔴 **RR-10 (2026-08-09) took this ticket's surviving half, deliberately and with Paul's decision at the top of the session — so what remains here is smaller and sharper than it has been since RR-01.**
  The overlap was real: _"how a teacher learns, while building, that some of their class will hit a wall"_ is the same screen as RR-10's fork C completability axis. **The line drawn is surface versus policy.** RR-10 owns the **authoring-time signal** and has now specified it — a live, non-blocking advisory in the editor's context-pane banner (RR-10 sub-decision 5), the first warn-but-permit surface in this codebase, sitting **alongside** RR-A3's pre-launch warning rather than replacing it. **This ticket keeps everything else**, and it is all policy: what the alternate actually _is_ per mode (typed text? teacher conference? a scribe?), **who elects it**, whether it may legitimately score differently, and the refusal-versus-degradation asymmetry where one student elects a path knowingly and a whole class has one imposed by an administrator they never spoke to. ⚠️ **The consequence for whoever runs this next:** the warning surface is now **built and specified elsewhere**, so this ticket's job is no longer to invent one — it is to decide **what that advisory is allowed to say**, and the honest form of that sentence depends entirely on whether an alternate exists, who grants it, and what it scores. **An advisory that warns a teacher about a wall it cannot describe is worse than none.**

---

#### RR-07 Resolution — _resolved 2026-08-16_

> ✅ **Provisional flag lifted 2026-09-01.** RR-A5 closed on Paul's confirmation that district Chromebooks are current and the app is approved, so sub-decision 1 no longer rests on an unrun measurement.

🔴 **This ticket answers its own title question with _"there isn't one."_ There is
no alternate format, and the mandatory non-recorded floor is deleted.** Both of
its supports had already been withdrawn and nobody had noticed they were both
gone: RR-A1 (2026-08-06) took away the legal one — § 312.3(d) does not obviously
bite once the institution consents and the recording _is_ the data reasonably
necessary — and moved the floor onto **RR-A4 finding 5**, restricted Chrome OUs
with capture disabled. **Paul removed that one too: mic access on student devices
is grantable.** The floor was a sentence this map inherited across five
amendments and never re-derived.

**1. There is no alternate format. Four mechanisms at four different times
replace it.**

| When           | What                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding** | The district allowlists the app origin in `AudioCaptureAllowedUrls` for the student OU. Capture works. **This is RR-A5 item 4**, and it moves from an errand to a deployment step. |
| **Runtime**    | Capability failure → the student is **told plainly**, the slot is marked `capture-unavailable`, and the student **moves on immediately**.                                          |
| **Grading**    | The teacher picks one of three, per response: **excuse** · **blank** · **offline substitute**.                                                                                     |
| **Authoring**  | RR-10's advisory names the wall and the remedy in one sentence.                                                                                                                    |

**Rejected: keep the floor as charted** — it reinstates precisely the universal
bypass **RR-08 sub-decision 4** and **RR-A2 sub-decision 1** each refused, on
grounds weaker than either of them had. **Rejected: keep it for districts that
have not allowlisted** — two student experiences for the same action, switched by
a config state the teacher cannot see and did not set, and a teacher authoring a
shared PLC quiz could not know which one their students would get.

**2. Two policies, not one — and the ticket says so out loud, which is what it
was warned to do.**

**Degradation** (RR-A3's district gate off; a `['video']` set emptied by runtime
filtering) is **prevented upstream** — RR-10's editor advisory plus RR-A3's
pre-launch warning — and must **never reach a student**. A class-wide fallback is
an assessment-design failure, not an accommodation. **Device-blocked** is
**served at runtime**, because it cannot be prevented. They share a mechanism and
**not** a rationale; the map's warning against answering for one and inheriting
the other is discharged here explicitly.

**3. The student is told and moves on. They are never held.**

The alternative was holding the student on a blocked question pending a live
teacher decision on the monitor — Paul's proposal, and it is the shape a teacher
reaches for. ⚠️ **It fails on a fact:** `QuizLiveMonitor.tsx`'s own header comment
reads _"teacher view during a **live quiz session**,"_ and it is a dashboard
widget — it exists only while the teacher has the quiz widget mounted. Meanwhile
`dueAt` appears five times across the assignment types (`types.ts:682, 864, 974,
4022, 4523`); quizzes are assigned with due dates and worked through
`/my-assignments`, **where there is no session, no monitor and no teacher awake** —
and where a student is most likely to be on an unmanaged device. **Moving the
adjudication off the monitor and into the grading queue dissolves the latency
problem and the asynchronous problem at once**, because the grading queue is by
definition a place where a teacher is present and paying attention.

**4. The teacher's three outcomes, and where each one lands.**

- **Excuse** → omitted from the gradebook.
- **Blank** → `not-attempted` → a real 0.
- **Offline substitute** → `scored`, with a **mandatory note**.

**5. The default is `awaiting-grade`, and that is what makes a silent zero
structurally impossible.** 🔵 **RR-06 already paid for this.** Sub-decision 1 makes
`awaiting-grade` **omit the student from the gradebook** while `not-attempted`
pushes a real 0 — so a `capture-unavailable` slot **cannot** auto-push a zero, and
only the teacher's explicit three-way choice moves it. Paul's requirement — _"so a
teacher doesn't just let a zero auto submit into the gradebook"_ — is satisfied by
construction rather than by discipline, and RR-06 built the mechanism for an
entirely unrelated reason. **This also answers what RR-06 left here**: the
device-blocked student is **protected, at the slot rather than at the grade**. The
teacher still decides; they simply cannot decide by default or by inattention,
which was RR-06's stated objection to an automatic carve-out (it would make two
students' denominators differ within one class).

**6. "Substitute" means offline — the teacher attests to a response they
witnessed.** No student-facing surface, no second task. **Rejected: typed text in
the same slot** — the thing RR-08 sub-decision 4 refused for the addendum, on
Paul's own reasoning that _"if the assessment is a video, text isn't a bypass,
it's a different task,"_ which is **stronger** for the primary because the primary
_is_ the assessed construct. **Rejected: reassign the question in another mode** —
real work for a rare case. ⚠️ **Accepted cost, and it is the sharpest one here:
no artifact ever exists.** The slot stays permanently empty, the grade rests on a
teacher's attestation, and the district's record for that question is a score and
a note with nothing behind it — while under RR-04 every other response on this map
lands in Drive under the student's real name as a durable record. The mandatory
note is the whole of the mitigation.

**7. The trigger is automatic capability failure, there is no student-raisable
flag, and the detector is the count rather than a flag.**

⚠️ **The reasoning offered for automatic-only was wrong and Paul caught it.** I
argued automatic was safe _because_ student-raisable would be the refusal bypass —
but a student can manufacture a capability failure trivially (deny the prompt,
flip the ChromeOS Quick Settings toggle, close a privacy shutter), so
**"automatic" is student-raisable with extra steps** and the distinction does not
exist. **The conclusion survives on a different basis.** What makes a fake block
attractive is that it is **silent and free**; sub-decision 3 removes the silence
by telling the student the question goes to their teacher ungraded, which is
exactly the shipped tab-warning idiom (`VideoActivityStudentApp.tsx:876`,
_"Warning 2 of 3"_ — counted server-side, surfaced in the live monitor, preventing
nothing). And the gaming student is caught by **the count across a class**, which
no per-student flag can convey: 3 of 28 means check the OU config, 1 of 28 means
talk to that student.

🔴 **Rejected: treat it as an integrity signal beside `Warnings`.** This was
refused on equity grounds — the blocked population is disproportionately students
in restricted OUs, so the column would put a child under suspicion for a
configuration their district chose. ⚠️ **Paul's granted-access answer substantially
withdraws that objection**, since that population largely does not exist once the
origin is allowlisted. It is refused anyway, on **RR-A2's** grounds: RR-A2 kept
take counts away from that column because **adjacency to `Warnings` _is_ the
accusation**, and the same holds for a mic that failed. **Rejected: treat a
failure as refusal** and apply RR-A2's no-exit block — a dead mic and a refusal
are indistinguishable, so a student with a broken headset would be parked with no
way to rescue themselves. **Rejected: teacher-informed but student told nothing** —
it preserves exactly the silent free skip Paul objected to.

**8. A `capture-unavailable` primary slot does not block Submit.** Same carve-out
RR-08 sub-decision 6 already granted the addendum — the block _"only binds
students for whom it was ever satisfiable."_ Blocking would park the blocked
student, which is what sub-decision 3 exists to prevent.

**9. RR-B4's portrait gate is `capture-unavailable` by another cause, with no
special handling.** Students are on Chromebooks and laptops; the app is
landscape-locked with a rotate-your-device alert. RR-B4's orientation-locked and
mounted-device cases fall through to the same adjudication path as a failed
microphone and need nothing of their own.

**10. The advisory wording, which is what RR-10 came here to collect.**

> _"If a student's device blocks the microphone, the question comes to you
> ungraded — you choose whether it's excused, scored zero, or answered another
> way."_

Non-blocking, in the editor context pane, alongside RR-A3's pre-launch warning per
RR-10 sub-decision 5. **It must not use the word _skip_** — that was the first
draft and Paul rejected it, correctly: it reads as the student getting out of the
question rather than the question landing on the teacher's desk with a decision
attached, and a skimming teacher takes the first reading. **It must not promise a
text alternative**, because there isn't one, and it must not imply the teacher can
prevent the wall, because they cannot. **Rejected: say nothing** — RR-10 refused
silence on the storage axis for a stated reason, and the argument is harder here
because this one has a student on the other end of it.

##### Prices and unverified premises

- ⚠️ 🔴 **The load-bearing premise of this resolution has not been measured.**
  Everything above rests on capture being **granted**, and "grantable" is
  asserted rather than measured — **RR-A5 item 4 is the errand that makes it
  true and it has never been run.** Paul is plausibly the person who can run it
  in his own district, which makes this first-hand knowledge rather than a
  guess; it is still a claim, and this map's own standing rule (RR-10) is that a
  claim is not a citation. **If item 4 comes back "no," sub-decision 1 is
  reopened, not adjusted.**
- ⚠️ **Kill-switches and hardware faults sit below the allowlist.** ChromeOS Quick
  Settings toggles and physical privacy shutters are under the browser permission
  layer entirely, and a dead or unplugged mic is not a policy question. Allowlisting
  never empties the anomaly path — it only makes it rare, which is the whole
  premise of sub-decisions 4 and 7.
- 🔵 **RR-A5 item 3 is promoted from a technical check to a design dependency.** It
  was charted as _"does a silent track ruin a recording."_ It is now the
  measurement that decides whether a policy block and a user denial are separable
  at all — i.e. whether this design could ever distinguish a gaming student from a
  blocked one. **It is the second RR-A5 item this resolution depends on.**
- **RR-A4 finding 5 is amended, not retracted** — recorded there in place.
  Restricted OUs with capture disabled are a real default; they are a **remediable
  configuration** rather than a permanent wall, which is what removes them as this
  ticket's grounding without making the observation wrong.
- ✅ **One fog patch dissolves rather than graduates.** _"Does the non-recorded
  alternative run on the same clock as the recorded one?"_ has waited since RR-A1
  for this ticket to say what the alternative is. There is no alternative on the
  student's device, so there is no second clock to reconcile.
- 🔴 **And one new patch opens, by a route this resolution creates.** SpartBoard is
  externally available; a district that never allowlists puts **every** student on
  the anomaly path at once. That is degradation by a route RR-A3's gate does not
  cover and the sub-decision 10 advisory does not describe. Recorded in **Not yet
  specified**.

**Paul's notes:**

---

### RR-08 — What counts as "answered" when a question has a required addendum?

**Type:** grilling + domain-modeling (HITL) · **Status:** ✅ **Closed 2026-08-06** · **Blocked by:** ~~RR-02~~ (closed) · _Opened 2026-08-04 by RR-01's resolution_

**Question**

RR-01 established that a question can carry a **required, separately-pointed
addendum**. That splits a single question into two artifacts that can complete
independently, and nothing in the shipped model expects that.

- A student answers the MC and skips the required recording. Is the question answered, partially answered, or unanswered? What does the submit button do — block, warn, or allow?
- ~~`QuizResponseAnswer.status` is `'draft' | 'submitted'` on **one** answer object. Two artifacts can be in different states…~~ **Answered by RR-02:** `status` stays on the answer and keeps meaning **student intent**; each artifact carries only a separate `uploadState`. So the two artifacts can't be in different _intent_ states — the question is atomic with respect to submission. What this ticket must still decide is what intent-submit **means** when one artifact is `uploadState: 'pending'` or `'failed'`.
- 🔴 **New from RR-02, and the sharpest thing on this ticket: `answer: ''` is now a legitimate, complete response.** A pure-audio answer stores an empty `answer` string and puts everything in `artifacts[]`. Every existing check that infers "answered" from a non-empty `answer` is now wrong — including the progress indicator, the `alreadyAnswered` gate, and `isUnsafeBlankDraft` (`useQuizSession.ts:2277`), whose entire purpose is refusing to let `''` clobber a saved answer. Deciding "answered" here is therefore not just a UX call; it's a correctness fix to shipped guards.
- The scheduled idle **auto-submit sweep** finalizes stale responses. What does it do with a question whose text is done and whose required recording was never started? Submitting it silently scores a zero on an artifact the student may not have known was required.
- Does the progress indicator ("4 of 10 answered") count a half-done question?
- ~~Does a required addendum interact with per-question `timeLimit` — one clock for both artifacts, or one each?~~ **Partly answered by RR-A1:** `timeLimit` is untouched and forced to 0 on recording questions (it feeds speed-bonus scoring), and recording timing lives in its own `recording` block. What's left here is whether the addendum gets its own clock or shares the primary's.

🔵 **RR-A1 (2026-08-06) handed this ticket a live stall in shipped code, and it is
the reason RR-08 is now the front of the frontier.**

RR-A1 made the prep-expiry behaviour a **per-question teacher setting** with four
values. Two of them — `auto-advance` and `armed` — pass over a question **without
writing anything to `answers[]`.**

🔴 **`'auto'` session mode advances only when every student has answered**, tested
as `r.answers.some(a => a.questionId === currentQId)` at
`hooks/useQuizSession.ts:1313`. So a single student who lets prep expire on an
`armed` question — or who is auto-advanced past one — **holds the entire class
indefinitely.** Nobody is stuck on a screen; the session simply never progresses,
which is the worst shape of failure to diagnose live in a classroom.

This is the same question as the `answer: ''` bullet above, arriving from the
opposite direction: that one asks whether an entry with an empty string counts as
answered, this one asks whether a **passed-over question should produce an entry at
all**. A `status: 'passed'` or `'skipped'` entry would answer both at once — but it
also decides what the auto-submit sweep, the progress indicator and the gradebook
see, which is why it belongs here and not in RR-A1.

⚠️ **Note the interaction with RR-A1's `unanswered` value**, which closes a question
permanently. If "unanswered" writes a record and "armed at expiry" doesn't, then the
harshest branch is the one that keeps the class moving — an incentive nobody
intended.

📎 **Grounding asset (2026-08-06):**
[`docs/rich-response/rr-08-answered-state-grounding.md`](rich-response/rr-08-answered-state-grounding.md)
— a read-only audit of every place shipped code decides "answered." **Read it
before the session**; it changes where the difficulty is.

The reassuring half: shipped code almost never tests `answer` for emptiness. It
tests whether an entry for the `questionId` **exists** in `answers[]`, so most
progress counts, gates and sweeps survive `answer: ''` untouched.

🔴 **The half that isn't reassuring — and it is not an emptiness check at all.**
`submitAnswer` (`hooks/useQuizSession.ts:2349-2362`) rebuilds the
`QuizResponseAnswer` as a **fresh object literal** — no `...priorEntry` spread —
and then writes the whole `answers` array back. **Any sibling field on the prior
entry is dropped**, which under RR-02 means `artifacts[]` is silently destroyed
on the very next write to that question: a debounced draft autosave, a back-nav
revisit, a timer-expiry write. Nothing catches it — the Firestore rules whitelist
top-level keys only, and unlike video-activity responses
(`firestore.rules:3470-3479`) quiz `answers` carries **no append-only guard**.
Every other writer in the codebase spreads correctly; this one is the exception.
**Verified against source 2026-08-06** (both halves — the missing spread and the
rules asymmetry).

It is **not a bug today** — `isCorrect` is documented as never-student-written
and recomputed — so it needs no fix now. It becomes data loss the moment RR-02
ships, which makes it this ticket's problem rather than a maintenance one. Note
the irony: RR-02 chose a sibling field partly _because_ it needs no rule change
to be written, and it needs none to be destroyed either.

Two more things the audit surfaced that bear directly on the question:

- **The written-response teacher-paced Submit button already implements the exact three-state model this ticket needs** — `null` (untouched / cache unseeded) vs `''` (deliberately empty) vs non-empty (`QuizStudentApp.tsx:2638-2649`). MC / FIB / Matching / Ordering all collapse `null` and `''` into a single falsy check, which is why they'd physically disable Submit on an artifact-only response. Generalizing the written branch is likely the smallest correct answer, and its rationale is already written down in-repo.
- ⚠️ **There is no shipped concept of "partially answered" anywhere** — not in `GradeResult`, not in `QuizResponseAnswer`, not in the rules, not in any UI string. Whatever this ticket decides, it is **introducing a state**, not refining one.

**Resolution** — grilled with Paul 2026-08-06, nine sub-decisions. Both landmines
were re-verified against source before the session opened; both hold.

**1. Every question the student leaves behind writes an entry to `answers[]`.**
Absence now means exactly one thing: **the student hasn't got there yet.**

The `'auto'`-mode stall RR-A1 found is a symptom, not the disease. The predicate at
`hooks/useQuizSession.ts:1318` is one of roughly ten presence-based consumers — the
"N of M answered" count, `QuizLiveMonitor`'s per-student chips, `QuizResults`'
`qStats.answered`, `canScoreResponse`, the Sheets export. Patching only the
predicate would leave the other nine unable to tell a passed-over question from one
the student hasn't reached, and **absence is not transmissible**: it arrives at the
teacher as silence either way. Only a write carries the fact.

The codebase already depends on this being true — `types.ts:365-371` documents
`pointsByQuestionId` as keyed by qid _"so a missing entry means unanswered
unambiguously,"_ which only holds if nothing else can produce a missing entry.

**Rejected: fix the predicate alone** (one call site, and nine consumers left
lying). **Rejected: write an entry only for `auto-advance`**, the invisible case —
it makes "is there an entry?" depend on which of four authored values the teacher
picked, which is an invariant nobody can hold in a mixed assignment.

**2. Two axes, two fields. `status` is untouched.**

`status` already carries **finality** — `draft` = returnable, `submitted` = final,
read by `isAnswerSubmitted` (`types.ts:3495`) — and RR-A1's four expiry values
disagree about finality (`auto-advance` leaves the question returnable;
`unanswered` closes it). So finality was already solved and must not be re-solved.
What was missing is the second axis: **did the student respond at all.**

```ts
interface QuizResponseAnswer {
  // ...unchanged
  status?: 'draft' | 'submitted'; // finality — UNCHANGED, still two values
  unresponded?: UnrespondedReason; // NEW — absent means the student responded
}
```

Both RR-A1 branches become expressible: `auto-advance` writes
`{ status: 'draft', unresponded: 'passed' }`, the `unanswered` value writes
`{ status: 'submitted', unresponded: 'expired' }`. The reason vocabulary below is
illustrative, not final — see "not decided."

**Rejected: a third `status` value `'passed'`.** Blast radius points the right way
(TypeScript exhaustiveness forces every reader to confront the new state), but it
overloads finality with provenance: `isAnswerSubmitted` must rule on whether
`'passed'` is submitted, and whichever way it rules, **the other RR-A1 branch
becomes inexpressible.** One field cannot say "final, and never responded to."
**Rejected: infer it from emptiness** (`answer === '' && !artifacts?.length`) —
that shape is already reachable in shipped code, because written-response NEXT is
deliberately ungated (`QuizStudentApp.tsx:2604-2619`), so a student can read an
essay prompt, type nothing and submit. It conflates _chose to submit nothing_ with
_never got the chance_, which is the distinction that matters most to a teacher.

⚠️ **The cost, recorded rather than smoothed over:** an optional sibling field is
invisible to every existing reader. Nothing forces the ten presence-based consumers
to confront it — they will keep counting these entries as answered until each is
visited deliberately. Sub-decision 7 is what makes that a finite list rather than a
standing hazard.

**3. Submit blocks when a required addendum is missing.**

**Paul chose this against my recommendation** (I argued for warn-then-allow), so
the reasoning on both sides is worth keeping. The case against blocking was that
**any client-side block is bypassed by walking away** — `finalizeIdleQuizAttempts`
promotes drafts with no notion of completeness and is the only function in
`functions/src/` that touches `answers` at all, so a student who hits the block and
closes the tab is finalized incomplete anyway. The case for it is simpler and won:
_required_ that does not block is not required, it is a suggestion, and a teacher
who marks a spoken justification required on a speaking assessment means it.

The two objections became **obligations rather than arguments**, and sub-decisions
4, 5 and 6 are where they are paid: nobody may be blocked from something they
cannot do (4), the walk-away path must still record the truth (5), and the block
must never wait on an unbounded network (6).

**4. Nothing substitutes for a required mode. The slot stays empty, marked why.**

There is **no text fallback for a required addendum.** Paul's objection killed my
proposal outright: _"if it's supposed to be a video, a student shouldn't be able to
bypass it with text."_ For a speaking assessment there is no text equivalent —
offering one produces a response that isn't the assessment, and then obliges
someone to rule on what it's worth.

So the student who physically cannot record submits everything else, and the
addendum slot carries sub-decision 2's marker with reason `capture-unavailable`.
**The block therefore only binds students for whom the requirement was satisfiable.**
It is not an escape hatch; it is that the requirement never applied.

This also repairs the objection I had raised one question earlier and then had to
withdraw. I argued that a capability-conditional block is self-releasing, because a
student can deny the mic prompt on purpose and RR-A4 finding 5 says ChromeOS policy
blocks sit below the permission layer, so the two are hard to tell apart.
Sub-decision 2 had already answered it: the gaming does not disappear, but it stops
being **invisible** — that student now shows up in the teacher's monitor as
"capture unavailable" rather than as a silent blank.

**5. The idle sweep marks empty required slots when it finalizes — at zero read cost.**

My instinct here was to leave the sweep dumb and infer incompleteness at read time.
That rested on a false cost assumption, found by reading the function: the sweep's
local `QuizSessionDoc` shape is thin, but **`publicQuestions` lives on the session
doc** (`types.ts:3262`), and the sweep **already batch-reads every parent session
doc** (`finalizeIdleQuizAttempts.ts:252`) to skip paused and waiting ones. It is
holding the requiredness data already and simply doesn't look at it.

So on finalize it writes sub-decision 2's marker with reason `abandoned` into any
required slot left empty. **One writer, one truth** — the incomplete state is a
stored fact, not something five teacher surfaces each recompute. That matters
because the audit's landmine #8 documents this exact drift already shipped:
`QuizLiveMonitor:932` counts drafts as answered and the student gate at
`QuizStudentApp.tsx:899-903` does not.

📐 This requires the required-addendum flag to ride in `QuizPublicQuestion`, which
it must anyway — the student client needs it to render sub-decision 3's block.

⚠️ **Consequence:** the marker now has **two writers**, the client for the
passed-over case and the server for the abandoned one. They must agree on the
vocabulary, and nothing in Firestore can enforce that (see sub-decision 9).

**Rejected: refuse to finalize incomplete responses** — the sweep is the only
server-side writer of `answers`, so nothing else would ever finalize them; they
would hold attempt slots forever and clutter the monitor with students who left
days ago.

**6. Submit blocks on an in-flight upload — bounded, with retry on failure.**

RR-02 writes artifact metadata before the bytes finish, and RR-A1 fixed the take at
4.0 MB / ~16 s, so "Submit pressed while `uploadState: 'pending'`" is not an edge
case — it is the normal case for a student who records and submits immediately.

What makes it sharp is RR-A1 sub-decision 7: **a lost take is lost.** Nothing is
persisted before commit and nothing survives the tab closing, so a student who
submits and walks away mid-upload leaves an artifact stuck at `'pending'` forever —
the teacher sees "recorded, never arrived" and there is nothing anywhere to
recover. Blocking keeps the student present during **the only window in which a
failure is still recoverable.**

**Bounded, because the tail is unknown.** RR-A1's 16 s assumes 2 Mbps; thirty
students uploading at once on school wifi is RR-A6's problem and RR-A6 is blocked
on RR-A5. So past a threshold — or on `'failed'`, after offering a retry — the
block releases and the state is recorded honestly. **This ticket cannot pick the
threshold and does not pretend to; RR-A6 owns it.**

**Rejected: allow submit with a `beforeunload` guard** — dismissible, and ignored
on mobile tab-switch, so the guarantee is softer than it looks. **Rejected: allow
unconditionally** — it converts a recoverable failure into an unrecoverable one for
every student who closes the tab.

**7. One completeness predicate: a question is complete iff every required slot is
filled. Binary for the student, three states for the teacher.**

This is settled by a constraint rather than by taste. After sub-decision 3 a
half-done question **cannot be submitted** — so if the progress indicator counted
it, the student would read "8 of 10 answered" while Submit refuses them on three of
those eight. **The indicator and the submit gate must be the same predicate**, or
the student cannot act on what they are being told.

That single predicate also absorbs sub-decision 1's bill for free: passed-over
entries are not complete, so they don't inflate the count.

The **teacher's monitor gets the richer view** — answered / started-but-incomplete /
never-reached — because "stuck on the recording" and "hasn't got there" demand
opposite interventions, and only the teacher can act on the difference.

⚠️ **This is a new state, not a refinement.** The audit is explicit that
"partially answered" exists nowhere in the codebase — not in `GradeResult`, not in
`QuizResponseAnswer`, not in the rules, not in a single UI string.

**Rejected: three states for students too** — most informative, and it would tell a
student exactly where to go back to, but "incomplete" is a stressful word to read
on a clocked assessment when the cause is a microphone that won't work. **Rejected:
binary everywhere** — it throws away the one distinction the teacher most needs
live.

**8. The recording clock governs the addendum slot only. Prep starts on entering it.**

One inference this ticket makes explicit: **an MC question with a recording
addendum is a recording question** for RR-A1 sub-decision 3's purposes, so
`timeLimit` is forced to 0 there too. Otherwise speed bonus —
`(remaining / currentQuestion.timeLimit) * 50` at `QuizStudentApp.tsx:1909` — would
still be paying points for speaking fast, which is the exact thing RR-A1 killed.
The `recording` block therefore holds the only clock on the question.

The student answers the primary at their own pace; **opening the recording starts
prep**, then the limit. This preserves what prep is _for_: RR-A1's rationale was
_"only X amount of time before performing,"_ and a clock started at question
display would hand a student who read the stimulus carefully five seconds of prep —
converting a thinking allowance into a penalty for reading.

⚠️ **Accepted cost:** the primary is genuinely untimed, so on an `'auto'` session a
student who never engages still holds the class. **That is true of every shipped
question type today** — sub-decision 1 fixes the stall RR-A1 found, which is the
_passed-over_ case, not the _never-engaged_ one. See "not decided."

**Rejected: one clock over the whole question** — bounds total time, which is
probably what a teacher picturing a timed speaking assessment imagines, but it
spends prep on work that isn't preparation to speak and penalises careful reading
hardest for the students who need the reading time. **Rejected: two independent
clocks** — most expressive, but RR-A1 already rejected an org-admin quality ladder
on the grounds that more levers make behaviour unpredictable to support, and the
same argument applies to a second timing block on the same editor.

**9. The `submitAnswer` spread fix gets its own implementation ticket, ahead of RR-02.**

A standalone change with a regression test, landed **before** any RR-02 work
starts. It is provably harmless today — `isCorrect` is documented as
never-student-written and recomputed — which is precisely why now is the cheap
moment: it can be verified in isolation instead of debugged inside a feature
launch, and the surrounding semantics are already pinned by
`tests/hooks/useQuizSession.test.ts:533-570`.

🔴 **It is not the one-line fix the audit implies.** Adding `...priorEntry` at
`useQuizSession.ts:2349` would also carry forward the prior entry's `speedBonus`,
which is currently included **conditionally** — only when this write earns one. A
naive spread makes a stale speed bonus survive a re-answer. The real fix is
"spread, then explicitly re-own every field this write owns," and it needs a
decision about `speedBonus` and `isCorrect` rather than a keystroke.

🔴 **There is no rules-level backstop available, and this is worth recording once
so nobody goes looking.** The video-activity guard (`firestore.rules:3470-3479`)
works because those answers are **appended** — `answers.hasAll(resource.data.answers)`.
Quiz answers are **replaced** (filter-then-append at `useQuizSession.ts:2359-2362`),
so `hasAll` can never hold, and Firestore cannot validate array element shape at
all. Whatever protects `artifacts[]` is client discipline plus a test. Nothing else
is on offer.

---

**Two consequences this ticket derives but does not decide.**

🔴 **Refusal now collides with the block, and RR-A2 owns the collision.** RR-A1
sub-decision 1 put refusal in the discard — "stop, don't keep this." But a
refusing student **can** record; they chose not to. So by sub-decision 4's own
logic the block binds them, and on a self-paced quiz they are parked on that
question until they record it, the session ends, or the sweep ages them out and
marks it `abandoned`.

That is arguably coherent — refusing a required assessment task means not
completing it, exactly as refusing to write an essay does, and RR-A1's `armed`
value already ships indefinite parking as an authored, accepted state. But it means
**the refusal RR-A1 designed and the block RR-08 chose are in tension**, and the
resolution is a UX question about the discard, which is RR-A2's. → injected there.
**Do not read this paragraph as a decision.**

📐 **`armed` still stalls an `'auto'` class, and that is now the correct
behaviour.** Sub-decision 1 makes `auto-advance` and `unanswered` both write
entries, so the incentive asymmetry RR-A1 flagged — where the harshest branch would
have been the only one keeping the class moving — **is resolved.** `armed` writes
nothing because nothing has been passed over: the student is still on the question,
visibly, and the teacher can see them in `QuizLiveMonitor`. That is an ordinary
slow-student case, not the invisible stall.

**What this ticket did not decide:**

- **The exact reason vocabulary.** `passed` / `expired` / `abandoned` /
  `capture-unavailable` is illustrative. Two writers (client and sweep) must agree
  on it and nothing can enforce that, so pinning it is an implementation concern
  with a test attached, not a map decision.
- **The pending-upload threshold in sub-decision 6.** → RR-A6, which is blocked on
  RR-A5. Naming a number here without the hardware data would be inventing one.
- **What an incomplete question is _worth_.** `GradeResult` has no "unanswered"
  return value at all (audit §4.1), so a blank and a wrong answer are
  indistinguishable to every consumer today. This ticket creates the state; **RR-06
  must give it a grade semantics.**
- **Whether a non-recorded alternative exists at the _mode_ level.** Sub-decision 4
  is about the **addendum slot only**. RR-07 still owns the primary mode set, and
  its floor — "a mode set of one that a student cannot satisfy is not authorable" —
  is untouched by this ticket.

🔵 **RR-A2 (2026-08-06) resolved the collision this ticket derived — by finding
that this ticket's framing of it was wrong.**

1. ✅ **Sub-decision 3's hard submit block stands, unamended.** RR-A2 sub-decision 1 declined to add any refusal exit.
2. ↯ **The compliance thread this ticket flagged does not exist.** RR-08 recorded that _"a product that says 'you may refuse' and then blocks the exit has made that statement false."_ It hasn't. § 13.04 subd. 2 element (b) requires **stating whether** refusal is permitted, not permitting it — a correction RR-A1 had already made to RR-04 and which this ticket did not pick up. With element (c) stating the consequence, the interstitial is fully truthful and the block is fully honest. **The collision was real as a UX question and never a legal one.**
3. ✅ **The `unresponded` reason vocabulary is NOT extended.** This ticket left it open specifically so RR-A2 could add a `declined` reason if it wanted refusal expressible as a distinct outcome. **RR-A2 declined** — with no decline exit, there is no moment at which such a reason would ever be written. `capture-unavailable` and `expired` stand as the vocabulary.
4. **Sub-decision 7's completeness predicate is unaffected by takes.** A question is complete iff every required slot is filled, and **any committed take fills its slot** — so one take and six takes are identical to the predicate, to the student's binary progress count and to the teacher's three states. Retakes change what is _in_ a slot, never whether it is filled.

🔵 **RR-05 (2026-08-06) gave this ticket's most abstract distinction its first
concrete rendering.**

1. ✅ **The ask in RR-05's injection was honoured rather than absorbed.** This ticket argued that an `unresponded` slot and an artifact stuck at `pending`/`failed` are **different kinds of absent** and should surface differently. RR-05 sub-decision 6 makes them **two distinct inline states in the results view**, against a third behaviour — total invisibility — for gate-caused absence. The organising rule it landed on is worth carrying forward: **hide what the teacher cannot act on, explain what they can.**
2. **`unresponded` now has a consumer outside the submit gate and the sweep.** Until now the field drove completeness and finalization. It is now also read by a rendering decision in a teacher-facing surface, which makes it the first of this ticket's two axes to be **directly visible** rather than merely load-bearing. Nothing changes about its semantics; its blast radius grew.
3. **The reason vocabulary stayed closed, twice.** RR-A2 declined to add `declined`; RR-05 needed nothing new either — `capture-unavailable` and `expired` are sufficient for the inline state it specified. **Two consecutive tickets have now had the chance to extend it and neither wanted to**, which is reasonable evidence the vocabulary is right rather than merely untested.

🔴 **RR-06 (2026-08-07) priced this ticket's state — and found that sub-decision 1
breaks a documented export contract for every question in every quiz, not only for
media.**

1. 🔴 **The always-write-an-entry rule silently deletes the Sheets export's "unanswered" cell.** `assignmentExportShared.ts:170-178` emits `''` **only when no answer entry exists** for a question. Once every question the student leaves behind writes one, the lookup starts hitting, `gradeFn` runs, and the cell becomes `'0'` — which `quizDriveService.ts:817-821` documents as _"answered, incorrect."_ **The empty cell stops occurring at all.** The same parser feeds the PLC cross-teacher aggregation tab, so it lands on a second surface. RR-06 recorded this as **scheduled implementation work that must land with this ticket's change or before it**, alongside RR-A2's four-consumer `takeIndex` change — same failure shape, same rule: never after.
2. ✅ **`unresponded` finally has a number attached to it.** RR-06 sub-decision 1 adds `state: 'not-attempted'` to `GradeResult`, sub-decision 2 sends it to the gradebook as a real 0 while omitting merely-ungraded work entirely, and sub-decision 3 lets the teacher **excuse it per response with the reason shown** rather than letting a device policy score a child. That is this ticket's fourth owed answer paid, and the equity exposure sub-decision 4 guaranteed now has a mitigation in the grading surface rather than only a warning.
3. 🔴 **The queue filter this ticket broke is named, and its fix is elsewhere.** `WrittenResponseGrader.tsx:75-82` selects gradeable responses by **presence in `answers[]`** — so under this ticket every student appears for every question and the filter stops filtering. RR-06 sub-decision 9 replaces the traversal wholesale (question-major, driven by the completeness predicate rather than by array presence), so this is fixed **by** the grading redesign rather than owed to it.
4. ✅ **Sub-decision 7's single completeness predicate was used exactly as this ticket intended.** RR-06 hung "needs grading" on it, per the 📐 gift RR-05 flagged — and then sub-decision 10 sharpened the unit: the predicate answers per **slot**, so nine auto-graded MC slots and one `awaiting-grade` video slot coexist inside one question.

5. ✅ **RR-B2 (2026-08-07) answered the completeness question this ticket handed the B track, and the predicate needed no amendment.** A narrated whiteboard is **one artifact in one slot** — audio and strokes arm together and commit together — so _"complete iff every required slot is filled"_ applies unchanged, and the fork's other branch (two artifacts, one plainly half-filled) never arose. 🔵 **Sub-decision 4 then answered the harder half:** a **silent** take is complete, because SpartBoard never inspects what a child recorded in order to decide whether they responded. So the whiteboard case adds **no third rule** — the block in sub-decision 3 binds on a missing take, never on a missing narration. **The two rejected options are the interesting part:** blocking on silence, and flagging it, both require automatically analysing a child's recording, which would have put a new processing claim in RR-04's notice and made a whispering student and a broken microphone the same signal.
6. ✅ **RR-B4 (2026-08-07) exercised the second axis exactly as designed, and again needed no amendment.** A portrait-gated student's slot is **final and never responded to** — the sentence sub-decision 2 created the `unresponded` field to be able to say, and which `status` alone cannot express. It arrives with a reason attached (RR-B4 sub-decision 4), which rides on RR-02's provenance field rather than on anything here. **Two tickets in a row have now landed on this predicate without moving it**, which is the strongest evidence available that the two-axis split was the right shape.

7. ✅ **RR-C3 (2026-08-07) resolved the read-cost question its audit raised in this ticket's favour, and the answer is "free."** The audit noted that sub-decision 5's zero-extra-read property depends on the sweep reading `publicQuestions` off the session document it already batch-reads — and that a stimulus placed on the **quiz** (Drive JSON) would sit outside that reach, needing a Drive fetch `finalizeIdleQuizAttempts` does not make. RR-C3 put the array on the quiz, **but the session gets a projected copy** (RR-C3's derived item 4 adds a new top-level field to `QuizSession` beside `publicQuestions`). So anything server-side that needs to know a stimulus exists reads it from a document already in hand. **Nothing in this ticket's decided behaviour needs it today**; what matters is that the option stayed free rather than being spent.

**Paul's notes:**

---

### RR-09 — Get the four answers that only the district and Google can give

**Type:** task (HITL — district counsel, records officer, and Google) · **Status:** ✅ **Closed 2026-09-01** (by Paul; no email sent) · **Blocks:** nothing · _Opened 2026-08-04 by RR-04's research_

> 🔵 **Stale line corrected 2026-08-06 by RR-05.** This ticket claimed **Blocks: RR-05** from the day it was charted, but RR-05 never listed it as a blocker and the frontier had called RR-05 takeable since 2026-08-05. **RR-05 closed without it**, so the claim is retired rather than merely doubted. This ticket blocks nothing on the map today — its items are confirmations, district guidance, and contract hygiene.

**Question**

Nothing to decide — **manual work that unblocks decisions.** RR-04's research
closed with a short list of questions that no amount of further research can
answer, because they depend on Orono's own documents and on Google's written
commitments. Several downstream tickets are currently resting on assumptions
about them.

**Ask Google (in writing):**

1. **Is Firebase — Firestore and Cloud Storage — inside Google's FERPA-covered services?** That's where recordings would live. The research couldn't verify it and flagged it as directly material.
2. **Does the application-scope sentence of the Gemini age clause bite?** _Superseded question_ — the original "move to Vertex AI" item was retracted 2026-08-05 (finding 3). What remains: the terms say you will not use the Services as part of an application _"likely to be accessed by individuals under the age of 18."_ SpartBoard's Gemini calls are teacher-only and enforced as such by an email guard on every callable, but SpartBoard as a product does serve student routes. Get Google's reading in writing rather than relying on ours. **Lower urgency than it looks** — this is a scoping question, not a live violation.

**Ask district counsel:**

3. **Does Orono's existing media-release / directory-information language cover student-_created_ coursework recordings, or only district-created media?** The research called this the highest-value question. Orono's annual notice designates "photograph" and says nothing about audio or video, and there's no separate media-release form. **Also pull Orono Board Policy 518** (its AUP — Orono doesn't follow MSBA numbering) — the most likely place a real obligation is hiding.
4. **Can the district actually redact?** Per AO 17-010 / AO 19-004: if a recording captures another student and that student's parent files a data request, the district must segregate — **and if it can't, it must hand over the whole recording**. If the district has no redaction capacity, that is a concrete argument against shipping video at all.

   🔴 **Upgraded 2026-08-05 by RR-04 sub-decision 3.** When this question was written, SpartBoard's own redaction capacity was an open possibility. It no longer is: sub-decision 2 rules out diarization contractually, and sub-decision 3 accepts the consequence — **SpartBoard will have zero automated segregation capacity, permanently and by choice.** That was a deliberate trade (it steps out of the 2025-26 BIPA litigation frontier), but it changes what this question _is_. It is no longer about the district's convenience; it is about **whether either party to the contract can segregate at all.** If Orono answers no, then nobody in the chain can, and **RR-A3 gets its answer on video without needing the cost argument.** Treat this as the second-highest-value item on this list, behind only #3.

   🔵 **Reframed 2026-08-06 by RR-A3 — this question changed character, and its
   urgency dropped.** RR-A3 did not wait for it. Sub-decision 1 ships video
   **gated off by default, with the district holding the switch**, precisely
   because the § 99.12(a) obligation is the district's rather than SpartBoard's.
   So this question no longer decides whether the feature exists; it decides
   **whether Orono should flip its own gate**, and it becomes the substance of
   the guidance shown to any org admin at that switch. Same content, different
   consumer: **district guidance, not a product blocker.** If Orono answers no,
   the correct outcome is that Orono leaves video off — not that the mode is cut.

5. **Is SpartBoard a "technology provider" under Minn. Stat. § 13.32 subd. 1?** The definition is conjunctive and gates both § 13.32 and the MCDPA.

6. 🔵 **New 2026-08-06 from RR-A1 — confirmation, not a gate.** RR-A1 sub-decision 1 found that RR-04's statutory bar on timer-initiated capture **does not hold**: the Tennessen interstitial is itself advance notice, the institution validly consents (RR-04 research finding 4), and element two of § 13.04 subd. 2 requires _stating_ whether a student may refuse rather than permitting refusal. Auto-start therefore shipped as a per-question teacher setting. **Ask counsel to confirm two things:** (a) that institutional consent plus in-product advance notice supports capture that begins on a timer the student did not press, and (b) that on a speaking assessment the recording is "reasonably necessary" for COPPA § 312.3(d) purposes, so a mandatory alternative is not compelled by that provision specifically.

   ⚠️ **A "no" on either does not unship anything.** The alternative is already mandatory on independent functional grounds (RR-A4 finding 5 — ChromeOS policy hard-blocks capture for a subset of any class), and auto-start is one of four values a teacher chooses among rather than the only path. A "no" narrows the menu; it does not break the design. **Lowest-urgency item on this list.**

7. 🔵 **New 2026-08-06 from RR-05 — a notice question, and the one item on this list that gates a shipping decision rather than confirming one.** RR-05 sub-decision 1 puts **transcript-level ASR on a student's recording**, sent to Gemini on a teacher's press. RR-04's Tennessen interstitial currently describes where a recording goes when the only consumer is the district. **Ask counsel whether the notice must state that a recording may be machine-transcribed by a third-party vendor**, and get the clause reviewed rather than drafted in-product. RR-A2's standing principle applies directly: a notice that describes a recording's destinations and omits one has made a statement that is false. **Do not ship the transcription capability ahead of this answer** — unlike items 1, 2 and 6, the fix here is copy the district has to approve, which is fast to obtain and cheap to wait for.

8. 🔵 **New 2026-08-06 from RR-05 — also worth raising with the records officer.** A transcript makes a student's speech **searchable** in a way the audio never was, which changes what a § 13.04 data request produces. RR-05 accepted that cost explicitly; the district may want to know it exists before it arrives in a request. **No product decision waits on this** — it is disclosure, not a gate.

9. 🔵 **New 2026-08-07 from RR-06 — a vendor-API question, not a legal one; belongs on this list only because it is answered by asking someone outside the codebase.** RR-06 sub-decision 3 lets a teacher mark a `not-attempted` slot **excused** rather than scoring it zero, chiefly so a student blocked by their district's own ChromeOS policy isn't graded for it. **Google Classroom has an excused state in its UI; Schoology's AGS score model appears not to.** Confirm what each API actually accepts. If AGS cannot express it, the two LMS paths diverge at exactly the point where the decision was made for a student's protection — and the fallback (omit the student, per sub-decision 2) leaves a Schoology gradebook with a **hole where an excusal should be**, which a teacher will read as a bug. **No product decision waits on this**; it decides how honestly the push can report itself.

10. 🔴 **New 2026-08-07 from RR-B2 — and it belongs in the same message as question 7, because it is the same kind of thing: copy the district has to approve.** RR-B2 sub-decision 3 records **undo as an event in a whiteboard take's log**, so replaying a response shows the teacher work the student drew and then **erased**. Every other capability on this map records what a child produced; this one records **what they decided not to produce**, and RR-B2 rejected the softer option (log it, don't replay it) on the grounds that half-disclosing it is worse than either clean answer. **Ask counsel two things.** (a) Is a record of retracted work an education record like any other, or does it need its own line in the § 13.04 notice? (b) Is there any objection to a student being told plainly — because RR-B2's decision only holds up if the student _is_ told, and if the answer is that we must not tell them, the decision has to be revisited rather than reworded. Cheap to ask, and it is the only item on this list that could send a **closed** ticket back.

11. 🔴 **New 2026-08-07 from RR-C2 — and unlike everything above it, this one is about behaviour that is _already live_, not about anything this map proposes.** Every student-visible teacher file in SpartBoard today is served from a `type:'anyone'` public Drive URL: guided-learning slide images force it deliberately for student view (`hooks/useStorage.ts:176-179`), dashboard backgrounds do the same (`hooks/useGoogleDrive.ts:83-89`), and the activity-wall archive publishes **children's own photographs** on one (`functions/src/driveArchive.ts:267-273`, hardcoded `{role:'reader', type:'anyone'}` with no domain branch). **Ask counsel whether that is consistent with the notice posture RR-04 settled.** This is not a C-track proposal and it does not wait on anything the map builds — it is shipped behaviour that the RR-C2 audit surfaced while looking for precedent, and the honest thing is to raise it on its own account.

12. 🔵 **New 2026-08-07 from RR-C2 — the one question on this list a _product_ decision is explicitly parked behind.** RR-C2 sub-decision 4 defers teacher-facing disclosure to this ticket rather than deciding it, and ships v1 with **no notice** in the meantime. The question: **when a teacher attaches a stimulus file to a quiz question, must the product tell them who can reach it?** Under RR-C2's posture the honest sentence is roughly _"anyone with the link can view this"_ for audio and video, and _"any signed-in SpartBoard user can view this"_ for image and PDF. **The trigger is named so this does not become fog:** if counsel says notice is owed, RR-C2 sub-decision 4 flips and the sentence ships; if not, "say nothing" matches every existing upload path. ⚠️ **It rides with question 11** — same subject, same audience, and 11 supplies the context that makes 12 answerable.

**Also worth doing while you're there:** an NDPA rider covering the parental-consent
representation the STANDARD omits, and adding video to Exhibit "B" (there's no
video row).

**Resolution:** _resolved 2026-09-01_ — **Answered by district posture rather than by counsel.** SpartBoard is an internal district app and every persisted student artifact lives in the staff member's Drive, which is the posture the district already operates under. On that basis: **q3 and q11 are settled** (student-created recordings and student photos are covered as long as they persist only in staff Drive — Phase 3.3 must honor this as a hard constraint, not a seven-day sweep); **q7 is moot** because AI transcription is not planned; q1, q2, q5, q6, q8 are confirmations that change no decision; q4 and q10 travel with the deferred video and whiteboard tracks; q9 is a vendor-docs check for Phase 3.4; q12 rides with q11 and resolves to "say nothing", matching every existing upload path.

**Paul's notes:** 3: as long as audio/video only ever persist in the staff member's Drive it's all good. 11: same as 3. 7: I don't plan to implement transcription if avoidable. _(2026-09-01)_

---

### RR-10 — What does the quiz editor become, and what does it refuse to let a teacher build?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-09** · **Blocks:** nothing · _Graduated from fog 2026-08-07, absorbing three patches that had been accumulating since 2026-08-06; audit and grilling ran as one session_

> 🔴 **This ticket is the reason "the map has no design questions left" survived
> exactly one turn.** That claim was true of the **charted tickets** and false of
> the **fog**, and the largest remaining design question had been sitting in the
> fog the whole time, growing by one bullet per session. Three patches —
> _"what the question editor looks like once timing is authored per question,"_
> _"authoring guardrails against accidental complexity,"_ and _"teacher authoring
> ergonomics"_ — were each too small to ticket alone and each named the other two
> as the reason. They graduate together here. **Worth remembering the next time a
> map reports itself finished: check the fog before believing it.**

**Question**

Every closed ticket on this map added something a teacher has to author, and
**nothing has ever removed one.** This ticket is where that inventory becomes a
screen, and where the product decides what it will not let a teacher build.

**What is now authorable, assembled from nine closed tickets** — this list is the
ticket's real starting point, because no single prior session ever saw all of it:

| From      | Control                                                                                                                                                | Notes                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **RR-01** | A **set** of primary response modes (≥1), plus an optional addendum the teacher may mark **required**                                                  | The addendum flag rides in `QuizPublicQuestion` — the student-safe projection                       |
| **RR-A1** | A `recording` block: prep, limit, and a **four-value** expiry setting (`auto-start`/`auto-advance`/`armed`/`unanswered`)                               | ~~`timeLimit` **hides**~~ — **wrong, see finding 3**: sub-decision 3 says it is **forced to 0**     |
| **RR-A2** | `takeLimit`, defaulting to **unlimited**                                                                                                               | The mildest control to author and the only one whose _default_ is unbounded                         |
| **RR-B2** | A **third** numbers set — 180 s / 600 s for whiteboard, distinct from audio's 300 s and video's 120 s                                                  | So the `recording` block is **mode-dependent**                                                      |
| **RR-C1** | Stimulus format (image/audio/video/YouTube/PDF) and a playback-restriction setting                                                                     | doc/docx refused                                                                                    |
| **RR-C3** | A **parent-level stimulus library**, an authoring-only label per entry, a replay policy per entry, and a **multi-select** pointer control per question | The first control on this list that is not inside a question                                        |
| **RR-06** | _Optional_ — whether a count of hand-graded slots appears anywhere                                                                                     | Explicitly left undecided; the existing `Manual` badge (`QuizResults.tsx:1850`) is the obvious home |

**Three forks, one per absorbed patch.**

**A. The per-question block.** The `recording` block now carries four controls
whose _meaning_ changes with the mode, and three different numbers sets. Does the
editor show one set of fields that change meaning, or three? This is the first
genuinely new authoring problem the patches acquired after they were written, and
it is what made them stop being ergonomics and start being design.

**B. The surface above the question list.** 🔴 **Every factual claim in this fork
is wrong — see findings 1 and 2, and sub-decision 2, which built none of it.**
Every prior addition was another field inside a question; RR-C3's stimulus array
needs a library the teacher adds material to, names, and sets a replay policy on
— **above** the questions. **Nothing in this repo groups questions in any
editor**: `QuizEditor.tsx:198` is a flat dnd-kit reorder list. The nearest shipped
model is GuidedLearning's — a canvas with a step list beside it, an `imageIndex`
dropdown per step (`GuidedLearningStepEditor.tsx:141-143`), a slide badge in the
list (`GuidedLearningEditor.tsx:1525`) — and that is **a different editor**, not
another field in the same panel. Deciding whether the quiz editor becomes that
shape is the largest single question here.

**C. Warn, cap, or permit.** Three cost axes, all now measured or bounded except
one:

- 🔴 **Storage is unbounded, and it is reached by teachers who authored nothing unusual.** RR-A1's runaway figure (~8 MB × 10 questions × 30 students ≈ 2.4 GB) assumed **one take per question**; RR-A2 made takes append with `takeLimit` defaulting to unlimited, so there is no total. **A guardrail that only fires on elaborate authoring will never see this**, because it is the default.
- ✅ **Grading wall-clock is real but mild.** RR-06 sub-decision 10 keeps auto-graded slots auto-graded, so ten questions with one video response is **one** hand-graded item; cost scales with **recording slots**, not questions. Sub-decision 9's question-major queue then makes 30 responses to one question the cheap case.
- ⚠️ **Except for whiteboard, where the number does not exist yet.** RR-B2 set 600 s with unlimited takes and accepted it explicitly on the grounds that **RR-B3** is where the cost gets discovered. **This does not block the ticket** — decide the _mechanism_ here and leave the _number_ to RR-B3, exactly as RR-08 sub-decision 6 did with the Submit threshold.
- 🔴 **Completability is the axis that changed the question.** With a hard submit block on required addenda and **no substitute of any kind** (RR-08 sub-decision 4), a teacher who marks every addendum required has built an assignment a student in a restricted OU can start and never finish — ten consecutive walls, nothing lost, all of it visible to the teacher. **The guardrail question stopped being "is this quiz expensive" and became "can every student in this class complete it."**

**D. The silent-degradation warnings, and this is the sharpest small thing here.**
Two are already known, and this editor is **the only surface that could tell
anyone**:

- RR-C3 sub-decision 5's component-aware shuffle **silently degrades to a no-op** when stimulus pointers overlap — two passages sharing one question merge into a twelve-question block and shuffle does almost nothing.
- ⚠️ And the map has a shipped example of exactly this failure class: RR-C3's audit found Video Activity's `shuffleQuestions` / `shuffleAnswerOptions` are authored, persisted and rendered into a human-readable behaviour summary with **zero read sites** — a teacher toggles them, sees them confirmed, and nothing happens for any student. **Whatever this ticket builds should not be able to produce a second one of those.**

**What this ticket is not.**

- **Not the grading view or the live monitor.** Both have their own fog patches, and both are about what a teacher sees _after_ authoring.
- ⚠️ **Not RR-07 — but the overlap is real and someone should decide it deliberately.** RR-07's surviving remnant is _"how does a teacher learn, while building, that some of their class will hit a wall"_ — which is the same screen and arguably fork C's completability axis under another name. **It is left as its own ticket rather than absorbed**, because folding a charted ticket into a graduating one is a call for Paul, not for a charting pass. If it should merge, merge it at the top of whichever session runs first.

**Blocked by nothing, and every input the patches were waiting on is in.** RR-06
supplied the grading wall-clock (and asked the editor for almost nothing, which is
an answer rather than a deferral). RR-08 supplied completability. RR-C3 supplied
the above-the-list surface that made the three patches one problem instead of
three. **The anti-reference throughout is `CLAUDE.md`'s: Canva-style
everything-is-customizable overload**, against a design principle that says every
element earns its place.

**Findings** — the audit ran 2026-08-09, before the first question. 🔴 **Three of
this ticket's premises did not survive it, and the largest one was wrong twice
over.**

1. 🔴 **The "surface above the question list" already exists, and this ticket
   priced it against the wrong editor.** The claim above — _"`QuizEditor.tsx:198`
   is a flat dnd-kit reorder list… the nearest shipped model is GuidedLearning's,
   and that is a different editor"_ — fails on both halves.
   `QuizEditorModal.tsx:262` mounts **`EditorWorkspace`**, the same two-pane shell
   GL and VA use; its own doc comment names all three and describes the context
   pane as _"image canvas, video+timeline, quiz list"_
   (`EditorWorkspace.tsx:49-58`). Line 198 is one prop inside a pane that has had
   a settings strip above it all along. **And the quiz context pane already
   carries a `Questions | Settings` segmented tab** (`QuizEditorModal.tsx:276-291`)
   whose Settings side already mounts a parent-level panel
   (`QuizBehaviorSettingsPanel`, `:303`). The ticket asked whether the quiz editor
   should _become_ GL's shape. It already is GL's shape.
2. 🔵 **That tab's detail pane is empty.** With Settings open, 44% of the
   workspace renders one static sentence (`:314-321`). Whatever fork B chose had a
   built, unoccupied home in the master-detail shape the Questions tab uses.
3. 🔴 **The inventory table above overstates a closed decision.** It says
   `timeLimit` **hides** when a recording mode is present. RR-A1 sub-decision 3
   says no such thing — it says `timeLimit` is **forced to 0**. "Hides" was
   written by the graduation pass, not by the ticket it cites, and it contradicts
   shipped convention: the house idiom for a control disabled by another setting
   is **keep it visible, disable it, swap the hint to say why**
   (`AssignmentSettingsToggleGroup.tsx:285-290`, `shuffleQuestionsAvailable`),
   with a lock banner for the mode-locked case (`:241-249`).
4. 🔴 **Fork C's storage axis is an aggregate problem in an app that has never
   built an aggregate guardrail.** Every cost control that ships here is a
   **per-item hard cap at upload that refuses the item with a message** — GL
   15 MB image / 200 MB video (`utils/guidedLearningMedia.ts:14-47`), PDFs 50 MB,
   backgrounds 5 MB, Drive archive 50 MB — and even the one admin-configurable
   ceiling (`storageLimitMb`, `SmartNotebook/Widget.tsx:186-189`) is per-file.
   **There is no quota, no running total, and no projection anywhere.** The only
   other guardrail idiom is save-blocking validation that collects every error and
   **shows the first** (`QuizEditorModal.tsx:197-213`). **"Warn but permit" has no
   precedent in this codebase.**
5. 🔵 **Fork D's warning surface was already decided once, at launch.** RR-A3
   sub-decision 3: _"The teacher sees a pre-launch warning naming the affected
   questions,"_ with the consequence recorded as _"the teacher learns at launch
   rather than at authoring."_ This ticket took ownership of the same class of
   signal without noticing one already existed.
6. 🔵 **The behaviour summary is a shipped confirmation surface** —
   `formatBehaviorSummary` (`utils/quizBehavior.ts:65-81`) renders
   _"Teacher-paced · 1 attempt · shuffles answers"_ on the library card. It is
   also the exact mechanism that makes VA's dead toggles look live.
7. 🔵 **A friction nobody had flagged.** `QuizData` is
   `{id, title, questions, createdAt, updatedAt}` (`types.ts:3080-3086`) — **no
   settings field.** `behavior` lives on `QuizMetadata` in **Firestore**;
   questions live in the **Drive** JSON. RR-C3 sub-decision 3 put the stimulus
   array on `QuizData`, so a Settings tab hosting both would write two things to
   two stores by two paths — and only one of them reaches PLC peers. That
   asymmetry is exactly why RR-C3's mid-attempt-replace risk exists and
   `behavior`'s does not.
8. 🔴 **The dead-control finding this ticket inherited from RR-C3 is wrong in the
   direction that makes it worse.** VA's `shuffleAnswerOptions` is not dead — it
   is **ignored**. `QuestionOverlay.tsx:83-95` shuffles MC and MA options
   **unconditionally**, keyed by question id, and never reads the flag. Setting it
   **true** happens to match reality; setting it **false silently does not** — so
   the failure is asymmetric and lands on the choice a teacher makes
   deliberately. Only `shuffleQuestions` is genuinely unread, and it is
   meaningless anyway because VA questions fire at timestamps. **The root cause
   was not a forgotten wire-up: the behaviour shipped first and the control was
   added beside it without reconciliation.**

**Resolution** — grilled with Paul 2026-08-09, seven sub-decisions.

> 🔴 **The headline: the editor this ticket set out to design mostly already
> exists, and the one thing it was sure it needed — a library surface above the
> question list — is the one thing the session decided not to build.**

**1. RR-07 is not absorbed. The split runs along surface versus policy.**

RR-10 owns the **authoring-time signal**; RR-07 keeps everything else and stays
open — what the alternate actually _is_ per mode, who elects it, whether it scores
equivalently, and the refusal-versus-degradation asymmetry where one student
elects a path and a whole class has one imposed by an administrator they never
spoke to. Those are student-facing policy, not editor questions.

**Accepted cost:** two tickets now touch one screen, so RR-07 will later inject
wording into the advisory sub-decision 5 builds. That is a smaller cost than the
alternative — RR-07 carries live legal reasoning (COPPA § 312.3(d), the Tennessen
warning) that three separate tickets have already amended, and folding it in meant
this session either reopening that or inheriting it unread.

**2. There is no stimulus library surface. The picker _is_ the library.**
_(Paul, replacing all three charted options for fork B.)_

Attachment is a control on the question — _"attach resource"_ — opening a popover.
Entries accumulate as a **byproduct of attaching**; attaching the same passage to
question 7 means picking it out of what is already there. **No third tab, no rail
above the list, no section in Settings.**

This is a better fit for RR-C3 sub-decision 1 than anything charted here. That
sub-decision adopted the parent-array shape on the grounds that **the pointer is
the grouping concept** — and under a picker the grouping is _all_ there is: the
array is never presented as a thing in its own right, only as the set of material
this quiz has attached. It also removes finding 7's friction entirely, because
nothing about the stimulus array ever renders in the Settings tab.

🔵 **RR-C3 sub-decision 6's label gets sharper, not weaker.** Its stated reason was
that _"a question editor listing `image-2847.png` and `scan-3.pdf` is where
mis-attached material comes from."_ That describes a list a teacher scans while
attaching — which is precisely and only what this picker is.

**Both halves already ship.** `DriveFileAttachment` is an _"Attach file from
Drive"_ control **already mounted inside this editor** (the AI overlay,
`QuizEditor.tsx:742-748`), and `CatalystSetPickerPopover` is a portal popover with
click-outside that drills set → routine. **Rejected: `Questions | Stimuli |
Settings`** (my recommendation) — it made the library a first-class object the
teacher has to visit, when the only thing they ever want is _this question needs
that passage_. **Rejected: a section inside Settings** — finding 7. **Rejected: a
GL-style rail** — it taxes vertical space on every question edit, including the
large majority of quizzes with no stimuli at all.

**3. The picker manages as well as picks.**

Rows show label, format, and **how many questions point at each entry**. A row can
be renamed, have its replay policy set, and be deleted in place; new material is
added from the same popover. An entry whose pointers all go away shows as
**unused** and can be deleted.

The pointer count is the load-bearing part: it is the only place a teacher
renaming a passage from question 3 can see that question 7 reads it too. **Under
the rejected pick-only option, editing from one question silently rewrites
another's material** — and an entry that lost its last pointer would be
unreachable, undeletable, and still consuming the storage axis fork C already
cannot bound.

**Accepted cost:** the popover grows an edit mode, which is more than any shipped
picker in this repo does.

**4. One recording block, clamped to the lowest ceiling in the authored set.**

RR-A3 sub-decision 2 makes `['audio','video']` a legal set meaning **student
chooses**, and the three ceilings differ — audio 300 s, video 120 s, whiteboard
600 s (RR-B2). **This ticket's fork A never named that problem.** One question, one
`recording` block: one prep, one limit, one expiry value, with the limit's maximum
being the **minimum ceiling across the authored modes**.

The reason is what the set means. If the student picks the mode, a limit reachable
in one mode and not another makes the choice change the assessment.

⚠️ **Accepted cost, and it needs finding 3's idiom rather than a silent clamp:**
adding `'video'` to a question already authored at 300 s re-caps a number the
teacher chose. The field stays visible, states the new ceiling and names the mode
that imposed it. **Rejected: one block per mode** — a set of three renders three
near-identical field groups and drags prep and expiry per-mode, which nothing on
this map has asked for. **Rejected: splitting only the limit** — a new control
shape with no precedent here, and it still lets two students answering the same
question get materially different tasks.

**5. A live, non-blocking advisory in the editor — and RR-A3's pre-launch warning
stays.**

The context pane's banner slot (`QuizEditor.tsx:154-159`, today only ever a save
error) gains an advisory tone that names what will degrade, updating as the
teacher authors. It carries all three classes: a mode struck by the district gate,
RR-C3 sub-decision 5's shuffle collapsing to a no-op on overlapping pointers, and
required addenda a restricted-OU student can never satisfy.

The pre-launch warning is **not replaced**. It remains the only thing that can
catch degradation appearing _after_ authoring — a gate flipped, a PLC peer's edit —
which an editor-time check structurally cannot see.

This is the answer to sub-decision 1's split: RR-10 took the signal from RR-07
precisely because **at launch you are standing in front of thirty children**,
which is too late to rewrite a question.

🔴 **Accepted cost, and it is the first of its kind:** this is the **first
warn-but-permit surface in the codebase**. Every existing guardrail either refuses
the item or blocks the save (finding 4). **Rejected: extend the pre-launch warning
only** — it re-accepts RR-A3's recorded consequence for two cases RR-A3 never
considered, including the completability wall this ticket just took from RR-07 on
the grounds that authoring time is where it belongs. **Rejected: fold it into
save-blocking validation** — a hard block tells a teacher who genuinely wants ten
required addenda no, on the authority of a tool that cannot know their class, and
it reveals a three-problem quiz one save at a time.

**6. Storage appears as a neutral figure, not a warning.**

The advisory states what the quiz will do — _"records up to N slots per student"_ —
in the same register as the shipped behaviour summary, without judging it.

**Nothing about RR-A2 sub-decision 4 is reopened.** `takeLimit` stays unlimited by
default; that was chosen deliberately, against my recommendation of 3, to keep the
restrictive setting a teacher's deliberate act. The consequence is that **there is
no total to warn against** — and RR-06 sub-decision 10 already established that
cost scales with **recording slots, not questions**, which makes slot count both
knowable and the thing that actually drives size.

**Accepted cost:** it informs without protecting. A teacher who reads "10 slots"
and does not do the arithmetic learns nothing they will act on. **Rejected: a
threshold warning** — the threshold is a number nobody has (RR-A5 has not measured
real district output, and unlimited takes leave no ceiling to project against), and
an invented line that fires wrongly trains teachers to ignore the whole advisory.
**Rejected: silence** — the one cost axis this ticket flagged as reached by
teachers who authored nothing unusual would get no surface at all.

**7. Every authored control gets a test asserting a runtime read site.**

Each control the `recording` block and the stimulus picker author carries a test
that fails if no runtime path consults it. This is a direct hit on the failure that
actually happened: finding 8's flag was persisted, summarised, and never read, and
a read-site assertion is the one check that catches that.

**Accepted cost:** it is a convention, not a mechanism — nothing forces the next
control to get one, so it depends on whoever adds a control remembering a rule that
exists because someone did not. **Rejected: rely on the advisory** — it covers only
conditions somebody anticipated, and a control nobody wired at all looks perfectly
healthy, which is exactly VA's case. **Rejected: derive the summary from what the
runtime reads** — structurally strongest and it would have caught VA, but it
couples two independent layers and protects only controls that appear in a summary,
which the recording block's numbers do not.

**Derived, not asked**

- 🔵 **RR-06's one optional item is answered by sub-decision 6.** RR-06 left open
  _"whether a count of hand-graded slots appears anywhere."_ Sub-decision 6 puts a
  slot count in the advisory, and by RR-06 sub-decision 10 the recording-slot count
  **is** the hand-grading count — nine MC plus one video is one thing to hand-grade.
  One figure answers both; the existing `Manual` badge (`QuizResults.tsx:1850`)
  stays the grading-side home and needs nothing added.
- 🔵 **The editor gains no new tab, no new pane, and no new shell.** Every fork B
  option charted here assumed new structure. What the session actually specified is
  a button, a popover, a banner tone, and a clamp.
- ⚠️ **Sub-decision 3's pointer count needs RR-C3 sub-decision 2's overlapping sets
  to be legible.** A pointer array means an entry's count can exceed the number of
  questions that "belong" to it in any partition sense. The count is a fact, not a
  grouping claim, and the picker should not imply otherwise.
- 🔴 **Sub-decision 5's advisory is where RR-C3 sub-decision 5's silent no-op finally
  becomes visible** — the one place on this map that failure could ever be surfaced,
  and it is now spoken for.

**Paul's notes:**

---

## A. Video & audio response

### RR-A1 — What's the timing model for prep time and recording limits?

**Type:** prototype (HITL) · **Status:** ✅ **Closed 2026-08-06** · **Blocked by:** RR-01 · **Blocks (now unblocked):** RR-A2

**Question**

Your spec: prep/think time, after which **recording begins automatically**; a
recording time limit, at which it **stops automatically**. Both auto-transitions
are high-anxiety moments for a student, and a prototype will settle this faster
than argument.

- What does the student see in the last 5 seconds of prep? ~~Is there an "I'm ready, start now" escape, or is auto-start the only path?~~ **← settled by RR-04 below; see the ⛔ block.**
- Does prep time extend or replace `QuizQuestion.timeLimit` (0 = none, already shipped)?
- Hard stop at the limit, or a grace tail so a sentence in progress isn't guillotined?
- What happens to a partial recording when the browser closes mid-take — does the draft/autosave model from written responses have an analog, or is a lost take just lost?
- Teacher-paced vs self-paced sessions have different clock semantics. Does the timing model differ per `QuizSessionMode`?

Build the cheap rough artifact — a stub with a countdown and a fake recorder is
enough to react to.

**Two constraints from RR-A4 that the prototype should honour rather than
discover later:** Chrome-recorded webm reports **`Infinity` duration**, so any
countdown or progress bar must be driven by a client-side timer, not by the media
element. And **Google Classroom's own recorder caps at 5 minutes** — a useful
sanity benchmark for what a limit should look like.

> ↯ **The ⛔ block below was overturned by this ticket's own resolution
> (2026-08-06). Auto-start is back, as one of four per-question values.** It is
> kept unedited because the reasoning that produced it, and where that reasoning
> failed, are both worth being able to read. See sub-decision 1.

⛔ **RR-04 (2026-08-05) removed auto-start from the option set — by statute, not
by preference.** Sub-decision 5 renders the Tennessen warning (Minn. Stat. § 13.04
subd. 2) once per assignment, **before the first recording**. And § 13.32
subd. 14(b)(1)'s instructional-purpose exception — the provision that makes this
collection lawful at all — is conditioned on **advance** notice. Capture that
begins on a timer the student never triggered cannot carry that notice.

**This invalidates the opening spec above**, which reads "prep/think time, after
which **recording begins automatically**." That half is dead. An explicit student
act is now the _only_ path into recording.

**The prototype's question changes shape rather than disappearing.** It is no
longer "auto-start or an escape hatch" — it's **what prep-time expiry does now
that it can't start the recorder.** Auto-advance to the next question? Sit
indefinitely on an armed record button? Mark the question unanswered and move on?
That's a genuine design fork with real student-anxiety consequences, and it's
exactly what a cheap stub answers faster than argument.

⚠️ **Always-on camera/mic preview dies for the same reason** — a live preview
running before the notice is acknowledged is collection without advance notice.
Any "check your mic" affordance has to sit _after_ the interstitial.

📎 **Prototype asset (2026-08-06):**
[`docs/rich-response/rr-a1-timing-prototype.html`](rich-response/rr-a1-timing-prototype.html)
— open it in a real browser (not an in-app preview pane) and react to it. Fake
recorder, no `getUserMedia`, all clocks on `performance.now()`. The statutory
constraint holds structurally, not by convention: `startRecording()` has exactly
one call site and it is a click handler — no timer path reaches it.

Side controls switch the prep-expiry branch and the hard-stop / grace-tail toggle
live, with prep / limit / grace sliders (the limit runs to 300 s so the Google
Classroom 5-minute cap is feelable) and a dead-mic fault injector that surfaces
through level polling rather than the unreliable `onmute` (RR-A4 finding 6).

**The three branches, and one invented distinction to challenge first:** the
prototype separates them by _reversibility_ — **(A) auto-advance** moves on but
leaves the question open and returnable from the summary; **(B) armed
indefinitely** stops the clock entirely, so nothing moves without the student;
**(C) mark unanswered** closes the question permanently. Without that
reversibility difference A and C render as the same screen, so it may be wrong —
it is an assumption the prototype needed, not a finding.

**Four tensions it exposed:**

1. The last-5-seconds copy has to differ per branch, and under A and C it necessarily reads as a threat ("we're moving on") — **which is the exact anxiety this ticket was opened about.** B has no such moment but gives a teacher-paced session no floor on runtime, so the branch may have to vary by `QuizSessionMode`.
2. A grace tail makes the stated limit a lie. The prototype draws the real ceiling as `limit + grace`; someone has to decide whether the student is told the honest number or the round one.
3. 🔴 **The written alternative has no clock at all in this build** — which makes the legally-mandatory alternative (RR-04 sub-decision 5) non-equivalent to the timed path. **That question currently belongs to neither this ticket nor RR-07.** → flagged as fog below.
4. Branch B never produces a terminal "skipped" state, so a student who simply stops interacting leaves the assignment in limbo with nothing the summary screen can represent.

🔵 **RR-A3 (2026-08-06) added three things to this ticket, and the prototype
asset predates all of them.** Video ships (gated at the district), which turns
several of this ticket's open questions from audio-shaped into two-mode-shaped:

1. 🔴 **A framing check is now a required step in the flow** — after the Tennessen interstitial, before the recorder arms, a video student sees their own camera frame plus one line (_only you should be in frame_) and confirms. **This is the one place the always-on-preview kill above needs re-reading rather than re-applying:** what § 13.32 subd. 14(b)(1) forbids is collection before notice, so a transient preview _after_ the interstitial is permitted and RR-A3 has made it mandatory. The prototype's prep → armed → recording flow has a fourth state now, and it appears on the video path only — so **the two modes no longer share one screen sequence**, which the current build assumes throughout.
2. **This ticket sets video's resolution and bitrate ceiling.** RR-A3 chose the quality axis over the duration axis to bound cost, explicitly on the grounds that RR-A4's 2.85 GB was measured at Chrome's _default_ bitrate. 480p / ~500 kbps is the shape RR-A3 named; the numbers are this ticket's to pick, and RR-A6 is waiting on them because its ~75 s upload figure carries the same defaulted assumption.
3. **The clock is mode-agnostic — that is settled, not open.** RR-A3 rejected a shorter ceiling for video, so this ticket should not re-derive per-mode durations. Whatever prep/limit/grace model wins applies to audio and video alike.

✅ **The asset was revised to rev 2 before the session** (mode switch, framing
check, live cost table) and gained a fourth branch during it. See
[`docs/rich-response/README.md`](rich-response/README.md).

**Resolution** — prototype revised and grilled with Paul 2026-08-06, eight
sub-decisions. The first one reverses a closed ticket, so it comes first.

**1. ⚠️ Amends RR-04 — the auto-start kill does not hold, and auto-start is
back.**

RR-04 sub-decision 5 recorded that "auto-start capture and always-on preview are
dead — **not by preference but by statute**," citing § 13.32 subd. 14(b)(1)'s
advance-notice condition. **That citation does not carry that weight.** RR-04's
own research half says only that the provision is _"relevant to auto-start capture
and always-on preview"_ — a flag, not a finding. The interstitial **is** advance
notice: once per assignment, before the first recording, acknowledged. On the
advance-notice test, auto-start passes.

Paul then supplied the argument that closes it: **the institution consents.**
RR-04 research finding 4 already establishes this — school consent rests on FTC
FAQ guidance under two conditions, of which SpartBoard **satisfies** the first
(school's use and benefit, no other commercial purpose) and **committed to** the
second (review-and-delete, made a compliance precondition). Stack that with the
notice already given and the chain is:

| Obligation                      | Discharged by                                                                |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Consent (COPPA / FERPA)         | The institution                                                              |
| Notice (§ 13.04 subd. 2)        | The interstitial, in advance, acknowledged                                   |
| "Whether they may refuse"       | Element two requires **stating** the answer, not permitting refusal          |
| § 312.3(d) — no over-collection | On a speaking assessment the recording **is** the thing reasonably necessary |

**So the statutory case against timer-initiated capture largely collapses**, and
what remained was a product judgment about student anxiety — which is what this
ticket exists to make.

🔴 **What survives, and this containment matters:** the **non-recorded alternative
is still mandatory**, but on **RR-A4 finding 5** rather than on law — districts
routinely park students in restricted OUs with mic and camera disabled by ChromeOS
policy, so a subset of any class has capture hard-blocked through nobody's fault.
The alternative was always a functional requirement; RR-04 reached the right answer
by a route that has now partly given way. **The notice itself and the framing check
are untouched** — both rest on the notice duty, which is undisturbed.

**Rejected: proceed under the kill anyway**, amending only its stated rationale to
"refusal must stay exercisable" — coherent, and it was my recommendation before
Paul's point, but it declines a capability on a reason that no longer applies.
**Rejected: park it for RR-09** — it would have left the ticket's central fork
provisional against a counsel timeline nobody controls. RR-09 gains it as a
**confirmation** item instead.

**2. The prep-expiry branch is a per-question teacher setting, not a product
decision.**

The prototype's three branches were built as a fork for _us_ to resolve. Paul's
answer is that all of them are legitimate and the teacher picks, per question,
because the right behaviour is a property of the assessment: _"this is good for
speaking assessments to assure students have only X amount of time before
performing."_

Four authored values:

| Value          | At prep expiry                                                   |
| -------------- | ---------------------------------------------------------------- |
| `auto-start`   | Capture begins. The record button becomes an early "start now"   |
| `auto-advance` | Move on; the question stays open and returnable from the summary |
| `armed`        | Nothing happens; the button stays ready indefinitely             |
| `unanswered`   | The question closes and scores as unanswered                     |

🔴 **A stall was found in the shipped code while resolving this.** `'auto'` session
mode advances when every student has answered — `r.answers.some(a => a.questionId
=== currentQId)` at `hooks/useQuizSession.ts:1313`. **`auto-advance` and `armed`
write no answer record at expiry, so one student who never presses record holds the
entire class indefinitely.** `auto-start` cannot stall it; every student produces a
take. Whether a passed-over question should write a record at all is **RR-08's**
question, not this one's. → injected there.

🔵 **Answered by RR-08 (2026-08-06), and the incentive asymmetry this ticket
worried about is gone.** RR-08 sub-decision 1: **every question the student leaves
behind writes an entry.** So `auto-advance` and `unanswered` both write, and
neither branch is rewarded for harshness. `armed` still writes nothing — but
correctly, because nothing has been passed over: the student is visibly parked on
the question and the teacher can see them in `QuizLiveMonitor`. That is an ordinary
slow-student case, not the invisible stall. **The four values are undisturbed.**

🔵 **RR-08 also extended sub-decision 3 by inference:** an MC question carrying a
_recording addendum_ counts as a recording question, so `timeLimit` is forced to 0
there too — otherwise speed bonus would still be paying points for speaking
quickly on the addendum. And the `recording` block's clock governs **the addendum
slot only**, starting when the student opens it, so the prep allowance isn't spent
reading the stimulus.

**Rejected: one product-wide branch** (my recommendation was `auto-start` alone).
**Rejected: off-state fixed at `armed`** — clean pairing, but it decides for the
teacher on the one axis they have the most context about.

**3. Timing lives in a new block. `timeLimit` is untouched, and speed bonus is off
for recording questions.**

`QuizQuestion.timeLimit` looks free but is not: it feeds **speed-bonus scoring** —
`(remaining / currentQuestion.timeLimit) * 50` at
`components/quiz/QuizStudentApp.tsx:1909`. Anything landing in that field is wired
into points-for-being-fast.

So prep, limit and the expiry value go in a new `recording` config object, and
`timeLimit` is forced to 0 on recording questions. **Speed bonus is unavailable on
them by design** — rewarding a student for speaking quickly measures the opposite
of fluency, and penalises a hesitant speaker twice.

**Rejected: keep speed bonus available as a teacher option** — it is the kind of
default that gets switched on without thinking, on exactly the assessments where
it does most harm. **Rejected: reuse `timeLimit` as the recording limit** — speed
bonus would then reward stopping early, and every existing consumer would have to
learn the field means something different here.

**4. Video's ceiling is 480p / 500 kbps.** The two numbers RR-A3 handed this
ticket.

| At 480p / 500 kbps | Value                          |
| ------------------ | ------------------------------ |
| One 60 s take      | **4.0 MB**                     |
| Per assignment     | **599 MB** (was 2.85 GB)       |
| Upload @ 2 Mbps    | **16 s — 0.27× the recording** |

That is RR-A4's figure cut by **79%**, and the student is never waiting on the
network. **Accepted cost, already accepted by RR-A3:** fine motor detail will not
survive 480p.

📐 **A property worth recording because it is counter-intuitive:** the upload
_ratio_ is duration-independent — bytes scale linearly with time, so 0.27× holds at
any length. The **assignment total** does not, which is what makes sub-decision 8's
video cap necessary rather than decorative.

**Rejected: 480p/800k and 720p/1000k** — both defensible, both buy quality this
assessment doesn't need. **Rejected: an org-admin-selectable ladder** — RR-A3 said
policy ceiling, not lever, and support can no longer predict what a recording
weighs.

**5. Hard stop at the stated limit, with a wrap-up warning before it. No grace
tail.**

The prototype's second tension was that a grace tail makes the stated limit a lie —
the real ceiling is `limit + grace`. The resolution is that **a grace tail is just a
longer limit with a warning zone, relabelled dishonestly.** State the honest number
and put the wrap-up signal in the stretch before it: the student gets the same
chance to land the sentence, and the number they were told is the number that
happens.

**Not teacher-configurable** — unlike the expiry branch, there is no pedagogy in it,
so a teacher choosing would be guessing.

**Rejected: grace tail with the round number told** — the interface would say one
thing and do another. **Rejected: grace tail with both numbers told** — the second
number instantly becomes the real limit in the student's head anyway.

**6. The framing check runs once per assignment, and the self-view is present
whenever the camera is live.**

RR-A3 specified "before arming," which reads as per-take. Sub-decision 2 makes that
impossible to hold uniformly: an assignment can now mix `auto-start` questions —
where there is no click to interpose a check on — with click-to-start ones. So the
_confirmation_ happens once, after the notice; the _self-view_ then simply stays up
during every video capture, including auto-start prep.

This is a **strengthening** of RR-A3's mitigation, not a dilution: a continuous
mirror catches someone sitting down at Q3, which a single confirm before Q1 cannot.
It remains a mirror and a sentence — **no detection of any kind**, per RR-04
sub-decision 2. The prototype's bystander toggle exists to make that limit visible:
it draws a second person and says nothing about them.

**Rejected: before every take** — an extra screen at the most anxious moment of
every take, and inapplicable to auto-start questions, so a mixed assignment would
behave two ways. **Rejected: self-view only during auto-start prep** — leaves
click-to-start video takes with no mirror at all.

**7. A lost take is lost. Nothing is written anywhere until the student commits.**

Bytes stay in memory. A crash at 55 seconds costs the answer, and the written
effort's draft-autosave has no analog here.

🔴 **This is a constraint, not just a preference, and it binds RR-A6.** Streaming
chunks to Storage during capture would fix crash recovery _and_ RR-A6's upload
window at once — but **it breaks the refusal path sub-decision 1 depends on.** Once
chunks are on the server, "don't keep this" degrades from a guarantee into a delete
request, which is a materially weaker promise to make a twelve-year-old. → injected
into RR-A6 as a constraint on its solution space.

**Rejected: IndexedDB chunking with a recovery prompt** — keeps the discard honest
and was the better engineering answer, but costs real weight plus orphaned blobs on
shared Chromebooks needing their own sweep. Reconsider if lost takes turn out to be
common.

**8. Defaults: prep 30 s, limit 60 s. Maximum 300 s for audio, 120 s for video.**

300 s matches Google Classroom's cap (RR-A4 finding 4), so SpartBoard is not the
strict one. **Video caps lower because the assignment total is not
duration-independent:** 300 s of video at the chosen ceiling is ~3 GB per
assignment — precisely the number sub-decision 4 was chosen to escape. 120 s puts
the worst case at ~1.2 GB.

The clock **stays mode-agnostic** as RR-A3 settled it: prep, limit and the expiry
branch are identical across modes. Only the outer bound differs, and it differs
because bytes do.

**Rejected: 300 s for both modes** — keeps "mode-agnostic" literally rather than
nearly true, at the cost of recreating the problem further out. **Rejected: no hard
max, warn instead** — most honest, but nothing then stops a twenty-minute video
question in a district that trusted the gate.

**Consequences, and where they land:**

- **RR-04** — sub-decision 5's auto-start consequence is amended (see 1). Its mandatory-alternative conclusion **survives on RR-A4 finding 5**, not on § 312.3(d).
- **RR-07** — the alternative's _legal_ necessity weakens; its _functional_ necessity is unchanged. It now has **three** jobs, not two.
- **RR-08** — inherits the `'auto'`-mode stall: does a passed-over question write an answer record?
- **RR-A6** — gains a hard constraint (no streaming during capture) and loses a scare figure: ~75 s becomes **16 s** at the chosen ceiling.
- **RR-A2** — the discard is now a **refusal mechanism**, not a UX nicety, which changes what a retake budget may do to it.
- **RR-A5** — gains a specific target: does district hardware encode 480p/500 kbps.
- **RR-09** — gains a confirmation item (institutional consent and timer-initiated capture), not a blocker.
- **RR-05** — speed bonus is unavailable on recording questions; any AI scoring inherits that.

🔵 **RR-A2 (2026-08-06) reused this ticket's reasoning to kill pause, confirmed
its refusal mechanism, and invalidated one of its published numbers.**

1. 🔴 **Sub-decision 5's "599 MB an assignment" no longer holds.** That figure assumed **one take per question**. RR-A2 made takes append rather than replace and defaulted `takeLimit` to unlimited, so per-assignment media is **unbounded by default**. The per-take numbers this ticket fought for are all intact — **4.0 MB a take, 16 s to upload, 480p / 500 kbps** — and remain the right ceiling for a single take. Only the assignment total is gone, and it was the number used to argue video down to its quality ceiling in the first place.
2. ✅ **There is no pause, and this ticket's own reasoning decided it.** RR-A2 sub-decision 7 rejected pause-and-resume by extending the grace-tail argument — _"a grace tail is a longer limit told dishonestly"_ — to the observation that **a 60-second limit a student can pause is not a 60-second limit.** The hard stop with wrap-up warning is untouched, and the recording clock remains uninterruptible from `armed` to commit. ⚠️ RR-A2 also found the charted premise wrong: `MediaRecorder.pause()`/`.resume()` are native and continue into the **same** blob, so the "stitching cost" that made pause look expensive never existed. Pause was rejected on assessment validity alone.
3. ✅ **Sub-decision 7 — nothing is written until the student commits — is what made the refusal mechanism survivable.** Because a discarded take never reaches the server, RR-A2 was able to decide that **discards are never counted and never written**, so no Firestore record anywhere states that a child declined to be recorded. The discard remains this design's refusal mechanism and is now load-bearing for a second ticket.
4. **The four prep-expiry values are undisturbed.** RR-A2 explicitly declined a purpose dial (practice / assessment) partly because it would re-bundle what this ticket deliberately unbundled, and would have had to duplicate or override these four values.

5. 🔵 **RR-B2 (2026-08-07) added a third set of numbers to the `recording` block, and turned this ticket's cheapest rule into its most expensive one.** A whiteboard take gets **180 s default / 600 s maximum** — its own, not audio's, because bytes are audio-class (a vector command log is negligible next to the audio) while the task itself runs three to five times longer. Sixty seconds would not have been a limit but a guarantee of truncated thinking, and this ticket's hard stop with no grace tail means the student is cut off mid-sentence. ⚠️ **What got more expensive is "nothing is written until the student commits."** That rule is exactly what makes RR-B2's event log free of Firestore entirely — one write at commit rather than the 200 unbatched writes RR-B1 feared — so it earned its keep twice over. But it was priced against a 60 s clip, where a lost take costs a minute. **At 600 s, a tab crash costs a ten-minute worked solution with nothing on the server.** Accepted, not solved, and it is the one place this rule is materially worse for whiteboard than for audio.

6. 🔴 **RR-10 (2026-08-09) put the three numbers sets on one clock, and corrected a claim that had been circulating about this ticket.** The correction first: a summary table in RR-10 asserted that `timeLimit` **hides** when a recording mode is present, citing sub-decision 3. **Sub-decision 3 says no such thing** — it says `timeLimit` is **forced to 0**, and the house idiom for a control another setting disables is to keep it **visible, disabled, with the hint stating why** (`AssignmentSettingsToggleGroup.tsx:285-290`), not to hide it. RR-10 struck the claim in place. **What RR-10 then decided is the harder half, and it is a problem this ticket could not have seen**: RR-A3 sub-decision 2 makes `['audio','video']` a legal set meaning _student chooses_, and RR-B2 added a third ceiling — so **one question can carry two modes whose maxima differ (300 s / 120 s / 600 s) against exactly one limit field.** RR-10 sub-decision 4 keeps **one `recording` block** — one prep, one limit, one expiry — with the limit's maximum clamped to the **minimum ceiling across the authored modes**, on the grounds that if the student picks the mode, a limit reachable in only one of them makes the choice change the assessment. ⚠️ **The cost lands on this ticket's block:** adding `'video'` to a question already authored at 300 s re-caps a number the teacher chose, so the field must name the mode that imposed the new ceiling rather than clamping silently. **Rejected there: one block per mode**, which would have made prep and expiry per-mode too — something this ticket deliberately did not do.

**Paul's notes:**

---

### RR-A2 — What recording controls exist, and what does a retake mean for validity?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-06** · **Blocked by:** ~~RR-A1~~ (closed)

**Question**

You listed pause / redo as teacher-settable. The UI question is easy; the
assessment question underneath it isn't.

- Unlimited retakes turn a speaking assessment into a rehearsal — which is _exactly right_ for building confidence and _wrong_ for measuring fluency. Is the retake budget a number, a boolean, or tied to a purpose setting? (Speakable's four leniency levels are a comparable "same feature, different pedagogical intent" dial — see the competitor findings in memory.)
- Does pause-and-resume produce one continuous file or a stitched one? Stitching is a real implementation cost and an integrity question both.
- Does the teacher see that a student took 6 attempts, and is that signal or noise?
- Can a student review a take before committing it, and does reviewing count as using it? **RR-03 leaned on this**: it decided student review happens _before_ submit from the local blob (free), and after submit only on the published-results screen. So the pre-commit review UX is this ticket's to design, and it's the only free review window there is.

**Sharpened by RR-03 (2026-08-05):**

- 🔴 **A retake now has to clean up after itself in Drive.** RR-03 archives **immediately on each upload**, so take 1 is already transcoded and sitting in the teacher's Drive by the time a student records take 2. The superseded Drive file must be deleted (`drive.file` permits it — SpartBoard created it), or every retake leaves a duplicate in the teacher's folder. Decide whether the teacher ever sees superseded takes or whether they vanish silently.
- **Retakes cost transcode compute that gets thrown away.** Immediate archival means every take is transcoded, not just the surviving one. That's a real argument for a retake budget being a number rather than unlimited — a cost input this ticket didn't have before.

🔵 **RR-A1 (2026-08-06) unblocked this ticket and changed what it is about before it
opened.** Three inputs, one of which is a constraint rather than context:

1. 🔴 **The discard is a refusal mechanism, not a UX nicety.** RR-A1 sub-decision 1 restored auto-start; with capture beginning on a timer, **"stop — don't keep this" is where the student's ability to refuse now lives.** That makes a retake budget dangerous in a way it wasn't: a budget of _n_ that counts discards is a cap on how many times a student may decline to be recorded. **Discards and retakes may have to be counted separately, or not counted at all.** This is the ticket's new first question.
2. **Pre-commit review is cheaper than RR-03 assumed, and the redo cost fell with it.** At RR-A1's ceiling (480p / 500 kbps) a 60 s video take is **4.0 MB**, not 19 MB, so a discarded take costs ~1/5 the transcode compute the bullet above was written against. The argument for a numeric budget weakens accordingly.
3. **Nothing is written until the student commits** (RR-A1 sub-decision 7), so a discarded take never reaches Storage or Drive at all. **The superseded-Drive-file cleanup problem in the first bullet above applies only to _submitted_ takes that are then re-recorded** — a narrower problem than it looked.

**Also inherited:** the recording clock, its four prep-expiry values and the
hard-stop-with-warning behaviour are settled — this ticket should take them as
given and decide only what happens _to a take_ once it exists.

🔴 **RR-08 (2026-08-06) promoted this ticket to the front of the frontier by
handing it a live contradiction between two closed tickets. This is now its first
question, ahead of the retake budget.**

RR-08 sub-decision 3 chose a **hard submit block** when a required addendum is
missing. Sub-decision 4 contains that block honestly for students who _cannot_
record: the slot stays empty, marked `capture-unavailable`, and the block never
binds them. **But a refusing student can record — they chose not to.** So by that
same logic the block binds them, and on a self-paced quiz they are parked on the
question until they record it, the session ends, or the sweep ages them out.

**RR-A1 put refusal in the discard; RR-08 put a block in front of the exit.** Both
decisions are locally correct and RR-08 deliberately did not resolve the tension,
because the resolution is a UX question about what the discard offers — which is
this ticket's.

Three things worth holding while deciding it:

- **It may be coherent as-is.** Refusing a required assessment task means not completing it, exactly as refusing to write an essay does — and RR-A1's `armed` value already ships indefinite parking as an authored, accepted state. "The student is stuck" is not automatically a bug.
- **But it is not the same as an essay**, because RR-04's Tennessen interstitial states whether the student may refuse, and a product that says "you may refuse" and then blocks the exit has made that statement false. This is the one place the collision could become a compliance problem rather than a UX one.
- **The retake budget question inherits it.** If discards are how a student refuses _and_ the block means a discard leaves them stuck, then a budget that counts discards is a cap on refusal **and** a countdown to being trapped. RR-A1 already flagged the first half; RR-08 supplies the second.

🔵 **One smaller input:** RR-08 sub-decision 2 gives this ticket the vocabulary it
would need — an `unresponded` marker with a stated reason — if it decides refusal
should be expressible as a distinct outcome rather than as absence. RR-08
explicitly left the reason vocabulary open for exactly this kind of addition.

**Resolution:** ✅ **Resolved 2026-08-06.** Grounding audit:
[`docs/rich-response/rr-a2-retake-grounding.md`](rich-response/rr-a2-retake-grounding.md).

**1. 🔴 The block stands. Refusal is possible; completion does not follow from it.**
_(Paul chose this against my recommendation, which was to derive the block from
what the Tennessen interstitial declares.)_ No decline exit, no self-releasing
marker, no product affordance that converts "I won't record this" into a
submittable assignment. RR-A1's discard and RR-08's block are both left exactly
as written.

**The collision dissolves rather than resolves, because it rested on a
misreading this ticket corrected.** RR-A2's own injected note said a product that
states "you may refuse" and then blocks the exit has made that statement false.
It has not. § 13.04 subd. 2 element (b) requires **stating whether** refusal is
permitted — RR-04's amendment already records this at RR-A1's insistence — and
element (c) requires stating the **consequences**. Both have true answers here:
_may you refuse_ → yes, the discard is still "stop, don't keep this"; _what
happens if you do_ → the question stays incomplete and the assignment cannot be
submitted. Nothing is contradicted, so **this was never a compliance question.**

⚠️ **The parking is bounded at 90 minutes, not indefinite** —
`IDLE_THRESHOLD_MINUTES = 90` (`functions/src/finalizeIdleQuizAttempts.ts:58`),
after which the sweep finalizes and marks the empty required slot per RR-08
sub-decision 5. That is longer than a class period, so it is _functionally_
permanent for the lesson while being literally temporary. **Accepted knowingly:**
a student who refuses sits visibly stuck for the remainder of the period unless
the teacher intervenes.

**2. Discards are never counted and never written.** The budget counts
**committed takes only**. A discarded take leaves no trace, exactly as RR-A1
sub-decision 7 designed, and no Firestore write anywhere records that a student
declined to be recorded.

This closes the question RR-A1 handed over as this ticket's original first item.
The grounding audit's §5 named the stake precisely: counting discards means
inventing a write whose sole content is a child's refusal, which makes the
refusal mechanism auditable at the moment you start measuring it. It also has a
second effect that decided it — **a budget counting discards is a countdown to
being permanently trapped**, because a student with zero commits and zero budget
has a required slot they can never fill. Sub-decision 1 makes that trap
unreachable only if discards are free.

🟢 **The codebase already argues for this and does it server-side.**
`functions/src/finalizeIdleQuizAttempts.ts:442-465` declines to consume an
attempt slot for a student who joined but never answered — _"they'd otherwise hit
the cap without seeing a question"_ — a fairness argument that transfers almost
word for word.

**3. `takeLimit: number | null`, in RR-A1's `recording` block.** Mirrors the
shipped `QuizBehaviorSettings.attemptLimit` (`types.ts:3184-3188`) in both shape
and convention: `null` means unlimited. **It counts takes, not re-takes** —
`1` means one take and no re-records — because `attemptLimit` counts attempts
rather than re-attempts, and a field named `retakeLimit` invites an off-by-one at
every call site.

**Rejected: a purpose dial** (practice / assessment, or Speakable's four leniency
levels). More legible to a teacher than a digit, and validated by a competitor in
this exact domain — but RR-A1 deliberately **unbundled** this, making prep-expiry
a per-question setting with four explicit values rather than one product-wide
mode. A purpose dial re-bundles what that ticket took apart and would have to
either duplicate RR-A1's values or silently override them. **Rejected: a
boolean** — strictly less expressive for the same implementation cost, and it
cannot say "three tries," which is where most classroom practice lives.

**4. 🔴 The default is unlimited.** _(Paul chose this against my recommendation of
3.)_ Rationale accepted: it matches the shipped norm — self-paced quizzes already
allow unlimited uncounted re-submission (`components/quiz/QuizStudentApp.tsx:2017`,
whose comment calls revisits intentional) — and it keeps the restrictive setting
a deliberate act by a teacher who has decided they are measuring rather than
rehearsing.

🔴 **The cost, recorded rather than absorbed: RR-A1's 599 MB-per-assignment
ceiling no longer holds.** That figure assumed one take per question. With
sub-decision 5 (append) and this default, per-assignment media is **unbounded** —
every committed take is archived immediately by RR-03 and retained to end of
school year by RR-04. The default configuration is therefore both the one that
cannot measure first-attempt fluency and the one with no retention bound. → **See
the consequence injections in RR-A1, RR-03, RR-04 and RR-A6.**

**5. 🔴 Takes append as sibling `answers[]` entries carrying an explicit
`takeIndex`.** _(Paul chose this against my recommendation of replace-and-count,
and held it after I corrected the main argument I had given for it — see the
correction below.)_ Quiz's shipped model replaces and never appends; Video
Activity's appends and never replaces. This picks VA's side.

🔴 **The payment: four consumers must change in lockstep, and "latest wins" is
not the right change.** `quizScoreboard.ts:55-71`,
`questionAccuracyStats.ts:1-35`, `useQuizAssignments.ts:2000-2035` and
`useVideoActivityAssignments.ts:997,1028` all currently credit the
**chronologically first** entry per `questionId`. Those guards are not
defensive boilerplate — `quizScoreboard.ts:61-64` cites shipped bugs **#1728 and
#1777**, `arrayUnion` races and Drive-sync double-writes.

**They must become "highest `takeIndex` wins, ties broken by earliest
`answeredAt`."** The tie-break is the whole point: a race-created duplicate
carries the **same** `takeIndex`, so first-wins-within-index preserves the
original guard's behaviour byte for byte for the case it was written against,
while a genuine retake — which carries a higher index — wins. **Flipping them to
plain "latest `answeredAt`" would reopen both bugs**; an explicit ordinal does
not. Anything that changes fewer than four call sites leaves the scoreboard
grading take 1 while the results view shows take 3, silently.

**6. Superseded takes are kept, not deleted — which dissolves a problem rather
than solving it.** RR-03 sharpened this ticket with _"a retake now has to clean
up after itself in Drive"_ and the audit's §4 found the capability doesn't
exist: **no `DELETE` verb anywhere in `functions/src/driveArchive.ts`**, and a
trap at `:285` where a Firebase Storage delete reads like a Drive one. §4.4 then
found a token problem behind building it — the file lives in the **teacher's**
Drive while the actor is a **student** pressing re-record.

**None of that has to be answered.** Appending keeps every committed take by
design, so there is no superseded file to delete, and the teacher's folder
accumulating takes is the intended outcome rather than the bug RR-03 anticipated.
→ **RR-03's sharpening on this ticket is withdrawn.**

**7. There is no pause. The clock is the clock.** Once capture starts it runs to
commit, discard, or RR-A1's hard stop.

⚠️ **This ticket's charted premise was wrong and the question was smaller than it
looked.** It asked whether pause-and-resume produces one continuous file or a
stitched one, calling stitching _"a real implementation cost."_ **There is no
such cost:** `MediaRecorder.pause()` / `.resume()` are native and continue into
the **same** blob, so the browser returns one continuous file either way. (Neither
shipped recorder uses them — `hooks/useScreenRecord.ts` only ever calls `stop()`.)
With the implementation cost gone, only the assessment question remained, and it
answers itself: RR-A1 rejected a grace tail because _"a grace tail is a longer
limit told dishonestly,"_ and **a 60-second limit a student can pause is not a
60-second limit.** The interruption case is served by discard-and-re-record, at
one unit of a budget the teacher chose.

**8. Every committed take is playable in the teacher's results view, with the
count shown there — and there is no column in the exported results sheet.** The
split is deliberate. The takes exist and cost retention, so they must have a
reader; the audit's §1.3 found the `history` subcollection is **write-only with
no reader anywhere** in the product, and repeating that would mean paying
sub-decision 4's unbounded retention for data nobody ever sees.

But the export sheet's only per-student integrity column is `Warnings`, carrying
`tabSwitchWarnings` (`utils/assignmentExportShared.ts:125-140`), and **column
adjacency is meaning.** A take count beside tab-switch warnings reads as an
integrity signal; the same number beside the audio a teacher is already listening
to reads as _"this student worked at it,"_ which is what it is. This also keeps
the principle sub-decisions 2 and 8 share: **what a student commits is fair game;
what they discard is private.** Every take shown here was deliberately committed.

**9. The budget is enforced in RR-03's per-upload archival callable — not in
Firestore rules.** ⚠️ **This corrects an argument I made during the session in
favour of appending, and it holds against both models:**

- `hasAll(resource.data.answers)` (`firestore.rules:3479`) requires every prior element to survive **byte-identical**. VA affords that because VA has no drafts. **Quiz students promote their own drafts to submitted through `submitAnswer`** — a student-side modification of an existing element — so a blanket append-only guard on quiz's student branch would reject every written-response submit.
- Rules have **no array filtering**, so they cannot count entries per `questionId` under _any_ model. A per-question take budget is not rules-expressible at all.

**Rules were never the venue.** RR-03 already decided archival fires server-side,
immediately per upload, via the stored refresh token — so **every recording
commit already passes through a callable**, which can enforce a per-question
count authoritatively. This is strictly better than what rules could have offered
and it is available under replace or append alike. ⚠️ It also means the shipped
client-side re-submission blocks (`QuizStudentApp.tsx:1889`, `:2017`) remain
enforced nowhere, and this ticket does not fix that — it routes around it for
recordings only.

**Derived, not asked: pre-commit review is free.** The ticket's fourth bullet
asked whether a student may review a take before committing and whether reviewing
counts as using it. It is settled by construction: RR-A1 keeps bytes local until
commit, RR-03 granted the pre-commit local-blob review window, and sub-decision 2
counts only commits. **Record → review → commit or discard, at no cost.**

**Consequences this ticket derives but does not decide:**

- 🔴 **The four-consumer change is scheduled implementation work, like RR-08's spread fix.** It cannot ship after append does — the window where `answers[]` holds two entries for one `questionId` and the scoreboard still credits the first is a silent mis-grade. **It lands with the append change or before it, never after.**
- **Whether a whiteboard response has takes at all.** Sub-decision 5's `takeIndex` is defined on `QuizResponseAnswer`, not on the recording path specifically, so it is available to the B-track for free — but whether "re-do my whiteboard" is the same concept as "re-record my voice" is **RR-B2's** to decide, not this ticket's.

**What this ticket did not decide:**

- **What a superseded take is worth at grading time.** Sub-decision 5 says the highest `takeIndex` wins for scoring, but not whether a teacher may grade an earlier take instead, nor what the presence of six takes should do to a rubric. → **RR-06.**
- **How the takes are organized in the teacher's Drive.** Sub-decision 6 keeps them; it does not say whether they are siblings, versioned names, or a per-question folder. → implementation, informed by **RR-03**.
- **Whether the RR-04 admin console lists takes individually or per question.** It must surface them either way; the shape is that console's design problem.
- **Any extension to RR-08's `unresponded` reason vocabulary.** RR-08 left it open specifically in case this ticket wanted a `declined` reason. **Sub-decision 1 declines to add one** — with no decline exit, there is no moment at which such a reason would be written.

✅ **RR-05 (2026-08-06) paid the debt this ticket booked, and the unbounded
default turned out not to reach the AI cost after all.**

1. ✅ **"AI touches only the winning take" is now stated.** RR-05 sub-decision 3 fixes transcription to the highest `takeIndex` — the same take scoring reads — which is precisely the sentence this ticket said had to be _said_ because the natural implementation would iterate `answers[]` and silently bill for rehearsals. **The debt is closed as written.**
2. ✅ **`takeLimit: null` does not become an unbounded AI bill.** This ticket's warning assumed a per-take AI feature with a daily counter as the only brake. RR-05 sub-decision 2 made transcription a **teacher press per response**, so cost scales with responses a human chose to read — not with how many times a student re-recorded. **The unbounded default's blast radius stops at storage and transcode; it does not reach Gemini.**
3. ⚠️ **One live thread runs back here through RR-06.** RR-05 flagged that if RR-06 permits grading an **earlier** take — a question this ticket declined and handed over — then sub-decision 3 reopens, because a teacher would be grading take 2 against a transcript of take 4. **The question this ticket passed on now has a consequence in a third ticket.**

✅ **RR-06 (2026-08-07) answered both questions this ticket explicitly declined —
one by asking Paul, one by construction.**

1. 🔴 **A teacher _may_ grade an earlier take** (RR-06 sub-decision 4, taken against the agent's recommendation), and the grade records `gradedTakeIndex`. **Item 3 above therefore resolved in the direction that costs something:** RR-05 sub-decision 3 was reopened and amended to follow the pin rather than the winner. **Nothing this ticket decided moved** — sub-decision 5's highest-`takeIndex`-wins still governs every computed score, because a media slot's points come from the manual grade. What pinning changes is **provenance**, not arithmetic.
2. ✅ **Six takes may not price a grade**, and RR-06 derived it rather than asking: once a grade attaches to a **named** take, a grade that varied with how many _other_ takes exist would not be a grade of that take. That is this ticket's sub-decision 8 reasoning arriving at the same place from the other side — takes stay **visible and unpriced**, out of the export's `Warnings` column and out of the rubric.
3. 🔵 **The four-consumer `takeIndex` change gained a sibling on the map's scheduled-work list.** RR-06 found that RR-08's always-write-an-entry rule silently converts the Sheets export's "unanswered" cell into `'0'` — _"answered, incorrect"_ — and it carries **this ticket's rule verbatim**: it lands with the change that causes it or before it, never after. Same failure shape, same silence, no error anywhere.

4. ✅ **RR-B2 (2026-08-07) took the question this ticket declined, and the answer is the one predicted here.** Because audio and strokes arm together on one clock and commit as a single artifact, **a whiteboard take is a recording take** — `takeIndex`, `takeLimit` defaulting to unlimited, discards never counted and never written, no pause, playable in the results view and absent from the export: **all inherited unchanged**, with a retake starting from a blank board because RR-B2 chose a blank start. This ticket said the two concepts might not be the same and that if the audio synced to the strokes it would become _"a consequence of the sync decision rather than an independent one."_ It did, and it is.

5. ✅ **RR-C3 (2026-08-07) touched the shuffle seed's neighbourhood and left it alone, which is worth recording because the seed was this ticket's sharpest argument.** RR-C3 sub-decision 5 makes `shuffleQuestions` **component-aware** — questions sharing a stimulus stay contiguous — but a partitioned shuffle **partitions the array; it does not change the seed**. `QuizStudentApp.tsx:1217-1220` is untouched, so this ticket's deliberate separation of `takeLimit` from `completedAttempts` stands exactly as decided, and the absurd coupling this ticket cited (folding takes into the attempt counter would reshuffle a student's question order when they re-record) is neither worsened nor mitigated. 🔵 **One small consequence to record:** with stimulus groups, a retake reshuffles **component positions** rather than individual questions, which is the intended behaviour and needs no new field.

6. ✅ **RR-10 (2026-08-09) declined to reopen sub-decision 4, and built around it instead.** RR-10's fork C called storage _"unbounded, and reached by teachers who authored nothing unusual"_ — which is a description of **this ticket's default**, chosen by Paul against my recommendation of 3 to keep the restrictive setting a deliberate act. **The obvious move was to change the default; it was not made.** RR-10 sub-decision 6 instead puts a **neutral figure, not a warning**, in the editor's advisory: _"records up to N slots per student."_ The reasoning is this ticket's own consequence taken seriously — with takes appending and no cap, **there is no total to warn against**, so any threshold would be invented, and RR-A5 has not measured the inputs a projection would need. What is knowable is the **slot count**, which RR-06 sub-decision 10 established is what cost actually scales with. 🔵 **So this ticket's recorded-rather-than-absorbed cost is now visible to the person creating it, at the moment they create it** — which is the most that could be done without touching the default, and less than a guardrail.

**Paul's notes:**

---

### RR-A3 — Is video a separate mode from audio, or one mode with a camera toggle?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-06** · **Blocked by:** RR-01 · **Blocks (now unblocked):** RR-A6

**Question**

They share a capture pipeline and diverge on nearly everything else: file size
(~20× ), privacy weight (a face vs a voice — see RR-04), student willingness,
bandwidth on a classroom of Chromebooks all uploading at once, and the grading
surface.

Decide whether the product treats them as one thing with a flag or two things
that happen to share code — and whether a teacher can require audio while
_permitting_ video, or vice versa.

**RR-A4 supplied the numbers this turns on, and the gap is larger than "~20×"
suggested above.** Per class assignment (30 students × 5 questions, 60 s each):
**36 MB of Opus audio vs 2.85 GB of 720p video at Chrome's default bitrate — ~80×.**
And on the school-wifi floor, a 60 s video takes **~75 seconds to upload, longer
than it took to record**, versus ~1 second for the same answer as audio. That is a
strong argument for shipping audio first and treating video as a separately
budgeted feature — but it's your call whether that's a scope decision or a
sequencing one.

**💰 RR-03 (2026-08-05) turned the ~80× ratio into dollars, and the finding is
that video is free on _neither_ storage path while audio is free on both.**

Against Cloud Storage for Firebase's published no-cost tier (5 GB-months stored,
100 GB/month egress, 5K/month upload ops):

| Path                    | Audio                                             | Video                                                       |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Firebase Storage        | free to ~140 concurrent assignments; then pennies | **1.75 assignments** fills the tier; ~$0.12/GB egress after |
| Drive (chosen by RR-03) | $0 storage, cheap transcode                       | $0 storage, **expensive transcode compute** per artifact    |

RR-03 chose Drive, so video's cost moved from egress to **Cloud Function transcode
compute** — but it did not disappear, and RR-03 made transcode **synchronous on
every upload**, so video also costs the student wall-clock time at record-stop on
top of RR-A4's ~75 s upload. **This ticket is now the one place where "does video
ship at all" can be answered, and it has a real budget line on both sides.**

🔴 **RR-04 (2026-08-05) handed this ticket an argument that could settle it without
reference to cost at all.** Sub-decision 2 commits SpartBoard **contractually** to
no diarization, no speaker identification, no face matching — and sub-decision 3
records the price of that commitment honestly: **zero automated redaction
capacity, permanently and by choice.**

Video is where that bites hardest, and the asymmetry with audio is not a matter of
degree. A neighbor's voice bleeding into an audio take is ambiguous and often
unintelligible; **a face in frame is unambiguously another student's education
record.** 34 CFR § 99.12(a), _Letter to Wachter_, and AO 19-004 all land in the
same place — segregate, and **where you cannot segregate, the whole recording
becomes accessible to every affected student's parents.** So one student's video
assignment can become disclosable to a classmate's family, and SpartBoard has now
committed to holding no tool that would prevent it.

**The ticket's question has been converted twice.** It began as "separate mode or
a camera flag"; RR-03 made it "does video's cost justify it"; RR-04 makes it
**"does video ship at all."** Note the strongest input arrives from outside this
map: → **RR-09 question 4.** If Orono answers that _it_ has no redaction capacity
either, then neither party to the contract can segregate, and shipping video means
knowingly shipping an unserviceable access-request path. RR-04's research
recommendation 5 was **audio-only by default, video opt-in per assignment** —
which is also what Microsoft Reading Progress does.

**Resolution** — grilled with Paul 2026-08-06, five sub-decisions.

**1. Video ships — but dark by default, with the district holding the switch.**

The answer to "does video ship at all" is yes, and the reason it isn't a
straight yes is that the § 99.12(a) exposure belongs to the district, not to
SpartBoard. So the gate goes where the obligation already sits: a
`global_permissions` doc checked **server-side in the callable**, following the
shipped `video-activity-audio-transcription` / `defaultMinTier: 'org'` pattern
rather than inventing a mechanism. An org admin turns video on; a teacher then
opts in per assignment. Two gates, both above the question.

This matches RR-04 research recommendation 5 (audio-only by default, video
opt-in) and Microsoft Reading Progress's shipped posture.

⚠️ **This decision is provisional in one direction only.** RR-A5 and RR-09
question 4 are both still open, and neither can improve video's case — RR-A5 can
only reveal transcode is worse than hoped, and RR-09 q4 can only reveal the
district cannot segregate either. A later reversal to audio-only is therefore
live; a reversal toward _more_ video is not.

**Rejected: rule video out of scope.** It would have been cheapest and it re-opens
a settled question — the narrower audio-only destination was considered and
rejected 2026-08-04. RR-04's redaction finding landed after that confirmation and
was genuine new information, so re-opening was legitimate; it just didn't win.
**Rejected: video as a peer of audio with no gate above it** — that puts a
district's § 99.12(a) exposure behind a checkbox in a teacher's quiz editor.

**2. `'audio'` and `'video'` are peer modes in RR-01's set, not one mode with a
camera flag.**

The set semantics then answer this ticket's _original_ question at no cost:

| Authored set        | Means                 |
| ------------------- | --------------------- |
| `['audio']`         | Speak or don't answer |
| `['audio','video']` | Student chooses       |
| `['video']`         | Video required        |

No separate require-vs-permit flag is needed, and the district gate becomes
**pure set subtraction** — strike `'video'` from the allowed vocabulary and every
authored question degrades by dropping one element, rather than the gate reaching
into per-question config to rewrite a tri-state.

RR-02 needs no amendment: `ResponseArtifact.kind` is already
`'text' | 'audio' | 'video' | 'whiteboard'`, with video distinct.

**Rejected: one `'recording'` mode with `camera: 'off' | 'optional' | 'required'`.**
It reflects the shared capture pipeline honestly, but it makes the gate mutate
config instead of filter a list. **Rejected: student picks the camera at capture
time** — it makes a § 99.12(a) exposure a 12-year-old's choice, and no teacher
could then require video for an assignment where seeing the work is the point.

**3. An unavailable mode is filtered at runtime; an emptied set falls to RR-04's
mandated alternative.**

A question authored `['video']` will meet districts where video is off — the gate
flipped after authoring, or the quiz arrived by PLC share from a district that had
it on. Runtime strikes unavailable modes from the set. If that empties it, the
question resolves to the **non-recorded alternative RR-04 sub-decision 5 already
requires on every recording question** — so no fallback machinery is invented, and
RR-01's authored minimum of one is preserved as an _authoring_ rule while runtime
filtering gets a defined floor beneath it.

The **teacher** sees a pre-launch warning naming the affected questions. The
**student** sees nothing unusual.

**Consequence accepted:** a "demonstrate the technique" question silently becomes
a written one, and the teacher learns at launch rather than at authoring.

**Rejected: degrade `'video'` → `'audio'` → alternative.** Nearest-neighbour is
tempting, but it substitutes a mode the teacher never selected, and where seeing
the work _is_ the assessment, audio is worse than text precisely because it looks
like it worked. **Rejected: refuse to launch** — it breaks an assignment at the
moment of use, and a PLC-importing teacher may neither understand what the video
was for nor have authority to restore it.

**4. Video adds a framing check before arming — the one mitigation left that
doesn't require a capability we've given up.**

RR-04 handed this ticket the finding that the bystander asymmetry is a difference
**in kind**: a neighbour's voice is ambiguous and often unintelligible, but a face
in frame is unambiguously another student's education record. Audio's posture
(sub-decision 3 — stated, unenforceable, § 99.12(a) accepted) is therefore not
sufficient for video on its own.

So after the Tennessen notice renders and before the recorder arms, the student
sees **their own camera frame** with one line — _only you should be in frame_ —
and confirms. It is a mirror and a sentence: **no face detection, no analysis of
any kind**, which RR-04 sub-decision 2 forbids by contract.

**This is compatible with RR-04's kill, and the distinction is load-bearing.**
What § 13.32 subd. 14(b)(1) killed was **always-on** preview and auto-start,
because the instructional-purpose exception is conditioned on notice given **in
advance**. A transient preview that runs _after_ the notice is not that.

It upgrades RR-04's posture from "we set an expectation somewhere" to "we set it
at the one moment the student could act on it, while showing them the evidence" —
which is the same lever RR-04 chose throughout: **notice, not enforcement.**

**Rejected: video inherits audio's posture unchanged** — declines the asymmetry
RR-04 identified. **Rejected: push it entirely to the district at the gate** —
correct about who holds the obligation, but the student is the only person who can
actually control who is in frame, and they'd be told nothing.

**5. Video's cost is constrained by a quality ceiling, not by a shorter clock.**

RR-A4's 2.85 GB-per-assignment figure was measured at **Chrome's default
bitrate** — so the byte problem is substantially an encoding decision that nobody
had made yet, not an inherent property of video. Video therefore gets a fixed
resolution and bitrate ceiling (480p / ~500 kbps is the shape; **RR-A1 sets the
numbers**), while the recording clock stays **mode-agnostic**.

This extends RR-A4's existing explicit-bitrate recommendation rather than adding a
lever, and it cuts bytes, transcode compute and the ~75 s upload roughly
proportionally and all at once.

**Consequence accepted:** video quality is now a product decision made on a budget
line, and a teacher filming fine motor detail may find 480p insufficient.

**Rejected: a shorter clock for video than audio.** The most predictable lever and
the easiest to explain to a district, but it constrains the pedagogy rather than
the encoding — and it penalizes exactly the demonstration use case that made video
worth gating instead of cutting. **Rejected: assert no asymmetry and hand it all to
RR-A1** — that would hand a prototype ticket about flow a budget decision without
the finding that produced it.

**Consequences, and where they land:**

- **RR-A1** gains a required step (framing check, post-notice, pre-arm) and two numbers to set (video's resolution and bitrate ceiling), and is told the clock is mode-agnostic. ⚠️ Its committed prototype asset predates all three.
- **RR-A6** loses a blocker (this ticket) and gains a smaller problem: the ~75 s upload was computed at Chrome's default bitrate, which sub-decision 5 rules out.
- **RR-07**'s alternative is now doing **double duty** — the legally mandated refusal path _and_ the degradation floor when the district gate is off. That raises what it has to be.
- **RR-09 question 4 is reframed, not weakened.** It no longer decides whether SpartBoard ships video; sub-decision 1 shipped it. It now informs **whether a given district should flip its own gate** — which makes it district guidance rather than a product blocker.
- **RR-05** inherits two gates above any AI feature touching video, not one.
- **RR-01**'s minimum-set-size-of-one is clarified as an authoring rule (sub-decision 3).

🔴 **Correction from RR-05 (2026-08-06): sub-decision 1's gate is real, but this
ticket misidentified who holds it.**

Sub-decision 1 ships video **"gated off by default, with the district holding the
switch,"** and the reasoning rests on that ownership — the § 99.12(a) obligation
is the district's, so the district should decide. **`global_permissions` does not
give a district a switch.** `firestore.rules:749-752` is `allow write: if
isAdmin()`, and `isAdmin()` reads SpartBoard's own `/admins/{email}` collection.
District scoping exists only as a `buildings[]` allowlist (`types.ts:6366-6372`)
inside a single global doc that only SpartBoard can write. **What this ticket
described as a district switch is a support request.**

- ✅ **Nothing unships and nothing about the design changes.** Video is still gated, still dark by default, still pure set subtraction, still filtered at runtime. The mechanism does what sub-decision 1 needs it to do; the sentence about who operates it was wrong.
- 🔴 **The reasoning is what's damaged, and it is load-bearing.** "The district holds the switch because the obligation is the district's" cannot be true of a control the district cannot reach. RR-05 hit the same problem for AI and answered it with **two gates** — `global_permissions` as SpartBoard's availability switch, a new field on the organization doc as the district's consent switch. **The identical argument applies to video**, and this ticket should be read as wanting that shape.
- 📐 **The fog patch on what an org admin is shown at the video gate now has a second reason to exist:** there is currently no video gate an org admin can be shown, because there is no video gate an org admin can operate.

- 🔵 **RR-B2 (2026-08-07) tested this ticket's gating model against a mode it was never designed for, and it held without amendment.** A narrated whiteboard records a child's voice exactly as `'audio'` does but carries **no camera** — so under pure set subtraction the video gate simply does not name it, and it ships **ungated**. **The gate is on the camera, not on recording.** This ticket implied that and never had to say it; the whiteboard mode is the first case where the difference is load-bearing.

- 🔵 **RR-10 (2026-08-09) used this ticket twice, and neither use was one this ticket anticipated.** First, **sub-decision 2's set semantics created RR-10's hardest per-question problem.** `['audio','video']` meaning _student chooses_ is elegant for gating — the district gate becomes pure set subtraction — but it also means **one question carries two recording ceilings** (300 s and 120 s, and 600 s once RR-B2 added whiteboard) against a single limit field. RR-10 sub-decision 4 clamps the limit to the **minimum ceiling in the set**, for the reason this ticket's table implies: if the student picks the mode, a limit reachable in only one mode makes the choice change the assessment. Second, 🔴 **sub-decision 3's pre-launch warning turned out to be the map's only pre-existing degradation surface** — _"the teacher sees a pre-launch warning naming the affected questions,"_ with the consequence recorded here as _"the teacher learns at launch rather than at authoring."_ RR-10 took ownership of the same class of signal without initially noticing this one existed. **It is not replaced.** RR-10 sub-decision 5 adds a live editor advisory **alongside** it, on an explicit division of labour: the editor catches what is knowable while authoring, and **this ticket's warning remains the only thing that can catch a gate flipped _after_ authoring** — or a quiz that arrived by PLC share from a district with different permissions, which an editor-time check structurally cannot see.

**Paul's notes:**

---

### RR-A4 — What do district Chromebooks actually produce, and what survives to Drive?

**Type:** research (AFK) · **Status:** ✅ **Closed 2026-08-04** · **Blocks (now unblocked):** RR-A5 · _(status line corrected 2026-08-07 — it still read "claimed + running" although the map header, Decisions so far, and every downstream ticket have treated this as closed since the day it landed)_

**Question**

Purely factual, resolvable without you, and it constrains RR-02 / RR-03 / RR-06.

- What container/codec does `MediaRecorder` produce on a managed Chromebook, on Safari/iPad, and on Firefox? (The known trap: webm/opus is fine in Chrome and not universally playable elsewhere.)
- Does Google Drive preview that format in-browser, or does the teacher have to download every submission? If they have to download, the grading flow in RR-06 is already in trouble.
- Does Google Classroom attachment preview handle it?
- What does `hooks/useScreenRecord.ts` already do about this, and can it be shared?
- Practical upload sizes for 30 s / 60 s / 120 s of audio and of 720p video.

**Resolution** — AFK research, 2026-08-04 (codebase + external).

> ## ⛔ BOTTOM LINE: webm does **not** survive the round trip to Drive.
>
> Not for video, and not for audio — for two _different_ reasons. **The archive
> step must transcode.** Record in whatever the browser natively gives you, keep
> that in Firebase Storage as the source of truth, and convert on the way to
> Drive: **MP4 (H.264 + AAC)** for video, **MP3 or `.opus`** for audio.

**Codebase finding: the two halves of student capture exist separately and have
never been joined.**

| What exists               | Where                                                                         | Acquires                     | Records? |
| ------------------------- | ----------------------------------------------------------------------------- | ---------------------------- | -------- |
| `useScreenRecord`         | `hooks/useScreenRecord.ts`                                                    | `getDisplayMedia` (a screen) | ✅ yes   |
| `ScreenCaptureModal`      | `components/widgets/GuidedLearning/components/ScreenCaptureModal.tsx:242-248` | `getDisplayMedia` / a file   | ✅ yes   |
| `Webcam` widget           | `components/widgets/Webcam/Widget.tsx:91`                                     | `getUserMedia` (camera)      | ❌ no    |
| `SoundWidget` noise meter | `components/widgets/SoundWidget/Widget.tsx:184`                               | `getUserMedia` (mic)         | ❌ no    |

`getUserMedia` appears in exactly those two widgets and nowhere else. **Nothing in
the repo has ever recorded a camera or a microphone** — the recorders capture
screens, and the mic/camera consumers only display live. All four are teacher-side.

**mimeType handling — feature-detected in one place, hardcoded in the other:**

- `useScreenRecord.ts:85-89` does it properly: `isTypeSupported('video/webm;codecs=vp9,opus')` falling back to `'video/webm'`.
- `ScreenCaptureModal.tsx:245` **hardcodes `'video/webm'`** with no detection at all.

⚠️ **Both fall back to webm and neither has an mp4 path.** If the external research
comes back saying Safari/iPad can't produce or Drive can't preview webm, there is
no existing fallback to inherit — that's new work, not a config change.

**Reusability verdict:** the _stream acquisition_ isn't reusable (screen ≠ mic),
but `useScreenRecord`'s **lifecycle logic is the valuable part and it is
hard-won** — a concurrent-start guard (`isStartingRef`, lines 48-59), a stale-`onstop`
identity check so a rapid stop→start can't corrupt the next recorder's chunks
(line 108), chunk-clearing deliberately placed after the `await` to avoid racing a
pending `onstop` (lines 78-82), React 18 StrictMode remount handling (lines 149-154),
and cleanup that nulls `onstop` before stopping so a stale blob never reaches an
unmounted consumer. **A student recorder should extract and reuse this, not
reimplement it** — `ScreenCaptureModal` already reimplemented it and came out
weaker (its own `MediaRecorder`, its own chunk refs, no `isTypeSupported`).

**No upload path exists in either recorder.** `useScreenRecord` hands a `Blob` to
an `onSuccess` callback and stops there. `ScreenCaptureModal` funnels through
`onAddMedia`, which uploads via the GuidedLearning editor's slide pipeline with
compression and progress tracking (`ScreenCaptureModal.tsx:14-15, 37-41`) — **that
pipeline is the closest thing to a precedent** for getting a recorded blob to
storage with progress UI, and it's worth examining before anything new is built
for RR-03.

---

**External findings.**

**1. The webm mismatch is in the _audio_ codec, and it's documented.**
[Drive's video spec](https://support.google.com/drive/answer/2423694) supports
WebM as **VP8 video + Vorbis audio**. Chrome's `MediaRecorder` produces \*\*VP8/VP9

- Opus**. Both halves miss. Best case the teacher gets silent video; worst case
  "Couldn't preview this file." **No browser's `MediaRecorder` produces Vorbis any
  more\*\*, so the one combination Drive documents is the one nothing can record.

For **audio-only**, it's worse: [Drive's audio preview list](https://support.google.com/drive/answer/37603)
is MP3, MPEG, WAV, `.ogg`, `.opus` — **`.webm` is not on it at all**, so an
audio-only webm gets routed to Drive's _video_ player with no video track.

**Formats that do work:** `.mp4` (H.264+AAC) for video; `.mp3`, `.wav`, or
`.opus` (Opus-in-Ogg) for audio. **Never `.wav`** — it's supported but ~24× larger
than Opus for no perceptual gain on speech.

**2. ✅ The map's "known trap" is out of date — correct it.** RR-A4 was charted
saying "webm/opus is fine in Chrome and not universally playable elsewhere." As of
**Safari 18.4 (March 2025)** WebKit records WebM with Opus and VP8/VP9
([WebKit release notes](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)).
Safari still _defaults_ to MP4 — which is conveniently the Drive-friendly format.
**Firefox cannot record MP4 at all.**

**3. ⚠️ Client-side MP4 on Chromebooks is not a safe assumption.** Chrome 126
shipped MP4/H.264/AAC recording ([chromestatus](https://chromestatus.com/feature/5163469011943424)),
but reportedly only advertises it where a **hardware H.264 encoder** exists. Many
budget district Chromebooks (Celeron / MediaTek / ARM) may not have one, in which
case `isTypeSupported('video/mp4;codecs=avc1')` returns **false** and the device
simply cannot record MP4. **UNVERIFIED — must be tested on real district hardware
(→ RR-A5).** This is the strongest argument for server-side transcode over
client-side MP4.

**Never hardcode a mimeType.** Feature-detect over a preference-ordered list and
**store the chosen type as metadata alongside the file** so the transcode step
knows what it's handling. (Note `ScreenCaptureModal.tsx:245` currently hardcodes.)

**4. Google Classroom is not a separate pipeline.** Classroom attachments _are_
Drive files, so every constraint above applies identically — no Classroom-specific
codec support rescues a webm. Two side facts worth knowing:

- **Classroom already has native audio/video/screen recording**, capped at **5 minutes**, gated behind Education Plus or the Teaching & Learning add-on. Partially overlapping prior art, and its 5-minute cap is a useful benchmark for RR-A1.
- If a Drive file has download/print/copy disabled, students **cannot preview it on mobile at all** — relevant to RR-C2's stimulus-delivery options.

**5. 🔑 ChromeOS admin policy is a free win, and a hazard.**
`AudioCaptureAllowedUrls` / `VideoCaptureAllowedUrls`
([policy docs](https://chromeenterprise.google/policies/audio-capture-allowed-urls/))
grant a listed origin capture access **with no permission prompt at all**.
Getting SpartBoard's origin allowlisted for the student OU eliminates 30
simultaneous permission prompts. **Treat this as a deployment prerequisite, not an
optimization** (→ RR-A5).

The hazard is the mirror image: districts routinely park students in restricted
OUs with mic/camera disabled. **A subset of any class may have capture
hard-blocked by policy, through no fault of the teacher or the student** — which
makes RR-07's alternate-format path a functional requirement, not just an
accessibility one.

> 🔴 **Amended 2026-08-16 by RR-07 — the observation stands, its consequence does
> not.** Paul: **mic access on student devices is grantable.** So a restricted OU
> is a **remediable configuration**, not a permanent wall — and the two halves of
> this finding turn out to be the same half. **The "free win" is the fix for the
> "hazard."** Nothing here is retracted: restricted OUs are still a real default,
> and a district that never allowlists still hard-blocks a class. What changes is
> that this finding **can no longer carry the mandatory alternate-format
> requirement**, which it had been the sole ground for since RR-A1 withdrew the
> legal one. RR-07 sub-decision 1 deletes that floor.
>
> 🔵 **Worth noting against this map's own pattern: the paragraph above already
> said so.** _"Treat this as a deployment prerequisite, not an optimization"_ was
> written here on 2026-08-04, and RR-07 spent a session arriving at it. **The
> finding's two halves were never reconciled with each other for twelve days** —
> the fix sat one paragraph above the problem it solves, and five tickets cited
> the problem without citing the fix. ⚠️ **The allowlisting has still never
> actually been requested (RR-A5 item 4), so the "free win" remains unclaimed and
> RR-07's whole resolution now rests on it.**

**6. ⚠️ Chromium bugs that directly hit this design:**

- **Chrome-recorded WebM has no duration metadata** — `<audio>`/`<video>` report `Infinity` and seek bars break ([chromium-discuss](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/cyx00_gmYh0)). **Record duration client-side and store it as metadata**; a server-side remux fixes the file. This hits RR-A1's timer UI and RR-06's scrub bar.
- **`MediaRecorder` objects are retained in memory** even when unreferenced ([issue 41423134](https://issues.chromium.org/issues/41423134)). A student answering 5 questions creates 5 recorders in one page session — explicitly null refs and remove listeners between questions.
- **`onmute` / `onunmute` / `onended` are unreliable in Chromium** — can't be used to detect a mic cut mid-recording. Poll levels instead. Combined with ChromeOS hardware kill-switches and privacy shutters (which sit _below_ the permission layer), **verify the track is actually producing signal after recording starts** rather than letting a student record 60 seconds of silence.

**7. 📊 Audio and video are not the same product — the gap is ~80×.**

Per class assignment (30 students × 5 questions = 150 recordings), 60 s each:

| Mode                                           | Per recording | Per class assignment |
| ---------------------------------------------- | ------------- | -------------------- |
| Audio, Opus @ 32 kbps                          | **240 KB**    | **36 MB**            |
| **Video, 480p @ 500 kbps** _(chosen by RR-A1)_ | **4.0 MB**    | **599 MB**           |
| Video, 720p @ 1 Mbps _(explicit)_              | 7.7 MB        | 1.16 GB              |
| Video, 720p @ 2.5 Mbps _(Chrome default)_      | 19 MB         | **2.85 GB**          |

**The decisive number isn't storage, it's upload time on the wifi floor this map
assumes.** At ~2 Mbps effective per-student uplink on a congested AP, a 60-second
720p recording at Chrome's default takes **~75 seconds to upload — longer than the
recording itself**, with 30 students going at once. The same answer in audio is
**~1 second**. Setting `videoBitsPerSecond: 1_000_000` cuts that 60% for
negligible quality loss on a talking head, and `audioBitsPerSecond: 32000` should
be set explicitly rather than trusting an adaptive default Chrome doesn't publish.

**This asymmetry is a strong argument for shipping audio first and treating video
as a separately-budgeted feature** — which is RR-A3's decision to make, now with
numbers.

🔵 **Resolved downstream (2026-08-06).** RR-A3 shipped video gated rather than
cutting it, choosing the **quality** lever over the duration one specifically
because the 2.85 GB above was measured at a bitrate nobody had chosen. RR-A1 then
set the numbers: **480p / 500 kbps**, added as the second row above. That takes the
upload figure from **~75 s to 16 s — 0.27× the recording** — and the assignment
total from 2.85 GB to 599 MB. Finding 5's hazard half also got promoted: it is now
the **primary** ground for RR-07's mandatory alternative, since RR-A1 found RR-04's
legal grounding weaker than recorded.

**⚠️ Two UNVERIFIED items of high consequence** — both are real-world tests, not
research, and both are now **RR-A5**:

1. Whether Drive's _actual current_ transcoder accepts VP9/Opus despite the help page. If it does, the transcode step may be unnecessary. **~15 minutes of manual testing.**
2. Whether district Chromebooks report `isTypeSupported('video/mp4')` as true.

Also unverified: `.m4a` preview specifically, Drive's post-upload processing
delay (**the teacher is not the uploader, so a submission may be briefly
unplayable to them**), any Drive preview size/duration ceiling, and Chrome's
actual numeric default `audioBitsPerSecond`.

**Paul's notes:**

---

### RR-A5 — Verify format round-trip and capture policy on real district hardware

**Type:** task (HITL — needs a person on district hardware and a district Chrome admin) · **Status:** ✅ **Closed 2026-09-01** (by Paul, without running the harness) · **Blocks:** RR-A6 (~~RR-A3~~ closed) · _Opened 2026-08-04 by RR-A4's resolution_

**Question**

Nothing to decide here — this is **manual work that unblocks decisions**. RR-A4
closed with two unverified facts of high consequence, and both are cheap to
settle empirically. Guessing wrong on either one costs a redesign.

> ⚠️ **RR-C2 (2026-08-07) cancels one proposed item and adds a different one.**
> The audit had suggested testing a `type:'domain'`-shared Drive `/preview`
> iframe on a student device; **that measurement is now moot**, because no
> stimulus is served from Drive at all. What replaces it is cheaper and more
> load-bearing: **confirm that a Firebase Storage SDK byte read (`getBytes`)
> succeeds from the app's origin.** RR-C2 sub-decision 2 gates image and PDF
> behind a rules gate, which only bites if download tokens are refused, which
> means SDK reads — and SDK reads need **bucket CORS configuration that does not
> exist in this repo**. Two shipped consumers disagree about whether it already
> works (`useNotebookSharing.ts:79` assumes yes;
> `PageEditorOverlay.tsx:185-186` ships an error string saying it may not). This
> is not really a hardware question and does not need a Chromebook — **it needs
> five minutes and a browser** — but it is listed here because it is the same
> kind of cheap empirical check and nobody else owns it.
>
> ✅ **Item resolved 2026-08-16. There is no bucket-CORS requirement, and the
> two "disagreeing consumers" were never disagreeing — neither of them performs
> an SDK byte read.** Measured against the live bucket:
>
> - A CORS preflight to `firebasestorage.googleapis.com/v0/b/spartboard.firebasestorage.app/o/…`
>   with `Origin: https://spartboard.web.app` returns **`200`** with
>   `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, GET,
HEAD, DELETE, PATCH`, and **`Authorization` explicitly in
>   `Access-Control-Allow-Headers`** — which is exactly and only what `getBytes`
>   needs, since the `Authorization: Firebase <idToken>` header is what forces
>   the preflight in the first place. The real `GET` carries
>   `Access-Control-Allow-Origin: *` as well (verified on a `403`, so the header
>   is served independently of the rules verdict).
> - **The Firebase JS SDK does not read through the raw GCS host**, which is the
>   only host `gsutil cors set` governs. So the absent bucket CORS config was
>   never on the SDK's path. _(For the record the raw host answers the preflight
>   too — but with `GET,HEAD` and `Content-Type` only, **no `Authorization`** —
>   so an authed read there genuinely would fail. That is the config RR-C2 was
>   thinking of, and nothing in this design routes through it.)_
>
> 🔴 **The premise underneath the "two consumers disagree" framing is false in a
> way worth keeping.** `getBytes` and `getBlob` appear **nowhere in the
> codebase** — every Storage read in the app is `getDownloadURL()` followed by
> `fetch()` (16 call sites; `useStorage.ts`, `ActivityWall/Widget.tsx`,
> `ActivityWallGalleryView.tsx`, `MusicManager.tsx`). `useNotebookSharing.ts:79`
> and `PageEditorOverlay.tsx:179` are **the same mechanism as each other**, not
> rival evidence about a mechanism neither uses. And a `getDownloadURL()` token
> URL is ACAO-`*` too, so **`PageEditorOverlay`'s shipped error string —
> _"Storage read access may not be configured"_ — blames a cause its own fetch
> cannot have.** It is a misdiagnosis in production, not a signal about CORS.
> _(Belongs in an issue, not here.)_
>
> ⚠️ **What is proven and what is not.** Proven: the transport. The CORS layer
> will not stop an authenticated SDK byte read from the app's origin, on any
> device, without any infrastructure change. **Not proven: the gate.** Whether
> `request.auth != null` actually admits the read is a `storage.rules` question,
> untouched by any of this and not testable here — the emulator does not run on
> this machine. The two failures are distinguishable in the browser (a CORS
> failure is opaque and logs no status; a rules refusal is a clean `403`), which
> is worth knowing before anyone debugs it.
>
> 🔵 **Consequence for RR-C2: its "first infrastructure requirement" dissolves.**
> Nothing has to be provisioned before image and PDF stimuli can be gated. What
> survives is a **code** requirement, and it is the sharper half anyway —
> gated stimuli must be read with `getBytes`, because the app's universal
> `getDownloadURL` idiom hands out a token URL that **bypasses rules entirely**.
> The gate is only real if the app stops doing the one thing it does everywhere.

> 🔵 **RR-C1 (2026-08-07) adds a sixth item, and it is nearly free once the
> device is in hand:** open a PDF in **pdf.js** on a district Chromebook and page
> through it. RR-C1 sub-decision 3 chose an in-app renderer over the shipped
> iframe specifically to get identical rendering across devices; that claim is
> untested on the hardware students actually use, and pdf.js on a low-end
> Chromebook is the one place it could fail. If a dense multi-page PDF scrolls
> badly there, the fallback is the iframe pattern that already ships — so this
> measurement is cheap to take and cheap to act on.

**The checklist:**

1. **Does Drive actually preview Chrome-recorded webm?** (~15 minutes.) Record one video and one audio-only clip in Chrome, upload both to Drive, try to play both. Drive's documented support is VP8+Vorbis, but its real ingest transcoder may be more capable than the help page. **If it plays, the whole transcode step may be unnecessary.** Test playback as a _different_ user than the uploader, since the teacher is never the uploader.
2. **Do district Chromebooks support MP4 recording?** On the actual student device models, check `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')` and `('audio/mp4')`. Reportedly true only where a hardware H.264 encoder exists, which budget Celeron/MediaTek/ARM Chromebooks may lack. Record which models were tested.
3. **How do the ChromeOS hardware kill-switches fail?** Quick Settings mic/camera toggles and physical privacy shutters sit _below_ the browser permission layer. Find out what `getUserMedia` does when they're engaged — throw, or return a silent/black track? The second is far worse, because a student records 60 seconds of nothing.
4. **Get the origin allowlisted.** Ask the district Chrome admin to add SpartBoard's origin to `AudioCaptureAllowedUrls` / `VideoCaptureAllowedUrls` for the student OU. This removes the permission prompt entirely for a whole class. Confirm whether it's already set, and whether any student OU has capture disabled outright — that population is RR-07's forcing case.
5. **Measure real upload time** for a 60 s recording from a Chromebook on school wifi during a class period, not on an empty network.

Record the answers here; several downstream decisions are currently resting on
assumptions.

> 🔴 **RR-07 (2026-08-16) promoted two of these items and made item 4 the premise
> of a closed ticket. This is now the most load-bearing ticket on the map.**
>
> - **Item 4 is no longer an optimization that removes permission prompts — it is
>   the foundation RR-07's entire resolution stands on.** RR-07 deleted the
>   mandatory alternate format on the strength of _"mic access is grantable,"_
>   which is item 4 asserted rather than measured. **If the district cannot or
>   will not allowlist the origin, RR-07 sub-decision 1 is reopened, not
>   adjusted.** Its second half — _"whether any student OU has capture disabled
>   outright"_ — was already primary for RR-A1; it now also sizes the population
>   RR-07 assumed is near-empty. **Ask for the allowlisting and record how hard
>   the ask was**, because that difficulty is the input the new
>   un-allowlisted-district fog patch is waiting on.
> - **Item 3 is promoted from a technical check to a design dependency.** It was
>   charted as _"does a silent track ruin a recording."_ RR-07 sub-decision 7
>   makes it the measurement that decides whether a **policy block and a user
>   denial are distinguishable at all** — i.e. whether the design could ever tell
>   a student who is blocked from a student who flipped the Quick Settings toggle
>   to skip a question. RR-07 decided it does not need to distinguish them (the
>   count across a class is the detector), but that decision was taken **not
>   knowing whether the option existed.** If item 3 says they are separable,
>   RR-07 sub-decision 7 is worth revisiting on purpose rather than by accident.

📎 **Harness asset (2026-08-06):**
[`docs/rich-response/rr-a5-capture-harness.html`](rich-response/rr-a5-capture-harness.html)
— prints the `MediaRecorder.isTypeSupported()` matrix for whatever browser opens
it, then records a 5 s audio and a 5 s video clip at explicit bitrates
(`audioBitsPerSecond: 32000`, `videoBitsPerSecond: 1_000_000`) and downloads
both, so item 1's Drive test has real Chrome-recorded files to upload. It also
reports the client-measured vs element-reported duration (RR-A4's `Infinity`
bug) and peak amplitude, so a silent track is visible immediately. It uploads
nothing anywhere.

⚠️ **It must be run on the hardware being asked about.** Opening it on a Windows
staff device answers a question this ticket did not ask. **Item 2 closes only
when it runs on a student Chromebook.**

**Partial result, 2026-08-06 — does NOT close item 2.** The matrix was run on a
Windows x64 machine through an Electron 42 shell (Chrome 148 engine), which is
neither ChromeOS nor Chrome proper, and Electron bundles its own codecs.
Everything tested reported supported — including `video/mp4;codecs=avc1` and
`audio/mp4` — except `audio/ogg;codecs=opus` and `audio/mpeg`, both false.
**Treat this as a data point about staff Windows devices only.** It is
suggestive rather than probative: if `audio/mp4` also holds on Chromebooks, the
transcode step may be unnecessary for audio, which is the cheap path RR-A3 is
likely to take anyway. The budget Celeron / MediaTek / ARM models RR-A4 flagged
as lacking a hardware H.264 encoder remain entirely untested.

Items 1, 3, 4 and 5 are untouched. Item 1 could not be run from the agent
environment at all — microphone capture is blocked there, so `getUserMedia`
returns `NotAllowedError` with no permission prompt available.

🔵 **RR-A1 (2026-08-06) gave items 2 and 5 a specific target.** Video's ceiling is
now **480p / 500 kbps**, so the questions are no longer open-ended:

- **Item 2** should test encoding at the chosen ceiling, not just format support. A device that advertises `video/mp4;codecs=avc1` but cannot hold 500 kbps at 480p in software is a different failure from one that can't produce MP4 at all. _(The committed harness records at `videoBitsPerSecond: 1_000_000`; adjust it to 500 000 before the run, or note the discrepancy.)_
- **Item 5**'s expected answer is now **~16 s for a 60 s take**, not ~75 s. That is a prediction this ticket can falsify — and falsifying it is more valuable than confirming it, because RR-A1's whole cost model rests on bytes scaling as arithmetic says they do.
- **Item 4's second half is now load-bearing.** "Whether any student OU has capture disabled outright" was a side note; RR-A1 made that population the **primary** justification for RR-07's mandatory alternative. Get a real number if one is available.

🔵 **RR-B2 (2026-08-07) added a fourth thing to measure while the device is in
hand, and it is cheap to add.** A whiteboard take is **audio at up to 600 s** —
the longest single artifact anywhere on this map — committed alongside a JSON
event log and a rendered PNG, as **three files in one transaction**. So the
round-trip question this ticket already asks about audio should be asked at the
600 s length, not the 60 s one. And the ChromeOS capture-policy check (RR-A4
finding 5) has a **new consequence worth confirming**: RR-B2 sub-decision 6 lets
the canvas arm alone when the microphone is denied, which assumes
`getUserMedia` **fails cleanly and recoverably** under policy rather than
throwing something the page can't distinguish from a user denial. If it doesn't,
the silent-take fallback doesn't work and RR-07's alternative comes back for
whiteboard too.

🔵 **RR-B4 (2026-08-07) added a fifth item, and it is a different _kind_ of
measurement than the other four.** Everything this ticket tests today is about
formats, codecs and the network. RR-B4 sub-decision 5 fixes the whiteboard bitmap
at **3200×2400 — roughly 31 MB of canvas backing store** — and accepted that as
"survivable on a low-end Chromebook" on **reasoning alone, with nothing measured.**
So: allocate a 3200×2400 canvas on a district Chromebook, draw on it continuously
for ten minutes with a tab load typical of a school day, and watch for allocation
failure, paint-rate collapse, or the tab being killed. This is worth doing while
the device is in hand precisely because the fix is trivial if it fails — the
resolution is one constant — but the failure is **silent and total** if it ships
unmeasured: a student loses a ten-minute take to a browser that reclaimed the tab.

🔵 **RR-C3 (2026-08-07) changes the shape of the layout measurement its own audit
proposed, and makes it worse.** The audit suggested rendering a pinned PDF
stimulus above a multiple-choice answer area on a district Chromebook in
landscape, and recording whether both fit without the student scrolling to see
the options. **RR-C3 sub-decision 2 lets a question point at more than one
stimulus**, so the honest test is a **stack of two** — a passage plus a figure —
above the answer area, not one. Test both cases: one stimulus is the common case
and two is the one nobody has looked at. VA and GL each pin media in a
fixed-aspect box (`VideoActivityStudentApp.tsx:927`), and a portrait-ish document
in that box on a 768px-tall screen is a layout question with a real answer. It
sits directly beside RR-C1's pdf.js paging test and costs nothing extra to run
while the file is already open. **If two stimuli plainly cannot fit, that is
evidence for capping the stack — which sub-decision 2 deliberately did not do.**

**Resolution:** _resolved 2026-09-01_ — **Nothing to verify.** District Chromebooks are all current and the app is already approved for the student OU, so item 4's allowlist question is answered and RR-07 sub-decision 1 stands unconditionally. The device checklist is not run; any codec or canvas surprise is handled as an ordinary Phase 3 bug, not a design reopen.

**Paul's notes:** Chromebooks are fine. That entire branch was overblown — they're all up to date and the app is approved. _(2026-09-01)_

---

### RR-A6 — What's the upload strategy on the school-wifi floor?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-09-01** (with RR-A5) · **Blocked by:** ~~RR-03~~ (closed), ~~RR-A3~~ (closed), RR-A5 · _Graduated from fog 2026-08-04 by RR-A4's resolution_

**Question**

This was the **flaky-wifi upload behavior** fog patch. RR-A4 put numbers on it and
made it sharp.

At ~2 Mbps effective per-student uplink on a congested classroom AP, a 60-second
720p recording at Chrome's default bitrate takes **~75 seconds to upload — longer
than the recording itself** — with 30 students uploading at once. The same answer
as audio is **~1 second**. That gap is the whole ticket.

- Resumable upload (Firebase Storage supports it) or fire-and-forget? What does the student see while it happens?
- Does upload run in the background while the student advances to the next question, or does it block? Blocking is honest but eats class time; backgrounding risks a student closing the tab mid-flight.
- Local buffering (IndexedDB) so a dropped connection never loses a take — RR-A2 will have opinions about whether a lost take is acceptable, and RR-A1 about whether a partial take is recoverable at all.
- Explicit bitrate caps: `videoBitsPerSecond: 1_000_000` cuts upload 60% for negligible quality loss on a talking head; `audioBitsPerSecond: 32000` should be set rather than trusting Chrome's unpublished adaptive default. Are these product settings or hardcoded constants?
- What happens when 30 students submit simultaneously at the end of a period — is there any staggering, or does the last student wait?
- **New from RR-02: a `'pending'` artifact needs an owner.** RR-02 decided artifact metadata is written at record-stop, _before_ the bytes finish, so a student who closes the Chromebook mid-upload leaves a durable "recorded, never arrived" record with something to resume against. Nobody has been assigned the resume. Service worker? A prompt on next `/my-assignments` login (SSO makes this possible — the uid is durable)? IndexedDB-buffered retry? Or no automatic retry at all, and the teacher just sees the failed state and asks for a redo? **The write-first design only pays off if something acts on `'pending'`.** RR-03 put a clock on it: a `'pending'` artifact whose bytes never arrived is swept at ~7 days, so whatever resumes it has that long.

**Sharpened by RR-03 (2026-08-05) — two of this ticket's items are now
requirements rather than options:**

- 🔴 **The out-of-band archive-failure notification is a hard requirement, not polish.** RR-03 chose to sweep un-archived media aggressively (~7 days) over the recommended 30-day hard-delete, accepting the risk that a Google grant breaking over a break week destroys a class set. That risk is only survivable if failure reaches the teacher **by email** (the `/mail` outbound queue already exists for org invites) rather than sitting as a badge in a UI nobody has open. Decide the message, the trigger threshold, and whether students are told anything.
- **Storage size caps and the `contentType` allowlist land here.** RR-03 deliberately declined to set them, because a cap has to follow the bitrate policy rather than lead it. Inputs: the shipped activity-wall rule is 10 MB / `image/.*`; RR-A4 measured **19 MB for a 60 s video at Chrome's default** and 240 KB for the same answer as audio. Set the bitrate caps first, then the size cap follows.
- **Transcode is now synchronous on the upload path.** RR-03 archives immediately per artifact, so transcode latency is user-visible, not batch. That changes what "upload strategy" even means — the student is waiting on transcode + Drive round-trip, not just the upload.

**Three further requirements from RR-04 (2026-08-05), all falling out of its
end-of-school-year retention bound (sub-decision 6):**

- 🔴 **A pre-deletion warning email is mandatory, not courteous.** RR-04 amended RR-03's "district-lifecycle-bound" retention into a hard annual expiry (assumed **July 1**, overridable per organization) because COPPA § 312.10 — fully in force since 2026-04-22 — forbids retaining a child's personal information indefinitely and requires a published deletion timeframe. Media therefore dies on a clock the teacher never set, so the sweep **must** be preceded by a warning on the same `/mail` outbound queue as the archive-failure notification above. **Same mechanism, second trigger — decide them together rather than twice.**
- 🔴 **A bulk teacher export path matters more than it did.** RR-04 accepted explicitly that the annual bound forecloses year-over-year growth comparison — and a September-to-September sample pair is the single most valuable artifact a speaking assessment produces. Export is what gives that back. The Flip/Flipgrid post-mortem in RR-04's research is the argument for its shape: **bulk and district-admin-executable**, not per-user self-service with a three-month window.
- ⚠️ **Derived artifacts are in scope of every sweep, not just source media.** COPPA § 312.2 defines "delete" demandingly — _"not maintained in retrievable form and cannot be retrieved in the normal course of business"_ — reaching **transcodes, transcripts, thumbnails and waveform data**. RR-A4 established there **will** be transcodes. So whatever this ticket decides about buffering, resumption and retry must leave nothing behind that a sweep can't enumerate: an IndexedDB retry buffer and a service-worker cache are both places media can survive a deletion that believed it succeeded. **And § 99.10(e) forbids destroying records under an outstanding access request — the sweep has to know about pending requests.**

🔵 **RR-A3 (2026-08-06) settled this ticket's most-argued item and shrank its
headline number.** The explicit-bitrate bullet above is **no longer an open
question of axis** — RR-A3 sub-decision 5 chose the quality ceiling over a shorter
clock as video's cost lever, and handed **RR-A1** the actual numbers. Two
consequences land here:

- **The ~75 s upload figure overstates the problem this ticket must solve**, because it — like RR-A4's 2.85 GB — was measured at **Chrome's default bitrate**, which is now ruled out. Re-derive it against RR-A1's ceiling before designing around it: at the 480p / ~500 kbps shape RR-A3 named, the gap to audio narrows by roughly an order of magnitude, and "upload takes longer than the recording" may simply stop being true. **The 19 MB figure feeding the size cap carries the same defaulted assumption.**
- **"Are these product settings or hardcoded constants?" is answered: neither.** They are set by RR-A1 as a **policy ceiling**, not exposed to teachers — a teacher who could raise the bitrate could re-create the cost problem the district gate was built to bound.

🔴 **RR-08 (2026-08-06) handed this ticket a student-facing number to pick, and
answered its "does upload block?" bullet in the process.**

RR-08 sub-decision 6: **Submit blocks while an artifact is still
`uploadState: 'pending'`** — bounded, with a retry offered on `'failed'`. The
reasoning was RR-A1 sub-decision 7: a lost take is lost, nothing survives the tab
closing, so blocking keeps the student present during **the only window in which a
failure is still recoverable.** That settles the third and fourth bullets above:
upload **blocks**, and local buffering does not rescue it because there is nothing
buffered.

**RR-08 explicitly refused to pick the threshold and deferred it here**, on the
grounds that RR-A1's 16 s assumes 2 Mbps and thirty students on one AP is this
ticket's question, not that one's. So:

- 🔴 **This ticket now owns a number the student experiences directly** — how long Submit may wait before it gives up and records the failure honestly. Too short and recoverable uploads are abandoned; too long and a class ends with students staring at a spinner. **It cannot be picked without RR-A5's hardware measurement**, which is why RR-A5's urgency rose alongside this.
- **The headline number is 16 s, not ~75 s.** RR-A1's 480p / 500 kbps ceiling means 4.0 MB a take and 0.27× real-time on the assumed uplink — but the assumed uplink is exactly what RR-A5 exists to check, and the last-student-of-thirty case in the final bullet above is untouched by a bitrate cut.
- 📐 **The blocking decision makes the simultaneous-submit question worse, not better.** Thirty students who all block on Submit at the end of a period are thirty students waiting on the same AP at the same moment. Staggering is no longer a nicety.

Unblocking note: this ticket now waits on **RR-A5 alone**.

🔵 **RR-A1 (2026-08-06) supplied the numbers and, more importantly, removed an
option from this ticket's solution space.**

🔴 **Streaming chunks to Storage during capture is foreclosed.** It is the
strongest answer this ticket could give — by stop time most bytes have already
landed, which fixes both the upload window and crash recovery — and **RR-A1
sub-decision 7 rules it out**, because RR-A1 sub-decision 1 restored auto-start and
made the **discard** the mechanism by which a student refuses. Once chunks are on
the server, "don't keep this" degrades from a guarantee into a delete request. That
is a materially weaker promise, made to a child, in exchange for an engineering
convenience. **Bytes may not leave the device until the student commits.**

Everything else got easier:

- **The headline number is now 16 s, not ~75 s** — 4.0 MB per 60 s take at 480p / 500 kbps, **0.27× the recording time**. "Upload takes longer than the recording" is no longer true, so this ticket is about resumption and failure handling rather than about hiding a latency the student would otherwise feel. _(Prediction, not measurement — RR-A5 item 5 can falsify it.)_
- **The size cap can now be set**, which RR-03 deliberately deferred pending the bitrate policy: 4.0 MB at the 60 s default, ~8 MB at the 120 s video maximum, ~1.2 MB for a 300 s audio take. The shipped activity-wall rule's 10 MB is coincidentally about right for video and wildly generous for audio.
- **Crash recovery is out of scope by decision, not omission.** A lost take is lost (RR-A1 sub-decision 7); IndexedDB buffering was considered and rejected there. It can be reconsidered here **only** in a form that keeps bytes local — which also keeps RR-04's derived-artifact sweep problem in the bullet above tractable.

**Resolution:** _resolved 2026-09-01_ — **No strategy needed for v1.** Audio is ~1 s per take on the measured floor, so the only live question — how back-to-back take uploads behave — is an in-order upload queue decided inside Phase 3.3, not a design ticket. The video-sized numbers that made this ticket sharp are deferred with video; reopen only if video ships.

🔵 **RR-A2 (2026-08-06) removed this ticket's per-assignment denominator.** RR-A1
handed it "4.0 MB a take, 16 s to upload, 599 MB an assignment." **The first two
stand; the third is gone** — takes now append rather than replace and
`takeLimit` defaults to unlimited, so **the number of uploads per assignment is
unbounded**, and each committed take is its own upload-plus-archive round trip.

Three consequences for this ticket:

- **The unit to plan against is the take, not the assignment.** 16 s per take on the school-wifi floor is still the number to design a strategy around; there is simply no longer a total to multiply it by.
- 🔴 **A student re-recording repeatedly generates back-to-back uploads on the same connection.** Take _n_'s upload may still be in flight when take _n+1_ commits. **Whether uploads queue, cancel the prior one, or run concurrently is this ticket's** — and RR-A2 did not decide it, because it is an upload-strategy question rather than a recording-controls question.
- ⚠️ **RR-08's deferred Submit threshold is unchanged and still lands here** — the bounded block on an in-flight upload, which RR-08 sub-decision 6 explicitly refused to invent a number for. RR-A2 adds only that the pending upload might now be one of several.

- 🔵 **RR-B2 (2026-08-07) introduced a payload shape this ticket has not priced: the multi-file commit.** Every other mode uploads **one** artifact per take; a whiteboard commit uploads **three at once** — audio (up to 600 s, the longest artifact on the map), a `{ t, cmd }[]` event log, and a rendered final-state PNG. The log and the PNG are small, so this is not a bytes problem; it is that **a single commit is now a transaction that either lands whole or leaves a partial take**, and RR-08's in-flight Submit block has to mean all three rather than the one. Whatever threshold this ticket picks has to be expressed per-commit, not per-file.

**Paul's notes:** See RR-A5 — the wifi/Chromebook branch was overblown. _(2026-09-01)_

---

## B. Whiteboard & audio

### RR-B1 — Can `DrawingWidget` be the student whiteboard substrate?

**Type:** research (AFK, local codebase) · **Status:** ✅ **Closed 2026-08-04** · **Blocks (now unblocked):** RR-B2

**Question**

`components/widgets/DrawingWidget/` has an object model (`useDrawingObjectsDoc`),
a command stack (`commands.ts`, `useCommandStack`), canvas rendering
(`useDrawingCanvas`, `renderers/`), pages (`useDrawingPages`), and export
(`exportCanvas.ts`). If it crosses into the student app, B-track scope collapses
dramatically.

Find out whether it can:

- What does it depend on — `useDashboard`, `WidgetData`, auth, Firestore listeners? Student routes mount only `DialogProvider` (see the routing tree in `CLAUDE.md`), so any teacher-context dependency is a blocker.
- It's one of only two widgets with `skipScaling: false` (transform-scale for pixel-accurate coordinates). What does that imply on a student's phone or tablet?
- Does the command stack retain enough to **replay** strokes in order with timing, or only to undo? This is the single most important finding — it decides whether RR-B2's expensive option is nearly free or a rewrite.
- What does `exportCanvas.ts` emit, and is that the archival artifact?

**Resolution** — AFK codebase research, 2026-08-04.

**Headline: it already crosses into a student app — but only as a read-only
viewer, and only via a mock-context shim.** `isStudentView` is a _disable_ flag,
not a mode flag: it early-returns from every pointer handler and hides the
toolbar (`DrawingWidget/Widget.tsx:597,622,642,658,1471,1638,1640`), and
`components/student/studentViewConfig.ts:34` lists `drawing` as
`readOnlyCompatible`. Making it writable is a different project from making it
render.

**1. Dependencies — shallow, but the shim is doing the work.** `/join` does _not_
mount only `DialogProvider` as `CLAUDE.md` implies: `App.tsx:829-839` wraps
`StudentApp` in `StudentProvider`, a hand-written ~380-line mock of the full
Auth + Dashboard contexts (`components/student/StudentContexts.tsx:384-394`) in
which `updateWidget` is an explicit no-op and `user` is `null`. **`/quiz` gets no
such shim** — it's `DialogProvider` only (`App.tsx:865-870`), so dropping the
widget in as-is throws on the first `useDashboard()`.

The good news: **no teacher coupling is buried in a leaf.** Every renderer,
`commands.ts`, `hitTest.ts`, `exportCanvas.ts`, `useCommandStack`, `useSelection`,
`useDrawingCanvas`, `useDrawingPages` import only `@/types`, siblings, and
`@/config/colors`. All coupling sits in `Widget.tsx`, `Settings.tsx`,
`useDrawingObjectsDoc.ts`, `useImageInsertion.ts`. `DraggableWindow` is not a
blocker (`WidgetRenderer.tsx:332-343` bypasses it in student view).

**⛔ The hard blocker is Firestore rules, not React context.**
`firestore.rules:467-474` gates the drawings subcollection on
`!isStudentRoleUser()` — **a student-role token is denied outright**, at any uid.
And the path is `/users/{uid}/dashboards/{dashboardId}/drawings/...`
(`useDrawingObjectsDoc.ts:213-224`), which needs an `activeDashboard.id` a student
doesn't have. A student whiteboard needs a **new collection with new rules**; the
`activity_wall_photos` precedent in the Grounding table is the closest model. The
persistence contract is narrow and swappable —
`{objects, addObject, updateObject, removeObject, clear, loading}`
(`useDrawingObjectsDoc.ts:67-74`).

**2. `skipScaling: false` is a red herring — but it hid a worse problem.**
Coordinate mapping is _already correct_ under parent transforms: both pointer
mappers derive scale from the live `getBoundingClientRect()`
(`useDrawingCanvas.ts:466-479`), and the code comments say so. Touch and stylus
work — real Pointer Events, `touchAction: 'none'`, `setPointerCapture` on eraser
paths.

**The actual gap: there is no canonical coordinate space.** `DrawableObject`
geometry is stored in raw canvas-internal pixels, and the canvas resolution _is_
the widget's live rendered size; `DrawingConfig` (`types.ts:1494-1549`) stores no
page dimension. **A drawing captured on a 375px phone canvas will render in the
top-left corner of a teacher's 1200px grading surface.** This is independent of
`skipScaling` and it is the highest-impact finding after the timing answer →
opened as **RR-B4**. Also missing: `devicePixelRatio` handling
(`useDrawingCanvas.ts:374-375` sets the bitmap to CSS pixels, so handwriting is
soft on any 2×/3× screen), pointer capture on the pen path, and any
`pointerType` branching / palm rejection.

**3. ⚠️ Replay with timing — the answer is (b), and it reframes RR-B2.**

_Ordered forward replay is structurally possible. No timing data is captured
anywhere, and the stack is lossy by design._

- `applyCommand(objects, cmd, 'forward' | 'reverse')` is pure and bidirectional, and forward replay is a stated design intent (`commands.ts:13-16`). Commands carry **full object snapshots**, not deltas (`commands.ts:18-37`).
- **No timestamps exist.** `Date.now()` / `performance.now()` / `createdAt` appear in the entire `DrawingWidget/` directory only inside an export _filename_. `BaseDrawableObject` is `{id, kind, z, rotation?, authorUid?}` (`types.ts:1127-1134`); `Point` is `{x, y}` (`types.ts:1087-1090`) — **no per-point time**, so intra-stroke velocity can't even be reconstructed after the fact.
- **The stack is never persisted and dies on unmount** — stated twice, at `commands.ts:5-8` and `useCommandStack.ts:61-63`. It initializes empty on every mount, so it only ever describes a session that _began_ blank.
- **Undo destroys history.** `undo` moves a command from `past` to `future` and the next `push` wipes `future` (`useCommandStack.ts:106-110,133-139`). So even a replay of `past` reproduces the _final state_, not the student's process — and the retraction a student made is exactly the diagnostic signal "show your work" is after.

**The consolation prize is real, though:** creation order of surviving objects is
durable for free. `nextZ = max(z) + 1` (`utils/migrateDrawingConfig.ts:218-225`)
and every read path sorts ascending by `z`. So **static ordered replay — animating
the drawing on in the order it was made — is nearly free from persisted data
today, with no new capture at all.** What's unavailable is _when_, _how fast_, and
_what was erased_.

**Cost verdict for RR-B2:** the map guessed the expensive option might be nearly
free. It isn't. Timed, scrubbable, narration-synced replay requires a **new
timestamped event log persisted alongside the object writes** — not merely
persisting the existing stack, which is lossy. But a cheap middle option the map
hadn't identified now exists: ordered-but-untimed replay, free today.

**4. `exportCanvas.ts` emits flattened raster only.** A
`data:image/png;base64` string (`exportCanvas.ts:36-39,77-112`), or an array of
them per page; "PDF" is a print-window popup, not a file (`exportCanvas.ts:166-242`).
**No Blob, no File, no SVG, no JSON, no upload path** — and resolution is
whatever the live widget happens to be, so a phone export is a ~375×600 PNG. If a
PNG is the archival artifact for Drive, an upload path has to be built and a
target resolution chosen.

**5. Persistence: one Firestore doc per object.** The 1 MB ceiling therefore
applies per _stroke_, not per board — a non-issue (~25-30k points). **The real
cost is write amplification:** points are never decimated (one per `pointermove`,
`useDrawingCanvas.ts:578-579`), and a 200-stroke drawing is 200 individual
document writes, unbatched. On the flaky-Chromebook-wifi floor this map assumes,
that matters.

**Also worth knowing:**

- `BaseDrawableObject.authorUid` already exists (`types.ts:1132-1133`) — free groundwork if a student board is ever shared or needs per-student attribution.
- A **known-broken sibling case is already documented** at `useDrawingObjectsDoc.ts:39-53`: synced-board co-teachers see an empty drawing post-migration, for the _same_ reason a student consumer would — the hook always reads `/users/{current-uid}/…`. Two remedies are already named there. **Fixing RR-B1's persistence likely fixes that bug too** — genuine cost-sharing.
- `isStudentView` as a boolean can't express "student, interactive, no teacher context." That third state is a **cross-widget concept change** (same pattern in `ConceptWeb`, `MiniApp`, `StarterPack`, `WidgetRenderer`), not a DrawingWidget-local one.
- `StudentContexts.tsx` must be updated for every new context field or student routes fail to compile. Making it load-bearing for a _graded_ response widens that blast radius.
- Test coverage is strong (`Widget.test.tsx` 36 KB, `useDrawingCanvas.test.ts` 33 KB), so an injection refactor has a safety net.

**Unknowns:** the app and test suite were not run; byte estimates are computed,
not measured; whether Firestore offline persistence is enabled on student routes
was not determined — that would materially change the flaky-wifi write story.

🔵 **RR-B2 (2026-08-07) closed, and it dissolved this ticket's ⛔ hard blocker and
its finding 5 together — both were consequences of one assumption.** Both
findings assumed a student whiteboard would persist through
`useDrawingObjectsDoc`. It doesn't. A take is buffered in memory and written
**once at commit** as a `ResponseArtifact` (RR-A1's "nothing is written until the
student commits" plus RR-02's model), so nothing ever touches
`/users/{uid}/dashboards/{id}/drawings/…`. **No new collection, no new rules, no
200 unbatched writes** — and the `activity_wall_photos` precedent this ticket
nominated is not needed either. This was the largest single item of scope on the
B track and it is gone.

✅ **Finding 3's verdict was right in direction and too high in price.** Timed
replay does need a new capture layer, as this ticket said — but the layer is
`{ t: number; cmd: DrawingCommand }` appended and never popped, and
**`applyCommand` is already the replay engine**: this ticket found it pure and
bidirectional, and `commands.ts:12-16,44-45` states forward replay was a design
intent and that any future replay must route through it. `useCommandStack`
already builds the array (`:106`); it is lossy only because `undo` pops to
`future` (`:136-137`) and the next `push` wipes it (`:109`), and RR-B2
sub-decision 3 never pops.

🔴 **One finding got worse rather than better, and it changed the fork.** This
ticket recorded that ordered-untimed replay loses timing and erasures. It also
loses **geometry history**: `update` commands are shipped and routine
(`useSelection.ts:58,258`, `Widget.tsx:449,548`) and `updateObject` overwrites
the same doc by id, so an object drawn first and dragged last replays **first, at
its final position**. The consolation prize was not "the process without a
clock" — it was **the final state revealed in creation order**, which is a
process record that isn't one. Separately, the `z`-as-creation-order property
this ticket relied on holds only because the `reorder` command kind
(`commands.ts:22,89`) is **declared and never issued** — a layer-order affordance
would have broken it silently. Moot now that replay reads the log.

🔵 **RR-B4 (2026-08-07) closed this ticket's last open complaint, and found the
coordinate finding was worse than reported.** RR-B1 recorded that geometry is
stored in raw canvas-internal pixels and that `devicePixelRatio` is unhandled.
Both are true — and RR-B4's audit found the consequence is **not confined to the
student case this ticket framed it as.** `canvasSize` is the ResizeObserver'd
wrapper box and objects are never rescaled when it changes, so **the teacher's own
whiteboard already slides its artwork every time the widget is resized.** RR-B4
sub-decision 6 fixes it for both. ⚠️ **And one of this ticket's framings was too
pessimistic**: RR-B1 read the fixed-coordinate-space problem as a substrate-level
obstacle, but pointer input, selection chrome and PNG export all already decouple
the bitmap from its CSS box — so the fix is a constant, not a rewrite. That is the
same failure mode RR-B2 found here: **this ticket read the types and the
docblocks, and the call sites were more capable than either.**

**Paul's notes:**

---

### RR-B2 — Is the audio synchronized to the strokes, or just attached alongside?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-07** · **Blocked by:** ~~RR-01, RR-B1~~ (both closed) · **Blocks (now unblocked):** RR-B3, RR-B4

**Question**

The pivotal fork in the whole B track, and the scope difference is large.

- **Attached:** a static whiteboard image plus a separate audio file. Cheap, composes from parts that mostly exist.
- **Synchronized:** a timeline the teacher can scrub, watching the work appear as the student narrates it. This is what "show your work" actually means pedagogically — the _order_ a student solved it in is the diagnostic information, and a finished image throws that away.

**Updated by RR-B1's resolution, 2026-08-04 — the fork is now three-way, not
two.** The map guessed the command stack might make synchronized replay nearly
free. It does not: there are **no timestamps anywhere** in `DrawingWidget/`, the
command stack is **never persisted**, and **undo destroys history**. But RR-B1
also found a middle option the map hadn't identified:

- **Attached** — static whiteboard image + separate audio file. Cheap. Note `exportCanvas.ts` emits only a data-URI PNG at whatever size the student's screen happened to be, so even this needs an upload path and a resolution decision.
- **Ordered, untimed replay** — animate the drawing on in creation order. **Nearly free today**: `z` ordering is already durable in persisted data (`migrateDrawingConfig.ts:218-225`) and every read path already sorts by it. Gives you "what order did they solve it in" without any new capture. Does _not_ give you pauses, speed, or erasures — and does not sync to narration.
- **Timed + narration-synced** — a scrubbable timeline. Requires a **new timestamped event log** persisted alongside object writes. Not a matter of saving the existing stack.

The middle option is the interesting one, because the pedagogical claim behind
"show your work" is mostly about _order_, and order is already free. Decide
whether pauses and erasures carry enough diagnostic value to buy the capture layer.

Also decide what gets archived to Drive: a replayable document is not a file a
teacher can open outside SpartBoard, which collides with the
Drive-as-source-of-truth model in RR-03. **Both replay options have this problem;
only "attached" avoids it.**

🔵 **RR-08 (2026-08-06) adds a completeness question this fork decides the shape
of.** RR-08's predicate is **"complete iff every required slot is filled."** On the
**attached** option a whiteboard response is plainly two artifacts, so a student
who draws but never narrates has an obviously half-filled question and the
predicate applies unchanged. On either **replay** option the stroke record and the
narration are arguably one artifact — and if they are, "complete" needs a
definition this ticket supplies rather than inherits: **is a drawing with no
narration incomplete, or is it a complete response that happens to be silent?**

Worth deciding deliberately, because RR-08's block (sub-decision 3) means the
answer determines whether a silent whiteboard response can be submitted at all.

🔵 **RR-A2 (2026-08-06) handed this ticket a mechanism for free and a question to
go with it.** `takeIndex` (RR-A2 sub-decision 5) is defined on
`QuizResponseAnswer`, not on the recording path specifically, so **a whiteboard
response can carry takes with no additional model work.**

**Whether it should is this ticket's call, and RR-A2 explicitly declined it.**
_"Re-record my voice"_ and _"re-do my whiteboard"_ look like the same concept and
may not be: a recording is a performance with a clock, where the retake question
is about assessment validity; a drawing is an artifact under revision, where
RR-B1 already found an object model and a command stack that make _undo_ the
natural affordance rather than _start over_. If this ticket concludes the audio
is synchronized to the strokes, the two become one artifact and inherit the
recording's take semantics whether or not that was intended — **which makes it a
consequence of the sync decision rather than an independent one.**

🔵 **RR-05 (2026-08-06) adds a third thing that rides on the same fork.** If the
audio syncs to the strokes and the two become **one artifact**, that artifact is
a recording — so RR-05's transcription capability applies to it, on the winning
take, under both gates. If they stay **attached alongside**, the audio is a
recording and the drawing isn't, and the slot holds three artifact kinds at once:
strokes, audio, and a `kind: 'text'` transcript of the audio (RR-05
sub-decision 7). **Neither outcome is a problem; the point is that this ticket
decides it by deciding sync, without being asked.** Say which one it chose.

🔵 **RR-06 (2026-08-07) adds a fourth rider to the same fork, and this one has a
concrete cost attached.** RR-06 sub-decision 6 anchors a teacher's inline comments
to **`from`/`to` in milliseconds** into the take.

- **If the audio syncs to the strokes**, the combined artifact has a single timeline, so a time-anchored comment lands on a moment of the _work_ — the strongest version of whiteboard grading available, and it comes free from a decision made for audio.
- **If they stay attached alongside**, there are **two** timelines that do not correspond, and a comment at 0:42 of the audio points at nothing in particular in the drawing. The grading surface then needs either a second, stroke-indexed anchor or an honest admission that comments attach to the audio only.
- ⚠️ **Note what RR-06's reasoning depended on.** It dropped `gradingSnapshot` for media because **a take is immutable**. A whiteboard built on RR-B1's command stack is the one artifact on this map that might _not_ be — if a student can revise after a teacher comments, the anchor-drift problem RR-06 declared dead comes back, and it comes back only here.

**Resolution** — grilled with Paul, 2026-08-07.

**Headline: the expensive option, which turned out not to be the expensive
option.** Paul took **timed + narration-synced** against my recommendation — and
then the toolset answer exposed that the "new timestamped event log" both RR-B1
and this ticket had been pricing as a subsystem is **`DrawingCommand` plus a
timestamp**, with `applyCommand` already serving as the replay engine. The fork
collapses into one model: **one armed take on one clock, a blank canvas, an
append-only command log that keeps retractions, buffered in memory and written
once at commit.** A whiteboard response becomes structurally the same object as
an audio take, which is why almost every rider on this ticket resolved by
inheritance rather than by decision.

**Five audit findings, taken before the first question was asked.**

1. **`reorder` is declared but never issued.** `DrawingCommand` has a `reorder` kind (`commands.ts:22`, applied at `:89`), but nothing constructs one — every `commandStack.push` in the widget is `add` / `remove` / `update` / `clear` / `bulkRemove` (`Widget.tsx:422,447,449,452,548,554,680,1123,1152`). So `z` genuinely is creation order in persisted data and RR-B1's "ordered replay is free from `z`" held — **but it held by the accident of an unbuilt feature.** The kind exists because someone intended a layer-order affordance; shipping it would have made ordered replay wrong with no error anywhere. Moot under sub-decision 1, which replays the log rather than the `z` order.
2. 🔴 **Objects are mutable in place, so "ordered replay" would have replayed _final_ geometry in creation order.** `update` commands are shipped and routine — selection drag and nudge (`useSelection.ts:58,258`), text edit, transform (`Widget.tsx:449,548`) — and `updateObject(next)` overwrites the same object doc by id (`useDrawingObjectsDoc.ts:70`). A stroke drawn first and dragged last replays **first, at its final position**. RR-B1 recorded that the cheap middle option loses timing and erasures; it also loses geometry history, so what it shows is **the final state revealed in creation order**, not a process. This is the finding that made the fork two-way rather than three.
3. **The immutability RR-06 leaned on does not hold for a live whiteboard — RR-B2 flagged it as a risk and it was a fact.** RR-06 dropped `gradingSnapshot` for media because a take is immutable; a `DrawableObject` is a live doc that `updateObject` overwrites. Dissolved by sub-decision 2, not by luck — see the derived notes.
4. **A scrubbable timeline with time-anchored, draggable markers already ships.** `VideoActivityWidget/components/Timeline.tsx` — playhead, markers at timestamps, click-to-seek, drag-to-re-time, 250 ms polling. Precisely the surface RR-06's ms-anchored comments want. It is welded to the YouTube IFrame API (`loadYouTubeApi`, `YT.Player`), so it is a **UX precedent, not a reusable component**.
5. **"An opaque file in Drive" is already the shipped norm, twice.** `.spart` is dashboard JSON written with `mimeType: 'application/json'` into a **visible** Drive folder (`googleDriveService.ts:333-343`), and `.spartnb` is a JSZip bundle with a manifest and inlined, recompressed images (`notebookConverter.ts:16-21`). The charted worry that a replayable document "collides with the Drive-as-source-of-truth model in RR-03" **overstated it** — the collision is about _preview_, the pattern is established, and `.spartnb` already demonstrates the container shape such an artifact would want. Sub-decision 5 declined to use it anyway, for a reason the precedent itself makes visible.

**The decisions.**

1. **Timed + narration-synced** _(Paul, against my recommendation)_. I recommended **attached** on the grounds that finding 2 had collapsed the middle option and RR-B3 had not yet shown a teacher can grade even one of these. Paul bought the capture layer. Finding 2 is the reason the middle option is not the answer; sub-decision 7 is the reason the capture layer turned out to cost far less than I priced it, and **my Q1 pricing should be read as superseded by my own audit.**
2. **One armed take, blank start.** Pressing Record arms mic and canvas together; the response _is_ that session; the board begins empty. One clock, one unambiguous `t=0`, so RR-06's ms anchors land on both audio and strokes with no reconciliation. **The cost is real and was accepted knowingly:** a student cannot sketch, think, then narrate — they must think out loud from the first mark. RR-A1's prep window is the only thing that softens it. The rejected third option (an armed take over a static starting state) would have preserved sketch-then-explain at the price of two epistemic layers in one artifact and a genuinely ambiguous retake.
3. **Undo is an event in the log.** Draw, undo and redraw all land as timestamped events and the scrubber replays the retraction. RR-B1 named this as the diagnostic signal "show your work" is actually after, and under an append-only log it is **free by not implementing anything** — hiding it would cost a compaction pass. ⚠️ **The accepted cost is the sharpest ethical item on this ticket:** it is surveillance of thinking, and a student who learns their false starts are replayed will stop taking them, which destroys the thing being measured. Unlike a spoken "um", a retracted stroke feels like evidence. The rejected middle option (log honestly, replay only on teacher opt-in) was declined for a good reason — _"we record your mistakes but usually don't show them"_ is a worse sentence in a privacy notice than either clean answer — but **it means RR-04's notice now has to carry the plain version.** See injection 4.
4. **A silent take is complete.** One armed take is one artifact in one slot, so RR-08's predicate applies unchanged and answers yes. **SpartBoard never inspects what a child recorded in order to decide whether they responded** — which keeps completeness mechanical, keeps RR-08's single predicate intact, and adds nothing to RR-04's notice. Blocking on silence was rejected because it requires automatically inspecting a child's recording and because a false positive locks a quiet student out of submitting: a whispering ESL student and a broken mic are the same signal. The flagging variant was rejected on the same inspection grounds, plus the observation that a flag which is wrong arrives with authority.
5. **The Drive archive is separate files in a per-response folder** — transcoded audio, a rendered final-state PNG, and the event log as JSON. The two files that matter to a records request both preview natively, which **is the point of Drive being the durable home rather than SpartBoard being it**: the district's copy stays readable if SpartBoard goes away, and full-fidelity replay survives for anyone who has the app. The bundle option was rejected _despite_ finding 5 proving the container is already built — a single `.spartwb` is one clean object for RR-04's console to delete and nothing inside it previews, which is exactly the vendor dependency Drive was chosen to avoid. Server-side rendering to MP4 was rejected on cost. ⚠️ **Accepted: object count triples.** Thirty students × five questions × three files is ~450 Drive objects per assignment, and RR-04's delete console now deletes **sets**, not files.
6. **A mic-denied student gets a silent timed take — the canvas arms alone.** This is the answer sub-decision 4 already implies: a silent take is complete, so a student whose device produced one involuntarily lands in exactly the state a student who chose it lands in, and **the rule needs no exception.** The device-blocked student loses narration and keeps the assessment. Rejected: making the mode unavailable, which would cost a capable student a drawing task for a reason that has nothing to do with drawing; and falling back to "attached", which would put two capture models in one product and double what RR-B3 must prototype. ⚠️ **Owed:** two very different students now produce identical artifacts, and a teacher cannot tell _silent by choice_ from _silenced by policy_ without a provenance field. Named as a requirement on RR-02 (injection 2), not designed here.
7. **Pen, eraser, colours, text and shapes** _(Paul, against my recommendation)_. I recommended pen/eraser/colours alone, on log-vocabulary and small-child grounds. Paul's answer is better than my argument and **it is what made sub-decision 1 cheap**: text and shapes are edited over time, so they are `update` commands — which are already in the `DrawingCommand` union, already handled by `applyCommand`, and already bidirectional. Adding them cost the log nothing, and typed text is a genuine accessibility floor for a student whose handwriting is the barrier rather than the mathematics. **Image insertion and multi-page are out** — image insertion is a student upload path with a privacy and moderation surface nothing on this map has scoped, and RR-B1 found `useDrawingPages` is a silent no-op under the student mock. **One page.**
8. **180 s default, 600 s maximum** — its own numbers, not audio's. Bytes do not constrain here: a whiteboard take is audio-class storage plus a vector log. Sixty seconds would not have been a limit but a guarantee of truncated thinking, and RR-A1's hard stop with no grace tail means the student is cut off mid-sentence. ⚠️ **The accepted cost is grading wall-clock, not storage.** RR-A1's stated reason for a maximum was that assignment totals are not duration-independent; 600 s × 5 questions × 30 students is ~25 hours of material. **RR-B3 is the ticket that discovers whether that number is survivable**, and it now has a concrete one to test against.

**Derived, not asked** — five things this ticket settles without a question,
because the answers follow from the eight above.

- 🔵 **The capture layer is `{ t: number; cmd: DrawingCommand }[]`, and the replay engine already exists.** `useCommandStack` builds exactly this array (`past: [...curStack.past, cmd]`, `useCommandStack.ts:106`); it is lossy only because `undo` pops to `future` (`:136-137`) and the next `push` wipes `future` (`:109`). Under sub-decision 3 nothing is ever popped. `applyCommand` is pure, bidirectional — **so scrubbing backwards is free** — and `commands.ts:12-16,44-45` states forward replay was a design intent and that any future replay must route through it. The subsystem this ticket was pricing is a field and a policy.
- 🔵 **RR-B1's ⛔ hard blocker dissolves entirely, and it was the largest single item of scope on the B track.** RR-B1 found `firestore.rules:467-474` denies a student-role token the drawings subcollection outright, and concluded a student whiteboard needs **a new collection with new rules**. It needs neither. The take is buffered in memory and written **once at commit** (RR-A1: nothing is written until the student commits), as a `ResponseArtifact` on RR-02's path, riding RR-03's transit-then-archive. **Nothing writes to `/users/{uid}/dashboards/{id}/drawings/…` ever.** RR-B1's finding 5 (200 unbatched, undecimated writes on flaky wifi) dissolves for the same reason — one write, not two hundred.
- ⚠️ **Which relocates the risk rather than removing it: a lost take is now ten minutes of work.** RR-A1's "a lost take is lost" was priced against a 60 s audio clip. At sub-decision 8's 600 s ceiling, a tab crash costs a student a ten-minute worked solution with nothing on the server. This is the one place where the in-memory model is materially worse for whiteboard than for audio, and **it is accepted, not solved.**
- **Finding 3 dissolves with it.** A take is closed at commit and never written to again, so it is immutable in the sense RR-06 required. `gradingSnapshot` stays dead for media, and RR-06's anchor-drift worry — which it said "comes back only here" — does not come back.
- **RR-A2's declined question is answered as a consequence, exactly as RR-A2 predicted.** Because audio and strokes are one artifact and a take begins blank, **a whiteboard take is a recording take**: `takeIndex`, `takeLimit` defaulting to unlimited, discards never written, no pause, playable in results and never a column in the export — all inherited unchanged. A retake starts from a blank board. RR-A2 said this would be a consequence of the sync decision rather than an independent one; it was.
- **RR-05 applies, and RR-A3's gate does not.** One artifact that contains speech is a recording, so transcription is available on it under both gates, on the graded take per RR-06 sub-decision 5. But RR-A3 gated **video** on the camera specifically — a whiteboard take has no camera, so for gating purposes it is **audio-class and ships ungated.**
- **RR-B4's raster branch is dead.** A vector command stream needs a coordinate space, not a resolution — so RR-B4 is now a narrower ticket than charted, and it is **mandatory rather than deferred**: sub-decision 5's final-state PNG and the replay surface both need the answer.

**What this ticket did not decide.**

- **The coordinate space and page size** — RR-B4, now unblocked, narrowed, and required.
- **Whether a teacher can triage thirty of these at a glance** — RR-B3, now unblocked, and holding the only response type on this map where a thumbnail grid is even possible.
- **Where the final-state PNG is rendered** — client-side at commit (cheap, but it is a third thing to upload on RR-A6's floor) or server-side at archive (a headless canvas that must understand the log). Genuinely open; it is a build question with a cost, not a design question.
- **The provenance field that separates silent-by-choice from silenced-by-policy.** Named as a requirement, designed on RR-02.
- **Any re-do workflow.** Option 3 of the clock question — an armed take over the student's own earlier work — was declined, so there is no "continue from my draft" path and nobody has asked for one.

🔵 **RR-B4 (2026-08-07) specified the two artifacts this ticket described but did
not dimension.** The archived final-state PNG is **3200×2400**, produced by
`renderPageToPng` with the `ctx.scale(2, 2)` that RR-B4's audit found is missing —
background baked, selection chrome never present. The command log's coordinates
are absolute pixels in a **1600×1200 logical page**, identical on every device, so
the log is portable without carrying a coordinate frame with it. ⚠️ **One
sub-decision here got a new dependency**: sub-decision 6 gives a mic-denied
student a silent canvas take, and RR-B4 sub-decision 3 now gates portrait devices
out of the canvas entirely — so the two device-failure paths are no longer
symmetric. A missing microphone degrades the take; a missing landscape surface
**prevents** it. That asymmetry is deliberate (RR-B4 sub-decision 4 records it
rather than papering over it) but it means "the whiteboard mode always has a
fallback" is no longer true, and RR-07 has taken the case back.

**Paul's notes:**

---

### RR-B3 — What does grading 30 whiteboard-plus-audio responses look like?

**Type:** prototype (HITL) · **Status:** Open — **fully unblocked 2026-08-07** · **Blocked by:** ~~RR-B2, RR-06~~ (both closed 2026-08-07)

**Question**

The B track lives or dies on the teacher's side, not the student's. Prototype the
grading surface and count the clicks and the minutes.

- Can a teacher triage at a glance — thumbnails, a grid — or is it strictly one at a time?
- If the response is a timeline (RR-B2), is scrubbing enough or is a static "final state" view needed for fast passes?
- Does the prev/next + rubric surface from the written-response work carry over intact?

🔴 **RR-06 (2026-08-07) closed, which unblocks half of this ticket — and made it
the only remaining path to reopening RR-05's AI menu.**

1. 🔴 **This prototype is now load-bearing beyond the B track.** RR-05 declined AI-assisted grading partly because nobody had said how a _human_ grades these; RR-06 then answered the wall-clock question by **ordering the queue** (question-major) rather than by asking for machine help, and stated explicitly that it does **not** reopen RR-05's menu. It also named the one thing that could: **this prototype, counting the actual minutes.** So "count the clicks and the minutes" is no longer a B-track sanity check — it is the map's only remaining empirical test of a decision two tickets have now made on reasoning alone.
2. 🔴 **The third bullet's premise is false, and RR-06 verified it.** There is **no shipped rubric surface** to carry over. What shipped is Phase 1 (points, overall comment, prev/next) and Phase 2 (inline highlights + margin comments); **M12 Phase 3 rubrics are unbuilt**, with three open decisions of their own (`TODO.md:34,46`). Rewrite the bullet as _"does the prev/next + annotation surface carry over"_ and treat rubrics as absent rather than inherited.
3. ✅ **Six decisions arrive pre-made, so this prototype tests rather than invents.** Question-major queue (sub-decision 9), time-anchored comments (6), slot-keyed grades (7), the three-state score with its provisional marking (1, 8), teacher-decided excusal (3), and pinned-take grading (4). **The prototype's job is to find which of them costs more in minutes than it looks like on paper** — particularly 6 and 9, whose whole justification is wall-clock.
4. 🔵 **Its first bullet is now the sharpest.** Triage-at-a-glance is the one grading affordance RR-06 did **not** decide, because audio has no thumbnail. A whiteboard does — so this ticket holds the only response type on the map where a grid view is even possible, which is exactly the kind of thing a prototype settles and an argument doesn't.

🔵 **RR-B2 (2026-08-07) closed, which unblocks the other half — and it means this
prototype now knows exactly what it is grading.** Five things arrive specified.

1. **The response is a scrubbable timeline with a single clock**, so bullet 2's question ("is scrubbing enough, or is a static final-state view needed for fast passes?") is now the sharp one rather than a hypothetical — and RR-B2 sub-decision 5 already renders a final-state PNG for the archive, so **the static view exists for free and the question is whether the grading surface should open on it.**
2. **A precedent surface already ships and should be looked at first.** `VideoActivityWidget/components/Timeline.tsx` is a playhead with time-anchored, draggable markers and click-to-seek. It is welded to the YouTube IFrame API so it cannot be reused as a component, but it is the closest thing in the product to what this prototype needs to draw.
3. 🔴 **The wall-clock number to beat is now concrete and large.** RR-B2 sub-decision 8 set whiteboard takes at **180 s default / 600 s maximum**, and accepted that cost explicitly on the grounds that **this ticket is where it gets discovered.** Thirty students × five questions at the ceiling is ~25 hours of material. RR-06's question-major queue is the mitigation; whether it is enough is the measurement.
4. **Undo replays.** RR-B2 sub-decision 3 keeps retractions in the log, so a teacher watching a replay sees false starts. That is the pedagogical payoff of the whole B track and it is also **the thing most likely to make a fast triage pass impossible** — a teacher who must watch the mistakes cannot skim. Worth testing as its own variable.
5. **Grading is anchored in milliseconds into a single timeline** (RR-06 sub-decision 6), which lands on the _work_ rather than on the audio alone. This is the strongest grading affordance on the map and nobody has drawn it.

🔵 **RR-B4 (2026-08-07) removed the last placeholder from this prototype's
inputs — it can now be built at real dimensions rather than sketched.** Three
things it would otherwise have had to invent are fixed: every response is
**4:3**, so a thirty-response grid is thirty identical tiles and the ragged-grid
problem this ticket's first bullet worried about **cannot occur**; the canvas is
**1600×1200 logical at a 3200×2400 bitmap**, so a thumbnail's legibility is a
question with one answer rather than one per student; and **replay geometry is
authoring geometry** with no reprojection, so what the grader scrubs through is
pixel-for-pixel what the student drew. ⚠️ **The consequence for this ticket is
that its excuse is gone.** Every input is now specified, the number to beat is
concrete (600 s × 30), and the two decisions it exists to test — RR-06's
question-major queue and RR-05's declined AI menu — were both made on reasoning
that only a stopwatch can check. It is the highest-value open ticket on the map
and the one an agent is least suited to run.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-B4 — What is a whiteboard response's canonical coordinate space and page size?

**Type:** grilling + domain-modeling (HITL) · **Status:** ✅ **Closed 2026-08-07** · **Blocked by:** ~~RR-B2~~ (closed) · _Opened 2026-08-04 by RR-B1's resolution_

**Question**

RR-B1 found that `DrawableObject` geometry is stored in **raw canvas-internal
pixels**, and the canvas resolution _is_ whatever the widget was rendered at.
`DrawingConfig` (`types.ts:1494-1549`) stores no page dimension anywhere. That's
harmless for a teacher's dashboard widget, where capture and display are the same
surface — and broken for a student response, where they never are.

**Concretely: a student draws on a 375px-wide phone canvas; the teacher opens it
on a 1200px grading surface; the work renders in the top-left corner.**

- Does a whiteboard response declare a fixed logical page (say 1600×1200) that all devices map into, or are coordinates normalized 0–1, or does the artifact carry its own captured dimensions for the renderer to fit?
- What happens on a phone in portrait vs a Chromebook in landscape — is the page letterboxed, or does the aspect ratio itself vary per student? A varying aspect ratio makes a grading grid of thumbnails ragged.
- Is one whiteboard response one page or many? RR-B1 found `useDrawingPages` mutates config through `updateWidget`, which is a **silent no-op** under the student mock — so a student can't change pages today regardless.
- `devicePixelRatio` is not handled (`useDrawingCanvas.ts:374-375` sets the bitmap to CSS pixels), so handwriting is soft on any 2×/3× screen. Is that acceptable for something a teacher has to read and grade, or does the capture resolution need to be decided here too?

Sequenced after RR-B2 because "attached PNG" and "replayable object stream" want
different answers — a raster needs a resolution, a vector stream needs a
coordinate space.

🔵 **RR-B2 (2026-08-07) unblocked this ticket, narrowed it, and made it
mandatory.** Three of the four bullets above are now answered or dead.

- **The raster branch is dead.** RR-B2 chose a timed vector command stream, so this ticket is a **coordinate-space** question, not a resolution question — the "captured dimensions for the renderer to fit" option and the fixed-logical-page option are the live ones, and normalization 0–1 is the third.
- **One page.** RR-B2 sub-decision 7 excluded multi-page along with image insertion, so bullet 3 resolves to _one page_ — and `useDrawingPages`' silent-no-op-under-the-student-mock problem never has to be solved for a response.
- ⚠️ **`devicePixelRatio` (bullet 4) is now the sharpest of the four, not the softest.** RR-B2 sub-decision 5 archives a **rendered final-state PNG** to the district's Drive as one of the two files a records request can actually open, and sub-decision 7 admitted **typed text**. So the capture resolution decides both how legible handwriting is to a grader and what the durable district record looks like — it is no longer only a display-quality question.
- 🔴 **And it is required rather than deferrable.** The replay surface and the PNG renderer both need the answer before either can be built, so nothing in the B track proceeds past RR-B3's prototype without it.

**Resolution — decided 2026-08-07.** **A fixed logical page — and the app already
ran this exact migration once, one level up.**

**Audit findings (recorded before the first question was asked).**

1. **RR-B1's bullet is confirmed, and it is not a student-only problem.**
   `canvasSize` is the ResizeObserver'd wrapper box
   (`Widget.tsx:234-271`), and the resize effect only reassigns
   `canvas.width` / `canvas.height` and repaints
   (`useDrawingCanvas.ts:372-375`) — **objects are never rescaled.** So
   "drawn at 375, opened at 1200" is **already the shipped teacher
   behaviour** every time a drawing widget is resized: the artwork stays
   pinned in absolute pixels while the frame moves around it.
2. 🔵 **The PNG renderer already exists and already takes a page size.**
   `exportPagePng(page, {w,h})` → `renderPageToPng` allocates an offscreen
   canvas at _any_ size, bakes the background template into pixels, and
   paints through the same dispatcher the live canvas uses
   (`exportCanvas.ts:36-115`). RR-B2's archived final-state PNG is nearly
   free. ⚠️ But it paints at **raw** coordinates — a larger `pageSize`
   yields more blank canvas, not larger strokes. Export is correct today
   only because `Widget.tsx:776-830` passes `canvasSize` itself.
3. 🔵 **Pointer input already decouples the bitmap from its CSS box.**
   `scaleX = canvas.width / rect.width`, per axis
   (`useDrawingCanvas.ts:471-474`), and `getLiveScale()` does the same for
   selection chrome (`:162-168`). **A fixed page therefore costs roughly
   "stop feeding `wrapperSize` into `canvasSize`."** ⚠️ The same per-axis
   math means **nothing enforces aspect**: a 4:3 bitmap in a 16:9 box
   stretches, and the pointer math faithfully inverts the stretch — so
   drawing keeps _working_ while circles render as ellipses. Letterboxing
   is mandatory under a fixed page, not a nicety.
4. 🔵 **The uniform-fit letterbox already ships.** `ScalableWidget` computes
   `Math.min(scaleX, scaleY)` and its `canSpread: false` branch renders at
   exactly `baseWidth × baseHeight` (`ScalableWidget.tsx:43-63`) — that _is_
   fixed-logical-page behaviour, in production, used by seating-chart and
   sticker. `drawing` opts out via `canSpread: true`
   (`WidgetRegistry.ts:647-651`), which is precisely what hands it the
   container's aspect ratio instead.
5. **`devicePixelRatio` appears nowhere in any canvas path in this repo** —
   the only two hits are comments in `mathToolUtils.ts:9-10` explaining it
   is irrelevant to inch math. There is no house pattern to copy; whatever
   this ticket picks is the first instance.
6. 🔵 **The app has already done this migration, one level up.**
   `utils/proportionalLayout.ts` + `migrateProportionalLayout.ts` converted
   every widget's _bounds_ from absolute pixels to proportions of a
   `REFERENCE_VIEWPORT = { w: 1920, h: 1080 }`, with `fitAspectInside`, an
   `aspectRatio` field, and a defensive detector that re-derives whenever
   the fields are missing or implausible (`widgetNeedsProportionalMigration`).
   **The drawing widget's _contents_ are the last absolute-pixel coordinate
   space left in the app; the frame around them was fixed long ago.**

**Sub-decisions.**

1. **A fixed logical page.** Coordinates are absolute pixels in one declared
   space on every device. Chosen over **per-artifact captured dimensions** (a
   district record with no fixed size, and ragged grading thumbnails) and over
   **0–1 normalization** (no non-arbitrary rule for stroke width and font size
   once aspect ratio varies — by width? height? diagonal? — and every renderer
   in the dispatcher has to denormalize). Findings 3 and 4 are why this is the
   **cheap** option rather than the expensive one.
2. **1600×1200, 4:3 landscape.** Chromebook-native — the device most students
   actually answer on — and it matches the whiteboard metaphor the widget is
   already built around; `PageJumpMenu.tsx:111` already pins SmartNotebook page
   thumbnails to `4 / 3`. Portrait (paper-shaped, best on a phone) and square
   (least-bad everywhere, well-served nowhere) were both declined. ⚠️ Finding
   6's `REFERENCE_VIEWPORT` is **16:9**, and 16:9 was not among the options
   offered. The tension is defensible — the viewport is a projector, the page is
   a document — but if page shape is ever revisited, that is the door.
3. **Portrait is gated, not letterboxed** _(Paul, against my recommendation)._ A
   phone held portrait gets a full-screen "rotate your device to answer" gate
   and no drawing surface until it is landscape. Chosen over letterbox-plus-nudge
   (a small finger target) and over pan/zoom — which RR-B2 makes worse than it
   looks: a **recorded** take with a viewport forces a choice between archiving
   the student's camera as a second synchronized stream, or showing a grader
   strokes appearing in a corner with no indication the student was zoomed in.
   ⚠️ Accepted cost: this is a hard block, not an annoyance.
4. **The gate is absolute, and it is recorded.** A student whose device cannot
   present the page gets no surface — and the slot records _why_ it is empty
   rather than reading as an ordinary blank. This reuses the **provenance field
   RR-B2 already owes RR-02**, which now carries a third value rather than two.
   An "answer anyway" override and a per-student teacher waiver were both
   declined — the waiver because it drags back RR-07's alternate-format problem
   that RR-B2 had just removed the whiteboard from.
5. **Fixed 2× — the bitmap is always 3200×2400**, live and archived. No dpr
   branching, no per-device variance, and the archived PNG is exactly what the
   student saw at twice the linear resolution. Chosen over **1×** (visibly soft
   on any retina screen — RR-B1's complaint left unfixed) and over **page ×
   `devicePixelRatio`** (~69 MB on a 3× phone; a `ctx.scale` that leaks into
   stored coordinates silently corrupts every response; and per-student PNG
   dimensions contradict sub-decision 1). ⚠️ ~31 MB of canvas backing store —
   survivable on a low-end Chromebook, and a constant somebody will want to tune.
6. **The teacher's dashboard widget is fixed too, not responses only** _(Paul,
   against my recommendation)._ One coordinate space in the app, and finding 1's
   shipped resize bug dies with it.

**Derived, not asked.**

1. 🔵 **Sub-decision 6 costs far less than I priced it, and the correction is
   mine to make**: I told Paul the migration would have to guess at a canvas size
   that was never recorded. Finding 6 says otherwise. The house pattern is a
   **read-time pure migration** — `migrateDrawingConfig` is a pure function
   called at three sites (`Widget.tsx:112`, `Settings.tsx:48`,
   `DashboardContext.tsx:4272`), with **no backfill job and no batch write**. And
   the source canvas is **derivable from persisted data**: `Widget.tsx:238`
   already contains the formula (`{ width: widget.w, height: max(widget.h - 88,

0) }`), which post-proportional-layout resolves through
`computeWidgetPixelRect`against the **fixed**`REFERENCE_VIEWPORT` — a
   constant, not a live viewport. It is wrong only for a widget resized since it
   was drawn, which is wrong in exactly the way today's behaviour is already
   wrong.

2. The migration is a **uniform scale `k = min(1600/srcW, 1200/srcH)` plus
   centering**, applied per kind over a bounded surface: `points[]` (path),
   `x/y/w/h` (rect, ellipse, text, image), `x1/y1/x2/y2` (line, arrow) — all in
   `types.ts:1135-1214`. 🔴 **The trap is the scalars**: `width`, `strokeWidth`
   and `fontSize` must scale by the same `k`, or every migrated drawing returns
   with hairline strokes and tiny text over correctly-placed geometry.
3. ⚠️ **A mid-session claim of mine was too generous and is corrected here.** I
   said a large fixed page dissolves the `devicePixelRatio` question. It does
   not: at 1600 logical the bitmap is only ~1.2× a Chromebook's CSS box and
   **below native** on a 2× iPad. It is **sub-decision 5's supersample**, not the
   fixed page, that disposes of finding 5.
4. RR-B2's archived PNG is now fully specified — **3200×2400**, from
   `renderPageToPng` with the `ctx.scale(2, 2)` finding 2 says is missing,
   background baked, and selection chrome never present (already guaranteed,
   `exportCanvas.ts:70-72`).
5. The live authoring surface and the replay surface are **the same canvas at the
   same resolution**, so a grader watching a replay sees exactly the geometry the
   student drew. There is no reprojection anywhere in the pipeline.
6. ⚠️ **This is the first decision on the map to change shipped teacher
   behaviour.** Everything before it added net-new response-capture surface. It
   also makes the `isStudentView` fog patch RR-B2 opened _smaller_: with one
   coordinate space, that flag no longer has to carry a sizing regime.
7. `DrawingConfig` needs a one-way `pageSpaceMigrated`-style flag, mirroring
   `subcollectionMigrated` (`types.ts:1544-1549`) — the shipped pattern for
   exactly this.

**Paul's notes:**

---

## C. Media connected to question (stimuli)

### RR-C1 — Which stimulus formats are in, and are they rendered in-app or handed off?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-07** · _First ticket taken on the C track_

> 🔵 **RR-C2 (2026-08-07) settled the requirement this ticket created, and
> sub-decision 3 came out ahead.** RR-C1 chose **pdf.js against my
> recommendation**, and the objection recorded here was that it needs bytes it
> can `fetch` rather than a URL it can embed. RR-C2 gates image and PDF behind a
> Storage rules gate, which works by **refusing download tokens and reading
> bytes through the SDK** — so pdf.js is the format on this list that fits the
> access model best, while the `<iframe>` I recommended could not have been
> gated at all. **Second time in two sessions that an option I overpriced turned
> out to be the one the architecture wanted.**
>
> ⚠️ **The CORS worry is answerable but not answered.** Two shipped paths
> already read Storage bytes cross-origin (`hooks/useNotebookSharing.ts:79`,
> `components/widgets/SmartNotebook/components/PageEditorOverlay.tsx:179`), so
> "no `cors.json` exists" is not the same claim as "it does not work" — but the
> two **disagree**, since the SmartNotebook path ships a user-visible _"Storage
> read access may not be configured"_ error string. RR-C2 routed a five-minute
> verification to RR-A5.
>
> 🔴 **And sub-decision 4's silent-failure pattern is already in the tree.**
> `components/widgets/DrawingWidget/renderers/image.ts:57,116` requests
> CORS-readable bytes on a `type:'domain'` `lh3` URL so the canvas stays
> exportable, names CORS as an expected failure in its own docblock, and paints
> **nothing** when it fails. This ticket recorded silent failure as a new and
> uncomfortable decision; it is more accurately the app's existing habit, on the
> one Drive asset it reads as bytes rather than embeds. That does not make the
> decision better — **it makes the fog patch about it wider than one feature.**
>
> 🔵 **Two of the five formats moved home.** RR-C2 put every stimulus byte in
> Firebase Storage: audio and video because `lh3` serves images only, image and
> PDF because gating requires a rules engine Drive does not have. The
> replay-restriction toggle survives intact — it needs a real `<video>` element,
> which is another reason Drive's `/preview` iframe was not an option.

**Question**

You listed pdf, doc, docx, wav, mp3, mp4. They are not one problem:

- **pdf** — `components/widgets/PdfWidget/` already ships a viewer; likely reusable.
- **wav / mp3 / mp4** — native `<audio>` / `<video>`, straightforward.
- **doc / docx** — nothing in the stack renders these. Options: Drive preview iframe (needs the student to have Drive access — see RR-C2), server-side conversion, or refuse the format and tell the teacher to export a PDF. Refusing is a legitimate answer and probably the right one; make it deliberately.

Also decide: does the student get playback _controls_ on an audio/video stimulus,
or is a listening comprehension item allowed to restrict replays? That's a real
assessment-design lever, not a UI detail.

**Resolution:** **The formats were never the open question — the app had already
answered them, and where it hadn't, it had answered them twice and disagreed with
itself.**

The v1 stimulus list is exactly what SpartBoard already accepts somewhere:
**image, audio (mp3/wav), video (mp4/webm/mov), a YouTube URL, and PDF.**
**doc/docx are refused.** Playback defaults to **full controls with a per-question
teacher toggle** down to play/pause-only. PDF renders through **pdf.js in-app**.
A stimulus that fails to load **retries silently with no fallback**.

**Audit findings — all six recorded before the first question was asked**

1. 🔵 **The quiz question model carries no media at all.** `QuizQuestion`
   (`types.ts:3023-3063`) has no `imageUrl`, no `audioUrl`, no attachment field —
   nothing. That makes it the outlier, not the norm: `RoutineStep`
   (`types.ts:1270`), GuidedLearning steps, and a dozen widget configs all carry
   `imageUrl` already. **A stimulus is a genuinely new field on the quiz model**,
   with nothing to extend.
2. 🔵 **But the app already ships question-attached media stimuli — in
   GuidedLearning.** GL steps carry `audioUrl`/`audioStoragePath` and
   `videoUrl`/`videoStoragePath` (`types.ts:5356-5361`), plus per-slide
   `imageKinds` and non-destructive `videoTrims` whose player seeks to `start` and
   loops at `end` (`GuidedLearningPlayer.tsx:739-756`). **"Media attached to a
   step, shown to a student" is solved once already** — this ticket does not need
   to invent a shape, only to decide whether to reuse GL's.
3. ⚠️ **The ticket's own PDF premise was wrong.** `PdfWidget/` does not ship a
   viewer. `PdfWidget.tsx:232` is an `<iframe>` pointed at a Firebase Storage
   download URL, rendered by the browser's built-in plugin; there is no pdf.js and
   no pdf dependency in `package.json`. What was reusable is _"point an iframe at
   a URL,"_ not a renderer.
4. 🔴 **The two shipped media players already contradict each other on exactly
   this ticket's question.** `AudioInteraction.tsx:57-68` renders a bare
   `<audio>` with **no `controls`** and a **non-interactive** progress bar — a
   `div` whose width is a percentage, so play/pause works and **scrubbing does not
   exist**. `VideoInteraction.tsx:75-76` renders `<video controls autoPlay>` —
   full scrubbing. Same feature, same directory, opposite policies, neither
   deliberate.
5. 🔵 **Replay restriction is not hypothetical — it ships, with a teacher
   toggle.** `VideoPlayer.tsx:34` takes `allowSkipping` as a **session setting**,
   enforced by a 250 ms poll that seeks the student back to `maxAllowedTime`
   whenever they exceed it by more than `SEEK_TOLERANCE_SECONDS`
   (`VideoPlayer.tsx:1-12,42-44`). The assessment-design lever this ticket asked
   about already exists in this codebase in both mechanism and product shape.
6. ⚠️ **Two corrections to the charted format list itself.** **YouTube is
   missing from it** although it is the app's primary video source — VideoActivity
   is built entirely on the IFrame API, and GL accepts _"YouTube/external URL or
   Firebase Storage URL."_ And **doc/docx appear nowhere in the codebase**: zero
   hits for `docx`, `msword`, `officedocument` or `mammoth` across every `.ts` and
   `.tsx` file. Every `accept` list in the app is `image/*`,
   `video/mp4,webm,quicktime`, `application/pdf`, `audio/*`, `video/*`,
   `.notebook`/`.spartnb`, or `.csv`. **Refusing Office formats is the status quo
   product-wide, not a new denial.**

**Sub-decisions**

1. **The v1 format list is what the product already accepts: image, audio
   (mp3/wav), video (mp4/webm/mov), YouTube URL, PDF — and doc/docx are refused.**
   Every included format already has both a shipped upload path and a shipped
   render path, so v1 adds no new _format_ capability, only a new attachment
   point. Refusing docx is consistent with all nine `accept` lists rather than a
   special-case denial; the teacher exports a PDF. The accepted cost is a teacher
   with a Word worksheet doing one extra File → Save as PDF step.
2. **Playback defaults to full controls, with a per-question teacher toggle down
   to play/pause-only** — mirroring `allowSkipping`, the one place the app already
   treats this as a deliberate assessment choice rather than a UI default. It
   defaults to the accessible behaviour and puts the restriction on the
   listening-comprehension item where the pedagogy lives, instead of on every
   stimulus. ⚠️ This **resolves finding 4's contradiction for stimuli only** —
   GuidedLearning's two players are deliberately left alone. Fixing them is not in
   this ticket's scope and is not scheduled work; it is an inconsistency now
   documented rather than inherited by accident.
   🔴 **Corrected in place 2026-08-07 by RR-C3, in two steps.** First, the mirror
   was wrong: `allowSkipping` is **not** per-question. It is
   `VideoActivitySessionSettings` (`types.ts:4477-4488`), session-level end to end
   — authored as a widget default, frozen onto the session at create
   (`useVideoActivitySession.ts:200-204`), read once by the student app and handed
   to the player as a single prop — and it **cannot** be per-question, because
   `maxAllowedTime` is derived from _all_ questions and their answered state
   (`VideoPlayer.tsx:68-70`). This ticket's own finding 5 recorded the correct
   level before this sub-decision chose the other one. Second, RR-C3 then put the
   toggle **neither** place: it lives on the **stimulus entry**, because a stimulus
   is now parent-level and shared, and "plays once" is only coherent when there is
   one of it. **The product intent of this sub-decision survives unchanged** —
   default full controls, restriction available where the pedagogy lives — but its
   structural home moved from the question to the material.
3. 🔴 **PDF renders through pdf.js, in-app** _(Paul, against my recommendation —
   I recommended reusing the shipped iframe pattern)_. It buys full control of the
   surface: page navigation, no browser-supplied download button, no dependence on
   the student's PDF plugin, and identical rendering on a Chromebook and a home
   iPad — where an iframe degrades badly. ⚠️ **My stated objection was
   overpriced and is corrected below.**
4. 🔴 **A stimulus that fails to load retries silently, with no fallback and no
   record** _(Paul, against my recommendation — I recommended retry-then-answer
   with the failure recorded)_. Nothing new is built: no retry affordance, no
   error state, no flag on the response.

**Derived — eight items**

- ⚠️ **My bundle objection to sub-decision 3 was overstated, and the correction
  is mine to make.** I priced pdf.js as _"a substantial new dependency and bundle
  cost."_ The repo already has a named pattern for exactly this shape of
  dependency: `vite.config.ts:44-58` isolates `@imgly/background-removal` into its
  own manual chunk, and widgets already lazy-load through `lazyNamed`
  (`WidgetRegistry.ts:41`). **pdf.js costs a `manualChunks` entry and a lazy
  boundary**, both house pattern — not a bundle regression. The genuine cost that
  remains is a dependency the product has deliberately gone without, and it is
  smaller than I said.
- 🔴 **Sub-decision 3 changes what RR-C2 must deliver, from an _embeddable_ URL
  to a _fetchable_ one.** An `<iframe>` needs only a URL the browser will display;
  pdf.js reads bytes over `fetch`/XHR, which is a strictly harder cross-origin
  requirement. **There is no bucket CORS configuration anywhere in the repo** — no
  `cors.json`, nothing in `firebase.json`. Whether pdf.js can read a stimulus at
  all is now a concrete thing RR-C2 must verify rather than assume, and it is the
  one way this ticket made RR-C2 harder instead of easier.
- 🔵 **YouTube inherits sub-decision 2's toggle, and this was derived rather than
  asked.** A YouTube stimulus is an iframe, so `controls` is not an attribute to
  drop — but `VideoPlayer.tsx` already restricts a YouTube player by polling
  `getCurrentTime()` and seeking back. The mechanism exists for both media paths;
  only the enforcement code differs.
- 🔴 **RR-C2's audit (landed the same day) lands directly on sub-decision 1's
  audio and video entries.** It found that `lh3` Drive links serve **images only**
  (`hooks/useStorage.ts:146-151`), so `wav`/`mp3`/`mp4` **have no working Drive
  delivery path at all.** The format list stands, but the delivery for two of its
  five entries is now a known open problem rather than an assumed one — and it
  points at Firebase Storage, not Drive.
- 🔴 **"Handed off" is already the shipped posture, and the repo says so in its
  own rules file.** RR-C2's audit found `storage.rules:112-116` stating that
  token-based download URLs _"are not subject to these rules"_ — a Storage
  download URL is a **bearer credential**. The in-app-vs-handoff framing this
  ticket was built on therefore had a false middle: the app has always handed off,
  and sub-decision 3 is the first time it renders a document itself.
- ⚠️ **Sub-decision 4's real cost is narrower and sharper than the option text I
  wrote for it.** I described it as a student trapped behind a spinner. That is
  wrong: nothing blocks the input, so **the student can still answer** — they
  simply answer without ever seeing the material. The actual cost is that the
  result is **a wrong answer indistinguishable from not knowing**, with no signal
  anywhere that the stimulus never arrived. It is a silent, unattributable data
  loss rather than a stuck student, and it is recorded that way here because the
  question was answered against a description that overstated one risk and missed
  the other.
- 🔵 **Sub-decision 4 is explicitly _not_ an RR-07 case, and that is worth
  stating.** RR-07 is about how a teacher learns **at authoring time** that some
  of their class will hit a wall. A stimulus that fails on one student's
  connection mid-assessment is unknowable at authoring time, so it does not
  narrow or widen RR-07 in either direction. This is the first failure mode on the
  map that RR-07 cannot help with.
- ✅ **A stimulus is a new field on `QuizQuestion`, and RR-C3 decided its shape
  the same day.** This bullet was written expecting the toggle to constrain the
  attachment; the reverse happened. RR-C3 puts a **stimulus array on `QuizData`**
  and a **pointer array of stable ids** on each question, and moved the toggle
  onto the stimulus entry (corrected above). 🔵 **Two of this ticket's findings
  were narrowed by RR-C3's audit and want reading alongside them.** Finding 1's
  _"`QuizQuestion` has no media field, so there is no existing shape to be
  constrained by"_ is true upstream and **false downstream**:
  `VideoActivityQuestion = Omit<QuizQuestion, 'type' | 'matchingDistractors'>`
  (`types.ts:4371-4374`), so the pointer array lands on Video Activity
  automatically unless explicitly `Omit`ed — and VA already carries its own parent
  media, so inheriting it silently gives a VA question two media concepts. And
  finding 2 understates GuidedLearning: it models media at **both** levels with
  distinct roles — set-level `imageUrls[]` as the thing you position against
  (`types.ts:5387`), step-level `audioUrl`/`videoUrl` as the thing that plays
  (`:5353-5360`) — which is a better precedent than "per-step media" for a ticket
  that had to choose a level.

**Paul's notes:**

---

### RR-C2 — How does a student get access to a file in the teacher's Drive?

**Type:** grilling + domain-modeling (HITL) · **Status:** ✅ **Closed 2026-08-07** · **Blocked by:** ~~RR-01, RR-03~~ (both closed) · _Audit and grilling ran as two separate sessions the same day_

> 🔴 **The audit ran 2026-08-07 and both of this ticket's load-bearing premises
> are wrong, in opposite directions** — full findings with citations in
> [`docs/rich-response/rr-c2-drive-access-grounding.md`](rich-response/rr-c2-drive-access-grounding.md),
> including six questions written to be asked verbatim. In short: the
> **link-shareable option this ticket calls "probably disqualifying" is the house
> style**, shipped three times over and the way every student-visible teacher file
> reaches a student today (`utils/googleDriveService.ts:512-516` posts
> `type:'anyone'`; guided-learning slides force it _deliberately_ for student
> view). Meanwhile **the Cloud Function proxy this ticket treats as a decided
> precedent cannot read a teacher's Drive file at all** — SpartBoard holds only
> the `drive.file` scope and deliberately refuses to ask for more, so only files
> SpartBoard created or the teacher opened through the Picker are reachable.
> `functions/src/driveArchive.ts` is upload-only; **no proxy exists.** The
> three-way fork inverts: option 3 is house style, option 2 is unbuildable as
> written, option 1 has no precedent. A **correction to RR-03** rides along —
> its proxy works _because SpartBoard created the file_. Also: a Firebase Storage
> download URL is a **bearer credential** and `storage.rules:112-116` says so in
> as many words, so the copy-into-Storage option inherits link-shareability too;
> and six of nine student routes can only ever hold a bare anonymous token with
> **zero claims**, so the single-student-identity assumption fails as well.
>
> 🔴 **RR-C1 (2026-08-07) added a requirement this ticket did not previously
> have.** PDF now renders through **pdf.js**, which reads bytes over `fetch`
> rather than handing a URL to an `<iframe>` — a strictly harder cross-origin
> requirement. **No bucket CORS configuration exists anywhere in the repo.**
> Whether a stimulus is fetchable, not merely embeddable, is now a thing this
> ticket must verify. RR-C1 also fixed the format list at image/audio/video/
> YouTube/PDF — and the audit's `lh3`-serves-images-only finding means **two of
> those five have no working Drive delivery path**, which is an argument for
> Storage that did not exist when this ticket was charted.

**Question**

This is the sharp edge of the C track and it's an auth problem, not a UI one.

Quiz content lives in the teacher's Drive. SSO students have a Firebase identity
with `{ studentRole, orgId, classIds }` claims — but **no Google identity inside
the app**. `/student/login` runs GIS purely to establish who they are, discards
it, and mints a custom token; the student never holds a Google OAuth token and
therefore has no Drive scope and no right to read the teacher's files. SSO gives
you a _trustworthy claim to check_, not Drive access. A stimulus attached to a
question still has to reach them somehow:

- Copy the file into Firebase Storage at assignment time, with a session-scoped rule like `activity_wall_photos`? Duplicates storage and needs a cleanup story.
- Serve it through a Cloud Function that checks session membership and proxies from Drive using the teacher's token? Adds a token-lifetime dependency (auth refreshes hourly) and a function on the hot path.
- Make the Drive file link-shareable? Simple, and it leaks the file to anyone with the link — probably disqualifying for anything copyrighted.

The direction here also constrains RR-C1: a Drive-preview iframe for docx is only
on the table if students can reach Drive at all.

**✅ RR-03 (2026-08-05) already chose the second option, for the mirror-image
problem — so this ticket now starts from a decided precedent rather than a blank
three-way fork.** For student playback of their _own_ archived recording, RR-03
settled on **a Cloud Function that proxies from Drive using the teacher's stored
refresh token**, gated on (a) requester uid == the response's `studentUid` and
(b) the teacher having published results. The token-lifetime objection above is
answered: refresh tokens are stored server-side, encrypted, at
`/users/{uid}/private/googleAuth` (`functions/src/googleOAuth.ts`), so the proxy
does not depend on a live hourly client token.

What remains genuinely open here is **the gate, not the mechanism** — a stimulus
has no `studentUid` to match against and no publish event to key on, so the
authorization predicate is session/class membership instead. Also open: whether
the hot-path cost of proxying a stimulus that _every_ student in a class fetches
simultaneously behaves like the once-per-student playback case RR-03 sized, or
whether stimuli want the copy-into-Storage option after all.

> ⚠️ **The two paragraphs above are preserved as charted and are both wrong.**
> The audit refuted the premise of the first (no proxy exists, and `drive.file`
> could not feed one), and the session below refuted the premise of the second:
> **there is no hot path to size, because there is no function in the path.**

**Resolution:** ✅ **Closed 2026-08-07** — **Gate where gating is free, follow the
house pattern where it isn't, and move every stimulus byte out of Drive.**

**Audit findings** — the six findings that ran before this session are in
[`rr-c2-drive-access-grounding.md`](rich-response/rr-c2-drive-access-grounding.md)
with citations, and they stand. Four more landed during this session and are
recorded here because each changed the option set rather than merely describing
it.

1. 🔴 **Storage rules in this repo perform cross-service Firestore lookups — and
   I asserted the opposite before checking.** `storage.rules:127-139` gates
   `activity_wall_photos/{sessionId}` on `firestore.get()` and
   `firestore.exists()` against the parent session doc; five such lookups exist
   in the file. **This is the finding that dissolved the ticket's option 2
   instead of confirming it blocked.** A per-student gate is expressible _in
   rules_, so the Cloud Function proxy is not merely unbuildable-as-written — it
   is **unnecessary**. Everything the grounding brief's §6 priced (Gen2
   concurrency 80, the fully-buffering `driveArchive.ts:249` at 512 MiB, cold
   starts, the absent caching and signed-URL layers) was the cost of a proxy, and
   the proxy is gone.
2. ⚠️ **RR-C1's pdf.js CORS requirement is answerable from the repo, but only
   half-comfortably.** Two shipped paths already read Storage bytes
   cross-origin rather than embedding a URL: `useNotebookSharing.ts:79`
   (`fetch(url)` → `.blob()` → re-upload) and `PageEditorOverlay.tsx:179`
   (`fetch(pageUrl)` → `.text()`). **They disagree about confidence.** The
   notebook path simply does it; the SmartNotebook path ships a user-visible
   error string — _"Could not load this page for editing. (Storage read access
   may not be configured.)"_ (`PageEditorOverlay.tsx:185-186`) — which reads like
   somebody hit this and did not resolve it. **"No `cors.json` exists" is
   therefore not the same claim as "it does not work,"** and the two shipped
   consumers do not settle which.
3. ⚠️ **A silent CORS failure on stimulus-shaped media already ships.**
   `renderers/image.ts:57,116` sets `crossOrigin='anonymous'` so the canvas stays
   exportable, on URLs that `useStorage.ts:96-97` returns as
   `lh3.googleusercontent.com/d/{id}` shared `type:'domain'`. The renderer's own
   docblock names CORS as an expected failure mode and its response is to paint
   nothing. **RR-C1 sub-decision 4 is not a new pattern on this map — it is the
   pattern already in the tree**, on the one Drive-hosted asset the app reads as
   bytes instead of embedding.
4. 🔵 **The scope question was live, not historical.** `drive.readonly` is
   _declared_ on the OAuth consent screen and never requested by any code, and
   `docs/external-availability-journal.md:170` wants it **pruned before the
   verification submission** — a submission currently mid-flight (demo video
   recorded 2026-06-23; three consents, zero restricted scopes). Opening it would
   have meant un-pruning a scope the project is actively trying to remove, on a
   review that is presently clean.

**Sub-decisions**

1. **`drive.readonly` stays closed for v1, and the door is named rather than
   nailed shut.** A stimulus is reachable only if SpartBoard created it or the
   teacher opened it through the Picker — so "you attach a stimulus the way you
   attach a quiz file" is the product rule, not "you paste a Drive link." Chosen
   over closing it permanently because nothing about the constraint is
   principled: it is a consequence of an OAuth posture adopted for verification
   reasons, and the C track is the first thing that would make paying the
   restricted-scope cost worth considering. The accepted cost is that a teacher
   cannot use a Drive link a colleague sent them, and **no UI can explain why
   that is arbitrary** — the support question is real and this decision accepts
   it for v1.
2. **Gate where gating is free; follow the house pattern where it isn't.** Image
   and PDF go to Firebase Storage behind a rules gate. Audio, video and YouTube
   are served from public URLs, because gating them costs streaming (an SDK byte
   read means an object URL, so no range requests and no play-before-loaded) or
   is impossible (YouTube has no bytes path at all). ⚠️ **The hole is named and
   accepted: video is arguably the most licence-sensitive format on RR-C1's list
   and it is the one left public.**
3. **The gate is `request.auth != null` — the `global_pdfs` shape**
   (`storage.rules:108`). It blocks the open internet completely: a leaked link
   returns nothing without a SpartBoard account. It does **not** block other
   students, because six of nine student routes hold a bare anonymous token and
   `signInAnonymously()` satisfies the predicate. Chosen over the
   response-doc-existence gate the audit identified as the only _sound_
   predicate, because that gate requires the Storage path to carry `{sessionId}`
   — rules can construct a path but cannot query — **and a stimulus is authored
   once per quiz and assigned to many sessions.** Session-keying would therefore
   force per-assignment byte copying plus a cleanup story: the exact cost this
   ticket charted against option 1, arriving through the back door. This
   sub-decision buys most of the protection for none of it.
4. **Whether the teacher is told any of this is deferred to RR-09, with a named
   trigger** — not left as fog. v1 ships **no notice**, matching every existing
   upload path (none of which discloses `type:'anyone'`, including the one that
   publishes children's own photographs). The question is genuinely RR-09's: its
   audience is the district, not the teacher, and the audit had already routed a
   neighbouring item to the same place. It is also the only decision in this
   ticket that is reversible at near-zero cost — a sentence in an authoring UI,
   against three architectural choices that are not. ⚠️ **The risk is stated:
   RR-09 is unscheduled, so "no notice" is the de facto answer for as long as
   that lasts.**

**Derived, not asked**

- 🔴 **Every stimulus byte lives in Firebase Storage. None lives in Drive.**
  Forced from three directions with no question needed: gating requires a rules
  engine and Drive has none; `lh3` serves **images only**
  (`useStorage.ts:146-151`), so AV cannot use the shipped Drive path; and the
  Drive `/preview` iframe cannot carry RR-C1's replay toggle, which needs a real
  `<video>` element to seek back on. **This reverses RR-03's "Drive is the
  durable home" for stimuli** — and reverses it on _capability_ grounds rather
  than cost, which is the more durable kind of reversal.
- **The Cloud Function proxy is dead, and it died dominated rather than
  blocked.** The audit killed it on scope; finding 1 killed it on redundancy.
  Both matter: even under a granted `drive.readonly` the rules gate would still
  be cheaper.
- **Three of the audit's six questions dissolved without being asked.** Q4
  (pre-join preview) — an auth-only gate has **no join requirement**, so
  previews, practice mode and a teacher projecting the passage all work for free.
  Q5 (where the reference lives) — a gated reference is a **Storage path, not a
  credential**, so `publicQuestions` being world-readable
  (`firestore.rules:2876-2884`) leaks nothing for image and PDF. Q6 (does AV
  reverse RR-03?) — answered by construction above.
- ✅ **The "two reference shapes" wrinkle this ticket handed RR-C3 dissolved the
  same day.** It worried that a bearer URL duplicated across six questions is six
  copies of a credential, while a Storage path duplicated six times is harmless.
  **RR-C3 put the stimulus array on the parent**, so there is exactly **one copy
  of every reference** and the pointers are what duplicate — the asymmetry
  between the two shapes no longer has anything to act on. The wrinkle was an
  artifact of per-question storage, and per-question storage is not what shipped.
  🔵 RR-C3 also confirmed and sharpened Q5's conclusion above: `toPublicQuestion`
  (`useQuizSession.ts:288-326`) is a **hand-written allowlist**, so nothing
  reaches student reach by default at any attachment level — **exposure is decided
  at the projection, not by the storage model**, which is a stronger version of
  the same finding than "a Storage path is not a credential."
- 🔵 **pdf.js turns out to be the gate-friendliest format on the list.** It wants
  bytes rather than a URL, which is exactly what an SDK read produces. RR-C1's
  sub-decision 3 was taken against my recommendation and is the one that fits
  this ticket's outcome best — **the second time in two sessions that an option I
  overpriced turned out to be the one the architecture wanted.**
- ⚠️ ~~**This map has produced its first infrastructure requirement.** SDK byte
  reads (`getBytes`/`getBlob`) need bucket CORS configuration; `getDownloadURL`
  does not. No `cors.json` exists in the repo and nothing in `firebase.json`
  configures it. Finding 2 says the capability may already work, and finding 2
  also says one shipped consumer doubts it. **This wants verifying before the
  build, not during it** — it is cheap to check and it gates two of five formats.~~
  ✅ **Verified false 2026-08-16 by RR-A5, and the "verify before the build"
  instinct was right for the wrong reason — it was cheaper than anyone thought
  and it was never a build question.** `gsutil cors set` governs the **raw GCS
  host**, and the Firebase JS SDK does not read through it. The SDK's actual
  endpoint, `firebasestorage.googleapis.com`, answers the preflight itself with
  `Access-Control-Allow-Origin: *` and `Authorization` in
  `Access-Control-Allow-Headers` — which is the whole of what `getBytes` needs.
  **The map has no infrastructure requirement.** 🔴 **And finding 2's premise was
  wrong in a way that matters more than the conclusion**: `getBytes`/`getBlob`
  appear **nowhere in this codebase**, so the "shipped consumer that doubts it"
  doubts something it never attempts — `PageEditorOverlay.tsx:179` ships
  _"Storage read access may not be configured"_ on a plain `fetch` of a
  download-token URL, which is ACAO-`*` and cannot fail that way. **What survives
  is the sharper requirement, and it is code rather than infrastructure**: a
  gated stimulus must be read with `getBytes`, because the app's universal
  `getDownloadURL` idiom mints a token URL that **bypasses `storage.rules`
  outright**. Sub-decision 2's gate is real only where the read stops using it.
  ⚠️ Still unverified, and not by this check: whether the `request.auth != null`
  rule admits the read. That is a rules question, and the emulator does not run
  on this machine.
- 🔴 **Said plainly, because the sub-decisions do not say it anywhere on their
  own: SpartBoard has decided not to protect copyrighted stimulus material.** AV
  sits on bearer URLs; image and PDF sit behind a gate any anonymous account
  defeats. That is a coherent posture and it matches everything the product
  already does — but the ticket opened by calling link-shareability "probably
  disqualifying for anything copyrighted," and it closes by accepting
  substantially that. The decision is defensible; leaving the sentence unwritten
  would not be.
- 🔵 **No per-assignment copying, no cleanup story, no new collection, no new
  callable, and no function on any path.** Whatever else is true of this
  resolution, it is the cheapest one available — which is worth stating precisely
  because the ticket was charted as the sharp edge of the C track.

**Consequence injections** — RR-03 (correction in place), RR-C1, RR-C3, RR-09,
RR-A5, plus two fog patches. Recorded in each.

**Paul's notes:**

---

### RR-C3 — Does a stimulus attach to a question or to an assignment?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-07** · _Audit and grilling ran as two separate sessions the same day_

> 🔴 **The audit ran 2026-08-07 and found this ticket has already been built —
> twice.** Full findings with citations in
> [`rr-c3-stimulus-attachment-grounding.md`](rich-response/rr-c3-stimulus-attachment-grounding.md),
> including seven questions written to be asked verbatim. The headline:
> **VideoActivity is not an analogue of this ticket, it _is_ this ticket** —
> `VideoActivityQuestion = Omit<QuizQuestion, 'type' | 'matchingDistractors'> & { timestamp: number }`
> (`types.ts:4371-4374`), with the media on the **parent** (`youtubeUrl`,
> `types.ts:4390`) and a pointer on the child. GuidedLearning does the same shape
> with `imageUrls[]` + `imageIndex` (`types.ts:5330-5331,5387`). Both keep the
> media mounted and overlay the question `absolute inset-0`, GL with an explicit
> _"always mounted"_ comment (`GuidedLearningPlayer.tsx:719-724`) — so the
> charted worry that a stimulus "disappears when the student advances" is
> **solved and commented in two shipped players.** ⚠️ **It also refutes the
> RR-C1 injection below**: `allowSkipping` is session-level and _cannot_ be
> per-question (`VideoPlayer.tsx:68-70`), so RR-C1's toggle does not presume a
> per-question home — it presumes the opposite. In both shipped precedents **the
> media supplies the ordering**, which is why shuffle-scatter never arose; that
> is the one genuinely new part of this ticket. The duplication worry is
> **refuted on its stated reason** (a URL is ~250 bytes, six copies ≈ 0.2% of
> 1 MiB) and **re-grounded on a better one**: drift between six
> `{url, replayPolicy}` copies, which rules cannot enforce
> (`firestore.rules:2887-2890`).
>
> 🔵 **RR-C2 (2026-08-07) handed this ticket a wrinkle its audit could not
> see: a stimulus reference now has _two_ shapes.** Gated formats (image, PDF)
> are referenced by a **Storage path**, which is not a credential and is safe in
> the world-readable `publicQuestions` array. Public formats (audio, video,
> YouTube) are referenced by a **bearer URL**, which is. Whatever this ticket
> decides about _where_ a stimulus attaches has to hold for both, and the
> parent-pointer pattern its audit recommends means **the pointer is the thing
> that gets duplicated** — six copies of a Storage path are harmless, six copies
> of a bearer URL are six copies of a credential.
>
> 🔵 **RR-C1 (2026-08-07) handed this ticket two things.** First, a fixed format
> list — image, audio, video, YouTube URL, PDF — so the attachment question is now
> about a known set rather than an open one. Second, and sharper: RR-C1's
> playback-restriction toggle is written as **per-question**, which presumes a
> per-question home for the stimulus. **If this ticket lands on assignment-level
> or group-level attachment, the toggle needs a home decided here** — a reading
> passage shared by six questions cannot carry six different replay policies. Also
> useful: RR-C1 found that `QuizQuestion` (`types.ts:3023-3063`) has **no media
> field of any kind** today, so there is no existing shape to be constrained by —
> and that GuidedLearning already models per-step media
> (`types.ts:5356-5361`), which is the nearest thing to a precedent in the repo.

**Question**

Small, sharp, independent — a good warm-up ticket.

A reading passage with six questions about it wants to be assignment-level (or
attached to a _group_ of questions) so it isn't duplicated six times and doesn't
disappear when the student advances. A single image in one question wants to be
question-level. Both, and you need a grouping concept the quiz model doesn't have
today.

Also: does the stimulus stay pinned on screen while the student answers, and how
does that survive `shuffleQuestions` — a passage attached to a question group is
meaningless if shuffling scatters the group.

**Resolution:** **Follow the house pattern where it is load-bearing, depart from
it exactly where its ordering semantics stop applying.** A stimulus array lives on
`QuizData`; every question carries a pointer array of stable ids into it; the
pointer _is_ the grouping concept, so no group object is invented. The replay
policy lives on the stimulus entry, `shuffleQuestions` becomes component-aware,
and entries carry an authoring-only label.

**Findings this session** — the audit ran as a separate session and left seven
questions written to be asked verbatim. Two of them wanted verification before
being asked, and the verification changed both.

1. 🔴 **The house pinning idiom is _don't key the element_ — and the audit read
   the one keyed element exactly backwards.** Q7 rested on
   `GuidedLearningPlayer.tsx:727` (`key={currentImageUrl}`), read as a
   "make a shared asset persist" idiom. The comment four lines above says the
   opposite: video slides are _"keyed by URL so the element reloads when the
   slide changes"_ (`:722-724`). It is a **force-remount** idiom, applied to the
   branch React would otherwise reuse. The genuinely persistent element is the
   `<img>` at `:761-770`, which is **unkeyed**, with `src` swapped in place —
   and there is a **third** element the audit did not mention, a `previousImageUrl`
   crossfade layer at `:776-789`, so GL's stimulus surface is three elements, not
   one. Q7's inferred _consequence_ (a repeated URL does not remount) survives;
   its _mechanism_ was inverted, and the real house answer is **simpler** than
   the audit described. **Pinning and attachment are separable**, which is what
   let the attachment question be decided on authoring grounds alone.
2. 🔵 **The student projection is a hand-written allowlist, and the audit never
   opened it.** `toPublicQuestion` (`useQuizSession.ts:288-326`) copies exactly
   `id`, `type`, `text`, `timeLimit`, plus per-type fields — and its Matching
   branch carries an explicit comment about **withholding** a field from student
   reach (`:315-317`). **Nothing crosses into student reach by default.** So
   _where a reference is stored_ and _how it reaches a student_ are two
   decisions, not one — which is what dissolved RR-C2's wrinkle rather than
   answering it (derived item 1). It also shows `QuizSession` has **no
   parent-level content field at all**: `publicQuestions` is its only content,
   so a projected stimulus array is a new top-level field on that document.
3. 🔵 **The model states the audit's Q3 premise in its own words.**
   `QuizSession.publicQuestions`' docblock (`types.ts:3264-3269`): teachers grade
   using _"the full QuizData loaded from Drive, not from this field."_ The quiz
   being the authoritative home for content is documented, not inferred.

**Sub-decisions**

1. **A stimulus array on the parent; a pointer on the question — following VA and
   GL, but for a reason neither precedent supplies.** The precedent's own
   justification is positional (a VA question is located _in_ the video, a GL step
   _on_ the image) and a quiz stimulus has no positional relationship to its
   questions, so that justification does not transfer. What does transfer is
   cheaper and better: **the pointer is the grouping concept.** Six questions
   pointing at one entry _are_ a group — no group object, no lifecycle, no orphan
   cleanup, no `groupId` colliding with the six PLC-sync `groupId`s already in
   `types.ts`. The replay policy then has exactly one home, so the drift RR-C3 was
   really about becomes unrepresentable rather than merely discouraged. **Accepted
   cost:** the simplest case — one image, one question — pays for a parent array
   it does not need, and authoring becomes two acts where teachers expect one.
   The editor can hide that, but it now has to.
2. **A question carries a pointer _array_, not a single pointer** (Paul, against
   my recommendation). One question can show two stimuli at once — a shared
   passage and its own figure — without GL's two-fields-two-roles split. ⚠️ **Three
   costs, all accepted:** "which questions share a stimulus" stops being a clean
   partition and becomes **overlapping sets** (Q1→[a], Q2→[a,b], Q3→[b] is a graph),
   which is what forced sub-decision 5's shape; nothing caps the stack; and the
   layout lands on the 768px district Chromebook that **RR-A5 has not measured
   yet**, now with two stimuli plus an answer area rather than one.
3. **The array lives on `QuizData` — the quiz, not the assignment.** Every other
   piece of content in this model lives there, and `QuizAssignment` carries
   targeting, policy and bookkeeping with **zero** content fields; a stimulus
   there would be the first. On the quiz it travels with PLC sharing, survives
   re-assignment, and is edited once. ⚠️ **Accepted cost, and it is the sharpest
   one in this resolution:** a teacher cannot swap a passage for one class without
   editing the quiz for everyone, and the array sits inside the `pullSyncedQuiz`
   rebuild path (`useQuizAssignments.ts:1772-1843`) — **so a PLC peer's edit can
   replace a passage under a student who is mid-attempt.**
4. **The replay policy lives on the stimulus entry** — not on the question, not on
   the session. This **corrects RR-C1 sub-decision 2 in place**, which put the
   toggle per-question "mirroring `allowSkipping`" when `allowSkipping` is
   `VideoActivitySessionSettings` (`types.ts:4477-4488`) and _cannot_ be
   per-question, because `maxAllowedTime` is derived from all questions
   (`VideoPlayer.tsx:68-70`). On the entry, "plays once" is finally **coherent**:
   one entry means once per attempt, where per-question storage would give three
   questions sharing one clip three separate "onces" — a different product nobody
   chose. Session-level was rejected as too coarse: a quiz holding a re-readable
   passage _and_ a play-once listening clip has two materials with opposite
   policies, and one flag can only be wrong about one of them. ⚠️ **Accepted
   cost:** it breaks the `allowSkipping` mirror in the other direction, so a
   teacher who learned the pattern in Video Activity looks in session settings and
   does not find it; and it forecloses "same passage, restricted on question 3
   only" without a second override field.
5. **`shuffleQuestions` becomes component-aware.** Questions sharing any stimulus
   form a connected component; components shuffle against each other and questions
   shuffle within their component — the graph closure, which is what sub-decision
   2's overlapping arrays require. It costs **one pure function with one call
   site** (`utils/quizShuffle.ts:96-101`, called only at
   `QuizStudentApp.tsx:1231`), already unit-tested, over an order that is **never
   persisted** — no rules change, no server change, no migration. ⚠️ **Accepted
   cost, created by sub-decision 2:** overlapping arrays merge components, so two
   passages sharing one question produce a twelve-question block and shuffle
   silently does almost nothing — **the same failure shape as the dead VA shuffle
   toggles this ticket's own audit flagged** (§7.4). Nothing says so at authoring
   time, and that belongs to the authoring ticket.
6. **A stimulus entry carries an authoring-only label.** The teacher names each
   entry; the student sees the material bare. The teacher needs it — a question
   editor listing `image-2847.png` and `scan-3.pdf` is where mis-attached material
   comes from, and a name is the one thing `NotebookSection` (`types.ts:2869-2876`)
   added an object for. The student does not: under per-question pinned rendering
   they meet one stimulus at a time and never have to disambiguate, so a
   "Passage A" heading is a cross-reference device borrowed from paper booklets.
   ⚠️ **Accepted cost, and sub-decision 2 creates it:** exactly when a question
   stacks two stimuli, the student has two unlabeled things and no way to refer to
   either — which is precisely when a label would have earned its place.
7. **The pointer is a stable id, not an index — and this was derived, not asked,
   because the alternative is dominated.** GL uses `imageIndex`, a bare number
   into `imageUrls[]`. Under a **deletable, reorderable** array that is not merely
   fragile but silently wrong: removing entry 2 re-points every later question at
   material it was never attached to, which is a **wrong-material** bug rather
   than a missing-material one, and RR-C1 sub-decision 4's silent failure would
   not even surface it. GL gets away with an index because its array is a **slide
   sequence where order is meaning**; a quiz stimulus array is a **bag**.
   🔵 **This is the one place the resolution departs from the precedent, and it is
   exactly where the precedent's ordering semantics stop applying** — which is the
   caution the frontier recorded for this ticket, landing where it said it would.
   Recorded here rather than asked so Paul can override it, but no honest option
   set had two entries.

**What follows from the answers**

1. 🔵 **RR-C2's two-shapes wrinkle dissolves rather than being answered.** It
   worried that a stimulus reference now has two shapes — a harmless Storage path
   for gated formats, a bearer URL for public ones — and that "the pointer is the
   thing that gets duplicated," so six copies of a bearer URL would be six copies
   of a credential. Under a parent array there is **exactly one copy of every
   reference**; the pointers duplicate, the references do not. The wrinkle was an
   artifact of per-question storage and it no longer exists.
2. 🔵 **The shuffle question partly dissolved before it was asked, and the
   decision was taken on the surviving half.** The charted worry — _"a passage
   attached to a group is meaningless if shuffling scatters the group"_ — assumed
   the passage is displayed **once above a block** of questions. Under per-question
   pinned rendering each question carries its own stimulus display, so a scattered
   group costs **read-once flow**, not assessment validity. Sub-decision 5 was
   chosen on flow grounds with that stated, not on the correctness grounds the
   ticket charted. **The audit inherited the ticket's framing here even while
   refuting its other premises** — which is the failure mode RR-C2's retrospective
   named one ticket earlier.
3. **Two new type surfaces, and one of them leaves the quiz by itself.**
   `QuizData` gains the stimulus array; `QuizQuestion` gains the pointer array.
   ⚠️ Because `VideoActivityQuestion = Omit<QuizQuestion, 'type' | 'matchingDistractors'>`
   (`types.ts:4371-4374`), **the pointer array lands on Video Activity
   automatically** unless explicitly `Omit`ed — and VA already carries parent
   media of its own (`youtubeUrl`), so inheriting it silently gives a VA question
   two media concepts. **That choice has to be made in the same PR**, not deferred.
4. **The student projection needs two additions and they are not the same
   addition.** `QuizPublicQuestion` gains the pointer array, copied explicitly in
   `toPublicQuestion` — which is an allowlist, so this is a line somebody writes,
   not a field that arrives. And `QuizSession` gains a **new top-level field** for
   the projected stimulus array, because it has no parent-level content field at
   all today.
5. **The replay policy is client-advisory and cannot be otherwise.** RR-A2
   sub-decision 9 established rules cannot do per-array anything, and RR-C2 put no
   function on any path — so "plays once" is enforced by the same 250 ms poll
   RR-C1 cited (`VideoPlayer.tsx:1-12`), and a student with devtools defeats it.
   That is the status quo for the shipped lever, not a new weakness, but the
   policy now sits on _material_ rather than on a question, which makes it read
   more like a licence term than it can actually enforce.
6. ⚠️ **A stimulus can change under a student mid-attempt, and nothing on this map
   has had that property before.** Sub-decision 3 puts the array in
   `pullSyncedQuiz`'s rebuild path, and `publicQuestions` is already rebuilt
   wholesale on sync (`useQuizAssignments.ts:1840-1843`). Every other content
   decision on this map has been snapshot-at-create or append-only. **New fog
   patch**, below.
7. 🔴 **Nothing checks that a pointer resolves.** Sub-decision 7 removes the
   silent-wrong-material failure; it does not add referential integrity, and
   deliberately so — this matches `WidgetData.groupId`'s shipped posture exactly
   (no lifecycle, no orphan cleanup). A deleted entry leaves dangling pointers, and
   under RR-C1 sub-decision 4 the student sees **nothing** and **no one is told**.
   Sub-decision 1 multiplies that: one dangling pointer is one question, but one
   **failed load** is now every question pointing at that entry.
8. 🔵 **No group object, no new collection, no callable, no rules change, no
   migration, and no function on any path.** For the second C-track ticket
   running, the cheapest available option was also the one chosen — and here it
   was cheapest because a decision the app had already made twice happened to be
   right for a third reason.

**Consequence injections** — RR-C1 (correction in place), RR-C2, RR-06, RR-08,
RR-A2, RR-A5, plus three fog patches. Recorded in each.

**Amended 2026-08-09 by RR-10 — this ticket's array gets an authoring surface, and
it is not the one anybody expected.**

- 🔴 **There is no stimulus library screen. The picker _is_ the library.** _(Paul, replacing all three options RR-10 had charted.)_ Attachment is an _"attach resource"_ control on the question, opening a popover; entries accumulate as a **byproduct of attaching**, and attaching the same passage to a second question means picking it out of what is already there. **This fits sub-decision 1 better than a library screen does.** That sub-decision adopted the parent-array shape because **the pointer is the grouping concept** — and under a picker the grouping is _all_ there is: the array is never presented as an object in its own right, only as the material this quiz has attached. **The array stays exactly as decided here**; what changed is that it never surfaces as a list a teacher visits.
- ✅ **Sub-decision 6's label gets sharper, not weaker.** Its stated reason was that _"a question editor listing `image-2847.png` and `scan-3.pdf` is where mis-attached material comes from."_ That describes a list a teacher scans **while attaching** — which is precisely and only what this picker is. The label was arguably the most speculative thing on this ticket; it is now the picker's primary column.
- 🔵 **Sub-decision 7's stable id is what makes the picker's management mode safe.** RR-10 sub-decision 3 lets a row be renamed, re-policied and **deleted in place**. Under GL's `imageIndex` a delete would silently re-point every later question at material it was never attached to; under a stable id a delete leaves dangling pointers, which is the failure this ticket already chose and priced.
- 🔴 **The overlapping-set cost sub-decision 2 accepted now has a surface, and it is the one thing standing between a teacher and a silent rewrite.** Picker rows show **how many questions point at each entry**. Without it, renaming a passage from question 3 silently changes what question 7 renders. ⚠️ **One caution recorded there:** a pointer _array_ means an entry's count can exceed any partition-style notion of "its" questions — the count is a fact, not a grouping claim, and the picker must not imply otherwise.
- ✅ **The orphan question this ticket left open is answered.** An entry whose pointers all go away shows as **unused** and can be deleted from the picker. Under the rejected pick-only option it would have been unreachable, undeletable, and still consuming RR-10 fork C's storage axis.
- 🔴 **Sub-decision 5's silent no-op finally has somewhere to be said.** A component-aware shuffle degrades to nothing when stimulus pointers overlap, and this ticket recorded that with no surface able to report it. RR-10 sub-decision 5's editor advisory is now that surface — and it is the **first warn-but-permit surface in the codebase**, built partly because of this.

**Paul's notes:**

---

## D. Cross-cutting

### RR-11 — Does a documented accommodation need to be a product concept, or does it stay teacher-mediated?

**Type:** grilling (HITL) · **Status:** Closed 2026-08-27 — **ruled Out of scope** · **Blocks:** nothing · _Opened 2026-08-16 by RR-07's resolution, at Paul's direction_

**Question**

This map has now walled a student off from a response mode **three separate
times** — a microphone blocked by OU policy (RR-A4 finding 5), a camera blocked
by a district gate (RR-A3), and a device that cannot leave portrait (RR-B4
sub-decision 3). Each time the answer has been a **product mechanism**: a
degradation path, a rotate alert, and now RR-07's adjudication in the grading
queue.

**Nobody has asked whether a student with a documented accommodation needs the
product to know about it.** A 504 or IEP may say _"responses may be given
orally"_ or, in the other direction, _"the student is not required to produce
recorded speech."_ Today SpartBoard has **no student-level accommodation concept
at all** — verified 2026-08-16: zero hits for accommodation, IEP or 504 anywhere
in the codebase — so every such plan is satisfied, or not, by a teacher acting
out of band.

The question is whether that is the right answer or merely the current one:

- **Does the product need to represent an accommodation**, or is teacher-mediated-and-invisible correct? Invisible has a real argument: it keeps a protected-class attribute out of a vendor's database entirely, which is the posture RR-04 took everywhere else.
- **If it is represented, where does it live** — the roster (which would make it a ClassLink/OneRoster attribute, and RR-04 already found no vendor consumes a media-release attribute today), the org, or a per-student teacher setting?
- **Who may see it?** A teacher, plainly. A PLC peer who receives a shared quiz, plainly not — and PLC sync rebuilds content wholesale (RR-C3 sub-decision 3), which is exactly the kind of path that leaks a field nobody meant to share.
- **Does it change what a student is _offered_**, or only what a teacher is _reminded_ of? RR-07 deleted the alternate format; an accommodation that promises one would reopen sub-decision 1.
- ⚠️ **Scope check owed at the top of the session:** this may not belong to this map at all. RR-07 recommended ruling it **Out of scope** on the grounds that it concerns what a **district** owes a student rather than what the **product** does. Paul directed it be opened as its own ticket instead. **Whoever takes it should decide that first** — the honest outcome may be to close it straight into **Out of scope** with the reasoning written down, which is worth more than the fog patch it replaced.

**Resolution:** **Out of scope, decided rather than defaulted (Paul, 2026-08-27, first question of the session).** Accommodations stay **teacher-mediated and invisible** — SpartBoard gets no student-level accommodation concept. The ticket's own scope check was taken first, and the answer RR-07 recommended held on three grounds: (1) invisibility keeps a protected-class attribute (504/IEP status) out of a vendor database entirely, which is the posture RR-04 took for every other sensitive attribute on this map; (2) RR-04 already established that no roster vendor transmits a media-release or accommodation attribute over ClassLink/OneRoster today, so any in-product representation would be hand-entered by the teacher — teacher mediation with a stored copy, carrying the PLC-sync leak risk (RR-C3 sub-decision 3's wholesale rebuild path) for no capability gain; (3) the only thing a represented accommodation could _change_ — what a student is offered — is exactly what RR-07 sub-decision 1 deleted, so representation would reopen a closed decision rather than extend the design. The ticket was worth more than the fog patch it replaced precisely because this reasoning is now written down instead of assumed. **What a district owes a student under a 504/IEP is satisfied by the mechanisms the map already built for the teacher** — RR-07's grading-queue adjudication (excuse / blank / offline substitute) is mode-agnostic and serves the accommodated student the same way it serves the device-blocked one, with the teacher as the party who knows why. If a district ever asks for a stored accommodation concept, that is a fresh effort with a redrawn destination, and it should start from the roster-attribute question RR-04 left answered in the negative.

**Paul's notes:**

---

## Not yet specified

In scope, but not yet sharp enough to ticket. These graduate as the frontier
advances. _**RR-01 and RR-04 — the two tickets most of these were waiting on — are
now both closed.** Several patches below were narrowed or answered in place by
those resolutions rather than graduating whole; each says so and what survives._

⚡ **The three struck-through authoring patches below are now fully spent: RR-10
graduated them 2026-08-07 and closed 2026-08-09.** Worth keeping visible as the
only worked example on this map of fog behaving the way fog is supposed to — three
patches that each named the other two as the reason none could graduate alone,
graduating together and closing two days later.

- 🔵 **How a stimulus picker behaves once a quiz has thirty entries.** _(New 2026-08-09, RR-10 sub-decisions 2 and 3.)_ The picker is now the **only** surface for stimulus material — attach, rename, re-policy, delete, and see pointer counts — and it is a popover. Everything else in this app's library UI has organisation: quizzes have folders (`FolderSelectField`, `FolderPickerPopover`), the PLC library has folders, `global_pdfs` has a browse modal. **Stimulus entries have none — no folders, no search, no sort** — which is correct at three entries and unknown at thirty. Not ticketable yet because nothing on this map says how much material a real quiz attaches, and RR-A5 is the first thing that will produce a real one. ⚠️ It is also the second-order cost of declining a library screen: the screen would have had somewhere to put search.

- 🔴 **Whether a handed-out stimulus can ever be taken back.** _(New 2026-08-07, RR-C2.)_ Audio, video and YouTube stimuli are served from **bearer URLs with no revocation story** — a URL that leaks stays good, and removing the stimulus from the question unpublishes nothing. Image and PDF are nominally better but the gate is `request.auth != null`, which any `signInAnonymously()` caller satisfies. **This is not an oversight; it is sub-decisions 2 and 3 working as chosen**, and it is the accepted price of a design with no function on any path. What is genuinely unspecified is what happens **the first time a teacher needs it undone** — a passage attached to the wrong class, a licensed excerpt attached by mistake, a district asking for proof that something is no longer reachable. There is no answer today and no ticket, because the only mechanisms that would provide one (signed URLs with expiry, a session-keyed path, a proxy) were all rejected for good reasons in the same session. **It graduates the first time somebody asks, and the honest expectation is that somebody will.**

- 🔴 **Whether a silently-failed stimulus ever needs to become visible.** _(New 2026-08-07, RR-C1 sub-decision 4.)_ 🔵 **Widened 2026-08-07 by RR-C2.** The pattern is not new to this map and not confined to stimuli: `components/widgets/DrawingWidget/renderers/image.ts:57,116` already requests CORS-readable bytes on a `type:'domain'` `lh3` URL, already names CORS as an expected failure in its own docblock, and already paints **nothing** when it fails. So the question is not "should the C track introduce silent media failure" — it is **"how many places does this app already do it, and does any of them tell anyone?"** That is a wider and more answerable question than the one below, and it makes RR-A5's CORS check the cheapest place evidence could first appear for either. A stimulus that never loads produces a student who answers without seeing the material, and **nothing anywhere records it** — not on the response, not in the grading queue, not in the export. The decision was made deliberately and with the trade-off stated, so this is not a reopening. What is genuinely unspecified is the **downstream** question: if this happens at any real rate, the first signal will be a teacher saying _"my whole third period got that one wrong"_ with no way to tell why. There is no ticket for it because there is no evidence yet that the rate is non-zero — RR-A5's Chromebook session is the cheapest place that evidence could first appear. It graduates if it does. 🔴 **Widened again 2026-08-07 by RR-C3, and this time the magnitude changed rather than the scope.** With a stimulus attached to the parent and pointed at by many questions, **one failed load is no longer one wrong answer — it is every question pointing at that stimulus.** A six-question passage set fails as a block, silently, and lands in RR-06's grading queue as six scored wrong answers indistinguishable from six students who didn't know. **That does not reopen RR-C1 sub-decision 4**, which was taken deliberately with its trade-off stated at a per-question magnitude — but the magnitude it was accepted at is not the magnitude it now ships at, and nobody has been asked about the larger one. 🔵 RR-C3 also removed a **different** silent failure that would have compounded this: sub-decision 7 makes the pointer a stable id rather than GL's index, so a deleted entry produces a **missing** stimulus rather than a silently **wrong** one. Missing-and-silent is this patch's problem; wrong-and-silent would have been a worse one.

- **Moderation.** A student records something inappropriate, or another student's face is in frame. Who sees it first, can a teacher delete before archival, is there a report path? **RR-04 closed the second half by decision, and the answer is uncomfortable:** SpartBoard commits to having **no automated segregation capacity at all** (sub-decision 2 rules out diarization; sub-decision 3 accepts § 99.12(a)'s fallback), so "another student in frame" has no _corrective_ product remedy — only the capture policy and the access-request consequence. **RR-A3 (2026-08-06) added the one _preventive_ remedy available without a forbidden capability** — a framing check before the recorder arms, which is a mirror and a sentence rather than any form of detection. **RR-A1 strengthened it the same day** into one confirmation plus a **continuous self-view during capture**, which catches a classmate who sits down mid-assignment rather than only one who was already there at Q1. It reduces the incidence; it still does nothing about a recording that already contains a classmate. What's left here is genuinely just moderation: **who sees a recording first, and can a teacher delete before archival fires?** ⚠️ RR-03 made archival **immediate on upload**, so "delete before archival" may be a window that doesn't exist — that tension is the sharp question, and it's close to ticketable. 🔴 **RR-A2 (2026-08-06) multiplied the object the question is about.** "Can a teacher delete before archival fires" now has to answer _delete **what**_ — a question may hold several committed takes, each archived the instant it was committed, and RR-A2 deliberately kept all of them. A classmate who wandered into frame is plausibly in **some** takes and not others. **The window this patch doubts exists is not just narrow; it now closes once per take.** 🔵 **RR-05 (2026-08-06) added a second object to delete and a second clock.** A transcript is a sibling artifact in the same slot (sub-decision 7), created by a teacher press that may land days after archival — so "delete this response" now has to mean the media **and** its transcript, and the transcript can come into existence _after_ someone has already decided to delete. Small next to the takes problem, and in the same direction: the thing being deleted keeps growing after the decision to delete it. 🔵 **RR-B2 (2026-08-07) changed the shape of the object again, and in one respect made this patch easier.** A whiteboard take archives as **three files** (audio, event log, final-state PNG), so "delete this take" now means deleting a **set** — but the mode carries **no camera**, so the classmate-in-frame problem that this patch cannot solve simply does not arise here. What survives for whiteboard is only the classmate's _voice_, which is the narrower and better-understood half. **The moderation question is genuinely smaller on this mode than on video**, and that is worth saying out loud, because everything else RR-B2 touched got bigger.
- **The `/activity-wall/gallery` public-posting surface.** RR-04 found that COPPA § 312.2 treats public posting as a _disclosure_ that school consent likely doesn't reach, and no district designates audio/video as directory information. **RR-04's decision half settles the forward-looking half:** media responses reach **no public surface** — sub-decision 1 keeps names in the district's own Drive, and RR-03 gated student playback to publish-time on the results screen. What survives is a **question about already-shipped code**, not about this design: whether the existing gallery route needs revisiting on its own account. It should graduate out of this map into its own issue.
- **The district-managed "recording allowed" roster flag.** RR-04 flagged that no vendor consumes a media-release attribute over Clever/ClassLink/OneRoster today, so this would be ahead of the market. **Still not ticketed, but now for a better reason:** RR-04's consent posture is decided (notice, not consent — the district authorizes), so this flag is no longer load-bearing for compliance. It's a **district-convenience feature** now, and can wait for a district to ask.
- ~~**Storage cost at district scale.**~~ **Resolved by RR-03** — Drive is the durable home, so SpartBoard's durable storage cost is $0 and the arithmetic lives in RR-03's resolution. What survived was **transcode compute** at district scale, trivial for audio and unbounded for video — and **RR-A3 (2026-08-06) bounded the unbounded half**: sub-decision 5 caps video's resolution and bitrate rather than its duration, so transcode compute now has a ceiling per artifact instead of scaling with whatever Chrome felt like emitting. **RR-A1 (2026-08-06) supplied the numbers, so it is now measurable rather than merely bounded:** 480p / 500 kbps, **4.0 MB per 60 s take**, ~8 MB at the 120 s video maximum. Transcode compute per artifact is a known quantity; what remains unmeasured is only its unit cost on whatever runtime the next patch picks. 🔴 **RR-A2 (2026-08-06) reopened the half that had just been closed.** Per-_artifact_ cost is still bounded and still measured — but takes now **append rather than replace**, and `takeLimit` **defaults to unlimited**, so the number of artifacts per question is unbounded. **Transcode compute per assignment has no ceiling again**, by a different route than the one RR-A3 blocked: not "whatever bitrate Chrome felt like" but "however many times a student re-recorded." The per-take arithmetic is the durable part; anything multiplied by a take count is now an open number.
- **Where transcoding runs, and what it costs.** RR-A4 established that the Drive archive step must transcode (Cloud Function + ffmpeg? Google's Transcoder API?) — but only if RR-A5's manual Drive test confirms it. **RR-03 sharpened this considerably without closing it:** the archival trigger is now decided (immediate, per artifact, server-side), which makes transcode **synchronous on the upload path and user-visible** rather than a batch job — so latency is now a product constraint, not just a cost one. A 512 MiB / 120 s callable of the `archiveActivityWallPhoto` shape cannot transcode video at all, so the runtime choice (Cloud Run? Transcoder API?) is forced. ⚠️ **RR-A3 removed this patch's escape hatch** — "if video ships" is no longer a conditional, so a video-capable transcode runtime has to exist even though it will be dark in most districts. **RR-A1 then made the sizing concrete: 4.0 MB per take, ~8 MB worst case.** That is small enough that the 512 MiB / 120 s callable objection may not survive re-examination — worth re-testing rather than assuming, since a Cloud Run migration is real work to avoid if a callable can carry it. Still waiting on RR-A5. 🔵 **RR-A2 (2026-08-06) changed the throughput question without changing the sizing one.** Every committed take transcodes — RR-03 archives immediately and RR-A2 keeps all of them — so the runtime must handle **bursts on one connection from one student**, not one artifact per question. The 4.0 MB / ~8 MB per-take figures that make the 512 MiB callable worth re-testing are untouched; what is new is that the test should be _n_ takes back to back, not a single file.
- **What an org admin is shown, and agrees to, at the video gate.** _(Surfaced 2026-08-06 by RR-A3.)_ Sub-decision 1 puts video behind a district switch on the deliberate reasoning that the § 99.12(a) obligation is the district's — which only works if the district is actually told what it is taking on when it flips it. **Not ticketable yet, because its content is RR-09's**: question 4 was reframed the same day from a product blocker into exactly this guidance. Adjacent to, but distinct from, RR-04's org-admin review-and-delete console. Revisit when RR-09 returns. 🔴 **RR-05 (2026-08-06) found the premise underneath this patch is false, and then doubled the patch.** There is currently **no video gate an org admin can be shown**, because `global_permissions` is written by SpartBoard admins only (`firestore.rules:749`) — the correction is recorded in RR-A3 in place. So this patch's real content is now: **what does a district-operable gate look like, for video and for AI transcription, on the same screen?** RR-05 sub-decision 5 already specified one of the two (a consent field on the organization doc, beneath SpartBoard's availability switch), which gives this patch a shape it didn't have. **It is closer to ticketable than any other item on this list**, and it wants RR-04's admin console beside it — three separate tickets now require that screen to exist.
- **Whether a machine transcription is correctable, and by whom.** _(Surfaced 2026-08-06 by RR-05, which named it and declined it.)_ Sub-decision 7 puts a Gemini transcript of a child's speech into the district's Drive under the student's real name, retained to end of school year, with **no mechanism for the student, the teacher or a parent to amend it** — and sub-decision 1's whole justification for ASR over richer capabilities is that a teacher can verify it by listening, which presumes they can then _do_ something when it's wrong. That is a FERPA § 99.20 amendment-request surface and it belongs to no ticket. **Not sharp yet for a specific reason:** the cheapest answer may be that transcripts are simply editable by the teacher, in which case there is nothing to design and the field just needs a `provenance` value that survives editing (RR-02's injection 2). The expensive answer is a request-and-review flow. **Nobody has established which one a district would actually require** — which is a question for RR-09's counsel visit, not for this map. 🔴 **RR-06 (2026-08-07) changed this patch's premise in both directions at once.** Sub-decision 5 makes the transcript **replaceable in place** when a teacher re-pins a take — so it is no longer true that a wrong transcript is uncorrectable (re-press and it is gone), and it is newly true that a **right** transcript can vanish with no record that it existed. **The cheap answer this patch was hoping for is now half-built by accident**, which is the worst state to leave it in: a mutation path exists, nobody designed it as a correction path, and a § 99.20 amendment surface that works by accident is not one a district can be told about.
- ~~**Does the non-recorded alternative run on the same clock as the recorded one?**~~ ✅ **Dissolved 2026-08-16 by RR-07 — answered rather than graduated, and it is the only patch on this map to end that way.** It waited ten days for RR-07 to say what the alternative is. RR-07 sub-decision 1 says **there is no alternative** on the student's device: a blocked student is told and moves on, and the teacher adjudicates afterward in the grading queue. **There is no second clock to reconcile with the first.** Kept visible because the patch was right to wait — it correctly refused to guess at a comparison whose other half did not exist yet. Original text follows. _(Surfaced 2026-08-06 by RR-A1's prototype, and it currently belongs to no ticket.)_ A non-recorded alternative is **mandatory** — on RR-A4 finding 5's functional grounds since RR-A1 amended RR-04's legal reasoning. But RR-A1 owns prep time and recording limits for the _recorded_ path only, and RR-07 owns _what the alternative is_, not how long a student gets to do it. So an alternative with no clock is non-equivalent to a timed spoken response, and an alternative on the _same_ clock may be unfair in the opposite direction — typing is slower than speaking. **Sharper after RR-A1 and closer to ticketable:** the recorded path now has four distinct expiry behaviours a teacher picks per question, so "the same clock" is no longer even a single thing to match — an alternative would have to decide what `auto-start` means when there is nothing to start. Still can't be phrased finally until RR-07 says what the alternative is; revisit the moment RR-07 closes. 🔵 **RR-08 (2026-08-06) halved this patch.** It applies to the **primary mode set only** — sub-decision 4 rules out any substitute for a required _addendum_, so there is no alternative there whose clock could disagree. And sub-decision 8 settles where the recorded clock starts (on entering the addendum slot, not at question display), which gives the surviving half a fixed thing to be compared against rather than a moving one.
- ~~**What the question editor looks like once timing is authored per question.**~~ **Graduated 2026-08-07 into [RR-10](#rr-10--what-does-the-quiz-editor-become-and-what-does-it-refuse-to-let-a-teacher-build).** Surfaced by RR-A1, then fed by RR-06, RR-08, RR-A2, RR-B2 and RR-C3 — six sessions, each adding one control and each recording that the patch was not yet ticketable alone. RR-C3 supplied the input that broke that pattern (a surface **above** the question list rather than another field inside a question), and the three authoring patches graduated together.
- **Interaction with attempt limits.** _(The idle auto-submit half graduated into **RR-08** on 2026-08-04 and **closed with it on 2026-08-06** — the sweep now marks empty required slots at finalize rather than finalizing silently. What remains here is retakes vs. whole-assignment attempt limits, which needs RR-A2 first.)_ ⚠️ **RR-08 added a wrinkle worth carrying into that:** `finalizeIdleQuizAttempts` only increments `completedAttempts` when `finalAnswers.length > 0` (`:463-465`), deliberately, so a student who joined and never answered doesn't burn a slot. **RR-08 sub-decision 1 makes passed-over questions write entries** — so a student who is auto-advanced through an assignment without answering anything now has a non-empty `answers[]` and **will** consume an attempt. That may be correct, but it is a behaviour change nobody chose, and it lands in this patch rather than in RR-08. ✅ **RR-A2 (2026-08-06) closed the blocker and answered the retakes-vs-attempts half: they are separate counters that must never touch.** `takeLimit` is per-question, counts committed takes, and is enforced in RR-03's per-upload callable; `attemptLimit` is per-assignment, counts completed submissions, and is enforced in rules. 🔴 **Three findings from RR-A2's grounding audit say why keeping them apart is not merely tidy.** (1) `completedAttempts` is **decremented by teachers** on unlock (`useQuizSession.ts:1149-1180`; rules make the asymmetry explicit at `firestore.rules:3189-3198`) — it is a budget meter, not a ledger, so any "how many takes?" number built on that family of counter lies after the first unlock. (2) A new whole-assignment attempt clears `answers: []` wholesale with no archive (`useQuizSession.ts:1969-1979`), so **take history dies at the assignment boundary** regardless of what RR-A2 decided about takes within one. (3) 🔴 The **shuffle seed reads the attempt counter** (`QuizStudentApp.tsx:1205-1220`), so folding takes into it would reshuffle a student's question order when they re-record — an absurd coupling, and the sharpest argument for the separation RR-A2 chose. **What survives in this patch is only (2):** whether take history should survive a new attempt, which nobody has decided.
- ~~**Authoring guardrails against accidental complexity.**~~ **Graduated 2026-08-07 into [RR-10](#rr-10--what-does-the-quiz-editor-become-and-what-does-it-refuse-to-let-a-teacher-build)** as its fork C. Carried there in full: the storage axis RR-A2 left unbounded and reachable by default, the grading axis RR-06 priced as mild, the whiteboard wall-clock RR-B3 has yet to measure, and RR-08's completability axis — which is the one that changed the question from _"is this quiz expensive"_ to _"can every student in this class complete it."_
- **What several takes look like everywhere they are stored or shown.** _(Surfaced 2026-08-06 by RR-A2, which decided takes accumulate and explicitly declined all three of these.)_ A question may now hold many committed takes, kept deliberately and retained to end of school year. **Three surfaces inherit that and none has a shape yet.** (1) **The teacher's Drive folder** — siblings, versioned filenames, or a per-question folder? RR-03 owns the folder convention and never anticipated more than one file per question per student. (2) **RR-04's org-admin review-and-delete console**, which was scoped as a compliance precondition over responses and must now list takes and define what deleting one of six means. (3) **The results view**, which RR-A2 decided is where takes are playable — but "playable" was chosen as a posture, not designed. Not ticketable as one thing; it is the same decision landing in three places, and it wants RR-06 beside it, since grading is what makes an earlier take worth keeping open at all. 🔵 **RR-05 (2026-08-06) narrowed one of the three and added an inhabitant to another.** (3) is less open than it was: the results view is now specified as **where the transcribe button lives, on the winning take, with two distinct inline states for absent artifacts** (sub-decisions 2, 3 and 6) — so "playable" has acquired a surrounding design even though the take list itself still hasn't. (1) gains a text file to place next to the audio. 🔴 **RR-06 closed 2026-08-07 and this patch should now graduate whole — it is the most ticketable item on this list.** RR-06 supplied exactly what this patch said it was waiting for: an earlier take is worth keeping open because **a teacher may grade one** (sub-decision 4), and the results view is where they play them. Each of the three surfaces gained a specific new requirement rather than merely a reason. **(1)** must now hold audio + a transcript that is **replaced** rather than appended, so the folder convention has to survive a file being superseded. **(2)** must express deleting one of six takes _when one of them is the graded one_ — RR-06's `gradedTakeIndex` makes that a distinguishable and destructive case, where before all takes were interchangeable. **(3)** is nearly specified now: the results view holds the transcribe button, two inline absence states, a playable take list, a **pin** control, time-anchored comments and a provisional-score marker. **That is a screen, not a patch.** 🔴 **RR-B2 (2026-08-07) made surface (1) worse in exactly the dimension it was already weakest.** RR-03's folder convention was designed for one file per question per student; RR-06 made it hold a superseded transcript; **RR-B2 now makes a single take a set of three files**, so a five-take whiteboard question is fifteen Drive objects for one student on one question. Whatever naming and foldering scheme this patch eventually proposes has to survive that without a human being able to read it, and **surface (2) — the delete console — now deletes sets rather than files**, which is a different UI than the one it was scoped as.
- **What a student sees on the published-results screen once a score can be provisional and a take can be pinned.** _(Surfaced 2026-08-07 by RR-06, and it belongs to no ticket.)_ RR-03 gated student playback to the **published-results screen** and nowhere else; RR-06 sub-decision 8 then decided a partially-graded score is shown **provisionally and always marked** — explicitly including the student's published view — and sub-decision 4 lets a teacher grade a take the student did not finish on. **Nobody has designed either sentence from the student's side.** A student reading _"82%, 1 still to grade"_ is being told something true and unfamiliar, and there is no shipped precedent for a score that is honestly incomplete. Sharper still: **is a student told which take was graded?** RR-06 recorded `gradedTakeIndex` to answer a grade appeal, which is the student's interest — and an appeal a student cannot see the grounds for is not much of an interest. **Not ticketable yet** because it is entangled with RR-04's notice posture (what a student is told, and when) rather than being purely a display question. Revisit alongside the takes-everywhere patch above; both are really "what does the results screen become." 🔵 **RR-B2 (2026-08-07) put a third unfamiliar thing on that screen.** RR-03 gates student playback to the published-results view, and a whiteboard response is not a clip to play but a **replay to scrub — including the student's own erased work**. A student watching their false starts play back to them is a genuinely new experience with no precedent in this product, and it lands on the same screen as the provisional score and the pinned take.
- **What a student is doing for ten minutes with nothing on the server, and what happens when the tab dies.** _(Surfaced 2026-08-07 by RR-B2, and it belongs to no ticket.)_ RR-A1's "a lost take is lost" was decided when a take was a 60-second clip; RR-B2 set the whiteboard ceiling at **600 s** and kept the in-memory model, because that model is exactly what makes the event log cost one Firestore write instead of two hundred. **The rule earned its keep and the consequence got ten times worse at the same moment.** A tab crash, a Chromebook sleeping, or a student closing the wrong window now costs a ten-minute worked solution with nothing recoverable anywhere. RR-B2 accepted this explicitly and designed no mitigation. **Not ticketable yet because the honest options are all unattractive and none has been costed** — periodic local persistence (IndexedDB survives a tab crash but not a wipe, and it puts a child's unsubmitted work on a shared device), a mid-take checkpoint upload (which reintroduces the streaming-upload problem RR-A1 foreclosed), or simply telling the student and letting them bear it. It wants RR-A5's real-hardware behaviour beside it, since how often ChromeOS actually kills a tab under memory pressure is a measurement, not an argument.
- **The third state `isStudentView` cannot express, now that something needs it.** _(Surfaced 2026-08-07 by RR-B2, promoting a finding RR-B1 recorded as an aside.)_ RR-B1 found that `isStudentView` is a **disable** flag, not a mode flag — it early-returns from every pointer handler and hides the toolbar — and noted that it "can't express _student, interactive, no teacher context_", calling that a cross-widget concept change rather than a DrawingWidget-local one (the same pattern appears in `ConceptWeb`, `MiniApp`, `StarterPack`, `WidgetRenderer`). **That was an observation with no consumer until today.** RR-B2's armed take is precisely a student drawing interactively with no teacher context, so the third state is now required by something rather than merely absent. **Not ticketable here** — it is a refactor with a blast radius across five widgets and it should graduate into its own issue rather than into this map, which designs responses and not the widget framework. Recorded so the next person to open `WidgetRenderer` knows why. 🔵 **Amended 2026-08-07 by RR-B4, and it got _smaller_** — the one thing this flag was about to be handed is gone. Sub-decision 6 puts the teacher widget and the student response in the **same** coordinate space, so `isStudentView` never has to carry a sizing regime; `canvasSize`'s two-branch `useMemo` (`Widget.tsx:265-271`) collapses instead of forking further. The flag still conflates "no chrome," "not editable" and "not the owner's board," which is the original complaint — but this map has now stopped adding to it.
- **Which surfaces beyond quiz get these modes** — video activity, guided learning, mini-apps, activity wall. Deliberately deferred: decide it for quiz first, generalize second. 🔴 **Narrowed 2026-08-07 by RR-C3, and the deferral is no longer available for one of the four.** Video Activity does not _opt in_ to a `QuizQuestion` field; it **inherits** it — `VideoActivityQuestion = Omit<QuizQuestion, 'type' | 'matchingDistractors'>` (`types.ts:4371-4374`). So "decide it for quiz first, generalize second" cannot apply to anything added to `QuizQuestion`: the generalization happens at **compile time** unless the field is explicitly `Omit`ed, and that choice has to be made in the same PR that adds it. RR-C3's stimulus pointer array is the first field this bites on, and it bites awkwardly — **VA already carries parent-level media of its own** (`youtubeUrl`), so inheriting the pointer silently gives a VA question two media concepts that nothing reconciles.

- 🔴 **What happens when a stimulus changes under a live assignment.** _(New 2026-08-07, RR-C3 sub-decision 3.)_ Every content decision on this map so far has been **snapshot-at-create** (the assignment's freeze-live semantics) or **append-only** (takes, event logs). The stimulus array is neither: it lives on `QuizData` in Drive, which means it sits inside the `pullSyncedQuiz` rebuild path (`useQuizAssignments.ts:1772-1843`), where `publicQuestions` is already rebuilt **wholesale** on sync (`:1840-1843`). **So a PLC peer editing a shared quiz can replace a passage under a student who is mid-attempt** — not a hypothetical, a straight consequence of two shipped mechanisms meeting a new field. It is not clear this is wrong: a teacher fixing a broken PDF mid-period probably _wants_ it to propagate. What is unspecified is everything around that: whether the student's in-flight attempt re-renders or keeps what it loaded, whether a grade recorded against material that no longer exists is traceable to it, and whether anyone is told. **Not ticketable yet because nobody has established that PLC-synced quizzes are assigned live often enough to matter** — that is a usage question, not a design one. It graduates the first time a teacher reports a question whose material changed while a class was working, and it wants the takes-everywhere patch beside it, since both are really "what is stable for the duration of one attempt."
- **Server-side enforcement of recording limits.** Client-side timers are advisory; whether that matters depends on RR-A2's integrity posture. **RR-08 (2026-08-06) supplied a precedent that makes this cheaper than it looked:** sub-decision 5 has `finalizeIdleQuizAttempts` read `publicQuestions` off the session doc it already batch-reads, at **zero additional read cost** — so the server can already see per-question authored config without a new fetch. If limits ever need server-side checking, the data is in reach on a path that already runs. ✅ **RR-A2 (2026-08-06) largely answered this patch, and found the venue everyone assumed was wrong.** Sub-decision 9 established that **Firestore rules cannot enforce per-question anything** — they have no array filtering, so they cannot count entries per `questionId`, and quiz cannot even carry VA's append-only guard because `hasAll` demands prior elements byte-identical while quiz students promote their own drafts in place. **The venue is RR-03's per-upload archival callable**, which every recording commit already passes through with a stored refresh token. ⚠️ **What survives is narrower and worth naming:** the shipped client-side re-submission blocks (`QuizStudentApp.tsx:1889`, `:2017`) remain **enforced nowhere**, and RR-A2 routed around them for recordings rather than fixing them — so written responses still have advisory-only integrity, exactly as before.
- **Student-facing review-before-submit.** Partly covered by RR-A2, but the whiteboard and multi-artifact cases may need their own. **Sharpened by RR-08 (2026-08-06):** Submit now blocks on a missing required addendum _and_ on an in-flight upload, so "review before submit" is no longer only a courtesy — it is the screen a student is held on, and it has to explain **which** of two very different reasons is holding them. RR-08's teacher-side three-state view has no student-side counterpart by deliberate choice (sub-decision 7 kept the student's view binary), which means this screen carries the entire burden of telling a student what to do next. ✅ **RR-A2 (2026-08-06) settled the recording case completely, so what's left here really is only whiteboard and multi-artifact.** Pre-commit review of a take is **free by construction** — RR-A1 keeps bytes local until commit, RR-03 granted the local-blob review window, and RR-A2 counts only commits — so the recording flow is **record → review → commit or discard**, at no cost and with no budget consequence. **The one thing that flow must now also show is the take budget**, since committing is the act that spends it and a student ought to know that before pressing it rather than after. ✅ **RR-B2 (2026-08-07) closed the whiteboard half this patch was explicitly holding open, and left a new multi-artifact wrinkle in its place.** Pre-commit review is free for a whiteboard take on exactly the recording flow's terms — the log and the audio are both local until commit — so **record → review → commit or discard** carries over unchanged. 🔵 **What is new is that a whiteboard commit uploads _three_ files as one transaction** (audio, event log, final-state PNG), so RR-08's in-flight Submit block has to mean all three, and a partial failure leaves a take that exists but cannot be replayed. **"Multi-artifact" stopped being hypothetical**, and the screen that has to explain _why_ a student is being held now has a third reason to explain.
- **What the teacher's three-state monitor shows, and how it reconciles with a pair that has already drifted.** _(Surfaced 2026-08-06 by RR-08.)_ Sub-decision 7 gives the teacher **answered / started-but-incomplete / never-reached**, because "stuck on the recording" and "hasn't got there" demand opposite interventions. But it lands on top of a documented inconsistency: `QuizLiveMonitor:932` counts drafts as answered and the student gate at `QuizStudentApp.tsx:899-903` does not (audit landmine #8). **Adding a third state to an already-disagreeing pair is the shape of problem that produces a fourth.** Not ticketable alone — it is really "what does the live monitor become once responses can be partial," which wants RR-06's grading view beside it. 🔴 **RR-06 (2026-08-07) delivered that and produced the fourth state this patch predicted.** Sub-decision 8 says a partially-graded response shows a **provisional score, always marked**, in the live monitor as well as afterwards — so the monitor now carries RR-08's three completion states _and_ a scoring state (`scored` / `awaiting-grade` / `not-attempted`) on the same row, for the same student, meaning different things. **The prediction was right and the patch is now ticketable**: it is one screen holding two orthogonal three-valued axes, on top of a pair (`QuizLiveMonitor:932` vs `QuizStudentApp.tsx:899-903`) that already disagrees about the simplest one.
- ~~**Teacher authoring ergonomics.**~~ **Graduated 2026-08-07 into [RR-10](#rr-10--what-does-the-quiz-editor-become-and-what-does-it-refuse-to-let-a-teacher-build).** It was the oldest and vaguest of the three — written before RR-01 closed, and never given content of its own by any later session. Its one durable contribution is the anti-reference it named, which RR-10 carries: `CLAUDE.md`'s Canva-style overload.
- **What a teacher sees the first time a whiteboard widget opens after the page-space migration.** _(Surfaced 2026-08-07 by RR-B4, and it belongs to no ticket — it belongs to the PR.)_ Sub-decision 6 rescales every existing drawing into the 1600×1200 page. The arithmetic is sound and the source canvas is derived rather than guessed, but the outcome is still that **a teacher opens a board they made in March and the drawing has moved**. Whether that wants a one-time notice, a silent migration, or nothing at all is a product call nobody has made, and it is the only change this map produces that a current user can see without opting into anything. **This is the first user-visible consequence on the entire map** — everything else has been net-new surface.
- **Whether a hardware gate needs an accommodations answer.** _(Surfaced 2026-08-07 by RR-B4, recorded in RR-04 rather than decided.)_ Sub-decision 3 blocks portrait devices from the whiteboard outright. For most students that is an instruction to rotate their Chromebook. For a student whose device is mounted, orientation-locked, or attached to an AAC rig, it is a wall — and this map has designed device-failure paths for microphones and cameras without ever asking whether a **504/IEP-side** answer is owed for any of them. RR-07 holds the authoring-time half; the accommodations half has no home.
- 🔴 **What happens in a district that never allowlists the origin.** _(New 2026-08-16, RR-07 sub-decision 1.)_ RR-07 deleted the mandatory alternate format and put the whole design on a premise: capture is **granted**, so a failure is a rare anomaly a teacher adjudicates one at a time. **That premise is a per-district configuration, and SpartBoard is externally available now.** In a district that never adds the origin to `AudioCaptureAllowedUrls`, _every_ student on a recording question hits the anomaly path simultaneously — which is **degradation**, the case RR-07 sub-decision 2 deliberately routed **upstream** so it would never reach a student. It arrives by a route RR-A3's gate does not cover (that gate is about a district switching video _off_, not about a district never having switched capture _on_) and that RR-07's advisory does not describe (it says "if a student's device blocks the microphone," which is the wrong sentence when the answer is "all of them, always"). **Not ticketable yet for a specific reason:** nobody knows whether an un-allowlisted district is a real state or a transient one that onboarding always fixes, and **RR-A5 item 4 is the first thing that will produce evidence either way** — running it in Orono establishes how hard the ask is, which is the input this patch needs. ⚠️ It is also the second-order cost of RR-07 rejecting the two-behaviours option: that option would have covered this case, and was refused because a teacher cannot see which behaviour their students will get. **The cost of that refusal lands here.**
- **Offline / take-home use.** `/my-assignments` SSO students aren't necessarily on school wifi or a managed device.

---

## Out of scope

Ruled beyond this destination. These don't graduate; they'd need a redrawn
destination and a fresh effort.

- **[RR-11 — a student-level accommodation concept](#rr-11--does-a-documented-accommodation-need-to-be-a-product-concept-or-does-it-stay-teacher-mediated)** _(closed into this section 2026-08-27, by decision rather than default)_. Documented 504/IEP accommodations stay **teacher-mediated and invisible** — representing one in-product would put a protected-class attribute into a vendor database (against RR-04's posture), could not be roster-fed (no vendor transmits the attribute), and could only matter by reopening RR-07. What a district owes an accommodated student is served by RR-07's mode-agnostic grading-queue adjudication. Full reasoning in the ticket.
- **Automated pronunciation scoring.** The separate effort already tracked in GitHub issues, plus `scripts/spikes/retroflex-confusion/` and `scripts/spikes/stress-detection/`. It is a _consumer_ of the capture layer this map designs — this map must not accidentally decide it.
- **Student-side media editing** — trimming, filters, re-ordering clips. A different product.
- **Live synchronous peer review** of media responses. Interesting, orthogonal, and it would double the session-state surface.
- **Teacher-authored video content.** The video activity feature already covers it.
- **Hard kiosk lockdown during recording.** The written-response effort already ruled this out as brittle and easy to defeat; no reason media changes that.
- **Actually removing the anonymous-PIN path from the code.** It's deprecated by decision and this map designs for SSO-only, but ripping out `signInAnonymously`, the `anonymous-join` gate, and the PIN-derived response keys is its own migration effort with its own backward-compatibility questions. Design as if it's gone; don't schedule its removal here.
