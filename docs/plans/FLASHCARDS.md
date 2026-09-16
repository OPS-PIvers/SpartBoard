# Flashcards Widget — Implementation Plan

**Date**: 2026-09-16 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review. The decisions in §2 were settled in a design interview on 2026-09-16, and no code has been written. File paths were verified against `dev-paul` at `75d41a207`; re-verify them before relying on them.

This is a native replacement for Quizlet-style vocabulary practice. Teachers build term/definition sets, give each side a language, and either share a public embeddable link (nothing tracked) or assign the set to SSO classes. An assignment either collects a one-time submission ("Check") or stays open as a tracked unit-long resource ("Study").

---

## 1. Problem statement

- Quizlet won't sign the district DPA. Its ToS bars students under 13 from making accounts, it is expensive, and the vendor is hard to work with. Teachers still need quick vocab practice that embeds in Schoology, Google Sites and Classroom posts.
- SpartBoard has no flashcard, term/definition, spaced-repetition, fuzzy-answer or accent-keyboard code today:
  - Quiz FIB normalization only trims, lowercases, collapses whitespace and maps ё→е (`normalizeAnswer`, `hooks/useQuizSession.ts`).
  - Only `utils/videoActivityGrading.ts` strips diacritics.
  - No Levenshtein matching exists anywhere.
- These pieces can be reused:
  - **Library UI**: `components/common/library/LibraryShell.tsx`, folders via `hooks/useFolders.ts`, and import via `components/common/library/importer/ImportWizard.tsx` + `utils/csvImport.ts`.
  - **Assign UI**: `components/common/library/AssignModal.tsx`, `components/common/AssignClassPicker.tsx`, and the per-student targeting in `setAssignmentTargetsV1` (`functions/src/studentAssignmentTargets.ts`), which writes `StudentAssignmentPointer` (`types.ts:5135`, kind union currently `'quiz' | 'video-activity' | 'guided-learning' | 'mini-app'`).
  - **Student listing**: `KIND_CONFIG` in `hooks/useStudentAssignments.ts:180`, `components/student/MyAssignmentsPage.tsx`, and the teacher hub `components/assignmentsHub/useUnifiedAssignments.ts`.
  - **SSO identity**: the `studentRole` / `classIds` claims in `context/StudentAuthContext.tsx`.
  - **Languages**: `QUIZ_READ_ALOUD_LANGUAGES` (`config/quizReadAloud.ts:9`): en-US, es-US, de-DE, fr-FR, ru-RU, plus typed BCP-47 tags.
  - **Public reads without auth**: the only precedent is `short_links` (`firestore.rules:746`, `allow get: if true`).
  - **Iframes**: `firebase.json` sets no `X-Frame-Options`; `frame-ancestors` is set only on `/activity/**`, `/classroom-addon/**` and `/lti/**`. Other routes can already be framed.
  - **Teacher copy links**: `shared_quizzes` / `/share/quiz/{id}`. **PLC libraries**: `plcs/{plcId}/quizzes`.
  - **Functions can't import root code.** Shared logic is mirrored with a comment, e.g. `functions/src/quizReadAloud.ts:43`.

## 2. Decisions (locked 2026-09-16)

### 2.1 Sets and authoring

