/**
 * Open/close window classification (M17 spec §3a-C). Assignments without a
 * window (`openAt`/`closeAt` both absent — every pre-existing assignment)
 * always classify as 'open': `openAt ?? -Infinity`, `closeAt ?? Infinity`.
 */

import { studentCloseAt } from './studentWindow';

export type AssignmentWindowState = 'open' | 'upcoming' | 'closed';

export interface WindowFields {
  openAt?: number;
  closeAt?: number;
}

/** Session/pointer docs store an explicitly-cleared window field as `null`. */
export interface NullableWindowFields {
  openAt?: number | null;
  closeAt?: number | null;
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

/**
 * The student's effective window (M17 F2). `setAssignmentTargetsV1` writes the
 * per-student shift onto the pointer doc's TOP-LEVEL `openAt`/`closeAt`, so a
 * present pointer value already IS the effective one. Without one, the close is
 * the class's, not the session bound the server widened for another student.
 */
export function resolveEffectiveWindow(
  session:
    (NullableWindowFields & { studentWindows?: unknown }) | null | undefined,
  pointer: NullableWindowFields | null | undefined
): WindowFields {
  const openAt =
    typeof pointer?.openAt === 'number'
      ? pointer.openAt
      : typeof session?.openAt === 'number'
        ? session.openAt
        : undefined;
  const closeAt = session
    ? studentCloseAt(session, pointer?.closeAt)
    : typeof pointer?.closeAt === 'number'
      ? pointer.closeAt
      : null;
  return { openAt, closeAt: closeAt ?? undefined };
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

/** STUDENT_LANDING_V2 D10: a Resource reads "Available until {day time}" or "No end date". */
export function formatAvailableUntilLabel(
  closeAtMs: number | undefined
): string {
  if (typeof closeAtMs !== 'number') return 'No end date';
  const d = new Date(closeAtMs);
  const day = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Available until ${day} ${time}`;
}

/** D10: a Resource leaves the student view once its window closes or the session ends; reopening brings it back. */
export function isResourceAvailable(
  a: WindowFields & { endedAt?: number },
  nowMs: number
): boolean {
  return a.endedAt === undefined && getWindowState(a, nowMs) !== 'closed';
}

/** The later of a class's next open and the student's own, either of which may be missing. */
export function laterOpen(
  classOpensAt: number | null | undefined,
  ownOpensAt: number | null | undefined
): number | null {
  const a = classOpensAt ?? null;
  const b = ownOpensAt ?? null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
