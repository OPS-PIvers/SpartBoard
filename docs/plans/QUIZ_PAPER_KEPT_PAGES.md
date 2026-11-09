# Quiz paper sheets: kept pages, marks on the student's own work, and image markup

**Status:** plan only; no code has shipped. Settled with Paul 2026-11-09 in a four-round decision interview after a read of the current code.

**Flags:** two new `GlobalFeature` ids, both `stage: 'preview'`, `defaultAccessLevel: 'admin'`, `missingDocPublic: false`, `afterLaunch: 'keep'`, `category` matching the other paper flags:

- `paper-kept-pages`: store each student's pages at import and print them. Requires `paper-answer-sheets`. Stays admin-only until the privacy review (PT-149) is done.
- `paper-image-markup`: the markup tool and its printing. Requires `paper-handwritten-responses`. Works on today's handwriting crops, so it does not wait on PT-149.

**Delivery:** a contracts PR (Wave 0), then two waves of parallel PRs with disjoint file ownership (§5). Each PR targets `dev-paul` and is verified on `spartboard-dev`.

## Goal

A teacher scans a stack of paper tests as today. Then:

1. Each student's pages are kept, straightened, alongside the answers.
2. Results print's sheet layout prints the **student's own page** with the chosen report options drawn on top (marks on missed only, marks on everything, the key, points), instead of a redrawn sheet. One sheet of paper replaces the written paper, the key and the report.
3. In the grader, the teacher marks up a handwritten answer's image with highlights, boxes, circles, stamps and pinned comments.
4. That markup prints on the student's work, in the report layout and on the kept page.

## 1. Current-state facts (verified 2026-11-09)

### Import

- One PDF or image per import, rasterized in the browser at 200 dpi (`utils/paperScanRaster.ts:20-22, 242-278`). Each page canvas is released after it is read.
- Every page carries a 60-cell marker (batch tag, seat, page, flags, CRC; `utils/paperSheetMarker.ts`) and four 5 mm registration squares (`utils/paperSheetLayout.ts:17-51`).
- The reader fits a 6-parameter affine from sheet millimetres to scan pixels and rejects a page whose mean residual is over 1.5 mm (`utils/paperSheetReader.ts:89-158, 699-701`). It detects an upside-down page (:715-727).
- The fit (`PageRead.mmToPx`) lives only inside the read loop. It is used to cut handwriting crops and then dropped (`PaperImportModal.tsx:563-573`).
- All geometry is millimetres from the top-left of a US Letter portrait page (`paperSheetLayout.ts:1-14`). `layoutVersion: 2` batches store a page map with each written box's `boxMm` and each bubble row's `originMm` (`types.ts:6357-6386`); other batches compute positions from constants (`bubbleRectMm`, `questionRowRectMm`).

### What is stored today

- **No full pages.** Decided in three shipped plans: answer sheets Q4 ("nothing is uploaded to Storage and no retention obligation is created"), handwritten D20 ("page headers (student names) and bubble areas never are" uploaded), results print D22 and its out-of-scope list ("Storing scans").
- **Handwriting crops** (`layoutVersion: 2` only): deskewed grayscale WebP at 150 dpi with a 2 mm margin, 2 MB cap (`paperSheetReader.ts:640-680`, `paperScanRaster.ts:148-208`). Uploaded to `paper_written_crops/{uid}/{scanId}/{seat}/{questionId}.webp` (`utils/paperWritten.ts:162-170`), recorded as a `ResponseArtifact` of kind `handwriting` (`functions/src/importPaperResponses.ts:791-819`).
- **Archive and sweep.** Each crop is archived to the teacher's Drive under `Quiz Responses/{quizTitle}/` and the Storage object deleted (`functions/src/quizMediaArchive.ts:1345-1358, 1521-1527`). Without Drive it waits as `awaiting-drive`. The sweep deletes unimported crops after 7 days, unreferenced crops, and awaiting-Drive crops after 60 days with a warning email at day 53 (`functions/src/paperTranscriptionSweep.ts:47-51, 376-515`).
- **Access.** `storage.rules:385-394` is create-only for the owning uid; nobody reads crops from the client. Reads go through `getPaperWrittenCropV1` (`functions/src/paperWrittenCallables.ts:274-370`) or, once archived, straight from the teacher's Drive (`utils/paperCropFetch.ts:63-113`).
- **Ownership.** Whoever imports owns the crops (handwritten D4); a PLC teammate only prints. Crops never reach PLC views (D40).

