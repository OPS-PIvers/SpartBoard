# Quiz: reliable test and answer-key import

Grilled and settled 2026-09-24; revised the same day after a second grilling (R23–R32). Six stacked PRs to dev-paul, in the order below. Builds on `QUIZ_DOCUMENT_IMPORT.md` (D1–D21), which it amends where noted.

All six PRs shipped 2026-09-24. `QUIZ_EXAMVIEW_IMPORT.md` (2026-09-25) follows up after the ExamView test still read 6 of 19 questions: a decimal option (`357.4`) opened a bogus question 357. That plan amends R5 (E2) and closes the RTF-picture gap (E11).

## Goal

- A teacher's paper test comes in with every question, every answer choice in its own slot, and the key applied, without AI.
- Uploading a separate answer key at the same time as the test is obvious: two equal drop zones, not a hidden button.
- Grid and table layouts, section-restarted numbering, Part A/B items and publisher answer guides read correctly. What can't be read is flagged in review, never silently merged into another question.

## What fails today (measured 2026-09-24)

The browser reader was run on three real files Paul supplied (not committed; publisher content). These results drive the decisions.

- **ExamView-style test (Honors Bio, 19 Qs, no key).** 10 of 15 MC questions merge a grid: options print as `a. 357.4 ⟶ d. 35,740` on one line, so A = "357.4 d. 35,740" and D/E never exist. The section heading "Graphing Problem-5 points" is appended to Q15 option C. "ELT 1.1-I can explain…" learning-target lines are prepended to stems. Three PDF pictures are dropped (D15).
- **Great Minds Arts & Letters test (3 sections).** Numbering restarts at 1 in each section. The parser only opens a question on a higher number (`parseQuestions.ts`), so Section 3 Q1–5, its directions and its passage are all appended to Section 2 Q5 option D. Part B of every Part A/B item is appended to Part A's option D. The running footer "© 2025 Great Minds PBC 4 | Module 1 | …" is appended to options at page breaks. The Self-Reflection survey lands inside Q8, which becomes MC. A "draw a line to sort" item becomes free-response with the cell text jumbled.
- **Great Minds answer guide (separate key file).** `readAnswerKeyFile` finds **0 entries**. The key is `ITEM n | stem … Correct Answer: c <text>` inside a 3–4-column table (Stem and Answer Key | Distractor Analysis | Scoring Rules). The Distractor Analysis column repeats "d Correct Answer: …" for the right choice. The guide also has multi-answer items ("Correct Answers: a, b"), an ordering answer (1–4 with text), a sorting answer (Literal:/Figurative:), point values ("4 POINTS") and free-response rubrics.
- **Word/Doc test with the options in a table** (`a | d` / `b | e` / `c`). `readDocx` emits one line per table cell, row by row (a, d, b, e, c). `followsInSequence` rejects D after A, so D becomes a continuation of A. A tab between options (`a. X⇥d. Y`) is flattened to one space and merges the same way.
- **Key spill.** Any line after the last question that isn't a new, higher-numbered question is appended to the last option. That covers every key `findAnswerKey` misses: 1–2 unheaded entries, entries with extras (`1. B 2pts`, `1. B (p. 4)`), and the Great Minds form.
- **Word auto-numbering.** `docxReader` reads only `w:t` text. A test whose `1.` and `a.` come from Word's automatic list numbering (`w:numPr` → `word/numbering.xml`) has no numbers or letters in its lines, so no question opens at all. (Found in code review, not in Paul's three files; it is the default layout of a teacher-typed Word test.)
- **Where the UI stands.** A separate-key slot exists only in `ImportWizard` behind "Add a separate answer key (optional)". `PaperPrintModal` and `PaperQuestionTextModal` have none. `PaperQuestionTextModal` accepts images, which the importer then rejects (`documentKind` → `UNREADABLE_FILE`). The AI reader is off by default (`aiReaderOff = true`), so teachers get the browser reader.

## Decisions

### Engine

