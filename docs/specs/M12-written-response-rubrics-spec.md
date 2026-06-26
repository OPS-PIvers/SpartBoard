# M12 — Written-response Phase 3: Rubric-based Grading

**Status:** Implementation spec — ready to build  
**Author:** Architect review of dev-paul codebase  
**Scope:** Phase 3 of docs/written-response-quiz-questions.md — rubric data model, builder UI, grader integration, Firestore collection + rules, CSV export of rubric scores, and PLC sharing of rubrics  
**Date:** 2026-06-25

---

## 1. Current-state verification

The source doc's Phase 3 backlog claim has been verified against the live code on branch `dev-paul`. Summary:

| Claim                                                 | Verified state | Evidence                                                                                                    |
| ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| Forward-compat stub `WrittenAnswerRubricScore` exists | **True**       | `types.ts:3661-3667` — `criterionId`, `levelId`, `points`, `note?`                                          |
| `rubricScores?` reserved on `WrittenAnswerGrade`      | **True**       | `types.ts:3633`                                                                                             |
| `grading` excluded from student write whitelist       | **True**       | `firestore.rules:3502-3519` — comment explicitly names `rubricScores`                                       |
| No `Rubric` / `RubricCriterion` / `RubricLevel` types | **True**       | Grepped all `.ts`/`.tsx` — zero matches for `Rubric` as a type/interface                                    |
| No rubric builder UI                                  | **True**       | No files matching rubric builder pattern; `WrittenResponseGrader.tsx` comment at line 13 explicitly defers  |
| No `/rubrics` Firestore collection or rules           | **True**       | Entire `firestore.rules` has no rubric collection                                                           |
| No CSV export of rubric scores                        | **True**       | `assignmentExportShared.ts` + `quizDriveService.ts` have no rubric-score columns                            |
| No PLC sharing of rubrics                             | **True**       | All PLC sharing is quiz/video-activity oriented; no rubric sharing path                                     |
| Phase 1 (question types, grader, grading map)         | **Shipped**    | PR #1614, commits `b3efd5d5` + `fccba247`                                                                   |
| Phase 2 (annotations, snapshot)                       | **Shipped**    | `AnnotatedResponseView.tsx`, `utils/writtenAnnotations.ts`, `WrittenResponseGrader.tsx` Phase 2 integration |

**Real remaining slice:** Everything described in Phase 3 of the source doc is genuinely unbuilt. This spec covers the complete Phase 3 surface with no prior work to reconcile.

The doc's `RubricScore` type in §6 aligns with the existing `WrittenAnswerRubricScore` stub but uses slightly different naming (`RubricScore` vs `WrittenAnswerRubricScore`). This spec standardizes on `WrittenAnswerRubricScore` (already exported from `types.ts`) and introduces new first-class types `Rubric`, `RubricCriterion`, and `RubricLevel` alongside it.

---

## 2. Architecture decision

**Chosen approach: teacher-owned rubrics in `/users/{teacherUid}/rubrics/{rubricId}`, embedded snapshot on the question at question-save time, rubric scoring panel in the existing `WrittenResponseGrader` right-rail sidebar.**

The source doc's model (`rubricId` reference OR inline snapshot on the question, owner-only collection) is sound. This spec commits to the **inline snapshot-on-question** model from day one (rather than reference + lazy resolve), because:

- The quiz lives in Google Drive as a JSON file. If only a `rubricId` reference is stored, loading a quiz requires a Firestore round-trip to materialize the rubric before the editor/grader can render — an async dependency the rest of the quiz system avoids. The snapshot eliminates it.
- PLC-synced quizzes propagate `QuizQuestion[]` across group members. A bare `rubricId` would require each recipient to either own the rubric or receive a separate share; the snapshot travels with the question automatically.
- Past assignment grades referencing a `rubricId` would silently break if the source rubric is deleted. The snapshot guarantees stability.

The **personal rubric library** (`/users/{teacherUid}/rubrics/`) remains the authoritative store and the builder's save target. A question's `rubricSnapshot` is written from the library copy at the moment the teacher attaches it, not live-linked. The grader reads the snapshot, never the library doc.

**PLC sharing model:** A new `shared_rubrics` top-level collection (mirrors `shared_quizzes`). Teachers pick a rubric from their library, write a share doc, and paste the link. Recipients import a copy into their own `/users/.../rubrics/` library. This is link-based sharing — same pattern as quiz sharing, no PLC-internal fan-out required to start.

---

## 3. Open decisions (need Paul)

### OD-1: Where does the rubric builder UI live?

**Option A — Inside QuizEditor, per-question.** An "Attach Rubric" button in the written-question detail pane opens a slide-over that shows the teacher's library (create-new or pick existing). Rubric creation happens inline.  
**Option B — Standalone rubric library modal**, reachable from QuizEditor and from a top-level gear/settings area (similar to how Guided Learning sets can be managed outside a widget).  
**Option C — Inside QuizEditor only, no standalone page.** Rubrics are authored per-quiz, not in a reusable library. Simpler to build, harder to reuse across quizzes.

**Recommendation: Option A** — inline builder behind an "Attach Rubric" button in the written-question detail pane. The library picker shows existing rubrics (create-new first row). A side panel lets teachers build criteria/levels without leaving the editor. This matches the teacher mental model ("I'm building a quiz question, I want to attach a scoring rubric to it") and keeps the implementation contained. Option B is a sensible Phase 4 upgrade if rubric management becomes complex enough to warrant a dedicated surface.

