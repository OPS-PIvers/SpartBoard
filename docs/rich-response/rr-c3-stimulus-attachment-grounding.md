# RR-C3 Grounding Brief — where a stimulus attaches, and what already answers that

> **Provenance:** read-only audit by an exploration agent, 2026-08-07, against the
> working tree at `C:\dev\SpartBoard` (branch `dev-paul`). No git state changed;
> no source file edited; this file is the only thing written.
>
> **Verification status:** the headline findings (§1 VideoActivity, §2 the mounted
> media element, §3 no grouping concept, §5 `allowSkipping`'s real level, §7 the
> answer-key divergence) were **read directly from source** by the author, not
> taken from a sub-agent summary:
>
> - `types.ts:4371-4385` + `types.ts:4387-4396` — confirmed: `youtubeUrl` is on
>   the activity; the question carries only `timestamp: number`.
> - `components/videoActivity/VideoActivityStudentApp.tsx:926-957` — confirmed:
>   the player is unconditional and unkeyed; the question is an
>   `absolute inset-0` overlay keyed by question id.
> - `components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx:719-727`
>   — confirmed: the media element is deliberately kept mounted, with a comment
>   saying why, and keyed by URL rather than by item.
> - `types.ts:5325-5331` + `types.ts:5382-5406` — confirmed: `imageIndex` on the
>   step points into `imageUrls[]` on the set.
> - `types.ts:4477-4488`, with
>   `components/videoActivity/VideoActivityStudentApp.tsx:935` and
>   `hooks/useVideoActivitySession.ts:200-204` — confirmed: `allowSkipping` is a
>   **session-level** setting, not per-question.
> - `types.ts:4558-4560` + `firestore.rules:3373` — confirmed: the VA session doc
>   stores `questions` **including `correctAnswer`** under a rule that allows any
>   authenticated caller to read.
> - `utils/quizShuffle.ts:96-101` + `components/quiz/QuizStudentApp.tsx:1217-1236`
>   — confirmed: flat seeded Fisher-Yates, one call site, order never persisted.
>
> **Marked as inference where it is inference.** Two claims below (§6's byte
> arithmetic, §2.3's "a stable URL survives reconciliation") are reasoning on top
> of read code and are labelled as such.
>
> **This is grounding, not a resolution.** RR-C3 is a HITL grilling ticket;
> nothing here decides it.

---

## 0. Headline

**The app has already shipped RR-C3 — twice — and both times it put the media on
the parent and gave the child a pointer.** Video Activity is not merely "the
closest analogue": it is literally one media object serving N questions, built by
type-level reuse of `QuizQuestion` itself
(`types.ts:4371-4374`: `Omit<QuizQuestion, 'type' | 'matchingDistractors'>`),
with the URL on the parent (`types.ts:4390`), a scalar pointer on the child
(`types.ts:4376-4377`), and the playback-restriction toggle at the **session**
level (`types.ts:4477-4488`). Guided Learning does the same with `imageUrls[]` on
the set and `imageIndex` on the step (`types.ts:5330-5331, 5387`).

**And both keep the media mounted while the student answers, by rendering the
question as an `absolute inset-0` overlay on top of it** — VA at
`VideoActivityStudentApp.tsx:940-957`, GL at `GuidedLearningPlayer.tsx:491-492`,
with GL carrying an explicit comment that the media element is "always mounted"
and deliberately not re-created (`GuidedLearningPlayer.tsx:719-724`).

The ticket's three sub-questions therefore have three different statuses. _Where
does it attach_ has an unambiguous house answer. _Does it stay pinned_ is solved,
shipped, and commented. _How does it survive `shuffleQuestions`_ is the only part
with no precedent — **because in both shipped cases the media supplies the
ordering** (`timestamp` in VA, `imageIndex` in GL), so scattering was never
possible. Shuffle is the genuinely new problem, and it is far cheaper than it
reads: the shuffle is a single-call-site pure function over an ephemeral,
never-persisted order (§4).

---

## 1. Where content lives in the quiz model — and "assignment-level" is three things

**1.1 — There is no assignment-level content field. Not one.**
`QuizAssignmentSettings` (`types.ts:3987-4030`) and `QuizAssignment`
(`types.ts:4037-4123`) carry targeting (`periodNames`, `rosterIds`, `classIds`),
policy (`attemptLimit`, `dueAt`, `sessionOptions`), and bookkeeping (`exportUrl`,
`sync`, `scoreVisibility`, `classroomAttachment`). **Zero content.** Content is
`QuizData.questions` (`types.ts:3080-3086`), and `QuizData` itself is `{ id,
title, questions, createdAt, updatedAt }` — **no parent-level media there
either.** Quiz is greenfield at both levels; nothing constrains the shape from
above.

**1.2 — So "assignment-level" is under-specified: the model has three candidate
parents, and they have different lifecycles.**

| Parent                                       | Where it lives                       | Travels with         | Mutability                                                                                                               |
| -------------------------------------------- | ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Quiz** (`QuizData`, `types.ts:3080`)       | Google Drive JSON                    | the quiz, PLC-synced | edited in the quiz editor; synced peers pull via `pullSyncedQuiz` (`useQuizAssignments.ts:1772-1843`)                    |
| **Assignment** (`types.ts:4037`)             | `/users/{uid}/quiz_assignments/{id}` | one assign event     | teacher-owned; snapshot-at-create — `QuizBehaviorSettings`' docblock calls this **"freeze-live"** (`types.ts:3184-3190`) |
| **Session** (`QuizSession`, `types.ts:3246`) | `/quiz_sessions/{id}`                | one assign event     | the only doc a student can read; `publicQuestions` is rebuilt on sync (`useQuizAssignments.ts:1840-1843`)                |

A reading passage is **content**, and every other piece of content in this model
lives on the quiz in Drive. Placing a stimulus on `QuizAssignment` would make it
the first content field on an object that has never held any — and would mean the
same passage has to be re-attached on every assign, and does not PLC-sync.

**1.3 — `publicQuestions` is a projection, not a home.** It is built by
`quiz.questions.map(toPublicQuestion)` at session create
(`useQuizAssignments.ts:747`) and rebuilt wholesale on sync (`:1776`, written at
`:1841`). Whatever is decided about attachment, the student-visible copy is
derived, and `toPublicQuestion` (`useQuizSession.ts:288-326`) is the one function
that decides what crosses into student reach.

---

## 2. The pinning question is already answered, in two shipped players

**2.1 — Video Activity: player unconditional, question overlaid, keyed by
question id.** `components/videoActivity/VideoActivityStudentApp.tsx:927-957`:

```tsx
<div className="relative aspect-video …">
  <VideoPlayer
    youtubeUrl={session?.youtubeUrl ?? ''}
    questions={sortedQuestions}
    questionVisible={activeQuestion !== null}
    allowSkipping={session?.settings?.allowSkipping ?? false}
    …
  />
  {activeQuestion && (
    <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[1px] …">
      <QuestionOverlay key={activeQuestion.id} question={activeQuestion} … />
    </div>
  )}
</div>
```

The player is rendered unconditionally and is never keyed; only the overlay is
conditional and keyed. The video is **paused, never swapped** —
`components/videoActivity/VideoPlayer.tsx:162-171` calls `player.pauseVideo()`
and fires `onQuestionTrigger`. Answering clears the overlay
(`VideoActivityStudentApp.tsx:386-397`) without touching the player instance.

**One media element, N remounted children** is a shipped pattern in this repo,
one directory over from the quiz student app.

**2.2 — Guided Learning does the same, and documents why.**
`GuidedLearningPlayer.tsx:719-724`:

> "Current image is always mounted — kept stable across image changes so React
> doesn't re-create the `<img>` node, which would invalidate refs held by
> callers/tests and force a fresh load even when the URL is unchanged."

The `question` interaction is `absolute inset-0 z-30` over that still-mounted
image (`:491-492`), and steps are filtered against the parent pointer
(`:793-794`: `if (step.imageIndex !== currentImageIndex) return null`).

**2.3 — This has a consequence the ticket does not anticipate, and it partly
dissolves the duplication argument.** GL's video branch is
`key={currentImageUrl}` (`GuidedLearningPlayer.tsx:727`) — keyed by the **asset**,
not by the item. ⚠️ **Inference, from read code:** if a stimulus is stored
per-question but six consecutive questions carry the _same_ URL, an element keyed
by URL does not remount across those six — the media does not restart, does not
re-fetch, and does not lose playback position. The house idiom for "make a shared
asset persist across items" is one `key` expression, and it is already written
down. That is worth checking in session, because it means _per-question storage_
and _pinned rendering_ are not the same decision.

**2.4 — The quiz student surface has never rendered media of any kind.** A grep
of `components/quiz/QuizStudentApp.tsx` for `<img`, `<audio`, `<video`,
`<iframe` returns **zero matches**. There is no persistent chrome above the
question today: `ActiveQuiz` is mounted once (`QuizStudentApp.tsx:906`, unkeyed)
and the question region is a single flex column
(`:2222-2300`) whose only stable elements are a progress bar (`:2214-2220`), an
index/timer/type header (`:2244-2293`), and conditional banners. `ActiveQuiz` not
being keyed means anything placed above `<h2>{currentQuestion.text}</h2>`
(`:2296-2300`) already persists across advance in student-paced mode; the
`StructuredQuestionInput` at `:2514` is the one thing deliberately keyed
(`key={currentQuestion.id}`) so it _does_ remount per question. **The mount
lifecycle the ticket asks about is already the VA shape**: a stable shell with one
keyed, remounting answer widget inside it.

---

## 3. Grouping: there is none, and there are three idioms for building one

**3.1 — No grouping concept exists anywhere in the assessment widgets.**
`QuizQuestion` (`types.ts:3023-3063`) has no `groupId`, `sectionId`, `passageId`,
or ordering metadata beyond array position. `QuizPublicQuestion`
(`types.ts:3205-3229`) likewise. `VideoActivityQuestion` and
`GuidedLearningStep` have no discrete group object. A case-insensitive repo-wide
grep for `passage|stimulus|stimuli` across `.ts`/`.tsx` returns **two hits, both
prose** in `components/widgets/BloomsTaxonomy/defaultContent.ts:81,100`. The quiz
editor is a flat dnd-kit reorder list (`QuizEditor.tsx:198`, `reorderQuestions`),
and the AI generator emits a flat `questions: GeneratedQuestion[]`
(`utils/ai.ts:281`).

**3.2 — But the repo has three shipped idioms for "N children share one parent
asset," in descending order of transferability.**

| Idiom                    | Shape                                                     | Citation                                                                                                     | Grouping is                                                                     |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **GL `imageIndex`**      | child holds a bare `number` index into the parent's array | `types.ts:5330-5331`; filtered `GuidedLearningPlayer.tsx:793-794`                                            | **implicit** — a "slide" is derived by filtering; no slide object exists        |
| **`NotebookSection`**    | `{ title, startIndex, pageCount }` over a flat array      | `types.ts:2869-2876`                                                                                         | **explicit contiguous range**, but navigation-only — no runtime/scoring meaning |
| **`WidgetData.groupId`** | siblings share an opaque uuid; auto-dissolves at <2       | `types.ts:6032-6033`; created `DashboardContext.tsx:4927-4941`, dissolved `:4724-4740`, cleared `:4946-4962` | **explicit sibling grouping** — but canvas layout, not content                  |

`WidgetData.groupId` is the only shipped `groupId`-on-a-child pattern, and it
carries a lesson worth stealing: the group is **not an object**, it is a shared
optional field, it **auto-dissolves** when membership drops below two
(`DashboardContext.tsx:4724-4730`), and ungrouping is `groupId: undefined`
(`:4957`). No lifecycle, no orphan cleanup, no referential integrity.

⚠️ **Naming collision, worth flagging now:** every other `groupId` in `types.ts`
(`:3102`, `:4127`, `:4407`, `:422`, `:492`, `:858`) is PLC cross-teacher sync
linkage into `/synced_quizzes/{groupId}`. A content-level `groupId` on
`QuizQuestion` will read as a sync field to anyone scanning the file.

---

## 4. `shuffleQuestions` — verified, and cheaper to make group-aware than it reads

**4.1 — The RR-A2 audit's line numbers are stale; its claim is correct.** The
seed is built at `components/quiz/QuizStudentApp.tsx:1217-1220` (`:1200-1216` is
comment), and the shuffle call is `:1229-1236`:

```ts
const baseShuffleSeed =
  myResponse?.studentUid ?? auth.currentUser?.uid ?? 'anonymous-student';
const attemptIndex = myResponse?.completedAttempts ?? 0;
const studentShuffleSeed = `${baseShuffleSeed}:attempt-${attemptIndex}`;
```

The full seed is `` `{uid}:attempt-{completedAttempts}:question-order` `` — the
`:question-order` suffix is appended inside `shufflePublicQuestions`
(`utils/quizShuffle.ts:100`). It is **deterministic**, not `Math.random`:
cyrb53 hash (`utils/quizShuffle.ts:21-34`) feeding mulberry32
(`:37-46`). RR-A2's coupling finding stands.

**4.2 — Four properties make group-preservation much cheaper than a distributed
change.**

1. **One call site.** `shufflePublicQuestions` is called exactly once, at
   `QuizStudentApp.tsx:1231`. Nothing else in the repo calls it (grep: import at
   `:58`, call at `:1231`, plus `utils/quizShuffle.test.ts`).
2. **Pure and already unit-tested.** `utils/quizShuffle.ts:96-101`, tests at
   `utils/quizShuffle.test.ts`.
3. **The order is never persisted.** There is no `questionOrder`, `orderSeed` or
   `shuffledOrder` field anywhere. `publicQuestions` is written in **authored
   order** (`useQuizAssignments.ts:747` is a plain `.map`); everything
   per-student is a client `useMemo`. No rules change, no server change, no
   migration.
4. **It is opt-in and self-paced-only.** `shuffleQuestions` defaults `false`
   (`useQuizAssignments.ts:763`, `utils/quizBehavior.ts:36`), and the student
   client gates it on `isStudentPaced && session.shuffleQuestions === true`
   (`QuizStudentApp.tsx:1227-1228`). The authoring toggle renders **disabled**
   outside self-paced mode with the hint "Available in self-paced mode only"
   (`components/common/library/AssignmentSettingsToggleGroup.tsx:278-300`, gate at
   `:191, 222, 285`).

**Before writing "shuffling scatters the group" into an option as a cost: the
repo has already paid for a partitioned shuffle to be a one-function change.**

**4.3 — There is a second, separate shuffle, and it is a different flag with the
opposite default.** `shuffleAnswerOptions` (`types.ts:3173`, session mirror
`:3319-3323`) defaults **ON** (`useQuizAssignments.ts:764`) and runs in all
session modes (`QuizStudentApp.tsx:1244-1249`). There are in fact **four stacked
layers**: an unseeded teacher-side option shuffle baked into `publicQuestions`
(`useQuizSession.ts:296, 311, 319` via `fisherYatesShuffle`, `:273-281`,
`Math.random`); the seeded question-order shuffle; the seeded per-question option
shuffle; and an unseeded `Math.random` bank shuffle inside
`MatchingResponseInput.tsx:41-48` (used `:227`) and
`OrderingResponseInput.tsx:38-45` (used `:246`).

**4.4 — Nothing today survives shuffling as a unit.** `seededShuffle`
(`utils/quizShuffle.ts:52-61`) is a flat Fisher-Yates over the whole array — no
partitioning, no pinned positions, no locked items.

---

## 5. The per-question toggle's home — RR-C1 mirrored the intent and inverted the level

RR-C1 sub-decision 2 puts the replay-restriction toggle **per question**,
"mirroring `allowSkipping`." `allowSkipping` is not per-question. It is
`VideoActivitySessionSettings` (`types.ts:4477-4488`):

```ts
export interface VideoActivitySessionSettings {
  autoPlay: boolean;
  requireCorrectAnswer: boolean;
  allowSkipping: boolean;
}
```

Its lifecycle is parent-level end to end: authored as a widget default
(`VideoActivityConfig.allowSkipping`, `types.ts:4451`; UI at
`components/widgets/VideoActivityWidget/Settings.tsx:90-91`; default
`config/widgetDefaults.ts:512`), frozen onto the session at create
(`hooks/useVideoActivitySession.ts:200-204`), read once by the student app
(`VideoActivityStudentApp.tsx:935`) and handed to the player as a single prop
(`VideoPlayer.tsx:35`, documented as _"Session setting: allow students to scrub
ahead"_).

**And it could not be per-question even if someone wanted it to be**, because the
enforcement is cross-question: `maxAllowedTime` is derived from _all_ questions
and their answered state (`VideoPlayer.tsx:68-70`; the player receives
`questions: VideoActivityQuestion[]` and `answeredQuestionIds`, `:23-40`). The
restriction is a property of the media's relationship to the whole item set.
**RR-C1 mirrored the product intent of `allowSkipping` while inverting its
structural level**, and RR-C1's own finding 5 recorded the correct level
("a **session setting**") before sub-decision 2 chose the other one.

---

## 6. Duplication cost — the ticket's stated reason does not survive; a different one does

**6.1 — Under RR-C1's closed format list, a passage is a file, not text.** The v1
list is image / audio / video / YouTube URL / PDF, and doc/docx are refused.
**There is no text format.** So a "reading passage" is a PDF or an image, and what
would be duplicated per question is a **URL string**, never bytes.

**6.2 — The arithmetic.** ⚠️ **Inference (sizing, not a code fact):** a Firebase
Storage download URL of the shape produced by `hooks/useStorage.ts` runs
~200–250 bytes; an `lh3.googleusercontent.com/d/{id}` Drive URL ~50 bytes. With
JSON key overhead, a stimulus reference is ~250–400 bytes. Six copies ≈ 1.5–2.5 KB
against Firestore's 1 MiB document limit — roughly 0.2%. For scale, the same doc
already carries every question's full text plus all MC choices, matching pairs and
ordering items (`QuizPublicQuestion`, `types.ts:3205-3229`). **The size objection
is rhetorical.**

**6.3 — The repo has a written precedent for exactly this reasoning, and it
concluded the same way.** `types.ts:4064-4075`, on `exportedResponseIds`:

> "each key is ~15-20 bytes … orders of magnitude under Firestore's 1MiB doc
> limit. If a PLC ever sustains tens of thousands of rows on one assignment,
> switch this to a separate subcollection."

That is the only place in the repo that reasons about the limit, and it is a
precedent for accepting duplication with a documented escape hatch.

**6.4 — The real duplication cost is drift, and nothing can enforce against
it.** Six copies of `{ url, replayPolicy }` can disagree — which is precisely
RR-C1's flagged problem ("a passage shared by six questions cannot carry six
different replay policies"). And there is **no validation surface**: the quiz
session's write rule is ownership-only, with no `hasOnly` and no shape check
(`firestore.rules:2887-2890`), and RR-A2 established (sub-decision 9) that rules
cannot do per-array-entry anything. A per-question home makes the invariant
unstateable, not merely expensive.

**6.5 — One byte cost that is real, if the stimulus ships as anything other than
a URL.** RR-02's finding that "bulk payloads are always files, which removes the
1 MB ceiling" was about student responses. It applies here too — as long as
nobody adds an inline-text stimulus later. If a text passage format is ever added,
a 1,500-word passage is ~9 KB, ×6 questions ×N passages, and 6.4's drift problem
becomes a size problem as well.

---

## 7. Things that surprised me

Asked deliberately: _has this app already solved this shape of problem somewhere
else?_

**7.1 — It solved it in Video Activity, and built it out of `QuizQuestion`
itself.** `types.ts:4371-4374`:

```ts
export type VideoActivityQuestion = Omit<
  QuizQuestion,
  'type' | 'matchingDistractors'
> & { type: VideoActivityQuestionType; timestamp: number; … };
```

Two consequences. (a) VA is not an analogy for RR-C3; it is RR-C3, shipped, with
the media on the parent and a scalar pointer on the child. (b) **A media field
added to `QuizQuestion` lands on `VideoActivityQuestion` automatically**, unless
explicitly `Omit`ed. RR-C1's "there is no existing shape to be constrained by" is
true upstream and false downstream.

**7.2 — Guided Learning ships _both_ levels, and they do different jobs.** Set
level: `imageUrls[]` + index-aligned `imageKinds[]` and `videoTrims[]`
(`types.ts:5387-5406`) — the shared stimulus everything is positioned against.
Step level: `audioUrl` / `videoUrl` (`types.ts:5353-5360`) — the interaction
payload that plays for that one hotspot. There is **no** set-level
`audioUrl`/`videoUrl`. These are not competing designs; they are separate roles,
and both survive into the student projection (`GuidedLearningPublicStep`,
`types.ts:5473-5489`). If quiz wants a passage _and_ a per-question figure, GL is
the shape to copy and it needs no invention.

**7.3 — The pinning problem is not just solved, it is _commented_.**
`GuidedLearningPlayer.tsx:719-724`. The house answer to "does the media survive
advance" is a stable, unkeyed element (or one keyed by asset URL), and someone
already wrote down why.

**7.4 — 🔴 Video Activity's shuffle toggles are dead controls.**
`VideoActivityBehaviorSettingsPanel.tsx:161-172` renders both `shuffleQuestions`
and `shuffleAnswerOptions`; `utils/videoActivityBehavior.ts:35-36` defaults them;
`utils/videoActivityBehavior.ts:91-94` renders them into the human-readable
behavior summary; `hooks/useVideoActivityAssignments.ts` writes them to both the
assignment and session docs (`:323-324, 357-358, 592-593, 686-687, 866-867`).
**There is no read site in any VA runtime component or hook.** A teacher can turn
on question shuffle for a video activity, see it confirmed in the summary string,
and nothing changes for any student. VA's only real shuffle is unconditional and
unrelated (`components/videoActivity/QuestionOverlay.tsx:36-49`).

**7.5 — 🔴 Two sibling features take opposite privacy postures on the same doc
shape.** Quiz strips the answer key through `toPublicQuestion`
(`useQuizSession.ts:288-326`) precisely because `firestore.rules:2877-2884`
documents that reads are permissive. Video Activity stores the **full** questions
on its session doc — `types.ts:4559-4560`:

```ts
/** Full questions including correctAnswer — used server-side for grading. */
questions: VideoActivityQuestion[];
```

— under the identical rule, `firestore.rules:3373`: `allow read: if
request.auth != null`, whose own comment says "Reads permissive for any authed
caller (see quiz_sessions)." **The VA answer key is readable by any authenticated
caller in the project, including any anonymous student in any other class.** This
is not created by RR-C3 and should not be decided here, but it is the exact
inverse of the trap RR-C2's §5.1 flagged, on the very feature RR-C3 will cite as
precedent. It wants its own issue.

**7.6 — VA's option shuffle is seeded on the question id alone.**
`QuestionOverlay.tsx:39` sums the char codes of the question id — no student
component — so every student in a class sees the identical option order, and
anagram ids collide. A different, weaker LCG than the quiz's cyrb53/mulberry32.

**7.7 — The quiz's own "stable across reload/back-nav" guarantee is already
false for Matching and Ordering.** `utils/quizShuffle.ts:10-12` claims it, but
`StructuredQuestionInput` is `key={currentQuestion.id}`
(`QuizStudentApp.tsx:2514`) so it remounts on every navigation — including
back-nav within one attempt — re-running the **unseeded `Math.random`** bank
shuffle at `MatchingResponseInput.tsx:227` / `OrderingResponseInput.tsx:246`.
Turning `shuffleAnswerOptions` off does not stop it.

**7.8 — The order a student actually saw is recorded nowhere.** No
`questionOrder` field exists; the shuffled order is a pure function of
`(studentUid, completedAttempts)` reproducible only in the client. Teacher-side
views index the authored order (`QuizLiveMonitor.tsx:911` reads
`quizData.questions[session.currentQuestionIndex]`).

**7.9 — Anonymous students collapse to one seed.**
`QuizStudentApp.tsx:1218` falls back to `'anonymous-student'`, so every joiner
without a resolved uid gets the identical order.

---

## 8. The ticket's own assumptions

| #   | Assumption (ticket text)                                                                                                 | Verdict                                                | Evidence                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "A reading passage … wants to be assignment-level (or attached to a _group_) so it isn't **duplicated six times**"       | **REFUTED on the stated reason**                       | Under RR-C1's format list a passage is a file; what duplicates is a ~250-byte URL, ~0.2% of the 1 MiB limit, in a doc that already carries every question's full text and options. The repo's one written precedent on this limit accepted a comparable duplication (`types.ts:4064-4075`) — §6           |
| 1b  | (the conclusion still survives, for a different reason)                                                                  | **SURVIVED, re-grounded**                              | The real cost is **drift** between six copies of `{url, replayPolicy}`, and there is no place to enforce agreement: the session write rule is ownership-only with no shape check (`firestore.rules:2887-2890`), and RR-A2 sub-decision 9 established rules cannot validate arrays — §6.4                  |
| 2   | "…and **doesn't disappear when the student advances**"                                                                   | **REFUTED**                                            | Two shipped players keep the media mounted across item advance; GL says so in a comment (`GuidedLearningPlayer.tsx:719-724`) and keys the element by **asset URL** (`:727`), not by item. VA never unmounts its player (`VideoActivityStudentApp.tsx:928-938`) — §2                                       |
| 3   | "Both, and you need a **grouping concept the quiz model doesn't have today**"                                            | **SURVIVED on the premise, NARROWED on the cost**      | No grouping concept exists in any assessment widget (§3.1). But three shipped idioms exist to build one — GL `imageIndex` (`types.ts:5330`), `NotebookSection` (`types.ts:2869-2876`), `WidgetData.groupId` (`types.ts:6032-6033`) — none of which is an object with a lifecycle — §3.2                   |
| 4   | "does the stimulus **stay pinned on screen** while the student answers"                                                  | **SURVIVED as a question, ANSWERED by precedent**      | `absolute inset-0` overlay over a still-mounted media element, in both VA (`VideoActivityStudentApp.tsx:940-957`) and GL (`GuidedLearningPlayer.tsx:491-492`). The quiz's own shell is already the same shape: `ActiveQuiz` unkeyed, one keyed answer widget inside (`QuizStudentApp.tsx:906, 2514`) — §2 |
| 5   | "how does that **survive `shuffleQuestions`** — a passage attached to a group is meaningless if shuffling scatters it"   | **SURVIVED, and it is the only genuinely new problem** | Verified: flat seeded Fisher-Yates, nothing survives as a unit (`utils/quizShuffle.ts:52-61, 96-101`). **But** one call site, pure, unit-tested, order never persisted, opt-in, self-paced-only — a partitioned shuffle is a one-function change with no rules/server/migration cost — §4                 |
| 6   | RR-C1 carry: "the per-question playback toggle **presumes a per-question home**"                                         | **REFUTED in its own precedent**                       | `allowSkipping` — the thing sub-decision 2 mirrors — is `VideoActivitySessionSettings` (`types.ts:4477-4488`), session-level end to end, and **cannot** be per-question because enforcement is cross-question (`VideoPlayer.tsx:68-70`). RR-C1's finding 5 had the level right — §5                       |
| 7   | RR-C1 carry: "`QuizQuestion` has **no media field of any kind**, so there is **no existing shape to be constrained by**" | **NARROWED**                                           | True of `QuizQuestion` (`types.ts:3023-3063`) and also of `QuizData` (`types.ts:3080-3086`) — greenfield at both levels. **But** `VideoActivityQuestion = Omit<QuizQuestion, 'type' \| 'matchingDistractors'>` (`types.ts:4371-4374`), so a field added upstream lands on VA automatically — §7.1         |
| 8   | RR-C1 carry: "GuidedLearning already models **per-step** media … the nearest precedent"                                  | **NARROWED**                                           | GL models media at **both** levels with distinct roles — set-level `imageUrls[]` as shared stimulus (`types.ts:5387`), step-level `audioUrl`/`videoUrl` as interaction payload (`types.ts:5353-5360`). And VA, not GL, is the nearer precedent for _this_ ticket's question — §7.2                        |
| 9   | "**Small, sharp, independent** — a good warm-up ticket"                                                                  | **SURVIVED on independence, NARROWED on isolation**    | The decision is small because the precedent is unambiguous. But it lands on the pending single authoring ticket (nothing in the repo groups questions in any editor — `QuizEditor.tsx:198` is a flat reorder list) and, via `Omit`, on Video Activity's question type — §10                               |

---

## 9. What remains genuinely open for a human

Each is phrased to be asked verbatim. A recommendation is offered with its
honest trade-off; **none of these is answered here.**

\*\*Q1 — Both features in this app that already serve one media object to many
questions put the media on the parent and give the child a pointer (`youtubeUrl`

- `timestamp`; `imageUrls[]` + `imageIndex`). Does a quiz stimulus follow that,
  or is the quiz the first thing to break it?\*\*
  _Recommendation:_ follow it — media on the quiz, an index or id on the question.
  _Trade-off:_ following it costs nothing to invent, makes the replay policy
  expressible exactly once, and reuses two shipped render patterns; but it means the
  _simplest_ case (one image on one question) pays for a parent array it does not
  need, and every stimulus becomes a two-step authoring act ("add the image to the
  quiz, then point this question at it") where teachers expect one.

**Q2 — Guided Learning ships media at both levels because they do different jobs:
the set image is the thing you position against, the step audio is the thing that
plays. Does a quiz need both — a passage _and_ a per-question figure — or only
one?**
_Recommendation:_ both, copied from GL, with the parent one being the only one
that carries a replay policy. _Trade-off:_ both is honest about what teachers
actually author and has a working precedent; it also doubles the authoring
surface on a ticket that CLAUDE.md's anti-reference (Canva overload) is already
watching, and it means two code paths render a stimulus instead of one.

**Q3 — If a stimulus is parent-level, _which_ parent? Content in this model lives
on the quiz in Drive (`QuizData`), which PLC-syncs and travels; the assignment
carries zero content fields and is snapshot-at-create ("freeze-live",
`types.ts:3184-3190`).**
_Recommendation:_ the quiz. _Trade-off:_ the quiz is where every other piece of
content lives and it makes the stimulus travel with PLC sharing and survive
re-assignment; but it also means a teacher cannot swap a passage for one class
without editing the quiz, and it puts the stimulus inside the `pullSyncedQuiz`
rebuild path (`useQuizAssignments.ts:1772-1843`) where a peer's edit can replace
it mid-assignment.

**Q4 — Where does RR-C1's replay-restriction toggle live, now that the thing it
mirrors turns out to be session-level and structurally cannot be per-question?**
_Recommendation:_ on the stimulus, wherever the stimulus lands — so the policy is
a property of the material, not of the question or of the session.
_Trade-off:_ it puts the toggle exactly once per asset and makes the drift problem
in §6.4 unrepresentable; but it breaks the mirror with `allowSkipping` in the
other direction (that one is genuinely session-level, so a teacher who learns the
pattern in Video Activity will look for it in the wrong place), and it forecloses
"same passage, restricted on question 3 only" without a second override field.

**Q5 — Does a group need to be a first-class object at all? The repo has three
grouping idioms and not one of them is an object: a bare index (GL), a contiguous
range (`NotebookSection`), and a shared opaque id that auto-dissolves
(`WidgetData.groupId`).**
_Recommendation:_ a bare pointer (GL's `imageIndex` shape) — no group object, no
lifecycle, no orphan cleanup. _Trade-off:_ it is the cheapest thing that works and
matches every precedent; but a group with no object has nowhere to hang a label
("Passage A: The Gettysburg Address"), which is the one thing `NotebookSection`
added an object for, and a teacher looking at question 4 of 20 has no way to see
what it belongs to.

**Q6 — Does `shuffleQuestions` have to preserve groups at all, or is the honest
answer "a teacher who authors a passage turns shuffle off"? Note that shuffle is
off by default, opt-in, and disabled outside self-paced mode.**
_Recommendation:_ make the shuffle group-aware; it is one pure function with one
call site and no persistence (§4.2). _Trade-off:_ doing it removes a footgun that
would otherwise silently produce an incoherent assessment, at a genuinely small
cost; not doing it is also defensible and free, but it means the product ships a
combination of two independently-reasonable settings that produces nonsense, and
nothing in the authoring UI would say so — which is the same failure shape as
§7.4's dead VA toggles.

**Q7 — Storing the same URL on six questions and pinning the media on screen may
be two separate decisions, not one. GL's element is keyed by asset URL
(`GuidedLearningPlayer.tsx:727`), so a repeated URL does not remount. Is
per-question storage with asset-keyed rendering on the table?**
_Recommendation:_ verify the behaviour before relying on it, then decide.
_Trade-off:_ if it holds, it collapses the pinning half of this ticket to a `key`
expression and lets attachment be decided purely on authoring ergonomics; if it is
relied on without verification, this map acquires exactly the kind of mechanism
inference it has been burned by twice.

---

## 10. Consequences for integration

Per affected ticket, what another session should inject.

**RR-C3 (this ticket)** — rewrite two of the three sub-questions. "Duplicated six
times" is a URL, not bytes, and the real cost is drift with no enforcement surface
(§6). "Doesn't disappear when the student advances" is already solved in two
shipped players with an explanatory comment (§2). What is genuinely undecided is
_which parent_ (§1.2), _whether both levels_ (§7.2), and _shuffle_ (§4) — and
shuffle is much cheaper than the ticket implies.

**RR-C1** — three injections. (a) 🔴 Sub-decision 2's precedent does not support
its level: `allowSkipping` is `VideoActivitySessionSettings`
(`types.ts:4477-4488`) and cannot be per-question because enforcement is
cross-question (`VideoPlayer.tsx:68-70`). Record the correction in place, as
RR-B4's was. (b) Finding 1's "nothing to extend" is true upstream, false
downstream: `VideoActivityQuestion = Omit<QuizQuestion, …>` (`types.ts:4371-4374`),
so any field added to `QuizQuestion` lands on Video Activity. (c) Finding 2
understates GL: it models media at **both** levels with distinct roles
(`types.ts:5387` vs `:5353-5360`), which is a better precedent than "per-step
media" for a ticket that has to choose a level.

**RR-C2** — one injection, and it removes an argument rather than adding one.
**Attachment level does not change the exposure.** RR-C2's §5.1 trap
(`publicQuestions` is readable by every authenticated caller,
`firestore.rules:2876-2884`) applies identically to an assignment-level stimulus,
because the assignment-level field would live on the **same session doc** under
the **same rule**. Nobody should reach for "put it at assignment level so it
leaks less." Separately, RR-C2's opaque-`stimulusId`-plus-callable option (its Q5)
is _cheaper_ under parent-level attachment — one resolution per assignment
instead of one per question — which is a genuine interaction between the two
tickets and cuts in favour of parent-level.

**RR-06** — one alignment note and one hazard. Sub-decision 9's **question-major**
grading queue is _already_ the right shape for a shared stimulus: a grader holds
one question for thirty responses, so a passage is stable across the batch and
loads once. No change needed. The hazard is RR-C1 sub-decision 4 (silent stimulus
failure) meeting RR-06's `state: 'scored'` — a student who never saw the passage
produces a scored wrong answer indistinguishable from not knowing, and under
parent-level attachment **one failed load poisons all six questions at once**
rather than one. That multiplies a cost RR-C1 accepted at a different magnitude.

**RR-08** — one consequence of Q3. RR-08 sub-decision 5 depends on the sweep
reading `publicQuestions` off the session doc it already batch-reads, at **zero
additional read cost**. A stimulus placed on the **session** inherits that
property; a stimulus placed on the **quiz** (Drive JSON) does not — the sweep
would need a Drive fetch it does not currently make. If anything server-side ever
needs to know a stimulus exists, Q3's answer decides whether that is free or a new
network hop. Nothing in RR-08's decided behaviour needs it today.

**RR-A2** — no change, and it is worth saying so. The shuffle seed
(`QuizStudentApp.tsx:1217-1220`) is untouched by grouping: a group-aware shuffle
partitions the array, it does not change the seed, so RR-A2's deliberate
separation of `takeLimit` from `completedAttempts` stands exactly as decided. One
small consequence to record: with groups, a retake reshuffles _group positions_
rather than individual questions, which is the intended behaviour and needs no
new field.

**RR-A5** — add a cheap fifth measurement while the device is in hand: render a
pinned PDF stimulus above a multiple-choice answer area on a district Chromebook
in landscape and record whether both fit without the student scrolling to see the
options. VA and GL both pin media in a fixed-aspect box
(`VideoActivityStudentApp.tsx:927`); a portrait-ish document in that box on a
768px-tall screen is a layout question with a real answer, and it is adjacent to
RR-C1's already-queued pdf.js paging test.

**The "teacher authoring ergonomics" / "authoring guardrails" / "question editor
once timing is authored per question" fog patches — these three should absorb one
more input and it is a new _kind_.** Every prior addition to that block was
another per-question control. A parent-level stimulus is the first thing that
needs an editor surface **above** the question list: nothing in this repo groups
questions in any editor (`QuizEditor.tsx:198` is a flat dnd-kit reorder list), and
the nearest shipped model is GL's, which is a canvas with a step list beside it
plus an `imageIndex` dropdown per step
(`GuidedLearningStepEditor.tsx:141-143`) and a slide badge in the list
(`GuidedLearningEditor.tsx:1525`). That is a different editor, not another field
in the same block — and it strengthens the case for graduating the single
authoring ticket now.

**The "which surfaces beyond quiz get these modes" fog patch** — narrowed by
`Omit`. Video Activity does not _opt in_ to a `QuizQuestion` field; it inherits it
(`types.ts:4371-4374`). "Decide it for quiz first, generalize second" is not
available for anything added to `QuizQuestion` — the generalization happens at
compile time unless it is explicitly `Omit`ed, and that choice has to be made in
the same PR.

**Scheduled work / issues (not this map)** — three items, all found in passing.
(a) 🔴 §7.5: `video_activity_sessions` stores the full answer key
(`types.ts:4559-4560`) under `allow read: if request.auth != null`
(`firestore.rules:3373`), where quiz deliberately strips it. (b) 🔴 §7.4: Video
Activity's `shuffleQuestions` / `shuffleAnswerOptions` are authored, persisted,
and summarized with **no read site** — dead controls a teacher can toggle. (c)
§7.7: the Matching/Ordering banks re-randomize with `Math.random` on back-nav,
defeating the seeded-stability guarantee `utils/quizShuffle.ts:10-12` documents
and ignoring `shuffleAnswerOptions` entirely.
