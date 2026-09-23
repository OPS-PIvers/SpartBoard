import React, { useState, useCallback, useMemo } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import { useDialog } from '@/context/useDialog';
import { useAuth } from '@/context/useAuth';
import {
  ScheduleGlobalConfig,
  BuildingScheduleDefaults,
  ScheduleItem,
  DailySchedule,
  TextSizePreset,
} from '@/types';
import { FONTS } from '@/config/fonts';
import { HexColorField } from './HexColorField';
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
  CalendarDays,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
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
import { Card } from '@/components/common/Card';

interface ScheduleConfigurationPanelProps {
  config: ScheduleGlobalConfig;
  onChange: (newConfig: ScheduleGlobalConfig) => void;
}

const TEXT_SIZE_PRESET_OPTIONS: { value: TextSizePreset; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'x-large', label: 'Extra Large' },
];

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
  onUpdate: (itemId: string, updates: Partial<ScheduleItem>) => void;
  onDelete: (itemId: string) => void;
  /** Show the class-period id field (per-period access). */
  showPeriodField: boolean;
}

const SortableItem: React.FC<SortableItemProps> = React.memo(
  ({ item, onUpdate, onDelete, showPeriodField }) => {
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
      zIndex: isDragging ? Z_INDEX.itemDragging : undefined,
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
          <div className={showPeriodField ? 'col-span-4' : 'col-span-6'}>
            <input
              type="text"
              value={item.task}
              onChange={(e) =>
                item.id && onUpdate(item.id, { task: e.target.value })
              }
              placeholder="Task Name"
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none"
            />
          </div>
          <div className="col-span-2">
            <input
              type="time"
              value={item.startTime}
              onChange={(e) =>
                item.id && onUpdate(item.id, { startTime: e.target.value })
              }
              className="w-full px-1 py-1.5 text-xs border border-slate-200 rounded outline-none"
            />
          </div>
          <div className="col-span-2">
            <input
              type="time"
              value={item.endTime}
              onChange={(e) =>
                item.id && onUpdate(item.id, { endTime: e.target.value })
              }
              className="w-full px-1 py-1.5 text-xs border border-slate-200 rounded outline-none"
            />
          </div>
          {showPeriodField && (
            <div className="col-span-2">
              <input
                type="text"
                value={item.isClassPeriod ? (item.periodId ?? '') : ''}
                onChange={(e) => {
                  if (!item.id) return;
                  const periodId = e.target.value.trim().slice(0, 20);
                  onUpdate(
                    item.id,
                    periodId
                      ? { periodId, isClassPeriod: true }
                      : { periodId: undefined, isClassPeriod: false }
                  );
                }}
                placeholder="Class period"
                aria-label={`Class period id for ${item.task || 'this item'}`}
                title="Fill in to make this a class period (e.g. P3). Use the same id on every schedule."
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none"
              />
            </div>
          )}
          <div className="col-span-2 flex items-center justify-end">
            <button
              onClick={() => item.id && onDelete(item.id)}
              className="text-red-400 hover:text-red-600 p-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }
);

SortableItem.displayName = 'SortableItem';

interface SpecialDaysCardProps {
  schedules: DailySchedule[];
  dateOverrides: Record<string, string>;
  onChange: (dateOverrides: Record<string, string>) => void;
}

/** Dates that run a named schedule instead of the weekday pick (early release, assemblies). */
const SpecialDaysCard: React.FC<SpecialDaysCardProps> = ({
  schedules,
  dateOverrides,
  onChange,
}) => {
  const [newDate, setNewDate] = useState('');
  const entries = Object.entries(dateOverrides).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const without = (date: string) =>
    Object.fromEntries(entries.filter(([d]) => d !== date));
  return (
    <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-3">
      <div>
        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-1">
          <CalendarDays className="w-3.5 h-3.5" /> Special days
        </h5>
        <p className="text-xxs text-slate-500 leading-tight">
          On these dates the chosen schedule runs instead of the weekday one,
          and per-period assignment windows follow its bell times.
        </p>
      </div>
      {entries.map(([date, scheduleId]) => (
        <div key={date} className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700 w-28">
            {date}
          </span>
          <select
            value={scheduleId}
            onChange={(e) =>
              onChange({ ...dateOverrides, [date]: e.target.value })
            }
            aria-label={`Schedule for ${date}`}
            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white outline-none"
          >
            {!schedules.some((s) => s.id === scheduleId) && (
              <option value={scheduleId}>Deleted schedule</option>
            )}
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => onChange(without(date))}
            aria-label={`Remove ${date}`}
            className="text-red-400 hover:text-red-600 p-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          aria-label="Special day date"
          className="px-2 py-1.5 text-xs border border-slate-200 rounded outline-none"
        />
        <button
          disabled={
            !newDate || schedules.length === 0 || newDate in dateOverrides
          }
          onClick={() => {
            onChange({ ...dateOverrides, [newDate]: schedules[0].id });
            setNewDate('');
          }}
          className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark disabled:opacity-40 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add special day
        </button>
      </div>
    </Card>
  );
};

export const ScheduleConfigurationPanel: React.FC<
  ScheduleConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const { showConfirm } = useDialog();
  const { canAccessFeature } = useAuth();
  const showPeriodFields = canAccessFeature('per-period-access');
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // useAdminBuildings() can return a legacy long-form id; key buildingDefaults off the canonical id.
  const canonicalId = canonicalBuildingId(selectedBuildingId);

  const buildingDefaults = useMemo(
    () => canonicalizeBuildingKeyedRecord(config.buildingDefaults ?? {}),
    [config.buildingDefaults]
  );

  const handleUpdateBuilding = useCallback(
    (updates: Partial<BuildingScheduleDefaults>) => {
      const currentConfig = buildingDefaults[canonicalId] ?? {
        buildingId: canonicalId,
        items: [],
        schedules: [],
      };

      onChange({
        ...config,
        buildingDefaults: {
          ...buildingDefaults,
          [canonicalId]: {
            ...currentConfig,
            ...updates,
          },
        },
      });
    },
    [config, buildingDefaults, canonicalId, onChange]
  );

  const currentBuildingConfig = useMemo(
    () =>
      buildingDefaults[canonicalId] ?? {
        buildingId: canonicalId,
        items: [],
        schedules: [],
      },
    [buildingDefaults, canonicalId]
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
  const items = useMemo(() => activeSchedule?.items ?? [], [activeSchedule]);

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

  const handleDeleteSchedule = async (id: string | null) => {
    if (!id) return;
    const confirmed = await showConfirm(
      'Are you sure you want to delete this schedule?',
      { title: 'Delete Schedule', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (confirmed) {
      const newSchedules = schedules.filter((s) => s.id !== id);
      handleUpdateBuilding({ schedules: newSchedules });
      if (activeScheduleId === id) setActiveScheduleId(null);
    }
  };

  const handleUpdateActiveItems = useCallback(
    (newItems: ScheduleItem[]) => {
      if (!activeScheduleId) return;
      const newSchedules = schedules.map((s) =>
        s.id === activeScheduleId ? { ...s, items: newItems } : s
      );
      handleUpdateBuilding({ schedules: newSchedules });
    },
    [schedules, activeScheduleId, handleUpdateBuilding]
  );

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

  const handleUpdateItem = useCallback(
    (itemId: string, updates: Partial<ScheduleItem>) => {
      const newItems = items.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      handleUpdateActiveItems(newItems);
    },
    [items, handleUpdateActiveItems]
  );

  const handleSortByTime = () => {
    handleUpdateActiveItems(sortByTime(items));
  };

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      const newItems = items.filter((item) => item.id !== itemId);
      handleUpdateActiveItems(newItems);
    },
    [items, handleUpdateActiveItems]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        handleUpdateActiveItems(newItems);
      }
    },
    [items, handleUpdateActiveItems]
  );

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Configure Building Schedule Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={(id) => {
            setSelectedBuildingId(id);
            setActiveScheduleId(null);
          }}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50">
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
                  items={items
                    .filter((item) => item.id)
                    .map((item) => item.id as string)}
                  strategy={verticalListSortingStrategy}
                >
                  {items
                    .filter((item) => item.id)
                    .map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        onUpdate={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        showPeriodField={showPeriodFields}
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
      </Card>

      {showPeriodFields && !activeScheduleId && (
        <SpecialDaysCard
          schedules={currentBuildingConfig.schedules ?? []}
          dateOverrides={currentBuildingConfig.dateOverrides ?? {}}
          onChange={(dateOverrides) => handleUpdateBuilding({ dateOverrides })}
        />
      )}

      {/* Appearance & Behaviour Defaults — only shown in the building overview,
          not while editing a specific schedule's items. */}
      {!activeScheduleId && (
        <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
          <div>
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-1">
              <LayoutGrid className="w-3.5 h-3.5" /> Appearance &amp; Behaviour
            </h5>
            <p className="text-xxs text-slate-500 leading-tight">
              These defaults pre-populate the Schedule widget when a teacher in{' '}
              <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b>{' '}
              adds it to their dashboard. Teachers can still override them
              per-instance from the widget&apos;s Appearance and Options tabs.
            </p>
          </div>

          {/* Default Font Family */}
          <div>
            <label
              htmlFor={`sched-font-${selectedBuildingId}`}
              className="text-xxs font-bold text-slate-500 uppercase mb-1 block"
            >
              Default Font Family
            </label>
            <select
              id={`sched-font-${selectedBuildingId}`}
              value={currentBuildingConfig.fontFamily ?? 'global'}
              onChange={(e) => {
                const selected = e.target.value;
                handleUpdateBuilding({
                  // 'global' is the sentinel for "inherit the dashboard font" —
                  // persist it as undefined so saved configs only ever hold a
                  // concrete FONTS id (mirrors TypographySettings behaviour).
                  fontFamily: selected === 'global' ? undefined : selected,
                });
              }}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
            >
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 'global'
                    ? 'Global (Dashboard default)'
                    : `${f.label} (${f.icon})`}
                </option>
              ))}
            </select>
          </div>

          {/* Default Text Size */}
          <div>
            <label
              htmlFor={`sched-size-${selectedBuildingId}`}
              className="text-xxs font-bold text-slate-500 uppercase mb-1 block"
            >
              Default Text Size
            </label>
            <select
              id={`sched-size-${selectedBuildingId}`}
              value={currentBuildingConfig.textSizePreset ?? 'medium'}
              onChange={(e) =>
                handleUpdateBuilding({
                  textSizePreset: e.target.value as TextSizePreset,
                })
              }
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white"
            >
              {TEXT_SIZE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Default Text Colour */}
          <div>
            <label
              htmlFor={`sched-color-${selectedBuildingId}`}
              className="text-xxs font-bold text-slate-500 uppercase mb-1 block"
            >
              Default Text Colour
            </label>
            <HexColorField
              id={`sched-color-${selectedBuildingId}`}
              value={currentBuildingConfig.fontColor}
              onChange={(fontColor) => handleUpdateBuilding({ fontColor })}
              fallback="#334155"
              ariaLabel="Pick default schedule text colour"
            />
          </div>

          {/* Default Surface Colour */}
          <div>
            <label
              htmlFor={`sched-card-${selectedBuildingId}`}
              className="text-xxs font-bold text-slate-500 uppercase mb-1 block"
            >
              Default Surface Colour
            </label>
            <HexColorField
              id={`sched-card-${selectedBuildingId}`}
              value={currentBuildingConfig.cardColor}
              onChange={(cardColor) => handleUpdateBuilding({ cardColor })}
              fallback="#ffffff"
              ariaLabel="Pick default schedule surface colour"
            />
          </div>

          {/* Default Surface Opacity */}
          <div>
            <label
              htmlFor={`sched-opacity-${selectedBuildingId}`}
              className="text-xxs font-bold text-slate-500 uppercase mb-1 block"
            >
              Default Surface Opacity (
              {Math.round((currentBuildingConfig.cardOpacity ?? 1) * 100)}%)
            </label>
            <input
              id={`sched-opacity-${selectedBuildingId}`}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={currentBuildingConfig.cardOpacity ?? 1}
              onChange={(e) =>
                handleUpdateBuilding({
                  cardOpacity: parseFloat(e.target.value),
                })
              }
              className="w-full accent-brand-blue-primary"
              aria-label="Default schedule surface opacity"
            />
          </div>

          <hr className="border-slate-200" />

          {/* Auto-Complete Items */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <label
                htmlFor={`sched-autoprogress-${selectedBuildingId}`}
                className="text-xxs font-bold text-slate-500 uppercase block"
              >
                Auto-Complete Items
              </label>
              <p className="text-xxs text-slate-500 leading-tight mt-0.5">
                Check off items automatically when their time passes.
              </p>
            </div>
            <input
              id={`sched-autoprogress-${selectedBuildingId}`}
              type="checkbox"
              checked={currentBuildingConfig.autoProgress ?? false}
              onChange={(e) =>
                handleUpdateBuilding({ autoProgress: e.target.checked })
              }
              className="w-4 h-4 accent-brand-blue-primary shrink-0"
            />
          </div>

          {/* Auto-Scroll View */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <label
                htmlFor={`sched-autoscroll-${selectedBuildingId}`}
                className="text-xxs font-bold text-slate-500 uppercase block"
              >
                Auto-Scroll View
              </label>
              <p className="text-xxs text-slate-500 leading-tight mt-0.5">
                Keep the active item centred as the day progresses.
              </p>
            </div>
            <input
              id={`sched-autoscroll-${selectedBuildingId}`}
              type="checkbox"
              checked={currentBuildingConfig.autoScroll ?? false}
              onChange={(e) =>
                handleUpdateBuilding({ autoScroll: e.target.checked })
              }
              className="w-4 h-4 accent-brand-blue-primary shrink-0"
            />
          </div>
        </Card>
      )}
    </div>
  );
};
