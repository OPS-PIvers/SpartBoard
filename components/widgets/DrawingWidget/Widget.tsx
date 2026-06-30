import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  DrawableObject,
  DrawingConfig,
  EraserMode,
  ImageObject,
  Point,
  ShapeTool,
  TextConfig,
  TextObject,
} from '@/types';
import {
  ArrowRight,
  Circle,
  Download,
  Eraser,
  ImagePlus,
  Lasso,
  MousePointer2,
  MousePointerClick,
  Pencil,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  TypeOutline,
  Undo2,
} from 'lucide-react';
import { TextEditorOverlay } from './TextEditorOverlay';
import { useImageInsertion } from './useImageInsertion';
import { useSelection } from './useSelection';
import { useCommandStack } from './useCommandStack';
import { useDrawingObjectsDoc } from './useDrawingObjectsDoc';
import { useDrawingPages } from './useDrawingPages';
import { hitTestObject, isObjectEnclosedByPolygon } from './hitTest';
import { PageStrip } from './PageStrip';
import { extractTextWithGemini } from '@/utils/ai';
import { useAuth } from '@/context/useAuth';
import { STANDARD_COLORS } from '@/config/colors';
import { DRAWING_DEFAULTS } from './constants';
import { useDrawingCanvas } from './useDrawingCanvas';
import { migrateDrawingConfig, nextZ } from '@/utils/migrateDrawingConfig';
import { deleteDrawingPageSubcollection } from '@/utils/deleteDrawingPageSubcollection';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { DrawingPage } from '@/types';
import { getBackgroundStyle } from './backgroundTemplates';
import {
  downloadDataUrl,
  exportAllPagesPng,
  exportPagePng,
  exportPdf,
} from './exportCanvas';

const TOOL_BUTTONS: ReadonlyArray<{
  tool: ShapeTool;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  // Select leads the cluster: selection-first is the dominant whiteboard
  // pattern (Figma, Miro, FigJam), and it's the only tool that doesn't
  // create new content.
  { tool: 'select', Icon: MousePointer2, label: 'Select' },
  // Pen comes before text: drawing is the primary action on a whiteboard,
  // and the muscle memory ordering teachers expect is select → draw → annotate.
  { tool: 'pen', Icon: Pencil, label: 'Pen' },
  { tool: 'text', Icon: TypeOutline, label: 'Text' },
  { tool: 'eraser', Icon: Eraser, label: 'Eraser' },
  { tool: 'line', Icon: Slash, label: 'Line' },
  { tool: 'arrow', Icon: ArrowRight, label: 'Arrow' },
  { tool: 'rect', Icon: Square, label: 'Rectangle' },
  { tool: 'ellipse', Icon: Circle, label: 'Ellipse' },
];

