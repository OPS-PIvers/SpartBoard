import React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { tourAttr } from '@/config/tourAnchors';
import { Z_INDEX } from '@/config/zIndex';

// Corner button that opens a partner widget beside this one and links the two.
export const LaunchLinkedWidgetButton: React.FC<{
  icon: LucideIcon;
  label: string;
  anchor: ReturnType<typeof tourAttr>;
  onClick: () => void;
  size: string;
  color: string;
  className?: string;
  /** Sits above the window's corner resize handle so a corner placement stays tappable. */
  inCorner?: boolean;
}> = ({
  icon: Icon,
  label,
  anchor,
  onClick,
  size,
  color,
  className = 'relative',
  inCorner = false,
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
    style={{
      color,
      padding: `calc(${size} / 6)`,
      ...(inCorner ? { zIndex: Z_INDEX.widgetResize + 1 } : {}),
    }}
  >
    <Icon style={{ width: size, height: size }} />
  </button>
);
