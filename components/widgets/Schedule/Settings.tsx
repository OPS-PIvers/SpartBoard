import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import {
  WidgetData,
  ScheduleConfig,
  ScheduleItem,
  DailySchedule,
  FeaturePermission,
  ScheduleGlobalConfig,
  CalendarConfig,
} from '@/types';
import {
  CheckCircle2,
  Plus,
  Trash2,
  Settings2,
  LayoutGrid,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Copy,
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
} from '@dnd-kit/sortable';
import { Toggle } from '@/components/common/Toggle';
import { TypographySettings } from '@/components/common/TypographySettings';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { getTodayStr } from './utils';
import { SortableScheduleItem } from './components/SortableScheduleItem';

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

// ── ScheduleSettings ─────────────────────────────────────────────────────────

export const ScheduleSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const { showConfirm } = useDialog();
  const { subscribeToPermission } = useFeaturePermissions();
  const buildingId = useWidgetBuildingId(widget);
  const config = widget.config as ScheduleConfig;

  const [adminPermission, setAdminPermission] =
    useState<FeaturePermission | null>(null);

  useEffect(() => {
    return subscribeToPermission('schedule', setAdminPermission);
  }, [subscribeToPermission]);

  const buildingSchedules = useMemo((): DailySchedule[] => {
    if (!buildingId) return [];
    const adminConfig = adminPermission?.config as
      | ScheduleGlobalConfig
      | undefined;
    const raw = adminConfig?.buildingDefaults?.[buildingId];
    return raw?.schedules ?? [];
  }, [buildingId, adminPermission]);

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

  // selectedScheduleId: null means "auto-select today's active schedule"
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
    config.settingsSelectedScheduleId ?? null
  );
  const [showBuildingSchedules, setShowBuildingSchedules] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    new Set()
  );

  // Effective selected schedule: honor user's pick, fall back to today's active schedule
  const effectiveSelectedId = useMemo(() => {
    if (
      selectedScheduleId &&
      schedules.some((s) => s.id === selectedScheduleId)
    )
      return selectedScheduleId;
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return schedules[0].id;
    const today = new Date().getDay();
    return schedules.find((s) => s.days.includes(today))?.id ?? schedules[0].id;
  }, [selectedScheduleId, schedules]);

  const selectedSchedule =
    schedules.find((s) => s.id === effectiveSelectedId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Schedule tab selection ──────────────────────────────────────────────────

  const handleScheduleSelect = (id: string) => {
    if (id === selectedScheduleId) return;
    setSelectedScheduleId(id);
    updateWidget(widget.id, {
      config: {
        ...config,
        settingsSelectedScheduleId: id,
      } as ScheduleConfig,
    });
  };

  // ── Schedule CRUD ──────────────────────────────────────────────────────────

  const handleAddSchedule = () => {
    const newSchedule: DailySchedule = {
      id: crypto.randomUUID(),
      name: 'New Schedule',
      items: [],
      days: [],
    };

    const hasLegacyItems = (config.items?.length ?? 0) > 0;
    const hasNoSchedules = (config.schedules?.length ?? 0) === 0;

    if (hasLegacyItems && hasNoSchedules) {
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
          settingsSelectedScheduleId: newSchedule.id,
        } as ScheduleConfig,
      });
    } else {
      updateWidget(widget.id, {
        config: {
          ...config,
          schedules: [...(config.schedules ?? []), newSchedule],
          settingsSelectedScheduleId: newSchedule.id,
        } as ScheduleConfig,
      });
    }
    setSelectedScheduleId(newSchedule.id);
  };

  const handleUpdateSchedule = (
    id: string,
    updates: Partial<DailySchedule>
  ) => {
    if (id === 'default') {
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
          settingsSelectedScheduleId: newSchedule.id,
        } as ScheduleConfig,
      });
      setSelectedScheduleId(newSchedule.id);
      return;
    }
    const newSchedules = schedules.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    );
    updateWidget(widget.id, {
      config: { ...config, schedules: newSchedules } as ScheduleConfig,
    });
  };

  const handleDeleteSchedule = async (id: string) => {
    if (schedules.length <= 1) {
      addToast('You must have at least one schedule.', 'error');
      return;
    }
    const confirmed = await showConfirm(
      'Are you sure you want to delete this schedule?',
      {
        title: 'Delete Schedule',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );
    if (confirmed) {
      const isLegacy =
        id === 'default' && (config.schedules?.length ?? 0) === 0;
      if (isLegacy) {
        updateWidget(widget.id, {
          config: {
            ...config,
            items: [],
            settingsSelectedScheduleId: null,
          } as ScheduleConfig,
        });
      } else {
        const newSchedules = schedules
          .filter((s) => s.id !== 'default')
          .filter((s) => s.id !== id);
        updateWidget(widget.id, {
          config: {
            ...config,
            schedules: newSchedules,
            settingsSelectedScheduleId: null,
          } as ScheduleConfig,
        });
      }
      setSelectedScheduleId(null);
    }
  };

  // ── Item helpers ───────────────────────────────────────────────────────────

  const getScheduleItems = useCallback(
    (scheduleId: string): ScheduleItem[] =>
      schedules.find((s) => s.id === scheduleId)?.items ?? [],
    [schedules]
  );

  const saveScheduleItems = useCallback(
    (scheduleId: string, newItems: ScheduleItem[]) => {
      // Auto-prune one-off items whose date has already passed
      const todayStr = getTodayStr();
      const pruned = newItems.filter(
        (item) => !item.oneOffDate || item.oneOffDate >= todayStr
      );
      const isLegacy =
        scheduleId === 'default' && (config.schedules?.length ?? 0) === 0;
      if (isLegacy) {
        updateWidget(widget.id, {
          config: { ...config, items: pruned } as ScheduleConfig,
        });
      } else {
        const newSchedules = schedules
          .filter((s) => s.id !== 'default')
          .map((s) => (s.id === scheduleId ? { ...s, items: pruned } : s));
        updateWidget(widget.id, {
          config: { ...config, schedules: newSchedules } as ScheduleConfig,
        });
      }
    },
    [config, schedules, widget.id, updateWidget]
  );

  const handleAddItem = (scheduleId: string) => {
    const newItem: ScheduleItem = {
      id: crypto.randomUUID(),
      task: '',
      startTime: '',
      endTime: '',
      mode: 'clock',
      linkedWidgets: [],
    };
    saveScheduleItems(scheduleId, [...getScheduleItems(scheduleId), newItem]);
  };

  const handleAddOneOffItem = (scheduleId: string) => {
    const newItem: ScheduleItem = {
      id: crypto.randomUUID(),
      task: '',
      startTime: '',
      endTime: '',
      mode: 'clock',
      linkedWidgets: [],
      oneOffDate: getTodayStr(),
    };
    saveScheduleItems(scheduleId, [...getScheduleItems(scheduleId), newItem]);
  };

  const handleUpdateItem = (
    scheduleId: string,
    itemId: string,
    updates: Partial<ScheduleItem>
  ) => {
    const newItems = getScheduleItems(scheduleId).map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    saveScheduleItems(scheduleId, newItems);
  };

  const handleDeleteItem = async (scheduleId: string, itemId: string) => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete this event?',
      { title: 'Delete Event', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (confirmed) {
      saveScheduleItems(
        scheduleId,
        getScheduleItems(scheduleId).filter((i) => i.id !== itemId)
      );
    }
  };

  const handleSortByTime = (scheduleId: string) => {
    saveScheduleItems(scheduleId, sortByTime(getScheduleItems(scheduleId)));
  };

  const handleDragEnd = useCallback(
    (scheduleId: string, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const items = getScheduleItems(scheduleId);
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      saveScheduleItems(scheduleId, arrayMove(items, oldIndex, newIndex));
    },
    [getScheduleItems, saveScheduleItems]
  );

  const handleImportFromCalendar = (scheduleId: string) => {
    const calendarWidget = activeDashboard?.widgets.find(
      (w) => w.type === 'calendar'
    );
    if (!calendarWidget) {
      addToast('No Calendar widget found on dashboard.', 'error');
      return;
    }
    const calConfig = calendarWidget.config as CalendarConfig;
    const today = getTodayStr();
    const todaysEvents = (calConfig.events ?? []).filter(
      (e) => e.date === today && e.title?.trim()
    );
    if (todaysEvents.length === 0) {
      addToast('No events found for today in the Calendar.', 'info');
      return;
    }
    const newItems: ScheduleItem[] = todaysEvents.map((e) => ({
      id: crypto.randomUUID(),
      task: e.title,
      startTime: e.time ?? '',
      time: e.time ?? '',
      endTime: '',
      mode: 'clock' as const,
      linkedWidgets: [],
    }));
    saveScheduleItems(
      scheduleId,
      sortByTime([...getScheduleItems(scheduleId), ...newItems])
    );
    addToast(`Imported ${newItems.length} event(s) from Calendar.`, 'success');
  };

  // ── Item expansion ─────────────────────────────────────────────────────────

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const validItems =
    selectedSchedule?.items.filter(
      (i): i is ScheduleItem & { id: string } => !!i.id
    ) ?? [];

  return (
    <div className="space-y-4">
      {/* ── Schedule picker ─────────────────────────────────────── */}
      {schedules.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
          No schedules yet.{' '}
          <button
            onClick={handleAddSchedule}
            className="text-blue-500 hover:underline"
          >
            Add one
          </button>
        </div>
      ) : (
        <>
          {/* Pill tabs for multiple schedules */}
          {schedules.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
              {schedules.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleScheduleSelect(s.id)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    effectiveSelectedId === s.id
                      ? 'bg-brand-blue-primary text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {selectedSchedule && (
            <>
              {/* ── Selected schedule header ──────────────────────── */}
              <div>
                {/* Name + delete */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedSchedule.name}
                    onChange={(e) =>
                      handleUpdateSchedule(selectedSchedule.id, {
                        name: e.target.value,
                      })
                    }
                    className="flex-1 font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 outline-none text-sm"
                    placeholder="Schedule Name"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteSchedule(selectedSchedule.id)
                    }
                    className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                    aria-label="Delete schedule"
                    title="Delete this schedule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Day assignment pills — only when multiple schedules exist */}
                {schedules.length > 1 && (
                  <div className="flex gap-1 mt-2">
                    {DAYS.map((d) => {
                      const isSelected = selectedSchedule.days.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          aria-label={d.fullName}
                          title={d.fullName}
                          onClick={() => {
                            const newDays = isSelected
                              ? selectedSchedule.days.filter(
                                  (id) => id !== d.id
                                )
                              : [...selectedSchedule.days, d.id];
                            handleUpdateSchedule(selectedSchedule.id, {
                              days: newDays,
                            });
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
                )}
              </div>

              {/* ── Items toolbar ─────────────────────────────────── */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => handleSortByTime(selectedSchedule.id)}
                  className="text-xxs flex items-center gap-1 text-slate-500 hover:text-slate-700 font-medium"
                  title="Sort by start time"
                >
                  <ArrowUpDown className="w-3 h-3" /> Sort
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleAddItem(selectedSchedule.id)}
                    aria-label="Add event"
                    className="text-xxs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddOneOffItem(selectedSchedule.id)}
                    className="text-xxs flex items-center gap-1 text-amber-600 hover:text-amber-700 font-medium"
                    title="Add a one-time event for today only"
                  >
                    <CalendarPlus className="w-3 h-3" /> Today Only
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleImportFromCalendar(selectedSchedule.id)
                    }
                    className="text-xxs flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-medium"
                    title="Import today's events from Calendar widget"
                  >
                    <CalendarDays className="w-3 h-3" /> Import
                  </button>
                </div>
              </div>

              {/* ── Items list ────────────────────────────────────── */}
              <div className="space-y-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(selectedSchedule.id, e)}
                >
                  <SortableContext
                    items={validItems.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {validItems.map((item) => (
                      <SortableScheduleItem
                        key={item.id}
                        item={item}
                        onUpdate={(itemId, updates) =>
                          handleUpdateItem(selectedSchedule.id, itemId, updates)
                        }
                        onDelete={(itemId) =>
                          handleDeleteItem(selectedSchedule.id, itemId)
                        }
                        isExpanded={expandedItemIds.has(item.id ?? '')}
                        onToggleExpand={toggleItemExpanded}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {selectedSchedule.items.length === 0 && (
                  <div className="text-center py-6 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50">
                    <p className="text-xs">No events scheduled.</p>
                    <button
                      onClick={() => handleAddItem(selectedSchedule.id)}
                      className="text-blue-500 text-xxs mt-1 hover:underline"
                    >
                      Add your first event
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Add new schedule button */}
          <button
            type="button"
            onClick={handleAddSchedule}
            className="w-full text-xxs flex items-center justify-center gap-1 text-slate-400 hover:text-blue-600 font-medium py-1.5 border border-dashed border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
          >
            <Plus className="w-3 h-3" /> New Schedule
          </button>
        </>
      )}

      {/* ── Building Schedules (collapsible) ────────────────────── */}
      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowBuildingSchedules((v) => !v)}
          className="w-full flex items-center justify-between text-xxs font-semibold text-slate-500 uppercase tracking-widest"
        >
          <span className="flex items-center gap-1.5">
            <LayoutGrid className="w-3 h-3" /> Building Schedules
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              showBuildingSchedules ? '' : '-rotate-90'
            }`}
          />
        </button>
        {showBuildingSchedules && (
          <div className="mt-3 space-y-2">
            {buildingSchedules.map((s: DailySchedule) => (
              <div
                key={s.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-700 text-sm">
                    {s.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.items.length} item{s.items.length !== 1 ? 's' : ''}
                    {s.days.length > 0 &&
                      ` • ${s.days.map((d) => DAYS.find((day) => day.id === d)?.label).join(', ')}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newSchedule: DailySchedule = {
                      ...s,
                      id: crypto.randomUUID(),
                      items: s.items.map((item) => ({
                        ...item,
                        id: crypto.randomUUID(),
                      })),
                    };
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        schedules: [...(config.schedules ?? []), newSchedule],
                        settingsSelectedScheduleId: newSchedule.id,
                      } as ScheduleConfig,
                    });
                    addToast(`Added "${s.name}" to My Schedules`, 'success');
                    setSelectedScheduleId(newSchedule.id);
                  }}
                  className="p-1.5 text-brand-blue-primary hover:bg-blue-100 rounded"
                  title="Copy to My Schedules"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            ))}
            {buildingSchedules.length === 0 && (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xxs italic">
                No default schedules configured for your building.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Options (collapsible) ────────────────────────────────── */}
      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="w-full flex items-center justify-between text-xxs font-semibold text-slate-500 uppercase tracking-widest"
        >
          <span className="flex items-center gap-1.5">
            <Settings2 className="w-3 h-3" /> Options
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              showOptions ? '' : '-rotate-90'
            }`}
          />
        </button>
        {showOptions && (
          <div className="mt-3 space-y-4">{renderGlobalSettings()}</div>
        )}
      </div>
    </div>
  );

  function renderGlobalSettings() {
    return (
      <>
        {/* Auto-Checkoff & Scroll */}
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
              <span className="text-sm font-medium text-slate-700">
                Auto-Scroll View
              </span>
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
              Smoothly scrolls the schedule to keep the active event in view as
              the day progresses. Resets automatically at the start of each day.
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

// ── ScheduleAppearanceSettings ────────────────────────────────────────────────

export const ScheduleAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ScheduleConfig;

  return (
    <div className="space-y-6">
      <TextSizePresetSettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as ScheduleConfig,
          })
        }
      />
      <TypographySettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as ScheduleConfig,
          })
        }
      />
      <SurfaceColorSettings
        config={config}
        updateConfig={(updates) =>
          updateWidget(widget.id, {
            config: { ...config, ...updates } as ScheduleConfig,
          })
        }
      />
    </div>
  );
};
