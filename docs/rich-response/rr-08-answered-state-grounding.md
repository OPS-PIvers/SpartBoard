# RR-08 Grounding Brief — how "answered" is computed in shipped SpartBoard code

> **Provenance:** produced by a read-only exploration agent, 2026-08-06, against the
> working tree at `C:\dev\SpartBoard` (branch `dev-paul`, at commit `3383ca15`).
>
> **Verification status:** the single headline finding (landmine #1 — `submitAnswer`
> destroying `artifacts[]`) was **independently verified against the source** before
> this file was saved:
>
> - `hooks/useQuizSession.ts:2349-2357` — confirmed: `newAnswer` is a fresh object
>   literal containing only `questionId`, `answer`, `answeredAt`, `status` and an
>   optional `speedBonus`. There is no `...priorEntry` spread, and `priorEntry` is
>   in scope at that point (it is used at `:2345`). The rebuilt object replaces the
>   array element at `:2359-2362` and the whole array is written at `:2394`.
> - `firestore.rules:3470-3479` vs `:3022` — confirmed: video-activity responses
>   carry an append-only guard (`answers.size() >= resource.data.answers.size() &&
answers.hasAll(resource.data.answers)`); the quiz-response update rule is a
>   top-level `hasOnly([...])` key whitelist with **no** array-content validation.
>
> **The remaining findings below are NOT individually verified.** Treat every
> file:line as a lead to confirm during the RR-08 session, not as established fact.
>
> **This is grounding, not a resolution.** RR-08 is a HITL grilling ticket; nothing
> here decides it.
>
> ✅ **RR-08 closed 2026-08-06.** This file is kept as-written — the decisions it fed
> are in the ticket, not here. Two things a later reader should know before trusting
> it: **landmine #1 is not the one-line fix §6 implies** (a naive `...priorEntry`
> spread resurrects the prior entry's conditionally-included `speedBonus`), and
> **§5.1 understates what the sweep can reach** — `publicQuestions` lives on the
> session doc, which the sweep already batch-reads at `:252`, so it can see
> per-question authored config at zero additional read cost. That reversed one of
> the session's recommendations. See `docs/rich-response/README.md` for the full
> retrospective.

---

## 0. The one-sentence summary

Shipped code almost never asks "is `answer` non-empty?" to decide _answered_ — it asks
**"does an entry for this `questionId` exist in `answers[]`?"** That is good news for
RR-02. The emptiness checks that _do_ exist are concentrated in exactly three places:
**student submit-button gating**, **the draft-autosave safety guards**, and **display
fallbacks**. The real danger is not an emptiness check at all — it is `submitAnswer`'s
whole-object rebuild (§5.2), which will silently delete `artifacts[]`.

---

## 1. Type definitions

| What                                                                                             | Where                |
| ------------------------------------------------------------------------------------------------ | -------------------- |
| `QuizResponseAnswer`                                                                             | `types.ts:3467-3488` |
| `answer: string` + its delimiter-encoding comment                                                | `types.ts:3469-3470` |
| `isCorrect?: boolean` (never student-written; recomputed)                                        | `types.ts:3472-3478` |
| `speedBonus?: number`                                                                            | `types.ts:3480`      |
| `status?: 'draft' \| 'submitted'` (+ "missing ⇒ submitted")                                      | `types.ts:3481-3487` |
| `isAnswerSubmitted(a)` — `a.status !== 'draft'`                                                  | `types.ts:3495-3497` |
| `QuizResponseStatus = 'joined' \| 'in-progress' \| 'completed'`                                  | `types.ts:3499`      |
| `QuizResponse` (doc-per-student, key = uid or pin-derived)                                       | `types.ts:3514-3600` |
| `answers: QuizResponseAnswer[]`                                                                  | `types.ts:3568`      |
| `isWrittenQuestionType(type)` — the helper RR-01 wants everything routed through                 | `types.ts:3012`      |
| Precedent: `pointsByQuestionId` keyed by qid "so a missing entry means unanswered unambiguously" | `types.ts:365-371`   |

**Status handling.** `status` is per-answer _intent_, read in exactly one predicate
(`isAnswerSubmitted`) used by the two `alreadyAnswered` gates (§2.1) and the idle sweep
(§5.1). Response-level `status` is what every teacher-side count uses. **Neither reads
`answer` content.** Verdict: **safe under `answer: ''`.**

---

## 2. Student-facing progress, gating, and submission

### 2.1 "Already answered" gates — SAFE

