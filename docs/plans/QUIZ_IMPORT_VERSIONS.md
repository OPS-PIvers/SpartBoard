# Quiz import: multi-version tests, FRQ rubrics, balanced dealing and Stop checkpoints

Grilled and settled 2026-10-14. Six stacked PRs to dev-paul, all behind the new `quiz-import-versions` preview flag.

## Goal

An AP Human Geography teacher keeps each unit's FRQ assessment as one PDF holding several versions and their rubrics. He should be able to drop that PDF into the quiz importer and get, without hand-building anything:

- every version as a question, sorted into the right relationship (parallel forms, retakes, a two-part split),
- each version's rubric, with his credit notes, attached and saved to his Rubrics library,
- ready-to-assign quizzes that deal versions to students automatically,
- the same thing on paper, with each student's version printed on their sheet.

Version detection is general. Any test with versions marked near the top of the page should split on import, including MC tests and FRQs in other layouts. It is not tuned to this one file.

Reference example: `Bohl_Example_Current Unit 3 FRQ (2025).pdf` (kept outside the repo):

| Page heading        | Content                                                    | Rubric                                    |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Version A           | Two maps, intro paragraph, prompts A–F, lined answer space | Rubric 1: A–F = 1/1/2/2/2/2 (10)          |
| Version B           | Same maps, different A–F                                   | Rubric 2 (10)                             |
| Unit 3 Version C    | No stimulus, A–F                                           | Rubric 3: 1/2/2/1/2/2 (10)                |
| Unit 3 REASSESSMENT | No stimulus, A–F                                           | Rubric 4 (10)                             |
| Version Split Pt 1  | Same maps, prompts A–C                                     | "RUBRIC Version Split", covering A–F (10) |
| Version Split Pt 2  | Same maps, prompts D–F                                     | (same rubric)                             |

Each rubric row is a letter, the prompt, "Credit received for:" bullets, sometimes a "NOT ACCEPTABLE" or "NO POINTS AWARDED IF…" line, a Teacher Comments space, and a points column. The source has errors that import must not hide: Version B's "modern factor" rubric credits colonialism, and "Chrsitian" is a typo.

## Current-state facts that drove the decisions

- **Written response and rubrics.** A `free-response` question can carry `rubricId`, `rubricSnapshot` and `rubricVisibleToStudents`. Its criteria maxima set its points. `FreeResponseGrader` and `RubricScoringPanel` score it into `WrittenAnswerGrade.rubricScores` (`types.ts`).
- **Scoring guides.** `RubricCriterion.guide` holds AP-style scoring-guide rows (`utils/rubricGuide.ts`), behind `rubric-scoring-guides` (admin preview).
- **No versions on a quiz.** Per-student variation comes only from question bank slots. A `random` `QuizBankSlot` draws `count` questions per attempt, independently at random, and saves them as `servedQuestionIds` (`utils/questionBanks.ts` `drawServedQuestionIds`, `utils/quizBankDraw.ts`).
- **The AI reader returns one quiz.** `extractQuizFromDocumentV1` (`functions/src/quizDocumentExtract.ts`) has a single `{ title, questions }` schema. It rejects PDFs over 20 pages before charging, stops at 200 questions and has a 110 s deadline. Figures come back as page plus a fractional bbox, and identical boxes collapse into one image stimulus.
- **Import never brings rubrics.** A rubric in the key only adds an "add it in the editor" note (`utils/quizDocumentImport/mergeKey.ts`). Banks have no test-document import tile.
- **Sections.** `QuizSection { id, title, directions, chooseCount }` and order entries of kind `section` are built. `waitForTeacher` is specified in `QUIZ_STRUCTURED_ASSESSMENTS.md` D14 but not built.
- **No multi-day attempts.** An attempt that isn't `completed` keeps its answers on rejoin. However, `finalizeIdleQuizAttempts` auto-submits any attempt idle for 90 minutes unless its session, assignment or period is paused.
- **Paper.**
  - Sheets are pre-printed per seat with a marker grid (batch, seat, page, checksum).
  - Written boxes print at `S/M/L/full`. Gemini transcribes handwriting into editable text (`paper-handwritten-responses`, `functions/src/paperTranscribe.ts`), and the teacher grades from the crop plus transcript.
  - Bank slots are skipped on paper: `utils/paperSheetPlan.ts` lists them as `bank-slot` exclusions.

## Decisions

### Shape of an imported version

