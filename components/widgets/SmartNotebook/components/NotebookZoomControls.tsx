import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
  NOTEBOOK_MAX_ZOOM,
  NOTEBOOK_MIN_ZOOM,
  NotebookZoom,
} from '../useNotebookZoom';

interface NotebookZoomControlsProps {
  zoom: NotebookZoom;
}

/** Zoom out / percentage (click to fit) / zoom in, styled like the page nav. */
export const NotebookZoomControls: React.FC<NotebookZoomControlsProps> = ({
  zoom,
}) => {
  const btnClass =
    'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl disabled:opacity-30 transition-all shadow-sm active:scale-90';
  const btnStyle = { padding: 'min(8px, 2cqmin)' };
  const iconStyle = {
    width: 'min(16px, 4cqmin)',
    height: 'min(16px, 4cqmin)',
  };

  return (
    <div className="flex items-center" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      <button
        onClick={zoom.zoomOut}
        disabled={zoom.scale <= NOTEBOOK_MIN_ZOOM}
        className={btnClass}
        style={btnStyle}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut style={iconStyle} />
      </button>
      <button
        onClick={zoom.reset}
        className="rounded-lg hover:bg-slate-100 font-black text-slate-700 tracking-widest uppercase transition-colors"
        style={{
          fontSize: 'min(11px, 2.8cqmin)',
          padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
          minWidth: 'min(52px, 13cqmin)',
        }}
        title="Reset zoom to fit"
        aria-label="Reset zoom to fit"
      >
        {Math.round(zoom.scale * 100)}%
      </button>
      <button
        onClick={zoom.zoomIn}
        disabled={zoom.scale >= NOTEBOOK_MAX_ZOOM}
        className={btnClass}
        style={btnStyle}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn style={iconStyle} />
      </button>
    </div>
  );
};

export default NotebookZoomControls;
