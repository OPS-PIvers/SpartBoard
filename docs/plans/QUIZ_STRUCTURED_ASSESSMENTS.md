# Quiz: structured assessments (sections, multi-part items, Categorize, passages) and Arts & Letters

Grilled and settled 2026-09-25. Two phases, stacked PRs to dev-paul in the order below.

- **Phase 1 (PRs 1–7)** improves the Quiz widget for every teacher. PR 1 ships unflagged; PRs 2–7 each get their own `GlobalFeature`.
- **Phase 2 (PRs 8–10)** is specific to Arts & Letters: the answer-key profile, the admin assessment library, and a validation run.

## Goal

The K-5 team gives the Arts & Letters (A&L, Great Minds PBC) Reading Comprehension Assessments. Each comes as two PDFs: the student test and an "Assessment Guide" answer key with scoring rules. A teacher should be able to import both files without AI and get a quiz that runs digitally and scores exactly as the publisher's key says, including its section totals.

Reference example: Grade 4, Module 1, Reading Comprehension Assessment 1, which totals 34 points:

| Section               | Points | Contents                                                                                                                                                                                                                                                                                               |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Fluency            | 6      | Teacher-scored read-aloud of a passage, ending in "STOP, wait for your teacher"                                                                                                                                                                                                                        |
| 2. Show What You Know | 10     | Single-choice MC; a drag-into-Literal/Figurative sort (1 pt per card); choose-two MC (1 pt per correct pick); a Part A/B item where B only counts if A is right                                                                                                                                        |
| 3. Grow What You Know | 16     | A long passage with numbered paragraphs and subheadings. Questions quote parts of it ("Read paragraph 8"); one has an illustration. Includes put-4-events-in-order (1 pt per position), independent Part A/B (2/2, 1/2, 0/2), gated Part A/B, and two written responses scored by rubric (0–1 and 0–3) |
| 4. Self-Reflection    | 2      | Not scored: a confidence MC, a choose-all-that-apply, and a written response. The key says to award 2 points to every student                                                                                                                                                                          |

## Current-state facts that drove the decisions

- **Question types.** `QuizQuestionType` is `MC | FIB | Matching | Ordering | MA | free-response` (`types.ts`). `QuizQuestion` is one flat interface, and `correctAnswer: string` holds each type's key in its own encoding (Matching `t:d|t:d`, Ordering `i1|i2`, MA `a|b`).
- **Partial credit.** `allowPartialCredit` gives MA right% minus wrong%, Matching the fraction of pairs correct, and Ordering the longest correctly ordered run ÷ n (`gradeAnswer`, `hooks/useQuizSession.ts`). No type scores one point per correct position.
- **Points.** They must be whole numbers from 1 to 100 (`QuizEditor.tsx`). There is no 0-point question, no ungraded or survey question, and no fixed award.
- **Structure.** No section, instruction or header item exists. `QuizData.order` is `QuizOrderEntry { kind: 'question' | 'slot'; id }`. The importer prepends instruction lines to the next question's text (`parseQuestions.ts`).
- **Part A/B.** There is no link between parts. The importer splits Part A/B into independent questions and warns that "Part B credit doesn't depend on Part A here" (`parseQuestions.ts`). Nothing parses "must correctly answer Part A".
- **Passages.** A `text` stimulus renders as plain `whitespace-pre-wrap` text (`QuizStimulusView.tsx`), with no paragraph numbers, headings or images inside it. Text stimuli have no read-aloud row (`StimulusManagerPanel.tsx`).
- **Formatting.** Quiz text is plain everywhere: question text is a `<textarea>` in the editor and a plain child of `<h2>` in the player. There is no bold or italic.
- **Drag and drop.** Matching and Ordering use dnd-kit with tap-to-place and keyboard support (`MatchingResponseInput.tsx`, `OrderingResponseInput.tsx`). No categorize or sort-into-buckets interaction exists anywhere in the app.
- **Manual grading.**
  - Only free-response is hand-graded, through `QuizResponse.grading[key]: WrittenAnswerGrade`, `FreeResponseGrader.tsx` and rubrics.
  - The grading queue skips a student who has no answer.
  - Auto-scored types cannot be overridden, and the monitor has no score inputs.
