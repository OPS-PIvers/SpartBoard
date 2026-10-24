# Widget rubric loop routine

A Claude Code routine that improves widgets, one widget and one dimension per PR, against the widget quality rubric (`docs/plans/WIDGET_RUBRIC.md`, `docs/widget-rubric/rubric.json`). Each run works through up to 3 queue items and opens one PR into `dev-paul` per item, each with a before/after scorecard and screenshot grid (R20, R25).

A scheduled trigger runs this nightly; it can also be run by hand with "run the widget rubric loop".

## Each run

1. **Preflight.** List open PRs against `dev-paul` whose head matches `claude/widget-loop-*`; pass them to the queue as `<type>:<dimension>` pairs:

   ```
   node scripts/widget-grader/queue.ts --open clock:layout,poll:visual
   ```

   Exit code 3 means the loop must not run: calibration hasn't passed under this rubric's major version (R22), or 3 loop PRs are already open (R25). Log the reason in the journal and stop. Never work around it.

2. **Re-grade before improving (R26).** If the queue lists widgets under "Re-grade first", run `/grade-widget` steps 1–3 for up to 3 of them (measure, judge, `cli record`), commit the scorecards on `claude/widget-regrade-<date>` and open a PR. That is the run's whole output; stop. A major rubric version marks every scorecard stale, so calibration (norming steps 4–5) must pass again before any loop.

3. **Pick the item.** Take the first queue item:
   - `gate`: fix the failing gates on that widget. Read `docs/widget-rubric/gate-baseline.json` and the measurer output for the offending element.
   - `platform`: a window chrome fix (`DraggableWindow`, settings drawer shell). Platform criteria are graded by hand with Paul (`platform.json`), so open the PR with screenshots and ask Paul to grade it; skip the scorecard compare.
   - `widget`: improve that dimension, starting with the named criterion (R8). Read every descriptor in the dimension in `rubric.json` and the calibration examples for it in `docs/widget-rubric/calibration/examples.jsonl`.
   - The queue already skips criteria paused by a spot check (`spot-checks.json`). Don't touch a paused criterion even if the fix would lift it.

4. **Snapshot before.** Pick a run id `loop-<type>-<date>`. Copy `docs/widget-rubric/scorecards/<type>.json` to `scripts/widget-grader/out/<runId>/before.json`. Run `grader:measure --type <type>` on `origin/dev-paul` and copy its `measurements/<type>.json` to `scripts/widget-grader/out/<runId>/before-measure.json`; keep its screenshots for the grid.

5. **Make the change.** Branch `claude/widget-loop-<type>-<dimension>-<date>` from `origin/dev-paul`.
   - Visual and scaling fixes ship unflagged; a change to what the widget does, or a new setting, ships behind the widget's flag (R21, CLAUDE.md flag-first rule).
   - Never add or remove a Nexus connection (R14); write proposals to `docs/widget-rubric/proposals.md`.
   - Never edit `rubric.json`, descriptors, thresholds, fixtures or measurer code in a loop PR. A loop that needs one of those stops and says so.
   - Verify scoped, per CLAUDE.md: `pnpm exec vitest related --run <changed files>`.

6. **Grade after, blind (R31).** Run `/grade-widget` steps 1–3 for the widget only: `grader:measure`, `grader:static`, `cli judge-prompt`, then a fresh general-purpose Agent per the skill, given only the prompt path. Never tell that agent what changed, why, or the before scores. `cli judge-check`, then `cli record` writes the new scores.

7. **No-regression check (R20).**

   ```
   node scripts/widget-grader/loop.ts compare --before scripts/widget-grader/out/<runId>/before.json --after docs/widget-rubric/scorecards/<type>.json --before-measure scripts/widget-grader/out/<runId>/before-measure.json --after-measure scripts/widget-grader/out/<afterRunId>/measurements/<type>.json
   ```

   Exit 1 means a criterion dropped, a score went missing, a gate fails, or a render lost fill (`fillDrops`: content covers clearly less of the card than before, which is wasted space even when no score moved). Try once more to fix it without losing the gain; if it still fails, close the branch without a PR and record the attempt in the journal. A run that raises nothing also opens no PR.

