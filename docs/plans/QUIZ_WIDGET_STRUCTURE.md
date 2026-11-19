# Quiz widget structure

Status: planned 2026-11-19, revised the same day after an adversarial review (section 7 lists what changed). Nothing is built. Not grilled: the decisions in section 2 are the author's recommendations and Paul has not confirmed them (PT-271).

## 1. Intent

Quiz is the most used widget and the source of the shells every other assignment widget reuses (`.claude/rules/assignment-shells.md`). Its parts are well tested, but the widget itself is one very large component with everything attached to it. This plan breaks it into smaller pieces, each with a test at the point where it writes, so the next Quiz feature or fix touches a small tested file.

**No teacher sees a change from this plan.** Every slice moves code without changing what it does. Under CLAUDE.md's release rule that makes it exempt from a feature flag, which Paul has to OK (D4). Anything that changes behaviour is out of scope (section 6).

Measured on `dev-paul` at `2e216c0`. This plan names functions, not line numbers, because the file moves too fast for line numbers to hold (see "Churn" below).

| File                                                       | Lines | What stands out                                                                                                                                                               |
| ---------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/widgets/QuizWidget/Widget.tsx`                 | 6,082 | One component, `TeacherQuizWidget`, is nearly all of it: about 38 `useState`, 17 refs, 11 effects, 20 `useCallback`, about 145 `addToast` calls, 30 `canAccessFeature` checks |
| `components/widgets/QuizWidget/components/QuizResults.tsx` | 5,380 | Out of scope here (shared shell)                                                                                                                                              |
| `components/widgets/QuizWidget/components/QuizManager.tsx` | 4,128 | `QuizManagerProps` is about 320 lines                                                                                                                                         |
| `hooks/useQuizSession.ts`                                  | 4,595 | Already exports `useQuizSessionTeacher` and `useQuizSessionStudent` separately; about 1,200 lines of shared pure helpers (`gradeAnswer`, `toPublicQuestion`) sit above them   |
| `hooks/useQuizAssignments.ts`                              | 4,431 | One closure: every mutator shares the same refs and one `onSnapshot`                                                                                                          |

What the code is really like, which shapes the slices:

- **The views are not independent screens.** `TeacherQuizWidget` picks a view by early return (import, preview, results, monitor, then the manager), but much of its state serves several of them:
  - `loadedQuizData` is set from the manager (`loadQuiz`, `previewBankSource`) and read by preview, results, monitor and the manager.
  - Four effects run whichever view is showing: the load and auto-end of a live session whose quiz was deleted, the live scoreboard sync and its cleanup, auto-reveal (which writes `revealAnswer` for students), and `useReopenedForAutoEnd`.
  - `publishInProgressDialog` and `publishScoresModal` are built once and rendered in both results and the manager; `assignmentSettingsModal` and `sharePlcResultsModal` in both monitor and the manager.
  - `if (loadingQuizData) return …` replaces the whole tree, `QuizManager` and open modals included. `loadQuizQuietly` and `tests/publishDialogLoading.static.test.ts` exist because of it.
  - Return order is behaviour: Schoology review, cartridges and bank import pre-empt `view`, and `results` with no loaded quiz falls through to the manager.
- **Most actions are inline.** Assign, end, reopen, delete, share and publish are written inside the props passed to `QuizManager`. Only a handful are named callbacks.
- **Some action hooks already exist**: `hooks/useQuizClassActions.ts` (per-class open, pause, close; tested), `hooks/usePlcQuizActions.tsx` (the PLC page's assign and lifecycle), and `components/widgets/QuizWidget/useReviewLaunch.tsx`.
- **Tests today.** Nothing mounts `Widget.tsx`, and `tests/components/widgets/QuizWidget.assign.composition.test.ts` records why: a harness for its 10+ Firebase-backed hooks was judged disproportionate. `QuizManager` is well covered: seven suites in `tests/components/widgets/QuizManager.*.test.tsx` mount it with props, as do `components/dev/LibraryManagersDevHarness.tsx` and `PaperTestDevHarness.tsx`. There is no Quiz spec in `tests/e2e/`, and `scripts/smoke-test.mjs` only checks that the student `/quiz` route has content.
- **Churn.** On `dev-paul`, `Widget.tsx` took 97 commits in the 30 days to 2026-11-19 (38 in the last seven), `QuizManager.tsx` 43, `useQuizAssignments.ts` 51 and `useQuizSession.ts` 44. The widget grew about 240 lines on the day this plan was written.
- **Two-path regions.** Five preview flags with `afterLaunch: 'retire'` leave an old and a new path in these files: `assigned-tab`, `gradebook`, `modification-groups`, `quiz-import-versions-plain`, `reopen-selected-students`. `modification-groups` runs through assign, paper and monitor.

Non-goals:

- Any change to what a teacher or student sees, including wording, order, defaults, toasts and when a spinner shows.
- The stored data shape: `quiz_assignments`, `quiz_sessions`, status words, field names and every widget config key.
- Removing deprecated config keys or the legacy `editor` view value. Most are still read or written (`periodName` feeds the scoreboard name map; `plcMode`, `plcSheetUrl` and `teacherName` are still written), old boards may hold `view: 'editor'`, and removing keys regenerates the MCP widget schema in `functions/`. That needs its own small plan with a reader and writer table per key.
- `QuizResults.tsx`, `FreeResponseGrader.tsx`, `monitor/` and `results/`: the shared shells, with a wider blast radius.
- Moving data access inside `QuizManager`. Being prop-driven is what lets its seven suites and two dev harnesses mount it.
- The student app (`components/quiz/`), Firestore rules and Cloud Functions.

## 2. Decisions

| #   | Decision         | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Target shape     | A controller that stays mounted in `TeacherQuizWidget` and owns everything more than one view needs (loaded quiz, live session, the four view-independent effects, shared modal state, the loading gate, return order). Screens are render-only children of it. Not the Writing pattern: Writing has no cross-view session state                                                                                                                                                |
| D2  | Order            | Browser test first; then pure helpers out of the two large hooks; then inline handlers into hooks one at a time; then the controller; then screens. Lowest risk and best-tested work goes first                                                                                                                                                                                                                                                                                 |
| D3  | Behaviour        | Every PR is a move. A PR that changes a toast, default, confirm, order or effect timing is re-cut. Bugs found on the way are filed, with one exception: a security or data-loss bug is fixed first on `dev-paul` and the move rebased over it                                                                                                                                                                                                                                   |
| D4  | Feature flag     | None, as a no-visible-change refactor. Paul's OK on this is part of PT-271. The safety net is D5, D6 and D15 instead                                                                                                                                                                                                                                                                                                                                                            |
| D5  | Pins             | Two kinds. A Playwright spec of the real teacher flow, whose assertions survive file moves. And for each handler, a `renderHook` test at the Firestore boundary that mocks `firebase/firestore` and not the hook, in the style of `tests/hooks/useQuizAssignments.*.test.ts`. No full-widget mount with every hook mocked: it would only assert that mocks were called                                                                                                          |
| D6  | PR size          | One handler, one helper group or one screen per PR, capped at about 400 moved lines. No PR mixes a move with a cleanup. Test assertions stay unchanged across a move; mock wiring may change and is reviewed                                                                                                                                                                                                                                                                    |
| D7  | Actions          | Reuse first: per-class lifecycle stays in `useQuizClassActions`, Review launch in `useReviewLaunch`. New hooks cover only what is inline today (assign, whole-assignment end and reopen, delete, share and PLC, publish, reorder) and live in `hooks/`, where the Assignments hub and the PLC page can import them. Whether `usePlcQuizActions` folds into them is decided when the assign hook is cut, not assumed                                                             |
| D8  | Messages         | A handler's toast and confirm text moves with the handler, unchanged. No separate pass over all 145 call sites: many messages are built from errors at run time, and one PR touching every site would conflict with everything                                                                                                                                                                                                                                                  |
| D9  | Feature checks   | `useQuizCapabilities()` covers only the widget's top-level booleans. Checks AND-ed with a rollout switch, read through an imported constant, or evaluated inside a callback stay where they are                                                                                                                                                                                                                                                                                 |
| D10 | Lint overrides   | The eight `eslint-disable` lines move with their code, untouched. Replacing one with `useEffectEvent`, a `key` or the adjusting-state pattern changes effect timing, so each is its own later PR with its own test, outside this plan's "move only" rule                                                                                                                                                                                                                        |
| D11 | Review widget    | `ReviewWidget` keeps rendering `<TeacherQuizWidget variant="review">` and launching through `useReviewLaunch` and `StartReviewModal`. Every slice checks the Review variant and the shared-board view too                                                                                                                                                                                                                                                                       |
| D12 | Large hooks      | Pure helpers leave `useQuizSession.ts` and `useQuizAssignments.ts` for their own modules. The old paths stay as barrels that re-export everything, and no caller is repointed: 79 files import `useQuizSession` and 33 tests mock that path. The server mirrors of `gradeAnswer` and friends, and their parity tests, are not touched. Splitting the `useQuizAssignments` closure by job is a later step and is not a pure move, since the mutators share refs and one listener |
| D13 | Two-path regions | A slice does not move code inside a `retire` flag's two paths. It waits for the retire, or moves the surrounding code and leaves the gated block in place. Section 3 says which slice waits on which flag                                                                                                                                                                                                                                                                       |
| D14 | Churn            | A slice starts only when no open PR touches the lines it moves, is cut from a fresh `dev-paul`, and merges the same day. For controller and screen PRs Paul calls a Quiz freeze for that day. A move that hits a conflict inside a moved block is thrown away and redone from fresh, never resolved by hand                                                                                                                                                                     |
| D15 | Release          | At most one slice from S3 to S5 per `main` release. Each slice is one squash commit that reverts cleanly. The S1 spec runs against `spartboard-dev` after each deploy. The library screen, the riskiest move, keeps the old code path for one release behind an `admin_settings` switch that ships off                                                                                                                                                                          |
| D16 | Guard tests      | Tests and registrations that name these files are updated in the PR that moves the code they point at, as an allowed exception to D6 (list in section 4)                                                                                                                                                                                                                                                                                                                        |

Defaults I chose that were not asked; say if any is wrong:

- No feature flag (D4), with the one-release switch for the library screen as the only exception (D15).
- A Quiz freeze day for the larger moves (D14). The alternative is accepting hand-resolved conflicts in moved code.
- `QuizManager` stays prop-driven; its props get grouped, not removed.
- Dead-key removal, `QuizResults.tsx` and the grader are left for later plans.

## 3. Slices

Each slice is several PRs into `dev-paul`. A slice is done when the S1 spec passes, the section 4 checks pass, and the AB-311 **Next** line in `AGENT_BACKLOG.md` is updated.

| #   | Slice               | What happens                                                                                                                                                                                                                                                                                                                                                                         | PRs  | Waits on                                                                                                               |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| S1  | Browser pin         | A Playwright spec for the teacher flow against the emulator or `vite-verify`: create a quiz, assign to a class, assign with no class, pause and start, monitor, end, results, reopen, publish scores, delete; plus the Review variant's Start. Runs in CI for PRs touching these files. Extend the seven `QuizManager` suites where a prop the later slices regroup has no assertion | 2-3  | Nothing                                                                                                                |
| S2  | Pure helpers out    | D12. Helper groups leave the two hooks one group per PR, barrels kept. Existing hook and parity tests pass untouched                                                                                                                                                                                                                                                                 | 4-6  | AB-39 and AB-40 edits to `gradeAnswer` and `unlockStudentAttempt` landing first, or sequenced around them              |
| S3  | Handlers into hooks | D7 and D8. One inline handler per PR becomes a function in a hook, with its `renderHook` test written first against today's code. Order: reorder, delete, share and PLC, publish, whole-assignment end and reopen, assign last                                                                                                                                                       | 8-12 | Assign waits on the `modification-groups` retire; end and reopen wait on `assigned-tab` and `reopen-selected-students` |
| S4  | Controller          | D1. First a table, added to this plan, of every `useState`, ref and effect with the views that read it. Then `useQuizWidgetController()` takes the shared state, the four effects, the shared modals, the loading gate and the return order, a group per PR. `TeacherQuizWidget` still renders every view itself                                                                     | 4-6  | S3; a freeze day per PR                                                                                                |
| S5  | Screens             | One PR per view becomes a render-only child of the controller: import, preview, results, monitor, then the library last with its one-release switch (D15). No new `lazy()` boundaries. `QuizManagerProps` is regrouped into a few objects; nothing moves inside `QuizManager`                                                                                                        | 5-6  | S4; library waits on the `assigned-tab` retire; a freeze day per PR                                                    |
| S6  | Capabilities        | D9                                                                                                                                                                                                                                                                                                                                                                                   | 1    | Nothing after S1                                                                                                       |

S1 comes first. S2 and S6 need nothing else and can run while S3 waits on flags. S4 and S5 are the risky part and are where D14 and D15 bite.

Targets when done: no inline handler in JSX over about 20 lines; no component in the Quiz teacher path over about 1,000 lines outside the out-of-scope shells; `QuizManagerProps` grouped into fewer than ten objects. There is no line target for `Widget.tsx`: the gates and the controller wiring set its size.

## 4. Checks for every PR

- The S1 spec, and `pnpm exec vitest related --run <changed files>` with assertions unchanged.
- `pnpm run type-check` once per PR (these moves cross folders).
- `git diff --color-moved=zebra` reads as moved blocks. S4 and the D12 closure split are the exceptions and get a line-by-line review.
- On localhost against `spartboard-dev`, signed in: the S1 flow by hand, then the Review variant and a quiz opened from a shared board.
- For S4 and S5: a React Profiler capture of the library and the monitor before and after, since splitting changes memo boundaries, and a look at the build output for chunk changes.
- Guards that name these files, updated in the PR that moves what they point at (D16):

| Guard                                                           | What it keys on                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `tests/storageUploads.static.test.ts`                           | One allowlisted `uploadBytes` in `Widget.tsx`; a moved entry is named in the PR for Paul |
| `tests/publishDialogLoading.static.test.ts`                     | The literal `const publishScoresModal = publishingAssignment ? (` in `Widget.tsx`        |
| `components/dev/sessionViewsMocks.test.ts`                      | The import lines for `QuizLiveMonitor` and `QuizResults` in `Widget.tsx`                 |
| `config/tourSurfaces/quiz.ts`, `tests/tourAnchorRoutes.test.ts` | `QuizManager.tsx` by name for the `quiz.face` and reorder surfaces                       |
| `tests/copyGuard.test.ts`                                       | Strings under `components/`; check whether its baseline is keyed by file before S3       |

Rollback: revert the slice's squash commit. Nothing stored changes, so a revert needs no data step and an already-open tab is unaffected.

## 5. Risks

| Risk                                                       | Guard                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A moved handler closes over a different `config` snapshot  | Handlers that `await` then spread `config` are listed in the S4 table and tested across a config change |
| An effect stops running in a view it used to run in        | D1 keeps the four view-independent effects in the controller; S1 covers leaving the monitor mid-session |
| A screen split adds a Drive load or remounts `QuizManager` | D1 keeps `loadedQuizData` and the loading gate in the controller; S1 asserts no spinner between views   |
| A conflict is hand-resolved inside moved code              | D14: throw the move away and redo it                                                                    |
| A flag retire deletes code a slice just moved              | D13 and the "Waits on" column                                                                           |
| A Quiz regression reaches prod unseen                      | D15: one slice per release, the S1 spec on dev after deploy, the library switch                         |
| The plan stalls half done                                  | Every PR leaves the widget working. Stopping after S2 or S3 still leaves it better tested and smaller   |

## 6. What this plan does not fix

The 2026-11-19 parity audit of the assignment widgets found behaviour differences that touch Quiz: the assign stepper closes before the save finishes, delete can ask twice, and the reopen toast names a "Resume" button that does not exist. Those change what teachers see, so they ship behind a preview flag under their own plan. Row wording, tab names and reopen behaviour are settled by [ASSIGNED_TAB.md](ASSIGNED_TAB.md). This plan makes each of them a named function with a test to change.

## 7. What the review changed

An adversarial review on 2026-11-19 checked the first draft against the code. The draft's direction held; these did not:

- **Pinning by mounting the whole widget** was dropped for a browser spec plus per-handler boundary tests (D5). The repo had already judged the full mount impractical.
- **"Each screen takes its state with it"** was wrong: state, effects and modals are shared across views. The controller (D1, S4) is new.
- **"Keep each PR to a day"** was not enough against 38 commits a week; D14 and the per-PR line cap replace it. Waiting on `assigned-tab` alone became waiting on all five `retire` flags (D13).
- **"No test for `QuizManager`"** was false; seven suites mount it. Its props are now regrouped, not removed.
- **Dead-code removal** left the plan: most of the "dead" keys are live.
- **A standalone messages pass** and a full `useQuizCapabilities` were cut back (D8, D9); lint-override fixes moved out as behaviour changes (D10).
- **The hook splits moved from last to second**, as pure-helper extraction with barrels (D12), and the existing action hooks are reused (D7).
- **Guard tests that name these files**, a rollback line, a release cadence and a kill switch for the library screen were added (D15, D16, section 4).
- The "Widget.tsx under 200 lines" target was removed.
