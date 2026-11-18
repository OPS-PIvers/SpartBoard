# Library + Assigned: one status per class, no overall status

Approved by Paul 2026-11-18 (grilling session, cloud). Covers every assignment widget; the first build is Quiz only. Clickable prototype: `docs/plans/mockups/assigned-tab-prototype.html`. Decision record: `docs/adr/0011-an-assignment-has-no-status-of-its-own.md`.

## Problem

Assignment widgets have three tabs (Library, In Progress, and Completed or Archive depending on the widget). An assignment carries one overall status, and the tabs filter on it alone (`QuizManager.tsx` `status !== 'inactive'`). Access is really per class (`periodAccess`, `docs/plans/shipped/PER_PERIOD_ASSIGNMENT_ACCESS.md`), so the overall status is wrong most of the time:

1. The card's "Start" resumes the assignment and opens the monitor; a second "Start" in the monitor lets one class in.
2. A teacher finishes one class by pressing Pause and leaving it paused, because the only way to finish is "Close all" (card menu: "End"), which ends every class.
3. A quiz every class has finished stays in In Progress, badged "Live", until the teacher ends it. Nothing else moves it: not `closeAt` passing, not every class being closed.
4. "Reopen" returns the quiz as Paused, so the teacher presses Start again.
5. The six kinds disagree on labels (Completed vs Archive, End vs Close all vs Archive, Reopen vs Reactivate vs Move to In Progress) and on which actions exist.

## Decisions

### Model

- **D1. One assignment, one status per class.** Assigning a quiz to three classes is one row. Each class has its own access status.
- **D2. Five class statuses: Ready, Scheduled, Open, Paused, Closed.** Scheduled and clock-driven closing use the same words as opening by hand. "Live" is not used: the glossary keeps it for Live view and Live tours.
- **D3. The assignment has no status of its own.** Whether it is Active or Done is derived (D5). There is no "End all" button.
- **D4. Grading and publishing are a separate track**, one per assignment as today (`scoreVisibility`, `scorePublishedAt`): needs grading, scores not published, scores published. They are not steps in the class status.
- **D5. Done = every class Closed, nothing waiting for a grade, and scores published** (or the assignment publishes no scores, as with a view-only share). Everything else is Active. A teacher can also move an assignment to Done by hand, which closes every class.

### Actions and wording

- **D6. Open, Pause, Resume, Close, Reopen**, each naming the class when there is more than one ("Open for P2", "Close P2"). Pause is a short freeze during class and expects Resume. Close means that class is finished: its open attempts are turned in once the save grace passes, and a Reopen before then cancels that.
- **D7. One action lets students in.** The same Open is on the Assigned row and in the monitor. Opening the monitor is "Monitor" and changes nothing.
- **D8. The row's main button picks the class in session** from the bell schedule ("Open for P2"). The schedule only chooses the default; it never filters the list. With no class in session the button is Monitor (a class is open), Grade, Publish scores, Results, or Choose class.
- **D9. Reopen lets that class back in at once.** No Paused step. The attempt limit still applies: a student who has used every attempt stays locked out (rules read `attemptLimit` from the session; add a test for this case).
- **D10. "Close for all classes" and "Move to Done" live in the row's overflow menu**, both with Undo.
- **D11. A class left open is flagged.** When an assignment that closes by hand is still Open for a class whose period has passed (or, with no bell schedule, since an earlier day), a flag pins to the top of Assigned with Close and Leave open. An assignment set to end at the end of class closes itself and needs no flag.

### Layout

