# Quiz Translation for Multilingual Learners — Implementation Plan

**Status:** Spec locked 2026-09-11 via grilling session with Paul. **Revised 2026-09-11 after a code-verification review** — §4 was rewritten (the original index-alignment design did not survive the student client), §4.3's FIB gate is now resolved, and four new decisions (D15–D18) were added. Ready to implement.
**Scope:** Quizzes only, **SSO-assigned quizzes only** (D15). Video activities / guided learning / mini-apps are explicitly out of v1, but the payload shape and the `StudentOverride` field are designed to generalize to them without a rewrite.
**Prerequisite:** Read §4 in full before writing any code. The session-doc projection is security-critical, and the client-side transforms in §4.3 are where a naive implementation mis-grades a child.
**Line numbers verified** against `dev-paul` at `b49b336` on 2026-09-11. `types.ts` moves constantly — re-verify before relying on any citation.

## 1. Feature summary

A student's **language** becomes a per-student accommodation, exactly like extended time, read-aloud, or hidden answer choices. A teacher (or an EL coordinator) sets a student's language once on the roster; from then on every quiz that student is assigned renders in that language, with a per-question toggle back to English.

Teachers generate translations with AI from a new **Languages** tab in the quiz editor, review and correct them, and mark them reviewed. Nothing unreviewed is ever served to a student.

**Why the accommodation framing and not a student-facing language picker:** it makes the feature auditable (an IEP/504 accommodation that is recorded and honored), it reuses machinery that already exists end-to-end, and it means the teacher — not the 6th grader — decides.

**Nearest precedent: read-aloud.** `docs/plans/QUIZ_READ_ALOUD.md` shipped the same shape of feature — a per-student `StudentOverride` flag, a review-then-serve gate, an admin per-language config, teacher-billed AI quota, and a monthly org cap. Read it before starting. §5, §7 and §13 below extend its surfaces rather than building parallel ones, and §4.5 handles the two accommodations landing on the same student.

## 2. Locked decisions

| #   | Decision                           | Choice                                                                                                  |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | Who picks the language             | Per-student accommodation on `StudentOverride`, with a standing default on the roster                   |
| D2  | Storage                            | Sidecar per language: **separate Drive file per language**, index in `QuizMetadata`                     |
| D3  | Target languages                   | **Admin-curated per-district list** (not limited to the 4 app UI locales), sharing read-aloud's surface |
| D4  | Review gate                        | **Review-then-publish.** Unreviewed translations are never served                                       |
| D5  | Missing translation at assign time | **Warn + one-click generate** in the assign flow; teacher may proceed anyway (student gets English)     |
| D6  | Student display                    | Translated by default, **per-question toggle to English**                                               |
| D7  | Answer side                        | Translate the answer content too; **grade in English space** (see §4.4)                                 |
| D8  | Staleness                          | **Per-question content hash**; editing one question marks only that question stale in each language     |
| D9  | What gets translated               | Question content, quiz title + directions, rubric criteria/descriptors                                  |
| D10 | Stimuli                            | **Warning only in v1.** No vision/OCR. Labels are never translated (see §3.4)                           |
| D11 | Review surface                     | New **Languages** tab in `QuizEditorModal`, quiz owner reviews                                          |
| D12 | Generation                         | New `translateQuiz` Cloud Function; quota metered **per quiz × language**, one Gemini call per language |
| D13 | Admin gate                         | Language list + feature toggle + **monthly org quota cap**, on the read-aloud admin surface             |
| D14 | Free-response grading              | Student's native text **plus AI back-translation**; generated **teacher-side, lazily** (§6)             |

### 2.1 Added by the 2026-09-11 code review

| #   | Decision                      | Choice                                                                                                                                                                   |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D15 | Who can receive a translation | **SSO students only.** Overrides ride pointer docs, which code+PIN joiners never get. A live PIN-joined quiz is English for everyone. Stated in the UI, not just the doc |
| D16 | Where translations live       | **On `QuizPublicQuestion` itself** (`localized`), not in a parallel session-level map — so they survive the client transforms in §4.3                                    |
| D17 | Source language               | v1 requires the quiz's `QuizData.language` to be English or absent. Generate is disabled otherwise                                                                       |
| D18 | Response language             | Stamped on `QuizResponseAnswer.locale` at submit. Drives FIB routing (§4.4), back-translation (§6), and the grader/annotator views                                       |

