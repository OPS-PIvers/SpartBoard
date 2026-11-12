import type { ConnectionBlock, ScheduleConfig, ScheduleItem } from '@/types';
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

// The block whose warning is due now and hasn't fired today; a throttled tab fires late while the block still runs.
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
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const nowSec = (nowMs - midnight) / 1000;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const eff = times[i];
    const minutes = item.warning?.minutes ?? 0;
    if (!item.warning || minutes <= 0 || !eff || eff.isIdle) continue;
    if (eff.endSec === -1 || eff.startSec === -1) continue;
    const warnAt = Math.max(eff.startSec, eff.endSec - minutes * 60);
    if (nowSec < warnAt || nowSec >= eff.endSec) continue;
    const key = warningKey(item);
    if (config.warningsFired?.[key] === today) continue;
    return {
      key,
      block: {
        endsAt: midnight + eff.endSec * 1000,
        task: item.task,
        minutes,
        sound: item.warning.sound ?? DEFAULT_WARNING.sound,
      },
    };
  }
  return null;
};

// Keeps only today's marks so the saved list never grows.
export const markWarningFired = (
  config: ScheduleConfig,
  key: string,
  nowMs: number
): Record<string, string> => {
  const today = dayString(new Date(nowMs));
  const kept = Object.fromEntries(
    Object.entries(config.warningsFired ?? {}).filter(([, d]) => d === today)
  );
  return { ...kept, [key]: today };
};