**Trade-offs:** Option A concentrates complexity inside `QuizEditor.tsx` and its `useQuizEditorState.ts`. A well-extracted `RubricBuilderPanel` sub-component keeps it manageable. Option B front-loads routing complexity for marginal benefit at this usage level.

---

### OD-2: How should rubric-derived points flow into the existing points-entry field?

**Option A — Rubric auto-fills `pointsAwarded`.** Selecting levels on the rubric panel auto-computes the sum and sets `pointsInput` directly. The points field is still editable (teacher can override). `rubricScores` and `pointsAwarded` are both saved on the grade object.  
**Option B — Rubric is advisory; teacher still manually enters `pointsAwarded`.** The rubric panel shows a computed total but does NOT auto-fill the points field. Teacher must type points separately.  
**Option C — Rubric replaces the points field.** When a rubric is attached, the free-entry points field is hidden; points come only from rubric sum.

**Recommendation: Option A** — rubric auto-fills `pointsAwarded`, field remains editable. This is the standard behavior in LMS rubric graders (Canvas, Schoology) and makes rubric-scoring feel efficient. Dirty-tracking in `WrittenResponseGrader` already handles the "unsaved edits" state; the auto-fill just changes how the value gets populated. The teacher retains override capability for edge cases.

**Trade-offs:** Option B requires two conscious decisions per question (fill rubric AND enter points). Option C is opinionated and breaks the override path. Option A is the only one that doesn't require a teacher to double-work.

---

### OD-3: PLC rubric sharing — link-based or PLC-library-integrated?

**Option A — Link-based sharing only.** Teacher gets a share URL (`/share/rubric/{shareId}` or just a doc ID) they paste elsewhere. Mirrors `shared_quizzes`. Simple Firestore write + read, no PLC membership checks required.  
**Option B — Integrated into PLC library.** A "Rubrics" sub-tab appears in the PLC Quizzes section. Teachers share rubrics into the PLC; members can import from there. Mirrors `PlcQuizLibraryBody`.  
**Option C — Both, phased.** Ship Option A in Phase 3 (link sharing); promote to Option B in a follow-up if rubric cross-team exchange proves to be a real teacher workflow.

**Recommendation: Option C** — ship link-based sharing (Option A) in this phase; leave Option B infrastructure hooks in place but don't build the PLC tab yet. The link-sharing model is independently useful (teacher sends link to a colleague, colleague imports a copy), low-risk, and doesn't require PLC membership checks. The `shared_rubrics` collection name is future-compatible with a PLC tab that also reads from it.

**Trade-offs:** Option B is richer but adds a full PLC tab, hooks, and Firestore subcollection — scope creep that could delay the rubric scoring itself, which is the core value. Option A alone means no PLC-tab discoverability, but rubrics travel implicitly via quiz question snapshots when a quiz is shared to a PLC.

---

## 4. Type system changes

**File to modify: `/types.ts`**

### 4.1 New types (add after `WrittenAnswerRubricScore` at line 3667)

```typescript
// ─── Phase 3: Rubric model ───────────────────────────────────────────────────

/**
 * A single performance level within a rubric criterion.
 * Ordered low-to-high by convention (though the grader renders them
 * high-to-low for quick scanning — "Exceeds" at the top).
 */
export interface RubricLevel {
  id: string; // uuid minted by the builder
  label: string; // "Exceeds" | "Meets" | "Approaching" | "Below"
  points: number; // 0..n — must be ≥ 0; levels within a criterion must be unique
  description?: string; // Optional descriptor shown in the grader tooltip
}

/**
 * A single scoring dimension in a rubric (e.g. "Thesis & Argument").
 * `levels` is ordered low → high by the builder; the grader reverses for display.
 */
export interface RubricCriterion {
  id: string;
  name: string; // "Thesis & Argument"
  description?: string; // Shown under the criterion name in the grader
  levels: RubricLevel[]; // 2–6 levels
}

/**
 * Teacher-owned reusable rubric, stored at
 * `/users/{teacherUid}/rubrics/{rubricId}`.
 *
 * When attached to a `QuizQuestion`, a snapshot of this object is
 * embedded in `QuizQuestion.rubricSnapshot` at attach time — the rubric
 * collection doc is NOT read at grading time. Edits to the library
 * copy never retroactively change past assignment grades.
 */
export interface Rubric {
  id: string;
  title: string; // "AP Lang DBQ Rubric"
  description?: string;
  criteria: RubricCriterion[];
  createdAt: number; // ms epoch
  updatedAt: number;
}

/**
 * Minimal public face of a rubric stored in `/shared_rubrics/{shareId}`.
 * The full rubric payload is inlined so recipients can import without
 * a second read.
 */
export interface SharedRubric extends Rubric {
  originalAuthor: string; // teacher uid
  sharedAt: number;
}
```

### 4.2 Extend `QuizQuestion` (modify existing interface at line 2967)

Add two optional fields after `maxWords?`:

```typescript
  /**
   * Phase 3 (rubrics). Id of the rubric in the teacher's personal
   * `/users/{teacherUid}/rubrics/{rubricId}` library that was used to
   * generate `rubricSnapshot`. Stored for informational display ("Edit
   * this rubric in your library") but NOT load-bearing at grading time —
   * graders always read `rubricSnapshot`.
   */
  rubricId?: string;
  /**
   * Phase 3 (rubrics). Snapshot of the `Rubric` object captured at
   * the moment the teacher attached it to this question. Frozen —
   * edits to the library copy never alter past assignments.
   * Optional so pre-Phase-3 questions remain valid.
   */
  rubricSnapshot?: Rubric;
```

