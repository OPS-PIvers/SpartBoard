# Quiz Translation for Multilingual Learners — Implementation Plan

**Status:** Spec locked 2026-09-11 via grilling session with Paul. Ready to implement.
**Scope:** Quizzes only. Video activities / guided learning / mini-apps are explicitly out of v1, but the payload shape and the `StudentOverride` field are designed to generalize to them without a rewrite.
**Prerequisite:** Read §4 before writing any code. The session-doc projection is security-critical and a naive implementation leaks answer keys.

## 1. Feature summary

A student's **language** becomes a per-student accommodation, exactly like extended time or hidden answer choices. A teacher (or an EL coordinator) sets a student's language once on the roster; from then on every quiz that student is assigned renders in that language, with a per-question toggle back to English.

Teachers generate translations with AI from a new **Languages** tab in the quiz editor, review and correct them, and mark them reviewed. Nothing unreviewed is ever served to a student.

**Why the accommodation framing and not a student-facing language picker:** it makes the feature auditable (an IEP/504 accommodation that is recorded and honored), it reuses machinery that already exists end-to-end, and it means the teacher — not the 6th grader — decides.

## 2. Locked decisions

| #   | Decision                           | Choice                                                                                                  |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | Who picks the language             | Per-student accommodation on `StudentOverride`, with a standing default on the roster                   |
| D2  | Storage                            | Sidecar per language: **separate Drive file per language**, index in `QuizMetadata`                     |
| D3  | Target languages                   | **Admin-curated per-district list** (not limited to the 4 app UI locales)                               |
| D4  | Review gate                        | **Review-then-publish.** Unreviewed translations are never served                                       |
| D5  | Missing translation at assign time | **Warn + one-click generate** in the assign flow; teacher may proceed anyway (student gets English)     |
| D6  | Student display                    | Translated by default, **per-question toggle to English**                                               |
| D7  | Answer side                        | Translate the answer content too; **grade in English space** (see §4.3)                                 |
| D8  | Staleness                          | **Per-question content hash**; editing one question marks only that question stale in each language     |
| D9  | What gets translated               | Question content, quiz title + directions, rubric criteria/descriptors                                  |
| D10 | Stimuli                            | **Warning only in v1.** No vision/OCR. Labels are never translated (see §3.4)                           |
| D11 | Review surface                     | New **Languages** tab in `QuizEditorModal`, quiz owner reviews                                          |
| D12 | Generation                         | New `translateQuiz` Cloud Function; quota metered **per quiz × language**, one Gemini call per language |
| D13 | Admin gate                         | Language list + feature toggle + **monthly org quota cap**                                              |
| D14 | Free-response grading              | Student's native text **plus AI back-translation**, generated once at submit, stored on the response    |

## 3. Data model

### 3.1 `StudentOverride` gains a language (`types.ts:4661`)

```ts
export interface StudentOverride {
  timeMultiplier?: 1.5 | 2 | 'unlimited';
  questionIds?: string[];
  hiddenOptionIdsByQuestion?: Record<string, string[]>;
  rubricOverrideByQuestion?: Record<string, RubricSnapshot | 'points'>;
  tabWarningThreshold?: number | 'off';
  openAt?: number;
  closeAt?: number;
  /** BCP-47 code, e.g. 'so', 'hmn', 'es'. Absent = English. Must appear in the org's curated list. */
  language?: string;
}
```

This one field rides every existing path for free:

- `Class.defaultOverridesByStudentId` (`types.ts:195`) — the standing accommodation, set once per student.
- `AssignStudentPicker.tsx:128` already reads that default and applies it when the student is targeted.
- `QuizAssignment.overridesBySourcedId` / `overridesByStudentUid` (`types.ts:4843-4848`).
- `setAssignmentTargetsV1` (`functions/src/studentAssignmentTargets.ts:1208`) already fans overrides out to `/student_assignments/{uid}/items/{id}`.
- `StudentAssignmentPointer.override` (`types.ts:4686`) already delivers it to the student client.

