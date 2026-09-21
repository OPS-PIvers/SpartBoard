# Quiz: printable stimuli on paper answer sheets

Grilled and settled 2026-09-21. Three stacked PRs to dev-paul, in the order below. No new flag: it rides the existing paper answer sheets gates. Verified against `dev-paul` at `b36985a96`; re-check line numbers before relying on them.

## Goal

- A teacher can put images, graphs, PDF pages and generated blanks (coordinate grid, number line, lined area) on the right half of the printed bubble answer sheet, so students have the reference beside their answers.
- Fully optional. A quiz with no sheet stimuli prints exactly as it does today.
- Import is unchanged from the teacher's side: only bubbles are read, and nothing drawn on a stimulus is kept.

## Current-state facts that drove the decisions

- Geometry lives in `utils/paperSheetLayout.ts` and is shared by the printer and the reader. Two columns of 25 rows (`ROWS_PER_COLUMN`, `COLUMNS_PER_PAGE`, `QUESTIONS_PER_PAGE = 50`), and columns fill top to bottom (`questionSlotOnPage`). So the right half is empty only on a page with 25 or fewer questions.
- `QUESTIONS_PER_PAGE` is read directly in `utils/paperSheetPrint.ts`, `utils/paperSheetReader.ts` (`rowsOnPage`), `utils/paperImportAssemble.ts:116`, `components/widgets/QuizWidget/components/PaperImportModal.tsx:246`, and mirrored as a literal `50` in `functions/src/paperBatchPlan.ts:11` (teammate batches, D16 of the PLC delegation plan). `PaperBatch.pagesPerSheet` comes from `pageCountForQuestions`.
- The page marker (`utils/paperSheetMarker.ts`) carries batch tag, seat, page and key flag only. It does not carry layout, so the reader has to get layout from the batch.
- The reader searches the outer 16% of each corner for registration marks (`READER_THRESHOLDS.registrationSearchFraction`), and the marker grid sits at x 140–200, y 22–38 mm. The header is x 20–135, y 20–46; the footer starts at y 266.4.
- **The reader binarises with a page-wide Otsu threshold** (`paperSheetReader.ts:144`). The grey choice letters inside bubbles (`BUBBLE_LETTER_GREY = 0xd0`) disappear only because Otsu cuts them out. A large mid-grey photo on the page would shift that threshold, and the letters could start reading as marks.
- `printHtmlDocument` (`utils/printHtmlDocument.ts`) calls `print()` right after `document.close()`. Nothing waits for images, so a remote `<img>` would print blank.
- Quiz stimuli (`QuizStimulus`, `QuizData.stimuli`) live in the teacher's Drive, link-shared as "anyone with the link" after a confirm (`StimulusManagerPanel.tsx:70-115`), and render through `driveImageUrl` (`utils/quizStimuli.ts:39`).
- `stimuli` survives saving and PLC sync only because it is listed field by field: `hooks/useQuiz.ts:294-302`, `hooks/useSyncedQuizGroups.ts:337-361, 383-396, 462-465, 513-520, 619-631`, and `quizFromContent` in `functions/src/getTeammatePrintContext.ts:342-353`. A new field that is not added there is silently dropped.
- Clipboard image paste already uploads to Drive in `GuidedLearningEditor.tsx:600-626`: a capture-phase window `paste` listener that skips inputs and calls `preventDefault`, so the Dock's global paste handler does not also fire.
- pdf.js is already a client dependency, and `PaperQuestionTextModal` / `utils/paperQuestionOcr.ts` already render PDF pages.
- Paper stays "reachable, not promoted": entry points are a row kebab item and a New Quiz caret option, and `QuizManager.paperSheets.test.tsx` asserts there is no paper tab or button.

## Decisions

### Layout

- **D1. Stimuli force a single-column sheet.** When a quiz has any sheet stimulus, every page of the batch prints 25 rows in the left column only, and the right half becomes the stimulus area. A 40-question test goes from 1 page to 2. A quiz with no sheet stimuli keeps two columns, byte-identical to today.
- **D2. Layout is recorded on the batch, not derived from the quiz.** New `PaperBatch.columnsPerPage?: 1 | 2`, absent = 2. The teacher can add or remove stimuli after printing, so reading layout from the quiz at import would misread stacks that are already on desks.
- **D3. The stimulus area is a fixed rect in `paperSheetLayout.ts`:** `STIMULUS_RECT_MM = { x: 84, y: 52, w: 94, h: 204 }`. It clears the left column (ends at x 73), the header and marker grid (end at y 46), the corner search windows (x ≥ 181.4 at the top and bottom), and the footer (y 266.4). A layout test asserts all four, computed from the real constants, so moving any of them fails the test.
- **D4. Otsu ignores the stimulus zone on every page.** The histogram is built from the page minus `STIMULUS_RECT_MM` plus a 6 mm margin, at nominal scale (binarisation runs before the registration fit). It is done on every page, not only single-column ones, because layout is unknown until the marker is decoded. Bubble ink is the same on both halves, so a two-column page loses nothing. Existing reader fixtures must read identically.

