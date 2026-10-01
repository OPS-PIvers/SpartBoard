// Drive access token for a super admin "View as" tab (docs/plans/ADMIN_VIEW_AS.md D5).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
  refreshGoogleAccessTokenForUid,
} from './googleOAuth';
import {
  VIEW_AS_SESSIONS,
  assertEnabled,
  assertStrictSuperAdmin,
  readSession,
} from './viewAs';
import { assertViewAsAllowed } from './viewAsGuard';

export type ViewAsDriveTokenResponse =
  | { available: true; accessToken: string; expiresIn: number }
  | { available: false };

function sessionEnded(): HttpsError {
  return new HttpsError('permission-denied', 'This View as session has ended.');
}

function isNeedsConsent(err: unknown): boolean {
  if (!(err instanceof HttpsError)) return false;
  const details = err.details as { reason?: unknown } | undefined;
  return details?.reason === 'needs-consent';
}

export const getViewAsDriveTokenV1 = onCall(
  {
    cors: ALLOWED_ORIGINS,
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (request): Promise<ViewAsDriveTokenResponse> => {
    const claim = assertViewAsAllowed(request, { read: true });
    const uid = request.auth?.uid;
    if (!claim || !uid) {
      throw new HttpsError(
        'permission-denied',
        'Only a View as tab can do this.'
      );
    }
    const db = admin.firestore();
    const session = readSession(
      await db.collection(VIEW_AS_SESSIONS).doc(claim.sid).get()
    );
    if (
      !session ||
      session.ended ||
      session.by !== claim.by ||
      session.targetUid !== uid ||
      Date.now() >= session.expiresAtMs
    ) {
      throw sessionEnded();
    }
    await assertEnabled(db);
    await assertStrictSuperAdmin(db, claim.by);

    try {
      const token = await refreshGoogleAccessTokenForUid(uid, {
        keepStoredOnFailure: true,
      });
      console.info('[viewAsDrive] token issued', {
        sid: claim.sid,
        by: claim.by,
        targetUid: uid,
      });
      return { available: true, ...token };
    } catch (err) {
      if (isNeedsConsent(err)) return { available: false };
      throw err;
    }
  }
);
