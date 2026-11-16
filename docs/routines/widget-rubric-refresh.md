# Widget rubric refresh routine

A weekly Claude Code routine that keeps the widget quality rubric (`docs/plans/WIDGET_RUBRIC.md`, `docs/widget-rubric/rubric.json`) in step with how Paul actually judges UI. Paul no longer grades or spot-checks, so his corrections in threads, memory and the weekly Widget Fixes page are the only signal. This routine turns them into rule changes (R35).

It runs Sunday at about 9:30 PM Central, before the widget rubric loop (10:58 PM), so the loop works from the latest rules. It can also be run by hand with "run the rubric refresh".

## Each week

1. **Window.** If a refresh PR from an earlier week is still open, work on its branch: start the window at that branch's last log row and add this week's changes to the same PR and card, never a second PR. Otherwise work on the latest `origin/dev-paul`. The window starts at the date of the last row of `docs/widget-rubric/refresh-log.md`.
2. **Gather evidence** from the window only:
   - Project memory: `feedback` files modified in the window, and the "How Paul wants work done" section of the index (UI, wording and style rules).
   - The Widget Fixes page (URL in the `widget-rubric-routines` memory): Artifact `read`, then `node scripts/widget-grader/grading/review.ts decisions --page <saved file>`. Every Skip and its note is evidence. So are `supervision.json` loops with outcome `rejected` or `changed`.
   - New rows in `docs/widget-rubric/calibration/rewrites.jsonl` and `examples.jsonl` that carry Paul's notes.
   - Paul's own words in project threads and PRs merged into `dev-paul` in the window whose titles say they restyle or relayout a widget (for example "drop the side color bar"). PR comments posted under Paul's login that end with the Claude Code footer are not his words.
   - `docs/widget-rubric/proposals.md` and `spot-checks.json` paused criteria.
3. **Compare** each piece of evidence with the criteria, descriptors, ban list and method notes in `rubric.json`. Keep only changes that would make the judge or a loop act differently on a real widget. Drop anything the rubric already says, anything about one feature only, and anything outside the board face, drawer and toolbar (R13).
4. **If nothing survives,** add a log row ("no change") in the next rubric PR or loop PR and stop. Send no message, and keep the thread status reading as done.
5. **Edit, versioned (R26).** Change `rubric.json` and the human copy in `WIDGET_RUBRIC.md` together, word for word. Bump the minor version for descriptor, ban-list or note changes; a new criterion, a removed criterion or a weight change is a major version and needs Paul's decision first (ask, don't edit). Update the version and ban-list length in `tests/widgetRubric.test.ts`. Then mark the changed criteria for re-grading:

   ```
   node scripts/widget-grader/markStale.ts --criteria S1,V3
   ```

   It stales graded script and judge scores only; Paul's grades and N/A entries stay, and it refuses unknown ids. The loop re-grades stale cards up to 3 a week; those cards stay in the fix queue meanwhile.

6. **Log.** Add one row to `docs/widget-rubric/refresh-log.md`: date, rubric version, and one line per change with its evidence.
7. **Verify and PR.** Run `pnpm exec prettier --write` on every changed file and `pnpm exec vitest related --run tests/widgetRubric.test.ts tests/widgetGrader/markStale.test.ts`. Open one draft PR into `dev-paul` titled `Widget rubric refresh <date>: <n> rule changes` with a table of each change (criterion, before, after, evidence) and subscribe to it.
8. **Ask Paul once** with a decision card: "Merge this week's rubric changes?" (Merge all / Change some). The card names each change in a few plain words. Merge on his OK once CI is green; if he says to drop or change one, do that, then merge. Rubric wording is standards, so never merge without his OK.

## Never

- Change gates, thresholds, weights, fixtures or measurer code. Those go to Paul as a question.
- Turn a one-off reaction into a rule unless Paul said it as a rule or said it twice.
- Unpause a paused criterion. Pauses lift only through re-norming.
- Read production data.
