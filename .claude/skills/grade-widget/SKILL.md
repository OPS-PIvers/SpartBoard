---
name: grade-widget
description: Grade SpartBoard widgets against the widget quality rubric (docs/plans/WIDGET_RUBRIC.md). Runs the harness and measurer, runs the AI judge, publishes the grading page for Paul, and writes his scores into docs/widget-rubric/scorecards. Use for "/grade-widget", "grade the clock widget", "norming session", "grade V2 across widgets", "grade the disagreements", or the calibration judge test.
---

# /grade-widget

```
/grade-widget <types…>                      one widget through every criterion
/grade-widget --criterion V2 <types…>       one criterion across many widgets
/grade-widget --disagreements [<types…>]    script vs judge, or where Paul and the judge disagreed before
```

The repo JSON under `docs/widget-rubric/` is the official record (R19). The grading page is only where Paul clicks; nothing reads it except step 6 below.

All commands run from the repo root. `<runId>` is a short name you pick, e.g. `grade-2026-10-06`. `cli` below means `node scripts/widget-grader/grading/cli.ts`.

## 1. Measure

```
GRADER_BUILD=1 pnpm run grader:measure --type clock,poll --run-id <runId>
pnpm run grader:static
```

- Cloud sessions: add `GRADER_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` when the pinned Playwright browser isn't installed.
- E2 needs a Help index. On a machine with prod credentials (Paul's computer) run `node scripts/widget-grader/helpIndex.ts --project prod`, which reads `help_resources` and `building_guided_learning` read-only and writes `scripts/widget-grader/out/help-index.json`; then `pnpm run grader:static --help-index scripts/widget-grader/out/help-index.json`. Cloud sessions have no prod credentials, so there E2 shows "unknown" and the judge and Paul decide.
- Disagreements mode with no types uses every widget in the run.

## 2. Judge (blind, separate from the maker)

```
cli judge-prompt --run <runId> --type clock,poll
```

This writes `scripts/widget-grader/out/<runId>/judge/<type>.prompt.md` per widget. For each one, start a fresh Agent (general-purpose) whose whole prompt is: "Read <prompt path> and follow it. Reply with the JSON block only." Never give the judge a diff, a loop's intent or Paul's score for that widget (R29, R31); the prompt already leaves the widget's own Paul scores out. Save the agent's reply to `out/<runId>/judge/<type>.answer.md`, then:

```
cli judge-check --run <runId> --type clock --answer scripts/widget-grader/out/<runId>/judge/clock.answer.md
```

It fails on a missing criterion, a level the criterion doesn't define, or an N/A (R15). Re-run that judge with the errors appended when it fails. On success it writes `judge/<type>.json`, which the deck reads.

## 3. Build the deck

```
cli deck --run <runId> --mode widget --type clock,poll
cli deck --run <runId> --mode criterion --criterion V2 --type clock,poll,timer
cli deck --run <runId> --mode disagreements
```

It writes `out/<runId>/publish/<deckId>/` with `index.html` (this skill's `page/index.html`), `deck.json`, the screenshots each card needs under `shots/`, and `files.json` listing them. N/A cards come from the applicability rules only.

Then record the script and judge scores so scorecards are current before Paul grades:

```
cli record --run <runId> --deck <deckId>
```

## 4. Publish the grading page

Load the `artifact-capabilities` skill, then publish with the Artifact tool:

- `file_path`: `out/<runId>/publish/<deckId>/index.html`
- `root`: that folder; `files`: the keys of `files.json`, each mapped to itself
- `capabilities`: `{ "db": {} }`
- First time: `icon: "checklist"`. After that, update the same artifact: find "Widget Grading" with `action: "list"`, read it, and publish to its `url`. Grades are keyed by deck id, so old decks never mix with new ones.

After publishing, do one `ArtifactData` `list` of `decks/<deckId>/grades` (empty is expected) and send Paul the link. He scores each card by click or keys 0–4, the judge's level appears after his pick, and a gap of 2+ asks what the descriptor missed. "Done" sets `decks/<deckId>` to `{ done: true }`.

## 5. Harness links

I1, I3 and C6 cards link to the live harness on `http://localhost:3000`. They work only while Paul runs `pnpm run dev` with `VITE_AUTH_BYPASS=true` on his machine.

## 6. Write Paul's scores back

When Paul says he's done (or `decks/<deckId>` has `done: true`):

1. `ArtifactData` `list` on collection `decks/<deckId>/grades` with `query.limit` 1000 and `out_dir` set to `scripts/widget-grader/out/<runId>/publish/<deckId>/rows`.
2. `cli apply --run <runId> --deck <deckId> --rows scripts/widget-grader/out/<runId>/publish/<deckId>/rows`
   - writes `source: "paul"` scores and notes into each scorecard (Paul's score wins, R2),
   - appends one line per grade to `docs/widget-rubric/calibration/examples.jsonl`,
   - appends 2+ gaps to `calibration/rewrites.jsonl` and prints them as descriptor-rewrite candidates,
   - saves V1/V2/V3 exemplar picks to `calibration/exemplars.json`.
3. Tell Paul the rewrite candidates in one short list. Descriptor rewrites change `rubric.json` and the plan doc, and bump the rubric version (R26); never make one without his word.
4. Commit the scorecards and calibration files on a branch and open a PR into `dev-paul`.

## Calibration judge test (norming step 5, R22)

Paul names 5 held-out widgets (`h1,…,h5`) after grading all 10 seed widgets.

1. `cli judge-prompt --run <runId> --type h1,…,h5 --exclude h1,…,h5` so the judge sees Paul's scores on the other 5 seed widgets only.
2. Run the judge three times per widget, each in a fresh Agent, and check each answer with `judge-check … --out scripts/widget-grader/out/<runId>/judge/<type>.run<N>.json`.
3. `node scripts/widget-grader/calibration/check.ts --held-out h1,…,h5 --runs <all 15 run files, comma-separated>`

It appends the result to `docs/widget-rubric/calibration/agreement.json` (`latest.pass` is what the loop routine checks) and exits 1 on a miss: under 60% exact, under 95% within one level, a 3-run spread over 1, or any Paul 0 the judge didn't score 0 on every run. On a miss, show Paul the per-criterion numbers and rewrite the failing descriptors with him before repeating.

## Platform scorecard

`docs/widget-rubric/platform.json` grades the window chrome once (R10). Grade it by hand with Paul when a Platform fix lands; its scores go in its `scores` object with the same fields as a scorecard criterion.