## 3. Data model

### 3.1 `StudentOverride` gains a language (`types.ts:4992`)

```ts
export interface StudentOverride {
  timeMultiplier?: 1.5 | 2 | 'unlimited';
  questionIds?: string[];
  hiddenOptionIdsByQuestion?: Record<string, string[]>;
  rubricOverrideByQuestion?: Record<string, RubricSnapshot | 'points'>;
  tabWarningThreshold?: number | 'off';
  readAloud?: boolean;
  openAt?: number;
  closeAt?: number;
  /** BCP-47 code, e.g. 'so', 'hmn', 'es'. Absent = English. Must appear in the org's curated list. */
  language?: string;
}
```

This one field rides every existing path for free:

- `ClassRoster.defaultOverridesByStudentId` (`types.ts:195`) — the standing accommodation, set once per student.
- `AssignStudentPicker.tsx:128` already reads that default and applies it when the student is targeted.
- `QuizAssignment.overridesBySourcedId` / `overridesByStudentUid` (`types.ts:5196`, `:5200`).
- `setAssignmentTargetsV1` (`functions/src/studentAssignmentTargets.ts:1220`) already fans overrides out to `/student_assignments/{uid}/items/{id}`.
- `StudentAssignmentPointer.override` (`types.ts:5018`) already delivers it to the student client.

Add a `language` chip to `summarizeOverride` (`utils/studentOverrideSummary.ts`) so it shows in the collapsed row like every other accommodation.

**⚠️ Two structural differences from every existing override.**

1. **It is the first _additive_ override.** All current overrides are _subtractive_ — hide a question, hide a choice, stretch a timer — and need no extra published content. Language requires **content that must already exist and be published**. `StudentOverride` is documented as _"Never stored on session docs"_ and that stays true: the override carries only the language _code_; the translated _payload_ travels on the session doc (§4). D5 exists precisely because these two can get out of sync.

2. **It only reaches SSO students (D15).** `QuizStudentApp.tsx:567` resolves the pointer doc only when `isStudentRole` is true, and the comment there is explicit: _"Only SSO (`studentRole`) students can be individually targeted (spec §6 non-goal for PIN/anon joiners)."_ Anonymous code+PIN joiners have no pointer doc, therefore no `language`, therefore no translation — including on the live bell-ringer flow §10 is written around. This is a real v1 limitation, it matches read-aloud's Q10, and it must be surfaced in the Languages tab and the assign advisory, not just recorded here.

### 3.2 Translation payload

```ts
/** One question's translated strings. Positionally aligned with the English question. */
export interface QuestionTranslation {
  text: string;
  /**
   * MC: translated choices, index-aligned with the projection's pre-shuffle
   * array `[correctAnswer, ...incorrectAnswers.filter(Boolean)]`.
   */
  choices?: string[];
  /** Matching: index-aligned with the parsed pairs of `correctAnswer`. */
  matchingLeft?: string[];
  matchingRight?: string[];
  /** Matching: index-aligned with `matchingDistractors.filter(Boolean)`. */
  matchingDistractors?: string[];
  /** Ordering: index-aligned with `correctAnswer.split('|')`. */
  orderingItems?: string[];
  /** Free response only. */
  placeholder?: string;
  /** Translated rubric, structurally identical to the English `rubricSnapshot`. */
  rubricSnapshot?: Rubric;
}

export interface QuizTranslation {
  locale: string;
  title: string;
  directions?: string;
  questions: Record<string, QuestionTranslation>;
  /** Per-question SHA-256 of the English source at translation time. Drives staleness. */
  sourceHashes: Record<string, string>;
  /** Question ids the teacher has explicitly approved. Only these are ever served. */
  reviewedQuestionIds: string[];
  model: string;
  generatedAt: number;
  updatedAt: number;
}
```

**Index alignment is the load-bearing invariant of this entire design.** Every array above must be the same length and the same order as the English source it mirrors. §4 depends on it completely. Generation must validate it and reject any model output that violates it.

