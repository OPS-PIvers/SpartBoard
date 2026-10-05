# Widget rubric weekly spot check

A weekly check that the loop's automatic scores still match Paul (R33, R34). Eight recent script or judge scores come back to Paul blind on the grading page (about 10 minutes). Drift or gaming on a criterion pauses loops on it until it is re-normed.

The scheduled trigger is not set up yet; Paul turns it on with the loop routine (`docs/routines/widget-rubric-loop.md`). Until then, run it by hand with "run the widget rubric spot check".

## Each run

1. **Sample.** `node scripts/widget-grader/loop.ts spot-sample --n 8 --days 14` prints 8 widget/criterion pairs from automatic scores graded in the last 14 days, never ones Paul already scored. An empty list means no loop has run; stop.

2. **Measure.** Run `/grade-widget` step 1 for the sampled widgets with run id `spot-<YYYY-MM-DD>`. Use the judge results already in the scorecards; don't re-run the judge, since the check is whether the scores the loop relied on hold up.

3. **Build the deck** with only the sampled cards:

   ```
   node scripts/widget-grader/grading/cli.ts deck --run spot-<date> --mode widget --type <types> --cards clock:S1,poll:V2,…
   ```

4. **Publish and ask Paul.** Publish the deck to the "Widget Grading" artifact per `/grade-widget` step 4 and send Paul one line: "Weekly spot check: 8 cards, about 10 minutes" with the link. Grading is blind: the automatic level appears only after his pick (R29).

5. **Write back.** When the deck is done, run `/grade-widget` step 6 (`cli apply`), then:

   ```
   node scripts/widget-grader/loop.ts spot-record --deck <deckId>
   ```

   It appends the check to `docs/widget-rubric/spot-checks.json` and exits 1 when it paused anything:
   - **Drift (R33):** a card 2+ levels from Paul, or a criterion whose mean gap is over 1. The criterion is paused; the loop queue skips it.
   - **Gaming (R34):** across all spot checks, a criterion whose automatic score rose after a loop on most cards where Paul's score didn't. The criterion is paused and its descriptor or measurement needs rewriting.
   - Either one resets supervised start in `supervision.json` (R32): the next 10 loop PRs get full review again.

6. **Tell Paul** in one short list which criteria were paused and why, or that the check passed. A paused criterion is re-normed with Paul: rewrite the descriptor or measurement with him, bump the rubric version (R26), then remove it from `paused` in the same PR. Never unpause one on your own.

7. **Commit** the scorecards, `calibration/` files, `spot-checks.json` and `supervision.json` on `claude/widget-spot-check-<date>` and open a PR into `dev-paul`.
