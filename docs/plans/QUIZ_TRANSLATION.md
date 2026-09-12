# Quiz Translation for Multilingual Learners — Implementation Plan

**Status:** Spec locked. Revised 2026-09-12 after a five-agent audit (citation accuracy, cost, UI/copy, adversarial correctness, one-shot readiness) and two grilling sessions with Paul — the second (§2.2) designed PR0 and PR4 and closed every remaining "decide explicitly". No open items. Ready to implement.
**Ships as 6 stacked PRs (§11), not one change.** PR0 is a prerequisite that is not part of this feature.
**Scope:** Quizzes only, **SSO-assigned quizzes only** (D15). Video activities / guided learning / mini-apps are out of v1, but the payload shape and the `StudentOverride` field generalize without a rewrite.
**Target languages: Spanish, Somali, Hmong** (D19). All Latin-script — this narrowing removed the session-doc size risk and the token-cost blowup an earlier draft carried.
**Prerequisite:** Read §4 in full before writing any code. §4.4 is where a naive implementation mis-grades a child.
**Citations verified** against `48d5e2a` on 2026-09-12. Only `QuizEditorModal.tsx` had drifted from the previous revision (+2).

> **Do not read `docs/plans/QUIZ_READ_ALOUD.md` as a spec.** It is a pre-implementation draft whose status line still says "no code has been written"; read-aloud has since shipped and diverged from it. Read the shipped code instead: `functions/src/quizReadAloud.ts:1185-1235` (callable shape), `:506-513` (quota doc ids), `config/quizReadAloud.ts` (config-module shape), `components/admin/QuizReadAloudConfigurationPanel.tsx` (admin-panel shape), `config/featureDefaults.ts` (flag registration).

## 1. Feature summary

A student's **language** becomes a per-student accommodation, exactly like extended time, read-aloud, or hidden answer choices. A teacher (or EL coordinator) sets a student's language once on the roster; from then on every quiz that student is assigned renders in that language, with a toggle back to English.

Teachers generate translations with AI from a new **Languages** tab in the quiz editor, review and correct them, and mark them reviewed. Nothing unreviewed is ever served to a student.

**Why the accommodation framing and not a student-facing language picker:** it reuses machinery that already exists end-to-end, and it means the teacher — not the 6th grader — decides.

**On "auditable":** the _accommodation_ is recorded and honored (it rides the pointer doc like every other override). The _translation review_ is not an attestation record — `reviewedQuestionIds` carries no reviewer identity or timestamp (D26). Do not describe the review gate as an audit trail in UI copy.

## 2. Locked decisions

| #   | Decision                           | Choice                                                                                                 |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D1  | Who picks the language             | Per-student accommodation on `StudentOverride`, with a standing default on the roster (**needs PR0**)  |
| D2  | Storage                            | Sidecar per language: separate Drive file per language, index in `QuizMetadata`                        |
| D3  | Target languages                   | Admin-curated per-district list, seeded with D19's three                                               |
| D4  | Review gate                        | **Review-then-publish.** Unreviewed translations are never written to a session doc                    |
| D5  | Missing translation at assign time | Warn + one-click generate in the assign flow; teacher may proceed anyway (student gets English)        |
| D6  | Student display                    | Translated by default, one toggle to English (§4.6 — **one control, not one per question**)            |
| D7  | Answer side                        | Translate the answer content; **grade in English space** (§4.4). Audited byte-identical — keep it      |
| D8  | Staleness                          | Per-question content hash; editing one question marks only that question stale in each language        |
| D9  | What gets translated               | Question content and rubric criteria/descriptors. **Not** quiz directions (no such field) — see D27    |
| D10 | Stimuli                            | Warning only in v1. No vision/OCR. Labels are never translated (§3.4)                                  |
| D11 | Review surface                     | New **Languages** tab in `QuizEditorModal`, quiz owner reviews                                         |
| D12 | Generation                         | New `translateQuizV1` Cloud Function; metered per quiz × language, one Gemini call per language        |
| D13 | Admin gate                         | Curated list + feature toggle + monthly org cap, on the read-aloud admin surface (merged — D24)        |
| D14 | Free-response back-translation     | Teacher-side, **explicit per-response button** (§6). Not lazy-on-open                                  |
| D15 | Who can receive a translation      | **SSO students only.** Structurally enforced — `AssignStudentPicker.tsx:478` already disables the rest |
| D16 | Where translations live            | **On `QuizPublicQuestion` itself** (`localized`), not a parallel session-level map (§4.2)              |
| D17 | Source language                    | v1 requires `QuizData.language` English or absent. Generate disabled otherwise                         |
| D18 | Response language                  | `QuizResponseAnswer.locale` stamped at submit. **Per-call field** — see §4.4                           |

### 2.1 Added by the 2026-09-12 audit

| #   | Decision                  | Choice                                                                                                                                  |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| D19 | Target languages          | **Spanish (`es`), Somali (`so`), Hmong (`hmn`)**. All Latin-script. Karen is explicitly out — no Cloud Translation or TTS support       |
| D20 | Model + cost posture      | `geminiConfig.standardModel` (`gemini-3.5-flash-lite`), `thinkingLevel: 'minimal'`, `temperature: 0.2`, hard caps. **~$68/district-yr** |
| D21 | FIB                       | **FIB is not translated in v1.** Question stays English. No `gradeAnswer` change, no awaiting-grade routing (§4.5)                      |
| D22 | Answer cache              | **Cache holds the English canonical value. Localization is display-only** (§4.4). The single most important decision here               |
| D23 | Review + staleness gating | **Both gated at publish.** No hash of any kind on the session doc (§4.3). Reverses an earlier split-gate design that leaked the key     |
| D24 | Admin surface             | **One merged "Quiz Languages" tab** — rename and extend `QuizReadAloudConfigurationPanel`                                               |
| D25 | Read-aloud × translation  | **Suppress the speaker control on translated questions.** Target-language synthesis deferred to v2 (§4.7)                               |
| D26 | Attestation               | `reviewedQuestionIds` stays `string[]`. No reviewer identity or timestamp                                                               |
| D27 | Title and directions      | `QuizData` has no `directions` field — struck from D9. Translated **title** needs `QuizSession.quizTitleLocalized` (§4.2)               |
| D28 | Spanish app chrome        | When `override.language === 'es'`, also switch the i18n language. Somali/Hmong keep the English shell                                   |
| D29 | Bank-slot quizzes         | A quiz with `bankSlots` cannot be translated. Languages tab disabled with a reason; §10 treats it as untranslated                       |
| D30 | Rollout                   | `quiz-translation` global feature: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`                     |

### 2.2 Added by the 2026-09-12 PR-detail grilling

Closes every item the previous revision left as "decide explicitly" and designs the two PRs (PR0, PR4) that had none.

| #   | Decision                      | Choice                                                                                                                                         |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D31 | PR0 surface                   | **Per-row expander reusing `OverrideEditorRow` with `quizMode={false}`.** Do **not** widen `RosterEditorModal` — the math does not work (§3.5) |
| D32 | PR0 scope                     | The three quiz-agnostic fields: `language`, `readAloud`, `timeMultiplier`. `quizMode={false}` already yields exactly these plus the window     |
| D33 | Standing-default merge        | **Per-field merge, standing loses.** Replaces the whole-object assign at `AssignStudentPicker.tsx:130` (§3.6)                                  |
| D34 | D17 source gate               | **Add `language` to `QuizMetadata`.** The assign-flow check stays free of Drive reads (§10)                                                    |
| D35 | PR2 invocation                | **Dev-only Generate trigger** in `components/dev/`, so the callable is exercised end-to-end inside its own PR (§5.1)                           |
| D36 | PR4 server path               | **New `backTranslateResponseV1` callable** in `functions/src/quizTranslation.ts` (§6)                                                          |
| D37 | PR5 storage                   | **Translations stay in Drive; sync copies the sidecars** into the puller's Drive. Honors §3.3 (§11 PR5)                                        |
| D38 | `pullSyncedQuiz` staleness    | **Rehash on pull.** Only genuinely changed questions go stale (§9)                                                                             |
| D39 | `studentOverrideModifiedNote` | **No code change.** It already returns `'modified'` for any non-empty override, so a language-only override is covered (§17)                   |

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
  /** BCP-47 code: 'es' | 'so' | 'hmn'. Absent = English. Must appear in the org's curated list. */
  language?: string;
}
```

**⚠️ It does NOT ride the existing paths for free.** The previous revision claimed it did. It does not — there are **three** closed allowlists between the roster and the student, and every one of them silently drops an unknown key:

1. `functions/src/studentAssignmentTargets.ts:341` `sanitizeOverride()` — doc comment: _"Structural sanitizer — drops unknown keys."_ It hand-copies eight fields. Add a validated `language` branch:
   ```ts
   if (
     typeof src.language === 'string' &&
     LANGUAGE_TAG_RE.test(src.language.trim())
   )
     out.language = src.language.trim();
   ```
   Reuse the tag regex from `functions/src/quizReadAloud.ts:516`; lift it to a shared module or duplicate it with a keep-in-sync note.
2. `functions/src/studentAssignmentTargets.ts:142-151` — **`functions/` carries its own duplicate `StudentOverride` interface** and does not import root `types.ts`. Adding the field to `types.ts` alone produces **no type error** in `pnpm run type-check:all`, so the omission is invisible.
3. `hooks/useRosters.ts:171` `parseStudentOverride()` — same whitelist on the Drive roster read path. Without a branch, the standing default never survives a reload.

The paths that genuinely do work once those three are fixed:

- `ClassRoster.defaultOverridesByStudentId` (`types.ts:195`) — the standing accommodation. **No writer exists yet — that is PR0.**
- `AssignStudentPicker.tsx:128` reads that default and applies it. Note it assigns the standing override **whole-object** and short-circuits at `:127` if a per-assignment draft already exists — so a standing `language` will not merge into an override the teacher already customized.
- `QuizAssignment.overridesBySourcedId` / `overridesByStudentUid` (`types.ts:5196`, `:5200`).
- `StudentAssignmentPointer.override` (`types.ts:5018`).

Add a `language` chip to `summarizeOverride` (`utils/studentOverrideSummary.ts`, following `readAloud` at `:68-71`) plus a `studentOverride.chip.language` key in all four locale files.

**Two structural differences from every existing override.**

1. **It is the first _additive_ override.** All current overrides are subtractive. Language requires content that must already exist and be published. `StudentOverride` stays true to its doc comment (_"Never stored on session docs"_) — the override carries only the language _code_; the translated payload travels on the session doc (§4).

2. **It only reaches SSO students (D15)** — and this is already enforced structurally, so it needs no new UI prose. `QuizStudentApp.tsx:567` resolves the pointer doc only when `isStudentRole`; `AssignStudentPicker.tsx:478-485` already **disables** non-SSO students with `t('assignStudentPicker.needsSso')`. A teacher cannot attach a `language` to a student who has no pointer doc.

**Naming caution:** `QuizSession.language` **already exists** (`types.ts:3983`) and means _the quiz's read-aloud source voice_, maintained on PLC re-sync at `useQuizAssignments.ts:2129`. Do not overload it. Also, `QuizMetadata` has **no** `language` field, so D17's English-source gate cannot be answered from the Firestore library index — it needs the Drive body (see §10).

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
  /** Free response only. Structurally identical to the English `rubricSnapshot`. */
  rubricSnapshot?: Rubric;
}