| #   | Decision      | Choice                                                                                                                                                                                                                                           |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Name          | **Flashcards.** Widget type `flashcards`, public route `/flashcards/{shareId}`.                                                                                                                                                                  |
| Q2  | Language      | **Per side**: `termLanguage` and `definitionLanguage` (BCP-47). The char bar, article rules and future Speak key off the side being answered.                                                                                                    |
| Q3  | Language list | **Same list as quiz read-aloud** (`QUIZ_READ_ALOUD_LANGUAGES`) plus a typed BCP-47 tag.                                                                                                                                                          |
| Q4  | Card content  | **Text only** in v1: `term`, `definition`. No images, no audio.                                                                                                                                                                                  |
| Q5  | Storage       | **Firestore only.** Cards stored inline on the set doc. No Drive.                                                                                                                                                                                |
| Q6  | Authoring     | **Row editor** (Tab across, Enter adds a row, drag to reorder), **paste import** (auto-detects tab / comma / `-` / custom separators, live preview; covers Quizlet export) and **Google Sheets / CSV** via ImportWizard. No AI generation in v1. |
| Q7  | Board role    | **Library + Present.** Front face = set library; **Present** shows big flashcards on the board for whole-class review.                                                                                                                           |
| Q8  | Present mode  | **Flashcards only, no marks.** Flip, arrows, shuffle, default side, counter. Nothing saved.                                                                                                                                                      |
| Q9  | Organization  | **Folders**, a **teacher copy link**, and a **PLC shared library** in v1.                                                                                                                                                                        |
| Q10 | PLC behavior  | **Copy into my library.** A PLC library lists sets; "Add to my library" makes an independent editable copy. No live sync, no PLC aggregate data.                                                                                                 |

### 2.2 Public link

| #   | Decision | Choice                                                                                                                                                                                                             |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q11 | Auth     | **None.** The snapshot doc `public_flashcard_sets/{shareId}` is `allow get: if true` with no `list`. No `signInAnonymously`, so nothing breaks in partitioned-storage iframes.                                     |
| Q12 | Sync     | **Live.** Saving a set rewrites its public snapshot. **Revoke** deletes the doc; sharing again mints a new `shareId`. No expiry.                                                                                   |
| Q13 | Marks    | **Saved on this device.** Stars and repetition state go in `localStorage` keyed by `shareId`; Settings has a "Reset progress" button. If storage is blocked, state stays in memory. Nothing is sent to the server. |
| Q14 | Share UI | **Copy link** and **Copy embed code** (`<iframe>`). No QR code or mode-locked links in v1. When framed, the page drops its outer chrome.                                                                           |
| Q15 | Modes    | Picker at top left: **Flashcards (default) / Write / Test.** Speak stays **hidden** until v2, but the picker takes a list so it can slot in later.                                                                 |

### 2.3 Study engine (shared by public, Study, Check and Present where relevant)

| #   | Decision           | Choice                                                                                                                                                                |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q16 | Repetition         | **Spaced repetition, measured in rounds and never blocking** (§4). The same scheduler runs for public and assigned sets. Nothing is locked; empty rounds are skipped. |
| Q17 | Inputs             | **All modes feed the scheduler.** 👍 or an accepted answer is correct; 👎 or a rejected answer is wrong.                                                              |
| Q18 | Auto-advance       | **Thumbs advance, star doesn't.**                                                                                                                                     |
| Q19 | Counter            | **Cards due this round**: `5/12`, with a "Round 3" label and a mastery bar (e.g. 18/32 mastered).                                                                     |
| Q20 | End of round       | **Round summary**: got it / still learning, with **Next round** and **Restart all** (Restart is hidden on tracked Study).                                             |
| Q21 | Flashcard settings | Study: All / Favorites only · Show first: Term / Definition · Shuffle (default off) · Hide mastered cards.                                                            |
| Q22 | Keyboard           | Space flips, ←/→ navigate, ↑ = 👍, ↓ = 👎, S = star. Always on.                                                                                                       |
| Q23 | Mastered           | **3 correct in a row** for Study progress and public. A Check in Flashcards mode lets the teacher pick **2–4** (default 3).                                           |

### 2.4 Write mode

