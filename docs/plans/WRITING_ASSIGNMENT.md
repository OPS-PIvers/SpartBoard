# Writing assignment

Status: planned. Grilled and settled 2026-11-16, then audited against the code and grilled again the same day. Nothing is built yet.

Terms (Writing assignment, Writing record, Writing session, Turn in, Return, Take back, Focus mode, Stimulus tab, Live view, Nudge) are defined in [`GLOSSARY.md`](../../GLOSSARY.md). Why writing happens in SpartBoard and not in Google Docs is in [ADR 0007](../adr/0007-writing-is-recorded-in-spartboard-not-google-docs.md). Why edit logs are deleted each summer is in [ADR 0010](../adr/0010-edit-logs-are-deleted-each-school-year.md). It must work without an LMS course ([ADR 0009](../adr/0009-new-student-facing-work-must-not-need-the-lms.md)).

## 1. Intent

A teacher assigns a piece of writing, students write it in SpartBoard, and the Writing record shows how it was written. The record is the teacher's evidence that the work is the student's own, since Google's originality reports can't be reached from another app.

The record is reported by the student's own browser. It is strong evidence for a conversation with a student, not proof, and no screen in SpartBoard says otherwise.

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
- Formatting in playback (D9).
- Launching a Writing assignment from the substitute portal.

## 2. Decisions

| #   | Decision          | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Kind of work      | One tool for a single sitting and for writing over several days. A student can leave and come back until they turn it in                                                                                                                                                                                                                                                                                                                                     |
| D2  | Who it is for     | Grades 3 to 12                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D3  | Editor            | Bold, italic, underline, headings, lists, indent and a word count. The accent keys and math keyboard that quiz written answers have                                                                                                                                                                                                                                                                                                                          |
| D4  | Spell check       | Chrome's red underlines show unless the teacher switches them off for the assignment. The right-click menu is off, so students fix words themselves, except for a student with the spelling help accommodation (D22)                                                                                                                                                                                                                                         |
| D5  | Read aloud        | Students can hear the prompt read aloud, as in quizzes                                                                                                                                                                                                                                                                                                                                                                                                       |
| D6  | Sources           | The prompt, plus Stimulus tabs (reading, picture, PDF) beside the editor                                                                                                                                                                                                                                                                                                                                                                                     |
| D7  | Limits            | Optional minimum and maximum words, as in quizzes. An optional time limit makes the assignment a single sitting: the clock starts when the student opens it, runs on the wall clock as a quiz does, and turns the work in when it runs out. An assignment with no time limit can span days                                                                                                                                                                   |
| D8  | Paste             | Blocked unless the teacher allows it. Dropping text in from outside is blocked with it. When allowed, each paste is kept in the Writing record with its text. Moving text inside the piece always works                                                                                                                                                                                                                                                      |
| D9  | Writing record    | Playback, plus a summary: time spent writing, number of Writing sessions, each paste with its size and text, each piece of text added without typing or pasting (an extension, dictation) with its size and text, and time away from the tab. Playback shows plain text with line breaks, no formatting. Facts only: SpartBoard never marks work as suspicious, and the quiz "unusual input" signs are never shown on writing                                |
| D10 | Recording notice  | A line telling the student their writing is recorded. On for a new assignment; the teacher can switch it off. Closed: the notice is a teaching choice, not a compliance need (ADR 0007)                                                                                                                                                                                                                                                                      |
| D11 | Student's view    | Whether a student can open their own playback and summary is the teacher's choice, set when assigning and changeable when returning work. Off for a new assignment                                                                                                                                                                                                                                                                                           |
| D12 | Turn in           | Turned-in work locks. The student can take it back until the due date passes or the teacher saves any feedback or grade on it, whichever is first; with no due date only feedback ends it, and timed work can't be taken back. The teacher has two actions: Return shows the feedback and grade and keeps the work locked; Return for revision does the same and unlocks it. Either can be used any number of times, and the record carries on across drafts |
| D13 | Feedback          | The same as grading a quiz written answer: highlights with comments on the turned-in text, an overall comment, points, rubric scores, excused                                                                                                                                                                                                                                                                                                                |
| D14 | Grading           | Optional. A rubric from the teacher's Library, a points total, or ungraded. Scores go to the gradebook the way quiz scores do. After a revision the latest graded draft's score replaces the earlier one; earlier drafts keep their own feedback and score to look back on                                                                                                                                                                                   |
| D15 | During class      | A monitor with who has started, word counts and time away, plus Live view and Nudge                                                                                                                                                                                                                                                                                                                                                                          |
| D16 | Export            | To a Google Doc holding the final text only. The teacher can export one student or the class to their own Drive any time after turn in. A student can export their own once the teacher returns it or publishes a grade, whichever comes first                                                                                                                                                                                                               |
| D17 | AI                | None in version 1                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D18 | Where it lives    | Its own widget, and each Writing assignment is a Library item (ADR 0007)                                                                                                                                                                                                                                                                                                                                                                                     |
| D19 | Rollout           | The widget ships at access level `admin`, like every other preview. Paul adds Beta users when he chooses. No pilot group is set by this plan                                                                                                                                                                                                                                                                                                                 |
| D20 | Who can be a user | Students signed in through ClassLink (or the test class). Work over several days and the gradebook both need a student identity that stays the same                                                                                                                                                                                                                                                                                                          |
| D21 | Retention         | The text, its frozen copies, feedback and the summary numbers live as long as quiz responses do. The edit log is deleted each 1 August for every piece with no writing since 1 July (ADR 0010); a piece still being written keeps its log until the next 1 August. After that the record shows the summary and "playback is no longer kept". Deleting an assignment deletes its responses, copies and logs                                                   |
| D22 | Accommodations    | The per-student accommodations quizzes have carry over: extra time on a timed piece and read aloud. One new one, spelling help, leaves the right-click spelling menu on for that student                                                                                                                                                                                                                                                                     |
| D23 | Two devices       | Opening the piece somewhere new makes the older tab read-only with a "continue here" button. No merging                                                                                                                                                                                                                                                                                                                                                      |
| D24 | Lost connection   | The browser keeps the unsaved text and log on the device and sends them when the connection returns. The student sees "saved on this device" until then. If the piece has meanwhile moved to another tab (D23) or been locked, the device copy is not sent and never overwrites the newer text; the student is shown it as "unsent writing from this device" to copy out                                                                                     |
| D25 | Log ceiling       | About 2 MB of edit log per piece. Past it the student keeps writing and sees nothing; recording stops and the Writing record tells the teacher "recording stopped here: the log was full". The summary keeps counting                                                                                                                                                                                                                                        |

