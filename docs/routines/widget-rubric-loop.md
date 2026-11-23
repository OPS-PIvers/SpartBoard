# Widget rubric loop routine

A Claude Code routine that improves widgets, one widget and one dimension per fix, against the widget quality rubric (`docs/plans/WIDGET_RUBRIC.md`, `docs/widget-rubric/rubric.json`). Each week it tries up to 3 queue items on branches and opens no PRs. Paul gets one page with before/after screenshots and an Approve or Skip button per fix. Only approved fixes become PRs, and those merge as soon as CI passes. Paul's approval replaces his grading: there are no grading decks or spot checks in this routine.

A scheduled trigger runs this weekly (Sunday night, so the page is ready Monday morning); it can also be run by hand with "run the widget rubric loop".

## Each week

1. **Preflight.** Read the "Widget Fixes" page (Artifact `read`) and run `review.ts decisions` on it. If it has a `sentAt` whose approved fixes have no PR yet, do step 10 for them first. If it has no `sentAt` and still lists candidates, don't start a new week: send Paul the page link again and stop. Then run the queue, passing this week's candidates as `--open` pairs as they are made:

   ```
   node scripts/widget-grader/queue.ts --open clock:layout,poll:visual
   ```

   Exit code 3 means the loop must not run (calibration hasn't passed under this rubric's major version, R22, or 3 candidates already exist). Log the reason and stop. Never work around it.

2. **Re-grade first (R26).** If the queue lists widgets under "Re-grade first", run `/grade-widget` steps 1–3 for up to 3 of them (measure, judge, `cli record`) on `claude/widget-regrade-<date>`, push the branch, and add it to the page as one candidate with no screenshots ("Rescored, no code change"). It counts as one of the week's 3.

3. **Pick the item.** Take the next queue item:
   - `gate`: fix the failing gates on that widget. Read `docs/widget-rubric/gate-baseline.json` and the measurer output for the offending element.
   - `platform`: a window chrome fix (`DraggableWindow`, settings drawer shell). Skip the compare; the page carries the screenshots and Paul's approval is the grade.
   - `widget`: improve that dimension, starting with the named criterion (R8). Read every descriptor in the dimension in `rubric.json` and the calibration examples for it in `docs/widget-rubric/calibration/examples.jsonl`.
   - Skip an item Paul skipped in the last 4 weeks (`supervision.json` loops with outcome `rejected`) unless his note says what to change and this attempt does it.
   - The queue already skips paused criteria (`spot-checks.json`). Don't touch one even if the fix would lift it.

4. **Snapshot before.** Pick a run id `loop-<type>-<date>`. Copy `docs/widget-rubric/scorecards/<type>.json` to `scripts/widget-grader/out/<runId>/before.json`. Run `grader:measure --type <type>` on `origin/dev-paul` and copy its `measurements/<type>.json` to `scripts/widget-grader/out/<runId>/before-measure.json`; keep its screenshots for the page.

