import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';

// Projects turn-in: any member submits for the whole group; only the teacher reopens.

export interface SubmitProjectGroupResult {
  submittedAt: number;
  late: boolean;
}

const isDocumentId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 1500 &&
  !v.includes('/') &&
  v !== '.' &&
  v !== '..' &&
  !/^__.*__$/.test(v);

export async function handleSubmitProjectGroup(
  db: Firestore,
  uid: string | null,
  data: unknown,
  now: number
): Promise<SubmitProjectGroupResult> {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const raw = (data ?? {}) as { runId?: unknown; groupId?: unknown };
  if (!isDocumentId(raw.runId) || !isDocumentId(raw.groupId)) {
    throw new HttpsError('invalid-argument', 'runId and groupId are required.');
  }
  const runRef = db.collection('project_runs').doc(raw.runId);
  const groupRef = runRef.collection('groups').doc(raw.groupId);

  return db.runTransaction(async (tx) => {
    const [runSnap, groupSnap] = await Promise.all([
      tx.get(runRef),
      tx.get(groupRef),
    ]);
    const run = runSnap.data();
    const group = groupSnap.data();
    const members: unknown = group?.memberUids;
    if (!run || !group || !Array.isArray(members) || !members.includes(uid)) {
      throw new HttpsError('permission-denied', 'Not a member of this group.');
    }
    if (typeof group.submittedAt === 'number' && group.submittedAt > 0) {
      return {
        submittedAt: group.submittedAt,
        late: group.submittedLate === true,
      };
    }
    if (run.studentSubmit !== true) {
      throw new HttpsError(
        'failed-precondition',
        'This project does not take submissions.'
      );
    }
    if (run.acceptingUpdates !== true) {
      throw new HttpsError('failed-precondition', 'This project is closed.');
    }
    const late = typeof run.dueAt === 'number' && now > run.dueAt;
    tx.update(groupRef, {
      submittedAt: now,
      submittedByUid: uid,
      submittedLate: late,
      updatedAt: now,
    });
    const eventRef = groupRef.collection('events').doc();
    tx.set(eventRef, {
      id: eventRef.id,
      at: now,
      actorUid: uid,
      actorRole: 'student',
      kind: 'submission',
      detail: late ? 'late' : 'submitted',
    });
    return { submittedAt: now, late };
  });
}

export const submitProjectGroupV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    await assertViewAsAllowed(request);
    return handleSubmitProjectGroup(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data,
      Date.now()
    );
  }
);
