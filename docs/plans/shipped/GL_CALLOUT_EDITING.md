# Guided Learning Studio: direct callout editing

Lets a teacher move, resize, restyle and edit tooltips and text popovers directly on the Studio canvas. A tooltip's target node stays put, and its leader line re-routes to wherever the box is dropped. The plan also fixes two Studio bugs, which ship first on their own.

Scope was settled in a design interview with Paul on 2026-09-24. It builds on [GUIDED_LEARNING_STUDIO.md](GUIDED_LEARNING_STUDIO.md) (items P1-5 and P1-6 cover callout drag and inline editing) and does not revise that plan.

**Code references** were taken at `dev-paul` commit `2ee8665`. Symbol names are authoritative and line numbers are hints: if a line number is off, grep for the symbol. `GL/` means `components/widgets/GuidedLearning/`.

## What exists today

Much of the "drag and edit" half already ships in the Studio. It just isn't discoverable, which is why Paul didn't know it existed.

- **Drag.** `studio/StudioEditLayer.tsx` turns a pointer-down inside `[data-gl-callout]` into a callout drag after 4px (`CALLOUT_PX`), writing `step.calloutPin`, the box centre in image-% (`regionEdits.ts` `setCalloutPin`).
- **Live leader line.** The tooltip's line re-routes on every render: `GL/components/interactions/CalloutArrow.tsx` draws a straight line, and `arrowBetween` in `GL/utils/calloutPlacement.ts` computes it.
- **Inline editing.** Double-click or double-tap opens `studio/InlineCalloutEditor.tsx`: a plain `<input>` for the label and a `<textarea>` for the text.
- **Undo, nudge and reset.** Undo and redo group each gesture (`editorHistory.ts`). With a callout focused, arrow keys nudge it (`useCanvasTools.ts`). A "Reset" pill and the properties panel both call `clearCalloutPin`.
- **Not built:**
  - No box width or text scale is stored anywhere. Width is `max-content`, capped by `--gl-callout-max-w` / `--gl-popover-max-w`.
  - There is no per-callout colour.
  - There is no selected-callout state, no handles and no toolbar.
  - The leader line is always straight.
- **Size mismatch.** The Studio renders callouts smaller than the v2 player does. `GuidedLearningPlayer.tsx` `PROJECTOR_TEXT_VARS` is applied only when `playerV2` is set, and `StudioCanvas.tsx` never sets the `--gl-*` variables.

## Product decisions (settled — do not re-litigate)

