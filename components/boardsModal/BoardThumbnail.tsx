import React, { useMemo } from 'react';
import type { WidgetData } from '@/types';
import { TOOLS } from '@/config/tools';
import {
  isCustomBackground,
  isExternalBackground,
  getCustomBackgroundStyle,
} from '@/utils/backgrounds';

// Widget-type → lucide icon lookup, built once from the TOOLS metadata
// so the wireframe boxes can hint at what's inside ("oh that's the timer
// in the corner, that's the noise meter") without rendering live widgets.
// Falls back to no-icon for widget types missing from TOOLS — safer than
// guessing or crashing.
const ICON_BY_TYPE = new Map<string, React.ElementType>(
  TOOLS.map((tool) => [tool.type, tool.icon])
);

// 16:9 minimum keeps sparse boards from rendering a single widget at
// near-full-card size (which would falsely suggest "huge widget"). Bigger
// boards expand the canvas naturally via bounding-box max below.
const MIN_CANVAS_W = 1200;
const MIN_CANVAS_H = 675;

interface BoardThumbnailProps {
  widgets: WidgetData[];
  // Same shape as `Dashboard.background`: either a Tailwind class string
  // ("bg-slate-800", "bg-gradient-to-br from-..."), or a URL / data URI.
  background?: string;
  className?: string;
}

/**
 * CSS-only wireframe preview of a Board's layout. Renders each widget as
 * a translucent box at its normalized canvas position so a teacher can
 * recognise a Board by its silhouette ("the one with the timer top-right
 * and the noise meter centre"). No widget content is rendered — content
 * thumbnails would require either canvas-snapshotting on save (storage
 * cost) or live-rendering widgets at scale (runtime cost). The wireframe
 * leans on data we already have in memory.
 */
export const BoardThumbnail: React.FC<BoardThumbnailProps> = ({
  widgets,
  background,
  className = '',
}) => {
  // Bounding-box max ensures widgets that overflow MIN_CANVAS still fit
  // inside the thumbnail rect (rather than clipping into invisibility).
  const bounds = useMemo(() => {
    let maxX = MIN_CANVAS_W;
    let maxY = MIN_CANVAS_H;
    for (const w of widgets) {
      const right = (w.x ?? 0) + (w.w ?? 0);
      const bottom = (w.y ?? 0) + (w.h ?? 0);
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    return { w: maxX, h: maxY };
  }, [widgets]);

  // Route the background through the same rules DashboardView uses so the
  // thumbnail visually matches the live board:
  //   - `custom:` prefix → strip + apply as inline color/gradient
  //   - http/data/blob URL → render as background-image (cover)
  //   - anything else → treat as Tailwind class
  // Falls back to slate-800 when no background is set at all.
  const containerStyle: React.CSSProperties = {
    aspectRatio: `${bounds.w} / ${bounds.h}`,
  };
  let bgClass = '';
  if (background && isCustomBackground(background)) {
    Object.assign(containerStyle, getCustomBackgroundStyle(background));
  } else if (background && isExternalBackground(background)) {
    containerStyle.backgroundImage = `url("${background}")`;
    containerStyle.backgroundSize = 'cover';
    containerStyle.backgroundPosition = 'center';
    containerStyle.backgroundRepeat = 'no-repeat';
  } else {
    bgClass = background ?? 'bg-slate-800';
  }

  return (
    <div
      className={`relative overflow-hidden rounded-md w-full ${bgClass} ${className}`}
      style={containerStyle}
      aria-hidden="true"
    >
      {widgets.map((w) => {
        const left = ((w.x ?? 0) / bounds.w) * 100;
        const top = ((w.y ?? 0) / bounds.h) * 100;
        const width = ((w.w ?? 0) / bounds.w) * 100;
        const height = ((w.h ?? 0) / bounds.h) * 100;
        const Icon = ICON_BY_TYPE.get(w.type);
        return (
          <div
            key={w.id}
            className="absolute rounded-[2px] bg-white/30 border border-white/40 shadow-sm flex items-center justify-center text-white/85"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
          >
            {Icon && (
              <Icon
                // Half the box's smaller dimension, capped so even huge
                // widgets don't get giant icons that overwhelm the wireframe.
                className="w-1/2 h-1/2"
                style={{ maxWidth: 28, maxHeight: 28 }}
                strokeWidth={2}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
