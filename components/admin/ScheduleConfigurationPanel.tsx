import React, { useState, useCallback, useMemo } from 'react';
import { BUILDINGS } from '@/config/buildings';
import {
  ScheduleGlobalConfig,
  BuildingScheduleDefaults,
  ScheduleItem,
  DailySchedule,
} from '@/types';
import {
  Plus,
  Trash2,
  Clock,
  Settings2,
  GripVertical,
  Pencil,
  ChevronRight,
  LayoutGrid,
  ArrowUpDown,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ScheduleConfigurationPanelProps {
  config: ScheduleGlobalConfig;
  onChange: (newConfig: ScheduleGlobalConfig) => void;
}

const DAYS = [
  { id: 0, label: 'Su', fullName: 'Sunday' },
  { id: 1, label: 'M', fullName: 'Monday' },
  { id: 2, label: 'Tu', fullName: 'Tuesday' },
  { id: 3, label: 'W', fullName: 'Wednesday' },
  { id: 4, label: 'Th', fullName: 'Thursday' },
  { id: 5, label: 'F', fullName: 'Friday' },
  { id: 6, label: 'Sa', fullName: 'Saturday' },
];

/** Parses "HH:MM" → minutes since midnight, or Infinity for items without times (pushed to end). */
const parseTimeForSort = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return Infinity;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return Infinity;
  return h * 60 + m;
};

/** Returns a copy of items sorted chronologically by start time. Items without times go last. */
const sortByTime = (items: ScheduleItem[]): ScheduleItem[] =>
  [...items].sort(
    (a, b) =>
      parseTimeForSort(a.startTime ?? a.time) -
      parseTimeForSort(b.startTime ?? b.time)
  );

interface SortableItemProps {
  item: ScheduleItem;
  onUpdate: (updates: Partial<ScheduleItem>) => void;
  onDelete: () => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  item,
  onUpdate,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id ?? '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg p-2 flex items-center gap-3 shadow-sm group ${
        isDragging
          ? 'border-brand-blue-primary shadow-lg opacity-50'
          : 'border-slate-200'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-600 transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 grid grid-cols-12 gap-2">
        <div className="col-span-6">
          <input
            type="text"
            value={item.task}
            onChange={(e) => onUpdate({ task: e.target.value })}
            placeholder="Task Name"
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none"
          />
        </div>
        <div className="col-span-2">
          <input
            type="time"
            value={item.startTime}
            onChange={(e) => onUpdate({ startTime: e.target.value })}
            className="w-full px-1 py-1.5 text-xs border border-slate-200 rounded outline-none"
          />
        </div>
        <div className="col-span-2">
          <input
            type="time"
            value={item.endTime}
            onChange={(e) => onUpdate({ endTime: e.target.value })}
            className="w-full px-1 py-1.5 text-xs border border-slate-200 rounded outline-none"
          />
        </div>
        <div className="col-span-2 flex items-center justify-end">
          <button
            onClick={onDelete}
            className="text-red-400 hover:text-red-600 p-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ScheduleConfigurationPanel: React.FC<
  ScheduleConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleUpdateBuilding = useCallback(
    (updates: Partial<BuildingScheduleDefaults>) => {
      const currentDefaults = config.buildingDefaults ?? {};
      const currentConfig = currentDefaults[selectedBuildingId] ?? {
        buildingId: selectedBuildingId,
        items: [],
        schedules: [],
      };

      onChange({
        ...config,
        buildingDefaults: {
          ...currentDefaults,
          [selectedBuildingId]: {
            ...currentConfig,
            ...updates,
          },
        },
      });
    },
    [config, selectedBuildingId, onChange]
  );

  const buildingDefaults = useMemo(
    () => config.buildingDefaults ?? {},
    [config.buildingDefaults]
  );
  const currentBuildingConfig = useMemo(
    () =>
      buildingDefaults[selectedBuildingId] ?? {
        buildingId: selectedBuildingId,
        items: [],
        schedules: [],
      },
    [buildingDefaults, selectedBuildingId]
  );

  // Migrate legacy items into a "Default Schedule" if no schedules exist yet
  const schedules: DailySchedule[] = (() => {
    const list = [...(currentBuildingConfig.schedules ?? [])];
    if (list.length === 0 && (currentBuildingConfig.items?.length ?? 0) > 0) {
      list.push({
        id: 'default',
        name: 'Legacy Default Schedule',
        items: currentBuildingConfig.items ?? [],
        days: [],
      });
    }
    return list;
  })();

  const activeSchedule = schedules.find((s) => s.id === activeScheduleId);
  const items = activeSchedule?.items ?? [];

  // Ensure all items have IDs for dnd-kit compatibility
  React.useEffect(() => {
    let changed = false;
    const newSchedules = schedules.map((s) => {
      let scheduleChanged = false;
      const updatedItems = s.items.map((item) => {
        if (!item.id) {
          scheduleChanged = true;
          changed = true;
          return { ...item, id: crypto.randomUUID() };
        }
        return item;
      });
      return scheduleChanged ? { ...s, items: updatedItems } : s;
    });

    if (changed) {
      handleUpdateBuilding({ schedules: newSchedules });
    }
  }, [schedules, handleUpdateBuilding]);

