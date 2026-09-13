# Quiz Translation for Multilingual Learners — Implementation Plan

**Status:** **Shipped to `dev-paul` 2026-09-13.** PR0 #3009, PR1 #3012, PR2 #3013, PR3 #3016, PR4 #3015, PR5 #3017 — all six merged in order after internal adversarial review, followed by integration-fix PR #3025 (FIB-aware coverage counts, admin-curated languages honored on the client, flag gates on the post-publish advisory and editor hashing, free-response fallback). The feature is live behind the admin-only `quiz-translation` flag (D30). Still outstanding: the §11 PR3 preview-URL gate (a real SSO student with `language: 'es'` and hidden options), the §15 `countTokens` spike and Vertex budget alert, and the follow-ups listed in the PR bodies. Spec history: revised 2026-09-13 (final pre-implementation review: citations re-verified against `b2b6ca6`, six decisions added D31–D36, §11 rewritten as self-contained per-PR briefs).
**Ships as 6 stacked PRs (§11).** PR0 is a prerequisite that is not part of this feature.
**Scope:** Quizzes only, **SSO-assigned quizzes only** (D15). Video activities / guided learning / mini-apps are out of v1; the payload shape and the `StudentOverride` field generalize without a rewrite.
**Target languages: Spanish, Somali, Hmong** (D19). All Latin-script.

## 0. How to use this document

- **Implementing a PR:** read §0, §2, and your PR's brief in §11. Each brief names the exact sections to read, the files to touch, the tests to write, and its acceptance gate. Do not read the whole document.
- **Every PR touching serving or grading (PR1, PR3, PR5):** §4 is mandatory, in full. §4.4–4.5 is where a naive implementation mis-grades a child.
- **Citations** are `file:line` against commit `b2b6ca6`. Treat them as anchors, not gospel: `grep -n` the symbol first, then read the range.
- **Do not read `docs/plans/QUIZ_READ_ALOUD.md` as a spec.** Read-aloud shipped and diverged from it. Read the shipped code instead: `functions/src/quizReadAloud.ts:1185-1235` (callable shape), `:506-513` (quota doc ids), `config/quizReadAloud.ts` (config module), `components/admin/QuizReadAloudConfigurationPanel.tsx` (admin panel), `config/featureDefaults.ts` (flag registration).
- **Appendix A** lists approaches that were evaluated and rejected. Do not re-propose them.
- **Comments in code:** one short line max (repo rule). Rationale from this doc goes in the PR description, not the diff.

## 1. Feature summary

A student's **language** becomes a per-student accommodation, exactly like extended time, read-aloud, or hidden answer choices. A teacher (or EL coordinator) sets a student's language once on the roster; every quiz that student is assigned renders in that language, with a toggle back to English.

Teachers generate translations with AI from a new **Languages** tab in the quiz editor, review and correct them, and mark them reviewed. Nothing unreviewed is ever served to a student.

**Why an accommodation and not a student-facing picker:** it reuses machinery that already exists end-to-end, and the teacher — not the 6th grader — decides.

**"Auditable" means:** the _accommodation_ is recorded and honored (it rides the pointer doc like every other override). The _translation review_ is not an attestation record — `reviewedQuestionIds` carries no reviewer identity or timestamp (D26). Do not describe the review gate as an audit trail in UI copy.

## 2. Locked decisions

| #   | Decision                           | Choice                                                                                                                                                                                         |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Who picks the language             | Per-student accommodation on `StudentOverride`, with a standing default on the roster (**needs PR0**)                                                                                          |
| D2  | Storage                            | Sidecar per language: separate Drive file per language, index in `QuizMetadata`                                                                                                                |
| D3  | Target languages                   | Admin-curated per-district list, seeded with D19's three                                                                                                                                       |
| D4  | Review gate                        | **Review-then-publish.** Unreviewed translations are never written to a session doc                                                                                                            |
| D5  | Missing translation at assign time | Warn + one-click generate in the assign flow; teacher may proceed anyway (student gets English)                                                                                                |
| D6  | Student display                    | Translated by default, one toggle to English (§4.6 — **one control, not one per question**)                                                                                                    |
| D7  | Answer side                        | Translate the answer content; **grade in English space** (§4.5)                                                                                                                                |
| D8  | Staleness                          | Per-question content hash; editing one question marks only that question stale in each language                                                                                                |
| D9  | What gets translated               | Question content and rubric criteria/descriptors. Quiz **title** via `QuizSession.quizTitleLocalized` (D27). No directions field exists                                                        |
| D10 | Stimuli                            | Warning only in v1. No vision/OCR. Labels are never translated (§3.4)                                                                                                                          |
| D11 | Review surface                     | New **Languages** tab in `QuizEditorModal`, quiz owner reviews                                                                                                                                 |
| D12 | Generation                         | New `translateQuizV1` Cloud Function; metered per quiz × language, one Gemini call per language                                                                                                |
| D13 | Admin gate                         | Curated list + feature toggle + monthly org cap, on the read-aloud admin surface (merged — D24)                                                                                                |
| D14 | Free-response back-translation     | Teacher-side, **explicit per-response button** (§6). Not lazy-on-open                                                                                                                          |
| D15 | Who can receive a translation      | **SSO students only.** Structurally enforced — `AssignStudentPicker.tsx:478-485` already disables the rest                                                                                     |
| D16 | Where translations live            | **On `QuizPublicQuestion` itself** (`localized`), not a parallel session-level map (§4.2)                                                                                                      |
| D17 | Source language                    | v1 requires `QuizData.language` English or absent. Generate disabled otherwise                                                                                                                 |
| D18 | Response language                  | `QuizResponseAnswer.locale` stamped at submit. **Per-call field** — see §4.5                                                                                                                   |
| D19 | Target languages                   | **Spanish (`es`), Somali (`so`), Hmong (`hmn`)**. All Latin-script. Karen is out — no Cloud Translation or TTS support                                                                         |
| D20 | Model + cost posture               | `geminiConfig.standardModel` (`gemini-3.5-flash-lite`), `thinkingLevel: 'minimal'`, `temperature: 0.2`, hard caps. **~$68/district-yr**                                                        |
| D21 | FIB                                | **FIB is not translated in v1.** Question stays English. No `gradeAnswer` change                                                                                                               |
| D22 | Answer cache                       | **Cache holds the English canonical value. Localization is display-only** (§4.5). The single most important decision here                                                                      |
| D23 | Review + staleness gating          | **Both gated at publish.** No hash of any kind on the session doc (§4.3)                                                                                                                       |
| D24 | Admin surface                      | **One merged "Quiz Languages" tab** — rename and extend `QuizReadAloudConfigurationPanel`                                                                                                      |
| D25 | Read-aloud × translation           | **Suppress the speaker control on translated questions.** Target-language synthesis deferred to v2 (§4.7)                                                                                      |
| D26 | Attestation                        | `reviewedQuestionIds` stays `string[]`. No reviewer identity or timestamp                                                                                                                      |
| D27 | Title and directions               | `QuizData` has no `directions` field. Translated **title** rides `QuizSession.quizTitleLocalized` (§4.2)                                                                                       |
| D28 | Spanish app chrome                 | When `override.language === 'es'`, also switch the i18n language **without persisting it** (D34). Somali/Hmong keep the English shell                                                          |
| D29 | Bank-slot quizzes                  | A quiz with `bankSlots` cannot be translated. Languages tab disabled with a reason; §10 treats it as untranslated                                                                              |
| D30 | Rollout                            | `quiz-translation` global feature: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`                                                                            |
| D31 | Staleness storage                  | **`sourceHashes` are copied into the `QuizMetadata` index entry.** `staleCount` is recomputed from the in-memory quiz body at each metadata write. **A quiz save never writes a sidecar** (§9) |
| D32 | Source-language index              | **`QuizMetadata.language`** is added, derived from `QuizData.language` at the same four write sites, so D17 is answerable with zero Drive calls (§10)                                          |
| D33 | Standing default merge             | `applyDefaultOverride` **fills in `language`** on an existing per-assignment draft that lacks it. All other keys keep today's whole-object short-circuit (§3.1)                                |
| D34 | i18n switch is ephemeral           | The D28 switch **must not write `spart_language` to localStorage** (`i18n/index.ts:36-37`). Shared Chromebooks (§4.6)                                                                          |
| D35 | Content hash                       | SHA-256 hex, first 16 chars, over the serializer in §9. **Duplicated** in root and `functions/` (they share no modules) and pinned by one shared fixture file asserted in both Vitest projects |
| D36 | Answer conversion boundary         | Two pure helpers, `toDisplayAnswer` / `toCanonicalAnswer` (§4.5). Cache, Firestore, and saved answers are always English; conversion happens only at the input boundary                        |

## 3. Data model

### 3.1 `StudentOverride` gains a language (`types.ts:4992`)

```ts
export interface StudentOverride {
  // …existing eight fields unchanged…
  /** BCP-47 code: 'es' | 'so' | 'hmn'. Absent = English. Must appear in the org's curated list. */
  language?: string;
}
```

**It does NOT ride the existing paths for free.** There are **three** closed allowlists between the roster and the student, and each silently drops an unknown key:

1. `functions/src/studentAssignmentTargets.ts:341` `sanitizeOverride()` — hand-copies eight fields. Add:
   ```ts
   if (
     typeof src.language === 'string' &&
     LANGUAGE_TAG_RE.test(src.language.trim())
   )
     out.language = src.language.trim();
   ```
   `LANGUAGE_TAG_RE` is `/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/` at `functions/src/quizReadAloud.ts:516` (accepts `hmn`). **Export it from `quizReadAloud.ts` and import it** — do not duplicate.
2. `functions/src/studentAssignmentTargets.ts:142-151` — `functions/` carries its **own duplicate `StudentOverride` interface** and does not import root `types.ts`. Adding the field to `types.ts` alone produces **no type error** in `pnpm run type-check:all`. Add `language?: string` here too.
3. `hooks/useRosters.ts:171` `parseStudentOverride()` — same whitelist on the Drive roster read path. Without a branch, the standing default never survives a reload.

Paths that work once those three are fixed:

- `ClassRoster.defaultOverridesByStudentId` (`types.ts:195`) — the standing accommodation. **No writer exists yet — that is PR0.**
- `AssignStudentPicker.tsx:121-131` `applyDefaultOverride` reads that default and applies it whole-object, short-circuiting at `:127` when a per-assignment draft already exists. **D33:** change the short-circuit so that when a draft exists, lacks `language`, and the standing default has one, the draft gains `language` only. Nothing else about the short-circuit changes.
- `QuizAssignment.overridesBySourcedId` / `overridesByStudentUid` (`types.ts:5196`, `:5200`).
- `StudentAssignmentPointer.override` (`types.ts:5018`).

Add a `language` chip to `summarizeOverride` (`utils/studentOverrideSummary.ts`, following `readAloud` at `:68-71`) plus `studentOverride.chip.language` in all four locale files. Decide in `utils/studentOverrideModifiedNote.ts` whether `language` counts as "modified" (yes — it changes what the student sees).

**Two structural differences from every existing override:**

1. **It is the first _additive_ override.** Language requires content that must already exist and be published. `StudentOverride` stays true to its doc comment (_"Never stored on session docs"_) — the override carries only the language _code_; the translated payload travels on the session doc (§4).
2. **It only reaches SSO students (D15)**, already enforced structurally: `components/quiz/QuizStudentApp.tsx:567` resolves the pointer doc only when `isStudentRole`; `AssignStudentPicker.tsx:478-485` disables non-SSO students with `t('assignStudentPicker.needsSso')`. No new UI prose is needed.

**Naming caution:** `QuizSession.language` **already exists** (`types.ts:3983`) and means _the quiz's read-aloud source voice_ (maintained on PLC re-sync at `useQuizAssignments.ts:2129`). Do not overload it.

### 3.2 Translation payload (Drive sidecar)

```ts
/** One question's translated strings. Positionally aligned with the English question. */
export interface QuestionTranslation {
  text: string;
  /** MC: index-aligned with the projection's pre-shuffle array `[correctAnswer, ...incorrectAnswers.filter(Boolean)]`. */
  choices?: string[];
  /** Matching: index-aligned with the parsed pairs of `correctAnswer`. */
  matchingLeft?: string[];
  matchingRight?: string[];
  /** Matching: index-aligned with `(matchingDistractors ?? []).filter(Boolean)`. */
  matchingDistractors?: string[];
  /** Ordering: index-aligned with `correctAnswer.split('|')`. */
  orderingItems?: string[];
  /** Free response only. */
  placeholder?: string;
  /** Free response only. Structurally identical to the English `rubricSnapshot`. */
  rubricSnapshot?: Rubric;
}

