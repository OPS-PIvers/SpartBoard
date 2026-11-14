// Server-held turn-in time for quiz and video responses, and the server side of the quiz time limit.
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import { toMillis } from './gradebook/gradeRowMath';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;
export type TurnInKind = 'quiz' | 'video-activity';

/** Turn-ins and answers this long past the deadline count as over time (client auto-submit lag). */
export const TIME_LIMIT_GRACE_MS = 120_000;

const COLLECTION: Record<TurnInKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
};
const CLAIMED: Record<TurnInKind, 'submittedAt' | 'completedAt'> = {
  quiz: 'submittedAt',
  'video-activity': 'completedAt',
};

/** True when this write is the one that finishes an attempt. */
export function isTurnInWrite(
  kind: TurnInKind,
  before: Doc | undefined,
  after: Doc | undefined
): boolean {
  if (!after) return false;
  if (kind === 'quiz')
    return after.status === 'completed' && before?.status !== 'completed';
  return after.completedAt != null && before?.completedAt == null;
}

/** The response as the trusted readers should see it: stamped with the server's own time for this turn-in. */
export function withTurnInStamp(
  kind: TurnInKind,
  after: Doc,
  eventAt: number
): Doc {
  const claimed = toMillis(after[CLAIMED[kind]]);
  return { ...after, turnIn: { at: eventAt, claimed } };
}

/** Mirrors utils/quizTimeLimit.ts clampQuizTimeLimitMinutes. */
function limitMinutes(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(240, Math.max(1, Math.round(n)));
}

function pausedMsSince(startedAt: number, spans: unknown): number {
  let total = 0;
  for (const s of Array.isArray(spans) ? spans : []) {
    const from = Number((s as Doc)?.from);
    const to = Number((s as Doc)?.to);
    if (!(to > from)) continue;
    total += Math.max(0, to - Math.max(from, startedAt));
  }
  return total;
}

/** Epoch ms the attempt runs out at for this multiplier (utils/quizTimeLimit.ts resolveAttemptDeadline); null for no limit. */
export function quizAttemptDeadline(
  session: Doc,
  response: Doc,
  multiplier: unknown
): number | null {
  if (session.sessionMode !== 'student') return null;
  const minutes = limitMinutes(session.timeLimitMinutes);
  const startedAt = toMillis(response.attemptStartedAt);
  if (minutes === null || startedAt === null || multiplier === 'unlimited')
    return null;
  const scale = multiplier === 1.5 || multiplier === 2 ? multiplier : 1;
  return (
    startedAt +
    minutes * 60_000 * scale +
    pausedMsSince(startedAt, session.pauseSpans)
  );
}

/** This student's extended-time multiplier from their assignment pointer, if any. */
export async function readTimeMultiplier(
  db: Firestore,
  session: Doc,
  studentUid: unknown
): Promise<unknown> {
  const assignmentId = session.assignmentId;
  if (typeof assignmentId !== 'string' || !assignmentId) return undefined;
  if (typeof studentUid !== 'string' || !studentUid) return undefined;
  const snap = await db
    .collection('student_assignments')
    .doc(studentUid)
    .collection('items')
    .doc(assignmentId)
    .get();
  const override = snap.data()?.override as Doc | undefined;
  return override?.timeMultiplier;
}

/** True when a turn-in at `at` is past this attempt's deadline plus grace; reads the pointer only when the base limit is passed. */
export async function isOverTime(
  db: Firestore,
  session: Doc,
  response: Doc,
  at: number
): Promise<boolean> {
  const base = quizAttemptDeadline(session, response, 1);
  if (base === null || at <= base + TIME_LIMIT_GRACE_MS) return false;
  const multiplier = await readTimeMultiplier(db, session, response.studentUid);
  const deadline = quizAttemptDeadline(session, response, multiplier);
  return deadline !== null && at > deadline + TIME_LIMIT_GRACE_MS;
}

/** On a turn-in, records the server's time and flags a quiz attempt turned in past its limit; returns the stamped response. */
export async function stampTurnIn(
  db: Firestore,
  kind: TurnInKind,
  sessionId: string,
  docId: string,
  before: Doc | undefined,
  after: Doc | undefined,
  eventAt: number
): Promise<Doc | undefined> {
  if (!after || !isTurnInWrite(kind, before, after)) return after;
  const stamped = withTurnInStamp(kind, after, eventAt);
  try {
    const sessionRef = db.collection(COLLECTION[kind]).doc(sessionId);
    const ref = sessionRef.collection('responses').doc(docId);
    let overTime = false;
    if (kind === 'quiz' && after.timeUp !== true) {
      const session = (await sessionRef.get()).data();
      overTime = !!session && (await isOverTime(db, session, after, eventAt));
    }
    const claimed = stableKey(after[CLAIMED[kind]]);
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data();
      // Only the attempt this event finished; a retry after a retake must not stamp the new one.
      if (!fresh || stableKey(fresh[CLAIMED[kind]]) !== claimed) return;
      if (kind === 'quiz' && fresh.status !== 'completed') return;
      tx.update(ref, {
        turnIn: stamped.turnIn,
        ...(overTime && fresh.timeUp !== true ? { timeUp: true } : {}),
      });
    });
    return overTime ? { ...stamped, timeUp: true } : stamped;
  } catch (err) {
    logger.error('quizTurnIn: stamp failed', {
      kind,
      sessionId,
      docId,
      error: err instanceof Error ? err.message : String(err),
    });
    return stamped;
  }
}

function stableKey(v: unknown): string {
  const ms = toMillis(v);
  return ms === null ? JSON.stringify(v ?? null) : String(ms);
}
