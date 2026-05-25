import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import {
  ArrowRight,
  Camera,
  Circle,
  Eraser,
  HardDriveUpload,
  ImagePlus,
  MousePointer2,
  Pencil,
  Slash,
  Square,
  Trash2,
  Type,
  TypeOutline,
  Redo2,
  Undo2,
  X,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDrawingCanvas } from '@/components/widgets/DrawingWidget/useDrawingCanvas';
import { TextEditorOverlay } from '@/components/widgets/DrawingWidget/TextEditorOverlay';
import { useImageInsertion } from '@/components/widgets/DrawingWidget/useImageInsertion';
import { useSelection } from '@/components/widgets/DrawingWidget/useSelection';
import { Button } from '@/components/common/Button';
import { extractTextWithGemini } from '@/utils/ai';
import {
  DrawableObject,
  ImageObject,
  ShapeTool,
  TextConfig,
  TextObject,
} from '@/types';
import { DRAWING_DEFAULTS } from '@/components/widgets/DrawingWidget/constants';
import { STANDARD_COLORS } from '@/config/colors';
import { Z_INDEX } from '@/config/zIndex';
import { nextZ } from '@/utils/migrateDrawingConfig';

const TOOL_BUTTONS: ReadonlyArray<{
  tool: ShapeTool;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { tool: 'select', Icon: MousePointer2, label: 'Select' },
  { tool: 'text', Icon: TypeOutline, label: 'Text' },
  { tool: 'pen', Icon: Pencil, label: 'Pen' },
  { tool: 'eraser', Icon: Eraser, label: 'Eraser' },
  { tool: 'line', Icon: Slash, label: 'Line' },
  { tool: 'arrow', Icon: ArrowRight, label: 'Arrow' },
  { tool: 'rect', Icon: Square, label: 'Rectangle' },
  { tool: 'ellipse', Icon: Circle, label: 'Ellipse' },
];

const FALLBACK_ANNOTATION_STATE: {
  objects: DrawableObject[];
  color: string;
  width: number;
  customColors: string[];
  activeTool: ShapeTool;
  shapeFill: boolean;
} = {
  objects: [],
  color: STANDARD_COLORS.slate,
  width: DRAWING_DEFAULTS.WIDTH,
  customColors: [...DRAWING_DEFAULTS.CUSTOM_COLORS],
  activeTool: DRAWING_DEFAULTS.ACTIVE_TOOL,
  shapeFill: DRAWING_DEFAULTS.SHAPE_FILL,
};

/**
 * Full-screen annotation overlay — ephemeral, NOT a widget.
 *
 * Renders into `#dashboard-root` above all widgets. No dimming layer: the
 * dashboard stays visually identical, the user just gains the ability to
 * draw over everything. The floating toolbar sits at the bottom, where the
 * Dock normally lives (the Dock hides itself while annotation is active).
 */
