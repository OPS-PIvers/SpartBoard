# Quiz: ExamView tests import without AI, plus choose-N sections

Grilled and settled 2026-09-25. Five PRs to dev-paul, in the order below. This plan builds on `QUIZ_IMPORT_RELIABILITY.md` (R1–R32) and amends it where noted. It also takes the section core from `QUIZ_STRUCTURED_ASSESSMENTS.md` (D9) and adds a choose-N rule to it.

## Goal

- A test exported from ExamView as RTF, or printed from ExamView to PDF, imports without AI:
  - every question comes in with the right type
  - every answer choice sits in its own slot
  - the key and points are applied
  - pictures are attached
  - printed sections become real quiz sections
- A section can say "answer any N of these M questions". The player, scoring, results, PLC math and paper all honor that rule.

## What fails today (measured 2026-09-25)

Paul's Honors Bio Ecology test was run through the browser reader on dev-paul at `b455de124`. It exists as an RTF with the key at the end, and as a PDF of the student copy. The layout is 15 MC items with 4–5 options each, a one-item "Graphing Problem-5 points" section and a "Short Answer-PICK TWO (2) QUESTIONS TO ANSWER-3 points each" section. The files are not committed.

- **6 of 19 questions come through, from both the RTF and the PDF.**
  - Q1's options print as `a. 357.4 | d. 35,740`. The segment `357.4` matches `NUMBERED` in `utils/questionNumbering.ts` as question 357, because 357 is higher than 1.
  - Every later `____ 2.` … `____ 15.` is lower than 357, so none of them opens a question. Q2–Q15 are appended to "question 357".
  - Q1 is left with one empty option. 14 key entries match nothing: "The answer key … has an answer for questions 2, 3, … 15, which aren't among the questions read."
- **Short answers become FIB graded on junk.** ExamView prints the teacher's placeholder ANS text (`jj`, `cvcx`, `bvnvbn`, `h`), and the short-key rule (`answerKey.ts` `applyKeyAnswer`) turns each item into FIB with that answer.
- **Sections are misread.** "Short Answer-PICK TWO…" isn't recognised as a heading, so Q17–19 sit in the "Graphing Problem" section. Heading points (5, 3 each) are ignored and every item gets `PTS: 1`.
- **RTF pictures are skipped** with a warning (`index.ts`, `rtfReader.ts` ignores `\pict`). All five pictures in the file are `\wmetafile8` Windows metafiles. Each holds exactly one `META_STRETCHDIB` (0x0F43) record, a plain bitmap wrapped in a metafile. PDF pictures already work in the browser (R-plan PR 4).
- **Layout facts.**
  - RTF options sit in a 2- or 4-cell table read column-major: row 1 is `a | d`, row 2 `b | e`, row 3 `c`. R6's collect-and-sort already handles that order once the question survives.
  - Roman-numeral statement lists (Q3, Q15) are printed in two columns with plain spaces: `I. …      III. …` / `II. …      IV. …`.
  - In the PDF, the numbers sit at x≈67–73 after `____` at x=36, and option letters at x=90 and x=302.
- **Plain-space option rows.** `a. word    b. word    c. word` with only spaces between options is never split (R5, test at `parseLayouts.test.ts:77`). This is the "choices merged into one choice" case teachers see from retyped and Word tests.

## Decisions

### Parsing (PR 1, bug fix, ungated)

- **E1. Question numbers.** A number opens a question only when all of these hold:
  - It is a whole number with no digit right after its `.` or `)`. `357.4`, `3.5` and `1.5x` never open a question.
  - It sits at the document's question-number position:
    - PDF: within a few points of the x of the numbers already accepted.
    - DOCX/RTF: the first segment of a line, or right after a `____` blank segment.
    - The first question sets the position.
  - It is the next number in sequence (+1), or a restart at 1 under a new section heading (R7).
    - Built in PR 1: a forward skip of up to 5 still opens the question, with the note "The numbering skips from 4 to 6. Check that no question is missing." A skipped number in a typed test would otherwise merge two questions silently.
    - Outside the profile, R7's restart at 1 without a heading still works, but only after the previous question's options. A `1.` in a stem that hasn't reached its options is a list.
    - PDF position, as built: a number indented 12–120 points past the accepted numbers is a list in a stem. A number a whole column over (R4 two-column pages) still counts.
  - A number that fails any of these stays text.
  - `LABELLED` openers (`Question 3`, `Q3.`) keep only the sequence check.
