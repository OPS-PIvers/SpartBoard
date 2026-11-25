import { logger } from 'firebase-functions';
import * as admin from './firebaseAdmin';
import { safeErr } from './safeLog';

const QUIZ_SESSIONS = 'quiz_sessions';
const MAX_PER_RUN = 200;

interface HeldPass {
  from: number | null;
  until: number;
}

interface PeriodRow {
  state?: unknown;
  closedAt?: unknown;
  openAt?: unknown;
  closeAt?: unknown;
}

/** What the sweep does with a quiz kept live for passes after every class closed. */
export type HeldRunStep =
  | { kind: 'clear' }
  | {
      kind: 'wait';
      hold: { until: number; students: Record<string, HeldPass> };
    }
  | { kind: 'end' };

/** Mirrors the client's `isClassClosed`: closed by hand, or its close time passed. */
function classClosed(row: PeriodRow, now: number): boolean {
  if (row.state === 'closed' && row.closedAt != null) return true;
  if (row.state === 'paused' || row.state === 'closed') return false;
  if (typeof row.openAt === 'number' && now < row.openAt) return false;
  return typeof row.closeAt === 'number' && now >= row.closeAt;
}

/** Decides one held run: forget the hold, keep waiting on passes, or end it. */
export function heldRunStep(
  session: Record<string, unknown>,
  now: number
): HeldRunStep {
  if (session.status === 'ended') return { kind: 'clear' };
  const pa = session.periodAccess as Record<string, PeriodRow> | undefined;
  // A class the teacher opened again runs on Manual timing, so only the teacher ends it.
  // A whole-quiz Close holds as a pause; a Resume hands the end back to the teacher too.
  const closed =
    pa && typeof pa === 'object'
      ? Object.values(pa).every((row) => classClosed(row ?? {}, now))
      : session.status === 'paused';
  if (!closed) return { kind: 'clear' };
  const access = (session.studentAccess ?? {}) as Record<string, unknown>;
  const from = (session.studentAccessFrom ?? {}) as Record<string, unknown>;
  const students: Record<string, HeldPass> = {};
  let until = 0;
  for (const [uid, v] of Object.entries(access)) {
    if (typeof v !== 'number' || v <= now) continue;
    const f = from[uid];
    students[uid] = {
      from: typeof f === 'number' && f > now ? f : null,
      until: v,
    };
    until = Math.max(until, v);
  }
  return until > 0
    ? { kind: 'wait', hold: { until, students } }
    : { kind: 'end' };
}

/** Ends quizzes whose classes all closed while students held passes, once the last pass runs out. */
export async function runEndHeldQuizRuns(
  db: admin.firestore.Firestore,
  now = Date.now()
): Promise<{ ended: number; waiting: number; cleared: number }> {
  const snap = await db
    .collection(QUIZ_SESSIONS)
    .where('passHold.until', '<=', now)
    .limit(MAX_PER_RUN)
    .get();
  const out = { ended: 0, waiting: 0, cleared: 0 };
  for (const docSnap of snap.docs) {
    try {
      const step = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(docSnap.ref);
        const data = fresh.data();
        if (!data || data.passHold == null) return null;
        const teacherUid =
          typeof data.teacherUid === 'string' ? data.teacherUid : null;
        const assignmentId =
          typeof data.assignmentId === 'string'
            ? data.assignmentId
            : docSnap.id;
        const assignmentRef = teacherUid
          ? db
              .collection('users')
              .doc(teacherUid)
              .collection('quiz_assignments')
              .doc(assignmentId)
          : null;
        const assignment = assignmentRef
          ? (await tx.get(assignmentRef)).data()
          : undefined;
        const plcId = (assignment?.plc as { id?: unknown } | undefined)?.id;
        const indexRef =
          typeof plcId === 'string' && plcId
            ? db
                .collection('plcs')
                .doc(plcId)
                .collection('assignment_index')
                .doc(assignmentId)
            : null;
        const indexExists = indexRef ? (await tx.get(indexRef)).exists : false;
        const s = heldRunStep(data, Date.now());
        const del = admin.firestore.FieldValue.delete();
        if (s.kind === 'clear') {
          tx.update(docSnap.ref, { passHold: del });
          if (assignment && assignmentRef)
            tx.update(assignmentRef, { passHold: del });
        } else if (s.kind === 'wait') {
          tx.update(docSnap.ref, { passHold: s.hold });
          if (assignment && assignmentRef)
            tx.update(assignmentRef, { passHold: s.hold });
        } else {
          const at = Date.now();
          const reopened = Array.isArray(data.reopenedFor)
            ? (data.reopenedFor as unknown[]).filter(
                (u): u is string => typeof u === 'string'
              )
            : [];
          const passes: Record<string, unknown> = {};
          for (const uid of reopened) {
            passes[`studentAccess.${uid}`] = del;
            passes[`studentAccessFrom.${uid}`] = del;
          }
          // The same writes as the teacher's End (commitQuizLifecycle).
          tx.update(docSnap.ref, {
            status: 'ended',
            endedAt: at,
            autoProgressAt: null,
            revealedAnswers: del,
            reopenedFor: del,
            passHold: del,
            ...passes,
          });
          if (assignment && assignmentRef)
            tx.update(assignmentRef, {
              status: 'inactive',
              updatedAt: at,
              reopenedFor: del,
              passHold: del,
            });
          // The PLC index mirror the client's End writes, so the row moves to Completed.
          if (indexRef && indexExists)
            tx.update(indexRef, { status: 'inactive' });
        }
        return s.kind;
      });
      if (step === 'end') out.ended++;
      else if (step === 'wait') out.waiting++;
      else if (step === 'clear') out.cleared++;
    } catch (err) {
      logger.error('[endHeldQuizRuns] failed', {
        sessionId: docSnap.id,
        err: safeErr(err),
      });
    }
  }
  if (out.ended + out.waiting + out.cleared > 0)
    logger.info('[endHeldQuizRuns] done', out);
  return out;
}