export interface QuizTranslation {
  locale: string;
  title: string;
  questions: Record<string, QuestionTranslation>;
  /** Per-question hash of the English source at translation time. Drives staleness. */
  sourceHashes: Record<string, string>;
  /** Question ids the teacher has explicitly approved. Only these are ever projected. */
  reviewedQuestionIds: string[];
  model: string;
  generatedAt: number;
  updatedAt: number;
}
```

There is no `directions` field, because `QuizData` has none (D27). `QuizData` is `{id, title, questions, stimuli?, language?, bankSlots?, order?, createdAt, updatedAt}` (`types.ts:3715-3729`).

**Index alignment is the load-bearing invariant of this entire design.** Every array above must be the same length and order as the English source it mirrors. Generation must validate it server-side and reject any output that violates it.

**Align against the _filtered_ arrays.** `toPublicQuestion` builds MC choices from `[q.correctAnswer, ...q.incorrectAnswers.filter(Boolean)]` (`hooks/useQuizSession.ts:347-350`) and matching distractors from `(q.matchingDistractors ?? []).filter(Boolean)` (`:360`). Authored quizzes do contain empty entries. Define alignment against the filtered arrays in both the prompt and the validator.

**`rubricSnapshot` and `placeholder` are free-response only** — projected only inside the `isFreeResponseType` branch (`hooks/useQuizSession.ts:371-386`). Translating the rubric exposes nothing new: the English rubric is already public and documented as carrying no answer key (`types.ts:3895-3901`).

### 3.3 Storage (D2)

Translations do **not** go inline in the quiz JSON. `QuizData` is fully loaded from Drive on every editor open, every publish, and every PLC sync.

- Each `QuizTranslation` is its own Drive file alongside the quiz, loaded lazily.
- `QuizMetadata` (`types.ts:3755`) gains a Firestore index so the library and assign flow can answer _"does a reviewed Spanish version exist?"_ with **zero Drive calls**:

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

**⚠️ `QuizDriveService` has no sidecar API. This is new public API, not reuse.** Its surface is `saveQuiz` / `loadQuiz` / `deleteQuizFile` / sheet and template helpers. `saveQuiz` hard-codes both the filename and the payload type (`utils/quizDriveService.ts:230-231`):

```ts
const fileName = `${sanitizeDriveFileName(quiz.title)}.${quiz.id.slice(0, 8)}.quiz.json`;
const content = JSON.stringify(quiz, null, 2);
```

`loadQuiz` returns `QuizData` through `normalizeQuizData`. Both folder helpers (`getOrCreateFolder:181`, `getQuizFolderId:214`) are **`private`**. Add `saveTranslation(quizId, quizTitle, locale, payload, existingFileId?)` and `loadTranslation(fileId)`, naming the sidecar `${sanitizeDriveFileName(title)}.${id.slice(0,8)}.${locale}.tr.json` and mirroring the name-collision fallback at `:246-270`. No OAuth scope change is needed — `drive.file` (`config/firebase.ts:84`) covers app-created files, and the sidecar sits in the existing `SpartBoard/Quizzes` folder.

**⚠️ The index is destroyed by every quiz save.** `hooks/useQuiz.ts` rebuilds `QuizMetadata` field-by-field and writes it with a **non-merging** `setDoc`, preserving only `folderId` / `sync` / `behavior`. Add `translations` to the preserve-on-omit list at **all four** sites:

- `:288-316` `saveQuiz`
- `:350-379` `pullSyncedQuiz` — **auto-fired by `hooks/usePlcAutoPullSync.ts`**, so a peer's edit wipes your index with no action from you
- `:434-453` `detachSyncedQuiz`
- `:621` duplicate path

Without this, a teacher who fixes one typo after a full review loses the entire index, orphans the Drive sidecars, and the Languages tab shows an empty state.

**The rollback precedent runs the other way than an earlier draft claimed.** `duplicateQuiz` (`hooks/useQuiz.ts:580-640`) rolls back the **Drive file** when the Firestore write fails (`:625-637`), to avoid an orphan Drive file — it does not roll back an index. It is also the only path in that file with any rollback; `saveQuiz` has none. Write Drive first, then the index, and on index failure delete the sidecar.

**Copy / archive / sync paths.** The two files an earlier draft named were wrong: `components/common/library/libraryDuplicate.ts` is an 80-line kebab-menu label helper with no data logic, and `functions/src/driveArchive.ts` is the Activity Wall _photo_ archiver (`grep quiz` returns nothing). The real paths are:

| Path                                                          | Behavior                                                | v1 decision                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `hooks/useQuiz.ts:580-640` duplicate                          | builds `QuizData` field-by-field                        | **carry** translations                                                   |
| `hooks/useSyncedQuizGroups.ts:235`/`:376` PLC sync            | explicit `Pick<…>`, so a new field **drops by default** | **carry** — but see §4.4 and PR5; it is blocked at the rules layer today |
| `components/widgets/QuizWidget/adapters/quizImportAdapter.ts` | constructs `QuizData` from CSV/Sheet                    | **drop** — already true with zero work                                   |

Both real copy paths construct field-by-field, so the default for a new field is **silent drop**. That is the safe direction, and it is why each decision must be explicit.

### 3.4 Stimuli (D10) — warning only

`utils/quizStimuli.ts:115` strips stimulus labels (`{ ...rest, label: '' }`) before the session doc is written, and `QuizStimulusView` never renders them — every `label` occurrence there is an `aria-label` or a caller-supplied heading. **Students never see stimulus labels — do not translate them.**

Text _inside_ an image needs vision/OCR and is out of scope. Instead, add `'stimulus-text'` to the `QuizAdvisoryId` union in `utils/quizAuthoringAdvisory.ts` and emit a **counted, quiz-level** line through the existing `QuizAuthoringAdvisory` component: _"3 images may contain text that stays in English."_ It must be quiz-level, not per-question: stimuli are shared across questions via `QuizQuestion.stimulusIds` (`types.ts:3444`), so one image behind six questions would repeat the warning six times. `QuizAuthoringAdvisory` is already a single quiz-level banner (props `{ questions, shuffleQuestionsEnabled? }`), not a per-question component.

**`QuizStimulus.readAloudText` is a separate gap.** Unlike `label`, it _is_ rendered to the student (`utils/quizStimuli.ts:119-135` projects it as `readAloudTextByStimulusId`; `QuizStudentApp.tsx:1776-1795` renders it in a text pane). Same for `QuestionTargetTag.label` when `showLearningTargets` is on (`useQuizAssignments.ts:728-730`). Both are teacher-authored student-visible prose. **v1 decision: out of scope, listed in §13** — but they must be named, not silently missed.

### 3.5 PR0's surface — per-row expander, not a wider modal (D31, D32)

**Do not widen `RosterEditorModal`.** It is `max-w-5xl` (64rem) at `h-[85vh]` (`:115-116`), and `buildGridTemplate` (`:760-774`) allocates `2rem | 5rem PIN | 1fr First | 1fr Last | 1.4fr Email | minmax(9rem,14rem) Restrictions | 2rem`. With every column on, the fixed parts plus `gap-3` consume ~22.5rem, leaving ~41.5rem across 3.4fr — First/Last ≈ 12rem, Email ≈ 17rem. A language select (~8rem), a time-multiplier select (~7rem), a read-aloud checkbox (~3rem) and their gaps cost ~20rem, which collapses Email to ~8.8rem (~140px) — too narrow to read `firstname.lastname@district.k12.mn.us`. Holding the current text widths needs ~84rem; `max-w-7xl` is 80rem and still short, and 84rem does not fit a 1366px teacher laptop, let alone a tablet. A fifth grid column is therefore not available at any modal width worth shipping.

**The component already exists and was already built for a non-quiz host.** `components/common/library/OverrideEditorRow.tsx:51`:

```ts
/** Quiz-only fields (subset picker, option hider, rubric swap, tab warning) render only when true. */
quizMode?: boolean;
```

`quizMode={false}` renders exactly `timeMultiplier`, `openAt`/`closeAt` and `readAloud` (behind `readAloudAvailable`) — D32's set — and the three fields that key by question id and therefore **cannot** be roster-level standing defaults (`questionIds`, `hiddenOptionIdsByQuestion`, `rubricOverrideByQuestion`) are already the ones that flag gates off. Its contract is `studentName` + `override` + `onChange`, with no quiz coupling, and it already collapses to `summarizeOverride` chips — which is what §17's "language chip; miss cost: accommodation invisible in collapsed rows" line is about. It has exactly one caller today; PR0 makes it two.

So PR0 is: a disclosure row under each `RosterRow` rendering `<OverrideEditorRow quizMode={false} readAloudAvailable={…}>`, plus `language`. `buildGridTemplate` is untouched.

**The one unavoidable cost:** `RosterEditorModal`'s `onSave` is `(name, students, groups?)` (`:23`, called at `:80-82`), and `DraftRow` carries no override. Both grow a fourth axis, threaded through the draft/validate/save path to `updateRoster`. That cost is identical for any surface that writes roster-level defaults — a separate modal would not avoid it.

### 3.6 The standing-default merge rule (D33)

`applyDefaultOverride` (`AssignStudentPicker.tsx:121-131`) short-circuits on `if (draftOverrides[key]) return;` and then assigns the standing override **whole-object**. Once standing defaults have a writer, that is wrong in the most common case this feature exists for: a teacher who adds extended time for one quiz to an EL student silently drops that student's standing `language`, and they get English.

**Per-field merge, standing loses.** Drop the short-circuit; merge each standing field only where the per-assignment draft has no value:

```ts
setDraftOverrides((prev) => ({
  ...prev,
  [key]: { ...defaultOverride, ...prev[key] },
}));
```

A per-assignment value always wins, so a teacher can still turn an accommodation off for one quiz. §10's advisory remains the backstop that catches a student whose language was deliberately cleared.

## 4. Serving to students — READ THIS BEFORE CODING

### 4.1 The trap

`toPublicQuestion` (`hooks/useQuizSession.ts:338`) is a hand-written allowlist with real security design behind it:

- MC `choices` are **Fisher-Yates shuffled** so the correct answer's identity is unknown (`:347-350`, `Math.random()` at `:327`).
- Matching `matchingRight` is shuffled _and_ merged with distractors (`:362-365`), and the distractor list is deliberately **not** exposed — the inline comment at `:366-368` says exposing it _"lets a student pop devtools and read off exactly which entries are wrong."_
- Ordering `orderingItems` are shuffled (`:371`).
- `matchingLeft` is **never** shuffled (`:358`).
- `correctAnswer` never appears.

**Shipping `QuizTranslation` to the session doc as a parallel payload defeats all of it** — the translated arrays are in _source_ order, so position alone gives away the key.

**Corollary, and it is absolute: nothing on the session doc may be a function of `correctAnswer`, `incorrectAnswers`, or `matchingDistractors`.** Not the strings, not a hash of them. A per-question content hash next to the shuffled choices is a brute-forceable oracle: 4-choice MC gives 24 candidate assignments, each cheaply hashed with the serializer that ships in the client bundle, recovering the key with certainty. FIB is a one-word dictionary attack. An earlier revision of this plan proposed exactly that; §4.3 is why it is gone.

### 4.2 The fix: translate inside the projection, through the same shuffle

Translations attach to the **question object itself** (D16), not a parallel session-level map:

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
// on QuizSession (D27 — session.quizTitle is a scalar with nowhere to put a translation):
quizTitleLocalized?: Record<string, string>;
```