Defaults I chose that were not asked; say if any is wrong:

- D20 itself. PIN joiners and manually made classes are left out.
- Due dates, per-class due dates and assigning to chosen students work as they do for quizzes.
- Each turn in freezes a copy of the text. Feedback is attached to that copy, so a returned draft keeps its comments while the student revises. A copy the student takes back is discarded; it has no feedback by rule (D12).
- A student sees feedback and the grade when the teacher returns the work or publishes the grade, not before.
- Grades 3 to 5 get the same screen with a text size control. No separate young-student layout.
- Read aloud covers the prompt and sources only in version 1 (§5).
- Recording a Writing assignment does not depend on the `input-signals` flag that gates recording in quizzes.
- The 1 August date in D21 is fixed in code, with no admin setting.
- A substitute can't launch a Writing assignment in version 1.
- Co-taught sections follow whatever quizzes do.

## 3. What exists today

Checked 2026-11-16 against `dev-paul` at `e76eedb51`.

- **Editor.** `components/quiz/WrittenResponseEditor.tsx`: a plain `contentEditable` with bold, italic, underline, lists, math, a `spellCheck` prop and paste handling. No headings or indent, and nothing blocks the right-click menu. The repo has no editor library; `dompurify` and `diff` are installed.
- **Edit log.** `utils/writingLog.ts` (`WritingEdit`, `WritingLogWriter`, `summarizeWriting`, checkpoints) with a budget of 200,000 bytes per response, about 6,000 words. It records plain-text splices only, so it holds no formatting. Each edit has a kind: `typed`, `pasted`, `sync` (text that changed with no typing or paste event), `restored` or `format`. `hooks/useInputSignals.ts` saves it every 20 seconds, slowing past 30 KB. It is stored inline on the quiz response (`inputSignals`), behind the `input-signals` flag.
- **Playback.** `components/common/WritingPlayback.tsx` (`WritingPlayer`) and `hooks/useWritingPlayback.ts`, teacher side only, used in `QuizResults.tsx` and `FreeResponseGrader.tsx`. `writingSessions` already splits a log into Writing sessions at a 15 minute gap and the player marks pauses (#5949). No student playback exists.
- **Grading.** `FreeResponseGrader.tsx` writes a `WrittenAnswerGrade`: points, overall comment, highlights on a frozen snapshot, rubric scores, excused. `RubricScoringPanel.tsx` is already shared with Projects.
- **Focus mode.** Session fields in `BaseSessionOptions`, `utils/pageProtections.ts`, `hooks/useTabAwayTracker.ts`, `TabExitsPopover.tsx`. A kind opts in by stamping the fields when assigning and calling the hook on its student page.
- **Live view and Nudge.** `components/widgets/QuizWidget/components/monitor/LiveViewPanel.tsx`, redrawn from the saved response (`docs/plans/shipped/QUIZ_LIVE_VIEW.md`).
- **Assigning.** No registry of assignment kinds. Each kind is wired by hand: `hooks/useStudentAssignments.ts` (`SessionKind`, `KIND_CONFIG`), `assignStepper/`, `functions/src/studentAssignmentTargets.ts`, the cleanup functions, the Assignments hub (`components/assignmentsHub/useUnifiedAssignments.ts`), the student landing rows, and a route in `App.tsx`.
- **Turn in and reopen.** Projects is the nearest model: a group submits through `submitProjectGroupV1` and only the teacher's Reopen clears it (#5956).
- **Accommodations.** Per-student overrides are keyed by the student's `sourcedId` or email and are never stored on session documents (`types.ts`, M17).
- **Gradebook.** A scored kind adds entries in `utils/gradebook/gradebookCore.ts` and its mirror in `functions/`, `functions/src/gradebook/gradeIndex.ts` and `gradeIndexTriggers.ts`, and a score function ([GRADEBOOK.md](GRADEBOOK.md)). It needs a stable student id.
- **Export.** `utils/googleDriveService.ts` has `createGoogleDocFromHtml`.
- **Read aloud.** `components/quiz/readAloud/` with server text to speech in `functions/src/quizReadAloud.ts`.
- **Offline.** Firestore is set up with no local cache (`config/firebase.ts`), so nothing queues a write made offline today.
- **Widget pattern.** `components/widgets/QuizWidget/`: manager, monitor and results views, an editor modal and an assign stepper, on the shared `components/common/library/` pieces.

## 4. Shape of the build

### 4.1 Approach

A Writing assignment is a new assignment kind, `writing`, not a one-question quiz. A quiz is built around one attempt in one sitting with an answer key; a Writing assignment has drafts, returns and a record that outgrows one document. Sharing the quiz session would bend both.

It reuses the quiz parts by lifting them out of the quiz folders where needed, not by copying them: the editor, the edit log, the player, the grader, Stimulus tabs, Focus mode, Live view, read aloud and the assign stepper. The lifted player and summary take a facts-only setting that hides the quiz "unusual input" signs (D9).

### 4.2 Data

- **The Library item**: title, prompt, Stimulus tabs, rubric, word limits. A small Firestore document under the teacher, as rubrics are.
- **A session per assignment**, with the same class and student targeting, due dates and Focus mode fields as a quiz session, plus the paste, notice, student's view, spell check and time limit settings.
- **One response per student**, keyed by the student's id: the current text, status (draft, turned in, returned, revising), a save counter and the id of the tab that holds the piece (D23), the summary numbers, and the grade.
- **The edit log in its own documents under the response**, in chunks of up to 200,000 bytes. Only the newest chunk can be written; a full chunk is closed and never changes. Ten chunks is the ceiling (D25). A Firestore document holds 1 MB at most.
- **A frozen copy per turn in**, with the feedback attached to it.
- **Server functions own every change of status**: turn in, take back, the timed turn in, Return and Return for revision. The function writes the frozen copy. A student's own writes can change only the draft text, the summary and the open log chunk, which keeps the rules small and stops a student undoing a lock.
- **Take back and feedback can't cross.** The take-back function checks for feedback and discards the copy in one transaction. A feedback write to a copy that is gone is refused, never recreated, and the grader tells the teacher the student took the work back.
- **The device copy** (D24): the unsaved text and log tail are kept in the browser's storage under the student's id and the response id, and cleared only once the server has them or the student dismisses unsent writing. A flush carries the save counter and tab id; the server refuses one that is stale or aimed at a locked response.
- **The yearly deletion** (D21): a scheduled function runs each 1 August, deletes the log chunks of every response with no edit since 1 July and stamps those responses so the record can say playback is no longer kept.

### 4.3 PRs into `dev-paul`, in three waves

| Wave | PR                    | What                                                                                                                                                                                                              | Agent model                                     |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1    | A. Kind and Library   | The types, the Library item, the widget shell (via the `new-widget` skill), the editor modal with prompt and Stimulus tabs, rules for the item                                                                    | Strongest: it fixes the data shape              |
| 1    | B1. Session and rules | Stacked on A. The session, response, log chunk and frozen copy types with every field wave 2 needs; their rules; the status functions; the hand-wired kind lists; the assign steps; a `/writing-dev` harness page | Strongest: rules and the hand-wired kind list   |
| 1    | B2. Student page      | Stacked on B1. The student page with the editor, autosave, the device copy, two-device takeover, paste and drop blocking, the right-click block, word limits, turn in and take back, My Assignments               | Strongest: nothing may lose a student's text    |
| 2    | C. Writing record     | The chunked edit log and its ceiling, the summary with untyped text, teacher playback, the notice, the student's view switch, the 1 August deletion                                                               | Strongest: storage limits and what students see |
| 2    | D. Grade and return   | The grader on a frozen copy, rubric and points, Return and Return for revision, the gradebook entries, latest graded draft counts                                                                                 | Mid-tier: follows the quiz grader               |
| 2    | E. Monitor            | The class list with word counts and time away, Live view, Nudge                                                                                                                                                   | Mid-tier: follows the quiz monitor              |
| 3    | F. Finish             | Time limit, accommodations, read aloud, export to a Google Doc, headings and indent in the editor, the text size control, a Getting Started tour                                                                  | Mid-tier                                        |

- Wave 1 is serial: one agent, A, then B1, then B2.
- Wave 2 runs as three agents at once, each in its own worktree from `dev-paul` after B2 merges. C and D both touch the response type, so B1 defines every field they need and neither adds one.
- A PR may grow the compiled Firestore rules by only 1,500 bytes (`.claude/rules/firestore-rules.md`), which is why the rules are split across A, B1 and C and why status changes are functions.
- Each wave 2 and 3 PR gets one review pass by the strongest model before it merges. No agent runs the full lint, test or type-check; CI is the gate.
- Student-side checks use the `/writing-dev` harness page and unit suites, because the bypass server can't complete a student sign-in.
- Every new control gets a tour anchor (`components/CLAUDE.md`).
- PR A adds the widget's row to the flags table in `PAUL_TODO.md`.
- Fix `AGENT_BACKLOG.md` AB-201(1) (saves that skip the large-log throttle) in B2 before reusing the writer.

### 4.4 Flags

- The Writing widget ships at access level `admin` through `feature_permissions`. Admins always pass that gate, so it is on for Paul and the other admins.
- Students need no flag: they see a Writing assignment only when a teacher with access assigns one.
- Paul adds Beta users himself and sets it to Public after testing in prod.

## 5. Open questions for the build

These are technical and get settled in the PR that reaches them:

- **Live view of a long piece.** Quizzes redraw from a response saved 500 ms after typing stops. Check the write cost for a class writing for 50 minutes, and slow the save if it is high.
- **Read aloud of the student's own writing.** Server text to speech on a 1,500 word draft, replayed while revising, has a cost. Version 1 reads the prompt and sources only; decide the rest after seeing real use.
- **Sanitizing.** The stored text is HTML from a `contentEditable`. Sanitize on save and again on render and export.
- **Rules for the edit log.** Only the owning teacher can read it, plus the student when D11 allows. Check what the D11 read costs in the rules budget; if it is too much, serve the student's playback through a function.
- **Telling an inside move from a paste.** D8 lets text move inside the piece while outside paste is blocked. The build needs a reliable way to tell them apart. Settled in B2: the page remembers the text of the last copy or cut from the editor, and a paste whose text matches it (spacing aside) is a move, logged as typed; a drag that starts in the editor is a move too. Anything else is outside text. A browser clipboard marker was rejected because setting one means taking over copy and cut. Text copied from the student's own unsent writing (D24) also goes in, logged as restored.
- **Device copy on a shared Chromebook.** The copy in D24 must survive a sign out while offline, so it is never cleared before the server has it. It is shown only to the same signed-in student. Decide in B2 whether that is enough on a browser profile two students share, or whether the copy needs encrypting. Settled in B2: no encryption. The copy is keyed by the student's id and the session and read only by that signed-in student; a key kept on the same device would protect nothing. Managed Chromebooks give each student their own profile, and a shared profile already exposes that student's open tabs.
- **Timed work that goes offline.** If the clock turns a piece in while the device is offline, the unsent text misses the frozen copy. Decide in F whether the timed turn in accepts one late flush from the holding tab.
