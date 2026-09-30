// Gradebook D8: map each student on a teacher's ClassLink or test-class roster to their stable uid.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import '../functionsInit';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from '../secrets';
import { ALLOWED_ORIGINS, computeStudentUid } from '../classlinkShared';
import {
  loadClassLinkMembership,
  loadTestClassMembership,
} from '../studentAssignmentTargets';

export type GradebookRosterSource = 'classlink' | 'test';

export interface GradebookRosterEntry {
  /** `classlink:{sourcedId}` or `test:{emailLower}`, the `studentTargetRefKey` format. */
  refKey: string;
  studentUid: string;
}

export interface GradebookRosterResult {
  rosterId: string;
  source: GradebookRosterSource;
  classId: string;
  students: GradebookRosterEntry[];
}

/** Membership loaders, injected so the handler is testable without ClassLink. */
export interface GradebookRosterLoaders {
  classlink: (classId: string) => Promise<Map<string, string>>;
  test: (testClassId: string) => Promise<{
    membership: Map<string, string>;
    authorized: boolean;
  }>;
}

const MAX_ID_LENGTH = 200;

function nonEmptyString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function parseRosterId(data: unknown): string {
  const rosterId = nonEmptyString(
    (data as { rosterId?: unknown } | null)?.rosterId
  );
  if (!rosterId || rosterId.length > MAX_ID_LENGTH || rosterId.includes('/')) {
    throw new HttpsError('invalid-argument', 'rosterId is required.');
  }
  return rosterId;
}

export async function handleGetGradebookRoster(
  db: admin.firestore.Firestore,
  callerUid: string,
  rosterId: string,
  hmacSecret: string,
  loaders: GradebookRosterLoaders
): Promise<GradebookRosterResult> {
  const snap = await db.doc(`users/${callerUid}/rosters/${rosterId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Roster not found.');
  }
  const classlinkClassId = nonEmptyString(snap.get('classlinkClassId'));
  const testClassId = nonEmptyString(snap.get('testClassId'));

  // Roster docs are client-writable; the loaders return nothing for a class the caller does not teach.
  if (classlinkClassId) {
    const membership = await loaders.classlink(classlinkClassId);
    const students: GradebookRosterEntry[] = [];
    for (const [sourcedId, classId] of membership) {
      if (classId !== classlinkClassId) continue;
      students.push({
        refKey: `classlink:${sourcedId}`,
        studentUid: computeStudentUid(sourcedId, hmacSecret),
      });
    }
    return {
      rosterId,
      source: 'classlink',
      classId: classlinkClassId,
      students,
    };
  }

  if (testClassId) {
    const { membership, authorized } = await loaders.test(testClassId);
    if (!authorized) {
      throw new HttpsError(
        'permission-denied',
        'Not authorized for this test class.'
      );
    }
    const students: GradebookRosterEntry[] = [];
    for (const [emailLower, classId] of membership) {
      if (classId !== testClassId) continue;
      students.push({
        refKey: `test:${emailLower}`,
        studentUid: computeStudentUid(`test:${emailLower}`, hmacSecret),
      });
    }
    return { rosterId, source: 'test', classId: testClassId, students };
  }

  // D8: local rosters have no stable uid and stay out of the gradebook.
  throw new HttpsError(
    'failed-precondition',
    'Only ClassLink and test-class rosters can open in the gradebook.'
  );
}

export const getGradebookRosterV1 = onCall(
  {
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
    ],
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const teacherEmail = request.auth.token.email;
    if (!teacherEmail || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        'permission-denied',
        'Caller email must be verified.'
      );
    }
    const rosterId = parseRosterId(request.data);

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();

    const db = admin.firestore();
    return handleGetGradebookRoster(
      db,
      request.auth.uid,
      rosterId,
      hmacSecret,
      {
        classlink: async (classId) => {
          if (!classlinkClientId || !classlinkClientSecret || !tenantUrl) {
            throw new HttpsError('internal', 'Server configuration missing.');
          }
          try {
            return await loadClassLinkMembership(
              teacherEmail,
              [classId],
              classlinkClientId,
              classlinkClientSecret,
              tenantUrl
            );
          } catch (err) {
            if (err instanceof HttpsError) throw err;
            console.error(
              '[getGradebookRosterV1] ClassLink request failed:',
              axios.isAxiosError(err) ? err.response?.status : 'unexpected'
            );
            throw new HttpsError('internal', 'Roster service unavailable.');
          }
        },
        test: (testClassId) =>
          loadTestClassMembership(db, teacherEmail, [testClassId]),
      }
    );
  }
);
