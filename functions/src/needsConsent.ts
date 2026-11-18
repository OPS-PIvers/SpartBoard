import { HttpsError } from 'firebase-functions/v2/https';

/** A missing or revoked Drive grant, as `refreshGoogleAccessTokenForUid` reports it. */
export function isNeedsConsentError(error: unknown): boolean {
  if (error instanceof HttpsError) {
    const details = error.details as { reason?: unknown } | undefined;
    if (details?.reason === 'needs-consent') return true;
  }
  return error instanceof Error && error.message.startsWith('needs-consent');
}
