# Writing assignment

Status: planned. Grilled and settled 2026-11-16. Nothing is built yet.

Terms (Writing assignment, Writing record, Focus mode, Stimulus tab, Live view, Nudge) are defined in [`GLOSSARY.md`](../../GLOSSARY.md). Why writing happens in SpartBoard and not in Google Docs is in [ADR 0007](../adr/0007-writing-is-recorded-in-spartboard-not-google-docs.md). It must work without an LMS course ([ADR 0009](../adr/0009-new-student-facing-work-must-not-need-the-lms.md)).

## 1. Intent

A teacher assigns a piece of writing, students write it in SpartBoard, and the Writing record shows how it was written. The record is the teacher's evidence that the work is the student's own, since Google's originality reports can't be reached from another app.

This is the third of four steps: Course, Agenda ([COURSE_AND_AGENDA.md](COURSE_AND_AGENDA.md)), the Writing assignment, then copy-per-student Google files.

Most of the parts exist already for quiz written answers: the editor, the edit log and its playback, the grader, rubrics, Focus mode, Live view and Nudge. This plan gives them a home of their own that fits a multi-day essay.

Non-goals for this plan:

- AI of any kind: no AI grading, drafted feedback or coaching (D17).
- Voice typing, and a spell checker of our own.
- Pictures, tables, fonts or page layout in the editor.
- Peer review, group writing and named draft stages (Outline, Draft 1, Final).
- A saved comment bank.
- Students who join with a PIN, and classes with no ClassLink link (D20).
- A label or score that says a student cheated (D9).

## 2. Decisions

| #   | Decision          | Choice                                                                                                                                                                                             |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Kind of work      | One tool for a single sitting and for writing over several days. A student can leave and come back until they turn it in                                                                           |
| D2  | Who it is for     | Grades 3 to 12                                                                                                                                                                                     |
| D3  | Editor            | Bold, italic, underline, headings, lists, indent and a word count. The accent keys and math keyboard that quiz written answers have                                                                |
| D4  | Spell check       | Chrome's red underlines show unless the teacher switches them off for the assignment. The right-click menu is always off, so students fix words themselves                                         |
| D5  | Read aloud        | Students can hear the prompt read aloud, as in quizzes                                                                                                                                             |
| D6  | Sources           | The prompt, plus Stimulus tabs (reading, picture, PDF) beside the editor                                                                                                                           |
| D7  | Limits            | Optional minimum and maximum words, and an optional time limit that turns the work in when it runs out. Both work as they do in quizzes                                                            |
| D8  | Paste             | Blocked unless the teacher allows it. When allowed, each paste is kept in the Writing record with its text. Moving text inside the piece always works                                              |
| D9  | Writing record    | Playback, plus a summary: time spent writing, number of sittings, each paste with its size and text, time away from the tab. Facts only; SpartBoard never marks work as suspicious                 |
| D10 | Recording notice  | A line telling the student their writing is recorded. On for a new assignment; the teacher can switch it off                                                                                       |
| D11 | Student's view    | Whether a student can open their own playback and summary is the teacher's choice, set when assigning and changeable when returning work. Off for a new assignment                                 |
| D12 | Turn in           | Turned-in work locks. The teacher can return it for revision any number of times, and the record carries on across drafts                                                                          |
| D13 | Feedback          | The same as grading a quiz written answer: highlights with comments on the turned-in text, an overall comment, points, rubric scores, excused                                                      |
| D14 | Grading           | Optional. A rubric from the teacher's Library, a points total, or ungraded. Scores go to the gradebook the way quiz scores do                                                                      |
| D15 | During class      | A monitor with who has started, word counts and time away, plus Live view and Nudge                                                                                                                |
| D16 | Export            | To a Google Doc holding the final text only. The teacher can export one student or the class to their own Drive any time after turn in. A student can export their own once the grade is published |
| D17 | AI                | None in version 1                                                                                                                                                                                  |
| D18 | Where it lives    | Its own widget, and each Writing assignment is a Library item (ADR 0007)                                                                                                                           |
| D19 | Rollout           | The widget ships at access level `admin`, like every other preview. Paul adds Beta users when he chooses. No pilot group is set by this plan                                                       |
| D20 | Who can be a user | Students signed in through ClassLink (or the test class). Work over several days and the gradebook both need a student identity that stays the same                                                |