### Results print

- Built as HTML in a pop-up, no PDF library (`utils/quizStudentReportPrint.ts:697-738, 869-886`, `utils/printHtmlDocument.ts`).
- Options are `QuizResultsPrintOptions` (:149-163): `includeQuestions`, `markAnswers`, `keyMode` (`off | missed | all`), `questionScope` (`all | missed`), `layout` (`report | sheet | both`) and the show toggles. Presets live in `utils/quizResultsPrintPresets.ts`.
- The **sheet** layout redraws the page in millimetres from the batch (`utils/paperSheetReprint.ts:76-144`, `utils/paperSheetPrint.ts:941-976`) and draws each handwriting crop inside its box with points and a comment strip (`writtenSheetFill`, `quizStudentReportPrint.ts:629-656`). It never uses the scan.
- The reprint leaves out the marker and registration squares so it can't be scanned back in (results print D23).

### Grading and markup

- Written answers are graded in `FreeResponseGrader.tsx`, which mounts `components/quiz/paper/PaperCropPanel.tsx` (zoom, contrast, transcript edit).
- `WrittenAnswerGrade` (`types.ts:6530-6579`) holds `pointsAwarded`, `overallComment`, `rubricScores` and `annotations`. Annotations are text offsets into the transcript (:6586-6601). An answer with no transcript (`paperTranscript: 'image'`) has no text, so highlights are not offered (`FreeResponseGrader.tsx:1756-1772`).
- No ink or shapes on a quiz image exist anywhere. The Drawing widget has a shape model (`DrawableObject`: `path | rect | ellipse | line | arrow | text | image`, `types.ts:1809-1915`) with hit testing and a command stack under `components/widgets/DrawingWidget/`.

## 2. Decisions

| ID  | Decision                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Print only for now. Storage paths, the artifact record and the read callable are shaped so a student on-screen view can be added without a migration; the callable refuses students until then.                                                                                                           |
| K2  | Markup tools: highlighter, pinned text comment, box, circle, stamps. No freehand pen.                                                                                                                                                                                                                     |
| K3  | Built for laptop with mouse or trackpad. Pointer events throughout so touch works, but it is not tuned for stylus.                                                                                                                                                                                        |
| K4  | Value order: kept pages in the print, marks on the scan, then markup. Markup ships in parallel because it does not need kept pages.                                                                                                                                                                       |
| K5  | Each student's page is saved **straightened to sheet coordinates** at import, uploaded, archived to the teacher's Drive and deleted from Storage, the way crops are. **Reverses answer sheets Q4, handwritten D20 and results print D22** for kept pages. PT-149 (privacy review) gates opening the flag. |
| K6  | All paper sheets, bubble-only included. The import dialog has a "Keep a copy of each student's pages" switch, on by default when the flag is on. Off means the import behaves exactly as today.                                                                                                           |
| K7  | Markup is made per answer in the grader and stored in sheet millimetres with its page number, so the same data draws on a crop or on a full page. A whole-page markup view is a later plan.                                                                                                               |
| K8  | When a kept page exists, the sheet layout draws it as the background with the same options on top. With no kept page (switch off, older import, page missing) it falls back to the redrawn sheet, per student. No new layout or preset.                                                                   |
| K9  | Bubble marks on a scan: a check or X in the margin beside the question number; with the key on, a ring around the correct bubble. Shape-coded so it reads on a black-and-white printer and never covers the student's mark. `questionScope: 'missed'` draws marks only on missed rows.                    |
| K10 | Comments print as numbered pins on the work with the text in a numbered list under that answer.                                                                                                                                                                                                           |
| K11 | Stamps: check, X, question mark, star. Plus the teacher's own saved comment snippets, dropped as a pinned comment in one click.                                                                                                                                                                           |
| K12 | A newer scan keeps existing markup, shown with a "made on an earlier scan" notice until the teacher confirms or edits it. The older page is replaced.                                                                                                                                                     |
| K13 | Retention matches crops exactly: Drive when connected, else 60 days in Storage with the day-53 email; unimported pages deleted after 7 days; unreferenced pages deleted.                                                                                                                                  |
| K14 | Image markup and transcript highlights coexist. The print draws image markup on the handwriting and text highlights on the typed answer, following the existing handwriting / typed / both setting.                                                                                                       |
| K15 | Two flags as listed at the top.                                                                                                                                                                                                                                                                           |
| K16 | Pages are stored grayscale WebP at 150 dpi (1275 × 1650 px), under the existing 2 MB cap. Colored pencil prints gray.                                                                                                                                                                                     |
| K17 | The key sheet's page is never kept.                                                                                                                                                                                                                                                                       |
| K18 | No backfill. Imports made before this ships print the redrawn sheet; their crops can still be marked up.                                                                                                                                                                                                  |
| K19 | Ownership follows D4 and D40: pages belong to whoever imports and never appear in PLC views.                                                                                                                                                                                                              |
| K20 | A printed kept page must not be importable. The print covers the marker and the four registration squares with white patches (extends results print D23).                                                                                                                                                 |
| K21 | Markup items are a narrowed subset of the Drawing widget's shapes (`rect`, `ellipse`, plus `highlight`, `pin`, `stamp`) in millimetres, not a second drawing engine. Hit testing and undo reuse `DrawingWidget/hitTest.ts` and `useCommandStack.ts` where they fit.                                       |

