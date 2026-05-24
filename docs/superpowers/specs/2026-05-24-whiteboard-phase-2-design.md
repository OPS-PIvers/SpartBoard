# Whiteboard Phase 2 — Design Spec

**Date:** 2026-05-24
**Branch:** `claude/whiteboard-implementation-status-SNkii`
**Status:** Approved, pre-implementation
**Roadmap reference:** [`docs/drawing-widget-phase-2.md`](../../drawing-widget-phase-2.md)

## Problem

The DrawingWidget today is a single-page pen-and-eraser surface. Phase 2a
([PR #1289](https://github.com/OPS-PIvers/SpartBoard/pull/1289)) migrated the
storage model from `paths: Path[]` to a polymorphic `objects: DrawableObject[]`
union, but only the `path` branch renders — the six other kinds (`rect`,
`ellipse`, `line`, `arrow`, `text`, `image`) are declared in
`types.ts:684-780` and stubbed in `components/widgets/DrawingWidget/useDrawingCanvas.ts:182-193`.

Teachers running classroom whiteboard activities currently leave the widget
to do anything beyond freehand: they paste images into a separate Text widget,
they reach for SmartNotebook for multi-page work, they screenshot to "export,"
and they have no way to move a stroke once drawn. Eraser is also implemented
as a stringly-typed mode flag (`color === 'eraser'` at
`components/widgets/DrawingWidget/Widget.tsx:159` and the parallel branch at
`components/widgets/DrawingWidget/useDrawingCanvas.ts:53-59`), which doesn't
scale past two tools. There's no undo beyond a single-level
`objects.slice(0, -1)` (`Widget.tsx:73-77`) and no export path that doesn't
involve the OS print-screen.

The classroom expectation for a "whiteboard" — set by SMART Notebook,
Promethean ActivPanel, and Google Jamboard — is shapes + text + images +
move/resize + multi-page + undo/redo + export. Phase 2 closes that gap
without breaking the existing pen-only flow or the parallel
`AnnotationOverlay` consumer of `useDrawingCanvas`.

## Goal

Phase 2 is done when a teacher can open a DrawingWidget and do every core
whiteboard action without leaving the tool: draw strokes and shapes, add
and edit text, paste or upload images, move/resize/delete anything they
placed, undo and redo freely, flip between multiple pages, export the
result, and have it all stay responsive at classroom-scale object counts
(target: 500+ objects per page across all pages). Pre-Phase-2 saved widgets
continue to hydrate and render correctly at every milestone, and the
`AnnotationOverlay` (which shares the same render hook) gets the same
upgrades for free.

## Scope

Eight PRs, in order:

- **2.1b — Shape primitives + tool palette.** Rectangle, ellipse, line, and
  arrow drawing tools. `activeTool` replaces the `color === 'eraser'`
  overload. Front-face toolbar gains a tool cluster; settings gain a fill
  toggle.
- **2.1c — Selection + transform.** A `'select'` tool that hit-tests
  existing objects, renders 8-handle resize + 1-handle rotate, supports
  drag-to-move, and binds `Backspace`/`Delete` to remove the selection.
- **2.1d — Text objects.** A `'text'` tool that places `TextObject`s and
  edits them in a positioned contenteditable overlay; reuses
  `components/common/TypographySettings.tsx`.
- **2.2 — Image insertion.** Paste-from-clipboard, drag-and-drop onto the
  canvas, and a toolbar upload button. Uploads go through
  `hooks/useImageUpload.ts` + `useStorage.uploadDisplayImage`.
- **2.3 — Multi-page canvases.** `objects` becomes `pages[].objects`;
  `currentPage` selects the active page; a page stepper + thumbnail strip
  lives in the toolbar.
- **2.4 — Undo/redo command stack.** Replaces the single-slot
  `objects.slice(0, -1)` with an in-memory `Command[]` history;
  `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` bindings.
- **2.5 — Export + background templates.** PNG export via
  `canvas.toDataURL`; PDF export via the browser print dialog (no new
  dependency); background templates (`blank` / `grid` / `lines` / `dots`)
  rendered as a CSS layer beneath the canvas.
- **2.6 — Firestore subcollection + incremental render.** Move page
  content off the dashboard doc into
  `/users/{uid}/dashboards/{id}/drawings/{widgetId}/objects/{objectId}`,
  driven by `onSnapshot`. Renderer becomes incremental — redraw the
  changed object's bbox only.

## Non-goals

These items are out of scope for Phase 2 and should be deferred or rejected
in PR review:

- **Group select / marquee select.** Selection in 2.1c handles one object at
  a time. Multi-select is a natural follow-on once the command stack lands,
  but it requires a different transform-handle math and would balloon the
  PR.
- **Snap-to-grid / smart guides / alignment helpers.** Mentioned as a
  possible 2.5 stretch in the roadmap; explicitly cut from this phase to
  keep the export PR scoped to export.
- **Keyboard shortcuts for tool switching (P / E / R / etc.).** Belongs
  after 2.4 (so undo/redo bindings and tool bindings ship together).
- **Mobile-specific gestures.** Two-finger zoom/pan on the canvas, tap-to-
  edit-text, long-press for context menu — all deferred. Phase 2 supports
  pointer events as they exist today, which is touch-friendly enough for
  iPad use.
- **Per-stroke pressure / variable-width pen.** Today's pen is
  constant-width; staying constant keeps `PathObject.points: Point[]`
  unchanged and avoids touching the legacy migration in
  `utils/migrateDrawingConfig.ts`.
- **Collaborative live cursors during synced annotation.** The
  `annotationOverlay` mirror already broadcasts strokes; cursor positions
  are a separate broadcast channel and are out of scope. See "Live-share
  interaction" below.
- **Shape libraries / stamps / clipart panel.** Beyond the four primitives
  (rect, ellipse, line, arrow). A shape-library widget could be a future
  follow-up but is not a whiteboard requirement.
- **Per-object lock / layer panel.** Z-order is auto-managed; teachers can
  delete to reorder. A dedicated layer panel is overkill for the classroom
  use case.
- **Rich-text inside `TextObject`.** Plain text with one font family / one
  size / one color, set per object. Mixed runs (bold runs, color spans)
  would conflict with the sanitization story and aren't worth the surface
  area.
- **Real-time co-editing inside a teacher's own widget.** The widget is
  single-author; live-share's `annotationOverlay` is the cross-teacher
  surface and stays untouched by 2.6's subcollection migration.

## Decisions (approved)

Every subsection below captures the data model change, the UX change, the
renderer/hook change, cross-PR constraints, and the `AnnotationOverlay`
parity requirement. Decisions marked **Approved** carry from the roadmap;
decisions marked **New** were settled during this spec and are flagged
again in "Open questions / risks" if they're load-bearing.

### 2.1b — Shape primitives + tool palette

**Data model.** Add a `ShapeTool` union and extend `DrawingConfig`:

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

  objects?: DrawableObject[]; // optional only for legacy hydration; post-migrate always present
  color?: string; // always a real color; 'eraser' no longer valid post-migrate
  width?: number;
  customColors?: string[];
  activeTool?: ShapeTool; // default 'pen'
  shapeFill?: boolean; // default false; fills rect/ellipse with current color when true
}
```

No new `DrawableObject` variants — `RectObject`, `EllipseObject`, `LineObject`,
and `ArrowObject` already exist at `types.ts:709-749`.

**UX surface.** The toolbar (`PaletteUI` in
`components/widgets/DrawingWidget/Widget.tsx:140-206`) is reshaped into
three clusters separated by the existing `h-6 w-px bg-slate-200` divider:

1. **Tools** — radio-style group of six icon buttons: Pencil, Eraser, Slash
   (line), ArrowRight (arrow), Square (rect), Circle (ellipse). Active tool
   carries `ring-2 ring-indigo-500`. Eraser moves out of the color cluster
   and into here.
2. **Colors** — the existing custom-color swatches, minus the eraser swatch.
   Visually disabled when `activeTool === 'eraser'`.
3. **Actions** — Undo, Clear All, AI-extract — unchanged.

The stroke-width slider stays in `Settings.tsx` and applies to every tool. A
`shapeFill` toggle lands below it. Picking a color does **not** auto-switch
the active tool back to pen — a teacher choosing rectangle color then
drawing a rectangle is the natural flow.

**Renderer / hook.** `useDrawingCanvas`'s `currentPathRef: Point[]` becomes
a discriminated `inProgressRef`:

```ts
type InProgress =
  | { kind: 'path'; points: Point[] }
  | { kind: 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number };
```

`handleStart` branches on the new `activeTool` option; `handleMove` updates
the live preview; `handleEnd` materializes the in-progress into a typed
`DrawableObject`. Rect/ellipse normalize so `w`/`h ≥ 0`. Lines and arrows
keep raw endpoints. Degenerate shapes (start === end, or zero-size rect)
are dropped — mirrors today's "paths of length < 2 are dropped" at
`components/widgets/DrawingWidget/useDrawingCanvas.ts:157`.

The four stub branches in the renderer dispatcher
(`components/widgets/DrawingWidget/useDrawingCanvas.ts:186-189`) are filled
with ~10 lines of Canvas 2D each: `ctx.strokeRect` / `ctx.ellipse` /
`ctx.moveTo+lineTo`, plus a triangular arrow head sized as
`headLen = max(12, strokeWidth * 3)`. Every renderer wraps in
`ctx.save() / ctx.restore()` so composite ops and styles don't leak.

The live preview reuses the existing pattern at
`components/widgets/DrawingWidget/useDrawingCanvas.ts:65-83`: the
in-progress shape is passed as a synthetic object alongside the committed
list into `draw()`.

**Cross-PR constraints.** This PR is the last one that can introduce
non-trivial migration work for a long time — every later PR must read the
shapes that 2.1b commits, so `RectObject` / `EllipseObject` / `LineObject` /
`ArrowObject` must serialize exactly as their `types.ts` declarations.

**AnnotationOverlay parity.** Required.
`components/layout/AnnotationOverlay.tsx:296-319` mirrors the same color +
eraser cluster; the tool cluster from this PR must be inlined into the
overlay's toolbar in the same PR. Teachers drawing arrows mid-lecture is
the headline use case for the overlay; shipping shapes in the widget but
not the overlay would be confusing.

### 2.1c — Selection + transform

**Data model.** No persisted changes. Selection is **transient widget
state** — `useState<{ selectedId: string | null }>`, owned by the widget
(and by the overlay, separately). It does not enter `DrawingConfig`, does
not enter `annotationOverlay`, does not enter the subcollection in 2.6.
Rotation already exists on `BaseDrawableObject.rotation?` at `types.ts:697`,
so a transform that includes rotation can write directly through.

`activeTool` gains a seventh value: `'select'` is added to the `ShapeTool`
union. (Yes, "select" is not a "shape" — the naming is a Phase 2a artifact;
we accept the misnomer rather than renaming the union and forcing another
migration.)

**UX surface.** A pointer (cursor / arrow / `MousePointer2`) icon button
joins the toolbar Tools cluster as the first item. When `activeTool ===
'select'`:

- Pointer-down on an object selects it; pointer-down on empty canvas
  clears the selection.
- A selected object renders an indigo bounding rectangle (1px,
  `stroke: rgba(99,102,241,0.8)`) plus 8 square handles (corners + edge
  midpoints, 10×10 in canvas px) for resize, plus one circular handle
  positioned 20px above the bbox top for rotation.
- Drag-from-body moves the object; drag-from-handle resizes; drag-from-
  rotation-handle rotates. Resize from a corner preserves aspect ratio when
  `Shift` is held (cheap to implement and matches Figma).
- `Backspace` and `Delete` keys remove the selection. The keyboard listener
  is scoped — attached on widget focus, removed on blur, so it doesn't
  conflict with text editing in other widgets.

**Renderer / hook.** Selection bounds are drawn after the object loop in
`draw()` so they sit on top of all objects. Hit-testing extends
`useDrawingCanvas`:

```ts
interface UseDrawingCanvasOptions {
  // ...existing fields...
  selection?: { selectedId: string | null };
  onSelect?: (id: string | null) => void;
  onTransform?: (id: string, patch: Partial<DrawableObject>) => void;
  onDelete?: (id: string) => void;
}
```

Hit-test rules per kind: shapes/text/image use bounding-box hit;
paths/lines/arrows use stroke-proximity hit (distance from any segment ≤
`strokeWidth/2 + 4px`). `BaseDrawableObject.rotation` is honored — the hit
point is reverse-rotated around the object center before bbox testing.

The transform handlers compute the new geometry and call
`onTransform(id, patch)` once per pointer-move (no throttling — the
existing draw pass is cheap enough at Phase-2 object counts; 2.6 will
optimize if needed). On pointer-up the parent commits the patch through
`updateWidget`.

**Cross-PR constraints.** This PR depends on 2.1b's renderer dispatcher
being able to draw every object kind, because the selection box must be
drawable for any object the teacher created — and 2.1b is the PR where
rect/ellipse/line/arrow actually paint. It also defines the
`onTransform` / `onDelete` callback shape that 2.4 will wrap with
`UpdateObject` / `RemoveObject` commands.

**AnnotationOverlay parity.** Required. The overlay also gains a select
tool button; the same hit-test + transform behavior applies. Selection
state in the overlay is **local-only and not mirrored** — see "Live-share
interaction" below for the rationale.

### 2.1d — Text objects

**Data model.** No new types — `TextObject` already exists at
`types.ts:751-761` with `content`, `fontFamily`, `fontSize`, `color`. A
new `'text'` value joins the `ShapeTool` union.

`DrawingConfig` gets two new optional fields for the text tool's defaults
so teachers don't re-pick font on every text drop:

```ts
defaultTextFontFamily?: string; // default: 'Lexend' (matches sans body)
defaultTextFontSize?: number;   // default: 24
```

`color` (the existing field) doubles as the default text color, matching
the pen-color affordance.

**UX surface.** With `activeTool === 'text'`, a pointer-down on the canvas
creates a new `TextObject` at the click point with `w: 200, h: 40`,
selects it, and opens an inline contenteditable overlay positioned over
the canvas at the object's bounds. The teacher types; pointer-out or
`Esc` commits the text and exits edit mode. Empty text on commit deletes
the object (mirrors the degenerate-shape rule from 2.1b).

Double-click on an existing `TextObject` (in any tool mode) re-enters edit
mode. This is the only double-click gesture in the widget.

Font controls live in the back-face settings panel, using the shared
`components/common/TypographySettings.tsx` primitive — exactly as
`SmartNotebook` and other widgets already do. The settings panel applies
to the selected text object (if any) or sets the default for new text
objects.

**Renderer / hook.** The `'text'` branch in the dispatcher uses
`ctx.fillText` with the object's `fontFamily`, `fontSize`, and `color`. Text
wrapping is naive — `\n` only, no auto-wrap; if a teacher wants wrapped
text they resize the text box (which only changes the bbox, not the
wrapping, in this PR). Auto-wrap is a future improvement and explicitly
not blocking 2.1d.

The contenteditable overlay is a sibling DOM node, not a canvas-drawn
element. While editing, the canvas-side `TextObject` is hidden (its
`render` is skipped) so the overlay shows alone. On commit, the
overlay's `innerText` is sanitized via the existing
[`utils/security.ts`](../../../utils/security.ts) HTML-escape helper before
writing to `content`. We store plain text (`\n` preserved as a literal),
not HTML — `content` is rendered with `ctx.fillText` line by line.

**Cross-PR constraints.** Selection from 2.1c is a prerequisite — text
boxes need to be moveable/resizable like other objects, and the
double-click-to-edit gesture requires hit-testing infrastructure. 2.4's
command stack will wrap text commit/edit as `UpdateObject` commands.

**AnnotationOverlay parity.** Required. The overlay gets the same text
tool. The contenteditable overlay positions against the full viewport
canvas instead of a widget-bounded canvas, but the editing logic is
identical.

### 2.2 — Image insertion

**Data model.** No new types — `ImageObject` exists at `types.ts:763-771`
with `src`, `assetId?`, `x`, `y`, `w`, `h`.

**UX surface.** Three entry points, in priority order:

1. **Paste from clipboard.** Bind `paste` on the widget root; if the
   clipboard has an `image/*` item, upload it and drop the resulting
   `ImageObject` at the canvas center.
2. **Drag-and-drop.** Bind `dragover` + `drop` on the canvas; the dropped
   file uploads and the `ImageObject` lands at the drop coordinates.
3. **Toolbar upload button.** A new `ImageIcon` button in the toolbar
   Actions cluster opens a hidden `<input type="file" accept="image/*">`.

All three paths go through `hooks/useImageUpload.ts` with
`uploadFn: (file) => useStorage().uploadDisplayImage(user.uid, file)`.
`useImageUpload` already handles background-removal + whitespace-trimming —
which is the right default for whiteboard use (teachers paste reference
images, not photos). A `skipProcessing` setting on the widget's config
(`disableImageProcessing?: boolean`) lets a teacher opt out per widget if
their use case wants the original image.

Upload returns the public URL. The new `ImageObject` initializes with
`w`/`h` clamped to a max of 50% of the current canvas size; original
aspect ratio is read from a `new Image()` decode after the upload completes
(this is fine for the post-load `w`/`h` set; the image is rendered with
the canvas-stored dimensions until then).

`assetId` is set to the storage path returned by `uploadDisplayImage` (the
post-`/o/` path component). 2.6's subcollection cleanup uses this to
delete the storage object when the `ImageObject` is removed.

**Renderer / hook.** The `'image'` branch in the dispatcher uses
`ctx.drawImage`. Image loading is cached — a module-level
`Map<src, HTMLImageElement>` keyed by `src`, with one `Image()` instance per
unique URL. On `onload`, the canvas redraws. While loading, the bbox renders
as a 1px slate placeholder with `min(48px, 12cqmin)` ImageIcon at center.

CORS: `crossOrigin = 'anonymous'` on the `Image()` instance so PNG export
in 2.5 works without taint. Firebase Storage public URLs and the Drive
`lh3.googleusercontent.com/d/{id}` URLs both support anonymous CORS.

**Cross-PR constraints.** Selection + transform (2.1c) is required —
without resize handles, dropped images can't be sized. 2.6's subcollection
migration must preserve the `assetId` → storage-path mapping so cleanup
still works after the move.

**AnnotationOverlay parity.** Required, with caveats. Paste-to-overlay is
the headline gesture (teacher copies an image from a reference doc and
pastes it onto the live annotation). Drag-and-drop onto the overlay also
works (`dragover` on the overlay's portal node). The toolbar upload button
mirrors the widget's. Uploads still use `uploadDisplayImage` — the overlay
doesn't have its own storage namespace.

### 2.3 — Multi-page canvases

**Data model.** This is the biggest schema change in Phase 2.

`DrawingConfig.objects` is replaced by `DrawingConfig.pages: DrawingPage[]`
plus `currentPage: number`. The legacy `objects` is **kept on the type as
deprecated** so older clients reading new data continue to compile, but the
migration moves all live data into `pages`.

```ts
export interface DrawingPage {
  id: string;
  objects: DrawableObject[];
  /** Background template per-page; falls back to widget-level background if unset. */
  background?: DrawingBackground;
}