export interface QuizTranslation {
  locale: string;
  title: string;
  questions: Record<string, QuestionTranslation>;
  /** Per-question hash (§9) of the English source at translation time. */
  sourceHashes: Record<string, string>;
  /** Question ids the teacher has explicitly approved. Only these are ever projected. */
  reviewedQuestionIds: string[];
  model: string;
  generatedAt: number;
  updatedAt: number;
}
```

`QuizData` is `{id, title, questions, stimuli?, language?, bankSlots?, order?, createdAt, updatedAt}` (`types.ts:3715-3729`). There is no `directions` field.

**Index alignment is the load-bearing invariant of this design.** Every array above must be the same length and order as the English source it mirrors. Generation validates it server-side (§5) and rejects any output that violates it.

**Align against the _filtered_ arrays.** `toPublicQuestion` builds MC choices from `[q.correctAnswer, ...q.incorrectAnswers.filter(Boolean)]` (`hooks/useQuizSession.ts:347-350`) and matching distractors from `(q.matchingDistractors ?? []).filter(Boolean)` (`:360`). Authored quizzes do contain empty entries. Define alignment against the filtered arrays in the prompt, the validator, and the hash serializer.

**`rubricSnapshot` and `placeholder` are free-response only** — projected only inside the `isFreeResponseType` branch (`hooks/useQuizSession.ts:371-386`). The English rubric is already public and carries no answer key (`types.ts:3895-3901`).

### 3.3 Storage (D2, D31, D32)

Translations do **not** go inline in the quiz JSON (`QuizData` is fully loaded from Drive on every editor open, publish, and PLC sync).

- Each `QuizTranslation` is its own Drive file alongside the quiz, loaded lazily.
- `QuizMetadata` (`types.ts:3755`) gains a Firestore index so the library and assign flow answer _"does a reviewed, fresh Spanish version exist?"_ with **zero Drive calls**:

```ts
export interface QuizTranslationIndexEntry {
  driveFileId: string;
  reviewedCount: number;
  staleCount: number;
  questionCount: number;
  /** Copy of the sidecar's sourceHashes (D31). Lets staleCount be recomputed without Drive. */
  sourceHashes: Record<string, string>;
  updatedAt: number;
}
// on QuizMetadata:
translations?: Record<string, QuizTranslationIndexEntry>;
/** Copy of QuizData.language (D32). Absent = English. */
language?: string;
```

**`QuizDriveService` has no sidecar API — this is new public API.** `saveQuiz` hard-codes filename and payload type (`utils/quizDriveService.ts:230-231`); `loadQuiz` returns `QuizData` through `normalizeQuizData`; the folder helpers (`getOrCreateFolder:181`, `getQuizFolderId:214`) are `private`. Add:

```ts
saveTranslation(quizId: string, quizTitle: string, locale: string, payload: QuizTranslation, existingFileId?: string): Promise<string /* fileId */>;
loadTranslation(fileId: string): Promise<QuizTranslation>;
deleteTranslation(fileId: string): Promise<void>;
```

Sidecar name: `${sanitizeDriveFileName(title)}.${id.slice(0,8)}.${locale}.tr.json`, mirroring the name-collision fallback at `:246-270`. No OAuth scope change: `drive.file` (`config/firebase.ts:84`) covers app-created files; the sidecar sits in the existing `SpartBoard/Quizzes` folder.

**The index is destroyed by every quiz save unless preserved.** `hooks/useQuiz.ts` rebuilds `QuizMetadata` field-by-field and writes it with a **non-merging** `setDoc`, preserving only `folderId` / `sync` / `behavior`. At **all four** sites, carry `translations` forward (with `staleCount` recomputed per §9) and write `language` from the quiz body:

- `:288-316` `saveQuiz`
- `:350-379` `pullSyncedQuiz` — auto-fired by `hooks/usePlcAutoPullSync.ts`, so a peer's edit runs this with no teacher action
- `:434-453` `detachSyncedQuiz`
- `:621` duplicate path

**Write order:** Drive sidecar first, then the index; on index failure delete the sidecar (the `duplicateQuiz` precedent at `hooks/useQuiz.ts:625-637` rolls back Drive, not Firestore).

**Copy / archive / sync paths** — both real copy paths construct `QuizData` field-by-field, so a new field **silently drops** by default. Each decision is explicit:

| Path                                                           | v1 decision                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `hooks/useQuiz.ts:580-640` duplicate                           | **carry** — copy each sidecar to a new Drive file, rebuild index entries |
| `hooks/useSyncedQuizGroups.ts:235`/`:376` PLC sync (`Pick<…>`) | **drop in v1** — PR5 carries; blocked at the rules layer today (§11 PR5) |
| `components/widgets/QuizWidget/adapters/quizImportAdapter.ts`  | **drop** — already true with zero work                                   |

### 3.4 Stimuli (D10) — warning only

`utils/quizStimuli.ts:115` strips stimulus labels before the session doc is written and `QuizStimulusView` never renders them. **Students never see stimulus labels — do not translate them.**

Text _inside_ an image is out of scope. Add `'stimulus-text'` to the `QuizAdvisoryId` union in `utils/quizAuthoringAdvisory.ts` and emit one **counted, quiz-level** line through the existing `QuizAuthoringAdvisory` banner (props `{ questions, shuffleQuestionsEnabled? }`): _"3 images may contain text that stays in English."_ Quiz-level because stimuli are shared across questions via `QuizQuestion.stimulusIds` (`types.ts:3444`).

**Two student-visible strings are deliberately out of scope and named in §13:** `QuizStimulus.readAloudText` (projected at `utils/quizStimuli.ts:119-135`, rendered at `QuizStudentApp.tsx:1776-1795`) and `QuestionTargetTag.label` when `showLearningTargets` is on (`useQuizAssignments.ts:728-730`).

## 4. Serving to students — READ THIS BEFORE CODING

### 4.1 The trap

`toPublicQuestion` (`hooks/useQuizSession.ts:338`) is a hand-written allowlist with security design behind it:

- MC `choices` are **Fisher-Yates shuffled** (`:347-350`, `Math.random()` at `:327`) so the correct answer's position is unknown.
- Matching `matchingRight` is shuffled _and_ merged with distractors (`:362-369`); the distractor list is deliberately **not** exposed (comment at `:366-368`).
- Ordering `orderingItems` are shuffled (`:370`).
- `matchingLeft` is **never** shuffled (`:361`).
- `correctAnswer` never appears.

Shipping `QuizTranslation` to the session doc as a parallel payload defeats all of it — the translated arrays are in _source_ order, so position alone gives away the key.

**Absolute rule: nothing on the session doc may be a function of `correctAnswer`, `incorrectAnswers`, or `matchingDistractors`.** Not the strings, not a hash. A per-question hash next to shuffled choices is a brute-forceable oracle (4-choice MC = 24 candidates, hashed with the serializer that ships in the client bundle).

### 4.2 The fix: translate inside the projection, through the same shuffle

Translations attach to the **question object itself** (D16):

```ts
/** Locale-specific strings for one public question. Every array is the same length and order as the sibling array on the question. */
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
// on QuizSession (D27):
quizTitleLocalized?: Record<string, string>;
```

`LocalizedQuestionStrings` has **no `matchingDistractors`**; `QuestionTranslation` does. **Never spread the sidecar entry** (`localized[loc] = translation.questions[qid]` re-exposes the distractor list). Build `localized[loc]` **field-by-field inside the same per-type branches** as the English fields. The Matching branch constructs `localized.matchingRight = permute([...translatedPairRights, ...translatedDistractors])` — concatenated in exactly the order the English merge uses (`:362-369`) _before_ permuting. `placeholder` / `rubricSnapshot` stay confined to the free-response branch.

`toPublicQuestion` computes each shuffle permutation **once** per question, then applies it to the English array and to every locale's array.

**Signatures — implement literally:**

```ts
// hooks/useQuizSession.ts
export function toPublicQuestion(
  q: QuizQuestion,
  translations?: Record<string, QuestionTranslation> // locale -> this question's payload, pre-filtered to reviewed+fresh
): QuizPublicQuestion;
function randomPermutation(length: number): number[]; // NEW, replaces inline fisherYatesShuffle at :324

