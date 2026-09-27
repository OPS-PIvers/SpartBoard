# Written-Response Quiz Questions — Design Proposal

**Status:** Draft for review
**Author:** ops-pivers + Claude
**Branch:** `claude/add-essay-quiz-questions-xNaoz`

Adds short-answer and essay question types to the SpartBoard quiz, plus the
teacher grading flow needed to make them usable: prev/next response navigation,
inline highlights + margin comments, structured rubrics with a CSV import
template, and pause/resume + tab-switch flagging for a more secure in-class
assessment environment.

---

## 1. Goals & non-goals

**Goals**

- Students can answer short-answer (single line, rich-ish) and essay
  (multi-paragraph, rich text) questions with autosave so a paused quiz can
  resume the next class period exactly where the student left off.
- Teachers can grade those responses one student at a time with prev/next
  navigation, applying a structured rubric (criteria × performance levels) for
  consistent scoring, and leaving inline highlights + margin comments visible
  to students when scores are published.
- Soft secure-assessment posture: visibility/focus tracking surfaced to the
  teacher; no aggressive lockdown attempts.

**Non-goals (explicit)**

- AI-assisted grading suggestions. _(Not in this proposal. Worth a follow-up
  once the manual flow is shipped.)_
- File/image attachments in student responses.
- Plagiarism detection.
- Hard kiosk-mode lockdown (fullscreen API, copy/paste block). Brittle and
  easy to defeat; not the right tradeoff.

---

## 2. Grounding: how the quiz works today

Anchors from the current codebase (not speculation):

- **Question types live in** `types.ts:2246-2276` — `'MC' | 'FIB' | 'Matching'
| 'Ordering'`. Each `QuizQuestion` carries `id, timeLimit, text, type,
correctAnswer, incorrectAnswers[], points?, allowPartialCredit?`.
- **Response answers** are `QuizResponseAnswer` at `types.ts:2558-2572`:
  `{questionId, answer, answeredAt, isCorrect?, speedBonus?}`. The `answer`
  field is intentionally permissive (string today).
- **Response status lifecycle** (`types.ts:2574`): `joined → in-progress →
completed`. Transitions are rule-enforced; `completedAttempts` is
  append-only (`firestore.rules:1822-1840`).
- **Autosave precedent**: `components/plc/bodies/NotesBody.tsx` uses a
  ~500ms debounce + flush-on-unmount pattern. We reuse this.
- **Tab-switch tracking already exists**: `QuizStudentApp.tsx:230-370`
  listens to `visibilitychange` and `blur`, increments
  `tabSwitchWarnings` on the response doc, and surfaces a 3-strike modal.
  Gated by `tabWarningsEnabled` (`types.ts:2352`). Teacher has an
  `unlockStudentAttempt` escape hatch (`useQuizSession.ts:498`).
- **Auto-grading happens client-side** in `gradeAnswer`
  (`useQuizSession.ts:191-251`) and `QuizResults`. There is **no manual
  grading UI today** — written responses force us to build one.
- **No rich-text editor exists anywhere** in the repo. `dompurify@3.4.2` is
  already a dep, which we'll need.
- **No text-annotation pattern exists**. The `annotation` color on
  `DraggableWindow` is unrelated (widget chrome). This is greenfield.

---

## 3. Question-type additions

Add to `WidgetType`-style discriminant in `types.ts`:

```ts
type QuestionType = 'MC' | 'FIB' | 'Matching' | 'Ordering' | 'short' | 'essay';
```

|            | `short`                                                                    | `essay`                                                                      |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Editor     | Single-paragraph TipTap (no enter-for-newline; bold/italic/underline only) | Full TipTap (paragraphs, lists, bold/italic/underline, optional inline code) |
| Word cap   | Optional `maxWords` (config)                                               | Optional `maxWords`                                                          |
| Time limit | Per-question allowed (existing field)                                      | Per-question allowed; typically left unset on essay                          |
| Auto-grade | None — always manual                                                       | None — always manual                                                         |
| Rubric     | Optional                                                                   | Optional but recommended                                                     |

**Storage shape** (revised after Gemini review feedback — keeps grading
**off** the `answers[]` array for security and document-size reasons):

