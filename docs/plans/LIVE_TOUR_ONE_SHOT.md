# Live tours that Claude can one-shot

Goal: an admin asks Claude (claude.ai or Claude Code, through the SpartBoard connector) for a live tour of any workflow, and the draft it saves needs no editing. It plays end to end, takes the real path, reads in the Help Center voice, and is fully staged (widgets, narration, pictures, Autopilot default, Help Center filing).

Scope was settled in a design interview with Paul on 2026-10-13. This document is the contract. Each PR is self-contained: an implementer should be able to build it from the PR text plus the code, without the interview.

**Code references** were taken at `dev-paul` commit `6024c5337`. Symbol names are authoritative and line numbers are hints; if a line number is off, grep for the symbol.

**Release:** one new preview flag, `live-tour-self-heal`, gates the two changes that alter how existing tours play for teachers (D4 self-heal, D10 auto-stage). Everything else is a playback bug fix or admin-only tooling and ships unflagged (CLAUDE.md "Exempt"). No `public/changelog.json` entry until the flag opens.

Out of scope: migrating the six existing tours (the benchmark covers their topics fresh), live tours in student apps, drag-gesture Autopilot, a second connector for non-admins.

## Why

Findings from tracing the connector and the runner at `ab54785f2`:

- **The connector checks almost nothing.** `mergeSteps` (`functions/src/mcp/glTools.ts`) validates only the anchor id before `:`/`#`. A bare per-type ref (`dock.item`), a wrong widget type, a made-up field key, a `slot` with no layout, or a `type` step with no value all save and fail only at playback. The in-app `anchorProblem` (`components/tours/tourHealth.ts`) and the gl-author validator already catch most of these; the connector calls neither.
- **Nothing tells a model how to reach a control.** There are 3,069 anchors in `config/tourAnchors.ts`; 2,261 are `panel: true` and only 38 have `requires`. No anchor says which surface it lives on or which click reveals it, so Claude guesses the path. This is the root of both "wrong workflow" and most "couldn't find this on your screen" misses.
- **About 790 per-field anchors are unknowable.** Field refs like `assign-when.mode-option:assign#manual` use made-up types and keys; `list_tour_anchors` returns only the label.
- **The connector can't stage a tour.** It cannot set `tourSetup.layouts`, `materials` or `useTeacherBoard`, and `update_live_tour` cannot change `tour_widgets`, `autopilot` or Help Center placement. `persists` (536 anchors) is dropped from the anchor list, so Claude can't predict which steps Autopilot hands back.
- **The schema invites mistakes.** `interactionType` is required but ignored by the runner; `question`, audio, video, overlay and tooltip fields are accepted; `spawns`, `layoutKeyframes` and `teacherMustClick` have no description.
- **Instructions are split three ways and disagree.** The server instructions (`functions/src/mcp/tools.ts`) say nothing about tours. `.claude/skills/gl-author/references/live-tour.md` and the pauls-skills `spartboard/references/live-tours.md` contradict the server and each other (anchor count, Autopilot values, `slot: 0` advice the validator rejects).
- **Playback bugs bite blind-authored tours hardest.**
  - The drawer-closing trap: a tour-opened settings drawer closes as soon as a step's anchor is not a `settings-open` anchor, so `settings.field…` followed by `widget-settings.*` in the same drawer can never resolve (`LiveTourRunner.tsx`, the prerequisite effect's drawer-close branch).
  - A missing anchor replaces the step's text with the generic "Couldn't find this on your screen" (`locales/en.json`), and blind steps have no picture to fall back on.
  - Autopilot gives up after a fixed `ANCHOR_SEARCH_MS` (3 s) when the next anchor is slow (Firestore, lazy modals).
  - `type` steps advance only on `change`, which fires on blur.

Paul's latest connector tour ("Create a Spartboard Quiz", `424ab204…`) shows the result: typing steps as `observe` so Autopilot can't fill them, recorded tail steps with no text and positional `row-1` refs, and anchorless fallbacks.

## Product decisions (settled — do not re-litigate)

