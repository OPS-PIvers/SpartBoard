// Callables behind the /connect consent page and the Connected apps Disconnect button (CC-D1, CC-D10).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import '../functionsInit';
import { resourceUrl, publicOrigin } from './config';
import { verifyClientId } from './tokens';
import { checkEligibility } from './eligibility';
import { mintAuthCode } from './codes';
import { grantRef } from './grants';
import { assertViewAsAllowed } from '../viewAsGuard';

export interface AuthorizeRequest {
  clientId?: unknown;
  redirectUri?: unknown;
  codeChallenge?: unknown;
  codeChallengeMethod?: unknown;
  state?: unknown;
  resource?: unknown;
  decision?: unknown;
}

export type AuthorizeResponse =
  | {
      decision: 'preview';
      clientName: string;
      email: string;
      eligible: boolean;
      reason: 'not-member' | 'feature-off' | null;
    }
  | { decision: 'approve' | 'deny'; redirectTo: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function authorize(
  db: admin.firestore.Firestore,
  caller: { uid: string; token: Record<string, unknown> } | undefined,
  data: AuthorizeRequest
): Promise<AuthorizeResponse> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  const email = str(caller.token.email).toLowerCase();
  if (!email || caller.token.email_verified !== true) {
    throw new HttpsError(
      'permission-denied',
      'A verified Google account is required.'
    );
  }
  if (caller.token.studentRole === true) {
    throw new HttpsError(
      'permission-denied',
      'Student accounts cannot connect Claude.'
    );
  }

  const clientId = str(data.clientId);
  const redirectUri = str(data.redirectUri);
  const client = clientId ? await verifyClientId(db, clientId) : null;
  // Never redirect to a URI the client did not register: that would be an open redirect.
  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new HttpsError(
      'invalid-argument',
      'This connection link is not valid. Start again from Claude.'
    );
  }
  const codeChallenge = str(data.codeChallenge);
  if (
    str(data.codeChallengeMethod) !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'This connection link is missing PKCE. Start again from Claude.'
    );
  }
  const resource = str(data.resource);
  if (resource && resource.replace(/\/+$/, '') !== resourceUrl()) {
    throw new HttpsError(
      'invalid-argument',
      'This connection link is for a different server.'
    );
  }
  const state = str(data.state);
  const decision = str(data.decision);

  if (decision === 'deny') {
    return {
      decision: 'deny',
      redirectTo: withParams(redirectUri, {
        error: 'access_denied',
        state,
        iss: publicOrigin(),
      }),
    };
  }

  const eligibility = await checkEligibility(db, caller.uid, email);
  if (decision === 'preview') {
    return {
      decision: 'preview',
      clientName: client.clientName,
      email,
      eligible: eligibility.ok,
      reason: eligibility.reason ?? null,
    };
  }
  if (decision !== 'approve') {
    throw new HttpsError('invalid-argument', 'Unknown decision.');
  }
  if (!eligibility.ok) {
    throw new HttpsError(
      'permission-denied',
      'Your account cannot connect Claude yet.'
    );
  }
  const code = await mintAuthCode(db, {
    uid: caller.uid,
    email,
    orgId: eligibility.orgId ?? null,
    clientId,
    clientName: client.clientName,
    redirectUri,
    codeChallenge,
  });
  return {
    decision: 'approve',
    redirectTo: withParams(redirectUri, { code, state, iss: publicOrigin() }),
  };
}

export const mcpAuthorizeV1 = onCall<AuthorizeRequest>(
  { maxInstances: 5 },
  async (request): Promise<AuthorizeResponse> => {
    assertViewAsAllowed(request, { outward: true });
    return authorize(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            token: request.auth.token as Record<string, unknown>,
          }
        : undefined,
      request.data ?? {}
    );
  }
);

export const revokeMcpGrantV1 = onCall<{ grantId?: unknown }>(
  { maxInstances: 5 },
  async (request): Promise<{ revoked: boolean }> => {
    assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const grantId = str(request.data?.grantId);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(grantId)) {
      throw new HttpsError('invalid-argument', 'grantId is required.');
    }
    const ref = grantRef(admin.firestore(), request.auth.uid, grantId);
    const snap = await ref.get();
    if (!snap.exists) return { revoked: false };
    if (snap.get('revokedAt') == null)
      await ref.update({ revokedAt: Date.now() });
    return { revoked: true };
  }
);
