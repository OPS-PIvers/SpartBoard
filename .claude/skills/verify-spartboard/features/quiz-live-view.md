# Quiz Live view and Student view on an assignment

A teacher opens Student view on a running quiz assignment to see the copy students have, and opens Live view on one in-progress student in Monitor to watch their attempt, redrawn from saved answers, with stats, Tell the student, Nudge and Screenshot.

## Sub-features

- `assigned-student-view` opens the assigned copy from an In Progress row's menu.
- `edited-since-assigned` shows the note on a row whose library quiz was saved after it was assigned.
- `live-view-open` opens the panel from the eye button on an In progress student.
- `live-view-controls` shows the stats, Tell the student, the Nudge note select, Nudge and Screenshot.

## How to get to it (user POV)

- Quiz widget, In Progress tab, a row's menu, Student view. Needs the `quiz-student-view` preview flag.
- Quiz widget, Monitor, In progress, the eye button on a student's row. Needs the `quiz-live-view` preview flag, a self-paced quiz, and the teacher who assigned it.
- Verification path: the `/library-managers-dev?view=quiz` and `/session-views-dev?view=quiz-monitor&state=multi-class&full=1` harness pages.

## Driving it with the browser pane

Preconditions:

- Baseline from `README.md`, with the server on port 56320. Set the flag, then reload: `localStorage.authBypassFeatureOverrides = '{"quiz-live-view": true}'`.
- Resize the tab to 1280x800.

- **Row note and menu.** `navigate` to `http://localhost:56320/library-managers-dev?view=quiz`, click the `In Progress` tab. One row reads `Edited since assigned`. Click a row's menu (`[data-tour^="library-shell.archive-menu"]`): it lists `Student view` (`quiz-library.archive-student-view`).
- **Open Live view.** `navigate` to `http://localhost:56320/session-views-dev?view=quiz-monitor&state=multi-class&full=1`, click `In progress`, then the first `[data-tour^="quiz-monitor.live-view"]`. A dialog named `Live view` opens with the student's name, their question with the saved choice selected, and `Teacher's Live view, not the student's screen`.
- **Controls.** The side column lists Started, On question, Answered, Tab exits and Input tracking, then `Tell the student` (`quiz-live-view.tell-student`), the `Nudge note` select, `Nudge` and `Screenshot`.
- **Next student.** Click `Next` (`quiz-live-view.next`). The name in the header changes.
- **Proof.** `evidence.mjs new quiz-live-view session-views-dev`; screenshot the roster with the eye buttons and the open panel, and `note` the student name and question shown.

## Gotchas

- Isolated mode has no backend: the stamp, Nudge, log and Screenshot writes fail quietly, so those are proven only on `vite-dev` with a test student joined from a second browser.
- The eye button shows only when the mock session's `teacherUid` is the signed-in user and the session is self-paced; the default `quiz-monitor` state is teacher-paced, so use `state=multi-class`.
- The student-side banner and Nudge border are covered by `components/quiz/LiveViewNotice.test.tsx`, not by a harness page.
