import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { STUDENT_PSEUDONYM_HMAC_SECRET } from './secrets';
import {
  ALLOWED_ORIGINS,
  computeStudentUid,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from './classlinkShared';
import { isTestClassAuthority } from './studentAssignmentTargets';

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
  testEmails: string[];
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A Firestore document id, so a crafted one is rejected rather than thrown on. */
const isDocumentId = (v: string): boolean =>
  v.length > 0 &&
  v.length <= 1500 &&
  !v.includes('/') &&
  v !== '.' &&
  v !== '..' &&
  !/^__.*__$/.test(v);

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
    if (!isDocumentId(id)) {
      throw new HttpsError(
        'invalid-argument',
        `groups[${index}] has an id that is not a document id.`
      );
    }
    const sourcedIds = Array.isArray(e.classLinkSourcedIds)
      ? e.classLinkSourcedIds.filter(
          (s): s is string => typeof s === 'string' && s.length > 0
        )
      : [];
    const testEmails = Array.isArray(e.testEmails)
      ? e.testEmails
          .filter(
            (s): s is string =>
              typeof s === 'string' && s.includes('@') && s.length <= 320
          )
          .map((s) => s.trim().toLowerCase())
      : [];
    if (sourcedIds.length + testEmails.length > MAX_MEMBERS_PER_GROUP) {
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
      testEmails: Array.from(new Set(testEmails)),
    };
  });
}

/**
 * Test-class emails the caller may place, keyed by test class id. Same gate as
 * assignment targeting: roster docs are client-writable, so a forged
 * `testClassId` must not reach test students the caller does not administer.
 */
async function allowedTestEmails(
  db: admin.firestore.Firestore,
  callerEmail: string,
  groups: CommitProjectGroupEntry[]
): Promise<Map<string, Set<string>>> {
  const allowed = new Map<string, Set<string>>();
  const classIds = Array.from(
    new Set(groups.filter((g) => g.testEmails.length > 0).map((g) => g.classId))
  ).filter(isDocumentId);
  if (classIds.length === 0 || !callerEmail) return allowed;
  const domain = normalizeEmailDomain(callerEmail);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (!orgId || !(await isTestClassAuthority(db, callerEmail, orgId))) {
    return allowed;
  }
  const snaps = await Promise.all(
    classIds.map((id) =>
      db.doc(`organizations/${orgId}/testClasses/${id}`).get()
    )
  );
  snaps.forEach((snap, i) => {
    const members: unknown = snap.exists ? snap.get('memberEmails') : null;
    if (!Array.isArray(members)) return;
    allowed.set(
      classIds[i],
      new Set(
        members
          .filter((m): m is string => typeof m === 'string')
          .map((m) => m.toLowerCase())
      )
    );
  });
  return allowed;
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
    if (!isDocumentId(runId)) {
      throw new HttpsError('invalid-argument', 'runId is not a document id.');
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

    const testMembers = await allowedTestEmails(
      db,
      asString(request.auth.token.email).toLowerCase(),
      groups
    );

    const batch = db.batch();
    let membersResolved = 0;

    for (const group of groups) {
      const inTestClass = testMembers.get(group.classId);
      const memberUids = [
        ...group.classLinkSourcedIds.map((sourcedId) =>
          computeStudentUid(sourcedId, hmacSecret)
        ),
        // Matches the uid studentLoginV1 mints for a test-class sign-in.
        ...group.testEmails
          .filter((email) => inTestClass?.has(email))
          .map((email) => computeStudentUid(`test:${email}`, hmacSecret)),
      ];
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