// utils/quizShuffle.ts — NEW. seededShuffle (:52) becomes seededPermutation + apply; add a test that old and new agree for 200 seeds × lengths 2..8.
export function seededPermutation(length: number, seed: string): number[];
```

Both wrappers gain the same `translations` argument: `toGatedPublicQuestion` (`hooks/useQuizAssignments.ts:707`) and `projectPublicQuestionForMode` (`:721`). The caller passes a per-quiz map `Record<locale, QuizTranslation>` and the wrapper selects `translation.questions[q.id]` per question, applying the reviewed+fresh filter there (§4.3).

**Which locales get projected:** at publish, the union of `language` across the assignment's targeted overrides — `overridesBySourcedId` is destructured from `options` at `hooks/useQuizAssignments.ts:801` and written at `:883-884`. Project only questions **both** in `reviewedQuestionIds` **and** hash-fresh.

**Publish sites.** `toPublicQuestion` has exactly **one** production caller chain: `:709` via `toGatedPublicQuestion` → `projectPublicQuestionForMode`, reached from `:914` (create) and `:1985` (PLC re-sync). Everything else is tests.

**Loading sidecars at publish.** `toGatedPublicQuestion` is a `useCallback` with no Drive access. In `createAssignment`, before `sessionPublicQuestions` is built at `:913`, load the needed locales' sidecars with **`Promise.allSettled` in parallel** (`utils/googleDriveService.ts:92-113` `fetchWithRetry` retries once on 401 only; a 429 on one locale must not drop the others). A failed locale is dropped and logged; the student gets English (the outcome D5 already warns about). **Never block a publish.** Also write `session.quizTitleLocalized` from each loaded sidecar's `title`.

**Session doc size.** Each locale adds ~320 B/question; 40 questions × 3 locales ≈ 55 KB on ~16 KB English. Keep a defensive assertion on **serialized UTF-8 bytes** (`new TextEncoder().encode(JSON.stringify(session)).length`) against a ~900 KB budget, and drop locales by ascending targeted-student count if it trips.

**Egress, accepted deliberately.** Every student's `onSnapshot` (`hooks/useQuizSession.ts:1753-1783`) delivers all locale payloads to all students: ~$45/district-year. A sibling `/quiz_sessions/{id}/locales/{locale}` doc would reintroduce exactly the desync D16 prevents — do not.

### 4.3 Review and staleness are BOTH gated at publish (D23)

The projection holds the live quiz body _and_ the sidecar, so it enforces "in `reviewedQuestionIds` **and** `sourceHashes[q.id] === hash(q)`" in one comparison, omitting the locale entry otherwise.

**No staleness check at render.** `publicQuestions` is a **frozen snapshot** — written at `:914`, touched again only by `:1985` — so a render-time comparison against a publish-time hash is a tautology, and shipping the hash violates §4.1. A question reviewed at publish serves the translation it was published with, matching the English the student reads, even if the teacher edits mid-session.

Render side is a pure presence check, factored like `serveQuestionSubset` / `applyHiddenOptions`:

```ts
// utils/quizOverrideServing.ts
export function serveLocalizedQuestion(
  q: QuizPublicQuestion,
  locale: string | undefined
): LocalizedQuestionStrings | null;
```

### 4.4 The three client transforms

After the session doc is written, `QuizStudentApp` applies more transforms:

| Transform                                 | Where                                                                  | What it does                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyHiddenOptions`                      | `utils/quizOverrideServing.ts:32`, called at `QuizStudentApp.tsx:1749` | Filters **`choices` only** (MC) **by literal English text** — hidden-option values are option text, not ids (`types.ts:4994`)                                                                                                                                 |
| `shuffleQuestionForStudent`               | `utils/quizShuffle.ts:69`, called at `QuizStudentApp.tsx:1752`         | **Re-shuffles** `choices` / `matchingRight` / `orderingItems` with a per-student seed. On by default (`session.shuffleAnswerOptions !== false`, `:1746`)                                                                                                      |
| `MatchingResponseInput` word-bank shuffle | `components/quiz/MatchingResponseInput.tsx:47-54`, applied at `:249`   | Unseeded `Math.random()` on mount. **Already locale-safe** — permutes _indices into_ `allOptions`; `emit` dereferences through `allOptions[idx]` (`:276-287`). `OrderingResponseInput` is the same shape. **Do not refactor these into `reindexChoiceArray`** |

The first two each independently break the invariant (a student with `hiddenOptionIdsByQuestion` **and** `language` gets English length `n-1` against a localized length `n`; the re-shuffle permutes English only).

**Fix: make index operations structural.** Add `utils/quizLocalizedArrays.ts`:

```ts
/** Re-index one choice-bearing array and every locale's sibling array with the same indices
 *  (a permutation or a kept subset). Identity fast path when q.localized is absent.
 *  matchingLeft is deliberately excluded: nothing permutes it (useQuizSession.ts:361, quizShuffle.ts:77-79). */
export function reindexChoiceArray(
  q: QuizPublicQuestion,
  field: 'choices' | 'matchingRight' | 'orderingItems',
  indices: number[]
): QuizPublicQuestion;
```

Both call sites become "compute indices, call `reindexChoiceArray`": `applyHiddenOptions` computes kept indices from the English text match; `shuffleQuestionForStudent` computes a permutation via `seededPermutation`. The existing "refuse to hide the correct answer" guard (`components/widgets/QuizWidget/Widget.tsx:1575-1580`) operates on the English quiz body and stays valid.

**The PLC re-sync path cannot carry locales and must refuse (v1).** `syncAssignmentToLatest` (`hooks/useQuizAssignments.ts:1916`) sources from `pullSyncedQuizContent` (`hooks/useSyncedQuizGroups.ts:221-245`) — a **Firestore** doc with no Drive handle — then rewrites `publicQuestions` with a fresh unseeded shuffle at `:1985`. Refuse when the session carries any `localized`, mirroring the `resolvedDriveFileId` throw at `:1946`. PR5 lifts this.

### 4.5 Grading: the answer cache holds English (D22, D36)

**MC is answered by VALUE, not index.** `QuizStudentApp.tsx:2767` is `const options = currentQuestion.choices ?? []`; `:3157` and `:3174` are `onClick={() => setCacheForCurrent(opt)}` — the option **string** goes into the cache; selection is value-compared at `:3143`; display index is reverse-derived with `options.indexOf(opt)` (`:3167`). **Do not convert MC to index-based picking** — value-keying survives re-permutation; an index would not.

**`answerCache` (`QuizStudentApp.tsx:1868`, documented at `:1863-1867` as "the canonical serialized form per type") stores the English canonical value.** This matters because **five write paths reach Firestore and none has a conversion hook**:

| Write path                                    | file:line                      |
| --------------------------------------------- | ------------------------------ |
| debounced draft autosave (500 ms, every type) | `QuizStudentApp.tsx:2263-2305` |
| timer auto-submit                             | `QuizStudentApp.tsx:2150-2170` |
| visibility / `beforeunload` / unmount flush   | `QuizStudentApp.tsx:2339-2393` |
| `handleSubmit`                                | `QuizStudentApp.tsx:2490-2520` |
| `handleSubmitAndAdvance`                      | `QuizStudentApp.tsx:2642`      |

All five converge on `submitAnswer` (`hooks/useQuizSession.ts:2524`). `publishAssignmentScores` maps over **all** answers regardless of `status` (`hooks/useQuizAssignments.ts:2346`), so a closed-lid draft is enough to be graded. _(`types.ts:4275-4278` is stale — drafts are type-agnostic, per the effect at `QuizStudentApp.tsx:2240` and comment at `:2296-2300`.)_

**The conversion boundary (D36).** Add `utils/quizLocalizedAnswer.ts`:

```ts
/** English canonical -> displayed form for `locale`. Identity when locale is absent or q.localized[locale] is missing. */
export function toDisplayAnswer(
  q: QuizPublicQuestion,
  locale: string | undefined,
  canonical: string
): string;
/** Displayed form -> English canonical. Same identity rule. */
export function toCanonicalAnswer(
  q: QuizPublicQuestion,
  locale: string | undefined,
  display: string
): string;
```

