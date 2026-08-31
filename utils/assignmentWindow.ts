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
 * present pointer value already IS the effective one and wins over the
 * session-level window.
 */
export function resolveEffectiveWindow(
  session: NullableWindowFields | null | undefined,
  pointer: NullableWindowFields | null | undefined
): WindowFields {
  const pick = (field: 'openAt' | 'closeAt') => {
    const shift = pointer?.[field];
    if (typeof shift === 'number') return shift;
    const base = session?.[field];
    return typeof base === 'number' ? base : undefined;
  };
  return { openAt: pick('openAt'), closeAt: pick('closeAt') };
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
