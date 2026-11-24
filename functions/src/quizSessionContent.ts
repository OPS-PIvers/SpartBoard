import type * as admin from './firebaseAdmin';

/** Session fields a per-period session keeps in `content/questions` instead (PER_PERIOD_ASSIGNMENT_ACCESS.md). */
export const QUIZ_CONTENT_FIELDS = [
  'publicQuestions',
  'stimuli',
  'readAloudTextByStimulusId',
] as const;

/** The session data with its hidden content folded back in; a no-op on sessions that keep it inline. */
export async function withQuizSessionContent<T extends Record<string, unknown>>(
  sessionRef: admin.firestore.DocumentReference,
  data: T
): Promise<T> {
  if (data.questionsInContent !== true) return data;
  const snap = await sessionRef.collection('content').doc('questions').get();
  const content = snap.data() ?? {};
  const out: Record<string, unknown> = { ...data };
  for (const field of QUIZ_CONTENT_FIELDS) {
    if (field in content) out[field] = content[field];
  }
  return out as T;
}

/** Matches `beforeClose`/`afterOpen` in firestore.rules, so both gates agree at the boundary. */
export const PERIOD_WINDOW_GRACE_MS = 120_000;

interface PeriodWindow {
  state?: unknown;
  openAt?: unknown;
  closeAt?: unknown;
}

/** A Let in pass that is running now; a time set for later ("Set a time") starts at `studentAccessFrom`. */
export function passActive(
  session: Record<string, unknown>,
  uid: string,
  nowMs: number
): boolean {
  const until = (
    session.studentAccess as Record<string, unknown> | undefined
  )?.[uid];
  if (typeof until !== 'number' || until <= nowMs) return false;
  const from = (
    session.studentAccessFrom as Record<string, unknown> | undefined
  )?.[uid];
  return typeof from !== 'number' || from <= nowMs;
}

/** The start of a time set for this student, while its window runs or it began within `withinMs`. */
export function setTimeStart(
  session: Record<string, unknown>,
  uid: string,
  nowMs: number,
  withinMs: number
): number | null {
  const until = (
    session.studentAccess as Record<string, unknown> | undefined
  )?.[uid];
  const from = (
    session.studentAccessFrom as Record<string, unknown> | undefined
  )?.[uid];
  if (typeof from !== 'number' || typeof until !== 'number') return null;
  if (until <= nowMs || until <= from) return null;
  return nowMs < Math.max(from + withinMs, until) ? from : null;
}

/** True when a per-period session has this response's period closed or paused, so the attempt is frozen, not idle. */
export function isPeriodFrozen(
  session: Record<string, unknown>,
  response: Record<string, unknown>,
  nowMs: number
): boolean {
  const pa = session.periodAccess as Record<string, PeriodWindow> | undefined;
  if (!pa || typeof pa !== 'object') return false;
  const uid =
    typeof response.studentUid === 'string' ? response.studentUid : '';
  if (passActive(session, uid, nowMs)) return false;
  const p = typeof response.classId === 'string' ? pa[response.classId] : null;
  if (!p || p.state !== 'open') return true;
  if (typeof p.openAt === 'number' && nowMs < p.openAt - PERIOD_WINDOW_GRACE_MS)
    return true;
  if (
    typeof p.closeAt === 'number' &&
    nowMs >= p.closeAt + PERIOD_WINDOW_GRACE_MS
  )
    return true;
  return false;
}