Defaults I chose that were not asked; say if any is wrong:

- D20 itself. PIN joiners and manually made classes are left out.
- Due dates, per-class due dates and assigning to chosen students work as they do for quizzes.
- Each turn in freezes a copy of the text. Feedback is attached to that copy, so a returned draft keeps its comments while the student revises.
- A student sees feedback and the grade when the teacher returns the work or publishes the grade, not before.
- Grades 3 to 5 get the same screen with a text size control. No separate young-student layout.
- Read aloud covers the prompt and sources only in version 1 (§5).
- Recording a Writing assignment does not depend on the `input-signals` flag that gates recording in quizzes.

## 3. What exists today

Checked 2026-11-16.

- **Editor.** `components/quiz/WrittenResponseEditor.tsx`: a plain `contentEditable` with bold, italic, underline, lists, math, a `spellCheck` prop and paste handling. No headings or indent. The repo has no editor library; `dompurify` and `diff` are installed.
- **Edit log.** `utils/writingLog.ts` (`WritingEdit`, `WritingLogWriter`, `summarizeWriting`, checkpoints) with a budget of 200,000 bytes per response, about 6,000 words. `hooks/useInputSignals.ts` saves it every 20 seconds, slowing past 30 KB. It is stored inline on the quiz response (`inputSignals`), behind the `input-signals` flag.
- **Playback.** `components/common/WritingPlayback.tsx` (`WritingPlayer`), teacher side only, used in `QuizResults.tsx`. No student playback exists.
- **Grading.** `FreeResponseGrader.tsx` writes a `WrittenAnswerGrade`: points, overall comment, highlights on a frozen snapshot, rubric scores, excused. `RubricScoringPanel.tsx` is already shared with Projects.
- **Focus mode.** Session fields in `BaseSessionOptions`, `utils/pageProtections.ts`, `hooks/useTabAwayTracker.ts`, `TabExitsPopover.tsx`. A kind opts in by stamping the fields when assigning and calling the hook on its student page.
- **Live view and Nudge.** `components/widgets/QuizWidget/components/monitor/LiveViewPanel.tsx`, redrawn from the saved response (`docs/plans/shipped/QUIZ_LIVE_VIEW.md`).
- **Assigning.** No registry of assignment kinds. Each kind is wired by hand: `hooks/useStudentAssignments.ts` (`SessionKind`, `KIND_CONFIG`), `assignStepper/`, `functions/src/studentAssignmentTargets.ts`, the cleanup functions, the Assignments hub, the student landing rows, and a route in `App.tsx`.
- **Gradebook.** A scored kind adds entries in `utils/gradebook/gradebookCore.ts` and its mirror in `functions/`, `functions/src/gradebook/gradeIndex.ts` and `gradeIndexTriggers.ts`, and a score function ([GRADEBOOK.md](GRADEBOOK.md)). It needs a stable student id.
- **Export.** `utils/googleDriveService.ts` has `createGoogleDocFromHtml`.
- **Read aloud.** `components/quiz/readAloud/` with server text to speech in `functions/src/quizReadAloud.ts`.
- **Widget pattern.** `components/widgets/QuizWidget/`: manager, monitor and results views, an editor modal and an assign stepper, on the shared `components/common/library/` pieces.

## 4. Shape of the build

### 4.1 Approach

A Writing assignment is a new assignment kind, `writing`, not a one-question quiz. A quiz is built around one attempt in one sitting with an answer key; a Writing assignment has drafts, returns and a record that outgrows one document. Sharing the quiz session would bend both.

It reuses the quiz parts by lifting them out of the quiz folders where needed, not by copying them: the editor, the edit log, the player, the grader, Stimulus tabs, Focus mode, Live view, read aloud and the assign stepper.