- **Where scores come from.** Scores are not stored. `gradeAnswer` computes them against the teacher's current quiz loaded from Drive (`useQuizSession.ts`, the `isCorrect` comment in the answer write). Editing the key of an assigned quiz therefore already rescores every past submission, silently.
- **PLC aggregation.**
  - `recomputePlcAssessments.ts` groups sessions by `syncGroupId` and matches questions by `id`, falling back to position.
  - It reads `grading[questionId].pointsAwarded`.
  - Question ids survive every quiz copy path (share link, PLC import, duplicate).
- **Document import** (`utils/quizDocumentImport/`, `functions/src/quizDocumentExtract.ts`).
  - How the non-AI reader gets text: the pdf.js text layer first, then tesseract OCR on pages with no text layer.
  - It finds pictures from the pdf.js operator list and crops them without AI.
  - The key parser already reads `ITEM n … Correct Answer: c`, splits Part A–D, and splits whole-item points across parts (`keyForms.ts`, `mergeKey.ts`).
  - The AI reader is gated by `canAccessFeature('quiz-document-ai-reader') && canAccessFeature('gemini-functions')` (`QuizWidget/Widget.tsx`) and starts switched off in the wizard.
- **Admin publishing.**
  - Nothing publishes quizzes to buildings, grade levels or teachers.
  - `plc_resources` targets PLCs only and points at a `synced_quizzes` group.
  - `announcements` already carries `targetBuildings[]` and `targetUsers[]`.
  - `dashboard_templates.targetBuildings` exists but the UI never checks it.
- **Paper answer sheets** are MC-only; every other type is left off the sheet (`utils/paperSheetPlan.ts`).

## Decisions

### Scope and delivery

- **D1.** Digital first. Paper answer sheets are unchanged: new item types are left off the sheet like other non-MC types, and the MC parts of a Part A/B item still print.
- **D2.** Two phases. Phase 1 (PRs 1–7) is general-purpose and benefits every teacher. Phase 2 (PRs 8–10) holds the A&L answer-key profile, the admin library and a validation run.
- **D3.** Flags:
  - The auto-score override (PR 1) is a grading fix and ships unflagged.
  - PRs 2–7 each get their own `GlobalFeature` (`defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`), gating their authoring tools and import detection.
  - The student player, grading, results and PLC math always understand every new item, regardless of flags. A quiz Paul builds therefore runs for any student and any teacher it is shared with.
  - Paul opens each flag separately.

### Auto-score override (PR 1)

- **D4.** A teacher can set any score from 0 to the question's max on any auto-scored answer (MC, MA, FIB, Matching, Ordering, later Categorize and each Part A/B), with **Full credit** and **No credit** shortcuts and an optional note.
- **D5.** Stored in the existing `QuizResponse.grading[key]` with `override: true`. `gradeAnswer` uses the override instead of the computed score. The computed score still shows struck through beside it, with an **Overridden** badge in results, the drill-down, exports, print and the student's published view. **Revert** deletes the grading entry.
- **D6.** PLC math (`plcAssessmentMath.ts`, `recomputePlcAssessments.ts`) applies overrides to auto-scored types, not just free-response.
- **D7.** Saving a key change on a quiz that has submissions warns "This changes scores for N submitted students." Scores stay computed when results are read, and per-student overrides still win. Keeping the old scores (a key snapshot per session) is out of scope.

### Formatting and sections (PR 2)

- **D8.** Inline **bold**, _italic_ and underline in question text, answer options, passages and section directions, using a small safe markup rather than HTML.
  - The editor gets B/I/U buttons.
  - Read-aloud, answer matching (FIB/MC normalization) and paper printing strip the markup.
  - The PDF importer keeps bold and italic from the text layer's font names.
- **D9.** Sections are a new entry kind in `QuizData.order` (`kind: 'section'`), with a `QuizData.sections[]` record of `{ id, title, directions, notScored?, awardPoints?, waitForTeacher? }`.
  - A section shows as its own intro screen with the heading and directions.
  - Each question under it shows a breadcrumb such as "Section 2 · Show What You Know", which reopens the directions.
  - Sections work with bank slots in `order` as they do today.
- **D10.** A not-scored section has these rules:
  - Its questions need no key and show no correct/incorrect marks.
  - Its questions add nothing to the total.
  - The section's `awardPoints` goes to every student who submits (the A&L reflection section awards 2).
  - Question-level "not scored" is not built. The award belongs to the section.