### Content and sources

- **D5. Sources:** device upload, Drive picker, clipboard paste, the quiz's own image stimuli, and built-in templates. No URL paste.
- **D6. Uploads, paste and PDF pages go to the teacher's Drive** through the same upload and "anyone with the link" confirm as quiz stimuli (`StimulusManagerPanel` intake). PLC teammates' browsers must be able to load the file (D14).
- **D7. File types:** PNG, JPG, GIF, WebP, plus PDF. For a PDF the teacher picks one page. It is rendered with pdf.js at 200 dpi and uploaded as a PNG, so printing never touches pdf.js.
- **D8. "From this quiz"** lists the quiz's `image` stimuli. Picking one copies its `driveFileId`/`url` into a sheet stimulus. No Drive copy is made, and the two are independent afterwards.
- **D9. Templates are specs, not files.** They are drawn as SVG at print time, so they are always sharp and need no Drive. Each kind has a few parameters:
  - Coordinate grid: 1 or 4 quadrants, axis min/max, step, axis numbers on/off. Square aspect.
  - Number line: min, max, step. Full width, short.
  - Graph paper: 5 mm squares, a height.
  - Lined writing area: a height, 8 mm ruling.
  - Blank box: a height.

### Arrangement

- **D10. Several stimuli per page, stacked top to bottom**, capped at 4 per page.
- **D11. Each stimulus defaults to every page and can be pinned to one page.** If the question count drops and a pinned page no longer exists, the print modal flags that row and it does not print until it is re-pinned.
- **D12. Auto-fit, never crop or stretch.** Each item's natural height is its height at the full rect width (images use their stored pixel aspect, templates their spec). If the stack plus captions plus 4 mm gaps fits in 204 mm, it prints top-aligned at natural size. Otherwise every item scales down by the same factor and is centred horizontally. Fitting is a pure function in `utils/paperSheetStimulusLayout.ts`, shared by the modal preview and the printer.
- **D13. Optional caption per stimulus**, printed under it at 9 pt, at most 120 characters and 2 lines. Blank means no caption and no reserved space.

### Data, sharing and printing

- **D14. Saved on the quiz, synced like content.** New `QuizData.paperSheetStimuli?: PaperSheetStimulus[]`. It is added to every pass-through listed above (save, duplicate, share/import shared, PLC publish/pull/restore, and `quizFromContent`), so every PLC member's copy and every delegated teammate print carries the same stimuli.
- **D15. Every sheet in the stack carries them**: named sheets, spares and the key sheet. The layout and stimuli are the same for the whole batch.
- **D16. Images are loaded before the print window opens.** Each image is fetched once to a blob and handed to the print document as an object URL (same origin as the `about:blank` print window). A load failure blocks printing with the stimulus named ("Couldn't load 'Unit 3 graph' — is it still in your Drive?") instead of printing an empty box. `printHtmlDocument` gains an option to await `img.decode()` for every image before calling `print()`, and object URLs are revoked on close.
- **D17. Print happens after the batch save, as today.** The batch now also stores `columnsPerPage`, so a stack's layout is fixed at print time whatever happens to the quiz later.

### Scope and rollout

- **D18. Editing lives only in Print answer sheets.** It is a collapsed "Add to the answer sheet" section with a live page-1 thumbnail and a page selector. Changes save to the quiz when the teacher prints (or on an explicit Save in that section). There is no quiz editor panel. For the "Paper test" stub path, the stimuli are saved with the stub when `onCreateQuiz` runs.
- **D19. Import is unchanged: bubbles only.** Nothing drawn on a stimulus is cropped, stored or shown (paper plan Q4 stands).
- **D20. No new flag.** The feature is visible wherever paper answer sheets already are (Rollouts `paper_answer_sheets` + the `paper-answer-sheets` feature permission).
- **D21. The test paper (`paperTestPrint.ts`) is unchanged.** Sheet stimuli print only on the answer sheet.

## Data model

