import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import {
  WidgetData,
  ScheduleConfig,
  ScheduleItem,
  DailySchedule,
  WidgetType,
  FeaturePermission,
  ScheduleGlobalConfig,
  CalendarConfig,
} from '@/types';
import {
  Type,
  CheckCircle2,
  Plus,
  Trash2,
  GripVertical,
  Timer,
  Palette,
  Settings2,
  LayoutGrid,
  CalendarDays,
  ChevronDown,
  Copy,
  Link,
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
import { Toggle } from '../../common/Toggle';
import { Card } from '@/components/common/Card';

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

// ── SortableScheduleItem ─────────────────────────────────────────────────────

interface SortableScheduleItemProps {
  item: ScheduleItem;
  onUpdate: (itemId: string, updates: Partial<ScheduleItem>) => void;
  onDelete: (itemId: string) => void;
  isExpanded: boolean;
  onToggleExpand: (itemId: string) => void;
}

const SortableScheduleItem: React.FC<SortableScheduleItemProps> = React.memo(
  ({ item, onUpdate, onDelete, isExpanded, onToggleExpand }) => {
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

    const hasLinked = (item.linkedWidgets ?? []).length > 0;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
          isDragging
            ? 'border-blue-300 shadow-lg opacity-60'
            : 'border-slate-200'
        }`}
      >
        {/* Row 1: grip + task name + delete */}
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-600 transition-colors shrink-0"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={item.task}
            onChange={(e) =>
              item.id && onUpdate(item.id, { task: e.target.value })
            }
            placeholder="Task name"
            className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded focus:border-blue-400 outline-none min-w-0"
          />
          <button
            type="button"
            onClick={() => item.id && onDelete(item.id)}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
            aria-label="Delete event"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Row 2: times + toggles (indented to align with task input) */}
        <div className="flex items-center gap-1.5 px-2 pb-2 pl-9">
          <input
            type="time"
            value={item.startTime ?? item.time ?? ''}
            onChange={(e) =>
              item.id &&
              onUpdate(item.id, {
                startTime: e.target.value,
                time: e.target.value,
              })
            }
            className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-slate-200 rounded outline-none"
          />
          <input
            type="time"
            value={item.endTime ?? ''}
            onChange={(e) =>
              item.id && onUpdate(item.id, { endTime: e.target.value })
            }
            className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-slate-200 rounded outline-none"
          />
          <button
            type="button"
            onClick={() =>
              item.id &&
              onUpdate(item.id, {
                mode: item.mode === 'timer' ? 'clock' : 'timer',
              })
            }
            className={`p-1.5 rounded transition-colors shrink-0 ${
              item.mode === 'timer'
                ? 'text-indigo-500 bg-indigo-50'
                : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
            }`}
            title={
              item.mode === 'timer'
                ? 'Timer mode — click for clock'
                : 'Clock mode — click for timer'
            }
            aria-pressed={item.mode === 'timer'}
          >
            <Timer className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => item.id && onToggleExpand(item.id)}
            className={`p-1.5 mr-1 rounded transition-colors shrink-0 ${
              hasLinked || isExpanded
                ? 'text-blue-500 bg-blue-50'
                : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
            }`}
            title="Auto-launch widget"
            aria-pressed={isExpanded}
          >
            <Link className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Auto-launch expanded section */}
        {isExpanded && (
          <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50">
            <p className="text-xxs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Link className="w-3 h-3" /> Auto-Launch Widget
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {AVAILABLE_WIDGETS.map((w) => {
                const linked = item.linkedWidgets ?? [];
                const isSelected = linked.includes(w.type);
                return (
                  <button
                    key={w.type}
                    type="button"
                    onClick={() => {
                      if (!item.id) return;
                      const newLinked = isSelected
                        ? linked.filter((t) => t !== w.type)
                        : [...linked, w.type];
                      onUpdate(item.id, { linkedWidgets: newLinked });
                    }}
                    className={`text-xxs px-2 py-1.5 rounded border flex items-center gap-1 transition-colors ${
                      isSelected
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <CheckCircle2 className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                    )}
                    {w.label}
                  </button>
                );
              })}
            </div>
            {hasLinked && (
              <p className="text-xxs text-slate-400 mt-2">
                Selected widgets launch automatically when this event starts.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

SortableScheduleItem.displayName = 'SortableScheduleItem';

// ── ScheduleSettings ─────────────────────────────────────────────────────────

export const ScheduleSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const { selectedBuildings } = useAuth();
  const { showConfirm } = useDialog();
  const { subscribeToPermission } = useFeaturePermissions();
  const config = widget.config as ScheduleConfig;

  const [adminPermission, setAdminPermission] =
    useState<FeaturePermission | null>(null);

  useEffect(() => {
    return subscribeToPermission('schedule', setAdminPermission);
  }, [subscribeToPermission]);

  const buildingSchedules = useMemo((): DailySchedule[] => {
    if (!selectedBuildings?.length) return [];
    const buildingId = selectedBuildings[0];
    const adminConfig = adminPermission?.config as
      | ScheduleGlobalConfig
      | undefined;
    const raw = adminConfig?.buildingDefaults?.[buildingId];
    return raw?.schedules ?? [];
  }, [selectedBuildings, adminPermission]);

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

  const [activeTab, setActiveTab] = useState<'my' | 'building'>('my');
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(
    null
  );
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    new Set()
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    setExpandedScheduleId(newSchedule.id);
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
        } as ScheduleConfig,
      });
      if (expandedScheduleId === 'default')
        setExpandedScheduleId(newSchedule.id);
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
      if (expandedScheduleId === id) setExpandedScheduleId(null);
    }
  };

  // ── Item helpers ───────────────────────────────────────────────────────────

  const getScheduleItems = (scheduleId: string): ScheduleItem[] =>
    schedules.find((s) => s.id === scheduleId)?.items ?? [];

  const saveScheduleItems = useCallback(
    (scheduleId: string, newItems: ScheduleItem[]) => {
      const isLegacy =
        scheduleId === 'default' && (config.schedules?.length ?? 0) === 0;
      if (isLegacy) {
        updateWidget(widget.id, {
          config: { ...config, items: newItems } as ScheduleConfig,
        });
      } else {
        const newSchedules = schedules
          .filter((s) => s.id !== 'default')
          .map((s) => (s.id === scheduleId ? { ...s, items: newItems } : s));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedules, saveScheduleItems]
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
    const today = new Date().toISOString().split('T')[0];
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

  return (
    <div className="space-y-6">
      <div>
        {/* Tab header */}
        <div className="flex justify-center gap-2 mb-4 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('my')}
            className={`pb-2 px-2 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'my'
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            My Schedules
          </button>
          <button
            onClick={() => setActiveTab('building')}
            className={`pb-2 px-2 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'building'
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Building Schedules
          </button>
        </div>

        {activeTab === 'my' ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xxs text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <LayoutGrid className="w-3 h-3" /> My Schedules
              </label>
              <button
                onClick={handleAddSchedule}
                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-3 h-3" /> Add Schedule
              </button>
            </div>

            <div className="space-y-3">
              {schedules.map((s) => {
                const isExpanded = expandedScheduleId === s.id;
                const validItems = s.items.filter((i) => i.id);

                return (
                  <Card
                    key={s.id}
                    padding="sm"
                    rounded="xl"
                    className="overflow-hidden cursor-pointer select-none"
                    onClick={() =>
                      setExpandedScheduleId(isExpanded ? null : s.id)
                    }
                  >
                    {/* Accordion header */}
                    <div className="w-full flex items-center gap-2">
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                          isExpanded ? '' : '-rotate-90'
                        }`}
                      />
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) =>
                          handleUpdateSchedule(s.id, { name: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 truncate flex-1 outline-none cursor-text text-sm select-text"
                        placeholder="Schedule Name"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteSchedule(s.id);
                        }}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                        aria-label="Delete schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Days pills */}
                    <div className="flex items-center gap-2 mt-2">
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
                              onClick={(e) => {
                                e.stopPropagation();
                                const newDays = isSelected
                                  ? s.days.filter((id) => id !== d.id)
                                  : [...s.days, d.id];
                                handleUpdateSchedule(s.id, { days: newDays });
                              }}
                              className={`w-6 h-6 rounded-md text-xxs font-bold transition-colors ${
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
                      <span className="text-xxs text-slate-400 ml-auto">
                        {s.items.length} item
                        {s.items.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Expanded items editor */}
                    {isExpanded && (
                      <div
                        className="mt-3 -mx-3 -mb-3 border-t border-slate-100 cursor-default select-text"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Toolbar */}
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                          <button
                            type="button"
                            onClick={() => handleSortByTime(s.id)}
                            className="text-xxs flex items-center gap-1 text-slate-500 hover:text-slate-700 font-medium"
                            title="Sort by start time"
                          >
                            <ArrowUpDown className="w-3 h-3" /> Sort
                          </button>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleAddItem(s.id)}
                              className="text-xxs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                            >
                              <Plus className="w-3 h-3" /> Add Event
                            </button>
                            <button
                              type="button"
                              onClick={() => handleImportFromCalendar(s.id)}
                              className="text-xxs flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-medium"
                              title="Import today's events from Calendar widget"
                            >
                              <CalendarDays className="w-3 h-3" /> Import
                            </button>
                          </div>
                        </div>

                        {/* Items list */}
                        <div className="p-3 space-y-2">
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleDragEnd(s.id, e)}
                          >
                            <SortableContext
                              items={validItems.map((i) => i.id as string)}
                              strategy={verticalListSortingStrategy}
                            >
                              {validItems.map((item) => (
                                <SortableScheduleItem
                                  key={item.id}
                                  item={item}
                                  onUpdate={(itemId, updates) =>
                                    handleUpdateItem(s.id, itemId, updates)
                                  }
                                  onDelete={(itemId) =>
                                    handleDeleteItem(s.id, itemId)
                                  }
                                  isExpanded={expandedItemIds.has(
                                    item.id ?? ''
                                  )}
                                  onToggleExpand={toggleItemExpanded}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                          {s.items.length === 0 && (
                            <div className="text-center py-6 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50">
                              <p className="text-xs">No events scheduled.</p>
                              <button
                                onClick={() => handleAddItem(s.id)}
                                className="text-blue-500 text-xxs mt-1 hover:underline"
                              >
                                Add your first event
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}

              {schedules.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No schedules yet.{' '}
                  <button
                    onClick={handleAddSchedule}
                    className="text-blue-500 hover:underline"
                  >
                    Add one
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {buildingSchedules.map((s: DailySchedule) => (
              <div
                key={s.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-700">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.items.length} Items{' '}
                    {s.days.length > 0 &&
                      `• ${s.days.map((d) => DAYS.find((day) => day.id === d)?.label).join(', ')}`}
                  </div>
                </div>
                <button
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
                      } as ScheduleConfig,
                    });
                    addToast(`Added "${s.name}" to My Schedules`, 'success');
                    setActiveTab('my');
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

      <hr className="border-slate-100" />
      {renderGlobalSettings()}
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
  const {
    fontFamily = 'global',
    cardColor = '#ffffff',
    cardOpacity = 1,
  } = config;

  return (
    <div className="space-y-6">
      {/* Typography */}
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Type className="w-3 h-3" /> Typography
        </label>
        <div className="grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id } as ScheduleConfig,
                })
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                fontFamily === f.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-sm ${f.id} text-slate-900`}>{f.icon}</span>
              <span className="text-xxxs uppercase text-slate-600 font-bold">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Card Style */}
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Palette className="w-3 h-3" /> Card Style
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                Card Color
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {cardColor}
              </span>
            </div>
            <input
              type="color"
              value={cardColor}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    cardColor: e.target.value,
                  } as ScheduleConfig,
                })
              }
              className="w-full h-8 rounded cursor-pointer border border-slate-200"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                Opacity
              </span>
              <span className="text-xs text-slate-500 tabular-nums font-bold">
                {Math.round(cardOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={cardOpacity}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    cardOpacity: parseFloat(e.target.value),
                  } as ScheduleConfig,
                })
              }
              className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