### 4.3 `WrittenAnswerRubricScore` — existing stub is sufficient

The stub at `types.ts:3661-3667` already covers the grading-time fields. No changes needed. Export is already public.

---

## 5. Firestore collection + rules

### 5.1 New collection: `/users/{teacherUid}/rubrics/{rubricId}`

**File to modify: `/firestore.rules`**

Add after the `quiz_assignments` block (around line 616), inside `match /users/{userId}/`:

```
// Phase 3 (written-response rubrics). Teacher-owned reusable rubric
// library. Schema-locked to the `Rubric` interface fields so the grader
// can trust the shape at read time.
match /users/{userId}/rubrics/{rubricId} {
  allow read, delete: if request.auth != null && request.auth.uid == userId;
  allow create: if request.auth != null
                && request.auth.uid == userId
                && request.resource.data.id == rubricId
                && request.resource.data.keys().hasOnly([
                     'id', 'title', 'description', 'criteria', 'createdAt', 'updatedAt'
                   ])
                && request.resource.data.title is string
                && request.resource.data.criteria is list
                && request.resource.data.createdAt is int
                && request.resource.data.updatedAt is int;
  allow update: if request.auth != null
                && request.auth.uid == userId
                && request.resource.data.id == resource.data.id
                && request.resource.data.keys().hasOnly([
                     'id', 'title', 'description', 'criteria', 'createdAt', 'updatedAt'
                   ])
                && request.resource.data.title is string
                && request.resource.data.criteria is list
                && request.resource.data.updatedAt is int;
}
```

**Why schema-lock on create/update:** `criteria` is a list of complex objects. Firestore CEL cannot deep-validate nested list elements without `.every()` (unavailable). The schema lock caps the top-level key surface — criterion shape validation is client-enforced and trusted on read, consistent with how `QuizQuestion[]` and `RubricLevel[]` are handled elsewhere in the codebase.

### 5.2 New collection: `/shared_rubrics/{shareId}`

Add at the top-level rules block, alongside `shared_quizzes`:

```
// Shared rubrics — link-based rubric sharing. Same pattern as
// shared_quizzes (authenticated get + author-owns write/delete).
// The `id` field is the share doc id; `originalAuthor` must match
// the creating uid so share ownership is auditable.
match /shared_rubrics/{shareId} {
  allow get: if request.auth != null;
  allow create: if request.auth != null
               && request.resource.data.originalAuthor == request.auth.uid
               && request.resource.data.keys().hasOnly([
                    'id', 'title', 'description', 'criteria',
                    'createdAt', 'updatedAt', 'originalAuthor', 'sharedAt'
                  ])
               && request.resource.data.title is string
               && request.resource.data.criteria is list
               && request.resource.data.originalAuthor is string
               && request.resource.data.sharedAt is int;
  allow update, delete: if request.auth != null
               && (resource.data.get('originalAuthor', null) == request.auth.uid
                   || isAdmin());
}
```

**No `list` access** (same as `shared_quizzes`) — share docs are accessed only by the known share ID. This prevents rubric enumeration by unauthenticated or external users.

### 5.3 Firestore rules tests

**File to create: `/tests/rules/firestore-rules-rubrics.test.ts`**

Cover:

- Owner can CRUD `/users/{uid}/rubrics/{rubricId}`.
- Other authenticated user cannot read or write another user's rubrics.
- Student-role user (`isStudentRoleUser()`) is rejected (mirrors the dashboards rule).
- `shared_rubrics` create requires `originalAuthor == request.auth.uid`.
- Authenticated user can `get` (not `list`) a `shared_rubrics` doc.
- Author can delete their own shared rubric; other user cannot.

---

## 6. Component architecture

### 6.1 New: `RubricBuilderPanel`

**File to create: `/components/widgets/QuizWidget/components/RubricBuilderPanel.tsx`**

A slide-over/right-panel rendered inside `QuizEditorDetailPane` when a written question is selected and the teacher clicks "Attach Rubric" (or the rubric exists and "Edit Rubric" is shown). Managed as a local state toggle in the detail pane.

**Responsibilities:**

- Show the teacher's rubric library (list from `useRubrics` hook).
- "New rubric" creates an empty rubric in local state.
- "Pick from library" selects an existing rubric, cloning it as a snapshot.
- Within the builder: add/remove/reorder criteria; per-criterion add/remove/reorder levels with label and points inputs.
- Validate: each criterion has 2–6 levels; level points must be non-negative integers; no duplicate point values within a criterion.
- "Attach to question" calls `onAttach(rubric)` in the parent, which calls `updateQuestion(id, { rubricId, rubricSnapshot })`.
- "Save to library" calls `saveRubric(rubric)` from `useRubrics` and then attaches.
- CSV import: file-input triggers `parseRubricCsv(text)` (see §7); populates local builder state for review before attaching.
- CSV export of the current rubric via `downloadRubricCsv(rubric)` (see §7).

**Props interface:**

