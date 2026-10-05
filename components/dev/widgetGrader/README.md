# Widget grader harness

`/widget-grader-dev` mounts one widget in the real `DraggableWindow` (through `WidgetRenderer`) on a 1920×1080 board, on fixture data, for the widget grader (`docs/plans/WIDGET_RUBRIC.md`, R17 and R18). It loads only when `VITE_AUTH_BYPASS=true` on localhost, so it runs in `pnpm dev` with the bypass and in CI's E2E preview build, never on a deployed site.

## URL

```
/widget-grader-dev?type=<widgetType>&w=<px>&h=<px>&fixture=empty|typical|stress
  [&maximized=1] [&count=2] [&state=loading|error|offline|noRoster] [&selected=1] [&settings=open]
```

- `w`/`h` default to the widget's size in `config/widgetDefaults.ts`; `fixture` defaults to `typical`.
- `count=2` adds a second instance on default config, so R5 can check it doesn't inherit the first one's content.
- `state`: `noRoster` and `loading` give the widget no rosters (`loading` also sets the dashboard's `loading`), `error` keeps the rosters but empties them with a `loadError`, `offline` makes `navigator.onLine` false.
- `selected=1` selects the first widget (toolbar showing); `settings=open` flips it to the settings panel.

The board runs as a teacher with no permission docs saved (`missingDocPublic` features on, admin previews off). `authBypassFeatureOverrides` in localStorage still overrides a feature. Firestore's network is disabled, so a listener a widget opens reads the empty local cache instead of erroring.

## For Playwright

Wait for `[data-grader-ready="true"]` or `window.__widgetGrader.ready`. `window.__widgetGrader.errors` collects `console.error`, uncaught errors and unhandled rejections from page load on. Ready means the window is mounted, no lazy chunk is still loading, fonts are loaded and the DOM has been quiet for 250 ms (or 4 s passed, which also records an error).

## Adding a widget's fixtures

1. Add `fixtures/<widgetType>.ts` exporting `defineFixtures<'<widgetType>'>({ empty, typical, stress })`. Each fixture's `config` is merged over the widget's `WIDGET_DEFAULTS` config; `customTitle` and `rosters` are optional. See `fixtures/checklist.ts` and `fixtures/random.ts`.
   - `empty`: what a teacher sees right after adding the widget.
   - `typical`: a realistic classroom setup.
   - `stress`: long titles (`STRESS.title`), long unbroken words (`STRESS.word`), a 35-student roster (`STRESS_ROSTER`), 20+ items (`STRESS.itemCount`) and maximum-length settings values. Use the shared `STRESS` helpers from `fixtures/stress.ts`.
2. Register it in `fixtures/index.ts` in your slice's own alphabetized block.
3. Remove the type from `PENDING_FIXTURES` in `tests/widgetGraderFixtures.test.ts`.
4. Add the type to `tests/e2e/widget-grader-harness.spec.ts` and check all three fixtures render with no errors at default size and at `w=1400&h=900`.

Stubs a widget needs go in `stubs/<widgetType>.ts`, never in the widget. If a widget can't mount without real Firestore data, add it to `UNSUPPORTED_FIXTURES` with a one-line reason instead.
