import type { ScheduleItem, WidgetType } from '@/types';

const MINUTES_PER_DAY = 24 * 60;

const clock = (minutes: number): string => {
  const m = Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY - 1);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Three back-to-back periods around `now`, so a tour always has a Now row with a timer icon.
export const tourDemoScheduleItems = (now: Date): ScheduleItem[] => {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const base = Math.min(Math.max(nowMin, 60), 22 * 60 + 30);
  return [
    ['Morning Meeting', base - 60, base - 30],
    ['Math', base - 30, base + 30],
    ['Reading', base + 30, base + 90],
  ].map(([task, start, end], i) => ({
    id: `tour-demo-${i + 1}`,
    task: task as string,
    startTime: clock(start as number),
    endTime: clock(end as number),
    mode: 'clock' as const,
  }));
};

// Sample content a tour adds to its own fresh widgets so every step has something to point at.
export const tourDemoConfig = (
  type: WidgetType,
  now: Date = new Date()
): Record<string, unknown> | undefined =>
  type === 'schedule' ? { items: tourDemoScheduleItems(now) } : undefined;