## 3. Design

### 3.1 Kept pages

- **Straighten.** A new `straightenPage(canvas, mmToPx)` in `utils/paperSheetReader.ts` warps the whole page to a 215.9 × 279.4 mm canvas at 150 dpi, upright, the same way `cropWrittenBox` warps one box. After this, pixel = mm × 150 / 25.4, so nothing about the fit needs storing.
- **Encode.** Reuse the crop encoder in `paperScanRaster.ts` (WebP 0.8, PNG fallback, halve on overflow).
- **Path.** `paper_pages/{uid}/{scanId}/{seat}/{page}.webp`. Storage rule mirrors `paper_written_crops`: create-only, owner, non-anonymous, not a student role, no overwrite, ≤ 2 MB, WebP or PNG. No client read.
- **Local queue.** Blobs go through `utils/paperCropStore.ts` under a `pages:{batchId}` key and upload in the same 3-at-a-time background queue as crops.
- **Record.** The import payload gains an optional `pages: { seat, page, storagePath }[]`. The server verifies each path sits under the caller's prefix and scan id, then records a `ResponseArtifact` of kind `paper-page`, id `pg_{scanId}_{page}`, on that student's response. A payload without `pages` (an open tab on the previous client, or the switch off) imports as today.
- **Archive.** `quizMediaArchive.ts` archives `paper-page` artifacts to `Quiz Responses/{quizTitle}/Pages/` named `Family_Given_p{page}`, then deletes the Storage object. Only the live `paperScanId`'s pages archive, as with crops.
- **Sweep.** `paperTranscriptionSweep.ts` applies the three crop rules to `paper_pages/`.
- **Read.** New `getPaperPageV1` callable: session teacher only (K1). Once archived the browser reads from Drive, as `paperCropFetch.ts` does.
- **Quota.** Kept pages are not AI calls and are not charged to the handwriting quota.
- **Hybrid** ("written answers on paper"): pages attach to the device response the import already merges into.

### 3.2 Scan-backed sheet print

- New module `utils/paperScanSheetPrint.ts` builds one print page per kept page: an `<img>` sized to the full page with an absolutely positioned `<svg viewBox="0 0 215.9 279.4">` over it. Everything on top is drawn in millimetres from the same geometry the reprint uses (page map when present, else the arithmetic helpers).
- Drawn on top, in this order: white patches over the marker and registration squares (K20); margin check or X per question (K9); key ring (K9); points per written box; image markup (§3.3).
- Marks sit in the left margin of each row or box header; the layout already keeps that strip clear of answers.
- `ResultsPrintModal.tsx` fetches kept pages as data URLs alongside crops and passes them in the job. A student with no page for a sheet page gets the redrawn page for that page only (K8).
- "Every attempt": only the live scan has pages; earlier attempts use the redrawn sheet.
- Faint or tilted scans are already straightened; a contrast pass is out of scope.

