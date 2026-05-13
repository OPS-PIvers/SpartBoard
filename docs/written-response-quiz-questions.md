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

**Storage shape** (extension to `QuizResponseAnswer`):

```ts
type QuizResponseAnswer = {
  questionId: string;
  answer: string; // existing — for written, this is a serialized TipTap JSON doc
  answeredAt: number;
  isCorrect?: boolean; // unused for written
  speedBonus?: number; // unused for written
  // NEW (optional, only present for written responses):
  written?: {
    docVersion: 1; // schema version for forward-compat
    plainText: string; // sanitized text, used for word-count, search, exports
    wordCount: number;
    lastEditedAt: number;
  };
  grading?: {
    // populated by teacher
    pointsAwarded: number;
    rubricScores?: RubricScore[]; // see §6
    annotations?: Annotation[]; // see §5
    overallComment?: string; // teacher's summary note
    gradedBy: string; // teacher uid
    gradedAt: number;
  };
};
```

`answer` continues to be a string field at the Firestore level (the TipTap
JSON serialized) so rules stay simple. The `written.plainText` mirror is
what we sanitize and read for word counts / Drive exports.

---

## 4. Rich text editor

**Recommendation: TipTap (ProseMirror under the hood).**

Why:

- Annotations are first-class via ProseMirror **marks** — exactly what we
  need for highlights tied to ranges (see §5 recommendation).
- StarterKit + a handful of extensions covers everything we need;
  lazy-loaded on the quiz route, bundle impact is ~80-120 KB gzipped and only
  paid when a written question is rendered.
- Document is serialized as JSON, sanitized via `dompurify` on render. We
  already have `dompurify@3.4.2`.

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

## 5. Annotations (highlights + margin comments)

### Recommendation

**Store annotations as ProseMirror marks inside the student's document.**
Reason: marks move with the text. If the response gets edited in a future
"request revisions" flow, a comment anchored to a sentence travels with that
sentence; sidecar-by-offset comments would drift the moment anyone touches
the doc.

To make this work cleanly, the student's submitted document is **frozen** at
grading time (status becomes `completed` and a serialized snapshot is what
the teacher annotates). If teachers later allow revisions, we copy
annotations onto the new doc as best-effort — but that's a future-phase
concern, not Phase 2.

### Annotation shape

```ts
type Annotation = {
  id: string; // uuid
  range: { from: number; to: number }; // ProseMirror positions in the snapshot doc
  highlightColor: 'yellow' | 'green' | 'pink' | 'blue';
  comment?: string; // optional margin note; an annotation can be a bare highlight
  authorUid: string;
  createdAt: number;
};
```

Rendered as:

- A `highlight` mark with `data-annotation-id` on the marked text.
- A right-rail margin column showing comments anchored to their highlights.
  Hovering a highlight scrolls/focuses the corresponding margin note and
  vice versa.

### Student view of annotations

When the teacher publishes scores (`scoreVisibility` already exists in
`QuizAssignment`), the student score-review screen renders the same snapshot
in a **read-only** TipTap instance with highlight marks + margin comments
visible. No editing surface, no reply (Phase 4 if we want a back-and-forth).

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

Minimal. The response doc shape stays the same at the rule level (we're just
storing a larger string + an optional `grading` field).

Adds needed in `firestore.rules`:

1. Allow teacher (`teacherUid == request.auth.uid` on the parent session) to
   write the `grading` field on a response doc. Currently student-only.
   This needs careful merge-path rules so teacher writes can't reset
   `answers` or `tabSwitchWarnings`.
2. New collection `/users/{userId}/rubrics/{rubricId}` — owner-only
   read/write, mirroring the existing per-user collection patterns
   (`firestore.rules:508-518` is the right template).
3. PLC sharing of rubrics piggybacks on the existing `shared_assignments`
   collection model — Phase 3 only.

The append-only `tabSwitchWarnings` / `completedAttempts` constraints stay
exactly as they are.

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
  - TipTap student editor, lazy-loaded on quiz route.
  - Autosave to `answers[].answer` (TipTap JSON) + `written.plainText`.
  - Pause/resume rehydration (mostly works already; verify with E2E).
  - Manual grading modal with prev/next nav, points-only entry (no rubric,
    no annotations yet).
  - Teacher rule allowing `grading` field write.
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

- **Phase 1**: unit tests for TipTap JSON ↔ plainText conversion, autosave
  debounce, word-count cap behavior; E2E for pause-then-resume-next-day
  scenario using Playwright; rules tests asserting teacher-write-only of
  `grading` field and student-write-only of everything else.
- **Phase 2**: annotation range survives sanitization round-trip; student
  read-only render shows highlights at correct offsets.
- **Phase 3**: CSV import round-trips losslessly; rubric snapshot doesn't
  change when source rubric is edited; total points capping works.
