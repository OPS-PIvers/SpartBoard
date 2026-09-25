# Guided Learning Studio: gestures, free callout boxes and a faithful stage

Makes dragging and resizing in the Studio feel like Canva or Figma: the element stays under the cursor, the selection frame never separates from it, a callout is a free box whose text auto-fits, the tooltip's line always touches its box, and the Studio preview matches the student player to the pixel.

Grilled with Paul on 2026-09-25, from a screen recording of a callout drag. It **supersedes** the resize model, size basis and flag in [GL_CALLOUT_EDITING.md](GL_CALLOUT_EDITING.md) (the rows "Resize model", "Text scale range", "Size basis", "Size vs position" and "Flag"). Everything else in that plan stands: the toolbar, the colour presets, the curved leader line, Enter handling while editing and the schema stamping rule. It builds on [GUIDED_LEARNING_STUDIO.md](GUIDED_LEARNING_STUDIO.md) P1-5 (the canvas editing layer) and P1-10 (retiring the classic editor).

**Code references** were taken at `dev-paul` `f456827af`. Symbol names are authoritative and line numbers are hints. `GL/` means `components/widgets/GuidedLearning/` and `studio/` means `GL/components/studio/`.

## What the recording shows

Paul grabs a text popover in the middle of its body and drags it across a screenshot on the Chromebook preset.

1. **The frame and the box separate.** The blue selection frame and its handles stay at the start position while the dark card moves.
2. **The card jumps on grab.** Its top edge snaps to the cursor instead of keeping the grab offset.
3. **It lands somewhere else.** After release it moves again, away from where it was dropped.
4. **A 🚫 cursor appears** after the drag: the browser's native image drag has started underneath.
5. **Grabbing the text can open inline editing** instead of moving the card.
6. **Resize handles barely work.**
7. **The tooltip's line does not reach its box.**
8. **Black bars** sit above and below the screenshot.

## Causes found in code

- **The frame is measured, not derived.** `StudioEditLayer` draws the callout frame from `calloutBox`, which a `ResizeObserver` plus a `MutationObserver` on `style` set after the card has rendered (`StudioEditLayer.tsx` ~246–277). It is always at least a frame behind, and during a drag it is further behind because of the next point.
- **Every drag frame re-renders the whole Studio.** Moves are batched to one per `requestAnimationFrame`, but each applied frame runs `onChange` → `updateStep` → `applyDoc` → a reducer dispatch. `GuidedLearningStudio` passes the whole `editorState` to `StudioCanvas` and `StudioTimeline`. The `set` memo in `StudioCanvas` and the `renderEditLayer` callback both depend on `steps`. `GuidedLearningStage` is not memoized, so every pin, region, overlay and callout placement re-renders on every frame. Everything is positioned with `left`/`top`.
- **Grab jump (to confirm in PR 1).** An auto-placed callout has no `calloutPin`. The first move writes a pin derived from the pointer, not from the box's current rendered centre plus the grab offset.
- **Landing shift.** A pinned box is re-clamped inside the stage by `placePopover`/`placeCallout` after release, using a width estimate that differs from the rendered width, so the clamp moves it.
- **Native drag.** The slide `<img>` in `GuidedLearningStage` is draggable, and nothing cancels `dragstart` inside the Studio.
- **Handles.** Only six handles (`calloutHandles.ts`, no top or bottom), small hit areas, and they sit on the lagging measured frame. Corners scale the text (`calloutScale`) rather than resizing the box, and height cannot be set.
- **Leader line gap.** `arrowBetween(box, target)` in `GL/utils/calloutPlacement.ts` runs on the placement's _estimated_ rect. The rendered card is `max-content` capped by `--gl-callout-max-w` and its height fits the content, so the real card is a different size and the line stops short of it or runs under it.
- **Size basis mismatch.** `calloutPin` is image-%, but `calloutWidthPct` is % of stage width, so a box drifts against the screenshot on a stage of a different aspect ratio.
- **The Studio preview is not the player.**
  - `DeviceFrame` makes `gl-device-stage` the container-query box. The student app's container is the full viewport div (`GuidedLearningStudentApp.tsx` ~650) and the widget's is in `GuidedLearningManager.tsx` ~1663, and `GuidedLearningStage` sets no `container-type` of its own. `cqmin`-based text and padding therefore resolve against different boxes.
  - Presets reserve `footerPx` only (`devicePresets.ts`). The real player also has its top controls bar (`GuidedLearningPlayer.tsx` ~812–818), so the real stage is shorter than the preview.

## About the black bars

There is no fixed frame and no 16:9 box. The stage takes its parent's size and the media is `object-contain` at its natural aspect ratio. The bars are whatever background sits behind it (`bg-slate-950`). Bars appear on any device whose stage aspect differs from the screenshot's, and on a widescreen Chromebook a 16:9 screenshot still gets thin bars because the player's top bar and footer shorten the stage. The Studio currently under-shows them because presets ignore the top bar.

## Decisions (settled, do not re-litigate)

