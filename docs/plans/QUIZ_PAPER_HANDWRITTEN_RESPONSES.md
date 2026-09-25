# Quiz paper sheets: handwritten written responses, transcribed for grading

**Status:** plan only; no code has shipped. First settled 2026-09-24. **Revised 2026-09-25** after an adversarial review against the code, followed by a decision round with Paul. The review found four wrong premises and about fifteen unspecified decisions; this version replaces them. Decision ids are renumbered, and the 2026-09-24 ids are not reused.

**Flag:** new `GlobalFeature` `paper-handwritten-responses`, ANDed with the existing `admin_settings/paper_answer_sheets` + `paper-answer-sheets` gate.

**Delivery:** a contracts PR (Wave 0), then four waves of parallel PRs with disjoint file ownership (§5). Each PR targets `dev-paul` and is verified on `spartboard-dev`.

## Goal

A teacher prints paper answer sheets on which free-response questions appear **in their place in the test**, each with a lined box. Students write by hand. When the teacher scans the stack:

1. Each box is cropped in the browser.
2. Gemini transcribes the handwriting into typed text on the server.
3. The answers land in the existing free-response grader, with the handwriting beside an editable transcript.
4. The teacher grades as usual and returns the work through Publish Scores. Students see their handwriting, the transcript, or both in `/my-assignments`.

## 1. Current-state facts (verified 2026-09-25)

### Printing and reading

