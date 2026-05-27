# Whiteboard Phase 2 — Implementation Plan

> **For agentic workers:** This plan is implemented one WAVE at a time. Each task is a checkbox; complete sequentially within a wave. Each wave maps to a Phase 2 PR (2.1b → 2.6). Validate (`pnpm run validate`) at the end of each wave before moving on. Commit at the end of each wave.

**Goal:** Take the DrawingWidget from "pen + eraser + path objects" to a classroom-grade whiteboard: shapes, text, images, selection/transform, multi-page, undo/redo, export, and Firestore-subcollection storage — without regressing freehand drawing or the live annotation overlay. By the end of Wave 8 a teacher can open a DrawingWidget and do every core whiteboard action without leaving the tool: draw strokes and shapes, add and edit text, paste/drag images, move/resize/delete anything they placed, undo/redo freely, flip between multiple pages, export to PNG/PDF, and have it all stay responsive at classroom-scale object counts (500+).

**Spec:** `docs/superpowers/specs/2026-05-24-whiteboard-phase-2-design.md`
**Roadmap:** `docs/drawing-widget-phase-2.md`

**Tech Stack:** React 19 + TypeScript + Vite (flat structure, `@/` = repo root), Tailwind, Firestore, Vitest + Testing Library, lucide-react. Package manager: **pnpm**. Validate with `pnpm run validate` (type-check + lint with `--max-warnings 0` + format:check + tests). Pre-push gate is zero warnings.

---

## Wave ordering rationale

The doc's table lists 2.1b → 2.1c → 2.1d → 2.2 → 2.3 → 2.4 → 2.5 → 2.6. We deviate on three pairs:

- **2.1d (text) and 2.2 (image) come BEFORE 2.1c (selection)** because selection needs every object kind to exist before its hit-test matrix is meaningful. Building selection on `path+shape` only and then bolting on text/image hit-tests later doubles the work and risks per-kind regressions. Lay all object kinds down first, then write a single hit-test pass.
- **2.4 (undo/redo) comes AFTER 2.1c (selection)** because the command stack must record `UpdateObject` commands produced by selection-era transforms (move/resize/rotate). Building the stack before transforms exist gives us only `AddObject` to test against and forces a second pass when transforms land.
- **2.3 (multi-page) comes LATE** because wrapping `objects[]` in `pages[][]` forces every renderer, hook, migration, and event handler that touched objects in Waves 1–5 to be revisited. Doing it once, after the object pipeline is otherwise stable, avoids re-doing all of that work mid-flight.
- **2.5 (export) is independent** of the others — slotted right after 2.3 because the export must operate on the current page and the page model has to exist first.
- **2.6 (Firestore subcollection) is LAST** because it's the highest-risk change: it pulls widget content out of the dashboard doc, changes the read/write path, and adds new security rules. Worth doing exactly once, on a model that won't shift underneath it.

Final wave order: **2.1b → 2.1d → 2.2 → 2.1c → 2.4 → 2.3 → 2.5 → 2.6.**

---

## File Structure

**New files (across all waves):**

```
components/widgets/DrawingWidget/renderers/shapes.ts          Wave 1 — pure render helpers (rect/ellipse/line/arrow)
components/widgets/DrawingWidget/TextEditorOverlay.tsx        Wave 2 — contenteditable layer for TextObject
components/widgets/DrawingWidget/useImageInsertion.ts         Wave 3 — paste/drop/upload pipeline → ImageObject
components/widgets/DrawingWidget/useSelection.ts              Wave 4 — selection + transform state + hit-test
components/widgets/DrawingWidget/SelectionOverlay.tsx         Wave 4 — handles + marquee chrome
components/widgets/DrawingWidget/hitTest.ts                   Wave 4 — pure hit-test functions per object kind
components/widgets/DrawingWidget/useCommandStack.ts           Wave 5 — undo/redo command stack hook
components/widgets/DrawingWidget/commands.ts                  Wave 5 — Command discriminated union + apply()
components/widgets/DrawingWidget/PageStrip.tsx                Wave 6 — page stepper + thumbnail strip
components/widgets/DrawingWidget/useDrawingPages.ts           Wave 6 — pages[] helpers (insert/delete/move/clamp)
components/widgets/DrawingWidget/exportCanvas.ts              Wave 7 — PNG/PDF export
components/widgets/DrawingWidget/backgroundTemplates.ts       Wave 7 — CSS background generators
components/widgets/DrawingWidget/useDrawingObjectsDoc.ts      Wave 8 — Firestore subcollection hook
tests/components/widgets/DrawingWidget/renderers/shapes.test.ts
tests/components/widgets/DrawingWidget/TextEditorOverlay.test.tsx
tests/components/widgets/DrawingWidget/useImageInsertion.test.ts
tests/components/widgets/DrawingWidget/useSelection.test.ts
tests/components/widgets/DrawingWidget/hitTest.test.ts
tests/components/widgets/DrawingWidget/useCommandStack.test.ts
tests/components/widgets/DrawingWidget/useDrawingPages.test.ts
tests/components/widgets/DrawingWidget/exportCanvas.test.ts
tests/components/widgets/DrawingWidget/useDrawingObjectsDoc.test.ts
tests/rules/drawingObjectsSubcollection.test.ts
```

**Modified files (across all waves):**

```
types.ts                                                       Wave 1 (ShapeTool, DrawingConfig.activeTool/shapeFill);
                                                               Wave 6 (DrawingConfig.pages/currentPage);
                                                               Wave 7 (DrawingConfig.background);
                                                               Wave 8 (DrawingObjectsDoc subcollection shape)
utils/migrateDrawingConfig.ts                                  Wave 1, 6, 7, 8 (one forward-migration rule per change)
tests/utils/migrateDrawingConfig.test.ts                       parallel to above
components/widgets/DrawingWidget/constants.ts                  Wave 1 (ACTIVE_TOOL); Wave 7 (BACKGROUND);
                                                               Wave 2 (TEXT_FONT_FAMILY, TEXT_FONT_SIZE_PX)
components/widgets/DrawingWidget/useDrawingCanvas.ts           Waves 1–6 (every new render/capture branch)
components/widgets/DrawingWidget/useDrawingCanvas.test.ts      parallel to above
components/widgets/DrawingWidget/Widget.tsx                    Every wave (toolbar, overlays, page strip, export, hot wiring)
components/widgets/DrawingWidget/Widget.test.tsx               parallel
components/widgets/DrawingWidget/Settings.tsx                  Wave 1 (shapeFill); Wave 7 (background picker)
components/layout/AnnotationOverlay.tsx                        Waves 1–5 (parity with widget toolbar / selection)
context/DashboardContext.tsx                                   Wave 6 (page-aware annotation), Wave 8 (subcollection hydration)
firestore.rules                                                Wave 8 (/users/{uid}/dashboards/{id}/drawings/{wid}/objects/{oid})
```

