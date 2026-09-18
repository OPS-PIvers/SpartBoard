import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { STUDENT_PSEUDONYM_HMAC_SECRET } from './secrets';
import { ALLOWED_ORIGINS, computeStudentUid } from './classlinkShared';

// Projects widget group import: client posts sourcedIds, server applies the HMAC (D8).

/** D26 — the board face degrades to counts beyond this, and 32 is well past it. */
const MAX_GROUPS = 32;
const MAX_MEMBERS_PER_GROUP = 40;

interface CommitProjectGroupEntry {
  id: string;
  name: string;
  classId: string;
  order: number;
  classLinkSourcedIds: string[];
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseGroups(raw: unknown): CommitProjectGroupEntry[] {
  if (!Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'groups must be an array.');
  }
  if (raw.length === 0) {
    throw new HttpsError('invalid-argument', 'groups must not be empty.');
  }
  if (raw.length > MAX_GROUPS) {
    throw new HttpsError(
      'invalid-argument',
      `groups exceeds the max of ${MAX_GROUPS}.`
    );
  }

  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new HttpsError(
        'invalid-argument',
        `groups[${index}] is not an object.`
      );
    }
    const e = entry as Record<string, unknown>;
    const id = asString(e.id);
    const name = asString(e.name);
    const classId = asString(e.classId);
    if (!id || !name || !classId) {
      throw new HttpsError(
        'invalid-argument',
        `groups[${index}] needs id, name and classId.`
      );
    }
    const sourcedIds = Array.isArray(e.classLinkSourcedIds)
      ? e.classLinkSourcedIds.filter(
          (s): s is string => typeof s === 'string' && s.length > 0
        )
      : [];
    if (sourcedIds.length > MAX_MEMBERS_PER_GROUP) {
      throw new HttpsError(
        'invalid-argument',
        `groups[${index}] exceeds ${MAX_MEMBERS_PER_GROUP} members.`
      );
    }
    return {
      id,
      name,
      classId,
      order: typeof e.order === 'number' ? e.order : index,
      classLinkSourcedIds: Array.from(new Set(sourcedIds)),
    };
  });
}

/** Teacher-only. Writes only the groups it was handed, never deleting others (D9). */
export const commitProjectGroupsV1 = onCall(
  {
    memory: '256MiB',
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher role required.');
    }

    const rawData = (request.data ?? {}) as {
      runId?: unknown;
      groups?: unknown;
    };
    const runId = asString(rawData.runId);
    if (!runId) {
      throw new HttpsError('invalid-argument', 'runId is required.');
    }
    const groups = parseGroups(rawData.groups);

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    const db = admin.firestore();
    const runRef = db.collection('project_runs').doc(runId);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      throw new HttpsError('not-found', 'Project run not found.');
    }
    if (runSnap.data()?.teacherUid !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Not your project run.');
    }

    const stepStates: Record<string, string> = {};
    for (const step of (runSnap.data()?.steps ?? []) as { id?: unknown }[]) {
      const stepId = asString(step?.id);
      if (stepId) stepStates[stepId] = 'notStarted';
    }

    const now = Date.now();
    const existing = await db.getAll(
      ...groups.map((g) => runRef.collection('groups').doc(g.id))
    );
    const alreadyTracked = new Set(
      existing.filter((snap) => snap.exists).map((snap) => snap.id)
    );

    const batch = db.batch();
    let membersResolved = 0;

    for (const group of groups) {
      const memberUids = group.classLinkSourcedIds.map((sourcedId) =>
        computeStudentUid(sourcedId, hmacSecret)
      );
      membersResolved += memberUids.length;
      const ref = runRef.collection('groups').doc(group.id);
      if (alreadyTracked.has(group.id)) {
        // D10 — a membership edit moves who may edit, and nothing else.
        batch.update(ref, {
          name: group.name,
          classId: group.classId,
          memberUids,
          order: group.order,
          updatedAt: now,
        });
      } else {
        batch.set(ref, {
          id: group.id,
          name: group.name,
          classId: group.classId,
          memberUids,
          order: group.order,
          stepStates,
          needsSupport: false,
          workLinks: [],
          updatedAt: now,
        });
      }
    }

    const classIds = Array.from(
      new Set([
        ...((runSnap.data()?.classIds ?? []) as unknown[]).filter(
          (c): c is string => typeof c === 'string'
        ),
        ...groups.map((g) => g.classId),
      ])
    );
    batch.update(runRef, { classIds, updatedAt: now });

    await batch.commit();

    return {
      groupsWritten: groups.length,
      groupsCreated: groups.length - alreadyTracked.size,
      membersResolved,
      classIds,
    };
  }
);
