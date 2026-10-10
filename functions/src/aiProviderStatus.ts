import './functionsInit';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ANTHROPIC_API_KEY } from './secrets';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { resolveCallerIsAdmin } from './aiGeneration';
import { claudeConfigured } from './aiRouter';

/** Admin Settings > Access > AI: whether a real Claude key is stored (never the key itself). */
export const getAiProviderStatusV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    if (!(await resolveCallerIsAdmin(admin.firestore(), request.auth.token)))
      throw new HttpsError('permission-denied', 'Admins only.');
    return { claudeConfigured: claudeConfigured() };
  }
);