| #   | Decision                  | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Done bar                  | A one-shot tour runs end to end, takes the real shortest path, needs no rewording, and is fully staged: widgets, narration, step pictures, Autopilot default, Help Center filing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D2  | One shared brain          | Authoring knowledge lives in one repo doc, `docs/live-tours/AUTHORING.md`, served by a new connector tool `get_live_tour_guide` and summarized in the server instructions. Both claude.ai and Claude Code get the same quality. The gl-author live-tour reference and the pauls-skills spartboard live-tours reference shrink to pointers; a test fails if the served guide and the repo file differ.                                                                                                                                                                                                                                                                                        |
| D3  | Navigation graph          | Every anchor gets a `surface` (where it lives: board, dock, sidebar, settings drawer of a widget, admin tab, library, assign dialog, editor of a kind…) and, for panel anchors, `opensWith` (the anchor whose click reveals it, plus any data precondition). A Playwright crawler on the harness generates `config/tourAnchorRoutes.generated.json`; `config/tourAnchorRoutes.overrides.ts` hand-covers cases that need data (an open library item, a selected class). A test fails on a `panel` anchor with no route. `persists` is exposed through the connector.                                                                                                                          |
| D4  | Graph at playback         | Tours still spell out every opening click as its own step, so teachers learn the path. At runtime, when a step's anchor is missing because its panel closed (the teacher wandered off, pressed Escape), the runner walks `opensWith` back to a visible anchor and replays the clicks to reopen it, the way `settings-open` already does. Behind `live-tour-self-heal`.                                                                                                                                                                                                                                                                                                                       |
| D5  | Connector v2 schema       | A tour-only step schema: drop `interactionType`, `question`, `audioUrl`, `videoUrl`, `showOverlay`, `bannerTone`, `tooltip*`, `panZoomScale`, `spotlightRadius`, `hotspotAlwaysHidden`. Every remaining field gets a `.describe()`. Create and update can set `tour_widgets`, `layouts`, `materials`, `use_teacher_board`, `autopilot` and `help_center`.                                                                                                                                                                                                                                                                                                                                    |
| D6  | Validation and dry run    | The server runs Tour-Health parity checks plus a graph simulation of the step order. **Hard errors refuse the save:** unknown anchor id, widget type or field key; a bare per-type/per-field ref; an anchor unreachable from the previous step's state; action/value mismatch (incl. `type`/`select` with no value); a per-widget step whose widget is not on stage; a `slot` with nothing binding it. **Soft problems save with warnings:** fallback (`anchor: ""`) steps, `persists` anchors outside the tour sandbox, positional list refs outside a tour-scoped material, fewer than 3 or more than 15 steps, missing step text. `dry_run: true` returns the same report without saving. |
| D7  | Browser run (Claude Code) | A script fetches the tour JSON through the connector (prod or dev) and injects it into `/live-tour-run-dev` on `vite-verify` (auth bypass, dummy Firebase, so nothing touches a real account). It plays with Autopilot under a `test` policy that performs every step, and writes a per-step pass/fail JSON plus a spotlight screenshot per step.                                                                                                                                                                                                                                                                                                                                            |
| D8  | Tours that build things   | Tours that create or edit library items work on tour-scoped materials (`tourSetup.materials`, the existing sandbox in `utils/tourSandbox.ts`). Keep/Remove at teardown decides what stays. Under the default `tour-safe` policy, Autopilot treats a `persists` anchor as safe when its effect lands in the sandbox, so a quiz-from-scratch tour can fully autopilot.                                                                                                                                                                                                                                                                                                                         |
| D9  | Anchor gaps               | Sweep the teacher surfaces with no anchors (TextWidget `FormattingToolbar`, `GroupRemindersPanel`, `ImportWizard`, Instructional Routines `LibraryManager`, `RosterEditor`, `QuizAssignmentSettingsModal`, `SharePlcResultsModal`, `AssignmentDetailPane`, `SubLaunchPanel`, RoutineGuide and Expectations widgets). Add a lint rule that fails on a new interactive control in a teacher surface without `tourAttr`. Connector steps with `anchor: ""` save only as a flagged draft, and the hand-back names the queued anchors.                                                                                                                                                            |
| D10 | Auto-stage                | When a tour gives no layout, the runner arranges its widgets: the current step's focus widget large and centred, the rest tiled, clear of the dock, the top bar and the tip. Claude names only the widgets and (optionally) each step's `slot`. Explicit layouts still win. Behind `live-tour-self-heal`.                                                                                                                                                                                                                                                                                                                                                                                    |
| D11 | Narration                 | The server generates narration (`functions/src/guidedLearningNarration.ts`) for every step with text when a connector tour is saved, and again for steps whose text changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D12 | Step pictures             | The D7 browser run uploads each step's screenshot as its `tour.thumbnail`, so missing steps have a preview and `get_live_tour_step_picture` lets Claude check its own work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D13 | Playback fixes            | (a) Drawer-closing trap: keep a tour-opened drawer open while the next step's anchor is anywhere inside that widget's drawer (`settings.root`), not only `settings-open` anchors. (b) A missing step keeps its own text and adds "Can't find it" with Retry/Skip, instead of replacing the text. (c) Autopilot waits for the next anchor until network and animations settle, up to about 10 s, before handing back. (d) A `type` step advances once the field value matches `value` (debounced), not on blur. Unflagged bug fixes.                                                                                                                                                          |
| D14 | Autopilot default         | Claude decides per tour, by a rule in the guide: off for "how do I…" workflows the teacher will repeat, on for "what's here" overview tours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D15 | No outline first          | For live tours Claude does not agree a plan first. It builds the draft, dry-runs it (plus the browser run in Claude Code), and hands back a one-line summary with any warnings. Drafts never reach teachers. The guide overrides the connector's general "agree a short plan" rule for tours only.                                                                                                                                                                                                                                                                                                                                                                                           |
| D16 | Voice                     | Written rules in the guide plus gold-example tours. Paul's edits to the benchmark tours become the gold set, and the before/after diffs feed the rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D17 | Benchmark                 | 12 workflows (below). Claude authors each fresh from a one-sentence request. A tour passes when the browser run is green and Paul makes no edits. Rerun after any major change to the connector, guide or runner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D18 | Flag                      | `live-tour-self-heal` (`GlobalFeature`, `FEATURE_DEFAULTS` with `defaultAccessLevel: 'admin'`, `stage: 'preview'`, `afterLaunch: 'retire'`, added to `functions/src/featureMissingDoc.ts`) gates D4 and D10. Admins pass admin gates, so "on for Paul" means Paul plus `/admins`.                                                                                                                                                                                                                                                                                                                                                                                                            |

