import type { Announcement } from '@/types';
import { combineDateAndTime } from '@/utils/localDate';

/** Parse "HH:MM" into minutes-since-midnight for comparison. */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Returns true when the announcement is currently inside its active window.
 * @param nowMs - current wall-clock time in ms, passed explicitly so callers
 *                can include it in useMemo deps.
 */
export function isWithinActiveWindow(a: Announcement, nowMs: number): boolean {
  // isActive acts as a master enable flag for all activation types.
  if (!a.isActive) return false;

  // Optional auto-deactivate end window — applies regardless of activation type.
  const endMs = combineDateAndTime(a.scheduledEndDate, a.scheduledEndTime);
  if (endMs != null && nowMs >= endMs) return false;

  if (a.activationType !== 'scheduled') return true;

  // Scheduled activation: gated by start date+time when present, falling back
  // to time-only comparison for legacy announcements created before the
  // date field existed (so old announcements still work).
  if (a.scheduledActivationDate && a.scheduledActivationTime) {
    const startMs = combineDateAndTime(
      a.scheduledActivationDate,
      a.scheduledActivationTime
    );
    if (startMs == null) return false;
    return nowMs >= startMs;
  }
  if (!a.scheduledActivationTime) return false;
  // Legacy: HH:MM-only — visible when wall-clock minutes meet/exceed start time.
  const now = new Date(nowMs);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= timeToMinutes(a.scheduledActivationTime);
}

export type AnnouncementLiveStatus =
  'inactive' | 'scheduled' | 'active' | 'expired';

/**
 * Derive a live status for an announcement at the given moment, accounting
 * for the master `isActive` flag plus the optional scheduled start/end window.
 */
export function getAnnouncementLiveStatus(
  a: Announcement,
  nowMs: number
): AnnouncementLiveStatus {
  if (!a.isActive) return 'inactive';

  const endMs = combineDateAndTime(a.scheduledEndDate, a.scheduledEndTime);
  if (endMs != null && nowMs >= endMs) return 'expired';

  // The overlay's own check, so the badge never disagrees with what teachers see.
  if (!isWithinActiveWindow(a, nowMs)) return 'scheduled';

  return 'active';
}
