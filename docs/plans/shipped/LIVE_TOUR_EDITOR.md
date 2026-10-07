# Live tour editor: edit tours on the real board

Replaces the Guided Learning Studio as the place admins edit **live tours** (`mode: 'tour'` sets). An admin opens a tour and lands on the real board with a docked outline of every step. Clicking a step plays it live; editing a step updates what plays. Screenshots become optional per-step thumbnails, never a requirement to see or edit a step.

Scope was settled in a design interview with Paul on 2026-10-07. This document is the contract. Each PR is self-contained: an implementer should be able to build it from the PR text plus the code, without this conversation.

**Code references** were taken at `dev-paul` commit `e8b43ddcb`. Symbol names are authoritative and line numbers are hints; if a line number is off, grep for the symbol. Do not stop to report line drift.

**Release:** everything is behind the existing `gl-live-tours` flag (`types.ts` `GlobalFeature`, `config/featureDefaults.ts`, admin-only, stage `preview`). No new flag. No `public/changelog.json` entry until Paul opens `gl-live-tours` to everyone.

Out of scope: editing ordinary (non-tour) Guided Learning sets, opening live tours beyond admins, a step-list editor inside the Studio, and two-person simultaneous editing.

## Why

- **Tours without pictures can't be edited.** `create_live_tour` saves every step at `imageIndex: 0` with `imageUrls: []` (`functions/src/mcp/glLiveTour.ts:235-240`, `functions/src/mcp/glCreate.ts:109-131`). With no slides the Studio shows `StudioStartHub` instead of the canvas (`GuidedLearningStudio.tsx:1017-1030`), and `StudioTimeline` groups steps by slide and renders nothing (`StudioTimeline.tsx:88`). The steps exist but are reachable only through the `[`/`]` shortcuts or a Tour Health deep link.
- **Pictures drift and go missing.** A draft run only captures pictures for steps whose control it finds. `board.whole` steps lose their binding in the runner (`tourSession.ts:31`) and never get one, and as other steps' slides are inserted (`recaptureStep`, `useGuidedLearningEditorState.ts:725-780`) their `imageIndex` can point at the wrong slide or past the end.
- **Editing keeps leaving the editor.** Re-record closes the Studio and reopens it (`GuidedLearningStudio.tsx:369-379`). A draft run ends in a separate `SnapshotSession` review. The tour bar is playback-only (`components/tours/TourBar.tsx`).
- **Binding a control is indirect.** Rebinding means re-recording a click or choosing an anchor id from a list. `StudioFindOnBoard` can locate a bound control but not pick a new one.
- **Too many ways in.** Edit, Run live, and Run live (draft) in the library (`GuidedLearningManager.tsx:895-924`), the Help Center picker (`GuidedLearningPicker.tsx:264-281`), Tour Health (`TourHealthPanel.tsx:369-380`) and the recorder host each open something slightly different.

## Product decisions (settled, do not re-litigate)