```ts
export type PaperSheetTemplate =
  | { kind: 'coordinate-grid'; quadrants: 1 | 4; min: number; max: number; step: number; showNumbers: boolean }
  | { kind: 'number-line'; min: number; max: number; step: number }
  | { kind: 'graph-paper'; heightMm: number }
  | { kind: 'lined'; heightMm: number }
  | { kind: 'blank-box'; heightMm: number };

export interface PaperSheetStimulus {
  id: string;
  /** Authoring-only name shown in the print modal. */
  label: string;
  source: 'image' | 'template';
  /** image: Drive file; its pixel size drives auto-fit without loading it. */
  driveFileId?: string;
  url?: string;
  widthPx?: number;
  heightPx?: number;
  template?: PaperSheetTemplate;
  caption?: string;
  /** 1-based page; absent = every page. */
  page?: number;
}

// QuizData
paperSheetStimuli?: PaperSheetStimulus[];

// PaperBatch
/** Answer columns per page; absent = 2 (every batch printed before this plan). */
columnsPerPage?: 1 | 2;
```

`questionSlotOnPage`, `bubbleRectMm`, `questionRowRectMm` and `pageCountForQuestions` take a `columnsPerPage` argument (default 2). `QUESTIONS_PER_PAGE` stays as the two-column constant and gains a `questionsPerPage(columns)` helper. Every caller listed in the facts section switches to the batch value.

## PR 1 — Single-column layout, end to end, no UI

- `paperSheetLayout.ts`: `columnsPerPage` threaded through the slot and page helpers, `STIMULUS_RECT_MM`, and the D3 clearance test.
- `paperSheetPlan.ts` and `functions/src/paperBatchPlan.ts`: accept `columnsPerPage` and write it on the batch, and the `pagesPerSheet` math follows it. The parity test (`tests/utils/paperBatchPlanParity.test.ts`) covers both layouts.
- `paperSheetPrint.ts`: renders single-column when the job says so (no stimuli yet).
- Reader, `paperImportAssemble.ts` and `PaperImportModal.tsx` use the batch's columns. `rowsOnPage` takes a per-page capacity.
- D4 Otsu exclusion, with tests: every existing fixture reads identically, and a synthetic page with a large mid-grey and a large black block in the stimulus rect reads the same answers as without them.
- `createTeammatePaperBatchV1` passes `columnsPerPage` through. It is absent today, so behaviour is unchanged until PR 2 sends it.

## PR 2 — Model, rendering, print-modal editor

- `PaperSheetStimulus` type, `QuizData.paperSheetStimuli`, and every pass-through in D14, plus a test that round-trips the field through save, duplicate and PLC publish/pull.
- `utils/paperSheetStimulusLayout.ts` (D12), unit-tested for fit, the shrink factor, the 4-per-page cap and pinned pages beyond the end.
- `paperSheetPrint.ts` draws the stack in `STIMULUS_RECT_MM` from the fitted layout. `printHtmlDocument` gets the await-images option. The print modal resolves images to blobs first (D16).
- `PaperPrintModal`: "Add to the answer sheet" section with upload, Drive picker, clipboard paste (the GL capture-listener pattern), "From this quiz", captions, page pinning, reorder and remove, a live page-1 thumbnail, and an updated page count. Selecting any stimulus switches the job to one column.
- The teammate print path (`PlcTeammatePrintModal`) passes the returned quiz's stimuli through unchanged.

## PR 3 — Templates and PDF pages

- SVG renderers for the five templates in D9, used by both the thumbnail and the print. Snapshot tests on the SVG, plus a check that no template draws outside its box.
- Template picker with its parameters in the modal section.
- PDF source: page picker (reusing the pdf.js loader from `paperQuestionOcr.ts`), rendered at 200 dpi and uploaded as a PNG (D7).

## Verification

- Unit: layout clearance, both parity layouts, Otsu exclusion, fit function, template SVG bounds, field pass-through.
- A real print-and-scan of a single-column sheet with a dark photo and a coordinate grid, imported on the copier used for the 2026-09-18 scan, before the PR 2 merge counts as done. This is the only thing that proves D4 on real toner.
- Regression: a two-column batch printed before PR 1 still imports.

## Open

- "Anyone with the link" sharing (D6) matches quiz stimuli, but these images are never shown to students online. Domain-only sharing would be tighter, but it is unproven that `lh3` renders domain-shared files for a teammate. Kept as link-sharing unless Paul wants it tested.
- Colour images print as the copier makes them. There is no greyscale or contrast option in v1.
