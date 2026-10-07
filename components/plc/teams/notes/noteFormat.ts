// Date labels for the Notes & Docs page and the Department Hub.

const DAY_MS = 86_400_000;

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "Oct 9" */
export const formatShortDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

/** "Tue, Oct 14" */
export const formatDayDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

/** "3:15 PM" */
export const formatTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

export const isSameDay = (a: number, b: number): boolean =>
  startOfDay(a) === startOfDay(b);

export const isBeforeToday = (ms: number, now: number): boolean =>
  startOfDay(ms) < startOfDay(now);

export const daysBetween = (a: number, b: number): number =>
  Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

/** 'YYYY-MM-DD' for a date input, local time. */
export const toDateInput = (ms: number | null | undefined): string => {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fromDateInput = (v: string): number | null => {
  const [y, m, d] = v.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : null;
};
