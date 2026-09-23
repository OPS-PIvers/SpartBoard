# Quiz Results: printable student copies and bubble-sheet reprints

Grilled and settled 2026-09-23, with a second grilling pass the same day (Q1–Q13 below). This doc is the plan only; no code has shipped. Two phases, each its own PR to dev-paul, behind the new `quiz-results-print` global feature.

## Goal

A teacher prints quiz results to hand back to students, choosing what each copy shows:

- just the student's responses
- responses with correct/incorrect marked
- responses with the correct answers shown
- with or without the questions
- for students who took the quiz on paper, their actual bubble sheet redrawn with the same options

## Current-state facts that drove the decisions

- A one-student print already exists. `StudentDrilldownPanel.handlePrint` in `components/widgets/QuizWidget/components/QuizResults.tsx` calls `printStudentReport` in `utils/quizStudentReportPrint.ts`. It has one "Include correct answers" checkbox and cannot print in bulk.
  - It prints the name `resolveShownName` returns, so it masks names when `hideNames` is on.
  - It renders no stimuli and does not pass `awaitImages`.
- That report is built from `computeStudentDrilldown` (`utils/quizStudentDrilldown.ts`):
  - `StudentQuestionLine.correctAnswerText` is filled only for wrong or partial auto-graded answers.
  - Free-response HTML is flattened to plain text with `htmlToPlainText`.
  - It never lists MC options; it only formats the chosen answer string.
  - It has no submitted date (`QuizResponse.submittedAt` does) and no mastery (that comes from `computeTargetStats` → `targetStats.byStudent` in `QuizResults.tsx`).
- All printing goes through `utils/printHtmlDocument.ts`: it opens an `about:blank` pop-up, `document.write`s the page, calls `print()`, and closes on `afterprint` (60 s fallback). The repo has no PDF library, by design (`QUIZ_PAPER_ANSWER_SHEETS.md` Q9).
  - It waits for images only with `awaitImages: true` and never waits for fonts. There is no async hook before `print()`.
  - No CSP blocks inline scripts in the pop-up. Callers set their own `@page` (the report uses letter, `16mm 18mm` margins).
  - Nothing in the repo measures printed page counts or pads for duplex.
- Correctness is always computed live, never stored:
  - `gradeAnswer` (`hooks/useQuizSession.ts`), `makeQuestionGradeFn` (`utils/quizQuestionStats.ts`) and `utils/mediaGrading.ts` do the grading.
  - `QuizResponse.score` is `null`.
- Question types are `MC | FIB | Matching | Ordering | free-response`. True/False is an MC question.
  - Question `text` is plain text with no math.
  - Images come from stimuli: `question.stimulusIds` → `QuizData.stimuli` (image, pdf, audio, video, youtube, gdoc-embed, text).
  - MC has one correct answer and is all-or-nothing. Partial credit exists only for Matching and Ordering.
- A free-response answer is sanitized rich HTML. `WrittenAnswerGrade` carries:
  - `pointsAwarded`, `overallComment`, `rubricScores`
  - `gradingSnapshot`, a sanitized HTML snapshot
  - `annotations`, whose `from`/`to` index the `htmlToPlainText` projection of `gradingSnapshot` (block tags and `<br>` count as one `\n`). With `annotationUnit: 'ms'` they are milliseconds into an audio take instead.
  - `renderAnnotatedSnapshot` (`utils/writtenAnnotations.ts`) walks the HTML DOM and returns React nodes, not a string.
- Paper responses:
  - They are normal `QuizResponse` docs with `paperBatchId` and `paperSeat`; each `answer` is the option text.
  - Scans are never stored, and neither are bubble fill ratios.
  - The batch at `users/{uid}/paper_batches/{batchId}` (`PaperBatch`) keeps:
    - `seats` (seat → student)
    - `choiceOrder[questionId]`, the per-batch shuffled option order (seeded on `${batchId}:${q.id}`; True/False stays fixed)
    - `pagesPerSheet` and `columnsPerPage`
- Sheet geometry has a single source of truth in `utils/paperSheetLayout.ts`.
  - `utils/paperSheetPrint.ts` builds blank sheets; the bubbles are `.bub` divs, and nothing draws a filled bubble.
  - Bubble letters are always A–E in fixed positions; `choiceOrder` shuffles the option text on the test paper, not the sheet.
  - The sheet header pre-prints the roster name for seat sheets and `Name ____` for spare seats.
  - Only MC questions go on sheets (`analyzePaperQuiz`, `utils/paperSheetPlan.ts`).
