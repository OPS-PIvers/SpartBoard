// Scheduled recompute of dirty PLC assessments into `plcs/{plcId}/aggregates` (plan §5.2).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';
import {
  computeAssessmentAggregate,
  resolveGroupQuestions,
  type CompletedResponse,
  type RawAnswer,
  type SessionInput,
} from './plcAssessmentMath';

type Firestore = admin.firestore.Firestore;

export const RECOMPUTE_BATCH_LIMIT = 50;

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseAnswer(raw: unknown): RawAnswer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const questionId = asString(r.questionId);
  if (questionId.length === 0) return null;
  return {
    questionId,
    answer: asString(r.answer),
    answeredAt: typeof r.answeredAt === 'number' ? r.answeredAt : undefined,
    isCorrect: typeof r.isCorrect === 'boolean' ? r.isCorrect : undefined,
    status: r.status === 'draft' ? 'draft' : undefined,
    unresponded: r.unresponded ?? undefined,
    takeIndex: typeof r.takeIndex === 'number' ? r.takeIndex : undefined,
  };
}

/** Tolerant parse of a completed response; unknown shapes yield an empty answer list. */
export function parseCompletedResponse(
  raw: Record<string, unknown>
): CompletedResponse {
  const answers = Array.isArray(raw.answers)
    ? raw.answers.map(parseAnswer).filter((a): a is RawAnswer => a !== null)
    : [];
  return {
    studentUid: asString(raw.studentUid),
    answers,
    score:
      typeof raw.score === 'number' && Number.isFinite(raw.score)
        ? raw.score
        : null,
    servedQuestionIds: Array.isArray(raw.servedQuestionIds)
      ? raw.servedQuestionIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        )
      : undefined,
    classPeriod: asString(raw.classPeriod) || undefined,
    classId: asString(raw.classId) || undefined,
  };
}

/** `plcs/{plcId}.members[uid].displayName`, else ''. */
export function teacherNamesFromPlc(
  plc: Record<string, unknown> | undefined
): Map<string, string> {
  const names = new Map<string, string>();
  const members = plc?.members;
  if (typeof members !== 'object' || members === null) return names;
  for (const [uid, m] of Object.entries(members as Record<string, unknown>)) {
    if (typeof m === 'object' && m !== null) {
      names.set(uid, asString((m as Record<string, unknown>).displayName));
    }
  }
  return names;
}

async function clearDirtyIfUnchanged(
  db: Firestore,
  ref: admin.firestore.DocumentReference,
  dirtyAtRead: unknown
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current: unknown = snap.data()?.dirtyAt ?? null;
    if (current === (dirtyAtRead ?? null)) tx.update(ref, { dirtyAt: null });
  });
}

/** Recompute one assessment's aggregate; tombstoned assessments drop their aggregate instead. */
export async function recomputeOnePlcAssessment(
  db: Firestore,
  plcId: string,
  assessmentId: string
): Promise<void> {
  const plcRef = db.collection('plcs').doc(plcId);
  const assessmentRef = plcRef.collection('assessments').doc(assessmentId);
  const aggregateRef = plcRef.collection('aggregates').doc(assessmentId);

  const assessmentSnap = await assessmentRef.get();
  if (!assessmentSnap.exists) {
    await aggregateRef.delete();
    return;
  }
  const assessment = assessmentSnap.data() ?? {};
  const dirtyAtRead: unknown = assessment.dirtyAt ?? null;
  const syncGroupId = asString(assessment.syncGroupId);

  if (assessment.deletedAt != null || syncGroupId.length === 0) {
    await aggregateRef.delete();
    await clearDirtyIfUnchanged(db, assessmentRef, dirtyAtRead);
    return;
  }

  const [sessionsSnap, syncedSnap, plcSnap] = await Promise.all([
    db
      .collection('quiz_sessions')
      .where('plcId', '==', plcId)
      .where('syncGroupId', '==', syncGroupId)
      .get(),
    db.collection('synced_quizzes').doc(syncGroupId).get(),
    plcRef.get(),
  ]);
  const teacherNames = teacherNamesFromPlc(plcSnap.data());

  const sessions: SessionInput[] = [];
  for (const sessionDoc of sessionsSnap.docs) {
    const s = sessionDoc.data();
    const responsesSnap = await sessionDoc.ref
      .collection('responses')
      .where('status', '==', 'completed')
      .get();
    const teacherUid = asString(s.teacherUid);
    const assignmentId = asString(s.assignmentId) || sessionDoc.id;
    const assignmentSnap = teacherUid
      ? await db
          .collection('users')
          .doc(teacherUid)
          .collection('quiz_assignments')
          .doc(assignmentId)
          .get()
      : null;
    const assignmentData = assignmentSnap?.data() as
      | Record<string, unknown>
      | undefined;
    const questionSnapshot = assignmentData?.questionSnapshot;
    sessions.push({
      id: sessionDoc.id,
      teacherUid,
      teacherName: teacherNames.get(teacherUid) ?? '',
      publicQuestions: Array.isArray(s.publicQuestions)
        ? s.publicQuestions
        : [],
      questionSnapshot: Array.isArray(questionSnapshot) ? questionSnapshot : [],
      responses: responsesSnap.docs.map((d) =>
        parseCompletedResponse(d.data())
      ),
      scorePublishedAt:
        typeof s.scorePublishedAt === 'number' ? s.scorePublishedAt : null,
    });
  }

  const groupQuestions = resolveGroupQuestions(
    syncedSnap.exists ? (syncedSnap.data() ?? null) : null,
    sessions.flatMap((session) => session.publicQuestions),
    sessions.flatMap((session) => session.questionSnapshot ?? [])
  );
  const kind = assessment.kind === 'video-activity' ? 'video-activity' : 'quiz';
  const payload = computeAssessmentAggregate({
    assessmentId,
    title: asString(assessment.title),
    kind,
    groupQuestions,
    sessions,
  });

  await aggregateRef.set({
    ...payload,
    ranAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await clearDirtyIfUnchanged(db, assessmentRef, dirtyAtRead);
}

export interface RecomputeCounts {
  scanned: number;
  recomputed: number;
  failed: number;
}

/** Oldest-dirty-first pass over every PLC; per-item failures are logged and skipped. */
export async function runRecomputePlcAssessments(
  db: Firestore,
  { limit = RECOMPUTE_BATCH_LIMIT }: { limit?: number } = {}
): Promise<RecomputeCounts> {
  const counts: RecomputeCounts = { scanned: 0, recomputed: 0, failed: 0 };
  const dirtySnap = await db
    .collectionGroup('assessments')
    .where('dirtyAt', '!=', null)
    .orderBy('dirtyAt', 'asc')
    .limit(limit)
    .get();

  for (const doc of dirtySnap.docs) {
    counts.scanned++;
    const plcId = doc.ref.parent.parent?.id;
    if (!plcId) continue;
    try {
      await recomputeOnePlcAssessment(db, plcId, doc.id);
      counts.recomputed++;
    } catch (err) {
      counts.failed++;
      logger.error('recomputePlcAssessments: recompute failed', {
        plcId,
        assessmentId: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return counts;
}

export const recomputePlcAssessments = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const counts = await runRecomputePlcAssessments(admin.firestore());
    logger.info('recomputePlcAssessments: run complete', counts);
  }
);