Small consequences, not separate decisions:

- Positional list refs (`#row-1`, `#a`) are fine inside a tour-scoped material, because the tour controls what is in it.
- The browser run reads from either connector but plays only on the dummy-backend page.
- `list_tour_anchors` gains `surface`, `scope`, `widget_type`/`field_key` filters and paging; with no filter it returns a namespace summary, not 3,000 rows.

Amendment, 2026-10-13 (building PR 2):

- **D3a.** The graph is per surface, not per anchor, and it is hand-mapped from the code rather than crawled. The dummy-backend app can open the board, Dock, widgets, drawers, sidebar and Admin Settings, but not library items, Teams, the gradebook or the Studio, which together hold most of the 3,000 anchors. So `config/tourSurfaces/<area>.ts` lists about 250 surfaces, each with the files whose anchors sit on it and the anchor whose click opens it. Every anchor's surface comes from where it renders (`config/tourAnchorSurfaces.generated.ts`), and the path is the chain of openers back to the board (`config/tourAnchorRoutes.ts`). A surface whose opener has no anchor yet records `openerMissing`, and PR 7's sweep tags it. `tests/tourAnchorRoutes.test.ts` fails on an anchor-rendering file that is on no surface, an opener that is not a registered anchor, or a path that loops. The Playwright crawler becomes a follow-up check that clicks each mapped opener on `vite-verify` and confirms the surface's anchors appear.

Amendment, 2026-10-13 (building PR 3):

