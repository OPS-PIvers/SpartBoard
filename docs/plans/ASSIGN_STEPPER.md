# Assign as an accordion stepper

Settled 2026-10-08 against `dev-paul` at `8264ed5ba`, after two rounds of prototypes built from the repo's tokens. Four structures were tried first (stepped, class grid, purpose-first, one page), then three stepper variants (small steps, questions, accordion). Paul picked the accordion. Clickable mockup: [assign-stepper-mockup.html](mockups/assign-stepper-mockup.html) (opens on variant C; the toolbar switches activity and the Guided Learning admin setting). Five PRs to `dev-paul`.

## Goal

Assigning anything takes a few short, ordered decisions in one narrow dialog instead of one long scroll of equally weighted settings. A teacher who is happy with last time's settings picks classes and dates and presses Assign. Settings that can't apply to this activity or this kind of assignment never appear.

## Current-state facts that drove the decisions

- **Shell.** `components/common/library/AssignModal.tsx` (`AssignModalProps` in `library/types.ts`) is a `max-w-lg` single column over `common/Modal.tsx`. Callers inject everything through `extraSlot` and `plcSlot`, so each activity stacks its own sections. Callers:
  - Quiz: `QuizManager.tsx` ~L2449 and the in-progress edit dialog `QuizAssignmentSettingsModal.tsx`.
  - Video Activity: `VideoActivityManager.tsx` ~L1555.
  - Guided Learning: `GuidedLearning/Widget.tsx` ~L1701.
  - Flashcards: `Flashcards/FlashcardAssignModal.tsx`.
  - Review: `StartReviewModal.tsx`.
  - PLC video: `PlcNewVideoActivityAssignmentModal.tsx`.
  - Mini App (`MiniAppAssignModal`) and PLC quiz (`PlcNewQuizAssignmentModal.tsx`) are separate dialogs.
- **Shared sections.** The assign dialogs share these pieces:
  - `AssignClassPicker` is a bordered checklist, with `collapsible` and `singleSelect` options.
  - `AssignTargetingSection` holds availability (or the legacy schedule), per-period access, and per-student modifications.
  - `AssignAvailabilitySection` holds Opens/Closes per class or for all classes, bell times, "Allow submissions after close", and the Submissions Enabled / Study Resource choice.
  - `QuizBehaviorSettingsPanel` and `AssignmentSettingsToggleGroup` hold the quiz rules.
- **Manual start already exists.** Per-period access "In-class assessment" (`AssignPeriodAccessSection.tsx`, `AccessMode = 'assessment' | 'assignment'`) writes every period `state: 'closed'` with no window (`utils/periodPlan.ts`). The teacher starts and pauses each period from the monitor (`usePeriodAccess.ts` `start`/`pause`, `PeriodAccessControls.tsx`, `PeriodAccessStrip.tsx`). It needs bell periods (`per-period-access`) and only builds a gate for **two or more** classes (`buildPeriodGate`).
- **Availability** is UI state (`AssignAvailability` in `utils/assignAvailability.ts`). `applyAvailability` resolves it to `openAt`/`closeAt`/`dueAt`/`dueAtByRosterId`/`periodPlan`, written on `users/{uid}/quiz_assignments/{id}` and mirrored on the session.
- **Study resource** is `workKind` on the **session** (`SessionWorkKindFields`), behind `study-resources`. Each surface passes a `WorkKindSetting` (`assignAvailability.ts`):
  - Quiz: default work.
  - Video Activity: default work.
  - Guided Learning: default resource.
  - Mini App: default resource.
  - Flashcards: work when "Collect a submission" is on; otherwise resource, locked.
- **Guided Learning submissions** are the `assignment-modes` global permission config (`AssignmentModesConfig`), read with `getAssignmentMode('guidedLearning')` (`AuthContext.tsx`). The value is `'submissions'` or `'view-only'` and is frozen onto each assignment. It is view-only in prod today.
- **Last-used settings already exist for Quiz.** `hooks/useLastQuizAssignSettings.ts` stores `lastQuizAssignSettings` (a `QuizBehaviorSettings`) on `users/{uid}/userProfile/profile` and prefills via `getQuizAssignPrefill`, only when `quiz-review-split` is on (`QuizManager.tsx` ~L721). It covers rules only. Nothing equivalent exists for other activities or for targeting.
- **Video Activity live.** Gated by `video-activity-live`, a Pacing control (Self-paced / Teacher-paced (live)):
  - Trims the picked classes to one and passes `singleSelect` to the picker.
  - Relabels the confirm button "Start live".
  - Disables availability, due date and work kind, sending `dueAt: null`.
  - Its `assignmentName` input defaults to the title and is **never passed to `onAssign`**.
- **Flashcards check settings** (`FlashcardAssignModal.tsx`):
  - Mode: Flashcards / Write / Test.
  - Show first: Term / Definition.
  - Strict mode: Write and Test only.
  - Question types and number of questions: Test only.
  - Mastery threshold 2/3/4: Flashcards mode only.
  - Score visibility: Hide until I publish / Score only / Score and correct answers.
