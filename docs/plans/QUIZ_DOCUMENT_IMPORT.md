# Quiz: import a new quiz from a test document

Grilled and settled 2026-09-21. Four stacked PRs to dev-paul, in the order below. Ships behind a Rollouts switch, off.

## Goal

- A teacher uploads or picks a PDF, Word file (.docx) or Google Doc and gets a new quiz: questions, answer options, and the answer key when the document has one.
- Pictures and reading passages in the test come in attached to the questions that use them.
- The row-menu "Import questions" on a paper test fills options and the key, not just question text.

## Current-state facts that drove the decisions

- Import (`ImportWizard` + `createQuizImportAdapter`, `adapters/quizImportAdapter.ts`) accepts only a Google Sheet or CSV. The wizard already has a `{kind:'file', file}` source (Video Activity uses it), but `acceptExtensionsForSources` limits `'file'` to `.csv/.json/.txt` (`ImportWizard.tsx`).
- The adapter's `validate` requires a `correctAnswer` on every non-FIB question, so a keyless import fails today. `QuizEditorModal` enforces the same on save.
- "Import questions" (`PaperQuestionTextModal.tsx`) runs pdf.js raster + tesseract in the browser, ignores the PDF text layer, and keeps stems only: `parseNumberedQuestions` (`utils/paperQuestionOcr.ts`) drops option lines and never reads a key. `applyQuestionText` replaces `text` on existing stub rows by index.
- No DOCX parser exists. `jszip` is already a dependency (OLF and notebook converters use it).
- `GoogleDriveService.exportFileText` exports a Doc as `text/plain` only; the Picker's `docs` mode excludes PDF and DOCX.
- AI quiz generation (`generateWithAI` type `quiz`, `functions/src/aiGeneration.ts`) writes new questions on a topic. It drops MC with fewer than 3 distractors, caps the prompt at 10,000 chars, and `sanitizePrompt` flattens newlines. It cannot be reused for extraction.
- `extractStimulusReadAloudTextV1` (`functions/src/quizStimulusText.ts`) already sends PDFs to Gemini on Vertex: text layer via `pdf-parse` first, page slicing with `pdf-lib`, 25 MB cap, 60 s deadline, `ocr` quota. It is the model for the new function.
- Question types: `MC | FIB | Matching | Ordering | free-response`. T/F is MC with two options. No multi-select in Quiz.
- Stimuli (`QuizStimulus`, `QuizData.stimuli`, `question.stimulusIds`) support `image | pdf | audio | video | youtube | gdoc-embed`, stored in the teacher's Drive. `QuizStimulusView.tsx` switches on type. Read-aloud speaks `readAloudText` via `session.readAloudTextByStimulusId` (`functions/src/quizReadAloud.ts`).
- `QUIZ_PAPER_ANSWER_SHEETS.md` §10 lists "reading question text to create a quiz" as out of scope, and Q4 keeps paper processing in the browser. This plan reopens both on purpose (D1, D13).

## Decisions

### Engine

- **D1.** Two readers behind one interface. The AI reader (new Cloud Function, Gemini on Vertex) runs when the teacher has AI access (`gemini-functions`). Otherwise the browser reader runs. Both return the same `ExtractedQuiz` shape, so the review table and create step do not care which ran.
- **D2.** Browser reader: text layer first (pdf.js `getTextContent` for PDFs, `word/document.xml` via jszip for DOCX), tesseract only when a PDF page has no usable text layer. It handles MC and T/F only: numbered stems, lettered option lines (A–F), and a key from either an answer block ("1. B", "1) b", "1-B") or a marked option (DOCX bold/highlight/underline, a leading `*`). Anything else is a free-response row with a "couldn't read this question type" warning. Layout, sections and more key forms: see `QUIZ_IMPORT_RELIABILITY.md` (R2–R13).
- **D3.** AI reader: structured JSON response schema, a prompt that says **extract, never invent** (no new questions, no rewording, no guessed keys). It reads the PDF directly (not transcribed text), so layout, bold and a key table at the end all count. DOCX and Google Docs go to it as text with formatting markers, plus their images (D13).
- **D4.** Google Docs are exported from Drive as DOCX, then take the DOCX path in both readers. One path, and bold/highlight keys survive.

### Key

- **D5.** A missing key does not block import. The question is created with `correctAnswer: ''` and a `needsKey: true` flag, shown as "Needs answer" in the review table and the editor.
- **D6.** A quiz with any `needsKey` question cannot be assigned (Assign button disabled with the count). Printing response sheets is still allowed; the bubbled key sheet fills the key as it does for stubs today, which clears `needsKey`.
- **D7.** The import adapter's `validate` and `QuizEditorModal` save accept `needsKey` questions. Assign, live start and PLC share are the gates.
- **D8.** An optional second "Answer key file" slot beside the test file. Keys are matched by question number; mismatches (key for Q14 on a 12-question test, a letter with no such option) show as row warnings. A key inside the test document is still found. Superseded by the two-zone uploader and key-file-wins merge in `QUIZ_IMPORT_RELIABILITY.md` (R10, R14–R17).

### Flow