| #   | Decision          | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Editing surface   | Tours are edited **on the real board**. "Edit" opens the board with a docked step outline. Selecting a step plays it live (highlight, tip, layout); that playback is the preview. Steps without a picture are listed like any other step.                                                                                                                                                                                                    |
| E2  | Pictures          | A picture is an **optional thumbnail stored on the step** (`tour.thumbnail`), used in the outline and the Help Center step list. It never decides whether a step is shown or editable. Tour sets stop using slides (`imageUrls`, `imageIndex`, `xPct`/`yPct`, `region`, callouts).                                                                                                                                                           |
| E3  | Binding           | **Point and click.** "Pick control" lights up every registered `data-tour` anchor on hover; clicking binds it. A searchable anchor list is the fallback for controls not on screen and holds the "Whole board" choice.                                                                                                                                                                                                                       |
| E4  | Studio            | **Retired for tours.** A tour-mode set always opens the board editor. Tour setup, Autopilot start, Help Center visibility and Publish move to the outline's Settings tab. The Studio stays for ordinary GL sets.                                                                                                                                                                                                                             |
| E5  | Entry points      | Everywhere a tour is listed (GL library, Help Center picker, Tour Health) offers exactly **Edit** (board editor, optionally at a step) and **Play** (the published tour from step 1, as a teacher sees it). "Run live (draft)" is removed: playing inside the editor is the draft run.                                                                                                                                                       |
| E6  | Jump to a step    | Selecting step N **fast-forwards**: the editor replays steps 1..N-1's prerequisites, actions and layout keyframes with no cursor glide or lead time, then stops at step N highlighted.                                                                                                                                                                                                                                                       |
| E7  | Risky steps       | Fast-forward follows the admin's Autopilot safety policy (`resolveTourAutopilotPolicy`, v3 D12). A blocked step stops fast-forward with "You click this one" and continues after the admin's real click. Editing never assigns, shares or deletes anything silently.                                                                                                                                                                         |
| E8  | Board             | The admin's **current board plus the transient tour layer**, as playback uses (`addTourWidget`, cleared stage from v3 D1-D3). Nothing is autosaved to the board; leaving the editor tears the layer down.                                                                                                                                                                                                                                    |
| E9  | Adding steps      | **Add step** inserts after the selected step and goes straight into Pick control. **Record from here** runs the existing recorder inline and inserts one step per real click after the selected step.                                                                                                                                                                                                                                        |
| E10 | Draft and publish | Already built: the `building_guided_learning/{id}` doc is the draft and `publishTour` writes the snapshot in `building_guided_learning_tours/{id}` that every launch point runs (`components/tours/publishedTours.ts`). The editor autosaves to the set doc with undo and has a **Publish changes** button, shown as dirty when the set differs from the snapshot. Teachers never see unpublished edits. No new collection, no rules change. |
| E11 | Existing tours    | A **one-time conversion script** turns each tour step's slide into its thumbnail and drops slide, region and callout data from tour-mode sets **and** their published snapshots. Run on `spartboard-dev` with PR 1, on prod after the `main` release. After it, editor and runner read only the step shape.                                                                                                                                  |
| E12 | Thumbnails        | **Automatic, plus Retake.** When a step plays in the editor and its control is found, a thumbnail is captured if the step has none or its anchor changed since the last capture. Each step has a Retake button. No review screen. `board.whole` steps have no thumbnail.                                                                                                                                                                     |
| E13 | Connector         | New `get_live_tour` and `update_live_tour` tools. `update_live_tour` writes the set doc (the draft) only, never the published snapshot; the admin publishes in the app. `create_live_tour` keeps T9's hidden-draft behaviour.                                                                                                                                                                                                                |
| E14 | Panel             | A narrow glass panel docked right, collapsible to a rail. When the selected step's control sits under it, it moves to the left edge. The tour tip and spotlight render on the board as teachers see them. The panel is a `data-tour-obstacle`.                                                                                                                                                                                               |
| E15 | Small defaults    | Steps reorder by dragging in the outline. A step whose anchor is missing on the board, or no longer in `TOUR_ANCHORS`, shows a red status. Tour Health "Fix" opens the editor at that step. The per-step "Capture board layout" button (v2 D15) stays, in the step card. Help Center item fields stay in Admin Settings > Help Center.                                                                                                       |
| E16 | Flag              | Existing `gl-live-tours`, admin-only. No new flag.                                                                                                                                                                                                                                                                                                                                                                                           |
| E17 | Delivery          | Five stacked PRs to `dev-paul`, in order, below.                                                                                                                                                                                                                                                                                                                                                                                             |

## Data shape

```ts
// types.ts, on GuidedLearningTourBinding
thumbnail?: {
  url: string;     // Firebase Storage download URL, same bucket/path family as today's tour slides
  anchor: string;  // the anchor the picture was taken of; a mismatch with `anchor` marks it stale
  w: number;
  h: number;
};
```

A tour step keeps `id`, `title`/text fields, `tour` (binding) and its existing text/read-aloud fields. For `mode: 'tour'` sets, writers stop setting `imageUrls`, `imageKinds`, `imageIndex`, `xPct`, `yPct`, `region` and callout fields; normalizers default them so ordinary GL code that still touches them does not crash.

## PRs

### PR 1: step-only tour shape, thumbnails, conversion script

- Add `GuidedLearningTourBinding.thumbnail` (above). Add a `tourThumbnail(step)` helper in `utils/liveTour.ts` that returns the picture or null.
- Switch every tour reader off slides onto `tourThumbnail`: `components/tours/TourStepList.tsx`, `TourMiniPlayer.tsx`, `tourSnapshot.ts`, `tourSession.ts` (`hasStepSlide` becomes "has a fresh thumbnail"), `components/admin/HelpCenter/GuidedLearningPicker.tsx`.
- Writers: `buildRecordedSet.ts` / `RecordingSession.tsx` store each frame as that step's thumbnail instead of a slide. `functions/src/mcp/glLiveTour.ts` and `glCreate.ts` stop writing `imageIndex`/`imageUrls` for tours.
- Runner draft capture (`LiveTourRunner.tsx:460-502`) writes `tour.thumbnail` instead of handing slides to `SnapshotSession`.
- `scripts/convert-tour-slides.mjs`: for each `building_guided_learning` doc with `mode: 'tour'`, and its `building_guided_learning_tours` snapshot, move `imageUrls[step.imageIndex]` into `step.tour.thumbnail` (anchor = current anchor; w/h from the stored image or 0), then delete slide fields. `--dry-run` first; `--project dev` uses ADC, prod uses `scripts/service-account-key.json` (see `scripts/audit-live-tours.mjs` for the pattern). Idempotent. Leaves Storage objects in place.
- Tests: readers render thumbnail-only tours and tours with no thumbnails; the script converts a fixture set and snapshot and is a no-op on a second run.
- PR description: the dev run's dry-run and real output; prod run is a post-release step in `TODO.md`.

