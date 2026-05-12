import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import {
  Plc,
  PlcBentoTile,
  PlcBentoTileKind,
  PlcGridCoords,
  PlcOverviewLayout,
  getPlcFeatures,
} from '@/types';
import { renderTileContent, tileFeatureGate } from '../overview/tileRegistry';
import { PlcGridTile } from './PlcGridTile';
import {
  GRID_COLS,
  commitTileCoords,
  deriveCoordsFromLegacy,
} from './tileGridMath';
import type { PlcDashboardTabId } from '../PlcDashboard';

interface PlcGridLayoutProps {
  plc: Plc;
  layout: PlcOverviewLayout;
  editMode: boolean;
  onLayoutChange: (next: PlcOverviewLayout) => void;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

/** Pixel height of a single grid row on desktop. Chosen so a 3×2 tile
 *  (the v1 `sm` analog) is ~200px tall — comparable to v1's 180px rows
 *  but with finer-grained vertical resize. */
const ROW_HEIGHT_PX = 88;
const GRID_GAP_PX = 16;
/** Viewport width below which the grid collapses to a single column flow. */
const MOBILE_BREAKPOINT_PX = 768;

/**
 * The v2 PLC overview grid. Replaces the v1 `PlcBentoGrid`'s discrete
 * 4-col preset-size layout with a 12-column drag-resizable grid where
 * tiles carry `{x, y, w, h}` coords.
 *
 *  - Reorder: drag the grip handle on a tile (scoped via `useSortable`).
 *  - Resize: drag any of 8 edge/corner handles (powered by `useTileResize`).
 *  - Collision: on resize commit, `commitTileCoords` re-packs the layout so
 *    neighbors push down without overlapping.
 *  - Mobile: collapses to single-column flow; resize handles are hidden,
 *    reorder works via long-press on the grip.
 *
 * Layout state is owned by the caller (`PlcOverviewTab` via
 * `usePlcOverviewLayout`); this component is a controlled view.
 */
export const PlcGridLayout: React.FC<PlcGridLayoutProps> = ({
  plc,
  layout,
  editMode,
  onLayoutChange,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const features = useMemo(() => getPlcFeatures(plc), [plc]);
  const [activeKind, setActiveKind] = useState<PlcBentoTileKind | null>(null);

  // Live preview state while resizing. Keyed by kind so multi-tile previews
  // (future drag-multi) won't fight each other.
  const [resizePreviews, setResizePreviews] = useState<
    Map<PlcBentoTileKind, PlcGridCoords>
  >(() => new Map());

  // Container width / cell metrics tracked via ResizeObserver. Set on mount
  // and updated when the container resizes (sidebar collapse, viewport
  // resize, etc.).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cellMetricsRef = useRef<{ cellW: number; cellH: number }>({
    cellW: 0,
    cellH: ROW_HEIGHT_PX,
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const recompute = () => {
      const rect = el.getBoundingClientRect();
      const usable = Math.max(0, rect.width - GRID_GAP_PX * (GRID_COLS - 1));
      cellMetricsRef.current = {
        cellW: usable / GRID_COLS,
        cellH: ROW_HEIGHT_PX,
      };
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const featureFilteredTiles = useMemo(
    () =>
      layout.tiles.filter((tile) => {
        const gate = tileFeatureGate(tile.kind);
        if (gate && !features[gate]) return false;
        return true;
      }),
    [layout.tiles, features]
  );

  const visibleTiles = featureFilteredTiles.filter((t) => !t.hidden);
  const hiddenTiles = featureFilteredTiles.filter((t) => t.hidden);
  const visibleKinds = useMemo(
    () => visibleTiles.map((t) => t.kind),
    [visibleTiles]
  );

  const activeTile = useMemo(
    () =>
      activeKind == null
        ? null
        : (visibleTiles.find((t) => t.kind === activeKind) ?? null),
    [activeKind, visibleTiles]
  );

  const resolveCoords = useCallback(
    (tile: PlcBentoTile): PlcGridCoords => {
      const preview = resizePreviews.get(tile.kind);
      if (preview) return preview;
      return tile.coords ?? deriveCoordsFromLegacy(tile);
    },
    [resizePreviews]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveKind(event.active.id as PlcBentoTileKind);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveKind(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveKind(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeKindId = active.id as PlcBentoTileKind;
      const overKindId = over.id as PlcBentoTileKind;
      const activeTileData = layout.tiles.find((t) => t.kind === activeKindId);
      const overTileData = layout.tiles.find((t) => t.kind === overKindId);
      if (!activeTileData || !overTileData) return;

      // Coords drive grid placement (not array order), so a pure array
      // splice would be a visual no-op. Swap the dragged tile into the
      // drop target's position and let `commitTileCoords` push-down the
      // rest of the layout to fill the vacated slot.
      const dropCoords =
        overTileData.coords ?? deriveCoordsFromLegacy(overTileData);
      const draggedW =
        activeTileData.coords?.w ?? deriveCoordsFromLegacy(activeTileData).w;
      const draggedH =
        activeTileData.coords?.h ?? deriveCoordsFromLegacy(activeTileData).h;
      const next = commitTileCoords(layout.tiles, activeKindId, {
        x: dropCoords.x,
        y: dropCoords.y,
        w: draggedW,
        h: draggedH,
      });
      onLayoutChange({ tiles: next, updatedAt: Date.now() });
    },
    [layout, onLayoutChange]
  );

  const handleResizePreview = useCallback(
    (kind: PlcBentoTileKind, next: PlcGridCoords | null) => {
      setResizePreviews((prev) => {
        const copy = new Map(prev);
        if (next) copy.set(kind, next);
        else copy.delete(kind);
        return copy;
      });
    },
    []
  );

  const handleResizeCommit = useCallback(
    (kind: PlcBentoTileKind, next: PlcGridCoords) => {
      const packed = commitTileCoords(layout.tiles, kind, next);
      onLayoutChange({ tiles: packed, updatedAt: Date.now() });
      setResizePreviews((prev) => {
        if (!prev.has(kind)) return prev;
        const copy = new Map(prev);
        copy.delete(kind);
        return copy;
      });
    },
    [layout, onLayoutChange]
  );

  const handleToggleHide = useCallback(
    (kind: PlcBentoTileKind) => {
      const next = layout.tiles.map((tile) =>
        tile.kind === kind ? { ...tile, hidden: !tile.hidden } : tile
      );
      onLayoutChange({ tiles: next, updatedAt: Date.now() });
    },
    [layout, onLayoutChange]
  );

  const getCellMetrics = useCallback(() => cellMetricsRef.current, []);

  const desktopGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
    gridAutoRows: `${ROW_HEIGHT_PX}px`,
    gap: `${GRID_GAP_PX}px`,
  };
  const mobileGridStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${GRID_GAP_PX}px`,
  };

  return (
    <div className="space-y-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={visibleKinds} strategy={rectSortingStrategy}>
          <div
            ref={containerRef}
            style={isMobile ? mobileGridStyle : desktopGridStyle}
            data-testid="plc-grid-layout"
            data-grid-version="v2"
          >
            {visibleTiles.map((tile) => (
              <PlcGridTile
                key={tile.kind}
                tile={tile}
                coords={resolveCoords(tile)}
                editMode={editMode && !isMobile}
                getCellMetrics={getCellMetrics}
                onResizePreview={handleResizePreview}
                onResizeCommit={handleResizeCommit}
                onToggleHide={handleToggleHide}
              >
                {renderTileContent(tile.kind, { plc, onNavigateTab })}
              </PlcGridTile>
            ))}
          </div>
        </SortableContext>

        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeTile ? (
            <PlcGridTile
              tile={activeTile}
              coords={resolveCoords(activeTile)}
              editMode={false}
              getCellMetrics={getCellMetrics}
            >
              {renderTileContent(activeTile.kind, { plc, onNavigateTab })}
            </PlcGridTile>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editMode && hiddenTiles.length > 0 && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <EyeOff className="w-4 h-4 text-slate-400" />
            <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
              {t('plcDashboard.overview.hiddenTiles', {
                defaultValue: 'Hidden tiles',
              })}
            </h4>
            <span className="text-xxs text-slate-400">
              {t('plcDashboard.overview.hiddenTilesHint', {
                defaultValue: 'click to restore',
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hiddenTiles.map((tile) => (
              <PlcGridTile
                key={tile.kind}
                tile={tile}
                coords={resolveCoords(tile)}
                editMode={false}
                getCellMetrics={getCellMetrics}
                inTray
                onToggleHide={handleToggleHide}
              >
                {null}
              </PlcGridTile>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