**Align against the _filtered_ arrays.** `toPublicQuestion` builds MC choices from `[q.correctAnswer, ...q.incorrectAnswers.filter(Boolean)]` (`hooks/useQuizSession.ts:347-350`) and matching distractors from `(q.matchingDistractors ?? []).filter(Boolean)` (`:360`). Authored quizzes do contain empty entries. Define alignment against the filtered arrays in both the prompt and the server-side validator, or the validator will pass payloads that the projection then misaligns.

### 3.3 Storage (D2)

Translations do **not** go inline in the quiz JSON. `QuizData` is fully loaded from Drive on every editor open, every publish, and every PLC sync — a 40-question quiz × 5 languages inline would be roughly 6× the payload on every one of those loads.

- Each `QuizTranslation` is its own Drive file alongside the quiz, written through `QuizDriveService` (`utils/quizDriveService.ts`), loaded lazily.
- `QuizMetadata` (`types.ts:3755`) gains a small Firestore index so the library and the assign flow can answer _"does a reviewed Somali version exist?"_ with **zero Drive calls**:

```ts
export interface QuizTranslationIndexEntry {
  driveFileId: string;
  reviewedCount: number;
  staleCount: number;
  questionCount: number;
  updatedAt: number;
}
// on QuizMetadata:
translations?: Record<string, QuizTranslationIndexEntry>;
```

**Counts, not id lists.** Every `QuizMetadata` doc is read on every library open. The assign-time check (§10) only needs _"is there a reviewed, non-stale version"_, which `reviewedCount` + `staleCount` answers. The exact `staleQuestionIds` list lives in the Drive sidecar and is only loaded when the Languages tab opens.

This index must be kept consistent on every translation save — treat it the same way `driveFileId` is already treated in `hooks/useQuiz.ts` (Drive write first, Firestore index second, roll back the index on failure).

