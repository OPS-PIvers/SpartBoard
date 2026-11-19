# Quiz widget structure

Status: planned 2026-11-19. Nothing is built yet. Not grilled: the decisions in section 2 are the author's recommendations and Paul has not confirmed them.

## 1. Intent

Quiz is the most used widget and the source of the shells every other assignment widget reuses (`.claude/rules/assignment-shells.md`). Its parts are well tested, but the widget itself is one very large component with everything attached to it. This plan breaks it into pieces the size of the rest of the codebase, with tests around each, so the next Quiz feature or fix touches a small tested file.

**No teacher sees a change from this plan.** Every slice moves code without changing what it does. A slice that would change behaviour is out of scope and belongs to the cross-widget alignment work (section 6).

Measured on `dev-paul` at `3656a86`:

| File                                                       | Lines | What stands out                                                                                                                                        |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/widgets/QuizWidget/Widget.tsx`                 | 5,995 | One component, `TeacherQuizWidget`, spans lines 411-5952: 39 `useState`, 18 refs, 159 `addToast` calls, 30 `canAccessFeature` checks, 11 `showConfirm` |
| `components/widgets/QuizWidget/components/QuizResults.tsx` | 5,380 | Out of scope here (shared shell)                                                                                                                       |
| `components/widgets/QuizWidget/components/QuizManager.tsx` | 4,124 | `QuizManagerProps` is about 320 lines, because the widget owns all data and passes it down                                                             |
| `hooks/useQuizSession.ts`                                  | 4,595 | Teacher and student session logic in one file                                                                                                          |
| `hooks/useQuizAssignments.ts`                              | 4,423 | Create, lifecycle, scores and paper in one file                                                                                                        |

How `Widget.tsx` is laid out today:

- Views are chosen by early return: `import` (2803), `preview` (2870), `results` (3147), `monitor` (3471), then the manager render to 5950.
- Only five handlers are named (`handleShareWithPlc`, `handleStopSharingPlc`, `handleMergeQuizzes`, `handleUpdateQuizConfig`, `handleReorderQuizzes`). Assign, end, reopen, delete, share and publish are written inline in the props passed to `QuizManager`, about 2,500 lines of JSX.
- There is no test file for `Widget.tsx` or `QuizManager.tsx`. The widget folder has 47 test files, all for the pieces around them.

**The Assigned tab is changing the same code.** [ASSIGNED_TAB.md](ASSIGNED_TAB.md) (approved 2026-11-18) replaces In Progress and Completed with one Assigned tab and per-class Open, Pause, Close and Reopen. It is built for all six kinds behind the `assigned-tab` preview flag and is waiting on Paul's prod test (PT-254). While that flag is live, `Widget.tsx` and `QuizManager.tsx` carry both the old rows and lifecycle and the new ones (`assignedTabLifecycle`, `classLifecycle`). D14 sets how this plan works around it.

Non-goals:

- Any change to what a teacher or student sees, including wording, order, defaults and toasts.
- The stored data shape: `quiz_assignments`, `quiz_sessions`, status words, field names and widget config keys other than the dead ones in D8.
- `QuizResults.tsx`, `FreeResponseGrader.tsx`, `monitor/` and `results/`. They are the shared shells; splitting them has a wider blast radius and gets its own plan.
- The student app (`components/quiz/`).
- Firestore rules and Cloud Functions.

## 2. Decisions

| #   | Decision       | Choice                                                                                                                                                                                                                                                                                                                         |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Target shape   | The Writing pattern: a thin `Widget.tsx` that picks a screen from `config.view`, and one component per screen that owns its own state, hooks and handlers                                                                                                                                                                      |
| D2  | Order          | Tests first, then actions into hooks, then screens out of the widget, then the manager's props, then the two large hooks. Each step makes the next one smaller                                                                                                                                                                 |
| D3  | Behaviour      | Every slice is a move. A PR that changes a toast, a default, a confirm or an order is rejected and re-cut. Bugs found on the way are filed, not fixed in the same PR                                                                                                                                                           |
| D4  | Feature flag   | None. There is no new behaviour to gate, and a flag would mean keeping both copies of 5,000 lines alive. The safety comes from D5 and D6 instead                                                                                                                                                                               |
| D5  | Pinning tests  | Before a block moves, a test pins what it does today (the write, the toast text and tone, the confirm, the view change). The test must pass unchanged after the move                                                                                                                                                           |
| D6  | PR size        | One screen or one action group per PR, each small enough to review by reading the diff as a move. No PR mixes a move with a cleanup                                                                                                                                                                                            |
| D7  | Actions        | Assign, lifecycle (pause, start, end, reopen), delete, share and PLC, publish scores, and reorder each become a hook in `components/widgets/QuizWidget/hooks/` that returns named functions. The Assignments hub calls the same functions later                                                                                |
| D8  | Dead code      | Removed in its own slice at the end: the `editor` value in `QuizConfig.view`, the deprecated PLC keys in `config/widgetDefaults.ts` (`plcMode`, `plcSheetUrl`, `teacherName`, `periodName`, `plcMemberEmails`) once no reader remains, the unused `libraryViewMode` declaration unless the alignment work has started using it |
| D9  | Feature checks | The 30 `canAccessFeature` calls move behind one `useQuizCapabilities()` that returns named booleans. Retiring a flag then changes one line                                                                                                                                                                                     |
| D10 | Messages       | Toast and confirm text moves to one module of named messages, byte for byte. Rewording is the alignment work's job                                                                                                                                                                                                             |
| D11 | Lint overrides | The eight `eslint-disable` lines are resolved as their code moves (three `set-state-in-effect`, four `refs`, one `preserve-manual-memoization`), using `useEffectEvent`, a `key`, or the adjusting-state pattern per CLAUDE.md. Any that can't be stays with its reason                                                        |
| D12 | Review widget  | `ReviewWidget` keeps sharing the Quiz code through `QUIZ_LIBRARY_CONFIG`. Moving Review off the old `AssignModal` is behaviour and is out of scope                                                                                                                                                                             |
| D13 | Large hooks    | `useQuizAssignments.ts` splits by job (create, lifecycle, scores, paper) behind the same exported hook, so callers don't change. `useQuizSession.ts` splits teacher from student. Both come last                                                                                                                               |
| D14 | Assigned tab   | The lifecycle hook (S3) and the library screen (S4) wait until `assigned-tab` is retired, so they move one path and not two. Everything else goes ahead now. S1 pins both paths, flag on and flag off, so the retire itself is covered                                                                                         |

Defaults I chose that were not asked; say if any is wrong:

- No feature flag (D4). The alternative is a flag that swaps the whole widget, which doubles the code for the length of the project.
- Bugs found during a move are filed, not fixed in place (D3), even small ones.
- `QuizResults.tsx` and the grader are left for a later plan.

## 3. Slices

Each slice is one or more PRs into `dev-paul`. A slice is done when its tests pass unchanged from before the move and the Quiz flows in section 4 work on localhost against `spartboard-dev`.

| #   | Slice                         | What moves                                                                                                                                                                                                                                                                                                                                           | Size |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| S1  | Pin the widget                | New `Widget.test.tsx` and `QuizManager.test.tsx`. Cover: each `config.view` renders its screen; assign (success, failure, skipped students); pause, start, end, reopen; delete with and without archived assignments; share link; PLC share and stop; publish and unpublish; reorder. Assert writes, toast text and tone, confirm text, view changes | M    |
| S2  | Messages and capabilities     | D9 and D10. `quizMessages.ts` and `useQuizCapabilities()`. No handler moves yet                                                                                                                                                                                                                                                                      | S    |
| S3  | Actions into hooks            | D7, one PR per group: `useQuizAssignAction`, `useQuizLifecycleActions`, `useQuizDeleteAction`, `useQuizShareActions`, `useQuizPublishActions`, `useQuizReorder` (the `writeBatch` at 2490). The inline JSX handlers become calls to these                                                                                                            | M    |
| S4  | Screens out of the widget     | One PR per early return: `QuizImportScreen`, `QuizPreviewScreen`, `QuizResultsScreen`, `QuizMonitorScreen`, then `QuizLibraryScreen` for the manager render. Each takes its state, effects and refs with it                                                                                                                                          | L    |
| S5  | Thin widget                   | `Widget.tsx` is the auth and Drive gates plus the view switch. `QuizManager` reads what it needs from the S3 hooks, and `QuizManagerProps` drops to what a parent must decide                                                                                                                                                                        | M    |
| S6  | Split `useQuizAssignments.ts` | D13, behind the same exported hook                                                                                                                                                                                                                                                                                                                   | M    |
| S7  | Split `useQuizSession.ts`     | D13, teacher from student. The student half is what `components/quiz/` imports, so this one also runs the student flows in section 4                                                                                                                                                                                                                 | M    |
| S8  | Dead code and lint            | D8, and any D11 override not already resolved                                                                                                                                                                                                                                                                                                        | S    |

S1 is the only slice that has to come first. In S3, `useQuizLifecycleActions` waits for the `assigned-tab` retire (D14); in S4, `QuizLibraryScreen` does too. The other S3 hooks and the import, preview, results and monitor screens do not. S2 and S3 can overlap. S4 depends on S3. S6 and S7 depend on nothing after S1 and can run alongside S4.

Targets when done: no file in the Quiz widget's teacher path over about 1,000 lines outside the out-of-scope shells; `Widget.tsx` under 200; `QuizManagerProps` under 40 lines.

## 4. Checks for every slice

Compatibility with an open tab is not at risk here, since nothing stored changes. The risk is a handler that moved and lost a line. So each slice runs:

- `pnpm exec vitest related --run <changed files>`, with the S1 tests unchanged.
- `pnpm run type-check` once per PR (these moves cross folders).
- On localhost against `spartboard-dev`, signed in: create a quiz, assign to a class, assign with no class, pause and start, open the monitor, end, open results, reopen, publish scores, delete. For S7, also join as a student from the mock class and submit.
- A read of the diff as a move: `git diff --color-moved=zebra` should show moved blocks, not edits.

At the `main` release that carries a slice, the release review names it so the prod smoke test and Paul's first use watch Quiz assigning and monitoring.

## 5. Risks

| Risk                                                                         | Guard                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A moved handler closes over stale state                                      | S1 tests run the handler after a state change; the four latest-value refs are moved with their readers (D11) |
| An effect's timing changes when its component is split                       | S4 moves one screen per PR; the three `set-state-in-effect` sites are covered by S1 tests before they move   |
| Another branch edits `Widget.tsx` while a slice is open                      | Keep each PR to a day; rebase before merge; tell Paul when S4 starts so large Quiz features wait or go first |
| The plan stalls half done                                                    | Every slice leaves the widget working and smaller. Stopping after S3 or S5 is a fine place to rest           |
| Review shares the code and breaks quietly                                    | S1 renders `ReviewWidget` too and covers its Start flow                                                      |
| The `assigned-tab` retire lands mid-plan and deletes code a slice just moved | D14 holds the two overlapping pieces until the retire; S1 covers both paths                                  |

## 6. What this plan does not fix

The 2026-11-19 parity audit found about 170 differences between the assignment widgets, with Quiz on the receiving end of a few behaviour changes: waiting for the save before the assign stepper closes, one delete confirm in place of two, and the "click Resume" toast. The row wording, tab names and reopen behaviour it flagged are settled by ASSIGNED_TAB.md. Those change what teachers see, so they ship behind a preview flag under a separate plan. This plan makes them cheaper by giving each a named function and a test to change.
