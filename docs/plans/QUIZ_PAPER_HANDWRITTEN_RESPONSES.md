# Quiz paper sheets: handwritten written responses, transcribed for grading

Grilled and settled 2026-09-24 (D1–D26 below). This doc is the plan only; no code has shipped. Five phases, each its own PR to `dev-paul`, behind the new `paper-handwritten-responses` global feature.

## Goal

A teacher prints paper answer sheets that include lined boxes for free-response questions. Students write their answers by hand. When the teacher scans the stack:

1. Each box is cropped.
2. AI transcribes the handwriting into typed text.
3. The written answers land in the existing free-response grader, with the handwriting beside an editable transcript.
4. The teacher grades as usual and returns the work through Publish Scores. Students see their own handwriting (and/or the transcript) in `/my-assignments`.

## 1. Current-state facts that drove the decisions

- **Paper sheets are MC only.** `analyzePaperQuiz` (`utils/paperSheetPlan.ts:124-168`) leaves out free-response and every non-MC type, and lists them for the teacher at print time.
- **Everything is read in the browser.** Scans are rasterized with pdf.js (`utils/paperScanRaster.ts`) and read by pixel sampling (`utils/paperSheetReader.ts`), with no AI involved.
  - Nothing is uploaded: `QUIZ_PAPER_ANSWER_SHEETS.md` Q4.
  - That plan's §10 explicitly excludes capturing written-response regions because it would upload student handwriting.
  - Row crops live only in IndexedDB (`utils/paperCropStore.ts`).
- **Page geometry is exact.** Four corner registration marks give an affine mm→px fit, and pages over 1.5 mm error are rejected (`paperSheetReader.ts:505-513`). Any printed rectangle can be located precisely.
- **The page marker has a spare flag bit.** It carries 2 flag bits, of which only `FLAG_KEY_SHEET = 0b01` is used, plus 6 reserved bits (`utils/paperSheetMarker.ts:13-40`).
- **Lined areas are already printed but never read.** They exist as sheet stimuli (`types.ts:3835-3866`, `utils/paperSheetTemplateSvg.ts`); the type comment says nothing drawn on them is read back.
- **Placeholder questions.** Paper tests without a real quiz use a stub quiz with "Question N" placeholders (`buildPaperStubQuiz`, `paperSheetPlan.ts:330`).
- **The import function writes real `QuizResponse` docs.** `importPaperResponsesV1` (`functions/src/importPaperResponses.ts:542`) does this.
  - It is idempotent per sheet and reports collisions unless `replaceExisting` is set.
  - Paper rows are marked by `paperBatchId` / `paperSeat` (`types.ts:4868-4875`).
- **Free-response grading already exists and is manual.** `FreeResponseGrader.tsx` provides points, an overall comment, highlight annotations anchored to text offsets, and rubric scoring. The data is `QuizResponse.grading[gradingKey]: WrittenAnswerGrade` (`types.ts:5082-5129`).
  - No AI grading exists (`docs/written-response-quiz-questions.md:31`).
- **`/my-assignments` is the student page** (`App.tsx:556`, `components/student/MyAssignmentsPage.tsx`). Teachers grade in Quiz Results inside the widget and return work through Publish Scores (`components/common/library/PublishScoresModal.tsx`, `publishAssignmentScores` in `hooks/useQuizAssignments.ts`). The student review renders in `components/quiz/QuizStudentApp.tsx`.
- **LMS push sends points only**, with no comments: Classroom in `functions/src/classroomAddonAuth.ts`, Schoology in `functions/src/lti/serviceEndpoints.ts`.
- **AI is Gemini on Vertex only** (`functions/src/aiGeneration.ts:52-72`).
  - Models are configurable at `global_permissions/gemini-functions`.
  - Quotas are counted in `ai_usage/{uid}_{date}` and `ai_usage/{uid}_{featureId}_{date}`; the default overall limit is 20 a day and admins are unlimited.
  - Every AI callable rejects student tokens.
