import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, ZoomIn, ZoomOut, Search } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { IconButton } from '@/components/common/IconButton';
import { Z_INDEX } from '@/config/zIndex';

// First zoom level applied when the collapsed FAB is clicked — small enough
// to feel like a gentle nudge rather than a jarring jump.
const INITIAL_ZOOM = 1.2;

export const BoardZoomControl: React.FC = () => {
  const { t } = useTranslation();
  const { zoom, setZoom } = useDashboard();

  const percentage = Math.round(zoom * 100);

  // Collapsed FAB when at 100% — always visible so users know zoom exists
  if (zoom === 1) {
    return (
      <button
        onClick={() => setZoom(INITIAL_ZOOM)}
        title={t('common.zoom') ?? 'Zoom (Ctrl + scroll)'}
        className="fixed bottom-16 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-all backdrop-blur-sm"
        aria-label={t('common.zoom') ?? 'Zoom'}
        style={{ zIndex: Z_INDEX.critical }}
      >
        <Search className="w-4 h-4" />
      </button>
    );
  }

  // Expanded panel when zoomed
  return (
    <div
      className="fixed bottom-16 right-4 flex flex-col items-center gap-2 animate-in slide-in-from-right-4 fade-in duration-300"
      style={{ zIndex: Z_INDEX.critical }}
    >
      <div className="bg-white/80 backdrop-blur-md border border-white/40 shadow-xl rounded-2xl p-1.5 flex flex-col gap-1 items-center">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter px-2 pt-1">
          {t('common.zoom') ?? 'Zoom'}
        </span>
        <div className="flex flex-col items-center gap-1">
          <IconButton
            onClick={() => setZoom(Math.min(zoom + 0.1, 5))}
            icon={<ZoomIn className="w-4 h-4" />}
            size="sm"
            variant="glass"
            label="Zoom In"
          />
          <button
            onClick={() => setZoom(1)}
            className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all group active:scale-95"
            title="Reset to 100%"
          >
            <span className="text-xs font-black tabular-nums">
              {percentage}%
            </span>
          </button>
          <IconButton
            onClick={() => setZoom(Math.max(zoom - 0.1, 1))}
            icon={<ZoomOut className="w-4 h-4" />}
            size="sm"
            variant="glass"
            label="Zoom Out"
          />
        </div>
        <div className="w-full h-px bg-slate-200/50 my-0.5" />
        <IconButton
          onClick={() => setZoom(1)}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
          size="sm"
          variant="ghost"
          label="Reset Zoom"
          className="text-slate-400 hover:text-indigo-600"
        />
      </div>
    </div>
  );
};