- **D9.** Import gets a third source tile, "Test document", accepting PDF, DOCX and Google Doc from the Drive Picker or an upload. The Picker gets a mode that lists PDF, DOCX and Docs.
- **D10.** After reading, a review table replaces the usual preview: one row per question with type, stem, options, key, attached pictures/passage, and warnings. Rows can be edited, retyped or unticked. Create builds the quiz from ticked rows and opens it in the editor.
- **D11.** Title defaults to the document name.

### Content

- **D12.** All five types. MC keeps 2–6 options as written (no minimum distractor count). Matching, Ordering and FIB map to the existing encodings. Open-ended questions become free-response. Multi-select and anything else that doesn't fit become free-response with a warning.
- **D13.** Pictures are imported as `image` stimuli in the teacher's Drive (same folder and sharing as editor-added stimuli). DOCX/Doc: taken from `word/media` and anchored to the paragraph they sit in. PDF: the AI returns a page number and bounding box per figure; the client crops it from the pdf.js render. Nothing is stored server-side.
- **D14.** A picture used by several questions is one stimulus linked to each (`stimulusIds`). The AI proposes the links; the review table shows and edits them.
- **D15.** Browser reader brings in DOCX/Doc pictures only. PDF figures get a "picture not imported — add it in the editor" warning.
- **D16.** Reading passages become a new `text` stimulus type (`QuizStimulus.text`, `url: ''`), rendered in `QuizStimulusView` and linked like a shared picture. Its `readAloudText` is the passage itself with a new `readAloudSource: 'text'`, so read-aloud needs no OCR.

### Stub fill

- **D17.** The row-menu "Import questions" (paper stub) uses the same readers and review table. It fills stem, options and key onto the existing rows by number; option count follows the document. Placeholder rows stay pre-ticked, real text is never replaced without a tick (unchanged from paper Increment 3).

### Limits, cost and rollout

- **D18.** 25 MB per import, counting the test and key file together, and 20 pages per document. Larger files get a "split the file" message before anything is sent. (Bytes are the budget that bounds the work and they are checked before either file is opened; pages stay per document because the AI reader counts the test's pages on the server, where the key file — always read in the browser — is not in scope.)
- **D19.** One AI import counts as one use against the existing `quiz` daily AI limit, regardless of page count.
- **D20.** Files sent to the AI reader are processed in memory and not stored. The browser reader sends nothing.
- **D21.** Rollouts switch `admin_settings/quiz_document_import` with a toggle in the admin Rollouts panel, off at ship, plus a `quiz-document-import` feature permission, admin-only by default. The stub-fill change (D17) is gated by the same switch; with it off, "Import questions" keeps today's behaviour.

## PR 1 — Browser reader, review table, Import tile, keyless quizzes

- `utils/quizDocumentImport/` with the `ExtractedQuiz` type, the PDF text-layer reader, the DOCX reader (jszip, formatting markers, `word/media` images), the MC/T/F parser and key matcher (reuses and extends `parseNumberedQuestions`), and the tesseract fallback.
- Google Doc export as DOCX in `googleDriveService.ts`; Picker mode for PDF/DOCX/Docs.
- `ImportWizard`: accept `.pdf,.docx` for the new source; quiz adapter gets the "Test document" source and hands off to `QuizDocumentReviewModal`.
- `needsKey` on `QuizQuestion`, relaxed `validate`/save, Assign gate (D6, D7), "Needs answer" badge in the editor.
- DOCX pictures → `image` stimuli in Drive (D13, D15).
- Rollouts switch + admin toggle + feature permission (D21).
- Tests: parser fixtures for common layouts (answer block, bold key, `*` key, T/F, 3- and 5-option MC, no key), DOCX reader, adapter, Assign gate.

## PR 2 — AI reader and answer key file

- `functions/src/quizDocumentExtract.ts`: callable, `quiz-document-import` + `gemini-functions` checks, `quiz` quota (D19), 20-page/25 MB guard, structured schema covering all five types, figure boxes and passage links, extract-only prompt.
- Client picks the AI reader when allowed (D1), maps output to `ExtractedQuiz`.
- Optional key file slot (D8) for both readers.
- Tests: function schema/validation with recorded Gemini responses; client mapping; key-file matching.

## PR 3 — PDF pictures, shared links, text passages

- PDF figure cropping from AI boxes (D13); shared-picture linking and editing in the review table (D14).
- `text` stimulus type: `types.ts`, `QuizStimulusView`, editor stimulus panel, read-aloud (`readAloudSource: 'text'`), session/share copying, any Firestore rule or sanitizer that enumerates stimulus types.
- Tests: crop math, stimulus link mapping, text stimulus render and read-aloud text.

## PR 4 — Stub fill uses the new readers

- `PaperQuestionTextModal` switches to the shared readers and review table when the switch is on (D17); options and key fill onto stub rows and clear `needsKey`.
- Tests: stub fill with options and key, placeholder tick rules, switch-off keeps the old path.

## Open

- Translation: whether `text` passages join the quiz languages pane in PR 3 or later.
- Whether the answer-block parser should also accept a key written as a table (Doc tables export as tab-separated cells).