- Online MC options are shuffled per student at run time, and that per-student order is not stored. It is seeded on `${studentUid}:attempt-${completedAttempts}:${q.id}` over an already-shuffled session order, and the attempt counter moves on submit, so rebuilding it is unreliable. A bubble sheet for an online response could not match what the student saw.
- A response stores no student name. `resolveResponseDisplayName` (`components/widgets/QuizWidget/utils/resolveDisplayName.ts`) tries the ClassLink name, then the roster PIN name, then falls back to `PIN <pin>` or `Student`.
- The Results students list is always sorted by score, highest first, with no sort UI. It shows joined and in-progress responses as well as completed ones. `periodFilter` defaults to `'all'`.
- Only the latest attempt survives: a rejoin resets `answers`. There is no attempt history to print.
- `QuizResults` has a multi-select bulk bar (`components/results/StudentResultsBulkBar.tsx`) and a `hideNames` toggle kept in localStorage.
  - It is also mounted for PLC teammates with `plcView` (`components/plc/assignments/PlcQuizSessionContent.tsx`), which never shows names.

## Decisions

### Scope and output

- **D1.** The primary purpose is a copy to hand back to students. Each student's section starts on a new page.
- **D2.** One print job covers every student the Results list shows in the current period filter, all ticked by default: completed, in-progress and joined (Q7, Q10). A joined student with no answers prints every question as unanswered, and unfinished scores read "so far". The teacher can untick students to print fewer.
- **D2a.** Students print in period order, then by last name and first name, whatever the on-screen sort (Q2).
- **D2b.** When the job covers more than one period, a separator page prints before each period's group, showing the period name, quiz title and student count. It always gets a blank back so the next student starts on a fresh sheet. There is no toggle (Q3, Q5).
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

  | Preset                 | Questions | Answers | ✓/✗ marks | Key            | Score | Targets + comment box | Free-response feedback | Passages & images | Double-sided padding | Layout |
  | ---------------------- | --------- | ------- | --------- | -------------- | ----- | --------------------- | ---------------------- | ----------------- | -------------------- | ------ |
  | Student copy (default) | on        | on      | on        | off            | on    | on                    | off                    | off               | on                   | Report |
  | Graded copy            | on        | on      | on        | missed only    | on    | on                    | on                     | off               | on                   | Report |
  | Responses only         | on        | on      | off       | off            | off   | off                   | off                    | off               | on                   | Report |
  | Answer key review      | on        | on      | on        | every question | on    | off                   | off                    | off               | on                   | Report |
  | Bubble sheet           | —         | —       | on        | off            | on    | off                   | off                    | —                 | on                   | Sheet  |

- **D9.** The toggles:
  - include questions
  - mark right/wrong
  - show key: off / missed only / every question
  - show score
  - class/period + date
  - learning-target mastery
  - teacher comment box
  - free-response feedback (score + comment, rubric, annotations)
  - include passages & images (Q8)
  - double-sided padding (Q11)
  - layout: Report / Bubble sheet / Both
- **D10.** A live preview in an iframe of the first selected student's pages, built by the same HTML builder and updated as toggles change. When `hideNames` is on, the preview shows the masked "Student N"; only the print pop-up shows real names (Q13).
- **D11.** The last preset and toggles are remembered per browser in localStorage. Wrap the reads and writes in try/catch, following the `hideNames` pattern. No Firestore writes.
- **D12.** Ungraded work does not block printing.
  - An ungraded free-response prints "Not yet graded", and the score reads "x / y so far".
  - The modal shows a banner counting the selected students with ungraded responses.
  - Unpublished results can still be printed; the teacher decides when to hand them back.
  - When the key is on and the session is still live or any listed student hasn't completed, a banner warns "N students haven't finished — printed keys may circulate." Printing is never blocked (Q4).

### Report content

