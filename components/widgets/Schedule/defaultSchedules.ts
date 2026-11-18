import type { DailySchedule, ScheduleItem } from '@/types';

const cleanItem = ({
  done: _done,
  spawnedWidgetIds: _spawned,
  ...item
}: ScheduleItem): ScheduleItem => item;

/** Copies schedules for reuse on another board, dropping today-only events and per-board state. */
export const toDefaultSchedules = (
  schedules: readonly DailySchedule[]
): DailySchedule[] =>
  schedules.map((schedule) => ({
    // 'default' marks unsaved legacy items in the editor, so a stored schedule never keeps it.
    id: schedule.id === 'default' ? 'saved-default' : schedule.id,
    name: schedule.name,
    days: [...schedule.days],
    items: schedule.items.filter((item) => !item.oneOffDate).map(cleanItem),
  }));

/** Starts a new Schedule widget's config from the teacher's saved default schedules. */
export const withDefaultSchedules = (
  base: Record<string, unknown> | undefined,
  saved: readonly DailySchedule[] | undefined
): Record<string, unknown> | undefined =>
  saved && saved.length > 0
    ? { ...base, items: [], schedules: toDefaultSchedules(saved) }
    : base;
