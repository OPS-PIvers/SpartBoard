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

**Status:** Charted 2026-08-04 · **3 of 21 tickets resolved** — RR-01, RR-B1, RR-A4 closed 2026-08-04; their resolutions opened RR-08, RR-B4, RR-A5, RR-A6. RR-04's research half is running.
**Related efforts:** pronunciation quiz question type (tracked in GitHub issues),
[`docs/multilingual-pronunciation-engine-spec.md`](multilingual-pronunciation-engine-spec.md),
[`docs/written-response-quiz-questions.md`](written-response-quiz-questions.md)

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

**Destination confirmed** 2026-08-04 (not a ticket, recorded here so it isn't re-litigated): the spec covers all three tracks; narrower, wider, and spec-plus-build were considered and rejected. See the ✅ note under **Destination**.

---

## Frontier

Open, unblocked, unclaimed — takeable right now:

_Rebuilt 2026-08-04 after RR-01, RR-B1 and RR-A4 closed._

**Takeable now:**

- **RR-02** — How does a media response serialize into a `QuizResponseAnswer`? _(grilling + domain-modeling)_ — **the natural next one**; RR-03, RR-06 and RR-08 all wait on it, and it's the last thing standing between this map and the whole persistence track
- **RR-A5** — Verify format round-trip and capture policy on district hardware _(task, HITL)_ — **cheap and unblocks real assumptions**; ~15 min of the Drive test settles whether transcoding is needed at all
- **RR-B2** — Is the audio synchronized to the strokes, or attached alongside? _(grilling)_ — now a **three-way** fork thanks to RR-B1
- **RR-07** — Alternate-format policy _(grilling)_ — now also covers addendum modes, and RR-A4 made it a functional requirement, not only an accessibility one
- **RR-A1** — Timing model for prep time and recording limits _(prototype)_
- **RR-A3** — Video as a separate mode, or one mode with a camera toggle? _(grilling)_ — RR-A4 supplied the ~80× cost gap this turns on
- **RR-C1** — Which stimulus formats are in, and are they rendered in-app or handed off? _(grilling)_
- **RR-C3** — Does a stimulus attach to a question or to an assignment? _(grilling)_ — small, sharp, independent; still the best warm-up

**In flight:**

- **RR-04** — privacy/consent posture. **Research half running as an AFK subagent**; the decision half needs Paul and is what RR-05 and RR-06 wait on.

**Still blocked:** RR-03 (RR-02) · RR-05 (RR-04) · RR-06 (RR-02/03/04/05) ·
RR-08 (RR-02) · RR-B3 (RR-B2, RR-06) · RR-B4 (RR-B2) · RR-A6 (RR-03, RR-A3, RR-A5) ·
RR-C2 (RR-03).

**RR-02 is the keystone.** Four tickets are blocked on it alone, and it's the only
open ticket blocking the entire persistence and grading half of the map.

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

**Paul's notes:**

---

### RR-02 — How does a media response serialize into a `QuizResponseAnswer`?

**Type:** grilling + domain-modeling (HITL) · **Status:** Open · **Blocked by:** RR-01 · **Blocks:** RR-03, RR-06

**Question**

`QuizResponseAnswer.answer` is a single `string` and every shipped mode encodes
into it (`"term1:def1|term2:def2"` and friends). A media response has a storage
path, a duration, a MIME type, possibly a transcript, possibly a retake count —
and for whiteboard+audio, possibly two artifacts plus a stroke timeline.

Decide: overload `answer` with an encoded reference, or add a sibling field, or
make `answer` a discriminated union. Consider that `QuizResponse.answers` is an
**array on a single Firestore document** — 30 students × N questions × media
metadata has a 1 MB doc ceiling to respect. Also decide what a `'draft'` status
means for a recording that was started but never finished.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-03 — Where does student-submitted media live, for how long, and who owns it?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-01, RR-02 · **Blocks:** RR-C2, RR-06

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-04 — What's the privacy and consent posture for student voice and video?

**Type:** research (AFK) → grilling (HITL) · **Status:** Open · **research half claimed + running 2026-08-04**; decision half still needs Paul · **Blocks:** RR-05, RR-06

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

The research half is AFK and can start immediately. The decision half needs you.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-05 — Where is the AI boundary, and what exactly is admin-gated?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-04 · **Blocks:** RR-06

**Question**

You said "how it could potentially get connected to AI (admin gated) and all
that." Blocked by RR-04 deliberately — you can't decide what to send a vendor
before deciding what may leave the district.

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-06 — How do media responses grade, and how do they reach the gradebook?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-02, RR-03, RR-04, RR-05

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

- Is there a floor at all — must `['audio']` always be wideneable, or may a teacher legitimately author a set of one and exclude a student who can't speak? (A speaking assessment arguably _must_ be able to require speech, or it isn't measuring speech.)
- If a student elects the alternate, does the teacher see that they did?
- Does a no-microphone / denied-permission device get a graceful path, or a dead end? **RR-A4 turned this from hypothetical into certain:** districts routinely park students in restricted Chrome OUs with mic/camera disabled by policy, and ChromeOS hardware kill-switches sit below the browser permission layer. **A subset of any class may have capture hard-blocked through no fault of the teacher or the student** — so an alternate path is a functional requirement, not only an accessibility one.
- **New from RR-01:** the addendum can be **required**, so it needs its own answer here. A required spoken justification on an MC question excludes the same students a required spoken _primary_ does — and it's easier for a teacher to add without noticing, because the question still looks like multiple choice.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-08 — What counts as "answered" when a question has a required addendum?