- **D12. Two tabs: Library and Assigned.** Quiz keeps its Banks tab. Assigned has an Active section and a collapsed Done section. There are no per-status sections: a row with classes in different states cannot sit honestly in one.
- **D13. Active is sorted so anything Open is first**, then Paused, then Ready or Scheduled, then Closed and waiting on the teacher.
- **D14. A row is a title, one plain status line and one button.** The line reads like "Open for P2 19 of 27 turned in · 1 class to go", "Ready for 3 classes", "Needs grading". Clicking the row shows each class with its own actions, plus the assigned date, join code and how it closes. No badge column, no date or code in the collapsed row.
- **D15. An assignment with one class or code-only joining is a single line**: Open, Close, Reopen with no class name and nothing to expand.
- **D16. View-only shares are rows in Assigned** with the line "Shared, view only". End share and Reactivate become Close and Reopen. With no scores to publish they are Done as soon as they are closed.
- **D17. After the Assign steps the teacher lands on Assigned** with the new row on top and every class Ready or Scheduled. Nothing opens until the teacher clicks or a schedule fires.
- **D18. The list is built once and shown in two places**: each widget's Assigned tab (filtered to its kind) and the sidebar Assignments hub (all kinds).

### Rollout and compatibility

- **D19. Quiz first, behind a preview flag.** `assigned-tab`: `GlobalFeature` id, `FEATURE_DEFAULTS` entry with `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`; also in `functions/src/featureMissingDoc.ts`. Flag off renders today's three tabs unchanged.
- **D20. Existing assignments are translated on read.** No migration. `inactive` shows as Closed. An assignment that was ended before it was ever handled by the new tab is Done whatever its grading or publishing state, so years of old quizzes with unpublished scores stay out of Active; D5's grading and publishing hold applies only to assignments closed through the new tab (D24 marks those). `active` or `paused` without `periodAccess` shows as a single Open or Paused line. Turning the flag off restores the old view exactly.
- **D21. The old overall status is kept in step.** Opening any class writes `active`; closing the last class writes `inactive` and ends the session, as `deactivateAssignment` does now. The PLC assessment list, the substitute portal and My Assignments keep reading it unchanged, and a teacher's open tab on the previous client stays correct at release.
- **D22. A paused or not-yet-open quiz stays on the student's My Assignments** with "Paused" or "Not open yet" (fixes AB-150), since teachers will now pause per class routinely.
- **D24. Close writes a mark that Ready lacks.** A class that has never been opened is stored today as `state: 'closed'` with no times (`buildPeriodAccess`, `utils/periodPlan.ts`), and nothing writes a per-class close. The new Close writes `state: 'closed'` plus `closedAt`; Reopen clears it. Ready is `closed` with no `closedAt` and no response from that class. Every "closed" test in D5, D13, D14 and D21's last-class check reads `closedAt`, so closing P1 never ends a quiz whose other classes are still Ready. `closedAt` is an optional field on the existing row: old clients ignore it and rules need only allow it.
- **D23. Publishing stays per assignment.** Publish is offered once every class is closed; publishing earlier still asks first (`PublishInProgressDialog`).

## Slices

1. **Derivation helper.** A pure function from an assignment (status, `periodAccess`, rosters, grading and publish fields, bell periods, now) to per-class statuses, the Active or Done bucket, the status line and the main action. Covers D20 for legacy docs and D24's Ready versus Closed test. Unit tests, no UI.
2. **Quiz Assigned tab.** `LibraryShell` gains the two-tab layout and the new row beside `AssignmentArchiveCard`, behind `assigned-tab`. Per-class actions call `usePeriodAccess`; D21 keeps `status` in step. Includes D9, D10, D15, D16, D17 and the tour anchors (carry `library-shell.archive-primary-action` over).
3. **Monitor.** Remove the footer "Close all"; the header shows the picked class's status with the same actions. Review keeps its own game controls.
4. **Still-open flag (D11) and My Assignments fix (D22).**
5. **Other kinds**, one per PR on the same row and helper: Flashcards and Writing (already per-class), then Video Activity, Mini Apps and Guided Learning, which need Reopen and per-class close built.
6. **Assignments hub** renders the shared list (D18).

Paul OKs slice 2 on `spartboard-dev` before slices 3 to 6 start.

## Not in scope

- Publishing scores per class.
- Changing `periodAccess` beyond D24's `closedAt`, the assign stepper's Manual and end-of-class options, or the student paused and closed screens.
- A class grid view or a "this class" filtered view. Both were prototyped and dropped: the grid needs width a widget doesn't have, and a view filtered by the clock hides a class left open.
