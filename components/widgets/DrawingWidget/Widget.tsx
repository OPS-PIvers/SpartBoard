import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Pencil,
  Slash,
  Square,
  Trash2,
  Type,
  TypeOutline,
  Undo2,
} from 'lucide-react';
import { TextEditorOverlay } from './TextEditorOverlay';
import { useImageInsertion } from './useImageInsertion';
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
  // Text leads the cluster: it's the most-used non-pen action when teachers
  // are using the widget to label diagrams or capture quick notes.
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

  const appendObject = (obj: DrawableObject) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        objects: [...objects, obj],
      } as DrawingConfig,
    });
  };

  // Text spawn: keep the empty TextObject in local state and open the editor.
  // We DON'T persist the empty object — it's added to `objects[]` only on
  // commit, so an Esc/blur-with-no-text leaves the dashboard untouched.
  const handleTextSpawn = (obj: TextObject) => {
    setEditingText(obj);
  };

  // Commit edited text content back into the objects array. If the object id
  // already exists, replace it (re-edit flow); otherwise, append (first edit
  // of a freshly spawned object).
  const commitTextEdit = (next: TextObject) => {
    const existing = objects.find((o) => o.id === next.id);
    const replaced = existing
      ? objects.map((o) => (o.id === next.id ? next : o))
      : [...objects, next];
    updateWidget(widget.id, {
      config: { ...config, objects: replaced } as DrawingConfig,
    });
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
      updateWidget(widget.id, {
        config: {
          ...config,
          objects: objects.filter((o) => o.id !== stale.id),
        } as DrawingConfig,
      });
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
    appendObject(obj);
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

  const { handleStart, handleMove, handleEnd, isDrawing } = useDrawingCanvas({
    canvasRef,
    color,
    width,
    objects,
    onObjectComplete: appendObject,
    onTextSpawn: handleTextSpawn,
    disabled: isStudentView,
    canvasSize,
    nextZ: nextZ(objects),
    activeTool,
    shapeFill,
  });

  const clear = () => {
    updateWidget(widget.id, {
      config: { ...config, objects: [] } as DrawingConfig,
    });
  };

  const undo = () => {
    updateWidget(widget.id, {
      config: { ...config, objects: objects.slice(0, -1) } as DrawingConfig,
    });
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
        variant="ghost"
        size="icon"
        icon={<Undo2 className="w-4 h-4" />}
      />
      <Button
        onClick={clear}
        title="Clear All"
        variant="ghost-danger"
        size="icon"
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className={`flex-1 relative ${
          isStudentView ? 'bg-transparent' : 'bg-white/5'
        } overflow-hidden focus:outline-none ${!isStudentView && 'cursor-crosshair'}`}
        // tabIndex makes the wrapper focusable so React's synthetic `paste`
        // fires here when the user pastes after clicking into the widget.
        // Drag-and-drop and the toolbar button cover the case where the
        // widget doesn't currently hold focus.
        tabIndex={isStudentView ? undefined : 0}
        onPaste={isStudentView ? undefined : handlePaste}
        onDrop={isStudentView ? undefined : handleDrop}
        onDragOver={isStudentView ? undefined : handleDragOver}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleStart}
          onPointerMove={handleMove}
          onPointerUp={handleEnd}
          onPointerLeave={handleEnd}
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
