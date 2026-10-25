import React from 'react';
import { RotateCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { WidgetType } from '@/types';
import {
  type DocCamView,
  MAX_ZOOM,
  MIN_ZOOM,
  isDefaultView,
} from './docCamView';

const ICON = { width: 'min(18px, 4.5cqmin)', height: 'min(18px, 4.5cqmin)' };
const BUTTON =
  'relative touch-target-expand hover:bg-white/30 rounded-xl text-white disabled:opacity-30 disabled:cursor-not-allowed';

interface Props {
  widgetId: string;
  widgetType: WidgetType;
  view: DocCamView;
  disabled: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onReset: () => void;
}

const formatZoom = (z: number) => `${Math.round(z * 10) / 10}x`;

export const DocCamViewControls: React.FC<Props> = ({
  widgetId,
  widgetType,
  view,
  disabled,
  onZoomIn,
  onZoomOut,
  onRotate,
  onReset,
}) => (
  <div
    className="absolute flex flex-col items-center bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/30 shadow-2xl opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 z-30"
    style={{
      top: '50%',
      transform: 'translateY(-50%)',
      right: 'min(16px, 4cqmin)',
      gap: 'min(2px, 0.5cqmin)',
      padding: 'min(6px, 1.5cqmin)',
    }}
  >
    <button
      {...tourAttr('webcam.zoom-in', widgetId, widgetType)}
      onClick={onZoomIn}
      disabled={disabled || view.zoom >= MAX_ZOOM}
      className={BUTTON}
      style={{ padding: 'min(8px, 2cqmin)' }}
      title="Zoom in"
      aria-label="Zoom in"
    >
      <ZoomIn style={ICON} />
    </button>
    <span
      className="text-white/80 font-semibold tabular-nums"
      style={{ fontSize: 'min(11px, 2.75cqmin)' }}
    >
      {formatZoom(view.zoom)}
    </span>
    <button
      {...tourAttr('webcam.zoom-out', widgetId, widgetType)}
      onClick={onZoomOut}
      disabled={disabled || view.zoom <= MIN_ZOOM}
      className={BUTTON}
      style={{ padding: 'min(8px, 2cqmin)' }}
      title="Zoom out"
      aria-label="Zoom out"
    >
      <ZoomOut style={ICON} />
    </button>
    <div
      className="bg-white/20 self-stretch"
      style={{ height: 1, margin: 'min(2px, 0.5cqmin) 0' }}
    />
    <button
      {...tourAttr('webcam.rotate', widgetId, widgetType)}
      onClick={onRotate}
      disabled={disabled}
      className={BUTTON}
      style={{ padding: 'min(8px, 2cqmin)' }}
      title="Rotate"
      aria-label="Rotate"
    >
      <RotateCw style={ICON} />
    </button>
    {!isDefaultView(view) && (
      <button
        {...tourAttr('webcam.reset-view', widgetId, widgetType)}
        onClick={onReset}
        className={BUTTON}
        style={{ padding: 'min(8px, 2cqmin)' }}
        title="Reset view"
        aria-label="Reset view"
      >
        <Maximize style={ICON} />
      </button>
    )}
  </div>
);