| #   | Decision           | Choice                                                                                                                                                                             |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q24 | Layout             | Prompt = the "Show first" side; student types the other side. Same star/👍/👎 chrome. Settings = flashcard settings + **Strict mode** (default off).                               |
| Q25 | Char bar           | **Spanish, French, German** in v1, chosen by the answer side's primary subtag. Buttons insert at the cursor; Shift or ⇧ gives capitals. Other languages type normally with no bar. |
| Q26 | Fuzzy (strict off) | Accepted as correct: **accent differences**, a **missing article**, and a **small typo** (§5). Case, extra whitespace and trailing punctuation are always ignored.                 |
| Q27 | Alternates         | `a / b` accepts either answer, and `(se) levantar` makes the parenthetical optional. **This applies in strict mode too.**                                                          |
| Q28 | Wrong answer       | **Show the answer with differences highlighted, then retype** it to continue. In practice, an "I was right" link counts the answer correct.                                        |

### 2.5 Test mode

| #   | Decision | Choice                                                                                                                                                               |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q29 | Types    | **One checkbox per type**: Multiple choice / Matching / Fill in the blank. All on by default, at least one required. FIB uses the Write input, char bar and matcher. |
| Q30 | Matching | **Each pair counts as 1 question.** Blocks have 4–6 pairs.                                                                                                           |
| Q31 | Count    | **Steps of 5, capped at the deck size**, with a final "All (N)" step. Sets under 5 cards show "All" only. MC needs ≥4 cards; below that, MC is disabled with a note. |
| Q32 | Flow     | **One page → Submit → review**: score, each missed item with its correct answer, **Retake missed only**, **New test**. No per-question feedback before submitting.   |

### 2.6 Assignments

| #   | Decision           | Choice                                                                                                                                                                                                                                                                                                     |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q33 | Kinds              | A single Assign flow with a **"Collect a submission"** toggle. **ON = Check**: teacher picks one mode, student submits once, then it locks. **OFF = Study**: all modes, open until the optional close date, progress tracked. Badges read "Check" / "Study".                                               |
| Q34 | Who                | **SSO students only**, listed on `/my-assignments` via pointers. Non-SSO students use the public link.                                                                                                                                                                                                     |
| Q35 | Destinations       | **SpartBoard / My Assignments only** in v1: class picker, per-student targeting, open/due/close dates. No Classroom or Schoology posting.                                                                                                                                                                  |
| Q36 | Check settings     | **The teacher sets and locks them.** The student's gear shows them read-only; purely visual Shuffle stays editable in Flashcards mode. Favorites-only is removed.                                                                                                                                          |
| Q37 | Check · Flashcards | Submit unlocks when every card reaches the teacher's threshold (2–4 in a row). The report shows rounds, time, and the cards needing the most repeats. Self-reported by nature.                                                                                                                             |
| Q38 | Check · Write      | **Until all correct.** Every card is asked once; misses re-queue at the end until everything is correct. Score = first-try correct ÷ total. The report shows attempts per card.                                                                                                                            |
| Q39 | Check · Test       | The teacher locks the types and count. One attempt.                                                                                                                                                                                                                                                        |
| Q40 | Score trust        | **Server grades on submit.** `submitFlashcardCheckV1` re-grades the raw answer log against the frozen cards with a server copy of the matcher, then writes score and `submittedAt`. Students can't write those fields.                                                                                     |
| Q41 | Override in Check  | **No self-override.** The student can tap "I think this is right" to flag an answer; the teacher accepts it in results, which recalculates the score.                                                                                                                                                      |
| Q42 | After submit       | **Results, read-only**: score, and missed cards with correct answers. The teacher can **Reset** a student. Optional score hiding reuses the quiz `scoreVisibility` / publish pattern.                                                                                                                      |
| Q43 | Study close        | **Keep studying, untracked.** After `closeAt`, all modes work like the public link with a "This assignment closed on …" banner; tracked progress stays frozen.                                                                                                                                             |
| Q44 | Proficiency        | **Mastered % + a breakdown.** Headline = mastered ÷ total. Expanding shows New / Learning (1) / Familiar (2) / Mastered (3+).                                                                                                                                                                              |
| Q45 | Teacher Study view | **Class-period aggregate, filterable by period** (average mastered %, distribution, not started), a **student grid** (mastered %, buckets, time studied, last active, modes used), **hardest cards** (class-wide misses and low streaks, respecting the filter) and **practice test history** per student. |
| Q46 | Edits after assign | **Study is live, Check is frozen.** Study sessions pick up added or edited cards: new cards start as New, progress is keyed by stable card id, and deleted cards drop out. Check sessions snapshot cards at assign time.                                                                                   |
| Q47 | Rollout            | `feature_permissions/flashcards` at **admin** on merge, flipped to beta for world-language teachers after a prod check. Public links work for anyone holding the URL.                                                                                                                                      |
| Q48 | Delivery           | This plan as its own PR into `dev-paul`, then the stacked PRs in §9.                                                                                                                                                                                                                                       |

