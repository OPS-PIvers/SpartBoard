import React, { useLayoutEffect, useRef, useState } from 'react';
import { Eraser, Highlighter, PenLine, Trash2, Undo2 } from 'lucide-react';
import type { PathObject, WidgetType } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import {
  type InkTool,
  type InkFrame,
  INK_COLORS,
  feedToInk,
  inkFrameReady,
  paintInk,
  strokeStyleFor,
} from './docCamInk';

interface LayerProps {
  strokes: readonly PathObject[];
  frame: InkFrame;
  active: boolean;
  tool: InkTool;
  penColor: string;
  onStroke: (stroke: PathObject) => void;
}

/** Canvas over the Camera feed that shows ink and, in draw mode, takes pen input. */
export const DocCamInkLayer: React.FC<LayerProps> = ({
  strokes,
  frame,
  active,
  tool,
  penColor,
  onStroke,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<PathObject | null>(null);
  const pointerId = useRef<number | null>(null);
  // Points live in a ref too so a fast flick's last moves aren't lost before a re-render.
  const draftRef = useRef<PathObject | null>(null);

  const finishStroke = () => {
    const d = draftRef.current;
    pointerId.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!d) return;
    const [first] = d.points;
    onStroke({
      ...d,
      points:
        d.points.length === 1
          ? [first, { ...first, x: first.x + 0.0001 }]
          : d.points,
    });
  };

  const size = frame.feed;
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.scale(dpr, dpr);
    paintInk(ctx, draft ? [...strokes, draft] : strokes, frame);
  }, [strokes, draft, size, frame]);

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const k = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    return feedToInk((e.clientX - r.left) / k, (e.clientY - r.top) / k, frame);
  };

  return (
    <canvas
      ref={canvasRef}
      data-doccam-ink=""
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? 'crosshair' : undefined,
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        if (!active || e.button !== 0 || pointerId.current !== null) return;
        if (!inkFrameReady(frame)) return;
        e.stopPropagation();
        pointerId.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const { color, width } = strokeStyleFor(tool, penColor);
        const stroke: PathObject = {
          id: crypto.randomUUID(),
          kind: 'path',
          z: 0,
          points: [pointOf(e)],
          color,
          width,
        };
        draftRef.current = stroke;
        setDraft(stroke);
      }}
      onPointerMove={(e) => {
        const d = draftRef.current;
        if (e.pointerId !== pointerId.current || !d) return;
        const next = { ...d, points: [...d.points, pointOf(e)] };
        draftRef.current = next;
        setDraft(next);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pointerId.current) finishStroke();
      }}
      onPointerCancel={(e) => {
        if (e.pointerId === pointerId.current) finishStroke();
      }}
    />
  );
};

const ICON = { width: 'min(18px, 4.5cqmin)', height: 'min(18px, 4.5cqmin)' };
const BUTTON =
  'relative touch-target-expand rounded-xl text-white disabled:opacity-30 disabled:cursor-not-allowed';

interface ToolbarProps {
  widgetId: string;
  widgetType: WidgetType;
  tool: InkTool;
  penColor: string;
  canUndo: boolean;
  hasInk: boolean;
  onTool: (tool: InkTool) => void;
  onPenColor: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
}

export const DocCamInkToolbar: React.FC<ToolbarProps> = ({
  widgetId,
  widgetType,
  tool,
  penColor,
  canUndo,
  hasInk,
  onTool,
  onPenColor,
  onUndo,
  onClear,
}) => {
  const tools = [
    {
      id: 'pen',
      tour: tourAttr('webcam.draw-pen', widgetId, widgetType),
      label: 'Pen',
      Icon: PenLine,
    },
    {
      id: 'highlighter',
      tour: tourAttr('webcam.draw-highlighter', widgetId, widgetType),
      label: 'Highlighter',
      Icon: Highlighter,
    },
    {
      id: 'eraser',
      tour: tourAttr('webcam.draw-eraser', widgetId, widgetType),
      label: 'Eraser',
      Icon: Eraser,
    },
  ] as const;
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="absolute left-1/2 -translate-x-1/2 flex items-center bg-black/70 backdrop-blur-2xl rounded-2xl border border-white/30 shadow-2xl z-30"
      style={{
        top: 'min(12px, 3cqmin)',
        gap: 'min(2px, 0.5cqmin)',
        padding: 'min(6px, 1.5cqmin)',
      }}
    >
      {tools.map(({ id, tour, label, Icon }) => (
        <button
          key={id}
          {...tour}
          onClick={() => onTool(id)}
          aria-pressed={tool === id}
          className={`${BUTTON} ${tool === id ? 'bg-white/25' : 'hover:bg-white/20'}`}
          style={{ padding: 'min(8px, 2cqmin)' }}
          title={label}
          aria-label={label}
        >
          <Icon style={ICON} />
        </button>
      ))}
      <div
        className="bg-white/20 self-stretch"
        style={{ width: 1, margin: '0 min(4px, 1cqmin)' }}
      />
      {INK_COLORS.map((c) => (
        // no-tour-anchor: pen colour swatch; tours point at the Pen tool
        <button
          key={c.id}
          onClick={() => {
            onPenColor(c.value);
            onTool('pen');
          }}
          aria-pressed={tool === 'pen' && penColor === c.value}
          className={`${BUTTON} hover:bg-white/20 flex items-center justify-center`}
          style={{ padding: 'min(8px, 2cqmin)' }}
          title={c.label}
          aria-label={c.label}
        >
          <span
            className={`block rounded-full ${tool === 'pen' && penColor === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-black/70' : 'ring-1 ring-white/40'}`}
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
              background: c.value,
            }}
          />
        </button>
      ))}
      <div
        className="bg-white/20 self-stretch"
        style={{ width: 1, margin: '0 min(4px, 1cqmin)' }}
      />
      <button
        {...tourAttr('webcam.draw-undo', widgetId, widgetType)}
        onClick={onUndo}
        disabled={!canUndo}
        className={`${BUTTON} hover:bg-white/20`}
        style={{ padding: 'min(8px, 2cqmin)' }}
        title="Undo"
        aria-label="Undo"
      >
        <Undo2 style={ICON} />
      </button>
      <button
        {...tourAttr('webcam.clear-drawing', widgetId, widgetType)}
        onClick={onClear}
        disabled={!hasInk}
        className={`${BUTTON} hover:bg-white/20`}
        style={{ padding: 'min(8px, 2cqmin)' }}
        title="Clear drawing"
        aria-label="Clear drawing"
      >
        <Trash2 style={ICON} />
      </button>
    </div>
  );
};
