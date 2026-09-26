# Paper Answer Sheets — Implementation Plan

**Date**: 2026-09-17 · **Branch**: `dev-paul` · **Status**: Draft for product-owner review. The decisions in §2 were settled in a design interview on 2026-09-17, and no code has been written. File paths were verified against `dev-paul` at `50c6ffb82`; re-verify them before relying on them.

A Scantron replacement built on the existing Quiz foundation. Teachers print personalized bubble answer sheets from a roster, give a paper test, scan the whole stack as one PDF, and import it. Extracted answers become ordinary `QuizResponse` documents, so the results table, every visualization, publish-to-student and the PLC learning-target rollups all work with no new reporting code.

---

## 1. Problem statement

- Scantron costs money per form and per reader, and its output does not reach any of the analysis SpartBoard already does. Paper tests are still the norm for common assessments, make-ups, and any setting where devices are not workable.
- Paper results today cannot reach the gradebook, the item analysis, or the PLC standards rollups at all — they are hand-entered or not entered.
- The pieces that already exist and are reused here:
  - **PDF rasterization**: `pdfjs-dist` is a client dependency, loaded dynamically at `components/quiz/QuizStimulusView.tsx:376`.
  - **OCR**: `tesseract.js` is a client dependency, used in `components/widgets/Webcam/Widget.tsx:21`. Needed only by Increment 3.
  - **Printing**: `exportPdf` in `components/widgets/DrawingWidget/exportCanvas.ts:166` builds HTML in a new window and calls `print()`. Its header (`:8-13`) documents the deliberate refusal to add a PDF library: "NO new dependency: jspdf and friends cost ~250KB minified and the OS printer's 'Save as PDF' output is universally available."
  - **Rosters**: `ClassRosterMeta` metadata in Firestore at `users/{uid}/rosters/{rosterId}` (`types.ts:138`); student names and PINs live only in a Drive JSON file under `Data/Rosters` (`hooks/useRosters.ts:369`). PINs are sequential, zero-padded, unique **per roster** (`utils/rosterPins.ts:17`), so every lookup keys on `(classPeriod, pin)`.
  - **Name resolution**: `buildPinToNameMap` (`components/widgets/QuizWidget/utils/quizScoreboard.ts:461`) and `resolveResponseDisplayName` (`components/widgets/QuizWidget/utils/resolveDisplayName.ts:39`) already render `pin-` keyed responses with real names pulled from Drive.
  - **Identity**: the `pin_index` sidecar at `users/{uid}/rosters/{rosterId}/pin_index/{indexKey}` maps `(period, pin)` → `classlinkSourcedId` (`functions/src/studentIdentity.ts:963`), and `getPseudonymsForAssignmentV1` (`functions/src/studentIdentity.ts:595`) derives a `studentUid` from a sourcedId.
  - **Student pointers**: `/student_assignments/{studentUid}/items/{assignmentId}`, writable only by `setAssignmentTargetsV1` (`functions/src/studentAssignmentTargets.ts`); clients are blocked at `firestore.rules:3297`.
  - **Publishing**: `publishAssignmentScores` (`hooks/useQuizAssignments.ts:2510`) — client-side, not a Cloud Function. It grades every response against the Drive quiz and flips publication flags on both the assignment and session docs.

### 1.1 Constraints found during the interview

These shaped the decisions and are easy to re-derive wrongly later:

