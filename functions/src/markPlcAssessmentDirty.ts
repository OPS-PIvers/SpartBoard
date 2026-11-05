// Marks PLC assessments dirty when linked quiz or Flashcards check sessions or their submissions change (plan §5.1).
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { activePlcMemberUids } from './plcActiveMembers';
import { recomputeOnePlcAssessment } from './recomputePlcAssessments';

type Firestore = admin.firestore.Firestore;

export interface LinkedSession {
  kind: 'quiz' | 'flashcard-check';
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
    kind: 'quiz',
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

/** A Flashcards check session's link fields; study sessions never reach a PLC. */
export function parseLinkedFlashcardSession(
  raw: unknown
): LinkedSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const plcId = asString(r.plcId);
  const syncGroupId = asString(r.syncGroupId);
  if (plcId.length === 0 || syncGroupId.length === 0 || r.kind !== 'check')
    return null;
  return {
    kind: 'flashcard-check',
    plcId,
    syncGroupId,
    quizId: asString(r.setId),
    quizTitle: asString(r.title),
    teacherUid: asString(r.teacherUid),
    status: asString(r.status),
    scorePublishedAt: null,
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

/** Creates `assessments/{syncGroupId}` already dirty (the winner on a lost race); null if the owner isn't an active member. */
async function createAssessment(
  db: Firestore,
  plcId: string,
  syncGroupId: string,
  session: LinkedSession,
  now: number
): Promise<{ id: string; created: boolean; needsDirty: boolean } | null> {
  const plcSnap = await db.collection('plcs').doc(plcId).get();
  if (!activePlcMemberUids(plcSnap.data()).has(session.teacherUid)) return null;
  const ref = db
    .collection('plcs')
    .doc(plcId)
    .collection('assessments')
    .doc(syncGroupId);
  try {
    await ref.create({
      id: syncGroupId,
      title: session.quizTitle || 'Untitled assessment',
      kind: session.kind,
      syncGroupId,
      status: 'active',
      createdBy: session.teacherUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(session.kind === 'quiz' ? { sourceQuizId: session.quizId } : {}),
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

/** Returns the assessment id for the pair, creating it dirty when none is live; null if the owner isn't an active member. */
export async function ensureAssessment(
  db: Firestore,
  plcId: string,
  syncGroupId: string,
  session: LinkedSession,
  now: number = Date.now()
): Promise<{ id: string; created: boolean } | null> {
  const existing = await findLiveAssessment(db, plcId, syncGroupId);
  if (existing) return { id: existing.id, created: false };
  const made = await createAssessment(db, plcId, syncGroupId, session, now);
  return made && { id: made.id, created: made.created };
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
): Promise<string | null> {
  const existing = await findLiveAssessment(db, plcId, syncGroupId);
  if (existing) {
    if (existing.dirtyAt == null) await setDirtyAt(db, plcId, existing.id, now);
    return existing.id;
  }
  const made = await createAssessment(db, plcId, syncGroupId, session, now);
  if (!made) return null;
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

function flashcardSubmissionChanged(change: Change): boolean {
  const b = change.before.exists ? (change.before.data() ?? {}) : {};
  const a = change.after.exists ? (change.after.data() ?? {}) : {};
  // Study writes never touch these, so most progress writes stop here with no reads.
  return (
    (b.submittedAt ?? null) !== (a.submittedAt ?? null) ||
    (b.score ?? null) !== (a.score ?? null) ||
    (b.submittedAt != null &&
      JSON.stringify(b.answerLog) !== JSON.stringify(a.answerLog))
  );
}

/** Progress handler body: a submit, a regrade or a reset dirties the linked assessment. */
export async function handleFlashcardProgressWrite(
  db: Firestore,
  sessionId: string,
  change: Change | undefined
): Promise<void> {
  if (!change || !flashcardSubmissionChanged(change)) return;
  try {
    const sessionSnap = await db
      .collection('flashcard_sessions')
      .doc(sessionId)
      .get();
    const session = parseLinkedFlashcardSession(sessionSnap.data());
    if (!session) return;
    await markDirty(db, session.plcId, session.syncGroupId, session);
  } catch (err) {
    logger.error('markPlcAssessmentDirty: flashcard progress handler failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Set handler body: new set tags dirty every PLC result the set's checks feed, so standards catch up. */
export async function handleFlashcardSetWrite(
  db: Firestore,
  uid: string,
  setId: string,
  change: Change | undefined
): Promise<void> {
  if (!change) return;
  const before = change.before.exists ? change.before.data()?.targets : null;
  const after = change.after.exists ? change.after.data()?.targets : null;
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return;
  try {
    const sessionsSnap = await db
      .collection('flashcard_sessions')
      .where('teacherUid', '==', uid)
      .where('setId', '==', setId)
      .get();
    const seen = new Set<string>();
    for (const doc of sessionsSnap.docs) {
      const session = parseLinkedFlashcardSession(doc.data());
      if (!session || seen.has(pairKey(session))) continue;
      seen.add(pairKey(session));
      await markDirty(db, session.plcId, session.syncGroupId, session);
    }
  } catch (err) {
    logger.error('markPlcAssessmentDirty: flashcard set handler failed', {
      uid,
      setId,
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
  change: Change | undefined,
  parse: (raw: unknown) => LinkedSession | null = parseLinkedSession
): Promise<void> {
  if (!change) return;
  const before = change.before.exists ? parse(change.before.data()) : null;
  const after = change.after.exists ? parse(change.after.data()) : null;
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

export const markPlcAssessmentDirtyOnFlashcardSession = onDocumentWritten(
  {
    document: 'flashcard_sessions/{sessionId}',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    await handleSessionWrite(
      admin.firestore(),
      event.params.sessionId,
      event.data,
      parseLinkedFlashcardSession
    );
  }
);

export const markPlcAssessmentDirtyOnFlashcardProgress = onDocumentWritten(
  {
    document: 'flashcard_sessions/{sessionId}/progress/{studentUid}',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    await handleFlashcardProgressWrite(
      admin.firestore(),
      event.params.sessionId,
      event.data
    );
  }
);

export const markPlcAssessmentDirtyOnFlashcardSet = onDocumentWritten(
  {
    document: 'users/{uid}/flashcard_sets/{setId}',
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    await handleFlashcardSetWrite(
      admin.firestore(),
      event.params.uid,
      event.params.setId,
      event.data
    );
  }
);