- **D11.** Numbering restarts in each section (a quiz setting, on when sections exist), and parts show as 5A/5B under "Item 5". Quizzes without sections keep 1..N.
- **D12.** Section subtotals (for example Fluency 5/6, Content Knowledge 8/10) appear as columns in Results, in exports and print, and in the PLC aggregate breakdown.
- **D13.** Unscored MC/MA answers show a class tally ("12 chose 'confident'") plus each student's choices in the drill-down. Unscored written answers can be read in the grader but never enter the grading queue.
- **D14.** Optional **Wait for teacher** gate on a section. In self-paced sessions, a student who reaches the end of the section waits on a "Stop — wait for your teacher" screen until the teacher releases the section from the monitor, for the whole class or one student. Teacher-paced and auto-paced sessions ignore the gate.

### Part A/B and per-part scoring (PR 3)

- **D15.** Parts stay normal `QuizQuestion`s, so results, banks, paper sheets, overrides and PLC matching keep working. They gain `groupId` and `partLabel` fields.
  - A group record holds the item label and a scoring rule: **Independent**, or **Part B needs Part A correct**.
  - The player shows every part of a group on one screen under the item label.
  - The editor has "Add Part B" on a question.
- **D16.** Under the gated rule, Part B is still shown and answered but scores 0 when Part A is wrong.
- **D17.** New per-question credit mode, **Each correct part earns points**, alongside the existing all-or-nothing and `allowPartialCredit` rules:
  - Ordering: each item in its correct position.
  - Matching: each correct pair.
  - Categorize: each correctly placed card.
  - MA: each correct pick.

  A new optional `creditMode` field; when it's absent, `allowPartialCredit` keeps its current meaning, so existing quizzes score the same.

- **D18.** MA gets an optional **Choose exactly N** limit (`selectCount`). The player stops the student selecting more than N, and the prompt shows the count.

### Categorize (PR 4)

- **D19.** New question type `Categorize`: students drag cards into 2–4 labeled buckets, using the same dnd-kit base, tap-to-place and keyboard support as Matching.
  - A bucket can take any number of cards.
  - Cards can be text or an image.
  - Optional distractor cards belong to no bucket and must stay in the bank to count as correct.
- **D20.** Scoring is all-or-nothing by default, or one point per correctly placed card under "each correct part" (D17). The key uses the same encoding style as Matching (`card:bucket|…`, empty bucket for distractors). Read-aloud reads the buckets and cards. Categorize questions are left off paper answer sheets.

### Structured passages (PR 5)

- **D21.** The `text` stimulus gains structure: a title and byline, subheadings, numbered paragraphs (numbers shown in the margin as in print) and inline images, all using the D8 formatting. The full passage stays in the resizable side panel.
- **D22.** A question can reference a paragraph range of a passage (`passageRef: { stimulusId, from, to }`). The player shows that excerpt with its original paragraph numbers above the question, taken from the passage so the text is never duplicated.
- **D23.** Read-aloud covers section directions, Categorize cards and Part A/B stems like other question text. Passage read-aloud is a per-quiz setting, **off by default**, because reading the passage aloud defeats a reading or fluency check.

### Teacher-scored item (PR 6)

- **D24.** New question type for items the teacher scores with no student answer (A&L Fluency).
  - Students see its passage and a "Read this to your teacher" card, then move on.
  - It has points, or a rubric.
  - It counts toward its section and the total.
- **D25.** It appears in the grading queue even though the student submitted nothing, and Results gets a class score grid for fast entry of one score per student. The monitor gets no scoring inputs.

### General non-AI import (PR 7)

- **D26.** The non-AI reader learns general patterns:
  - `Section N | Title` headings and `Directions:` blocks become sections.
  - "STOP / wait for your teacher" sets the section gate.
  - `Part A:` / `Part B:` become a linked group.
  - Numbered paragraphs with subheadings become a structured passage.
  - "Read paragraph(s) N–M" plus a quoted paragraph becomes an excerpt reference.
  - "Choose two answers" becomes MA with `selectCount`.
  - "Sort into each category" with a category header row becomes Categorize.
  - "Number the events … in order" becomes Ordering.
  - "Read fluently to your teacher" becomes a teacher-scored item.
  - Bold and italic carry over (D8).

  Other curricula get the same gains. The AI reader stays under its existing gate, unchanged.