Note `LocalizedQuestionStrings` has **no `matchingDistractors`**, while `QuestionTranslation` does. The two types differ by exactly that one field and share four names, so the obvious implementation — `localized[loc] = translation.questions[qid]` — **re-exposes the distractor list the projection deliberately withholds.** Latin-script cognates across all three target languages make it trivially mappable back.

**Therefore: build `localized[loc]` field-by-field inside the same per-type branches as the English fields. Never spread the sidecar entry.** The Matching branch must construct `localized.matchingRight = permute([...translatedPairRights, ...translatedDistractors])` rather than copying a field. The same discipline keeps `placeholder` and `rubricSnapshot` confined to the free-response branch, where English already confines them.

`toPublicQuestion` computes the shuffle permutation **once** per question, then applies that same permutation to the English arrays and to every locale's arrays, passing every locale through the **same allowlist**.

Signatures — give these literally, they are security-critical:

```ts
export function toPublicQuestion(
  q: QuizQuestion,
  translations?: Record<string, QuestionTranslation> // locale -> payload, pre-filtered to reviewed+fresh
): QuizPublicQuestion;

// utils/quizShuffle.ts — NEW. Must produce the identical permutation seededShuffle does today.
export function seededPermutation(length: number, seed: string): number[];

// hooks/useQuizSession.ts — NEW, replaces the inline fisherYatesShuffle at :324
function randomPermutation(length: number): number[];
```

`matchingRight`'s permutation is computed over the **merged** array `[...pairs.map(p => p.right), ...distractors]` (`:360-365`), so `QuestionTranslation.matchingRight` and `.matchingDistractors` must be concatenated in exactly that order _before_ permuting. That merge order is the easiest place in this design to silently misalign a matching question.

Both wrappers gain the translations argument: `toGatedPublicQuestion` (`hooks/useQuizAssignments.ts:707`) and `projectPublicQuestionForMode` (`:721`).

**Which locales get projected:** at publish, the union of `language` across the assignment's targeted students' overrides, available from `settings.overridesBySourcedId` at `hooks/useQuizAssignments.ts:868`. Project only questions that are **both** in `reviewedQuestionIds` and hash-fresh (§4.3).

**Publish sites.** `toPublicQuestion` has exactly **one** production caller — `hooks/useQuizAssignments.ts:709` via `toGatedPublicQuestion` → `projectPublicQuestionForMode`, reached from `:914` (create) and `:1985` (PLC re-sync). Both write sites route through it, so changing it there covers every create path. Verified exhaustively; everything else is tests.

**Threading translations in is step-1 work the plan must name:** `toGatedPublicQuestion` is a `useCallback` inside `useQuizAssignments` with no Drive access today. The sidecar loads must happen in `createAssignment` before `sessionPublicQuestions` is built at `:913`, as `Promise.allSettled` over the per-locale loads, in parallel:

- **Failure behavior:** a Drive load failure for one locale drops that locale and publishes without it. The student gets English — the same outcome D5's advisory already warns about. Log it; never block a publish. `allSettled`, not `all`: `utils/googleDriveService.ts:92-113` `fetchWithRetry` retries only once and only on 401, with no 429 handling anywhere, so one transient rate-limit must not drop every locale.
- **Latency:** 3 sequential Drive GETs at 300–600ms each would add ~1.5s to a 7:58am assign. Load them in parallel.

**Session doc size.** With D19's Latin-script-only set this is no longer a v1 risk: each locale adds ~320 B/question, so 40 questions × 3 locales ≈ 55 KB on top of ~16 KB English — comfortable against the 1 MB cap. Keep a defensive assertion measured on **serialized UTF-8 bytes** (`new TextEncoder().encode(JSON.stringify(session)).length`) against a ~900 KB budget, and budget for the read-aloud manifest that shares the same document. Drop locales by ascending targeted-student count if it ever trips.

**Egress, for the record.** Every student holds an `onSnapshot` on the whole session doc (`hooks/useQuizSession.ts:1753-1783`), and Firestore re-delivers the entire document on every write — so all locale payloads reach all 30 students, including monolingual ones. At 3 Latin locales that is roughly $45/district-year. Accepted deliberately: a hard locale cap would deny the third-language child an accommodation in a feature whose whole purpose is equity. A sibling `/quiz_sessions/{id}/locales/{locale}` doc would remove the payload from the broadcast, but it reintroduces exactly the desync D16 exists to prevent — do not.

### 4.3 Review and staleness are BOTH gated at publish (D23)

The projection holds the live quiz body _and_ the sidecar, so it can enforce "reviewed **and** hash-matching" in one place, with one comparison, and simply omit the locale entry otherwise.

**Why not check staleness at render.** An earlier revision split the gates — review at publish, staleness at render via a `sourceHash`/`contentHash` comparison on the session doc. Three reasons it is gone:

1. It required shipping a hash of `correctAnswer` to the student. See §4.1.
2. **It was a tautology.** Both values would be written at the same instant, by the same projection, from the same quiz body. `publicQuestions` is a **frozen snapshot**: written once at `:914`, never touched again except by `:1985`. The comparison can only ever be equal.
3. The one case where a render check would earn its keep — the PLC re-sync — is the case where it cannot run (§4.4).

**The frozen-snapshot property is what makes this correct.** A question reviewed at publish serves the translation it was published with, and that translation still matches the English the student is reading — even if the teacher edits the quiz mid-session. Staleness is purely an authoring-time signal.

The render side is therefore a pure presence check, and `serveLocalizedQuestion()` (in `utils/quizOverrideServing.ts`, matching how `serveQuestionSubset` and `applyHiddenOptions` are already factored) is:

```ts
// localized[locale] present -> use it; absent -> English. No hashes, no comparison.
export function serveLocalizedQuestion(
  q: QuizPublicQuestion,
  locale: string | undefined
): LocalizedQuestionStrings | null;
```

### 4.4 The three client transforms

**A shared permutation at projection time is necessary but not sufficient.** After the session doc is written, `QuizStudentApp` applies more transforms:

| Transform                                 | Where                                                                  | What it does                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyHiddenOptions`                      | `utils/quizOverrideServing.ts:32`, called at `QuizStudentApp.tsx:1749` | Filters **`choices` only** — MC-only — **by literal English text**; hidden-option values are option text, not ids (`types.ts:4994`)                                                                                                                                                                                                                         |
| `shuffleQuestionForStudent`               | `utils/quizShuffle.ts:69`, called at `QuizStudentApp.tsx:1752`         | **Re-shuffles** `choices` / `matchingRight` / `orderingItems` with a per-student seed. On by default (`session.shuffleAnswerOptions !== false`, `QuizStudentApp.tsx:1746`)                                                                                                                                                                                  |
| `MatchingResponseInput` word-bank shuffle | `components/quiz/MatchingResponseInput.tsx:47-54`, applied at `:249`   | A **third**, unseeded `Math.random()` shuffle on every mount. **Already locale-safe** — it permutes _indices into_ `allOptions` and `emit` dereferences through `allOptions[idx]` (`:276-287`), so the array itself is never permuted. `OrderingResponseInput` is the same shape. **Do not refactor these into `reindexChoiceArray`** — it would break them |

The first two each independently destroy the invariant:

- A student with **both** `hiddenOptionIdsByQuestion` and `language` — EL plus reduced answer choices, one of the most common accommodation pairs there is — gets an English array of length `n-1` against a localized array of length `n`.
- The per-student re-shuffle permutes English and leaves the locale arrays in the server's order.

**The fix: make index operations structural.** Add `utils/quizLocalizedArrays.ts`:

```ts
/**
 * Re-index one choice-bearing array on a public question, applying the SAME index
 * operation to every locale's sibling array. `indices` is the new order (a permutation)
 * or a kept subset (a filter) over the current array.
 *
 * `matchingLeft` is deliberately absent from the field union: neither the projection
 * (useQuizSession.ts:358) nor shuffleQuestionForStudent (quizShuffle.ts:77-79) ever
 * permutes it, and permuting it would break the pair semantics. Do not "fix" this.
 *
 * Returns `q` unchanged when `q.localized` is absent — identity fast path, matching how
 * applyHiddenOptions already returns its input untouched. This runs per render.
 */
