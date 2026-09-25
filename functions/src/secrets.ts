/**
 * Centralized Cloud Functions secret parameter definitions (F12 split).
 *
 * `defineSecret(name)` returns a param reference bound to the secret `name`.
 * Defining the same name once here and importing the reference everywhere
 * keeps the secret wiring drift-free across the modules extracted from the old
 * monolithic `index.ts`.
 */
import { defineSecret } from 'firebase-functions/params';

// Removed: AI callables moved to Vertex AI (ADC auth); the GEMINI_API_KEY secret is deleted.

export const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
export const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
export const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');
export const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);
export const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
// The other two legs of the offline-grant trio. Any function that calls
// `refreshGoogleAccessTokenForUid` must bind all three.
export const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret(
  'GOOGLE_OAUTH_CLIENT_SECRET'
);
export const GOOGLE_OAUTH_REFRESH_TOKEN_KEY = defineSecret(
  'GOOGLE_OAUTH_REFRESH_TOKEN_KEY'
);
// Live Tours v2: the anchor-mapper routine's bearer for tourAnchorApi, and the routine's own API-trigger token.
export const TOUR_ANCHOR_API_TOKEN = defineSecret('TOUR_ANCHOR_API_TOKEN');
export const CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN = defineSecret(
  'CLAUDE_TOUR_ROUTINE_TRIGGER_TOKEN'
);