Add a `language` chip to `summarizeOverride` (`utils/studentOverrideSummary.ts`) so it shows in the collapsed row like every other accommodation.

**⚠️ The structural difference from every existing override.** All current overrides are _subtractive_ — hide a question, hide a choice, stretch a timer — and need no extra published content. Language is the first override that requires **content that must already exist and be published**. `StudentOverride` is documented as _"Never stored on session docs"_ and that stays true: the override carries only the language _code_; the translated _payload_ travels on the session doc (§4). D5 exists precisely because these two can get out of sync.

### 3.2 Translation payload

```ts
/** One question's translated strings. Positionally aligned with the English question. */
export interface QuestionTranslation {
  text: string;
  /** MC: translated choices, index-aligned with [correctAnswer, ...incorrectAnswers] BEFORE shuffling. */
  choices?: string[];
  /** Matching: index-aligned with the parsed pairs of `correctAnswer`. */
  matchingLeft?: string[];
  matchingRight?: string[];
  /** Matching: index-aligned with `matchingDistractors`. */
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

**Index alignment is the load-bearing invariant of this entire design.** Every array above must be the same length and the same order as the English source it mirrors. §4.3 depends on it completely. Generation must validate it and reject any model output that violates it.

### 3.3 Storage (D2)

Translations do **not** go inline in the quiz JSON. `QuizData` is fully loaded from Drive on every editor open, every publish, and every PLC sync — a 40-question quiz × 5 languages inline would be roughly 6× the payload on every one of those loads.

- Each `QuizTranslation` is its own Drive file alongside the quiz, written through `QuizDriveService` (`utils/quizDriveService.ts`), loaded lazily.
- `QuizMetadata` (`types.ts:3460`) gains a small Firestore index so the library and the assign flow can answer _"does a reviewed Somali version exist?"_ with **zero Drive calls**:

```ts
export interface QuizTranslationIndexEntry {
  driveFileId: string;
  reviewedCount: number;
  questionCount: number;
  staleQuestionIds: string[];
  updatedAt: number;
}
// on QuizMetadata:
translations?: Record<string, QuizTranslationIndexEntry>;
```

This index is what D5's assign-time warning reads. It must be kept consistent on every translation save — treat it the same way `driveFileId` is already treated in `hooks/useQuiz.ts` (Drive write first, Firestore index second, roll back the index on failure).

**Also update** every path that already copies or archives `QuizData`: library duplicate (`components/common/library/libraryDuplicate.ts`), `driveArchive.ts`, PLC sync (`useSyncedQuizGroups.ts`), shared quizzes, and `quizImportAdapter.ts`. Each needs an explicit decision to copy translations or drop them — **make it explicit, do not let it fall through**. Recommendation: duplicate and PLC sync carry translations; import drops them (source hashes won't match a re-authored quiz).

### 3.4 Stimuli (D10) — warning only

`utils/quizStimuli.ts:113` strips stimulus labels (`{ ...s, label: '' }`) before the session doc is written, and `QuizStimulusView` never renders them. **Students never see stimulus labels — do not translate them.**

Text _inside_ an image is the real gap, and it needs vision/OCR, which is out of scope for v1. Instead: the Languages tab shows a per-question advisory — _"Q4 has an attached image. Text inside it will remain in English."_ — so the teacher knows the accommodation is incomplete and can swap the image or add spoken context. Reuse the existing `QuizAuthoringAdvisory.tsx` pattern.

## 4. Serving to students — READ THIS BEFORE CODING

### 4.1 The trap

`toPublicQuestion` (`hooks/useQuizSession.ts:338`) is a deliberately hand-written allowlist with real security design behind it:

- MC `choices` are **Fisher-Yates shuffled** so the correct answer's identity is unknown.
- Matching `matchingRight` is shuffled _and_ merged with distractors, and the distractor list is deliberately **not** exposed — the inline comment says exposing it "lets a student pop devtools and read off exactly which entries are wrong."
- Ordering `orderingItems` are shuffled.
- `correctAnswer` never appears.

**Shipping `QuizTranslation` to the session doc as a parallel payload defeats all of it.** The translated arrays are in _source_ order, so a student reading the session doc in devtools gets the answer key and the distractor list for free — even without understanding the language, position alone gives it away.

### 4.2 The fix: translate inside the projection, through the same shuffle

Make the projection locale-aware rather than bolting a payload onto the session:

```ts
export function toPublicQuestion(
  q: QuizQuestion,
  translations?: Record<string, QuestionTranslation> // locale -> translation
): {
  base: QuizPublicQuestion;
  localized?: Record<string, LocalizedPublicQuestion>;
};
```

Compute the shuffle permutation **once** per question, then apply that same permutation to the English arrays and to every locale's arrays. Emit:

- `QuizSession.publicQuestions[i]` — English, shuffled with permutation `P`.
- `QuizSession.localizedQuestions[locale][questionId]` — translated strings in the **same permutation `P`**, and passed through the **same allowlist** (no `correctAnswer`, no separate distractor list).

The student then sees translated strings at exactly the same indices as the English ones, and nothing that isn't already public becomes public.

**Which locales get projected:** at publish, take the union of `language` across the assignment's targeted students' overrides. Project only those, and only questions in `reviewedQuestionIds` that are not stale. Publish paths to update: `hooks/useQuizAssignments.ts:686`, `:881`, `:1948`.

### 4.3 Grading: convert to English at submit (D7)

Because of index alignment, the student client can map any selection back to English **before writing the response**:

- **MC / Matching / Ordering** — the student picks by index. The client writes the **English** string at that index into `QuizResponseAnswer`.
- **Result: grading, results, the live monitor, the leaderboard, Sheets export, and LMS grade push are all completely untouched.** They only ever see English. This is the single biggest risk reduction available in this design — take it.

**Free response** — store the student's native text verbatim (§6).

**FIB is the one genuine exception** and the one thing the implementing agent must verify first. The student free-types, so there is no index to map back. Every grading comparison in `QuizStudentApp.tsx` (`:2335`, `:2409`, `:3747`) compares against a value called `revealed` — the key arrives at reveal time, _not_ in the upfront projection.

> **VERIFY BEFORE IMPLEMENTING:** confirm how FIB is scored in **self-paced** assignments, which have no teacher-driven reveal. Trace `revealed` to its source and check `hooks/useQuizSession.ts:429` and `utils/gradeDraft.ts`.
>
> - If the key is revealed only _after_ the student answers, then the translated key can ride the exact same channel and there is **no new exposure** — implement it that way.
> - If self-paced grading happens somewhere the translated key cannot safely go, fall back to: **FIB served in a translated language is marked for teacher grading** rather than auto-scored. Do **not** put a translated FIB key in the upfront session projection under any circumstances.

### 4.4 Student UI (D6)

In `components/quiz/QuizStudentApp.tsx`, the student's language comes from their `StudentAssignmentPointer.override.language`. Render from `localizedQuestions[language]` when present, falling back to `publicQuestions` per question.

Add a small per-question toggle ("English" / native label). Apply the same fallback to any question that is stale or unreviewed — silently, with no scary UI for the student.

Extend `utils/quizOverrideServing.ts` with a `serveLocalizedQuestion()` helper so the fallback logic is pure and unit-testable, matching how `serveQuestionSubset` and `applyHiddenOptions` are already factored.

**Note honestly:** the surrounding app chrome (buttons, timer, submit) stays English for any language outside `en/es/de/fr`. Expanding `i18n/index.ts` locales is out of scope for v1 — call it out in the PR so nobody is surprised.

## 5. Generation (D12)

New Cloud Function `translateQuiz` in `functions/src/`, following the shape of `generateWithAI` / `generateGuidedLearning` in `functions/src/aiGeneration.ts`:

- **One Gemini call per quiz per language** — all questions in a single request so terminology stays consistent across the quiz. One metered unit. A 20-question quiz into 3 languages costs 3 units, not 60.
- **Quota:** `ai_usage` doc keyed `{uid}_quizTranslation_{date}`, matching the existing pattern. Also decrement the org monthly cap (§7).
- **Validation is mandatory.** Mirror `validateAndBucketQuizQuestions` (`aiGeneration.ts:1443`). Reject and retry once if the model returns arrays of the wrong length, drops a question id, or returns malformed rubric structure. **Index alignment (§3.2) must be verified server-side — never trust the model on this.** A misaligned array silently mis-grades students.
- **Prompt must instruct:** preserve numbers, units, proper nouns, and any LaTeX/markup verbatim; do not translate anything inside code formatting; keep the answer and its distractors mutually distinct after translation (a translation that collapses two MC choices into the same string makes the question unanswerable — validate this too).
- Regeneration for a single stale question is supported (send just that question), which is what D8's per-question staleness makes cheap.

## 6. Free-response grading (D14)

At submit, if the student answered in a non-English language, generate an English back-translation **once** and store it on the response alongside the native text. Grading and re-grading are then free.

`components/widgets/QuizWidget/components/FreeResponseGrader.tsx` shows the native text and the back-translation side by side, with the back-translation clearly labeled as machine-generated. The native text is always the primary record — the teacher must be able to see what the student actually wrote.

`AnnotatedResponseView.tsx` needs the same treatment so annotations anchor to the native text, not the translation.

Cost is bounded: one call per free-response submission, only for translated attempts.

## 7. Admin gating (D3, D13)

New admin configuration surface following the existing pattern (`components/admin/FeatureConfigurationPanel.tsx:690` registers `'quiz'`; see `VideoActivityConfigurationModal.tsx` for a reference modal):

- **Curated language list** — org admins pick which languages the district offers. Teachers choose only from this list. Store BCP-47 codes plus a native-label string for the student UI.
- **Feature toggle** — quiz translation on/off for the org.
- **Monthly org quota cap** — a translation budget across the org with visible burn-down, plus a clear cap-reached state in the Languages tab. This is the cost control; build it in v1, not later.

Extend `QuizGlobalConfig` (`types.ts:4479`) rather than inventing a new config collection.

## 8. Review UI (D11)

New `'languages'` tab in `QuizEditorModal.tsx` — the tab array is at `:340` and the state union at `:199-200`. Add to both.

Contents:

- Language picker (from the org's curated list) + **Generate** button, disabled with an explanation when the org cap is spent.
- Per-question side-by-side English / target with inline editing of every translated string.
- Per-question **Reviewed** checkbox writing `reviewedQuestionIds`. A progress indicator ("12 / 20 reviewed").
- **Stale** badge on any question whose `sourceHashes` entry no longer matches, with a one-click regenerate for just that question.
- The §3.4 stimulus advisory on any question with attached media.
- A standing note that unreviewed and stale questions are served in English.

**Known limitation, state it in the UI:** the reviewing teacher usually does not read the target language. The tab should say so plainly and suggest routing the quiz to an EL specialist. A shareable specialist review link was considered and deliberately deferred to v2.

## 9. Staleness (D8)

On every quiz save, recompute a per-question content hash over the fields that feed translation (`text`, `correctAnswer`, `incorrectAnswers`, `matchingDistractors`, `placeholder`, `rubricSnapshot`). Compare against each language's `sourceHashes`; any mismatch adds that question id to `staleQuestionIds` in the `QuizMetadata` index.

Stale questions are **served in English** and flagged in the Languages tab. A one-comma typo fix costs the teacher one question's re-review, not the whole quiz.

## 10. Assign-time warning (D5)

In `components/common/library/AssignStudentPicker.tsx` (which already resolves standing overrides at `:128`), cross-reference each targeted student's `override.language` against `QuizMetadata.translations` — a pure Firestore read, no Drive call.

When a targeted student needs a language the quiz lacks (or has only unreviewed/stale), show an inline advisory naming the student and the language, with a **Generate** action. **The teacher can always proceed anyway** — the student gets English. Never block a publish; a teacher pushing out a bell-ringer at 7:58 will not thank us.

## 11. Build order

Each step should be independently reviewable and leave `pnpm run validate` green.

1. **Types + index alignment contract.** `StudentOverride.language`, `QuestionTranslation`, `QuizTranslation`, `QuizMetadata.translations`. Pure types, no behavior.
2. **Projection (§4).** Locale-aware `toPublicQuestion` with shared-permutation shuffling. **Heavy unit tests** — this is where a mistake leaks an answer key or mis-grades a child. Test that no locale payload ever contains a key or a distractor list, and that permutations match across locales.
3. **Drive storage + metadata index.** `QuizDriveService` read/write, index consistency, duplicate/PLC/archive decisions from §3.3.
4. **`translateQuiz` Cloud Function** with validation and quota. Functions-side tests mirroring `aiValidators.test.ts`.
5. **Admin config** — language list, toggle, monthly cap.
6. **Languages tab** — generation, review, staleness, stimulus advisory.
7. **Student serving** — localized rendering, per-question toggle, English fallback, submit-time conversion to English.
8. **Assign-time warning.**
9. **Free-response back-translation + grader view.**

Steps 1–2 are the risky ones. Do not start 3+ until 2 is tested and reviewed.

## 12. Test plan

- **Projection security (highest priority):** no `correctAnswer`, no explicit distractor list, in any locale payload; permutation identical across English and every locale; translated MC choices remain mutually distinct.
- **Grading equivalence:** a student answering in Somali and a student answering the same question in English produce byte-identical `QuizResponseAnswer` values.
- **Fallback matrix:** unreviewed → English; stale → English; locale missing from session → English; student with no `language` → completely unchanged behavior.
- **Override plumbing:** `language` survives roster default → assign picker → `setAssignmentTargetsV1` → pointer doc → student client.
- **Staleness:** editing one question marks only that question stale, in every language.
- **Validation:** malformed model output (wrong array length, missing question id, collapsed duplicate choices) is rejected, not served.
- **Quota:** per-quiz-per-language metering; org monthly cap blocks generation and surfaces a clear state.
- **Regression:** the full existing quiz suite must pass untouched — a quiz with no translations must produce byte-identical session docs to today.

## 13. Explicit non-goals for v1

- Vision/OCR translation of text inside stimulus images (D10).
- Student-facing self-service language selection — language is an accommodation, set by a teacher.
- App UI chrome in languages beyond `en/es/de/fr`.
- Video activities, guided learning, mini-apps (the `language` field and payload shape generalize; the work does not exist yet).
- Specialist/PLC review routing — deferred to v2.
- Translation of teacher-facing surfaces (monitor, results, exports) — those stay English by design (§4.3).

## 14. Open items for the implementing agent

1. **§4.3 FIB verification is a hard gate.** Resolve it before writing the projection. Wrong answer here is either an answer-key leak or silently mis-graded students.
2. **PLC sync semantics.** If two teachers share a synced quiz and one translates it, does the translation sync? Recommendation: yes, translations sync with the quiz (that is most of the value of a PLC), but `reviewedQuestionIds` is authoritative from the canonical doc — flag it for Paul if implementation makes that awkward.
3. **`rubricOverrideByQuestion` × translation.** A per-student rubric swap points at a rubric that has no translation. Recommendation: serve overridden rubrics in English in v1 and note it in the Languages tab rather than growing the payload.

---

**Grilled and locked:** 2026-09-11 with Paul Ivers.
