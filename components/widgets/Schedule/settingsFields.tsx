import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpDown,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Copy,
  FolderPlus,
  Link,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type {
  CalendarConfig,
  DailySchedule,
  FeaturePermission,
  ScheduleConfig,
  ScheduleItem,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';
import { getTodayStr } from './utils';
import { SortableScheduleItem } from './components/SortableScheduleItem';

const DAYS = [
  { id: 0, label: 'Su', name: 'sunday' },
  { id: 1, label: 'M', name: 'monday' },
  { id: 2, label: 'Tu', name: 'tuesday' },
  { id: 3, label: 'W', name: 'wednesday' },
  { id: 4, label: 'Th', name: 'thursday' },
  { id: 5, label: 'F', name: 'friday' },
  { id: 6, label: 'Sa', name: 'saturday' },
] as const;

const DAYS_BY_ID = new Map<number, (typeof DAYS)[number]>(
  DAYS.map((day) => [day.id, day])
);

const parseTimeForSort = (value: string | undefined): number => {
  if (!value || !value.includes(':')) return Infinity;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Infinity;
  return hours * 60 + minutes;
};

const sortByTime = (items: ScheduleItem[]): ScheduleItem[] =>
  [...items].sort(
    (a, b) =>
      parseTimeForSort(a.startTime ?? a.time) -
      parseTimeForSort(b.startTime ?? b.time)
  );

const configFor = (ctx: CustomRenderCtx): ScheduleConfig =>
  ctx.config as unknown as ScheduleConfig;

const translate = (
  ctx: CustomRenderCtx,
  leaf: string,
  options?: Record<string, unknown>
) => ctx.t(`widgetSettings.schedule.${leaf}`, options);

const buildDefaultSchedule = (items: ScheduleItem[]): DailySchedule => ({
  id: 'default',
  name: 'Default Schedule',
  items,
  days: [],
});

const resolvedSchedules = (config: ScheduleConfig): DailySchedule[] => {
  const schedules = [...(config.schedules ?? [])];
  if (schedules.length === 0 && (config.items?.length ?? 0) > 0) {
    schedules.push(buildDefaultSchedule(config.items ?? []));
  }
  return schedules;
};

const selectedScheduleId = (
  config: ScheduleConfig,
  schedules: DailySchedule[]
): string | null => {
  const requested = config.settingsSelectedScheduleId;
  if (requested && schedules.some((schedule) => schedule.id === requested)) {
    return requested;
  }
  if (schedules.length === 0) return null;
  if (schedules.length === 1) return schedules[0].id;
  const today = new Date().getDay();
  return (
    schedules.find((schedule) => schedule.days.includes(today))?.id ??
    schedules[0].id
  );
};

const FieldRoot: React.FC<{
  ctx: CustomRenderCtx;
  children: React.ReactNode;
}> = ({ ctx, children }) => (
  <div
    id={ctx.id}
    role="group"
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="flex flex-col gap-3"
  >
    {children}
  </div>
);

export const ScheduleCalendarImportField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard, addToast } = useDashboard();
  const config = configFor(ctx);
  const schedules = resolvedSchedules(config);
  const selectedId = selectedScheduleId(config, schedules);
  const calendar = activeDashboard?.widgets.find(
    (widget) => widget.type === 'calendar'
  );

  const handleImport = () => {
    if (!selectedId) {
      addToast(translate(ctx, 'noScheduleToImport'), 'info');
      return;
    }
    if (!calendar) {
      addToast(translate(ctx, 'noCalendarOnBoard'), 'error');
      return;
    }
    const calendarConfig = calendar.config as CalendarConfig;
    const today = getTodayStr();
    const events = (calendarConfig.events ?? []).filter(
      (event) => event.date === today && event.title?.trim()
    );
    if (events.length === 0) {
      addToast(translate(ctx, 'noCalendarEvents'), 'info');
      return;
    }
    const items: ScheduleItem[] = events.map((event) => ({
      id: crypto.randomUUID(),
      task: event.title,
      startTime: event.time ?? '',
      time: event.time ?? '',
      endTime: '',
      mode: 'clock',
      linkedWidgets: [],
    }));
    const target = schedules.find((schedule) => schedule.id === selectedId);
    if (!target) return;
    const nextItems = sortByTime([...target.items, ...items]);
    if (target.id === 'default' && (config.schedules?.length ?? 0) === 0) {
      ctx.updateConfig({ items: nextItems });
    } else {
      ctx.updateConfig({
        schedules: schedules.map((schedule) =>
          schedule.id === selectedId
            ? { ...schedule, items: nextItems }
            : schedule
        ),
      });
    }
    addToast(
      translate(ctx, 'importedCalendarEvents', { count: items.length }),
      'success'
    );
  };

  return (
    <FieldRoot ctx={ctx}>
      <button
        type="button"
        onClick={handleImport}
        disabled={!selectedId || !calendar}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        {translate(ctx, 'importToday')}
      </button>
    </FieldRoot>
  );
};