Per type, mapping is **by index between the (already lockstep) English and localized arrays on `q`**:

- **MC** — `choices[i]` ↔ `localized.choices[i]`.
- **Ordering** — `split('|')`, map each item, rejoin with `'|'`.
- **Matching** — `split('|')`; each pair via `indexOf(':')` (not `split(':')`), term via `matchingLeft`, definition via `matchingRight`; rejoin.
- **Free response / FIB** — identity.
- On a lookup miss, try the other array (the value may already be in the target form); if still missing, return the input unchanged and `console.error` once. Never throw.

**Where the boundary sits:**

- **Out of an input → `toCanonicalAnswer`:** the MC `onClick` at `:3157`/`:3174`, and `StructuredQuestionInput.onChange` (which receives `emit` output from Matching/Ordering).
- **Into a display → `toDisplayAnswer`:** `isSelected = liveAnswer === opt` (`:3143`) and the `savedAnswer` prop into `StructuredQuestionInput` (`:3379`). Both structured inputs rehydrate by string-matching against the _displayed_ array (`MatchingResponseInput.tsx:230-236`, `OrderingResponseInput.tsx:260-264`); without this a student who placed four pairs returns to **four empty drop zones** while `canSubmit` (`:3678-3691`) still accepts the English string.
- **No change:** `savedAnswerForCurrent` seeding (`:1985-2000`) and both saved-equal short-circuits (`:2249`, `:2377`) compare English to English and stay untouched.

**Byte-identity of the English round-trip holds per type:** MC writes the English string verbatim (`gradeAnswer` normalizes anyway, `hooks/useQuizSession.ts:556-560`); Ordering items are exact substrings of `correctAnswer.split('|')` rejoined with `'|'` (`OrderingResponseInput.tsx:300-307`); Matching `terms` order equals `correctAnswer` pair order and `gradeAnswer` splits on `indexOf(':')` (`:581-596`). **This holds only while the English strings remain on the question at submit time** — `localized` rides _alongside_ English (D16), never replaces it. State it as an invariant in the code.

**Consequence:** results, live monitor, leaderboard, Sheets export and LMS grade push are **untouched** — `buildDistribution` buckets by `counts[ans.answer]` against English options (`monitor/monitorUtils.ts:120-137`).

**FIB is not translated (D21)**, so **no `gradeAnswer` change ships**, including `functions/src/plcAssessmentMath.ts:465` `gradeGroupAnswer` (a server-side reimplementation). See Appendix A for why the awaiting-grade route was unbuildable.

**`locale` is a PER-CALL field (D18).** `submitAnswer` spreads `priorEntry` then re-owns per-call fields (`delete newAnswer.speedBonus` `:2618`, `.isCorrect` `:2619`, `.timedOutUnderMinimum` `:2622`). `locale` joins that list, then is set from the call — set only when the student answered while a localized rendering was active; otherwise absent. Also set it in `commitRecordingTake` (`hooks/useQuizSession.ts:2808-2818`), which constructs `newAnswer` fresh: a recorded free-response answer (`QuizQuestion.recording`, `types.ts:3448-3452`) bypasses `answerCache` and §6 needs the stamp.

### 4.6 Student UI (D6, D28, D34)

The student's language is `StudentAssignmentPointer.override.language` (`QuizStudentApp.tsx:572`). Render from `serveLocalizedQuestion(currentQuestion, activeLocale)`, falling back to English per question.

**One segmented control.** The question header (`:2991-3037`) already carries three children; a fourth collides at 375px. Extract the toolbar chrome from `components/quiz/readAloud/ReadAloudToolbar.tsx` into `components/quiz/StudentAccommodationBar.tsx` (same classes: `sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur` → `mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2`, **plus `flex-wrap`** on the inner row), and change `QuizStudentApp.tsx:2953` to render it when `readAloudOn || localeOn`. The toggle is `English | {nativeLabel}` (from `QUIZ_TRANSLATION_LANGUAGES`, §7), `aria-pressed` per side, `min-h-11`, in the `ml-auto` group.

**Toggle state:** `activeLocale: string | undefined` resets to `override.language` on every question advance.

**The toggle must not wipe in-progress work.** `MatchingResponseInput` keys placements by **left-term text** (`:213-217`) and resets on `useResetOnChange(question.id, …)` (`:264`). So:

1. Key `StructuredQuestionInput` on `${question.id}:${activeLocale ?? 'en'}`.
2. The `savedAnswer` prop is `toDisplayAnswer(q, activeLocale, cacheValue)`, so remounting in the other language rehydrates from the English cache.
3. Test: "toggling locale mid-question preserves the student's placement."

**Student results recap.** The surface is **`PublishedScoreReview` (`:4111`)**, not `ReviewPhase` (`:3910`, teacher-paced and unreachable for SSO students). Resolve three strings through `localized`: question text (`:4581`), the student's own answer (`:4503`, via `formatAnswerForDisplay` at `:4605-4610` — apply `toDisplayAnswer` first), and `revealedAnswers[q.id]` (`:4526`, same).

**Spanish app shell (D28, D34).** Spanish is an app locale (`i18n/index.ts:10-15`). When `override.language` matches an app locale, render the student app in that language. **Requirement:** the detector caches to `localStorage['spart_language']` (`i18n/index.ts:36-37`), and a plain `i18n.changeLanguage('es')` writes it, so the next user of a shared Chromebook inherits Spanish. The implementation must leave `spart_language` unchanged — pick any mechanism (restore the key synchronously after the switch, or scope the language to the student subtree), gated by the test: _after a translated student session, `localStorage.getItem('spart_language')` equals its value before the session._

### 4.7 Read-aloud × translation (D25) — suppress the speaker

When a question renders localized, pass `enabled: false` to `useQuizReadAloud` (or suppress `readAloudOn`) for it; the control returns on the English toggle. No explanatory copy.

This also fixes a live bug: `useQuizReadAloud.choicePart` resolves `canonical.choices.indexOf(text)` (`components/quiz/readAloud/useQuizReadAloud.ts:475-479`) against English, so localized choices get no speaker — but `{kind:'question'}` needs no lookup, so the stem would play **English audio over translated text**.

**Target-language synthesis is v2**, recorded so v2 starts from facts: `QuizReadAloudManifest.voice` is a scalar (`types.ts:3578`); `files` is keyed by `partKey(questionId, part)` with no locale dimension (`functions/src/quizReadAloud.ts:282`); `prepareQuizReadAloud` resolves one `language` from `session.language` (`:799-803`) and the callable takes only `{ sessionId }` (`:1197-1201`); `enumerateParts` (`:391-428`) reads only English fields; `QUIZ_READ_ALOUD_VOICES` (`config/quizReadAloud.ts:20`) has no Somali or Hmong voice and Cloud TTS offers none.

## 5. Generation (D12, D20)

New Cloud Function `translateQuizV1` in `functions/src/quizTranslation.ts`, following the callable shape of `functions/src/quizReadAloud.ts:1185-1235` and the structured-output pattern of `functions/src/aiGeneration.ts`.

**Registration.** `functions/src/index.ts`: `export { translateQuizV1 } from './quizTranslation';`. Region comes from `setGlobalOptions` in `functions/src/functionsInit.ts` — side-effect-import it. **There is no App Check in this repo — do not add it.**

```ts
export const translateQuizV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    if (request.auth.token.studentRole === true)
      throw new HttpsError('permission-denied', 'Teacher account required.');
    // …
  }
);
```

`ALLOWED_ORIGINS` imports from `./classlinkShared`. Auth checks mirror `quizReadAloud.ts:1192-1195`.

**Contract.** The client sends the questions and writes the sidecar itself via `QuizDriveService` (the function has no Drive access without the encrypted-refresh-token path in `functions/src/googleOAuth.ts`, which not every teacher has).

```ts
export interface TranslateQuizRequest {
  quizId: string;
  locale: string; // must be in admin_settings/quiz_translation.enabledLanguages
  title: string;
  sourceLanguage?: string; // QuizData.language; D17 predicate below
  questions: QuizQuestion[]; // the FULL normalized quiz, for terminology consistency
  questionIds?: string[]; // subset to (re)translate; absent = all + title
}
export interface TranslateQuizResponse {
  title?: string; // present only when questionIds is absent
  questions: Record<string, QuestionTranslation>;
  sourceHashes: Record<string, string>; // §9 hash for every returned id — the function is the hash author
  model: string;
  outputTokens: number;
  cap: { remaining: number; total: number }; // org monthly units
}
// Errors: 'resource-exhausted' with details { capRemaining: 0, capTotal }; 'failed-precondition' for D17 / disabled locale / bankSlots;
// 'invalid-argument' for validator failure after one repair attempt (details: the validator's message).
```

**Server checks, in order:** auth → `bankSlots` absent (D29) → D17 predicate `!lang || lang.toLowerCase().startsWith('en')` (the field defaults to `'en-US'`, `config/quizReadAloud.ts:6`) → locale enabled in `admin_settings/quiz_translation` (§7; use `QUIZ_TRANSLATION_LANGUAGES` codes when the doc is absent) → quota (below) → Gemini call → validate → bill in the same transaction shape as `billSynthesis` (`quizReadAloud.ts:602-631`).

**Model and config.** Do **not** route to `advancedModel`.

```ts
model: geminiConfig.standardModel,   // 'gemini-3.5-flash-lite' (aiGeneration.ts:47); honors the admin override at global_permissions/gemini-functions
config: {
  responseMimeType: 'application/json',
  responseSchema: buildQuizTranslationResponseSchema(),
  thinkingLevel: 'minimal',          // explicit: the repo sets no thinking config anywhere, and a thinking model would silently 2-4x output cost
  temperature: 0.2,
  maxOutputTokens: 16384,            // 4096 when questionIds is a stale-question batch
}
```