**Also update** every path that already copies or archives `QuizData`: library duplicate (`components/common/library/libraryDuplicate.ts`), `functions/src/driveArchive.ts`, PLC sync (`hooks/useSyncedQuizGroups.ts`), shared quizzes, and `components/widgets/QuizWidget/adapters/quizImportAdapter.ts`. Each needs an explicit decision to copy translations or drop them — **make it explicit, do not let it fall through**. Recommendation: duplicate and PLC sync carry translations; import drops them (source hashes won't match a re-authored quiz).

### 3.4 Stimuli (D10) — warning only

`utils/quizStimuli.ts:115` strips stimulus labels (`{ ...rest, label: '' }`) before the session doc is written, and `QuizStimulusView` never renders them. **Students never see stimulus labels — do not translate them.**

Text _inside_ an image is the real gap, and it needs vision/OCR, which is out of scope for v1. Instead: the Languages tab shows a per-question advisory — _"Q4 has an attached image. Text inside it will remain in English."_ — so the teacher knows the accommodation is incomplete and can swap the image or add spoken context. Reuse the existing `components/widgets/QuizWidget/components/QuizAuthoringAdvisory.tsx` pattern.

## 4. Serving to students — READ THIS BEFORE CODING

### 4.1 The trap

`toPublicQuestion` (`hooks/useQuizSession.ts:338`) is a deliberately hand-written allowlist with real security design behind it:

- MC `choices` are **Fisher-Yates shuffled** so the correct answer's identity is unknown.
- Matching `matchingRight` is shuffled _and_ merged with distractors, and the distractor list is deliberately **not** exposed — the inline comment says exposing it "lets a student pop devtools and read off exactly which entries are wrong."
- Ordering `orderingItems` are shuffled.
- `correctAnswer` never appears.

**Shipping `QuizTranslation` to the session doc as a parallel payload defeats all of it.** The translated arrays are in _source_ order, so a student reading the session doc in devtools gets the answer key and the distractor list for free — even without understanding the language, position alone gives it away.

### 4.2 The fix, part 1: translate inside the projection, through the same shuffle

Make the projection locale-aware rather than bolting a payload onto the session. Translations attach to the **question object itself** (D16), not to a parallel session-level map:

```ts
/** Locale-specific strings for one public question. Every array here is the
 *  same length and order as the sibling array on the question. */
export interface LocalizedQuestionStrings {
  text: string;
  choices?: string[];
  matchingLeft?: string[];
  matchingRight?: string[];
  orderingItems?: string[];
  placeholder?: string;
  rubricSnapshot?: Rubric;
}

// on QuizPublicQuestion:
localized?: Record<string, LocalizedQuestionStrings>;
```

`toPublicQuestion` computes the shuffle permutation **once** per question, then applies that same permutation to the English arrays and to every locale's arrays, and passes every locale through the **same allowlist** (no `correctAnswer`, no separate distractor list).

The student then sees translated strings at exactly the same indices as the English ones, and nothing that isn't already public becomes public.

**Why on the question and not `session.localizedQuestions[locale][qid]`:** §4.3. A sibling map keyed by question id is trivially desynchronized by the two client transforms; a field on the object travels with it through every `{...q, choices: f(q.choices)}` spread — provided those spreads are taught about it, which is the work in §4.3.

**Which locales get projected:** at publish, take the union of `language` across the assignment's targeted students' overrides. Project only those, and only questions in `reviewedQuestionIds` that are not stale.

**Publish sites.** `toPublicQuestion` has exactly one caller — `hooks/useQuizAssignments.ts:709`, wrapped by `toGatedPublicQuestion` → `projectPublicQuestionForMode`. Change it there and every create path inherits it. But there is a second, easily-missed site:

> **`hooks/useQuizAssignments.ts:1985` — the PLC re-sync path** re-projects `publicQuestions` on a **live or paused session** with a fresh unseeded Fisher-Yates, producing a **new permutation mid-session**. If that path recomputes English without recomputing every locale in lockstep, the arrays drift and every subsequent submission is mis-mapped. Because `localized` rides on the question, routing this path through the same `projectPublicQuestionForMode` keeps it correct by construction — but assert it in a test.

**Publish cost and failure mode.** `toPublicQuestion` runs on the **teacher's client**, and §3.3 stores each language as a separate lazily-loaded Drive file. Assigning to a 4-language class therefore adds 4 Drive round-trips to the assign path. §10 says never block a publish, so the failure behavior is: **a Drive load failure for one locale drops that locale and publishes without it.** The student gets English, which is the same outcome the D5 advisory already warns about. Log it; do not surface a blocking error.

**Session doc size.** `publicQuestions` already carries the full quiz text; each projected locale adds roughly another copy. A 40-question quiz across 5 locales is ~100 KB — comfortable against Firestore's 1 MB cap, but non-Latin scripts cost 2–3 bytes per character. Add a size guard at publish that drops the lowest-priority locales and warns, rather than letting the session write fail.

### 4.3 The fix, part 2: the two client transforms (this is the part that breaks)

**A shared permutation at projection time is necessary but not sufficient.** After the session doc is written, `QuizStudentApp` applies two more transforms, and today both touch the English arrays only:

| Transform                   | Where                                                                  | What it does                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyHiddenOptions`        | `utils/quizOverrideServing.ts:32`, called at `QuizStudentApp.tsx:1749` | Filters `choices` **by literal English text** — hidden-option values are option text, not ids, deliberately (see the comment there)             |
| `shuffleQuestionForStudent` | `utils/quizShuffle.ts:69`, called at `QuizStudentApp.tsx:1752`         | **Re-shuffles** `choices` / `matchingRight` / `orderingItems` with a per-student seed. On by default (`session.shuffleAnswerOptions !== false`) |

Left alone, each independently destroys the invariant:

- A student with **both** `hiddenOptionIdsByQuestion` and `language` — EL plus reduced answer choices, one of the most common accommodation pairs there is — gets an English array of length `n-1` against a localized array of length `n`. Every index past the removed one is off by one.
- The per-student re-shuffle permutes English and leaves the locale arrays in the server's order.

Under §4.4's "the client writes the English string at that index," **both cases silently write the wrong English answer.** That is mis-grading a child — the exact failure §12 exists to prevent — and no projection test catches it, because the projection is correct.

**The fix: make index operations structural.** Add `utils/quizLocalizedArrays.ts`:

```ts
/**
 * Re-index one choice-bearing array on a public question, applying the SAME
 * index operation to every locale's sibling array. `indices` is the new order
 * (a permutation) or a kept subset (a filter) over the current array.
 */
export function reindexChoiceArray(
  q: QuizPublicQuestion,
  field: 'choices' | 'matchingRight' | 'orderingItems',
  indices: number[]
): QuizPublicQuestion;
```

Then both call sites become "compute indices, call `reindexChoiceArray`":

- `applyHiddenOptions` computes the kept indices from the English text match instead of filtering directly.
- `shuffleQuestionForStudent` computes a seeded index permutation instead of shuffling the array directly.

Lockstep is then enforced by construction rather than by documentation, and there is one place to test it. Both functions are small, pure, and already have test coverage to extend.

### 4.4 Grading: convert to English at submit (D7)

Because index alignment now holds all the way to the render, the student client can map any selection back to English **before writing the response**:

- **MC / Matching / Ordering** — the student picks by index. The client writes the **English** string at that index into `QuizResponseAnswer`, and stamps `locale` (D18).
- **Result: results, the live monitor, the leaderboard, Sheets export, and LMS grade push are untouched.** They only ever see English. This is the single biggest risk reduction available in this design — take it.

**Free response** — store the student's native text verbatim, plus `locale` (§6).

**FIB is the genuine exception.** The §14 gate from the original draft is now resolved; the answer changes what needs building.

> **RESOLVED.** There is **no key-exposure risk**. `session.revealedAnswers[qid]` is written only by an explicit teacher reveal (`hooks/useQuizSession.ts:1403`) and by `PublishScoresModal`. Self-paced assignments — the only ones that carry overrides — have no reveal, so no key reaches the student client at any point. Do not build a defense against a leak that cannot happen.
>
> **The actual failure is silent mis-grading, and it is unconditional.** Authoritative scoring is entirely teacher-side: `gradeAnswer` (`hooks/useQuizSession.ts:515`) runs against the full `QuizData` loaded from Drive, and `QuizResponseAnswer.isCorrect` is documented as _"Not written by the student... Always recomputed... on the teacher / results side"_ (`types.ts:4263-4269`). For FIB it does `normalizeAnswer(correctAnswer) === normalizeAnswer(studentAnswer)` (`:561`). A student who free-types the Somali word is marked **wrong, every time**, on the monitor, in the export, and in the LMS push.

**So: a FIB question answered in a non-English locale is routed to teacher grading, never auto-scored.** Mechanically that needs D18, because `gradeAnswer` is a pure `(question, answer)` function with no student context:

- Stamp `QuizResponseAnswer.locale` at submit.
- Extend `gradeAnswer` to return `state: 'awaiting-grade'` for a FIB answer carrying a non-English `locale`, alongside the existing `isWrittenAnswerAwaitingGrade` path.
- Honor it at every call site: `components/widgets/QuizWidget/utils/quizScoreboard.ts:93,267`, `components/widgets/QuizWidget/components/monitor/monitorUtils.ts:137,146`, `monitor/QuestionResults.tsx:89`, `present/PresentPacedReview.tsx:29`, `QuizPreview.tsx:369`.

This is real work. It belongs in the build order (§11 step 3), not in "open items."

### 4.5 Read-aloud × translation

`StudentOverride.readAloud` already exists and ships. A student with **both** `readAloud: true` and `language: 'so'` currently gets Somali text with English audio, because `QuizReadAloudManifest.files` is `Record<string, string>` keyed per part with no locale dimension, synthesized at assign time from the session's English text.

Both accommodations on one student is the norm for EL students with IEPs, not an edge case. **Decide in v1:**

- **Preferred:** synthesize in the target language. `QuizReadAloudAdminSettings.voicesByLanguage` is already a BCP-47 → voice map, so the plumbing exists; the manifest keys need a locale dimension and `prepareQuizReadAloudV1` needs the student's locale set.
- **Acceptable v1 fallback:** suppress the speaker control on translated questions and say so in the Languages tab.

What is not acceptable is shipping English audio over Somali text without a decision.

### 4.6 Student UI (D6)

In `components/quiz/QuizStudentApp.tsx`, the student's language comes from their `StudentAssignmentPointer.override.language` (`:572`). Render from `currentQuestion.localized[language]` when present, falling back to the English fields per question.

Add a small per-question toggle ("English" / native label). Apply the same fallback to any question that is stale or unreviewed — silently, with no scary UI for the student.

Extend `utils/quizOverrideServing.ts` with a `serveLocalizedQuestion()` helper so the fallback logic is pure and unit-testable, matching how `serveQuestionSubset` and `applyHiddenOptions` are already factored.

**Student results recap.** §4.4 writes English into the response, so the post-submit recap (`QuizStudentApp.tsx:3918-3954`) would show a Somali-reading student their own answer in English. Resolve the displayed answer back through `localized` for the recap, using the stamped `locale`.

**Note honestly:** the surrounding app chrome (buttons, timer, submit) stays English for any language outside `en/es/de/fr`. The languages most likely on a curated district list — Somali, Hmong, Karen — have no app locale at all, so those students read translated questions inside an English shell. Expanding `i18n/index.ts` locales is out of scope for v1; say so in the Languages tab and in the PR.

## 5. Generation (D12)

New Cloud Function `translateQuiz` in `functions/src/`, following the shape of `generateWithAI` / `generateGuidedLearning` in `functions/src/aiGeneration.ts`, and the quota/cap structure of `functions/src/quizReadAloud.ts`:

- **One Gemini call per quiz per language** — all questions in a single request so terminology stays consistent across the quiz. One metered unit. A 20-question quiz into 3 languages costs 3 units, not 60.
- **English source only (D17).** Refuse when the quiz's `QuizData.language` (`types.ts:3722` — "BCP-47 tag that picks the read-aloud voice") is set to anything non-English. The whole design pivots on English (§4.4 grading, §6 back-translation); a Spanish-source quiz would produce Somali graded against Spanish keys with English back-translations. Disable Generate in the UI with that reason.
- **Quota:** `ai_usage` doc keyed `{teacherUid}_quizTranslation_{date}`, mirroring `teacherDailyDocId` (`quizReadAloud.ts:511`). Also decrement the org monthly cap (§7), mirroring `monthlyUsageDocId` (`:506`).
- **Validation is mandatory.** Mirror `validateAndBucketQuizQuestions` (`aiGeneration.ts:1443`). Reject and retry once if the model returns arrays of the wrong length, drops a question id, or returns malformed rubric structure. **Index alignment (§3.2) must be verified server-side against the filtered arrays — never trust the model on this.** A misaligned array silently mis-grades students.
- **Prompt must instruct:** preserve numbers, units, proper nouns, and any LaTeX/markup verbatim; do not translate anything inside code formatting; keep the answer and its distractors mutually distinct after translation (a translation that collapses two MC choices into the same string makes the question unanswerable — validate this too).
- Regeneration for a single stale question is supported (send just that question), which is what D8's per-question staleness makes cheap.

## 6. Free-response grading (D14)

Generate the English back-translation **teacher-side and lazily**, when the grader opens a response whose `locale` (D18) is non-English — not on the student's submit path. Cache it on the response.

This resolves three problems the submit-time design left open: drafts autosave (`status: 'draft'`) so "once at submit" is not well-defined; retakes exist (`takeIndex`); and the caller would otherwise be a student, while `ai_usage` is keyed and capped under the teacher exactly so students hold no quota. It also keeps a Gemini round-trip off the student's submit latency.

`components/widgets/QuizWidget/components/FreeResponseGrader.tsx` shows the native text and the back-translation side by side, with the back-translation clearly labeled as machine-generated. The native text is always the primary record — the teacher must be able to see what the student actually wrote.

`components/widgets/QuizWidget/components/AnnotatedResponseView.tsx` needs the same treatment so annotations anchor to the native text, not the translation.

Cost is bounded: one call per free-response submission actually opened for grading.

## 7. Admin gating (D3, D13)

Extend the **read-aloud admin surface**, which already solves this. `QuizReadAloudAdminSettings` (`types.ts:7584`) lives in `admin_settings` and already carries `voicesByLanguage: Record<string, string>` (a curated BCP-47 list), `defaultLanguage`, and `neural2MonthlyCapChars` (a monthly cap).

> **Correction to the original draft:** it proposed extending `QuizGlobalConfig`. That type is at `types.ts:4808` and is `{ dockDefaults?: Record<string, boolean> }` — widget dock defaults, unrelated. Do not put admin config there.

Surface, registered alongside the existing `'quiz'` entry in `components/admin/FeatureConfigurationPanel.tsx:690` (see `components/admin/VideoActivityConfigurationModal.tsx` for a reference modal):

- **Curated language list** — org admins pick which languages the district offers. Teachers choose only from this list. Store BCP-47 codes plus a native-label string for the student UI. Reconcile with `voicesByLanguage` so a language offered for translation can also be read aloud (§4.5).
- **Feature toggle** — a global feature permission, following `quiz-read-aloud`.
- **Monthly org quota cap** — a translation budget across the org with visible burn-down, plus a clear cap-reached state in the Languages tab. This is the cost control; build it in v1, not later.

## 8. Review UI (D11)

New `'languages'` tab in `components/widgets/QuizWidget/components/QuizEditorModal.tsx` — the tab state union is at `:276-277` and the tab array at `:508`. Add to both. **Note `isBank` forces `activeTab` to `'questions'` and hides the tab strip entirely (`:480`, `:508`)** — question banks have no Languages tab.

Contents:

- Language picker (from the org's curated list) + **Generate** button, disabled with an explanation when the org cap is spent or when D17's English-source check fails.
- Per-question side-by-side English / target with inline editing of every translated string.
- Per-question **Reviewed** checkbox writing `reviewedQuestionIds`. A progress indicator ("12 / 20 reviewed").
- **Stale** badge on any question whose `sourceHashes` entry no longer matches, with a one-click regenerate for just that question.
- The §3.4 stimulus advisory on any question with attached media.
- A standing note that unreviewed and stale questions are served in English.
- **The D15 limitation, stated plainly:** translations reach students who sign in with SSO. Students who join a live quiz with a code and PIN see English.
- The §4.6 note that app chrome stays English outside `en/es/de/fr`.

**Known limitation, state it in the UI:** the reviewing teacher usually does not read the target language. The tab should say so plainly and suggest routing the quiz to an EL specialist. A shareable specialist review link was considered and deliberately deferred to v2.

## 9. Staleness (D8)

On every quiz save, recompute a per-question content hash over the fields that feed translation (`text`, `correctAnswer`, `incorrectAnswers`, `matchingDistractors`, `placeholder`, `rubricSnapshot`). Compare against each language's `sourceHashes`; any mismatch updates `staleCount` in the `QuizMetadata` index and the id list in the Drive sidecar.

Stale questions are **served in English** and flagged in the Languages tab. A one-comma typo fix costs the teacher one question's re-review, not the whole quiz.

## 10. Assign-time warning (D5)

In `components/common/library/AssignStudentPicker.tsx` (which already resolves standing overrides at `:128`), cross-reference each targeted student's `override.language` against `QuizMetadata.translations` — a pure Firestore read, no Drive call.

When a targeted student needs a language the quiz lacks (or has only unreviewed/stale), show an inline advisory naming the student and the language, with a **Generate** action. **The teacher can always proceed anyway** — the student gets English. Never block a publish; a teacher pushing out a bell-ringer at 7:58 will not thank us.

> **Caveat on that example (D15):** a bell-ringer pushed as a live code+PIN session serves English regardless of what has been translated, because PIN joiners carry no override. The advisory should say so when the assignment is not SSO-targeted, rather than implying generation would help.

## 11. Build order

Each step should be independently reviewable and leave `pnpm run validate` green.

1. **Types + index alignment contract.** `StudentOverride.language`, `QuestionTranslation`, `QuizTranslation`, `LocalizedQuestionStrings` on `QuizPublicQuestion`, `QuizMetadata.translations`, `QuizResponseAnswer.locale`. Pure types, no behavior.
2. **The whole index-alignment path, in one reviewable step: projection (§4.2) _plus_ both client transforms (§4.3).** `reindexChoiceArray`, locale-aware `toPublicQuestion`, and the rewired `applyHiddenOptions` / `shuffleQuestionForStudent`. The gate for this step is a **round-trip test**: with hidden options and the seeded shuffle both active, a student picking index _i_ in locale L produces the correct English string. Splitting projection from the client transforms is what makes the failure in §4.3 invisible — do not split them.
3. **FIB routing (§4.4).** `locale` on the response, `gradeAnswer` returning `awaiting-grade`, every call site honoring it.
4. **Drive storage + metadata index.** `QuizDriveService` read/write, index consistency, duplicate/PLC/archive decisions from §3.3.
5. **`translateQuiz` Cloud Function** with validation, D17 source check, and quota. Functions-side tests mirroring `aiValidators.test.ts`.
6. **Admin config** — language list, toggle, monthly cap, on the read-aloud surface (§7).
7. **Languages tab** — generation, review, staleness, stimulus advisory, D15 and chrome disclosures.
8. **Student serving** — localized rendering, per-question toggle, English fallback, submit-time conversion to English, results recap.
9. **Read-aloud interaction decision (§4.5).**
10. **Assign-time warning.**
11. **Free-response back-translation + grader view.**

Steps 2–3 are the risky ones. Do not start 4+ until 2 is tested and reviewed.

## 12. Test plan

- **Round-trip correctness (highest priority):** for every answer type, with `hiddenOptionIdsByQuestion` set **and** the per-student seeded shuffle active, the English string the client writes for a locale-L selection at index _i_ equals the English string a monolingual student selecting the same option would write. This is the test that would have caught §4.3.
- **Projection security:** no `correctAnswer`, no explicit distractor list, in any locale payload; permutation identical across English and every locale; translated MC choices remain mutually distinct.
- **Lockstep transforms:** `applyHiddenOptions` and `shuffleQuestionForStudent` leave English and every locale array the same length and the same order, for a question with and without `localized`.
- **PLC re-sync:** re-projecting a live session (`useQuizAssignments.ts:1985`) recomputes English and every locale with the same new permutation; no drift.
- **Grading equivalence:** a student answering in Somali and a student answering the same question in English produce byte-identical `QuizResponseAnswer.answer` values (differing only in `locale`).
- **FIB routing:** a FIB answer with a non-English `locale` reports `awaiting-grade` at every `gradeAnswer` call site; an English one is unchanged.
- **Fallback matrix:** unreviewed → English; stale → English; locale missing from session → English; student with no `language` → completely unchanged behavior; **PIN joiner → English** (D15).
- **Override plumbing:** `language` survives roster default → assign picker → `setAssignmentTargetsV1` → pointer doc → student client.
- **Staleness:** editing one question marks only that question stale, in every language.
- **Validation:** malformed model output (wrong array length against the _filtered_ source, missing question id, collapsed duplicate choices) is rejected, not served.
- **Quota:** per-quiz-per-language metering; org monthly cap blocks generation and surfaces a clear state.
- **Regression:** the full existing quiz suite must pass untouched — a quiz with no translations must produce a **structurally identical** session doc to today, emitting no new fields. (Not byte-identical: `toPublicQuestion` shuffles with `Math.random()`.)

## 13. Explicit non-goals for v1

- **Translation for code+PIN joiners (D15).** Overrides ride SSO pointer docs. Live PIN-joined sessions are English for everyone.
- **Non-English source quizzes (D17).** `QuizData.language` must be English or absent.
- Vision/OCR translation of text inside stimulus images (D10).
- Student-facing self-service language selection — language is an accommodation, set by a teacher.
- App UI chrome in languages beyond `en/es/de/fr`.
- Video activities, guided learning, mini-apps (the `language` field and payload shape generalize; the work does not exist yet).
- Specialist/PLC review routing — deferred to v2.
- Translation of teacher-facing surfaces (monitor, results, exports) — those stay English by design (§4.4).

## 14. Open items for the implementing agent

1. **PLC sync semantics.** If two teachers share a synced quiz and one translates it, does the translation sync? Recommendation: yes, translations sync with the quiz (that is most of the value of a PLC), but `reviewedQuestionIds` is authoritative from the canonical doc — flag it for Paul if implementation makes that awkward.
2. **`rubricOverrideByQuestion` × translation.** A per-student rubric swap points at a rubric that has no translation. Recommendation: serve overridden rubrics in English in v1 and note it in the Languages tab rather than growing the payload.
3. **§4.5 read-aloud interaction** needs a product call before step 9: target-language synthesis, or suppress the speaker on translated questions.

> The original §14 item 1 — "verify how FIB is scored in self-paced assignments" — is **resolved in §4.4**. There is no key exposure; the work is grading-side routing.

---

**Grilled and locked:** 2026-09-11 with Paul Ivers.
**Revised:** 2026-09-11 after verifying every citation against `b49b336`. §4 restructured (4.2 projection / 4.3 client transforms / 4.4 grading / 4.5 read-aloud / 4.6 student UI); D15–D18 added; FIB gate resolved; build order resequenced so the projection and the client transforms land together.
