import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  ScheduleItem,
  ScheduleConfig,
  ClockConfig,
  DEFAULT_GLOBAL_STYLE,
  ScheduleGlobalConfig,
} from '@/types';
import { Circle, CheckCircle2, Clock, Timer } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';

/** Parses an "HH:MM" time string and returns minutes since midnight, or -1 if invalid. */
const parseScheduleTime = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
};

/** Parses an "HH:MM" time string and returns seconds since midnight, or -1 if invalid. */
const parseScheduleTimeSeconds = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 3600 + m * 60;
};

/** Formats a total-seconds value into M:SS or H:MM:SS. */
const formatCountdown = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * Formats an "HH:MM" (24-hour) stored time string for display.
 * Returns 12-hour "h:MM AM/PM" when format24 is false, otherwise "HH:MM".
 * Defaults to 12-hour when no clock widget is present on the dashboard.
 */
const formatScheduleTime = (
  time: string | undefined,
  format24: boolean
): string => {
  if (!time || !time.includes(':')) return '';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  if (format24) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const hours12 = h % 12 || 12;
  return `${hours12}:${m.toString().padStart(2, '0')} ${period}`;
};

/** Converts a hex color + alpha into an rgba() CSS string. */
const hexToRgba = (hex: string, alpha: number): string => {
  const clean = (hex ?? '#ffffff').replace('#', '');
  const a =
    typeof alpha === 'number' && !isNaN(alpha)
      ? Math.max(0, Math.min(1, alpha))
      : 1;
  if (clean.length !== 6) return `rgba(255, 255, 255, ${a})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

interface CountdownDisplayProps {
  startTime?: string;
  endTime: string;
  /** Seconds since midnight, driven by the parent's single shared interval. */
  nowSeconds: number;
}

/**
 * Pure countdown display – no internal timer, driven by parent's nowSeconds.
 *
 * NOTE: Cross-midnight events (e.g. startTime "23:00" → endTime "01:00") are
 * not supported. The Schedule widget is designed for same-day classroom
 * schedules where all times fall within a single calendar day.
 */
const CountdownDisplay: React.FC<CountdownDisplayProps> = ({
  startTime,
  endTime,
  nowSeconds,
}) => {
  const endSec = parseScheduleTimeSeconds(endTime);
  if (endSec === -1) return null;

  const rem = Math.max(0, endSec - nowSeconds);

  const startSec = parseScheduleTimeSeconds(startTime);
  let progress: number;
  if (startSec !== -1 && endSec > startSec) {
    const total = endSec - startSec;
    progress = total > 0 ? rem / total : 0;
  } else {
    progress = rem > 0 ? 1 : 0;
  }

  return (
    <div className="flex flex-col w-full" style={{ gap: 'min(4px, 0.8cqmin)' }}>
      <span
        className="text-indigo-400"
        style={{
          fontSize: 'min(24px, 6cqmin)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatCountdown(rem)}
      </span>
      <div
        className="w-full rounded-full overflow-hidden bg-slate-200"
        style={{ height: 'min(5px, 1.2cqmin)' }}
      >
        <div
          className="h-full rounded-full bg-indigo-400"
          style={{
            width: `${Math.max(0, Math.min(100, progress * 100))}%`,
            transition: 'width 1s linear',
          }}
        />
      </div>
    </div>
  );
};

interface ScheduleRowProps {
  item: ScheduleItem;
  index: number;
  onToggle: (idx: number) => void;
  onStartTimer?: (item: ScheduleItem) => void;
  cardOpacity: number;
  cardColor: string;
  /** Whether to display times in 24-hour format. Mirrors the linked Clock widget setting; defaults to false (12-hour). */
  format24: boolean;
  /** Seconds since midnight from the parent's shared ticker. */
  nowSeconds: number;
}

const areScheduleRowPropsEqual = (
  prev: ScheduleRowProps,
  next: ScheduleRowProps
) => {
  // Check primitive/stable props equality
  if (prev.index !== next.index) return false;
  if (prev.onToggle !== next.onToggle) return false;
  if (prev.onStartTimer !== next.onStartTimer) return false;
  if (prev.cardOpacity !== next.cardOpacity) return false;
  if (prev.cardColor !== next.cardColor) return false;
  if (prev.format24 !== next.format24) return false;

  // Optimized manual comparison for `item` object (ScheduleItem) instead of JSON.stringify
  // to avoid serialization overhead on every tick.
  const prevItem = prev.item;
  const nextItem = next.item;

  if (prevItem.id !== nextItem.id) return false;
  if (prevItem.time !== nextItem.time) return false;
  if (prevItem.task !== nextItem.task) return false;
  if (prevItem.done !== nextItem.done) return false;
  if (prevItem.mode !== nextItem.mode) return false;
  if (prevItem.startTime !== nextItem.startTime) return false;
  if (prevItem.endTime !== nextItem.endTime) return false;

  // Compare linkedWidgets array shallowly
  if (prevItem.linkedWidgets !== nextItem.linkedWidgets) {
    if (!prevItem.linkedWidgets || !nextItem.linkedWidgets) return false;
    if (prevItem.linkedWidgets.length !== nextItem.linkedWidgets.length)
      return false;
    for (let i = 0; i < prevItem.linkedWidgets.length; i++) {
      if (prevItem.linkedWidgets[i] !== nextItem.linkedWidgets[i]) return false;
    }
  }

  // Optimized check for `nowSeconds`:
  // Only re-render if the item is in active timer mode.
  // If not in timer mode, `nowSeconds` changes should be ignored.
  const isTimerActive =
    next.item.mode === 'timer' && !!next.item.endTime && !next.item.done;

  if (isTimerActive) {
    return prev.nowSeconds === next.nowSeconds;
  }

  return true;
};

const ScheduleRow = React.memo<ScheduleRowProps>(
  ({
    item,
    index,
    onToggle,
    onStartTimer,
    cardOpacity,
    cardColor,
    format24,
    nowSeconds,
  }) => {
    const { t } = useTranslation();

    // Use the user-selected card color. Done items get a neutral gray tint.
    const bgColor = item.done
      ? hexToRgba('#cbd5e1', cardOpacity) // slate-300
      : hexToRgba(cardColor, cardOpacity);

    // Show live countdown only when mode is 'timer', endTime is set, and item isn't done.
    const showCountdown = item.mode === 'timer' && !!item.endTime && !item.done;

    return (
      <div
        className={`flex-1 w-full flex items-center rounded-2xl border border-slate-200 transition-all ${
          item.done ? '' : 'shadow-sm'
        }`}
        style={{ minHeight: 0, backgroundColor: bgColor }}
      >
        <button
          onClick={() => onToggle(index)}
          className="flex items-center flex-1 min-w-0"
          style={{ gap: 'min(16px, 3cqmin)', padding: 'min(16px, 3cqmin)' }}
        >
          {item.done ? (
            <CheckCircle2
              className="text-green-500 shrink-0"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(32px, 8cqmin)',
              }}
            />
          ) : (
            <Circle
              className="text-indigo-300 shrink-0"
              style={{
                width: 'min(32px, 8cqmin)',
                height: 'min(32px, 8cqmin)',
              }}
            />
          )}
          <div className="flex flex-col items-start justify-center min-w-0 flex-1">
            {showCountdown ? (
              <CountdownDisplay
                startTime={item.startTime}
                endTime={item.endTime ?? ''}
                nowSeconds={nowSeconds}
              />
            ) : (
              /* Issue 3 fix: removed font-mono so the font-family from the parent
                 container (getFontClass) cascades down to the time display. */
              <span
                className={`font-black ${item.done ? 'text-slate-400' : 'text-indigo-400'}`}
                style={{ fontSize: 'min(24px, 6cqmin)' }}
              >
                {formatScheduleTime(item.startTime ?? item.time, format24)}
              </span>
            )}
            <span
              className={`font-black leading-tight truncate w-full text-left ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
              style={{ fontSize: 'min(36px, 10cqmin)' }}
            >
              {item.task}
            </span>
          </div>
        </button>
        {item.endTime && onStartTimer && (
          <button
            onClick={() => onStartTimer(item)}
            className="shrink-0 text-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
            style={{
              padding: 'min(4px, 1cqmin)',
              marginRight: 'min(12px, 2.5cqmin)',
            }}
            title={t('widgets.schedule.startTimerUntil', {
              time: item.endTime,
            })}
            aria-label={t('widgets.schedule.startTimerUntil', {
              time: item.endTime,
            })}
          >
            <Timer
              className="shrink-0"
              style={{
                width: 'min(28px, 7cqmin)',
                height: 'min(28px, 7cqmin)',
              }}
            />
          </button>
        )}
      </div>
    );
  },
  areScheduleRowPropsEqual
);