**Response schema** (Gemini structured output): `{ title: string, questions: Array<{ id: string, text: string, choices?: string[], matchingLeft?: string[], matchingRight?: string[], matchingDistractors?: string[], orderingItems?: string[], placeholder?: string, rubric?: { criteria: Array<{ name: string, descriptors: string[] }> } }> }`. Flat string arrays, same length and order as the source — the Cloud Translation `translateText` contract, adopted deliberately.

**Prompt requirements** (system instruction): target language by name and code; translate for the reading level of a K-12 student; preserve numbers, units, proper nouns, code, LaTeX and markup verbatim; keep every array the same length and order as the input; MC choices must remain mutually distinct; **never introduce `|` or `:` into matching or ordering strings**; output JSON only. Send each question as `{ id, type, text, choices: [correct, ...incorrectFiltered], matchingPairs: [{left,right}], matchingDistractors, orderingItems, placeholder, rubric }` — the model sees the pre-shuffle order, which is fine (teacher-authenticated, server-side).

Reject on `finishReason === 'MAX_TOKENS'` — a truncated array is a **misaligned** array. Parse with `parseGeminiJson` (`functions/src/parseGeminiJson.ts`), not `JSON.parse`.

**One Gemini call per quiz per language.** Regeneration re-translates **all stale questions for a language in one call** via `questionIds`, never one call per question.

**Validation is mandatory and server-side.** Do **not** reuse `validateAndBucketQuizQuestions` (`aiGeneration.ts:1443`) — it silently drops malformed items and handles no free-response fields. Write `validateQuizTranslation(source, output)` checking:

- Per-field length equality against the **filtered** source arrays.
- Every requested `questionId` present; no extras.
- MC choices mutually distinct after `normalizeAnswer` — `new Set(choices).size === choices.length`.
- `rubric` structurally identical to the English rubric (same criteria count, same descriptor count per criterion).
- No `|` or `:` in any matching or ordering string.
- On failure: **one** repair attempt with the validator's complaint appended, then `invalid-argument`. Never partial-serve.

**Quota (D20) — hard block, checked before the Gemini call.**

| Constant             | Value                                                                         | Notes                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Teacher daily        | **40** quiz-language generations at `ai_usage/{uid}_translation_{YYYY-MM-DD}` | Bounds one teacher to ~$0.32/day                                                                                              |
| Org monthly (units)  | **2,000** at `ai_usage/global_translation_{YYYY-MM}`                          | Default; admin-editable in `admin_settings/quiz_translation`                                                                  |
| Org monthly (tokens) | **8,000,000** output tokens, same doc                                         | The cap that bounds money. Increment from `result.usageMetadata.candidatesTokenCount`                                         |
| Enforcement          | `resource-exhausted`, incremented in the same transaction as the teacher row  | Read-aloud's cap **degrades** (`neural2Exhausted()`, `quizReadAloud.ts:589-600`); translation has no cheaper tier — **block** |

Mirror the doc-id helpers at `quizReadAloud.ts:506-513`. **Meter output tokens, not just calls** — no existing AI feature does (`grep -rn usageMetadata` returns zero hits).

## 6. Free-response back-translation (D14)

An **explicit per-response teacher button** in `components/widgets/QuizWidget/components/FreeResponseGrader.tsx`: "Translate this response". Native text and back-translation side by side, back-translation labeled machine-generated. **The native text is always the primary record.**

- **Free-response only** (FIB is not translated, D21). Shown only when `answer.locale` is set and non-English.
- **Callable:** `translateResponseV1` in the same `functions/src/quizTranslation.ts` module; request `{ text, sourceLocale }`, response `{ text, model }`. Same auth checks and model config as §5, `maxOutputTokens: 2048`.
- **Cache key: `sha256(answerText + locale)`**, mirroring `cacheHash` (`quizReadAloud.ts:670`) — not the response id (drafts autosave and retakes exist).
- **Cache location: a teacher-only top-level field on the response**, `backTranslations?: Record<string /*hash*/, { text: string; locale: string; model: string; at: number }>`. Never inside `answers.*`, which is on the student write whitelist (`firestore.rules:3445`). Mirror how `grading` is excluded from the student `hasOnly` (`firestore.rules:3436-3439`) and add `backTranslations` to the same exclusion; the teacher-owner write path that writes `grading` writes this too.
- **Quota:** separate `quizBackTranslation` key, **200/teacher/day**. Do not inherit `generateWithAI`'s `dailyLimit ?? 20` (`aiGeneration.ts:526-532`).
- `AnnotatedResponseView.tsx` needs **no change** — it anchors to a frozen `gradingSnapshot` (`:26-28`). Never write a back-translation into the snapshot.
- Optional one-liner in the grader: the student read a **translated** rubric; the teacher grades against the English snapshot. Intended.

## 7. Admin gating (D3, D13, D24)

**One merged "Quiz Languages" tab.** Rename and extend `components/admin/QuizReadAloudConfigurationPanel.tsx`, registered at `components/admin/AdminSettings.tsx:142-147` (`{ id: 'quiz-read-aloud', label: 'Quiz Read-Aloud', … }` — change the label only; keep the id). **Not** `FeatureConfigurationPanel.tsx:690` (a negative list feeding a placeholder), **not** `FeaturePermissionsManager.tsx:946`, **not** `QuizGlobalConfig` (`types.ts:4808`, dead code).

Reuse the panel's existing patterns; add no new visual vocabulary:

- **Language table** (`:130-208`) → columns `Language | Offer for translation (Toggle) | Read-aloud voice`, rendering **"—"** where a language has no `QUIZ_READ_ALOUD_VOICES` entry (Somali and Hmong will).
- **Cap + burn-down** (`:238-268`) → clone the `grid gap-4 sm:grid-cols-2` block for units and output tokens.
- **Dirty-gated Save** (`:270-296`), draft seeded once from the first snapshot (`:74-77`).

**Settings doc** `admin_settings/quiz_translation`:

```ts
export interface QuizTranslationSettings {
  enabledLanguages: string[]; // codes from QUIZ_TRANSLATION_LANGUAGES
  monthlyCapUnits: number; // default 2000
  monthlyCapOutputTokens: number; // default 8_000_000
  updatedAt: number;
  updatedBy: string;
}
```

**New config module** `config/quizTranslation.ts` (no existing catalog has native labels; `SUPPORTED_LANGUAGES` is the UI-locale axis, `QUIZ_READ_ALOUD_LANGUAGES` has no `nativeLabel`):

```ts
export const QUIZ_TRANSLATION_FEATURE = 'quiz-translation' as const;
export const QUIZ_TRANSLATION_SETTINGS_DOC = 'quiz_translation';
export const QUIZ_TRANSLATION_LANGUAGES: readonly {
  code: string;
  label: string;
  nativeLabel: string;
}[] = [
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'so', label: 'Somali', nativeLabel: 'Soomaali' },
  { code: 'hmn', label: 'Hmong', nativeLabel: 'Hmoob' },
];
export const QUIZ_TRANSLATION_DEFAULT_CAPS = {
  monthlyCapUnits: 2000,
  monthlyCapOutputTokens: 8_000_000,
} as const;
```

`nativeLabel` is **data** rendered to the student, never an i18n key. `functions/` needs its own copy of the codes and defaults (it imports nothing from root).

**Two `firestore.rules` carve-outs:**

1. `firestore.rules:699` is `match /admin_settings/{document=**} { allow read, write: if isAdmin(); }` with `/subjects` (`:704`) the only teacher-readable carve-out. Add, on a **separate** doc (never widen `quiz_read_aloud`, which holds TTS cap config):
   ```
   match /admin_settings/quiz_translation {
     allow read: if request.auth != null;
     allow write: if isAdmin();
   }
   ```
2. `ai_usage` reads are uid-prefixed (`:4192-4198`), so `global_translation_{YYYY-MM}` is unreadable by teachers. Do not widen. **`translateQuizV1` returns `cap`** on success and in the `resource-exhausted` details. Do **not** copy `QuizReadAloudConfigurationPanel.tsx:69`'s error handler (`setUsage({ neural2Chars: 0, … })`) into a teacher surface — it renders `permission-denied` as "0 of cap used."

**Feature toggle** registers in `components/admin/GlobalPermissionsManager.tsx` beside `quiz-read-aloud` (`:175`). Admin copy stays hard-coded English (§14).

## 8. Review UI (D11)

New `'languages'` tab in `components/widgets/QuizWidget/components/QuizEditorModal.tsx`. **Four sites, not two:**

1. `:277-279` — state union `useState<'questions' | 'stimuli' | 'settings'>`
2. `:510` — tab strip array `(['questions', 'stimuli', 'settings'] as const)`
3. `:548` — **contextPane** ternary chain (final `else` is Settings, `:549-558`)
4. `:562` — **detailPane** ternary chain (final `else` blurb at `:580`)

Adding to 1 and 2 without branches at 3 and 4 renders the Settings panel under the Languages tab **with no TypeScript error**. Labels derive from `tab.charAt(0).toUpperCase() + tab.slice(1)` (`:521`). Gate the tab on `canAccessFeature('quiz-translation')` as read-aloud does at `:247`, converting `:510` to a computed array **plus** a fallback to `'questions'` when access is revoked mid-session. `isBank` already hides the strip (`:482`, `:508`). Disable the tab with a reason when `quiz.bankSlots` is set (D29).

**Layout — two panes via `EditorWorkspace`** (`components/common/EditorWorkspace.tsx`, `contextRatio` 56):