export interface DrawingConfig {
  // ...existing fields...
  /** @deprecated post-2.3 — migrated into pages[0].objects */
  objects?: DrawableObject[];
  pages?: DrawingPage[]; // optional only for legacy hydration
  currentPage?: number; // default 0
  // background (2.5) lives here at widget level too
}
```

`DrawingBackground` is defined in 2.5; the field is reserved at this PR.

**UX surface.** A page strip lands in the toolbar Actions cluster:
`< 2 / 5 >` stepper plus a Pages icon button that opens a thumbnail
popover. The thumbnail popover renders a small canvas per page (the same
`useDrawingCanvas` rendering at a fixed 120×80 with a downsampled object
list), reorderable by drag, with `+` to add and `×` to delete. Reorder
writes `pages` in the new order; delete removes the page (with a confirm
dialog from `context/DialogContext.tsx` if the page has objects).

Reference implementation: SmartNotebook's page model at
`components/widgets/SmartNotebook/Widget.tsx:33-150` — same `currentPage`
clamp-on-shrink pattern using React's "adjusting state during rendering"
idiom (no `useEffect`).

**Renderer / hook.** `useDrawingCanvas` is unchanged — it still takes
`objects: DrawableObject[]`. The widget passes
`pages[currentPage].objects`. The hook does not know about pages, which is
intentional: it keeps the hook's surface minimal and lets the overlay
(which is single-page) reuse it without changes.

The selection state from 2.1c is cleared on page change. The command stack
from 2.4 is **per-page** — a `Command` references its page index so undo
on page 2 doesn't replay an edit from page 1. (See 2.4 below for the
detail.)

**Cross-PR constraints.** This PR establishes the wrapper that every
later PR's renderer must read through. 2.5's background templates render
per-page (so a teacher can have a grid page and a blank page in the same
widget). 2.6's subcollection structure is page-aware:
`/drawings/{widgetId}/pages/{pageId}/objects/{objectId}`.

**AnnotationOverlay parity.** Not required. The overlay is intentionally
single-page — it represents "things drawn over the current
dashboard view," not a document model. The overlay continues to call
`useDrawingCanvas` with `objects` directly from
`dashboard.annotationOverlay.objects`. This is a deliberate divergence:
the widget is a document, the overlay is an event.

### 2.4 — Undo / redo command stack

**Data model.** No persisted change. The command stack is **in-memory
only**, owned by the widget instance, and cleared on widget remount or
page reload. This is the standard whiteboard behavior (Jamboard, SMART
Notebook, Figma all behave this way) — persisting undo history would
explode storage cost and complicate the conflict semantics on synced
boards.

```ts
type Command =
  | { type: 'add'; pageId: string; object: DrawableObject }
  | { type: 'remove'; pageId: string; object: DrawableObject }
  | {
      type: 'update';
      pageId: string;
      objectId: string;
      before: Partial<DrawableObject>;
      after: Partial<DrawableObject>;
    }
  | {
      type: 'reorder';
      pageId: string;
      objectId: string;
      beforeZ: number;
      afterZ: number;
    };

