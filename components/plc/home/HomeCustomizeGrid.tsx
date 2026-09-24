// Customize mode for PLC Home v2: drag or arrow keys to reorder, × to remove, + to add.

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import type { Plc } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { getPlcHomeTileDef, listAddableTileDefs } from './tiles/registry';
import type { PlcHomeTileInstance } from './tiles/tileTypes';

const SortableTileCard: React.FC<{
  tile: PlcHomeTileInstance;
  onRemove: () => void;
}> = ({ tile, onRemove }) => {
  const { t } = useTranslation();
  const def = getPlcHomeTileDef(tile.kind);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tile.id });
  if (!def) return null;
  const label = t(def.labelKey, { defaultValue: def.labelDefault });
  const Icon = def.icon;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm ${
        isDragging ? 'z-10 shadow-lg ring-2 ring-brand-blue-primary/30' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('plcDashboard.home.customize.moveTile', {
          label,
          defaultValue: 'Move {{label}}',
        })}
        className="cursor-grab rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <Icon
        className="h-4 w-4 shrink-0 text-brand-blue-primary"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('plcDashboard.home.customize.removeTile', {
          label,
          defaultValue: 'Remove {{label}}',
        })}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-red-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
};

export const AddTileMenu: React.FC<{
  plc: Plc;
  tiles: readonly PlcHomeTileInstance[];
  onAdd: (tile: PlcHomeTileInstance) => void;
}> = ({ plc, tiles, onAdd }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const addable = listAddableTileDefs(plc, tiles);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={addable.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('plcDashboard.home.customize.addTile', { defaultValue: 'Add tile' })}
      </button>
      {open && addable.length > 0 && (
        <ul
          aria-label={t('plcDashboard.home.customize.catalog', {
            defaultValue: 'Tiles you can add',
          })}
          className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {addable.map((def) => {
            const Icon = def.icon;
            return (
              <li key={def.kind}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd({ id: crypto.randomUUID(), kind: def.kind });
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                >
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-primary"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">
                      {t(def.labelKey, { defaultValue: def.labelDefault })}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {t(def.descriptionKey, {
                        defaultValue: def.descriptionDefault,
                      })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const HomeCustomizeGrid: React.FC<{
  tiles: PlcHomeTileInstance[];
  onChange: (tiles: PlcHomeTileInstance[]) => void;
}> = ({ tiles, onChange }) => {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = tiles.findIndex((tile) => tile.id === active.id);
    const to = tiles.findIndex((tile) => tile.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(tiles, from, to));
  };

  if (tiles.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
        {t('plcDashboard.home.customize.noTiles', {
          defaultValue: 'No tiles yet. Use Add tile to put some back.',
        })}
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tiles.map((tile) => tile.id)}
        strategy={rectSortingStrategy}
      >
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <SortableTileCard
              key={tile.id}
              tile={tile}
              onRemove={() => onChange(tiles.filter((x) => x.id !== tile.id))}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};