  const handleAddSchedule = () => {
    const newSchedule: DailySchedule = {
      id: crypto.randomUUID(),
      name: 'New Schedule',
      items: [],
      days: [],
    };
    handleUpdateBuilding({ schedules: [...schedules, newSchedule] });
    setActiveScheduleId(newSchedule.id);
  };

  const handleUpdateSchedule = (
    id: string,
    updates: Partial<DailySchedule>
  ) => {
    const newSchedules = schedules.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    );
    handleUpdateBuilding({ schedules: newSchedules });
  };

  const handleDeleteSchedule = (id: string | null) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this schedule?')) {
      const newSchedules = schedules.filter((s) => s.id !== id);
      handleUpdateBuilding({ schedules: newSchedules });
      if (activeScheduleId === id) setActiveScheduleId(null);
    }
  };

  const handleUpdateActiveItems = (newItems: ScheduleItem[]) => {
    if (!activeScheduleId) return;
    const newSchedules = schedules.map((s) =>
      s.id === activeScheduleId ? { ...s, items: newItems } : s
    );
    handleUpdateBuilding({ schedules: newSchedules });
  };

  const handleAddItem = () => {
    const newItem: ScheduleItem = {
      id: crypto.randomUUID(),
      task: 'New Task',
      startTime: '08:00',
      endTime: '09:00',
      mode: 'clock',
    };
    // Append to end instead of sorting by time immediately, to respect manual ordering preference
    const newItems = [...items, newItem];
    handleUpdateActiveItems(newItems);
  };

  const handleUpdateItem = (itemId: string, updates: Partial<ScheduleItem>) => {
    const newItems = items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    handleUpdateActiveItems(newItems);
  };

  const handleSortByTime = () => {
    handleUpdateActiveItems(sortByTime(items));
  };

  const handleDeleteItem = (itemId: string) => {
    const newItems = items.filter((item) => item.id !== itemId);
    handleUpdateActiveItems(newItems);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      handleUpdateActiveItems(newItems);
    }
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Configure Building Schedule Defaults
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {BUILDINGS.map((building) => (
            <button
              key={building.id}
              onClick={() => {
                setSelectedBuildingId(building.id);
                setActiveScheduleId(null);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap transition-colors ${
                selectedBuildingId === building.id
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {building.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        {!activeScheduleId ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Building Schedules
              </h5>
              <button
                onClick={handleAddSchedule}
                className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Schedule
              </button>
            </div>
            <p className="text-xxs text-slate-500 mb-4 leading-tight">
              Users in{' '}
              <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
              will be able to copy these default schedules to their dashboard.
            </p>

            <div className="space-y-3">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-blue-200 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) =>
                        handleUpdateSchedule(s.id, { name: e.target.value })
                      }
                      className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 truncate flex-1 outline-none text-sm hover:bg-slate-50 rounded px-1 -ml-1 transition-colors"
                      placeholder="Schedule Name"
                    />
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setActiveScheduleId(s.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                        title="Edit items"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(s.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                        title="Delete schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {DAYS.map((d) => {
                        const isSelected = s.days.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            aria-label={d.fullName}
                            title={d.fullName}
                            onClick={() => {
                              const newDays = isSelected
                                ? s.days.filter((id) => id !== d.id)
                                : [...s.days, d.id];
                              handleUpdateSchedule(s.id, { days: newDays });
                            }}
                            className={`w-6 h-6 rounded-md text-xxs font-bold transition-colors ${
                              isSelected
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setActiveScheduleId(s.id)}
                      className="text-xxs font-bold text-blue-500 hover:underline flex items-center gap-0.5"
                    >
                      {s.items.length} Items{' '}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {schedules.length === 0 && (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
                  No default schedules configured for this building.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setActiveScheduleId(null)}
                className="text-xxs text-slate-400 uppercase tracking-widest hover:text-blue-500 flex items-center gap-1"
              >
                <LayoutGrid className="w-3 h-3" /> Schedules
              </button>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <input
                    type="text"
                    value={activeSchedule?.name ?? ''}
                    onChange={(e) =>
                      handleUpdateSchedule(activeScheduleId, {
                        name: e.target.value,
                      })
                    }
                    className="text-xxs font-bold text-slate-600 uppercase tracking-widest bg-transparent border-b border-dashed border-slate-300 focus:border-brand-blue-primary outline-none px-1 py-0.5"
                    placeholder="Schedule Name"
                  />
                </div>
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                  <button
                    onClick={handleSortByTime}
                    className="text-xxs flex items-center gap-1 text-slate-500 hover:text-brand-blue-primary font-bold uppercase transition-colors"
                    title="Sort items by start time"
                  >
                    <ArrowUpDown className="w-3 h-3" /> Sort
                  </button>
                  <button
                    onClick={handleAddItem}
                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold"
                  >
                    <Plus className="w-3 h-3" /> Add Event
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((item) => item.id ?? '')}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((item) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      onUpdate={(updates) =>
                        item.id && handleUpdateItem(item.id, updates)
                      }
                      onDelete={() => item.id && handleDeleteItem(item.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {items.length === 0 && (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
                  No items configured for this schedule.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