interface UndoStackState {
  past: Command[];
  future: Command[];
}
```

Page id is included so undo replays against the right page even after the
teacher navigates away and back. Reorder commands cover the click-to-bring-
to-front gesture in 2.1c.

**UX surface.** The existing Undo button in the toolbar Actions cluster is
re-wired to the command stack. A new Redo button (lucide `Redo2`) sits
next to it. `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` (and `Ctrl/Cmd+Y` for
Windows muscle memory) bind on widget focus.

The Clear All action is treated as a single "bulk remove" command —
one undo restores everything. This is the user-visible regression from
today's behavior where Clear All is irreversible; teachers asked for this
specifically.

**Renderer / hook.** No render changes — commands replay through the
existing `updateWidget` path (a `Command` apply just produces the next
`objects` array and writes it).

**Cross-PR constraints.** This is the PR where 2.1b's append-only writes,
2.1c's transforms, 2.1d's text commits, and 2.2's image inserts all get
wrapped. The single-level `objects.slice(0, -1)` at
`components/widgets/DrawingWidget/Widget.tsx:73-77` is fully replaced —
the legacy code path is removed. Tests that assert "undo pops the last
object" continue to pass because that's still the observable behavior
when only one command exists; new tests cover redo and multi-step.

**AnnotationOverlay parity.** Limited. The overlay already has per-author
undo at `context/DashboardContext.tsx:4980-5009` that scans
`annotationOverlay.objects` for the last `authorUid === user.uid` entry.
That logic is correct for the synced-share case (don't clobber other
teachers' strokes) and the command stack from this PR is not a good fit
for it. **Decision:** the overlay keeps its existing per-author undo; the
widget gets the new command stack. The Undo / Redo buttons in the overlay
toolbar continue to call `undoAnnotation` from the dashboard context.

### 2.5 — Export + background templates

**Data model.** A new `DrawingBackground` type plus a widget-level
default:

```ts
export type DrawingBackground = 'blank' | 'grid' | 'lines' | 'dots';

