import React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { tourAttr } from '@/config/tourAnchors';

// Corner button that opens a partner widget beside this one and links the two.
export const LaunchLinkedWidgetButton: React.FC<{
  icon: LucideIcon;
  label: string;
  anchor: ReturnType<typeof tourAttr>;
  onClick: () => void;
  size: string;
  color: string;
  className?: string;
}> = ({
  icon: Icon,
  label,
  anchor,
  onClick,
  size,
  color,
  className = 'relative',
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={label}
    aria-label={label}
    {...anchor}
    className={`touch-target-expand shrink-0 flex items-center justify-center rounded-lg transition-opacity opacity-70 hover:opacity-100 focus-visible:opacity-100 ${className}`}
    style={{ color, padding: `calc(${size} / 6)` }}
  >
    <Icon style={{ width: size, height: size }} />
  </button>
);