- **contextPane** — language chip row (pattern: `components/settingsModal/sections/LanguageSection.tsx:38-67`), each chip `nativeLabel` + served count; Generate button with **one** conditional disabled reason; question list with Reviewed checkbox, Stale badge, "Regenerate N stale questions". Quiz-level advisory strip (§3.4) at top, conditional.
- **detailPane** — English / target side by side for the **selected** question, inline editing.

**Hook** — `hooks/useQuizTranslations.ts`, independent of the modal's `isDirty`/`handleSave` (a discarded quiz edit must not lose a translation edit; a quiz save must not push unreviewed strings):

```ts
export function useQuizTranslations(
  quiz: QuizData | null,
  metadata: QuizMetadata | null
): {
  byLocale: Record<string, QuizTranslation | undefined>;
  loading: Record<string, boolean>;
  load(locale: string): Promise<void>; // Drive read via index driveFileId
  generate(locale: string, questionIds?: string[]): Promise<void>; // callable → merge → saveTranslation → index write
  editQuestion(
    locale: string,
    questionId: string,
    patch: Partial<QuestionTranslation>
  ): void;
  setReviewed(locale: string, questionId: string, reviewed: boolean): void;
  save(locale: string): Promise<void>; // sidecar then index (§3.3 write order)
  staleIds(locale: string): string[]; // hash(quiz.questions[i]) !== sourceHashes[id]
  cap: { remaining: number; total: number } | null;
  error: string | null;
};
```

Editing a question's translation in the detail pane **clears it from `reviewedQuestionIds`** — the teacher re-checks it.

**Copy — zero standing paragraphs.** Every string is conditional, counted, or an empty state:

| Need                             | Form                                                                                                                                     | Where                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Review progress                  | the counter IS the disclosure — "12 of 20 served in Español"                                                                             | chip / header         |
| Stale                            | badge only                                                                                                                               | question row          |
| Generate disabled                | **one** line: cap-reached **xor** non-English-source **xor** bank-slot                                                                   | adjacent to button    |
| Stimulus images                  | counted quiz-level line (§3.4)                                                                                                           | advisory strip        |
| "You may not read this language" | empty state at zero reviewed; suggests routing to an EL specialist                                                                       | detailPane            |
| No language chosen               | empty state                                                                                                                              | detailPane            |
| App chrome stays English         | ≤8 words, **only** when the code is not an app locale (never for Spanish)                                                                | footnote under picker |
| Read-aloud suppressed            | nothing                                                                                                                                  | —                     |
| SSO-only                         | nothing new — reuse `t('quizReadAloud.help')` ("Signed-in students only.") under the language control in `OverrideEditorRow.tsx:277-293` | `OverrideEditorRow`   |

## 9. Staleness (D8, D31, D35)

**Definition:** question `q` is stale in locale `L` iff `hash(q) !== translations[L].sourceHashes[q.id]` (or the id is absent). It is **derived**, never stored as a list.

**Hash (D35):** SHA-256 hex, first 16 chars, of the serializer output. Implement twice — `utils/quizTranslationHash.ts` (client, `crypto.subtle`, async) and `functions/src/quizTranslationHash.ts` (`node:crypto`) — each with a one-line "keep in sync with …" header, and pin both with **one fixture file** `tests/fixtures/quizTranslationHash.fixture.json` (`[{ question, hash }]`, ≥1 per question type, including a legacy-shaped rubric and empty `incorrectAnswers` entries) asserted by a test in **each** Vitest project. `functions/` imports nothing from root and root Vitest excludes `functions/**` (`vitest.config.ts:41`), so the fixture is the only cross-runtime contract.

**Serializer input:** a normalized `QuizQuestion`. Every client-held body is already normalized (`normalizeQuizData` runs at `utils/quizDriveService.ts:25` and `hooks/useSyncedQuizGroups.ts:239`; legacy `'short'`/`'essay'` → `'free-response'` at `utils/quizQuestionNormalize.ts:3-5`) and the function receives bodies from the client. Serialize as the JSON of this tuple, exactly:

```ts
[
  type,
  text,
  correctAnswer ?? '',
  (incorrectAnswers ?? []).filter(Boolean),
  (matchingDistractors ?? []).filter(Boolean),
  placeholder ?? '',
  rubricSnapshot ? stableStringify(rubricSnapshot) : '',
];
```

`stableStringify` = recursive key-sorted `JSON.stringify` (write ~10 lines in the same module; no dependency). `undefined`, absent and `''` collapse to `''`.

**Authorship:** `translateQuizV1` **writes** `sourceHashes` (returned per id, §5). The client **compares** — on every `QuizMetadata` write site (§3.3, four sites) it recomputes `staleCount` per locale from the in-memory quiz body against `translations[L].sourceHashes`, and writes the index. **No sidecar write happens on a quiz save.** `pullSyncedQuiz` is one of the four sites, so a peer's edit updates `staleCount` correctly.

The projection (§4.3) compares against the **sidecar's** `sourceHashes` at publish, so the index is a cache, never an authority. The Languages tab computes `staleIds` the same way.

## 10. Assign-time warning (D5, D29, D32, D33)

In `components/common/library/AssignStudentPicker.tsx`, cross-reference each targeted student's `override.language` against `QuizMetadata.translations`. **Zero extra reads:** the roster is in memory (`applyDefaultOverride`, `:121-131`) and `QuizMetadata` is in `useQuiz`'s `onSnapshot` cache (`hooks/useQuiz.ts:176-181`).

When a targeted student needs a language the quiz lacks, or has only unreviewed/stale coverage (`reviewedCount - staleCount < questionCount`), show an inline advisory naming the student and language with a **Generate** action. Pattern: `components/widgets/QuizWidget/components/QuizManager.tsx:2158-2166` — `role="status"` + `text-xxs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5` — keyed `quizTranslation.assign.advisory.missing_one/_other`. **Never block a publish.**

**D17 at assign time (D32):** read `QuizMetadata.language`; if non-English, the Generate action is disabled with the `sourceNotEnglish` reason instead of failing server-side.

**Bank-slot quizzes (D29):** any assignment with `bankSlots` / `resolvedDriveFileId` is treated as untranslated regardless of the index — bank questions are drawn from separate Drive files (`components/widgets/QuizWidget/Widget.tsx:1519-1571`) and never appear in `QuizData.questions`, so the index would report full coverage.

**Targets edited after publish never re-project.** `hooks/useAssignmentDetailActions.ts:113-170` `saveEdit` adds students and edits overrides on a **live** assignment without touching `session.publicQuestions`. Read-aloud fixes this server-side (`setAssignmentTargetsV1` detects `readAloudGained`, `functions/src/studentAssignmentTargets.ts:924-927`); translation cannot — the projection runs on the teacher's client with Drive credentials. **v1: surface the same advisory in the edit modal** when a newly added or changed target has a `language` the session's `publicQuestions[0].localized` lacks. Re-projection on edit is v2 and must reuse the existing permutation.

## 11. Build order — 6 stacked PRs

~8,500 lines across ~70 files. Each PR merges green, leaves a shippable app, and is independently reviewable. Every PR: `pnpm run validate` before push; functions PRs also `pnpm -C functions test`; rules PRs also `pnpm run test:rules`; one `public/changelog.json` entry lands with PR3.

### PR0 — roster standing-default writer (prerequisite, not this feature)

**Read:** §3.1 (the `defaultOverridesByStudentId` paragraph) only.
**Why:** `ClassRoster.defaultOverridesByStudentId` is read (`AssignStudentPicker.tsx:128`) and never written; `components/classes/RosterEditorModal.tsx` has zero references; `hooks/useRosters.ts:381` says _"once `defaultOverridesByStudentId` gets a writer."_
**Build:** a per-student accommodation row in the roster editor writing that field, using `OverrideEditorRow` for the existing eight fields. Generic infrastructure; translation lands on it.
**Gate:** roster save → reload → standing override present; `parseStudentOverride` round-trip test.

### PR1 — override plumbing + the whole index-alignment path (dark)

**Read:** §3.1, §3.2 (types only), §4 in full, §9 (hash module only).
**Ships:** zero behavioral change for every existing user; a functions deploy.

**Types (`types.ts`, `functions/src/studentAssignmentTargets.ts:142-151`):** `StudentOverride.language`; `QuestionTranslation`, `QuizTranslation`; `LocalizedQuestionStrings`; `QuizPublicQuestion.localized`; `QuizSession.quizTitleLocalized`; `QuizResponseAnswer.locale`.

**Allowlists (§3.1):** `sanitizeOverride` (`studentAssignmentTargets.ts:341`, export + import `LANGUAGE_TAG_RE` from `quizReadAloud.ts:516`); `parseStudentOverride` (`hooks/useRosters.ts:171`); `applyDefaultOverride` D33 merge (`AssignStudentPicker.tsx:121-131`); `summarizeOverride` chip + `studentOverrideModifiedNote`; `studentOverride.chip.language` in four locale files.

**Projection (§4.2–4.3):** `randomPermutation` + locale-aware `toPublicQuestion`; `seededPermutation` in `utils/quizShuffle.ts`; `translations` argument through `toGatedPublicQuestion` / `projectPublicQuestionForMode` (callers pass `undefined` in this PR); `serveLocalizedQuestion` in `utils/quizOverrideServing.ts`; `syncAssignmentToLatest` refusal on `localized` (`useQuizAssignments.ts:1916`, beside `:1946`).

**Client transforms (§4.4):** `utils/quizLocalizedArrays.ts` `reindexChoiceArray`; rewire `applyHiddenOptions` and `shuffleQuestionForStudent` onto it.