export interface DrawingConfig {
  // ...existing fields...
  background?: DrawingBackground; // default 'blank'
}
```

Per-page override lives in `DrawingPage.background?` (reserved in 2.3,
consumed here).

**UX surface.** A new Background icon button (lucide `LayoutGrid`) in the
back-face settings panel opens a row of four template thumbnails. Picking
one writes `config.background`. Per-page override is reachable from the
page thumbnail popover (2.3) — right-click / long-press on a page
thumbnail opens "Background for this page only."

Export lives in a new Export menu in the toolbar Actions cluster (Download
icon, opens a small popover):

- **PNG (current page)** — `canvas.toDataURL('image/png')` on the active
  canvas (background-composited; see below). Saves as
  `Whiteboard-{date}-page-{n}.png`.
- **PDF (all pages)** — opens the browser print dialog scoped to a hidden
  print-only DOM that renders each page as a full-page `<img>` (one per
  page, via per-page `toDataURL`). Teachers print to PDF using the OS
  printer dialog. No new dependency.
- **JSON export** — already exists at the dashboard level via Sidebar;
  per-widget JSON export is not added.

**Renderer / hook.** Background templates are rendered as a **CSS
background layer** on a sibling div under the canvas in the widget body:

```html
<div class="widget-body">
  <div class="background-layer" data-template="{background}" />
  <canvas ... />