export function reindexChoiceArray(
  q: QuizPublicQuestion,
  field: 'choices' | 'matchingRight' | 'orderingItems',
  indices: number[]
): QuizPublicQuestion;
```

Then both call sites become "compute indices, call `reindexChoiceArray`": `applyHiddenOptions` computes kept indices from the English text match; `shuffleQuestionForStudent` computes a seeded index permutation via `seededPermutation`.

Hidden options compose cleanly with translation, because `hiddenOptionIdsByQuestion` holds **English** option text and the kept indices are computed from the English match. The existing "refuse to hide the correct answer" guard (`components/widgets/QuizWidget/Widget.tsx:1575-1580`) also stays valid — it operates on the English quiz body.

**The PLC re-sync path cannot carry locales, and must refuse.** `syncAssignmentToLatest` (`hooks/useQuizAssignments.ts:1952`) sources content from `pullSyncedQuizContent` (`hooks/useSyncedQuizGroups.ts:221-245`), which returns only `{title, questions, stimuli, language, behavior, version}` from a **Firestore** doc — no Drive handle, no sidecar channel. It then rewrites `publicQuestions` with a fresh unseeded shuffle (`:1985`) on a live or paused session. Left alone, a mid-week peer publish flips every EL student to English with no notice.

**v1: block it.** Refuse `syncAssignmentToLatest` when the session carries `localized`, mirroring the existing `resolvedDriveFileId` throw at `:1946`. PR5 lifts the restriction by giving the sync path Drive access and reusing the existing permutation instead of reshuffling.

### 4.5 Grading: the answer cache holds English (D22)

**MC is answered by VALUE, not index.** An earlier revision said _"the student picks by index"_ for MC / Matching / Ordering. That is false for the most common type. `QuizStudentApp.tsx:2766` is `const options = currentQuestion.choices ?? []`; `:3157` and `:3174` are `onClick={() => setCacheForCurrent(opt)}` — the option **string** goes into the cache. Selection is value-compared (`:3143`), React-keyed by value, and the display index is reverse-derived with `options.indexOf(opt)` (`:3164`).

**Do not convert MC to index-based picking.** Value-keying is currently _protective_: a stored option text survives a re-permutation unharmed, whereas a stored index does not. Going index-based would **create** a mis-grade on the PLC re-sync path where none exists today.

**So the decision is D22: `answerCache` stores the English canonical value; localization is display-only.** `answerCache` (`QuizStudentApp.tsx:1868`) is documented at `:1863-1867` as _"the canonical serialized form per type."_ Keep it exactly that, in English.

This is the decision that matters most, because **five write paths reach Firestore and none has a conversion hook**:

| Write path                                        | file:line                      |
| ------------------------------------------------- | ------------------------------ |
| debounced draft autosave (500 ms, **every type**) | `QuizStudentApp.tsx:2263-2305` |
| timer auto-submit                                 | `QuizStudentApp.tsx:2150-2170` |
| visibility / `beforeunload` / unmount flush       | `QuizStudentApp.tsx:2339-2393` |
| `handleSubmit`                                    | `QuizStudentApp.tsx:2490-2520` |
| `handleSubmitAndAdvance`                          | `QuizStudentApp.tsx:2642`      |

All five converge on `submitAnswer` (`hooks/useQuizSession.ts:2524`). If the cache held the displayed string, a Somali student who places their matching chips and then simply closes the Chromebook lid would have the Somali composite graded against the English key, scored 0, published, exported to Sheets, and pushed to Google Classroom. `publishAssignmentScores` maps over **all** answers regardless of `status` (`hooks/useQuizAssignments.ts:2346`), so a draft is enough.

_(Note `types.ts:4275-4278` is stale — it claims drafts are written-response-only. The effect at `QuizStudentApp.tsx:2240` is type-agnostic, as the comment at `:2296-2300` says.)_

**Reads that must become locale-aware** as a direct consequence:

- MC selection highlight — `:3143` `isSelected = liveAnswer === opt`
- `savedAnswerForCurrent` seeding — `:1985-2000`
- `StructuredQuestionInput.savedAnswer` — `:3379`
- **both saved-equal short-circuits** — `:2249` and `:2377`. Miss these and `draft !== savedAnswerForCurrent` is permanently true for every translated student: every autosave tick and every flush re-writes the draft, and `shouldSnapshotHistory` fires each time, producing a `/history` subcollection write per keystroke.

**Hydration must be bidirectional.** Both structured inputs rehydrate by string-matching against the _displayed_ array — `MatchingResponseInput.tsx:230-236` (`allOptions.findIndex(opt => opt === def && !used.has(i))`) and `OrderingResponseInput.tsx:260-264`. With an English cache and localized display, every `findIndex` returns `-1`: a student who places all four pairs, taps Next and comes back sees **four empty drop zones** — while `canSubmit` (`:3678-3691`) still accepts the seeded English string as complete, so Submit is enabled over a visibly empty form. Specify a helper with both directions: English→locale before `savedAnswer` reaches either input, locale→English on `emit`.

**Byte-identity of the English round-trip is proven per type** — this was attacked specifically and holds:

- **MC** — the English choice string is written verbatim; `gradeAnswer` normalizes anyway (`hooks/useQuizSession.ts:556-558`).
- **Ordering** — `orderingItems` are the exact substrings of `correctAnswer.split('|')` (`:370`), and `emit` rejoins with `'|'` (`OrderingResponseInput.tsx:300-307`). A perfect answer reconstructs `correctAnswer` byte-for-byte, so both the strict path (`:637`) and the partial-credit LIS path (`:640-646`) agree.
- **Matching** — `matchingLeft` is never permuted, so `terms` order equals `correctAnswer` pair order. `emit` builds `${terms[i]}:${allOptions[idx]}` joined by `'|'` (`MatchingResponseInput.tsx:276-287`), and `gradeAnswer`'s left→right map (`:581-596`) splits on `indexOf(':')` rather than `split(':')` — so a definition containing a colon survives on both sides.
- **free-response** — native text by design (§6).

**This holds only if the English strings are still on the question at submit time**, which is another reason `localized` rides _alongside_ the English fields (D16) and never replaces them in place. State it as an invariant.

**Consequence, and it is the single biggest risk reduction available: results, the live monitor, the leaderboard, Sheets export and LMS grade push are genuinely untouched.** `buildDistribution` buckets MC by `counts[ans.answer]` against the English option list (`monitor/monitorUtils.ts:120-137`), so a translated student's answer lands in the correct English bar with no change at all. Take this.

**FIB is not translated in v1 (D21).** The question stays English for every student. This removes the entire awaiting-grade routing that an earlier revision scoped, and it is not a small saving — that path was unbuildable as specified:

- `isFreeResponseType` is `type === 'free-response'` only (`types.ts:3348-3350`), and `FreeResponseGrader.tsx:322` filters its queue on it, so a FIB could **never** be manually graded — `awaiting-grade` would be permanent.
- `hooks/useQuizAssignments.ts:2410` writes `score: awaitingGrade ? deleteField() : score`, and `isResponseAwaitingGrade` (`quizScoreboard.ts:250`) then excludes the student from `selectPushableResponses` (`:290`) — so one translated FIB would strand the EL student's **entire quiz grade**, out of the scoreboard, the Classroom push (`utils/classroomGradePush.ts:107`) and the export's real score.
- And it would not even suppress the red ✗: `:2378` still writes `{...a, isCorrect: result.isCorrect}` = `false`, and `isWritten` is false for FIB, so `QuizStudentApp.tsx:4523` renders a red X anyway.

So **no `gradeAnswer` change ships in v1.** That also means the nine `gradeAnswer` call sites an earlier revision listed are all out of scope — including `functions/src/plcAssessmentMath.ts:465` `gradeGroupAnswer`, a complete **server-side reimplementation** of client grading that the earlier revision never acknowledged exists and which would have silently disagreed with the teacher's own results view.

**`locale` is a PER-CALL field (D18).** `submitAnswer` builds `newAnswer` as `{...priorEntry, …}` and then explicitly re-owns per-call fields: `delete newAnswer.speedBonus` (`:2618`), `delete newAnswer.isCorrect` (`:2619`), `delete newAnswer.timedOutUnderMinimum` (`:2622`). `locale` must join that list, then be set from the call — otherwise a student who drafts in Somali, toggles to English and retypes resurrects `locale: 'so'` from the spread. Also set it positively in `commitRecordingTake` (`:2808-2818`), which constructs `newAnswer` fresh with no spread.

**A sixth answer path exists that the plan must acknowledge:** `QuizQuestion.recording` (`types.ts:3448-3452`) turns a free-response question into an audio-capture slot; `commitRecordingTake` writes `answer: ''` plus `artifacts` and `takeIndex`, bypassing `answerCache` entirely. A translated student speaking Somali into an artifact is arguably the best accommodation in the product — stamp `locale` there so §6's button can find it.

### 4.6 Student UI (D6)

The student's language comes from `StudentAssignmentPointer.override.language` (`QuizStudentApp.tsx:572`). Render from `serveLocalizedQuestion(currentQuestion, language)`, falling back to the English fields per question.

**One segmented control, not one per question.** The question header (`:2991-3037`) already carries three children — back chevron + counter (`:2993-3009`), countdown timer (`:3010-3025`), question-type badge (`:3026-3037`) — and at 375px a fourth collides.

Instead, extract the toolbar chrome from `components/quiz/readAloud/ReadAloudToolbar.tsx` into `components/quiz/StudentAccommodationBar.tsx` (same classes: `sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur` → `mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2`), and change `QuizStudentApp.tsx:2953` to render it when `readAloudOn || localeOn`. The language toggle is a two-option segmented control — `English | {nativeLabel}` so the student can read it — `aria-pressed` per side, `min-h-11`, in the `ml-auto` group. **Add `flex-wrap` to the bar's inner row**: at 375px the three existing controls already consume ~300px of ~343px.

**One control, per-question state:** the toggle resets to the student's assigned language on each question advance.

**⚠️ The toggle must not wipe in-progress work.** `MatchingResponseInput` keys placements by **left-term text** (`Record<string, number|null>`, `:213-217`) and gates reset on `useResetOnChange(question.id, …)` (`:264`) — and the question id does not change when the locale toggles. A student who places 3 of 4 Somali pairs and taps "English" would find `zonePlacements[englishTerm]` undefined, all zones empty, and the chips also gone from the bank. So:

1. Extend the reset key to include the active locale — key `StructuredQuestionInput` on `${question.id}:${locale}`.
2. Round-trip the current placement through the English canonical form so nothing is lost.
3. Test it: "toggling locale mid-question preserves the student's placement."

**Student results recap.** §4.5 writes English into the response, so the review surface would show a Somali-reading student their own answer in English. The surface is **`PublishedScoreReview` (`:4111`)** — the self-paced post-publish review — **not** `ReviewPhase` (`:3910`), which is the teacher-paced between-question leaderboard and, per D15, unreachable for a translated student. Resolve three strings through `localized`: the question text (`:4581`), the student's own answer (`:4503`, displayed via `formatAnswerForDisplay` at `:4605-4610`), and `revealedAnswers[q.id]` (`:4526`).

**Spanish gets the full app shell for free (D28).** Spanish is an app locale (`i18n/index.ts:10-15`), and it will be the most common accommodation by far — so when `override.language` matches an app locale, switch the i18n language too. Somali and Hmong keep the English shell; the disclosure narrows to those two.

### 4.7 Read-aloud × translation (D25) — suppress the speaker

A student with both `readAloud: true` and `language: 'so'` currently gets translated text with English audio. **v1 suppresses the speaker control on translated questions.** When a question renders localized, pass `enabled: false` to `useQuizReadAloud` (or suppress `readAloudOn`) for it; the control returns on the English toggle. No explanatory copy — the control's absence is the message.

Target-language synthesis is deferred to v2, because it is a redesign of read-aloud rather than an extension. Five structural blockers, recorded so v2 starts from facts:

1. `QuizReadAloudManifest.voice` is a **scalar** (`types.ts:3578`) — one voice per session.
2. `files: Record<string,string>` is keyed by `partKey(questionId, part)` (`functions/src/quizReadAloud.ts:282`) with **no locale dimension**. Changing the key format breaks in-flight sessions.
3. `prepareQuizReadAloud` resolves one `language` from `session.language` (`:799-803`) and writes the manifest as a whole-object merge (`:855-875`); the callable takes only `{ sessionId }` (`:1197-1201`) and hard-refuses students (`:1195`).
4. `enumerateParts` (`:391-428`) reads only the top-level English fields via `resolvePartText`.
5. `prepareReadAloudAfterTargets` runs with `deadlineMs = 40_000`, and every synthesized character meters against the single org `neural2MonthlyCapChars`.

**And there are no voices for two of the three target languages.** `QUIZ_READ_ALOUD_VOICES` (`config/quizReadAloud.ts:20`) covers `en-US`, `es-US`, `de-DE`, `fr-FR`; `VOICE_NAME_RE` (`functions/src/quizReadAloud.ts:515`) requires an `xx-XX-(Neural2|Standard)-[A-J]` shape that no Somali or Hmong voice can satisfy, because Cloud TTS has none.

**Suppression also fixes a live bug.** Today, `useQuizReadAloud.choicePart` resolves `canonical.choices.indexOf(text)` (`components/quiz/readAloud/useQuizReadAloud.ts:475-479`) against the English canonical question, so a localized string returns `-1` → no speaker on any choice, term or item. But `{kind:'question'}` needs no text lookup, so **the question stem still plays English audio over translated text** — precisely the outcome this decision exists to prevent.

## 5. Generation (D12)

New Cloud Function `translateQuizV1` in `functions/src/quizTranslation.ts`, following the callable shape of `functions/src/quizReadAloud.ts:1185-1235` and the structured-output pattern of `functions/src/aiGeneration.ts`.

**Registration.** One line in the `functions/src/index.ts` barrel (which documents an invariant that its exported identifier set stays stable): `export { translateQuizV1 } from './quizTranslation';`. Region is **not** per-function — it comes from `setGlobalOptions({ region: 'us-central1' })` in `functions/src/functionsInit.ts`, which the leaf module must side-effect-import. **There is no App Check anywhere in this repo — do not add it.**

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

**Data source.** The client sends the questions array in the callable payload and writes the sidecar itself via `QuizDriveService`. Reading Drive from the function would require the encrypted-refresh-token path in `functions/src/googleOAuth.ts`, which not every teacher has. (An earlier revision was ambiguous — §3.3 implied client-side, §5 implied server-side. It is client-side.)

**Model and config (D20).** Do **not** route to `advancedModel`; this is not a reasoning task.

```ts
model: geminiConfig.standardModel, // 'gemini-3.5-flash-lite' (aiGeneration.ts:47); keeps the
                                   // admin override at global_permissions/gemini-functions
