import type { LunchZoneId } from './useLunchCountModel';

// Same rules as the legacy face in ../Widget.tsx; that copy goes when the lunch-count-redesign flag retires.

export function formatGradeLabel(grade: string): string {
  if (!grade) return '';
  if (grade === 'K' || grade === 'MAC') return grade;
  return `GR${grade}`;
}

export function formatTeacherName(displayName: string): string {
  if (!displayName) return 'Staff';
  const name = displayName.trim();
  if (!name) return 'Staff';

  if (name.includes(',')) {
    const parts = name.split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      const last = parts[0];
      const first = parts[1];
      if (first.length > 0) {
        return `${first[0].toUpperCase()}. ${last}`;
      }
    }
  }

  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first.length > 0) {
      return `${first[0].toUpperCase()}. ${last}`;
    }
  }

  return name;
}

export function formatLunchTime(hour: string, minute: string): string {
  if (!hour) return '';
  const parsedHour = Number(hour);
  if (!Number.isFinite(parsedHour) || parsedHour < 1 || parsedHour > 12) {
    return '';
  }
  const parsedMinute = Number(minute || '0');
  const safeMinute =
    Number.isFinite(parsedMinute) && parsedMinute >= 0 && parsedMinute < 60
      ? parsedMinute
      : 0;
  return `${String(parsedHour)}:${String(safeMinute).padStart(2, '0')}`;
}

export function getCentralTimestamp(): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch (error) {
    console.warn(
      '[LunchCountWidget] Failed to format timestamp in America/Chicago timezone; falling back to local time. Timestamps may not be in Central Time.',
      error
    );
    return new Date().toLocaleString();
  }
}

export type MenuLine =
  | { kind: 'item'; text: string }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'none' };

// Replaces the legacy face's permanent "Loading": loading only before or during a sync.
export function menuLine(
  name: string | undefined,
  state: {
    hasCache: boolean;
    isSyncing: boolean;
    syncError: string | null | undefined;
    isManualMode: boolean;
    noItemText: string;
  }
): MenuLine {
  if (name) return { kind: 'item', text: name };
  if (state.hasCache) return { kind: 'item', text: state.noItemText };
  if (state.isSyncing) return { kind: 'loading' };
  if (state.syncError) return { kind: 'unavailable' };
  if (state.isManualMode) return { kind: 'none' };
  return { kind: 'loading' };
}

export const COUNT_COLOR: Record<LunchZoneId, string> = {
  hot: 'text-brand-red-primary',
  bento: 'text-emerald-600',
  home: 'text-brand-blue-primary',
};

export const ZONE_TONE: Record<
  LunchZoneId,
  { fill: string; over: string; label: string; text: string }
> = {
  hot: {
    fill: 'bg-brand-red-lighter/40',
    over: 'bg-brand-red-lighter/70 ring-4 ring-inset ring-brand-red-primary',
    label: 'text-brand-red-primary',
    text: 'text-brand-red-dark',
  },
  bento: {
    fill: 'bg-emerald-50',
    over: 'bg-emerald-100 ring-4 ring-inset ring-emerald-600',
    label: 'text-emerald-700',
    text: 'text-emerald-800',
  },
  home: {
    fill: 'bg-brand-blue-lighter',
    over: 'bg-brand-blue-lighter ring-4 ring-inset ring-brand-blue-primary',
    label: 'text-brand-blue-primary',
    text: 'text-brand-blue-dark',
  },
};

export const isMiddleHighSite = (
  site: string | undefined
): site is 'orono-middle-school' | 'orono-high-school' =>
  site === 'orono-middle-school' || site === 'orono-high-school';
