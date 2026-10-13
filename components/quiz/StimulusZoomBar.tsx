import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_ZOOM, MIN_ZOOM } from './useStimulusZoom';

const mm = (px: number, cqmin: number) => `min(${px}px, ${cqmin}cqmin)`;

/** − / % / + strip shared by image and PDF stimuli; the % resets to 100. */
export const StimulusZoomBar: React.FC<{
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  light: boolean;
  cqScaled?: boolean;
  children?: React.ReactNode;
}> = ({ zoom, onZoomIn, onZoomOut, onReset, light, cqScaled, children }) => {
  const iconStyle = cqScaled
    ? { width: mm(14, 3.5), height: mm(14, 3.5) }
    : undefined;
  const btnCls = `relative touch-target-expand rounded hover:bg-slate-500/20 disabled:opacity-30 ${cqScaled ? '' : 'p-1'}`;
  const btnStyle = cqScaled ? { padding: mm(4, 1) } : undefined;
  return (
    <div
      className={`flex items-center border-b font-bold ${
        cqScaled ? '' : 'gap-2 px-3 py-1.5 text-xs'
      } ${light ? 'border-slate-200 text-slate-600' : 'border-slate-700 text-slate-300'}`}
      style={
        cqScaled
          ? {
              gap: mm(8, 2),
              padding: `${mm(6, 1.5)} ${mm(12, 3)}`,
              fontSize: mm(11, 4),
            }
          : undefined
      }
    >
      <div
        className={`flex flex-1 min-w-0 items-center ${cqScaled ? '' : 'gap-2'}`}
        style={cqScaled ? { gap: mm(8, 2) } : undefined}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM + 0.001}
        onClick={onZoomOut}
        className={btnCls}
        style={btnStyle}
      >
        <Minus
          className={cqScaled ? undefined : 'w-3.5 h-3.5'}
          style={iconStyle}
        />
      </button>
      <button
        type="button"
        aria-label="Reset zoom"
        title="Reset zoom"
        onClick={onReset}
        className={`tabular-nums text-center rounded hover:bg-slate-500/20 ${cqScaled ? '' : 'w-10'}`}
        style={cqScaled ? { width: mm(40, 10) } : undefined}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM - 0.001}
        onClick={onZoomIn}
        className={btnCls}
        style={btnStyle}
      >
        <Plus
          className={cqScaled ? undefined : 'w-3.5 h-3.5'}
          style={iconStyle}
        />
      </button>
    </div>
  );
};