export const DrawingWidget: React.FC<{
  widget: WidgetData;
  isStudentView?: boolean;
}> = ({ widget, isStudentView = false }) => {
  const {
    updateWidget,
    activeDashboard,
    addToast,
    addWidget,
    drawingWidgetsMigrating,
  } = useDashboard();
  // When this widget is mid-migration to the subcollection backing store
  // (Phase 2 PR 2.6), gate user input so concurrent edits don't race the
  // batched migration writes. The migration captures a snapshot, writes
  // it to the subcollection, then flips `subcollectionMigrated: true` —
  // any strokes that landed on the legacy `pages[].objects[]` during the
  // multi-second migration window would otherwise be silently dropped
  // when the widget switches to reading from the subcollection. We
  // render a non-interactive overlay until the migration finishes.
  const isMigratingSubcollection = drawingWidgetsMigrating.has(widget.id);
  const { user, canAccessFeature } = useAuth();

  // Defensive migration — the canonical migration happens during dashboard
  // hydration, but widgets constructed in tests or edge cases may still
  // carry the legacy `paths[]` shape.
  const config = useMemo(
    () => migrateDrawingConfig(widget.config as DrawingConfig),
    [widget.config]
  );
  const {
    color = STANDARD_COLORS.slate,
    width = DRAWING_DEFAULTS.WIDTH,
    pages,
    currentPage,
    customColors = DRAWING_DEFAULTS.CUSTOM_COLORS,
    activeTool = DRAWING_DEFAULTS.ACTIVE_TOOL,
    eraserMode = DRAWING_DEFAULTS.ERASER_MODE,
    shapeFill = DRAWING_DEFAULTS.SHAPE_FILL,
  } = config;

  // Page-scoped object slice. `migrateDrawingConfig` guarantees pages is
  // non-empty and currentPage is clamped, so this never falls back to `[]`
  // in production — but we keep the guard for defensive symmetry with the
  // legacy single-page path.
  const activePage: DrawingPage = pages[currentPage] ?? pages[0];

  // Phase 2 PR 2.6: object content lives in a page-nested Firestore
  // subcollection, not on the dashboard doc. The dashboard config still
  // carries `pages[].id` + `pages[].background` (a denormalized cache so
  // the page list is readable in one snapshot), but `objects[]` is
  // sourced from this hook. AnnotationOverlay is intentionally NOT migrated
  // to the subcollection — it keeps its single-doc annotation state on the
  // dashboard (see context/DashboardContext.tsx).
  const dashboardId = activeDashboard?.id ?? null;
  const {
    objects: subcollectionObjects,
    addObject: subAddObject,
    updateObject: subUpdateObject,
    removeObject: subRemoveObject,
    clear: subClearObjects,
    loading: objectsLoading,
  } = useDrawingObjectsDoc({
    dashboardId,
    widgetId: widget.id,
    pageId: activePage.id,
  });

  // Before the migration flag is set we keep reading objects off the
  // dashboard doc so the widget shows the user's existing canvas while the
  // batch writes are in flight. Once `subcollectionMigrated` flips true,
  // the subcollection becomes the source of truth.
  const objects: DrawableObject[] = config.subcollectionMigrated
    ? subcollectionObjects
    : activePage.objects;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  // Viewport-anchored coords for the portalled popover. The widget's outer
  // wrapper is `overflow-hidden` (so the canvas + page strip don't bleed
  // past their bounds), which would clip an inline-positioned popover the
  // same way the PageStrip kebab was clipped. Portalling into document.body
  // and positioning via `position: fixed` against the viewport escapes that
  // clipping container. The trigger element is queried via `exportMenuRef`
  // (a `<div>` wrapping the export button — we query the inner <button> by
  // aria-label instead of refing it directly so the wrapper can stay a
  // styling/positioning anchor independent of the button itself).
  const [exportMenuAnchor, setExportMenuAnchor] = useState<{
    bottom: number;
    right: number;
  } | null>(null);
  const getExportTrigger = useCallback(
    () => exportMenuRef.current?.querySelector('button[aria-label="Export"]'),
    []
  );

  // Per-tool options popover (color swatches + stroke width slider). Clicking
  // a drawing tool sets the tool active AND surfaces this popover anchored to
  // the clicked button. The eraser flavour hides the color row (eraser ignores
  // color) and shows width only; select doesn't open the popover at all.
  // We track which tool's popover is open separately from `activeTool` so the
  // popover can be dismissed (outside click / Escape) without changing the
  // active tool.
  const [toolPopover, setToolPopover] = useState<ShapeTool | null>(null);
  const [toolPopoverAnchor, setToolPopoverAnchor] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const toolBarRef = useRef<HTMLDivElement>(null);
  // Hidden input that triggers the browser's native color picker for the
  // `+` custom-color button. We click the input programmatically rather than
  // rendering it visibly because the native swatch UI looks out of place
  // inside the dark popover.
  const customColorInputRef = useRef<HTMLInputElement>(null);
  // Snapshot of the TextObject currently being edited via TextEditorOverlay.
  // Stored locally (not in config.objects) until commit, so the editor can
  // position itself off the snapshot without round-tripping through Firestore.
  // Local (transient) state — never persisted; matches the selection-state
  // pattern documented in the Phase 2 design spec.
  const [editingText, setEditingText] = useState<TextObject | null>(null);
  // canvasRect drives the editor's positioning. We re-measure on commit/blur
  // boundaries and on canvas-size changes so the editor follows resizes.
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!editingText) return;
    const node = canvasRef.current;
    if (!node) return;
    setCanvasRect(node.getBoundingClientRect());
    // Re-measure on widget moves too — DraggableWindow lets the user drag a
    // widget while the editor is open; without `widget.x`/`widget.y` here
    // the editor would float over the canvas's old position.
  }, [editingText, widget.w, widget.h, widget.x, widget.y]);

  // Canvas internal resolution tracks the actual on-screen canvas wrapper.
  //
  // History: the legacy formula `widget.h - 40` hardcoded the old single-row
  // toolbar height. After the Phase 2 toolbar redesign the toolbar grew to
  // a 2-row, ~87px-tall surface — and `widget.h - 40` overshot by ~47px,
  // pushing the canvas DOM past its overflow-hidden wrapper (visually the
  // toolbar appeared to float in the middle of the widget).
  //
  // The fix is to stop guessing the toolbar height entirely: we measure the
  // canvas wrapper via ResizeObserver and feed its real dimensions into
  // canvasSize. Exports, text overlay positioning, and the SVG lasso
  // overlay all flow through this value so they stay aligned with the
  // visible canvas regardless of how the toolbar grows.
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperSize, setWrapperSize] = useState<{
    width: number;
    height: number;
  }>(() => ({ width: widget.w, height: Math.max(widget.h - 88, 0) }));
  useEffect(() => {
    const node = canvasWrapperRef.current;
    if (!node) return undefined;
    const update = () => {
      const r = node.getBoundingClientRect();
      // Skip zero-sized measurements. In jsdom (and on first paint before
      // layout has settled) `getBoundingClientRect` returns 0×0 — accepting
      // that would set the canvas to a 0-sized bitmap and break pointer
      // coordinate math. The initial widget-derived value remains in place
      // until the wrapper has a real layout box.
      if (r.width <= 0 || r.height <= 0) return;
      // Round to integer px to avoid sub-pixel jitter triggering re-renders
      // on every animation frame during a resize gesture.
      const next = {
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
      setWrapperSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const canvasSize = useMemo(() => {
    if (isStudentView) {
      // Student view sizes canvas to its container; fall back to widget dims.
      return { width: widget.w, height: widget.h };
    }
    return wrapperSize;
  }, [isStudentView, widget.w, widget.h, wrapperSize]);

  // Page-scoped sink: every command-stack apply (push / undo / redo) lands
  // here. The hook hands us a new `objects[]` for the active page.
  //
  // Phase 2 PR 2.6 — post-migration, object writes route to the subcollection
  // (one Firestore op per added/changed/removed object). Pre-migration, we
  // still write the whole `pages[]` block to the dashboard doc so the
  // widget stays functional during the migration window.
  //
  // The diff path matches React's reconciliation pattern: keyed by id,
  // we compute the (added, updated, removed) sets and dispatch one mutator
  // per. setDoc / deleteDoc are async but we don't await — Firestore's
  // optimistic listener will surface the new state through the subscription
  // anyway, and waiting would block the synchronous command-stack flow. On
  // failure, the snapshot will revert the canvas to the pre-write state, so
  // we surface an error toast so the user knows their change didn't persist.
  const onSubWriteError = useCallback(
    (err: unknown) => {
      logError('DrawingWidget.subcollectionWrite', err, {
        widgetId: widget.id,
      });
      addToast('Drawing change could not be saved.', 'error');
    },
    [addToast, widget.id]
  );
  const writeObjects = useCallback(
    (next: DrawableObject[]) => {
      if (config.subcollectionMigrated) {
        // Clear All path — route through the chunked batch-delete so a
        // 1000-object wipe ships as 3 batched commits instead of 1000
        // individual deletes.
        if (next.length === 0 && objects.length > 0) {
          subClearObjects().catch(onSubWriteError);
          return;
        }
        const prevById = new Map(objects.map((o) => [o.id, o]));
        const nextById = new Map(next.map((o) => [o.id, o]));
        // Removed: in prev but not in next.
        for (const [id] of prevById) {
          if (!nextById.has(id)) {
            subRemoveObject(id).catch(onSubWriteError);
          }
        }
        // Added or updated: walk next.
        for (const [id, obj] of nextById) {
          const prev = prevById.get(id);
          if (!prev) {
            subAddObject(obj).catch(onSubWriteError);
          } else if (prev !== obj) {
            subUpdateObject(obj).catch(onSubWriteError);
          }
        }
        return;
      }
      // Legacy path — single doc write of the whole page list.
      const nextPages = pages.map((p, i) =>
        i === currentPage ? { ...p, objects: next } : p
      );
      updateWidget(widget.id, {
        config: { ...config, pages: nextPages } as DrawingConfig,
      });
    },
    [
      updateWidget,
      widget.id,
      config,
      pages,
      currentPage,
      objects,
      subAddObject,
      subUpdateObject,
      subRemoveObject,
      subClearObjects,
      onSubWriteError,
    ]
  );

  // Partial-config writer used by `useDrawingPages` for navigation /
  // add / delete / reorder. Same single-write pattern as writeObjects.
  const updateConfig = useCallback(
    (partial: Partial<DrawingConfig>) => {
      updateWidget(widget.id, {
        config: { ...config, ...partial } as DrawingConfig,
      });
    },
    [updateWidget, widget.id, config]
  );

  const commandStack = useCommandStack({
    // Per-page stack keyed by page id. Switching pages surfaces that page's
    // independent undo/redo history; deleting a page calls `forgetPage` to
    // drop the corresponding record.
    pageKey: activePage.id,
    objects,
    onObjectsChange: writeObjects,
  });

  // When a page is deleted, drop the local command-stack history for it AND
  // (post-migration) batch-delete its Firestore subcollection. Without the
  // subcollection cleanup, the page-meta doc and all its child object docs
  // would linger forever even though the page is gone from the dashboard.
  //
  // Destructure `forgetPage` so the callback below only re-creates when
  // `forgetPage` itself changes (which is never — it's a stable useCallback
  // in useCommandStack). Depending on the whole `commandStack` object would
  // re-create this callback on every drawing stroke.
  const { forgetPage } = commandStack;
  const handlePageRemoved = useCallback(
    (removedPageId: string) => {
      forgetPage(removedPageId);
      if (!config.subcollectionMigrated) return;
      const uid = user?.uid;
      if (!uid || !dashboardId) return;
      deleteDrawingPageSubcollection({
        db,
        uid,
        dashboardId,
        widgetId: widget.id,
        pageId: removedPageId,
      }).catch((err: unknown) => {
        logError('DrawingWidget.deletePageSubcollection', err, {
          widgetId: widget.id,
          pageId: removedPageId,
        });
        addToast(
          'Page deleted, but cleanup failed in the background.',
          'error'
        );
      });
    },
    [
      forgetPage,
      config.subcollectionMigrated,
      user?.uid,
      dashboardId,
      widget.id,
      addToast,
    ]
  );

  const pageNav = useDrawingPages({
    config: { ...config, pages, currentPage },
    updateConfig,
    onPageRemoved: handlePageRemoved,
  });

  // Each create path (pen, shapes, image, text-first-commit) becomes a single
  // `add` command. The stack handles the array mutation + write.
  const pushAdd = useCallback(
    (obj: DrawableObject) => {
      commandStack.push({ kind: 'add', object: obj });
    },
    [commandStack]
  );

  // Text spawn: keep the empty TextObject in local state and open the editor.
  // We DON'T persist the empty object — it's added to `objects[]` only on
  // commit, so an Esc/blur-with-no-text leaves the dashboard untouched.
  const handleTextSpawn = (obj: TextObject) => {
    setEditingText(obj);
  };

  // Commit edited text content back into the objects array. The editor
  // hands us its final content (including the empty string); we apply the
  // empty-removes-object rule here so first-spawn vs re-edit get the right
  // semantics:
  //  - existing object + empty content  → remove (matches degenerate-shape rule)
  //  - existing object + non-empty      → update command
  //  - fresh spawn + empty content      → no-op (don't persist an empty obj)
  //  - fresh spawn + non-empty content  → add command
  const commitTextEdit = (next: TextObject) => {
    const existing = objects.find((o) => o.id === next.id);
    const isEmpty = next.content.trim() === '';
    if (existing) {
      if (isEmpty) {
        commandStack.push({ kind: 'remove', object: existing });
      } else {
        commandStack.push({ kind: 'update', before: existing, after: next });
      }
    } else if (!isEmpty) {
      commandStack.push({ kind: 'add', object: next });
    }
    // Fresh spawn + empty falls through with no command — the unsaved local
    // object simply vanishes when we clear editingText below.
    setEditingText(null);
  };

  // Explicit Escape cancel: discard the editor's content and leave the
  // persisted object untouched. Fresh spawns simply disappear (never
  // persisted). Existing objects keep their pre-edit content because the
  // editor's content was thrown away in `finalize(false)`.
  const cancelTextEdit = () => {
    setEditingText(null);
  };

  // Image insertion: one-shot pipeline shared by paste / drag-drop / picker.
  // Builds a fresh ImageObject once the upload finishes and stamps it into
  // the page via the standard append path. Tool selection is unchanged — the
  // toolbar Image button is a one-shot action, not a sticky mode (per spec).
  const handleImageReady = ({
    src,
    x,
    y,
    w,
    h,
  }: {
    src: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }) => {
    const obj: ImageObject = {
      id: crypto.randomUUID(),
      kind: 'image',
      z: nextZ(objects),
      x,
      y,
      w,
      h,
      src,
    };
    pushAdd(obj);
  };

  const {
    openPicker: openImagePicker,
    fileInputProps,
    handlePaste,
    handleDrop,
    handleDragOver,
    isUploading: isUploadingImage,
  } = useImageInsertion({
    canvasRef,
    onImageReady: handleImageReady,
  });

  // Selection preview: local-only override applied during a transform drag.
  // The persisted `objects[]` stays untouched until pointer-up commits, so a
  // 60fps drag produces one Firestore write instead of ~120/sec.
  const [previewObject, setPreviewObject] = useState<DrawableObject | null>(
    null
  );

  // Eraser-mode (object / lasso) transient state — analogous to the
  // pen/shape `previewObject` pattern: gesture state lives locally during
  // the drag and only commits to the command stack on pointer-up, producing
  // a single undo entry per gesture.
  //
  // `objectEraseQueueRef`: ids of objects the cursor has touched during the
  // current Object-erase drag. Tracked as a ref (not state) so we don't
  // re-render the canvas on every pointer move. Queued-objects visual
  // feedback (dimming) is a deliberate follow-up — requires plumbing the
  // queue IDs into the canvas render pipeline.
  const objectEraseQueueRef = useRef<Set<string>>(new Set());

  // Lasso polygon points accumulated during the current lasso-erase drag.
  // Rendered as an SVG overlay above the canvas (NOT on the canvas itself —
  // mixing transient UI with the persistent canvas pixel state would break
  // the incremental-render dirty-region logic). On pointer-up we run the
  // enclosure check and emit a single bulkRemove command.
  const [lassoPoints, setLassoPoints] = useState<Point[] | null>(null);

  const handleTransformPreview = (next: DrawableObject) => {
    setPreviewObject(next);
  };

  // Pointer-up commit: the selection hook hands us BOTH the post-gesture
  // object and the pre-gesture snapshot it captured at pointer-down. We turn
  // that pair into a single `update` command so a 60fps drag still produces
  // exactly one entry on the undo stack (and one Firestore write).
  const handleTransformCommit = (
    next: DrawableObject,
    before: DrawableObject
  ) => {
    setPreviewObject(null);
    commandStack.push({ kind: 'update', before, after: next });
  };

  const handleRemoveObject = (id: string) => {
    const target = objects.find((o) => o.id === id);
    if (!target) return;
    commandStack.push({ kind: 'remove', object: target });
  };

  const {
    selectedId,
    selectedObject,
    transformState,
    handleSelectPointerDown,
    handleSelectPointerMove,
    handleSelectPointerUp,
    handleKeyDown: handleSelectKeyDown,
    clearSelection,
  } = useSelection({
    objects,
    activeTool,
    onTransformPreview: handleTransformPreview,
    onTransformCommit: handleTransformCommit,
    onRemoveObject: handleRemoveObject,
    canvasRef,
  });

  // Selection chrome is cleared by `setActiveTool` directly when leaving the
  // Select tool — see the event-handler path below — so a state-sync effect
  // here is unnecessary.

  // Clear selection + transform preview on page switch. Selection state is
  // page-scoped — a selected object id on page 1 has no meaning on page 2,
  // and the transient `previewObject` from an in-flight drag must not bleed
  // across pages. Tracking `activePage.id` (not `currentPage`) survives
  // reorders cleanly.
  const [prevPageId, setPrevPageId] = useState(activePage.id);
  if (activePage.id !== prevPageId) {
    setPrevPageId(activePage.id);
    clearSelection();
    setPreviewObject(null);
  }

  const { handleStart, handleMove, handleEnd, isDrawing } = useDrawingCanvas({
    canvasRef,
    color,
    width,
    objects,
    onObjectComplete: pushAdd,
    onTextSpawn: handleTextSpawn,
    disabled: isStudentView,
    canvasSize,
    nextZ: nextZ(objects),
    activeTool,
    shapeFill,
    selectedObject,
    transformState: transformState ? { active: true } : null,
    previewObject,
  });

  // Pointer chooser: route to selection handlers when 'select' is active,
  // to draw handlers otherwise. Keeps the canvas a single event surface.
  const getCanvasPos = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isStudentView) return;
    if (activeTool === 'select') {
      handleSelectPointerDown(e, getCanvasPos(e));
      return;
    }
    // Eraser sub-modes (object / lasso) bypass the legacy pixel-stroke
    // path entirely — they operate on object identity, not canvas pixels.
    if (activeTool === 'eraser' && eraserMode === 'object') {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      handleObjectErasePointerDown(getCanvasPos(e));
      return;
    }
    if (activeTool === 'eraser' && eraserMode === 'lasso') {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      handleLassoPointerDown(getCanvasPos(e));
      return;
    }
    handleStart(e);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (isStudentView) return;
    if (activeTool === 'select') {
      handleSelectPointerMove(e, getCanvasPos(e));
      return;
    }
    if (activeTool === 'eraser' && eraserMode === 'object') {
      handleObjectErasePointerMove(getCanvasPos(e));
      return;
    }
    if (activeTool === 'eraser' && eraserMode === 'lasso') {
      handleLassoPointerMove(getCanvasPos(e));
      return;
    }
    handleMove(e);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (isStudentView) return;
    if (activeTool === 'select') {
      handleSelectPointerUp(e, getCanvasPos(e));
      return;
    }
    if (activeTool === 'eraser' && eraserMode === 'object') {
      handleObjectErasePointerUp();
      return;
    }
    if (activeTool === 'eraser' && eraserMode === 'lasso') {
      handleLassoPointerUp();
      return;
    }
    handleEnd();
  };

  // Clear All ships as a single bulk-remove command — one undo restores
  // every object. This is the user-visible regression from today's
  // irreversible clear and matches the design spec's deliberate choice.
  const clear = () => {
    if (objects.length === 0) return;
    commandStack.push({ kind: 'clear', objects: [...objects] });
  };

  const undo = () => {
    commandStack.undo();
  };

  const redo = () => {
    commandStack.redo();
  };

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo, Ctrl/Cmd+Y = redo (Windows
  // muscle memory alias). The wrapper's existing handler (`handleSelectKeyDown`)
  // still receives the event for Backspace/Delete/Arrow nudges; we delegate
  // to it for anything that isn't an undo/redo shortcut.
  const handleWrapperKeyDown = (e: React.KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (isMod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (isMod && key === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    handleSelectKeyDown(e);
  };

  // --- Export helpers (Wave 7) ---
  // The actions cluster surfaces three exports: current-page PNG (cheapest —
  // uses the live canvas's `toDataURL`), all-pages PNG (one offscreen render
  // per page → N separate downloads), and PDF (offscreen renders → browser
  // print dialog). Selection chrome is cleared before any PNG export so the
  // dashed bbox doesn't bleed into the saved file.
  const exportFilenameStem = () => {
    // ISO timestamp with `:` and `.` replaced so the filename is valid on
    // every OS — also collision-free if a teacher exports the same widget
    // twice in one session.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `Whiteboard-${timestamp}`;
  };

  const handleExportCurrentPng = async () => {
    closeExportMenu();
    try {
      setIsExporting(true);
      // Route through the offscreen-render path so the background template
      // (which lives as a CSS div on the live canvas) gets baked into pixels.
      // Selection chrome is never on the offscreen canvas so we don't need
      // to clear selection first.
      const dataUrl = await exportPagePng(activePage, {
        w: canvasSize.width,
        h: canvasSize.height,
      });
      downloadDataUrl(
        dataUrl,
        `${exportFilenameStem()}-page-${currentPage + 1}.png`
      );
      addToast('Page exported as PNG', 'success');
    } catch (e) {
      console.error('PNG export failed:', e);
      addToast('Failed to export page.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAllPng = async () => {
    closeExportMenu();
    if (pages.length === 0) return;
    try {
      setIsExporting(true);
      const dataUrls = await exportAllPagesPng(pages, {
        w: canvasSize.width,
        h: canvasSize.height,
      });
      dataUrls.forEach((url, idx) => {
        if (!url) return;
        downloadDataUrl(url, `${exportFilenameStem()}-page-${idx + 1}.png`);
      });
      addToast(`${dataUrls.length} pages exported`, 'success');
    } catch (e) {
      console.error('All-pages PNG export failed:', e);
      addToast('Failed to export pages.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    closeExportMenu();
    if (pages.length === 0) return;
    try {
      setIsExporting(true);
      // PDF export goes through the browser print dialog (one-shot OS-level
      // "Save as PDF"); the dialog owns the final filename so we no longer
      // pass one in.
      await exportPdf(pages, { w: canvasSize.width, h: canvasSize.height });
    } catch (e) {
      console.error('PDF export failed:', e);
      const message =
        e instanceof Error && /blocked/i.test(e.message)
          ? 'Please allow pop-ups to export as PDF.'
          : 'Failed to export PDF.';
      addToast(message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const closeExportMenu = useCallback(() => {
    setIsExportMenuOpen(false);
    setExportMenuAnchor(null);
  }, []);

  const closeToolPopover = useCallback(() => {
    setToolPopover(null);
    setToolPopoverAnchor(null);
  }, []);

  const openExportMenu = useCallback(() => {
    const trigger = getExportTrigger();
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setIsExportMenuOpen(true);
    setExportMenuAnchor({
      bottom: window.innerHeight - rect.top + 4,
      right: window.innerWidth - rect.right,
    });
  }, [getExportTrigger]);

  // Recompute anchor on scroll/resize so the portalled popover follows the
  // trigger when the user pans the dashboard or the dock collapses. Mirrors
  // the PageStrip kebab pattern.
  useEffect(() => {
    if (!isExportMenuOpen) return undefined;
    const onScrollOrResize = () => {
      const trigger = getExportTrigger();
      if (!trigger) {
        closeExportMenu();
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setExportMenuAnchor({
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      });
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isExportMenuOpen, closeExportMenu, getExportTrigger]);

  // Close the export popover on outside click OR Escape. The trigger button
  // is the only `aria-label="Export"` button on the page; clicks on it are
  // already handled by its own onClick toggle, so they bypass this listener
  // via the contains() check below.
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const popup = document.getElementById('drawing-export-popover');
      if (popup?.contains(target)) return;
      if (getExportTrigger()?.contains(target)) return;
      closeExportMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Gate on `editingText == null` so Escape inside the text editor
        // cancels the edit rather than racing the popover dismissal. The
        // editor's synthetic stopPropagation does NOT stop native window
        // listeners on the same native event — this gate is the
        // authoritative belt + suspenders.
        if (editingText) return;
        e.stopPropagation();
        closeExportMenu();
        // Return focus to the trigger so keyboard users land somewhere
        // sensible.
        (getExportTrigger() as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isExportMenuOpen, editingText, closeExportMenu, getExportTrigger]);

  // Tool-popover anchor refresh: when the toolbar moves (widget drag, dock
  // collapse, dashboard pan), the captured `getBoundingClientRect` goes
  // stale. We re-measure the originating tool button on scroll/resize and
  // close the popover if the trigger is gone (e.g. tool was removed).
  useEffect(() => {
    if (!toolPopover) return undefined;
    const findTrigger = () =>
      toolBarRef.current?.querySelector<HTMLButtonElement>(
        `button[data-tool="${toolPopover}"]`
      );
    const onScrollOrResize = () => {
      const trigger = findTrigger();
      if (!trigger) {
        closeToolPopover();
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setToolPopoverAnchor({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
      });
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [toolPopover, closeToolPopover]);

  // Outside-click + Escape dismiss for the tool popover. Clicks on the
  // originating tool button bypass this listener (the button's own onClick
  // toggles the popover); clicks inside the popover (color swatches, slider,
  // custom-color input) also bypass via contains().
  useEffect(() => {
    if (!toolPopover) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const popup = document.getElementById('drawing-tool-popover');
      if (popup?.contains(target)) return;
      const trigger = toolBarRef.current?.querySelector(
        `button[data-tool="${toolPopover}"]`
      );
      if (trigger?.contains(target)) return;
      closeToolPopover();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Same belt-and-suspenders gate as the export popover: don't race the
      // text editor's own Escape handler.
      if (editingText) return;
      e.stopPropagation();
      closeToolPopover();
      const trigger = toolBarRef.current?.querySelector<HTMLButtonElement>(
        `button[data-tool="${toolPopover}"]`
      );
      trigger?.focus();
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [toolPopover, editingText, closeToolPopover]);

  const handleSendToText = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setIsExtracting(true);
      addToast('Scanning handwriting...', 'info');
      const dataUrl = canvas.toDataURL('image/png');
      const extractedText = await extractTextWithGemini(dataUrl);

      if (!extractedText || !extractedText.trim()) {
        addToast('No text could be extracted.', 'info');
        return;
      }

      const safeText = extractedText
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br/>');

      const existingTextWidget = activeDashboard?.widgets.find(
        (w) => w.type === 'text'
      );

      if (existingTextWidget) {
        const currentConfig = existingTextWidget.config as TextConfig;
        const newContent = currentConfig.content
          ? `${currentConfig.content}<br><br>${safeText}`
          : safeText;

        updateWidget(existingTextWidget.id, {
          config: {
            ...currentConfig,
            content: newContent,
          },
        });
        addToast('Appended text to notes!', 'success');
      } else {
        addWidget('text', {
          x: widget.x + widget.w + 20,
          y: widget.y,
          w: 400,
          h: 300,
          config: {
            content: safeText,
          } as TextConfig,
        });
        addToast('Created new note with text!', 'success');
      }
    } catch (error) {
      console.error('OCR Error:', error);
      addToast('Failed to extract text.', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const setActiveTool = (tool: ShapeTool) => {
    // Leaving Select clears selection chrome so it doesn't linger after the
    // user picks Pen/Rect/etc. Done synchronously in the handler — no
    // useEffect needed because the event already knows the new tool.
    if (tool !== 'select') clearSelection();
    updateWidget(widget.id, {
      config: { ...config, activeTool: tool } as DrawingConfig,
    });
  };

  const handleToolClick = (
    tool: ShapeTool,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    setActiveTool(tool);
    // Select gets no popover — it has no color/width options.
    if (tool === 'select') {
      closeToolPopover();
      return;
    }
    // Re-clicking the same tool whose popover is already open closes it.
    if (toolPopover === tool) {
      closeToolPopover();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Position popover ABOVE the trigger (the tool buttons live in the
    // toolbar at the bottom of the widget; opening upward keeps the popover
    // visible without extending past the widget). 8px of breathing room.
    setToolPopover(tool);
    setToolPopoverAnchor({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8,
    });
  };

  const setColor = (next: string) => {
    updateWidget(widget.id, {
      config: { ...config, color: next } as DrawingConfig,
    });
  };

  const setWidth = (px: number) => {
    updateWidget(widget.id, {
      config: { ...config, width: px } as DrawingConfig,
    });
  };

  const setEraserMode = (mode: EraserMode) => {
    updateWidget(widget.id, {
      config: { ...config, eraserMode: mode } as DrawingConfig,
    });
  };

  // Object-erase pointer handlers. Each pointer event hit-tests the cursor
  // against every object and queues any hit for deletion. Commit on
  // pointer-up: single `bulkRemove` command → one undo restores everything.
  const handleObjectErasePointerDown = (p: Point) => {
    objectEraseQueueRef.current = new Set();
    queueObjectEraseHits(p);
  };
  const handleObjectErasePointerMove = (p: Point) => {
    queueObjectEraseHits(p);
  };
  const handleObjectErasePointerUp = () => {
    const ids = objectEraseQueueRef.current;
    objectEraseQueueRef.current = new Set();
    if (ids.size === 0) return;
    const removed = objects.filter((o) => ids.has(o.id));
    if (removed.length === 0) return;
    commandStack.push({ kind: 'bulkRemove', objects: removed });
  };
  const queueObjectEraseHits = (p: Point) => {
    for (const obj of objects) {
      if (objectEraseQueueRef.current.has(obj.id)) continue;
      if (hitTestObject(obj, p)) {
        objectEraseQueueRef.current.add(obj.id);
      }
    }
  };

  // Lasso-erase pointer handlers. Accumulate polygon points during drag,
  // render as an SVG overlay. On pointer-up: hit-test all objects against
  // the polygon (fully enclosed = all 4 bbox corners inside) and emit one
  // bulkRemove command for the enclosed set. A trivial polygon (< 3 pts)
  // is dropped silently — matches the "click without dragging" no-op
  // convention used by the selection marquee.
  const handleLassoPointerDown = (p: Point) => {
    setLassoPoints([p]);
  };
  const handleLassoPointerMove = (p: Point) => {
    setLassoPoints((prev) => (prev ? [...prev, p] : [p]));
  };
  const handleLassoPointerUp = () => {
    const poly = lassoPoints;
    setLassoPoints(null);
    if (!poly || poly.length < 3) return;
    const enclosed = objects.filter((o) => isObjectEnclosedByPolygon(o, poly));
    if (enclosed.length === 0) return;
    commandStack.push({ kind: 'bulkRemove', objects: enclosed });
  };

  // Shared classes for the row-2 action chips (undo / redo / clear / image /
  // export / extract). Keeps the visual rhythm consistent and disabled-state
  // contrast legible on the dark glass surface.
  const actionBtnBase =
    'w-7 h-7 rounded-md flex items-center justify-center transition-colors text-slate-200 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

  const PaletteUI = (
    <div ref={toolBarRef} className="flex flex-col gap-1.5 px-2 py-2">
      {/* Row 1 — tool segmented control. One row, full width. Uses
          aria-pressed (not role=radiogroup) so the Pen/Text/etc. buttons
          remain individually tabbable and Space/Enter activates them
          natively. */}
      <div
        role="group"
        aria-label="Drawing tool"
        className="flex w-full items-stretch gap-0.5 rounded-lg bg-slate-950/40 p-1 ring-1 ring-white/5"
      >
        {TOOL_BUTTONS.map(({ tool, Icon, label }) => {
          const isActive = activeTool === tool;
          // Each drawing tool also reflects whether its options popover is
          // currently open via `aria-expanded`; select stays a plain toggle.
          const hasPopover = tool !== 'select';
          return (
            <button
              key={tool}
              type="button"
              aria-pressed={isActive}
              aria-expanded={hasPopover ? toolPopover === tool : undefined}
              data-tool={tool}
              onClick={(e) => handleToolClick(tool, e)}
              className={`flex-1 h-7 rounded-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
                isActive
                  ? 'bg-brand-blue-primary text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
              title={label}
              aria-label={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Row 2 — actions only. Color and stroke width moved into the per-tool
          popover (anchored to the pen/eraser/shape button that opens it), so
          this row stays compact and never wraps. */}
      <div className="flex items-center gap-2">
        {/* History group — undo / redo / clear. Clear gets a destructive
            red tint on hover but lives with the history actions, not the
            color picker (where it used to read as a sixth swatch). */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={undo}
            disabled={!commandStack.canUndo}
            title="Undo"
            aria-label="Undo"
            className={actionBtnBase}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!commandStack.canRedo}
            title="Redo"
            aria-label="Redo"
            className={actionBtnBase}
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={objects.length === 0}
            title="Clear All"
            aria-label="Clear All"
            className={`${actionBtnBase} hover:!bg-red-500/20 hover:text-red-300`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* I/O group — insert image + export. Both are one-shot actions;
            export still opens the existing portalled popover. */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={openImagePicker}
            disabled={isUploadingImage}
            title="Insert image"
            aria-label="Insert image"
            className={actionBtnBase}
          >
            {isUploadingImage ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full motion-safe:animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
          </button>

          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              onClick={() =>
                isExportMenuOpen ? closeExportMenu() : openExportMenu()
              }
              disabled={isExporting || pages.length === 0}
              title="Export"
              aria-label="Export"
              aria-expanded={isExportMenuOpen}
              className={actionBtnBase}
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full motion-safe:animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
            {isExportMenuOpen &&
              exportMenuAnchor &&
              // Portal into document.body so the widget's `overflow-hidden`
              // wrapper can't clip the popover (same pattern as PageStrip's
              // kebab). Positioning is `fixed` against the viewport,
              // anchored to the trigger's `getBoundingClientRect` captured
              // at open time and updated on scroll/resize.
              createPortal(
                <div
                  id="drawing-export-popover"
                  data-testid="drawing-export-popover"
                  data-widget-portal=""
                  className="fixed z-[2147483600] min-w-[200px] bg-white shadow-lg border border-slate-200 rounded-lg overflow-hidden"
                  style={{
                    bottom: `${exportMenuAnchor.bottom}px`,
                    right: `${exportMenuAnchor.right}px`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleExportCurrentPng()}
                    disabled={isExporting}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Export PNG (this page)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportAllPng()}
                    disabled={isExporting || pages.length <= 1}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Export PNG (all pages)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    disabled={isExporting}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 border-t border-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Export PDF
                  </button>
                </div>,
                document.body
              )}
          </div>

          {canAccessFeature('gemini-functions') && (
            <button
              type="button"
              onClick={() => void handleSendToText()}
              disabled={isExtracting}
              title="Extract Text (AI)"
              aria-label="Extract Text (AI)"
              className={actionBtnBase}
            >
              {isExtracting ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full motion-safe:animate-spin" />
              ) : (
                <Type className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Page control — pushed to the right with `ml-auto` so the multi-
            page chevrons + counter live opposite the history group. When
            there's only one page this collapses to a single "Add page"
            button (still right-aligned). The PageStrip component handles
            its own visual states; we just give it room. */}
        <div className="ml-auto flex items-center">
          <PageStrip
            pages={pageNav.pages}
            currentPage={pageNav.currentPage}
            onSelectPage={pageNav.goToPage}
            onAddPage={pageNav.addPage}
            onDeletePage={pageNav.removePage}
            onRenamePage={pageNav.renamePage}
            activePageObjects={objects}
            subcollectionMigrated={config.subcollectionMigrated}
          />
        </div>
      </div>

      {/* Hidden input that backs the `+` custom-color button in the tool
          popover. Lives on the toolbar (always mounted) so its click handler
          and value stay stable across popover open/close cycles. */}
      <input
        ref={customColorInputRef}
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        // sr-only keeps the input in the accessibility tree (label
        // announces correctly) while hiding it visually.
        className="sr-only"
        aria-label="Custom color"
        tabIndex={-1}
      />

      {/* Per-tool options popover (color swatches + stroke width slider).
          Portalled into document.body so the widget's `overflow-hidden`
          shell can't clip it — same pattern as the export popover. */}
      {toolPopover &&
        toolPopoverAnchor &&
        createPortal(
          <div
            id="drawing-tool-popover"
            data-testid="drawing-tool-popover"
            data-widget-portal=""
            role="dialog"
            aria-label={`${toolPopover === 'eraser' ? 'Eraser' : 'Tool'} options`}
            className="fixed z-[2147483600] w-[260px] rounded-xl bg-slate-900/95 backdrop-blur-md shadow-xl border border-white/10 p-3"
            style={{
              bottom: `${toolPopoverAnchor.bottom}px`,
              left: `${toolPopoverAnchor.left}px`,
            }}
          >
            {/* Eraser mode selector — surfaced only when the eraser popover
                is open. Three modes (stroke / object / lasso) share the same
                visual treatment as the tool segmented control above so the
                pattern feels consistent. */}
            {toolPopover === 'eraser' && (
              <div
                role="group"
                aria-label="Eraser mode"
                className="flex items-stretch gap-0.5 rounded-lg bg-slate-950/60 p-1 ring-1 ring-white/5 mb-3"
              >
                {(
                  [
                    { mode: 'stroke', Icon: Eraser, label: 'Stroke eraser' },
                    {
                      mode: 'object',
                      Icon: MousePointerClick,
                      label: 'Object eraser',
                    },
                    { mode: 'lasso', Icon: Lasso, label: 'Lasso eraser' },
                  ] as const
                ).map(({ mode, Icon, label }) => {
                  const isActive = eraserMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setEraserMode(mode)}
                      className={`flex-1 h-8 rounded-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
                        isActive
                          ? 'bg-brand-blue-primary text-white shadow-sm'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                      title={label}
                      aria-label={label}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Color row — hidden when the eraser popover is showing
                (eraser ignores stroke color). `justify-between` spreads the
                5 swatches + custom button across the full popover width so
                the row visually aligns edge-to-edge with the slider row
                below it (no awkward trailing gap on the right). */}
            {toolPopover !== 'eraser' && (
              <div className="flex items-center justify-between mb-3">
                {customColors.map((c) => {
                  const isActive = color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                        isActive
                          ? 'ring-2 ring-white scale-110 shadow-sm'
                          : 'ring-1 ring-white/20 hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                      title={`Color ${c}`}
                    />
                  );
                })}
                {/* Custom color trigger — opens the native color picker via
                    the hidden input on the toolbar. */}
                <button
                  type="button"
                  onClick={() => customColorInputRef.current?.click()}
                  className="w-6 h-6 rounded-full flex items-center justify-center bg-slate-800/60 ring-1 ring-white/20 text-slate-300 hover:bg-slate-700/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  title="Custom color"
                  aria-label="Pick a custom color"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    +
                  </span>
                </button>
              </div>
            )}

            {/* Stroke width slider — full 1–80px range, matched to the
                Settings panel. The thumb preview on the left shows the
                current width as a filled dot the user can eyeball before
                drawing; the visual is capped at 28px so a really chunky
                stroke doesn't overflow the popover, while the px count
                still tells the truth. Hidden for the Lasso eraser
                (selection-by-region, not by hit radius). */}
            {!(toolPopover === 'eraser' && eraserMode === 'lasso') && (
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="block rounded-full bg-white shrink-0"
                  style={{
                    width: `${Math.max(4, Math.min(28, width))}px`,
                    height: `${Math.max(4, Math.min(28, width))}px`,
                  }}
                />
                <input
                  type="range"
                  min={1}
                  max={80}
                  step={1}
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value, 10))}
                  aria-label="Stroke width"
                  className="flex-1 h-1.5 rounded-full bg-slate-700 appearance-none cursor-pointer accent-brand-blue-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
                />
                <span className="font-mono text-xs text-slate-300 w-10 text-right tabular-nums">
                  {width}px
                </span>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );

  // Double-click any existing TextObject to re-enter edit mode. This is the
  // only double-click gesture in the widget; full hit-testing lands in Wave 4.
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isStudentView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    // Iterate top-to-bottom (highest z first) so the front-most text wins.
    // Use the shared `hitTestObject` instead of a raw AABB check — text
    // objects can be rotated, and the renderer/selection pipeline already
    // honors `obj.rotation` via reverse-rotate-around-bbox-center. An AABB
    // here would produce false positives (clicks in the AABB but outside
    // the rotated visual) and false negatives (clicks in the rotated
    // visual but outside the AABB).
    const texts = objects.filter((o): o is TextObject => o.kind === 'text');
    const sorted = [...texts].sort((a, b) => b.z - a.z);
    const hit = sorted.find((o) => hitTestObject(o, { x: px, y: py }));
    if (hit) setEditingText(hit);
  };

  // Cursor follows the active tool: 'select' uses a default pointer so the
  // resize/rotation handles read as clickable; everything else uses the
  // crosshair the freehand tools have always used.
  const cursorClass = isStudentView
    ? ''
    : activeTool === 'select'
      ? 'cursor-default'
      : 'cursor-crosshair';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        ref={canvasWrapperRef}
        // `ring-inset` (not `ring-offset`) is deliberate: this wrapper has
        // `overflow-hidden` and the canvas fills its interior, so an
        // offset ring would be clipped away by the parent. The inset ring
        // sits on the inside edge of the wrapper and stays visible.
        className={`flex-1 relative ${
          isStudentView ? 'bg-transparent' : 'bg-white/5'
        } overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${cursorClass}`}
        // tabIndex makes the wrapper focusable so React's synthetic `paste`
        // and `keydown` events fire here. Required for Backspace/Delete and
        // arrow nudges to reach the selection hook without a focused child.
        tabIndex={isStudentView || isMigratingSubcollection ? undefined : 0}
        onPaste={
          isStudentView || isMigratingSubcollection ? undefined : handlePaste
        }
        onDrop={
          isStudentView || isMigratingSubcollection ? undefined : handleDrop
        }
        onDragOver={
          isStudentView || isMigratingSubcollection ? undefined : handleDragOver
        }
        onKeyDown={
          isStudentView || isMigratingSubcollection
            ? undefined
            : handleWrapperKeyDown
        }
        data-selected-id={selectedId ?? ''}
      >
        {/* Background template layer (Wave 7). A sibling div BELOW the
            canvas — keeps the canvas pixel data clean (no full repaint on
            template change) and lets the user-chosen dashboard background
            bleed through "blank" pages. Bake-into-pixels happens only at
            export time via `paintBackground` in exportCanvas.ts. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={getBackgroundStyle(
            activePage.background ??
              config.background ??
              DRAWING_DEFAULTS.BACKGROUND
          )}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onDoubleClick={handleCanvasDoubleClick}
          // Explicit width/height: 100% is required for <canvas>. Tailwind's
          // `inset-0` sets top/right/bottom/left to 0, but a <canvas> with
          // HTML width/height attributes (set by useDrawingCanvas to match
          // canvasSize) reports those as its intrinsic CSS size and ignores
          // the inset-based height calculation. The 100% style forces CSS
          // to fill the wrapper regardless of the bitmap-resolution attrs.
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none' }}
        />
        {/* Lasso preview overlay — SVG above the canvas, in canvas-pixel
            coordinates via viewBox. pointer-events:none so the canvas
            still receives the in-flight drag events that build this
            polygon. Rendered only while a lasso gesture is active. */}
        {lassoPoints && lassoPoints.length > 0 && (
          <svg
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={lassoPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(99, 102, 241, 0.12)"
              stroke="rgb(99, 102, 241)"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {/* Loading state — only shown while the subcollection subscription
            is hydrating its first snapshot. Keeps the toolbar / page strip
            interactive (a teacher can switch tools and pages while waiting)
            but suppresses the empty-state hint so it doesn't briefly flash
            "draw here" before the snapshot lands. */}
        {config.subcollectionMigrated && objectsLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full motion-safe:animate-spin opacity-50" />
          </div>
        )}
        {objects.length === 0 &&
          !isDrawing &&
          !(config.subcollectionMigrated && objectsLoading) && (
            // Empty state: a pencil icon + visible "Start drawing" label.
            // The wrapping div is `pointer-events-none` so it never blocks
            // canvas pointer input — that's why we use a static label
            // instead of a `title` tooltip (a tooltip requires hover, which
            // pointer-events-none prevents). The label is self-describing
            // so no `aria-label` on the container is needed.
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none text-slate-400">
              <Pencil className="w-8 h-8 opacity-20" aria-hidden />
              <span className="text-sm font-medium opacity-60 select-none">
                Start drawing
              </span>
            </div>
          )}
        {editingText && canvasRect && (
          <TextEditorOverlay
            object={editingText}
            canvasRect={canvasRect}
            canvasSize={canvasSize}
            onCommit={commitTextEdit}
            onCancel={cancelTextEdit}
          />
        )}
        {/* Subcollection-migration lock (Phase 2 PR 2.6). pointer-events:
            auto on this overlay swallows clicks/drags so they never reach
            the canvas underneath — closes the data-loss race where strokes
            on the legacy `pages[].objects[]` path get dropped when
            `subcollectionMigrated: true` flips and the widget switches to
            reading from the subcollection. */}
        {isMigratingSubcollection && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm text-white"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full motion-safe:animate-spin" />
              <span className="text-sm font-medium select-none">
                Migrating drawing…
              </span>
            </div>
          </div>
        )}
        {!isStudentView && <input {...fileInputProps} />}
      </div>
      {!isStudentView && (
        <div className="shrink-0 border-t border-white/10 bg-slate-900/70 backdrop-blur-md">
          {PaletteUI}
        </div>
      )}
    </div>
  );
};