8. **Open the PR** into `dev-paul`. Title: `Widget loop: <Widget name> <dimension> <before> → <after>`. The body has:
   - one sentence on what changed, in plain words;
   - the before/after screenshot grid (same sizes and fixtures, side by side) as CI artifacts or images uploaded to the PR;
   - the score table from the compare output (criteria gained, dimension and overall before → after, letter);
   - the review mode from `node scripts/widget-grader/loop.ts supervision`: in `full` mode, ask Paul to grade the after-state in disagreements-only mode before merging (`/grade-widget --disagreements <type>`, norming step 6).

   Add the loop to `docs/widget-rubric/supervision.json` in the same PR: `{ pr, widgetType, dimension, openedAt, outcome: "open", changes }`, where `changes` lists each criterion the compare reported as gained with its `before` and `after` levels.

9. **Record outcomes of earlier loops.** For each loop in `supervision.json` still `open` whose PR has closed: `accepted` (merged with no commits from anyone but the loop), `changed` (merged after Paul or a review asked for changes), or `rejected` (closed unmerged). Commit those edits with this run's PR, or in their own small PR when this run opens none.

10. **Journal.** Append one row below in the same PR.

11. **Next item.** Go back to step 1 for the next item, counting this run's PRs as open loops, until this run has opened 3 PRs or the queue exits 3. Each item gets its own branch from `origin/dev-paul` and its own PR; record step 9 outcomes in the first PR only.

## Never

- Merge a loop PR. Paul merges them (R32).
- Create, edit or turn on the scheduled trigger.
- Read production data. The queue weights by prod usage only when `docs/widget-rubric/usage.json` exists (boards per widget type, counts only, added by Paul); without it the queue orders by gap only.

## Journal