config: {
  responseMimeType: 'application/json',
  responseSchema: buildQuizTranslationResponseSchema(),
  thinkingLevel: 'minimal',   // 3.x. The repo sets NO thinking config anywhere today, so an
                              // admin flipping standardModel to a thinking model would
                              // silently 2-4x output cost. Set it explicitly.
  temperature: 0.2,
  maxOutputTokens: 16384,     // whole quiz; 4096 for a stale-question batch
}
```

Reject on `finishReason === 'MAX_TOKENS'` and surface it to the teacher: a truncated array is a **misaligned** array, which is exactly the mis-grading failure §3.2 exists to prevent. Never serve one. Parse with `parseGeminiJson` (`functions/src/parseGeminiJson.ts`), not `JSON.parse`.

**Response schema shape.** The repo already uses structured output (`buildQuizResponseSchema`, `aiGeneration.ts:1278`). Gemini's `Type.OBJECT` needs declared properties, so `questions` **cannot** be a `Record<string, …>` — it must be an **array** of `{ questionId, text, choices[], matchingLeft[], matchingRight[], matchingDistractors[], orderingItems[], placeholder, rubric }` which the function then keys by id.

**Send a flat indexed array, require the same length back.** Rather than asking the model to echo a nested structure, send the translatable strings as a flat indexed array per question and require an equal-length array in reply. This makes index alignment a **length check that structurally cannot pass a misaligned payload**, eliminates the "model dropped a question id" failure mode, and cuts roughly 25% of output tokens. (Borrowed from Cloud Translation's `translateText` contract, which guarantees same-length same-order output — see §16 for why the API itself was rejected.)

**One Gemini call per quiz per language** — all questions in one request so terminology stays consistent. One metered unit. Regeneration re-translates **all stale questions for a language in a single call** ("Regenerate 6 stale questions"), not one call per question: per-question regeneration would turn a 20-question review into 60 invocations and 60 quota units, exactly the number this design claims to avoid, while re-paying the ~750-token system prompt each time.

**English source only (D17).** Refuse when `QuizData.language` is set to anything non-English. Predicate: `!lang || lang.toLowerCase().startsWith('en')` (the field defaults to `'en-US'`, `config/quizReadAloud.ts:6`, so "absent" is the common case). Disable Generate in the UI with that reason.

**Validation is mandatory and must be server-side.** Do **not** "mirror `validateAndBucketQuizQuestions`" (`aiGeneration.ts:1443`) as an earlier revision instructed: that function **silently drops** malformed items with `continue` under per-type quotas — no reject, no retry, no error surface — and it handles only MC/FIB/Matching/Ordering, not the free-response fields this payload translates. Specify instead:

- Per-field length equality against the **filtered** source arrays (`q.incorrectAnswers.filter(Boolean)`, `(q.matchingDistractors ?? []).filter(Boolean)`).
- Every requested `questionId` present; no extras.
- MC choices mutually distinct after `normalizeAnswer` — `new Set(choices).size === choices.length`. A translation that collapses two choices makes the question unanswerable, and Latin-script cognates across all three target languages make this more likely, not less.
- `rubricSnapshot` structurally identical to the English rubric (same criteria count, same descriptor counts per criterion).
- **No `|` or `:` introduced into any matching or ordering string.** These are the wire-format delimiters (§4.5): `emit` builds `${term}:${def}` joined by `'|'`, and `gradeAnswer`'s `splitPair` would mis-parse a translated string containing either.
- Preserve numbers, units, proper nouns, and any LaTeX/markup verbatim; do not translate anything inside code formatting.
- On failure: one repair attempt with the validator's complaint appended, then fail loudly. Never partial-serve.

**Quota (D20).**

| Constant             | Value                                                                                                                        | Why                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Teacher daily        | **40** quiz-language generations at `ai_usage/{uid}_translation_{YYYY-MM-DD}`                                                | Realistic authoring day ≤9; an EL coordinator clearing a backlog ≤30. Bounds one teacher to ~$0.32/day |
| Org monthly (units)  | **2,000** quiz-language units at `ai_usage/global_translation_{YYYY-MM}`                                                     | ~3× realistic district peak. Worst case ~$16/month                                                     |
| Org monthly (tokens) | **8,000,000** output tokens                                                                                                  | The cap that actually bounds money. Increment from `result.usageMetadata.candidatesTokenCount`         |
| Enforcement          | **Hard block, `resource-exhausted`, checked before the Gemini call**, incremented in the same transaction as the teacher row | See below                                                                                              |

Mirror the doc-id helpers at `quizReadAloud.ts:506-513` and the transaction shape of `billSynthesis` (`:602-631`).

**⚠️ Do not literally copy read-aloud's cap behavior.** Read-aloud's cap is a _graceful degrade to a cheaper voice tier_ — `neural2Exhausted()` (`quizReadAloud.ts:589-600`) switches tiers and does not block; `grep resource-exhausted functions/src/quizReadAloud.ts` returns **zero hits**, and its teacher daily row is written but never read against a limit. Translation has **no cheaper tier to degrade to**, so "mirror the quota/cap structure" would ship an uncapped feature with a decorative counter. Block.

**Meter output tokens, not just calls.** `grep -rn "usageMetadata\|totalTokenCount\|thinkingConfig\|maxOutputTokens"` across the repo returns **zero hits** — every existing AI feature counts invocations. Five lines here make a cost spike visible instead of invisible.

### 5.1 PR2 must be able to invoke the callable (D35)

Generation is client-driven: the client sends the questions and writes the sidecar itself. So with the Languages tab absent, **nothing in PR2 calls `translateQuizV1` and nothing calls the new `QuizDriveService` sidecar API** — PR2 would ship a callable and a Drive API that no code path exercises, and a client/server payload mismatch would stay invisible until PR3.

Add a **DEV-only Generate harness** to PR2. This is a repo convention, not throwaway scaffolding: `components/dev/` holds twelve harnesses routed from `App.tsx:638-700` behind `import.meta.env.DEV`, including `QuizEditorDevView.tsx`. The harness picks a quiz and a locale, calls `translateQuizV1`, runs the response through the validator, and writes the sidecar through `saveTranslation` — proving the flat-indexed-array contract, the length check and the Drive write before PR3 builds UI on them. It also gives PR3 and PR5 a way to regenerate fixtures.

It is DEV-only, so it ships no production surface and PR2 keeps its "changes nothing for anyone" property.

## 6. Free-response back-translation (D14)

**An explicit per-response teacher button**, not lazy-on-open. The teacher clicks "Translate this response" on the one they cannot read; the result is cached. Cost becomes opt-in and observable, and opening a class set of 30 responses × 5 questions does not fire 150 unrequested calls.

`components/widgets/QuizWidget/components/FreeResponseGrader.tsx` shows the native text and the back-translation side by side, with the back-translation clearly labeled machine-generated. **The native text is always the primary record.**

**Server path: a new `backTranslateResponseV1` callable (D36)**, beside `translateQuizV1` in `functions/src/quizTranslation.ts`, exported from the `functions/src/index.ts` barrel. It reuses that module's model config, `parseGeminiJson` and quota helpers, and meters on its own key.

Do **not** reuse `generateWithAI`: its `dailyLimit ?? 20` (`aiGeneration.ts:526-532`) would lock a teacher out mid-class-set, and raising it there changes quota behavior for every other AI feature on that function. Do **not** fold it into `translateQuizV1` behind a mode flag either — a per-quiz-language metered unit and a per-response unit have different doc ids and different caps, and one quota transaction should not carry both.

Scope and mechanics:

- **Free-response only.** FIB is not translated in v1 (D21), so there is no non-English FIB answer to back-translate.
- **Cache key: `sha256(answerText + locale)`**, mirroring `cacheHash` (`quizReadAloud.ts:670`) — **not** the response id. Drafts autosave and retakes exist (`takeIndex`), so a response-id key would serve a stale translation of edited text.
- **Cache location: a teacher-only top-level key on the response, not inside `answers.*`.** `answers` is on the student write whitelist (`firestore.rules:3445`), so a student draft-autosave or retake could clobber or forge a cached translation stored there. `grading` is the precedent — deliberately excluded from the student whitelist.
- **Quota: a separate `quizBackTranslation` key, 200/teacher/day.** Do **not** inherit `generateWithAI`'s `dailyLimit ?? 20` (`aiGeneration.ts:526-532`) — a teacher grading a class set would be locked out mid-session.
- Cost: ~$0.0006/call on flash-lite; roughly $15/district-year at realistic volume.

`components/widgets/QuizWidget/components/AnnotatedResponseView.tsx` needs **no change**: it anchors annotations to a frozen `gradingSnapshot` and explicitly never reads the live answer (header `:26-28`), so native-text anchoring is already the default. Only avoid writing a back-translation _into_ the snapshot.

Second-order note worth one line in the grader: the student read a **translated** rubric while the teacher grades against the English snapshot. Intended — but `FreeResponseGrader` may optionally show the student's rubric text.

## 7. Admin gating (D3, D13, D24)

**One merged "Quiz Languages" tab.** Rename and extend `components/admin/QuizReadAloudConfigurationPanel.tsx`, registered as its own admin tab at `components/admin/AdminSettings.tsx:142-147`:

```ts
{ id: 'quiz-read-aloud', label: 'Quiz Read-Aloud', icon: Volume2, component: QuizReadAloudConfigurationPanel }
```

> **Two corrections to earlier revisions.** §7 previously said to register "alongside the existing `'quiz'` entry in `components/admin/FeatureConfigurationPanel.tsx:690`". That line is one entry in a **negative** array feeding a _"No global settings available for this widget"_ placeholder guard (`:684-705`); `grep -in quiz` over that file returns exactly that one line and there is no quiz panel in it. Separately, `VideoActivityConfigurationModal` is mounted from a third surface, `components/admin/FeaturePermissionsManager.tsx:946`. Three distinct admin surfaces were conflated in one sentence. And an even earlier draft proposed `QuizGlobalConfig` (`types.ts:4808`) — which is `{ dockDefaults? }`, referenced **nowhere in the repo**. Dead code. Ignore all three.

The panel already provides every pattern needed — reuse them, add no new visual vocabulary:

- **Language table** (`:130-208`) — `rounded-xl border border-slate-200 bg-white`, `thead bg-slate-50 text-xs uppercase tracking-wider text-slate-500`, label over a `block text-xs` BCP-47 tag. Extend to: `Language | Offer for translation (Toggle) | Read-aloud voice`, rendering **"—"** where a language has no `QUIZ_READ_ALOUD_VOICES` entry. That makes §7's "reconcile with `voicesByLanguage`" requirement literally visible: Somali and Hmong will show "—", which is the honest state (§4.7).
- **Cap + burn-down** (`:238-268`) — clone the `grid gap-4 sm:grid-cols-2` block: a numeric input on the left, a "This month" `<dl>` of `flex justify-between` rows with `font-mono` values and a percentage on the right.
- **Dirty-gated Save** (`:270-296`) with the draft seeded once from the first snapshot (`:74-77`) so later snapshots never clobber edits.

**New config module.** No reusable language catalog with native labels exists — `i18n/index.ts:10-15` `SUPPORTED_LANGUAGES` covers only the four **UI** locales (wrong axis, and D3 exceeds four), and `QUIZ_READ_ALOUD_LANGUAGES` (`config/quizReadAloud.ts:9-17`) is four hard-coded entries with **no `nativeLabel` field**. Add `config/quizTranslation.ts`:

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
```

