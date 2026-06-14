import React from 'react';
import { Maximize, Minimize2 } from 'lucide-react';
import { WidgetData } from '@/types';

interface RemoteEmbedControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

/**
 * RemoteEmbedControl — spotlight/swap only.
 *
 * A single large "Feature on Board" button that maximizes the embed full-screen
 * on the projected desktop board, mirroring the existing Maximize button in
 * RemoteWidgetCard (handleMaximize): `{ maximized, flipped: false }`. Using the
 * same field keeps the remote and desktop on one maximize code path.
 *
 * NOTE: Slide next/prev navigation for Google Slides decks was assessed and found
 * infeasible through the current embed pipeline — the stored/rendered URL is the
 * `/preview` form, which has no slide-index contract, and `convertToEmbedUrl`
 * strips params at render time. See
 * docs/superpowers/spikes/2026-06-13-embed-slide-control.md (VERDICT: FAIL).
 * This control therefore ships spotlight/swap only — no slide controls.
 */
export const RemoteEmbedControl: React.FC<RemoteEmbedControlProps> = ({
  widget,
  updateWidget,
}) => {
  const isMaximized = widget.maximized ?? false;

  const handleFeature = () => {
    // Same mechanism as RemoteWidgetCard's Maximize button.
    updateWidget(widget.id, { maximized: !isMaximized, flipped: false });
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Embed
      </div>

      <button
        onClick={handleFeature}
        // touch-action:manipulation removes the 300 ms mobile tap delay.
        style={{ touchAction: 'manipulation' }}
        className={`touch-manipulation flex flex-col items-center justify-center gap-3 w-full px-6 py-10 rounded-3xl border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
          isMaximized
            ? 'bg-blue-500/20 border-blue-400/60 text-blue-200'
            : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
        }`}
        aria-label={isMaximized ? 'Exit full screen' : 'Feature on board'}
        aria-pressed={isMaximized}
      >
        {isMaximized ? (
          <Minimize2 className="w-10 h-10" />
        ) : (
          <Maximize className="w-10 h-10" />
        )}
        <span className="font-black text-xl">
          {isMaximized ? 'Exit Full Screen' : 'Feature on Board'}
        </span>
      </button>

      <p className="text-white/40 text-xs text-center leading-relaxed max-w-xs">
        Spotlight (in the header above) overlays this embed on the board without
        maximizing it.
      </p>
    </div>
  );
};
