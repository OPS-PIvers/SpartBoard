# Widget grader measurer

Walks each widget with fixtures through the harness (`/widget-grader-dev`) at the six plan sizes × three fixtures and writes `Measurement[]` JSON for gates G1–G4 and criteria S1, S2, S3, S5, S6, S8, I1, I2 and I7 (`docs/plans/WIDGET_RUBRIC.md`).

```
pnpm run grader:measure                       # every widget with fixtures
pnpm run grader:measure --type clock,poll     # some widgets
pnpm run grader:measure --fixtures typical --run-id try1 --workers 2
```

Output goes to `scripts/widget-grader/out/<runId>/` (gitignored): `measurements/<type>.json`, `screenshots/<type>/<size>__<fixture>[__variant].png` and `summary.md` (gate pass/fail and script-implied levels per widget; "judge" means the script leaves the level to the judge).

- `GRADER_BUILD=1` serves a production build instead of the dev server. Use it when running several workers; the dev server's unbundled modules exhaust the browser. CI always builds.
- `GRADER_CHROMIUM=/path/to/chrome` overrides the browser when the pinned Playwright build isn't installed.
- `pnpm exec playwright test -c playwright.grader.config.ts detectors.pw.ts` runs the gate detectors on synthetic DOM and the planted G1 failure.

## Files

- `collect.ts` runs in the page and returns raw geometry (`snapshotTypes.ts`).
- `analyze.ts` turns one snapshot into gate checks and render metrics; `levels.ts` rolls a widget's renders into measurements and implied levels. Both are pure and unit-tested in `tests/widgetGrader/`.
- `measureWidget.ts` drives the harness: base renders, toolbar renders (`selected=1`), the settings render, a lifecycle per fixture (resize, settings, maximize, minimize, reload) for G3, and the reload and second-instance checks for G4.

Network load failures (`Failed to load resource`) are recorded on G3 as `networkFailures` but don't fail it; they come from the environment, not the widget.