- `components/quiz/QuizStudentApp.tsx:899-903` (teacher-paced) and `:1254-1258` (self-paced): `answers.some(a => a.questionId === q.id && isAnswerSubmitted(a))`.
- Presence + status only. **Would NOT break** with `answer: ''`.

### 2.2 Progress / count displays — SAFE (but semantically blunt)

- `QuizStudentApp.tsx:924` — `answeredCount={(myResponse?.answers ?? []).length}`.
- `:2968-2974` and `:3700-3703` — "N of M questions answered".
- `:3059,3070,3110-3112` — `ResultsScreen`'s `answeredCount` prop and render.

All count **array length**, so an artifact-only answer counts as answered — correct by
luck. **Would NOT break.** But none can express _partially_ answered, which is precisely
the state a required addendum creates. There is no "half-done" vocabulary in the student UI.

### 2.3 Submit gating — **THIS IS WHERE `''` BREAKS**

| Type                       | Line                  | Gate                                                           | Verdict under `answer: ''`                                                               |
| -------------------------- | --------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| MC (self-paced NEXT)       | `:2359-2362`          | `disabled={!submittableAnswer \|\| submitting}`                | **BREAKS**                                                                               |
| MC (teacher-paced Submit)  | `:2384-2386`          | `disabled={!submittableAnswer \|\| submitting}`                | **BREAKS**                                                                               |
| FIB (Enter key)            | `:2426-2432`          | `if (!trimmed) return;`                                        | **BREAKS**                                                                               |
| FIB (self-paced NEXT)      | `:2452-2457`          | `disabled={!(submittableAnswer ?? '').trim() \|\| submitting}` | **BREAKS**                                                                               |
| FIB (teacher-paced Submit) | `:2479-2482`          | same                                                           | **BREAKS**                                                                               |
| Matching / Ordering        | `:2736-2750`, `:2795` | `if (!currentAnswer) return false;` + every segment non-blank  | **BREAKS** hardest                                                                       |
| Written (self-paced NEXT)  | `:2604-2619`          | **only** `disabled={submitting}` — deliberately ungated        | **MISBEHAVES** — required addendum unenforceable without inverting a deliberate decision |
| Written (teacher-paced)    | `:2638-2649`          | `disabled={submitting \|\| submittableAnswer === null}`        | **SAFE** — already distinguishes unseeded from empty                                     |

`submittableAnswer` is defined at `:1615` (cache-only; rationale at `:1602-1614`).
**The written branch already carries the three-state distinction RR-08 needs (`null` =
untouched, `''` = deliberately empty, non-empty = typed). MC/FIB/Matching/Ordering
collapse `null` and `''` into one falsy check.** That collapse is the concrete bug.

### 2.4 Timer auto-submit — MISBEHAVES

- `:1538-1574`: on expiry writes `const answer = cached ?? selectedAnswerRef.current ?? ''` (`:1564`).
- With artifacts: writes `''` with no artifact reference and — per §5.2 — **replaces** the
  answer object, destroying any artifact already recorded. Directly relevant to RR-08's
  "one clock or two" bullet.
- Fallback UI at `:2340-2353`, `:2437-2446` already has a "timer expired with nothing"
  state, but keyed on the timer, not on emptiness.

### 2.5 Draft-autosave guards

- **`isUnsafeBlankDraft`** — `hooks/useQuizSession.ts:131-137`, called at `:2277`:
  `isDraft && answer === '' && !!priorEntry && priorEntry.answer !== ''`.
  **MISBEHAVES**: a student who types text, switches to voice, and clears the text hits
  exactly this shape — the write is silently refused, the recording lands, the stale text stays.
- **`shouldSnapshotHistory`** — `:170-187`, specifically `:179` `if (priorEntry.answer === '') return false;`.
  **MISBEHAVES**: an artifact-only answer being re-recorded gets **no** forensic snapshot.
- **`isUnsafeStatusDowngrade`** — `:150-159`. Status-only. **SAFE.**
- Client mirror: `QuizStudentApp.tsx:1644`, `:1651-1656` — shows _"Your previously-saved
  answer is still on file."_ **MISBEHAVES** for a text→recording switch.
- Tests pinning current semantics: `tests/hooks/useQuizSession.test.ts:533-570` (`:542`, `:670` use `answer: ''` fixtures).

### 2.6 My Assignments completion — SAFE

`components/student/AssignmentListItem.tsx:106,176-179,207` and
`components/student/MyAssignmentsPage.tsx:186-210` — completion is response-doc existence.

---

## 3. Teacher live/monitoring and results

### 3.1 QuizLiveMonitor — SAFE, but presence-only