- **D13.** Every student's header shows:
  - their full name, always, ignoring on-screen `hideNames` (the modal's student list and preview still respect it while the board is projected)
  - when no real name resolves (`PIN <pin>` / `Student` fallback), a blank "Name: **\_\_\_\_**" line with "PIN 1234 · Period 3" under it, for the teacher to write in. The modal counts these ("N students have no roster name") (Q6).
  - the quiz title
  - the score and percent (when on)
  - the class/period and date submitted (when on)
- The learning-target mastery table and a ruled blank teacher-comment box print after the questions (when on).
- **D14.** How MC prints with questions on:
  - Every option is listed, and the student's pick is highlighted.
  - Marking puts ✓ or ✗ on the student's own pick only. The correct option is marked only when the key is on, so "key off" never reveals an answer, on any question type (Q1).
  - Paper students see options in their batch's `choiceOrder`, lettered A–E to match their test paper and sheet. Online students see authoring order with no letters, since their shuffled order can't be rebuilt (Q9).
  - With questions off, only the chosen answer text prints.
- **D15.** With the key on, "missed only" shows the correct answer on wrong or partial questions only; "every question" shows it on all of them. `computeStudentDrilldown` must therefore carry `correctAnswerText` for every auto-graded line, and the old report keeps its current behaviour by filtering.
- **D16.** Matching, Ordering and FIB show each part:
  - Matching: one line per pair with its own ✓/✗, plus the correct match when the key is on.
  - Per D14, marks alone never show the correct part; that needs the key.
  - Ordering: the student's order beside the correct order.
  - FIB: the typed answer beside the accepted answer.
  - Partial-credit points are shown.
- **D17.** Free-response prints:
  - the formatted answer (sanitized HTML kept, not flattened)
  - points and the overall comment
  - rubric criterion levels, points and notes
  - inline annotations as highlighted spans with numbered footnote comments, rendered from `gradingSnapshot` + `annotations`
  - Audio answers print "[audio response]", and `annotationUnit: 'ms'` annotations are skipped.
  - Rendering: the DOM walk in `renderAnnotatedSnapshot` is pulled out into a pure function that returns segments. `AnnotatedResponseView` and a new HTML-string renderer both consume it, so screen and print cannot drift. No `react-dom/server` (Q12).
- **D17a.** With "include passages & images" on, image and text stimuli print once per student, before the first question that uses them. PDF, audio, video, YouTube and Google Doc stimuli print a one-line label. The print passes `awaitImages` (Q8).
- **D18.** Bank quizzes and per-student overrides print only the questions that student was served (`servedQuestionIds`), in drill-down order.
- **D19.** Marks are black-and-white safe: ✓/✗ glyphs and weight, with colour as extra only.

### Pagination

- **D20.** Each student always starts on a fresh sheet. With "double-sided padding" on (the default in every preset), a blank page is added after any student, or period separator, whose output has an odd page count, so double-sided copies stay aligned. The toggle is an escape hatch for a printer that disagrees with the measurement (Q11).
  - Reports flow freely, so their page count cannot be known exactly from HTML. `printHtmlDocument` gains an async `beforePrint` hook. It awaits `document.fonts.ready` and image decode, then measures each student's block by where its page-break markers land (so `break-inside: avoid` pushes are counted) against the printable page height at print CSS, and inserts a `break-before: page` blank page where the count is odd.
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

- `utils/quizStudentDrilldown.ts`: carry `correctAnswerText` for every auto-graded line, per-option data for MC (all options, student pick, correct option), per-part data for Matching/Ordering, free-response `answerHtml` + the grade (comment, rubric, annotations, snapshot), `stimulusIds`, and `submittedAt`. Mastery is passed in from `targetStats.byStudent`. For paper responses, MC option order comes from the batch's `choiceOrder` (so the batch loads in Phase 1 too).
- `utils/printHtmlDocument.ts`: an async `beforePrint(win)` hook that runs after fonts and images are ready.
- `utils/writtenAnnotations.ts`: extract the segment function; `renderAnnotatedSnapshot` and a new `annotatedSnapshotToHtml` both use it.
- `utils/quizStudentReportPrint.ts`: add `QuizResultsPrintOptions` and a multi-student `buildResultsPrintHtml(jobs, options)` with the period/name sort, period separators, no-name header, stimuli, and the page-parity padding step. Keep `printStudentReport` as a thin wrapper for the flag-off path.
- New `utils/quizResultsPrintPresets.ts`: the preset table, `applyPreset`, and localStorage load/save.
- New `components/widgets/QuizWidget/components/ResultsPrintModal.tsx`:
  - built on `Modal` + `Toggle`, following `PaperPrintModal`
  - the student checklist
  - the warning banners (ungraded, online-fallback, unfinished-with-key, no roster name)
  - the preview iframe (`srcdoc` from the same builder)
- `QuizResults.tsx`: the header Print button, the per-student panel routing to the modal, all behind `canAccessFeature('quiz-results-print')` and `!plcView`.
- `StudentResultsBulkBar.tsx`: a "Print selected" action.
- Flag wiring: `types.ts`, `config/featureDefaults.ts`, `GlobalPermissionsManager.tsx`.
- Tests:
  - builder snapshot/structure tests for each preset and each question type, including "key off never marks the correct option", paper letters vs online no-letters, sort order and period separators, the no-name header, and stimuli on/off
  - an annotation segment test shared by the React and HTML renderers (including `ms` annotations skipped)
  - a preset/storage unit test
  - modal tests for entry-point preselection (everyone listed and ticked), the PLC hide, each banner, and the masked preview name
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
