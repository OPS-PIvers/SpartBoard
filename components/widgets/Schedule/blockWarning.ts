import type {
  ConnectionBlock,
  ScheduleConfig,
  ScheduleItem,
  ScheduleItemWarning,
} from '@/types';
import {
  computeEffectiveTimes,
  resolveActiveSchedule,
} from '@/components/widgets/Schedule/utils';

export const WARNING_SOUNDS = ['Chime', 'Blip', 'Gong', 'Alert'] as const;
export const WARNING_MINUTES = [1, 2, 3, 5, 10, 15] as const;
export const DEFAULT_WARNING = { minutes: 5, sound: 'Chime' } as const;

const dayString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const warningKey = (item: ScheduleItem): string =>
  item.id ?? `${item.startTime ?? item.time ?? ''}|${item.task}`;

export interface DueWarning {
  key: string;
  block: ConnectionBlock;
}

/** A block of today with its start and end in seconds since midnight (-1 when unknown). */
export interface WarnableBlock {
  key: string;
  task: string;
  startSec: number;
  endSec: number;
  warning?: ScheduleItemWarning;
}

// The block whose warning is due now and hasn't fired today; a throttled tab fires late while the block still runs.
export const pickDueWarning = (
  blocks: WarnableBlock[],
  warningsFired: Record<string, string> | undefined,
  nowMs: number
): DueWarning | null => {
  const now = new Date(nowMs);
  const today = dayString(now);
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const nowSec = (nowMs - midnight) / 1000;
  for (const b of blocks) {
    const minutes = b.warning?.minutes ?? 0;
    if (!b.warning || minutes <= 0) continue;
    if (b.endSec === -1 || b.startSec === -1) continue;
    const warnAt = Math.max(b.startSec, b.endSec - minutes * 60);
    if (nowSec < warnAt || nowSec >= b.endSec) continue;
    if (warningsFired?.[b.key] === today) continue;
    return {
      key: b.key,
      block: {
        endsAt: midnight + b.endSec * 1000,
        task: b.task,
        minutes,
        sound: b.warning.sound ?? DEFAULT_WARNING.sound,
      },
    };
  }
  return null;
};

export const findDueWarning = (
  config: ScheduleConfig,
  nowMs: number
): DueWarning | null => {
  const now = new Date(nowMs);
  const today = dayString(now);
  const active = resolveActiveSchedule(
    config.schedules ?? [],
    config.items ?? [],
    now.getDay()
  );
  if (!active) return null;
  const items = active.schedule.items.filter(
    (i) => !i.oneOffDate || i.oneOffDate === today
  );
  const times = computeEffectiveTimes(items);
  const blocks = items.map((item, i): WarnableBlock => {
    const eff = times[i];
    const usable = !!eff && !eff.isIdle;
    return {
      key: warningKey(item),
      task: item.task,
      startSec: usable ? eff.startSec : -1,
      endSec: usable ? eff.endSec : -1,
      warning: item.warning,
    };
  });
  return pickDueWarning(blocks, config.warningsFired, nowMs);
};

// Keeps only today's marks so the saved list never grows.
export const markWarningFired = (
  config: { warningsFired?: Record<string, string> },
  key: string,
  nowMs: number
): Record<string, string> => {
  const today = dayString(new Date(nowMs));
  const kept = Object.fromEntries(
    Object.entries(config.warningsFired ?? {}).filter(([, d]) => d === today)
  );
  return { ...kept, [key]: today };
};