```ts
// Existing array entry — unchanged shape for written responses. The
// `answer` string is now the (sanitized) HTML body of the student's
// rich-text response. No plainText mirror — plain text is derived
// on the fly when needed (word counts, exports).
type QuizResponseAnswer = {
  questionId: string;
  answer: string; // for written: sanitized HTML body
  answeredAt: number;
  isCorrect?: boolean; // unused for written (see note below)
  speedBonus?: number; // unused for written
};

// NEW top-level map on the response doc, keyed by questionId. Lives
// outside `answers[]` so teacher writes are granular and never need to
// rewrite the student's answer array.
type QuizResponse = {
  // ...existing fields...
  grading?: { [questionId: string]: WrittenAnswerGrade };
};

type WrittenAnswerGrade = {
  pointsAwarded: number; // 0..question.points
  overallComment?: string; // teacher's summary note
  rubricScores?: RubricScore[]; // Phase 3
  annotations?: Annotation[]; // Phase 2 — see §5 open question
  gradedBy: string; // teacher uid
  gradedAt: number;
};
```

**Why grading lives outside `answers[]`** (response to Gemini review of
2026-05-13):

- Firestore rules can already deny student writes to `grading` for free
  via the existing student `changedKeys().hasOnly([...])` whitelist at
  `firestore.rules:1814` — `grading` simply isn't in the list.
- The teacher branch (`request.auth.uid == sessionTeacherUid()`) is
  unrestricted today, so teachers can write `grading` without needing
  CEL gymnastics to validate the student's `answer` text was untouched.
  Putting `grading` inside the answers array would require either
  rewriting the array as a Map keyed by questionId or moving answers
  to a subcollection — large breaking changes outside Phase 1 scope.
- Phase 1 keeps the existing `answers[]` array shape exactly as-is for
  the four legacy question types.

**Why no `plainText` mirror**:

- Doubles per-response payload for long essays and pushes harder against
  the 1 MB Firestore doc limit.
- Easy to derive on demand: `domparser → textContent` on render, plus
  a small helper in `utils/` for Drive export.
- Word counts run in the editor against the live document; nothing in
  Firestore needs them.

**Note on `isCorrect`**: written responses do not set `isCorrect` at the
student-submission boundary (same as today). Downstream reporting
(`QuizResults`) derives correctness for written responses as
`grading.pointsAwarded === pointsMax` when a grade is present, and treats
the question as "ungraded" until then.

---

## 4. Rich text editor

**Phase 1 implementation: `contenteditable` + DOMPurify.** No new
dependency, sanitized HTML in/out, ~5 KB of widget code rather than
~100 KB of editor framework. Sufficient for the bold/italic/list/word-
count needs of Phase 1.

**Phase 2 swap: TipTap (ProseMirror).** Bringing TipTap in is justified
the moment we want annotations as first-class ProseMirror **marks**
(see §5). Until then it's not worth the bundle hit. The schema (sanitized
HTML in `answer`) stays compatible — TipTap can `setContent(html)` to
hydrate from existing responses.

Why this split:

- The student-facing editor in Phase 1 is a writing surface, not a
  publishing tool. A toolbar of bold/italic/lists over a sanitized
  contenteditable handles the bulk of what teachers actually want.
- ProseMirror's value (real document model, marks, immutable transforms,
  collaborative editing primitives) pays off when we build annotations
  on top of student documents. We can defer that bundle cost.
- `dompurify@3.4.2` already ships in the bundle, so sanitization on
  every read/write is free.

**Student editor surface** (kept deliberately minimal):

- Bold, Italic, Underline
- Bulleted list, Numbered list (essay only)
- Undo/Redo
- Live word count (if `maxWords` set, soft warning past the cap, never a
  hard block — teachers can decide whether to penalize)

**No** image upload, no tables, no link insertion (link autocompletion turned
off — pasting plain text only by default). The student editor is a writing
surface, not a publishing tool.

**Autosave**: 500ms debounce mirroring `NotesBody.tsx`; on unmount, on
`visibilitychange:hidden`, and on the existing pause action, flush
synchronously. Writes go to the same response doc the existing `submitAnswer`
path already touches — no new collection needed.

---

## 5. Annotations (highlights + margin comments) — Phase 2

**Design decision (resolved 2026-05-13):** snapshot-at-grading-time +
sidecar plaintext offsets, rendered to JSX via the shared walker in
[`utils/writtenAnnotations.ts`](../utils/writtenAnnotations.ts). The
student's `answer` JSON is **never** mutated. The chosen option mirrors
proposal (1) from the original Gemini review note.

**Why we picked snapshot-at-grading-time:**