```typescript
interface RubricBuilderPanelProps {
  questionId: string;
  existingSnapshot?: Rubric; // pre-populated when question already has a rubric
  onAttach: (rubric: Rubric, rubricId?: string) => void;
  onDetach: () => void;
  onClose: () => void;
  teacherUid: string;
}
```

The panel does NOT need to be a modal — it can be a `right-panel` style expansion within the editor workspace (similar to how the annotation palette works in `AnnotatedResponseView`). A `position: sticky` right-rail panel that overlays the detail pane is sufficient.

### 6.2 New: `RubricScoringPanel`

**File to create: `/components/widgets/QuizWidget/components/RubricScoringPanel.tsx`**

The right-rail insert rendered inside `WrittenResponseGrader` when the current question has a `rubricSnapshot`. Replaces the generic points-entry section when a rubric is present (points entry becomes derived from the rubric sum).

**Responsibilities:**

- Render each criterion as a labeled section with its levels displayed highest-to-lowest.
- Radio-button group per criterion — selecting a level highlights it and records the `WrittenAnswerRubricScore` entry.
- Running total updates as levels are selected: `sum(rubricScores.points)`.
- Optional per-criterion note field (collapsed behind a "+" expand icon).
- On mount: hydrate from `savedGrade.rubricScores` if present.
- Exposes `draftRubricScores: WrittenAnswerRubricScore[]` and `derivedPoints: number` via props-out or render-prop to the parent.
- When all criteria are scored, auto-fills `pointsInput` with `derivedPoints` (capped at `maxPoints`) per OD-2 recommendation.

**Props interface:**

```typescript
interface RubricScoringPanelProps {
  rubric: Rubric;
  maxPoints: number;
  initialScores?: WrittenAnswerRubricScore[];
  onChange: (scores: WrittenAnswerRubricScore[], derivedPoints: number) => void;
}
```

`onChange` is called on every level selection; `WrittenResponseGrader` uses the derived points to update `pointsInput`.

### 6.3 Modify: `WrittenResponseGrader`

**File to modify: `/components/widgets/QuizWidget/components/WrittenResponseGrader.tsx`**

Changes:

1. Detect `question.rubricSnapshot` and conditionally render `<RubricScoringPanel>` above the points-entry block in the right-rail sidebar.
2. When rubric is present, auto-fill `pointsInput` via `RubricScoringPanel.onChange` callback (capped at `maxPoints`); points field remains editable for overrides.
3. Track `draftRubricScores: WrittenAnswerRubricScore[]` in local state alongside existing `draftAnnotations`.
4. Extend dirty-check to include `rubricScores`: compare `draftRubricScores` against `savedGrade?.rubricScores` (deep compare by criterionId + levelId, order-insensitive — same pattern as `annotationListsEqual`).
5. Include `rubricScores` in the grade object written via `onSaveGrade`:
   ```typescript
   const grade: WrittenAnswerGrade = {
     pointsAwarded: parsed,
     overallComment: comment.trim() || undefined,
     annotations: hasAnnotations ? draftAnnotations : undefined,
     gradingSnapshot,
     rubricScores: draftRubricScores.length > 0 ? draftRubricScores : undefined,
     gradedBy: teacherUid,
     gradedAt: Date.now(),
   };
   ```
6. Hydrate `draftRubricScores` from `savedGrade?.rubricScores ?? []` in the existing "adjusting state while rendering" block at line 135 (the `targetKey !== hydrationKey` pattern).

No change needed to the `onSaveGrade` prop signature — it already accepts `WrittenAnswerGrade` which includes `rubricScores?`.

### 6.4 Modify: `QuizEditor` (detail pane)

**File to modify: `/components/widgets/QuizWidget/components/QuizEditor.tsx`**

In the `QuizEditorDetailPane`, inside the `q.type === 'short' || q.type === 'essay'` branch (currently around line 511), add:

- An "Attach Rubric" button (or "Rubric: [title] — Edit / Detach" when `q.rubricSnapshot` exists).
- A boolean state `showRubricBuilder` that mounts `<RubricBuilderPanel>` as a slide-in or in-place expansion.
- `onAttach` callback that calls `updateQuestion(q.id, { rubricId: r.id, rubricSnapshot: r })`.
- `onDetach` callback that calls `updateQuestion(q.id, { rubricId: undefined, rubricSnapshot: undefined })`.

The `useQuizEditorState.ts` does not need changes — `updateQuestion` already accepts a `Partial<QuizQuestion>` and the new fields are already typed on `QuizQuestion`.

### 6.5 New hook: `useRubrics`

**File to create: `/hooks/useRubrics.ts`**

Mirrors the pattern of `useQuiz.ts` (Firestore CRUD for a user-owned subcollection) but simpler — rubrics have no Drive mirror.

**Interface:**

```typescript
interface UseRubricsResult {
  rubrics: Rubric[];
  loading: boolean;
  error: Error | null;
  saveRubric: (rubric: Rubric) => Promise<void>; // upsert by id
  deleteRubric: (rubricId: string) => Promise<void>;
  shareRubric: (rubricId: string) => Promise<string>; // returns shareId
  importSharedRubric: (shareId: string) => Promise<void>; // write copy to library
}
```

`saveRubric` uses `setDoc(doc(db, 'users', userId, 'rubrics', rubric.id), rubric)` (merge: false — full replacement on every save, keeping the doc shape clean).

`shareRubric` writes to `shared_rubrics` with the full rubric payload + `originalAuthor` + `sharedAt`. Returns the Firestore doc ID (the share ID). Callers surface it as a copyable link.

