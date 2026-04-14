# Phase 2 Drawing Widget — Remaining Roadmap & PR 2.1b Deep Dive

## Context

Phase 2a (polymorphic `DrawableObject[]` migration) shipped as [PR #1289](https://github.com/OPS-PIvers/SpartBoard/pull/1289), commit `7e34a64d`. The widget now stores a union-typed object list but only renders `kind: 'path'` — every other kind (`rect`, `ellipse`, `line`, `arrow`, `text`, `image`) is declared in [types.ts:163-263](types.ts#L163-L263) with a stubbed `case` branch in [useDrawingCanvas.ts:179-190](components/widgets/DrawingWidget/useDrawingCanvas.ts#L179-L190).

The Phase 2 endpoint is a classroom whiteboard comparable to SMART Notebook: shapes, text, images, selection/transform, multi-page, undo/redo, export, and perf work. The master roadmap lives in [witty-fluttering-frost.md](/home/node/.claude/plans/witty-fluttering-frost.md). **User confirmed: keep the documented order, deep-dive only the next PR (2.1b).** Later PRs get sketch-level notes here and will be fully designed when each branch opens.

---

## Remaining Phase 2 PRs (roadmap snapshot)

| PR       | Title                                             | Status                   |
| -------- | ------------------------------------------------- | ------------------------ |
| 2.1a     | Object-model migration                            | ✅ Merged                |
| **2.1b** | **Shape primitives + tool palette**               | **Next — planned below** |
| 2.1c     | Selection + transform (move/resize/rotate/delete) | Sketch                   |
| 2.1d     | Text objects                                      | Sketch                   |
| 2.2      | Image insertion                                   | Sketch                   |
| 2.3      | Multi-page canvases                               | Sketch                   |
| 2.4      | Undo/redo command stack                           | Sketch                   |
| 2.5      | Export + background templates                     | Sketch                   |
| 2.6      | Firestore subcollection + incremental render      | Sketch                   |

---

## PR 2.1b — Shape Primitives + Tool Palette (deep dive)

### Goal

Teachers can draw rectangles, ellipses, straight lines, and arrows with the same pen-and-eraser ergonomics as today. No selection/resize yet (that's 2.1c); shapes are created once and then immutable until undo/clear. Zero regressions for freehand pen or eraser.

### Key design decisions

1. **Explicit `activeTool` replaces the `color === 'eraser'` overload.**
   Today [Widget.tsx:161](components/widgets/DrawingWidget/Widget.tsx#L161) stuffs the string `'eraser'` into `config.color` to toggle erase mode. With six tools the overload stops scaling. Add an `activeTool` field to `DrawingConfig`; let `color` hold only real color strings. Migration: legacy `color === 'eraser'` → `{ activeTool: 'eraser', color: <default pen color> }`.

2. **Tool state persists in `config`.** Matches existing behavior for `color`/`width` (already persisted). A teacher who left the rectangle tool selected yesterday finds it selected today. No extra Firestore write cost over today's per-click color writes.

3. **Shape drawing uses the same pointer-down/move/up flow as pen.** Start captures origin; move updates a live preview; up emits one `DrawableObject`. Reuses `getPos()`, `scale`, `disabled`, `nextZ` plumbing. No new state machines.

4. **Live preview renders on top of committed objects.** Mirrors today's `currentPathRef` + re-render pattern ([useDrawingCanvas.ts:82-84](components/widgets/DrawingWidget/useDrawingCanvas.ts#L82-L84)). During drag, the in-progress shape is passed to `draw()` as an extra ephemeral object alongside the real list.

5. **Fill is stroke-only by default.** `RectObject.fill` / `EllipseObject.fill` stay `undefined`. A fill toggle (solid in current color) lives in [Settings.tsx](components/widgets/DrawingWidget/Settings.tsx) so the front-face toolbar stays compact.

6. **Arrows are a styled line.** `ArrowObject` renders as the line plus a triangular head at `(x2,y2)`. Head size scales with `strokeWidth` (`headLen = max(12, strokeWidth * 3)`). No configurable head style in 2.1b — keep it simple.

7. **AnnotationOverlay gets the same palette.** The overlay shares `useDrawingCanvas`, so renderer changes come for free; we just also need to expose the tool buttons in the overlay's toolbar so mid-lecture teachers can draw arrows/rects too. Keep the two toolbars visually consistent.

### Data model changes

**`types.ts`** — add `ShapeTool` and extend `DrawingConfig`:

```ts
export type ShapeTool =
  | 'pen'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow';

export interface DrawingConfig {
  /** @deprecated — kept only to read legacy saved widgets. */
  paths?: Path[];
  /** @deprecated — pre-Phase-1 mode toggle. */
  mode?: 'window' | 'overlay';

  objects: DrawableObject[];
  color?: string; // always a real color; 'eraser' no longer valid
  width?: number;
  customColors?: string[];
  activeTool?: ShapeTool; // default 'pen'
  shapeFill?: boolean; // default false; toggles fill-with-current-color for rect/ellipse
}
```

No changes to the seven `DrawableObject` variants — they already carry everything shapes need.

### Migration update

Extend [utils/migrateDrawingConfig.ts](utils/migrateDrawingConfig.ts) so the single forward migration also:

- If legacy `color === 'eraser'`: set `activeTool = 'eraser'`, clear `color` (fall back to palette default at render time).
- If `activeTool` is missing or invalid: default to `'pen'`.
- If `shapeFill` is missing: default to `false`.

Pure-function addition; extend the existing test file `tests/utils/migrateDrawingConfig.test.ts` with 3 new cases (legacy eraser → activeTool eraser; missing activeTool → pen; invalid activeTool string → pen).

### Hook changes — `useDrawingCanvas.ts`

Option signature gains:

```ts
interface UseDrawingCanvasOptions {
  // ...existing fields...
  activeTool: ShapeTool; // was implicit via `color === 'eraser'`
  shapeFill?: boolean; // for rect/ellipse only
}
```

Internals:

- Replace `currentPathRef: Point[]` with a discriminated in-progress ref:
  ```ts
  type InProgress =
    | { kind: 'path'; points: Point[] }
    | {
        kind: 'rect' | 'ellipse';
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      }
    | {
        kind: 'line' | 'arrow';
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      };
  const inProgressRef = useRef<InProgress | null>(null);
  ```
- `handleStart` branches on `activeTool`: pen/eraser initializes `{ kind: 'path', points: [pos] }`; shape tools record start point (`x0,y0 = x1,y1 = pos`).
- `handleMove` updates the last point (pen) or the end point (shapes). Triggers a redraw with the preview object passed into `draw()`.
- `handleEnd` materializes the in-progress into a `DrawableObject`:
  - `path` → `PathObject` (unchanged logic; uses `color`/`width`, honors eraser mode).
  - `rect`/`ellipse` → normalize `x0,y0,x1,y1` to `{x, y, w, h}` with `w,h >= 0`; apply `stroke: color`, `strokeWidth: width`, `fill: shapeFill ? color : undefined`.
  - `line`/`arrow` → `{ x1, y1, x2, y2, stroke: color, strokeWidth: width }`.
  - Degenerate shapes (zero width AND zero height, or same start/end point) are dropped — mirrors today's "paths of length < 2 are dropped" ([useDrawingCanvas.ts:154](components/widgets/DrawingWidget/useDrawingCanvas.ts#L154)).
- Eraser path keeps today's `destination-out` composite. Shape tools do NOT offer an eraser variant (matches teacher expectations; keeps the matrix small).

Renderer dispatcher — fill in the four stubbed branches at [useDrawingCanvas.ts:183-189](components/widgets/DrawingWidget/useDrawingCanvas.ts#L183-L189):

```ts
case 'rect':
  return renderRect(ctx, obj);
case 'ellipse':
  return renderEllipse(ctx, obj);
case 'line':
  return renderLine(ctx, obj);
case 'arrow':
  return renderArrow(ctx, obj);
// 'text' / 'image' stay no-op — land in 2.1d / 2.2
```

Each new renderer is ~10 lines of Canvas 2D: `ctx.strokeRect`, `ctx.ellipse`, `ctx.moveTo/lineTo`, plus an arrow head via two extra `lineTo` calls and `ctx.fill()`. Save/restore the context around each so `globalCompositeOperation`, `strokeStyle`, `lineWidth`, and `fillStyle` don't leak between objects.

### UI — `DrawingWidget/Widget.tsx` toolbar

Reshape `PaletteUI` into three compact clusters, each separated by the existing `h-6 w-px bg-slate-200` divider:

1. **Tools** (radio-style, one active) — Pen, Eraser, Line, Arrow, Rect, Ellipse. Six `<Button variant="ghost" size="icon">`, icons from lucide-react: `Pencil`, `Eraser`, `Slash` (or `Minus`), `ArrowRight`, `Square`, `Circle`. Active tool gets `ring-2 ring-indigo-500`.
2. **Color swatches** — unchanged, but eraser swatch removed (eraser is now in Tools cluster). Disabled visually when `activeTool === 'eraser'`.
3. **Actions** — Undo, Clear All, AI-extract (unchanged).

Tool click handler sets `config.activeTool`; color click handler only sets `config.color`. Don't auto-flip activeTool back to pen after a color click — teachers picking shape color then drawing a shape is the natural flow.

Stroke width (the `width` slider) applies to every tool. Keep its current home in [Settings.tsx:~55](components/widgets/DrawingWidget/Settings.tsx) — no need to promote to the front toolbar in 2.1b. Add a `shapeFill` toggle to Settings below the width slider.

### Files modified

| File                                                                                                         | Change                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [types.ts](types.ts)                                                                                         | Add `ShapeTool` type; extend `DrawingConfig` with `activeTool`, `shapeFill`.                                                                                       |
| [utils/migrateDrawingConfig.ts](utils/migrateDrawingConfig.ts)                                               | Migrate legacy `color === 'eraser'` → `activeTool: 'eraser'`; default `activeTool: 'pen'`, `shapeFill: false`.                                                     |
| [components/widgets/DrawingWidget/useDrawingCanvas.ts](components/widgets/DrawingWidget/useDrawingCanvas.ts) | `activeTool` in options; discriminated `inProgressRef`; shape `handleStart/Move/End`; fill in rect/ellipse/line/arrow renderers; preview-object param to `draw()`. |
| [components/widgets/DrawingWidget/Widget.tsx](components/widgets/DrawingWidget/Widget.tsx)                   | Tool cluster in `PaletteUI`; decouple color from tool; pass `activeTool` + `shapeFill` to hook.                                                                    |
| [components/widgets/DrawingWidget/Settings.tsx](components/widgets/DrawingWidget/Settings.tsx)               | Add `shapeFill` toggle.                                                                                                                                            |
| [components/widgets/DrawingWidget/constants.ts](components/widgets/DrawingWidget/constants.ts)               | Add `DRAWING_DEFAULTS.ACTIVE_TOOL = 'pen'`.                                                                                                                        |
| [components/layout/AnnotationOverlay.tsx](components/layout/AnnotationOverlay.tsx)                           | Mirror the tool cluster so shapes work during full-screen annotation.                                                                                              |

### Reused utilities (don't rebuild)

- `crypto.randomUUID()` + `nextZ()` from [utils/migrateDrawingConfig.ts](utils/migrateDrawingConfig.ts) — same as paths.
- `Button` primitive at [components/common/Button.tsx](components/common/Button.tsx) — existing `variant="ghost"` + `size="icon"` matches current toolbar.
- `STANDARD_COLORS` from [config/colors.ts](config/colors.ts) — shape stroke color comes from the same palette as pen color; no new palette logic.
- `DrawableObject` + all seven variant interfaces — already defined in [types.ts:163-263](types.ts#L163-L263).

### Verification

1. **Unit tests** — extend [useDrawingCanvas.test.ts](components/widgets/DrawingWidget/useDrawingCanvas.test.ts) with:
   - Rect drag: pointer-down-right-up emits one `RectObject` with correctly normalized `{x, y, w, h}` (including drag-up-left, producing non-negative `w`/`h`).
   - Ellipse drag: same normalization; `kind: 'ellipse'`.
   - Line drag: emits `LineObject` with `{x1, y1, x2, y2}` matching start/end.
   - Arrow drag: same but `kind: 'arrow'`.
   - Degenerate shape (start === end) does not append to objects.
   - Shape drawn while `shapeFill: true` produces `fill === color`; while false, `fill === undefined`.
   - Tool switch during drag is ignored (activeTool captured at `handleStart`).
2. **Migration tests** — extend [migrateDrawingConfig.test.ts](tests/utils/migrateDrawingConfig.test.ts) with the 3 cases listed in the Migration section.
3. **Widget tests** — extend [Widget.test.tsx](components/widgets/DrawingWidget/Widget.test.tsx) with a tool-switch round trip (click rect button → `config.activeTool === 'rect'` persisted).
4. **Validation gate**: `pnpm run validate` green. Target: 1120+ tests passing (Phase 2a landed at 1117).
5. **Manual smoke test** — `pnpm run dev`:
   - Draw each shape in sequence; verify stroke renders at correct position and width.
   - Drag a rect up-left from bottom-right; confirm it appears correctly (normalized).
   - Toggle `shapeFill` in settings; verify new rects/ellipses fill with the current color.
   - Load a pre-Phase-2a dashboard with legacy `color: 'eraser'`; confirm it hydrates into `activeTool: 'eraser'` and the eraser button is selected.
   - Open annotation overlay; draw an arrow over a slide; verify it renders and persists until cleared.
   - Refresh the page; verify shapes persist and the previously selected tool is still active.
6. **Firestore shape check** — open a dev-project widget document: `config.activeTool` is present; `config.color` is a hex string (never `"eraser"`); `config.objects` contains `RectObject`/`EllipseObject`/`LineObject`/`ArrowObject` entries with the expected fields.

### Non-goals for 2.1b (stay disciplined)

- Selecting, moving, resizing, rotating, or deleting individual shapes (that's 2.1c).
- Multi-select / marquee selection (2.1c).
- Per-shape stroke width / color editing after creation (2.1c).
- Snap-to-grid or alignment guides (possible 2.5 stretch; out of scope here).
- Keyboard shortcuts for tool switching (fits naturally after 2.4's command stack).

---

## Later PRs — sketch only (design when each branch opens)

**2.1c — Selection + transform.** New `selection` transient state in Widget (not persisted). Hit-test on pointer-down when `activeTool === 'select'`: bounding-box test for shapes/text/image, stroke-proximity test for paths/lines. Render 8 drag handles around selected object's bbox for resize; a rotation handle above. `Backspace`/`Delete` key removes. Group-select (marquee) likely out of scope for first cut.

**2.1d — Text objects.** New `text` tool places an empty `TextObject` on click and focuses a contenteditable overlay positioned over the canvas. Reuse [TypographySettings.tsx](components/common/TypographySettings.tsx) for font family/color editing (already shared across widgets). Persisted `content` is sanitized via [utils/security.ts](utils/security.ts) on save.

**2.2 — Image insertion.** Reuse [hooks/useImageUpload.ts](hooks/useImageUpload.ts) and `useStorage.uploadDisplayImage`. Entry points: paste (clipboard), drag-and-drop onto the canvas, or an image button in the toolbar. Upload returns `src` + `assetId` for the `ImageObject`.

**2.3 — Multi-page canvases.** Mirror SmartNotebook's page-array pattern ([components/widgets/SmartNotebook/Widget.tsx:33-87](components/widgets/SmartNotebook/Widget.tsx#L33-L87)). `DrawingConfig.objects` becomes `DrawingConfig.pages: DrawableObject[][]` plus `currentPage: number`. Migration wraps existing `objects` into `pages: [objects]`. Page stepper + thumbnail strip in the toolbar.

**2.4 — Undo/redo command stack.** Replace the single-level `objects.slice(0, -1)` undo with a `Command[]` stack. Commands are `AddObject | RemoveObject | UpdateObject | ReorderObject`. In-memory only (not persisted); cleared on reload. `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` bindings. Coexists with selection-era mutations from 2.1c (each transform pushes one `UpdateObject` command).

**2.5 — Export + background templates.** PNG export via `canvas.toDataURL('image/png')` (already used in OCR flow at [Widget.tsx:88](components/widgets/DrawingWidget/Widget.tsx#L88)). PDF via a `jspdf`-style lib if not already in repo; otherwise print-dialog fallback. Background templates: `DrawingConfig.background: 'blank' | 'grid' | 'lines' | 'dots'` rendered as a CSS background layer below the canvas (no object churn).

**2.6 — Firestore subcollection + incremental render.** Move `objects` off the dashboard doc into `/users/{uid}/dashboards/{id}/drawings/{widgetId}/objects/{objectId}`. Use `onSnapshot` with `includeMetadataChanges`. Incremental render: when one object changes, redraw only that object's bbox region instead of `clearRect`-ing the whole canvas. Target: 500+ objects without lag.

---

## Critical files (for any Phase 2 work)

- [types.ts:163-263](types.ts#L163-L263) — `DrawableObject` union and variants. Already complete for every PR below.
- [components/widgets/DrawingWidget/useDrawingCanvas.ts](components/widgets/DrawingWidget/useDrawingCanvas.ts) — the shared rendering + pointer pipeline. Each PR extends this hook.
- [components/widgets/DrawingWidget/Widget.tsx](components/widgets/DrawingWidget/Widget.tsx) — toolbar + widget wiring. Main UI surface for each PR.
- [components/layout/AnnotationOverlay.tsx](components/layout/AnnotationOverlay.tsx) — parallel consumer of `useDrawingCanvas`; must stay in lockstep.
- [utils/migrateDrawingConfig.ts](utils/migrateDrawingConfig.ts) — central migration point. Each schema change adds a lazy forward-migration rule here.
- [context/DashboardContext.tsx](context/DashboardContext.tsx) — annotation state + hydration; touches whenever `DrawingConfig` grows new fields.

---

## Success definition for Phase 2

Phase 2 is done when a teacher can open a DrawingWidget and do every core whiteboard action without leaving the tool: draw strokes and shapes, add and edit text, paste images, move/resize/delete anything they placed, undo/redo freely, flip between multiple pages, export the result, and have it all stay responsive at classroom-scale object counts. Each PR above ticks one of those boxes; 2.1b ticks "draw shapes."