### 3.3 Image markup

- **Model.** `WrittenAnswerGrade.imageMarkup?: PaperImageMarkup`:
  - `scanId`: the scan it was made on (K12).
  - `page`: sheet page number.
  - `reviewedForScanId?`: set when the teacher confirms markup against a newer scan.
  - `items: PaperMarkupItem[]`, each `{ id, kind, rectMm | atMm, color?, symbol?, comment? }` with `kind` one of `highlight | rect | ellipse | stamp | pin`. Any item may carry a `comment`; a `pin` always does.
  - Limits: 40 items per answer, 500 characters per comment. Enforced in the editor and in rules if the grading map is validated there.
- **Coordinates.** A crop is its `boxMm` plus a 2 mm margin at 150 dpi, so crop pixels convert to sheet millimetres with the page map alone.
- **Editor.** New `components/quiz/paper/markup/` (toolbar, overlay, comment popover), mounted over the image in `PaperCropPanel.tsx` behind `canAccessFeature('paper-image-markup')`. It follows the panel's zoom. Undo and redo through a command stack; saves through the existing grade-save path.
- **Rendering.** New pure module `utils/paperMarkupRender.ts` turns markup items into an SVG string plus the numbered comment list (K10). Both the editor's read-only view and the print use it.
- **Report print.** The report layout wraps each `<img class="hw">` with the SVG and prints the comment list beneath (§5, slice D). Comments number per answer.
- **Snippets.** Saved comments live in the profile's `savedWidgetPresets.quizMarkupComments` (a string list, cap 30), never on a widget.
- **Rescan.** When `imageMarkup.scanId` differs from the answer's `paperScanId` and `reviewedForScanId` does not match, the panel shows the notice with "Looks right" and "Clear markup".

### 3.4 Compatibility

- Every new field is optional and every new callable additive, so a previous client in an open tab keeps working at a `main` release.
- No read rule is tightened.

## 4. Risks and checks

- **Privacy (PT-149).** Full pages carry the name header and everything a student wrote in the margins. The flag stays admin-only until the review covers it.
- **Rules size.** One new Storage block; Firestore changes only if `grading` or `artifacts` shapes are validated in rules. Run `pnpm run check:rules-size` in Wave 0 and test the release against `spartboard-dev`.
- **Import time and upload size.** About 150 to 400 KB per page; a 30-student, 2-page stack is roughly 10 to 25 MB in the background queue. Slice A measures a real stack and reports it in its PR.
- **Print weight.** A class set of full-page images in one pop-up is heavy. Slice E loads pages per period if a 30-student job is slow or fails, and reports the measurement.
- **Printer margins.** A full-bleed image is clipped by printers that can't print to the edge. The redrawn sheet already prints at this size, so slice E matches its `@page` rules and checks nothing lands in the clipped strip.
- **Storage lifecycle.** The 90-day bucket rule mentioned in the handwritten plan is not in the repo. Wave 0 checks whether it exists on both projects and, if so, records that `paper_pages/` needs the same.

## 5. Waves

File ownership is exclusive within a wave. `config/tourAnchors.ts`, `config/tourSurfaces/quiz.ts` and locale files are append-only for every slice; each slice registers its own anchors when it renders them, and a conflict there is resolved by keeping both sides.

### Wave 0: contracts (one PR, S)

- `types.ts`: `ResponseArtifact` kind `paper-page`; `PaperImageMarkup`, `PaperMarkupItem`; `imageMarkup` on `WrittenAnswerGrade`; both `GlobalFeature` ids; `savedWidgetPresets.quizMarkupComments`.
- `config/featureDefaults.ts`, `functions/src/featureMissingDoc.ts`: both flags.
- `functions/src/paperWrittenTypes.ts` and its client twin: the optional `pages` payload field and the `getPaperPageV1` request and response types.
- `utils/paperWritten.ts`: `paperPageStoragePath`.
- `storage.rules`: `paper_pages/` block, with a rules test.
- `firestore.rules`: only if `grading` or `artifacts` are shape-checked there.
- Empty, typed stubs for `utils/paperMarkupRender.ts` and `utils/paperScanSheetPrint.ts` so later slices import stable signatures.
- Run `pnpm run type-check` and `check:rules-size`.

