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
  Eraser,
  Trash2,
  Undo2,
  MousePointer2,
  X,
  Camera,
  HardDriveUpload,
  Type,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDrawingCanvas } from '@/components/widgets/DrawingWidget/useDrawingCanvas';
import { Button } from '@/components/common/Button';
import { extractTextWithGemini } from '@/utils/ai';
import { DrawableObject, TextConfig } from '@/types';
import { DRAWING_DEFAULTS } from '@/components/widgets/DrawingWidget/constants';
import { STANDARD_COLORS } from '@/config/colors';
import { Z_INDEX } from '@/config/zIndex';
import { nextZ } from '@/utils/migrateDrawingConfig';

const FALLBACK_ANNOTATION_STATE: {
  objects: DrawableObject[];
  color: string;
  width: number;
  customColors: string[];
} = {
  objects: [],
  color: STANDARD_COLORS.slate,
  width: DRAWING_DEFAULTS.WIDTH,
  customColors: [...DRAWING_DEFAULTS.CUSTOM_COLORS],
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
    undoAnnotation,
    clearAnnotation,
    activeDashboard,
    addToast,
    updateWidget,
    addWidget,
  } = dashboard;
  // Defensive fallback — older mock contexts (e.g. in unit tests) may omit
  // annotationState; provide sensible defaults so this component never throws.
  const annotationState =
    dashboard.annotationState ?? FALLBACK_ANNOTATION_STATE;
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

  // Locate the dashboard root portal target (waits for mount if needed)
  useEffect(() => {
    if (!annotationActive) return;
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
  }, [annotationActive]);

  // Track viewport size for canvas resolution
  useEffect(() => {
    if (!annotationActive) return undefined;
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [annotationActive]);

  // Escape key exits annotation
  useEffect(() => {
    if (!annotationActive) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAnnotation();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [annotationActive, closeAnnotation]);

  const canvasSize = useMemo(
    () => ({ width: viewport.width, height: viewport.height }),
    [viewport.width, viewport.height]
  );

  const { handleStart, handleMove, handleEnd } = useDrawingCanvas({
    canvasRef,
    color: annotationState.color,
    width: annotationState.width,
    objects: annotationState.objects,
    onObjectComplete: addAnnotationObject,
    canvasSize,
    nextZ: nextZ(annotationState.objects),
  });

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

  if (!annotationActive || !portalTarget) return null;

  const { color, width, customColors, objects } = annotationState;

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: Z_INDEX.overlay }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handleStart}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerLeave={handleEnd}
        className="absolute inset-0 pointer-events-auto cursor-crosshair"
        style={{ touchAction: 'none' }}
      />

      {/* Floating toolbar — sits where the Dock normally lives */}
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

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
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
          <button
            onClick={() => updateAnnotationState({ color: 'eraser' })}
            className={`w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center transition-all ${
              color === 'eraser' ? 'ring-2 ring-indigo-500' : ''
            }`}
            aria-label="Eraser"
          >
            <Eraser className="w-3.5 h-3.5 text-slate-500" />
          </button>
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

        <Button
          onClick={undoAnnotation}
          title="Undo"
          variant="ghost"
          size="icon"
          disabled={objects.length === 0}
          icon={<Undo2 className="w-4 h-4" />}
        />
        <Button
          onClick={clearAnnotation}
          title="Clear all"
          variant="ghost-danger"
          size="icon"
          disabled={objects.length === 0}
          icon={<Trash2 className="w-4 h-4" />}
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
    </div>,
    portalTarget
  );
};
