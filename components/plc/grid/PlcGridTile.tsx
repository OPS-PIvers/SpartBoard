import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, GripVertical, Maximize2 } from 'lucide-react';
import type { PlcBentoTile as PlcBentoTileData, PlcGridCoords } from '@/types';
import { useTileResize, type ResizeDirection } from './useTileResize';

interface PlcGridTileProps {
  tile: PlcBentoTileData;
  /** Resolved coords for this render. May be a live preview during resize. */
  coords: PlcGridCoords;
  editMode: boolean;
  /** Live cell metrics getter — passed from `PlcGridLayout`'s ResizeObserver. */
  getCellMetrics: () => { cellW: number; cellH: number };
  inTray?: boolean;
  onResizePreview?: (
    kind: PlcBentoTileData['kind'],
    next: PlcGridCoords | null
  ) => void;
  onResizeCommit?: (
    kind: PlcBentoTileData['kind'],
    next: PlcGridCoords
  ) => void;
  onToggleHide?: (kind: PlcBentoTileData['kind']) => void;
  /**
   * Optional fullscreen-expand handler. When provided AND the tile is not
   * in edit mode, a top-right expand button appears on hover/focus.
   * Wired only for tiles whose kind has a real fullscreen body (notes,
   * todos, quizLibrary, etc.); preview-only tiles (plcInfo, sharedSheet)
   * leave it undefined and skip the button entirely.
   */
  onExpand?: (kind: PlcBentoTileData['kind']) => void;
  children: React.ReactNode;
}

const ALL_DIRECTIONS: readonly ResizeDirection[] = [
  'n',
  's',
  'e',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
];

/**
 * v2 PLC grid tile chrome. Differences from v1 `PlcBentoTile`:
 *
 *  - Coords drive `grid-column`/`grid-row` directly (not size-preset spans).
 *  - Edit mode shows 8 resize handles powered by `useTileResize`, not a
 *    button cycle.
 *  - Tile content is interactive in BOTH modes — drag/resize is scoped to
 *    dedicated handle elements so it doesn't fight the underlying widget
 *    content. (The v1 `pointer-events-none` hack is gone.)
 *  - A non-edit-mode "expand" button surfaces a fullscreen affordance,
 *    standing in for the tab-navigation pattern Phase 2 will retire.
 */
export const PlcGridTile: React.FC<PlcGridTileProps> = ({
  tile,
  coords,
  editMode,
  getCellMetrics,
  inTray = false,
  onResizePreview,
  onResizeCommit,
  onToggleHide,
  onExpand,
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

  const { onResizePointerDown } = useTileResize({
    coords,
    getMetrics: getCellMetrics,
    onPreview: (next) => onResizePreview?.(tile.kind, next),
    onCommit: (next) => onResizeCommit?.(tile.kind, next),
  });

  const dragStyle: React.CSSProperties = useMemo(
    () => ({
      transform: CSS.Translate.toString(transform),
      transition,
      opacity: isDragging ? 0 : 1,
    }),
    [transform, transition, isDragging]
  );

  const gridStyle: React.CSSProperties = inTray
    ? {}
    : {
        gridColumnStart: coords.x + 1,
        gridColumnEnd: `span ${coords.w}`,
        gridRowStart: coords.y + 1,
        gridRowEnd: `span ${coords.h}`,
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
      style={{ ...dragStyle, ...gridStyle }}
      className={`group relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-shadow ${
        editMode ? 'ring-1 ring-brand-blue-primary/20' : 'hover:shadow-md'
      }`}
      data-tile-kind={tile.kind}
      data-tile-x={coords.x}
      data-tile-y={coords.y}
      data-tile-w={coords.w}
      data-tile-h={coords.h}
    >
      {/*
        Tile content (always interactive — drag/resize is gated to chrome).
        In edit mode we inset the content so it doesn't sit underneath the
        corner resize handles or the grip/hide chrome buttons (which would
        otherwise cover content placed flush to the corners — see e.g.
        QuickActionsTile's header icon, NotesTile's footer button).
      */}
      <div
        className={`flex-1 min-h-0 relative ${
          editMode ? 'p-2 pt-10 pb-10' : ''
        }`}
      >
        {children}
      </div>

      {editMode && (
        <>
          {/* Top-left grip (drag handle for reorder). */}
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="absolute top-2 left-2 z-20 p-1.5 bg-white/95 hover:bg-brand-blue-lighter rounded-md text-slate-400 hover:text-brand-blue-primary cursor-grab active:cursor-grabbing transition-colors shadow-sm border border-slate-200"
            aria-label={t('plcDashboard.overview.dragHandle', {
              defaultValue: 'Drag to reorder',
            })}
            title={t('plcDashboard.overview.dragHandle', {
              defaultValue: 'Drag to reorder',
            })}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          {/* Top-right hide button. */}
          <button
            type="button"
            onClick={() => onToggleHide?.(tile.kind)}
            className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-500 transition-colors shadow-sm border border-slate-200"
            aria-label={t('plcDashboard.overview.hideTile', {
              defaultValue: 'Hide tile',
            })}
            title={t('plcDashboard.overview.hideTile', {
              defaultValue: 'Hide tile',
            })}
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>

          {/* 8 resize handles. The corner handles overlap the edges and
              take priority via higher z-index. */}
          {ALL_DIRECTIONS.map((dir) => (
            <div
              key={dir}
              onPointerDown={onResizePointerDown(dir)}
              data-resize-handle={dir}
              role="presentation"
              className={`absolute z-10 ${HANDLE_CLASSES[dir]}`}
              style={HANDLE_STYLES[dir]}
            />
          ))}
        </>
      )}

      {/*
        Non-edit-mode "expand" affordance. Surfaces a fullscreen view of
        the tile body so users with a small layout can focus on one tile
        without rearranging. Visible on hover/focus only to keep the
        glanceable preview state uncluttered.
      */}
      {!editMode && onExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(tile.kind);
          }}
          className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 hover:bg-brand-blue-lighter rounded-md text-slate-400 hover:text-brand-blue-primary transition-colors shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('plcDashboard.overview.expandTile', {
            defaultValue: 'Expand tile',
          })}
          title={t('plcDashboard.overview.expandTile', {
            defaultValue: 'Expand tile',
          })}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/**
 * Per-direction handle classes. Edges are thin strips along one side;
 * corners are 16×16 squares anchored to the corner. Cursor classes match
 * the resize direction.
 */
const HANDLE_CLASSES: Record<ResizeDirection, string> = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
};

const EDGE_THICKNESS = 6;
const CORNER_SIZE = 14;

const HANDLE_STYLES: Record<ResizeDirection, React.CSSProperties> = {
  n: {
    top: 0,
    left: CORNER_SIZE,
    right: CORNER_SIZE,
    height: EDGE_THICKNESS,
  },
  s: {
    bottom: 0,
    left: CORNER_SIZE,
    right: CORNER_SIZE,
    height: EDGE_THICKNESS,
  },
  e: {
    right: 0,
    top: CORNER_SIZE,
    bottom: CORNER_SIZE,
    width: EDGE_THICKNESS,
  },
  w: {
    left: 0,
    top: CORNER_SIZE,
    bottom: CORNER_SIZE,
    width: EDGE_THICKNESS,
  },
  ne: { top: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  nw: { top: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  se: { bottom: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  sw: { bottom: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE },
};
