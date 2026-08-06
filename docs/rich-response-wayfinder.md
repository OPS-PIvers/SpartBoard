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

**Status:** Charted 2026-08-04 · **6 of 22 resolved** — RR-01, RR-B1, RR-A4 closed and RR-04's research half done 2026-08-04; **RR-02, RR-03 and RR-04 closed 2026-08-05**. Their resolutions opened RR-08, RR-B4, RR-A5, RR-A6, RR-09 and unblocked RR-05, RR-06, RR-08, RR-C2. **Two tracks are complete and no keystones remain** — the response model (RR-01), its serialization (RR-02) and its lifecycle (RR-03) are locked, and RR-04 locks who may hold student media, under what name, for how long, and what may never be derived from it. **The board has re-centered on a single open question: does video ship at all?** (RR-A5 → RR-A3.)

> **Correction, 2026-08-05:** RR-04's finding 3 claimed a live Gemini ToS violation. **It was wrong on both halves** — no student can reach Gemini (enforced by an email guard on every callable), and SpartBoard is on Gemini's _Paid_ Services via its Workspace account and Blaze billing, so nothing is trained on. The finding, the retraction, and the one question that genuinely survives are all recorded in place. **The "move to Vertex AI" recommendation is withdrawn.**
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

**Destination confirmed** 2026-08-04 (not a ticket, recorded here so it isn't re-litigated): the spec covers all three tracks; narrower, wider, and spec-plus-build were considered and rejected. See the ✅ note under **Destination**.

---

## Frontier

Open, unblocked, unclaimed — takeable right now:

_Rebuilt 2026-08-06 after RR-A3 closed. **No keystones remain** — every open
ticket is blocked only by other open tickets, not by a decision nobody has made._

**Takeable now:**

- 🔥 **RR-A5** — Verify format round-trip and capture policy on district hardware _(task, HITL)_ — **the highest-leverage thing on the board, and the only physical blocker left.** RR-03 put transcoding on the synchronous critical path of every upload, and RR-A3 has now committed to shipping video, which makes the transcode runtime question load-bearing rather than hypothetical. **Needs district hardware — not takeable from mobile.** Harness is committed: `docs/rich-response/rr-a5-capture-harness.html`
- 🔥 **RR-A1** — Timing model for prep time and recording limits _(prototype)_ — **the biggest mover on the board.** RR-04 killed auto-start and always-on preview by statute; RR-A3 has now added a **required framing-check step** before arming, handed it **video's resolution and bitrate ceiling** to set, and told it the clock is **mode-agnostic**. ⚠️ The committed prototype asset predates all three and needs a revision before it's reacted to
- **RR-05** — Where is the AI boundary, and what exactly is admin-gated? _(grilling)_ — RR-04 drew the hard outer line (no template extraction, ever, by contract); this decides the menu inside it. Two items are pre-killed (speaker-attributed transcripts, participation analytics), and RR-A3 adds that anything touching video now sits under **two** gates, not one
- **RR-07** — Alternate-format policy _(grilling)_ — **its stakes just went up.** RR-04 made a non-recorded alternative legally mandatory and not teacher-configurable; RR-A3 sub-decision 3 then made it the **degradation floor** when a district's video gate is off. It is now load-bearing twice over, which raises what it has to be
- **RR-08** — What counts as "answered" when a question has a required addendum? _(grilling + domain-modeling)_ — unblocked by RR-02, which made `answer: ''` a legitimate state. **Best-prepared ticket on the map**: a verified landmine and two structural findings are already on the table in `docs/rich-response/rr-08-answered-state-grounding.md`
- **RR-B2** — Is the audio synchronized to the strokes, or attached alongside? _(grilling)_ — a **three-way** fork thanks to RR-B1
- **RR-C2** — How does a student get access to a file in the teacher's Drive? _(grilling)_ — unblocked by RR-03, which handed it a working precedent: the uid- and publish-gated proxy callable is the same problem in the other direction
- **RR-C1** — Which stimulus formats are in, and are they rendered in-app or handed off? _(grilling)_
- **RR-C3** — Does a stimulus attach to a question or to an assignment? _(grilling)_ — small, sharp, independent; still the best warm-up
- **RR-09** — task: the questions only district counsel and Google can answer _(unclaimed)_ — **question 4 changed character.** It no longer decides whether SpartBoard ships video (RR-A3 shipped it, gated); it now informs **whether a given district should flip its own gate**. That makes it district guidance rather than a product blocker — lower urgency, same content

**Still blocked:** RR-06 (RR-05) · RR-B3 (RR-B2, RR-06) · RR-B4 (RR-B2) ·
RR-A6 (RR-A5 only — RR-A3 cleared) · RR-A2 (RR-A1).

**Three tracks are now complete.** RR-01 → RR-02 → RR-03 lock the response model,
its serialization and its lifecycle; RR-04 locks who may hold student media, under
what name, for how long, and what may never be derived from it; **RR-A3 closes the
A-track's scope question** — video is in, gated, quality-capped, and shaped as a
peer mode rather than a flag.

⚡ **The board's centre has moved from "does video ship?" to "what does capture
actually feel like?"** That is RR-A1, which absorbed three separate constraints
today and is now the ticket carrying the most undischarged design. RR-A5 remains
the only thing on the board that no agent can do.

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

- A required addendum means **no question type is purely auto-graded any more** — an MC question with a required spoken justification has a manual grading path. Lands in **RR-06**.
- Grading is keyed by question id today (`r.grading?.[q.id]`, `quizScoreboard.ts:79`). Two separately-pointed artifacts under one question id need a sub-key. Lands in **RR-06**.
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

**Paul's notes:**

---

### RR-03 — Where does student-submitted media live, for how long, and who owns it?

**Type:** grilling (HITL) · **Status:** ✅ **Closed 2026-08-05** · **Blocked by:** ~~RR-01, RR-02~~ (both closed) · **Blocks (now unblocked):** RR-C2

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

- ⛔ **Auto-start capture and always-on preview are dead** — not by preference but by statute. § 13.32 subd. 14(b)(1)'s instructional-purpose exception is conditioned on **advance** notice, and that exception is what makes the whole collection lawful. → **RR-A1**, which owns the timing model.
- 🔴 **"May they refuse" has to be a true statement**, which means a non-recorded alternative must actually exist. Combined with **COPPA § 312.3(d)** (no conditioning participation on more disclosure than necessary), this **decides RR-07's first bullet by law rather than by pedagogy**: a teacher may not author a mode set of one that a student cannot satisfy. → **RR-07.**

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

**Paul's notes:**

---

### RR-05 — Where is the AI boundary, and what exactly is admin-gated?

**Type:** grilling (HITL) · **Status:** Open — **unblocked 2026-08-05** · **Blocked by:** ~~RR-04~~ (closed) · **Blocks:** RR-06

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-06 — How do media responses grade, and how do they reach the gradebook?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** ~~RR-02, RR-03, RR-04~~ (all closed), RR-05

**Question**

The written-response effort built prev/next navigation, structured rubrics with
CSV import, and inline highlights + margin comments. Highlights over a _text_
span have no obvious analog over a 90-second audio clip.

- Does the rubric surface carry over unchanged, or does time-based media need timestamped comments?
- What does the grading queue look like at 30 students × 5 recordings — the honest wall-clock cost is the thing that decides whether teachers use this twice.
- Points and partial credit: does a media response participate in the existing `GradeResult` model? **Sharpened by RR-01:** a question may now carry a required, separately-pointed addendum, so one question id can own **two graded artifacts**. `GradeResult` is a flat `{ isCorrect, pointsEarned, pointsMax }` and grading is keyed by question id alone (`r.grading?.[q.id]`, `quizScoreboard.ts:79`). Decide whether that becomes a per-artifact sub-key or a composite.
- **Also from RR-01:** with a required addendum, an MC question has a manual grading path — so "auto-graded" is no longer a property of the _type_. Does the teacher get warned at authoring time that they've just made a self-grading quiz manual? Does the scoreboard still show a live score before grading is done?
- LMS passback — Classroom (`submitAssignmentToGoogleClassroomV2` analog) and LTI already exist for scores. Does anything change, or is a score just a score?

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-07 — What's the alternate-format policy when a student can't use the required mode?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-01

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-08 — What counts as "answered" when a question has a required addendum?

**Type:** grilling + domain-modeling (HITL) · **Status:** Open — **unblocked 2026-08-05** · **Blocked by:** ~~RR-02~~ (closed) · _Opened 2026-08-04 by RR-01's resolution_

**Question**

RR-01 established that a question can carry a **required, separately-pointed
addendum**. That splits a single question into two artifacts that can complete
independently, and nothing in the shipped model expects that.

- A student answers the MC and skips the required recording. Is the question answered, partially answered, or unanswered? What does the submit button do — block, warn, or allow?
- ~~`QuizResponseAnswer.status` is `'draft' | 'submitted'` on **one** answer object. Two artifacts can be in different states…~~ **Answered by RR-02:** `status` stays on the answer and keeps meaning **student intent**; each artifact carries only a separate `uploadState`. So the two artifacts can't be in different _intent_ states — the question is atomic with respect to submission. What this ticket must still decide is what intent-submit **means** when one artifact is `uploadState: 'pending'` or `'failed'`.
- 🔴 **New from RR-02, and the sharpest thing on this ticket: `answer: ''` is now a legitimate, complete response.** A pure-audio answer stores an empty `answer` string and puts everything in `artifacts[]`. Every existing check that infers "answered" from a non-empty `answer` is now wrong — including the progress indicator, the `alreadyAnswered` gate, and `isUnsafeBlankDraft` (`useQuizSession.ts:2277`), whose entire purpose is refusing to let `''` clobber a saved answer. Deciding "answered" here is therefore not just a UX call; it's a correctness fix to shipped guards.
- The scheduled idle **auto-submit sweep** finalizes stale responses. What does it do with a question whose text is done and whose required recording was never started? Submitting it silently scores a zero on an artifact the student may not have known was required.
- Does the progress indicator ("4 of 10 answered") count a half-done question?
- Does a required addendum interact with per-question `timeLimit` — one clock for both artifacts, or one each? (Overlaps RR-A1; resolve there if RR-A1 lands first.)

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-09 — Get the four answers that only the district and Google can give

**Type:** task (HITL — district counsel, records officer, and Google) · **Status:** Open · unclaimed · **Blocks:** RR-05 · _Opened 2026-08-04 by RR-04's research_

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

**Also worth doing while you're there:** an NDPA rider covering the parental-consent
representation the STANDARD omits, and adding video to Exhibit "B" (there's no
video row).

**Resolution:** _(unresolved)_

**Paul's notes:**

---

## A. Video & audio response

### RR-A1 — What's the timing model for prep time and recording limits?

**Type:** prototype (HITL) · **Status:** Open · **Blocked by:** RR-01

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

⚠️ **Consequence for the asset:** the committed prototype has no framing-check
state, no mode switch, and no notion of video at all. Reacting to it as-is will
produce a decision about a flow that RR-A3 has already changed. **Revise it before
the live session**, or run the session knowing the build is one decision stale.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-A2 — What recording controls exist, and what does a retake mean for validity?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-A1

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

**Resolution:** _(unresolved)_

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

**Paul's notes:**

---

### RR-A4 — What do district Chromebooks actually produce, and what survives to Drive?

**Type:** research (AFK) · **Status:** Open · **claimed + running 2026-08-04**

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

**6. ⚠️ Chromium bugs that directly hit this design:**

- **Chrome-recorded WebM has no duration metadata** — `<audio>`/`<video>` report `Infinity` and seek bars break ([chromium-discuss](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/cyx00_gmYh0)). **Record duration client-side and store it as metadata**; a server-side remux fixes the file. This hits RR-A1's timer UI and RR-06's scrub bar.
- **`MediaRecorder` objects are retained in memory** even when unreferenced ([issue 41423134](https://issues.chromium.org/issues/41423134)). A student answering 5 questions creates 5 recorders in one page session — explicitly null refs and remove listeners between questions.
- **`onmute` / `onunmute` / `onended` are unreliable in Chromium** — can't be used to detect a mic cut mid-recording. Poll levels instead. Combined with ChromeOS hardware kill-switches and privacy shutters (which sit _below_ the permission layer), **verify the track is actually producing signal after recording starts** rather than letting a student record 60 seconds of silence.

**7. 📊 Audio and video are not the same product — the gap is ~80×.**

Per class assignment (30 students × 5 questions = 150 recordings), 60 s each:

| Mode                                      | Per recording | Per class assignment |
| ----------------------------------------- | ------------- | -------------------- |
| Audio, Opus @ 32 kbps                     | **240 KB**    | **36 MB**            |
| Video, 720p @ 1 Mbps _(explicit)_         | 7.7 MB        | 1.16 GB              |
| Video, 720p @ 2.5 Mbps _(Chrome default)_ | 19 MB         | **2.85 GB**          |

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

**Type:** task (HITL — needs a person on district hardware and a district Chrome admin) · **Status:** Open · unclaimed · **Blocks:** RR-A3, RR-A6 · _Opened 2026-08-04 by RR-A4's resolution_

**Question**

Nothing to decide here — this is **manual work that unblocks decisions**. RR-A4
closed with two unverified facts of high consequence, and both are cheap to
settle empirically. Guessing wrong on either one costs a redesign.

**The checklist:**

1. **Does Drive actually preview Chrome-recorded webm?** (~15 minutes.) Record one video and one audio-only clip in Chrome, upload both to Drive, try to play both. Drive's documented support is VP8+Vorbis, but its real ingest transcoder may be more capable than the help page. **If it plays, the whole transcode step may be unnecessary.** Test playback as a _different_ user than the uploader, since the teacher is never the uploader.
2. **Do district Chromebooks support MP4 recording?** On the actual student device models, check `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')` and `('audio/mp4')`. Reportedly true only where a hardware H.264 encoder exists, which budget Celeron/MediaTek/ARM Chromebooks may lack. Record which models were tested.
3. **How do the ChromeOS hardware kill-switches fail?** Quick Settings mic/camera toggles and physical privacy shutters sit _below_ the browser permission layer. Find out what `getUserMedia` does when they're engaged — throw, or return a silent/black track? The second is far worse, because a student records 60 seconds of nothing.
4. **Get the origin allowlisted.** Ask the district Chrome admin to add SpartBoard's origin to `AudioCaptureAllowedUrls` / `VideoCaptureAllowedUrls` for the student OU. This removes the permission prompt entirely for a whole class. Confirm whether it's already set, and whether any student OU has capture disabled outright — that population is RR-07's forcing case.
5. **Measure real upload time** for a 60 s recording from a Chromebook on school wifi during a class period, not on an empty network.

Record the answers here; several downstream decisions are currently resting on
assumptions.

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-A6 — What's the upload strategy on the school-wifi floor?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** ~~RR-03~~ (closed), ~~RR-A3~~ (closed), RR-A5 · _Graduated from fog 2026-08-04 by RR-A4's resolution_

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

Unblocking note: this ticket now waits on **RR-A5 alone**.

**Resolution:** _(unresolved)_

**Paul's notes:**

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

**Paul's notes:**

---

### RR-B2 — Is the audio synchronized to the strokes, or just attached alongside?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-01, RR-B1 · **Blocks:** RR-B3

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-B3 — What does grading 30 whiteboard-plus-audio responses look like?

**Type:** prototype (HITL) · **Status:** Open · **Blocked by:** RR-B2, RR-06

**Question**

The B track lives or dies on the teacher's side, not the student's. Prototype the
grading surface and count the clicks and the minutes.

- Can a teacher triage at a glance — thumbnails, a grid — or is it strictly one at a time?
- If the response is a timeline (RR-B2), is scrubbing enough or is a static "final state" view needed for fast passes?
- Does the prev/next + rubric surface from the written-response work carry over intact?

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-B4 — What is a whiteboard response's canonical coordinate space and page size?

**Type:** grilling + domain-modeling (HITL) · **Status:** Open · **Blocked by:** RR-B2 · _Opened 2026-08-04 by RR-B1's resolution_

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

## C. Media connected to question (stimuli)

### RR-C1 — Which stimulus formats are in, and are they rendered in-app or handed off?

**Type:** grilling (HITL) · **Status:** Open

**Question**

You listed pdf, doc, docx, wav, mp3, mp4. They are not one problem:

- **pdf** — `components/widgets/PdfWidget/` already ships a viewer; likely reusable.
- **wav / mp3 / mp4** — native `<audio>` / `<video>`, straightforward.
- **doc / docx** — nothing in the stack renders these. Options: Drive preview iframe (needs the student to have Drive access — see RR-C2), server-side conversion, or refuse the format and tell the teacher to export a PDF. Refusing is a legitimate answer and probably the right one; make it deliberately.

Also decide: does the student get playback _controls_ on an audio/video stimulus,
or is a listening comprehension item allowed to restrict replays? That's a real
assessment-design lever, not a UI detail.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-C2 — How does a student get access to a file in the teacher's Drive?

**Type:** grilling + domain-modeling (HITL) · **Status:** Open — **unblocked 2026-08-05** · **Blocked by:** ~~RR-01, RR-03~~ (both closed)

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-C3 — Does a stimulus attach to a question or to an assignment?

**Type:** grilling (HITL) · **Status:** Open · unclaimed

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

## Not yet specified

In scope, but not yet sharp enough to ticket. These graduate as the frontier
advances. _**RR-01 and RR-04 — the two tickets most of these were waiting on — are
now both closed.** Several patches below were narrowed or answered in place by
those resolutions rather than graduating whole; each says so and what survives._

- **Moderation.** A student records something inappropriate, or another student's face is in frame. Who sees it first, can a teacher delete before archival, is there a report path? **RR-04 closed the second half by decision, and the answer is uncomfortable:** SpartBoard commits to having **no automated segregation capacity at all** (sub-decision 2 rules out diarization; sub-decision 3 accepts § 99.12(a)'s fallback), so "another student in frame" has no _corrective_ product remedy — only the capture policy and the access-request consequence. **RR-A3 (2026-08-06) added the one _preventive_ remedy available without a forbidden capability** — a framing check before the recorder arms, which is a mirror and a sentence rather than any form of detection. It reduces the incidence; it does nothing about a recording that already contains a classmate. What's left here is genuinely just moderation: **who sees a recording first, and can a teacher delete before archival fires?** ⚠️ RR-03 made archival **immediate on upload**, so "delete before archival" may be a window that doesn't exist — that tension is the sharp question, and it's close to ticketable.
- **The `/activity-wall/gallery` public-posting surface.** RR-04 found that COPPA § 312.2 treats public posting as a _disclosure_ that school consent likely doesn't reach, and no district designates audio/video as directory information. **RR-04's decision half settles the forward-looking half:** media responses reach **no public surface** — sub-decision 1 keeps names in the district's own Drive, and RR-03 gated student playback to publish-time on the results screen. What survives is a **question about already-shipped code**, not about this design: whether the existing gallery route needs revisiting on its own account. It should graduate out of this map into its own issue.
- **The district-managed "recording allowed" roster flag.** RR-04 flagged that no vendor consumes a media-release attribute over Clever/ClassLink/OneRoster today, so this would be ahead of the market. **Still not ticketed, but now for a better reason:** RR-04's consent posture is decided (notice, not consent — the district authorizes), so this flag is no longer load-bearing for compliance. It's a **district-convenience feature** now, and can wait for a district to ask.
- ~~**Storage cost at district scale.**~~ **Resolved by RR-03** — Drive is the durable home, so SpartBoard's durable storage cost is $0 and the arithmetic lives in RR-03's resolution. What survived was **transcode compute** at district scale, trivial for audio and unbounded for video — and **RR-A3 (2026-08-06) bounded the unbounded half**: sub-decision 5 caps video's resolution and bitrate rather than its duration, so transcode compute now has a ceiling per artifact instead of scaling with whatever Chrome felt like emitting. It is no longer open-ended, just unmeasured; the measurement waits on RR-A1's numbers.
- **Where transcoding runs, and what it costs.** RR-A4 established that the Drive archive step must transcode (Cloud Function + ffmpeg? Google's Transcoder API?) — but only if RR-A5's manual Drive test confirms it. **RR-03 sharpened this considerably without closing it:** the archival trigger is now decided (immediate, per artifact, server-side), which makes transcode **synchronous on the upload path and user-visible** rather than a batch job — so latency is now a product constraint, not just a cost one. A 512 MiB / 120 s callable of the `archiveActivityWallPhoto` shape cannot transcode video at all, so the runtime choice (Cloud Run? Transcoder API?) is forced. ⚠️ **RR-A3 removed this patch's escape hatch** — "if video ships" is no longer a conditional, so a video-capable transcode runtime has to exist even though it will be dark in most districts. Still waiting on RR-A5.
- **What an org admin is shown, and agrees to, at the video gate.** _(Surfaced 2026-08-06 by RR-A3.)_ Sub-decision 1 puts video behind a district switch on the deliberate reasoning that the § 99.12(a) obligation is the district's — which only works if the district is actually told what it is taking on when it flips it. **Not ticketable yet, because its content is RR-09's**: question 4 was reframed the same day from a product blocker into exactly this guidance. Adjacent to, but distinct from, RR-04's org-admin review-and-delete console. Revisit when RR-09 returns.
- **Does the non-recorded alternative run on the same clock as the recorded one?** _(Surfaced 2026-08-06 by RR-A1's prototype, and it currently belongs to no ticket.)_ RR-04 sub-decision 5 makes a non-recorded alternative **legally mandatory** — "may they refuse" has to be a true statement. But RR-A1 owns prep time and recording limits for the _recorded_ path only, and RR-07 owns _what the alternative is_, not how long a student gets to do it. So an alternative with no clock is non-equivalent to a timed spoken response, and an alternative on the _same_ clock may be unfair in the opposite direction — typing is slower than speaking. **Not ticketable yet** because it can't be phrased sharply until RR-07 says what the alternative actually is; revisit the moment RR-07 closes.
- **Interaction with attempt limits.** _(The idle auto-submit half of this patch graduated into **RR-08** on 2026-08-04; what remains here is retakes vs. whole-assignment attempt limits, which needs RR-A2 first.)_
- **Authoring guardrails against accidental complexity.** RR-01 makes a set-of-modes plus a required addendum expressible on every question. Nothing yet stops a teacher building a 10-question quiz where each question allows three modes and requires a recording. Whether the product warns, caps, or simply permits it is a real decision — waiting on RR-A1 and RR-06 to know what the costs actually are.
- **Which surfaces beyond quiz get these modes** — video activity, guided learning, mini-apps, activity wall. Deliberately deferred: decide it for quiz first, generalize second.
- **Server-side enforcement of recording limits.** Client-side timers are advisory; whether that matters depends on RR-A2's integrity posture.
- **Student-facing review-before-submit.** Partly covered by RR-A2, but the whiteboard and multi-artifact cases may need their own.
- **Teacher authoring ergonomics.** Once RR-01 settles the model, the authoring UI for "which modes are allowed here" is its own design problem, and the anti-reference is Canva-style overload.
- **Offline / take-home use.** `/my-assignments` SSO students aren't necessarily on school wifi or a managed device.

---

## Out of scope

Ruled beyond this destination. These don't graduate; they'd need a redrawn
destination and a fresh effort.

- **Automated pronunciation scoring.** The separate effort already tracked in GitHub issues, plus `scripts/spikes/retroflex-confusion/` and `scripts/spikes/stress-detection/`. It is a _consumer_ of the capture layer this map designs — this map must not accidentally decide it.
- **Student-side media editing** — trimming, filters, re-ordering clips. A different product.
- **Live synchronous peer review** of media responses. Interesting, orthogonal, and it would double the session-state surface.
- **Teacher-authored video content.** The video activity feature already covers it.
- **Hard kiosk lockdown during recording.** The written-response effort already ruled this out as brittle and easy to defeat; no reason media changes that.
- **Actually removing the anonymous-PIN path from the code.** It's deprecated by decision and this map designs for SSO-only, but ripping out `signInAnonymously`, the `anonymous-join` gate, and the PIN-derived response keys is its own migration effort with its own backward-compatibility questions. Design as if it's gone; don't schedule its removal here.