- **Quiz has no name field**; only Video Activity and Mini App do.
- **Flags.** `assign-availability`, `study-resources`, `per-period-access`, `quiz-per-class-due-dates`, `video-activity-live`, `quiz-review-split`. There are no assign-modal tour anchors (`config/tourAnchors.ts`); Review's mode cards carry `review-start.mode-*`.
- **Tokens.** Lexend; brand blue `#2d3f89`, dark `#1d2a5d`, lighter `#eaecf5`; slate surfaces. Modal chrome is `bg-white rounded-2xl shadow-2xl`. The `Toggle` is `size="sm"`. `SegmentedControl` is `inline-flex p-1 bg-slate-100 rounded-lg`. Labels are `text-sm font-bold text-brand-blue-dark`.

## Decisions

### Structure

- **D1.** Assigning is one accordion stepper in a `max-w-xl` dialog.
  - Steps stack vertically. One step is open at a time and ends in a **Continue** button.
  - Finished and unopened steps show a one-line value on the right; clicking any header opens it.
  - **Assign** sits in the footer and is always enabled, so a teacher can assign from any step.
  - The steps a teacher has not opened keep their prefilled values.
- **D2.** A **top switch** sits above the steps when the activity has a defining choice. It decides which steps exist. Per activity:

  | Activity        | Top switch                                                                                                                                                 |
  | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Quiz            | none                                                                                                                                                       |
  | Video Activity  | Self-paced / Teacher-paced (live), when `video-activity-live` is on                                                                                        |
  | Guided Learning | Students submit work / Study resource, only when `getAssignmentMode('guidedLearning') === 'submissions'`; otherwise none and it is always a study resource |
  | Flashcards      | Students submit work / Study resource                                                                                                                      |
  | Mini App (PR 5) | Students submit work / Study resource                                                                                                                      |

- **D3.** **Quiz and Video Activity are never study resources.** Drop their `WorkKindSetting` (always `work`). Steps that cannot apply are **removed**, not greyed out, because the top switch has already explained why.

### Steps

- **D4.** Step order and contents:

  | Step                     | Quiz        | Video (self) | Video (live)            | GL                               | Flashcards                       |
  | ------------------------ | ----------- | ------------ | ----------------------- | -------------------------------- | -------------------------------- |
  | Classes                  | ✓           | ✓            | **Class** (single pick) | ✓                                | ✓                                |
  | When / Available         | When        | When         | When (manual only)      | Available if resource, else When | Available if resource, else When |
  | Attempts and order       | ✓           |              |                         |                                  |                                  |
  | Quiz integrity           | ✓           |              |                         |                                  |                                  |
  | What students see        | ✓           |              |                         |                                  |                                  |
  | How students are checked |             |              |                         |                                  | submit only                      |
  | Sharing                  | if in a PLC | if in a PLC  | if in a PLC             |                                  |                                  |

  Study resource removes every step after When.

