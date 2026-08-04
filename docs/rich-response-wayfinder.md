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

**Status:** Charted 2026-08-04 · 0 of 17 tickets resolved
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

> ⚠️ **First thing to confirm.** This destination is my read of your brief, not
> something you've agreed to. If the real destination is narrower ("just ship
> audio response") or wider ("rethink what an assignment is"), say so before
> anyone works a ticket — the destination fixes the scope, so a wrong one
> mis-shapes all 17.

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

| Thing                                                             | Where                                                                                                                                                                                                           | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student media upload already works**                            | `storage.rules` → `activity_wall_photos/{sessionId}/{fileName}`                                                                                                                                                 | Students get `create`-only (the rule is `request.auth != null`, written for the anonymous era — under SSO-only it can tighten to a `studentRole` + `classIds` check). 10 MB cap, contentType allowlist, existence-check on the parent session doc to stop DoS uploads to guessed ids. Teacher archives to Drive, then deletes the temp Firebase copy. **This is the persistence precedent** — RR-03 is largely "does this pattern generalize from photos to A/V?" |
| **Quizzes live in the teacher's Drive**                           | `QuizMetadata.driveFileId`, `hooks/useGoogleDrive.ts`                                                                                                                                                           | Firestore holds metadata + responses only. Drive folders today: `Backgrounds`, `Drawings`. Student names/PII live _exclusively_ in Drive.                                                                                                                                                                                                                                                                                                                         |
| **A response answer is a `string`**                               | `QuizResponseAnswer.answer` in `types.ts:3467`                                                                                                                                                                  | Every existing mode (MC / FIB / Matching / Ordering / short / essay) serializes to one string field. Media responses break this. RR-02 is the fork.                                                                                                                                                                                                                                                                                                               |
| **Students are SSO + pseudonymous uid**                           | `functions/src/studentIdentity.ts` (`studentLoginV1`, `computeStudentUid`), `context/StudentAuthContext.tsx`                                                                                                    | Sign-in is `/student/login` → GIS → custom token. Email/name/sub/sourcedId **never persisted**; the Auth record gets no email/displayName/photoURL; uid is an HMAC of the OneRoster sourcedId; claims are `{ studentRole, orgId, classIds }`. Names resolve teacher-side via `getPseudonymsForAssignmentV1`. **A recording is identifying content regardless of a pseudonymous key** — that's RR-04.                                                              |
| **⚠️ The anonymous-PIN path is deprecated but still in the code** | `signInAnonymously` in ~40 files; `anonymous-join` is `defaultAccessLevel: 'public'` / `defaultEnabled: true` (`config/featureDefaults.ts:187`); `QUIZ_SSO_REDIRECT_ENABLED = false` (`config/constants.ts:16`) | **Deprecated by decision (Paul, 2026-08-04), not yet by code.** Design for SSO-only. An agent reading the repo cold will find PIN-derived response keys in the `QuizResponse` docblock, `tests/rules/quizPinCollision.test.ts`, and a live public `anonymous-join` gate — treat all of it as legacy, and don't let a ticket resolve toward preserving it.                                                                                                         |
| **Draft autosave + integrity toggles already shipped**            | `QuizResponseAnswer.status: 'draft' \| 'submitted'`, `BaseSessionOptions.tabWarningsEnabled` / `blockCopyPaste`                                                                                                 | The written-response effort already built pause/resume and soft secure-assessment posture. Timed recording should extend this, not re-invent it.                                                                                                                                                                                                                                                                                                                  |
| **Per-question time limits exist**                                | `QuizQuestion.timeLimit` (0 = none)                                                                                                                                                                             | RR-A1's prep-time / recording-limit model has a field to extend rather than a greenfield.                                                                                                                                                                                                                                                                                                                                                                         |
| **MediaRecorder is used in exactly two places**                   | `hooks/useScreenRecord.ts`, `components/widgets/GuidedLearning/components/ScreenCaptureModal.tsx`                                                                                                               | Teacher-side only. No student-side capture exists yet.                                                                                                                                                                                                                                                                                                                                                                                                            |
| **The whiteboard substrate probably already exists**              | `components/widgets/DrawingWidget/` — `useDrawingCanvas`, `useDrawingObjectsDoc`, `commands.ts` (command stack), `exportCanvas.ts`, `useDrawingPages`                                                           | An object model _and_ a command stack. RR-B1 is whether it can cross into the student app. Note `DrawingWidget` is one of only two widgets with `skipScaling: false`.                                                                                                                                                                                                                                                                                             |
| **AI gating pattern is established**                              | `functions/src/aiGeneration.ts` → `transcribeVideoWithGemini`; `global_permissions/video-activity-audio-transcription`; `config/featureDefaults.ts`                                                             | Admin-gated via a `global_permissions` doc checked **server-side in the callable**, with its own daily usage counter so costs are controlled independently. `ai-file-context` shows the `defaultMinTier: 'org'` pattern for gating Google-API features away from the free tier. RR-05 should follow this, not invent a new mechanism.                                                                                                                             |
| **A PDF viewer already ships**                                    | `components/widgets/PdfWidget/`                                                                                                                                                                                 | Relevant to RR-C1's format list.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Standing preferences for this effort

- **Plan, don't build.** No implementation on this map.
- Prefer extending shipped patterns (activity wall storage, Drive-as-source-of-truth, `global_permissions` server-side checks) over new mechanisms. Where a ticket concludes "new mechanism," say why the existing one failed.
- Accessibility and student-privacy consequences are first-class ticket content, not a review-stage afterthought.
- Assume district Chromebooks and flaky wifi as the floor, not a MacBook on fiber.