## 3. Data model

```ts
// types.ts
export interface FlashcardCard {
  id: string; // stable uuid; repetition progress keys on it
  term: string; // ≤ 500 chars
  definition: string; // ≤ 1000 chars
}

export interface FlashcardSet {
  id: string;
  title: string;
  description?: string;
  termLanguage: string; // BCP-47, default 'en-US'
  definitionLanguage: string; // BCP-47, default 'en-US'
  cards: FlashcardCard[]; // ≤ 500 (keeps doc well under 1 MiB)
  folderId?: string | null;
  publicShareId?: string | null; // present while a public link is live
  createdAt: number;
  updatedAt: number;
}

export type FlashcardMode = 'flashcards' | 'write' | 'test'; // 'speak' in v2
export type FlashcardSide = 'term' | 'definition';
export type FlashcardTestType = 'mc' | 'matching' | 'fib';

export interface FlashcardModeSettings {
  showFirst: FlashcardSide;
  shuffle: boolean;
  favoritesOnly: boolean; // not allowed on Check
  hideMastered: boolean;
  strict: boolean; // write + test FIB
  testTypes: FlashcardTestType[];
  testCount: number | 'all';
}

export interface FlashcardSession {
  // flashcard_sessions/{assignmentId}
  teacherUid: string;
  setId: string;
  title: string;
  kind: 'check' | 'study';
  checkMode?: FlashcardMode; // Check only
  lockedSettings?: FlashcardModeSettings; // Check only
  masteryThreshold?: 2 | 3 | 4; // Check · Flashcards only
  termLanguage: string;
  definitionLanguage: string;
  cards: FlashcardCard[]; // frozen (Check) or rewritten on teacher save (Study)
  classIds: string[];
  status: 'active' | 'ended';
  openAt?: number;
  dueAt?: number;
  closeAt?: number;
  scoreVisibility?: 'none' | 'score' | 'score-and-answers'; // Check only
  scorePublishedAt?: number;
  createdAt: number;
  endedAt?: number;
}

export interface FlashcardCardProgress {
  s: 0 | 1 | 2 | 3 | 4; // correct-in-a-row streak, capped
  due: number; // round number the card is next due
  c: number; // lifetime correct
  w: number; // lifetime wrong
}

export interface FlashcardProgress {
  // flashcard_sessions/{assignmentId}/progress/{studentUid}
  classId: string; // from claims at first write; drives period filter
  cards: Record<string, FlashcardCardProgress>;
  starred: string[];
  round: number;
  studyMs: number;
  modesUsed: FlashcardMode[];
  tests: {
    at: number;
    types: FlashcardTestType[];
    count: number;
    score: number;
  }[]; // newest 50
  lastActiveAt: number;
  // server-written only (Check):
  submittedAt?: number;
  score?: number;
  total?: number;
  answerLog?: FlashcardAnswerLogEntry[];
  flags?: { cardId: string; response: string; accepted?: boolean }[];
}
```

`StudentAssignmentPointer.kind` and the `SessionKind` / `KIND_CONFIG` / `useUnifiedAssignments` kind unions each gain `'flashcards'`. **Do not** add it to `AssignmentWidgetKey` (`types.ts:7792`): the per-assignment Check/Study toggle replaces the admin-wide submissions/view-only mode.