5. **Make the change.** Branch `claude/widget-loop-<type>-<dimension>-<date>` from `origin/dev-paul`.
   - Visual and scaling fixes ship unflagged; a change to what the widget does, or a new setting, ships behind the widget's flag (R21, CLAUDE.md flag-first rule).
   - Never add or remove a Nexus connection (R14); write proposals to `docs/widget-rubric/proposals.md`.
   - Never edit `rubric.json`, descriptors, thresholds, fixtures or measurer code in a loop fix. A loop that needs one of those stops and says so.
   - New on-screen wording needs Paul's OK, so a fix that adds or changes text says so in its page summary, quoting the new words.
   - A small-size fix may shrink, wrap or move a control, but never hide or remove one. Labels and decoration may hide; anything a teacher taps or types into stays (Time Tool +/- buttons, #4388, hotfixed in #4717).
   - Verify scoped, per CLAUDE.md: `pnpm exec vitest related --run <changed files>`.

6. **Grade after, blind (R31).** Run `/grade-widget` steps 1–3 for the widget only: `grader:measure`, `grader:static`, `cli judge-prompt`, then a fresh general-purpose Agent per the skill, given only the prompt path. Never tell that agent what changed, why, or the before scores. `cli judge-check`, then `cli record` writes the new scores. Commit the change and the scorecard on the branch.

7. **No-regression check (R20).** `--auto` compares script and judge levels (script first, as for the score), so an earlier grade from Paul doesn't hide a gain; a criterion Paul graded with no automatic level in `before.json` is left out of the compare:

   ```
   node scripts/widget-grader/loop.ts compare --auto --before scripts/widget-grader/out/<runId>/before.json --after docs/widget-rubric/scorecards/<type>.json --before-measure scripts/widget-grader/out/<runId>/before-measure.json --after-measure scripts/widget-grader/out/<afterRunId>/measurements/<type>.json
   ```

   Exit 1 means a criterion dropped, a score went missing, a gate fails, or a render lost fill (`fillDrops`). Try once more to fix it without losing the gain; if it still fails, drop the branch and note the attempt for the journal. A fix that raises nothing is dropped too.

   Also open the after screenshots at the envelope-min and smallest stress sizes and check that every button, field and toggle on the default view is still on the card. A missing control fails the check the same as exit 1.

8. **Add the candidate.** Run `pnpm exec prettier --write` on the changed scorecard and push the branch (no PR). Copy the before and after screenshots (envelope-min, typical and the smallest stress size) into `scripts/widget-grader/out/week-<date>/` and add an entry to its `candidates.json`:

   ```json
   { "weekId": "<date>", "candidates": [{ "id": "<type>-<dimension>", "widgetType": "<type>", "widgetName": "<admin settings name>", "dimension": "<dimension>", "branch": "<branch>", "summary": "<one plain sentence on what changed>", "gains": [{ "criterionId": "S1", "before": 1, "after": 3 }], "shots": [{ "caption": "Smallest size", "before": "clock-min-before.png", "after": "clock-min-after.png" }] }] }
   ```

   `gains` comes from the compare output. Use the widget's name from admin settings, including overrides. Go back to step 3 until the week has 3 candidates or the queue exits 3.

9. **Send the page.** If the week has no candidates, send nothing; record the week in the journal with the next PR. Otherwise:

   ```
   node scripts/widget-grader/grading/review.ts build --candidates scripts/widget-grader/out/week-<date>/candidates.json --out scripts/widget-grader/out/week-<date>/page
   ```

   Publish `page/index.html` to the "Widget Fixes" artifact with `capabilities: {artifact: {}}`, to the same URL every week (it is in the `widget-rubric-routines` memory; the first week creates it and saves the URL there). Send Paul one line in the routine's thread: "This week's widget fixes: <n> to approve or skip" with the link. Then end the run: the page republishes itself when Paul taps Send, which should wake the session. That wake can fail to arrive, so the next run's preflight also reads the page.

10. **Act on Paul's picks.** When the page republishes, read it (Artifact `read`), save it, and run:

    ```
    node scripts/widget-grader/grading/review.ts decisions --page <saved index.html>
    ```

    Stop if `sentAt` is null (a republish without Paul's picks). Otherwise:
    - **Approve:** open a PR from the candidate's branch into `dev-paul`, titled `Widget loop: <Widget name> <dimension> <before> → <after>`, with one sentence on what changed, one line confirming every control is still present at the smallest size, the before/after screenshots, the compare score table, and "Approved by Paul on the weekly page". Subscribe to it, mark it ready, and merge it as soon as CI is green, fixing CI failures as on any PR you own. While a release PR into `main` is open, wait until it merges before merging.
    - **Skip:** record it in `supervision.json` as `{ pr: "<branch>", widgetType, dimension, openedAt, outcome: "rejected", note }`, with his note when he left one. Add the branch as a file in `docs/branch-cleanup/` (AB-112) for deletion.
    - Each approved fix adds `{ pr, widgetType, dimension, openedAt, outcome: "accepted", changes }` to `supervision.json`. Put the supervision edits, the `docs/branch-cleanup/` files and the journal row in the first approved PR; when Paul skipped everything, open one small docs PR with them and merge it on green.

## Never

- Open a PR for a fix Paul hasn't approved on the page, or merge one before CI is green.
- Hide or remove a control to win a small-size score.
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
| 2026-10-27 | Countdown, Number Line | Layout | #4742, #4743 | Countdown S6 2 → 4, C (2.88 → 2.98); Number Line S8 judge 1 → 2, C (2.43 → 2.53) | Countdown's scrolling day grid keeps end padding (a fixed `pb-3` first cost S4, then `min(12px, 3cqmin)` fell under the 12px floor; `max(12px, 3cqmin)` passed). Number Line draws up to 1.7x on cards 500px+ tall; default renders unchanged; stress labels overlap more when maximized. First run under the never-remove-controls rule: both faces have no controls and their typical renders are unchanged at small sizes. Skipped: the same items as 10-24 (Paul-graded, need wording, or closed recently). No earlier loops to record. |
| 2026-10-30 | none | none | none | none | Queue had nothing new to try (10-28 and 10-29 the same): gate items are known false positives or Paul-accepted, Embed E2 needs the prod Help index, Clock, Randomizer and Time Tool S1 wait on Paul's re-grade. #4742 recorded as accepted in #4826; #4743 recorded as accepted. |
| 2026-11-03 | none | Layout | none | none | First run after Paul's 11-02 re-grade (Clock S1 3, Randomizer S1 2, Time Tool S1 2). Time Tool S1 closed without a PR: keeping the +/- buttons on narrow timers (the #4718 hotfix still drops them under 180px wide) fit all four controls at 150×100, and the judge gave S1 3, but Paul's 2 stands, so compare showed no gain; asked Paul whether to ship it anyway. Randomizer S1 closed: smaller header and shuffle controls gave the name a little more room, but the judge kept S1 at 2 and the shuffle button fell to about 22px. Clock S2 not tried: Paul's 1 dates from the 10-06 render and the current large render already fills the card; needs his re-grade. Skipped: the same gate, Nexus and Help-index items as 10-30. |
| 2026-11-04 | none | Layout | none | none | Specialist Schedule S1 closed without a PR: at 220px wide and under, hiding the header icon, date, row status circles and Now badge and putting floors on times and names lifted S1 1 → 2 with no fill drop, but two blind judges both dropped V6 3 → 2 (citing header text, the drawer title and emoji chips the change did not touch). Mini App S1 not tried: the fix needs the shared library toolbar, which Paul signs off on. Time Tool S1 waits on Paul's answer from 11-03. Skipped: the same gate, Nexus and Help-index items as 10-30. |
| 2026-11-06 | none | none | none | none | Queue had nothing new to try (11-05 the same): gate items are known false positives or Paul-accepted, Embed and Traffic Light E2 need the prod Help index, Clock S2 needs Paul's re-grade, the E1 items need Nexus, the C items need new wording, Randomizer, Specialist Schedule and Mini App S1 closed this week, and Paul chose to keep Time Tool's narrow timers as they are (11-04). |
| 2026-11-09 | none | none | none | none | Queue unchanged since 11-06 (11-07 and 11-08 the same), so nothing new to try. |
| 2026-11-15 | none | none | none | none | Paul found the nightly runs and weekly spot checks too much to keep up with. The loop now runs weekly with an approval page instead of grading decks, and the spot check is retired. |
| 2026-11-15 | Schedule | Config | #5914 | C3 1 → 2 (judge) | First approval-first week, run by hand at Paul's ask; Paul approved on the weekly page. Links C3 closed: two blind judges dropped I6 on unchanged tiles and C3 did not hold. The first Schedule judge dropped C1 on the unchanged drawer; a second blind judge kept it. |
| 2026-11-16 | Reveal | Config | #6513 | C5 1 → 3 (judge) | Paul approved on the weekly page (sent 11-20). Reveal C3 stays at 1: an empty state cannot lift it, and sample cards would need a flag. Poll C3 closed: two blind judges dropped S2 and S8 on large renders identical before and after, and its one-tap "Start yes or no" button wrote config. Stations C3 closed: E1 fell 3 → 2 across three judges, and starter stations sized by class would need a flag. Merged dev-paul in; #5962 had marked S1, S3, V1, V3 and V6 stale, so they stay stale. |
| 2026-11-23 | URL, Need/Do/Put/Then, Stations | Re-grade | this PR | URL S5 1 → 2, R1 2 → 3; Need/Do/Put/Then S1 0 → 2, S3, S8, C3 1 → 2, C1, V3 2 → 3, V6 3 → 2; Stations unchanged (judge) | Rescored, no code change; Paul approved on the weekly page (sent 11-23). Paul's grades stand. Specialist Schedule S1 passed compare (S1 1 → 2, S6 2 → 4, no drops) using size floors instead of hiding chips; Paul skipped it. Hotspot Image S1 closed again: pin and popover floors lifted S1 1 → 2, but two blind judges dropped C5, C2 and I6 on the unchanged empty state and drawer. |