`importSharedRubric` reads the `shared_rubrics` doc, strips `originalAuthor`/`sharedAt`, mints a new `id` (uuid), sets `createdAt = Date.now()`, and writes to the caller's `/users/.../rubrics/` subcollection. This mirrors `importSharedQuiz` in `useQuiz.ts:611-630`.

**Firestore query:** `onSnapshot(collection(db, 'users', userId, 'rubrics'), orderBy('updatedAt', 'desc'))` — real-time list, consistent with how quiz metadata and saved widgets are managed.

---

## 7. CSV import/export utilities

### 7.1 Template file

**File to create: `/public/templates/rubric-template.csv`**

```csv
Criterion,Description,Level 1 Label,Level 1 Points,Level 1 Description,Level 2 Label,Level 2 Points,Level 2 Description,Level 3 Label,Level 3 Points,Level 3 Description,Level 4 Label,Level 4 Points,Level 4 Description
Thesis & Argument,Clarity and defensibility of the thesis,Below,1,No clear thesis,Approaching,2,Implied thesis,Meets,3,Clear defensible thesis,Exceeds,4,Sophisticated nuanced thesis
Evidence,Use of textual evidence to support claims,Below,1,No evidence cited,Approaching,2,Minimal or tangential evidence,Meets,3,Sufficient and relevant evidence,Exceeds,4,Rich and varied evidence
Analysis,Depth of reasoning connecting evidence to argument,Below,1,No analysis,Approaching,2,Superficial analysis,Meets,3,Sound analysis,Exceeds,4,Insightful nuanced analysis
```

The template ships 4 levels per criterion. Up to 6 levels are supported (12 additional columns: `Level 5 Label`, `Level 5 Points`, `Level 5 Description`, `Level 6 Label`, `Level 6 Points`, `Level 6 Description`). Extra columns beyond the supported count are ignored with a non-fatal warning.

### 7.2 Parser and serializer

**File to create: `/utils/rubricCsv.ts`**