Widget config (`config/widgetDefaults.ts`): `{ view: 'library' | 'present', presentSetId?: string, presentShowFirst: 'term', presentShuffle: false }`. These are all per-board keys, and none go into `APPEARANCE_CONFIG_KEYS`.

### 3.1 Collections and rules

| Path                                             | Read                                                              | Write                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}/flashcard_sets/{setId}`             | owner                                                             | owner                                                                                                                                                                      |
| `users/{uid}/flashcard_folders/{id}`             | owner                                                             | owner (via `useFolders`)                                                                                                                                                   |
| `users/{uid}/flashcard_assignments/{id}`         | owner                                                             | owner                                                                                                                                                                      |
| `public_flashcard_sets/{shareId}`                | `get: if true`; no `list`                                         | create/update/delete: non-student signed-in user whose uid equals `teacherUid`; key allowlist                                                                              |
| `shared_flashcard_sets/{shareId}` (teacher copy) | signed-in non-student                                             | owner                                                                                                                                                                      |
| `plcs/{plcId}/flashcard_sets/{id}`               | PLC members                                                       | PLC members create; author or PLC admin delete                                                                                                                             |
| `flashcard_sessions/{id}`                        | teacher; SSO student whose `classIds` claim intersects `classIds` | teacher                                                                                                                                                                    |
| `flashcard_sessions/{id}/progress/{studentUid}`  | that student; session teacher                                     | that student, only while `submittedAt` is absent and `now < closeAt`; key allowlist excludes `submittedAt`/`score`/`total`/`answerLog`/`flags`; teacher may delete (Reset) |

Keep the new rules short: the 256 KiB cap applies to the stripped rules text. Validate with the Firebase MCP rules validator. Rules tests run in CI only (the local emulator crashes).

**Accepted risk.** Check sessions have to hold the answer side, because Write needs it for retype-after-wrong and MC needs it for distractors. A student with devtools can read the answers. Server grading stops forged scores but can't hide answers. That's acceptable for a vocab check; a Speak-era or high-stakes mode would need server-delivered prompts.

## 4. Scheduler (`utils/flashcardSchedule.ts`)

Pure functions with no I/O. The same module backs every adapter.

- Each card carries a streak `s` (0–4) and a `due` round.
- Correct: `s = min(s + 1, 4)`. Wrong: `s = 0`.
- After an answer, `due = currentRound + gap(s)`, where `gap = {0: 1, 1: 1, 2: 2, 3: 4, 4: 8}`.
- **Mastered** means `s ≥ threshold` (3 by default; 2–4 on a Check).
- **Round queue**: cards with `due ≤ round` after the Favorites / Hide-mastered filters, in teacher order or seeded shuffle. If the queue is empty, `round` jumps to the smallest `due` (empty rounds are skipped). A perfect student masters a card in 3 views.
- **Check · Flashcards**: cards at or above the threshold leave the pool. Submit enables when the pool is empty.
- **Check · Write**: bypasses rounds. Every card is asked once, misses re-queue at the end, and the first try is what scores. Streaks still update, so a later Study on the same set could seed from them (not in v1; each assignment has its own progress).
- **Adapters** implement `load()`, `record(cardId, correct)`, `star(cardId)` and `flush()`:
  - `LocalAdapter`: `localStorage` key `spart.flashcards.v1.{shareId}`; try/catch, falls back to memory.
  - `TrackedAdapter`: Firestore dotted-path merges of changed cards only. Flushes on a 5 s debounce, at round end, on mode switch, and on `visibilitychange`/`pagehide`.
  - `MemoryAdapter`: Present mode; no marks shown.

## 5. Matcher (`utils/flashcardMatch.ts`, mirrored in `functions/src/flashcardMatch.ts`)

`matchAnswer(response, expected, { language, strict }) → { result: 'exact' | 'accepted' | 'wrong', expected: string, diff: Segment[] }`

1. **Parse `expected`**: split alternates on `/` (spaced slash, so "km/h" survives); expand `(…)` into with/without variants.
2. **Always**: Unicode NFC, trim, collapse whitespace, case-fold, strip trailing `.,;:!?`. For `ru`, fold ё→е, matching `normalizeAnswer`. A match here is `exact`.
3. **Strict off**, applied cumulatively to both sides against every variant:
   1. Strip diacritics (NFD, remove `\p{M}`; keep `ß`, and treat `ñ` as `n` only at this step).
   2. Drop a leading article from the language's table:
      - `es`: el la los las un una unos unas
      - `fr`: le la les l' un une des
      - `de`: der die das den dem des ein eine einen einem einer
      - `it`: il lo la i gli le l' un uno una un'
      - `pt`: o a os as um uma
   3. Damerau-Levenshtein ≤ 1 for normalized length 4–6, ≤ 2 for ≥ 7. No tolerance at ≤ 3 characters.

   Any hit is `accepted`, and the UI still shows the exact spelling.

4. `diff` is a character-level diff against the closest variant, for the highlight.
5. **Parity**: one case table `functions/src/flashcardMatch.cases.json` runs in both the root and functions suites. The mirror comment names the root file.

Char bars (`config/flashcardCharBars.ts`):

- `es`: á é í ó ú ü ñ ¿ ¡
- `fr`: à â ç é è ê ë î ï ô ù û ü ÿ œ æ
- `de`: ä ö ü ß

Uppercase comes from Shift or ⇧, except ß.

## 6. Student and teacher UI

**Player shell** (`components/flashcards/`):

- `FlashcardPlayer` has the mode picker (segmented, top left) and gear (top right), with the body switching between `FlashcardsMode`, `WriteMode` and `TestMode`. It receives `{ cards, languages, adapter, lockedSettings?, check? }`.
- The public route, the SSO Study/Check route and Present all mount the same player.
- Light theme on student routes; dark glass in Present. Honors `prefers-reduced-motion` by crossfading instead of the flip/slide.

**Flashcards mode**:

- A 3D flip on click/tap/Space.
- Arrows slide the current card out and the next in, with `5/12` between the arrows.
- Star, 👍 and 👎 sit on the card; thumbs advance, star does not.
- Round summary card at the end of each round.

**Write mode**: prompt card, input, char bar under the input, and a Check button. When wrong: a two-line diff (yours vs. correct), then a retype field.

- Practice shows "I was right".
- Check shows "I think this is right" (a flag).

**Test mode**:

- Generated from a seeded RNG over the pool.
- MC: 4 options, distractors drawn from the same side of other cards.
- Matching: blocks of 4–6 pairs, click-to-pair with keyboard support.
- FIB: the Write input.
- One scrolling page with a sticky question nav and Submit, then review.

**Routes** (`App.tsx`, lazy):

- `/flashcards/{shareId}`: no providers.
- `/flashcards/a/{assignmentId}`: `StudentAuthProvider → RequireStudentAuth`.
- `/share/flashcards/{id}`: teacher copy, under `AuthProvider`.

**Widget** (`components/widgets/Flashcards/`):

- Library view: `LibraryShell` with New set, Import, folders, and a per-set menu (Edit, Present, Share link, Copy link for teachers, Share to PLC, Assign, Assignments).
- Editor: full-height panel with title, two language selects, the row editor, and a Paste import drawer.
- Present view: `FlashcardPlayer` in Flashcards mode with a `MemoryAdapter`, plus a back-to-library control.
- Settings follow the schema settings drawer pattern (`docs/plans/WIDGET_SETTINGS_DRAWER.md`).

**Assign modal**: `AssignModal` + `AssignClassPicker` + targeting, and the "Collect a submission" toggle.

- When on: mode radio, locked settings, mastery threshold (Flashcards), and score visibility.
- Both kinds: open/due/close dates.

**Teacher results** (`components/widgets/Flashcards/results/`):

- **Study**: period filter → aggregate strip → student grid → hardest cards → a per-student drawer with card buckets and test history.
- **Check**: period filter → score table → per-card first-try accuracy → flags queue (Accept / Dismiss) → Reset student → Publish scores.

Also listed in the Assignments Hub.

## 7. Cloud Functions

- `submitFlashcardCheckV1({ assignmentId, answerLog, flags })`:
  - Caller must be an SSO student whose claims intersect the session's classes, with no existing `submittedAt`, and must be before `closeAt` or have a pointer override.
  - **Flashcards**: verifies the stored streaks meet the threshold for every card.
  - **Write**: re-grades each first try with the mirrored matcher.
  - **Test**: validates that the question list matches the locked types and count and references unique session cards, then grades each item.
  - Writes `score`, `total`, `answerLog`, `flags` and `submittedAt` in one transaction.
- `resolveFlashcardFlagV1({ assignmentId, studentUid, cardId, accept })`: teacher only; recomputes the score.
- `setAssignmentTargetsV1`: accept kind `'flashcards'` → `flashcard_sessions`.

Dev-branch pushes deploy functions to the shared prod project. Everything here is new or additive, so no existing behavior changes.

## 8. i18n, accessibility, limits

- Student-facing strings go in `locales/{en,es,de,fr}`; teacher UI follows the existing locale coverage.
- The card flip is a `button` with `aria-pressed`, and the face text is announced on flip. Every icon button has a label. Visible focus rings. Char bar buttons are `aria-label="Insert á"`.
- Limits: 500 cards per set, term 500 chars, definition 1000. Paste import truncates with a warning.

## 9. Delivery (stacked PRs into `dev-paul`)

1. **Sets + library + editor + import**: types, `users/{uid}/flashcard_*` rules, widget registration (`types.ts`, `config/tools.ts`, `widgetDefaults.ts`, `widgetGradeLevels.ts`, `WidgetRegistry.ts`), `feature_permissions` admin gate, `LibraryShell` view, row editor, paste import, ImportWizard adapter (CSV/Sheets), folders.
2. **Study engine + public link + Present**: `flashcardSchedule.ts`, `flashcardMatch.ts` + case table, char bars, `FlashcardPlayer` with all three modes, `LocalAdapter` / `MemoryAdapter`, `public_flashcard_sets` rules + publish on save + revoke, Share modal (link + embed), `/flashcards/{shareId}` route, Present view.
3. **Assignments, student side**: `flashcard_sessions` + progress rules, Assign modal (Check/Study), `TrackedAdapter`, `/flashcards/a/{id}` route, pointer / `KIND_CONFIG` / hub kind additions, `setAssignmentTargetsV1` kind, `submitFlashcardCheckV1` + functions matcher mirror, locked-settings gear, post-submit results, closed-Study banner.
4. **Teacher results**: Study aggregate + period filter + grid + hardest cards + test history; Check score table + flags + `resolveFlashcardFlagV1` + Reset + Publish scores; Study live-card rewrite on set save (query `flashcard_sessions` by `teacherUid`, `setId`, `kind == 'study'`, `status == 'active'` — add the index).
5. **Teacher copy link + PLC library**: `shared_flashcard_sets` + `/share/flashcards/{id}`, `plcs/{plcId}/flashcard_sets` + "Add to my library".

## 10. Out of scope (v1)

Speak mode (pronunciation engine: `docs/multilingual-pronunciation-engine.md`), images and audio on cards, TTS, AI set generation, QR and mode-locked links, Google Classroom / Schoology posting, char bars beyond es/fr/de, live-synced PLC sets, cross-assignment progress carry-over, student × card heatmap.