- Phase 1 already guarantees the student's `answer` is never rewritten.
  Annotations need a stable anchor; a frozen snapshot gives us one
  without breaking that invariant.
- The teacher-unlock flow (`unlockStudentAttempt`) lets a student
  resume and edit after grading. If annotations indexed into the live
  answer, offsets would silently drift on every edit. The snapshot
  freezes the document at annotation time so highlights stay anchored.
- No schema churn for the open question — the existing
  `WrittenAnswerAnnotation.from`/`to` fields are already documented as
  plaintext offsets, so we layered on a `gradingSnapshot` field and a
  shared walker that defines what "plaintext offset" means
  deterministically.
- Rejected alternative (marks-in-document) would have required either
  widening `sanitizeQuizResponse` to allow `<mark data-id="…">`
  (loosens the Phase 1 anti-styling profile) or rewriting the
  student's `answer` field (breaks the security stance).

### Annotation shape

The existing `WrittenAnswerAnnotation` interface (`types.ts:2830`)
captures everything we need:

```ts
interface WrittenAnswerAnnotation {
  id: string;
  /** Inclusive start offset into the snapshot's plaintext projection. */
  from: number;
  /** Exclusive end offset. */
  to: number;
  highlightColor?: 'yellow' | 'green' | 'pink' | 'blue';
  comment?: string;
  authorUid: string;
  createdAt: number;
}
```

Plus the new `WrittenAnswerGrade.gradingSnapshot?: string` (Phase 2
addition): the sanitized HTML the teacher annotated, frozen on first
save with annotations, immutable afterwards.

Rendered as:

- A `<mark>` wrapper with `data-annotation-id` and `data-color` on the
  marked text, emitted by `renderAnnotatedSnapshot` directly into a
  React tree (no HTML string concat, no re-sanitization step).
- A right-rail margin column showing comments anchored to their
  highlights. Hovering a highlight cross-highlights the corresponding
  margin chip and vice versa.

### Student view of annotations

When the teacher publishes scores (`scoreVisibility` already exists in
`QuizAssignment`), the student score-review screen renders the same
snapshot in `AnnotatedResponseView`'s `mode="read"` surface with
highlight marks + margin comments visible. No editing surface, no
reply (Phase 4 if we want a back-and-forth).

---

## 6. Rubric (structured)

### Data model

A rubric is a teacher-owned, reusable object. Recommendation:

```
/users/{teacherUid}/rubrics/{rubricId}
```

```ts
type Rubric = {
  id: string;
  title: string; // "AP Lang DBQ Rubric"
  description?: string;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
};

type RubricCriterion = {
  id: string;
  name: string; // "Thesis & Argument"
  description?: string;
  levels: RubricLevel[]; // ordered low → high
};

type RubricLevel = {
  id: string;
  label: string; // "Exceeds", "Meets", "Approaching", "Below"
  points: number; // 4, 3, 2, 1
  description?: string;
};
```

A `QuizQuestion` of type `essay` or `short` gets an optional
`rubricId` (referencing the teacher's saved rubric) or an inline rubric
snapshot embedded in the question (so the rubric is stable even if the
teacher later edits the saved version — important for past assignments).

### Grading capture

```ts
type RubricScore = {
  criterionId: string;
  levelId: string;
  points: number; // snapshot for resilience
  note?: string; // optional per-criterion comment
};
```

Total points for the question = sum of `RubricScore.points`, capped at the
question's `points` value. (Or weighted; that's a future-phase enhancement.)

### CSV import template

A downloadable starter CSV (`rubric-template.csv`) shipped under
`public/templates/` and linked from the rubric builder modal:

```csv
Criterion,Description,Level 1 Label,Level 1 Points,Level 1 Description,Level 2 Label,Level 2 Points,Level 2 Description,Level 3 Label,Level 3 Points,Level 3 Description,Level 4 Label,Level 4 Points,Level 4 Description
Thesis & Argument,The clarity and defensibility of the thesis,Below,1,No clear thesis,Approaching,2,Implied thesis,Meets,3,Clear defensible thesis,Exceeds,4,Sophisticated nuanced thesis
Evidence,Use of textual evidence,Below,1,No evidence,Approaching,2,Minimal evidence,Meets,3,Sufficient relevant evidence,Exceeds,4,Rich varied evidence
```

Parser: standard CSV (use `papaparse`, already commonly used or we add it
~13 KB). Up to 6 levels supported on import; UI builder allows 2-6 levels.

