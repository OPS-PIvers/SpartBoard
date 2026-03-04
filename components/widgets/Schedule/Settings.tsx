import React, { useState, useMemo } from 'react';
import { useDashboard } from '../../../context/useDashboard';
import {
  WidgetData,
  ScheduleConfig,
  ScheduleItem,
  DailySchedule,
  WidgetType,
} from '../../../types';
import {
  Type,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
  X,
  Save,
  GripVertical,
  Timer,
  Palette,
  Settings2,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import { Toggle } from '../../common/Toggle';
import { Button } from '../../common/Button';

const AVAILABLE_WIDGETS: { type: WidgetType; label: string }[] = [
  { type: 'time-tool', label: 'Timer' },
  { type: 'clock', label: 'Clock' },
  { type: 'poll', label: 'Poll' },
  { type: 'text', label: 'Text' },
  { type: 'traffic', label: 'Traffic Light' },
  { type: 'sound', label: 'Sound Level' },
  { type: 'checklist', label: 'Checklist' },
  { type: 'random', label: 'Randomizer' },
  { type: 'dice', label: 'Dice' },
  { type: 'drawing', label: 'Drawing' },
  { type: 'qr', label: 'QR Code' },
  { type: 'embed', label: 'Embed' },
  { type: 'webcam', label: 'Webcam' },
  { type: 'scoreboard', label: 'Scoreboard' },
  { type: 'weather', label: 'Weather' },
  { type: 'lunchCount', label: 'Lunch Count' },
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

const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G' },
  { id: 'font-mono', label: 'Digital', icon: '01' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'School', icon: '✏️' },
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

export const ScheduleSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast } = useDashboard();
  const config = widget.config as ScheduleConfig;

  // Migration logic for settings view
  const schedules = useMemo(() => {
    const list = [...(config.schedules ?? [])];
    if (list.length === 0 && (config.items?.length ?? 0) > 0) {
      list.push({
        id: 'default',
        name: 'Default Schedule',
        items: config.items ?? [],
        days: [],
      });
    }
    return list;
  }, [config.schedules, config.items]);

  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempItem, setTempItem] = useState<ScheduleItem | null>(null);

  const activeSchedule = schedules.find((s) => s.id === activeScheduleId);
  const items = activeSchedule?.items ?? [];

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setTempItem({ ...items[index] });
  };

  const handleStartAdd = () => {
    setEditingIndex(-1);
    setTempItem({
      id: crypto.randomUUID(),
      time: '',
      task: '',
      startTime: '',
      endTime: '',
      mode: 'clock',
      linkedWidgets: [],
    });
  };

  const handleSave = () => {
    if (!tempItem) return;

    // Sync legacy time field with startTime when startTime is non-empty
    const shouldSyncStartTime =
      typeof tempItem.startTime === 'string' &&
      tempItem.startTime.trim() !== '';

    const itemToSave: ScheduleItem = {
      ...tempItem,
      // Sync time from startTime, or omit if both are empty
      time: shouldSyncStartTime ? tempItem.startTime : tempItem.time,
      // Ensure ID
      id: tempItem.id ?? crypto.randomUUID(),
    };

    const newItems = sortByTime(
      editingIndex === -1
        ? [...items, itemToSave]
        : items.map((it, i) => (i === editingIndex ? itemToSave : it))
    );

    handleUpdateActiveItems(newItems);
    setEditingIndex(null);
    setTempItem(null);
  };

  const handleDelete = (index: number) => {
    if (confirm('Are you sure you want to delete this event?')) {
      const newItems = items.filter((_, i) => i !== index);
      handleUpdateActiveItems(newItems);
    }
  };

  const handleUpdateActiveItems = (newItems: ScheduleItem[]) => {
    const isLegacy =
      activeScheduleId === 'default' && (config.schedules?.length ?? 0) === 0;

    if (isLegacy) {
      updateWidget(widget.id, {
        config: { ...config, items: newItems } as ScheduleConfig,
      });
    } else {
      const newSchedules = schedules
        .filter((s) => s.id !== 'default')
        .map((s) =>
          s.id === activeScheduleId ? { ...s, items: newItems } : s
        );
      updateWidget(widget.id, {
        config: { ...config, schedules: newSchedules } as ScheduleConfig,
      });
    }
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
  const handleAddSchedule = () => {
    const newSchedule: DailySchedule = {
      id: crypto.randomUUID(),
      name: 'New Schedule',
      items: [],
      days: [],
    };

    // Check if we are currently in legacy mode (migrated in-memory)
    const hasLegacyItems = (config.items?.length ?? 0) > 0;
    const hasNoSchedules = (config.schedules?.length ?? 0) === 0;

    if (hasLegacyItems && hasNoSchedules) {
      // Migrate legacy default schedule into a real schedule with UUID first
      const migratedSchedule: DailySchedule = {
        id: crypto.randomUUID(),
        name: 'Default Schedule',
        items: config.items ?? [],
        days: [],
      };
      updateWidget(widget.id, {
        config: {
          ...config,
          items: [],
          schedules: [migratedSchedule, newSchedule],
        } as ScheduleConfig,
      });
    } else {
      updateWidget(widget.id, {
        config: {
          ...config,
          schedules: [...(config.schedules ?? []), newSchedule],
        } as ScheduleConfig,
      });
    }
    setActiveScheduleId(newSchedule.id);
  };

  const handleUpdateSchedule = (
    id: string,
    updates: Partial<DailySchedule>
  ) => {
    if (id === 'default') {
      // Convert legacy to first real schedule on update
      const newSchedule: DailySchedule = {
        id: crypto.randomUUID(),
        name: updates.name ?? 'Default Schedule',
        items: config.items ?? [],
        days: updates.days ?? [],
      };
      updateWidget(widget.id, {
        config: {
          ...config,
          items: [],
          schedules: [newSchedule],
        } as ScheduleConfig,
      });
      if (activeScheduleId === 'default') setActiveScheduleId(newSchedule.id);
      return;
    }

    const newSchedules = schedules.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    );
    updateWidget(widget.id, {
      config: { ...config, schedules: newSchedules } as ScheduleConfig,
    });
  };

  const handleDeleteSchedule = (id: string) => {
    if (schedules.length <= 1) {
      addToast('You must have at least one schedule.', 'error');
      return;
    }
    if (confirm('Are you sure you want to delete this schedule?')) {
      const isLegacy =
        id === 'default' && (config.schedules?.length ?? 0) === 0;

      if (isLegacy) {
        updateWidget(widget.id, {
          config: { ...config, items: [] } as ScheduleConfig,
        });
      } else {
        const newSchedules = schedules
          .filter((s) => s.id !== 'default')
          .filter((s) => s.id !== id);
        updateWidget(widget.id, {
          config: { ...config, schedules: newSchedules } as ScheduleConfig,
        });
      }
      if (activeScheduleId === id) setActiveScheduleId(null);
    }
  };

  // Render Edit Form
  if (editingIndex !== null && tempItem) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold text-slate-800">
            {editingIndex === -1 ? 'Add Event' : 'Edit Event'}
          </h3>
          <button
            type="button"
            onClick={() => setEditingIndex(null)}
            aria-label="Close event editor"
            className="text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">
              Task Name
            </label>
            <input
              className="w-full p-2 border rounded-lg text-sm"
              value={tempItem.task}
              onChange={(e) =>
                setTempItem({ ...tempItem, task: e.target.value })
              }
              placeholder="e.g. Math Class"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">
                Start Time
              </label>
              <input
                type="time"
                className="w-full p-2 border rounded-lg text-sm"
                value={tempItem.startTime ?? ''}
                onChange={(e) =>
                  setTempItem({ ...tempItem, startTime: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">
                End Time
              </label>
              <input
                type="time"
                className="w-full p-2 border rounded-lg text-sm"
                value={tempItem.endTime ?? ''}
                onChange={(e) =>
                  setTempItem({ ...tempItem, endTime: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">
              Display Mode
            </label>
            <div className="flex gap-2" role="group" aria-label="Display mode">
              <button
                type="button"
                onClick={() => setTempItem({ ...tempItem, mode: 'clock' })}
                className={`flex-1 p-2 border rounded-lg text-sm flex items-center justify-center gap-2 ${tempItem.mode === 'clock' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white'}`}
                aria-pressed={tempItem.mode === 'clock'}
              >
                <Clock className="w-4 h-4" /> Clock
              </button>
              <button
                type="button"
                onClick={() => setTempItem({ ...tempItem, mode: 'timer' })}
                className={`flex-1 p-2 border rounded-lg text-sm flex items-center justify-center gap-2 ${tempItem.mode === 'timer' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white'}`}
                aria-pressed={tempItem.mode === 'timer'}
              >
                <Timer className="w-4 h-4" /> Timer
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {tempItem.mode === 'clock'
                ? 'Shows start and end times (e.g. 10:00 - 10:30)'
                : 'Shows countdown when active (e.g. 25:00)'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">
              Auto-Launch Widgets
            </label>
            <div className="bg-slate-50 p-2 rounded-lg border max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
              {AVAILABLE_WIDGETS.map((w) => {
                const currentLinked = tempItem.linkedWidgets ?? [];
                const isSelected = currentLinked.includes(w.type);
                return (
                  <button
                    key={w.type}
                    type="button"
                    onClick={() => {
                      const newLinked = isSelected
                        ? currentLinked.filter((t) => t !== w.type)
                        : [...currentLinked, w.type];
                      setTempItem({ ...tempItem, linkedWidgets: newLinked });
                    }}
                    className={`text-xs p-2 rounded border flex items-center gap-2 ${isSelected ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Remove' : 'Add'} ${w.label}`}
                  >
                    {isSelected && (
                      <CheckCircle2 className="w-3 h-3 text-blue-500" />
                    )}
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Selected widgets will launch automatically when this event starts.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            variant="secondary"
            onClick={() => setEditingIndex(null)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} className="flex-1">
            <Save className="w-4 h-4 mr-2" /> Save
          </Button>
        </div>
      </div>
    );
  }

  if (!activeScheduleId) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xxs text-slate-400 uppercase tracking-widest block flex items-center gap-2">
              <LayoutGrid className="w-3 h-3" /> Daily Schedules
            </label>
            <button
              onClick={handleAddSchedule}
              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-3 h-3" /> Add Schedule
            </button>
          </div>

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
                    className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 truncate flex-1"
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
                      const isOnly = schedules.length === 1;
                      return (
                        <button
                          key={d.id}
                          disabled={isOnly}
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
                              : isOnly
                                ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
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
                    {s.items.length} Items <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <hr className="border-slate-100" />
        {renderGlobalSettings()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schedule Items */}
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
              onClick={handleStartAdd}
              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-3 h-3" /> Add Event
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={
                item.id ??
                `${item.task}-${item.startTime ?? item.time}-${item.endTime ?? ''}-${item.mode}`
              }
              className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm group"
            >
              <div className="flex flex-col items-center gap-0.5 text-slate-300">
                <button
                  type="button"
                  onClick={() => handleMove(i, 'up')}
                  disabled={i === 0}
                  className="hover:text-slate-600 disabled:opacity-30"
                  aria-label="Move event up"
                >
                  <GripVertical className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(i, 'down')}
                  disabled={i === items.length - 1}
                  className="hover:text-slate-600 disabled:opacity-30"
                  aria-label="Move event down"
                >
                  <GripVertical className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 truncate">
                    {item.task}
                  </span>
                  {item.mode === 'timer' && (
                    <span className="text-xxs bg-slate-100 px-1 rounded text-slate-500">
                      Timer
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {item.startTime ?? item.time}{' '}
                  {item.endTime ? `- ${item.endTime}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStartEdit(i)}
                  className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                  aria-label="Edit event"
                  title="Edit event"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                  aria-label="Delete event"
                  title="Delete event"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50">
              <p className="text-sm">No events scheduled.</p>
              <button
                onClick={handleStartAdd}
                className="text-blue-500 text-xs mt-2 hover:underline"
              >
                Add your first event
              </button>
            </div>
          )}
        </div>
      </div>

      <hr className="border-slate-100" />
      {renderGlobalSettings()}
    </div>
  );

  function renderGlobalSettings() {
    return (
      <>
        {/* Typography */}
        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
            <Type className="w-3 h-3" /> Typography
          </label>
          <div className="grid grid-cols-4 gap-2">
            {FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, fontFamily: f.id } as ScheduleConfig,
                  })
                }
                className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                  config.fontFamily === f.id ||
                  (!config.fontFamily && f.id === 'global')
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <span className={`text-sm ${f.id} text-slate-900`}>
                  {f.icon}
                </span>
                <span className="text-xxxs uppercase text-slate-600">
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Card Style */}
        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
            <Palette className="w-3 h-3" /> Card Style
          </label>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
            {/* Card Color */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Card Color
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">
                    {config.cardColor ?? '#ffffff'}
                  </span>
                  <input
                    type="color"
                    value={config.cardColor ?? '#ffffff'}
                    onChange={(e) =>
                      updateWidget(widget.id, {
                        config: {
                          ...config,
                          cardColor: e.target.value,
                        } as ScheduleConfig,
                      })
                    }
                    className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0.5"
                    aria-label="Card color"
                    title="Choose card background color"
                  />
                </div>
              </div>
            </div>

            {/* Card Opacity */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">
                  Card Opacity
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {Math.round((config.cardOpacity ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.cardOpacity ?? 1}
                onChange={(e) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      cardOpacity: parseFloat(e.target.value),
                    } as ScheduleConfig,
                  })
                }
                aria-label="Card opacity"
                className="w-full accent-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Set to 0% for fully transparent cards — schedule items appear as
                floating text on the board background.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3" /> Auto-Checkoff &amp; Scroll
          </label>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Auto-Complete Items
              </span>
              <Toggle
                checked={config.autoProgress ?? false}
                onChange={(checked) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      autoProgress: checked,
                    } as ScheduleConfig,
                  })
                }
              />
            </div>

            <p className="text-xs text-slate-500">
              Automatically check off items when their time passes.
            </p>

            <hr className="border-slate-200" />

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-slate-700">
                  Auto-Scroll View
                </span>
              </div>
              <Toggle
                checked={config.autoScroll ?? false}
                onChange={(checked) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      autoScroll: checked,
                    } as ScheduleConfig,
                  })
                }
              />
            </div>

            <p className="text-xs text-slate-500">
              Shows 4 items at a time — 1 completed, 1 active, 2 upcoming — and
              smoothly scrolls forward as the day progresses. Resets
              automatically at the start of each day.
            </p>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Building Sync */}
        <div>
          <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
            <Settings2 className="w-3 h-3" /> Building Integration
          </label>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Sync Building Schedule
              </span>
              <Toggle
                checked={config.isBuildingSyncEnabled ?? true}
                onChange={(checked) =>
                  updateWidget(widget.id, {
                    config: {
                      ...config,
                      isBuildingSyncEnabled: checked,
                    } as ScheduleConfig,
                  })
                }
              />
            </div>
            <p className="text-xs text-slate-500">
              Automatically show district defaults for your building.
            </p>
          </div>
        </div>
      </>
    );
  }
};