export const AnnotationOverlay: React.FC = () => {
  const dashboard = useDashboard();
  const {
    annotationActive,
    closeAnnotation,
    updateAnnotationState,
    addAnnotationObject,
    updateAnnotationObject,
    removeAnnotationObject,
    undoAnnotation,
    redoAnnotation,
    canRedoAnnotation,
    clearAnnotation,
    activeDashboard,
    addToast,
    updateWidget,
    addWidget,
    isActiveBoardReadOnly,
  } = dashboard;
  // Defensive fallback — older mock contexts (e.g. in unit tests) may omit
  // annotationState; provide sensible defaults so this component never throws.
  const annotationState =
    dashboard.annotationState ?? FALLBACK_ANNOTATION_STATE;
  // Viewer (View-Only participant) renders strokes only — no toolbar, no
  // pen interaction. The host's strokes flow in via the dashboard's
  // `annotationOverlay` field through the live-share mirror.
  const isReadOnly = !!isActiveBoardReadOnly;
  // Show overlay either when the local user opened it, OR when remote
  // strokes exist on the active dashboard (so viewers see incoming strokes
  // even without ever clicking the pencil).
  const hasRemoteStrokes = (annotationState.objects?.length ?? 0) > 0;
  const shouldRender = annotationActive || hasRemoteStrokes;
  const { canAccessFeature } = useAuth();
  const { saveDrawingToDrive, isConnected: isDriveConnected } =
    useGoogleDrive();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [isBusy, setIsBusy] = useState<null | 'download' | 'drive' | 'ocr'>(
    null
  );
  // Text editing — local state, mirrors the widget's pattern. Not part of
  // the shared `annotationState` because edits are local-only by design (per
  // the "Live-share interaction" section of the Phase 2 design spec). We
  // keep the in-flight TextObject in state until commit so a freshly spawned
  // (empty) text never reaches the shared overlay objects array.
  const [editingText, setEditingText] = useState<TextObject | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!editingText) return;
    const node = canvasRef.current;
    if (!node) return;
    setCanvasRect(node.getBoundingClientRect());
  }, [editingText, viewport.width, viewport.height]);

  // Locate the dashboard root portal target (waits for mount if needed)
  useEffect(() => {
    if (!shouldRender) return;
    const findTarget = () => {
      const target = document.getElementById('dashboard-root');
      if (target) {
        setPortalTarget(target);
        return true;
      }
      return false;
    };
    if (findTarget()) return undefined;
    const observer = new MutationObserver(() => {
      if (findTarget()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [shouldRender]);

  // Track viewport size for canvas resolution
  useEffect(() => {
    if (!shouldRender) return undefined;
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [shouldRender]);

  // Escape key exits annotation
  useEffect(() => {
    if (!shouldRender) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAnnotation();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shouldRender, closeAnnotation]);

  const canvasSize = useMemo(
    () => ({ width: viewport.width, height: viewport.height }),
    [viewport.width, viewport.height]
  );

  const handleTextSpawn = useCallback((obj: TextObject) => {
    // Hold the empty TextObject in local state until commit. Skipping the
    // persist-then-edit round-trip means a cancelled spawn never reaches
    // the live-share mirror.
    setEditingText(obj);
  }, []);

  const commitTextEdit = useCallback(
    (next: TextObject) => {
      const existing = annotationState.objects.find((o) => o.id === next.id);
      if (existing) {
        // Re-edit: replace in place via the shared objects path.
        const replaced = annotationState.objects.map((o) =>
          o.id === next.id ? next : o
        );
        updateAnnotationState({ objects: replaced });
      } else {
        // First commit of a freshly spawned object — append via the
        // standard add path so it picks up authorUid stamping for the
        // per-author undo logic.
        addAnnotationObject(next);
      }
      setEditingText(null);
    },
    [addAnnotationObject, annotationState.objects, updateAnnotationState]
  );

  const cancelTextEdit = useCallback(() => {
    const stale = editingText;
    setEditingText(null);
    if (!stale) return;
    const existing = annotationState.objects.find((o) => o.id === stale.id);
    if (!existing) return;
    if (existing.kind === 'text' && existing.content.trim() === '') {
      updateAnnotationState({
        objects: annotationState.objects.filter((o) => o.id !== stale.id),
      });
    }
  }, [annotationState.objects, editingText, updateAnnotationState]);

  // Image insertion parity with DrawingWidget. Annotations are cleared on
  // close so image cleanup is automatic — no asset bookkeeping needed here.
  const handleImageReady = useCallback(
    ({
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
        z: nextZ(annotationState.objects),
        x,
        y,
        w,
        h,
        src,
      };
      addAnnotationObject(obj);
    },
    [addAnnotationObject, annotationState.objects]
  );

  const {
    openPicker: openImagePicker,
    fileInputProps,
    handleNativePaste: handleImageNativePaste,
    handleDrop: handleImageDrop,
    handleDragOver: handleImageDragOver,
    isUploading: isUploadingImage,
  } = useImageInsertion({
    canvasRef,
    onImageReady: handleImageReady,
  });

  // Window-level paste listener for the overlay. The overlay's canvas is not
  // focusable so React's `onPaste` can't reliably reach it; we listen at the
  // window during interactive sessions and stop propagation on consume so
  // Dock's smart-paste handler doesn't open a duplicate picker.
  useEffect(() => {
    const isInteractive = annotationActive && !isReadOnly;
    if (!isInteractive) return undefined;
    window.addEventListener('paste', handleImageNativePaste, true);
    return () =>
      window.removeEventListener('paste', handleImageNativePaste, true);
  }, [annotationActive, isReadOnly, handleImageNativePaste]);

  // Selection preview is local-only — never written to the shared overlay
  // state. The single commit lands on pointer-up via updateAnnotationObject.
  // (Per the spec's "Live-share interaction" section, the host's selection
  // chrome is intentionally local — viewers do not see it.)
  const [previewObject, setPreviewObject] = useState<DrawableObject | null>(
    null
  );

  const handleTransformPreview = useCallback((next: DrawableObject) => {
    setPreviewObject(next);
  }, []);

  const handleTransformCommit = useCallback(
    // The overlay does NOT use the widget's command stack (see the
    // long-form comment on the Undo/Redo buttons below for why) — it just
    // ignores the `before` snapshot Wave 5 added to the signature.
    (next: DrawableObject, _before: DrawableObject) => {
      setPreviewObject(null);
      updateAnnotationObject(next);
    },
    [updateAnnotationObject]
  );

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
    objects: annotationState.objects,
    activeTool: annotationState.activeTool,
    onTransformPreview: handleTransformPreview,
    onTransformCommit: handleTransformCommit,
    onRemoveObject: removeAnnotationObject,
  });

  useEffect(() => {
    if (annotationState.activeTool !== 'select') clearSelection();
  }, [annotationState.activeTool, clearSelection]);

  const { handleStart, handleMove, handleEnd } = useDrawingCanvas({
    canvasRef,
    color: annotationState.color,
    width: annotationState.width,
    objects: annotationState.objects,
    onObjectComplete: addAnnotationObject,
    onTextSpawn: handleTextSpawn,
    canvasSize,
    nextZ: nextZ(annotationState.objects),
    activeTool: annotationState.activeTool,
    shapeFill: annotationState.shapeFill,
    selectedObject,
    transformState: transformState ? { active: true } : null,
    previewObject,
  });

  // Pointer chooser: route to selection handlers when Select is active.
  const getCanvasPos = useCallback(
    (e: React.PointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (annotationState.activeTool === 'select') {
        handleSelectPointerDown(e, getCanvasPos(e));
        return;
      }
      handleStart(e);
    },
    [
      annotationState.activeTool,
      handleSelectPointerDown,
      handleStart,
      getCanvasPos,
    ]
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (annotationState.activeTool === 'select') {
        handleSelectPointerMove(e, getCanvasPos(e));
        return;
      }
      handleMove(e);
    },
    [
      annotationState.activeTool,
      handleSelectPointerMove,
      handleMove,
      getCanvasPos,
    ]
  );
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (annotationState.activeTool === 'select') {
        handleSelectPointerUp(e, getCanvasPos(e));
        return;
      }
      handleEnd();
    },
    [annotationState.activeTool, handleSelectPointerUp, handleEnd, getCanvasPos]
  );

  // Window-level keyboard listener for Backspace/Delete + arrow nudges.
  // The overlay canvas isn't focusable (pointer-events bypass focus on a
  // full-viewport overlay), so we listen at window scope while the overlay
  // is interactive. Casts the native KeyboardEvent into the React shape the
  // selection hook expects.
  useEffect(() => {
    const isInteractive = annotationActive && !isReadOnly;
    if (!isInteractive) return undefined;
    if (annotationState.activeTool !== 'select') return undefined;
    const onKey = (e: KeyboardEvent) => {
      handleSelectKeyDown(e as unknown as React.KeyboardEvent);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    annotationActive,
    isReadOnly,
    annotationState.activeTool,
    handleSelectKeyDown,
  ]);

  // Double-click any existing text annotation to re-edit it.
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const texts = annotationState.objects.filter(
        (o): o is TextObject => o.kind === 'text'
      );
      const sorted = [...texts].sort((a, b) => b.z - a.z);
      const hit = sorted.find(
        (o) => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h
      );
      if (hit) setEditingText(hit);
    },
    [annotationState.objects]
  );

  const capturePng = useCallback(async (): Promise<string | null> => {
    const root = document.getElementById('dashboard-root');
    if (!root) return null;
    const dataUrl = await toPng(root, {
      cacheBust: true,
      pixelRatio: 2,
      filter: (node: Element) => {
        if (!(node instanceof HTMLElement)) return true;
        return node.dataset.screenshot !== 'exclude';
      },
    });
    return dataUrl;
  }, []);

  const handleDownload = useCallback(async () => {
    setIsBusy('download');
    try {
      const dataUrl = await capturePng();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.download = `Annotation-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      addToast('Annotation downloaded!', 'success');
    } catch (e) {
      console.error('Annotation download failed:', e);
      addToast('Failed to download annotation.', 'error');
    } finally {
      setIsBusy(null);
    }
  }, [capturePng, addToast]);

  const handleSaveToDrive = useCallback(async () => {
    if (!isDriveConnected) {
      addToast(
        'Google Drive is not connected. Sign in to Drive first.',
        'error'
      );
      return;
    }
    setIsBusy('drive');
    try {
      const dataUrl = await capturePng();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `Annotation-${timestamp}.png`;
      await saveDrawingToDrive(blob, name);
      addToast('Annotation saved to Google Drive!', 'success');
    } catch (e) {
      console.error('Drive save failed:', e);
      addToast('Failed to save to Google Drive.', 'error');
    } finally {
      setIsBusy(null);
    }
  }, [isDriveConnected, capturePng, saveDrawingToDrive, addToast]);

  const handleExtractText = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsBusy('ocr');
    try {
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
          config: { ...currentConfig, content: newContent },
        });
        addToast('Appended text to notes!', 'success');
      } else {
        addWidget('text', {
          x: 80,
          y: 80,
          w: 400,
          h: 300,
          config: { content: safeText } as TextConfig,
        });
        addToast('Created new note with text!', 'success');
      }
    } catch (e) {
      console.error('OCR failed:', e);
      addToast('Failed to extract text.', 'error');
    } finally {
      setIsBusy(null);
    }
  }, [activeDashboard, addToast, addWidget, updateWidget]);

  if (!shouldRender || !portalTarget) return null;

  const { color, width, customColors, objects, activeTool } = annotationState;
  const isErasing = activeTool === 'eraser';
  // Read-only canvas for viewers and for the passive "remote strokes are
  // showing but I haven't opened the toolbar" state. No pen interaction,
  // no toolbar — just the strokes painted on top of the dashboard.
  const interactive = annotationActive && !isReadOnly;

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: Z_INDEX.overlay }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? handlePointerUp : undefined}
        onPointerLeave={interactive ? handlePointerUp : undefined}
        onDoubleClick={interactive ? handleCanvasDoubleClick : undefined}
        onDrop={interactive ? handleImageDrop : undefined}
        onDragOver={interactive ? handleImageDragOver : undefined}
        data-selected-id={selectedId ?? ''}
        className={`absolute inset-0 ${
          interactive
            ? activeTool === 'select'
              ? 'pointer-events-auto cursor-default'
              : 'pointer-events-auto cursor-crosshair'
            : 'pointer-events-none'
        }`}
        style={{ touchAction: interactive ? 'none' : 'auto' }}
      />

      {interactive && <input {...fileInputProps} />}

      {interactive && editingText && canvasRect && (
        <TextEditorOverlay
          object={editingText}
          canvasRect={canvasRect}
          canvasSize={canvasSize}
          onCommit={commitTextEdit}
          onCancel={cancelTextEdit}
        />
      )}

      {/* Floating toolbar — sits where the Dock normally lives.
          Hidden for viewers and for the passive remote-stroke render path. */}
      {interactive && (
        <div
          data-screenshot="exclude"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 p-2 flex items-center gap-2 animate-in slide-in-from-bottom duration-300"
        >
          <div className="px-2 flex items-center gap-2 border-r border-slate-200 mr-1">
            <MousePointer2 className="w-4 h-4 text-indigo-600 animate-pulse" />
            <span className="text-xxs font-black uppercase tracking-widest text-slate-700">
              Annotating
            </span>
          </div>

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
                onClick={() => updateAnnotationState({ activeTool: tool })}
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

          <div
            className={`flex gap-1 bg-slate-100 p-1 rounded-lg transition-opacity ${
              isErasing ? 'opacity-50 pointer-events-none' : ''
            }`}
            aria-hidden={isErasing}
          >
            {customColors.map((c) => (
              <button
                key={c}
                onClick={() => updateAnnotationState({ color: c })}
                className={`w-7 h-7 rounded-md transition-all ${
                  color === c
                    ? 'scale-110 shadow-sm ring-2 ring-indigo-500'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>

          {/* Width slider */}
          <div className="flex items-center gap-2 px-2">
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={width}
              onChange={(e) =>
                updateAnnotationState({ width: parseInt(e.target.value, 10) })
              }
              className="w-20 accent-indigo-600"
              aria-label="Brush thickness"
            />
            <span className="w-7 text-center font-mono text-xs text-slate-600">
              {width}px
            </span>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/*
            Per-author Undo: scans for the local user's most recent stroke
            so a synced collaborator can't accidentally clobber another
            teacher's drawing. Wave 5 deliberately did NOT unify this with
            the DrawingWidget's command stack — the widget treats commands
            as global writes, which would break multi-author safety. Redo
            below is an in-memory stack layered on top of that per-author
            undo (see DashboardContext.redoAnnotation for the implementation).
          */}
          <Button
            onClick={undoAnnotation}
            title="Undo"
            aria-label="Undo"
            variant="ghost"
            size="icon"
            disabled={objects.length === 0}
            icon={<Undo2 className="w-4 h-4" />}
          />
          <Button
            onClick={redoAnnotation}
            title="Redo"
            aria-label="Redo"
            variant="ghost"
            size="icon"
            disabled={!canRedoAnnotation}
            icon={<Redo2 className="w-4 h-4" />}
          />
          <Button
            onClick={clearAnnotation}
            title="Clear all"
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

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Button
            onClick={() => void handleDownload()}
            disabled={isBusy !== null}
            variant="ghost"
            size="icon"
            title="Download PNG"
            icon={<Camera className="w-4 h-4" />}
          />
          <Button
            onClick={() => void handleSaveToDrive()}
            disabled={isBusy !== null}
            variant="ghost"
            size="icon"
            title="Save to Google Drive"
            icon={
              isBusy === 'drive' ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <HardDriveUpload className="w-4 h-4" />
              )
            }
          />
          {canAccessFeature('gemini-functions') && (
            <Button
              onClick={() => void handleExtractText()}
              disabled={isBusy !== null}
              variant="ghost"
              size="icon"
              title="Extract text (AI)"
              icon={
                isBusy === 'ocr' ? (
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Type className="w-4 h-4" />
                )
              }
            />
          )}

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Button
            onClick={closeAnnotation}
            variant="secondary"
            size="sm"
            title="Exit annotation (Esc)"
            icon={<X className="w-3.5 h-3.5" />}
          >
            Exit
          </Button>
        </div>
      )}

      {/* Passive read-only indicator — surfaces a small chip when the user
          is seeing remote strokes (viewer or pre-toolbar synced) so it's
          clear those marks aren't theirs. */}
      {!interactive && hasRemoteStrokes && (
        <div
          data-screenshot="exclude"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none bg-white/80 backdrop-blur-md rounded-full shadow-md border border-white/40 px-3 py-1 flex items-center gap-2"
        >
          <MousePointer2 className="w-3.5 h-3.5 text-indigo-600" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Host annotation
          </span>
        </div>
      )}
    </div>,
    portalTarget
  );
};