**Answer boundary (§4.5, D36):** `utils/quizLocalizedAnswer.ts` `toDisplayAnswer` / `toCanonicalAnswer`; wire at the four sites named in §4.5 (`QuizStudentApp.tsx:3143`, `:3157`, `:3174`, `:3379`) with `activeLocale` hard-wired `undefined` in this PR; `locale` per-call handling in `submitAnswer` (`useQuizSession.ts:2618-2622`) and `commitRecordingTake` (`:2808-2818`).

**Hash (§9):** `utils/quizTranslationHash.ts`, `functions/src/quizTranslationHash.ts`, `tests/fixtures/quizTranslationHash.fixture.json`, one test per project.

**Tests (new files):** `utils/quizLocalizedArrays.test.ts` (lockstep with/without `localized`; `matchingLeft` untouched); `utils/quizShuffle.test.ts` additions (`seededPermutation` ≡ `seededShuffle`, 200 seeds); `hooks/useQuizSession.toPublicQuestion.test.ts` (no `correctAnswer`/`matchingDistractors` on any `localized` entry; identical permutation across locales; unreviewed/stale omitted; structurally identical output when `translations` is undefined); `utils/quizLocalizedAnswer.test.ts` (round-trip per type; miss fallback); `tests/components/quizStudentAnswerRoundTrip.test.tsx` — **the gate**: for MC, Matching, Ordering, with `hiddenOptionIdsByQuestion` **and** the seeded shuffle active, the English string written for a locale-L selection equals a monolingual student's for the same option; `functions/src/studentAssignmentTargets.test.ts` addition (`language` survives `sanitizeOverride`; malformed dropped); `hooks/useRosters` parse round-trip.

**Gate:** round-trip test green for every answer type; full existing quiz suite untouched.

### PR2 — generation plumbing (behind the feature flag)

**Read:** §3.3, §5, §7, §9 (authorship paragraph), §17 rows marked PR2.
**Ships:** with the Languages tab absent, changes nothing for anyone.

**Storage:** `QuizDriveService.saveTranslation/loadTranslation/deleteTranslation`; `QuizMetadata.translations` + `.language` with the four-site preservation and `staleCount` recompute (`hooks/useQuiz.ts:288,350,434,621`); duplicate path carries sidecars.
**Function:** `functions/src/quizTranslation.ts` — `translateQuizV1`, `translateResponseV1` (stub OK; PR4 wires the UI), validator, quota, `index.ts` export; `functions/src/adminAnalyticsCompute.ts:469` `'translation'` + `components/admin/Analytics/aiFeatureLabels.ts` label.
**Config/flag:** `config/quizTranslation.ts`; `GlobalFeature` union + `config/featureDefaults.ts` (D30) + `featureDefaults.test.ts`; `GlobalPermissionsManager.tsx` entry.
**Admin:** merged panel (§7), `AdminSettings.tsx:142-147` label.
**Rules:** `admin_settings/quiz_translation` carve-out; `backTranslations` in the response-doc student exclusion; `tests/rules/quizTranslationSettings.test.ts`.
**Hook:** `hooks/useQuizTranslations.ts` (§8 API) — unit-tested, not yet mounted.

**Tests:** `functions/src/quizTranslation.test.ts` (validator: wrong length vs filtered source, missing id, extra id, duplicate choices, `|`/`:` introduced, rubric shape, `MAX_TOKENS`; quota block returns `cap`; D17; D29; disabled locale); `hooks/useQuiz` index-preservation test (all four sites); `quizDriveService` sidecar naming + collision; rules test (teacher read / no write; admin write).

**Gate:** `pnpm run test:rules` green; `translateQuizV1` deployable; quiz save preserves a seeded `translations` entry.

### PR3 — teacher review + student serving

**Read:** §4 in full (again), §3.4, §6 (button placement only), §8, §10, §14.
**Ships:** the feature, behind `quiz-translation` (admin-only by D30). Needs a preview-URL pass with a real SSO student.

**Teacher:** Languages tab (§8, four sites); `QuizAuthoringAdvisory` `'stimulus-text'`; assign advisory + Generate (§10); post-publish-edit advisory (`useAssignmentDetailActions.ts`); `OverrideEditorRow` language select; sidecar loads in `createAssignment` before `:913` + `quizTitleLocalized`; size assertion.
**Student:** `activeLocale` state; `StudentAccommodationBar` + toggle; `serveLocalizedQuestion` rendering; `StructuredQuestionInput` key `${id}:${locale}`; `toDisplayAnswer`/`toCanonicalAnswer` receive the real `activeLocale`; `PublishedScoreReview` three strings; Spanish shell switch with D34 guard; read-aloud suppression (§4.7).
**i18n:** all `quizTranslation.*` keys in four locale files + `tests/i18n/quizTranslationLocales.test.ts` (§14). `public/changelog.json` entry.

**Tests:** hydration round-trip (place pairs, navigate away and back); toggle preserves placement; `locale` per-call (draft in `so`, toggle to English, re-answer → `locale` absent); fallback matrix (unreviewed / stale / missing locale / no `language` / PIN joiner → English, no crash); D34 (`spart_language` unchanged); read-aloud control absent on localized, present on English; bank-slot tab disabled + advisory; i18n key test.

**Gate:** preview pass — an SSO student with `language: 'es'` and hidden options answers all types; teacher results show correct English answers; toggle mid-Matching keeps placements.

### PR4 — free-response back-translation

**Read:** §6.
**Ships:** additive, only visible when a response carries a non-English `locale`.
**Build:** `FreeResponseGrader` button + side-by-side view; `translateResponseV1` wired; `backTranslations` cache write on the teacher path; quota `quizBackTranslation` 200/day.
**Tests:** cache hit skips the callable; edited text (new hash) re-translates; student write to `backTranslations` rejected (rules); grader keys in four locales.

### PR5 — PLC translation sync

