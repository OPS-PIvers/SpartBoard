import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  DrawableObject,
  DrawingConfig,
  ImageObject,
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
  MousePointer2,
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
import { PageStrip } from './PageStrip';
import { extractTextWithGemini } from '@/utils/ai';
import { useAuth } from '@/context/useAuth';
import { Button } from '@/components/common/Button';
import { STANDARD_COLORS } from '@/config/colors';
import { DRAWING_DEFAULTS } from './constants';
import { useDrawingCanvas } from './useDrawingCanvas';
import { migrateDrawingConfig, nextZ } from '@/utils/migrateDrawingConfig';
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
  { tool: 'text', Icon: TypeOutline, label: 'Text' },
  { tool: 'pen', Icon: Pencil, label: 'Pen' },
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
  const { updateWidget, activeDashboard, addToast, addWidget } = useDashboard();
  const { canAccessFeature } = useAuth();

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

  // Canvas internal resolution follows the widget (minus header) in window mode,
  // or the parent container in student view.
  const canvasSize = useMemo(() => {
    if (isStudentView) {
      // Student view sizes canvas to its container; fall back to widget dims.
      return { width: widget.w, height: widget.h };
    }
    return { width: widget.w, height: Math.max(widget.h - 40, 0) };
  }, [isStudentView, widget.w, widget.h]);

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
  // anyway, and waiting would block the synchronous command-stack flow.
  const writeObjects = useCallback(
    (next: DrawableObject[]) => {
      if (config.subcollectionMigrated) {
        // Clear All path — route through the chunked batch-delete so a
        // 1000-object wipe ships as 3 batched commits instead of 1000
        // individual deletes.
        if (next.length === 0 && objects.length > 0) {
          void subClearObjects();
          return;
        }
        const prevById = new Map(objects.map((o) => [o.id, o]));
        const nextById = new Map(next.map((o) => [o.id, o]));
        // Removed: in prev but not in next.
        for (const [id] of prevById) {
          if (!nextById.has(id)) {
            void subRemoveObject(id);
          }
        }
        // Added or updated: walk next.
        for (const [id, obj] of nextById) {
          const prev = prevById.get(id);
          if (!prev) {
            void subAddObject(obj);
          } else if (prev !== obj) {
            void subUpdateObject(obj);
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

  const pageNav = useDrawingPages({
    config: { ...config, pages, currentPage },
    updateConfig,
    onPageRemoved: commandStack.forgetPage,
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
  });

  // Clear selection whenever the user switches off the Select tool. Without
  // this, selection chrome lingers after the user clicks Pen/Rect/etc.
  useEffect(() => {
    if (activeTool !== 'select') clearSelection();
  }, [activeTool, clearSelection]);

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
    handleStart(e);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (isStudentView) return;
    if (activeTool === 'select') {
      handleSelectPointerMove(e, getCanvasPos(e));
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
    setIsExportMenuOpen(false);
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
    setIsExportMenuOpen(false);
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
    setIsExportMenuOpen(false);
    if (pages.length === 0) return;
    try {
      setIsExporting(true);
      await exportPdf(
        pages,
        { w: canvasSize.width, h: canvasSize.height },
        `${exportFilenameStem()}.pdf`
      );
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

  // Close the export popover on outside click OR Escape. Mirrors the
  // click-outside pattern used elsewhere in the app; kept inline (rather
  // than reaching for `useClickOutside`) because this is the only popover
  // in the widget. Escape additionally restores focus to the trigger
  // button (the only direct <button> child of `exportMenuRef`).
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const node = exportMenuRef.current;
      if (node && !node.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsExportMenuOpen(false);
        // Return focus to the trigger so keyboard users land somewhere
        // sensible — the standard ARIA-menu dismissal pattern.
        const trigger = exportMenuRef.current?.querySelector(
          'button[aria-haspopup="menu"]'
        );
        (trigger as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isExportMenuOpen]);

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
    updateWidget(widget.id, {
      config: { ...config, activeTool: tool } as DrawingConfig,
    });
  };

  const isErasing = activeTool === 'eraser';

  const PaletteUI = (
    <div className="flex flex-wrap items-center gap-2 p-2">
      {/* Toggle-button group (not radiogroup) — tools are modes, and the
          button + aria-pressed pattern gives us native Tab/Space/Enter
          keyboard handling without the roving-tabindex machinery that a
          true radiogroup requires. */}
      <div
        role="group"
        aria-label="Drawing tool"
        className="flex gap-1 bg-slate-100 p-1 rounded-lg"
      >
        {TOOL_BUTTONS.map(({ tool, Icon, label }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={activeTool === tool}
            onClick={() => setActiveTool(tool)}
            className={`w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              activeTool === tool
                ? 'ring-2 ring-indigo-500'
                : 'hover:bg-slate-50'
            }`}
            title={label}
            aria-label={label}
          >
            <Icon className="w-4 h-4 text-slate-600" />
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-slate-200 mx-1" />

      <div
        className={`flex gap-1 bg-slate-100 p-1 rounded-lg transition-opacity ${
          isErasing ? 'opacity-50 pointer-events-none' : ''
        }`}
        aria-hidden={isErasing}
      >
        {customColors.map((c) => (
          <button
            key={c}
            onClick={() =>
              updateWidget(widget.id, {
                config: { ...config, color: c } as DrawingConfig,
              })
            }
            className={`w-6 h-6 rounded-md transition-all ${color === c ? 'scale-110 shadow-sm ring-2 ring-indigo-500' : 'hover:scale-105'}`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>

      <div className="h-6 w-px bg-slate-200 mx-1" />

      <Button
        onClick={undo}
        title="Undo"
        aria-label="Undo"
        variant="ghost"
        size="icon"
        disabled={!commandStack.canUndo}
        icon={<Undo2 className="w-4 h-4" />}
      />
      <Button
        onClick={redo}
        title="Redo"
        aria-label="Redo"
        variant="ghost"
        size="icon"
        disabled={!commandStack.canRedo}
        icon={<Redo2 className="w-4 h-4" />}
      />
      <Button
        onClick={clear}
        title="Clear All"
        variant="ghost-danger"
        size="icon"
        disabled={objects.length === 0}
        icon={<Trash2 className="w-4 h-4" />}
      />

      <Button
        onClick={openImagePicker}
        disabled={isUploadingImage}
        title="Insert image"
        aria-label="Insert image"
        variant="ghost"
        size="icon"
        icon={
          isUploadingImage ? (
            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )
        }
      />

      <div ref={exportMenuRef} className="relative">
        <Button
          onClick={() => setIsExportMenuOpen((v) => !v)}
          disabled={isExporting || pages.length === 0}
          title="Export"
          aria-label="Export"
          aria-haspopup="menu"
          aria-expanded={isExportMenuOpen}
          variant="ghost"
          size="icon"
          icon={
            isExporting ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )
          }
        />
        {isExportMenuOpen && (
          <div
            role="menu"
            className="absolute right-0 bottom-full mb-2 min-w-[200px] bg-white shadow-lg border border-slate-200 rounded-lg overflow-hidden z-50"
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => void handleExportCurrentPng()}
              disabled={isExporting}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export PNG (this page)
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => void handleExportAllPng()}
              disabled={isExporting || pages.length <= 1}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export PNG (all pages)
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isExporting}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 border-t border-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export PDF
            </button>
          </div>
        )}
      </div>

      {canAccessFeature('gemini-functions') && (
        <>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <Button
            onClick={() => void handleSendToText()}
            disabled={isExtracting}
            variant="ghost"
            size="icon"
            title="Extract Text (AI)"
            icon={
              isExtracting ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Type className="w-4 h-4" />
              )
            }
          />
        </>
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
    const texts = objects.filter((o): o is TextObject => o.kind === 'text');
    const sorted = [...texts].sort((a, b) => b.z - a.z);
    const hit = sorted.find(
      (o) => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h
    );
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
        className={`flex-1 relative ${
          isStudentView ? 'bg-transparent' : 'bg-white/5'
        } overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset ${cursorClass}`}
        // tabIndex makes the wrapper focusable so React's synthetic `paste`
        // and `keydown` events fire here. Required for Backspace/Delete and
        // arrow nudges to reach the selection hook without a focused child.
        tabIndex={isStudentView ? undefined : 0}
        onPaste={isStudentView ? undefined : handlePaste}
        onDrop={isStudentView ? undefined : handleDrop}
        onDragOver={isStudentView ? undefined : handleDragOver}
        onKeyDown={isStudentView ? undefined : handleWrapperKeyDown}
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
          className="absolute inset-0"
          style={{ touchAction: 'none' }}
        />
        {/* Loading state — only shown while the subcollection subscription
            is hydrating its first snapshot. Keeps the toolbar / page strip
            interactive (a teacher can switch tools and pages while waiting)
            but suppresses the empty-state hint so it doesn't briefly flash
            "draw here" before the snapshot lands. */}
        {config.subcollectionMigrated && objectsLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin opacity-50" />
          </div>
        )}
        {objects.length === 0 &&
          !isDrawing &&
          !(config.subcollectionMigrated && objectsLoading) && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400"
              title="Start drawing"
              aria-label="Start drawing"
            >
              <Pencil className="w-8 h-8 opacity-20" aria-hidden />
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
        {!isStudentView && <input {...fileInputProps} />}
      </div>
      {!isStudentView && (
        <div className="shrink-0 border-t border-white/20 bg-white/20 backdrop-blur-sm">
          {PaletteUI}
        </div>
      )}
      {!isStudentView && (
        <PageStrip
          pages={pageNav.pages}
          currentPage={pageNav.currentPage}
          onSelectPage={pageNav.goToPage}
          onAddPage={pageNav.addPage}
          onDeletePage={pageNav.removePage}
          onMovePage={(idx, dir) =>
            dir === 'left'
              ? pageNav.movePageLeft(idx)
              : pageNav.movePageRight(idx)
          }
        />
      )}
    </div>
  );
};
