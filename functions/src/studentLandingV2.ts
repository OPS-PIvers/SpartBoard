import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { chunk } from './shared';
import { assertViewAsAllowed } from './viewAsGuard';

const FEATURE_ID = 'student-landing-v2';
const CLASS_IDS_MAX = 20;
const OWNERS_MAX = 20;

interface LandingPermission {
  enabled?: boolean;
  accessLevel?: string;
  betaUsers?: unknown;
  buildings?: unknown;
  minTier?: unknown;
}

/** Public with no building or tier limit opens it to every student; otherwise a student gets it when their teacher passes the flag's gate. */
export const studentLandingV2Scope = (
  perm: LandingPermission | undefined
): 'off' | 'everyone' | 'teachers' => {
  if (!perm || perm.enabled !== true) return 'off';
  const limited =
    (Array.isArray(perm.buildings) && perm.buildings.length > 0) ||
    (perm.minTier !== undefined && perm.minTier !== null);
  return perm.accessLevel === 'public' && !limited ? 'everyone' : 'teachers';
};

/**
 * getStudentLandingV2V1
 *
 * Tells a student's client whether to show the redesigned landing page
 * (docs/plans/STUDENT_LANDING_V2.md D26). Returns only a boolean: teacher
 * emails never leave the server.
 */
export const getStudentLandingV2V1 = onCall(
  { memory: '256MiB', invoker: 'public', cors: ALLOWED_ORIGINS },
  async (request) => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.studentRole !== true) {
      throw new HttpsError('permission-denied', 'Student role required.');
    }
    const rawClassIds: unknown = request.auth.token.classIds;
    const classIds = Array.isArray(rawClassIds)
      ? rawClassIds
          .filter((c): c is string => typeof c === 'string' && c.length > 0)
          .slice(0, CLASS_IDS_MAX)
      : [];

    const db = admin.firestore();
    const snap = await db.doc(`global_permissions/${FEATURE_ID}`).get();
    const perm = snap.data() as LandingPermission | undefined;
    const scope = studentLandingV2Scope(perm);
    if (scope === 'off') return { enabled: false };
    if (scope === 'everyone') return { enabled: true };
    if (classIds.length === 0) return { enabled: false };

    const rosterSnaps = await Promise.all(
      chunk(classIds, 10).map((ids) =>
        db.collectionGroup('rosters').where('classlinkClassId', 'in', ids).get()
      )
    );
    const owners = new Set<string>();
    for (const rs of rosterSnaps) {
      for (const doc of rs.docs) {
        const uid = doc.ref.parent.parent?.id;
        if (uid) owners.add(uid);
      }
    }

    const passes = await Promise.all(
      [...owners].slice(0, OWNERS_MAX).map(async (uid) => {
        try {
          const user = await admin.auth().getUser(uid);
          if (!user.emailVerified || !user.email) return false;
          return await isGlobalFeatureGranted(db, FEATURE_ID, user.email, uid);
        } catch {
          return false;
        }
      })
    );
    if (passes.some(Boolean)) return { enabled: true };
    return { enabled: false };
  }
);
