// Marks PLC assessments dirty when linked quiz sessions or responses change (plan §5.1).
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';
import { recomputeOnePlcAssessment } from './recomputePlcAssessments';

type Firestore = admin.firestore.Firestore;

export interface LinkedSession {
  plcId: string;
  syncGroupId: string;
  quizId: string;
  quizTitle: string;
  teacherUid: string;
  status: string;
  scorePublishedAt: number | null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Session fields the triggers need; `null` when the doc is absent or not PLC-linked. */
export function parseLinkedSession(raw: unknown): LinkedSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const plcId = asString(r.plcId);
  const syncGroupId = asString(r.syncGroupId);
  if (plcId.length === 0 || syncGroupId.length === 0) return null;
  return {
    plcId,
    syncGroupId,
    quizId: asString(r.quizId),
    quizTitle: asString(r.quizTitle),
    teacherUid: asString(r.teacherUid),
    status: asString(r.status),
    scorePublishedAt:
      typeof r.scorePublishedAt === 'number' ? r.scorePublishedAt : null,
  };
}

interface LiveAssessment {
  id: string;
  dirtyAt: unknown;
}

/** Lexicographically smallest live assessment for the group, or null. */
async function findLiveAssessment(
  db: Firestore,
  plcId: string,
  syncGroupId: string
): Promise<LiveAssessment | null> {
  const snap = await db
    .collection('plcs')
    .doc(plcId)
    .collection('assessments')
    .where('syncGroupId', '==', syncGroupId)
    .get();
  const live = snap.docs
    .filter((d) => d.data().deletedAt == null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (live.length === 0) return null;
  return { id: live[0].id, dirtyAt: live[0].data().dirtyAt ?? null };
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  return (
    e?.code === 6 ||
    e?.code === 'already-exists' ||
    (typeof e?.message === 'string' && e.message.includes('ALREADY_EXISTS'))
  );
}

/** Creates `assessments/{syncGroupId}` already dirty; on a lost race returns the winner. */
async function createAssessment(
  db: Firestore,
  plcId: string,
  syncGroupId: string,
  session: LinkedSession,
  now: number
): Promise<{ id: string; created: boolean; needsDirty: boolean }> {
  const ref = db
    .collection('plcs')
    .doc(plcId)
    .collection('assessments')
    .doc(syncGroupId);
  try {
    await ref.create({
      id: syncGroupId,
      title: session.quizTitle || 'Untitled assessment',
      kind: 'quiz',
      syncGroupId,
      status: 'active',
      createdBy: session.teacherUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      sourceQuizId: session.quizId,
      dirtyAt: now,
    });
    return { id: syncGroupId, created: true, needsDirty: false };
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    const raced = await findLiveAssessment(db, plcId, syncGroupId);
    return {
      id: raced?.id ?? syncGroupId,
      created: false,
      needsDirty: !!raced && raced.dirtyAt == null,
    };
  }
}

/** Returns the assessment id for the pair, creating `assessments/{syncGroupId}` (already dirty) when none is live. */
export async function ensureAssessment(
  db: Firestore,
  plcId: string,
  syncGroupId: string,
  session: LinkedSession,
  now: number = Date.now()
): Promise<{ id: string; created: boolean }> {
  const existing = await findLiveAssessment(db, plcId, syncGroupId);
  if (existing) return { id: existing.id, created: false };
  const { id, created } = await createAssessment(
    db,
    plcId,
    syncGroupId,
    session,
    now
  );
  return { id, created };
}

async function setDirtyAt(
  db: Firestore,
  plcId: string,
  assessmentId: string,
  now: number
): Promise<void> {
  await db
    .collection('plcs')
    .doc(plcId)
    .collection('assessments')
    .doc(assessmentId)
    .update({ dirtyAt: now });
}

/** Sets `dirtyAt` only when it is currently unset so repeat writes skip the update. */
export async function markDirty(
  db: Firestore,
  plcId: string,
  syncGroupId: string,
  session: LinkedSession,
  now: number = Date.now()
): Promise<string> {
  const existing = await findLiveAssessment(db, plcId, syncGroupId);
  if (existing) {
    if (existing.dirtyAt == null) await setDirtyAt(db, plcId, existing.id, now);
    return existing.id;
  }
  const made = await createAssessment(db, plcId, syncGroupId, session, now);
  if (made.needsDirty) await setDirtyAt(db, plcId, made.id, now);
  return made.id;
}

interface Change {
  before: { exists: boolean; data: () => Record<string, unknown> | undefined };
  after: { exists: boolean; data: () => Record<string, unknown> | undefined };
}

function responseNeedsRecheck(change: Change): boolean {
  if (!change.before.exists || !change.after.exists) return true;
  const b = change.before.data() ?? {};
  const a = change.after.data() ?? {};
  if (b.status !== a.status || b.score !== a.score) return true;
  // A completed response is counted, so a rescan, regrade or manual grade must reach the PLC too.
  return (
    a.status === 'completed' &&
    (JSON.stringify(b.answers) !== JSON.stringify(a.answers) ||
      JSON.stringify(b.grading) !== JSON.stringify(a.grading))
  );
}

/** Response handler body, exported so tests can call it without the trigger wrapper. */
export async function handleResponseWrite(
  db: Firestore,
  sessionId: string,
  change: Change | undefined
): Promise<void> {
  if (!change || !responseNeedsRecheck(change)) return;
  try {
    const sessionSnap = await db
      .collection('quiz_sessions')
      .doc(sessionId)
      .get();
    const session = parseLinkedSession(sessionSnap.data());
    if (!session) return;
    await markDirty(db, session.plcId, session.syncGroupId, session);
  } catch (err) {
    logger.error('markPlcAssessmentDirty: response handler failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function pairKey(s: LinkedSession): string {
  return `${s.plcId}\0${s.syncGroupId}`;
}

/** Session handler body: dirty every affected pair; recompute now on publish, end, or link change. */
export async function handleSessionWrite(
  db: Firestore,
  sessionId: string,
  change: Change | undefined
): Promise<void> {
  if (!change) return;
  const before = change.before.exists
    ? parseLinkedSession(change.before.data())
    : null;
  const after = change.after.exists
    ? parseLinkedSession(change.after.data())
    : null;
  if (!before && !after) return;

  const beforeStatus = change.before.exists
    ? asString(change.before.data()?.status)
    : '';
  const afterStatus = change.after.exists
    ? asString(change.after.data()?.status)
    : '';
  const immediate =
    (before?.scorePublishedAt ?? null) !== (after?.scorePublishedAt ?? null) ||
    (beforeStatus !== 'ended' && afterStatus === 'ended') ||
    (before?.plcId ?? null) !== (after?.plcId ?? null);

  const pairs = new Map<string, { session: LinkedSession; create: boolean }>();
  if (before) pairs.set(pairKey(before), { session: before, create: false });
  if (after) pairs.set(pairKey(after), { session: after, create: true });

  for (const { session, create } of pairs.values()) {
    try {
      let assessmentId: string | null;
      if (create) {
        assessmentId = await markDirty(
          db,
          session.plcId,
          session.syncGroupId,
          session
        );
      } else {
        const existing = await findLiveAssessment(
          db,
          session.plcId,
          session.syncGroupId
        );
        assessmentId = existing?.id ?? null;
        if (existing && existing.dirtyAt == null) {
          await setDirtyAt(db, session.plcId, existing.id, Date.now());
        }
      }
      if (immediate && assessmentId) {
        await recomputeOnePlcAssessment(db, session.plcId, assessmentId);
      }
    } catch (err) {
      logger.error('markPlcAssessmentDirty: session handler failed', {
        sessionId,
        plcId: session.plcId,
        syncGroupId: session.syncGroupId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const markPlcAssessmentDirtyOnSession = onDocumentWritten(
  {
    document: 'quiz_sessions/{sessionId}',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    await handleSessionWrite(
      admin.firestore(),
      event.params.sessionId,
      event.data
    );
  }
);

export const markPlcAssessmentDirtyOnResponse = onDocumentWritten(
  {
    document: 'quiz_sessions/{sessionId}/responses/{responseKey}',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    await handleResponseWrite(
      admin.firestore(),
      event.params.sessionId,
      event.data
    );
  }
);
