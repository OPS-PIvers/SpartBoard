/**
 * Open/close window classification (M17 spec §3a-C). Assignments without a
 * window (`openAt`/`closeAt` both absent — every pre-existing assignment)
 * always classify as 'open': `openAt ?? -Infinity`, `closeAt ?? Infinity`.
 */

export type AssignmentWindowState = 'open' | 'upcoming' | 'closed';

export interface WindowFields {
  openAt?: number;
  closeAt?: number;
}

export function getWindowState(
  a: WindowFields,
  nowMs: number
): AssignmentWindowState {
  const openAt = a.openAt ?? -Infinity;
  const closeAt = a.closeAt ?? Infinity;
  if (nowMs < openAt) return 'upcoming';
  if (nowMs >= closeAt) return 'closed';
  return 'open';
}

/** "Opens {day time}" label for an upcoming-window card. */
export function formatOpensLabel(openAtMs: number): string {
  const d = new Date(openAtMs);
  const day = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Opens ${day} ${time}`;
}