- **No teacher-side or server-side path manufactures response docs today.** The only writers of `quiz_sessions/{id}/responses/*` are the student app, teacher grading/finalize, and `functions/src/finalizeIdleQuizAttempts.ts`. The Cloud Function in §7 is genuinely new ground.
- **Students can only view results for a response keyed to their auth UID.** `subscribeForReview` (`hooks/useQuizSession.ts:3363`) hard-fails when `responses/{uid}` is missing and rejects anonymous users outright. A `pin-` keyed response grades and visualizes correctly but is invisible to the student.
- **`publishAssignmentScores` does an `update` on the assignment doc**, so paper import must create both an assignment and a session (they are 1:1, same id — `hooks/useQuizAssignments.ts:958`).
- **The editor refuses to save a quiz with zero questions** (`components/widgets/QuizWidget/components/QuizEditorModal.tsx:377`) and also requires non-empty question text and a non-empty `correctAnswer` for MC (`:385-392`). `saveQuiz` itself validates nothing, and several non-editor callers already write quizzes directly.
- **There is no QR library in this repo.** Every QR is an `<img>` pointing at `api.qrserver.com` (`components/widgets/QRWidget/Widget.tsx:73`). No decoder exists at all.
- **There are zero `@media print` styles in the codebase.**
- **True/False is not a question type.** `QuizQuestionType` is `'MC' | 'FIB' | 'Matching' | 'Ordering' | 'free-response'` (`types.ts:3361`); T/F is an MC question with one distractor. MC is capped at 4 distractors in the editor UI only (`components/widgets/QuizWidget/components/useQuizEditorState.ts:269`), not at save.
- **Session `mode` is org-wide admin config** with only two values, `'submissions' | 'view-only'` (`types.ts:7991`), frozen onto the doc at creation. Paper sessions are `'submissions'`.
- **Firestore rules cannot be tested locally on this machine** (the emulator crashes); rules ship to shared prod on any `dev-*` push.

## 2. Decisions (locked 2026-09-17)

### 2.1 Scope and identity

| #   | Decision         | Choice                                                                                                                                                                                                                 |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Import scope     | **Match an existing quiz, or key a stub from a bubbled ANSWER KEY sheet.** Question text is never recovered from an answer sheet.                                                                                      |
| Q2  | Student identity | **Pre-printed per-student sheets.** Identity is decoded from a printed marker, never read from student marks. Unassigned spares cover walk-ins.                                                                        |
| Q3  | Result storage   | **Real `QuizResponse` docs**, written by a new Cloud Function so the student-ownership rules at `firestore.rules:3366` stay untouched.                                                                                 |
| Q4  | Processing       | **In the browser.** The scan is rasterized and read locally; nothing is uploaded to Storage and no retention obligation is created. Reversed for written-answer boxes only: see `QUIZ_PAPER_HANDWRITTEN_RESPONSES.md`. |
| Q5  | Question types   | **MC and True/False only.** Other types are excluded from the sheet, and the teacher is told at print time exactly which questions will not be scored from paper.                                                      |
| Q6  | Marker format    | **A custom bit-grid, not QR.** The same pixel-sampling code that reads bubbles reads the marker — no decoder dependency, no third-party call, and cells can be sized for reliability.                                  |
| Q7  | Marker payload   | **Batch id, seat number, page number, checksum.** Never a student id, roster id or quiz id — those are UUIDs, and the batch record already holds them.                                                                 |
| Q8  | Rollout          | **Admin feature permission, ships disabled**, following `admin_settings/classlink_sync` and `admin_settings/plc_note_collab`. One field is the kill switch; no deploy needed to disable.                               |

### 2.2 Printing

| #   | Decision      | Choice                                                                                                                                                                                                                                                                                                           |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q9  | Mechanism     | **HTML + `window.print()`**, following `exportCanvas.ts:166`. No PDF library. Teachers get real printing and OS "Save as PDF" for free.                                                                                                                                                                          |
| Q10 | Entry points  | **Row kebab → "Print answer sheets"** on any quiz, plus a **"Paper test" option on New Quiz** that creates a stub. No tab: paper is reachable, not promoted.                                                                                                                                                     |
| Q11 | Layout        | **Fixed bubble grid**, ~50 questions per page, continuation pages for longer tests.                                                                                                                                                                                                                              |
| Q12 | Page identity | **Every page self-identifies** with its own marker. Pages may arrive shuffled, duplexed, or rescanned individually and still reassemble, because no page depends on its neighbors.                                                                                                                               |
| Q13 | Geometry      | **Registration marks at every page's corners, always.** The reader derives the actual scale/rotation/offset transform from them, then computes bubble positions. Print scale is never trusted.                                                                                                                   |
| Q14 | Choice count  | **One count for the whole sheet**, chosen at print. Works identically for an authored quiz and an empty stub. If an authored quiz's questions vary, default to the largest and name the short rows.                                                                                                              |
| Q15 | Print scope   | **Pick rosters, uncheck individuals, plus unassigned spares.** A spare has no seat encoded and lands in review for the teacher to assign.                                                                                                                                                                        |
| Q16 | Answer key    | **A key sheet rides in the same stack**, labeled ANSWER KEY and flagged in its marker. Not printed when the quiz already has an answer key.                                                                                                                                                                      |
| Q36 | Test paper    | **Print the test paper from SpartBoard** (settled 2026-09-18). The sheet carries only letters, so for an authored quiz the batch records each question's option order (`choiceOrder`) and prints the test from it; import maps a bubbled letter through that order. A stub's options are the letters themselves. |

