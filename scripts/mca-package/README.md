# MCA package script

Admin-run tool that reads the Minnesota Department of Education's public Minnesota Questions Tool and writes a **package file** for the District library (`docs/plans/QUIZ_MCA_PRACTICE.md` M31-M33). It needs no credentials, calls no AI and touches no Firebase project. It is not a Platform reader and nothing teachers run (ADR 0001 is untouched). Rerun it when MDE releases items.

## Running it

Node 24 and `pnpm run install:all` once. The picture step drives **Microsoft Edge**, so Edge must be installed on the machine.

```bash
node scripts/mca-package/run.mjs all --grade 8
```

| Option      | Meaning                                                           |
| ----------- | ----------------------------------------------------------------- |
| `--test`    | MDE test type id. Default 5 (MCA IV).                             |
| `--subject` | MDE subject id. Default 30 (Science). Math is 10 and reading 20.  |
| `--grade`   | Science offers 5, 8 and 9 (9 is high school).                     |
| `--data`    | Cache folder, outside git. Default `~/spartboard-mca-data/<ids>`. |
| `--out`     | Output folder. Default `<data>/out`.                              |
| `--refresh` | Fetch again even where a file is cached.                          |
| `--delay`   | Milliseconds between MDE requests. Default 350.                   |

First package: run `all` for `--grade 5`, `--grade 8` and `--grade 9`, then check each report against MDE's site (item count, every key, every figure) before uploading.

## Stages

Run one at a time with `fetch`, `convert`, `render` or `package`; `all` runs them in order.

1. **fetch** lists the items for the grade, then fetches each item's question, scoring guide, stimulus tabs, statewide-results chart and pictures, one request at a time with a pause. Each item is its own file, so a stopped run resumes where it left off. The grade, subject and test ids are checked against MDE's own filter lists.
2. **convert** turns the cache into question banks (one per stimulus set) and writes `report.md`. No browser, no network. Rerun it as often as you like.
3. **render** draws every stimulus tab (its reading and figures together) as a picture in Edge, converts vector figures to PNG and copies the statewide chart. This is the step that needs Edge.
4. **package** writes `<collection>.package.zip`. It refuses to run while `report.md` lists problems.

## What it produces

`<out>/<collection>.package.zip` holds `package.json` (a manifest), `banks/*.bank.json` (native question banks) and `pictures/*`. Ids are derived from the MDE item id, so a newer package updates the same questions.

Each question carries its stimulus tabs (named "Tab A" and so on, with the tab's words as read-aloud text), MDE's rationale as the explanation (and per option for multiple choice), the DOK level, the benchmark and the science practice as tags, and an attribution line in the manifest. The statewide results picture is listed in the manifest against the question.

## How MDE types map

| MDE type   | Becomes                     | Notes                                                                                 |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------- |
| MC         | Multiple choice             | Rationale per option becomes option explanations.                                     |
| MR         | Multiple answer             |                                                                                       |
| IC         | Fill in the blank, dropdown | Choices from the `<select>` lists, key from the rubric sentence.                      |
| GM         | Fill in the blank, drag     | Sentence and key from the rubric, words from picture text. Always listed for a check. |
| GGM, MATCH | Matching                    | Pairs from the rubric text. Always listed for a check.                                |
| PG         | Written Part A + MC Part B  | Needs an override (plan M3).                                                          |
| CR         | Free response               | The holistic rubric becomes a rubric with levels; sample responses are teacher-only.  |

Anything the reader cannot represent is listed in `report.md` with its item id, MDE type and the reason. Nothing is dropped or changed silently: items that were converted but should be compared with MDE are listed too.

## Overrides

`overrides/<subject>-grade-<n>.json` holds hand conversions keyed by MDE `itemTableId`, loaded automatically (or pass `--overrides`). An entry either replaces the questions the parser reads (`questions`, same shape the parser produces) or keeps chosen pictures (`keepImages`, indexes into the item's own pictures). Each carries a `why`. Grade 8 science has entries for the two point-graph items, two gap-match items the parser cannot key, and the pictures to keep on the drag items.

## Tests

`scripts/mca-package/mcaPackage.test.ts` runs the parsers, the type mapping, the package writer and the request client against small items cut from a real fetch (`fixtures/`).
