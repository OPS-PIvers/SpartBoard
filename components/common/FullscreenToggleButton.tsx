import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export const FullscreenToggleButton: React.FC<{
  fullscreen: boolean;
  onToggle: () => void;
}> = ({ fullscreen, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={fullscreen}
    aria-label={fullscreen ? 'Exit full screen' : 'View full screen'}
    title={fullscreen ? 'Exit full screen (Esc)' : 'View full screen'}
    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
  >
    {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
  </button>
);
