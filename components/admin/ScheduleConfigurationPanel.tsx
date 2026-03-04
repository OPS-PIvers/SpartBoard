import React, { useState } from 'react';
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
} from 'lucide-react';

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

export const ScheduleConfigurationPanel: React.FC<
  ScheduleConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );

  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig = buildingDefaults[selectedBuildingId] ?? {
    buildingId: selectedBuildingId,
    items: [],
    schedules: [],
  };

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

  const handleUpdateBuilding = (updates: Partial<BuildingScheduleDefaults>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

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

  const handleDeleteSchedule = (id: string) => {
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
    const newItems = sortByTime([...items, newItem]);
    handleUpdateActiveItems(newItems);
  };

  const handleUpdateItem = (itemId: string, updates: Partial<ScheduleItem>) => {
    const newItems = items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    handleUpdateActiveItems(newItems); // Sort is handled on save in settings, but we can do it automatically here if we want or just let them stay. Let's do it on blur or keep it simple.
  };

  const handleUpdateItemAndSort = (
    itemId: string,
    updates: Partial<ScheduleItem>
  ) => {
    const newItems = items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    handleUpdateActiveItems(sortByTime(newItems));
  };

  const handleDeleteItem = (itemId: string) => {
    const newItems = items.filter((item) => item.id !== itemId);
    handleUpdateActiveItems(newItems);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newItems[index], newItems[targetIndex]] = [
      newItems[targetIndex],
      newItems[index],
    ];

    handleUpdateActiveItems(newItems);
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
                      className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 truncate flex-1 outline-none text-sm"
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
                            className={`w-6 h-6 rounded-md text-[10px] font-bold transition-colors ${
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
                <label className="text-xxs text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                  <Clock className="w-3 h-3" /> {activeSchedule?.name}
                </label>
                <button
                  onClick={handleAddItem}
                  className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="w-3 h-3" /> Add Event
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-3 shadow-sm group"
                >
                  <div className="flex flex-col items-center gap-0.5 text-slate-300">
                    <button
                      type="button"
                      onClick={() => handleMove(i, 'up')}
                      disabled={i === 0}
                      className="hover:text-slate-600 disabled:opacity-30"
                    >
                      <GripVertical className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(i, 'down')}
                      disabled={i === items.length - 1}
                      className="hover:text-slate-600 disabled:opacity-30"
                    >
                      <GripVertical className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <input
                        type="text"
                        value={item.task}
                        onChange={(e) =>
                          item.id &&
                          handleUpdateItem(item.id, { task: e.target.value })
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
                          item.id &&
                          handleUpdateItem(item.id, {
                            startTime: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          item.id &&
                          handleUpdateItemAndSort(item.id, {
                            startTime: e.target.value,
                          })
                        }
                        className="w-full px-1 py-1.5 text-xs border border-slate-200 rounded outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="time"
                        value={item.endTime}
                        onChange={(e) =>
                          item.id &&
                          handleUpdateItem(item.id, { endTime: e.target.value })
                        }
                        onBlur={(e) =>
                          item.id &&
                          handleUpdateItemAndSort(item.id, {
                            endTime: e.target.value,
                          })
                        }
                        className="w-full px-1 py-1.5 text-xs border border-slate-200 rounded outline-none"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <button
                        onClick={() => item.id && handleDeleteItem(item.id)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
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