- **R1.** The browser reader is the reader to make reliable; nothing here depends on AI. The AI reader stays opt-in. Its only change is R29's optional `section` and `label` fields. Its output goes through the same post-processing (R10 key merge, R8 spill guards, R6 grid check, R19 review warnings).
- **R2.** Layout-aware lines. `DocLine` gains `segments: {text, x?, emphasized?}[]`. A segment boundary is a column gap:
  - DOCX: a tab or a table cell. A Word table row becomes **one** line with one segment per cell, where today it is one line per cell. A cell holding several paragraphs is one segment, its paragraphs joined by a space. A `gridSpan` cell is one segment; a `vMerge` continuation cell is an empty segment. A nested table is flattened into its parent cell's segment.
  - RTF: `\tab`, `\cell` and `\nestcell` are segment breaks and `\row` ends the line. Today `\cell` starts a new line, so RTF moves to the same one-row-per-line shape as DOCX.
  - PDF: an x-gap wider than ~1.5× the line's median glyph width.
  - `text` stays the segments joined by a single space, so current consumers keep working. The key reader's number-cell-then-answer-cell path (`NUMBER_ONLY` + next line in `answerKey.ts`) is kept for PDFs and replaced for DOCX/RTF by reading the row's two segments. Its existing test keeps passing.
  - Emphasis moves from per-paragraph to per-run, so a split keeps bold on the right option.
- **R3.** OCR produces the same segments. `pdfBrowserDeps` `recognizePage` returns Tesseract words with bounding boxes (not a flat string), and the PDF line grouper builds segments from them. Scanned PDFs and photos go through the same layout code as the text layer.
- **R4.** Page structure, before parsing:
  - **Headers/footers.** A line whose digit-normalized text recurs in the top or bottom ~10% of at least half the pages (minimum 3 pages) is dropped. On a 2-page document the line must recur on both pages and contain a page number or a `©`/`(c)`. DOCX and RTF headers and footers are already skipped by their readers.
  - **Two-column pages.** A page is read left column, then right, when a vertical gutter separates two text bands that each span ≥60% of the page's text height and the right band contains question openers. Short option grids (Bio test options at x≈302) never meet that test.
  - **Column bands for tables.** Segment start-x values cluster into bands per page. Key readers use the bands (R11–R12) to keep one table column from bleeding into another.

### Parsing questions

- **R5.** An option marker (`a.` `(b)` `C)`) opens a new option mid-line only when it starts a segment, i.e. it follows a column gap. "Vitamin A. is…" inside one segment never splits. _Amended by `QUIZ_EXAMVIEW_IMPORT.md` E2: two or more spaces before a marker also count as a gap when every marker on the line forms a valid letter run._
- **R6.** A question's options are collected in any letter order, then sorted A→F. The set must be contiguous from A with no duplicates. Otherwise the row gets "Answer choices may be out of place — check them", and the letters as read are kept rather than guessed at. The `followsInSequence` in-order requirement goes away for letters seen inside the same question block.
- **R7.** Sections. A section heading (`Section 2`, `Part II`, a short standalone heading such as "Multiple Choice" or "Short Answer…", or an all-caps line), or a question number dropping back to 1 after ≥2 questions, starts a new section. Questions are numbered 1→N straight through the quiz. Each question keeps `ref: {section, item, part?}` for key matching, and its printed label is kept (R23). Sections that contain no numbered questions (Fluency read-aloud) contribute nothing.
- **R8.** Spill guards.
  - A section heading, a key heading, or a line that parses as a key entry never continues an option or stem. It ends the question.
  - After the last question, nothing is appended to it except lines that are plainly its continuation: an option wrap at the option's indent or segment position.
  - Recurring headers/footers are already gone (R4).
- **R9.** Item shapes.
  - **Part A / Part B** within one number become two questions, "5A" and "5B", each with its own options and key. The text before "Part A" is shared as R25 says. A review note says "Part B credit doesn't depend on Part A here."
  - **Ordering.** A stem like "Number the events… / put … in order / sequence" with lettered items becomes `Ordering` (`correctAnswer` = `item1|item2|…` from the key).
  - **Sorting.** "Draw a line to sort / sort into categories" becomes free-response. The cell text is listed cleanly as `Literal: … / Figurative: …` columns, with a note to rebuild it.
  - **Learning-target lines.** A line matching `^<code>?\s*[-–:]?\s*I can …` (code like `ELT 1.1`, `ELT-1.6`, `LT3`) is removed from the stem. It becomes `suggestedTarget: {code?, label}` on that question and every following question, until the next target line or section heading (R20).
  - **Ungraded items.** Items under a Self-Reflection/survey/reflection heading, or that the key marks "not scored" / "answers will vary" with no key, get `suggestUntick` with a reason and start unticked in review.

### Answer keys

