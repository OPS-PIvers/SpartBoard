import React from 'react';
import { CheckSquare } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

interface LibrarySelectToggleProps {
  selectionMode: boolean;
  /** Turning selection off also clears what was picked. */
  onChange: (next: boolean) => void;
  anchor?: TourAnchorAttrs;
}

/** The library toolbar's Select / Cancel button for bulk actions. */
export const LibrarySelectToggle: React.FC<LibrarySelectToggleProps> = ({
  selectionMode,
  onChange,
  anchor,
}) => (
  <button
    type="button"
    onClick={() => onChange(!selectionMode)}
    {...anchor}
    className={`inline-flex items-center rounded-lg font-bold uppercase tracking-wider transition-colors ${
      selectionMode
        ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
        : 'bg-white/70 text-slate-600 hover:bg-white hover:text-slate-800'
    }`}
    style={{
      gap: 'min(6px, 1.5cqmin)',
      padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
      fontSize: 'min(11px, 4cqmin)',
    }}
    aria-pressed={selectionMode}
    title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
  >
    <CheckSquare
      style={{
        width: 'min(14px, 3.5cqmin)',
        height: 'min(14px, 3.5cqmin)',
      }}
    />
    {selectionMode ? 'Cancel' : 'Select'}
  </button>
);
