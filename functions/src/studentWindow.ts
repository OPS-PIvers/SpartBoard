// Server mirror of utils/studentWindow.ts; utils/studentWindow.test.ts fails if the body below drifts.
// ---- shared body ----

/** What `setAssignmentTargetsV1` writes beside a session's `closeAt` once it widens it for a per-student extension. */
export interface StudentWindowsMarker {
  /** The class's own close, before any student's extension. */
  classCloseAt: number | null;
  /** The session `closeAt` written alongside; any other value means a later write replaced it. */
  closeAt: number | null;
}

const num = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

/** True when the session carries the per-student window marker. */
export function hasStudentWindows(session: {
  studentWindows?: unknown;
}): boolean {
  const marker = session.studentWindows;
  return typeof marker === 'object' && marker !== null;
}

/** The class's close: the session's, unless the server widened it for one student's later close. */
export function classCloseAt(session: {
  closeAt?: unknown;
  studentWindows?: unknown;
}): number | null {
  const bound = num(session.closeAt);
  if (!hasStudentWindows(session)) return bound;
  const marker = session.studentWindows as Record<string, unknown>;
  // A Close or Reopen since then rewrote closeAt without the marker, so the marker no longer applies.
  if (num(marker.closeAt) !== bound) return bound;
  return num(marker.classCloseAt);
}

/** One student's close: their own, else their class's; on marked sessions never past the close the rules hold. */
export function studentCloseAt(
  session: { closeAt?: unknown; studentWindows?: unknown },
  pointerCloseAt?: unknown
): number | null {
  const own = num(pointerCloseAt);
  if (own === null) return classCloseAt(session);
  const bound = num(session.closeAt);
  if (bound === null || !hasStudentWindows(session)) return own;
  return Math.min(own, bound);
}

/** One student's due date: their own, else their class's, else the session's. */
export function studentDueAt(
  session: { dueAt?: unknown; dueAtByClassId?: unknown },
  classIds: readonly string[] | string | null,
  pointerDueAt?: unknown
): number | null {
  const own = num(pointerDueAt);
  if (own !== null) return own;
  const byClass = session.dueAtByClassId;
  if (typeof byClass === 'object' && byClass !== null) {
    const ids = typeof classIds === 'string' ? [classIds] : (classIds ?? []);
    for (const id of ids) {
      const due = num((byClass as Record<string, unknown>)[id]);
      if (due !== null) return due;
    }
  }
  return num(session.dueAt);
}
