import React, { useCallback, useMemo, useState } from 'react';
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
  PlcBentoTileKind,
  PlcOverviewLayout,
  getPlcFeatures,
} from '@/types';
import { renderTileContent, tileFeatureGate } from './tileRegistry';
import { nextSize } from './bentoSizes';
import { PlcBentoTile } from './PlcBentoTile';
import type { PlcDashboardTabId } from '../PlcDashboard';

interface PlcBentoGridProps {
  plc: Plc;
  layout: PlcOverviewLayout;
  editMode: boolean;
  onLayoutChange: (next: PlcOverviewLayout) => void;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

/**
 * The PLC Overview bento grid. Renders visible tiles in a 4-column CSS
 * grid (1-column on mobile) with dnd-kit sortable wiring for reorder and
 * resize. Hidden tiles surface in a tray below the grid in edit mode so
 * the user can restore them.
 *
 * Drag pattern mirrors `components/common/library/LibraryGrid.tsx`:
 * `closestCenter` collision detection, `rectSortingStrategy`,
 * `PointerSensor { distance: 5 }` (so click-to-resize doesn't fire as a
 * drag), and a `DragOverlay` snapped to the cursor (heterogeneous spans
 * look broken when the source tile is transformed in place).
 */
export const PlcBentoGrid: React.FC<PlcBentoGridProps> = ({
  plc,
  layout,
  editMode,
  onLayoutChange,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const [activeKind, setActiveKind] = useState<PlcBentoTileKind | null>(null);
  const features = useMemo(() => getPlcFeatures(plc), [plc]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter tiles whose feature is disabled by the PLC's `features` map.
  // The Settings toggle has the final say — if the PLC has notes off,
  // the bento grid hides the Notes tile too (matches the tab gate).
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

      const activeIdx = layout.tiles.findIndex((t) => t.kind === active.id);
      const overIdx = layout.tiles.findIndex((t) => t.kind === over.id);
      if (activeIdx === -1 || overIdx === -1) return;

      const next = [...layout.tiles];
      const [moved] = next.splice(activeIdx, 1);
      if (!moved) return;
      next.splice(overIdx, 0, moved);

      onLayoutChange({ tiles: next, updatedAt: Date.now() });
    },
    [layout, onLayoutChange]
  );

  const handleResize = useCallback(
    (kind: PlcBentoTileKind) => {
      const next = layout.tiles.map((tile) =>
        tile.kind === kind ? { ...tile, size: nextSize(tile.size) } : tile
      );
      onLayoutChange({ tiles: next, updatedAt: Date.now() });
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
          {/* Mobile: single column flow, sizes ignored (each tile natural-height).
              Desktop (md+): 4-column CSS grid with row spans driven by tile.size. */}
          <div
            className="
              grid grid-cols-1 gap-4
              md:grid-cols-4 md:auto-rows-[minmax(180px,auto)]
            "
            data-testid="plc-bento-grid"
          >
            {visibleTiles.map((tile) => (
              <PlcBentoTile
                key={tile.kind}
                tile={tile}
                editMode={editMode}
                onResize={handleResize}
                onToggleHide={handleToggleHide}
              >
                {renderTileContent(tile.kind, { plc, onNavigateTab })}
              </PlcBentoTile>
            ))}
          </div>
        </SortableContext>

        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeTile ? (
            <PlcBentoTile tile={activeTile} editMode={false}>
              {renderTileContent(activeTile.kind, { plc, onNavigateTab })}
            </PlcBentoTile>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Hidden tiles tray — only shown in edit mode + when there's anything
          to restore. */}
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
              <PlcBentoTile
                key={tile.kind}
                tile={tile}
                editMode={false}
                inTray
                onToggleHide={handleToggleHide}
              >
                {null}
              </PlcBentoTile>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