- `components/widgets/QuizWidget/components/QuizLiveMonitor.tsx:919-957`; answered test at
  `:932` is `r.answers.some(a => a.questionId === currentQ.id)` — **presence only, does not
  even check `isAnswerSubmitted`**, so a draft counts as answered here. Pre-existing
  inconsistency with the student gate (§2.1).
- `:1261-1284` completion bar; `:2554-2600` per-student chip (`:2574`, `:2594` length-based) — **SAFE**.
- `:2914-2925` `MCDistribution`: `dist[ans.answer]` — **MISBEHAVES**, creates a `''` bucket
  rendered as an empty bar label on the projector.
- `:1390`, `:1862` — "Finished" KPI on `status === 'completed'`. **SAFE.**

### 3.2 QuizResults

- `QuizResults.tsx:1795-1826` — `qStats.answered++` per entry, presence-based, **SAFE**.
- `:1836-1843` — `pct = correct / answered`. **MISBEHAVES**: blank-but-present inflates the denominator.
- `:418` — `hasWrittenQuestions` inline pair-check. **BREAKS** for a new mode: the
  "Grade Written" entry point never appears for an audio-only question.
- `AnnotatedResponseView.tsx` — reads the frozen `gradingSnapshot` only (header comment at `:26`). **SAFE.**

### 3.3 WrittenResponseGrader — three problems

- `:66-70` — inline `q.type === 'short' || q.type === 'essay'`. **BREAKS** for new modes.
- `:75-82` — presence-based. **SAFE** for `answer: ''`.
- `:265-280` — **explicit empty-answer refusal**, user-visible copy: _"Cannot save
  annotations on an empty response — the student didn't answer this question."_
  **BREAKS and lies** for a voice answer. The only place in the codebase that states
  empty `answer` ⇒ didn't answer.
- `:345-346` — renders an empty box with no indication an artifact exists.

### 3.4 Classroom add-on teacher review — SAFE

`components/classroomAddon/TeacherReviewRoute.tsx:213` (a correct `isWrittenQuestionType`
call site), `:291-301`, `:473` gate on `status === 'completed'`.

---

## 4. Autograding, scoring, export

### 4.1 `gradeAnswer` — `hooks/useQuizSession.ts:389-500+`

- `:406-416` — written branch uses **inline** `short || essay`; no `manualGrade` ⇒ 0 pts.
  **BREAKS** for a new mode: an `audio` question falls through to `:418-424` and is
  string-compared against `correctAnswer`, scoring **0 / `isCorrect: false` silently
  forever** — no manual-grade path, no "needs grading" flag.
- `:418-424` — **there is no "unanswered" return value anywhere in `GradeResult`**; a blank
  and a wrong answer are indistinguishable to every consumer. This is the missing vocabulary RR-08 needs.
- `:425-500` Matching/Ordering: `''.split('|')` ⇒ `['']` ⇒ 0. No crash, no distinction.

### 4.2 Scoreboard / points

- `components/widgets/QuizWidget/utils/quizScoreboard.ts:75-79` — RR-01 site at `:79`. **BREAKS** for new modes.
- `:204-218` `canScoreResponse` — presence-based, **SAFE**. Its doc comment at `:200-202`
  already articulates the "real 0 vs missing key" distinction — the nearest existing analogue to RR-08's decision.
- `hooks/useQuizAssignments.ts:2010-2062` — uses a **spread**, so `artifacts` survives;
  `:2052-2057` presence-based. **SAFE.** RR-01 pair-check at `:2027`.

### 4.3 PLC contribution — `utils/plcContributions.ts:88-113`

`:100-101` checks `undefined` (absent), not `''`. **SAFE.** RR-01 site at `:108`.

### 4.4 Sheets export

- `utils/assignmentExportShared.ts:158-180` — `if (!ans) continue` (`:171`), `if (!grade) return ''` (`:176`).
  **MISBEHAVES**: the documented cell contract (`utils/quizDriveService.ts:816-821` —
  _"empty string → unanswered, '0' → answered incorrect"_) will report every ungraded media
  answer as **answered-and-wrong**, and the PLC re-import reads it back that way.
- `utils/quizDriveService.ts:717-756` — `answeredSet.add` at `:737` regardless of content;
  `% Correct` at `:754-757`. Same denominator inflation as §3.2.

---

## 5. Server side

### 5.1 `functions/src/finalizeIdleQuizAttempts.ts` — idle auto-submit sweep

- Queries `collectionGroup('responses')` (`:156`), skips paused/waiting (`:393-404`),
  re-reads in a transaction (`:416-421`).
- `:433-439` — **promotes drafts, does not fabricate answers**; uses a **spread**, so
  `artifacts` survives. **SAFE.**
