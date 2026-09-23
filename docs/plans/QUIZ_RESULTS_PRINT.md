# Quiz Results: printable student copies and bubble-sheet reprints

Grilled and settled 2026-09-23. This doc is the plan only; no code has shipped. Two phases, each its own PR to dev-paul, behind the new `quiz-results-print` global feature.

## Goal

A teacher prints quiz results to hand back to students, choosing what each copy shows:

- just the student's responses
- responses with correct/incorrect marked
- responses with the correct answers shown
- with or without the questions
- for students who took the quiz on paper, their actual bubble sheet redrawn with the same options

## Current-state facts that drove the decisions

- A one-student print already exists. `StudentDrilldownPanel.handlePrint` in `components/widgets/QuizWidget/components/QuizResults.tsx` calls `printStudentReport` in `utils/quizStudentReportPrint.ts`. It has one "Include correct answers" checkbox and cannot print in bulk.
- That report is built from `computeStudentDrilldown` (`utils/quizStudentDrilldown.ts`):
  - `StudentQuestionLine.correctAnswerText` is filled only for wrong or partial auto-graded answers.
  - Free-response HTML is flattened to plain text with `htmlToPlainText`.
- All printing goes through `utils/printHtmlDocument.ts`: it opens a pop-up, calls `print()`, and closes itself. The repo has no PDF library, by design (`QUIZ_PAPER_ANSWER_SHEETS.md` Q9).
- Correctness is always computed live, never stored:
  - `gradeAnswer` (`hooks/useQuizSession.ts`), `makeQuestionGradeFn` (`utils/quizQuestionStats.ts`) and `utils/mediaGrading.ts` do the grading.
  - `QuizResponse.score` is `null`.
- Question types are `MC | FIB | Matching | Ordering | free-response`. True/False is an MC question.
  - Question `text` is plain text with no math.
  - Images come from stimuli.
- A free-response answer is sanitized rich HTML. `WrittenAnswerGrade` carries:
  - `pointsAwarded`, `overallComment`, `rubricScores`
  - `annotations`, stored as character offsets into `gradingSnapshot`
- Paper responses:
  - They are normal `QuizResponse` docs with `paperBatchId` and `paperSeat`; each `answer` is the option text.
  - Scans are never stored, and neither are bubble fill ratios.
  - The batch at `users/{uid}/paper_batches/{batchId}` (`PaperBatch`) keeps:
    - `seats` (seat → student)
    - `choiceOrder[questionId]`, the per-batch shuffled option order
    - `pagesPerSheet` and `columnsPerPage`
- Sheet geometry has a single source of truth in `utils/paperSheetLayout.ts`.
  - `utils/paperSheetPrint.ts` builds blank sheets; the bubbles are `.bub` divs, and nothing draws a filled bubble.
  - Only MC questions go on sheets (`analyzePaperQuiz`, `utils/paperSheetPlan.ts`).
- Online MC options are shuffled per student at run time, and that per-student order is not stored. A bubble sheet for an online response could not match what the student saw.
- Only the latest attempt survives: a rejoin resets `answers`. There is no attempt history to print.
- `QuizResults` has a multi-select bulk bar (`components/results/StudentResultsBulkBar.tsx`) and a `hideNames` toggle kept in localStorage.
  - It is also mounted for PLC teammates with `plcView` (`components/plc/assignments/PlcQuizSessionContent.tsx`), which never shows names.

## Decisions

### Scope and output

- **D1.** The primary purpose is a copy to hand back to students. Each student's section starts on a new page.
- **D2.** One print job covers every student who submitted in the current period filter by default. The teacher can untick students to print fewer.
- **D3.** Output is print-ready HTML sent through `printHtmlDocument` (the browser dialog also offers Save as PDF). No PDF dependency.
- **D4.** Extend the existing report; do not start a parallel one.
  - `quizStudentReportPrint.ts` grows into a multi-student, multi-option builder.
  - `computeStudentDrilldown` grows the data it needs.
  - The per-student panel's checkbox is replaced by the new modal.

### Entry points

- **D5.** A visible **Print** button in the `QuizResults` header, beside the overflow menu, available on every Results screen. It opens the modal with all submitted students in the current period selected.
- **D6.** The same modal also opens from:
  - a **Print selected** action on `StudentResultsBulkBar`, with the selection preselected
  - the "Print report" button in each student's panel, with that one student preselected
