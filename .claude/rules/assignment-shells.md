---
paths:
  - 'components/widgets/VideoActivityWidget/**'
  - 'components/widgets/GuidedLearning/**'
  - 'components/widgets/MiniApp/**'
  - 'components/widgets/Flashcards/**'
  - 'components/widgets/Writing/**'
  - 'components/widgets/QuizWidget/components/monitor/**'
  - 'components/widgets/QuizWidget/components/results/**'
  - 'components/widgets/QuizWidget/components/FreeResponseGrader.tsx'
  - 'components/assignmentsHub/useUnifiedAssignments.ts'
  - 'tests/assignmentShells.static.test.ts'
---

# Assignment widgets reuse the Quiz shells

Paul's rule: every assignment widget (Quiz, Writing, Video Activity, Flashcards, Mini Apps, Guided Learning, and any new `AssignmentKind`) builds its monitor, Live view, results and grader from Quiz's shared pieces. A hand-built copy drifts half-aligned from Quiz and wastes a whole slice redoing it. When a shared piece can't do what you need, extend it (a prop, a slot, a label, a render callback) and keep Quiz working; never fork it.

| Surface             | Use                                                                                                      | From `components/widgets/QuizWidget/components/`                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Monitor header      | `ClassPicker`, `PeriodBar`, `PeriodAccessStrip`                                                          | `monitor/PeriodBar`, `monitor/PeriodAccessStrip`                                            |
| Monitor status      | `StatusBuckets`                                                                                          | `monitor/StatusBuckets`                                                                     |
| Monitor roster      | `RosterList`, or `RosterRow`, `RosterToolbar`, `RosterRowMenu`, `RosterScorePill`, `RosterOnQuestion`    | `monitor/RosterList`, `monitor/RosterParts`, `monitor/rosterStyles`, `monitor/monitorUtils` |
| Per-question view   | `QuestionResults`, `QuestionDetail`, `ItemResultsList`, `ItemDetailView`                                 | `monitor/QuestionResults`                                                                   |
| Live view           | `LiveViewPanel`, `LiveLogList`                                                                           | `monitor/LiveViewPanel`, `monitor/LiveLogList`                                              |
| Results page        | `ResultsSummaryCard`, `ScoreDistributionBars`, `ResultsDrillRow`, `SegmentedToggle`, `StudentAnswerLine` | `results/ResultsHome`, `results/SegmentedToggle`, `results/StudentAnswerLine`               |
| Per-student actions | `StudentResultsControl`, `StudentResultsBulkBar`, `ShowResultsDialog`, `studentResultsSelection`         | `results/`                                                                                  |
| Grader              | `FreeResponseGrader`, `RubricScoringPanel`                                                               | `FreeResponseGrader`, `RubricScoringPanel`                                                  |
| Print               | `ResultsPrintModal`                                                                                      | `ResultsPrintModal`                                                                         |

Flashcards' `results/FlashcardMonitor.tsx` and `results/FlashcardCheckRoster.tsx` are the worked example of a non-quiz widget on these pieces (its other results files still have AB-252 to do). `ScorePill`, `SessionBadge`, `LaunchedBySubTag` and `OverflowMenu` from `components/common/sessionViews` are still shared; its `SessionRow`, `SessionViewHeader`, `StatTile`, `SegmentedTabs`, `ActionButton` and `PeriodAccessControls` are the old layout and are not used in new work.

**The guard:** `tests/assignmentShells.static.test.ts` fails CI when:

- an assignment widget's file defines its own copy of a shared piece (a component named like `*RosterList`, `*LiveViewPanel`, `DrillRow`, `*Grader`, `*AnswerLine`, `StatusBuckets`, `ClassPicker` …) or imports an old-layout `sessionViews` piece. The error names the shared component to use.
- a widget has a monitor, roster or submissions file, a results, grader or marking file, or a Live view file (by name) but doesn't import that surface's shared pieces.
- a grader, grading or marking file for a kind with written answers (Video Activity, Writing) doesn't render `FreeResponseGrader` itself. Wrapping only the outer modal (`EditorModalShell`, `RubricScoringPanel`) and hand-building the student list, Score box and Auto-advance inside is exactly what Writing grade-and-return did, and it missed the Quiz grader redesign. A thin `XxxGrader`, `XxxRosterList` or `XxxLiveViewPanel` that renders the shared piece is fine.
- a new `AssignmentKind` appears without an entry in the guard.

`KNOWN_COPIES` and `NOT_YET_ADOPTED` list today's bypasses, each tied to an `AGENT_BACKLOG.md` item. They only shrink: delete an entry in the PR that moves the file onto the shared piece. Adding one needs Paul's OK, named in the PR.