- **Student media already has a transit pattern.** An audio take is uploaded to Storage, then `archiveQuizMediaArtifact` (`functions/src/quizMediaArchive.ts:1306`) archives it to the assigning teacher's own Drive with a server-minted token and deletes the Storage copy.
  - Playback goes through a callable, never a public link.
  - Stuck archives are retried by `sweepStuckQuizArchives.ts`, and org admins can review and delete media (`deleteQuizMediaForOrgAdmin.ts`).
  - Types: `ResponseArtifact`, `ArtifactKind` (includes an unused `'whiteboard'`) and `artifactArchive` (`types.ts:4535-4680`, `:4903-4914`).
- **Results printing has shipped**: the hand-back print (#3361, `ResultsPrintModal.tsx`, `utils/quizStudentReportPrint.ts`) and filled bubble-sheet reprints (#3362, `utils/paperSheetReprint.ts`, `buildFilledSheetHtml`).

## 2. Decisions (settled 2026-09-24)

### 2.1 Scope and gating

| #   | Decision           | Choice                                                                                                                                                                                                                              |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Response kinds     | **Short and extended text.** One fixed-height lined box per question, from a few lines up to a full page. Math-to-LaTeX and diagrams are out of scope.                                                                              |
| D2  | AI role            | **Transcription only.** The AI never suggests or assigns a score. The teacher grades every written answer.                                                                                                                          |
| D3  | Question sources   | **Real quizzes and paper-test stubs.** Free-response questions on a quiz get boxes. On a stub, the teacher marks which question numbers are written and picks a box size for each.                                                  |
| D4  | PLC teammate scans | **Whoever imports owns it.** The importing teacher's Drive holds the crops, their AI quota is charged, and they grade their own students, as paper imports already work per teacher.                                                |
| D5  | Flag               | **New `GlobalFeature` `paper-handwritten-responses`**, `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, ANDed with the existing `admin_settings/paper_answer_sheets` + `paper-answer-sheets` gate. |
| D6  | Validation         | **Ship and watch.** After the admin smoke test on dev and prod, Paul decides when to open the flag. There is no formal accuracy gate.                                                                                               |

### 2.2 Printing

| #   | Decision        | Choice                                                                                                                                                                                                                                             |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D7  | Page placement  | **Written-response pages follow the bubble pages** of each student's sheet. Same corner registration marks and page marker; the marker's free flag bit (`0b10`) marks a written page as a cross-check. The batch's stored layout is authoritative. |
| D8  | Box size        | **Per-question `paperLines`** on free-response questions, with presets S / M / L / Full page (3 / 8 / 16 / about 30 lines). Defaults from `maxWords` when set (about 10 words per line), otherwise M. Stubs choose a preset per marked number.     |
| D9  | Packing         | **Boxes never split across pages.** Boxes are placed in question order and a new page starts when the next one doesn't fit. A Full-page box gets its own page.                                                                                     |
| D10 | Box header      | **Number + question text when available.** Quiz-based sheets print `7. <stem>`, shortened to about 3 lines. Stubs print `7.` only. The header sits outside the box so it is never part of the crop.                                                |
| D11 | Stored geometry | **The batch records each written box's rectangle** (page, mm rect, questionId) at print time, so import never recomputes the layout from a quiz that may have been edited since.                                                                   |

### 2.3 Scan, upload, transcription

| #   | Decision        | Choice                                                                                                                                                                                                                                                                                                                 |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D12 | Q4 revision     | **Q4 is deliberately reversed for written boxes only.** Bubble reading stays fully in the browser. Only box crops leave the browser; the page header (student name) and bubble pages never do.                                                                                                                         |
| D13 | Blank detection | **A browser ink check.** Ink ratio inside the box, with the printed rule lines excluded (as the stimulus band is excluded now). A box below the threshold is marked unanswered, with no upload and no AI call. Thresholds join `READER_THRESHOLDS`.                                                                    |
| D14 | Crop format     | Grayscale PNG (or WebP), deskewed through the page transform, about 150 dpi, one file per box.                                                                                                                                                                                                                         |
| D15 | Pipeline        | **Server-side after upload.** During import the browser uploads crops to a Storage transit path, then calls the import function. The function writes the responses and one transcription job per written page. A Firestore-triggered worker runs each job. Import returns immediately, and the tab can close.          |
| D16 | Engine          | **Gemini on Vertex through the existing `aiGeneration` client**, using the configured advanced model. One call per page: all of that page's crops as separate images, returning structured JSON per box (`text`, `uncertainSpans`, `illegible`).                                                                       |
| D17 | Uncertainty     | Unclear words come back as spans. Unreadable words come back as `[illegible]`. Any flagged answer carries a "Check transcript" badge in the grader.                                                                                                                                                                    |
| D18 | Quota           | **A separate per-feature limit counted in pages** (`ai_usage/{uid}_paper-handwriting_{date}`), default 300 a day, admin-configurable in the `gemini-functions` config. Admins unlimited. It is checked at import so the teacher is told in advance. Pages over the limit stay `pending` with a "Transcribe now" retry. |
| D19 | Crop storage    | **Storage in transit, archived to the importing teacher's Drive**, reusing the `archiveQuizMediaArtifact` mechanics (server-minted token, no public link, stuck-archive sweep, org-admin review and delete). Transcription runs before archival deletes the Storage copy.                                              |
| D20 | Rescan          | **Keep graded or edited answers, replace untouched ones.** The import summary lists skipped answers. The grader offers "Use new scan" per answer, which replaces the crop and transcript and clears that answer's grade after confirmation.                                                                            |

### 2.4 Grading

| #   | Decision            | Choice                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D21 | Where               | **The existing Quiz Results → `FreeResponseGrader` → Publish Scores flow.** Paper written answers join the same queue as typed ones. No new teacher page.                                                                                                                                                                   |
| D22 | Review UI           | **Handwriting crop beside an editable transcript.** Uncertain spans are highlighted and the crop can be zoomed. The crop is always the source of truth.                                                                                                                                                                     |
| D23 | Transcript = answer | **The (edited) transcript is the response's answer text**, so annotations, rubrics, back-translation and scoring work unchanged. The raw AI output is kept separately. Editing after annotating warns that affected highlights will be removed. Edits go through a callable, so student-write rules stay untouched (as Q3). |

### 2.5 Returning and printing

| #   | Decision      | Choice                                                                                                                                                                                                                                                                                                           |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D24 | Student view  | **A per-assignment "Written answers show: Handwriting \| Typed \| Both" setting in Publish Scores**, shown only when the assignment has paper written answers and defaulting to Handwriting. Score, comment and rubric show as they do now. Students load crops through a callable scoped to their own response. |
| D25 | Results print | **A written-answers choice in `ResultsPrintModal`**, starting from the assignment's D24 setting (Handwriting if unpublished). Crops are fetched before printing (`awaitImages: true`).                                                                                                                           |
| D26 | Sheet reprint | **Filled-sheet reprints include the written pages**, redrawn with each crop in its box plus points and the teacher's comment in the margin, with no marker or registration marks (as #3362).                                                                                                                     |

LMS push is unchanged: points only.

### 2.6 Question-text sheets (added 2026-09-24)

A batch printed with "Include question text" (`PaperBatch.sheetLayout: 'questions'`, #3404) prints each MC question's stem with its choices listed beneath, each beside its own bubble, in fixed 42 mm slots, 5 to a page (`QUESTION_ROW_PITCH_MM`, `QUESTION_ROWS_PER_PAGE` in `utils/paperSheetLayout.ts`).

| #   | Decision  | Choice                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D27 | Placement | **On a question-text sheet, written boxes print inline, in quiz order, among the MC questions**, so the sheet reads like the test. A written question takes one or more whole slots (its stem, then the lined box), so every MC bubble stays on the fixed slot grid. A box that needs more slots than remain on the page starts the next page, and a Full-page box gets its own page (as D9). |
| D28 | Slot map  | **The batch records which slot holds what**: extend D11 so `writtenBoxes` carry their slots, and add a per-page list of the MC sheet rows each page carries. The reader, `rowsOnPage` and `paperImportAssemble` read the MC rows from that map instead of `questionsPerPage` whenever `writtenBoxes` is present on a `'questions'` batch. Batches without it keep today's arithmetic.         |
| D29 | Numbering | **Question-text sheets number every question by its place in the quiz**, written ones included, so "7." on the sheet, the test paper and the grader all mean the same question. Plain bubble sheets keep numbering MC rows only, with written pages after them (D7).                                                                                                                          |

## 3. Data model

- **`QuizQuestion.paperLines?: number`** (free-response only). Stubs store the same on their placeholder questions, which become `type: 'free-response'` when marked written.
- **`PaperBatch.writtenBoxes?: PaperWrittenBox[]`** with `{ questionId, page, rectMm, lines }`, and **`PaperBatch.pagesPerSheet`** counting the written pages.
- **`QuizResponse.paperWritten?: Record<questionId, PaperWrittenAnswer>`**:
  - `artifactId`: into the existing `artifactArchive`, with a new `ArtifactKind` `'handwriting'`.
  - `transcriptStatus`: `'pending' | 'done' | 'failed' | 'blank' | 'over-quota'`.
  - `rawTranscript`, `uncertainSpans`, `illegibleCount`.
  - `editedBy`, `editedAt`.
  - `scanImportedAt`.
- The answer text for that question is the transcript (D23). It is empty while pending, and the grader shows "Transcribing…".
- **Assignment `writtenReturnMode?: 'handwriting' | 'typed' | 'both'`**, written by Publish Scores.
- **Jobs:** `users/{uid}/paper_transcription_jobs/{batchId}_{seat}_{page}` holds the crop paths, box ids, response key, status and attempts. They are server-only (no client rules beyond owner read for progress).
- **Storage:** `paper_written_crops/{teacherUid}/{batchId}/{seat}/{page}/{questionId}.png`. Only the owning teacher (non-anonymous) may create; size cap about 2 MB; image content types only; no reads. It is deleted after archive.

## 4. Phases

Each phase is its own PR to `dev-paul`, verified on `spartboard-dev`.

### Phase 1: Printing written-response pages

- Add the flag (`types.ts` `GlobalFeature`, `config/featureDefaults.ts`, `GlobalPermissionsManager`).
- Add `paperLines` to the free-response editor, under a "Paper" subsection shown only when the flag passes.
- In the stub builder, let the teacher mark numbers as written with S/M/L/Full.
- `analyzePaperQuiz` includes free-response when the flag passes. The print modal lists them as "written, transcribed" rather than excluded.
- `paperSheetLayout.ts`: box packing (D8–D10). `paperSheetPrint.ts`: render written pages. Marker: flag bit `0b10`. The batch stores `writtenBoxes`.
- The reader and assembler must accept written pages and ignore them for bubble scoring. Before Phase 2 lands, the import summary says "written pages found; transcription coming soon", so a teacher can already print and scan safely.
- Question-text sheets (D27–D29): inline boxes on the slot grid, the per-page MC row map on the batch, and quiz-order numbering.
- Tests: packing (never splits, Full page alone, stems shortened), marker round-trip with the new flag, assembly with written pages present, and a question-text sheet mixing MC slots and inline boxes read back correctly.

### Phase 2: Crop, upload and transcribe

- **Reader:** locate each `writtenBoxes` rect through the page transform, run the ink check (D13) and produce crops (D14).
- **Import modal:** show a per-seat thumbnail of each written box (blank ones marked) during review. After confirmation, upload crops, then call `importPaperResponsesV1` with crop paths. Before upload, run a quota check (D18) and show the page count.
- **`importPaperResponsesV1`:**
  - Write `paperWritten` entries and create transcription jobs.
  - Apply D20 on rescan: an answer with `grading[...]` or `editedAt` is kept, others are replaced.
  - Report the counts.
- **New worker `transcribePaperWrittenPageV1` (onDocumentCreated on jobs):**
  1. Charge quota.
  2. Make one Gemini call with a structured-output schema.
  3. Write the transcripts and answer text to the response.
  4. Archive the crops to Drive through the shared archive helper, extracting the Drive upload from `quizMediaArchive.ts` rather than duplicating it.
  5. Delete the Storage copies.
  - Retries follow the `sweepStuckQuizArchives` pattern. Prompt rules: transcribe verbatim, keep the student's spelling, never correct or complete, mark rather than guess.
- **`storage.rules`:** the transit path (§3). Rules test in `tests/rules/`.
- **Tests:** ink-check thresholds on fixture crops, the import payload, worker JSON parsing and failure states (mock Gemini), and the rescan merge.

### Phase 3: Grading

- Add a callable `getPaperWrittenCropV1`: a teacher reads crops for their own assignment. It reuses the audio playback authorization.
- In `FreeResponseGrader`, when `paperWritten[questionId]` exists:
  - Show the crop panel (zoom) beside the transcript, with uncertain spans highlighted and a "Check transcript" badge.
  - Show "Transcribing…" or "failed / over quota → Retry" states.
  - Transcript edit mode saves through a callable `updatePaperTranscriptV1`, with the annotation-loss warning (D23).
  - Add a "Use new scan" action (D20).
- Add a small "Paper" badge on the response row, since there is none today.
- Tests: grader states, edit warning, and callable auth (owner only, students rejected).

### Phase 4: Returning to students

- Publish Scores: the D24 control, written to the assignment.
- `getPaperWrittenCropV1` also authorizes a student reading their own response's crop, only after scores are published at a level that includes responses.
- `QuizStudentApp` review: render the crop, the transcript or both per `writtenReturnMode`, with the existing comment, annotation and rubric display. Annotations render on the transcript. In Handwriting-only mode the comment and rubric still show, and highlights are listed as comments.
- Tests: each mode, and the unpublished / score-only levels never expose crops.

### Phase 5: Printing results

- `ResultsPrintModal`: the D25 choice. `quizStudentReportPrint.ts` renders the crop image and/or transcript, fetching crops through the callable first.
- `paperSheetReprint.ts` / `buildFilledSheetHtml`: redraw written pages with the crops, points and comment (D26).
- Tests: print HTML snapshot per mode, and a reprint that includes written pages.

### Docs, alongside the phases

- `QUIZ_PAPER_ANSWER_SHEETS.md`: point Q4 and §10 at this plan (Phase 2 PR).
- `docs/gemini-api-terms-audit.md`: add student handwriting crops (and the existing `translateResponseV1` gap) to the student-content section (Phase 2 PR).
- `public/changelog.json`: only when Paul opens the flag to everyone.

## 5. Rollout

- The flag starts at `admin`, so "on for Paul" means Paul plus the other `/admins`.
- Paul tests on `spartboard-dev` with the mock class, then in prod on his own classes. When ready he opens it at Admin Settings > Access > Global Settings > `paper-handwritten-responses` > Public. Agents never open it on prod.
- Existing sheets and batches are unaffected: without the flag, free-response stays excluded as today.
- No new function secrets. Vertex runs under each project's default credentials, and Drive archival uses the existing OAuth refresh path.
- Release compatibility: a teacher's already-open tab running the previous client never prints written pages, so the new import fields are optional and the old import payload stays valid.

## 6. Known risks

- **Copier and handwriting fidelity have not been field-tested.** This adds to the risk already in `QUIZ_PAPER_ANSWER_SHEETS.md` §9. Light pencil can fail the ink check, and writing outside the box is lost. Ship-and-watch (D6) means the teacher's edits are the first signal, so watch the "Check transcript" rate and edit rate once Paul uses it.
- **Student handwriting goes to Vertex.** It is covered by the teacher-only path and the audit update, but it is a new category of student content sent to AI. The district may want to review it before the flag opens.
- **Drive dependency.** A teacher whose Drive token has lapsed gets stuck archives. Transcription still completes, because it runs before archival, and the sweep retries.
- **Quota on large classes.** Several sections scanned in one day can reach 300 pages; the admin can raise the limit.
- **`pin-` keyed responses** still have no student view (existing Q32), so those students only see written work on paper (Phase 5).

## 7. Out of scope

- AI-suggested or automatic scoring.
- Math/LaTeX transcription and diagram interpretation.
- Reading handwriting written on the test paper itself (only on the answer-sheet boxes).
- Sending comments or crops to Classroom or Schoology.
- Per-student return-mode overrides.
