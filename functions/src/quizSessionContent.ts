import type * as admin from 'firebase-admin';

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

interface PeriodWindow {
  state?: unknown;
  openAt?: unknown;
  closeAt?: unknown;
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
  const letIn = (
    session.studentAccess as Record<string, unknown> | undefined
  )?.[uid];
  if (typeof letIn === 'number' && letIn > nowMs) return false;
  const p = typeof response.classId === 'string' ? pa[response.classId] : null;
  if (!p || p.state !== 'open') return true;
  if (typeof p.openAt === 'number' && nowMs < p.openAt) return true;
  if (typeof p.closeAt === 'number' && nowMs >= p.closeAt) return true;
  return false;
}