- **D6a.** The dry run duplicates the checks it needs rather than sharing `tourHealth.ts`, and it errors only on what breaks playback: an unknown anchor, a bad suffix, an unopened surface, an unstaged widget. Run over the six building tours on prod, three rules raised false alarms and became warnings: a `slot` nothing binds (the runner falls back to the first widget of the type), a `type` or `select` step with no value (the runner hands it to the teacher, right for a calendar ID), and positions in fixed menus and Help Center rows (only `row-N` in a teacher's own list warns).
- **D8a.** Materials are `created`, `sample` (a copy of one of the admin's items by `from_id`) or `teacher` (the teacher picks; the admin's copy is the fallback). Anchors whose saves the tour sandbox absorbs carry `sandboxed: true` in `config/tourAnchors.ts`, and Autopilot performs those when the run is sandboxed. The shared assign buttons (`assign-stepper.submit`, `assign-modal.confirm`) stay unmarked because Flashcards and the PLC assign dialog use them outside the sandbox; a follow-up splits them.

Amendment, 2026-10-13 (building PR 4):

- **D7a.** No separate `/live-tour-run-dev` page: the runner needs the real board's providers, and the board already runs on `vite-verify`. A DEV-only hook (`components/tours/tourTestRun.ts`, `window.__liveTourRun`) hands the runner the tour instead of a Firestore read and records each step. A test run performs every step it can whatever the anchor's risk, skips a control that never shows, moves on from a step with no value, and gives class-based widgets a made-up class when none is active. The script refuses a server whose Firebase project isn't `dummy`.
- **D12a.** Pictures don't go through a connector tool as base64: Claude would have to write every byte out. `start_live_tour_picture_upload` returns a ticket good for 30 minutes (only its hash is stored, in `mcp_tour_picture_tickets`), and the script posts the PNGs to `/mcp/tour-pictures` on the connector function, eight at a time. The pictures are the editor's own crop (`captureStepSnapshot`), stored as Guided Learning media.

## Benchmark workflows

1. Create a quiz from scratch
2. Assign a quiz to a class
3. Set up the Schedule widget
4. Sync Google Calendar
5. Make random groups
6. Add a class / roster
7. Change a widget's style and save it as my default
8. Find help in SpartBoard
9. Create a Guided Learning set
10. Share a board
11. Make a video activity
12. Use the Timer with the schedule

## Data model

```ts
// config/tourAnchors.ts — TourAnchorDef additions
surface?: TourSurface; // generated where absent; see tourAnchorRoutes
// config/tourAnchorRoutes.ts (new)
export type TourSurface =
  | { kind: 'board' | 'dock' | 'sidebar' | 'top-bar' }
  | { kind: 'widget' | 'settings-drawer'; widgetType?: string }
  | { kind: 'admin-tab'; tab: string }
  | { kind: 'library' | 'editor' | 'assign'; materialKind?: TourMaterialKind }
  | { kind: 'modal' | 'menu'; id: string };
export interface TourAnchorRoute {
  surface: TourSurface;
  /** Anchor ref whose click reveals this one; absent for always-visible anchors. */
  opensWith?: string;
  /** Data the crawler needed: an open library item, a selected class, a widget on stage. */
  needs?: ('widget-on-stage' | 'library-item-open' | 'class-selected')[];
  /** Valid widget types / field keys for per-type and per-field refs. */
  keys?: string[];
}
```

```ts
// connector input (functions/src/mcp/glLiveTour.ts) — tour-level additions
layouts?: TourWidgetLayout[];       // optional; D10 auto-stage when absent
materials?: TourMaterialInput[];    // sample | created; teacher-picked stays app-only
use_teacher_board?: boolean;
dry_run?: boolean;                  // create and update
```

## PRs

All target `dev-paul`, in order. Each lists its tests; run `pnpm exec vitest related --run <files>` locally, CI does the rest.

### PR 1 — Playback fixes (D13)

- `components/tours/LiveTourRunner.tsx`: the drawer-close branch of the prerequisite effect keeps the drawer when the next anchor resolves inside the same widget's `[data-tour="settings.root"]`; the missing-step tip keeps `step.text` and adds the "Can't find it" line with Retry/Skip; Autopilot's wait for the next anchor becomes "settled or 10 s" (no pending Firestore writes the runner can see, no running CSS transitions on the anchor's ancestors).
- `components/tours/autopilot.ts` / the advance effect: `type` steps advance on a debounced `input` match against `value`.
- Tests: extend `LiveTourRunner.test.tsx` for each of the four.

### PR 2 — Navigation graph and anchor metadata (D3)

- `scripts/crawl-tour-routes.mjs`: Playwright on `vite-verify`. For each surface seed (empty board, each widget on stage, each library kind with a sample item open, each admin tab), click every non-destructive opener anchor, record newly visible anchors, close, repeat to a fixed depth. Write `config/tourAnchorRoutes.generated.json`.
- `config/tourAnchorRoutes.overrides.ts` for routes the crawler can't reach; `config/tourAnchorRoutes.ts` merges both.
- Per-type / per-field `keys` come from the crawl (observed `data-tour-widget-type` / `data-tour-field` values) plus `settingsFieldList`.
- `tests/tourAnchorRoutes.test.ts`: every `panel` anchor has a route; every `opensWith` is a registered id; generated file is fresh (CI job reruns the crawler on changes to `config/tourAnchors.ts`).
- `tests/mcpTourAnchorList.test.ts` regenerates `functions/src/mcp/tourAnchorList.ts` with `persists`, `surface`, `opensWith`, `needs`, `keys`.

### PR 3 — Connector v2 (D2, D5, D6, D8, D14, D15)

- `docs/live-tours/AUTHORING.md`: the guide. Sections: what a good tour is, the step shape, how to find the path (`list_tour_anchors` by surface, follow `opensWith`), staging (`tour_widgets`, auto-stage, materials), Autopilot rule, voice rules, hand-back format, worked examples.
- `get_live_tour_guide` tool serves it (bundled at build; `tests/liveTourGuideSync.test.ts` fails on drift). Server instructions in `functions/src/mcp/tools.ts` get two lines pointing to it for tours.
- Tour-only step schema and full setup inputs on `create_live_tour` and `update_live_tour`; `list_tour_anchors` gains filters, paging and the namespace summary.
- `functions/src/mcp/tourDryRun.ts`: Tour-Health parity (shared logic moved out of `components/tours/tourHealth.ts` into a module both sides import, or duplicated with a parity test) plus a graph walk that tracks which surfaces are open after each step. Returns `{errors, warnings}`; hard errors throw the ToolError, warnings ride along in the save result.
- Autopilot `tour-safe` policy: a `persists` anchor whose target is a tour-scoped material counts as safe (`components/tours/tourSession.ts` policy gate).
- Update `.claude/skills/gl-author/references/live-tour.md` to point at the guide and remove the contradictions; note the pauls-skills spartboard reference for Paul to update (outside this repo).
- Tests: `functions/src/mcp/glLiveTour.test.ts`, new `tourDryRun.test.ts` with one fixture per hard error and warning.

### PR 4 — Browser run and step pictures (D7, D12)

- `/live-tour-run-dev` harness page (DEV only) that accepts tour JSON via `postMessage` or a fixture file, runs `LiveTourRunner` with a `test` Autopilot policy, and exposes per-step results on `window`.
- `scripts/run-live-tour.mjs <tour.json>`: takes the JSON Claude saved from `get_live_tour` (prod or dev connector), drives the page with Playwright, and writes `results.json` plus per-step PNGs. Claude then uploads the PNGs as step thumbnails through a new admin-only `set_live_tour_step_pictures` connector tool (base64 per step id, same Storage path the editor's `useEditorThumbnails` writes).
- `verify-spartboard` and `gl-author` skills document the run; the guide says Claude Code must run it before hand-back.

### PR 5 — Narration on save (D11)

- `create_live_tour` / `update_live_tour` enqueue narration for steps with new or changed text using the existing `guidedLearningNarration` pipeline; `get_live_tour` reports `has_narration` per step.

### PR 6 — Self-heal and auto-stage (D4, D10, D18)

- Add `live-tour-self-heal` flag.
- Runner: on a missing anchor, walk `opensWith` to a visible ancestor and replay the opening clicks (registered as undoable prerequisites like `settings-open`).
- Runner: when `tourSetup.layouts` is empty, compute an auto-stage layout from `tour_widgets` and each step's focus slot; keyframes animate between focus changes.
- Tests in `LiveTourRunner.test.tsx` and a `tourAutoStage.test.ts` for the layout math.

### PR 7 — Anchor gap sweep and lint (D9)

- Tag the surfaces listed in D9 with `tourAttr` and register the ids (rerun the PR 2 crawler).
- ESLint rule (or a static test like `tests/scrollEndPadding.static.test.ts`) that fails on a `button`, `[role=button|tab|menuitem|switch]`, `input`, `select` or `textarea` in `components/` teacher surfaces without `tourAttr` or `data-tour-ignore`.
- Connector: a save with `anchor: ""` steps is marked `needs_anchors` and the hand-back lists them.

### Benchmark run (D16, D17)

- Claude authors the 12 benchmark tours with the prod connector from one-sentence requests, runs each through PR 4, and hands Paul the list. Paul's edits become gold examples in the guide and voice-rule updates. Record pass/fail in `docs/live-tours/BENCHMARK.md`.