### 2.3 Import and review

| #   | Decision         | Choice                                                                                                                                                                   |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q17 | Scan input       | **Local file (drag or picker) plus the Drive picker.** A Drive pick still downloads and processes locally — school copiers routinely scan to a Drive folder.             |
| Q18 | Review posture   | **Flag and review the doubtful only.** Confidently-read sheets commit; anything uncertain queues with the cropped image of the exact row beside what was read.           |
| Q19 | Key sheet trust  | **The key sheet is always reviewed before grading runs**, regardless of confidence. One sheet confirmed protects the whole batch.                                        |
| Q20 | Ambiguous marks  | **Recorded `unresponded` with a reason and flagged.** Double-bubbles, incomplete erasures and borderline marks are genuinely unknown; guessing hides a wrong answer.     |
| Q21 | Blank sheets     | **No response written; listed as unused.** A missing row is visible and fixable; a wrongly-issued zero looks like a real failing grade.                                  |
| Q22 | Missing pages    | **Grade what arrived, flag the gap.** Remaining questions are `unresponded` and review names the student and page to go find.                                            |
| Q23 | Re-importing     | **Idempotent per sheet.** Each sheet's marker is unique, so rescanning updates rather than duplicates. Scanning the whole stack twice is harmless.                       |
| Q24 | Administration   | **Chosen at import** — start a new one, or attach to an existing one so paper make-ups and accommodations sit beside digital responses.                                  |
| Q25 | Collisions       | **To the review queue.** A student with both a digital response and a paper sheet is ambiguous — retake, mis-read marker, or a switch mid-test. Both shown side by side. |
| Q26 | Queue durability | **Clean sheets commit immediately; the queue persists.** A 150-sheet stack must not require one uninterrupted sitting, and a closed tab must not mean rescanning.        |
| Q27 | Target tagging   | **On the review screen**, next to the mandatory key confirmation — a screen the teacher must visit anyway.                                                               |

### 2.4 Data and student-facing behavior

| #   | Decision           | Choice                                                                                                                                                                                                  |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q28 | Batch record       | **Firestore, PII-free.** Opaque ids only; names resolve from the Drive roster at import, as `QuizResults` already does.                                                                                 |
| Q29 | Batch lifetime     | **Until the quiz is deleted.** A few hundred bytes is what lets a September stack import in June.                                                                                                       |
| Q30 | Stub contents      | **Placeholder text and a placeholder key.** `Question 1..N` with a placeholder `correctAnswer`, overwritten by the key sheet. The stub is a fully valid quiz from birth — no downstream special-casing. |
| Q31 | Resolved identity  | **Real auth UID where the roster allows it**, via `pin_index` / sourcedId. Those students see published results in My Assignments exactly like a digital quiz.                                          |
| Q32 | Unresolved ident.  | **`pin-{period}-{pin}`**, the existing anonymous-joiner key shape. Renders with the student's real name in every teacher view; no student-side review link.                                             |
| Q33 | Timing fields      | **Responses are flagged paper-sourced.** No speed or streak bonus is computed and tab warnings never apply, so speed-ranked views can exclude paper rows rather than rank them last.                    |
| Q34 | Student visibility | **Invisible until publish.** The session is created without `classIds`, so it never matches the My Assignments class filter and its join code is never a live door. Pointers are written at publish.    |
| Q35 | Stub results view  | **Number and letters, labeled as a paper test** — "Question 12 — you marked C, correct answer A", usable because the student is holding the paper. Question text can be filled in later (§8).           |