**Type:** grilling + domain-modeling (HITL) · **Status:** Open · **Blocked by:** RR-02 · _Opened 2026-08-04 by RR-01's resolution_

**Question**

RR-01 established that a question can carry a **required, separately-pointed
addendum**. That splits a single question into two artifacts that can complete
independently, and nothing in the shipped model expects that.

- A student answers the MC and skips the required recording. Is the question answered, partially answered, or unanswered? What does the submit button do — block, warn, or allow?
- `QuizResponseAnswer.status` is `'draft' | 'submitted'` on **one** answer object. Two artifacts can be in different states (text submitted, recording still draft). Does status move to the artifact, or does the question hold a composite state? This is why the ticket is blocked by RR-02 — it can't be answered before the serialization is decided.
- The scheduled idle **auto-submit sweep** finalizes stale responses. What does it do with a question whose text is done and whose required recording was never started? Submitting it silently scores a zero on an artifact the student may not have known was required.
- Does the progress indicator ("4 of 10 answered") count a half-done question?
- Does a required addendum interact with per-question `timeLimit` — one clock for both artifacts, or one each? (Overlaps RR-A1; resolve there if RR-A1 lands first.)

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

- What does the student see in the last 5 seconds of prep? Is there an "I'm ready, start now" escape, or is auto-start the only path?
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
- Can a student review a take before committing it, and does reviewing count as using it?

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-A3 — Is video a separate mode from audio, or one mode with a camera toggle?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-01

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

**Resolution:** _(unresolved)_

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-A6 — What's the upload strategy on the school-wifi floor?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-03, RR-A3, RR-A5 · _Graduated from fog 2026-08-04 by RR-A4's resolution_

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

**Type:** grilling + domain-modeling (HITL) · **Status:** Open · **Blocked by:** RR-01, RR-03

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
advances — most are waiting on RR-01 and RR-04.

- **Moderation.** A student records something inappropriate, or another student's face is in frame. Who sees it first, can a teacher delete before archival, is there a report path? Probably becomes two or three tickets once RR-04 lands.
- **Storage cost at district scale.** Waiting on RR-03's retention answer before the arithmetic means anything — though RR-A4 supplied the per-assignment inputs (36 MB audio vs 2.85 GB video per class assignment).
- **Where transcoding runs, and what it costs.** RR-A4 established that the Drive archive step must transcode (Cloud Function + ffmpeg? Google's Transcoder API?) — but only if RR-A5's manual Drive test confirms it. Not sharp until then, and the cost/latency shape depends on RR-03's archival trigger.
- **Duration metadata.** Chrome-recorded webm reports `Infinity` duration. RR-A4's advice is to record duration client-side and store it as metadata, but where that lives depends on RR-02's serialization.
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