Export: the same shape — teachers can round-trip rubrics, share them with
PLC peers via the existing `shared_assignments` pattern.

---

## 7. Teacher grading UI

A new modal/page reached from `QuizResults`: **"Grade written responses."**
Opens to the first ungraded response.

**Layout (desktop):**

```
┌───────────────────────────────────────────────────────────────────────┐
│  ← Prev student   Student 7 of 24 — Maya Chen  [Ungraded▾]  Next →    │
├──────────────────────────────────────────────┬────────────────────────┤
│  Question 3 of 5: "Explain the role of..."   │  RUBRIC                │
│                                              │  ─ Thesis              │
│  [TipTap snapshot of student's response,     │    ○ Below     1 pt    │
│   read-only, highlight toolbar on selection] │    ● Approaching 2 pt  │
│                                              │    ○ Meets     3 pt    │
│  [margin comments column on the right of     │    ○ Exceeds   4 pt    │
│   the response]                              │  ─ Evidence  ...        │
│                                              │  Total: 7 / 16          │
│                                              │  Overall comment: [   ] │
├──────────────────────────────────────────────┴────────────────────────┤
│  [Save & next ungraded]  [Save]  [Skip]                                │
└───────────────────────────────────────────────────────────────────────┘
```

Keyboard:

- `J` / `K` or `←` / `→` — prev / next student
- `Cmd/Ctrl+S` — save current grading
- Select text → highlight palette appears inline; pressing `C` opens a
  comment input on the selection.

**Status tracking**: each response carries a per-question `grading` block.
A response is "fully graded" when every written question has a `grading`
entry. The header chip shows `Ungraded / Partially graded / Graded`.

---

## 8. Pause / resume & soft lockdown

Mostly free, given what's already there:

- **Pause**: `QuizAssignment.status` already supports `'active' | 'paused' |
'inactive'` (`types.ts:2936-3010`). Student client checks the parent
  session status on each tick and, when `paused`, freezes the editor in a
  read-only state with a "Paused by teacher — your work is saved" overlay.
  No new fields needed.
- **Resume next day**: because the response doc persists `answers[]` keyed by
  `questionId`, the student re-joins via the same deterministic
  `_responseKey` (`useQuizSession.ts:317-325`), the editor rehydrates from
  the TipTap JSON in `answer`, and cursor lands at end-of-doc.
- **Tab-switch flagging (already implemented)**: `tabWarningsEnabled` gates
  the existing visibility/blur listeners (`QuizStudentApp.tsx:230-370`). We
  surface counts more prominently in the teacher's monitor for written
  responses — a chip like "⚠ 2 tab switches" next to each student in the
  grading nav. No new client-side enforcement; warnings are signal, not
  punishment.

Explicitly out of scope: fullscreen-API enforcement, copy/paste blocking,
right-click suppression.

---

## 9. Firestore rules — required changes

After the schema revision (grading lives in a top-level `grading` map,
not inside `answers[]`), Phase 1 needs **zero new permissive rules**:

1. **Teachers can already write `grading`** — the existing teacher
   branch on `match /responses/{responseKey}` is
   `request.auth.uid == sessionTeacherUid() || isAdmin()` with no
   field restrictions (`firestore.rules:1773-1775`). Adding the new
   `grading` field is permitted automatically.
2. **Students cannot write `grading`** — the student-update branch at
   `firestore.rules:1814` already locks writes to a strict whitelist:
   `changedKeys().hasOnly(['answers', 'status', 'submittedAt',
'tabSwitchWarnings', 'completedAttempts', 'classPeriod', 'score',
'preSyncVersion', 'unlocked'])`. `grading` is not in that list, so
   any student write including it is rejected by default. No rule
   change needed for student-side protection.
3. **Rubrics collection (Phase 3 only)**: `/users/{userId}/rubrics/{rubricId}`
   — owner-only read/write, mirroring `firestore.rules:508-518`.

The append-only `tabSwitchWarnings` / `completedAttempts` constraints
stay exactly as they are.

(Phase 2 will add tighter rules around what teachers can write to
`grading[questionId]` — e.g., capping `pointsAwarded` at the question's
point value once we model the question key in rules — but Phase 1 trusts
the existing teacher-owns-everything model.)

---

## 10. Open questions

