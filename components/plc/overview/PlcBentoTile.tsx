import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, GripVertical, Maximize2 } from 'lucide-react';
import type { PlcBentoTile as PlcBentoTileData } from '@/types';
import { TILE_GRID_SPANS } from './bentoSizes';

interface PlcBentoTileProps {
  tile: PlcBentoTileData;
  editMode: boolean;
  /** Hidden tray rendering: drag/sort wiring is suppressed and grid spans collapse. */
  inTray?: boolean;
  onResize?: (kind: PlcBentoTileData['kind']) => void;
  onToggleHide?: (kind: PlcBentoTileData['kind']) => void;
  children: React.ReactNode;
}

/**
 * Sortable bento tile wrapper. Owns:
 *   - the dnd-kit `useSortable` binding (drag handle scoped to the grip icon)
 *   - the CSS-grid `grid-column` / `grid-row` spans for the tile size
 *   - edit-mode chrome (grip, resize, hide buttons)
 *   - the tile content slot
 *
 * Tile content is rendered in a wrapper that gets `pointer-events-none` while
 * `editMode` is true, so the user's clicks fall through to the chrome
 * controls instead of triggering the live tile interactions (e.g. opening
 * a note while trying to drag the tile).
 *
 * `inTray` mode is for the "Hidden tiles" tray: the tile renders as a
 * compact restore-button without the resize/grip controls.
 */
export const PlcBentoTile: React.FC<PlcBentoTileProps> = ({
  tile,
  editMode,
  inTray = false,
  onResize,
  onToggleHide,
  children,
}) => {
  const { t } = useTranslation();
  const sortable = useSortable({
    id: tile.kind,
    disabled: !editMode || inTray,
  });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  // `tile.size` is optional on the type (v2 grid uses `coords` instead) but
  // this v1 component is only rendered behind the legacy code path where
  // size is always populated by `parseTile`/`mergeLayout`. Defensive fallback.
  const size = tile.size ?? 'sm';
  const span = TILE_GRID_SPANS[size];

  const baseStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const gridStyle: React.CSSProperties = inTray
    ? {}
    : {
        gridColumn: `span ${span.col} / span ${span.col}`,
        gridRow: `span ${span.row} / span ${span.row}`,
      };

  if (inTray) {
    return (
      <button
        type="button"
        onClick={() => onToggleHide?.(tile.kind)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-slate-300 hover:border-brand-blue-primary rounded-lg text-xs font-semibold text-slate-600 hover:text-brand-blue-primary transition-colors"
        aria-label={t('plcDashboard.overview.unhideTile', {
          defaultValue: 'Restore {{kind}} tile',
          kind: tile.kind,
        })}
      >
        <Eye className="w-3.5 h-3.5" />
        <span className="capitalize">{tile.kind}</span>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...baseStyle, ...gridStyle }}
      className={`relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-shadow ${
        editMode ? 'ring-1 ring-brand-blue-primary/20' : 'hover:shadow-md'
      }`}
      data-tile-kind={tile.kind}
      data-tile-size={size}
    >
      {/* Edit-mode chrome */}
      {editMode && (
        <>
          {/* Drag handle (grip icon, top-left) — listeners scoped here so
              tile content stays interactive when not dragging. */}
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="absolute top-2 left-2 z-10 p-1.5 bg-white/95 hover:bg-brand-blue-lighter rounded-md text-slate-400 hover:text-brand-blue-primary cursor-grab active:cursor-grabbing transition-colors shadow-sm border border-slate-200"
            aria-label={t('plcDashboard.overview.dragHandle', {
              defaultValue: 'Drag to reorder',
            })}
            title={t('plcDashboard.overview.dragHandle', {
              defaultValue: 'Drag to reorder',
            })}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          {/* Hide button (top-right) */}
          <button
            type="button"
            onClick={() => onToggleHide?.(tile.kind)}
            className="absolute top-2 right-2 z-10 p-1.5 bg-white/95 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-500 transition-colors shadow-sm border border-slate-200"
            aria-label={t('plcDashboard.overview.hideTile', {
              defaultValue: 'Hide tile',
            })}
            title={t('plcDashboard.overview.hideTile', {
              defaultValue: 'Hide tile',
            })}
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>

          {/* Resize button (bottom-right) — cycles size variants */}
          <button
            type="button"
            onClick={() => onResize?.(tile.kind)}
            className="absolute bottom-2 right-2 z-10 p-1.5 bg-white/95 hover:bg-brand-blue-lighter rounded-md text-slate-400 hover:text-brand-blue-primary transition-colors shadow-sm border border-slate-200"
            aria-label={t('plcDashboard.overview.resizeTile', {
              defaultValue: 'Resize tile (current: {{size}})',
              size,
            })}
            title={t('plcDashboard.overview.resizeTile', {
              defaultValue: 'Resize tile (current: {{size}})',
              size,
            })}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {/* Tile content. While editing, suppress interaction so clicks land on
          the chrome buttons, not on whatever interactive content the tile
          renders (e.g. a note's open-link). */}
      <div
        className={`flex-1 min-h-0 ${editMode ? 'pointer-events-none select-none' : ''}`}
      >
        {children}
      </div>
    </div>
  );
};
