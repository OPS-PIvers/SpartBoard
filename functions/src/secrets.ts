/**
 * Centralized Cloud Functions secret parameter definitions (F12 split).
 *
 * `defineSecret(name)` returns a param reference bound to the secret `name`.
 * Defining the same name once here and importing the reference everywhere
 * keeps the secret wiring drift-free across the modules extracted from the old
 * monolithic `index.ts`.
 */
import { defineSecret } from 'firebase-functions/params';

// NOTE: `GEMINI_API_KEY` was removed when the AI call sites moved from the
// Gemini Developer API to Vertex AI, which authenticates with Application
// Default Credentials instead of an API key. The secret itself can be deleted
// from Secret Manager once this change is deployed and verified.
export const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
export const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
export const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');
export const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);
export const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