### Arts & Letters (Phase 2)

- **D27.** An A&L "Assessment Guide" answer-key profile in the non-AI key reader, recognized from the key's layout. It reads:
  - `N POINTS` per item.
  - "Award points as follows" ladders (such as 4/4 = 4, 3/4 = 3), which become "each correct part".
  - "Students must correctly answer Part A in order to receive credit for Part B", which becomes the gated rule.
  - "Literal: … Figurative: …" category lists.
  - Numbered order lists.
  - Rubric score descriptions, which become a free-response rubric with levels.
  - The "Self Reflection … Award two points to all students" row, which becomes a not-scored section with an award.
  - `Fluency Total Points: N`, which becomes the teacher-scored item's points.
  - The section totals, used as a cross-check warning when the imported total differs.
- **D28.** Admin assessment library in Admin Settings, for any curriculum; A&L is the first content.
  - **Targeting:** admins publish a canonical quiz to any mix of buildings, individual grade levels (K through 12, not only the bands) and named teachers, or to everyone. Firestore rules enforce the targeting; the UI does more than filter.
  - **Delivery:** a teacher who uses an item gets a synced copy that joins the item's `synced_quizzes` sync group. Admin corrections then reach every copy, and every teacher's sessions share one `syncGroupId`, so grade-level and PLC results line up.
  - **Editing:** while linked, teachers can change session options only (pacing, read-aloud, accommodations), not questions or the key. **Make my own copy** unlinks it into a new sync group, with a warning that it leaves team reporting.
  - **AI:** admins pass the existing AI gates, so the library import can run the AI reader beside the non-AI one to compare. Teachers' AI access is unchanged.
- **D29.** Library items stay inside the district. They cannot be put on public share links or any auth-free surface. Teachers' own imports follow the normal sharing rules.
- **D30.** Validation run: import every K-5 A&L assessment Paul can gather and check each imported total and section subtotal against the publisher's key, starting with 34 for the reference example. Fix detector or profile gaps in the same PR.

## PR sequence

| PR  | Phase | Scope                                                                                                               | Flag                        |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | 1     | Auto-score override, key-edit rescore warning, PLC applies overrides (D4–D7)                                        | none                        |
| 2   | 1     | Inline formatting, sections, numbering, not-scored award, subtotals, unscored tally, wait-for-teacher gate (D8–D14) | `quiz-sections`             |
| 3   | 1     | Part A/B groups, gated scoring, "each correct part" mode, MA choose-exactly-N (D15–D18)                             | `quiz-multi-part-items`     |
| 4   | 1     | Categorize type (D19–D20)                                                                                           | `quiz-categorize`           |
| 5   | 1     | Structured passages, excerpt references, passage read-aloud setting (D21–D23)                                       | `quiz-structured-passages`  |
| 6   | 1     | Teacher-scored item, grading-queue entry without an answer, class score grid (D24–D25)                              | `quiz-teacher-scored-items` |
| 7   | 1     | General non-AI import detectors (D26)                                                                               | `quiz-import-structure`     |
| 8   | 2     | A&L answer-key profile (D27)                                                                                        | behind PR 7's flag          |
| 9   | 2     | Admin assessment library (D28–D29)                                                                                  | `admin-assessment-library`  |
| 10  | 2     | A&L validation run (D30)                                                                                            | —                           |

The flag ids are proposals; rename them in the PR that adds each one. Each PR description names its flag, its starting access level, and the path to open it: Admin Settings > Access > Global Settings > set to Public.

## Rules and compatibility notes

- Every new field is optional, and old clients ignore unknown `order` kinds. Because of that, the player-side handling for sections, groups, Categorize and the teacher-scored type must reach `main` **before or with** each type's authoring tools. Otherwise a teacher's open tab running the previous client meets an item it can't render.
- `grading[key].override` and teacher scores on questions with no answer both need `firestore.rules` checks on the response doc. Check the compiled-size cap with `node scripts/releaseFirestoreRules.mjs spartboard-dev` before the PR reaches `main`.
- The library adds a new collection and its targeting rules (PR 9). That is the largest rules change in the plan.

## Open items

- **License.** Paul to confirm that the district's A&L license covers digital classroom use of the assessments. D29 keeps library content internal either way.
- **Changelog.** Each flagged piece gets its `public/changelog.json` entry when its flag opens to everyone, not when it merges.
