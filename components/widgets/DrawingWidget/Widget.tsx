import React, { useMemo, useRef, useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DrawingConfig, Path, TextConfig } from '@/types';
import { Pencil, Eraser, Trash2, Undo2, Type } from 'lucide-react';
import { extractTextWithGemini } from '@/utils/ai';
import { useAuth } from '@/context/useAuth';
import { Button } from '@/components/common/Button';
import { STANDARD_COLORS } from '@/config/colors';
import { DRAWING_DEFAULTS } from './constants';
import { useDrawingCanvas } from './useDrawingCanvas';

export const DrawingWidget: React.FC<{
  widget: WidgetData;
  isStudentView?: boolean;
  scale?: number;
}> = ({ widget, isStudentView = false, scale = 1 }) => {
  const { updateWidget, activeDashboard, addToast, addWidget } = useDashboard();
  const { canAccessFeature } = useAuth();

  const config = widget.config as DrawingConfig;
  const {
    color = STANDARD_COLORS.slate,
    width = DRAWING_DEFAULTS.WIDTH,
    paths = [],
    customColors = DRAWING_DEFAULTS.CUSTOM_COLORS,
  } = config;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Canvas internal resolution follows the widget (minus header) in window mode,
  // or the parent container in student view.
  const canvasSize = useMemo(() => {
    if (isStudentView) {
      // Student view sizes canvas to its container; fall back to widget dims.
      return { width: widget.w, height: widget.h };
    }
    return { width: widget.w, height: Math.max(widget.h - 40, 0) };
  }, [isStudentView, widget.w, widget.h]);

  const appendPath = (path: Path) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        paths: [...paths, path],
      } as DrawingConfig,
    });
  };

  const { handleStart, handleMove, handleEnd, isDrawing } = useDrawingCanvas({
    canvasRef,
    color,
    width,
    paths,
    onPathComplete: appendPath,
    scale,
    disabled: isStudentView,
    canvasSize,
  });

  const clear = () => {
    updateWidget(widget.id, {
      config: { ...config, paths: [] } as DrawingConfig,
    });
  };

  const undo = () => {
    updateWidget(widget.id, {
      config: { ...config, paths: paths.slice(0, -1) } as DrawingConfig,
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
                config: { ...config, color: c } as DrawingConfig,
              })
            }
            className={`w-6 h-6 rounded-md transition-all ${color === c ? 'scale-110 shadow-sm ring-2 ring-indigo-500' : 'hover:scale-105'}`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        ))}
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, color: 'eraser' } as DrawingConfig,
            })
          }
          className={`w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center transition-all ${color === 'eraser' ? 'ring-2 ring-indigo-500' : ''}`}
          aria-label="Eraser"
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