**Read:** §3.3 copy table, §4.4 PLC paragraph, §9.
**Blocked today by rules:** `/synced_quizzes/{groupId}` is schema-locked by `hasOnly([...])` on create and update (`firestore.rules:1393-1431`); a `translations` field is rejected outright.
**Decide in the PR:** whether locales live in the Firestore group doc (contradicts §3.3's Drive rationale) or peers each hold a Drive sidecar and sync only the index + `reviewedQuestionIds` (canonical wins). Give `syncAssignmentToLatest` Drive access and **reuse the existing permutation** instead of reshuffling, then lift PR1's refusal.
**Tests:** rules `hasOnly` accepts `translations`; re-sync preserves `localized` alignment; canonical `reviewedQuestionIds` wins.

## 12. Cross-cutting invariants (assert in tests, every PR that touches them)

1. **Projection security:** no `correctAnswer`, no `matchingDistractors`, and no field derived from either on any `localized` entry or anywhere on the session doc.
2. **Lockstep:** after every transform, English and every locale array have the same length and order.
3. **English cache:** every Firestore write of an answer holds the English canonical value.
4. **Structural identity:** a quiz with no translations produces a session doc with no new fields (not byte-identical — `Math.random()` shuffles).
5. **Allowlists:** `language` survives roster default → picker → `sanitizeOverride` → pointer doc → student client.
6. **Index survives** `saveQuiz`, `pullSyncedQuiz`, `detachSyncedQuiz`, duplicate.
7. **Hash parity:** the fixture file passes in both Vitest projects.

## 13. Explicit non-goals for v1

- FIB translation (D21). Code+PIN joiners (D15). Non-English source quizzes (D17). Bank-slot quizzes (D29).
- Target-language read-aloud synthesis (D25). Vision/OCR of stimulus images (D10).
- `QuizStimulus.readAloudText` and `QuestionTargetTag.label` — student-visible, out of scope, named so they are not missed (§3.4).
- Student self-service language selection. App chrome beyond `en/es/de/fr`.
- Video activities, guided learning, mini-apps.
- Specialist / PLC review routing and a reviewer attestation record (D26). Re-projection on post-publish target edits (§10).
- Translation of teacher-facing surfaces (monitor, results, exports) — English by design.
- **`rubricOverrideByQuestion` × translation — no interaction exists.** `resolveRubricForResponse` (`utils/rubricOverrideResolution.ts:22`) has one teacher-side caller (`FreeResponseGrader.tsx:427`); students render `currentQuestion.rubricSnapshot` (`QuizStudentApp.tsx:3408-3412`). No code, no UI note.

## 14. Copy and i18n

**Structure:** one `translation` bundle across four flat files `locales/{en,de,es,fr}.json` (`i18n/index.ts:24-29`). Add a **`quizTranslation`** group, sibling to `quizReadAloud`.

**Which surfaces get keys:** the Languages tab, student UI, assign advisory and `OverrideEditorRow` additions **must** be keyed (their siblings are translated). **Admin copy (§7) stays hard-coded English**, like the whole admin tree.

**All four files in the same PR** — English placeholder values are acceptable (precedent: `quizMediaResponse`). Plurals as `_one`/`_other`, never `(s)` (`tests/i18n/i18n.test.ts:73-77`).

```
quizTranslation.label
quizTranslation.editor.{tab,pickLanguage,generate,reviewed,stale,regenerate}
quizTranslation.editor.servedCount          "{{reviewed}} of {{total}} served in {{language}}"
quizTranslation.editor.disabled.{capReached,sourceNotEnglish,bankSlots}
quizTranslation.editor.chromeNote
quizTranslation.editor.empty.noLanguage.{title,body}
quizTranslation.editor.empty.noneReviewed.{title,body}
quizTranslation.authoring.advisory.stimulusText_one / _other
quizTranslation.assign.advisory.missing_one / _other     ({{name}}, {{language}})
quizTranslation.student.toggle.english                   (native side is nativeLabel data)
quizTranslation.grading.{backTranslate,backTranslationLabel,machineGenerated}
studentOverride.language
studentOverride.chip.language
```

**CI cannot catch a missing key** — no i18n lint rule, no global parity test (de/es/fr are already 164 keys behind en). Add **`tests/i18n/quizTranslationLocales.test.ts`** modeled on `tests/i18n/quizResultsStatsLocales.test.ts`: `REQUIRED_KEYS` present and non-empty in all four locales; interpolation placeholders `{{reviewed}}` / `{{total}}` / `{{language}}` / `{{name}}` present; `_one`/`_other` pairs present.

## 15. Cost model

**~$68/district-year** for 50 teachers × 30 quizzes × 3 languages. The risk is unspecified constants, not the bill — hence §5's hard caps and token metering.

| Component                | Cost                                                                       | Notes                                                  |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Generation               | ~$0.0095/quiz-language on `gemini-3.5-flash-lite` (~3,500 in / ~2,800 out) | ~$1.37/teacher/year incl. 1.6× regeneration            |
| Back-translation         | ~$0.0006/call, ~$15/district-year                                          | Explicit button + hash cache (§6)                      |
| Firestore session egress | ~$45/district-year at 3 locales                                            | Accepted (§4.2)                                        |
| `QuizMetadata` index     | ~+650 B/quiz + ~2 KB/locale for `sourceHashes` (D31); zero extra reads     | Write only on change                                   |
| Drive                    | $0                                                                         | 3 extra GETs on assign; `drive.file` already covers it |
| Cloud Functions          | $0                                                                         | Within free tier                                       |

**Before hard-coding caps:** a `countTokens` spike on one real quiz in es/so/hmn, and a serialized-bytes check on a real 40-question 3-locale session. Set a **$25/month budget alert on the Vertex AI SKU**, mirroring read-aloud's US$20 TTS backstop.

## 16. Plumbing checklist — files that are easy to miss

| PR  | File                                                                            | Change                                                                      | Miss cost                                                   |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `functions/src/studentAssignmentTargets.ts:142-151`                             | `language?: string` on the **functions-local** `StudentOverride`            | Silent; no type error                                       |
| 1   | `functions/src/studentAssignmentTargets.ts:341`                                 | validated `language` branch in `sanitizeOverride()`                         | **Feature dead**, no error                                  |
| 1   | `functions/src/quizReadAloud.ts:516`                                            | `export` `LANGUAGE_TAG_RE`                                                  | Duplicate regex drifts                                      |
| 1   | `hooks/useRosters.ts:171`                                                       | `language` in `parseStudentOverride()`                                      | Standing default lost on reload                             |
| 1   | `components/common/library/AssignStudentPicker.tsx:127`                         | D33 `language` merge into an existing draft                                 | Standing language ignored for customized students           |
| 1   | `utils/studentOverrideSummary.ts:68-71`, `utils/studentOverrideModifiedNote.ts` | `language` chip + "modified" rule + key in four locales                     | Accommodation invisible in collapsed rows                   |
| 1   | `tests/fixtures/quizTranslationHash.fixture.json` + a test in each project      | D35 cross-runtime hash pin                                                  | Everything reads stale forever, or nothing ever does        |
| 2   | `hooks/useQuiz.ts:288,350,434,621`                                              | preserve `translations` (recompute `staleCount`), write `language`          | **Review work destroyed on save**                           |
| 2   | `functions/src/index.ts`                                                        | `export { translateQuizV1, translateResponseV1 } from './quizTranslation';` | Deploy target absent                                        |
| 2   | `firestore.rules:699`                                                           | `match /admin_settings/quiz_translation` authed-read + admin-write          | Language picker silently empty                              |
| 2   | `firestore.rules:3436-3439`                                                     | `backTranslations` excluded from the student response whitelist             | Student can forge a back-translation                        |
| 2   | `tests/rules/quizTranslationSettings.test.ts`                                   | new; `test:rules` is a separate CI leg                                      | Uncovered by `validate`                                     |
| 2   | `functions/src/adminAnalyticsCompute.ts:469`                                    | `'translation'` in `GEMINI_SPECIFIC_FEATURES`                               | Usage docs parsed into a phantom uid                        |
| 2   | `components/admin/Analytics/aiFeatureLabels.ts`                                 | matching label                                                              | File header requires sync with the above                    |
| 2   | `types.ts` `GlobalFeature` union                                                | `'quiz-translation'`                                                        | Compile error catches this one                              |
| 2   | `config/featureDefaults.ts` + `.test.ts`                                        | D30 entry + fail-closed assertion                                           | Gate fails unpredictably                                    |
| 2   | `components/admin/GlobalPermissionsManager.tsx:175`                             | registry entry beside `quiz-read-aloud`                                     | Admin cannot toggle the flag                                |
| 2   | `components/admin/AdminSettings.tsx:142-147`                                    | tab label (D24); keep the id                                                | —                                                           |
| 2   | `config/quizTranslation.ts`                                                     | new — feature id, settings doc, languages with `nativeLabel`, default caps  | Agent reuses `SUPPORTED_LANGUAGES` or invents native labels |
| 2   | `functions/src/quizTranslation.test.ts`                                         | new — validator, quota, D17, D29, cap                                       | —                                                           |
| 3   | `components/widgets/QuizWidget/components/QuizEditorModal.tsx:277,510,548,562`  | all **four** tab sites                                                      | Languages tab renders Settings, no type error               |
| 3   | `locales/{en,de,es,fr}.json` + `tests/i18n/quizTranslationLocales.test.ts`      | §14                                                                         | Untranslated UI; CI will not notice                         |
| 3   | `public/changelog.json`                                                         | one entry (`pnpm changelog:draft` prints a draft to rewrite)                | Repo convention                                             |
| 5   | `firestore.rules:1393-1431`                                                     | `translations` in the `/synced_quizzes` `hasOnly`                           | PLC sync write rejected                                     |

**Verified non-issues:** Drive scopes need no change (`config/firebase.ts:84`); `scripts/test-count-baseline.json` is a floor, so adding tests needs no edit; `firestore.rules` is at ~62% of the 256 KiB cap; `quiz_sessions` create/update has no field whitelist, so `localized` and `quizTitleLocalized` write freely; `QuizResponseAnswer.locale` needs no rules change (`answers` is whitelisted at `firestore.rules:3445` with no per-element schema — same reasoning as `noticeAckedAt`, `types.ts:4302-4304`); no App Check exists; `tests/e2e/` has no quiz-assign coverage to extend.

## Appendix A — Rejected approaches (do not re-propose)

- **Parallel session-level translation map** — leaks the answer key by position (§4.1).
- **Split gate: review at publish, staleness at render via a hash on the session doc** — ships a brute-forceable oracle of `correctAnswer`, and the comparison is a tautology on a frozen snapshot (§4.3).
- **Spreading `translation.questions[qid]` into `localized`** — re-exposes `matchingDistractors` (§4.2).
- **Index-based MC picking** — a stored index does not survive the PLC re-sync re-permutation; the stored string does (§4.5).
- **Display-string answer cache** — five unhooked write paths grade a Somali composite against the English key (§4.5).
- **FIB translation with an awaiting-grade route** — `isFreeResponseType` is `'free-response'` only (`types.ts:3348-3350`), so `FreeResponseGrader.tsx:322` could never surface a FIB; `score: deleteField()` (`useQuizAssignments.ts:2410`) plus `isResponseAwaitingGrade` (`quizScoreboard.ts:250`) would strand the student's whole grade out of the scoreboard and Classroom push; and `QuizStudentApp.tsx:4523` would still render a red ✗.
- **Sibling `/quiz_sessions/{id}/locales/{locale}` docs** — reintroduces the desync D16 prevents.
- **Refactoring `MatchingResponseInput` / `OrderingResponseInput` bank shuffles onto `reindexChoiceArray`** — they permute indices, not arrays, and are already safe.
- **Mirroring `validateAndBucketQuizQuestions`** — silently drops malformed items (§5).
- **Mirroring read-aloud's cap behavior** — it degrades to a cheaper tier; translation has none (§5).
- **Widening `admin_settings/quiz_read_aloud` or `ai_usage` reads** — exposes TTS config / other teachers' usage (§7).
- **Per-question regeneration calls** — 60 invocations for a 20-question review (§5).
- **Storing a stale-id list in the sidecar and writing Drive on every quiz save** — staleness is derivable; D31.
- **Cloud Translation API v3** — 7–38× more expensive at 2026 prices (~$492/yr vs $68), no Somali/Hmong in its LLM tier. Its same-length-array contract is adopted in §5.
- **String-level shared translation cache** — ~$34/yr saved; no replay multiplier.
- **Context caching / Batch API** — ~750 reusable tokens at ~90 calls/teacher/year; 24-hour batch turnaround is unusable for a Generate button.
- **`QuizGlobalConfig`, `FeatureConfigurationPanel.tsx:690`, `libraryDuplicate.ts`, `driveArchive.ts`** — dead code or wrong subsystem; none is a hook point.

---

**Grilled and locked:** 2026-09-11, extended 2026-09-12 with Paul Ivers.
**Revised:** 2026-09-12 (five-agent audit against `48d5e2a`); 2026-09-13 (final review against `b2b6ca6`: corrected drifted citations in `useQuizAssignments.ts`, `useQuizSession.ts`, `QuizStudentApp.tsx`, `QuizEditorModal.tsx`; added D31–D36; specified the callable, settings-doc, hook, and answer-conversion contracts; rewrote §11 as per-PR briefs; moved rejected approaches to Appendix A).