1. **Submission finality.** Today, a `completed` response can be unlocked by
   the teacher via `unlockStudentAttempt`. For multi-day essays, do we want
   a separate "submitted for grading" state distinct from `completed`, or
   does `completed` cover both? _Leaning: reuse `completed`; pause/resume is
   the multi-day mechanism, and `completed` means "I'm done writing."_
2. **Rubric edit vs snapshot.** When a teacher edits a saved rubric after
   it's been used to grade past quizzes — do past grades update? _Leaning:
   no, embed a snapshot on the question at assignment time._
3. **Where rubrics live in the UI.** Inside Quiz settings only? Or a
   top-level "Rubrics" admin area surfaced from the dashboard? _Leaning:
   start inside Quiz settings; promote later if usage warrants it._
4. **Anonymous grading.** Some teachers prefer to grade without seeing
   student names (bias mitigation). Worth a toggle in the grader header?
5. **Drive export for written responses.** `QuizResults` exports to Google
   Sheets today. Long essay text will look awful in a spreadsheet cell —
   should we also support a Google Docs export with one section per student?

---

## 11. Phased PR plan

- **Phase 1 — Foundation (this design's scope to start)**
  - `short` and `essay` question types in `types.ts`, builder UI in
    `QuizEditor`, default config in `config/widgetDefaults.ts` if applicable.
  - `contenteditable` + DOMPurify rich-text editor (lazy chunk on quiz
    route). No new dependency.
  - Autosave to `answers[].answer` as sanitized HTML. No plainText
    mirror — derived on demand.
  - Pause/resume rehydration (mostly works already; verify with E2E).
  - Top-level `grading` map on the response doc, keyed by questionId.
  - Manual grading modal with prev/next nav, points-only entry (no rubric,
    no annotations yet).
  - No rule changes needed — existing student whitelist already locks
    `grading` out of student writes; teacher branch is unrestricted.
  - Soft-lockdown polish: surface tab-switch count in grading header.

- **Phase 2 — Annotations**
  - Highlight marks + margin comments in the grader.
  - Read-only student score-review screen with highlights/comments.
  - Snapshot-at-grading-time behavior.

- **Phase 3 — Rubrics**
  - Rubric data model + per-user collection + rules.
  - Builder UI, CSV import/export template at
    `public/templates/rubric-template.csv`.
  - Rubric scoring panel in grader; embedded snapshot on question.
  - PLC sharing.

- **Phase 4 (optional)** — AI-assisted draft grading, revision requests with
  annotation migration, anonymous-grading toggle, Docs export.

---

## 12. Testing checklist (per phase)

- **Phase 1**: unit tests for HTML sanitization round-trip + word
  count from HTML; autosave debounce; rules tests asserting student
  writes including `grading` are rejected and teacher writes are
  accepted. E2E for pause-then-resume-next-day using Playwright.
- **Phase 2**: annotation range survives sanitization round-trip; student
  read-only render shows highlights at correct offsets.
- **Phase 3**: CSV import round-trips losslessly; rubric snapshot doesn't
  change when source rubric is edited; total points capping works.

---

## 13. Phase 1 — Implementation Log

**Shipped** in commits `b3efd5d5` (`feat(quiz): short-answer and essay
question types (Phase 1)`) and `fccba247` (`fix(quiz): address PR
review feedback on written-response Phase 1`), merged via PR #1614 to
`dev-paul`.

| Area                    | File(s)                                                                                                                                                                                                                                                                                                                   | Notes                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question types          | [types.ts:2328-2334](../types.ts)                                                                                                                                                                                                                                                                                         | `'short'` and `'essay'` added to `QuizQuestionType`; helper `isWrittenQuestionType()` at line 2340.                                                                                                                                                             |
| Top-level `grading` map | [types.ts:2799](../types.ts), [types.ts:2806](../types.ts)                                                                                                                                                                                                                                                                | `QuizResponse.grading?: { [qid]: WrittenAnswerGrade }`; `WrittenAnswerGrade` reserves `annotations`/`rubricScores`/`gradingSnapshot` for future phases.                                                                                                         |
| Student editor          | [components/quiz/WrittenResponseEditor.tsx](../components/quiz/WrittenResponseEditor.tsx)                                                                                                                                                                                                                                 | `contenteditable` + DOMPurify; bold/italic/underline (+ lists on essay); word counter with soft cap warning; `questionKey` remount handles pause/resume.                                                                                                        |
| Student app wiring      | [components/quiz/QuizStudentApp.tsx](../components/quiz/QuizStudentApp.tsx)                                                                                                                                                                                                                                               | 500 ms debounced autosave; flush on visibility-hidden, `beforeunload`, unmount, and the `spartboard:quiz:flush-written` event (dispatched before strike-3 tab-switch auto-submit).                                                                              |
| Builder UI              | [components/widgets/QuizWidget/components/QuizEditor.tsx](../components/widgets/QuizWidget/components/QuizEditor.tsx)                                                                                                                                                                                                     | Type picker exposes both new types; `placeholder` and `maxWords` config fields appear conditionally.                                                                                                                                                            |
| Manual grader           | [components/widgets/QuizWidget/components/WrittenResponseGrader.tsx](../components/widgets/QuizWidget/components/WrittenResponseGrader.tsx)                                                                                                                                                                               | Modal opened from `QuizResults`; prev/next student nav (←/→/j/k); points entry; overall comment; dirty-tracking + confirm-on-nav prompt; per-question `grading.<qid>` field-path write so concurrent grades on different questions don't clobber.               |
| Auto-grader awareness   | [hooks/useQuizSession.ts:212-221](../hooks/useQuizSession.ts)                                                                                                                                                                                                                                                             | `gradeAnswer` treats written types as ungraded by default; reads awarded points from `grading[qid]` when present; clamps to `[0, question.points]`.                                                                                                             |
| Reporting threading     | [components/widgets/QuizWidget/components/QuizResults.tsx:1595](../components/widgets/QuizWidget/components/QuizResults.tsx), [utils/assignmentExportShared.ts](../utils/assignmentExportShared.ts), [utils/plcContributions.ts](../utils/plcContributions.ts), [utils/quizDriveService.ts](../utils/quizDriveService.ts) | Grades surface in stats, PLC contribution publishing, Drive sheet export, scoreboard/streaks, and the assignment archive — without each call site having to know about the new map.                                                                             |
| Sanitizer               | [utils/security.ts:78-87](../utils/security.ts)                                                                                                                                                                                                                                                                           | New `sanitizeQuizResponse` profile: whitelist `b/strong/i/em/u/p/br/ul/ol/li`, zero attributes, defangs `<font>`/`<span style>` styling that browsers inject from `execCommand`.                                                                                |
| Firestore rules         | [firestore.rules:1901](../firestore.rules)                                                                                                                                                                                                                                                                                | No new permissive rules. Existing student `changedKeys().hasOnly([...])` whitelist already excludes `grading`; comment added in this round to document that `gradingSnapshot` / `annotations` / `rubricScores` all inherit the same protection by construction. |

**Tests added in this round (Phase 1 §12 gap-fill):**

- [tests/utils/sanitizeQuizResponse.test.ts](../tests/utils/sanitizeQuizResponse.test.ts) — 12 tests covering whitelist, strip cases, idempotency.
- [tests/components/quiz/WrittenResponseEditor.test.tsx](../tests/components/quiz/WrittenResponseEditor.test.tsx) — 9 tests covering hydration, sanitized onChange, word cap, pause/resume remount, disabled state.
- [tests/hooks/useQuizSession.gradeAnswer.test.ts](../tests/hooks/useQuizSession.gradeAnswer.test.ts) — 8 tests covering ungraded default, manual-grade pickup, clamping, MC pass-through.

**Carry-overs (still deferred):**

- Firestore rules tests for student-rejection on `grading` writes — would
  need the emulator suite, gated to a separate CI job; flagged for the
  Phase 3 PR which already touches rules.
- Playwright E2E for the pause-then-resume-next-day flow — current
  Phase 1 unit tests cover the `questionKey` remount mechanism; a true
  cross-day E2E needs deterministic time-mocking we don't have yet.

---

## 14. Phase 2 — Implementation Log

**Design decision (recorded in §5):** snapshot-at-grading-time +
sidecar plaintext offsets, rendered to JSX. Highlight `<mark>` elements
are emitted directly into the React tree rather than being baked into a
sanitized HTML string, so the Phase 1 sanitizer profile stays exactly
as-is and the student's `answer` JSON is never mutated.

| Area                 | File(s)                                                                                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type                 | [types.ts:2815-2823](../types.ts)                                                                                                                          | Added `WrittenAnswerGrade.gradingSnapshot?: string`. Frozen on first save with annotations; immutable afterwards. Optional so Phase 1 grades remain valid.                                                                                                                                                                                                                   |
| Offset/render walker | [utils/writtenAnnotations.ts](../utils/writtenAnnotations.ts) (new)                                                                                        | `htmlToPlainText`, `renderAnnotatedSnapshot`, `getPlainTextOffsetFromRange`. One walker drives both directions of the offset math so the teacher's selection → offset conversion and the renderer's offset → DOM mapping can never disagree. Block tags (`<p>`/`<li>`) and `<br>` each contribute exactly one newline character.                                             |
| Annotation surface   | [components/widgets/QuizWidget/components/AnnotatedResponseView.tsx](../components/widgets/QuizWidget/components/AnnotatedResponseView.tsx) (new)          | Two modes: `edit` (teacher) surfaces a 4-color palette anchored to the live selection rect plus a margin column with delete/edit affordances; `read` (student) renders the same snapshot with comment chips, no palette, no edit handles.                                                                                                                                    |
| Grader integration   | [components/widgets/QuizWidget/components/WrittenResponseGrader.tsx](../components/widgets/QuizWidget/components/WrittenResponseGrader.tsx)                | Replaces the `dangerouslySetInnerHTML` read-only block with `<AnnotatedResponseView mode="edit">`. Threads `draftAnnotations` through hydration + dirty-tracking. On save: snapshot frozen via `sanitizeQuizResponse(studentAnswer)` the first time annotations land; reused on every subsequent save so a post-unlock student edit can never reshape the teacher's anchors. |
| Student score-review | [components/quiz/QuizStudentApp.tsx](../components/quiz/QuizStudentApp.tsx) — new `WrittenAnswerReview` sub-component, branching in `PublishedScoreReview` | Written-type questions render the frozen snapshot via `AnnotatedResponseView` (read mode) when annotations exist, or a sanitized HTML rendering of the snapshot when only points/comment exist. Falls back to the live sanitized answer when no grade yet. Visibility-gated by `session.scoreVisibility` like the rest of the review screen.                                 |
| Firestore rules      | [firestore.rules:1901](../firestore.rules)                                                                                                                 | Comment-only change to make the teacher-only invariant for `grading.*` (including `gradingSnapshot`, `annotations`, `rubricScores`) explicit. No new rule clauses — the existing `hasOnly([...])` whitelist already locks students out by construction.                                                                                                                      |

**Tests added (Phase 2 §12):**

- [tests/utils/writtenAnnotations.test.tsx](../tests/utils/writtenAnnotations.test.tsx) — 15 tests covering plaintext extraction across nested/block/list/`<br>` cases, mark wrapping invariants (single range, partial text node, paragraph-spanning, inline-tag-preservation, multiple non-overlapping), offset round-trip with `htmlToPlainText`, and `getPlainTextOffsetFromRange` behavior (basic, collapsed, escaping the root).
- [tests/components/quiz/AnnotatedResponseView.test.tsx](../tests/components/quiz/AnnotatedResponseView.test.tsx) — 9 tests covering read mode (no margin column without comments, comment chip rendering, no palette in read mode) and edit mode (empty hint, row hydration, click-to-open editor, comment edit, delete, color change).
- [tests/components/quiz/WrittenResponseGrader.annotations.test.tsx](../tests/components/quiz/WrittenResponseGrader.annotations.test.tsx) — 3 tests covering: (a) points-only save does NOT bake a `gradingSnapshot`; (b) snapshot stays frozen even when the student's live answer has diverged; (c) saved annotations rehydrate the draft on mount.
- [tests/components/quiz/PublishedScoreReview.annotations.test.tsx](../tests/components/quiz/PublishedScoreReview.annotations.test.tsx) — 5 tests covering visibility gating, ungraded fallback, snapshot-wins-over-live-answer rendering, mark wrapping on the student side, and "no response" empty state.

**Deferred to follow-ups:**

- **Overlapping annotation UX** — the renderer correctly handles overlap (primary color wins, all overlap ids exposed on `data-overlap-ids`), but the editor surface picks only the primary on click; a "split into N marks" hover affordance is out of scope.
- **Margin chip vertical anchoring** under reflow — Phase 2 lists comments in author order; pinning chips to the y-coordinate of their highlight (à la Google Docs) is a polish pass.
- **Phase 4 carry-overs** — revision-aware offset remapping if the snapshot ever needs to be regenerated; anonymous-grading toggle; AI-assisted draft grading; Docs export for long essays.