- **R10.** One key-merge step for both readers and both key sources.
  - A separate key file wins over a key found inside the test. The row is flagged "Test file said C, key file said B — using B."
  - A key inside the test is always removed from question text, even when a key file is supplied.
  - Keys match by `ref` (section + item + part) when both sides have sections. A key's "Section 2" matches the test's "Section 2" by printed number, else by order among sections that hold items. Otherwise keys match by sequential number.
- **R11.** Key forms read (amends D2/D8). Marked-up copies of the test ("the key is the test with answers bolded") stay out of scope for key files.
  1. **Numbered lists**: `1. B`, `1) b`, `1 - B`, several per line, with trailing extras allowed (`2pts`, `(p. 4)`, `PTS: 1`).
  2. **Test-bank `ANS:` sections** (as today).
  3. **Item blocks.**
     - `ITEM n` / `Item n` / `Question n` opens a block, and `Part A|B` sets the part.
     - `Correct Answer(s):` is followed by letter lines (`a <text>`) or `a, b`.
     - An Ordering answer is a `1 <text>` … list, matched to the items by text.
     - Blocks are read only from the column band that holds the `ITEM` lines (R4), so Distractor Analysis and Scoring Rules columns are ignored.
     - A multi-letter answer on a single-answer item becomes MA when `multiAnswer` is on; otherwise the row gets a warning.
  4. **Header-aware tables.**
     - A row with segments matching a number header (`#`, `No.`, `Question`, `Item`, `Q#`) and an answer header (`Answer`, `Key`, `Correct`, `Ans`) sets the columns.
     - Following rows read only those two columns until the table ends. Other columns (Vocabulary word, notes) are ignored.
     - Repeated side-by-side blocks (`# | Ans | # | Ans`) are supported.
- **R12.** Points. `n POINT(S)` in an item block, `PTS: n` or a Points column set `QuizQuestion.points`. A Part A/B pair's total is split evenly between the parts, with a note. Rubric text and sample answers are not imported; the row gets "The key has a scoring rubric for this item — add it in the editor."
- **R13.** Unmatched or conflicting key entries are never silent. Each one shows as a row warning or in the R19 banner.

### Upload flow

- **R14.** One shared `TestAndKeyUploader` component replaces the pickers in `ImportWizard` (document source), `PaperPrintModal` ("Import questions") and `PaperQuestionTextModal`.
  - Two equal drop zones side by side: **Test questions** and **Answer key (optional)**. Each also offers "Choose from Drive".
  - They stack on narrow widths.
- **R15.** Accepted types, test zone: PDF, DOCX, RTF, Google Doc, .imscc, and photos (JPG/PNG/HEIC), read by OCR through R3. Key zone: PDF, DOCX, RTF, Google Doc, and photos. The 25 MB combined cap and 20-page cap (D18) are unchanged; a photo counts as one page. Multi-photo and HEIC handling: R30.
- **R16.** Auto-assign. A file dropped on a zone goes to that zone. When two files are dropped together, the one that looks like a key goes to Key and the other to Test, and a **Swap** button appears. A file looks like a key when its name matches `key|answer|scoring|guide`, or ≥50% of its lines parse as key entries, or it has ≥3 `Correct Answer` labels.
- **R17.** Key-only fill. The uploader's key zone can be used alone:
  - in `PaperQuestionTextModal`, to fill answers on existing stub rows;
  - from a saved quiz that has `needsKey` questions, via "Add answer key" in the editor, next to the needs-key count.

  - from the quiz library row menu of a quiz with `needsKeyCount > 0`, because the disabled Assign button sends the teacher to that row (R31).

  On a saved quiz, keys match by `sourceLabel` where the question has one (R23), else by sequential order. Only `needsKey` questions are filled (R26). Answers go through the same review summary before anything is written.

### Review