### 4.2 Data

- **The Library item**: title, prompt, Stimulus tabs, rubric, word limits. A small Firestore document under the teacher, as rubrics are.
- **A session per assignment**, with the same class and student targeting, due dates and Focus mode fields as a quiz session, plus the paste, notice, student's view, spell check and time limit settings.
- **One response per student**, keyed by the student's id: the current text, status (draft, turned in, returned, graded), the summary numbers, and the grade.
- **The edit log in its own documents under the response**, in chunks. A multi-day essay with revisions passes the 200,000 byte budget that fits a quiz answer, and a Firestore document holds 1 MB at most.
- **A frozen copy per turn in**, with the feedback attached to it.

### 4.3 PRs into `dev-paul`, in three waves

| Wave | PR                  | What                                                                                                                                                   | Agent model                                     |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1    | A. Kind and Library | The types, the Library item, the widget shell (via the `new-widget` skill), the editor modal with prompt and Stimulus tabs, rules for the item         | Strongest: it fixes the data shape              |
| 1    | B. Assign and write | Stacked on A. The session and response and their rules, the assign steps, the student page with editor, autosave, word limits, turn in, My Assignments | Strongest: rules and the hand-wired kind list   |
| 2    | C. Writing record   | The chunked edit log, summary, teacher playback, paste and Focus mode, the notice, the student's view switch                                           | Strongest: storage limits and what students see |
| 2    | D. Grade and return | The grader on a frozen copy, rubric and points, return for revision, the gradebook entries                                                             | Mid-tier: follows the quiz grader               |
| 2    | E. Monitor          | The class list with word counts and time away, Live view, Nudge                                                                                        | Mid-tier: follows the quiz monitor              |
| 3    | F. Finish           | Time limit, read aloud, export to a Google Doc, headings and indent in the editor, the text size control, a Getting Started tour                       | Mid-tier                                        |

- Wave 1 is serial: one agent, A then B.
- Wave 2 runs as three agents at once, each in its own worktree from `dev-paul` after B merges. C and D both touch the response type, so B defines every field they need and neither adds one.
- A PR may grow the compiled Firestore rules by only 1,500 bytes (`.claude/rules/firestore-rules.md`), which is why the rules are split across A, B and C.
- Each wave 2 and 3 PR gets one review pass by the strongest model before it merges. No agent runs the full lint, test or type-check; CI is the gate.

### 4.4 Flags

- The Writing widget ships at access level `admin` through `feature_permissions`. Admins always pass that gate, so it is on for Paul and the other admins.
- Students need no flag: they see a Writing assignment only when a teacher with access assigns one.
- Paul adds Beta users himself and sets it to Public after testing in prod.

## 5. Open questions for the build

These are technical and get settled in the PR that reaches them:

- **Two devices at once.** A student with the piece open on a Chromebook and at home could overwrite their own work. The build must pick a rule: suggested, the newest tab takes over and the older one goes read-only.
- **Lost connection.** A Chromebook that drops off wifi mid-sentence must not lose text. The response and log need a local queue that flushes on reconnect.
- **Log size.** Set a ceiling for one piece's edit log and say what the student and teacher see if a piece reaches it. Fix `AGENT_BACKLOG.md` AB-201(1) (saves that skip the large-log throttle) before reusing the writer.
- **Live view of a long piece.** Quizzes redraw from a response saved 500 ms after typing stops. Check the write cost for a class writing for 50 minutes.
- **Read aloud of the student's own writing.** Server text to speech on a 1,500 word draft, replayed while revising, has a cost. Version 1 reads the prompt and sources only; decide the rest after seeing real use.
- **Sanitizing.** The stored text is HTML from a `contentEditable`. Sanitize on save and again on render and export.
- **Co-taught sections.** Follow whatever quizzes do for a class two teachers hold.
- **Recording without a notice.** D10 lets a teacher switch the notice off. Before it opens past admins, Paul decides whether district policy needs the notice locked on.
