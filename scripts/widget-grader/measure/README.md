# Widget grader measurer

Walks each widget with fixtures through the harness (`/widget-grader-dev`) at the six plan sizes × three fixtures and writes `Measurement[]` JSON for gates G1–G4 and criteria S1, S2, S3, S5, S6, S8, I1, I2, I3, I4, I5, I7, V2, V5, C4, C6, R1, R2, R3 and R5 (`docs/plans/WIDGET_RUBRIC.md`).

```
pnpm run grader:measure                       # every widget with fixtures
pnpm run grader:measure --type clock,poll     # some widgets
pnpm run grader:measure --fixtures typical --run-id try1 --workers 2
pnpm run grader:gates --type clock            # gates only, fails on failures missing from the baseline
pnpm run grader:measure --write-baseline      # record today's gate failures in docs/widget-rubric/gate-baseline.json
pnpm run grader:affected --base origin/dev-paul
```

Output goes to `scripts/widget-grader/out/<runId>/` (gitignored): `measurements/<type>.json`, `screenshots/<type>/<size>__<fixture>[__variant].png` and `summary.md` (gate pass/fail and script-implied levels per widget; "judge" means the script leaves the level to the judge).

- `GRADER_BUILD=1` serves a production build instead of the dev server. Use it when running several workers; the dev server's unbundled modules exhaust the browser. CI always builds.
- `GRADER_CHROMIUM=/path/to/chrome` overrides the browser when the pinned Playwright build isn't installed.
- `pnpm exec playwright test -c playwright.grader.config.ts detectors.pw.ts` runs the gate detectors on synthetic DOM and the planted G1 failure.

## Files

- `collect.ts` runs in the page and returns raw geometry (`snapshotTypes.ts`).
- `analyze.ts` turns one snapshot into gate checks and render metrics; `levels.ts` rolls a widget's renders into measurements and implied levels. Both are pure and unit-tested in `tests/widgetGrader/`.
- `extras.ts` drives the S7 criteria (`extrasCollect.ts` in the page, `extrasLevels.ts` pure and unit-tested): hover-only controls and double-click handlers (I3), axe-core from jest-axe plus a Tab walk (I4), reduced-motion emulation (I5), clutter counts (V2, no level until the first sweep sets thresholds), the `style=alt` global style (V5), settings panel changes against the face (C4, C6), `state=` renders (R1), destructive face controls (R2), React Profiler commits, fast intervals and the build manifest's chunk size (R3), and `count=2` (R5).
- `baseline.ts` compares gate failures with `docs/widget-rubric/gate-baseline.json`; `../affected.ts` picks the widgets a PR touches.
- `measureWidget.ts` drives the harness: base renders, toolbar renders (`selected=1`), the settings render, a lifecycle per fixture (resize, settings, maximize, minimize, reload) for G3, and the reload and second-instance checks for G4.

Network load failures (`Failed to load resource`) are recorded on G3 as `networkFailures` but don't fail it; they come from the environment, not the widget.

## CI

- `Widget Grader Gates` in `pr-validation.yml` runs gates only on the widgets a PR touches (folder, registry entry, fixture or stub). Shared code (`DraggableWindow`, `ScaledEmptyState`, `WidgetRenderer`, `config/widget*.ts`, `config/tools.ts`, the harness, this folder, `rubric.json`) runs every widget. Every-widget runs split across 4 runners with Playwright `--shard`. It fails only on a gate failure the baseline doesn't list.
- `widget-grader-nightly.yml` sweeps everything on `dev-paul` and opens or comments on the "Widget grader: new gate failures" issue. The judge never runs in CI.
- When a fix makes a baselined gate pass, the report says so; regenerate the baseline with `--write-baseline` in that PR.