## 3. Data model

### 3.1 New collection

`users/{teacherUid}/paper_batches/{batchId}` — PII-free. No student names, no PINs.

```ts
interface PaperSeatAssignment {
  rosterId: string;
  studentId: string;
}

interface PaperBatch {
  id: string;
  quizId: string;
  rosterIds: string[];
  questionCount: number;
  choiceCount: number; // 2..5
  /** Seat number -> roster row. The only identity mapping, and it is opaque. */
  seats: Record<number, PaperSeatAssignment>;
  /** Seats printed without a student, for walk-ins. */
  spareSeats: number[];
  /** Seat carrying the bubbled ANSWER KEY sheet, when one was printed. */
  keySheetSeat?: number;
  pagesPerSheet: number;
  createdAt: number;
}
```

Two corrections made while implementing Increment 1:

- A seat stores `{ rosterId, studentId }`, not a bare student id. Import resolves an
  unmatched student to `pin-{classPeriod}-{pin}`, and a student on two rosters has two
  periods — a bare id could not say which.
- Spares and the key sheet take real seat numbers too, so every printed sheet carries a
  marker no other sheet carries, which is what makes Q23's idempotent re-import work.
  What a seat _means_ stays the batch's job: `spareSeats` and `keySheetSeat` say so.

`keyConfirmedAt` and `pendingReview` land with Increment 2, which is the only thing that
writes them.

Rules: owner-only read/write, mirroring `users/{uid}/rosters/{rosterId}` at `firestore.rules:496`. Deleted with the quiz.

### 3.2 Changed types

- `QuizResponseAnswer` — no change. Ambiguous marks reuse the existing `unresponded` field.
- `QuizResponse` — one new optional field, `paperBatchId?: string`. Its presence is the paper-sourced flag for Q33; absence keeps every existing response untouched.
- `QuizSession` / `QuizAssignment` — no schema change. Paper administrations are ordinary `mode: 'submissions'` docs created without `classIds`.

### 3.3 The marker

A fixed-size grid of high-contrast cells encoding `batchId` (truncated), `seat`, `page`, a key-sheet flag, and a checksum. Decoded by the same sampling routine as the bubbles, after the registration-mark transform is applied. A failed checksum sends the sheet to review rather than guessing.

## 4. Reader (`utils/paperSheetReader.ts`)

Pure, no Firestore, no DOM beyond a canvas. Given an `ImageData` page:

1. Locate the four registration marks; derive the affine transform (Q13).
2. Decode the marker; verify the checksum.
3. Sample each bubble's expected rectangle, producing a fill ratio per cell.
4. Classify each row: one clearly-filled cell → an answer; zero → blank; more than one, or a fill ratio in the ambiguous band → `unresponded` with a reason (Q20).
5. Return per-row results with confidence, plus crop rectangles so review can show the teacher the exact row.

Thresholds live in one exported constant block so field tuning is a single-file change.

## 5. Sheet generation (`utils/paperSheetPrint.ts`)

Builds the HTML document and calls `print()`, following `exportCanvas.ts:166` including its pop-up-blocked error path. Emits one page per `pagesPerSheet` with registration marks, the marker, a human-readable header (student name, class, quiz title, page number), and the bubble grid. Student names are read from the in-memory Drive roster and never persisted anywhere new.

## 6. UI

- **`PaperPrintModal`** — roster picker, per-student checkboxes, question/choice counts, spare count, and the exclusion warning for non-MC questions (Q5). Opened from the row kebab (Q10).
- **"Paper test" on New Quiz** — title, question count, choice count; creates the stub of Q30 via `saveQuiz` directly, bypassing the editor's empty-quiz validation.
- **`PaperImportPanel`** — file/Drive input, per-page progress, then the review queue: key confirmation first (Q19), then exceptions, each with its crop, then target tagging (Q27).