**No new dependency.** Re-use the RFC-4180 row/cell tokenizer already inlined in `utils/csvImport.ts`. Extract `splitLogicalRows` and `splitCells` as shared helpers OR duplicate the ~80-line parser (it is small and dependency-free by design — the codebase's existing philosophy).

**Parser: `parseRubricCsv(text: string): ParseRubricResult`**

```typescript
export interface ParseRubricResult {
  rubric: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'> | null;
  errors: Array<{ line: number; reason: string }>;
  warnings: Array<{ line: number; reason: string }>;
}
```

Logic:

1. Parse header row: locate `Criterion`, `Description` (optional), `Level N Label`, `Level N Points`, `Level N Description` columns by name. Detect N from 1–6.
2. For each data row: `Criterion` required (reject blank); build `RubricCriterion` with levels from the level columns.
3. A level column-group (Label + Points) is included only if `Label` is non-empty. `Points` must parse to a non-negative integer — emit a per-row error otherwise and skip that level.
4. Criterion with fewer than 2 valid levels: emit per-row error and skip that criterion.
5. Criterion with more than 6 levels: emit warning and truncate to 6.
6. Return `null` rubric if zero valid criteria.

**Serializer: `rubricToCsv(rubric: Rubric): string`**

Inverse of the parser. Determines `maxLevels = max(criteria.map(c => c.levels.length))`. Builds header + data rows, pads shorter criteria with empty cells. Uses `"` quoting for cells containing commas or quotes.

**Tests to create: `/tests/utils/rubricCsv.test.ts`**

- Happy path: 3-criterion, 4-level CSV round-trips losslessly (parse → serialize → parse gives equal rubric).
- Missing `Criterion` column: whole-file error returned.
- Row with blank `Criterion` cell: that row is skipped with a line error, others succeed.
- Non-numeric `Points` cell: that level skipped with error, criterion continues if ≥ 2 levels remain.
- Criterion with only 1 valid level: criterion skipped with error.
- 5-level and 6-level rubrics parse correctly.
- Cells containing commas and `"` round-trip correctly through the serializer.
- Empty CSV: returns null rubric + file-level error.

### 7.3 CSV export of rubric scores in quiz results export

**File to modify: `/utils/assignmentExportShared.ts`**

The existing `buildResultsSheetData` produces one column per question. For written questions where the response has `rubricScores`, the export should surface rubric-level detail as additional columns.

**Approach:** Extend the column generation for written questions. When a `QuizQuestion` has a `rubricSnapshot`, emit additional columns after the "Points" column for that question:

- `Q{n} Rubric - {CriterionName}` — the level label selected for that criterion (e.g. "Meets")
- `Q{n} Rubric - {CriterionName} Points` — the points awarded for that criterion

These columns only appear when at least one response in the export has rubric scores for that question. Responses without rubric scores for that question render empty cells (not zero — empty preserves the distinction between "not graded with rubric" and "scored 0").

**Modified function signature:**

The existing `buildResultsSheetData` takes `Q extends ExportableQuestion`. `ExportableQuestion` is currently defined in `assignmentExportShared.ts` itself. It needs one additional optional field:

```typescript
export interface ExportableQuestion {
  id: string;
  text: string;
  points?: number;
  rubricSnapshot?: Rubric; // Add this
}
```

The implementation loop: after computing the per-question points column, if `question.rubricSnapshot` is defined and at least one response has `rubricScores[question.id]`, append criterion columns. The rubric's criteria define the column ordering — consistent across all rows.

**`quizDriveService.ts` change:** The `quizGradeFnWithManualGrades` function does not need to change. The rubric-score columns are injected by the new `buildResultsSheetData` column logic, not by the grader callback.

**`ExportableResponse` change:** Add optional `grading` field so the export loop can read rubric scores:

```typescript
export interface ExportableResponse {
  // ...existing fields...
  grading?: {
    [questionId: string]: { rubricScores?: WrittenAnswerRubricScore[] };
  };
}
```

`QuizResponse` already satisfies this because it has `grading?: { [questionId: string]: WrittenAnswerGrade }` and `WrittenAnswerGrade` already includes `rubricScores?`.

**Tests to create: `/tests/utils/assignmentExportShared.rubricColumns.test.ts`**

- Question without rubric: no extra columns in output.
- Question with rubric, responses with rubric scores: correct criterion-column headers and level-label/points values per response.
- Question with rubric, some responses have scores and some don't: scored responses fill cells, unscored responses get empty cells in the same columns.
- Multiple questions — rubric columns only appear for the specific written question that has the rubric, not for others.

---

## 8. Implementation map — all files

### Files to create

| Path                                                               | Purpose                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `/components/widgets/QuizWidget/components/RubricBuilderPanel.tsx` | Rubric builder UI — library picker, criteria/levels editor, CSV import/export, attach callback                        |
| `/components/widgets/QuizWidget/components/RubricScoringPanel.tsx` | Grader right-rail rubric scoring widget — criterion radio groups, running total                                       |
| `/hooks/useRubrics.ts`                                             | Firestore CRUD + share/import for `/users/{uid}/rubrics/` and `/shared_rubrics/`                                      |
| `/utils/rubricCsv.ts`                                              | `parseRubricCsv`, `rubricToCsv`, RFC-4180 tokenizer (or import from shared location if extracted from `csvImport.ts`) |
| `/public/templates/rubric-template.csv`                            | Starter CSV template linked from builder                                                                              |
| `/tests/utils/rubricCsv.test.ts`                                   | CSV round-trip tests (see §7.2)                                                                                       |
| `/tests/utils/assignmentExportShared.rubricColumns.test.ts`        | Export rubric-column tests (see §7.3)                                                                                 |
| `/tests/rules/firestore-rules-rubrics.test.ts`                     | Firestore emulator rules tests (see §5.3)                                                                             |
| `/tests/hooks/useRubrics.test.ts`                                  | Unit tests: saveRubric, deleteRubric, shareRubric, importSharedRubric                                                 |
| `/tests/components/quiz/RubricBuilderPanel.test.tsx`               | Builder tests: render, add criterion, add level, CSV import, attach callback                                          |
| `/tests/components/quiz/RubricScoringPanel.test.tsx`               | Scoring tests: render, level selection, derived points, hydration, dirty state                                        |

### Files to modify

| Path                                                                  | Changes                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/types.ts`                                                           | Add `Rubric`, `RubricCriterion`, `RubricLevel`, `SharedRubric` interfaces; add `rubricId?` and `rubricSnapshot?` to `QuizQuestion`                                        |
| `/firestore.rules`                                                    | Add `match /users/{userId}/rubrics/{rubricId}` block; add top-level `match /shared_rubrics/{shareId}` block                                                               |
| `/components/widgets/QuizWidget/components/QuizEditor.tsx`            | Add "Attach Rubric" button + `RubricBuilderPanel` toggle in written-question branch of `QuizEditorDetailPane`                                                             |
| `/components/widgets/QuizWidget/components/WrittenResponseGrader.tsx` | Add `draftRubricScores` state; mount `RubricScoringPanel` when `question.rubricSnapshot` present; include `rubricScores` in `WrittenAnswerGrade`; extend dirty-check      |
| `/utils/assignmentExportShared.ts`                                    | Add `rubricSnapshot?` to `ExportableQuestion`; add `grading?` to `ExportableResponse`; extend column loop to emit criterion columns for rubric-equipped written questions |

---

## 9. Data flow

### Rubric creation and attachment

```
Teacher opens QuizEditor
  → selects a short/essay question
  → clicks "Attach Rubric" in detail pane
  → QuizEditorDetailPane sets showRubricBuilder = true
  → RubricBuilderPanel renders with useRubrics().rubrics list
  → Teacher picks "New rubric" or picks existing from list
  → Teacher edits criteria/levels (or imports from CSV via parseRubricCsv)
  → Teacher clicks "Save to library"
  → useRubrics.saveRubric(rubric) → setDoc to /users/{uid}/rubrics/{id}
  → Teacher clicks "Attach to question"
  → onAttach(rubric, rubric.id) called
  → QuizEditorDetailPane calls updateQuestion(qId, { rubricId: rubric.id, rubricSnapshot: rubric })
  → Question state updated; useQuizEditorState marks editor dirty
  → Teacher saves quiz → quiz JSON (with rubricSnapshot embedded) written to Drive
```

### Rubric-assisted grading

```
Teacher opens WrittenResponseGrader from QuizResults
  → For each question, WrittenResponseGrader checks question.rubricSnapshot
  → If present: mounts RubricScoringPanel in right-rail sidebar
  → Teacher selects level per criterion
  → RubricScoringPanel.onChange(scores, derivedPoints) called
  → WrittenResponseGrader updates draftRubricScores and pointsInput (auto-fill)
  → Teacher reviews auto-filled points (may override)
  → Teacher clicks Save
  → handleSave assembles WrittenAnswerGrade { ..., rubricScores, pointsAwarded }
  → onSaveGrade(responseKey, questionId, grade) → Firestore field-path write
    to /quiz_sessions/{sessionId}/responses/{responseKey}.grading.{questionId}
```

### CSV export with rubric columns

```
Teacher clicks "Export to Sheets" from QuizResults
  → quizDriveService calls buildResultsSheetData(responses, questions, quizGradeFnWithManualGrades)
  → buildResultsSheetData detects question.rubricSnapshot present
  → Emits criterion-detail columns for that question
  → Each response row reads response.grading?.[question.id]?.rubricScores
  → Emits level label + points per criterion (or empty if not rubric-graded)
  → Sheet uploaded to Drive
```

### Rubric sharing

```
Teacher clicks "Share this rubric" from RubricBuilderPanel
  → useRubrics.shareRubric(rubricId)
  → Reads rubric from library
  → Writes to /shared_rubrics/{newShareId} with originalAuthor, sharedAt
  → Returns shareId; UI surfaces as copyable URL or share-code dialog
Recipient pastes rubric share link/code
  → useRubrics.importSharedRubric(shareId)
  → getDoc from /shared_rubrics/{shareId}
  → Strips originalAuthor/sharedAt; mints new id; writes to /users/{uid}/rubrics/{newId}
  → Rubric appears in recipient's builder library
```

---

## 10. Build sequence

### Phase 3-A — Types + Firestore foundation (independently shippable)

- [ ] Add `Rubric`, `RubricCriterion`, `RubricLevel`, `SharedRubric` to `types.ts`
- [ ] Add `rubricId?` and `rubricSnapshot?` to `QuizQuestion` in `types.ts`
- [ ] Add `/users/{userId}/rubrics/{rubricId}` rules block to `firestore.rules`
- [ ] Add `/shared_rubrics/{shareId}` rules block to `firestore.rules`
- [ ] Write `tests/rules/firestore-rules-rubrics.test.ts` and verify with `pnpm run test:rules`
- [ ] Run `pnpm run type-check` — no new errors expected (new optional fields on existing types)

### Phase 3-B — CSV utilities (independently shippable, no UI dependency)

- [ ] Create `/utils/rubricCsv.ts` with `parseRubricCsv` and `rubricToCsv`
- [ ] Create `/public/templates/rubric-template.csv`
- [ ] Write `tests/utils/rubricCsv.test.ts` and verify all cases pass
- [ ] Extend `ExportableQuestion` and `ExportableResponse` in `assignmentExportShared.ts`
- [ ] Implement rubric-column logic in `buildResultsSheetData`
- [ ] Write `tests/utils/assignmentExportShared.rubricColumns.test.ts`
- [ ] Run `pnpm run validate` — green

### Phase 3-C — `useRubrics` hook

- [ ] Create `/hooks/useRubrics.ts` with full CRUD + share/import surface
- [ ] Write `tests/hooks/useRubrics.test.ts` (mock Firestore, test state transitions)
- [ ] Verify hook exports are type-correct (`pnpm run type-check`)

### Phase 3-D — Builder UI (`RubricBuilderPanel`)

- [ ] Create `/components/widgets/QuizWidget/components/RubricBuilderPanel.tsx`
- [ ] Modify `QuizEditorDetailPane` in `QuizEditor.tsx` to mount the panel
- [ ] Write `tests/components/quiz/RubricBuilderPanel.test.tsx`
- [ ] Manual smoke-test: open quiz editor, add short question, build a 3-criterion rubric, attach, save
- [ ] Run `pnpm run validate`

### Phase 3-E — Grader integration (`RubricScoringPanel`)

- [ ] Create `/components/widgets/QuizWidget/components/RubricScoringPanel.tsx`
- [ ] Modify `WrittenResponseGrader.tsx` to mount panel, track draft scores, include in grade object
- [ ] Write `tests/components/quiz/RubricScoringPanel.test.tsx`
- [ ] Write `tests/components/quiz/WrittenResponseGrader.rubricScores.test.tsx` — 4 tests: no rubric = no panel; rubric panel mounts; level selection auto-fills points; rubricScores included in onSaveGrade call
- [ ] Manual smoke-test: run a quiz with a rubric-attached question, open grader, select levels, save, verify Firestore document contains `rubricScores` array
- [ ] Run `pnpm run validate`

### Phase 3-F — Sharing UI + link flow

- [ ] Add "Share rubric" button + copyable link/code to `RubricBuilderPanel`
- [ ] Add "Import from link" entry point in `RubricBuilderPanel` library list (or in a thin `RubricImportModal`)
- [ ] Wire `useRubrics.shareRubric` and `useRubrics.importSharedRubric`
- [ ] Run `pnpm run validate`

---

## 11. Testing strategy

### Unit tests (Vitest)

- `rubricCsv.test.ts` — pure parser/serializer, no mocking
- `assignmentExportShared.rubricColumns.test.ts` — pure function, no mocking
- `useRubrics.test.ts` — mock `@/config/firebase` db (consistent with `useSyncedQuizGroups.test.ts` patterns)
- `RubricBuilderPanel.test.tsx` — mock `useRubrics` hook; test render, add/remove criterion, CSV import flow, attach callback
- `RubricScoringPanel.test.tsx` — pure component; test level selection, derived points, hydration, empty state
- `WrittenResponseGrader.rubricScores.test.tsx` — extend the existing grader test approach

### Firestore rules tests (Vitest + emulator, `pnpm run test:rules`)

- `firestore-rules-rubrics.test.ts` — owner CRUD on `/users/{uid}/rubrics/`, cross-user rejection, `shared_rubrics` create/get/delete author gates
- Note: carry-over from Phase 1 — student write rejection on `grading.*` (including `rubricScores`) should be added to this file since it now touches the rules in the same PR

### Integration / smoke-test

- No new E2E Playwright tests required for Phase 3 (per the doc's own scope notes). The Phase 1 carry-over Playwright test (pause-then-resume) is still deferred; don't add it to Phase 3 scope.

---

## 12. FERPA, cost, and security considerations

### FERPA

Rubric content itself is not student PII — it is teacher-authored scoring criteria. `WrittenAnswerRubricScore` entries (which level a student was scored at) live under `QuizResponse.grading`, already inside the per-student response doc. Access rules governing student response data are unchanged. No new PII surface is introduced.

The `shared_rubrics` collection contains only teacher-authored content. No student PII is embedded in rubric criteria or levels. Export of rubric columns to Google Sheets puts student rubric scores alongside existing grade data — same FERPA posture as the existing Drive export.

### Firestore reads/writes cost

- `/users/{uid}/rubrics/` is read once on builder mount via `onSnapshot`. Expected rubric count per teacher is small (5–50). A 1KB rubric × 50 = 50 KB of subscription data — negligible.
- `shared_rubrics` writes are infrequent (on share action, not on grading).
- Rubric scoring writes land on the existing `QuizResponse` doc at grading time — same field-path update that `WrittenResponseGrader` already uses. Adding `rubricScores` to the `grading.{questionId}` map increases the per-grade write payload by 200–400 bytes per criterion scored. For a 4-criterion rubric on a 24-student class: ~10 KB of additional Firestore write per class period. Negligible.

### Bundle size

`useRubrics` and `rubricCsv` are small (< 5 KB each). `RubricBuilderPanel` and `RubricScoringPanel` are loaded as part of the quiz widget chunk, which is already lazily loaded (`WidgetRegistry.ts` uses `lazyNamed`). No new lazy chunk is needed — rubric components can be co-located with and imported directly by `WrittenResponseGrader` and `QuizEditor`.

### Security

- Rubric library is owner-only. No new cross-user data access.
- `shared_rubrics` follows the `shared_quizzes` posture (authenticated get-by-id, author-owns write/delete). The rubric content is teacher-authored and non-sensitive; public-GET risk is the same as sharing any quiz.
- The `rubricSnapshot` embedded in `QuizQuestion` travels through `QuizData` → Drive JSON. Drive files are teacher-owned; no change in exposure.
- Student write gate for `rubricScores` under `grading.*` is already enforced by the existing `affectedKeys().hasOnly([...])` whitelist in `firestore.rules:3519` — `grading` is not in the list, so `grading.{qid}.rubricScores` is automatically denied to students. The rules comment at line 3503 already explicitly names `rubricScores` in the "deliberately absent" list.

---

## 13. Risk flags

**Risk 1 — `QuizQuestion` size growth.** A rubric with 5 criteria × 4 levels, each with a 100-character description, adds ~3–4 KB to a `QuizQuestion` object. The `QuizData` with 10 written questions each carrying a rubric could approach 50 KB. Firestore docs have a 1 MB limit; this is far below it. Drive JSON files have no Firestore limit. Monitor if teachers build very large rubrics (10+ criteria), but no mitigation is required now.

**Risk 2 — Rubric snapshot divergence.** When a teacher edits a rubric in their library after attaching it to a question, the question's `rubricSnapshot` is stale. The grader uses the snapshot, not the live library doc. The builder should surface a "Your library rubric has changed since you attached it — re-attach to use the updated version?" notice when `rubricSnapshot.updatedAt < libraryRubric.updatedAt`. This is a Phase 3-D builder concern, not a data-integrity concern.

**Risk 3 — Points mismatch between rubric sum and `question.points`.** A 4-criterion rubric with max 4 pts each = 16 max rubric points, but the question has `points: 10`. The grader caps `pointsAwarded` at `maxPoints` per the existing clamping logic. The builder should warn when rubric max-sum ≠ `question.points` and offer to sync them. This is a UX concern — the data model handles it correctly already (`pointsAwarded` is always clamped).

**Risk 4 — CSV import parsing divergence.** The rubric CSV parser is a new independent implementation rather than reusing the existing `csvImport.ts` internals directly (which are invitation-specific). If the RFC-4180 tokenizer in `csvImport.ts` is refactored or fixed in the future, `rubricCsv.ts` would need a parallel fix. Mitigation: add a comment in both files noting the shared RFC-4180 logic and consider extracting to a shared `utils/csv.ts` as part of Phase 3-B.

**Risk 5 — Export column count.** A 6-criterion rubric on 3 written questions produces 6×2×3 = 36 additional columns in the Drive export sheet, on top of existing columns. Google Sheets has a 18,278-column limit; this is not a practical risk. However, the sheet may become hard to scan visually. Future mitigation: a "rubric detail" tab vs "summary" tab split in the Drive export. Not required for Phase 3.