`nativeLabel` is **data** rendered to the student, never an i18n key.

**⚠️ Two `firestore.rules` carve-outs are required, and the merge does not remove either.**

1. `firestore.rules:699` is `match /admin_settings/{document=**} { allow read, write: if isAdmin(); }`, with `/subjects` (`:704`) the sole teacher-readable carve-out. The teacher's Languages tab reads the curated list, so it needs the same treatment — **on a separate `admin_settings/quiz_translation` doc**, not by widening `quiz_read_aloud`, which would expose the org's TTS cap config to every teacher:
   ```
   match /admin_settings/quiz_translation {
     allow read: if request.auth != null;
     allow write: if isAdmin();
   }
   ```
   Merging the _writer_ into one admin panel does not make the doc _readable_. Without this the picker silently renders empty.
2. `ai_usage` reads are uid-prefixed (`:4195-4198`), so `global_translation_{YYYY-MM}` is **unreadable by a teacher**. Do not widen that rule — it would expose every teacher's usage to every other teacher. Instead **return `{ capRemaining, capTotal }` from `translateQuizV1`**, on both success and the `resource-exhausted` error. Note that copying `QuizReadAloudConfigurationPanel.tsx:69`'s error handler (`() => setUsage({ neural2Chars: 0, … })`) into a teacher surface would render `permission-denied` as _"0 of cap used"_ — i.e. fail **open** to "plenty of budget."

**Feature toggle** goes in `components/admin/GlobalPermissionsManager.tsx` (where `quiz-read-aloud` is registered), not in this panel.

Admin copy stays hard-coded English, consistent with the entire admin tree (§14).

## 8. Review UI (D11)

New `'languages'` tab in `components/widgets/QuizWidget/components/QuizEditorModal.tsx`.

**It is a 4-site change, not 2, and the omission fails silently.** An earlier revision said "the tab state union is at `:276-277` and the tab array at `:508`. Add to both." Current lines and the full set:

1. `:277-279` — the state union `useState<'questions' | 'stimuli' | 'settings'>`
2. `:510` — the tab strip array `(['questions', 'stimuli', 'settings'] as const).map(...)`
3. `:548` — the **contextPane** ternary chain, whose final `else` _is_ the Settings pane (`:549-558`)
4. `:577` — the **detailPane** ternary chain, whose final `else` is the Settings blurb (`:578-584`)

Add `'languages'` to 1 and 2 without new branches at 3 and 4 and the Languages tab **renders the Settings panel, with no TypeScript error.**

Also: labels auto-derive from `tab.charAt(0).toUpperCase() + tab.slice(1)` (`:521`), so `'languages'` renders "Languages" for free (and hard-coded, like the other three). Gating the tab on `canAccessFeature('quiz-translation')` — as read-aloud does at `:247` — requires converting `:510`'s `as const` literal to a computed array **plus** a guard so `editorTab === 'languages'` falls back to `'questions'` when access is revoked mid-session. `isBank` forces `activeTab` to `'questions'` (`:482`) and hides the strip entirely (`:508`), so question banks have no Languages tab.

**Layout — two panes, via the existing `EditorWorkspace` shell** (`components/common/EditorWorkspace.tsx`, default `contextRatio` 56):

- **contextPane (56%)** — language chip row from the curated list, each chip showing `nativeLabel` and a served count (pattern: `components/settingsModal/sections/LanguageSection.tsx:38-67`); the Generate button with **one** conditional disabled reason; then the question list with a Reviewed checkbox, a Stale badge, and a "Regenerate N stale questions" affordance. The quiz-level advisory strip (§3.4) sits at the top, conditional.
- **detailPane (44%)** — side-by-side English / target for the **selected** question only, with inline editing. Four text columns in the 56% pane of an `h-[85vh]` modal is not readable; two in 44% is.

**Loading and saving.** No hook exists. Add `hooks/useQuizTranslations.ts`. Translation edits **do not** participate in the modal's `isDirty`/`handleSave`: save per-locale independently, so a translation edit cannot be lost by discarding quiz changes and a quiz save cannot push unreviewed strings.

**Copy — zero standing explanatory paragraphs.** An earlier revision asked for fifteen distinct pieces of user-facing copy, six of them always-on paragraphs on this one tab. Every remaining string is conditional, counted, or an empty state:

| Need                             | Form                                                                                                                                                                                                                                               | Where                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Review progress                  | **the counter IS the disclosure** — "12 of 20 served in Español"                                                                                                                                                                                   | replaces the standing "unreviewed and stale are served in English" note |
| Stale                            | badge only, no sentence                                                                                                                                                                                                                            | per question row                                                        |
| Generate disabled                | **one** line, cap-reached **xor** non-English-source — never both                                                                                                                                                                                  | adjacent to the button                                                  |
| Stimulus images                  | counted quiz-level line (§3.4)                                                                                                                                                                                                                     | `QuizAuthoringAdvisory` strip                                           |
| "You may not read this language" | **empty state** at zero reviewed, gone on first review                                                                                                                                                                                             | detailPane empty state                                                  |
| No language chosen yet           | empty state                                                                                                                                                                                                                                        | detailPane                                                              |
| App chrome stays English         | ≤8 words, **only** when the code is not an app locale — so never for Spanish (D28)                                                                                                                                                                 | footnote under the picker                                               |
| Read-aloud suppressed (§4.7)     | **nothing** — the control's absence is the message                                                                                                                                                                                                 | —                                                                       |
| D15 SSO-only                     | **nothing here** — already structurally enforced, and `OverrideEditorRow.tsx:277-293` already discloses it for read-aloud in four words via `t('quizReadAloud.help')` ("Signed-in students only.") — reuse that key under the new language control | `OverrideEditorRow`                                                     |
| Rubric override × language       | **nothing** — struck entirely, see §14                                                                                                                                                                                                             | —                                                                       |
| Bank-slot quiz (D29)             | tab disabled with a reason                                                                                                                                                                                                                         | tab                                                                     |

**The review gate is procedural, and the tab should be honest about that** (D26): it stops malformed and misaligned payloads from being served; it does not stop a bad translation, because the reviewing teacher usually cannot read the target language. The zero-reviewed empty state suggests routing to an EL specialist. A shareable specialist review link is deferred to v2.

## 9. Staleness (D8)

On every quiz save, recompute a per-question content hash over the fields that feed translation (`text`, `correctAnswer`, `incorrectAnswers`, `matchingDistractors`, `placeholder`, `rubricSnapshot`), compare against each language's `sourceHashes`, and update `staleCount` in the `QuizMetadata` index plus the id list in the Drive sidecar.

Stale questions are **not projected** (§4.3) and are flagged in the Languages tab. A one-comma typo fix costs the teacher one question's re-review, not the whole quiz.

**One canonical serializer, imported by both runtimes.** There are two hash authors — `translateQuizV1` writes `sourceHashes`, the client recomputes on save — and no specified serialization. Divergence means either _everything reads stale forever_ (the feature silently never serves a translation, and regenerating cannot clear it) or _nothing ever reads stale_ (a translation of edited content is served to a child). Pin all of it:

- **After `normalizeQuizData`**, on both sides. Legacy `'short'`/`'essay'` types are rewritten to `'free-response'` on read (`utils/quizQuestionNormalize.ts:3-5`), and `normalizeQuizData` runs on Drive load (`utils/quizDriveService.ts:25`) and in `pullSyncedQuizContent` (`hooks/useSyncedQuizGroups.ts:239`). Hash the raw Drive JSON on one side and the normalized form on the other and every pre-rename quiz reads stale forever.
- **Filtered arrays** (`.filter(Boolean)`), matching §3.2's alignment contract.
- Explicit collapse rule for `undefined` / absent / `''`, and stable key order including the nested `rubricSnapshot`.
- Prefer making `translateQuizV1` the sole **author** and the client only a **comparator**.

**`pullSyncedQuiz` is a second staleness trigger** and "every quiz save" misses it. It **overwrites the local Drive replica** with a peer's canonical content (`hooks/useQuiz.ts:323`) and is auto-fired by `usePlcAutoPullSync` — that is not a save, and `sourceHashes` would still match pre-pull content, serving stale translations as fresh. **Decision (D38): rehash on pull.** Recompute per-question hashes against the pulled body and mark only genuinely changed questions stale.

The alternative — a pull invalidates every translation for the quiz — is trivially correct and brutally wrong in practice: `usePlcAutoPullSync` fires automatically, so one peer's comma fix would silently un-serve every EL student's entire quiz until someone re-reviewed 20 questions × 3 languages.

This relaxes the "prefer `translateQuizV1` as sole author" line above: the client authors hashes on the pull path. That is safe **only** because this section already requires one canonical serializer imported by both runtimes — the client runs identical code, which is exactly what the cross-runtime equality test in §12 asserts. Do not let the two implementations diverge.

Do **not** auto-regenerate the newly stale set: it would spend quota from a background sync the teacher never initiated, and the result lands unreviewed and therefore still unserved.

**Cost:** hashing is cheap (the quiz body is already in memory at `hooks/useQuiz.ts:236`) and the hashes live in the sidecar, so there is no extra Firestore write — but it does add **one Drive write per language per save** to update `staleQuestionIds`. Write only when a hash actually changed.

## 10. Assign-time warning (D5)

In `components/common/library/AssignStudentPicker.tsx` (which already resolves standing overrides at `:128`), cross-reference each targeted student's `override.language` against `QuizMetadata.translations`. This is **free**: `applyDefaultOverride` (`:122-133`) reads an already-loaded roster in memory, and `QuizMetadata` is already in `useQuiz`'s `onSnapshot` cache (`:176-181`). No extra reads, no Drive call.

When a targeted student needs a language the quiz lacks (or has only unreviewed/stale), show an inline advisory naming the student and the language, with a **Generate** action. Reuse the existing pattern at `components/widgets/QuizWidget/components/QuizManager.tsx:2158-2166` — `role="status"` + `text-xxs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5` — keyed `quizTranslation.assign.advisory.missing_one/_other`. **Never block a publish**; a teacher pushing out a bell-ringer at 7:58 will not thank us.

**D17's English-source check cannot be answered here.** `QuizMetadata` has **no** `language` field (`:3755-3782`), so unlike the translation-existence check this one needs the Drive body. **Decision (D34): add `language` to `QuizMetadata`.** The Generate button in the assign advisory then carries a correct disabled reason with zero Drive reads, consistent with how the translation-existence check above already works. Absent means English (D17's own rule), so existing quiz docs need no backfill. `translateQuizV1` still enforces the gate server-side — the field is a UI affordance, not the authority.

**Bank-slot quizzes lie to this advisory (D29).** A quiz with `bankSlots` draws its served questions from **separate bank Drive files** at assign time (`components/widgets/QuizWidget/Widget.tsx:1519-1571`), snapshotted as `resolvedDriveFileId`. Those question ids never appear in `QuizData.questions`, so a teacher who translates all 5 fixed questions of a 5-fixed + 15-drawn quiz gets `reviewedCount: 5, staleCount: 0, questionCount: 5` — **full coverage, no warning** — and the EL student receives 5 Spanish questions and 15 English ones. Treat any assignment with `bankSlots` / `resolvedDriveFileId` as untranslated regardless of the index.