### PR 2: board editor shell, outline, select-to-play with fast-forward

- New `components/tours/editor/`: `TourEditorHost` (mounted beside `LiveTourRunner` in `DashboardView.tsx`, admins + `gl-live-tours` only), `TourEditorPanel` (outline + Settings tab), `useTourEditorSession`.
- The editor runs the **draft** set through the runner's existing session in an `edit` mode: `TourBar` is replaced by the panel, the welcome dialog is skipped, Next/Back move the outline selection.
- Start request: a `TOUR_EDIT_EVENT` like `TOUR_START_EVENT` with `{ setId, stepId? }`.
- Fast-forward (E6, E7): a `fastForwardTo(index)` that, from a fresh cleared stage, applies each earlier step's prerequisites (`tourPrerequisites.ts`), layout keyframes (`tourLayoutOverridesAt`), spawns, and `performStep` (`autopilot.ts`) with zero lead/observe time. A step gated by `autopilotGate` stops it with the "You click this one" tip and resumes on the real click. Selecting a later step from an earlier one continues forward; selecting an earlier one resets the stage and replays.
- Step card: text (rich text editor already used by GL), action and value, "Teacher must click", read-aloud, Capture board layout, Delete. Drag to reorder. Red status per E15.
- Autosave to the set doc with debounced writes and an undo stack (reuse `useGuidedLearningEditorState`'s history where it fits; do not pull the Studio in).
- Panel placement per E14; position side remembered in localStorage.
- `/live-tour-views-dev` harness gains the panel with fake anchors: plain step, drawer step needing fast-forward, blocked step, missing anchor, no-thumbnail step.
- `impeccable` polish pass on the harness; screenshots to Paul before merge.

### PR 3: Pick control, Add step, Record from here

- **Pick control:** an overlay that outlines `[data-tour]` elements whose id is in `TOUR_ANCHORS` on hover (reuse `findTourAnchor` / `resolveTourAnchor.ts`), ignores unregistered ones, and binds on click. Escape cancels. Widget-scoped anchors set `slot` from the widget clicked. Picking clears `unmapped`.
- **Anchor list fallback:** searchable list of `TOUR_ANCHORS` labels (`functions/src/mcp/tourAnchorList.ts` has the label set) plus "Whole board".
- **Add step:** inserts after the selection with `action: 'click'` and opens Pick control.
- **Record from here:** starts `TourRecorder` inline without leaving the editor; each captured click becomes a step inserted after the selection, with its frame as thumbnail. Stopping returns to the outline at the last new step. Replaces `StudioTourControls`' Re-record.

### PR 4: thumbnails, Publish, entry points, Studio retired for tours

- Thumbnail capture per E12 using `stepSnapshot.ts`; Retake button on the step card.
- Settings tab: tour setup (`useTeacherBoard`, widgets), `tourSetup.autopilot`, Help Center visibility (`StudioHelpVisibility`), **Publish changes** (`publishTour`) with a dirty indicator comparing `buildTourContent(set)` with the snapshot.
- Entry points per E5: `GuidedLearningManager.tsx` (Edit, Play; remove Run live (draft)), `GuidedLearningPicker.tsx`, `TourHealthPanel.tsx` ("Fix" → Edit at step), `TourRecordingHost.tsx` (a finished new recording opens the board editor, not the Studio). The GL widget routes a tour-mode set's Edit to the board editor (`Widget.tsx:1659-1686`).
- Remove tour-only Studio code paths: `StudioTourControls`, `StudioDraftReview`, tour branches in `GuidedLearningStudio.tsx`, `StudioPropertiesPanel.tsx` tour sections, the recorder's `SnapshotSession` hand-off for tours. Update their tests.
- `tests/tourAnchors.test.ts` and the tour-anchor registry: tag the new editor UI if it should be tourable, otherwise nothing.

### PR 5: connector get/update

- `functions/src/mcp/glLiveTour.ts`: `get_live_tour` (steps with anchor, action, value, text, thumbnail presence, published vs draft state) and `update_live_tour` (full step list; validates anchors against `tourAnchorList.ts` like `create_live_tour`; writes the set doc only, never `building_guided_learning_tours`).
- Same admin and `claude-connector-guided-learning` gates as `create_live_tour`; revisions recorded like other connector updates.
- Update the `pauls-skills:spartboard` / `gl-author` guidance if it describes editing tours through the Studio.

## After merge

- Run `scripts/convert-tour-slides.mjs` on prod after the `main` release (TODO.md).
- On `spartboard-dev`: edit a connector-made tour with no pictures end to end; jump into a drawer step; hit a blocked step; Record from here; publish and Play.
- Move this doc to `docs/plans/shipped/` once PR 4 merges.
