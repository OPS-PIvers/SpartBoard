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
import { extractTextWithGemini } from '@/utils/ai';
import { useAuth } from '@/context/useAuth';
import { Button } from '@/components/common/Button';
import { STANDARD_COLORS } from '@/config/colors';
import { DRAWING_DEFAULTS } from './constants';
import { useDrawingCanvas } from './useDrawingCanvas';
import { migrateDrawingConfig, nextZ } from '@/utils/migrateDrawingConfig';

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
    objects,
    customColors = DRAWING_DEFAULTS.CUSTOM_COLORS,
    activeTool = DRAWING_DEFAULTS.ACTIVE_TOOL,
    shapeFill = DRAWING_DEFAULTS.SHAPE_FILL,
  } = config;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
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
  }, [editingText, widget.w, widget.h]);

  // Canvas internal resolution follows the widget (minus header) in window mode,
  // or the parent container in student view.
  const canvasSize = useMemo(() => {
    if (isStudentView) {
      // Student view sizes canvas to its container; fall back to widget dims.
      return { width: widget.w, height: widget.h };
    }
    return { width: widget.w, height: Math.max(widget.h - 40, 0) };
  }, [isStudentView, widget.w, widget.h]);

  // Central sink: every command-stack apply (push / undo / redo) lands here,
  // and pushes one updateWidget. Wrapped in useCallback so the command stack
  // hook's `onObjectsChange` identity stays stable across renders.
  const writeObjects = useCallback(
    (next: DrawableObject[]) => {
      updateWidget(widget.id, {
        config: { ...config, objects: next } as DrawingConfig,
      });
    },
    [updateWidget, widget.id, config]
  );

  const commandStack = useCommandStack({
    objects,
    onObjectsChange: writeObjects,
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

  // Commit edited text content back into the objects array. If the object id
  // already exists, replace it (re-edit flow → update command); otherwise,
  // append (first edit of a freshly spawned object → add command).
  const commitTextEdit = (next: TextObject) => {
    const existing = objects.find((o) => o.id === next.id);
    if (existing) {
      commandStack.push({ kind: 'update', before: existing, after: next });
    } else {
      commandStack.push({ kind: 'add', object: next });
    }
    setEditingText(null);
  };

  // Cancel / empty-commit: if the object was already in `objects` (re-edit
  // flow) and the new content is empty, remove it — matches the degenerate-
  // shape drop rule for rect/ellipse/line/arrow. Freshly spawned objects are
  // not in `objects` yet, so cancellation is a clean no-op.
  const cancelTextEdit = () => {
    const stale = editingText;
    setEditingText(null);
    if (!stale) return;
    const existing = objects.find((o) => o.id === stale.id);
    if (!existing) return;
    if (existing.kind === 'text' && existing.content.trim() === '') {
      commandStack.push({ kind: 'remove', object: existing });
    }
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
    if (isMod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (isMod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
      return;
    }
    handleSelectKeyDown(e);
  };

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
      <div
        role="radiogroup"
        aria-label="Drawing tool"
        className="flex gap-1 bg-slate-100 p-1 rounded-lg"
      >
        {TOOL_BUTTONS.map(({ tool, Icon, label }) => (
          <button
            key={tool}
            type="button"
            role="radio"
            aria-checked={activeTool === tool}
            onClick={() => setActiveTool(tool)}
            className={`w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center transition-all ${
              activeTool === tool
                ? 'ring-2 ring-indigo-500'
                : 'hover:bg-slate-50'
            }`}
            title={label}
            aria-label={label}
          >
            <Icon className="w-3.5 h-3.5 text-slate-600" />
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
        } overflow-hidden focus:outline-none ${cursorClass}`}
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
        {objects.length === 0 && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400">
            <Pencil className="w-8 h-8 opacity-20" />
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
    </div>
  );
};