| Decision            | Answer                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor              | Studio only. The classic editor gets no canvas callout editing. It must preserve the new fields untouched, as it already does for `calloutPin`.                                                                                                                                     |
| Callouts covered    | `text-popover` and `tooltip` steps, plus the `popover` and `tooltip` overlays (`showOverlay`) on pan-zoom and spotlight steps. Banners are out of scope.                                                                                                                            |
| WYSIWYG             | The Studio canvas applies the same `--gl-*` text and width variables the v2 player uses, so what the teacher places is what students see.                                                                                                                                           |
| Discoverability     | Hovering a callout shows an outline and a move cursor. A click selects it, showing handles and a mini toolbar. A double-click, or starting to type, edits it in place. A small dot marks where a tooltip's line meets its node.                                                     |
| Resize model        | Works like Canva. **Side handles** change the width and the text rewraps. **Corner handles** scale the whole card (text, padding and width together). Height always fits the content: there is no height handle, and nothing clips or scrolls.                                      |
| Text scale range    | 0.75× to 2× of the default size. Text also keeps scaling automatically with the widget and screen size, as it does now.                                                                                                                                                             |
| Size basis          | Width is stored as a percentage of the **stage** (container) width, not of the image. A callout's position follows pan-zoom, as pins do today, but its size tracks the screen, so it never balloons at high zoom.                                                                   |
| Size vs position    | Independent. Resizing an auto-placed callout leaves it auto-placed, and auto-placement re-solves for the new size. Only a drag pins it.                                                                                                                                             |
| Reset               | The toolbar offers **Reset position** and **Reset size**. Reset size clears both width and scale. The properties panel keeps one **Reset all**, which clears the pin, width, scale and the legacy `tooltipPosition`/`tooltipOffset`.                                                |
| Leader line         | Tooltips only. The line becomes a **smooth curve**, routed automatically: it leaves the box perpendicular to the box's nearest edge and bends into the target. Nothing about the line is stored. Popovers stay without a line: to point at something, switch the step to a tooltip. |
| Toolbar             | Edit text · Reset position · Reset size · Tooltip ⇄ Popover · Colour · Delete step.                                                                                                                                                                                                 |
| Colour              | Three contrast-safe presets: **Dark** (today's card and the default), **Light** (white card, dark text) and **Accent** (brand blue, white text). The tooltip's line takes the card's colour. It is stored as an enum, never a free colour.                                          |
| Enter while editing | In the body, Enter adds a new line, and blank lines are kept. In the title, Enter moves focus to the body. Escape, clicking outside, or Ctrl/⌘+Enter finishes editing.                                                                                                              |
| Schema              | Bump `GL_SET_SCHEMA_VERSION` to **4**. A set is stamped v4 **only when a step uses one of the new fields**. Any other set is still stamped 3, so it keeps importing on older clients.                                                                                               |
| Flag                | A new `GlobalFeature` `'gl-callout-editing'` at admin level, which only takes effect together with `gl-studio`. It gates the Studio editing UI only. The player and every stage surface honour the new fields for everyone, whatever the flag is set to.                            |
| Bug fixes           | These ship first in their own unflagged PR (PR 1 below).                                                                                                                                                                                                                            |

## PR 1: Studio bug fixes (unflagged, ships first)

These are bug fixes that restore intended behaviour, so they are exempt from the flag and the changelog rule.

### 1a. The widget toolbar shows over the Studio

**Symptom.** Open a Guided Learning widget and edit an activity. The widget's floating toolbar ("GUIDED-LEARNI…" with settings, pin, close and the other buttons) stays visible and clickable on top of the Studio canvas.

**Root cause.** This is not a z-index mistake; the fix is to register the Studio as an open modal.

- `DraggableWindow.tsx` renders the toolbar through a portal at `Z_INDEX.toolMenu` (12000). That is deliberately above modals (`modalContent` is 10001).
- The toolbar hides itself while `useHasOpenModal()` is true (`showTools = isSelectedWidget && !hasOpenModal && …`, around `DraggableWindow.tsx:264-274`).
- The shared `components/common/Modal.tsx` increments that count, and so does every editor built on `EditorModalShell` (the classic GL editor, the Quiz editor, the MiniApp editor).
- `GuidedLearningStudio.tsx` opens its own `createPortal` dialog at `Z_INDEX.modalContent` and never calls `incrementOpenModalCount`. The widget is still selected behind it, so the toolbar stays.
- A second symptom has the same cause: the Escape guard in `DashboardView.tsx`'s global keydown doesn't recognise the Studio, so Escape (and Shift+Escape, which minimises all widgets) leaks through to the dashboard.

**Fix.** In `GuidedLearningStudio.tsx`, register with `components/common/modalStore.ts` for the Studio's mounted lifetime, and take the body scroll lock the way `Modal.tsx` does:

```ts
useEffect(() => {
  incrementOpenModalCount();
  const release = acquireBodyScrollLock();
  return () => {
    release();
    decrementOpenModalCount();
  };
}, []);
```

- Match whatever `acquireBodyScrollLock` actually returns in `components/common/bodyScrollLock.ts`, using `Modal.tsx`'s effect as the template.
- Keep the dependency array empty, so the count never drops to 0 on a re-render. `Modal.tsx`'s comment explains why.
- Stay registered while the Studio is `peeking`.
- **Do not** raise the Studio's z-index above `toolMenu`. That would bury the Studio's own `StudioMenu` (`Z_INDEX.popover`) and `StudioFindOnBoard` (`Z_INDEX.tourCallout`) layers.

**Tests.**

- With the Studio mounted, the widget toolbar (tour anchor `widget.toolbar`) is absent. `DraggableWindow.test.tsx` already exercises `incrementOpenModalCount` and is a pattern to follow.
- Escape inside the Studio doesn't reach the dashboard handler.

### 1b. Line breaks disappear in tooltips

**Symptom.** Pressing Enter, or leaving a blank line, in a tooltip's text shows up as one run-on paragraph.

**Root cause.** The text is saved with its newlines, but the tooltip body collapses them when it renders.

- The tooltip body in `TooltipInteraction.tsx` (`<div className="text-slate-100">{renderStepText(step.text)}</div>`, around line 135) has no `whitespace-pre-wrap`.
- `TextPopoverInteraction.tsx` (around line 127) and `BannerInteraction.tsx` (around line 77) already have it.
- `renderStepText` (`GL/utils/richText.tsx`) returns plain string segments, so `pre-wrap` is all that's needed.

**Fix.** Add `whitespace-pre-wrap` to the tooltip body.

- Because the tooltip uses `width: max-content`, a long line still has to wrap at `maxWidth`. Confirm this in the test.
- Check that the auto-squeeze measurement (`squeezed`) still behaves with multi-line text.

**Tests.**

- A tooltip whose `text` is `'a\n\nb'` renders with the text node intact and the `pre-wrap` class applied.
- In the Studio, pressing Enter in the `InlineCalloutEditor` textarea inserts a newline. The Studio shortcuts `place-step` and `edit-callout` in `useCanvasTools.ts` both bind `Enter` behind an `onCanvas(e)` guard: prove they don't fire, or `preventDefault`, while the textarea has focus.

## PR 2+: callout editing (flag `gl-callout-editing`)

### Phase A: data model and rendering (every surface, not flagged)

This phase must land before, or together with, Phase B. Otherwise the Studio could write fields that students never see.

**A1. Step fields.** Add three optional fields to `GuidedLearningStep` and `GuidedLearningPublicStep` in `types.ts`, and mirror them in `SubShareGuidedLearningStep` if that type lists presentation fields explicitly:

```ts
/** Callout width, % of stage width (10–95). Absent = auto width. */
calloutWidthPct?: number;
/** Callout text/padding scale, 0.75–2. Absent = 1. */
calloutScale?: number;
/** Callout colour preset. Absent = 'dark'. */
calloutTone?: 'dark' | 'light' | 'accent';
```

- Clamp them on write in `studio/regionEdits.ts`, next to `setCalloutPin`, and clamp them again on read in the renderers.
- They apply to `text-popover` and `tooltip` steps, and to `showOverlay: 'popover' | 'tooltip'` on pan-zoom and spotlight steps. They are ignored everywhere else.

**A2. Everything that has to carry the fields.**

- Public-step allowlists: in `hooks/useGuidedLearningSession.ts`, add the fields to `toPublicStep`, next to `calloutPin`. In `functions/src/guidedLearningPublicStep.ts`, add them to `PRESENTATION_FIELDS`. Update the parity fixture `guidedLearningPublicStep.cases.json`. A field left out of either list never reaches a student.
- Add them to `STUDIO_STEP_FIELDS` and `stepsEqual` in `GL/components/useSetDraftPersistence.ts`. That drives the dirty check and makes the classic editor preserve them.
- Validate the ranges and the enum in `isValidStepGeometry` in `GL/adapters/guidedLearningImportAdapter.ts`.
- Grep for every other explicit step-field list (for example, the sub-share mapping and duplication helpers) and carry the new fields through it.
- There is no Firestore step validation (`firestore.rules` never names `calloutPin`), so no rules change is needed. Still confirm with `node scripts/releaseFirestoreRules.mjs spartboard-dev` if rules are touched for any other reason.

**A3. Schema v4, stamped only when used.**

- Set `GL_SET_SCHEMA_VERSION = 4` in `GL/utils/setMigration.ts`, and add a helper `requiredSchemaVersion(set)`. It returns 4 if any step has `calloutWidthPct`, `calloutScale` or `calloutTone`, and 3 otherwise.
- Every save and export path that stamps `schemaVersion` today must stamp `requiredSchemaVersion(set)` instead. Grep for `schemaVersion:` and `GL_SET_SCHEMA_VERSION`.
- `parseGuidedLearningJson` (`GL/utils/glTransfer.ts`) accepts versions up to 4.
- Update `setMigration.test.ts`, which currently asserts the version is 3.
- **Release check.** Before `main`, confirm what a _previous_ client does when it **loads** (not imports) a v4 set from Drive or `building_guided_learning`. If loading rejects or mangles it, that is a release blocker, and the fix is to keep stamping v3 on stored sets and use v4 only on `.gl.json` exports. Record the finding in the PR.

**A4. Rendering width, scale and tone.** In `TooltipInteraction.tsx` and `TextPopoverInteraction.tsx`:

- **Width.** With `calloutWidthPct` set, the card uses `width: <pct>cqw` instead of `max-content`, capped at the container minus `CALLOUT_PADDING`. The auto-squeeze stays in place as a last-resort fit for tooltips.
- **Scale.** Set a `--gl-callout-scale` custom property on the card, and multiply the body font, the title font and the padding by it (`calc(var(--gl-text-body, …) * var(--gl-callout-scale, 1))`). Scale is applied after width, so the author's width is the rendered width.
- **Tone.** Map each preset to card classes: Dark is today's classes; Light is a white card with slate-900 text and a slate border; Accent is the brand primary background with white text. Check each for AA contrast, and put the mapping in one small shared module so the Studio toolbar swatches use it too.
- `placeCallout` and `placePopover` (`GL/utils/calloutPlacement.ts`) already measure the rendered box through a ResizeObserver, so auto-placement adapts to the new size with no API change.

**A5. The curved leader line.**

- Replace the straight segment in `CalloutArrow.tsx` with a cubic Bézier `<path>`.
  - The start point is still `arrowBetween`'s box point.
  - The first control point extends out of the box, along the outward normal of the edge the line leaves from.
  - The second control point extends back from the target point, toward the box.
  - Size the control distances at about 40% of the chord, clamped so short lines are almost straight.
- Orient the arrowhead along the curve's end tangent.
- The stroke colour follows `calloutTone`: white with a dark halo for Dark, as today; slate-900 with a white halo for Light; brand blue with a white halo for Accent.
- Keep `pointer-events-none` and the rule that nothing is drawn under 3px.
- Add a unit test for the geometry of the new routing helper. It belongs in `calloutPlacement.ts`, and must stay pure and deterministic.

**A6. Studio WYSIWYG.** `StudioCanvas.tsx` applies the v2 player's `--gl-*` variables to the stage wrapper. Export `PROJECTOR_TEXT_VARS` from `GuidedLearningPlayer.tsx`, or move it to a shared module. Apply it when the set will play in v2, which means when the author has `gl-player-v2`, matching how sessions are stamped `playerV2`. The Studio's play mode (`StudioPlayMode.tsx`) should match as well.

### Phase B: Studio editing UI (behind `canAccessFeature('gl-callout-editing') && studioEditor`)

**B1. Flag.** Add `'gl-callout-editing'` to `GlobalFeature` in `types.ts`, and a `FEATURE_DEFAULTS` entry in `config/featureDefaults.ts`: `defaultAccessLevel: 'admin'`, `defaultEnabled: true`, `missingDocPublic: false`. With the flag off, the Studio behaves exactly as it does today (the existing drag and double-click editing stay).

**B2. Callout selection.** Add a `selectedCallout` sub-selection to the Studio's selection state. It belongs to the selected step, and one step's callout can be selected at a time.

- Hovering `[data-gl-callout]` shows a 1px outline and a `move` cursor, in both `StudioEditLayer` and the stage's hover styling.
- A pointer-down on the callout that stays under `CALLOUT_PX` of movement **selects the callout**. Past that threshold it drags it, as today.
- Clicking empty canvas, clicking the region, or pressing Escape returns to region selection.
- Double-click, Enter, or typing a printable character while the callout is selected opens inline editing. Typing a character inserts it into the body text.
- With a tooltip, show a small dot where the line meets the node (the existing anchor dot in `TooltipInteraction.tsx` is today hidden when a region exists). It shows only while the callout is selected, only in the Studio, and never in the player.

**B3. Handles.**

- While a callout is selected, render 4 side handles and 4 corner handles around its measured rect, in `StudioEditLayer`. Locate the box with `canvasScale.ts` `findCallout`, and reuse the existing 44px minimum hit targets.
- **Side handles** set `calloutWidthPct`. Hold the opposite edge fixed when the callout is pinned, and resize symmetrically around the centre when it is auto-placed. Top and bottom handles do nothing, because height fits the content. Either omit them or render them disabled; pick one and be consistent.
- **Corner handles** set `calloutScale` uniformly, anchored at the opposite corner, and scale `calloutWidthPct` in proportion so the card keeps its shape. Clamp the scale to 0.75–2.
- Each drag is one undo step (`beginGesture`/`endGesture`), and pointer moves are coalesced per frame as the existing gestures do.
- Keyboard, for accessibility (an implementation default, open to change): with the callout selected, Alt+←/→ changes width by 2 percentage points, and Alt+↑/↓ changes scale by 0.05.
- Snapping: side handles snap to the existing guides in `snapping.ts`, and Ctrl/⌘ disables snapping, consistent with regions.

**B4. Mini toolbar.** A floating pill above the selected callout, flipping below it near the top edge. It uses Studio styling and `Z_INDEX` tokens. Buttons:

1. **Edit text**: opens inline editing.
2. **Reset position**: `clearCalloutPin`. Disabled when there is no pin.
3. **Reset size**: clears `calloutWidthPct` and `calloutScale`. Disabled when neither is set.
4. **Tooltip ⇄ Popover**:
   - On a step, it switches `interactionType` between `tooltip` and `text-popover`.
   - On a pan-zoom or spotlight step, it switches `showOverlay` between `tooltip` and `popover`.
   - It keeps the label, text, pin, width, scale and tone.
5. **Colour**: three swatches (Dark, Light, Accent) from the shared tone module.
6. **Delete step**: uses the Studio's existing delete-step action (and its confirmation, if it has one), so undo restores the step.

Every label goes through `t()`. Because the toolbar is DOM inside the canvas, `StudioEditLayer` must not treat a pointer-down on it as a canvas gesture.

**B5. Inline editing keys.** In `InlineCalloutEditor.tsx`:

- **Enter** in the body is a native newline. Make sure no Studio shortcut consumes it; see PR 1b.
- **Enter** in the title moves focus to the body.
- **Ctrl/⌘+Enter**, **Escape**, or a pointer-down outside the editor commits and closes it.
- Escape stays a commit, not a cancel, matching today's `cancel-tool` behaviour.
- Blank lines are preserved on save. No `trim()` runs on `text` anywhere in the save path. Verify this, and add a test.

**B6. Properties panel.** `StudioRegionControls.tsx` adds a width, scale and tone summary under "Callout position" (for example, "Width 42% · 1.25× · Light"). Its Reset button becomes **Reset all** (`resetCalloutPlacement`, extended to clear the new fields).

### Phase C: authoring docs and validators

- `.claude/skills/gl-author/SKILL.md`:
  - Document `calloutWidthPct`, `calloutScale` and `calloutTone`.
  - Guidance: leave them out unless a callout needs it, the same as for `calloutPin`.
  - Say that `schemaVersion` must be 4 when any of them is present, and 3 otherwise.
- `.claude/skills/gl-author/scripts/validate_gl_json.mjs`: validate the ranges, the enum, and the rule tying them to `schemaVersion`.
- AI generation (`functions/src/aiGeneration.ts` `generateGuidedLearning`) does not emit the new fields. Leave it unchanged.

## Sequencing

1. **PR 1** (bug fixes 1a and 1b). Independent; merge first.
2. **Phase A**, one PR. The player honours the fields even though nothing writes them yet. Both copies of the public-step allowlist must be deployed before any v4 set is created: the client ships with hosting, the server copy with functions, and both deploy together from `dev-paul` and `main`.
3. **Phase B**, one or two PRs (B1–B3, then B4–B6). Gated by `gl-callout-editing`.
4. **Phase C**, with or after Phase A.

## Verification

- Run unit tests on the files you touched with `pnpm exec vitest related --run …`.
- Check in the browser on https://spartboard-dev.web.app with the flag on for an admin:
  - Drag, side-resize and corner-scale a tooltip. The node stays fixed and the curve follows.
  - Undo each gesture.
  - Switch the callout to a popover and back.
  - Try each colour.
  - Enter blank lines.
  - Play the set in the Studio's play mode, in the student app, and in a Help Center viewer on at least two device presets (`board`, `chromebook`). Also test a pan-zoom step whose overlay is pinned and resized.
- Export a set that uses the new fields (it should get `schemaVersion: 4`) and one that doesn't (it should get 3), then import both.

## Release

- **Flag:** `gl-callout-editing` (GlobalFeature), starting at access level `admin`. Admins always pass, so "on for Paul" means Paul plus the other `/admins`.
- **To open it:** Admin Settings > Access > Global Settings > `gl-callout-editing` > set to Public. Paul flips this after testing in prod, and it only matters for teachers who also have `gl-studio`.
- **Changelog:** PR 1 may get a short bug-fix note. The feature gets its `public/changelog.json` entry when the flag opens to everyone.