- **V1.** Each FRQ version becomes **one `free-response` question with one answer box**. The prompt holds the intro text and the lettered A–F list, unchanged. The teacher wants students to synthesize one answer, so the letters are never split into separate boxes or separate questions. They are not instructions to skip and never become MC.
- **V2.** That question's rubric has **one criterion per letter**, with levels from 0 to the points column (A 0–1, C 0–2, …). The criteria total is the question's points (10 here). Per-letter results come from the existing rubric scores.
- **V3.** "Credit received for" bullets, "NOT ACCEPTABLE" and "NO POINTS AWARDED IF" lines land **verbatim in the criterion's scoring guide** (`guide`), not paraphrased into level text. The criterion title is the letter plus its prompt. Teacher Comments space is dropped, since the grader has its own comments.
- **V4.** Images are cropped once per version and **shared only when visually identical**: crops are compared pixel-wise after cropping. A map that differs between versions stays a separate stimulus. The credit line under a figure becomes its caption.

### Versions, banks and generated quizzes

- **V5.** Versions are modeled as a **question bank plus generated quizzes**, not a new "forms" concept on a quiz. This reuses the per-student draw, results, PLC and grading plumbing.
- **V6.** Import creates a **library folder** named after the file. It holds:
  - the bank, with every version as a question,
  - the rubrics (V15),
  - one generated quiz per group (V8).

  The review step lets the teacher rename or uncheck any quiz before anything is created.

- **V7.** Detection is **general**: any heading near the top of a page that marks a version ("Version A", "Form 2", "Reassessment", "Retake", "Version Split Pt 1") starts a version. MC tests, FRQs and mixed tests all qualify. A file with no version marks imports exactly as today.
- **V8.** The AI proposes how versions relate, from the headings and content, and the teacher confirms it in review:
  - **Parallel forms** (A/B) produce one quiz with a balanced random slot of count 1 over those versions.
  - **Retakes** (C, Reassessment) produce a "… Retake" quiz with a balanced slot over them.
  - **Split** (Pt 1 + Pt 2) produces one quiz with two questions in two sections and a Stop between them (V20).
- **V9.** For **MC versions that are the same questions reordered**, review says "Version B is Version A reordered" and offers to import one quiz with shuffle on, since SpartBoard already shuffles questions and options per student. Versions with genuinely different questions go to the bank like FRQs. Every version keeps its own answer key during extraction so the duplicate check compares content, not position.
- **V10.** The split imports as **one quiz, two written-response questions**, each with its slice of the one rubric: Pt 1 carries the criteria for its prompts and Pt 2 the rest, so the quiz total stays 10.

### AI extraction

- **V11.** Extraction runs in **two passes**:
  - **Pass 1** (cheap) maps the document: version boundaries, rubric pages, shared figures and proposed groups.
  - **Pass 2** extracts each version and each rubric in its own call.

  The whole import counts as **one** use of the daily quota. Pass 2 calls run in parallel within the deadline.

- **V12.** A versioned file may exceed one version's 20-page cap. The page cap applies **per pass-2 call**, and the whole file gets a higher ceiling set in the PR (bounded by the 25 MB byte cap). A document over the ceiling is still refused before any charge.
- **V13.** The non-AI browser reader does not detect versions. Without AI the importer behaves as today, and the version step says it needs the AI reader.

### Rubrics

- **V14.** Rubrics pair with versions **by order, with no AI**. The first rubric goes to the first version, and the split's two parts count as one version. Review shows the pairs side by side and a dropdown reassigns any of them. A count mismatch is flagged, never guessed.
- **V15.** Each rubric is **saved to the teacher's Rubrics library** (named "‹file› – Version A") **and attached** to its question as the usual snapshot, so he can reuse it and share it with his PLC.
- **V16.** Import is **verbatim, with review flags**. Review lists suspected problems:
  - a rubric whose criteria don't match its paired prompt,
  - criteria points that don't add up to the printed total,
  - likely typos.

  Each flag can be fixed later or ignored. Nothing is changed silently.

### Review step

- **V17.** The review step edits **structure only**: versions found, grouping (parallel / retake / split / duplicate), rubric pairing, image sharing (a "same as Version A" badge it can unlink), quiz names, and flags. Wording, rubric text and points are fixed afterward in the existing quiz, bank and rubric editors.

### Balanced dealing (bank slot mode)