### Wave 1: four slices in parallel

| Slice                         | Size | Owns                                                                                                                                                               | Does                                                                                                                                      |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A. Import keeps pages         | M    | `utils/paperSheetReader.ts`, `utils/paperScanRaster.ts`, `utils/paperCropStore.ts`, `components/widgets/QuizWidget/components/PaperImportModal.tsx`                | `straightenPage`; the keep-pages switch (K6); encode, queue and upload pages; send `pages` in the import call. Skips the key sheet (K17). |
| B. Server records pages       | M    | `functions/src/importPaperResponses.ts`, `functions/src/quizMediaArchive.ts`, `functions/src/paperTranscriptionSweep.ts`, `functions/src/paperWrittenCallables.ts` | Validate and record `paper-page` artifacts; archive to Drive; sweep; `getPaperPageV1`. Rescan replaces the older page (K12).              |
| C. Markup editor              | L    | `components/quiz/paper/markup/*` (new), `components/quiz/paper/PaperCropPanel.tsx`, `components/widgets/QuizWidget/components/FreeResponseGrader.tsx`              | The five tools, undo, save into `imageMarkup`. Works with or without a transcript (K14).                                                  |
| D. Markup in the report print | M    | `utils/paperMarkupRender.ts`, `utils/quizStudentReportPrint.ts`, `utils/paperSheetPrint.ts`                                                                        | SVG and comment-list renderer; draw markup on crops in the report layout and in the redrawn sheet's boxes.                                |

A and B meet only at the Wave 0 payload type. C and D meet only at `PaperImageMarkup` and the `paperMarkupRender` signature; C uses the stub until D merges, then swaps its read-only view to the real renderer in a follow-up commit.

### Wave 2: two slices in parallel (after A, B and D merge)

| Slice                         | Size | Owns                                                                                                                                                                                               | Does                                                                                                                       |
| ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| E. Scan-backed sheet          | L    | `utils/paperScanSheetPrint.ts`, `utils/quizStudentReportPrint.ts`, `utils/paperSheetReprint.ts`, `components/widgets/QuizWidget/components/ResultsPrintModal.tsx`, `utils/paperPageFetch.ts` (new) | Fetch pages; scan background with marks, key rings, points, markup and the white patches (K8, K9, K20); per-page fallback. |
| F. Snippets and rescan notice | S    | `components/quiz/paper/markup/*`, `components/quiz/paper/PaperCropPanel.tsx`                                                                                                                       | Saved comment snippets (K11); the earlier-scan notice (K12).                                                               |

### After the waves

- Add both flags to the `PAUL_TODO.md` flags table with their retire or graduate prompts, in the PR that makes each one usable (D for markup, E for kept pages).
- Move this plan to `docs/plans/shipped/` once E and F merge.
- Changelog entries are written when each flag opens, not at merge.

## 6. Verification per slice

- **A:** unit test `straightenPage` on a rotated and an upside-down fixture (corner marks land within 1 px of their mm positions). On `spartboard-dev`, import a real scanned stack with the switch on and off.
- **B:** function tests for path validation (wrong uid, wrong scan id, key-sheet seat), archive, each sweep rule, and student refusal in `getPaperPageV1`.
- **C:** component tests for each tool, the item cap and undo; `/show-me` on a crop-only answer and on a transcribed one.
- **D, E:** snapshot tests of the built HTML for each preset; a printed page from a real scan checked on paper, including a black-and-white print and a re-import attempt of the printed page (must be refused).
- **F:** component tests; snippets survive a reload.

## 7. Out of scope

- Students seeing kept pages or markup on screen (K1).
- Whole-page markup, markup on bubble areas or margins (K7).
- Freehand ink (K2).
- Keeping pages for imports made before the flag (K18).
- Colour pages (K16).
- Kept pages or markup in PLC views or norming (K19).