**Targets edited after publish never re-project.** `hooks/useAssignmentDetailActions.ts:113-170` `saveEdit` lets a teacher add students and edit overrides on a **live** assignment; it calls `setAssignmentTargets` and patches `overridesBySourcedId` and **never touches `session.publicQuestions`**. A new EL student enrolled on Tuesday and added to Friday's already-published assignment gets English permanently, with no advisory anywhere — §10's advisory lives only in `AssignStudentPicker`.

Read-aloud solved this server-side: `setAssignmentTargetsV1` detects `readAloudGained` (`functions/src/studentAssignmentTargets.ts:924-927`) and fires `prepareReadAloudAfterTargets`. Translation **cannot** do that — the projection runs on the teacher's client with Drive credentials. **v1: detect the gap in the edit modal and surface the same advisory there.** Re-projection on edit is a v2 option and must reuse the existing permutation, never reshuffle.

## 11. Build order — 6 stacked PRs

This is roughly **8,500 lines across ~70 files**. For calibration, read-aloud — a strictly smaller feature with no index-alignment refactor, no grading-path change, no review UI and no sidecar storage layer — shipped as three stacked PRs. Each PR below merges green, leaves a shippable app, and is independently reviewable.

### PR0 — roster standing-default writer (prerequisite, not this feature)

D1's headline story — _"a teacher sets a student's language once on the roster"_ — has **no writer**. `ClassRoster.defaultOverridesByStudentId` is read (`AssignStudentPicker.tsx:128`) and never written: `components/classes/RosterEditorModal.tsx` has zero references, and `hooks/useRosters.ts:381` carries the comment _"so bypass mode doesn't diverge once `defaultOverridesByStudentId` gets a writer."_

Build the per-student accommodation row in the roster editor as its own PR first. It is generic infrastructure that read-aloud and extended time need too, and translation then lands on top for free.

**Design is §3.5 (D31, D32).** A disclosure under each `RosterRow` rendering `<OverrideEditorRow quizMode={false}>` — not a fifth grid column and **not** a wider modal; §3.5 has the width math for why neither works. Scope is the three quiz-agnostic fields, which is precisely what `quizMode={false}` already renders. The real work is threading a fourth axis through `DraftRow` → `onSave` → `updateRoster`, plus `parseStudentOverride` (§3.1) so the default survives a reload.

PR0 ships `language` in none of this — it is the generic writer. Translation's `language` field lands in PR1 and appears in this editor for free.

### PR1 — override plumbing + the whole index-alignment path (dark)

Types, the three allowlist fixes, `reindexChoiceArray`, `seededPermutation`, the locale-aware projection, both rewired client transforms, **and the English answer cache (D22)**.

**This PR is not "types only."** §3.1's three allowlists (`sanitizeOverride`, the functions-local duplicate interface, `parseStudentOverride`) are behavior, and two of them are in `functions/` — so PR1 ships a functions change and a functions deploy.

**Do not split the submit-time conversion out of this PR.** An earlier revision's gate for the projection step — _"a student picking index i in locale L produces the correct English string"_ — is **untestable without the conversion**, because no code maps a selection to a written English string until it exists. Splitting them makes the mis-grade invisible, exactly as splitting the projection from the client transforms would.

It also carries §3.6's **per-field merge** at `AssignStudentPicker.tsx:121-131` (D33). That is a behavior change to an existing path and belongs with the allowlist fixes, since both are "the override actually reaches the student" work.

Gate: a **round-trip test** with `hiddenOptionIdsByQuestion` and the seeded shuffle both active, for every answer type, plus §12's structural-identity regression. Ships with zero behavioral change for every existing user.

### PR2 — generation plumbing (behind the feature flag)

New `QuizDriveService` sidecar API, `QuizMetadata.translations` with the four-site preservation fix, the copy-path decisions, `translateQuizV1` + validator + quota, the merged admin panel, `config/quizTranslation.ts`, the `quiz-translation` flag, both `firestore.rules` carve-outs + `tests/rules`, and the analytics id registration. With the Languages tab absent, this changes nothing for anyone — and per §5.1 (D35) it also carries a **DEV-only Generate harness** in `components/dev/`, so the callable, the validator and the sidecar write are exercised end-to-end inside this PR instead of first meeting each other in PR3. Add `QuizMetadata.language` here too (D34); the assign advisory that consumes it lands in PR3.

### PR3 — teacher review + student serving

The Languages tab, localized rendering, the accommodation bar + toggle (with the reset-key and bidirectional-hydration fixes), `PublishedScoreReview` resolution, the Spanish i18n switch, read-aloud suppression, the assign-time advisory, the post-publish-edit advisory, and the `OverrideEditorRow` language select. This is where the feature becomes real; it needs a preview-URL pass with a real SSO student, which is why it must not also carry PR1's refactor risk.

### PR4 — free-response back-translation

Fully additive, gated on a non-English `locale` existing on a response.

### PR5 — PLC translation sync

Requires a `firestore.rules` change: `/synced_quizzes/{groupId}` is schema-locked by `hasOnly(['id','version','title','questions','participants','plcId','createdAt','updatedAt','updatedBy','behavior','stimuli'])` on **both create and update** (`firestore.rules:1393-1431`), so a `translations` field is **rejected outright** today. **Locales stay in Drive; the sync copies the sidecars (D37).** The group doc carries no translation bodies — that would contradict §3.3 outright, since `usePlcAutoPullSync` would then transfer every locale payload on every auto-pull. It does not carry the index either: a `QuizTranslationIndexEntry.driveFileId` written by the author points at a file in the **author's** Drive that the puller cannot read, so a copy into the puller's Drive is required no matter where the index lives. The `firestore.rules:1393-1431` `hasOnly` change is therefore needed only if a small index field ends up on the group doc — confirm before writing the rules change, and prefer not needing it.

Per-locale copies use `Promise.allSettled`: a locale that fails to copy is dropped and re-copied on the next sync, never blocking the pull. Also needs a Drive handle on the sync path, the `reviewedQuestionIds` authority rule (canonical wins, D-R3-1), §9's rehash-on-pull (D38), and it lifts PR1's `syncAssignmentToLatest` refusal.

## 12. Test plan

- **Round-trip correctness (highest priority):** for every answer type, with `hiddenOptionIdsByQuestion` set **and** the per-student seeded shuffle active, the English string the client writes for a locale-L selection equals what a monolingual student selecting the same option writes. This is the test that would have caught §4.4.
- **The cache holds English:** a translated student's draft autosave, timer auto-submit, and unload flush each write the English canonical value — not the displayed string. Cover all five write paths from §4.5.
- **Projection security:** no `correctAnswer`, no `matchingDistractors` key on any `localized` entry for any locale, and **no field on the session doc that is a function of `correctAnswer`, `incorrectAnswers` or `matchingDistractors`**; permutation identical across English and every locale; translated MC choices mutually distinct.
- **Lockstep transforms:** `applyHiddenOptions` and `shuffleQuestionForStudent` leave English and every locale array the same length and order, with and without `localized`.
- **Hydration round-trip:** a translated student places all Matching pairs, navigates away and back, and sees their placement intact.
- **Locale toggle preserves work:** toggling mid-question does not clear placements (§4.6).
- **`locale` is per-call:** drafting in Somali, toggling to English and re-answering **clears** `locale`.
- **PLC re-sync refuses:** `syncAssignmentToLatest` throws on a session carrying `localized` (PR1) rather than silently stripping it.
- **Index preservation:** `translations` survives `saveQuiz`, `pullSyncedQuiz`, `detachSyncedQuiz` and duplicate.
- **Fallback matrix:** unreviewed → English; stale → English; locale missing from session → English; student with no `language` → completely unchanged; **PIN joiner → English** (D15), and does not crash on a `localized` field it never reads.
- **Override plumbing:** `language` survives roster default → assign picker → `sanitizeOverride` → pointer doc → student client. This is the test that catches §3.1's allowlists.
- **Standing-default merge (D33):** a student with a standing `language` whom the teacher also gives `timeMultiplier` on this assignment keeps **both**; a per-assignment `language` still beats the standing one.
- **Staleness:** editing one question marks only that question stale, in every language; client and function hashes agree for the same quiz (cross-runtime equality). **`pullSyncedQuiz` rehashes (D38):** a peer edit to one question marks only that question stale, not the whole quiz.
- **Validation:** malformed model output — wrong array length against the _filtered_ source, missing question id, collapsed duplicate choices, a `|` or `:` introduced into a matching string, `MAX_TOKENS` truncation — is rejected, not served.
- **Quota:** per-quiz-per-language metering; org monthly cap **blocks** generation with `resource-exhausted` and surfaces `capRemaining`.
- **Bank-slot quizzes:** the Languages tab is disabled and the assign advisory treats the quiz as untranslated (D29).
- **Rules:** teacher reads `admin_settings/quiz_translation` but cannot write; admin writes; the pointer doc with `override.language` stays student-readable and non-writable.
- **i18n:** `tests/i18n/quizTranslationLocales.test.ts` — every key present and non-empty in all four locales, with interpolation-placeholder and `_one`/`_other` assertions.
- **Regression:** the full existing quiz suite passes untouched — a quiz with no translations produces a **structurally identical** session doc to today, emitting no new fields. (Not byte-identical: `toPublicQuestion` shuffles with `Math.random()`.)

## 13. Explicit non-goals for v1

- **FIB translation (D21).** FIB questions stay English for every student.
- **Translation for code+PIN joiners (D15).** Overrides ride SSO pointer docs.
- **Non-English source quizzes (D17).**
- **Bank-slot quizzes (D29).**
- **Target-language read-aloud synthesis (D25).** Deferred to v2, scoped to locales that have voices.
- Vision/OCR translation of text inside stimulus images (D10).
- **`QuizStimulus.readAloudText` and `QuestionTargetTag.label`** — both teacher-authored and student-visible, both out of scope, both named here so they are not silently missed (§3.4).
- Quiz **directions** — the field does not exist (D27).
- Student-facing self-service language selection.
- App UI chrome beyond `en/es/de/fr` — so Somali and Hmong students read translated questions in an English shell. Spanish gets the full shell (D28).
- Video activities, guided learning, mini-apps.
- Specialist / PLC review routing, and a reviewer attestation record (D26) — v2.
- Translation of teacher-facing surfaces (monitor, results, exports) — English by design (§4.5).

## 14. Resolved open items

All three of the previous revision's open items and the §4.5 gate are now decided:

1. **PLC sync semantics** → translations sync, as PR5, with the `hasOnly` rules change and `reviewedQuestionIds` authoritative from the canonical doc (D-R3-1).
2. **`rubricOverrideByQuestion` × translation** → **struck, not deferred. There is no interaction.** `resolveRubricForResponse` (`utils/rubricOverrideResolution.ts:22`) has exactly **one** caller — `FreeResponseGrader.tsx:427`, teacher-side. The student client renders `currentQuestion.rubricSnapshot` straight off the session doc (`QuizStudentApp.tsx:3408-3412`). A rubric-overridden student has **never** been shown their override; they see the session rubric, in English, today. Translation changes nothing. No code, no UI note.
3. **Read-aloud interaction** → suppress the speaker on translated questions (D25, §4.7).
4. **Review/staleness gating** → both at publish (D23, §4.3).

## 15. Copy and i18n

