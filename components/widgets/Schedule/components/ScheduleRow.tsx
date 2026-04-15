import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduleItem } from '@/types';
import { Circle, CheckCircle2, Timer } from 'lucide-react';
import {
  formatCountdown,
  formatScheduleTime,
} from '@/components/widgets/Schedule/utils';
import { hexToRgba } from '@/utils/styles';

interface CountdownDisplayProps {
  /** Seconds remaining to display. Pass the full duration to render a frozen "waiting" state. */
  remainingSeconds: number;
  /** Full duration of the countdown in seconds (used for the progress bar). */
  totalSeconds: number;
  /** When true, the progress bar is shown at 100% and marked idle (no live tick). */
  isIdle?: boolean;
}

/**
 * Pure countdown display – no internal timer, driven by parent-computed
 * `remainingSeconds`. When the parent passes the full duration (e.g. because
 * the event hasn't become active yet), the display stays frozen.
 *
 * NOTE: Cross-midnight events (e.g. startTime "23:00" → endTime "01:00") are
 * not supported. The Schedule widget is designed for same-day classroom
 * schedules where all times fall within a single calendar day.
 */
export const CountdownDisplay: React.FC<CountdownDisplayProps> = ({
  remainingSeconds,
  totalSeconds,
  isIdle = false,
}) => {
  const rem = Math.max(0, remainingSeconds);
  const total = Math.max(0, totalSeconds);
  const progress = total > 0 ? rem / total : 0;

  return (
    <div className="flex flex-col w-full" style={{ gap: 'min(4px, 0.8cqmin)' }}>
      <span
        className="text-indigo-400"
        style={{
          fontSize: 'min(24px, 6cqmin)',
          fontVariantNumeric: 'tabular-nums',
          opacity: isIdle ? 0.6 : 1,
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
            opacity: isIdle ? 0.5 : 1,
          }}
        />
      </div>
    </div>
  );
};

export interface ScheduleRowProps {
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
  /** Whether this is the currently active schedule item. */
  isActive: boolean;
  /** Computed effective start time (seconds since midnight); -1 if idle. */
  effectiveStartSec: number;
  /** Computed effective end time (seconds since midnight); -1 if idle. */
  effectiveEndSec: number;
  /** True when a timer-mode item has no anchor to chain from. */
  isIdle: boolean;
  /** Duration in seconds for timer-mode items (ignored for clock-mode items). */
  durationSeconds: number;
  textScale?: number;
  fontColor?: string;
}

const areScheduleRowPropsEqual = (
  prev: ScheduleRowProps,
  next: ScheduleRowProps
) => {
  // Check primitive/stable props equality
  if (prev.index !== next.index) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.onToggle !== next.onToggle) return false;
  if (prev.onStartTimer !== next.onStartTimer) return false;
  if (prev.cardOpacity !== next.cardOpacity) return false;
  if (prev.cardColor !== next.cardColor) return false;
  if (prev.format24 !== next.format24) return false;
  if (prev.textScale !== next.textScale) return false;
  if (prev.fontColor !== next.fontColor) return false;
  if (prev.effectiveStartSec !== next.effectiveStartSec) return false;
  if (prev.effectiveEndSec !== next.effectiveEndSec) return false;
  if (prev.isIdle !== next.isIdle) return false;
  if (prev.durationSeconds !== next.durationSeconds) return false;

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
  if (prevItem.durationSeconds !== nextItem.durationSeconds) return false;

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
  // Only re-render if the item is actively ticking (timer mode, within its
  // chained window, not idle, not done). Otherwise `nowSeconds` changes
  // have no visual effect and can be safely ignored.
  const isActivelyTicking =
    next.item.mode === 'timer' &&
    !next.item.done &&
    !next.isIdle &&
    next.effectiveStartSec !== -1 &&
    next.effectiveEndSec !== -1 &&
    next.nowSeconds >= next.effectiveStartSec &&
    next.nowSeconds <= next.effectiveEndSec;

  if (isActivelyTicking) {
    return prev.nowSeconds === next.nowSeconds;
  }

  return true;
};