- **D7.** Hidden when `plcView` is set. Teammates never print another teacher's named student work; the owning teacher prints from their own widget.

### Print modal

- **D8.** Presets plus toggles. A preset sets every toggle, and the teacher can then change any of them.

  | Preset | Questions | Answers | ✓/✗ marks | Key | Score | Targets + comment box | Free-response feedback | Layout |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Student copy (default) | on | on | on | off | on | on | off | Report |
  | Graded copy | on | on | on | missed only | on | on | on | Report |
  | Responses only | on | on | off | off | off | off | off | Report |
  | Answer key review | on | on | on | every question | on | off | off | Report |
  | Bubble sheet | — | — | on | off | on | off | off | Sheet |

- **D9.** The toggles:
  - include questions
  - mark right/wrong
  - show key: off / missed only / every question
  - show score
  - class/period + date
  - learning-target mastery
  - teacher comment box
  - free-response feedback (score + comment, rubric, annotations)
  - layout: Report / Bubble sheet / Both
- **D10.** A live preview in an iframe of the first selected student's pages, built by the same HTML builder and updated as toggles change.
- **D11.** The last preset and toggles are remembered per browser in localStorage. Wrap the reads and writes in try/catch, following the `hideNames` pattern. No Firestore writes.
- **D12.** Ungraded work does not block printing.
  - An ungraded free-response prints "Not yet graded", and the score reads "x / y so far".
  - The modal shows a banner counting the selected students with ungraded responses.
  - Unpublished results can still be printed; the teacher decides when to hand them back.

### Report content