The previous revision contained ~15 user-facing English sentences and never mentioned i18n — in a translation feature.

**Structure:** a single `translation` bundle across four flat files, `locales/{en,de,es,fr}.json` (`i18n/index.ts:24-29`). There are **no per-namespace files**. Organized as top-level feature groups; add **`quizTranslation`**, sibling to `quizReadAloud` and `quizMediaResponse`.

**Which surfaces get keys:** the repo's pattern is that student-facing and newly-built teacher surfaces are translated while older editor internals and all admin panels are not. So the Languages tab, the student UI, the assign advisory and the `OverrideEditorRow` additions **must** be keyed — each sits next to already-translated siblings, and hard-coding them would make one control in a row speak English while its neighbour speaks German. **Admin copy (§7) stays hard-coded**, consistent with the whole admin tree.

**All four files, in the same PR (English placeholder values are acceptable** — `quizMediaResponse` shipped 188 of 211 keys as verbatim English copies). Keys must exist in de/es/fr or those teachers get silent `en` fallback.

Key scheme — plurals as `_one`/`_other`, never `(s)`, which `tests/i18n/i18n.test.ts:73-77` asserts against:

```
quizTranslation.label / .help (reuse quizReadAloud.help)
quizTranslation.editor.{tab,pickLanguage,generate,reviewed,stale,regenerate}
quizTranslation.editor.servedCount          "{{reviewed}} of {{total}} served in {{language}}"
quizTranslation.editor.disabled.{capReached,sourceNotEnglish,bankSlots}
quizTranslation.editor.chromeNote           (conditional; non-app-locale only)
quizTranslation.editor.empty.noLanguage.{title,body}
quizTranslation.editor.empty.noneReviewed.{title,body}
quizTranslation.authoring.advisory.stimulusText_one / _other
quizTranslation.assign.advisory.missing_one / _other
quizTranslation.student.toggle.{english,native}
quizTranslation.grading.{backTranslate,backTranslationLabel,machineGenerated}
studentOverride.language
studentOverride.chip.language
```

**⚠️ CI cannot catch a violation, so the plan must add the test.** `eslint.config.js` has no i18n plugin and no `no-literal-string`, so hard-coded JSX text is invisible to lint. There is **no global en↔de/es/fr parity test** — every file in `tests/i18n/` is a hand-written per-feature `REQUIRED_KEYS` list, and de/es/fr are already **164 keys behind** en with nothing flagging it. `pnpm run test:counts` guards suite counts, not key coverage.

So add **`tests/i18n/quizTranslationLocales.test.ts`**, modeled line-for-line on `tests/i18n/quizResultsStatsLocales.test.ts`: `REQUIRED_KEYS` asserted present and non-empty in all four locales, plus interpolation-placeholder assertions for `{{reviewed}}` / `{{total}}` / `{{language}}` / `{{name}}` and `_one`/`_other` presence.

## 16. Cost model

**~$68/district-year** for a 50-teacher district at 30 quizzes × 3 languages each. The dominant risk is not the bill; it is that constants left unspecified swing it by 55×.

| Component                | Cost                                                                                                     | Notes                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Generation               | **~$0.0095/quiz-language** weighted across es/so/hmn on `gemini-3.5-flash-lite` (~3,500 in / ~2,800 out) | ~$1.37/teacher/year including a 1.6× regeneration factor; **$68/district-year**                            |
| Back-translation         | ~$0.0006/call, **~$15/district-year**                                                                    | Explicit button + `sha256(answerText+locale)` cache bounds it (§6)                                         |
| Firestore session egress | **~$45/district-year** at 3 locales                                                                      | Every student's `onSnapshot` delivers all locale payloads to all 30 students. Accepted deliberately (§4.2) |
| `QuizMetadata` index     | ~+650 B/quiz, **zero extra reads**                                                                       | ~22% payload growth on a doc already carrying a 2,000-char `searchText`. Write only on change              |
| Drive                    | **$0**                                                                                                   | 3 extra GETs on assign ≈ 0.04% of the 12,000/60s per-user quota; `drive.file` scope already covers it      |
| Cloud Functions          | **$0**                                                                                                   | ~48,000 GB-s/month against a 400,000 GB-s free tier                                                        |

**Alternatives evaluated and rejected**, recorded so they are not re-litigated:

- **Cloud Translation API v3 — 7–38× more expensive, not cheaper.** $20/1M source chars with 500k/month free; a district's 29.6M chars/year is **~$492/year** against $68 on flash-lite. It also cannot do Karen at all, and its higher-quality Translation LLM tier covers **neither Somali nor Hmong**. The intuition that the dedicated translation API must be cheaper is simply wrong at 2026 prices. **What is worth stealing is its contract** — `translateText` returns a same-length, same-order array — which §5 adopts as the flat indexed array.
- **String-level shared translation cache — ~$34/year saved, not worth it.** Read-aloud's cache paid because the same audio is replayed ~30× per class; **a translation has no replay multiplier** — generated once per quiz-language by one teacher. §3.3's "duplicate and PLC sync carry translations" already captures most real duplication at the quiz level, for free.
- **Context caching** — only ~750 of 3,500 input tokens are reusable, and at ~90 calls/teacher/**year** storage fees exceed the savings.
- **Batch API (50% off)** — 24-hour turnaround is unusable for a teacher clicking Generate. Would fit a future nightly stale-question sweep; 50% of $68 is not worth building for now.

Two cheap validations before hard-coding the caps: a `countTokens` spike on one real quiz in Spanish / Somali / Hmong to replace estimated multipliers with measurements, and a `JSON.stringify(sessionDoc).length` check on a real 40-question 3-locale session to confirm §4.2's byte budget. Set a **$25/month budget alert on the Vertex AI SKU**, mirroring read-aloud's US$20 TTS backstop.

## 17. Plumbing checklist — files that must change and are easy to miss

| File                                                                       | Change                                                                                 | Miss cost                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `functions/src/studentAssignmentTargets.ts:142-151`                        | `language?: string` on the **functions-local** `StudentOverride` duplicate             | Silent; no type error                                                      |
| `functions/src/studentAssignmentTargets.ts:341`                            | validated `language` branch in `sanitizeOverride()`                                    | **Feature dead**, no error                                                 |
| `hooks/useRosters.ts:171`                                                  | `language` in `parseStudentOverride()`                                                 | Standing default lost on reload                                            |
| `hooks/useQuiz.ts:288,350,434,621`                                         | preserve `translations` across four non-merging `setDoc`s                              | **Review work destroyed on save**                                          |
| `functions/src/index.ts`                                                   | `export { translateQuizV1 } from './quizTranslation';`                                 | Deploy target absent                                                       |
| `firestore.rules`                                                          | `match /admin_settings/quiz_translation` authed-read + admin-write                     | Language picker silently empty                                             |
| `firestore.rules:1393-1431`                                                | `translations` in the `/synced_quizzes` `hasOnly` (PR5 only)                           | PLC sync write rejected                                                    |
| `tests/rules/quizTranslationSettings.test.ts`                              | new; `test:rules` is a separate CI leg                                                 | Uncovered by `validate`                                                    |
| `functions/src/adminAnalyticsCompute.ts:469`                               | add `'translation'` to `GEMINI_SPECIFIC_FEATURES`                                      | Usage docs parsed into a **phantom uid** and dropped from analytics        |
| `components/admin/Analytics/aiFeatureLabels.ts`                            | matching label                                                                         | File header requires sync with the above                                   |
| `types.ts` `GlobalFeature` union                                           | `'quiz-translation'`                                                                   | Compile error catches this one                                             |
| `config/featureDefaults.ts`                                                | `{ defaultAccessLevel: 'admin', defaultEnabled: true, missingDocPublic: false }` (D30) | Gate fails unpredictably                                                   |
| `config/featureDefaults.test.ts`                                           | fail-closed assertion                                                                  | Existing per-feature pattern                                               |
| `components/admin/GlobalPermissionsManager.tsx`                            | registry entry beside `quiz-read-aloud`                                                | Admin cannot toggle the flag                                               |
| `components/admin/AdminSettings.tsx:142-147`                               | rename the tab label (D24)                                                             | —                                                                          |
| `config/quizTranslation.ts`                                                | new — feature id, settings doc, `QUIZ_TRANSLATION_LANGUAGES` with `nativeLabel`        | Agent reuses `SUPPORTED_LANGUAGES` (4 UI locales) or invents native labels |
| `utils/studentOverrideSummary.ts:68-71`                                    | `language` chip + key in all four locales                                              | Accommodation invisible in collapsed rows                                  |
| `utils/studentOverrideModifiedNote.ts`                                     | **nothing (D39)** — already returns `'modified'` for any non-empty override            | —                                                                          |
| `components/classes/RosterEditorModal.tsx`                                 | 4th `onSave` arg + `DraftRow` override + per-row expander (PR0, §3.5)                  | D1's headline story has no writer                                          |
| `components/common/library/OverrideEditorRow.tsx`                          | second host: must render correctly at `quizMode={false}` (PR0)                         | Quiz-only fields leak into the roster editor                               |
| `components/common/library/AssignStudentPicker.tsx:121-131`                | per-field merge, standing loses (D33, §3.6)                                            | **Standing language silently dropped** when a teacher customizes           |
| `types.ts` `QuizMetadata`                                                  | `language?: string` (D34)                                                              | Assign-flow Generate shows no correct disabled reason                      |
| `components/dev/` + `App.tsx` DEV route                                    | Generate harness (D35, §5.1)                                                           | PR2 ships a callable and a Drive API with no caller                        |
| `functions/src/quizTranslation.test.ts`                                    | new — validator, quota, D17, cap. `functions/` has its own Vitest project              | —                                                                          |
| `locales/{en,de,es,fr}.json` + `tests/i18n/quizTranslationLocales.test.ts` | §15                                                                                    | Untranslated UI; **CI will not notice**                                    |
| `public/changelog.json`                                                    | one entry; `pnpm changelog:draft` prints a draft to rewrite                            | Repo convention                                                            |

**Verified non-issues** — stop worrying about these: Google Drive **scopes need no change** (`drive.file` covers app-created files, `config/firebase.ts:84`); `scripts/test-count-baseline.json` is a floor, so **adding** tests needs no edit; `firestore.rules` is at ~62% of the 256 KiB cap; `quiz_sessions` create/update has **no field whitelist**, so `localized` writes freely; `QuizResponseAnswer.locale` needs **no rules change** because `answers` is already whitelisted (`firestore.rules:3445`) with no per-element schema — the same reasoning already recorded for `noticeAckedAt` at `types.ts:4302-4304`; there is **no App Check** anywhere; and `tests/e2e/` has no quiz-assign coverage to extend.

---

**Grilled and locked:** 2026-09-11, extended 2026-09-12 with Paul Ivers, and again 2026-09-12 for the remaining PRs (§2.2, D31-D39).
**Revised:** 2026-09-12 after a five-agent audit against `48d5e2a`. Reversed the split review/staleness gate (it shipped an answer-key oracle and a tautological check); corrected §4.5's "picks by index" (MC is answered by value); cut FIB (D21); cut target-language TTS (D25); added the English-answer-cache decision (D22), the three override allowlists, the `QuizMetadata` preservation fix, the bank-slot hole, the post-publish-targets hole, the bidirectional-hydration and toggle-reset requirements, the i18n section, the cost model, and the plumbing checklist. Resequenced into 6 stacked PRs with PR0 as a prerequisite.
