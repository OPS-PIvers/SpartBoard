# Widget rubric loop routine

A Claude Code routine that improves one widget, one dimension at a time, against the widget quality rubric (`docs/plans/WIDGET_RUBRIC.md`, `docs/widget-rubric/rubric.json`). Each run opens at most one PR into `dev-paul` with a before/after scorecard and screenshot grid (R20, R25).

The scheduled trigger is not set up yet. Paul turns it on after the norming runbook passes; until then this doc is run by hand with "run the widget rubric loop".

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

4. **Snapshot before.** Pick a run id `loop-<type>-<date>`. Copy `docs/widget-rubric/scorecards/<type>.json` to `scripts/widget-grader/out/<runId>/before.json`, and keep the latest measure run's screenshots for the grid.

5. **Make the change.** Branch `claude/widget-loop-<type>-<dimension>-<date>` from `origin/dev-paul`.
   - Visual and scaling fixes ship unflagged; a change to what the widget does, or a new setting, ships behind the widget's flag (R21, CLAUDE.md flag-first rule).
   - Never add or remove a Nexus connection (R14); write proposals to `docs/widget-rubric/proposals.md`.
   - Never edit `rubric.json`, descriptors, thresholds, fixtures or measurer code in a loop PR. A loop that needs one of those stops and says so.
   - Verify scoped, per CLAUDE.md: `pnpm exec vitest related --run <changed files>`.

6. **Grade after, blind (R31).** Run `/grade-widget` steps 1–3 for the widget only: `grader:measure`, `grader:static`, `cli judge-prompt`, then a fresh general-purpose Agent per the skill, given only the prompt path. Never tell that agent what changed, why, or the before scores. `cli judge-check`, then `cli record` writes the new scores.

7. **No-regression check (R20).**

   ```
   node scripts/widget-grader/loop.ts compare --before scripts/widget-grader/out/<runId>/before.json --after docs/widget-rubric/scorecards/<type>.json
   ```

   Exit 1 means a criterion dropped, a score went missing, or a gate fails. Try once more to fix it without losing the gain; if it still fails, close the branch without a PR and record the attempt in the journal. A run that raises nothing also opens no PR.

8. **Open the PR** into `dev-paul`. Title: `Widget loop: <Widget name> <dimension> <before> → <after>`. The body has:
   - one sentence on what changed, in plain words;
   - the before/after screenshot grid (same sizes and fixtures, side by side) as CI artifacts or images uploaded to the PR;
   - the score table from the compare output (criteria gained, dimension and overall before → after, letter);
   - the review mode from `node scripts/widget-grader/loop.ts supervision`: in `full` mode, ask Paul to grade the after-state in disagreements-only mode before merging (`/grade-widget --disagreements <type>`, norming step 6).

   Add the loop to `docs/widget-rubric/supervision.json` in the same PR: `{ pr, widgetType, dimension, openedAt, outcome: "open", changes }`, where `changes` lists each criterion the compare reported as gained with its `before` and `after` levels.

9. **Record outcomes of earlier loops.** For each loop in `supervision.json` still `open` whose PR has closed: `accepted` (merged with no commits from anyone but the loop), `changed` (merged after Paul or a review asked for changes), or `rejected` (closed unmerged). Commit those edits with this run's PR, or in their own small PR when this run opens none.

10. **Journal.** Append one row below in the same PR.

## Never

- Merge a loop PR. Paul merges them (R32).
- Create, edit or turn on the scheduled trigger.
- Read production data. The queue weights by prod usage only when `docs/widget-rubric/usage.json` exists (boards per widget type, counts only, added by Paul); without it the queue orders by gap only.

## Journal

| Date | Widget | Dimension | PR | Before → after | Notes |
| ---- | ------ | --------- | -- | -------------- | ----- |
| 2026-10-06 | Clock | Layout | #3874 | G2 fail → pass; D → C (2.76) | Lunch Count skipped: its G4 failure is the known "Absent" false positive, which a loop can't fix. |
