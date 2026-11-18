// onCall wrapper for saveCourseV1; the logic is in saveCourse.ts.
import { onCall } from 'firebase-functions/v2/https';
import * as admin from '../firebaseAdmin';
import '../functionsInit';
import {
  ALLOWED_ORIGINS,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from '../classlinkShared';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
} from '../secrets';
import { loadTeacherClassIds } from '../studentIdentity';
import { isTestClassAuthority } from '../studentAssignmentTargets';
import { staffEmailFromToken } from '../verifiedClassList';
import { assertViewAsAllowed } from '../viewAsGuard';
import {
  COURSE_FEATURE_ID,
  handleSaveCourse,
  newCourseId,
  type CourseDeps,
} from './saveCourse';

const liveDeps: CourseDeps = {
  now: () => Date.now(),
  newId: newCourseId,
  taughtClassIds: (email) =>
    loadTeacherClassIds(email, {
      classlinkClientId: CLASSLINK_CLIENT_ID.value(),
      classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
      tenantUrl: CLASSLINK_TENANT_URL.value(),
    }),
  isTestClassAuthority: (db, email, orgId) =>
    isTestClassAuthority(db, email, orgId),
  resolveOrgId: async (db, email) => {
    const domain = normalizeEmailDomain(email);
    return domain ? resolveOrgIdForDomain(db, domain) : null;
  },
  featureGranted: async (db, email, uid) => {
    // Lazy: quizMediaArchive pulls heavy deps this callable otherwise doesn't need.
    const { isGlobalFeatureGranted } = await import('../featureGrant');
    return isGlobalFeatureGranted(db, COURSE_FEATURE_ID, email, uid);
  },
};

// Writes what students and families see, so a View as session needs it unlocked (outward).
export const saveCourseV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
    invoker: 'public',
  },
  async (request) => {
    await assertViewAsAllowed(request, { outward: true });
    const auth = request.auth;
    return handleSaveCourse(
      admin.firestore(),
      auth
        ? {
            uid: auth.uid,
            email: staffEmailFromToken(auth.token),
            name: typeof auth.token.name === 'string' ? auth.token.name : null,
          }
        : null,
      request.data,
      liveDeps
    );
  }
);