export const ScheduleRow = React.memo<ScheduleRowProps>(function ScheduleRow({
  item,
  index,
  onToggle,
  onStartTimer,
  cardOpacity,
  cardColor,
  format24,
  nowSeconds,
  isActive,
  effectiveStartSec,
  effectiveEndSec,
  isIdle,
  durationSeconds,
  textScale = 1,
  fontColor = '#334155',
}) {
  const { t } = useTranslation();

  // Use the user-selected card color. Done items get a neutral gray tint.
  const bgColor = item.done
    ? hexToRgba('#cbd5e1', cardOpacity) // slate-300
    : hexToRgba(cardColor, cardOpacity);

  // Timer-mode: show a countdown-style display whenever the item is a timer
  // and not yet marked done. We display the duration frozen until the chain
  // reaches this item, then tick live until the chain moves past it.
  const isTimerMode = item.mode === 'timer' && !item.done;
  const hasAnchor =
    !isIdle && effectiveStartSec !== -1 && effectiveEndSec !== -1;
  const isBeforeActive = hasAnchor && nowSeconds < effectiveStartSec;
  const isAfterEnd = hasAnchor && nowSeconds >= effectiveEndSec;

  let countdownRemaining = durationSeconds;
  let countdownIsIdle = true;
  if (isTimerMode && hasAnchor) {
    if (isBeforeActive) {
      countdownRemaining = durationSeconds;
      countdownIsIdle = true;
    } else if (isAfterEnd) {
      countdownRemaining = 0;
      countdownIsIdle = false;
    } else {
      countdownRemaining = Math.max(0, effectiveEndSec - nowSeconds);
      countdownIsIdle = false;
    }
  } else if (isTimerMode && !hasAnchor) {
    // Idle timer-mode (no anchor): show full duration frozen.
    countdownRemaining = durationSeconds;
    countdownIsIdle = true;
  }

  const showCountdown = isTimerMode && durationSeconds > 0;

  // Rows size to their content so all events are visible when the widget is
  // tall enough. Auto-scroll keeps the active item in view.
  const rowStyle = {
    flex: '0 0 auto',
    minHeight: 'min(72px, 18cqmin)',
    backgroundColor: bgColor,
  };

  // Timer-start icon: strictly mode-aware so the button only appears when
  // handleStartTimer can actually launch something. Clock-mode needs a valid
  // endTime (remaining = endTime - now). Timer-mode needs a positive
  // duration. Without this check a stale `durationSeconds` left on a
  // clock-mode item would render a clickable button that does nothing.
  const canLaunchStandaloneTimer =
    !!onStartTimer &&
    (item.mode === 'timer' ? durationSeconds > 0 : !!item.endTime);
  const timerLaunchLabel =
    item.mode === 'timer'
      ? t('widgets.schedule.startTimerUntil', {
          time: formatCountdown(durationSeconds),
        })
      : t('widgets.schedule.startTimerUntil', {
          time: item.endTime ?? '',
        });

  return (
    <div
      className={`w-full flex items-center rounded-2xl transition-all relative snap-start overflow-hidden ${
        isActive
          ? 'border-[min(6px,1.5cqmin)] border-brand-blue-primary shadow-md z-10'
          : 'border border-slate-200 shadow-sm'
      }`}
      style={rowStyle}
    >
      {isActive && (
        <div
          className="absolute top-0 right-0 bg-brand-blue-primary text-white font-black uppercase tracking-widest z-20"
          style={{
            fontSize: `min(${Math.round(10 * textScale)}px, ${(2.5 * textScale).toFixed(2)}cqmin)`,
            padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
            borderBottomLeftRadius: 'min(12px, 3cqmin)',
          }}
        >
          Now
        </div>
      )}
      <button
        onClick={() => onToggle(index)}
        className="flex items-center flex-1 min-w-0 h-full"
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
        <div className="flex flex-col items-start justify-center min-w-0 flex-1 min-h-0">
          {showCountdown ? (
            <CountdownDisplay
              remainingSeconds={countdownRemaining}
              totalSeconds={durationSeconds}
              isIdle={countdownIsIdle}
            />
          ) : (
            <span
              className={`font-black leading-none ${item.done ? 'text-slate-400' : 'text-indigo-400'}`}
              style={{
                fontSize: `min(${Math.round(24 * textScale)}px, ${(6 * textScale).toFixed(2)}cqmin)`,
                color: !item.done ? fontColor : undefined,
              }}
            >
              {formatScheduleTime(item.startTime ?? item.time, format24)}
            </span>
          )}
          <span
            className={`font-black leading-tight truncate w-full text-left ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
            style={{
              fontSize: `min(${Math.round(36 * textScale)}px, ${(10 * textScale).toFixed(2)}cqmin)`,
              color: !item.done ? fontColor : undefined,
            }}
          >
            {item.task}
          </span>
        </div>
      </button>
      {canLaunchStandaloneTimer && (
        <button
          onClick={() => onStartTimer?.(item)}
          className="shrink-0 text-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
          style={{
            padding: 'min(4px, 1cqmin)',
            marginRight: 'min(12px, 2.5cqmin)',
          }}
          title={timerLaunchLabel}
          aria-label={timerLaunchLabel}
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
}, areScheduleRowPropsEqual);

ScheduleRow.displayName = 'ScheduleRow';
