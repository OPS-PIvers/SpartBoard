/**
 * Retired `archiveActivityWallPhoto` callable. The server-driven pipeline in
 * `activityWallArchive.ts` archives every Activity Wall upload; this export
 * stays as a no-op so a stale caller gets a clean answer instead of a 404.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';
import { assertViewAsAllowed } from './viewAsGuard';

export const archiveActivityWallPhoto = onCall(
  { cors: ALLOWED_ORIGINS },
  (request) => {
    assertViewAsAllowed(request, { outward: true });
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    return { skipped: true, archiveStatus: 'retired' };
  }
);