- **Paper sheets are MC only.** `analyzePaperQuiz` (`utils/paperSheetPlan.ts:140-185`, non-MC test at :145) leaves out every non-MC question and lists it at print time. `isStub` means "no MC rows" (`PaperPrintModal.tsx:158`), so a quiz with only written questions would read as a stub if nothing changes.
- **Plain sheets** are a grid: 8 mm rows (`ROW_PITCH_MM`), 25 rows per column, 2 columns (1 on stimulus sheets), starting at `GRID_TOP_MM = 58`. Columns fill top to bottom (`questionSlotOnPage`, `utils/paperSheetLayout.ts:157`).
- **Question-text sheets** (`sheetLayout: 'questions'`, #3404) use 42 mm slots, 5 per page (`QUESTION_ROW_PITCH_MM`, `QUESTION_ROWS_PER_PAGE`, `paperSheetLayout.ts:76-77`). Stems are already clamped to 3 lines (`.qt-stem`, `paperSheetPrint.ts:411-419`). Stubs never use this layout (`PaperPrintModal.tsx:213`).
- **Stubs.** `buildPaperStubQuiz` (`paperSheetPlan.ts:353`) builds MC placeholders worth `points: 1`. Stubs get no `rowLabels` (`PaperPrintModal.tsx:536`). The import wizard's document reader already knows which questions had no choices (`QuestionFill.options` absent, `paperQuestionOcr.ts:94`) but keeps them MC.
- **Everything is read in the browser.** `utils/paperScanRaster.ts` rasterizes the scan. `utils/paperSheetReader.ts` fits four corner marks (mean fit error over 1.5 mm is rejected, :511) and reads bubbles by pixel sampling. It searches about 34.5 × 44.7 mm corner windows for the marks (:312-345), and layout keeps out of them (`paperSheetLayout.ts:78,84`).
- **Row positions are arithmetic.** `(page-1) * perPage + indexOnPage` is computed independently in:
  - the reader's slot loop (`paperSheetReader.ts:556-571`)
  - `rowsOnPage`
  - `utils/paperImportAssemble.ts`
  - `utils/paperImportPlan.ts:61` (`sheetRowQuestionIds`)
  - `PaperImportModal.tsx:253-258` (the crop key)
  - `answerRowsHtml` (`paperSheetPrint.ts:287-296`)
  - `utils/paperSheetReprint.ts:57,89-92`
  - `tests/testHelpers/paperSheetRaster.ts:166`
  - the server mirror `functions/src/paperBatchPlan.ts:285`, which `createTeammatePaperBatch.ts:531,581` uses for PLC teammate prints, held to parity by `tests/utils/paperBatchPlanParity.test.ts`.
- **Crops today** are colour PNG data URLs, capped at 640 px (about 93 dpi at full width), axis-aligned, not deskewed, and obtainable only while the page is loaded (`paperScanRaster.ts:17,83-101`). They are stored best-effort in IndexedDB (`utils/paperCropStore.ts`), so a review resumed on another device has none (`types.ts:5110-5115`).
- **The ink threshold has no pixel masking.** The stimulus band is only left out of the Otsu threshold calculation (`paperSheetReader.ts:540-553`).
- **Blank detection** looks at bubbles only (`paperImportAssemble.ts:150`).
- **The page marker** has 6 page bits (`MAX_PAGE` 63) and 2 flag bits, of which only `FLAG_KEY_SHEET = 0b01` is used (`utils/paperSheetMarker.ts:16-38`). Decode ignores `0b10` (:135-137). `encodePaperMarker` throws past 63 pages only at print time, after `onSaveBatch` has saved the batch (`PaperPrintModal.tsx:519-520`).
- **`PaperBatch.pagesPerSheet` already exists** (`types.ts:5053`).
- **Stimuli** on one-column sheets print on every page unless pinned (`paperSheetStimulusLayout.ts:107`). Lines in lined stimuli are ruled every 8 mm (`LINE_RULE_MM`, `paperSheetTemplateSvg.ts:19`).
- **`printTest`** prints MC questions only (`PaperPrintModal.tsx:630-661`).
- **Sections:** choose-N counting (`overAnsweredSections`) sees MC rows only.

### Import and data

- **`importPaperResponsesV1`** (`functions/src/importPaperResponses.ts:542`):
  - The response key is the roster pseudonym, else `pin-{period}-{pin}` (:296-302).
  - It **replaces the whole response doc** (`set` without merge, :355-369). A rescan therefore wipes `grading`, `backTranslations`, `artifactArchive`, `resultsOverride` and `revealedAnswers`, and `replaceExisting` wipes a device response the same way.
  - It writes in chunks of 400 (`WRITE_CHUNK`) and sets `hasPaperResponses` on the assignment (`types.ts:5702`).
  - Unknown payload keys are ignored (:106-147).
- **Answers** are `answers[]` of `{questionId, answer, answeredAt, status, unresponded?, artifacts?}` (`types.ts:4610`). `ResponseArtifact` (`types.ts:4592`) has `id`, `slot`, `kind`, `storagePath`, `mimeType`, `bytes` and `uploadState`. `ArtifactKind` is `'text' | 'audio' | 'video' | 'whiteboard'` (:4583).
- **Scoring.** An empty free-response answer with no grade is `'not-attempted'`, a real 0 (`hooks/useQuizSession.ts:666-684`). Only a non-empty ungraded answer is `'awaiting-grade'`. `score` is not stored; it is computed (`types.ts:4832-4838`).
- **Rules.**
  - The teacher branch of the response rule allows any field (`firestore.rules:3891`).
  - A student whose uid matches `studentUid` can read the whole doc at any time (:3835-3841), and paper responses carry the student's pseudonym as `studentUid`.
  - `paperWritten` is not in the student write whitelist (:3937).
  - Anything unmatched is denied (:5790).
  - `pnpm run test:rules` starts only the Firestore emulator (`package.json:37`).

### Grading, publishing and printing results

- **Grades** are written from the client (`QuizResults.tsx:600-624`). Highlights anchor to a frozen `gradingSnapshot`, taken on the first save with highlights (`utils/gradeDraft.ts:159-171`, contract at `types.ts:5151-5159`). The grader, the student review and the print render that snapshot, not the live answer.
- **The grader queue** drops answers whose text is empty and that have no grade (`FreeResponseGrader.tsx:324-343`). A question with `recording` set goes down the media path (:317).
- **Back-translation** needs a non-English `locale`, which paper answers never carry.
- **There is a second grader and publish surface** in the Classroom add-on (`components/classroomAddon/TeacherReviewRoute.tsx:317-381, 700-725`).
- **Publish Scores.**
  - `PublishScoresModal` is shared by four widgets.
  - Publishing copies the assignment's settings onto the session doc (`hooks/useQuizAssignments.ts:3007-3024`); unpublish is at :2843-2882. Students cannot read the assignment doc.
  - Both publish paths rewrite the whole `answers` array from an earlier read, with no transaction (:2974-2983, :3134-3139).
  - Levels: none, score-only, score-and-responses, score-responses-and-answers (`types.ts:5476`). Per-student `resultsOverride` is at `types.ts:4986`, resolved client-side in `utils/quizResultsVisibility.ts:58`.
- **LMS push** is points only and runs from the client (`QuizWidget/Widget.tsx:3179`).
- **Printing results.** `awaitImages` exists (`utils/printHtmlDocument.ts:28`), but a failed image still prints (:106-111). `buildFilledSheetHtml` is in `utils/paperSheetPrint.ts:517`.
- **Exports and norming.** Sheet exports, including PLC-shared sheets, carry answer text (`utils/assignmentExportShared.ts:106-140`). PLC norming copies answer text (`functions/src/plcNorming.ts:236-247`) and strips audio because a voice identifies a student (:579).

### AI, quota and archive

- **Gemini on Vertex, `global` endpoint** (`functions/src/aiGeneration.ts:52-72`).
  - Model ids come from `global_permissions/gemini-functions` (:92-95, :316-356).
  - The Vertex client and model config are shared only through the test exports `__vertexClientOptions` and `__getGeminiModelConfig` (see `quizStimulusText.ts:319-325`).
  - Images with a `responseSchema` already work (`quizDocumentExtract.ts:606-615`).
- **Quota.**
  - Counters are `ai_usage/{uid}_{date}` and `ai_usage/{uid}_{featureId}_{date}`.
  - Per-feature limits live at `global_permissions/{featureId}.config.dailyLimit` (`aiGeneration.ts:565-615`), and the admin UI edits them only for ids in `GEMINI_FEATURES` (`GlobalPermissionsManager.tsx:384-390`).
  - Every quota helper checks and charges +1 in one transaction; there is no read-only check and no charge of N.
  - Analytics drops feature ids not in `GEMINI_SPECIFIC_FEATURES` (`adminAnalyticsCompute.ts:474`, `aiFeatureLabels.ts`).
- **Media archive.**
  - `archiveQuizMediaArtifact` (`quizMediaArchive.ts`) refreshes the teacher's stored refresh token on the server (`googleOAuth.ts:345`), and throws `needs-consent` when none is stored.
  - It is hard-wired to `answers[].artifacts`, `kind === 'audio'` (:826), the `quiz_response_media/` prefix (:836), the `quiz-media-response` gate (:689, :784-789), ffmpeg and the take limit.
  - The sweep (`sweepStuckQuizArchives.ts:145-159`) and the org-admin delete (`deleteQuizMediaForOrgAdmin.ts:185-205`) walk the same path.
  - `getOrCreateDriveFolder` has a check-then-create race (:338-362).
- **Media playback.** Teachers play archived audio straight from Drive in the browser (`utils/quizMediaPlayback.ts`). The only playback callable, `getQuizArtifactPlaybackUrl`, is student-only and passes any `scoreVisibility` except `'none'` (:231-236).
- **Triggers.** The precedent for `onDocumentCreated` workers is `projectUploadArchive.ts:329`. Archive triggers use 1 GiB and 300 s (`activityWallArchive.ts:964-969`).
- **`docs/gemini-api-terms-audit.md`** is stale: it claims `aiGeneration.ts` is the only importer of `@google/genai`.

## 2. Decisions

### 2.1 Scope, gating, release

| #   | Decision         | Choice                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Response kinds   | Short and extended text only. Math-to-LaTeX and diagrams are out of scope.                                                                                                                                                                                                                                                                                           |
| D2  | AI role          | **Transcription only.** The AI never suggests or assigns a score.                                                                                                                                                                                                                                                                                                    |
| D3  | Question sources | Free-response questions on real quizzes, and stub numbers the teacher marks as written. Free-response questions that **require a recording** are excluded and listed at print time. Written questions inside **choose-N sections** are refused at print time with an explanation (v1).                                                                               |
| D4  | Ownership        | Whoever imports owns it: their Drive holds the crops, their AI quota is charged, they grade their own students.                                                                                                                                                                                                                                                      |
| D5  | Flag             | `GlobalFeature` `paper-handwritten-responses`, `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`. The flag gates **authoring and printing** only. Reading, importing, grading and returning are driven by the **batch** (`layoutVersion: 2`), never by the importer's flag, so a batch printed with the flag imports correctly later. |
| D6  | Validation       | Ship and watch; Paul decides when to open the flag.                                                                                                                                                                                                                                                                                                                  |
| D7  | Privacy gate     | Wave 0 updates `docs/gemini-api-terms-audit.md`: it fixes the stale importer claim and adds rows for handwriting crops and `translateResponseV1`. **The district privacy review must be complete before the flag goes Public.** Admin use before that is fine.                                                                                                       |
| D8  | Surfaces in v1   | Plain and question-text sheets, stubs, the printed test paper, **PLC teammate printing**, Quiz Results, the **Classroom add-on grader**, student review, results print, and filled-sheet reprint.                                                                                                                                                                    |

### 2.2 Layout and printing

| #   | Decision        | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D9  | Placement       | **Inline, in test order, on every sheet type.** A page is a vertical flow of _segments_: a run of consecutive MC rows, then a written box, then more rows. On a two-column plain sheet each MC run fills its own two-column block (e.g. 1–3 left, 4–6 right), then a full-width box follows. On question-text sheets a written question takes whole 42 mm slots (stem, then box), so MC bubbles stay on the slot grid.                                                                                                                                                                                         |
| D10 | Stimulus sheets | On one-column (stimulus) sheets, boxes stay within the left bubble column (58 mm wide, x 24-82; corrected in 1A from "about 90 mm") and end above the bottom corner window. The stimulus is never overprinted. A Full-page box, and an L box on these sheets, gets its own page, without the stimulus.                                                                                                                                                                                                                                                                                                         |
| D11 | Numbering       | **Every question is numbered by its position in the quiz** (`questions[]` order after section expansion, the order the test paper prints), on every sheet type, stubs included. Bubble rows skip numbers where written questions sit (…6, 8, 9…). The sheet, the test paper and the grader all mean the same question by "7.".                                                                                                                                                                                                                                                                                 |
| D12 | Box sizes       | `QuizQuestion.paperBoxSize: 'S' \| 'M' \| 'L' \| 'full'`. S/M/L = **3 / 6 / 12 lines** at 8 mm, plus one header row (number and stem, shortened to 3 lines on quiz sheets, number only on stubs). A box takes a whole number of 8 mm grid rows. **Full** is its own page (about 24 lines). On question-text sheets the box rounds up to whole slots and every slot is filled with lines. The default comes from `maxWords` (about 10 words a line), otherwise M. As built in 1A: the header is two rows when the stem prints (one on stubs), and question-text boxes rule 3 / 8 / 13 lines in 1 / 2 / 3 slots. |
| D13 | Packing         | A box never splits across pages; if it doesn't fit, it starts the next page. Boxes never enter the reader's corner windows. The planner checks the 63-page marker limit **before** `onSaveBatch` and refuses with a message.                                                                                                                                                                                                                                                                                                                                                                                   |
| D14 | Page map        | At print time the batch stores `pageMaps` (§3.2): every MC row's origin and every box's rectangle, per page, with `layoutVersion: 2`. **Every consumer reads the map when `layoutVersion === 2`**: reader, assembly, import plan, import-modal crop key, reprint, test helper and the server planner. Batches without it keep today's arithmetic, unchanged.                                                                                                                                                                                                                                                   |
| D15 | Marker          | Flag bit `0b10` means "read this page by the map". The reader refuses to read a flagged page with arithmetic. The key sheet sets `0b11`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D16 | Answer key      | The key sheet uses the same page maps, so its rows line up with student sheets. Each written box prints as a shaded "Written — graded by teacher" band, never cropped or uploaded.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D17 | Stubs           | The stub builder has a per-number Written toggle with a size picker. When the stub was filled by the document reader, numbers it saw without choices are **pre-marked Written (M)**. A written stub question becomes `type: 'free-response'`, and its MC choice fields are dropped.                                                                                                                                                                                                                                                                                                                            |
| D18 | Test paper      | `printTest` prints written questions in place, with "Answer on your answer sheet".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D19 | PLC teammates   | The server planner (`paperBatchPlan.ts`, `createTeammatePaperBatch.ts`) learns the same layout, with the parity test extended to cover page maps.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 2.3 Scan, upload, transcription

| #   | Decision        | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D20 | What leaves     | `QUIZ_PAPER_ANSWER_SHEETS.md` Q4 is reversed **for written boxes only**. Bubble reading stays in the browser. Only box crops are uploaded; page headers (student names) and bubble areas never are.                                                                                                                                                                                                                                                                                                                                                                                                  |
| D21 | Crop capture    | Inside the read loop, each box is cut through the page transform (deskewed and rotated upright) into a **grayscale ~150 dpi WebP blob**, with a 2 mm margin to cover fit error. Blobs go to IndexedDB, and the **upload starts in the background immediately** to `paper_written_crops/{uid}/{scanId}/…`. A review resumed on another device loads crops from Storage.                                                                                                                                                                                                                               |
| D22 | Blank check     | A browser ink check measures the ink ratio inside the box, with printed rule-line bands (line width plus 2 × fit margin) masked out. Thresholds join `READER_THRESHOLDS`. **A blank box scores a real 0, but its crop is still uploaded and archived** (no AI call), and the grader offers "Not blank? Transcribe". Ink in any box means the student is **not** blank-skipped by assembly.                                                                                                                                                                                                           |
| D23 | Pipeline        | Import writes the responses, private subdocs (D29) and one job per page with ink. A Firestore-triggered worker transcribes each job. Import returns immediately, and the tab can close.                                                                                                                                                                                                                                                                                                                                                                                                              |
| D24 | Engine          | One Gemini call per page, with each box as a separate image and a `responseSchema` returning, per box, `{ questionId, text, uncertainSpans, illegible }`. **The model tier defaults to `'standard'`**, configurable per feature (D25). The prompt says: transcribe verbatim, keep the student's spelling, never correct or complete, mark rather than guess, keep paragraph breaks. Output is stored as sanitized HTML (`<p>` per paragraph).                                                                                                                                                        |
| D25 | Quota and model | `global_permissions/paper-handwritten-responses` `config: { dailyLimit: 300, modelTier: 'standard' }`, edited in the existing Global Settings AI card (add the id to `GEMINI_FEATURES`). The counter is `ai_usage/{uid}_paper-handwritten-responses_{date}`, **counted in pages**, **not** counted against the overall 20-a-day limit, and admins are unlimited. Import runs a read-only check and shows the page count. The worker charges **only on success, at most once per job**, in the same transaction as the transcript write. The worker also respects the `gemini-functions` kill switch. |
| D26 | Crop records    | Each crop is a `ResponseArtifact` with `kind: 'handwriting'` on its answer. The archive core, sweep and org-admin delete are **generalized by kind** (no ffmpeg, no media-feature gate, no take limit for `'handwriting'`), so one archive system and one admin view cover audio and handwriting.                                                                                                                                                                                                                                                                                                    |
| D27 | Drive           | Archival runs after transcription. A teacher without a stored Drive token still gets transcripts. Crops are held in Storage with archive state `'awaiting-drive'`, shown in the grader through the owner callable, and a "Connect Drive" banner triggers archival. Held crops are kept up to **60 days**, with a warning 7 days before removal.                                                                                                                                                                                                                                                      |
| D28 | Rescan          | **Per-answer merge in a transaction.** MC answers are always replaced. A written answer is replaced only if it is **ungraded and unedited**; otherwise it is kept and listed in the import summary. Doc-level fields (grades on other questions, overrides, archives) survive. Every import gets a `scanId`, used in job ids and crop paths. The worker writes only while the answer's `paperScanId` still equals the job's. The same merge fixes `replaceExisting` wiping device grades. The grader offers "Use new scan" per kept answer.                                                          |
| D29 | AI internals    | **Teacher-only subdoc** `quiz_sessions/{sid}/responses/{key}/paperPrivate/{questionId}` holds the raw transcript, uncertain spans, status, attempts and errors. The response doc carries only the answer text and a public `paperTranscript` state (§3.3), as typed answers do.                                                                                                                                                                                                                                                                                                                      |
| D30 | Old tabs        | The new client sends `layoutVersion: 2`. `importPaperResponsesV1` rejects any import for a batch with `layoutVersion: 2` whose payload lacks it: "Refresh SpartBoard to import this batch." Nothing is written from a misread.                                                                                                                                                                                                                                                                                                                                                                       |
| D31 | Retries         | A "Transcribe now" callable (per answer, per seat or per batch) and a scheduled sweep re-queue failed, over-quota and stuck jobs, and garbage-collect crops (D27, §3.5). The worker runs with 1 GiB, 300 s and a `maxInstances` cap.                                                                                                                                                                                                                                                                                                                                                                 |

### 2.4 Grading

| #   | Decision       | Choice                                                                                                                                                                                                                                                                                                    |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D32 | Pending scores | `paperTranscript: 'pending'` counts as **awaiting-grade**, never 0, in `gradeAnswer` and every caller. The grader queue includes pending, failed and over-quota answers, with Transcribing, Failed or Retry states.                                                                                       |
| D33 | Where          | The existing Quiz Results → `FreeResponseGrader` → Publish Scores flow, **and** `TeacherReviewRoute` (Classroom add-on). Both mount one shared crop panel component.                                                                                                                                      |
| D34 | Review UI      | The handwriting crop (zoomable, with alt text "Handwritten answer, question N") beside an editable transcript, with uncertain spans highlighted and a "Check transcript" badge when any are flagged. Paper responses get a "Paper" badge in the response list.                                            |
| D35 | Crop loading   | Once archived, the teacher's browser fetches straight from their own Drive, as audio does. Before archival, or while awaiting Drive, a small owner-only callable reads the Storage copy.                                                                                                                  |
| D36 | Edits          | `updatePaperTranscriptV1` updates `answer` atomically (transaction). **If the grade has a `gradingSnapshot`, it rewrites the snapshot to the new text and deletes the highlights**, after a confirm warning. Points, comment and rubric are kept. It records `editedBy`/`editedAt` in the private subdoc. |

### 2.5 Returning, sharing, printing

| #   | Decision      | Choice                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D37 | Student view  | `writtenReturnMode: 'handwriting' \| 'typed' \| 'both'` (default `'handwriting'`), chosen in Publish Scores (quiz only, shown when the assignment has paper written answers). It is **copied onto the session doc** and cleared on unpublish, and applies to whole-class, per-student and Classroom add-on publishing. In Handwriting mode, highlights are listed as comments beneath the crop. |
| D38 | Student crop  | `getPaperWrittenCropV1` serves a student their own crop only when the resolved visibility (level **and** `resultsOverride`, the server twin of `quizResultsVisibility.ts`) includes responses and the mode includes handwriting. Never a public link.                                                                                                                                           |
| D39 | Publish       | Publish warns when any paper transcripts are pending or failed; those answers publish as awaiting grade. Publish updates `answers` in a transaction (or by per-field update) so it cannot overwrite a transcript that landed after its read.                                                                                                                                                    |
| D40 | Sharing       | Exports and PLC norming carry the **transcript** like any typed answer, and pending shows as "(transcribing)". **Crops never leave the teacher's own views**: norming strips `'handwriting'` artifacts, as it strips audio.                                                                                                                                                                     |
| D41 | Results print | `ResultsPrintModal` gets a written-answers choice, starting from the assignment's mode (Handwriting if unpublished). Crops are fetched before printing and in the live preview. A crop that fails to load prints a visible "handwriting unavailable" placeholder, never a silent gap.                                                                                                           |
| D42 | Reprint       | Filled-sheet reprints redraw pages from the page map, with each crop in its box plus points and the teacher's comment in the margin, and no marker or registration marks.                                                                                                                                                                                                                       |

LMS push is unchanged: points only.

### 2.6 Defaults chosen without a vote (override in review)

- A written stub question's points default to 1, with a points input beside the size picker.
- Back-translation stays unavailable for paper answers, since no `locale` is known.
- `markPlcAssessmentDirtyOnResponse` firing once per worker write is acceptable.

## 3. Contracts (frozen by Wave 0)

Later waves **must not edit `types.ts`, the functions-side mirror types, or `utils/paperWritten.ts`**. A needed contract change is its own small PR, merged before the dependent work.

### 3.1 Authoring

- `QuizQuestion.paperBoxSize?: PaperBoxSize` (free-response only; add it to the `VideoActivityQuestion` Omit list, `types.ts:6086`).
- `PaperBoxSize = 'S' | 'M' | 'L' | 'full'`, and `PAPER_BOX_LINES = { S: 3, M: 6, L: 12 }` in `utils/paperWritten.ts`, with `defaultPaperBoxSize(maxWords?)`.
- `GlobalFeature` gains `'paper-handwritten-responses'`, with a `FEATURE_DEFAULTS` entry (D5).

### 3.2 Batch

```ts
type PaperPageItem =
  | {
      kind: 'mc';
      questionId: string;
      sheetRow: number;
      label: string;
      originMm: PointMm;
    }
  | {
      kind: 'written';
      questionId: string;
      label: string;
      headerMm: RectMm;
      boxMm: RectMm;
      lines: number;
    };

interface PaperPageMap {
  page: number;
  grid: PaperGrid;
  items: PaperPageItem[];
} // page is 1-based, absolute

interface PaperBatch {
  // existing fields…
  layoutVersion?: 2; // present iff pageMaps is present
  pageMaps?: PaperPageMap[]; // one per physical page of a student sheet
  // pagesPerSheet keeps its meaning (physical pages per student); it is taken from pageMaps.length when present.
  // questionCount keeps its meaning: the MC row count.
}
```

`sheetRow` is the MC row's index across the whole sheet (0..questionCount-1), so bubble answers keep their current shape. `label` is the printed number (D11). Bubble geometry relative to `originMm` follows the page's `grid`, as `bubbleRectMm` does today.

### 3.3 Response

- `ArtifactKind` gains `'handwriting'`. A handwriting artifact has `slot: 'primary'`, `storagePath: paper_written_crops/{uid}/{scanId}/{seat}/{questionId}.webp`, `mimeType: 'image/webp'`, and `uploadState`.
- `QuizResponseAnswer` gains:
  - `paperScanId?: string`
  - `paperTranscript?: 'pending' | 'done' | 'blank'`. This is public, carries no AI internals, and `failed` / `over-quota` show publicly as `'pending'`.
- The written answer's `answer` is the sanitized-HTML transcript; it is `''` while pending or when blank.
- **`PaperPrivateAnswer`** at `responses/{key}/paperPrivate/{questionId}`:

```ts
{
  scanId: string;
  status: 'pending' | 'done' | 'failed' | 'blank' | 'over-quota';
  rawTranscript?: string;                              // model output, plain text
  uncertainSpans?: { start: number; end: number }[];  // offsets into rawTranscript
  illegibleCount?: number;
  attempts: number;
  lastError?: string;
  charged: boolean;
  editedBy?: string;
  editedAt?: number;
  updatedAt: number;
}
```

- **Status transitions:**
  - `pending → done | failed | over-quota`
  - `failed | over-quota → pending` (retry)
  - `blank → pending` ("Not blank? Transcribe")
  - Any status → replaced by a new `scanId` (rescan, D28).
- **Session and assignment:** `QuizSession.writtenReturnMode?`, plus `QuizAssignment.hasPaperWritten?: boolean` (set by import, beside `hasPaperResponses`).

### 3.4 Jobs

`users/{uid}/paper_transcription_jobs/{scanId}_{seat}_{page}_{attempt}`:

```ts
{
  sessionId: string;
  responseKey: string;
  scanId: string;
  page: number;
  boxes: { questionId: string; storagePath: string }[];
  status: 'queued' | 'running' | 'done' | 'failed' | 'over-quota' | 'superseded';
  attempt: number;
  leaseUntil?: number;
  charged: boolean;
  createdAt: number;
  updatedAt: number;
}
```

A retry **creates** a new job with `attempt + 1`, so `onDocumentCreated` fires. A job whose `scanId` no longer matches the answer ends as `superseded` without writing.

### 3.5 Storage and rules

- **Storage:** `paper_written_crops/{uid}/{scanId}/{seat}/{questionId}.webp`.
  - Only the owning teacher (non-anonymous) can create.
  - Create-only (a new `scanId` for every rescan).
  - Content types `image/webp` and `image/png`, at most 2 MB.
  - No client reads.
  - A bucket lifecycle rule on the prefix at 90 days is the backstop; the sweep does the real clean-up: unimported scans after 7 days, awaiting-Drive after 60 days.
- **Firestore:**
  - `paperPrivate/{questionId}`: teacher of the session read-only; the server writes.
  - `users/{uid}/paper_transcription_jobs/{id}`: owner read-only.
  - Keep within the rules size caps: write with the shorthands, and run `pnpm run check:rules-size`.
- **Collection-group index** on `paper_transcription_jobs` (`status`, `leaseUntil`) for the sweep.

### 3.6 Import payload v2

Existing payload fields, plus:

```ts
{
  layoutVersion: 2;
  scanId: string;
  sheets: {
    // …existing fields
    written: {
      questionId: string;
      page: number;
      state: 'ink' | 'blank';
      storagePath: string;
    }
    [];
  }
  [];
}
```

Result additions: `keptWritten: { seat: number; questionId: string }[]`, `jobsCreated: number`, `pagesQueued: number`, `pagesOverQuota: number`.

### 3.7 Pure helper

`paperWrittenView(answer, privateDoc | null, mode)` in `utils/paperWritten.ts` returns what to render (crop, transcript, both, placeholder). It is shared by the student review, results print and reprint, and ships with its tests in Wave 0.

## 4. Behaviour details implementers must not guess

- **Flag checks.** Authoring and print entry points check `canAccessFeature('paper-handwritten-responses') && paperSheetsRollout.enabled && canAccessFeature('paper-answer-sheets')`. Nothing on the read, import, grade or return side checks the flag (D5).
- **`analyzePaperQuiz`** returns a separate `written: { questionId; label; size }[]`. Written questions **never** enter `rows`, and `isStub` stays "no MC rows **and** no written".
- **The reader:**
  - Takes the page map through `ReadPageOptions`.
  - Loops the map's MC items rather than `0..count-1`.
  - Masks written boxes out of the Otsu threshold calculation.
  - Throws `needs-map` on a `0b10` page read without a map.
- **Import:**
  - Checks D30 first.
  - Reads existing responses inside per-seat transactions and counts **every** write (responses, private subdocs, jobs) against the chunk limit.
  - Rejects student tokens, as it does today.
- **The worker:**
  1. Claims the job with a lease in a transaction.
  2. Checks the remaining quota; if it is exhausted, sets `over-quota` and stops.
  3. Calls Gemini.
  4. In one transaction: re-reads the response; for each box where `paperScanId` matches and the private doc has no `editedAt`, writes `answer`, `paperTranscript: 'done'` and the private doc; charges once (`charged` on the job); marks the job done.
  5. Archives to Drive through the generalized helper (the folder is `Quiz Responses/{title}`, as audio uses; fix the folder race with a transaction or a deterministic lookup).
  6. Deletes the Storage copy only after archiving succeeds.
- **Uncertain spans** index `rawTranscript`. The grader highlights them only while `answer` is still the unedited transcript; after an edit, the badge stays and the highlights hide.

## 5. Waves

A wave's PRs touch disjoint files (see the ownership table) and can be built in parallel by separate sessions. **A wave merges completely before the next one starts.** Every PR:

- ships behind the flag
- runs `pnpm exec vitest related --run <files>`
- lists its acceptance tests in the PR description

### Wave 0: contracts (one PR, serial)

- **Owns:**
  - `types.ts`
  - the functions-side mirror types
  - `config/featureDefaults.ts`
  - `utils/paperWritten.ts` (new; constants, `defaultPaperBoxSize`, `paperWrittenView`, status helpers)
  - `docs/gemini-api-terms-audit.md`
  - `docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md` (point Q4 and §10 here)
- **Acceptance tests:**
  - `paperWrittenView` for each mode × status
  - `defaultPaperBoxSize` boundaries
  - type-check passes
- **Done when:** merged, and every type in §3 exists exactly as written.

### Wave 1: foundations (parallel)

| PR                           | Scope                                                                                                                                                                                                                                 | Owns                                                                                                                                                                                                                             | Acceptance tests                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A Layout                    | `analyzePaperQuiz` `written` list; `planPaperPages()` producing `pageMaps` (segments, two-column runs, stimulus left column, slots on question-text sheets, key bands, Full page, corner windows, 63-page check); marker `0b10`       | `utils/paperSheetPlan.ts`, `utils/paperSheetLayout.ts`, `utils/paperPageMap.ts` (new), `utils/paperSheetMarker.ts` + tests                                                                                                       | Never splits a box; Full gets its own page; labels skip written numbers; no rect intersects a corner window or overlaps a stimulus rect; 64-page plan refused; marker round-trips `0b10`/`0b11`; a quiz with only written questions is not a stub; batches without written questions produce maps identical in effect to today's arithmetic |
| 1B Authoring and admin       | `paperBoxSize` picker in the free-response editor ("Paper" subsection, flag-gated); `GEMINI_FEATURES` id with a `modelTier` control; analytics labels                                                                                 | `QuizWidget/components/PaperBoxSizeField.tsx` (new, mounted beside `WordLimitFields` in `QuizEditor.tsx:1218`), `GlobalPermissionsManager.tsx`, `aiFeatureLabels.ts`, `functions/src/adminAnalyticsCompute.ts` + its test mirror | Picker hidden without the flag; default from `maxWords`; admin card saves `dailyLimit` and `modelTier`; analytics counts the new counter                                                                                                                                                                                                    |
| 1C Archive generalization    | Extract `functions/src/driveUpload.ts`; generalize the archive core, sweep and org-admin delete by kind and prefix; fix the folder race                                                                                               | `quizMediaArchive.ts`, `sweepStuckQuizArchives.ts`, `deleteQuizMediaForOrgAdmin.ts`, `driveUpload.ts` + tests                                                                                                                    | All existing audio archive tests pass unchanged; a `'handwriting'` artifact archives without ffmpeg or a media gate; the sweep and admin delete list it; parallel archives create one folder                                                                                                                                                |
| 1D Quota and transcribe core | Public Vertex client and model helpers; `paperHandwritingQuota.ts` (read-only remaining pages, idempotent charge-once in a transaction); `paperTranscribe.ts` (deps interface, schema, prompt, parser, HTML sanitizer, tier to model) | `aiGeneration.ts` (exports only), `paperHandwritingQuota.ts`, `paperTranscribe.ts` + tests                                                                                                                                       | Charge-once is idempotent under replay; admins unlimited; the overall counter is untouched; the parser handles missing boxes, illegible and malformed JSON; `'standard'` is the default tier                                                                                                                                                |
| 1E Scoring                   | `gradeAnswer` / `isWrittenAnswerAwaitingGrade` treat `paperTranscript: 'pending'` as awaiting; blank stays 0                                                                                                                          | `hooks/useQuizSession.ts` + tests                                                                                                                                                                                                | Pending counts as awaiting, not 0, across the drilldown, publish and LMS totals; `'blank'` counts as 0                                                                                                                                                                                                                                      |
| 1F Rules                     | Firestore rules for `paperPrivate` and jobs; Storage rules for the crop path; add the Storage emulator to `test:rules`                                                                                                                | `firestore.rules`, `storage.rules`, `firebase.json` (emulators), `package.json` (`test:rules`), `tests/rules/*`                                                                                                                  | Teacher reads private, student denied; job owner read only; crop create by owner only, anonymous and oversize denied, reads denied; `check:rules-size` passes                                                                                                                                                                               |

### Wave 2: print, read, import, worker (parallel)

| PR                  | Scope                                                                                                                                                                                                                                                                                                    | Owns                                                                                                                                                                 | Acceptance tests                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2A Print            | Render the page maps (plain segments, question-text slots, stimulus column, key bands); store `pageMaps`/`layoutVersion` on the batch; stub builder Written toggle with document-reader prefill and points; exclusion list (recording, choose-N); test-paper written questions; map-driven reprint of MC | `utils/paperSheetPrint.ts`, `utils/paperTestPrint.ts`, `utils/paperSheetReprint.ts`, `PaperPrintModal.tsx` + tests                                                   | HTML snapshots per layout; a stub marked written prints labels matching the test paper; key sheet bands; reprint of a v2 batch places bubbles correctly                                                                                           |
| 2B Read             | Reader reads by map, enforces `0b10`, masks boxes out of the threshold, runs the ink check and the deskewed grayscale WebP crop; assembly and import plan by map; ink counts as not blank                                                                                                                | `utils/paperSheetReader.ts`, `utils/paperScanRaster.ts`, `utils/paperImportAssemble.ts`, `utils/paperImportPlan.ts`, `tests/testHelpers/paperSheetRaster.ts` + tests | A rendered v2 sheet (mixed rows and boxes, both layouts) reads back exactly; a skewed or rotated fixture produces an upright crop; ink thresholds on fixtures (pencil, empty, ruled only); written-only student not skipped; v1 batches unchanged |
| 2C Teammate planner | Server-side `planPaperPages` twin; teammate batches carry maps; parity test over maps                                                                                                                                                                                                                    | `functions/src/paperBatchPlan.ts`, `createTeammatePaperBatch.ts`, `getTeammatePrintContext.ts`, `tests/utils/paperBatchPlanParity.test.ts`                           | Parity on quizzes with and without written questions, both layouts                                                                                                                                                                                |
| 2D Import           | D30 guard; per-seat transaction merge (D28); written answers, private subdocs, jobs; `scanId`; quota pre-check; chunk accounting; result fields                                                                                                                                                          | `functions/src/importPaperResponses.ts` + tests                                                                                                                      | A rescan keeps graded and edited answers and doc-level fields; MC always replaced; `replaceExisting` keeps device grades; an old payload for a v2 batch is rejected; blank creates no job; job ids carry `scanId`                                 |
| 2E Worker           | `transcribePaperWrittenPageV1` (lease, quota, Gemini, transaction write, archive, delete); `retryPaperTranscriptionV1`; scheduled sweep (stuck jobs, crop GC, awaiting-Drive, 53-day warning); index                                                                                                     | `functions/src/paperTranscriptionWorker.ts`, `paperTranscriptionSweep.ts`, `functions/src/index.ts`, `firestore.indexes.json` + tests                                | Replay does not double-charge; a stale `scanId` ends superseded; an edited answer is not overwritten; over-quota then retry succeeds; no Drive keeps crops and still transcribes; Storage is deleted only after archive succeeds                  |
| 2F Import modal     | Background upload during review; thumbnails with blanks marked; quota page count; crops reloaded from Storage on resume; summary shows kept answers and queued pages                                                                                                                                     | `PaperImportModal.tsx`, `utils/paperCropStore.ts` + tests                                                                                                            | Upload starts during review; a resumed session shows crops; over-quota warning before import; summary lists kept answers                                                                                                                          |

### Wave 3: grading (parallel)

| PR                     | Scope                                                                                                                                                                                          | Owns                                                                                                                                   | Acceptance tests                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3A Callables           | `getPaperWrittenCropV1` (teacher Storage fallback, student visibility twin); `updatePaperTranscriptV1` (D36); "Use new scan" and "Not blank? Transcribe" actions                               | `functions/src/paperWrittenCallables.ts`, `functions/src/quizResultsVisibilityServer.ts`, `functions/src/index.ts` + tests             | Owner only, other teachers and students denied (teacher path); student denied at none, score-only and a per-student override; an edit rewrites the snapshot and drops highlights, keeping points |
| 3B Grader              | `PaperCropPanel` (Drive-direct fetch, callable fallback, zoom, alt text); grader queue includes pending, failed and over-quota; uncertain-span highlights; edit mode with warning; Paper badge | `components/quiz/paper/PaperCropPanel.tsx` (new), `utils/paperCropFetch.ts` (new), `FreeResponseGrader.tsx`, `QuizResults.tsx` + tests | Grader states for each status; edit warning only when a snapshot exists; Paper badge                                                                                                             |
| 3C Exports and norming | "(transcribing)" in exports; norming strips handwriting artifacts                                                                                                                              | `utils/assignmentExportShared.ts`, `functions/src/plcNorming.ts` + tests                                                               | Transcript exported; no crop reference in exports or norming copies                                                                                                                              |

### Wave 4: returning and printing (parallel)

| PR                                 | Scope                                                                                                                                                            | Owns                                                                                                                                           | Acceptance tests                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4A Publish                         | Quiz-only mode control in `PublishScoresModal`; copy onto the session and clear on unpublish; pending warning; transactional answers update; per-student publish | `PublishScoresModal.tsx`, `hooks/useQuizAssignments.ts` + tests                                                                                | Mode copied and cleared; control hidden for other widgets and for quizzes without paper written answers; a worker write between read and publish is preserved |
| 4B Student view                    | `WrittenAnswerReview` renders through `paperWrittenView` for each mode; highlights listed in Handwriting mode                                                    | `components/quiz/QuizStudentApp.tsx` + tests                                                                                                   | Each mode; score-only shows nothing; the crop is never requested without visibility                                                                           |
| 4C Classroom add-on                | Mount `PaperCropPanel` and the states in `TeacherReviewRoute`; the mode in its publish picker                                                                    | `components/classroomAddon/TeacherReviewRoute.tsx` + tests                                                                                     | Crop panel present; mode copied                                                                                                                               |
| 4D Results print and reprint crops | Written-answers choice; crop prefetch in print and preview; failed-image placeholder; reprint draws crops, points and comment                                    | `ResultsPrintModal.tsx`, `utils/quizStudentReportPrint.ts`, `utils/paperSheetPrint.ts` (reprint section), `utils/paperSheetReprint.ts` + tests | HTML snapshot per mode; placeholder on failure; reprint of a v2 sheet with crops                                                                              |

### File ownership by wave (hot spots)

| File                                             | W0  | W1  | W2  | W3  | W4  |
| ------------------------------------------------ | --- | --- | --- | --- | --- |
| `types.ts`, `utils/paperWritten.ts`              | 0   |     |     |     |     |
| `utils/paperSheetLayout.ts`, `paperSheetPlan.ts` |     | 1A  |     |     |     |
| `utils/paperSheetPrint.ts`                       |     |     | 2A  |     | 4D  |
| `utils/paperSheetReprint.ts`                     |     |     | 2A  |     | 4D  |
| `utils/paperSheetReader.ts`                      |     |     | 2B  |     |     |
| `functions/src/importPaperResponses.ts`          |     |     | 2D  |     |     |
| `functions/src/quizMediaArchive.ts`              |     | 1C  |     |     |     |
| `functions/src/index.ts`                         |     |     | 2E  | 3A  |     |
| `firestore.rules`, `storage.rules`               |     | 1F  |     |     |     |
| `FreeResponseGrader.tsx`                         |     |     |     | 3B  |     |
| `PaperPrintModal.tsx`                            |     |     | 2A  |     |     |
| `PaperImportModal.tsx`                           |     |     | 2F  |     |     |

## 6. Rollout

- The flag starts at `admin`, so "on for Paul" means Paul plus the other `/admins`.
- Paul tests on `spartboard-dev` with the mock class, then in prod on his own classes.
- The flag opens at Admin Settings > Access > Global Settings > `paper-handwritten-responses` > Public, **only after the district privacy review (D7)**. Agents never open it on prod.
- Existing batches are unaffected: without `layoutVersion: 2`, every path runs today's arithmetic.
- No new function secrets. The worker binds the existing `QUIZ_MEDIA_GOOGLE_SECRETS` for Drive.
- Release compatibility:
  - New import fields are optional for v1 batches.
  - v2 batches require the new client (D30).
  - Rules changes only add paths.
- The changelog entry comes when the flag opens to everyone.

## 7. Known risks

- **Copier and handwriting fidelity are untested.** Light pencil can pass as blank (mitigated by D22's kept crop). Writing outside the box is lost. Watch the "Check transcript" rate and the edit rate once Paul uses it.
- **Standard-model accuracy on messy handwriting.** `modelTier` can switch to `'advanced'` without a deploy.
- **Student handwriting goes to Vertex.** It travels on the teacher-only path and the audit doc is updated; the district review (D7) gates Public.
- **Students write their names in boxes.** The crops are then identifying content; this is covered by D40 and the audit row.
- **Quota on large days.** Several sections can reach 300 pages; the admin can raise the limit.
- **`pin-` keyed responses** still have no student view (existing Q32), so those students see written work only on paper.

## 8. Out of scope

- AI-suggested or automatic scoring.
- Math/LaTeX transcription and diagram interpretation.
- Reading handwriting on the test paper itself.
- Sending comments or crops to Classroom or Schoology.
- Per-student return-mode overrides.
- Written questions inside choose-N sections.
- Model answers on the key sheet.