</div>
```

`data-template="grid"` triggers a Tailwind-defined repeating background
(e.g. `background-image: linear-gradient(to right, ...)` patterns). This
keeps the canvas pixel data clean and avoids dirtying the export path
during normal drawing.

For PNG export, the background is **painted to the canvas** as a
pre-render step into a transient offscreen canvas:

```ts
const exportCanvas = document.createElement('canvas');
exportCanvas.width = canvas.width;
exportCanvas.height = canvas.height;
const ectx = exportCanvas.getContext('2d');
paintBackgroundToCanvas(ectx, background, canvas.width, canvas.height);
ectx.drawImage(canvas, 0, 0);
return exportCanvas.toDataURL('image/png');
```

This way the rendered widget keeps the CSS-background performance win
(no canvas clearing on background change, no redraw cost) and exports
still produce visually-correct files.

**Cross-PR constraints.** 2.3's `DrawingPage.background` field is
populated by this PR; the type lands here. 2.6's subcollection storage
includes the per-page background.

**AnnotationOverlay parity.** Not required. The overlay has no background
(it's transparent over the dashboard) and no export — the export buttons
in `components/layout/AnnotationOverlay.tsx:362-398` already use the
full-dashboard screenshot via `html-to-image`'s `toPng`, which is the
correct primitive for that surface.

### 2.6 — Firestore subcollection + incremental render

**Data model.** Pages and their object lists move off the dashboard doc
into a subcollection structure:

```
/users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}
  - id: string
  - background?: DrawingBackground
  - order: number               (for stable page ordering)
  - updatedAt: number

/users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}/objects/{objectId}
  - <full DrawableObject>
  - updatedAt: number