- **E2. Plain-space option rows (amends R5).** Two or more spaces before an option marker count as a column gap, but only when every marker found that way on the line forms a valid run for the current question:
  - a run such as `a b c`
  - or a grid row that fits R6's column-major order, such as `a d` then `b e`.
  - Otherwise the line isn't split, as today.
  - A single space never splits, so `Vitamin A. is…` and `Plan B. Then` stay whole.
  - Uppercase `A.` needs the same run check.
- **E3. Roman-numeral statement lists.**
  - A run of `I.` `II.` `III.` `IV.` (up to `VIII.`) statements inside a stem is split at column gaps (E2's space rule applies).
  - The statements are sorted I→VIII and written into the stem one per line.
  - They are never options. The option regex is A–F, but a bare `I.` must not reach any option path.
- **E4. ExamView profile detection.** A document is ExamView when at least two of these signals are present:
  - `____ n.` answer blanks before question numbers
  - an `Answer Section` heading
  - `ANS:` with `PTS:` on key lines
  - ExamView's fixed type headings: Multiple Choice, True/False, Modified True/False, Completion, Matching, Short Answer, Problem, Essay, Numeric Response, Other
  - the stock directions line "Identify the letter of the choice that best completes the statement or answers the question."

  The profile adds the rules below on top of the general parser. Other documents keep the general heuristics. The PR 1 part of the profile is detection plus E8.

  PR 1 also reads an ExamView type heading with text after it as a section heading, whatever its length ("Short Answer-PICK TWO (2) QUESTIONS TO ANSWER-3 points each"). Without that, Q17–19 fall into the Graphing Problem section.

- **E8. ANS text on written items isn't a key.** Under the ExamView profile, an item in a Short Answer, Problem, Essay or Other section stays free-response.
  - Its ANS text shows in review as "Key's sample answer: …" and is not saved as an answer.
  - A short ANS never changes the type.
  - Outside the profile, today's short-key → FIB rule stays.

- **PDF learning-target wraps (found building PR 1).** An "I can" target that fills the question's opening line and wraps onto the next line keeps the wrapped words when that line sits closer than a paragraph gap (21 pt). Before this, the wrapped half led the stem on six of the PDF's questions.

### ExamView types and keys (PR 2)

- **E5. Types by section.** Under the profile, the section heading sets the type:
  - **Multiple Choice** → MC.
  - **True/False** → MC with True/False options, keyed from `ANS: T`/`F`.
  - **Completion** → FIB, keyed from the ANS text.
  - **Numeric Response** → FIB with the number as the answer.
  - **Short Answer**, **Problem**, **Essay** and **Other** → free-response (E8).
- **E6. Matching.**
  - ExamView prints the lettered term list once, as a grid (column-major like MC options), under a "Match each item with the correct statement below" directions line. The numbered `____ n. definition` items follow, each keyed `ANS: c`.
  - Each matching group becomes one `Matching` question:
    - Its text is the directions line.
    - `correctAnswer` holds the `term:definition` pairs. Unused terms go in `matchingDistractors`.
    - `points` is the item count, and `allowPartialCredit` is on.
    - `sourceLabel` is the printed range (`21–25`).
  - When one term is the answer to two or more items, the Matching type can't hold it (1:1 pairs). That group falls back to one MC per item, with the term list as options and a review note.
- **E7. Modified True/False.**
  - A `T` item becomes one True/False MC.
  - An `F` item (`ANS: F, producers`) becomes two questions:
    - `nA`: True/False, keyed F.
    - `nB`: "If false, write the word or phrase that makes it true", an FIB keyed to the correction.
  - Both carry `sourceLabel` `nA`/`nB`.
  - A review note says the parts score independently. This does not use D15 groups.
- **E9. Points.**
  - A heading's `n points each` sets every item in the section, and `n points` on a one-item section sets that item.
  - The heading wins over `PTS:` when every PTS in that section is 1, which is ExamView's untouched default.
  - Any other PTS value wins over the heading, with a review note on the conflict.
  - Matching points follow E6.
- **E10. Key metadata.**
  - `DIF`, `REF`, `KEY`, `MSC` and any other ExamView metadata are stripped from answers and stems.
  - When a question has no "I can" line (R9), `OBJ` (or else `TOP`) becomes its `suggestedTarget`, which feeds R20's "Add all suggested targets".
  - `NAT`/`STA` codes tag a standard only on an exact normalized code match in `standards_catalog`. Unmatched codes are listed in review: "Key lists standard UCP.1, which isn't in the standards list."
  - Both ride the `quiz-import-suggested-targets` flag (R22).
- **E17. AI output.** When the browser reader detects the profile in the document text, AI-read questions go through the same E5–E10 post-processing, and E16's sections are built from R29's `section` field. There is no prompt change (R1).
- **Key forms.** Test-bank keys already read `n. ANS: B PTS: 1` (`findTestBankKey`). The profile also reads:
  - key type headings (`MULTIPLE CHOICE`, `OTHER`, `SHORT ANSWER`, `MATCHING`) as section boundaries for matching
  - multi-line ANS text
  - ANS printed inline under each question (ExamView's "with answers" printout)
  - a key-only file holding just the Answer Section.

- **As built in PR 2.**
  - One step, `utils/quizDocumentImport/examView.ts`, runs for the plain reader, the AI reader (E17) and a separate key file. Types are set before any key is applied. Matching sets combine, false Modified True/False items split, and heading points apply after each key merge; that step is safe to run twice.
  - Matching pairs store the numbered item on the left and the lettered term on the right (`item:term`), so unused terms become `matchingDistractors`. A colon in an item becomes `꞉` so the stored pair still splits.
  - Part B of a false Modified True/False item reads "If false, write the word or phrase that makes it true: <statement>". The item's points split evenly between the two parts.
  - A key and a test that each print every number once match by number even when their headings differ (the key's `OTHER` against the test's "Graphing Problem").
  - Key standards are chips in review with an Add button and an "Add N standards" header button, not tags applied without asking. A code that two catalog sets share counts as unmatched.
  - When the AI reader keys a written item from its sample answer, the item goes back to free-response and the sample becomes the review note.

### RTF pictures (PR 3)

- **E11.** `rtfReader.ts` reads `\pict` groups:
  - `\pngblip` and `\jpegblip` are used as they are.
  - `\wmetafile` and `\emfblip` are unwrapped when they hold a single bitmap record (`META_STRETCHDIB`, `META_DIBSTRETCHBLT`, `EMR_STRETCHDIBITS`): the DIB is converted to PNG in the browser.
  - Pictures are anchored to their paragraph as DOCX pictures are (`imageIds` on the line). From there they follow the existing `attachImages` → Drive stimulus path (D13, D14).
  - A vector-only metafile keeps a warning, now naming its question: "Question 8's picture couldn't be read — add it in the editor."
  - Duplicate `\nonshppict` fallbacks are skipped.

### Sections with choose-N (PR 4)

This PR takes the section core of `QUIZ_STRUCTURED_ASSESSMENTS.md` D9. Structured PR 2 later adds `notScored`, `awardPoints`, `waitForTeacher`, subtotals (D12), the unscored tally (D13) and the numbering setting's UI to the same record.

- **E12. Model.**
  - `QuizOrderEntry.kind` gains `'section'`.
  - `QuizData.sections?: QuizSection[]` holds `{ id, title, directions?, chooseCount? }`.
  - A section owns the question and slot entries after it in `order`, up to the next section.
  - `chooseCount` absent means students answer all of them.
  - Player behaviour:
    - A section shows an intro screen with its title and directions. With a count set, it also shows "Answer any N of these M questions."
    - Each question shows a "Section title" breadcrumb that reopens the directions.
  - Editor: "Add section" inserts a section row in the question list. The row has a title, directions and "Students answer [all | N] of these M questions". Dragging a question across the row moves it between sections.
- **As built (PR 4a).** PR 4 ships as three stacked PRs: 4a model and player, 4b scoring and results, 4c editor and paper.
  - A session freezes `sections` as `{ id, title, directions?, chooseCount?, questionIds }` at assignment, with bank pool ids included, so the player and scoring never read the quiz's `order`.
  - "Chosen" is derived from the answers, never stored: a question counts once it holds a non-empty answer, and more than N keeps the first N in section order. The response doc and `firestore.rules` are unchanged.
  - The intro is a dialog shown the first time a student reaches a section. It works the same in every session mode. The breadcrumb reopens it.
  - "Clear my answer" (self-paced) writes an empty answer to free a place. Question shuffle stays inside each section.
  - Not yet: a substitute's launch (`subLaunchAssignment`) rebuilds the session on the server and doesn't carry `sections`, so a sub-run quiz behaves as one run of questions.
- **E13. Answering.**
  - Once a student has answered N questions in a section, the section's other questions show "You've answered N of N. Clear one to answer this instead." and can't be answered. Clearing an answer frees a slot.
  - Submit is allowed once N are answered.
  - This works the same in self-paced, auto-paced and teacher-paced sessions, because it is per student.
- **E14. Scoring and results.**
  - A choose-N section's max is the sum of the N highest point values among its questions (here 2 × 3 = 6), so skipping a question is never wrong.
  - Unchosen questions show "Not chosen" in results, the drill-down, exports and print, and they never enter the grading queue.
  - Item analysis and PLC percent-correct use students who chose the question as the denominator.
  - Score is computed when results are read, as today (`gradeAnswer`), so no stored scores change.
- **E15. Paper.**
  - The printed test and the response sheet show "Answer any N of M" under the section heading.
  - A paper import with more than N answered in a section gets a teacher flag. The first N in item order count until the teacher changes it.
- **Compatibility.** Every field is optional. The player, scoring, results and PLC handling of sections are unflagged and must reach `main` before or with any way to create a section (structured plan, "Rules and compatibility notes"). Old clients ignore the unknown `order` kind. No `firestore.rules` change is expected; the cap is enforced by the player. Verify that in the PR.

### Importer creates sections (PR 5)

- **E16.** When the teacher has `quiz-sections`, each printed section heading becomes a section. This covers ExamView type headings, R7 headings, and AI `section` values (E17).
  - The section title is the heading without its points text.
  - The directions line under a heading becomes the section's directions and is no longer prepended to the first stem.
  - `PICK TWO (2)` / `answer any N` / `choose N of the following` sets `chooseCount`.
  - When the source numbers straight through (ExamView 1–19), the numbering-restart setting (D11) is turned off for the quiz, so the student sees the printed numbers.
  - Without the flag, sections stay import-internal (`ref` only, as today), and a choose-N heading adds a review note: "Students choose 2 of these 3; turn on sections to enforce it."
  - This delivers D26's "headings become sections" line. D26's `Section N | Title` and `Directions:` detectors reuse it.

### Tests and corpus

- **E18.**
  - Both Honors Bio files join the private corpus (R27), with these expectations:
    - 19 questions.
    - Options per MC question: 5,5,5,5,4,4,5,4,5,4,5,4,4,4,5.
    - 15 of 15 MC keyed from the RTF.
    - Q16–19 free-response at 5/3/3/3 points, none keyed.
    - 5 pictures, on Q8, Q11, Q12, Q13 and Q16.
    - 3 sections, the third with `chooseCount` 2 once PR 5 lands.
    - The RTF and the PDF agree on the questions and options.
  - The types this test doesn't contain get synthetic RTF and PDF-item fixtures copied from ExamView's layout: True/False, Modified True/False, Completion, Numeric Response, and a Matching group including a reused term.
  - A DOCX saved from the RTF runs through the same profile.
  - Named regression tests:
    - `357.4` and `3.5` as option text
    - an out-of-sequence number in a stem
    - a plain-space option row, and plain-space text that must not split
    - a two-column Roman-numeral list
    - a Short Answer section with placeholder ANS text
    - heading points against a default PTS and against a non-default one
    - key metadata lines

## Rollout

- **PR 1** is a bug fix to a feature already in prod. It ships ungated and is promoted to `main` on its own, ahead of the rest.
- **PRs 2, 3 and 5** ride the existing `admin_settings/quiz_document_import` switch and `quiz-document-import` permission (D21, R21). E10 also needs `quiz-import-suggested-targets` (R22).
- **PR 4 adds one flag,** `quiz-sections` (`GlobalFeature`, `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`). It is the id the structured plan proposed for its PR 2, which now builds on it.
  - The flag gates the editor's "Add section" and PR 5's section creation.
  - The player, scoring and results ignore the flag.
  - Paul opens it at Admin Settings > Access > Global Settings > set to Public after testing in prod.

## PR map

| PR  | Carries                                         | Depends on | Gate                          |
| --- | ----------------------------------------------- | ---------- | ----------------------------- |
| 1   | E1–E4 (detection), E8, corpus entries           | —          | none (bug fix)                |
| 2   | E5–E7, E9, E10, E17, ExamView key forms         | 1          | import gate; E10 targets flag |
| 3   | E11 RTF pictures                                | —          | import gate                   |
| 4   | E12–E15 sections core with choose-N, editor row | —          | `quiz-sections`               |
| 5   | E16 importer sections                           | 2, 4       | import gate + `quiz-sections` |

Each PR that touches the reader runs `pnpm run test:import-corpus` before merging and says so (R27). Each is checked on spartboard-dev before the next stacks on it.

## Out of scope

- ExamView scrambled versions (Version A/B keys), ExamView HTML and online-test exports.
- Vector-only metafile rendering (E11 warns instead).
- Seeding MN Science standards. NAT codes are usually national or publisher codes that wouldn't match anyway; seeding is a separate follow-up.
- Importing rubric or sample-answer text into the question (E8 shows it in review only).
- Part B-depends-on-Part A scoring for the Modified T/F pair.

## Open

- Tune E1's x tolerance and E2's minimum space run against more ExamView files as teachers share them. Each new file joins the R27 corpus.