export const ScheduleListField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const { subscribeToPermission } = useFeaturePermissions();
  const buildingId = useWidgetBuildingId(ctx.widget);
  const config = configFor(ctx);
  const [adminPermission, setAdminPermission] =
    useState<FeaturePermission | null>(null);
  const [selectedScheduleIdState, setSelectedScheduleIdState] = useState<
    string | null
  >(config.settingsSelectedScheduleId ?? null);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    new Set()
  );
  const [autoFocusItem, setAutoFocusItem] = useState<{
    scheduleId: string;
    itemId: string;
  } | null>(null);
  const [showBuildingSchedules, setShowBuildingSchedules] = useState(false);

  useEffect(
    () => subscribeToPermission('schedule', setAdminPermission),
    [subscribeToPermission]
  );

  const schedules = useMemo(() => resolvedSchedules(config), [config]);
  const selectedScheduleIdValue = useMemo(() => {
    if (
      selectedScheduleIdState &&
      schedules.some((schedule) => schedule.id === selectedScheduleIdState)
    ) {
      return selectedScheduleIdState;
    }
    return selectedScheduleId(config, schedules);
  }, [config, schedules, selectedScheduleIdState]);
  const selectedSchedule =
    schedules.find((schedule) => schedule.id === selectedScheduleIdValue) ??
    null;
  const buildingSchedules = useMemo(() => {
    if (!buildingId) return [];
    const globalConfig = adminPermission?.config as
      | { buildingDefaults?: Record<string, { schedules?: DailySchedule[] }> }
      | undefined;
    return globalConfig?.buildingDefaults?.[buildingId]?.schedules ?? [];
  }, [adminPermission, buildingId]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (autoFocusItem && autoFocusItem.scheduleId !== selectedScheduleIdValue) {
    setAutoFocusItem(null);
  }

  const updateConfig = useCallback(
    (patch: Record<string, unknown>) => ctx.updateConfig(patch),
    [ctx]
  );

  const getItems = useCallback(
    (scheduleId: string): ScheduleItem[] =>
      schedules.find((schedule) => schedule.id === scheduleId)?.items ?? [],
    [schedules]
  );

  const saveItems = useCallback(
    (scheduleId: string, items: ScheduleItem[]) => {
      const today = getTodayStr();
      const pruned = items.filter(
        (item) => !item.oneOffDate || item.oneOffDate >= today
      );
      const isLegacy =
        scheduleId === 'default' && (config.schedules?.length ?? 0) === 0;
      if (isLegacy) {
        updateConfig({ items: pruned });
      } else {
        updateConfig({
          schedules: schedules.map((schedule) =>
            schedule.id === scheduleId
              ? { ...schedule, items: pruned }
              : schedule
          ),
        });
      }
    },
    [config.schedules?.length, schedules, updateConfig]
  );

  const liveItemOps = useRef({ getItems, saveItems });
  useEffect(() => {
    liveItemOps.current = { getItems, saveItems };
  }, [getItems, saveItems]);

  const handleSelect = (id: string) => {
    setSelectedScheduleIdState(id);
    updateConfig({ settingsSelectedScheduleId: id });
  };

  const handleAddSchedule = () => {
    const newSchedule: DailySchedule = {
      id: crypto.randomUUID(),
      name: translate(ctx, 'newSchedule'),
      items: [],
      days: [],
    };
    if (config.items?.length && !config.schedules?.length) {
      updateConfig({
        items: [],
        schedules: [buildDefaultSchedule(config.items), newSchedule],
        settingsSelectedScheduleId: newSchedule.id,
      });
    } else {
      updateConfig({
        schedules: [...(config.schedules ?? []), newSchedule],
        settingsSelectedScheduleId: newSchedule.id,
      });
    }
    setSelectedScheduleIdState(newSchedule.id);
  };

  const handleUpdateSchedule = (
    id: string,
    updates: Partial<DailySchedule>
  ) => {
    if (id === 'default') {
      const migrated: DailySchedule = {
        id: crypto.randomUUID(),
        name: updates.name ?? translate(ctx, 'defaultSchedule'),
        items: config.items ?? [],
        days: updates.days ?? [],
      };
      updateConfig({
        items: [],
        schedules: [migrated],
        settingsSelectedScheduleId: migrated.id,
      });
      setSelectedScheduleIdState(migrated.id);
      return;
    }
    updateConfig({
      schedules: schedules.map((schedule) =>
        schedule.id === id ? { ...schedule, ...updates } : schedule
      ),
    });
  };

  const handleDeleteSchedule = async (id: string) => {
    if (schedules.length <= 1) {
      addToast(translate(ctx, 'mustKeepSchedule'), 'error');
      return;
    }
    const confirmed = await showConfirm(translate(ctx, 'deleteScheduleBody'), {
      title: translate(ctx, 'deleteScheduleTitle'),
      variant: 'danger',
      confirmLabel: translate(ctx, 'delete'),
    });
    if (!confirmed) return;
    const isLegacy = id === 'default' && (config.schedules?.length ?? 0) === 0;
    if (isLegacy) {
      updateConfig({ items: [], settingsSelectedScheduleId: null });
    } else {
      updateConfig({
        schedules: schedules
          .filter((schedule) => schedule.id !== 'default')
          .filter((schedule) => schedule.id !== id),
        settingsSelectedScheduleId: null,
      });
    }
    setSelectedScheduleIdState(null);
  };

  const handleAddItem = (scheduleId: string, oneOff = false) => {
    const id = crypto.randomUUID();
    const item: ScheduleItem = {
      id,
      task: '',
      startTime: '',
      endTime: '',
      mode: 'clock',
      linkedWidgets: [],
      ...(oneOff ? { oneOffDate: getTodayStr() } : {}),
    };
    saveItems(scheduleId, [...getItems(scheduleId), item]);
    setAutoFocusItem({ scheduleId, itemId: id });
  };

  const handleUpdateItem = (
    scheduleId: string,
    itemId: string,
    updates: Partial<ScheduleItem>
  ) => {
    saveItems(
      scheduleId,
      getItems(scheduleId).map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      )
    );
  };

  const handleDeleteItem = (scheduleId: string, itemId: string) => {
    const items = getItems(scheduleId);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const removed = items[index];
    saveItems(
      scheduleId,
      items.filter((item) => item.id !== itemId)
    );
    const label = removed.task?.trim();
    const blank =
      !label && !removed.startTime && !removed.endTime && !removed.time;
    if (blank) return;
    addToast(
      label
        ? `${translate(ctx, 'deletedPrefix')} "${label}"`
        : translate(ctx, 'eventDeleted'),
      'info',
      {
        label: translate(ctx, 'undo'),
        onClick: () => {
          const current = liveItemOps.current.getItems(scheduleId);
          if (current.some((item) => item.id === removed.id)) return;
          const restored = [...current];
          restored.splice(Math.min(index, restored.length), 0, removed);
          liveItemOps.current.saveItems(scheduleId, restored);
        },
      }
    );
  };

  const handleDragEnd = useCallback(
    (scheduleId: string, event: DragEndEvent) => {
      endWidgetDrag();
      if (!event.over || event.active.id === event.over.id) return;
      const items = getItems(scheduleId);
      const oldIndex = items.findIndex((item) => item.id === event.active.id);
      const newIndex = items.findIndex((item) => item.id === event.over?.id);
      if (oldIndex < 0 || newIndex < 0) return;
      saveItems(scheduleId, arrayMove(items, oldIndex, newIndex));
    },
    [getItems, saveItems]
  );

  const selectedItems =
    selectedSchedule?.items.filter(
      (item): item is ScheduleItem & { id: string } => Boolean(item.id)
    ) ?? [];

  return (
    <FieldRoot ctx={ctx}>
      {schedules.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
          {translate(ctx, 'noSchedules')}{' '}
          <button
            type="button"
            onClick={handleAddSchedule}
            className="text-blue-500 hover:underline"
          >
            {translate(ctx, 'addSchedule')}
          </button>
        </div>
      ) : (
        <>
          {schedules.length > 1 && (
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
              {schedules.map((schedule) => (
                <button
                  key={schedule.id}
                  type="button"
                  onClick={() => handleSelect(schedule.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedScheduleIdValue === schedule.id
                      ? 'bg-brand-blue-primary text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {schedule.name}
                </button>
              ))}
            </div>
          )}
          {selectedSchedule && (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedSchedule.name}
                    onChange={(event) =>
                      handleUpdateSchedule(selectedSchedule.id, {
                        name: event.target.value,
                      })
                    }
                    className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-bold text-slate-700 outline-none focus:ring-0"
                    placeholder={translate(ctx, 'scheduleNamePlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={handleAddSchedule}
                    className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                    aria-label={translate(ctx, 'newSchedule')}
                    title={translate(ctx, 'newSchedule')}
                  >
                    <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteSchedule(selectedSchedule.id)
                    }
                    className="shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    aria-label={translate(ctx, 'deleteSchedule')}
                    title={translate(ctx, 'deleteSchedule')}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                {schedules.length > 1 && (
                  <div className="mt-2 flex gap-1">
                    {DAYS.map((day) => {
                      const selected = selectedSchedule.days.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          aria-label={translate(ctx, day.name)}
                          title={translate(ctx, day.name)}
                          onClick={() =>
                            handleUpdateSchedule(selectedSchedule.id, {
                              days: selected
                                ? selectedSchedule.days.filter(
                                    (id) => id !== day.id
                                  )
                                : [...selectedSchedule.days, day.id],
                            })
                          }
                          className={`h-6 w-6 rounded-md text-xxs font-bold transition-colors ${
                            selected
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    saveItems(
                      selectedSchedule.id,
                      sortByTime(getItems(selectedSchedule.id))
                    )
                  }
                  className="flex items-center gap-1 text-xxs font-medium text-slate-500 hover:text-slate-700"
                >
                  <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  {translate(ctx, 'sort')}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={beginWidgetDrag}
                  onDragEnd={(event) =>
                    handleDragEnd(selectedSchedule.id, event)
                  }
                  onDragCancel={endWidgetDrag}
                >
                  <SortableContext
                    items={selectedItems.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {selectedItems.map((item) => (
                      <SortableScheduleItem
                        key={item.id}
                        item={item}
                        onUpdate={(itemId, updates) =>
                          handleUpdateItem(selectedSchedule.id, itemId, updates)
                        }
                        onDelete={(itemId) =>
                          handleDeleteItem(selectedSchedule.id, itemId)
                        }
                        isExpanded={expandedItemIds.has(item.id)}
                        onToggleExpand={(itemId) =>
                          setExpandedItemIds((previous) => {
                            const next = new Set(previous);
                            if (next.has(itemId)) next.delete(itemId);
                            else next.add(itemId);
                            return next;
                          })
                        }
                        autoFocus={item.id === autoFocusItem?.itemId}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {selectedSchedule.items.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-center text-slate-400">
                    <p className="text-xs">{translate(ctx, 'noEvents')}</p>
                    <button
                      type="button"
                      onClick={() => handleAddItem(selectedSchedule.id)}
                      className="mt-1 text-xxs text-blue-500 hover:underline"
                    >
                      {translate(ctx, 'addFirstEvent')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-stretch gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleAddItem(selectedSchedule.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-200 py-2 text-xs font-semibold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {translate(ctx, 'addEvent')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddItem(selectedSchedule.id, true)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-amber-200 px-3 py-2 text-xxs font-semibold text-amber-600 transition-colors hover:bg-amber-50"
                    >
                      <CalendarPlus
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      {translate(ctx, 'todayOnly')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      <div className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowBuildingSchedules((previous) => !previous)}
          className="flex w-full items-center justify-between text-xxs font-semibold uppercase tracking-widest text-slate-500"
          aria-expanded={showBuildingSchedules}
        >
          <span className="flex items-center gap-1.5">
            <Link className="h-3 w-3" aria-hidden="true" />
            {translate(ctx, 'buildingSchedules')}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              showBuildingSchedules ? '' : '-rotate-90'
            }`}
            aria-hidden="true"
          />
        </button>
        {showBuildingSchedules && (
          <div className="mt-3 flex flex-col gap-2">
            {buildingSchedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div>
                  <div className="text-sm font-bold text-slate-700">
                    {schedule.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {translate(
                      ctx,
                      schedule.items.length === 1 ? 'itemOne' : 'itemOther',
                      {
                        count: schedule.items.length,
                      }
                    )}
                    {schedule.days.length > 0 &&
                      ` • ${schedule.days
                        .map((id) => DAYS_BY_ID.get(id)?.label)
                        .filter(Boolean)
                        .join(', ')}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const copy: DailySchedule = {
                      ...schedule,
                      id: crypto.randomUUID(),
                      items: schedule.items.map((item) => ({
                        ...item,
                        id: crypto.randomUUID(),
                      })),
                    };
                    updateConfig({
                      schedules: [...(config.schedules ?? []), copy],
                      settingsSelectedScheduleId: copy.id,
                    });
                    setSelectedScheduleIdState(copy.id);
                    const copyToast = translate(ctx, 'copiedSchedule', {
                      name: schedule.name,
                    });
                    addToast(copyToast, 'success');
                  }}
                  className="rounded p-1.5 text-brand-blue-primary hover:bg-blue-100"
                  aria-label={translate(ctx, 'copyToMySchedules')}
                  title={translate(ctx, 'copyToMySchedules')}
                >
                  <Copy className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            ))}
            {buildingSchedules.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-xxs italic text-slate-400">
                {translate(ctx, 'noBuildingSchedules')}
              </div>
            )}
          </div>
        )}
      </div>
    </FieldRoot>
  );
};