- `:455-465` — writes `status:'completed'`, `submittedAt`, `autoSubmitted: true`.
- **RR-08's exact concern confirmed:** the sweep has **no notion of a required-but-missing
  artifact**, and none of `uploadState: 'pending' | 'failed'`. A response whose recording
  never uploaded is finalized anyway.
- This is the **only** function in `functions/src/` that touches `answers`. There is **no
  server-side completion-validity check to extend** — RR-08 would be creating that concept.

### 5.2 Firestore rules — `firestore.rules:2967-3072`

- `:3022-3023` — student updates whitelisted **by top-level key only**. **Nothing validates
  the shape of an element inside `answers[]`.** An `artifacts` sub-field needs no rule change
  to be written — and none to be deleted.
- **Quiz `answers` is NOT append-only.** Compare `firestore.rules:3470-3479` (video-activity),
  which enforces `answers.size() >= resource.data.answers.size() && answers.hasAll(resource.data.answers)`.
- `:3076-3106` — the `history/` rule pins the snapshot doc shape to
  `questionId/answer/answeredAt/status/snapshotAt`; an artifact would not be captured
  (and §2.5 shows it would not be written at all for `answer: ''`).
- `:3006-3023` is the `grading`-outside-`answers[]` precedent RR-02 cites.

---

## 6. The landmine table — ranked

| #     | Site                                                                                        | Failure under `answer: '' + artifacts[]`                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | `hooks/useQuizSession.ts:2349-2362` ✅ **VERIFIED**                                         | **Silent artifact deletion.** `submitAnswer` builds `newAnswer` as a fresh literal — no `...priorEntry` — then writes the whole array at `:2394`. `artifacts` and `isCorrect` are dropped on every subsequent write to that question: draft autosave (`:1682`), back-nav revisit, timer expiry (`:1538-1574`), visibility flush. Rules do not stop it (§5.2). Every other writer spreads; this one does not. |
| 2     | `QuizStudentApp.tsx:2362,2386,2426,2457,2482,2736`                                          | Submit/NEXT physically disabled on `''` — an artifact-only response cannot be submitted at all.                                                                                                                                                                                                                                                                                                              |
| 3     | `useQuizSession.ts:136`, `:179`                                                             | Text→media switch refused; media answers get no history/recovery snapshot.                                                                                                                                                                                                                                                                                                                                   |
| 4     | `useQuizSession.ts:406`, `types.ts:3012` + ~16 inline `short\|\|essay` sites                | A new mode falls into the auto-graded branch and scores a permanent silent 0.                                                                                                                                                                                                                                                                                                                                |
| 5     | `WrittenResponseGrader.tsx:271-279`                                                         | User-visible copy asserts "the student didn't answer this question" about a student who did.                                                                                                                                                                                                                                                                                                                 |
| 6     | `QuizResults.tsx:1836-1843`, `quizDriveService.ts:754-757`, `assignmentExportShared.ts:176` | `% correct` denominators and exported cells misreport ungraded media answers.                                                                                                                                                                                                                                                                                                                                |
| 7     | `functions/src/finalizeIdleQuizAttempts.ts:433-465`                                         | No concept of a required-but-absent artifact or a `pending`/`failed` upload; finalizes anyway.                                                                                                                                                                                                                                                                                                               |
| 8     | `QuizLiveMonitor.tsx:932` vs `QuizStudentApp.tsx:899-903`                                   | Pre-existing inconsistency: teacher counts drafts as answered, student does not. Adding a third "partially answered" state to an already-inconsistent pair is a design constraint worth naming.                                                                                                                                                                                                              |

---

## 7. Two things worth carrying into the session

1. **The written-response teacher-paced Submit button (`QuizStudentApp.tsx:2638-2649`)
   already solves the exact modeling problem RR-08 faces** — it distinguishes `null`
   (untouched) from `''` (deliberately empty) and gates only on the former. Generalizing
   that three-state distinction to the other five input types is likely the smallest
   correct fix, and it is already written down with rationale in-repo.
2. **There is no shipped concept of "partially answered" anywhere** — not in `GradeResult`,
   not in `QuizResponseAnswer`, not in the rules, not in any UI string. Whatever RR-08
   decides, it is introducing a new state, not refining an existing one.

---

## 8. The irony worth naming

RR-02 chose a sibling `artifacts[]` field partly **because it needs no Firestore rule
changes to be written**. Landmine #1 is the same property in reverse: it needs no rule
changes to be **destroyed**, and the one client writer that would destroy it is the one
the student hits most often.