| Date | Widget | Dimension | PR | Before → after | Notes |
| ---- | ------ | --------- | -- | -------------- | ----- |
| 2026-10-06 | Clock | Layout | #3874 | G2 fail → pass; D → C (2.76) | Lunch Count skipped: its G4 failure is the known "Absent" false positive, which a loop can't fix. |
| 2026-10-14 | Weather | Layout | #4216 | G2 fail → pass; D → C (2.58) | Lunch Count skipped again for the same G4 false positive. Clock #3874 recorded as accepted. |
| 2026-10-15 | Randomizer | Layout | #4295 | G1, G2 fail → pass; D → C (2.42) | Lunch Count skipped again for the same G4 false positive. Weather skipped: #4216 already fixed its G2. Weather #4216 recorded as changed (a review asked for a test). |
| 2026-10-16 | Checklist | Layout | #4325 | G1, G2 fail → pass; D → C (2.33) | Lunch Count skipped for the same G4 false positive; Weather and Randomizer skipped as already fixed (#4216, #4295). Randomizer #4295 recorded as changed. |
| 2026-10-17 | Quiz | Layout | #4349 | G1 fail → pass; D → C (2.44) | The fix is in the shared library shell, so the other library widgets were re-measured too: no new gate failures, and Flashcards G1 and G2 now pass. Lunch Count skipped for the same G4 false positive; Weather, Randomizer and Checklist skipped as already fixed (#4216, #4295, #4325). Checklist #4325 recorded as accepted. |
| 2026-10-18 | Links | Layout | #4360 | G2 fail → pass; ungraded → C (2.24) | First scorecard for Links, so every criterion is new. Lunch Count skipped for the same G4 false positive; Weather, Randomizer, Checklist and Quiz skipped as already fixed (#4216, #4295, #4325, #4349). Quiz #4349 recorded as accepted. |
| 2026-10-18 | 19 widgets | Layout | #4366–#4384 | gate failures fixed | One-off sweep outside the nightly run, merged by Paul; not counted in supervision. No PR for Projects, Flashcards or Classes: their failures are grader false positives. Math Tool keeps one baseline size (turned-ruler measurement). Links #4360 recorded as accepted. From here each run takes up to 3 items. |
| 2026-10-18 | Lunch Count, Time Tool | Layout | #4387, #4388 | Lunch Count G1, G2 fail → pass, D (2.02 → 2.03); Time Tool S1 judge 2 → 3, C (2.72) | Manual run Paul asked for, the first with up to 3 items. Need/Do/Put/Then skipped: its G4 is the shipped starter lists counting as fixture words, a grader false positive. Embed I1 closed without a PR: the grab border cost 18% fill. Seating Chart G2 closed without a PR: compare dropped V2 and C2. Lunch Count G3 is harness-only (Firestore offline) and stays in the baseline. |
| 2026-10-20 | Embed | Interaction | #4425 | I1 script 1 → 2 (Paul's 1 stands); C (2.40) | Grab frame is `min(14px, 4cqmin)`, so every size stays inside the fill limit that closed the 20px attempt. Compare reports no gains until Paul re-grades I1. |
| 2026-10-20 | Links | Layout | #4432 | S3 2 → 3, S6 n/a → 4; layout 2.00 → 2.38, C (2.24 → 2.42) | Tiles fit the card shape and become a list when too small. Paul graded the after-state (S1 1, V1 2, C3 1, C5 2, I6 3), undoing four judge gains: the empty state is still unreadable at 80×80 and white on light gray. |
| 2026-10-21 | Checklist, Specialist Schedule, Schedule | Layout | none | Checklist S1 judge 0 → 2, Schedule S3 judge 1 → 3 (Paul's grades stand); Specialist Schedule S1 judge 1 → 2 but fill dropped | No PRs. Checklist and Schedule fixes worked but compare reports no gains until Paul re-grades S1 and S3 (draft #4468 opened by mistake and closed). Specialist Schedule closed twice on a fill drop at the smallest stress size (0.89 → 0.63). Skipped: Lunch Count G3, Need/Do/Put/Then G4, Review G4, Concept Web G1, Math Tool G2 (known false positives or Paul-accepted), Seating Chart G2 (failed 10-18), Embed E2 (needs the prod Help index), Clock and Randomizer S1 (need Paul's re-grade), Time Tool S1 (needs Paul's re-grade after #4388), Weather E1 (Nexus). #4387, #4388, #4432 recorded as accepted, #4425 as changed. |
| 2026-10-22 | Countdown | Layout | #4533 | S3 1 → 2, C1 2 → 3; C (2.78 → 2.82) | Wide cards put the number beside its label, tall cards spread the three lines down the card. Paul graded the after-state: S3 2 and C1 3 confirmed, V3 3 → 4, R1 3 → 2 (no designed state for a past event); he notes even a square card has a lot of empty padding. Mini App S1 closed without a PR twice: compare dropped S6 4 → n/a and I2 2 → 1. Custom Widget S1 judge 1 → 3 but closed: showing only the primary block at the smallest size dropped fill 0.79 → 0.13. Skipped: Lunch Count G3, Need/Do/Put/Then G4, Review G4, Concept Web G1, Math Tool G2 (known false positives or Paul-accepted), Seating Chart G2 (failed 10-18), Embed E2 (needs the prod Help index), Clock, Randomizer and Time Tool S1 (need Paul's re-grade), Weather, Checklist, Quiz and Expectations E1 (Nexus), Specialist Schedule S1 (fill drop 10-21), URL C3 and Traffic Light E2 (Paul-graded or need the Help index). #4501 recorded as changed, #4502 as accepted. |
| 2026-10-23 | Countdown | Layout | #4594 | S1 2 → 3; C (2.82 → 2.88) | Small cards hide "days until" and grow the number and event name; grid cells get minimum sizes and scroll. Paul graded the after-state: S1 3 confirmed, V6 3 → 4. First attempt (label only) gained nothing; the retry added the grid minimums. Soundboard S1 closed twice: icon-only tiles under 28px lifted S1, but the judge dropped V1 (and V3, then V6) on the unchanged default view. Syntax Framer S1 closed: run 1 lifted S1 1 → 2 but dropped E3; after adding face tests, run 2 put S1 back at 1 and dropped V4 and C5. Skipped: the same items as 10-22, plus Mini App and Custom Widget S1 (closed 10-22), Schedule R2 (Paul-graded 0), Poll and Stations C3, Catalyst Visual C1 and Reveal Grid C3 (need new wording or default content, which Paul approves). #4533 recorded as accepted. |
| 2026-10-24 | Graphic Organizer | Layout | #4628 | S1 1 → 2; C (2.43 → 2.55) | Cards under 220×200 hide the Frayer quadrant labels, the topic bubble and the KWL label words; body text floors at 9px. Loop judge claimed S1 3 and gains on S3, S7, I2 and C2; Paul graded S1 2, S3 2, S7 3, I2 3, C2 2 (a second blind judge also gave S1 2 and C2 2). Number Line S3 closed twice: a vertical line on tall cards lifted S3 1 → 3 both runs, but the judge dropped C1, then C2, on the unchanged default view. Hotspot Image S1 closed: pin and popover size floors lifted S1 1 → 2; run 1 dropped V4 and C5 (a local empty state replaced ScaledEmptyState), and after restoring it run 2 dropped I6 and C5 on the unchanged default view. Skipped: the same items as 10-23, plus Soundboard and Syntax Framer S1 (closed 10-23). #4594 recorded as accepted. |