> **Reuse (verbatim contracts gathered from the codebase) — referenced across every wave:**
>
> - `crypto.randomUUID()` for new object ids (matches `migrateDrawingConfig.ts:46`, `useDrawingCanvas.ts:43`).
> - `nextZ(objects)` from `utils/migrateDrawingConfig.ts:89` for next z-index (don't recompute max).
> - `migrateDrawingConfig(raw)` from `utils/migrateDrawingConfig.ts:29` — extend the forward migration here for every new field rather than adding ad-hoc defaults in components.
> - `Button` primitive at `components/common/Button.tsx` — use `variant="ghost"`/`"ghost-danger"`/`"secondary"` and `size="icon"`/`"sm"` to match the existing palette toolbar (`Widget.tsx:170-205`).
> - `STANDARD_COLORS` + `WIDGET_PALETTE` from `config/colors.ts` — `DRAWING_DEFAULTS.CUSTOM_COLORS` already uses `WIDGET_PALETTE.slice(0, 5)`.
> - `SettingsLabel` from `components/common/SettingsLabel.tsx` — required wrapper for every Settings field (see `Settings.tsx:30/51`).
> - `TypographySettings` from `components/common/TypographySettings.tsx` — drives font family + text color for text objects (Wave 2).
> - `SurfaceColorSettings` from `components/common/SurfaceColorSettings.tsx` — drives the optional shape-fill color picker in Settings (Wave 1).
> - `Z_INDEX` from `config/zIndex.ts` — use `Z_INDEX.overlay` for any portal layer (matches `AnnotationOverlay.tsx:266`).
> - `useImageUpload` from `hooks/useImageUpload.ts` and `uploadDisplayImage` from `hooks/useStorage.ts:83` — image insertion pipeline (Wave 3).
> - `extractTextWithGemini` from `utils/ai.ts` — already used at `Widget.tsx:87` for OCR; do not rebuild.
> - Sanitization helpers in `utils/security.ts` — required on any user-typed `TextObject.content` before write (Wave 2).
> - `useDashboard().updateWidget(id, { config })` for persistence — automatically syncs to Firestore (`Widget.tsx:48`).
> - `useDashboard().annotationState`/`addAnnotationObject`/`undoAnnotation`/`clearAnnotation` from `context/DashboardContext.tsx:4951-5013` — the AnnotationOverlay's shared API; extend in lockstep with widget changes.
> - SmartNotebook's `insertBlankPage`/`deletePage`/`movePage`/`clampPageIndex` pattern at `components/widgets/SmartNotebook/Widget.tsx:35-42` — mirror the API shape in `useDrawingPages.ts` (Wave 6).
> - Existing test scaffolding in `components/widgets/DrawingWidget/useDrawingCanvas.test.ts:21-77` (mock canvas + ctx + getBoundingClientRect) — reuse the `makeMockCtx`/`makeCanvas` helpers in every new hook test.

---

## WAVE 1 — PR 2.1b: Shape primitives + tool palette

**Goal:** Add rect/ellipse/line/arrow as first-class `DrawableObject`s with a unified tool palette. Replace the `color === 'eraser'` overload with an explicit `activeTool` field. AnnotationOverlay gains the same tool cluster.

### Task 1.1: Extend types

**Files:** Modify `types.ts`

- [ ] **Step 1:** Open `types.ts`. Above `export interface DrawingConfig` (~line 1010), add the `ShapeTool` union. This is the only new type — the seven `DrawableObject` variants already exist (`types.ts:702-780`).

  ```ts
  /** Active drawing tool. Replaces the legacy `config.color === 'eraser'` overload. */
  export type ShapeTool =
    | 'pen'
    | 'eraser'
    | 'rect'
    | 'ellipse'
    | 'line'
    | 'arrow';
  ```

- [ ] **Step 2:** Extend `DrawingConfig` in-place (~line 1010) with two new optional fields. Update the JSDoc on `color` so future readers understand the eraser overload is dead.

  ```ts
  /** Active tool. When absent, default to 'pen'. The legacy `color === 'eraser'` overload is migrated away by migrateDrawingConfig. */
  activeTool?: ShapeTool;
  /** If true, rect/ellipse render filled with the current color (stroke unchanged). Default false. */
  shapeFill?: boolean;
  ```

- [ ] **Step 3:** Run `pnpm run type-check` to confirm no consumers broke from the new optionals. Why: every existing `DrawingConfig` consumer (Widget.tsx, AnnotationOverlay.tsx, migrate helper) reads via destructuring; new optional fields don't widen the contract.

### Task 1.2: Update migration

**Files:** Modify `utils/migrateDrawingConfig.ts`, `tests/utils/migrateDrawingConfig.test.ts`

- [ ] **Step 1:** Open `utils/migrateDrawingConfig.ts`. After the existing `objects` materialization block (around line 64), add three forward-migration rules. Place them so they run before the final `return`.

  ```ts
  // Phase 2 PR 2.1b: legacy color === 'eraser' becomes explicit activeTool.
  let activeTool = raw.activeTool;
  let color = raw.color;
  if (color === 'eraser') {
    activeTool = 'eraser';
    color = undefined; // fall back to the palette default at render time
  }
  // Default activeTool to 'pen' when missing OR invalid (defensive against hand-edited docs).
  const VALID_TOOLS: readonly ShapeTool[] = [
    'pen',
    'eraser',
    'rect',
    'ellipse',
    'line',
    'arrow',
  ];
  if (!activeTool || !VALID_TOOLS.includes(activeTool)) activeTool = 'pen';
  // Default shapeFill to false when missing.
  const shapeFill = raw.shapeFill ?? false;
  ```

  Then thread `activeTool`, `color`, `shapeFill` through both return statements. Import `ShapeTool` at the top.

- [ ] **Step 2:** Add three new test cases to `tests/utils/migrateDrawingConfig.test.ts`:
  - Legacy `{ color: 'eraser' }` → migrated `{ activeTool: 'eraser', color: undefined }`.
  - Missing `activeTool` → defaults to `'pen'`.
  - Invalid `activeTool` string (e.g. `'magic'`) → defaults to `'pen'`.

  Use the existing `describe('migrateDrawingConfig')` block; mirror the assertion style of the current tests.

- [ ] **Step 3:** Run `pnpm exec vitest run tests/utils/migrateDrawingConfig.test.ts` — expect PASS.

### Task 1.3: Constants + shared shape renderers

**Files:** Modify `components/widgets/DrawingWidget/constants.ts`; Create `components/widgets/DrawingWidget/renderers/shapes.ts` + `tests/components/widgets/DrawingWidget/renderers/shapes.test.ts`

- [ ] **Step 1:** Append to `constants.ts`:

  ```ts
  export const DRAWING_DEFAULTS = {
    WIDTH: 4,
    CUSTOM_COLORS: WIDGET_PALETTE.slice(0, 5),
    ACTIVE_TOOL: 'pen' as const,
    SHAPE_FILL: false,
  };
  ```

  Why: every render path needs the same fallback; centralizing prevents drift between Widget and AnnotationOverlay.

- [ ] **Step 2:** Create `components/widgets/DrawingWidget/renderers/shapes.ts` with four pure renderers: `renderRect(ctx, obj)`, `renderEllipse(ctx, obj)`, `renderLine(ctx, obj)`, `renderArrow(ctx, obj)`. Each is ~10 lines. Use `ctx.save()`/`ctx.restore()` around each so `strokeStyle`/`lineWidth`/`fillStyle`/`globalCompositeOperation` never leak between objects. Arrow head: compute the segment angle first (`const angle = Math.atan2(y2 - y1, x2 - x1);`), then derive the two triangle base points from `(x2, y2)` using `angle ± Math.PI/6` and `headLen = Math.max(12, strokeWidth * 3)`. Draw the triangle via two `lineTo` + `ctx.fill()`. Without the angle the head cannot rotate to follow the line direction.

- [ ] **Step 3:** Write the unit tests in `tests/components/widgets/DrawingWidget/renderers/shapes.test.ts` using the `makeMockCtx` pattern from `useDrawingCanvas.test.ts:21`. Assert each renderer calls the expected ctx methods with the expected arguments and ends with `ctx.restore()`.

- [ ] **Step 4:** Run `pnpm exec vitest run tests/components/widgets/DrawingWidget/renderers/shapes.test.ts` — expect PASS.

### Task 1.4: Hook changes (shape capture + render dispatcher)

**Files:** Modify `components/widgets/DrawingWidget/useDrawingCanvas.ts`, `components/widgets/DrawingWidget/useDrawingCanvas.test.ts`

- [ ] **Step 1:** Extend `UseDrawingCanvasOptions` with `activeTool: ShapeTool` and `shapeFill?: boolean`. Default the hook param so the AnnotationOverlay test path keeps working without rewrites.

- [ ] **Step 2:** Replace `currentPathRef: Point[]` with a discriminated `inProgressRef` per the roadmap (`docs/drawing-widget-phase-2.md:105-122`):

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

- [ ] **Step 3:** Branch `handleStart` on `activeTool`:
  - `pen`/`eraser`: initialize `{ kind: 'path', points: [pos] }`.
  - `rect`/`ellipse`: `{ kind, x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y }`.
  - `line`/`arrow`: `{ kind, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y }`.

  Capture `activeTool` at start in a local ref so mid-drag tool switches are ignored (matches the roadmap's "tool switch during drag is ignored" requirement).

- [ ] **Step 4:** Update `handleMove`: pen appends to points; shapes update the end coords. Re-render preview by passing the in-progress object to `draw()`. **The `draw()` signature in `useDrawingCanvas.ts` must be widened from `(ctx, objects, currentPath: Point[])` to `(ctx, objects, inProgress: InProgress | null)`** — the previous `Point[]` parameter only covered pen/eraser previews and cannot represent shape primitives. Extract a `renderInProgress(ctx, inProgress, color, width, shapeFill)` helper that switches on `inProgress.kind` and reuses the same per-shape render math from `renderers/shapes.ts` (committed objects and in-progress previews must look identical).

- [ ] **Step 5:** Update `handleEnd` to materialize the in-progress into a `DrawableObject`:
  - `path` → `PathObject` (existing logic).
  - `rect`/`ellipse` → normalize `x0,y0,x1,y1` to `{ x: min, y: min, w: abs(x1-x0), h: abs(y1-y0) }`. Apply `stroke: color`, `strokeWidth: width`, `fill: shapeFill ? color : undefined`.
  - `line`/`arrow` → `{ x1, y1, x2, y2, stroke: color, strokeWidth: width }`.
  - Drop degenerate shapes (`w === 0 && h === 0` for rect/ellipse; `x1 === x2 && y1 === y2` for line/arrow) — mirrors the existing `points.length < 2` drop at `useDrawingCanvas.ts:157`.

- [ ] **Step 6:** Fill in the four stubbed `renderObject` branches at `useDrawingCanvas.ts:186-193`:

  ```ts
  case 'rect':    return renderRect(ctx, obj);
  case 'ellipse': return renderEllipse(ctx, obj);
  case 'line':    return renderLine(ctx, obj);
  case 'arrow':   return renderArrow(ctx, obj);
  ```

  Import from `./renderers/shapes`. Leave `text`/`image` no-ops — they're Waves 2 and 3.

- [ ] **Step 7:** Add tests to `useDrawingCanvas.test.ts` covering the seven roadmap cases (`docs/drawing-widget-phase-2.md:183-189`): rect normalization (including drag-up-left), ellipse normalization, line emit, arrow emit, degenerate-shape drop, `shapeFill: true` produces `fill === color`, mid-drag tool switch ignored.

- [ ] **Step 8:** Run `pnpm exec vitest run components/widgets/DrawingWidget/useDrawingCanvas.test.ts` — expect PASS.

### Task 1.5: Widget toolbar (decouple tool from color)

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `components/widgets/DrawingWidget/Widget.test.tsx`

- [ ] **Step 1:** In `Widget.tsx`, destructure `activeTool` and `shapeFill` from the migrated config (~line 28). Default both via `DRAWING_DEFAULTS`.

- [ ] **Step 2:** Replace the inline eraser button in `PaletteUI` (`Widget.tsx:156-167`) with a six-button **Tools cluster**. Order: Pen, Eraser, Line, Arrow, Rect, Ellipse. Icons from lucide-react: `Pencil`, `Eraser`, `Slash`, `ArrowRight`, `Square`, `Circle`. Use `Button variant="ghost" size="icon"`. Active tool gets `ring-2 ring-indigo-500`. Click handler sets `config.activeTool` only.

- [ ] **Step 3:** Keep the color cluster as-is **minus the eraser swatch**. When `activeTool === 'eraser'`, render the color cluster with `opacity-50 pointer-events-none` so it's visually disabled (matches the design-spec "Calm confidence — never adds cognitive load"). Color clicks must NOT auto-switch tool back to pen.

- [ ] **Step 4:** Pass `activeTool` and `shapeFill` into the `useDrawingCanvas({...})` call (~line 56).

- [ ] **Step 5:** Add a Widget test: clicking the rect tool button calls `updateWidget` with `config.activeTool === 'rect'`. Clicking a color swatch leaves `config.activeTool` unchanged. Use the existing mock pattern in `Widget.test.tsx:30-80`.

- [ ] **Step 6:** Run `pnpm exec vitest run components/widgets/DrawingWidget/Widget.test.tsx` — expect PASS.

### Task 1.6: Settings panel — shape fill toggle

**Files:** Modify `components/widgets/DrawingWidget/Settings.tsx`

- [ ] **Step 1:** Below the brush thickness section in `Settings.tsx:50-73`, add a new section wrapped in `<SettingsLabel icon={Square}>Shape Fill</SettingsLabel>` with a single toggle that flips `config.shapeFill`. Use the existing toggle pattern from any other widget's settings (`ToggleRow` in `components/common/library/` if it exists; otherwise a plain styled `<input type="checkbox">` to stay minimal).

- [ ] **Step 2:** Verify the existing "Tip" callout copy doesn't conflict with the new shapes; keep it as-is.

- [ ] **Step 3:** No new test is required for the settings toggle in this wave (covered indirectly by the hook tests in Task 1.4 + Widget tests in Task 1.5). A focused Settings test can be added in Wave 4 once the appearance surface grows.

### Task 1.7: AnnotationOverlay parity

**Files:** Modify `components/layout/AnnotationOverlay.tsx`

- [ ] **Step 1:** Add `activeTool` + `shapeFill` to the local `FALLBACK_ANNOTATION_STATE` (`AnnotationOverlay.tsx:32-42`). Default `activeTool: 'pen'`, `shapeFill: false`.

- [ ] **Step 2:** Thread both through `updateAnnotationState` calls. The shared `annotationState` shape lives in `context/DashboardContext.tsx` — extend its type alias to include the two new fields (search for `AnnotationState` and add to its definition).

- [ ] **Step 3:** Mirror the Tools cluster from Widget.tsx in the floating toolbar (`AnnotationOverlay.tsx:296-319`). Same six buttons, same ordering, same `ring-2 ring-indigo-500` active treatment. Keep visual sizing (`w-7 h-7`) to match the overlay's larger swatch.

- [ ] **Step 4:** Pass `activeTool` + `shapeFill` into `useDrawingCanvas({...})` (`AnnotationOverlay.tsx:137-145`).

- [ ] **Step 5:** Manual cross-check: open the annotation overlay in `pnpm run dev`, draw an arrow over a slide, confirm it persists until cleared.

### Task 1.8: Wave validation + commit

- [ ] Run `pnpm run validate` — must pass with **zero warnings** (`--max-warnings 0`).
- [ ] Commit: `feat(drawing): shape primitives + tool palette (Phase 2 PR 2.1b)`

---

## WAVE 2 — PR 2.1d: Text objects

**Goal:** Add a `text` tool that places a `TextObject` on click and focuses a contenteditable overlay positioned over the canvas. Reuse `TypographySettings` for font family/color editing. Sanitize user content before persistence.

### Task 2.1: Constants + tool extension

**Files:** Modify `components/widgets/DrawingWidget/constants.ts`; Modify `types.ts`

- [ ] **Step 1:** Extend `ShapeTool` union in `types.ts` to include `'text'`: `'pen' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'`. Update `VALID_TOOLS` in `migrateDrawingConfig.ts` accordingly.

- [ ] **Step 2:** Extend `DrawingConfig` in `types.ts` with the two persisted text defaults the spec requires (`docs/superpowers/specs/2026-05-24-whiteboard-phase-2-design.md:290-296`) — without these, teachers re-pick font on every text drop:

  ```ts
  /** Default font family for newly-spawned TextObjects. Default: 'Lexend, sans-serif'. */
  defaultTextFontFamily?: string;
  /** Default font size (px) for newly-spawned TextObjects. Default: 24. */
  defaultTextFontSize?: number;
  ```

  Add the corresponding forward-migration rule in `utils/migrateDrawingConfig.ts` (validate `typeof === 'string'` for font family, `typeof === 'number'` and `> 0` for size; drop silently otherwise). Add a migration test for each.

- [ ] **Step 3:** Append to `DRAWING_DEFAULTS` in `constants.ts`:

  ```ts
  TEXT_FONT_FAMILY: 'Lexend, sans-serif',
  TEXT_FONT_SIZE_PX: 24,
  TEXT_COLOR: STANDARD_COLORS.slate,
  TEXT_PLACEHOLDER_W: 200,
  TEXT_PLACEHOLDER_H: 48,
  ```

  Why: a click-only spawn needs an initial bounding box, and the spawn path reads `config.defaultTextFontFamily ?? DRAWING_DEFAULTS.TEXT_FONT_FAMILY` etc. when stamping the new `TextObject`.

### Task 2.2: Hook — capture click → spawn empty TextObject

**Files:** Modify `components/widgets/DrawingWidget/useDrawingCanvas.ts`, `useDrawingCanvas.test.ts`

- [ ] **Step 1:** Add a `onTextSpawn?: (obj: TextObject) => void` callback to `UseDrawingCanvasOptions`. Why: text creation is a click event (not a drag), so we route around the existing pointer-down/move/up flow.

- [ ] **Step 2:** In `handleStart`, when `activeTool === 'text'`: emit a fresh `TextObject` via `onTextSpawn` (id from `crypto.randomUUID()`, z from `nextZ`, `x/y` from `getPos(e)`, `w/h` from defaults, `content: ''`, font fields from defaults), then set `isDrawing = false` and **do not** start a drag.

- [ ] **Step 3:** Fill in the `renderObject` `case 'text':` branch — call `renderText(ctx, obj)` from a new helper in `renderers/shapes.ts` (or a sibling `renderers/text.ts`). Use `ctx.font = `${obj.fontSize}px ${obj.fontFamily}``, `ctx.fillStyle = obj.color`, `ctx.fillText(obj.content, obj.x, obj.y + obj.fontSize)`for first-line baseline correction. Multiline support: split on`\n`, advance y by `fontSize \* 1.2` per line.

- [ ] **Step 4:** Add tests covering: click with `activeTool === 'text'` invokes `onTextSpawn` exactly once with a `TextObject`; pointer-move/up after a text click are no-ops; render path produces `ctx.fillText` calls for each line.

### Task 2.3: Text editor overlay component

**Files:** Create `components/widgets/DrawingWidget/TextEditorOverlay.tsx`, `tests/components/widgets/DrawingWidget/TextEditorOverlay.test.tsx`

- [ ] **Step 1:** New component `TextEditorOverlay` props: `{ object: TextObject; canvasRect: DOMRect; onCommit: (next: TextObject) => void; onCancel: () => void }`. Renders an absolutely-positioned `<div contentEditable suppressContentEditableWarning>` over the canvas at the object's `x/y/w/h`, focused on mount, with `font-family`/`font-size`/`color` set inline from the object.

- [ ] **Step 2:** On `Escape` → `onCancel`. On blur OR `Ctrl/Cmd+Enter` → sanitize via `utils/security.ts` helpers (use the same HTML-escape pattern as `Widget.tsx:94-101`), then `onCommit({ ...object, content: sanitized })`. If the sanitized string is empty, call `onCancel` (no empty-text artifacts on the canvas).

- [ ] **Step 3:** Tests: mount with an empty TextObject, type "hello", press Ctrl+Enter, assert `onCommit` is called with `content: 'hello'`. Empty commit → `onCancel`. Escape → `onCancel`.

### Task 2.4: Widget wiring (spawn → edit → commit)

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `Widget.test.tsx`

- [ ] **Step 1:** Add `editingTextId: string | null` local state. When `useDrawingCanvas` fires `onTextSpawn`: append the new object via `appendObject` AND set `editingTextId = newObj.id`.

- [ ] **Step 2:** Render `<TextEditorOverlay>` over the canvas whenever `editingTextId` matches an existing TextObject in `objects`. Compute `canvasRect` from `canvasRef.current?.getBoundingClientRect()`.

- [ ] **Step 3:** Double-click handler on the canvas — if `activeTool === 'pen'` (or any non-text tool) AND the click hits an existing TextObject's bounding box, enter edit mode by setting `editingTextId` to that object's id. This is a tiny inline hit-test (full hit-testing lands in Wave 4); for now: filter `objects` for `kind === 'text'` and test `x <= px <= x+w && y <= py <= y+h`.

- [ ] **Step 4:** Add the Text button to the Tools cluster (lucide `Type` icon). Place it before Pen so Tools reads Text → Pen → ... (text is the most-used widget-adding action after pen). Active treatment matches the others.

- [ ] **Step 5:** Add Widget tests: clicking the text tool, then clicking on the canvas, mounts the overlay with an empty object; typing + commit calls `updateWidget` with the new content; double-click on an existing text object re-opens the overlay.

### Task 2.5: AnnotationOverlay parity

**Files:** Modify `components/layout/AnnotationOverlay.tsx`

- [ ] **Step 1:** Add the Text tool button to the overlay's Tools cluster. Wire the same spawn → overlay → commit flow. The overlay's `addAnnotationObject` (from `DashboardContext.tsx:4964`) becomes the persist target instead of `appendObject`.

- [ ] **Step 2:** Manual cross-check: open annotation, click Text tool, click on the screen, type "Look here", commit, confirm the rendered text persists until clear.

### Task 2.6: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Commit: `feat(drawing): text objects (Phase 2 PR 2.1d)`

---

## WAVE 3 — PR 2.2: Image insertion

**Goal:** Teachers can add images via clipboard paste, drag-and-drop onto the canvas, or a toolbar Image button. Uploads route through `useImageUpload` and produce a Firebase Storage / Drive URL stamped onto an `ImageObject`.

### Task 3.1: Renderer for ImageObject

**Files:** Modify `components/widgets/DrawingWidget/useDrawingCanvas.ts`, `useDrawingCanvas.test.ts`

- [ ] **Step 1:** Add a per-hook `imageCacheRef: useRef<Map<string, HTMLImageElement>>(new Map())`. Why: `ctx.drawImage` needs a fully-loaded `HTMLImageElement`; without a cache we'd re-decode on every render pass.

- [ ] **Step 2:** Fill in the `renderObject` `case 'image':` branch:

  ```ts
  case 'image': {
    const cached = imageCacheRef.current.get(obj.src);
    if (cached && cached.complete) {
      ctx.save();
      ctx.drawImage(cached, obj.x, obj.y, obj.w, obj.h);
      ctx.restore();
    } else if (!cached) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => triggerRedrawRef.current?.();
      img.src = obj.src;
      imageCacheRef.current.set(obj.src, img);
    }
    return;
  }
  ```

  Add a `triggerRedrawRef` populated from the existing `useEffect` that calls `draw()`.

- [ ] **Step 3:** Tests: render path for an ImageObject creates a cached `Image` on first paint; subsequent renders call `ctx.drawImage` once. Mock `Image` via `vi.stubGlobal` if needed.

### Task 3.2: Image insertion hook (paste / drop / file picker)

**Files:** Create `components/widgets/DrawingWidget/useImageInsertion.ts`, `tests/components/widgets/DrawingWidget/useImageInsertion.test.ts`

- [ ] **Step 1:** Hook signature: `useImageInsertion({ canvasRef, onImageReady })` returns `{ openPicker, handlePaste, handleDrop, isUploading }`. Internally calls `useImageUpload({ uploadFn })` where `uploadFn` wraps `uploadDisplayImage(user.uid, file)` from `hooks/useStorage.ts:83`.

- [ ] **Step 2:** `handlePaste(e: ClipboardEvent)` — iterate `e.clipboardData.items`, find the first `type.startsWith('image/')`, then **null-guard `getAsFile()` before passing to the upload pipeline** (the Web API returns `File | null` — it returns `null` whenever `item.kind !== 'file'`, which includes string items that happen to carry an image MIME type):

  ```ts
  const file = item.getAsFile();
  if (!file) continue;
  processAndUploadImage(file, { skipProcessing: true });
  ```

  Reason for `skipProcessing: true`: whiteboard images shouldn't have background removed (a teacher pasting a diagram wants the white background preserved).

- [ ] **Step 3:** `handleDrop(e: React.DragEvent)` — same for `e.dataTransfer.files[0]`. Computes drop position via `getBoundingClientRect()` and the file's intrinsic dimensions via a transient `Image` decode; passes both to `onImageReady`.

- [ ] **Step 4:** `openPicker()` opens a hidden `<input type="file" accept="image/*">` via a ref, then routes through the same upload pipeline.

- [ ] **Step 5:** Once upload returns the URL, call `onImageReady({ src, assetId?: undefined, x, y, w, h })` where w/h are clamped to a reasonable max (e.g. 400px wide while preserving aspect).

- [ ] **Step 6:** Tests: paste a fake image item → `processAndUploadImage` called with the file; drop with no image type → no-op; openPicker → opens file input. Mock `useImageUpload` via `vi.mock`.

### Task 3.3: Widget wiring

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `Widget.test.tsx`

- [ ] **Step 1:** Mount `useImageInsertion` in Widget with `onImageReady` that builds a fresh `ImageObject` (`id`, `z = nextZ`, kind `'image'`, x/y/w/h/src) and calls `appendObject`.

- [ ] **Step 2:** Attach `onPaste={handlePaste}` and `onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}` to the canvas-wrapping `<div>` (the one at `Widget.tsx:209-228`).

- [ ] **Step 3:** Add an Image button (lucide `ImagePlus`) to the actions cluster of `PaletteUI`. Click → `openPicker()`. While `isUploading`, swap the icon for the existing spinner pattern (`Widget.tsx:196`).

- [ ] **Step 4:** Add Widget tests: clicking the image button calls `openPicker`; a simulated paste event dispatches the upload; on completion `updateWidget` is called with an `objects` array containing a new `ImageObject`.

### Task 3.4: AnnotationOverlay parity

**Files:** Modify `components/layout/AnnotationOverlay.tsx`

- [ ] **Step 1:** Add the Image button to the actions cluster. Wire paste/drop on the canvas. `onImageReady` calls `addAnnotationObject`. Note: annotations are cleared on close, so image cleanup is automatic.

### Task 3.5: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Commit: `feat(drawing): image insertion (Phase 2 PR 2.2)`

---

## WAVE 4 — PR 2.1c: Selection + transform

**Goal:** Add a `select` tool. Click an object → bounding-box selection with 8 resize handles + 1 rotation handle + Backspace/Delete to remove. Marquee multi-select is a stretch goal; first cut is single-object.

### Task 4.1: Tool + types extension

**Files:** Modify `types.ts`, `utils/migrateDrawingConfig.ts`, `tests/utils/migrateDrawingConfig.test.ts`

- [ ] **Step 1:** Extend `ShapeTool` to include `'select'`. Update `VALID_TOOLS` in the migration. Add a migration test that `'select'` round-trips.

- [ ] **Step 2:** Selection state itself is **transient** (per the roadmap, `docs/drawing-widget-phase-2.md:214`) — no `types.ts` change beyond the tool union.

### Task 4.2: Hit-test module

**Files:** Create `components/widgets/DrawingWidget/hitTest.ts`, `tests/components/widgets/DrawingWidget/hitTest.test.ts`

- [ ] **Step 1:** Exports: `hitTestObjects(objects, point): DrawableObject | null`. Iterate in reverse z-order (top to bottom). Per-kind branch:
  - `path` → for each consecutive pair of points, compute distance from `point` to the segment; hit if `<= max(stroke/2, 6px)`.
  - `rect`/`ellipse`/`text`/`image` → bounding-box test (`x <= px <= x+w && y <= py <= y+h`). For ellipse, refine with `((px-cx)/rx)^2 + ((py-cy)/ry)^2 <= 1` so off-corner clicks don't grab it.
  - `line`/`arrow` → segment proximity, same threshold as path.

- [ ] **Step 2:** Export `getBoundingBox(obj): { x, y, w, h }` for each kind. For rotated objects (`rotation != null`), return the AABB of the rotated rect.

- [ ] **Step 3:** Tests: every kind hits correctly inside; misses correctly outside; reverse z-order is honored (later object wins).

### Task 4.3: Selection hook

**Files:** Create `components/widgets/DrawingWidget/useSelection.ts`, `tests/components/widgets/DrawingWidget/useSelection.test.ts`

- [ ] **Step 1:** Hook signature: `useSelection({ objects, activeTool, onTransformPreview, onTransformCommit, onRemoveObject })` returns `{ selectedId, selectedObject, handleSelectPointerDown, handleSelectPointerMove, handleSelectPointerUp, handleKeyDown, transformState }`.

  > **Preview vs commit (critical):** the spec (§2.1c) is explicit that
  > only `pointerup` commits through `updateWidget`. A two-second drag at
  > 60 fps produces ~120 pointer-move events; routing each one to
  > `updateWidget` writes ~120 docs to Firestore and trips both the SDK's
  > per-second write quota and client-side throttling on slow links. We
  > split the callbacks so this regression cannot ship even as an interim
  > Wave 4 build:
  >
  > - `onTransformPreview(next)` — fired on every `pointermove`; updates
  >   local-only canvas state via `previewObjectsChange` (Wave 5
  >   introduces the canonical name; in Wave 4 it is a local `useState`
  >   on the widget that overrides `objects` for the render pass only).
  >   **Never** calls `updateWidget`.
  > - `onTransformCommit(next)` — fired exactly once on `pointerup`. This
  >   is the only path that touches `updateWidget`.

- [ ] **Step 2:** `handleSelectPointerDown(e, pos)` — if `activeTool === 'select'`: hit-test; set `selectedId`. If the hit is a resize handle or rotation handle (determined by numeric proximity to the handle positions painted by `renderSelectionChrome` in Task 4.4 Step 2), enter `transformState = { mode: 'resize-nw' | ... | 'rotate' | 'translate', origin, startObj }`.

- [ ] **Step 3:** `handleSelectPointerMove(e, pos)` — when `transformState != null`, compute the in-flight transformed object and emit via `onTransformPreview(transformed)` (local-state only, no Firestore write). Use immutable updates.

- [ ] **Step 4:** `handleSelectPointerUp` — compute the final transformed object once, call `onTransformCommit(final)` (the single `updateWidget` write), then clear `transformState` and the preview override.

- [ ] **Step 5:** `handleKeyDown` — `Backspace`/`Delete` removes `selectedId` via `onRemoveObject`. Arrow keys nudge by 1px (Shift+Arrow = 10px).

- [ ] **Step 6:** Tests: selecting an object sets `selectedId`; click-empty clears it; pointer-move during translate calls `onUpdateObject` per move; Backspace calls `onRemoveObject`.

### Task 4.4: Selection chrome — drawn inside `draw()` (no separate SVG layer)

**Files:** Modify `components/widgets/DrawingWidget/useDrawingCanvas.ts`; Create `components/widgets/DrawingWidget/SelectionOverlay.tsx`

> **Architecture note (resolves a plan/spec discrepancy):** the spec
> (`docs/superpowers/specs/2026-05-24-whiteboard-phase-2-design.md` §2.1c)
> requires selection chrome (bbox + 8 resize handles + rotation handle) to
> be drawn **inside `draw()` after the object loop** — not in a sibling
> SVG layer. Two reasons: (1) preserves Architecture Invariant #1 (the
> `useDrawingCanvas` contract — "take a list of objects, paint them,
> capture pointer interaction" — stays the single rendering surface), and
> (2) keeps PNG export (Wave 7) a single `toDataURL` call. Selection
> chrome is intentionally excluded from exports because the `draw()` call
> that exports uses `selection: null`.
>
> `SelectionOverlay.tsx` still exists, but only as a **transparent
> pointer-event interceptor** that calls back into the selection hook — no
> visual content. Handle-hit-test is performed numerically in the hook
> using the selected object's bbox + current handle positions, not via
> `data-handle` DOM attributes.

- [ ] **Step 1:** Extend `UseDrawingCanvasOptions` per the spec (lines 252-258):

  ```ts
  selection?: { selectedId: string | null };
  onSelect?: (id: string | null) => void;
  onTransform?: (id: string, patch: Partial<DrawableObject>) => void;
  onDelete?: (id: string) => void;
  ```

- [ ] **Step 2:** After the object render loop inside `draw()`, if `selection.selectedId` resolves to an object, call a new `renderSelectionChrome(ctx, obj, transformState)` helper: stroke a 1px indigo dashed rect at the bbox (`stroke: rgba(99,102,241,0.8)`), then paint 8 white-fill / indigo-border 10×10 handle squares at the corner and edge midpoints, then a circular rotation handle 20px above the bbox top. Dim handle alpha to `0.5` when `transformState != null`. The chrome is drawn in canvas pixel space so it scales with the canvas (no extra DOM math needed).

- [ ] **Step 3:** Create `SelectionOverlay.tsx` as a **transparent** absolutely-positioned `<div>` that covers the canvas and forwards `pointerdown`/`pointermove`/`pointerup` to the selection hook with the local canvas coordinates. No SVG, no visible children, no `data-handle` attributes. The hook does numeric handle-hit-tests against the same handle positions it used to render in Step 2.

- [ ] **Step 4:** Document in a code comment at the top of `SelectionOverlay.tsx` that selection chrome is rendered via `draw()` (not here) and is therefore automatically excluded from PNG/PDF export — Wave 7 needs no additional step.

### Task 4.5: Widget wiring

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `Widget.test.tsx`

- [ ] **Step 1:** Add the Select tool button (lucide `MousePointer2`) as the first button in the Tools cluster (selection-first is the dominant whiteboard pattern).

- [ ] **Step 2:** Mount `useSelection({ objects, activeTool, onTransformPreview, onTransformCommit, onRemoveObject })` where:
  - `onTransformPreview(next)` updates a local `useState<DrawableObject | null>(null)` that the render pass overlays on top of `objects` (find by id, swap in the preview). No `updateWidget` call.
  - `onTransformCommit(next)` calls `updateWidget(widget.id, { config: { ...config, objects: objects.map(o => o.id === next.id ? next : o) } })` exactly once, then clears the preview override.
  - `onRemoveObject(id)` calls `updateWidget` with the filtered array.

- [ ] **Step 3:** Route the canvas's pointer handlers through a chooser: if `activeTool === 'select'`, call selection handlers; otherwise call the existing draw handlers. Implement as a thin wrapper:

  ```ts
  const onPointerDown = (e) =>
    activeTool === 'select'
      ? handleSelectPointerDown(e, getPos(e))
      : handleStart(e);
  ```

- [ ] **Step 4:** Mount `<SelectionOverlay>` over the canvas when `selectedObject != null`.

- [ ] **Step 5:** Wire `onKeyDown` on the canvas wrapper to `handleKeyDown`. Make the wrapper focusable (`tabIndex={0}`) so keys fire without a focused child.

- [ ] **Step 6:** Add Widget tests: clicking the select tool, then clicking an existing rect, mounts the SelectionOverlay; pressing Backspace removes the rect via `updateWidget`.

### Task 4.6: AnnotationOverlay parity

**Files:** Modify `components/layout/AnnotationOverlay.tsx`

- [ ] **Step 1:** Mirror the Select tool button + selection wiring. Selection mutations route through a new `updateAnnotationObject(next)` and `removeAnnotationObject(id)` — add both to `context/DashboardContext.tsx` next to the existing `addAnnotationObject`/`undoAnnotation`/`clearAnnotation` block (`DashboardContext.tsx:4964-5013`). Both helpers go through `setActiveAnnotationObjects` so the live-share mirror still propagates.

### Task 4.7: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Commit: `feat(drawing): selection + transform (Phase 2 PR 2.1c)`

---

## WAVE 5 — PR 2.4: Undo/redo command stack

**Goal:** Replace the single-level `objects.slice(0, -1)` undo (`Widget.tsx:73-77`) with a `Command[]` stack. In-memory only (not persisted); cleared on widget unmount. Supports `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`.

### Task 5.1: Command types

**Files:** Create `components/widgets/DrawingWidget/commands.ts`

- [ ] **Step 1:** Export a discriminated union:

  ```ts
  export type DrawingCommand =
    | { kind: 'add'; object: DrawableObject }
    | { kind: 'remove'; object: DrawableObject }
    | { kind: 'update'; before: DrawableObject; after: DrawableObject }
    | { kind: 'reorder'; objectId: string; fromZ: number; toZ: number };
  ```

- [ ] **Step 2:** Export `applyCommand(objects, cmd, direction): DrawableObject[]` where `direction` is `'forward' | 'reverse'`. Pure function; one switch per `kind`.

### Task 5.2: Command stack hook

**Files:** Create `components/widgets/DrawingWidget/useCommandStack.ts`, `tests/components/widgets/DrawingWidget/useCommandStack.test.ts`

- [ ] **Step 1:** Hook: `useCommandStack({ objects, onObjectsChange })` returns `{ push, undo, redo, canUndo, canRedo }`. Internally tracks `past: DrawingCommand[]` and `future: DrawingCommand[]` **in `useState`** (not `useRef`). The toolbar's Undo / Redo buttons disable on `!canUndo` / `!canRedo` (Task 5.3 Step 4) — if the stack lived in a ref, button enabled state would stay stale until something else triggered a re-render, leaving the UI lying about what's available. Use the functional `setPast(prev => ...)` form so concurrent commands don't drop each other.

- [ ] **Step 2:** `push(cmd)` appends to `past` (state update), clears `future` (state update), and calls `onObjectsChange(applyCommand(objects, cmd, 'forward'))`. Derive `canUndo = past.length > 0` and `canRedo = future.length > 0` from the state directly so they re-render in lockstep.

- [ ] **Step 3:** `undo()` pops `past`, pushes to `future`, calls `onObjectsChange(applyCommand(objects, popped, 'reverse'))`. `redo()` is the symmetric inverse. Both mutate via `setPast`/`setFuture` so `canUndo`/`canRedo` update synchronously with the action.

- [ ] **Step 4:** Tests: add → undo → object gone; update → undo → object restored to before-state; redo after undo replays; pushing a new command after undo clears the redo stack.

### Task 5.3: Widget integration

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `Widget.test.tsx`

- [ ] **Step 1:** Replace the in-component `appendObject` with a `pushAdd(obj)` that calls `commandStack.push({ kind: 'add', object: obj })`. Same for the inline `undo` button — it now calls `commandStack.undo()`.

- [ ] **Step 2:** Hook `useSelection`'s `onUpdateObject` callback to capture both `before` and `after` snapshots (Selection's pointer-down captures the starting object; pointer-up commits a single `{ kind: 'update', before, after }` command). Intermediate moves should call a `previewObjectsChange(next)` that bypasses the stack so the canvas updates live without polluting history.

- [ ] **Step 3:** Wire `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` keyboard shortcuts on the canvas wrapper. Respect `prefers-reduced-motion` — no shortcut indicator animations.

- [ ] **Step 4:** Add a Redo button next to Undo. Disable both when `!canUndo` / `!canRedo`.

- [ ] **Step 5:** Tests: drawing a rect then pressing Ctrl+Z removes it from `updateWidget`'s payload; pressing Ctrl+Shift+Z re-adds.

### Task 5.4: AnnotationOverlay parity

**Files:** Modify `components/layout/AnnotationOverlay.tsx`

- [ ] **Step 1:** The overlay's existing per-author undo at `DashboardContext.tsx:4980-5009` is intentionally different (multi-author safe). Do NOT replace it with the new command stack; instead, layer the command stack ON TOP for redo support only — `redo()` re-emits the last undone object via `addAnnotationObject`. Document this in a code comment so future agents don't unify them by accident.

### Task 5.5: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Commit: `feat(drawing): undo/redo command stack (Phase 2 PR 2.4)`

---

## WAVE 6 — PR 2.3: Multi-page canvases

**Goal:** Wrap `DrawingConfig.objects[]` in `pages: DrawableObject[][]` + `currentPage: number`. Migration wraps existing `objects` into `pages: [objects]`. UI gains a page stepper + thumbnail strip. Every renderer/hook from Waves 1–5 keeps working post-migration because it now reads `pages[currentPage]` instead of `objects`.

### Task 6.1: Types + migration

**Files:** Modify `types.ts`, `utils/migrateDrawingConfig.ts`, `tests/utils/migrateDrawingConfig.test.ts`

- [ ] **Step 1:** Extend `DrawingConfig` to match the spec (`docs/superpowers/specs/2026-05-24-whiteboard-phase-2-design.md:407-422`) — a `DrawingPage` is an **object** with `id`, `objects`, and an optional `background`, not a bare `DrawableObject[]`. The wrapper object is required so Wave 7 can attach per-page backgrounds and Wave 8 can store page metadata as a sibling doc:

  ```ts
  export interface DrawingPage {
    id: string;
    objects: DrawableObject[];
    /** Per-page background template (falls back to widget-level background). Populated by Wave 7. */
    background?: DrawingBackground;
  }

  export interface DrawingConfig {
    // ...existing fields...
    /** @deprecated post-2.3 — migrated into pages[0].objects */
    objects?: DrawableObject[];
    /** Pages of objects. When absent, falls back to legacy single-page `objects`. */
    pages?: DrawingPage[];
    currentPage?: number;
  }
  ```

  Keep `objects?` for backward compatibility (the migration reads it as page 0).

- [ ] **Step 2:** Add a forward-migration rule: if `raw.pages` is missing AND `raw.objects` is a non-empty array, set `pages = [{ id: crypto.randomUUID(), objects: raw.objects }]`, `currentPage = 0`, and drop `objects` from the return. If both are missing, default to `pages = [{ id: crypto.randomUUID(), objects: [] }]`, `currentPage = 0`. Stamp a fresh `id` on any page in `raw.pages` that's missing one (defensive against hand-edited docs).

- [ ] **Step 3:** Tests: legacy `{ objects: [pathObj] }` migrates to `{ pages: [{ id: <uuid>, objects: [pathObj] }], currentPage: 0 }`; already-paged config round-trips unchanged; missing both fields produces a single empty page with an id.

### Task 6.2: Page management helpers

**Files:** Create `components/widgets/DrawingWidget/useDrawingPages.ts`, `tests/components/widgets/DrawingWidget/useDrawingPages.test.ts`

- [ ] **Step 1:** Pure helpers (mirroring `utils/notebookPages.ts` shape — see SmartNotebook reference at `components/widgets/SmartNotebook/Widget.tsx:35-42`):
  - `insertBlankPage(pages, afterIndex): DrawingPage[]` → splice `{ id: crypto.randomUUID(), objects: [] }` after the index.
  - `deletePage(pages, index): { pages: DrawingPage[]; removedObjects: DrawableObject[] }` → never returns 0 pages; deleting the last page replaces it with a single fresh-id empty page.
  - `movePage(pages, from, to): DrawingPage[]` — preserves each page's `id` and `background`.
  - `clampPageIndex(index, pageCount): number`.

- [ ] **Step 2:** A `useDrawingPages({ config, updateConfig })` hook wraps the helpers + `currentPage` clamping into a single mutator API: `goToPage`, `addPage`, `removePage`, `movePageLeft`, `movePageRight`.

- [ ] **Step 3:** Tests: insert at end produces N+1 pages; delete last page leaves `[[]]`; clamp returns 0 on empty/negative.

### Task 6.3: Refactor Widget to be page-aware

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `Widget.test.tsx`

- [ ] **Step 1:** Replace every `objects` destructure with `pages[currentPage]?.objects ?? []`. Update `appendObject`/`onObjectsChange`/`onUpdateObject`/`onRemoveObject` to write the new objects list back into the current page via `pages.map((p, i) => i === currentPage ? { ...p, objects: nextObjects } : p)` (preserving the page's `id` and `background`), then call `updateWidget` with the full new `pages` array.

- [ ] **Step 2:** Hoist this into a `usePageScopedObjects()` derivation so the Widget body stays readable.

- [ ] **Step 3:** Verify each prior wave's tests still pass — single-page widgets must remain visually identical.

### Task 6.4: PageStrip component

**Files:** Create `components/widgets/DrawingWidget/PageStrip.tsx`

- [ ] **Step 1:** Props: `{ pages, currentPage, onSelectPage, onAddPage, onDeletePage, onMovePage }`. Renders below the toolbar (or as a collapsible drawer for narrow widgets).

- [ ] **Step 2:** Each page renders as a small numbered chip with a stripped-down thumbnail (just bbox outlines of objects, not a full render — full thumbnails come in a future PR if needed). Active page gets `ring-2 ring-indigo-500`.

- [ ] **Step 3:** Plus button at the end adds a blank page after the current one. Each chip has a hover-revealed kebab menu with Delete / Move Left / Move Right.

### Task 6.5: Annotation overlay — single-page only

**Files:** Modify `components/layout/AnnotationOverlay.tsx`, `context/DashboardContext.tsx`

- [ ] **Step 1:** Annotations are a single ephemeral surface — they do NOT get pages. Add a code comment at `AnnotationOverlay.tsx` documenting this decision so future agents don't add page support to the overlay.

- [ ] **Step 2:** Verify the annotation's `setActiveAnnotationObjects` path (`DashboardContext.tsx:4903`) still uses a flat `objects[]` and is untouched by the multi-page refactor.

### Task 6.6: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Manual: load a pre-Wave-6 dashboard with a populated DrawingWidget; confirm it auto-migrates to a single-page document with the same objects rendered.
- [ ] Commit: `feat(drawing): multi-page canvases (Phase 2 PR 2.3)`

---

## WAVE 7 — PR 2.5: Export + background templates

**Goal:** PNG export (current page or all pages) and PDF export (multipage). Background templates (`'blank' | 'grid' | 'lines' | 'dots'`) rendered as a CSS layer below the canvas — zero object churn.

### Task 7.1: Background field + migration

**Files:** Modify `types.ts`, `utils/migrateDrawingConfig.ts`, `tests/utils/migrateDrawingConfig.test.ts`, `components/widgets/DrawingWidget/constants.ts`

- [ ] **Step 1:** Extend `DrawingConfig`:

  ```ts
  background?: 'blank' | 'grid' | 'lines' | 'dots';
  ```

- [ ] **Step 2:** Migration: default missing `background` to `'blank'`. Add a test.

- [ ] **Step 3:** Append `BACKGROUND: 'blank' as const` to `DRAWING_DEFAULTS`.

### Task 7.2: Background template generator

**Files:** Create `components/widgets/DrawingWidget/backgroundTemplates.ts`

- [ ] **Step 1:** Export `getBackgroundStyle(template, w, h): React.CSSProperties` returning a `background` CSS value (linear-gradient stack for grid/lines, radial-gradient for dots, transparent for blank). Use a 24px base grid scaled to widget size.

- [ ] **Step 2:** Apply via an absolutely-positioned `<div style={getBackgroundStyle(...)}>` behind the canvas in `Widget.tsx`.

- [ ] **Step 3:** Tiny unit test that each template returns a CSS string (snapshot is fine).

### Task 7.3: Export module

**Files:** Create `components/widgets/DrawingWidget/exportCanvas.ts`, `tests/components/widgets/DrawingWidget/exportCanvas.test.ts`

- [ ] **Step 1:** `exportPagePng(canvas: HTMLCanvasElement): string` — wraps `canvas.toDataURL('image/png')` (same pattern as `Widget.tsx:86`).

- [ ] **Step 2:** `exportAllPagesPng(pages, pageSize): Promise<string[]>` — for each page, render to an offscreen canvas (no DOM mount), call `toDataURL`. Reuses the `renderObject` dispatcher from `useDrawingCanvas.ts:178-194` — extract it to a sibling module if needed for offscreen reuse.

- [ ] **Step 3:** `exportPdf(pages, pageSize, filename)` — **no new dependency.** The spec (`docs/superpowers/specs/2026-05-24-whiteboard-phase-2-design.md:903-911`) explicitly forbids adding `jspdf` (or any PDF library): the dep cost (~250KB minified) is not worth a feature most teachers use ~once a week. Instead, open the browser's print dialog scoped to a hidden print-only DOM: build a new `window` (or a hidden iframe), `document.write` one full-page `<img src={pngDataUrl} />` per page wrapped in a `@media print { @page { size: ${pageSize} } }` stylesheet, then call `window.print()`. The user saves to PDF via their OS printer. Universal across the supported browsers (Chrome 90+, Edge 90+, Firefox 88+, Safari 14+ per `CLAUDE.md`).

- [ ] **Step 4:** Tests: `exportPagePng` returns a PNG data URL; `exportAllPagesPng` returns one string per page; PDF export is mocked + verified call sequence.

### Task 7.4: Settings background picker + export buttons

**Files:** Modify `components/widgets/DrawingWidget/Settings.tsx`, `components/widgets/DrawingWidget/Widget.tsx`

- [ ] **Step 1:** In `Settings.tsx`, add a Background section under brush thickness. Four radio buttons with mini-previews of each template. Updates `config.background`.

- [ ] **Step 2:** In Widget's actions cluster, add Export buttons grouped under a small popover: "Export PNG (this page)", "Export PNG (all pages, .zip)" (use a zip helper if available, else N separate downloads), "Export PDF".

- [ ] **Step 3:** Wire Export buttons to the `exportCanvas` module + a download helper (re-use the link-click pattern from `AnnotationOverlay.tsx:166-169`).

### Task 7.5: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Manual: pick each background template; confirm renders below canvas; draw on top to confirm strokes are above the background. Export PNG; open the file; confirm shapes + paths + text + images are all present.
- [ ] Commit: `feat(drawing): export + background templates (Phase 2 PR 2.5)`

---

## WAVE 8 — PR 2.6: Firestore subcollection + incremental render

**Goal:** Move `pages[].objects[]` off the dashboard doc into the page-aware nested structure required by the spec (`docs/superpowers/specs/2026-05-24-whiteboard-phase-2-design.md:610-622` and §2.3 cross-reference at line 453-454):

```
/users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}
/users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}/objects/{objectId}
```

The nesting is required so page-level metadata (background template, order, future per-page settings) gets its own document instead of being smeared across object docs via a denormalized `page` field. Subscribe via `onSnapshot` with `includeMetadataChanges`. Incremental render: when one object changes, redraw only its bbox region instead of `clearRect`-ing the whole canvas. Target: 500+ objects without lag.

### Task 8.1: Subcollection schema + Firestore rules

**Files:** Modify `firestore.rules`, Create `tests/rules/drawingObjectsSubcollection.test.ts`

- [ ] **Step 1:** In `firestore.rules`, add nested matches inside the existing `/users/{userId}/dashboards/{dashboardId}` block (`firestore.rules:421`). Two rules — one for the page doc, one for the per-page objects subcollection — per the spec's nested layout:

  ```javascript
  match /drawings/{widgetId}/pages/{pageId} {
    allow read, write: if request.auth != null
                       && request.auth.uid == userId
                       && !isStudentRoleUser();

    match /objects/{objectId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId
                         && !isStudentRoleUser();
    }
  }
  ```

  Why this nesting: the parent dashboard rule already gates owner-only access; the nested page + objects subcollections inherit the access pattern without separate top-level rules, and page metadata lives in its own document instead of being duplicated across every object.

- [ ] **Step 2:** Write rules test mirroring an existing `tests/rules/*.test.ts` harness: seeded user can read/write their own drawing objects; another user cannot.

- [ ] **Step 3:** Run `pnpm run test:rules` (per CLAUDE.md: needs Java 21 + TEMP/TMP set). Expect PASS.

### Task 8.2: Subcollection hook

**Files:** Create `components/widgets/DrawingWidget/useDrawingObjectsDoc.ts`, `tests/components/widgets/DrawingWidget/useDrawingObjectsDoc.test.ts`

- [ ] **Step 1:** Hook: `useDrawingObjectsDoc({ dashboardId, widgetId, pageId })` returns `{ objects, addObject, updateObject, removeObject, clear, loading }`. Internally subscribes via `onSnapshot(collection(db, 'users', uid, 'dashboards', dashboardId, 'drawings', widgetId, 'pages', pageId, 'objects'))` — no `where('page', '==', ...)` filter needed because the page is encoded in the path.

- [ ] **Step 2:** Each Firestore document is one `DrawableObject` (no extra `page` field — the path scopes it). Page metadata (background template, etc.) lives on the parent `pages/{pageId}` doc; expose a sibling `useDrawingPageDoc({ dashboardId, widgetId, pageId })` hook for reading/writing it.

- [ ] **Step 3:** `addObject(obj)` → `setDoc(doc(db, 'users', uid, 'dashboards', dashboardId, 'drawings', widgetId, 'pages', pageId, 'objects', obj.id), obj)`. `removeObject(id)` → `deleteDoc` of the same ref. `updateObject(next)` → `setDoc` with merge.

- [ ] **Step 4:** Tests: mock Firestore module; assert each mutator writes/deletes the expected ref; snapshot listener pushes new objects through to the `objects` state.

### Task 8.3: Migration from dashboard-doc `pages` to subcollection

**Files:** Modify `utils/migrateDrawingConfig.ts`, `tests/utils/migrateDrawingConfig.test.ts`, `context/DashboardContext.tsx`

- [ ] **Step 1:** On widget hydration in `DashboardContext.tsx` (the path that loads widgets from the dashboard doc), detect any `DrawingConfig` with a non-empty `pages` field. For each, batch-write every object into the subcollection, **chunking writes so no single batch exceeds 500 operations** — Firestore's hard limit is 500 writes per `writeBatch` ([SDK docs](https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes)). The Phase 2 perf target is 500+ objects, and per-page metadata writes count against the same budget, so a single batch will overflow on any non-trivial whiteboard:

  ```ts
  const FIRESTORE_BATCH_LIMIT = 500;
  // Flatten { page → objects } into discrete write ops first (one per page doc + one per object).
  const ops = [...pageDocOps, ...objectDocOps];
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + FIRESTORE_BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
  ```

  Then update the dashboard doc to set `pages: undefined` and `objects: undefined` (or write a single `{ migratedToSubcollection: true }` flag). Idempotent: skip if the flag is already set.

- [ ] **Step 2:** Add `migratedToSubcollection?: boolean` to `DrawingConfig`. Document the field as "set after the one-time migration in PR 2.6; never unset".

- [ ] **Step 3:** Tests: a config with `pages: [[obj1], [obj2]]` and no flag triggers the batch-write; calling migration twice does not re-write. Mock `writeBatch` from `firebase/firestore`.

### Task 8.4: Widget integration

**Files:** Modify `components/widgets/DrawingWidget/Widget.tsx`, `Widget.test.tsx`

- [ ] **Step 1:** Replace the page-scoped `objects` derivation from Wave 6 with `useDrawingObjectsDoc(...).objects`. Replace `appendObject`/`onUpdateObject`/`onRemoveObject` with the subcollection hook's mutators.

- [ ] **Step 2:** Multi-page handling: `currentPage` is still on the widget config (cheap; one int per dashboard write). The page list itself is now a subcollection (`/drawings/{widgetId}/pages`); subscribe via a sibling `useDrawingPagesList({ dashboardId, widgetId })` hook that returns `{ pages: DrawingPage[], loading }`, ordered by a `seq: number` field on each page doc (set on create, swapped on reorder). No `pageCount` field on config — derive from `pages.length`.

- [ ] **Step 3:** Page actions (add/delete/move) write to the `/pages/{pageId}` doc and (for delete) batch-delete the page's `objects` subcollection. **Apply the same 500-op chunking from Task 8.3 Step 1** when deleting a page that holds 500+ objects.

- [ ] **Step 4:** Tests: drawing a path writes one Firestore doc, not a full dashboard update; clearing a page batch-deletes; switching pages re-runs the query.

### Task 8.5: Incremental render

**Files:** Modify `components/widgets/DrawingWidget/useDrawingCanvas.ts`, `useDrawingCanvas.test.ts`

- [ ] **Step 1:** Add a `dirtyObjectIdsRef: useRef<Set<string>>` to the hook. When the `objects` prop changes between renders, diff it: for each changed/added/removed object id, accumulate into `dirtyObjectIdsRef`.

- [ ] **Step 2:** Replace the unconditional `ctx.clearRect(0, 0, canvas.width, canvas.height)` with: if `dirtyObjectIdsRef.size > 0 && dirtyObjectIdsRef.size < objects.length / 4`, clear only the union bbox of dirty objects (call `getBoundingBox` from `hitTest.ts`) and re-render only those plus any objects whose bbox intersects the dirty region (z-order matters — a stale higher-z object would otherwise be wiped). Otherwise fall back to full clear.

- [ ] **Step 3:** Tests: changing one of 500 objects clears only the dirty region (assert `clearRect` call args); changing 200 of 500 falls back to full clear.

### Task 8.6: Wave validation + commit

- [ ] Run `pnpm run validate` — zero warnings.
- [ ] Manual: load a pre-Wave-8 dashboard with a populated multi-page drawing; verify it auto-migrates into the subcollection on first open (Firestore console: objects appear under `/users/{uid}/dashboards/{id}/drawings/{wid}/objects/`); the dashboard doc no longer carries `pages`.
- [ ] Manual: with `pnpm run dev` + dev preview, draw 500 path objects, then move one — confirm only the local region redraws (Chrome DevTools Performance tab paint area).
- [ ] Commit: `feat(drawing): Firestore subcollection + incremental render (Phase 2 PR 2.6)`

---

## Final validation

- [ ] Run full `pnpm run validate` — type-check + lint (zero warnings) + format:check + tests.
- [ ] Manual smoke test of every flow end-to-end on the dev preview URL:
  - Draw each shape (pen, rect, ellipse, line, arrow) and verify it persists.
  - Add a text object, edit it, commit, double-click to re-edit.
  - Paste an image; drag-drop an image; pick via toolbar.
  - Select an object, move/resize/rotate it, delete with Backspace.
  - Undo/redo via toolbar buttons and Ctrl+Z / Ctrl+Shift+Z.
  - Add three pages; switch between them; reorder; delete; confirm objects are page-scoped.
  - Export current page as PNG; export all pages as PDF.
  - Pick each background template; confirm rendering.
  - Load a Phase-1 (legacy `paths`) dashboard; confirm migration through to subcollection storage with no data loss.
  - Open AnnotationOverlay; confirm tool parity for shapes, text, images (where applicable), selection, undo.
  - With 500 objects, drag one — verify smooth interaction (no full-canvas repaint stutter).
- [ ] Push branch (dev-\* per `docs/DEV_WORKFLOW.md`).
- [ ] Create draft PRs in roadmap order: 2.1b → 2.1d → 2.2 → 2.1c → 2.4 → 2.3 → 2.5 → 2.6.

---

## Self-Review

**1. Spec coverage:**

- Shapes (rect/ellipse/line/arrow) → Wave 1.
- Text objects → Wave 2.
- Image insertion → Wave 3.
- Selection + transform → Wave 4.
- Undo/redo → Wave 5.
- Multi-page → Wave 6.
- Export + backgrounds → Wave 7.
- Firestore subcollection + incremental render → Wave 8.
- AnnotationOverlay parity is called out in every wave that touches the widget toolbar.
- Migration extensions land in every wave that changes the persisted schema (Waves 1, 4, 6, 7, 8) — never as ad-hoc defaults in components.

**2. Wave-order rationale:** Documented above. Text and image before selection (hit-test needs all kinds); undo/redo after selection (records transform commands); multi-page late (touches every renderer/hook); subcollection last (highest risk).

**3. Type consistency:** `ShapeTool` grows across waves (1: `'pen' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow'`; 2: `+ 'text'`; 4: `+ 'select'`). `DrawingConfig` grows: 1 (`activeTool`, `shapeFill`); 6 (`pages`, `currentPage`); 7 (`background`); 8 (`pageCount`, `migratedToSubcollection`). All migration rules layer in `migrateDrawingConfig.ts` so a single forward-migration pass handles every schema version.
