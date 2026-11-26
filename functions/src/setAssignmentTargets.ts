import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios from 'axios';
import * as admin from './firebaseAdmin';
import './functionsInit';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from './secrets';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import { isGlobalFeatureGranted } from './featureGrant';
import {
  handleSetAssignmentTargets,
  loadTargetDirectory,
  parseSetAssignmentTargetsInput,
  type TargetAuthorizationContext,
} from './studentAssignmentTargets';

// The callable lives apart from the helpers so their many importers don't depend on quiz read aloud.
export const setAssignmentTargetsV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
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
    await assertViewAsAllowed(request, { outward: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const teacherEmail = request.auth.token.email;
    // Students share the staff domain; the ClassLink staff-role lookup below is what keeps them out.
    if (!teacherEmail || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    // teacherEmail drives org/test-class resolution below, so it must be verified (same rail as isAdmin()).
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        'permission-denied',
        'Caller email must be verified.'
      );
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    const { input, skipped } = parseSetAssignmentTargetsInput(request.data);
    const db = admin.firestore();
    const callerUid = request.auth.uid;

    const loadContext = async (): Promise<TargetAuthorizationContext> =>
      (
        await loadTargetDirectory(
          db,
          callerUid,
          teacherEmail,
          { classlinkClientId, classlinkClientSecret, tenantUrl },
          (err) => {
            if (axios.isAxiosError(err)) {
              console.error(
                '[setAssignmentTargetsV1] ClassLink request failed:',
                err.response?.status
              );
            } else {
              console.error(
                '[setAssignmentTargetsV1] ClassLink lookup failed.'
              );
            }
            throw new HttpsError('internal', 'Roster service unavailable.');
          }
        )
      ).ctx;

    const studentWindows = await isGlobalFeatureGranted(
      db,
      'student-windows',
      teacherEmail,
      callerUid
    ).catch(() => false);

    return handleSetAssignmentTargets(
      db,
      callerUid,
      hmacSecret,
      input,
      loadContext,
      skipped,
      // Lazy so the TTS client loads only on the quiz read-aloud path.
      async (sessionId, translationLocales) => {
        const { prepareReadAloudAfterTargets } =
          await import('./quizReadAloud');
        await prepareReadAloudAfterTargets(
          sessionId,
          callerUid,
          translationLocales
        );
      },
      { studentWindows }
    );
  }
);
