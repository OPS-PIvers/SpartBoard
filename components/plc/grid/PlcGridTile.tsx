import React, { useCallback, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, GripVertical, Maximize2 } from 'lucide-react';
import type { PlcBentoTile as PlcBentoTileData, PlcGridCoords } from '@/types';
import { useTileResize, type ResizeDirection } from './useTileResize';
import { clampCoords } from './tileGridMath';

interface PlcGridTileProps {
  tile: PlcBentoTileData;
  /** Resolved coords for this render. May be a live preview during resize. */
  coords: PlcGridCoords;
  /**
   * Edit mode: enables reorder (drag handle visible + sortable active) and
   * the hide-tile button. Always-on for both mobile and desktop so a
   * touch user can long-press the grip to reorder even when resize is
   * hidden.
   */
  editMode: boolean;
  /**
   * Whether to render the desktop 8-handle resize chrome (thin edges +
   * small corners). Decoupled from `editMode` so mobile can keep
   * reorder-only while desktop gets both reorder + resize. Defaults to
   * true when `editMode` is on; callers gate to false on touch.
   */
  showResizeHandles?: boolean;
  /**
   * Phase 5 mobile resize: when true (and `showResizeHandles` is false),
   * render four 44×44 corner-only touch targets in place of the desktop
   * 8-handle chrome. WCAG 2.5.5 — the desktop handles are 6px thick and
   * unusable with a finger; the touch variant gives a stable corner grab
   * area at the platform-recommended minimum. Edges are deliberately
   * omitted on touch: the 6px edges remained too thin to surface even at
   * 44px, and the cardinal-direction case is rarely needed when corner
   * drags can change both axes simultaneously.
   */
  touchResizeHandles?: boolean;
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

type TouchResizeDirection = 'nw' | 'ne' | 'sw' | 'se';

const TOUCH_CORNER_DIRECTIONS: readonly TouchResizeDirection[] = [
  'nw',
  'ne',
  'sw',
  'se',
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
  showResizeHandles = true,
  touchResizeHandles = false,
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

  /**
   * Keyboard resize on the grip handle. Shift+Arrow grows/shrinks the
   * tile by one cell along the axis; plain Arrow keys reorder (handled
   * by @dnd-kit's KeyboardSensor at the DndContext level — we don't
   * intercept those). Right-edge growth is preferred over left for
   * horizontal resize so `x` stays stable when possible; vertical
   * resize grows downward. This mirrors the way a mouse drag-resize
   * typically anchors the opposite corner.
   *
   * The grip already spreads `{...listeners} {...attributes}` from
   * `useSortable`. We attach this onKeyDown AFTER the spread so it runs
   * alongside the sortable handler; the `stopPropagation` + `preventDefault`
   * combo blocks dnd-kit from reading Shift+Arrow as a sortable move.
   * (dnd-kit's KeyboardSensor activates on Space first, so plain Arrows
   * only matter once a sortable drag is active.)
   */
  const handleGripKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!e.shiftKey) return;
      let dw = 0;
      let dh = 0;
      switch (e.key) {
        case 'ArrowLeft':
          dw = -1;
          break;
        case 'ArrowRight':
          dw = 1;
          break;
        case 'ArrowUp':
          dh = -1;
          break;
        case 'ArrowDown':
          dh = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      // Run the proposed dimensions through the same clamp helper the
      // pointer-drag resize uses, so the keyboard path can't drift from
      // the rest of the grid's bounds. `x`/`y` are held fixed —
      // horizontal resize anchors to the left edge, vertical to the
      // top; widening past the right edge clamps to `GRID_COLS - x`.
      const next = clampCoords({
        x: coords.x,
        y: coords.y,
        w: coords.w + dw,
        h: coords.h + dh,
      });
      if (next.w === coords.w && next.h === coords.h) return;
      onResizeCommit?.(tile.kind, next);
    },
    [coords, onResizeCommit, tile.kind]
  );

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
        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
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
            onKeyDown={(e) => {
              // Order matters: we run our resize handler first. If it
              // consumed the keystroke (Shift+Arrow) it calls
              // `preventDefault()`, so we skip dnd-kit's listener.
              // Otherwise we forward to the listener spread above so
              // @dnd-kit's KeyboardSensor still gets plain Arrow / Space
              // / Enter for sortable reorder — without this forward the
              // spread's `onKeyDown` was being clobbered by ours (a
              // React last-prop-wins issue flagged in PR review).
              handleGripKeyDown(e);
              if (!e.defaultPrevented) {
                listeners?.onKeyDown?.(e);
              }
            }}
            className="absolute top-2 left-2 z-20 p-1.5 bg-white/95 hover:bg-brand-blue-lighter rounded-md text-slate-400 hover:text-brand-blue-primary cursor-grab active:cursor-grabbing transition-colors shadow-sm border border-slate-200"
            aria-label={t('plcDashboard.overview.dragHandle', {
              defaultValue: 'Drag to reorder · Shift+Arrow keys to resize',
            })}
            title={t('plcDashboard.overview.dragHandle', {
              defaultValue: 'Drag to reorder · Shift+Arrow keys to resize',
            })}
          >
            <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
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
            <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {/* Desktop: 8 resize handles. The corner handles overlap the edges
              and take priority via higher z-index. Hidden when
              `showResizeHandles` is false (mobile in edit mode keeps
              reorder via the grip but suppresses the desktop 6px chrome
              because it isn't touch-friendly). */}
          {showResizeHandles &&
            ALL_DIRECTIONS.map((dir) => (
              <div
                key={dir}
                onPointerDown={onResizePointerDown(dir)}
                data-resize-handle={dir}
                aria-hidden="true"
                className={`absolute z-10 ${HANDLE_CLASSES[dir]}`}
                style={HANDLE_STYLES[dir]}
              />
            ))}

          {/* Mobile: 4 corner-only touch handles, 44×44px (WCAG 2.5.5).
              Sized for fingers, transparent visual but with a small
              visible square marker so users discover them; tap+drag
              from any corner resizes both axes. Renders only when the
              desktop chrome is suppressed so we never double-up.

              The marker is positioned absolutely inside the handle so
              its corner matches the resize direction (nw marker in the
              nw corner of the nw handle, etc.). An earlier `flex` +
              per-direction `align-self` overrides path was flagged as
              inconsistent across directions in PR review; absolute
              positioning is simpler and reliable. */}
          {!showResizeHandles &&
            touchResizeHandles &&
            TOUCH_CORNER_DIRECTIONS.map((dir) => (
              <div
                key={`touch-${dir}`}
                onPointerDown={onResizePointerDown(dir)}
                data-resize-handle={dir}
                data-resize-touch
                aria-hidden="true"
                className={`absolute z-10 ${HANDLE_CLASSES[dir]}`}
                style={TOUCH_HANDLE_STYLES[dir]}
              >
                <div
                  className="absolute w-2.5 h-2.5 rounded-sm bg-brand-blue-primary/60 shadow-sm"
                  aria-hidden="true"
                  style={TOUCH_MARKER_ANCHOR[dir]}
                />
              </div>
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
        // Always slightly visible (opacity-60) so touch users — who can't
        // hover — can find the expand affordance. Full opacity on hover/
        // focus for desktop. Reviewer flagged the previous `opacity-0
        // group-hover` was invisible on iPad / projector setups.
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(tile.kind);
          }}
          className="absolute top-2 right-2 z-20 p-1.5 bg-white/95 hover:bg-brand-blue-lighter rounded-md text-slate-400 hover:text-brand-blue-primary transition-all shadow-sm border border-slate-200 opacity-60 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('plcDashboard.overview.expandTile', {
            defaultValue: 'Expand tile',
          })}
          title={t('plcDashboard.overview.expandTile', {
            defaultValue: 'Expand tile',
          })}
        >
          <Maximize2 aria-hidden="true" className="w-3.5 h-3.5" />
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
/** WCAG 2.5.5 minimum touch target. */
const TOUCH_CORNER_SIZE = 44;

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