- **V18.** Random bank slots gain a **balanced** mode that deals versions in rotation as students join, **per class period**, so each period splits about evenly. A retake of the same quiz gets the version that student hasn't had yet. Results show each student's version. The existing independent-random mode stays the default for ordinary banks.
- **V19.** The deal is stored on the session per period, so a student's version survives a rejoin and stays the same across devices.

### Stop checkpoint (builds `QUIZ_STRUCTURED_ASSESSMENTS.md` D14)

- **V20.** A section can end with a **Stop**, in the language of a standardized test: the student submits Part 1, sees "Stop. Wait for your teacher to start Part 2.", and the attempt is held. Earlier parts lock, so students can't go back.
- **V21.** A held attempt is skipped by the 90-minute idle sweep, so Part 2 can happen days later.
- **V22.** The teacher opens the next part from the monitor **per class period**, and can open it for individual students who were absent. The control appears **only on quizzes that contain a Stop**.
- **V23.** This PR builds D14 from the structured assessments plan, replacing its "wait for teacher" wording with Stop / Part N. Structured assessments PR 2 then no longer needs to build D14.

### Paper

- **V24.** The paper flow is in this plan. Bank slots stop being excluded on paper: **balanced dealing happens at print time** and runs in seat order, so adjacent seats alternate. Each seat's sheet prints that student's version, and scan import writes the seat's `servedQuestionIds`, so paper and typed students land in one results view.
- **V25.** A paper FRQ sheet is **self-contained**: version label, intro, A–F prompts, the maps (reusing the sheet-stimuli layout) and a full-page lined box. It replaces the teacher's Word handout, so the version on the sheet always matches the one being scored. Handwriting transcription and grading use the shipped `paper-handwritten-responses` path unchanged.

### Release

- **V26.** One new `GlobalFeature` **`quiz-import-versions`** (admin, preview, `afterLaunch: 'retire'`) gates version detection, rubric import, the balanced mode, Stop and versioned paper sheets. Rubric guide rows need `rubric-scoring-guides` for the same users, so the import shows guide text in the criterion description when that flag is off. Paul tests it, then sets it to beta with this teacher's email.
- **V27.** Out of scope:
  - AI scoring of responses against the rubric (a later plan),
  - changes to the handwriting OCR,
  - standards or learning-target tagging on import,
  - inline editing in review.

## PR sequence

1. **Two-pass extraction (server + types).**
   - `extractQuizFromDocumentV1` gains a versioned mode that returns an `ExtractedTestSet { versions[], rubrics[], groups[], figures[], warnings[] }`.
   - Pass-1 map and pass-2 per-version and per-rubric calls (V11–V12), one quota charge.
   - Client types in `utils/quizDocumentImport/types.ts`. A single-version file still returns today's `ExtractedQuiz`.
2. **Review step and creation.**
   - The version review screen in the import wizard (V7–V10, V17), MC duplicate detection (V9) and pixel-compare image sharing (V4).
   - Creates the folder, bank and generated quizzes, with plain random slots until PR 4 lands. The split quiz gets its two sections.
3. **Rubric import.**
   - Pairing by order with a reassign dropdown (V14), criteria from the points column, guide rows (V2–V3).
   - Library save plus snapshot (V15), and mismatch, total and typo flags (V16).
4. **Balanced slot mode.** `QuizBankSlot.mode: 'balanced'`, per-period rotation stored on the session, retake gets the unseen version, version shown in results (V18–V19). Generated quizzes switch to it.
5. **Stop checkpoint.** Build D14 as V20–V23: section `stopAfter`, held-attempt state, idle-sweep skip, monitor "Open Part N" per period and per student, Part-locking in the player.
6. **Paper versions.** Bank slots on paper sheets with print-time dealing (V24), the self-contained FRQ page (V25), and `servedQuestionIds` written on scan import.

## Rules and compatibility notes

- **Balanced mode and Stop add new session and response fields.** A teacher's tab that's already open on the previous client must not break on them. The idle-sweep skip is a server change that has to tolerate sessions written before it existed (treat a missing field as not held).
- **Any rules change for the held state is measured against both size caps** before it reaches `main` (`node scripts/releaseFirestoreRules.mjs spartboard-dev`).
- **New controls get live tour anchors**: the version review screen, the balanced mode picker and "Open Part N".

## Open items

- The whole-file page ceiling for versioned imports (V12) is set in PR 1 from measured Gemini latency on the reference file.