ScheduleRow.displayName = 'ScheduleRow';

export const ScheduleWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard, addWidget } = useDashboard();
  const { selectedBuildings } = useAuth();
  const { subscribeToPermission } = useFeaturePermissions();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as ScheduleConfig;
  const items = useMemo(() => config.items ?? [], [config.items]);
  const isBuildingSyncEnabled = config.isBuildingSyncEnabled ?? true;

  const {
    fontFamily = 'global',
    autoProgress = false,
    cardOpacity = 1,
    cardColor = '#ffffff',
  } = config;

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
          items.length === 0 &&
          selectedBuildings?.[0] &&
          config.lastSyncedBuildingId !== selectedBuildings[0]
        ) {
          const buildingId = selectedBuildings[0];
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
    items.length,
    selectedBuildings,
    config,
    widget.id,
    updateWidget,
  ]);

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

  // Find the clock widget on the board (if any) so we can mirror its time format.
  const clockWidget = useMemo(
    () => activeDashboard?.widgets?.find((w) => w.type === 'clock') ?? null,
    [activeDashboard?.widgets]
  );
  const hasClock = clockWidget !== null;
  // Default to 12-hour format when no clock widget is present on the dashboard.
  const format24 =
    (clockWidget?.config as ClockConfig | undefined)?.format24 ?? false;

  // Stable refs so interval callbacks always see the latest values without
  // re-registering the interval on every render.
  const configRef = useRef(config);
  const itemsRef = useRef(items);
  const widgetRef = useRef(widget);

  useEffect(() => {
    configRef.current = config;
    itemsRef.current = items;
    widgetRef.current = widget;
  }, [config, items, widget]);

  const toggle = useCallback(
    (idx: number) => {
      const currentConfig = configRef.current;
      const currentItems = itemsRef.current;
      const newItems = [...currentItems];
      if (newItems[idx]) {
        newItems[idx] = { ...newItems[idx], done: !newItems[idx].done };
        updateWidget(widget.id, {
          config: { ...currentConfig, items: newItems } as ScheduleConfig,
        });
      }
    },
    [updateWidget, widget.id]
  );

  const handleStartTimer = useCallback(
    (item: ScheduleItem) => {
      if (!item.endTime) return;
      const endMinutes = parseScheduleTime(item.endTime);
      if (endMinutes < 0) return;

      const now = new Date();
      const nowSeconds =
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const endSeconds = endMinutes * 60;
      const remainingSeconds = Math.max(0, endSeconds - nowSeconds);
      const spawnNow = Date.now();

      addWidget('time-tool', {
        x: widget.x + widget.w + 20,
        y: widget.y,
        config: {
          mode: 'timer',
          visualType: 'digital',
          duration: remainingSeconds,
          elapsedTime: remainingSeconds,
          isRunning: remainingSeconds > 0,
          startTime: remainingSeconds > 0 ? spawnNow : null,
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

  useEffect(() => {
    const checkAutoLaunch = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const today = now.toISOString().slice(0, 10);
      const currentItems = itemsRef.current;
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

        const startMin = parseScheduleTime(item.startTime ?? item.time);
        if (startMin === -1 || nowMinutes < startMin) return;

        // Check the event is still within its active time window.
        const endMin = parseScheduleTime(item.endTime);
        if (endMin !== -1 && nowMinutes >= endMin) return; // past this event

        // If no endTime, use the next item's start as the upper bound.
        if (endMin === -1 && index < currentItems.length - 1) {
          const nextItem = currentItems[index + 1];
          const nextMin = parseScheduleTime(
            nextItem.startTime ?? nextItem.time
          );
          if (nextMin !== -1 && nowMinutes >= nextMin) return;
        }

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
    if (!autoProgress || !hasClock) return;

    const checkTime = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      let changed = false;
      const currentItems = itemsRef.current;
      const currentConfig = configRef.current;

      const newItems = currentItems.map((item, index) => {
        let isDone = false;
        let completionTime = -1;

        const itemEndTime = parseScheduleTime(item.endTime);
        if (itemEndTime !== -1) {
          // Prioritize the item's own end time when available.
          completionTime = itemEndTime;
        } else if (index < currentItems.length - 1) {
          // Fall back to the next item's start time.
          const nextItem = currentItems[index + 1];
          completionTime = parseScheduleTime(
            nextItem.startTime ?? nextItem.time
          );
        } else {
          // Last item with no end time: assume a 60-minute duration.
          const myTime = parseScheduleTime(item.startTime ?? item.time);
          if (myTime !== -1) completionTime = myTime + 60;
        }

        if (completionTime !== -1 && nowMinutes >= completionTime)
          isDone = true;

        if (item.done !== isDone) {
          changed = true;
          return { ...item, done: isDone };
        }
        return item;
      });

      if (changed) {
        updateWidget(widget.id, {
          config: { ...currentConfig, items: newItems } as ScheduleConfig,
        });
      }
    };

    const interval = setInterval(checkTime, 10000);
    checkTime();
    return () => clearInterval(interval);
  }, [autoProgress, hasClock, widget.id, updateWidget]);

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
            className="flex-1 overflow-y-auto pr-1 custom-scrollbar flex flex-col"
            style={{ gap: 'min(10px, 2cqmin)' }}
          >
            {items.map((item: ScheduleItem, i: number) => (
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
              />
            ))}
            {items.length === 0 && (
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