const TOUCH_HANDLE_STYLES: Record<TouchResizeDirection, React.CSSProperties> = {
  nw: {
    top: 0,
    left: 0,
    width: TOUCH_CORNER_SIZE,
    height: TOUCH_CORNER_SIZE,
  },
  ne: {
    top: 0,
    right: 0,
    width: TOUCH_CORNER_SIZE,
    height: TOUCH_CORNER_SIZE,
  },
  sw: {
    bottom: 0,
    left: 0,
    width: TOUCH_CORNER_SIZE,
    height: TOUCH_CORNER_SIZE,
  },
  se: {
    bottom: 0,
    right: 0,
    width: TOUCH_CORNER_SIZE,
    height: TOUCH_CORNER_SIZE,
  },
};

/**
 * Anchor the small visible marker inside each 44×44 touch hit-box to the
 * tile corner the handle represents. Pixel offsets (not container-query
 * units) — these are chrome on a fixed-size touch target, not widget
 * front-face content, so they shouldn't scale with the tile.
 */
const TOUCH_MARKER_INSET = 4;
const TOUCH_MARKER_ANCHOR: Record<TouchResizeDirection, React.CSSProperties> = {
  nw: { top: TOUCH_MARKER_INSET, left: TOUCH_MARKER_INSET },
  ne: { top: TOUCH_MARKER_INSET, right: TOUCH_MARKER_INSET },
  sw: { bottom: TOUCH_MARKER_INSET, left: TOUCH_MARKER_INSET },
  se: { bottom: TOUCH_MARKER_INSET, right: TOUCH_MARKER_INSET },
};
