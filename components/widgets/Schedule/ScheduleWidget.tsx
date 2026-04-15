import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
} from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  ScheduleItem,
  ScheduleConfig,
  ClockConfig,
  DEFAULT_GLOBAL_STYLE,
  ScheduleGlobalConfig,
} from '@/types';
import { Clock } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import {
  getTodayStr,
  resolveActiveSchedule,
  getActiveScheduleId,
  parseScheduleTime,
  computeEffectiveTimes,
  getItemDurationSeconds,
} from '@/components/widgets/Schedule/utils';
import { ScheduleRow } from '@/components/widgets/Schedule/components/ScheduleRow';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';

const GAP_STYLE = 'min(10px, 2cqmin)';

export const ScheduleWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, addWidget } = useDashboard();
  const buildingId = useWidgetBuildingId(widget);
  const { subscribeToPermission } = useFeaturePermissions();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as ScheduleConfig;
  const { schedules = [], items: legacyItems = [] } = config;

  // Single shared ticker for all CountdownDisplay instances in this widget.
  const [nowSeconds, setNowSeconds] = useState(() => {
    const n = new Date();
    return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowSeconds(n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Derived current day from single-source-of-truth ticker to ensure
  // schedule switches automatically at midnight.
  const currentDay = new Date(
    new Date().setHours(0, 0, 0, 0) + nowSeconds * 1000
  ).getDay();

  // Resolve active schedule using shared logic
  const resolved = useMemo(
    () => resolveActiveSchedule(schedules, legacyItems, currentDay),
    [schedules, legacyItems, currentDay]
  );
  const activeSchedule = resolved?.schedule ?? null;

  // Recomputed every render; since renders fire at most once per second (from the
  // nowSeconds ticker), this is cheap. As a string primitive it acts as a stable
  // dep value — useMemo deps using it only recompute when the date actually changes.
  const todayDateStr = getTodayStr();

  // Full items from the active schedule — used for persistence writes so that
  // hidden one-off items (future/expired) are never accidentally dropped.
  const scheduleItems = useMemo(
    () => activeSchedule?.items ?? [],
    [activeSchedule]
  );

  // Filtered items shown to the user: regular items + one-off items for today only.
  const displayItems = useMemo(
    () =>
      scheduleItems.filter(
        (item) => !item.oneOffDate || item.oneOffDate === todayDateStr
      ),
    [scheduleItems, todayDateStr]
  );
  const isBuildingSyncEnabled = config.isBuildingSyncEnabled ?? true;

  const {
    fontFamily = 'global',
    autoProgress = false,
    autoScroll = false,
    cardOpacity = 1,
    cardColor = '#ffffff',
    textSizePreset,
    fontColor = '#334155',
  } = config;

  const textScale = resolveTextPresetMultiplier(textSizePreset, 1);

  useEffect(() => {
    return subscribeToPermission('schedule', (perm) => {
      if (perm?.config) {
        const gConfig = perm.config as unknown as ScheduleGlobalConfig;

        // Auto-populate logic:
        // 1. Must have sync enabled
        // 2. Local items must be empty
        // 3. User must have a building selected
        // 4. We haven't synced this building yet
        if (
          isBuildingSyncEnabled &&
          schedules.length === 0 &&
          legacyItems.length === 0 &&
          buildingId &&
          config.lastSyncedBuildingId !== buildingId
        ) {
          const defaults = gConfig.buildingDefaults?.[buildingId];
          if (defaults && defaults.items?.length > 0) {
            updateWidget(widget.id, {
              config: {
                ...config,
                items: defaults.items,
                lastSyncedBuildingId: buildingId,
              } as ScheduleConfig,
            });
          }
        }
      }
    });
  }, [
    subscribeToPermission,
    isBuildingSyncEnabled,
    schedules.length,
    legacyItems.length,
    buildingId,
    config,
    widget.id,
    updateWidget,
  ]);

  // Scroll container ref used for programmatic auto-scroll.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Compute each item's effective start/end seconds once per displayItems
  // change. Clock-mode items anchor to their explicit times; timer-mode items
  // chain off the previous item's effective end. This is the single source of
  // truth for "when does this event run?" and is reused by the row renderer,
  // activeIndex, auto-progress, and auto-launch.
  const effectiveTimes = useMemo(
    () => computeEffectiveTimes(displayItems),
    [displayItems]
  );

  /**
   * Derive the index of the currently active schedule item.
   *
   * An item is "active" when: effectiveStartSec <= now < effectiveEndSec.
   * Clock-mode items use their explicit times; timer-mode items use the
   * chained effective window. Idle items (timer-mode with no anchor) are
   * never considered active.
   *
   * Returns -1 when no item is active (e.g. before the first item starts).
   */
  const activeIndex = useMemo(() => {
    if (displayItems.length === 0) return -1;

    let bestIndex = -1;
    let bestStart = -1;

    for (let i = 0; i < displayItems.length; i++) {
      const eff = effectiveTimes[i];
      if (!eff || eff.isIdle) continue;
      if (eff.startSec === -1 || nowSeconds < eff.startSec) continue;

      const isActive = eff.endSec === -1 ? true : nowSeconds < eff.endSec;
      if (isActive) {
        // When items overlap, prefer the one with the latest start time
        // (the most recently started event is the most specific match).
        if (bestIndex === -1 || eff.startSec > bestStart) {
          bestIndex = i;
          bestStart = eff.startSec;
        }
      }
    }

    return bestIndex;
  }, [displayItems, effectiveTimes, nowSeconds]);

  /**
   * Scroll the list so that the previously-completed item is at the top,
   * making the active item the second visible row. Uses each row's actual
   * offsetTop so it works correctly with variable-height flex rows.
   */
  useLayoutEffect(() => {
    if (!autoScroll || activeIndex < 0 || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current;

    // Show the completed item above the active one (activeIndex - 1).
    const targetIndex = Math.max(0, activeIndex - 1);
    const targetRow = el.children[targetIndex] as HTMLElement;
    if (!targetRow) return;

    // Optional chaining guards against jsdom (tests) and edge-case browsers.
    el.scrollTo?.({ top: targetRow.offsetTop, behavior: 'smooth' });
  }, [activeIndex, autoScroll, displayItems.length]);

  // Find the clock widget on the board (if any) so we can mirror its time format.
  const clockWidget = useMemo(
    () => activeDashboard?.widgets?.find((w) => w.type === 'clock') ?? null,
    [activeDashboard?.widgets]
  );
  // Default to 12-hour format when no clock widget is present on the dashboard.
  const format24 =
    (clockWidget?.config as ClockConfig | undefined)?.format24 ?? false;

  // Stable refs so interval callbacks always see the latest values without
  // re-registering the interval on every render.
  const configRef = useRef(config);
  // displayItems: filtered view used for rendering and auto-launch checks.
  const itemsRef = useRef(displayItems);
  // scheduleItems: full unfiltered list used for persistence writes so hidden
  // one-off items (future dates) are never accidentally dropped.
  const scheduleItemsRef = useRef(scheduleItems);
  const widgetRef = useRef(widget);

  useEffect(() => {
    configRef.current = config;
    itemsRef.current = displayItems;
    scheduleItemsRef.current = scheduleItems;
    widgetRef.current = widget;
  }, [config, displayItems, scheduleItems, widget]);

  const toggle = useCallback(
    (idx: number) => {
      const targetItem = itemsRef.current[idx]; // item from filtered displayItems
      if (!targetItem) return;

      const currentConfig = configRef.current;
      const { schedules = [], items: legacyItems = [] } = currentConfig;

      const active = resolveActiveSchedule(
        schedules,
        legacyItems,
        new Date().getDay()
      );
      if (!active) return;

      // When items have IDs, use ID-based lookup so toggling is correct even
      // when one-off items are filtered out (shifting array indices).
      // Fall back to index-based for legacy items without IDs.
      const applyToggle = (existingItems: ScheduleItem[]): ScheduleItem[] => {
        if (targetItem.id) {
          return existingItems.map((item) =>
            item.id === targetItem.id ? { ...item, done: !item.done } : item
          );
        }
        // Legacy fallback: index-based (safe since legacy items lack one-off dates)
        const copy = [...existingItems];
        if (copy[idx]) copy[idx] = { ...copy[idx], done: !copy[idx].done };
        return copy;
      };

      if (active.isLegacy) {
        updateWidget(widget.id, {
          config: {
            ...currentConfig,
            items: applyToggle(legacyItems),
          } as ScheduleConfig,
        });
      } else {
        const newSchedules = schedules.map((s) =>
          s.id === active.schedule.id
            ? { ...s, items: applyToggle(s.items) }
            : s
        );
        updateWidget(widget.id, {
          config: {
            ...currentConfig,
            schedules: newSchedules,
          } as ScheduleConfig,
        });
      }
    },
    [updateWidget, widget.id]
  );

  const handleStartTimer = useCallback(
    (item: ScheduleItem) => {
      // For timer-mode items, launch a standalone countdown using the item's
      // configured duration (not wall-clock endTime). This lets a teacher
      // start the first idle timer manually even with no clock anchor.
      let remainingSeconds = 0;
      if (item.mode === 'timer') {
        remainingSeconds = getItemDurationSeconds(item);
      } else {
        if (!item.endTime) return;
        const endMinutes = parseScheduleTime(item.endTime);
        if (endMinutes < 0) return;
        const now = new Date();
        const nowSec =
          now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        remainingSeconds = Math.max(0, endMinutes * 60 - nowSec);
      }
      if (remainingSeconds <= 0) return;
      const spawnNow = Date.now();

      addWidget('time-tool', {
        x: widget.x + widget.w + 20,
        y: widget.y,
        config: {
          mode: 'timer',
          visualType: 'digital',
          duration: remainingSeconds,
          elapsedTime: remainingSeconds,
          isRunning: true,
          startTime: spawnNow,
          selectedSound: 'Gong',
        },
      });
    },
    [addWidget, widget.x, widget.y, widget.w]
  );

  // Issue 1 fix: auto-launch linked widgets when an event's start time arrives.
  // Tracks which items were launched this session via a ref so we don't
  // re-launch on every interval tick.
  const launchedItemsRef = useRef<Set<string>>(new Set());

  // Keep the latest effective times accessible to the auto-launch interval
  // (which runs on a 10s tick but wants the current chain).
  const effectiveTimesRef = useRef(effectiveTimes);
  useEffect(() => {
    effectiveTimesRef.current = effectiveTimes;
  }, [effectiveTimes]);

  useEffect(() => {
    const checkAutoLaunch = () => {
      const now = new Date();
      const nowSec =
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const today = now.toISOString().slice(0, 10);
      const currentItems = itemsRef.current;
      const currentEffective = effectiveTimesRef.current;
      const w = widgetRef.current;

      // Prune keys from previous days so the Set doesn't grow across long sessions.
      for (const key of [...launchedItemsRef.current]) {
        if (!key.endsWith(today)) launchedItemsRef.current.delete(key);
      }

      currentItems.forEach((item, index) => {
        if (!item.linkedWidgets || item.linkedWidgets.length === 0) return;

        // Key is scoped to the calendar date so items re-launch each day.
        const baseKey =
          item.id ?? `${item.task}-${item.startTime ?? item.time}`;
        const itemKey = `${baseKey}-${today}`;
        if (launchedItemsRef.current.has(itemKey)) return;

        // Use effective start/end from the chain so timer-mode events fire
        // when the chain reaches them (not at a non-existent wall-clock time).
        const eff = currentEffective[index];
        if (!eff || eff.isIdle) return;
        if (eff.startSec === -1 || nowSec < eff.startSec) return;
        if (eff.endSec !== -1 && nowSec >= eff.endSec) return;

        // Mark as launched and spawn each linked widget.
        launchedItemsRef.current.add(itemKey);
        item.linkedWidgets.forEach((widgetType, idx) => {
          addWidget(widgetType, {
            x: w.x + w.w + 20 + idx * 20,
            y: w.y + idx * 20,
          });
        });
      });
    };

    const interval = setInterval(checkAutoLaunch, 10000);
    checkAutoLaunch(); // Run immediately on mount
    return () => clearInterval(interval);
  }, [addWidget]);

  // Auto-progress: mark items as done when their time window passes.
  useEffect(() => {
    if (!autoProgress) return;

    const checkTime = () => {
      const now = new Date();
      const nowSec =
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const nowMinutes = Math.floor(nowSec / 60);
      // Use displayItems for completion logic so ordering/inference is correct.
      const currentDisplayItems = itemsRef.current;
      // Use scheduleItems for the write-back so hidden one-off items are preserved.
      const currentScheduleItems = scheduleItemsRef.current;
      const currentConfig = configRef.current;
      const currentEffective = effectiveTimesRef.current;

      // Compute updated done-states for visible items using display ordering.
      let changed = false;
      const newDisplayItems = currentDisplayItems.map((item, index) => {
        let isDone = false;

        // Prefer chain-computed effective end. This handles timer-mode items
        // naturally (end = previous end + duration) and matches the countdown
        // the user sees on the widget face.
        const eff = currentEffective[index];
        if (eff && !eff.isIdle && eff.endSec !== -1) {
          if (nowSec >= eff.endSec) isDone = true;
        } else if (index < currentDisplayItems.length - 1) {
          // No usable chain entry and not the last item: fall back to the
          // next item's start time (legacy behavior).
          const nextItem = currentDisplayItems[index + 1];
          const nextMin = parseScheduleTime(
            nextItem.startTime ?? nextItem.time
          );
          if (nextMin !== -1 && nowMinutes >= nextMin) isDone = true;
        } else {
          // Last item with no end time: assume a 60-minute duration.
          const myTime = parseScheduleTime(item.startTime ?? item.time);
          if (myTime !== -1 && nowMinutes >= myTime + 60) isDone = true;
        }

        if (item.done !== isDone) {
          changed = true;
          return { ...item, done: isDone };
        }
        return item;
      });

      if (!changed) return;

      // Merge updated display items back into the full schedule item list.
      // Items with IDs use ID-based lookup; legacy items (no IDs) use the
      // display list directly (safe — legacy items never have one-off dates).
      const updatedById = new Map(
        newDisplayItems
          .filter((i): i is ScheduleItem & { id: string } => !!i.id)
          .map((i) => [i.id, i])
      );
      const allHaveIds = currentScheduleItems.every((i) => !!i.id);
      const newItems: ScheduleItem[] = allHaveIds
        ? currentScheduleItems.map((item) =>
            item.id ? (updatedById.get(item.id) ?? item) : item
          )
        : newDisplayItems; // legacy: displayItems === scheduleItems

      const { schedules = [], items: legacyItems = [] } = currentConfig;
      const active = getActiveScheduleId(schedules, legacyItems, now.getDay());

      if (!active) return;

      if (active.isLegacy) {
        updateWidget(widget.id, {
          config: { ...currentConfig, items: newItems } as ScheduleConfig,
        });
      } else {
        const newSchedules = schedules.map((s) =>
          s.id === active.id ? { ...s, items: newItems } : s
        );
        updateWidget(widget.id, {
          config: {
            ...currentConfig,
            schedules: newSchedules,
          } as ScheduleConfig,
        });
      }
    };

    const interval = setInterval(checkTime, 10000);
    checkTime();
    return () => clearInterval(interval);
  }, [autoProgress, widget.id, updateWidget]);

  const getFontClass = () => {
    if (fontFamily === 'global') return `font-${globalStyle.fontFamily}`;
    if (fontFamily.startsWith('font-')) return fontFamily;
    return `font-${fontFamily}`;
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full flex flex-col overflow-hidden ${getFontClass()}`}
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0 snap-y snap-mandatory"
            style={{
              gap: GAP_STYLE,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {displayItems.map((item: ScheduleItem, i: number) => {
              const eff = effectiveTimes[i] ?? {
                startSec: -1,
                endSec: -1,
                isIdle: true,
              };
              return (
                <ScheduleRow
                  key={item.id ?? `${item.task}-${item.startTime ?? item.time}`}
                  index={i}
                  item={item}
                  onToggle={toggle}
                  onStartTimer={handleStartTimer}
                  cardOpacity={cardOpacity}
                  cardColor={cardColor}
                  format24={format24}
                  nowSeconds={nowSeconds}
                  isActive={i === activeIndex}
                  effectiveStartSec={eff.startSec}
                  effectiveEndSec={eff.endSec}
                  isIdle={eff.isIdle}
                  durationSeconds={getItemDurationSeconds(item)}
                  textScale={textScale}
                  fontColor={fontColor}
                />
              );
            })}
            {displayItems.length === 0 && (
              <ScaledEmptyState
                icon={Clock}
                title="No Schedule"
                subtitle="Flip to add schedule items."
                className="opacity-40"
              />
            )}
          </div>
        </div>
      }
    />
  );
};