- **D13.** Every student's header shows:
  - their full name, always, ignoring on-screen `hideNames` (the modal's student list still respects it while the board is projected)
  - the quiz title
  - the score and percent (when on)
  - the class/period and date submitted (when on)
- The learning-target mastery table and a ruled blank teacher-comment box print after the questions (when on).
- **D14.** How MC prints with questions on:
  - Every option is listed, and the student's pick is highlighted.
  - With marking on, the correct option gets a ✓ and a wrong pick an ✗.
  - With questions off, only the chosen answer text prints.
- **D15.** With the key on, "missed only" shows the correct answer on wrong or partial questions only; "every question" shows it on all of them. `computeStudentDrilldown` must therefore carry `correctAnswerText` for every auto-graded line, and the old report keeps its current behaviour by filtering.
- **D16.** Matching, Ordering and FIB show each part:
  - Matching: one line per pair with its own ✓/✗, plus the correct match when the key is on.
  - Ordering: the student's order beside the correct order.
  - FIB: the typed answer beside the accepted answer.
  - Partial-credit points are shown.
- **D17.** Free-response prints:
  - the formatted answer (sanitized HTML kept, not flattened)
  - points and the overall comment
  - rubric criterion levels, points and notes
  - inline annotations as highlighted spans with numbered footnote comments, rendered from `gradingSnapshot` + `annotations`
  - Audio answers print "[audio response]".
- **D18.** Bank quizzes and per-student overrides print only the questions that student was served (`servedQuestionIds`), in drill-down order.
- **D19.** Marks are black-and-white safe: ✓/✗ glyphs and weight, with colour as extra only.

### Pagination

- **D20.** Each student always starts on a fresh sheet. After any student whose output has an odd page count, a blank page is added so double-sided copies stay aligned. This is always on; there is no toggle.
  - Reports flow freely, so their page count cannot be known exactly from HTML. Measure each student's block in the print window (`scrollHeight` against the printable page height at print CSS) and add a `break-before: page` blank page where the count is odd.
  - Bubble sheets have a fixed page count (`pagesPerSheet`).

### Bubble-sheet reprint (paper responses only)

- **D21.** Only responses with `paperBatchId` can use the Sheet layout. In a mixed selection, online students fall back to Report, and the modal says how many were affected ("4 students took this online and will get the report").
  - If the batch doc is missing, that student falls back to Report too.
- **D22.** The sheet is redrawn from the batch; no scan is needed.
  - The seat comes from `paperSeat`, and rows from `analyzePaperQuiz` / the sheet row order.
  - Each filled bubble is `batch.choiceOrder[questionId].indexOf(answer)`.
  - `passed` rows print empty, and `paper-unclear` rows print empty with a "?" in the margin.
  - The same geometry and header come from `paperSheetLayout.ts`, so the reprint lines up with the original.
- **D23.** Marks on the sheet:
  - The student's bubble prints solid.
  - With marking on, a ✓/✗ goes in the row margin.
  - With the key on, the correct bubble gets a heavy double ring.
  - The score goes in the header box.
  - The marker grid and registration squares are omitted, so a reprint can never be scanned back in as a real sheet.
- **D24.** Layout **Both** prints the sheet pages first, then that student's report.

### Release

- **D25.** New `GlobalFeature` `'quiz-results-print'` in `types.ts`, and a `FEATURE_DEFAULTS` entry in `config/featureDefaults.ts`:

  ```ts
  { defaultAccessLevel: 'admin', defaultEnabled: true, missingDocPublic: false }
  ```

  - It also needs a descriptor in `components/admin/GlobalPermissionsManager.tsx`.
  - It gates the header button, the bulk action and the modal.
  - With it off, the per-student "Print report" keeps today's single-checkbox behaviour unchanged.
- **D26.** The Sheet and Both layouts also require `paperAnswerSheets.enabled && canAccessFeature('paper-answer-sheets')`, the same gate as `Widget.tsx`. Without it, the layout picker shows Report only.
- **D27.** Admins pass admin gates, so "on for Paul" means Paul plus the other `/admins`.
  - To open it later: Admin Settings > Access > Global Settings > Quiz results printing > set to Public.
  - The changelog entry lands when the flag opens.

## Phases

### Phase 1 — modal, presets, extended report, entry points

- `utils/quizStudentDrilldown.ts`: carry `correctAnswerText` for every auto-graded line, per-option data for MC (all options, student pick, correct option), per-part data for Matching/Ordering, and free-response `answerHtml` + the grade (comment, rubric, annotations, snapshot).
- `utils/quizStudentReportPrint.ts`: add `QuizResultsPrintOptions` and a multi-student `buildResultsPrintHtml(jobs, options)`, plus the page-parity padding script. Keep `printStudentReport` as a thin wrapper for the flag-off path.
- New `utils/quizResultsPrintPresets.ts`: the preset table, `applyPreset`, and localStorage load/save.
- New `components/widgets/QuizWidget/components/ResultsPrintModal.tsx`:
  - built on `Modal` + `Toggle`, following `PaperPrintModal`
  - the student checklist
  - the warning banners
  - the preview iframe (`srcdoc` from the same builder)
- `QuizResults.tsx`: the header Print button, the per-student panel routing to the modal, all behind `canAccessFeature('quiz-results-print')` and `!plcView`.
- `StudentResultsBulkBar.tsx`: a "Print selected" action.
- Flag wiring: `types.ts`, `config/featureDefaults.ts`, `GlobalPermissionsManager.tsx`.
- Tests:
  - builder snapshot/structure tests for each preset and each question type
  - a preset/storage unit test
  - modal tests for entry-point preselection, the PLC hide, and ungraded/online banners
  - update `QuizResults.studentDrilldown.test.tsx` and `quizStudentDrilldown.test.ts`

### Phase 2 — filled bubble-sheet reprint

- `utils/paperSheetPrint.ts`: a filled bubble class, a double-ring key class, margin marks, a header score, and an option to omit the marker grid and registration squares. Factor the page builder so the blank and filled sheets share geometry.
- New `utils/paperSheetReprint.ts`: `(response, batch, quiz, options) → filled sheet pages`, following D22.
- The modal: the layout picker, gated by D26; loading the batch through `paperBatchStore`; the fallback count.
- Tests:
  - answer-to-bubble mapping, including shuffled `choiceOrder`, `paper-unclear` and `passed`, a missing batch, and a two-column / multi-page sheet
  - a check that the geometry matches `paperSheetLayout`
  - a check that reprints carry no marker grid

## Out of scope

- A generated PDF download, or a PDF library.
- Printing from PLC views.
- Bubble sheets for online responses.
- Attempt history (only the latest attempt exists).
- A class-summary or roster-grid printout.
- Storing scans.
