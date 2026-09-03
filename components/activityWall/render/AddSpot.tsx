import React from 'react';
import { Plus } from 'lucide-react';
import { wallScale } from './scale';
import type { WallPlacement, WallRenderMode } from './types';

interface AddSpotProps {
  mode: WallRenderMode;
  placement: WallPlacement;
  onAddAt: (placement: WallPlacement) => void;
  className?: string;
  style?: React.CSSProperties;
  /** Skip the hover gating so the spot is always visible (fixed-corner spots). */
  alwaysVisible?: boolean;
}

/** A plus button that pre-fills the composer with a placement; hidden until its host is hovered or focused. */
export const AddSpot: React.FC<AddSpotProps> = ({
  mode,
  placement,
  onAddAt,
  className = '',
  style,
  alwaysVisible = false,
}) => {
  const scale = wallScale(mode);
  const reveal = alwaysVisible
    ? 'opacity-80 hover:opacity-100 focus-visible:opacity-100'
    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-40';

  return (
    <button
      type="button"
      aria-label="Add a post here"
      data-testid="aw-add-spot"
      data-placement={JSON.stringify(placement)}
      onClick={(e) => {
        e.stopPropagation();
        onAddAt(placement);
      }}
      className={`flex items-center justify-center rounded-full border border-dashed border-white/40 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${reveal} ${className}`}
      style={{ padding: scale.pad, ...style }}
    >
      <Plus
        aria-hidden="true"
        style={{ width: scale.icon, height: scale.icon }}
      />
    </button>
  );
};

export default AddSpot;
