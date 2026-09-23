import { useInSubShare, useShareContent } from '@/hooks/useShareContent';
import type { CalendarEvent, SubShareCalendarPayload } from '@/types';

export interface SubShareCalendar {
  /** False everywhere but `/subs`, where the caller must use this instead. */
  active: boolean;
  events: CalendarEvent[];
  loading: boolean;
}

/**
 * The teacher's personal calendar events inside a sub share.
 *
 * A substitute has no `calendar.readonly` token for someone else's Google
 * account, so the events are read on the teacher's client at share time and
 * bundled. Building and local events are not bundled: the first is readable by
 * anyone in the building and the second travels in the widget's own config.
 */
export function useSubShareCalendar(widgetId: string): SubShareCalendar {
  const inShare = useInSubShare();
  const bundled = useShareContent<SubShareCalendarPayload>(
    'calendar',
    widgetId
  );
  return {
    active: inShare,
    events: bundled.payload?.events ?? [],
    loading: bundled.status === 'loading',
  };
}