```

The dashboard doc's `WidgetData.config` for a drawing widget keeps:

- `currentPage`, `color`, `width`, `customColors`, `activeTool`,
  `shapeFill`, `defaultTextFontFamily`, `defaultTextFontSize`,
  `background`, `disableImageProcessing` — i.e. all the "settings" fields
- **A denormalized `pages: DrawingPage[]` cache for one release window**
  (see "Open questions / risks" — this is the backward-compat lever).

**UX surface.** No user-visible change. Loading states get a brief skeleton
on first page open (subcollection fetch can be ~200ms slower than reading
the inlined doc), reusing the placeholder pattern from 2.2's image loading.

**Renderer / hook.** Two changes:

1. **Subcollection subscription.** A new `useDrawingSubcollection(widgetId,
currentPageId)` hook owns the `onSnapshot` listeners — one for the
   pages collection (keyed by widget id), one for the active page's
   objects collection (re-subscribed when `currentPageId` changes). LRU
   pattern: keep the last 2 page-object subscriptions alive on page
   switches so back/forward is instant. The hook returns
   `{ pages, currentPageObjects, isLoading }` and exposes write helpers
   (`addObject`, `updateObject`, `removeObject`, `addPage`, `removePage`,
   `reorderPages`) that map to Firestore mutations and to the same local
   command stack as 2.4.
2. **Incremental render.** `useDrawingCanvas` gains an
   `onIncrementalChange?: { added?: DrawableObject[]; updated?:
{ id: string; before: DrawableObject; after: DrawableObject }[];
removed?: DrawableObject[] }` prop. When set, the next draw call
   computes the union bounding box of all changed objects' bboxes (before
   AND after, for moved/resized objects), calls `clearRect` on just that
   region, and replays the object list intersected with that region. Falls
   back to full redraw if the changed area exceeds 70% of the canvas.

**Cross-PR constraints.** Every prior PR's mutation must route through the
subcollection write helpers, not direct `updateWidget` writes to a
`config.pages` field. The `Command` definitions from 2.4 are the bridge —
each command's `apply` calls one of the subcollection writes.

The `live-share` mirror at
`context/DashboardContext.tsx:2855-2856` keeps reading
`annotationOverlay` from the dashboard doc (per "Live-share interaction"
below). Synced-board host writes still go through the dashboard doc for
overlay strokes; widget pages do not appear in the mirror.

**AnnotationOverlay parity.** Not required. The overlay continues to use
the inlined `annotationOverlay` on the dashboard doc and does not migrate
to a subcollection. See "Live-share interaction" for the rationale.

## Architecture invariants (must hold across all PRs)

These invariants govern every PR in Phase 2. A diff that violates one of
them is a red flag in review, regardless of which PR it belongs to.

**1. `useDrawingCanvas` is the single render + pointer pipeline.** Every
new object kind dispatches through the existing `renderObject` switch at
`components/widgets/DrawingWidget/useDrawingCanvas.ts:178-194`. No PR
introduces a parallel canvas, an SVG layer, or a sibling Konva/Fabric
component. The hook may grow new options (`activeTool`, `selection`,
`onTransform`, `onIncrementalChange`) but the contract — "take a list of
objects, paint them, capture pointer interaction" — stays.

**2. All persisted state is serializable JSON.** No functions, no class
instances, no DOM references, no `Map`/`Set` in `DrawingConfig` or
`DrawableObject`. This is what keeps the live-share mirror at
`context/DashboardContext.tsx:2855-2856` working without per-PR shape
changes — the mirror does a structured clone, and any non-cloneable field
will silently drop. This applies to `DrawingPage.background` (string
union), `Command` types (data-only), and every new field in
`DrawingConfig`.

**3. Eraser is a tool, not a color string, post-2.1b.** The string
`'eraser'` only appears in two places after 2.1b: in the legacy hydration
branch of `utils/migrateDrawingConfig.ts` (which rewrites it to
`activeTool: 'eraser'`), and in the legacy comparison at
`components/widgets/DrawingWidget/useDrawingCanvas.ts:53-59` (which is
removed when the hook switches to the new `activeTool` option). No new
code reads `color === 'eraser'`. The `PathObject.color === 'eraser'`
legacy data path is also forward-migrated in
`utils/migrateDrawingConfig.ts` to a sentinel that the renderer
recognizes — to be specified during 2.1b implementation, but the
recommended approach is a new optional `PathObject.erase?: boolean` field
populated by migration.

**4. Migrations in `utils/migrateDrawingConfig.ts` are pure, forward-only,
and idempotent.** Each PR adds one or more transform steps; no PR
removes or modifies a prior step. Each transform is wrapped in a guard
(`if missing field, set default`) so calling the migration on already-
migrated data is a no-op. This is enforced by extending
`tests/utils/migrateDrawingConfig.test.ts` with an "idempotent" assertion
per new field.

**5. Every config field change is reflected in the migration tests.** When
2.1b adds `activeTool` and `shapeFill`, three new migration tests land.
When 2.3 adds `pages` and `currentPage`, four new tests land (legacy
`objects` wrapped into `pages[0]`, missing `currentPage` defaults to 0,
empty `pages[]` initializes to `[{ id, objects: [] }]`, malformed page
entries are dropped). When 2.5 adds `background`, one test lands. The
migration test file is the canonical record of the schema's evolution.

**6. The widget's empty/loading/error states use
`components/common/ScaledEmptyState.tsx`.** The current
"Pencil icon at center" empty state at
`components/widgets/DrawingWidget/Widget.tsx:224-228` is replaced with
the shared component in 2.1b or earlier. No PR introduces a one-off empty
state.

**7. Container-query scaling for all front-face UI added by Phase 2.** New
toolbar buttons, the page strip in 2.3, the page thumbnails, the export
menu — all use `cqmin` units per the conventions in `CLAUDE.md`. Settings
panels can use normal Tailwind classes.

**8. `AnnotationOverlay` parity is checked per PR.** The PR checklist
explicitly asks whether the change applies to the overlay. The default is
"yes." The exceptions are documented per-PR above (multi-page, export,
subcollection).

## Migration story (cross-PR)

A pre-Phase-2 saved widget passes through forward transforms in this order
as it loads under each new schema:

**Starting shape (pre-Phase-2a):**

```json
{
  "type": "drawing",
  "config": {
    "color": "eraser",
    "width": 4,
    "paths": [{ "color": "#f00", "width": 3, "points": [...] }],
    "customColors": ["#000", ...]
  }
}
```

**After 2.1a (already shipped) — paths wrapped into objects:**

The current `migrateDrawingConfig` at
`utils/migrateDrawingConfig.ts:29-65` reads `paths` and produces
`PathObject[]` with fresh UUIDs and sequential `z`. Legacy fields (`paths`,
`mode`) are stripped. After 2.1a:

```json
{
  "config": {
    "color": "eraser",
    "width": 4,
    "objects": [{ "id": "...", "kind": "path", "z": 0, "color": "#f00", "width": 3, "points": [...] }],
    "customColors": [...]
  }
}
```

**After 2.1b — eraser overload removed, activeTool defaulted:**

A new migration step recognizes `color === 'eraser'` and rewrites:
`{ activeTool: 'eraser', color: <last non-eraser color or palette default> }`.
For widgets where the user happened to have a real color saved, `activeTool`
just defaults to `'pen'`. `shapeFill` defaults to `false`. Legacy
`PathObject` entries with `color === 'eraser'` get an `erase: true` marker
(see invariant #3).

**After 2.1c — no schema change** (selection is transient).

**After 2.1d — text defaults populated:**

`defaultTextFontFamily` defaults to `'Lexend'`, `defaultTextFontSize`
defaults to `24` if missing. Existing `TextObject`s — there are none in
the wild yet — would be valid as-is.

**After 2.2 — no schema change** (`ImageObject` already in `types.ts`).

**After 2.3 — wrapped into pages:**

The legacy `objects` field is moved into `pages[0].objects`, with a fresh
page id. `currentPage` defaults to 0. After:

```json
{
  "config": {
    "color": "#000",
    "width": 4,
    "activeTool": "pen",
    "shapeFill": false,
    "customColors": [...],
    "pages": [{ "id": "...", "objects": [...] }],
    "currentPage": 0,
    "objects": [...]   // kept for one release window per invariant #4 / open Q below
  }
}
```

**After 2.4 — no schema change** (commands are in-memory).

**After 2.5 — background defaulted:**

`background` defaults to `'blank'`. Per-page `background` is undefined
unless explicitly set.

**After 2.6 — subcollection-resident:**

The migration runs **once per widget**, when the user opens a board
containing a drawing widget after the 2.6 deploy. It (1) copies every
`pages[].objects[]` into the subcollection at
`/drawings/{widgetId}/pages/{pageId}/objects/{objectId}`, (2) writes the
page metadata to `/drawings/{widgetId}/pages/{pageId}`, and (3) keeps the
inline `pages` cache on `config.pages` for the backward-compat window. A
`config.subcollectionMigrated: true` flag prevents re-migration. A release
window later (1 release per "Open questions / risks"), the inline `pages`
field is dropped from new writes.

Every step is idempotent and pure. Re-loading an already-migrated widget
walks every step but produces an unchanged config (each `if (missing)
set(default)` guard short-circuits).

## Live-share interaction

This is the most subtle part of Phase 2 because two systems share the same
render hook with different sync semantics.

**The DrawingWidget is single-author.** Its content lives at
`WidgetData.config` and rides whatever sync the host dashboard uses (Drive
sync, no sync, copy-mode share, etc.). 2.6 moves the content into a
subcollection under the host's `/users/{uid}/dashboards/{id}/drawings/`.
**No co-edit semantics.** A shared-by-copy dashboard receives a snapshot;
a shared-synced dashboard sees the host's widget updates one-way (the
host writes, the viewer reads).

**The AnnotationOverlay is multi-author within a synced board.** Its state
lives at `dashboard.annotationOverlay.objects` (`types.ts:5185-5188`) on
the dashboard doc itself, and the live-share mirror at
`context/DashboardContext.tsx:2855-2856` propagates it bidirectionally to
all participants in a synced share. Per-author undo at
`context/DashboardContext.tsx:4980-5009` exists specifically to keep one
teacher's undo from clobbering another's strokes.

**What Phase 2 does NOT do:** move the overlay's storage to a
subcollection. The overlay is intentionally a single, small, denormalized
field on the dashboard doc because the mirror code path depends on it.
Moving it to a subcollection would require redesigning the mirror, the
per-author undo, and the "remote strokes visible to viewers without
opening the toolbar" path at
`components/layout/AnnotationOverlay.tsx:78-79`. That redesign is
explicitly out of scope.

**What Phase 2 DOES do:** every renderer/tool/UX improvement that lands in
the widget also lands in the overlay (with the per-PR exceptions noted
above — multi-page and export and subcollection don't apply). Both
consumers continue to share `useDrawingCanvas`. The overlay continues to
read from `dashboard.annotationOverlay.objects` and write through the
existing `addAnnotationObject` / `undoAnnotation` / `clearAnnotation`
helpers in `DashboardContext`.

**Selection in the overlay during live-share:** local-only. The host's
selection rectangle and resize handles do **not** appear on viewer
screens. The reason is two-fold: (1) selection is a per-user UI affordance,
not content (showing every host's selection on every viewer would clutter
the canvas and confuse viewers about what they "should" be paying
attention to), and (2) selection mutations (move/resize/delete) write back
through `addAnnotationObject` and the existing helpers and **do**
propagate. So viewers see strokes appear, move, and disappear in real
time, but they don't see the host's selection chrome. **Decision: no.**

**Text editing in the overlay during live-share:** the contenteditable
overlay is local-only — only the editing teacher sees it. On commit, the
final text propagates through the standard add/update flow. If two
teachers happen to be editing the same `TextObject` simultaneously
(extreme edge case — requires both to have hit the same already-existing
text object and started editing), last-write-wins on commit. We do not
implement OT / CRDT for this case. **Decision: last-write-wins.**

## Open questions / risks

These were flagged during spec writing; the decisions are pre-recorded so
implementers don't relitigate them per PR.

**1. PDF export library.** No `jspdf` (or any PDF lib) is in
`package.json` today. **Decision:** use the browser print dialog scoped to
a hidden print-only DOM that renders each page as a full-page `<img>`. No
new dependency; users print to PDF using their OS printer. Tradeoff: the
dialog is slightly less polished than an in-app "Save as PDF" button, but
the dependency cost (jspdf is ~250KB minified) is not worth it for an
export feature most teachers will use once a week. Browser print-to-PDF
support is universal on the supported browsers (Chrome 90+, Edge 90+,
Firefox 88+, Safari 14+, per `CLAUDE.md`).

**2. Background templates as CSS layer vs canvas pixels.** **Decision:**
CSS layer for in-app rendering (no canvas clearing, no redraw cost when
the user toggles backgrounds, and no pixel data in undo history), paint to
canvas only during PNG export. PNG export uses a transient offscreen
canvas as documented in 2.5. PDF export piggybacks on PNG (each page is
exported as PNG and embedded in the print DOM as `<img>`), so the same
background-paint logic applies.

**3. Subcollection migration backward-compat.** Once 2.6 ships, old
clients (teachers on stale browser tabs or in offline mode) will read the
dashboard doc and see no `pages` field if we drop the inline cache
immediately — they'll render an empty widget and might destructively
overwrite the subcollection on their next save. **Decision:** keep the
inline `pages[]` mirrored on the widget doc as a denormalized cache for
**one release window** (one production deploy cycle, ~2 weeks). During
that window, every write to the subcollection also writes the page list
back to `config.pages`. After the window, a follow-up PR drops the inline
cache and the migration grows a "subcollection-resident" assertion that
treats a missing subcollection as a re-migration trigger.

**4. Selection state propagation in live-share.** Decision pre-recorded in
"Live-share interaction": local-only. The host's selection does not appear
on viewer screens. Selection-driven mutations (move/resize/delete) do
propagate as object updates.

**5. Text editing race during live-share.** Decision pre-recorded in
"Live-share interaction": last-write-wins on commit. The editing teacher
sees the contenteditable overlay only locally; other participants see the
final text after commit.

**6. Per-author command stack vs single stack in the widget.** Unlike the
overlay (which has per-author undo by design), the widget is
single-author so a single stack is correct. If a future PR adds widget-
level co-edit, this assumption is revisited.

**7. Image storage cleanup on object delete.** When an `ImageObject` is
deleted, the storage file at `uploadDisplayImage`'s path is **not**
immediately deleted — it's left for a scheduled storage cleanup job
(future Phase). Reason: undo must be able to restore the image, and the
command stack only lives for the session. Deleting on undo-stack-eviction
would require persistent commands, which is out of scope. Storage cost
for orphaned images is acceptable in the short term. Flagged for a
follow-up cleanup function.

## Success criteria

Phase 2 is complete when:

- A teacher can open a DrawingWidget and use pen, eraser, line, arrow,
  rectangle, ellipse, text, and image tools without leaving the widget.
- A teacher can select any object placed on the canvas, move it, resize
  it, rotate it, and delete it.
- A teacher can undo and redo any action with `Ctrl/Cmd+Z` /
  `Ctrl/Cmd+Shift+Z` or the toolbar buttons, including bulk operations
  like Clear All.
- A teacher can switch between multiple pages in a single DrawingWidget,
  add and remove pages, and reorder them.
- A teacher can choose a background template (blank, grid, lines, dots)
  per widget or per page.
- A teacher can export the current page as a PNG, and all pages as a PDF
  via the browser print dialog.
- A teacher's existing pre-Phase-2 DrawingWidgets continue to load and
  render correctly with no manual intervention.
- The `AnnotationOverlay` gains the new tools (shapes, select, text,
  image) and uses the same renderer, with documented exceptions for
  multi-page, export, and subcollection.
- Performance: a single widget with 500+ objects across all pages
  remains responsive (sub-100ms render on the active page) on a 2020-era
  Chromebook.
- Test gate: `pnpm run validate` passes at every PR. Migration tests cover
  every schema transition. The `useDrawingCanvas` and `Widget` test files
  grow proportional to the new tool coverage.

Each PR ticks off one or more of the above. 2.1b ticks "draw shapes" and
"AnnotationOverlay parity for shapes." 2.6 closes the performance bullet.
2.5 closes export. 2.4 closes undo/redo. 2.3 closes multi-page. 2.2 closes
images. 2.1d closes text. 2.1c closes select / move / resize / delete.