| #   | Decision            | Answer                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Engine              | Rewrite the gesture layer in place, no library. `react-moveable` and similar only cover boxes, would leave regions, vertices and pins on a second system, and work by mutating the DOM against React under three scale layers (DeviceFrame, canvas zoom, pan-zoom).                                                                                                              |
| G2  | Scope               | Every Studio gesture: region move/resize (rect, ellipse, polygon), polygon vertices, pins, callout pins, callout boxes and draw-to-create.                                                                                                                                                                                                                                       |
| G3  | Gesture model       | During a gesture the element and its frame follow the pointer through a **transient preview**: a CSS `transform` written to refs, no React state and no editor-document change per frame. The document is written **once on pointerup** as one undo entry (existing `beginGesture`/`endGesture`). The grab offset is kept, so the point under the cursor stays under the cursor. |
| G4  | Frame               | The selection frame and handles are drawn from the element's model geometry (the same rect the stage renders from), never from a DOM measurement. They share the preview transform, so they cannot separate.                                                                                                                                                                     |
| G5  | Click / drag / edit | A click selects. Dragging from anywhere on a callout moves it and never opens editing. Only a double-click, Enter or the toolbar pencil opens inline editing. Escape or clicking away closes it.                                                                                                                                                                                 |
| G6  | Handles             | Eight: corners and edge midpoints. About 10px visible; hit area 24px for mouse and 44px for touch; constant on screen at any zoom. Shift locks the aspect ratio, Alt resizes from the centre, Ctrl/⌘ disables snapping. Snap targets: image edges and centre lines, the step's hotspot, and other boxes on the slide.                                                            |
| G7  | Native drag         | `draggable={false}` on stage media and `dragstart` prevented inside the edit layer.                                                                                                                                                                                                                                                                                              |
| G8  | Callout box         | Popovers and tooltips are **free boxes**: the teacher sets width and height.                                                                                                                                                                                                                                                                                                     |
| G9  | Auto-fit text       | Font size is computed to fill the box, title at a fixed ~1.2× the body. No manual font size. The fit is computed at render from the box's pixel size, in the Studio and the player alike, so it is never stored.                                                                                                                                                                 |
| G10 | Overflow            | Text never goes below a readable floor (to be set in PR 2, near today's body minimum). If the text still does not fit, the box grows downward to hold it, and the Studio only shows an amber "text doesn't fit" outline. Students never see clipped or scrolling text.                                                                                                           |
| G11 | Coordinate space    | A box's x, y, width and height are **all image-%**, so it stays glued to the same pixels of the screenshot on every device.                                                                                                                                                                                                                                                      |
| G12 | Bounds              | A box may extend past the screenshot into the letterbox area. It is clamped only so it never leaves the visible stage.                                                                                                                                                                                                                                                           |
| G13 | Existing callouts   | Callouts with no explicit box keep today's automatic placement and sizing, so published sets look unchanged. The first drag or resize converts that callout to an explicit box taken from its current on-screen rect, so it does not jump.                                                                                                                                       |
| G14 | Tooltip vs popover  | Both types stay. They share the box, handles, auto-fit and editing. A tooltip adds the connector to its hotspot, a popover has none. No data migration.                                                                                                                                                                                                                          |
| G15 | Connector           | Leaves from the box edge nearest the hotspot and touches it, re-routed every frame while either end moves (including during the transient preview), and hidden when the box covers the hotspot. It routes from the **real** box rect: the stored box for explicit callouts, the rendered rect for auto ones. The curve style from GL_CALLOUT_EDITING stands.                     |
| G16 | Preview fidelity    | The Studio renders the stage inside the same player shell the student app uses: top controls bar, footer and the same container-query box. Text size, bars and callout placement then match the student view on each device preset.                                                                                                                                              |
| G17 | Letterbox fill      | Never crop the screenshot. The area around it shows a blurred, dimmed copy of the same image. Video steps use a blurred still (poster) frame, not a second live video.                                                                                                                                                                                                           |
| G18 | Classic editor      | Retired in the last PR, after Paul has used the new gestures in prod (GUIDED_LEARNING_STUDIO.md P1-10).                                                                                                                                                                                                                                                                          |
| G19 | Flag                | **None.** Paul's explicit call on 2026-09-25, an exception to CLAUDE.md "Releasing a feature". Every PR description must say so, and PR 4's must say students see the blurred letterbox on release.                                                                                                                                                                              |
| G20 | Acceptance          | Replay the recording's actions on https://spartboard-dev.web.app with a recorded GIF in each PR, plus a test that fails if `GuidedLearningStudio` or `GuidedLearningStage` re-renders during a drag.                                                                                                                                                                             |

## Data model

`GuidedLearningStep` (`types.ts` ~7067) and its public mirror gain one optional field:

```ts
/** Explicit callout box in image-%: x/y is the top-left; may fall outside 0–100 (G12). */
calloutBox?: { xPct: number; yPct: number; wPct: number; hPct: number };
```

- Absent means automatic placement (G13), exactly as today.
- When `calloutBox` is set, the renderer ignores `calloutPin`, `calloutWidthPct`, `calloutScale`, `tooltipPosition` and `tooltipOffset`. Converting writes `calloutBox` and clears those fields in the same update.
- `hPct` is the teacher's height. The rendered height is `max(hPct, height needed at the text floor)` (G10); the grown height is never written back.
- Schema: follows the GL_CALLOUT_EDITING rule. A set is stamped with the next schema version only when a step uses `calloutBox`. Clamp helpers go in `GL/utils/calloutStyle.ts` next to the existing ones.
- Validators and the `gl-author` skill accept `calloutBox` (PR 2).

## PRs

Five stacked PRs to `dev-paul`, in order. Each branch starts from the previous one.

### PR 1: gesture engine (bug fix)

- New transient-preview layer in `studio/StudioEditLayer.tsx`: gestures write a transform to the dragged element's and frame's refs each animation frame, and commit once on pointerup through the existing `flushMove` / `endGesture` path. Keep pointer capture, thresholds, touch pinch/pan and repeat-click cycling.
- Selection frames and handles drawn from model geometry (G4). Remove the `calloutBox` measurement state and its observers from the frame path. Measurement may remain for the auto-placed callout's _initial_ rect only.
- Keep the grab offset for every drag. Fix the auto-callout grab jump: a drag converts from the rendered centre, not the pointer.
- Stop the post-release re-clamp from moving a pinned box.
- G5 click/drag/edit rules; G7 native drag off.
- Memoise so a drag re-renders only the edit layer: `GuidedLearningStage` behind `React.memo` with stable props, `StudioCanvas`'s `set` and `renderEditLayer` no longer keyed on the whole `steps` array mid-gesture.
- Tests: extend `StudioEditLayer.test.tsx` (grab offset held, frame and element share one transform, one document write per drag, no `dragstart`), and a render-count test asserting `GuidedLearningStudio` and `GuidedLearningStage` render zero times between pointerdown and pointerup.

### PR 2: free callout box, eight handles, auto-fit

- `calloutBox` type, clamps, schema stamping, public mirror, validators, `gl-author` skill.
- Eight handles with G6 modifiers and snapping (`studio/snapping.ts`), replacing `calloutHandles.ts`' width/scale maths. Retire the corner-scale behaviour.
- Convert on first touch (G13).
- Auto-fit: one shared `fitCalloutText` hook used by `TextPopoverInteraction` and `TooltipInteraction`. Binary search on the body size between the floor and a cap, title fixed at ~1.2×, measured with a hidden clone at the box's pixel width. It must give the same result in the Studio and the player, so it runs off the box's pixel size and nothing else.
- G10 overflow growth and the Studio-only amber outline.
- Tests: fit results at several box sizes; growth at the floor; conversion keeps the on-screen rect; every handle and modifier.

### PR 3: connector

- Route `arrowBetween` / the leader curve from the real box (G15): the stored box for explicit callouts, the measured rendered rect for auto ones.
- The connector joins the PR 1 transient preview, so it follows during a drag of either the box or the hotspot.
- Hide the connector when the box covers the hotspot.
- Tests: the line's end point lies on the box edge for boxes on every side of the target, and for a box being dragged.

### PR 4: faithful preview and letterbox

- Extract the player's stage shell (top controls bar, stage, footer, `container-type: size` on the stage box) and use it in `GuidedLearningPlayer`, `GuidedLearningStudentApp`, the widget and `studio/DeviceFrame.tsx`. Presets then reserve the real bar and footer heights.
- `GuidedLearningStage` owns its container-query box, so `cqmin` resolves identically on every surface.
- Blurred letterbox (G17): a background layer of the same image, `object-cover`, blurred and dimmed, behind the contained media. Video steps use the poster frame. It must not add a network request (reuse the loaded URL).
- Tests: a parity test rendering one step in the Studio frame and the player shell at the same preset and comparing the stage box and a callout's computed font size.

### PR 5: retire the classic editor

Per GUIDED_LEARNING_STUDIO.md P1-10: remove the `gl-studio` gate and the classic fallback in `Widget.tsx` and `GL/components/GuidedLearningEditor.tsx`. Opened only after Paul confirms the new gestures in prod.

## Verification

- Scoped tests only: `pnpm exec vitest related --run <changed files>`. CI runs the full gates.
- Browser check on https://spartboard-dev.web.app, never prod. Replay the recording:
  - grab a popover mid-body and drag it across the slide;
  - resize from each of the eight handles, with and without Shift and Alt;
  - drag a tooltip and its hotspot and watch the connector;
  - switch presets and compare against the student view of the same set.
- Record a GIF of each and put it in the PR.

## Release

No flag (G19). A `public/changelog.json` entry for teachers goes in with the `main` release that carries PR 2, written by the rules in [docs/DEV_WORKFLOW.md](../DEV_WORKFLOW.md#how-to-write-a-release-note).