- **R18.** Row warnings for likely spill: an option or stem that is >3× the median option length in its question, >200 characters, or contains a number→letter pair or a second option marker. The warning reads "Option D may contain answer-key text" or "may contain another choice".
- **R19.** Key summary banner at the top of review, for example: "Answer key: 18 of 20 questions matched · key lists 22 entries (21–22 matched no question) · 2 conflicts · 3 items unticked (not scored)". There is also a "Show flagged rows" filter.
- **R20.** Suggested learning targets (behind R22's flag).
  - A row with a `suggestedTarget` shows a dashed chip. **Add all N suggested targets** in the review header covers them in one pass: each distinct target is created once and every covered question is tagged.
  - Resolution, in order:
    1. An existing personal or PLC target whose normalized code matches (`ELT 1.1` = `ELT-1.1` = `elt1.1`).
    2. Else one whose normalized label matches.
    3. Else "Create target", with a destination menu listing **My targets** and each PLC list the teacher can edit (`plcCanEditContent`; viewers are excluded). When only My targets is available the menu is skipped.
  - Creation uses `addTargets` + `save` from `usePersonalLearningTargets` / `usePlcLearningTargets`. Tags use `tagFromTarget`. The tags ride into `QuizQuestion.targets` on create.

### Printed numbering, shared text and saved quizzes

- **R23.** Printed labels. `QuizQuestion` gains optional `sourceLabel?: string`, the number as the test printed it (`2·3` for Section 2 item 3, `5A`). It is set only when it differs from the question's position in the quiz, so a plain 1→N test stores nothing.
  - It is shown in the review table, on the editor's question row (as "Q12 · printed 2·3"), and beside the bubble number on paper response sheets. A student with the publisher's test and SpartBoard's sheet can then find the right row.
  - Grading, scanning and results never read it; they stay keyed on id and position.
  - It is carried on duplicate, PLC share and sync as an ordinary question field. Editing it is a plain text field in the editor.
- **R24.** Word auto-numbering. `docxReader` resolves each paragraph's `w:numPr` (`numId` + `ilvl`) against `word/numbering.xml`: `abstractNum` levels with `numFmt` (decimal, lowerLetter, upperLetter, lowerRoman, upperRoman), `lvlText` (`%1.`, `(%1)`, `%1)`), `start`, `lvlOverride/startOverride`, and restart-on-higher-level. A running counter per `numId` and level renders the prefix, e.g. `3.` or `b)`. The prefix is written as the first segment of the line and into `text`, so the parser sees exactly what the teacher sees. A paragraph style's own `numPr` (`w:pStyle` → `styles.xml`) counts too. Bullet formats and `numFmt="none"` add nothing.
- **R25.** Shared lead-in text. On a Part A/B pair, or on any run of questions under one "Read … and answer questions n–m" instruction, the text before the first part is handled as follows:
  - If it is a short instruction (one sentence and ≤150 characters, e.g. "Read paragraph 8."), it goes into each stem.
  - Otherwise it becomes one `text` stimulus (D16, `readAloudSource: 'text'`) linked through `stimulusIds` to every question it covers. The instruction sentence stays in the stems.
  - The review table shows the link, as it does for a shared picture (D14).
- **R26.** Key fill on a saved quiz fills `needsKey` questions only. On such a question every option still sits in `incorrectAnswers` in printed order (`toQuizData`), so letter n is `incorrectAnswers[n]`. A question that already has an answer is never overwritten; it is listed as "already answered — skipped". So is a letter past the question's option count, as "key says E, question has 4 choices". A key answer for an MA question moves every keyed option into `correctAnswer`.

### AI reader, test files and photos

- **R27.** A private regression corpus. Real files never enter git.
  - Paul's files go in a gitignored `tests/fixtures/private-quiz-import/`.
  - `pnpm run test:import-corpus` reads each file with the browser reader. It compares question count, options per question, keyed count, sections and flagged-row count against a committed `tests/fixtures/quiz-import-corpus.expected.json`, which holds file hashes and counts only, never content.
  - A missing file is skipped with a note, so the script passes on any machine. CI does not run it.
  - Each PR that touches the reader runs it locally before merging, and the PR says so. New files Paul shares are added the same way, which also covers the threshold tuning under Open.
- **R28.** The Ordering, sorting and Part A/B shapes from R9 each get a synthetic fixture _and_ an entry in the corpus expectations.
- **R29.** AI response schema. `functions/src/quizDocumentExtract.ts` adds optional `section` (as printed, e.g. "Section 2") and `label` (as printed, e.g. "3", "5A") to each question, plus one prompt line: "give each question its printed number and section heading exactly as printed". The client derives `ref` and `sourceLabel` from them. When they are missing (an old function version mid-deploy, or a document with neither), it falls back to sequential numbering, so client and function can deploy in either order.
- **R30.** Photos (amends R15).
  - A zone takes either one document or several images, not both. Images are the pages of one document, ordered by natural filename sort. They show as thumbnails the teacher can drag to reorder. Each image is one page against the 20-page cap (D18).
  - HEIC/HEIF is decoded by a wasm decoder (e.g. `heic-to`), lazy-loaded only when a HEIC file is dropped, then converted to PNG before OCR. The PR records the lazy chunk's size. If decoding fails, the zone says "Couldn't open this iPhone photo. Export it as JPEG and try again."
  - Photos go through `paperScanRaster`'s image path, so orientation and scale match the paper-scan code.
- **R31.** "Add answer key" appears in two places: next to the needs-key count in the editor, and in the library row menu when `needsKeyCount > 0`. Both open the uploader with only the key zone.
- **R32.** A single file dropped on **Test questions** that passes the R16 key test gets an inline note: "This looks like an answer key. Move it to Answer key?" with a one-click move. It is never moved silently.

### Rollout

- **R21.** The parser, reader and key fixes (R2–R13, R18, R24–R26, R29) are bug fixes and ship with no new gate, behind the importer's existing D21 gate. `sourceLabel` (R23) needs no gate of its own: only an import writes it, and the import is gated. The uploader, key-only fill and photos (R14–R17, R30–R32) and the banner (R19) ride the existing `admin_settings/quiz_document_import` switch and `quiz-document-import` permission (D21). There is no new flag for them.
- **R22.** Suggested targets gets a new `GlobalFeature` `quiz-import-suggested-targets`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`. Chips and "Add all" are gated with `canAccessFeature`. Admins always pass. Paul opens it at Admin Settings > Access > Global Settings > set to Public after testing in prod.

## PR map

| PR  | Carries                                            | Depends on |
| --- | -------------------------------------------------- | ---------- |
| 1a  | R2, R3, R4, R24                                    | —          |
| 1b  | R5–R9, R23, R25, R28                               | 1a         |
| 1c  | R10–R13, R26 (key mapping only), R29               | 1b         |
| 2   | R14–R17, R30–R32                                   | 1c         |
| 3   | R18–R20, R22                                       | 1c         |
| 4   | PDF pictures (replaces D15 for the browser reader) | 1a         |

R27's corpus script lands in 1a and is run before each later PR merges. Each PR is checked on spartboard-dev before the next one stacks on it.

## PR 1a — Layout-aware readers

- `types.ts` (quizDocumentImport): `DocLine.segments`.
- `docxReader.ts`: per-run emphasis. Tabs become segment breaks. A table row becomes one line with one segment per cell, including multi-paragraph, spanned, merged and nested cells. Auto-numbering is rendered from `numbering.xml` and `styles.xml` (R24). Text boxes (`w:txbxContent`) are read in document order at their anchor paragraph.
- `rtfReader.ts`: `\tab`, `\cell`, `\nestcell` → segments; `\row` ends the line (R2).
- `pdfReader.ts`: segments from x-gaps; header/footer strip; two-column reading; column bands (R2, R4).
- `pdfBrowserDeps.ts`: Tesseract word boxes → segments (R3). `recognizePage` returns positioned words. Verify the tesseract.js v7 output option that returns words/blocks (`recognize(image, lang, {}, { blocks: true })`) before building on it.
- Invariant: for every existing fixture that has no table, no tab and no auto-numbering, the joined `text` is byte-identical to today's, so every existing suite passes unchanged. The AI reader's DOCX input is not touched.
- `scripts/` + `package.json`: `test:import-corpus` and the gitignore entry (R27).
- Tests: DOCX auto-numbered test (decimal questions, lowerLetter options, a restart, a `startOverride`, a style-defined list); a table row with a two-paragraph cell and a `gridSpan`; RTF two-column options; the header/footer strip on 2- and 3-page fixtures; the two-column page; OCR word boxes → segments from a recorded Tesseract result.

## PR 1b — Parser

- `types.ts`: `ExtractedQuestion.ref`, `sourceLabel?`, `points?`, `suggestedTarget?`, `suggestUntick?`, `sharedTextId?`; `QuizQuestion.sourceLabel?` (root `types.ts`).
- `parseQuestions.ts`: gap-aware option split, collect-and-sort (R5, R6), sections, `ref` and `sourceLabel` (R7, R23), spill guards (R8), Part A/B, Ordering, sorting, target lines, ungraded (R9), shared lead-in text as a `text` stimulus (R25).
- `toQuizData.ts`: `sourceLabel`, points, Ordering encoding, `suggestUntick` → unticked rows, `text` stimuli from R25.
- `sourceLabel` display in `QuizDocumentReview`, the editor question row, and the paper sheet renderer (`utils/paperSheetPlan.ts` and its print component).
- Tests: every parser failure listed under "What fails today" gets a named regression test; the sheet shows `2·3` beside bubble 12 and nothing for an unlabeled quiz.

## PR 1c — Key reader and merge

- `answerKey.ts` / `keyFile.ts`: looser entries, item blocks, header-aware tables, band-restricted reading, points, section-aware matching, key-file-wins merge (R10–R13). Segment-aware table reading for DOCX/RTF (R2).
- `aiReader.ts` routes AI output through the same merge. `functions/src/quizDocumentExtract.ts` gains the optional `section`/`label` schema fields and prompt line (R29), and the client maps them to `ref`/`sourceLabel` with the sequential fallback.
- The saved-quiz letter→option mapping used by R17 (R26) as a pure function, so PR 2 only wires UI.
- Tests: every key failure listed under "What fails today" gets a named regression test. Also: an AI response with and without `section`/`label`; R26 skipping answered rows and out-of-range letters.

## Fixtures (all of PR 1)

`tests/utils/quizDocumentImport/fixtures/`, all synthetic with neutral content. Paul's files are never committed (R27).

- PDF fixtures are arrays of positioned `PdfTextItem`s that copy the measured geometry: ExamView a/d · b/e · c grid at x≈108/320; Great Minds sections, Part A/B, footer and three-band answer guide; a two-column page.
- DOCX fixtures are built with JSZip: options in a table, options separated by tabs, auto-numbered lists with a `numbering.xml`, and a 4-column `Question # | Answer | Vocabulary word | Notes` key table.
- Also: an unheaded 2-entry key and `1. B 2pts` entries at the end of a test (spill cases), and a key file that disagrees with an in-test key.

## PR 2 — Shared test + key uploader

- `TestAndKeyUploader` (R14, R32), wired into `ImportWizard`, `PaperPrintModal` and `PaperQuestionTextModal`. It replaces the "Add a separate answer key" button and the single pickers. Drive picking goes into both zones.
- Photo support in both zones via OCR (R15, R30): multi-image pages with reorder, and the lazy HEIC decoder. `documentKind` learns images; the `PaperQuestionTextModal` image dead end goes away.
- Auto-assign and Swap (R16).
- Key-only fill in `PaperQuestionTextModal`, the editor's "Add answer key" and the library row menu for `needsKey` quizzes (R17, R26, R31).
- Tests: uploader drop/assign/swap, the looks-like-a-key note, accepted types, image ordering and reorder, a HEIC decode failure message, key-only fill on a stub and on a saved quiz (including a `sourceLabel` match and a skipped answered row), the library row entry hidden at `needsKeyCount` 0, and the gate off keeping today's pickers.

## PR 3 — Review summary and suggested targets

- Spill warnings (R18), key summary banner and flagged-row filter (R19) in `QuizDocumentReview`.
- Suggested targets (R20): code/label resolver against `useLearningTargetSources`, row chips, "Add all", create-destination menu, tags into `QuizQuestion.targets`.
- `GlobalFeature` `quiz-import-suggested-targets` + `FEATURE_DEFAULTS` entry (R22).
- Tests: banner counts, filter, resolver (code normalization, label fallback, create destinations, viewer PLCs excluded), "Add all" creates each target once, flag off hides chips.

## PR 4 — PDF pictures in the browser reader

- Find image draws with pdf.js `getOperatorList` (paint-image ops plus the current transform) → page boxes. Grow each box to include text drawn over it (labels), and attach it to the question whose line span contains it. Reuse `pdfCropBrowser.ts` / `attachPdfFigures` cropping and the Drive stimulus upload (D13).
- Replaces the D15 "pictures in a PDF aren't brought in" warning for the browser reader.
- Tests: box extraction from a recorded operator list, question anchoring, a picture shared by two questions stays one stimulus (D14).

## Out of scope

- Answer keys given as a marked-up copy of the test (bold/circled answers in a separate file). Emphasis inside the **test** file still marks answers (D2).
- Enforcing "Part A must be correct to earn Part B" scoring.
- Importing rubrics or sample answers from the key.
- AI prompt changes.
- Turning a passage into a `text` stimulus outside R25's shared lead-ins. A passage inside one question's stem stays there, as today.
- Answer keys read from photos of a _handwritten_ key. Printed keys in photos are read by OCR (R15).

## Open

- Tune the thresholds in R4 (gutter span, header/footer page share), R16 (key-likelihood), R18 (spill length) and R25 (short-instruction cutoff) against more real files once PR 1a–1c land. Paul will share more, and each new file joins the R27 corpus.