## 7. Cloud Function

`importPaperResponsesV1` (callable). Verifies the caller owns the quiz and that the feature flag is on, resolves seats to identities (`pin_index` → sourcedId → UID where possible, otherwise `pin-{period}-{pin}`), creates or reuses the assignment + session pair, and writes responses idempotently keyed by sheet id. It is the only writer; the strict student-ownership rules are not relaxed.

A second entry point writes `StudentAssignmentPointer` docs at publish time so paper results become visible (Q34).

## 8. Delivery (stacked PRs into `dev-paul`)

1. **Print** — `paperSheetPrint.ts`, the batch model and rules, `PaperPrintModal`, the "Paper test" stub path, kebab entry. Writes no grades. Verifiable end to end by printing real sheets on a real copier and measuring them.
2. **Import** — `paperSheetReader.ts`, `PaperImportPanel`, the review queue, `importPaperResponsesV1`, the admin flag. The half that touches grades, and it lands only after the physical half is proven.
3. **Extraction** — optional OCR of the uploaded test paper to fill stub question text via `tesseract.js`. Cannot affect grading: the key comes from the bubbled key sheet and scores come from bubbles, so a misread can only mislabel. Reviewed before it lands.

### 8.1 Status (2026-09-18)

Increments 1 and 2 shipped (#3100–#3113, #3118). The items deferred from #3108 and
Increment 3 landed together in one PR:

- **Q34** — `publishPaperResultsV1` writes a `/student_assignments` pointer for every
  paper response keyed by a pseudonym after the teacher publishes scores; `pin-` keyed
  responses are counted and reported, never pointed at. `importPaperResponsesV1` marks
  the assignment `hasPaperResponses`, and the client-side grading pass also counts
  `paperBatchId` rows, so imports that predate the flag still get linked. A paper-only
  administration stays `paused` from creation (so the quiz-delete guard keeps blocking)
  and the function ends it when results are published, so a pointer leads straight to
  the review screen instead of a paused-session placeholder. Responses whose pin index
  has an identity but no class are reported separately as `unplaced`.
- **Q26** — the review is parked on the batch as `pendingReview` (compact: choices and
  doubt reasons only) whenever it changes; row crops stay in that browser's IndexedDB.
  The import modal offers Resume / Discard, and a review whose seats or rows no longer
  fit the batch is ignored. Sheets still commit in one import step rather than as they
  are read, so the key confirmation (Q19) keeps guarding every graded row.
- **Q27** — a Learning targets section on the review screen tags rows singly or all at
  once with the existing `TargetPicker`; tags save with the key.
- **Q17** — "Pick the scan from Google Drive" via the Picker's new `scans` mode
  (PDF + page images); the bytes download and are read locally like a chosen file.
- **Increment 3** — "Read questions from test paper" in the row kebab OCRs a PDF or
  image with `tesseract.js` (loaded on demand), parses numbered questions, and proposes
  text per row; placeholder rows are ticked by default, real text never replaces without
  a tick. Scores are untouched by construction.

## 9. Known risks

- **The bit-grid has no field testing.** It is the most likely thing to need real iteration, which is why Increment 1 stands alone.
- **Print fidelity across copiers is unverified.** Registration marks are the defense; whether they suffice is an empirical question for Increment 1.
- **`window.print()` with 150 personalized sheets is untested at that volume** — pop-up blocking and memory are both plausible failure modes.
- **The ClassLink UID resolution path has been read, not exercised.**
- **Rules for `paper_batches` cannot be tested locally** and deploy to shared prod on a `dev-*` push.

## 10. Out of scope (v1)

- Reading question text to **create** a quiz (only enrichment of an existing stub, §8.3).
- Capturing written-response regions as image artifacts. Now planned in `QUIZ_PAPER_HANDWRITTEN_RESPONSES.md`, which reverses Q4 for written boxes only.
- Matching and Ordering questions on paper.
- Per-question choice counts on a single sheet (Q14).
- Any student-side view for `pin-` keyed paper responses (Q32).