- **D5.** **Classes** is a compact select-style button ("All 3 classes" / class names) that opens a checklist menu with Select all and Clear, following `components/CLAUDE.md` "Picking from a list". It replaces the bordered `AssignClassPicker` box here. Below it, a **Modifications** link ("Modifications: 1 modified") opens the per-student modifications as their own view inside the dialog (back arrow, Done). That view holds the translation banner and Generate, standing modifications, skip student, read aloud and language.
- **D6.** **When** is Scheduled / Manual. Study resource lives in the top switch, never here.
  - **Scheduled:** Opens and Closes with bell or set time (today's `PointField`), "Different time for each class" as a link that expands per-class rows, and "Allow submissions after close".
  - **Manual:** "Starts paused. You start and pause each class." plus an optional Due date. It writes per-period access in `'assessment'` mode.
  - **Video live:** When shows only "Starts paused. You start it from the board." with no dates, as today.
- **D7.** **Available** (study resource) is Opens and Available until with the same per-class link, and no late-work toggle.
- **D8.** The quiz rules split into three steps:
  - **Attempts and order:** attempts, time limit, shuffle questions, shuffle answer options.
  - **Quiz integrity:** focus mode with its sub-settings, block copy and paste.
  - **What students see:** score on submit, right and wrong, correct answer, group by learning target, raise a hand.

  Flag-gated rows (time limit, tab-away timer, score on submit, read aloud) stay gated as today.

- **D9.** **How students are checked** (Flashcards) holds the real settings above. Mastery threshold is a number input, min 2, max 4. Rows get even `space-y-3` spacing. "Collect a submission" goes away: the top switch replaces it (`collectSubmission = kind === 'work'`).
- **D10.** **Sharing** is the PLC toggle and PLC picker, only when the teacher is in a PLC and the assignment collects work.
- **D11.** **No assignment name field.** Quiz never had one. Video Activity's is unused and is removed. Mini App's name is required today and stays on its own (PR 5).

### Defaults

- **D12.** Every assign opens prefilled with this teacher's **last-used rules for that activity**. Rules means the step contents for attempts, integrity, feedback, flashcards check and Video pacing. Classes, dates and modifications are never remembered.
  - Quiz reuses `lastQuizAssignSettings` (D11 of `QUIZ_REVIEW_SPLIT.md`), now regardless of `quiz-review-split`.
  - Flashcards and Video Activity get the same per-user profile field pattern: `lastFlashcardAssignSettings` and `lastVideoAssignPacing`.
  - The values are saved on a successful assign. First use falls back to today's defaults.
- **D13.** Each collapsed step's value is plain text built from the settings, with no "changed from default" markers. Named presets are out of scope.

### Visual and copy

- **D14.** Built from existing primitives: `Toggle`, `SegmentedControl`, `PointField`, `Modal`. The step header is a numbered circle and a `text-sm font-bold` title; the open step's border is `border-brand-blue-primary/40`. No helper sentences beyond the three state lines above. All strings pass `deslop --writing` and `tests/copyGuard.test.ts`.
- **D15.** Opening a step scrolls it into view. The dialog scrolls only when an open step is taller than the space left; at 1366×768 the Quiz flow fits apart from a long Scheduled-per-class step.

### Rollout

- **D16.** One preview flag, `assign-stepper` (`GlobalFeature`, `FEATURE_DEFAULTS` with `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`, `stage: 'preview'`, `afterLaunch: 'retire'`, group `'assigning'`, and an entry in `functions/src/featureMissingDoc.ts`). With it off, today's `AssignModal` renders unchanged.
  - Admin path: Admin Settings > Access > Previews > Assign stepper > Public.
  - Admins always pass, so "on for Paul" means Paul and the other admins.
- **D17.** With `assign-stepper` on, the stepper uses the availability, period-access and work-kind building blocks whether or not `assign-availability` and `study-resources` are on for that user. The stepper flag is the single switch for the new flow.
- **D18.** Removing Study resource from Quiz and Video Activity (D3) and dropping the unused Video name input (D11) ship first with no flag. Both are behind `study-resources` or unused today, so this restores intended behaviour.

## PRs

1. **Quiz/Video never study resources; drop unused Video name (D3, D11, D18).**
   - Remove Quiz's and Video Activity's `WorkKindSetting`.
   - Remove the `assignmentName` props from `VideoActivityManager`'s `AssignModal`.
   - Update `QuizManager.assign` and `VideoActivityManager.assign` tests. No flag.
2. **Stepper shell, flag, Guided Learning (D1, D2, D5–D7, D14–D17).**
   - Register `assign-stepper`.
   - New `components/common/library/assignStepper/` with:
     - `AssignStepper`: dialog, steps, footer Assign, scroll-into-view.
     - `AssignStep`: header, value, body, Continue.
     - `AssignTopSwitch`.
     - `ClassPickerMenu`: select-style checklist with a `singleSelect` mode.
     - `AssignWhenStep`: Scheduled / Manual / Available, reusing `PointField` and `applyAvailability`.
     - `ModificationsView`: the existing modifications code moved into its own view.
   - Wire Guided Learning first, behind the flag, including the `assignment-modes` rule (D2).
   - Tests for the step list per activity and kind, and for the class picker menu.
3. **Quiz (D4, D8, D10, D12, D13).**
   - Split `QuizBehaviorSettingsPanel` / `AssignmentSettingsToggleGroup` into the three step bodies plus value formatters, without changing behaviour.
   - Sharing step.
   - Read and save `lastQuizAssignSettings` without the `quiz-review-split` gate.
   - Manual writes `'assessment'` per-period access.
   - Wire `QuizManager`; `QuizAssignmentSettingsModal` (in-progress edit) uses the same steps with a **Save** footer and no Classes step.
   - Update `QuizManager.assign`, `QuizAssignmentSettingsModal` and `useLastQuizAssignSettings` tests.
4. **Video Activity and Flashcards (D2, D4, D6, D9, D12).**
   - Video: pacing top switch; live gives a single Class pick, manual-only When and "Start live".
   - Flashcards: top switch replaces "Collect a submission"; How students are checked step; last-used fields for both.
   - `PlcNewVideoActivityAssignmentModal` follows Video.
5. **Mini App, PLC quiz, Review (open, see below).** Bring the remaining dialogs onto the stepper or record why they stay. Retire `AssignModal` once every caller has moved and the flag is retired.

## Open questions

- **Manual with one class.** `buildPeriodGate` only builds per-period access for two or more classes. Should Manual extend to a single class (one period), or should Manual be hidden when one class is picked?
- **Manual without bell periods.** If `per-period-access` or the teacher's bell schedule is missing, should Manual still show (closed until started, with no auto-close at the bell) or be hidden?
- **Review (`StartReviewModal`)** is a live start, not an assignment (Teacher-paced / Self-paced game, game length, leaderboard). Should it move to the stepper or keep its own short dialog?
- **Mini App and PLC quiz** use their own dialogs today. Are they in scope for PR 5, or a later plan?
- **LTI, Classroom add-on and Google Classroom destination** (`LtiDeepLinkPicker`, `TeacherDiscoveryRoute`, "Continue to Google Classroom") embed quiz settings inline. Should they reuse the step bodies only?
