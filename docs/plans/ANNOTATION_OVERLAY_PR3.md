# Annotation overlay — PR 3: cursor pass-through, exact-ink hit testing, and redraw perf

Third and final PR of the annotation-overlay upgrade. PR 1 (#2817) fixed text loss and made
text boxes auto-grow; PR 2 (#2820) made ink persist per board, follow board zoom, keep the Dock,
and confirm trash. This document is the contract for PR 3. Every item is self-contained: an
implementer should be able to build it from the item text plus the code, without the original
conversation. Cut the branch from `dev-paul` and target `dev-paul`.

Out of scope: converting annotations into widgets (rejected), multi-select or grouping of ink,
a subcollection migration for the overlay (the size guard covers it for now), pagination
(deliberately unsupported, see the header comment in `components/layout/AnnotationOverlay.tsx`).

## Why

A teacher takes notes across widgets and still needs to run the timer, flip a card, or check
a list. Today every tool, including the cursor, is a full-viewport canvas that swallows
clicks, so annotating and using the board are mutually exclusive. PR 3 makes the cursor tool
pass clicks through to widgets while ink stays selectable on its actual marks.

## Product decisions (settled — do not re-litigate)

| Decision         | Answer                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor mode      | With the toolbar open and the **select** tool active, clicks that miss ink reach the board exactly as if the overlay were closed: drag widgets, press buttons, type in inputs, use the Dock and Sidebar. |
| Drawing modes    | Pen, eraser, shapes, and text keep capturing the whole screen. Nothing passes through while a drawing tool is armed.                                                                                     |
| Click priority   | Ink wins only on its **exact stroke, shape outline/fill, text glyph box, or image box**. A click inside an object's bounding box but off the mark goes to the widget beneath.                            |
| After Exit       | Unchanged from PR 2: ink is inert and click-through whenever the toolbar is closed.                                                                                                                      |
| Selection chrome | Once an object is selected, its handles and bounding box are hit targets (existing `useSelection` behavior), so resize/rotate keeps working even where the handle sits over a widget.                    |
| Deselect         | A cursor click that hits neither ink nor a handle clears the selection and then passes through to the board.                                                                                             |
| Keyboard         | Delete/Backspace/arrow nudges only apply while an ink object is selected and focus is not in a widget input (`isEscapeFromWidgetInput`-style guard already exists for Escape).                           |

## Items

### 1. Pass-through pointer routing in cursor mode

- In `components/layout/AnnotationOverlay.tsx`, when `interactive && activeTool === 'select'`,
  the canvas must not be `pointer-events-auto`. Set it to `pointer-events-none` and instead
  listen for `pointerdown` at the document level (capture phase) while cursor mode is active.
- On capture: convert the client point to canvas coordinates using the existing
  `getBoundingClientRect`-ratio math, run the exact hit test (item 2) against objects sorted
  by `z` descending, and also test the current selection's handles via `hitTestHandle`.
- If ink or a handle is hit: `preventDefault`, `stopPropagation`, and route the event into the
  existing `handleSelectPointerDown` / move / up flow. Subsequent moves and the up must be
  tracked at the document level for that gesture (use `setPointerCapture` on the canvas or a
  document listener pair) so a drag that crosses a widget does not hand the pointer to it.
- If nothing is hit: clear selection if any, and do nothing else so the event continues to
  the widget or board beneath.
- Double-click to re-edit text (`handleCanvasDoubleClick`) must use the same routing: only a
  double-click on the text's glyph box opens the editor; elsewhere it passes through.
- The `data-inking-surface` gesture guards in `components/layout/DashboardView.tsx` currently
  key on `annotationActive`. Narrow them so board swipe/double-tap suppression applies only
  while a drawing tool is armed, not in cursor mode.

### 2. Exact-ink hit testing

- `components/widgets/DrawingWidget/hitTest.ts` already has per-kind tests. Audit each so a
  hit means the mark itself, with a tolerance of `max(strokeWidth, 6)` canvas px:
  - `path`: distance from the point to any segment within tolerance (no bbox fallback).
  - `line` / `arrow`: segment distance within tolerance; arrowheads count.
  - `rect` / `ellipse`: outline within tolerance, or interior only when `fill` is set.
  - `text`: inside the laid-out glyph box. Use `layoutTextLines` and `measureTextObject`
    from `renderers/text.ts` so the box matches wrapped content, not the placeholder `w`/`h`.
  - `image`: inside the image box.
  - Rotation: reverse-rotate the point around the bbox center first (helpers exist).
- Export one function `hitTestInk(obj, point): boolean` that the overlay and DrawingWidget
  both use, and keep `hitTestObject` (bbox-based) for the DrawingWidget if it still wants the
  looser behavior inside its own canvas. Do not change DrawingWidget behavior in this PR.
- Unit tests in `tests/components/widgets/DrawingWidget/hitTest.test.ts` for each kind,
  including the "inside bbox but off the mark" miss case and a rotated text hit.

### 3. Dock and Sidebar during cursor mode

- PR 2 lifts the Dock and Sidebar above the canvas with `Z_INDEX.confirmOverlay` while
  annotation is active. With the canvas at `pointer-events-none` in cursor mode, the lift is
  still needed for drawing modes. Keep it; add a test in `tests/components/layout/Dock*.test.tsx`
  that the lift applies while annotating and not otherwise.
- The Dock's pointer-event drop while a non-cursor tool is armed (added in PR 2) must not apply
  in cursor mode.

### 4. In-progress stroke redraw perf (open thread from PR 2)

- The world-rect canvas is up to 4x the viewport's pixel area at `ZOOM_MIN`, and
  `useDrawingCanvas` does a full clear + redraw on every in-progress pointer move.
- Add an append-only fast path in `components/widgets/DrawingWidget/useDrawingCanvas.ts`: when
  the in-progress object is a `path` (pen or eraser), nothing else is dirty, and there is no
  preview or selection, stroke only the segments added since the last frame onto the existing
  bitmap without clearing. Shapes, text, and the select preview keep the full redraw.
- The eraser must keep its composite mode on the appended segment.
- Add a benchmark in `tests/perf/` (see `vitest.perf.config.ts`) that draws a 500-point stroke
  on a 2x viewport canvas and asserts the fast path issues no `clearRect` after the first frame.
- Resolve the open review thread on #2820 when this lands.

### 5. Tests and validation

- `tests/components/layout/AnnotationOverlay.test.tsx`: cursor click on a widget beneath the
  canvas reaches the widget; cursor click on a stroke selects it and does not reach the widget;
  a click inside a text object's bbox but outside its glyph box passes through; pen mode still
  captures.
- Run `pnpm run validate` before pushing. Follow the one-line comment rule in `CLAUDE.md`.

## Files

- `components/layout/AnnotationOverlay.tsx` (routing, document-level capture)
- `components/layout/DashboardView.tsx` (gesture guard narrowing)
- `components/layout/Dock.tsx` (cursor-mode exception)
- `components/widgets/DrawingWidget/hitTest.ts`, `renderers/text.ts` (exact hit test)
- `components/widgets/DrawingWidget/useDrawingCanvas.ts` (append-only in-progress path)
- `components/widgets/DrawingWidget/useSelection.ts` (accept externally routed pointer events)
- Tests listed above.