---

## Decisions so far

_Nothing resolved yet — the map was charted 2026-08-04 and hand-resolves nothing._

<!-- One line per closed ticket: - [RR-NN Title](#rr-nn-title) — gist of the answer -->

---

## Frontier

Open, unblocked, unclaimed — takeable right now:

- **RR-01** — Is a response mode a question type or a per-question capability? _(grilling)_
- **RR-04** — What's the privacy and consent posture for student voice and video? _(research → grilling)_
- **RR-B1** — Can `DrawingWidget` be the student whiteboard substrate? _(research, AFK)_
- **RR-A4** — What do district Chromebooks actually produce, and what survives to Drive? _(research, AFK)_
- **RR-C3** — Does a stimulus attach to a question or to an assignment? _(grilling)_

The three research tickets are AFK — they can run in parallel with anything else,
and unlike the rest they don't consume the one-ticket-per-session budget. I did
**not** fire them as subagents, because you asked for a doc to review first.

---

## Tickets

### RR-01 — Is a response mode a question type or a per-question capability?

**Type:** grilling (HITL) · **Status:** Open · unclaimed · **Blocks:** RR-02, RR-03, RR-A3, RR-B2, RR-C2, RR-07

**Question**

You framed this yourself: "these question types (or perhaps these are features
that can be toggled on by teachers)". That fork is the foundational modeling
decision and almost everything downstream hangs on it.

- **As types:** `QuizQuestionType` gains `'audio' | 'video' | 'whiteboard'`. Clean grading semantics, clean authoring UI, but combinatorial — "essay _plus_ a whiteboard" needs a fourth type, and the union grows every time you add a modality.
- **As capabilities:** a question keeps its type and gains an _allowed response modes_ set. "Answer in writing, or by voice, or both" becomes expressible, and student choice-of-modality becomes possible — which is a genuine accessibility win (see RR-07). Costs: grading and `correctAnswer` semantics get murkier, and the authoring UI has to make the combinations legible without becoming the Canva-style overload the design principles rule out.

Note the existing type union already carries a helper (`isWrittenQuestionType`)
that branches grading on type — whichever way this goes, that pattern is the
thing being extended or replaced.

**Resolution:** _(unresolved)_

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

**Type:** research (AFK) → grilling (HITL) · **Status:** Open · unclaimed · **Blocks:** RR-05, RR-06

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
- Points and partial credit: does a media response participate in the existing `GradeResult` model?
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

- Is an alternate mode always available, teacher-configurable, or student-elected? (This interacts directly with RR-01: the _capabilities_ fork makes "answer by voice **or** in writing" natural; the _types_ fork makes it awkward.)
- If a student elects the alternate, does the teacher see that they did?
- Does a no-microphone / denied-permission device get a graceful path, or a dead end?

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-A4 — What do district Chromebooks actually produce, and what survives to Drive?

**Type:** research (AFK) · **Status:** Open · unclaimed

**Question**

Purely factual, resolvable without you, and it constrains RR-02 / RR-03 / RR-06.

- What container/codec does `MediaRecorder` produce on a managed Chromebook, on Safari/iPad, and on Firefox? (The known trap: webm/opus is fine in Chrome and not universally playable elsewhere.)
- Does Google Drive preview that format in-browser, or does the teacher have to download every submission? If they have to download, the grading flow in RR-06 is already in trouble.
- Does Google Classroom attachment preview handle it?
- What does `hooks/useScreenRecord.ts` already do about this, and can it be shared?
- Practical upload sizes for 30 s / 60 s / 120 s of audio and of 720p video.

**Resolution:** _(unresolved)_

**Paul's notes:**

---

## B. Whiteboard & audio

### RR-B1 — Can `DrawingWidget` be the student whiteboard substrate?

**Type:** research (AFK, local codebase) · **Status:** Open · unclaimed · **Blocks:** RR-B2

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

**Resolution:** _(unresolved)_

**Paul's notes:**

---

### RR-B2 — Is the audio synchronized to the strokes, or just attached alongside?

**Type:** grilling (HITL) · **Status:** Open · **Blocked by:** RR-01, RR-B1 · **Blocks:** RR-B3

**Question**

The pivotal fork in the whole B track, and the scope difference is large.

- **Attached:** a static whiteboard image plus a separate audio file. Cheap, composes from parts that mostly exist.
- **Synchronized:** a timeline the teacher can scrub, watching the work appear as the student narrates it. This is what "show your work" actually means pedagogically — the _order_ a student solved it in is the diagnostic information, and a finished image throws that away.

RR-B1 tells you what the command stack already retains, which may make the
expensive option much cheaper than it looks. Also decide what gets archived to
Drive: a replayable document is not a file a teacher can open outside SpartBoard,
which collides with the Drive-as-source-of-truth model in RR-03.

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
- **Flaky-wifi upload behavior.** A 20 MB upload from a Chromebook on school wifi during a class-wide submit. Resumable uploads, retry, what the student sees, whether a failed upload loses the take.
- **Storage cost at district scale.** Waiting on RR-03's retention answer before the arithmetic means anything.
- **Interaction with attempt limits and the idle auto-submit sweep.** The scheduled Cloud Function finalizes stale responses; a half-recorded answer is a new case for it.
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
