// Which student uids a teacher may grade in a project class: ClassLink must confirm they teach it (or they run the test class).
import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from '../firebaseAdmin';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from '../secrets';
import { computeStudentUid } from '../classlinkShared';
import { loadTaughtClassEnrollment } from '../studentIdentity';
import {
  loadTargetDirectory,
  loadTestClassMembership,
} from '../studentAssignmentTargets';

/** Pseudonym uids of every student in `classId`, or empty when `ownerUid` does not teach it. A missing or `local:` class id means any class the owner teaches. */
export async function loadClassStudentUids(
  db: admin.firestore.Firestore,
  ownerUid: string,
  classId: string
): Promise<Set<string>> {
  const uids = new Set<string>();
  if (!ownerUid) return uids;
  const anyClass = !classId || classId.startsWith('local:');
  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  if (!hmacSecret) {
    throw new HttpsError('internal', 'Server configuration missing.');
  }
  const owner = await admin
    .auth()
    .getUser(ownerUid)
    .catch((err: unknown) => {
      if ((err as { code?: string })?.code === 'auth/user-not-found')
        return null;
      throw err;
    });
  if (!owner?.email || !owner.emailVerified) return uids;

  const creds = {
    classlinkClientId: CLASSLINK_CLIENT_ID.value(),
    classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
    tenantUrl: CLASSLINK_TENANT_URL.value(),
  };
  if (anyClass) {
    const { ctx } = await loadTargetDirectory(
      db,
      ownerUid,
      owner.email,
      creds,
      (err) => {
        throw err;
      }
    );
    for (const sourcedId of ctx.classIdBySourcedId.keys())
      uids.add(computeStudentUid(sourcedId, hmacSecret));
    if (ctx.testClassAuthorized)
      for (const email of ctx.classIdByTestEmail.keys())
        uids.add(computeStudentUid(`test:${email}`, hmacSecret));
    return uids;
  }
  if (
    creds.classlinkClientId &&
    creds.classlinkClientSecret &&
    creds.tenantUrl
  ) {
    const enrolled = await loadTaughtClassEnrollment(
      owner.email,
      classId,
      creds
    );
    if (enrolled) {
      for (const sourcedId of enrolled)
        uids.add(computeStudentUid(sourcedId, hmacSecret));
      return uids;
    }
  }

  const { membership, authorized } = await loadTestClassMembership(
    db,
    owner.email,
    [classId]
  );
  if (!authorized) return uids;
  for (const [email, memberClassId] of membership) {
    if (memberClassId === classId)
      uids.add(computeStudentUid(`test:${email}`, hmacSecret));
  }
  return uids;
}
