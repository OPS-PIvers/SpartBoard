// OAuth 2.1 authorization server for the Claude connector (CC-D1): discovery, DCR, token, revoke.
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import '../functionsInit';
import {
  SCOPE,
  isAllowedRedirectUri,
  publicOrigin,
  resourceUrl,
} from './config';
import { pkceMatches, signClientId, verifyClientId } from './tokens';
import { consumeAuthCode } from './codes';
import {
  OAuthError,
  createGrant,
  refreshGrant,
  revokeByRefreshToken,
} from './grants';

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [publicOrigin()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'SpartBoard',
  };
}

export function authorizationServerMetadata() {
  const origin = publicOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/connect`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  };
}

type Response = Parameters<Parameters<typeof onRequest>[0]>[1];

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function sendOAuthError(
  res: Response,
  status: number,
  error: string,
  description: string
): void {
  res.status(status).set('Cache-Control', 'no-store').json({
    error,
    error_description: description,
  });
}

export async function handleRegister(
  db: admin.firestore.Firestore,
  body: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === 'string')
    : [];
  if (redirectUris.length === 0 || redirectUris.length > 5) {
    return {
      status: 400,
      json: {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris is required',
      },
    };
  }
  if (!redirectUris.every(isAllowedRedirectUri)) {
    return {
      status: 400,
      json: {
        error: 'invalid_redirect_uri',
        error_description: 'Only Claude clients can connect to SpartBoard',
      },
    };
  }
  const authMethod = str(body.token_endpoint_auth_method) || 'none';
  if (authMethod !== 'none') {
    return {
      status: 400,
      json: {
        error: 'invalid_client_metadata',
        error_description:
          'Only public clients (token_endpoint_auth_method=none) are supported',
      },
    };
  }
  const clientName = (str(body.client_name) || 'Claude').slice(0, 80);
  const clientId = await signClientId(db, { redirectUris, clientName });
  return {
    status: 201,
    json: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  };
}

export async function handleToken(
  db: admin.firestore.Firestore,
  body: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const grantType = str(body.grant_type);
  try {
    if (grantType === 'authorization_code') {
      const code = str(body.code);
      const verifier = str(body.code_verifier);
      const clientId = str(body.client_id);
      const redirectUri = str(body.redirect_uri);
      if (!code || !verifier || !clientId) {
        throw new OAuthError(
          'invalid_request',
          'code, code_verifier and client_id are required'
        );
      }
      const stored = await consumeAuthCode(db, code);
      if (!stored)
        throw new OAuthError('invalid_grant', 'Unknown or expired code');
      if (stored.clientId !== clientId) {
        throw new OAuthError(
          'invalid_grant',
          'Code was issued to another client'
        );
      }
      if (redirectUri && redirectUri !== stored.redirectUri) {
        throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
      }
      if (!pkceMatches(verifier, stored.codeChallenge)) {
        throw new OAuthError('invalid_grant', 'PKCE verification failed');
      }
      if (!(await verifyClientId(db, clientId))) {
        throw new OAuthError('invalid_grant', 'Unknown client');
      }
      const tokens = await createGrant(db, {
        uid: stored.uid,
        email: stored.email,
        clientName: stored.clientName,
        orgId: stored.orgId,
      });
      return { status: 200, json: { ...tokens } };
    }
    if (grantType === 'refresh_token') {
      const refreshToken = str(body.refresh_token);
      if (!refreshToken) {
        throw new OAuthError('invalid_request', 'refresh_token is required');
      }
      return {
        status: 200,
        json: { ...(await refreshGrant(db, refreshToken)) },
      };
    }
    return {
      status: 400,
      json: {
        error: 'unsupported_grant_type',
        error_description: 'Use authorization_code or refresh_token',
      },
    };
  } catch (err) {
    if (err instanceof OAuthError) {
      return {
        status: 400,
        json: { error: err.code, error_description: err.message },
      };
    }
    throw err;
  }
}

function applyCors(req: Request, res: Response): boolean {
  res.set('Access-Control-Allow-Origin', '*');
  res.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, MCP-Protocol-Version'
  );
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

export const mcpOAuth = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 5,
    invoker: 'public',
  },
  async (req, res) => {
    if (applyCors(req, res)) return;
    const db = admin.firestore();
    const path = req.path.replace(/\/+$/, '');
    try {
      if (
        req.method === 'GET' &&
        (path === '/.well-known/oauth-protected-resource' ||
          path === '/.well-known/oauth-protected-resource/mcp')
      ) {
        res
          .set('Cache-Control', 'public, max-age=3600')
          .json(protectedResourceMetadata());
        return;
      }
      if (
        req.method === 'GET' &&
        (path === '/.well-known/oauth-authorization-server' ||
          path === '/.well-known/oauth-authorization-server/mcp')
      ) {
        res
          .set('Cache-Control', 'public, max-age=3600')
          .json(authorizationServerMetadata());
        return;
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (path === '/oauth/register') {
        const out = await handleRegister(db, body);
        res.status(out.status).set('Cache-Control', 'no-store').json(out.json);
        return;
      }
      if (path === '/oauth/token') {
        const out = await handleToken(db, body);
        res.status(out.status).set('Cache-Control', 'no-store').json(out.json);
        return;
      }
      if (path === '/oauth/revoke') {
        await revokeByRefreshToken(db, str(body.token));
        res.status(200).set('Cache-Control', 'no-store').json({});
        return;
      }
      res.status(404).json({ error: 'not_found' });
    } catch (err) {
      console.error('[mcpOAuth] failed', { path, err });
      sendOAuthError(res, 500, 'server_error', 'Something went wrong');
    }
  }
);
