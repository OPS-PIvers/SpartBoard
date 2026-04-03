import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DrawingConfig, Point, Path, TextConfig } from '@/types';
import {
  Pencil,
  Eraser,
  Trash2,
  Maximize,
  Undo2,
  MousePointer2,
  Minimize2,
  Camera,
  Cast,
  CloudUpload,
  Type,
} from 'lucide-react';
import { useScreenshot } from '@/hooks/useScreenshot';
import { extractTextWithGemini } from '@/utils/ai';
import { useAuth } from '@/context/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import { Button } from '@/components/common/Button';
import { STANDARD_COLORS } from '@/config/colors';
import { DRAWING_DEFAULTS } from './constants';

export const DrawingWidget: React.FC<{
  widget: WidgetData;
  isStudentView?: boolean;
  scale?: number;
}> = ({ widget, isStudentView = false, scale = 1 }) => {
  const { updateWidget, activeDashboard, addToast, addWidget } = useDashboard();
  const { user, canAccessFeature } = useAuth();
  const { session, startSession, endSession } = useLiveSession(
    user?.uid,
    'teacher'
  );

  const isLive = session?.isActive && session?.activeWidgetId === widget.id;

  const handleToggleLive = async () => {
    try {
      if (isLive) {
        await endSession();
      } else {
        const newSession = await startSession(
          widget.id,
          widget.type,
          widget.config,
          activeDashboard?.background
        );
        const url = `${window.location.origin}/join?code=${newSession.code}`;
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          void navigator.clipboard
            .writeText(url)
            .then(() =>
              addToast('Assignment link copied to clipboard!', 'success')
            )
            .catch(() =>
              addToast(
                'Assignment created, but link could not be copied.',
                'info'
              )
            );
        } else {
          addToast('Assignment created, but link could not be copied.', 'info');
        }
      }
    } catch (error) {
      console.error('Failed to toggle live session:', error);
    }
  };

  const config = widget.config as DrawingConfig;
  const {
    mode = DRAWING_DEFAULTS.MODE,
    color = STANDARD_COLORS.slate,
    width = DRAWING_DEFAULTS.WIDTH,
    paths = [],
    customColors = DRAWING_DEFAULTS.CUSTOM_COLORS,
  } = config;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const currentPathRef = useRef<Point[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Try to find the target immediately, but also use a MutationObserver or a small delay
    // if it's not found, to handle cases where DashboardView hasn't mounted yet.
    const findTarget = () => {
      const target = document.getElementById('dashboard-root');
      if (target) {
        setPortalTarget(target);
        return true;
      }
      return false;
    };

    if (!findTarget()) {
      const observer = new MutationObserver(() => {
        if (findTarget()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
    return undefined;
  }, []);

  const { takeScreenshot, isCapturing } = useScreenshot(
    portalTarget,
    `Classroom-Annotation-${new Date().toISOString().split('T')[0]}`,
    {
      onSuccess: (url) => {
        if (url) {
          addToast('Drawing saved to cloud!', 'success');
        }
      },
    }
  );

  const setContextStyles = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (color === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
      }
      ctx.lineWidth = width;
    },
    [color, width]
  );

  // Draw paths on the canvas whenever they change
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, allPaths: Path[], current: Point[]) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      const renderPath = (p: Path) => {
        if (p.points.length < 2) return;
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (p.color === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = p.color;
        }

        ctx.lineWidth = p.width;
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) {
          ctx.lineTo(p.points[i].x, p.points[i].y);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      };

      allPaths.forEach(renderPath);
      if (current.length > 1) {
        renderPath({ points: current, color, width });
      }
    },
    [color, width]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set internal resolution
    if (mode === 'window') {
      if (isStudentView) {
        // Fill the student container
        const container = canvas.parentElement;
        canvas.width = container?.clientWidth ?? 800;
        canvas.height = container?.clientHeight ?? 600;
      } else {
        canvas.width = widget.w;
        canvas.height = widget.h - 40; // Subtract header
      }
    } else {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    draw(ctx, paths, currentPathRef.current);
  }, [paths, mode, widget.w, widget.h, draw, isStudentView]);

  const handleStart = (e: React.PointerEvent) => {
    if (isStudentView) return;
    setIsDrawing(true);
    const pos = getPos(e);
    currentPathRef.current = [pos];

    // Start imperative drawing
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      setContextStyles(ctx);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const handleMove = (e: React.PointerEvent) => {
    if (isStudentView || !isDrawing) return;
    const pos = getPos(e);
    currentPathRef.current.push(pos);

    // Imperatively draw the new segment
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && currentPathRef.current.length > 1) {
      // Ensure styles are set (in case they were lost or reset)
      setContextStyles(ctx);

      const prev = currentPathRef.current[currentPathRef.current.length - 2];
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length > 1) {
      const newPath: Path = { points: currentPathRef.current, color, width };
      updateWidget(widget.id, {
        config: {
          ...config,
          paths: [...paths, newPath],
        } as DrawingConfig,
      });
    }
    currentPathRef.current = [];
  };

  const getPos = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    // When in window mode, we must account for the CSS transform scale applied by the parent ScalableWidget
    // In overlay mode, the canvas is portalled to the root and is not scaled.
    const effectiveScale = mode === 'overlay' ? 1 : scale;

    return {
      x: (e.clientX - rect.left) / effectiveScale,
      y: (e.clientY - rect.top) / effectiveScale,
    };
  };

  const clear = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        paths: [],
      } as DrawingConfig,
    });
  };

  const undo = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        paths: paths.slice(0, -1),
      } as DrawingConfig,
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

  const PaletteUI = (
    <div className="flex flex-wrap items-center gap-2 p-2">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {customColors.map((c) => (
          <button
            key={c}
            onClick={() =>
              updateWidget(widget.id, {
                config: {
                  ...config,
                  color: c,
                } as DrawingConfig,
              })
            }
            className={`w-6 h-6 rounded-md transition-all ${color === c ? 'scale-110 shadow-sm ring-2 ring-indigo-500' : 'hover:scale-105'}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: {
                ...config,
                color: 'eraser',
              } as DrawingConfig,
            })
          }
          className={`w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center transition-all ${color === 'eraser' ? 'ring-2 ring-indigo-500' : ''}`}
        >
          <Eraser className="w-3 h-3 text-slate-400" />
        </button>
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

      <div className="h-6 w-px bg-slate-200 mx-1" />

      {mode === 'overlay' && (
        <>
          <Button
            onClick={() => void handleToggleLive()}
            variant={isLive ? 'danger' : 'ghost'}
            size="icon"
            className={isLive ? 'animate-pulse' : ''}
            title={isLive ? 'End Assignment' : 'Assign (copy student link)'}
            icon={<Cast className="w-4 h-4" />}
          />
          <Button
            onClick={() => void takeScreenshot()}
            disabled={isCapturing}
            variant="ghost"
            size="icon"
            title="Capture Full Screen"
            icon={<Camera className="w-4 h-4" />}
          />
          <Button
            onClick={() => void takeScreenshot({ upload: true })}
            disabled={isCapturing}
            variant="ghost"
            size="icon"
            title="Save to Cloud"
            icon={<CloudUpload className="w-4 h-4" />}
          />
          {canAccessFeature('gemini-functions') && (
            <Button
              onClick={() => void handleSendToText()}
              disabled={isCapturing || isExtracting}
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
          )}
          <div className="h-6 w-px bg-slate-200 mx-1" />
        </>
      )}

      <Button
        onClick={() =>
          updateWidget(widget.id, {
            config: {
              ...config,
              mode: mode === 'window' ? 'overlay' : 'window',
            } as DrawingConfig,
          })
        }
        variant={mode === 'overlay' ? 'primary' : 'secondary'}
        size="sm"
        className={mode === 'overlay' ? 'shadow-lg' : ''}
        icon={
          mode === 'overlay' ? (
            <Minimize2 className="w-3 h-3" />
          ) : (
            <Maximize className="w-3 h-3" />
          )
        }
      >
        {mode === 'overlay' ? (
          <span>EXIT</span>
        ) : (
          widget.w > 250 && <span>ANNOTATE</span>
        )}
      </Button>
    </div>
  );

  if (mode === 'overlay') {
    // Show loading state while waiting for portal target
    if (!portalTarget) {
      return (
        <div className="h-full flex items-center justify-center bg-slate-50">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 ">Preparing overlay mode...</p>
          </div>
        </div>
      );
    }

    return (
      <>
        {createPortal(
          <div className="fixed inset-0 z-overlay pointer-events-none overflow-hidden">
            {/* Darken background slightly to indicate annotation mode */}
            <div className="absolute inset-0 bg-slate-900/10 pointer-events-none" />
            <canvas
              ref={canvasRef}
              onPointerDown={handleStart}
              onPointerMove={handleMove}
              onPointerUp={handleEnd}
              onPointerLeave={handleEnd}
              className="absolute inset-0 pointer-events-auto cursor-crosshair"
              style={{ touchAction: 'none' }}
            />
            {/* Floating Toolbar at the Top */}
            {!isStudentView && (
              <div
                data-screenshot="exclude"
                className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto bg-white/60 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 p-1 flex items-center gap-1 animate-in slide-in-from-top duration-300"
              >
                <div className="px-3 flex items-center gap-2 border-r border-white/30 mr-1">
                  <MousePointer2 className="w-4 h-4 text-indigo-600 animate-pulse" />
                  <span className="text-xxs  font-black uppercase tracking-widest text-slate-700">
                    Annotating
                  </span>
                </div>
                {PaletteUI}
              </div>
            )}
          </div>,
          portalTarget
        )}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className={`flex-1 relative ${
          isStudentView ? 'bg-transparent' : 'bg-white/5'
        } overflow-hidden ${!isStudentView && 'cursor-crosshair'}`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleStart}
          onPointerMove={handleMove}
          onPointerUp={handleEnd}
          onPointerLeave={handleEnd}
          className="absolute inset-0"
          style={{ touchAction: 'none' }}
        />
        {paths.length === 0 && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400">
            <Pencil className="w-8 h-8 opacity-20" />
          </div>
        )}
      </div>
      {!isStudentView && (
        <div className="shrink-0 border-t border-white/20 bg-white/20 backdrop-blur-sm">
          {PaletteUI}
        </div>
      )}
    </div>
  );
};
