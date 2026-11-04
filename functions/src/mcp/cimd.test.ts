import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import type * as admin from '../firebaseAdmin';
import { makeStubFirestore } from '../testing/stubFirestore';
import { redirectUriMatches } from './config';
import {
  fetchCimdClient,
  isCimdClientId,
  parseCimdDocument,
  resetCimdCache,
} from './cimd';
import {
  resetSigningKeyCache,
  verifyAccessToken,
  verifyClientId,
} from './tokens';
import { authorizationServerMetadata, handleToken } from './oauthEndpoints';
import { authorize } from './authorizeCallables';

type Firestore = admin.firestore.Firestore;

const CODE_ID = 'https://claude.ai/oauth/claude-code-client-metadata';
const CODE_DOC = {
  client_id: CODE_ID,
  client_name: 'Claude Code',
  redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
};
const TEACHER = 'teacher@orono.k12.mn.us';

const seed = (cimdOn: boolean) =>
  makeStubFirestore({
    'organizations/orono/domains/d1': {
      domain: '@orono.k12.mn.us',
      status: 'verified',
    },
    [`organizations/orono/members/${TEACHER}`]: { status: 'active' },
    'global_permissions/claude-connector': {
      enabled: true,
      accessLevel: 'public',
    },
    ...(cimdOn
      ? { 'admin_settings/claude_connector_cimd': { enabled: true } }
      : {}),
  }).db as unknown as Firestore;

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  resetCimdCache();
  resetSigningKeyCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('isCimdClientId', () => {
  it('accepts only https documents on Claude hosts', () => {
    expect(isCimdClientId(CODE_ID)).toBe(true);
    expect(isCimdClientId('https://claude.com/oauth/x')).toBe(true);
    expect(isCimdClientId('https://evil.example/oauth/x')).toBe(false);
    expect(isCimdClientId('https://claude.ai.evil.com/x')).toBe(false);
    expect(isCimdClientId('http://claude.ai/oauth/x')).toBe(false);
    expect(isCimdClientId('https://claude.ai/')).toBe(false);
    expect(isCimdClientId('https://claude.ai/x?a=1')).toBe(false);
    expect(isCimdClientId('https://claude.ai:8443/x')).toBe(false);
    expect(isCimdClientId('https://user@claude.ai/x')).toBe(false);
    expect(isCimdClientId('eyJhbGciOiJIUzI1NiJ9.e30.sig')).toBe(false);
  });
});

describe('parseCimdDocument', () => {
  it('requires the document to name itself and be a public client', () => {
    expect(parseCimdDocument(CODE_ID, CODE_DOC)).toEqual({
      clientName: 'Claude Code',
      redirectUris: CODE_DOC.redirect_uris,
    });
    expect(
      parseCimdDocument(CODE_ID, {
        ...CODE_DOC,
        client_id: 'https://claude.ai/other',
      })
    ).toBeNull();
    expect(
      parseCimdDocument(CODE_ID, {
        ...CODE_DOC,
        token_endpoint_auth_method: 'client_secret_basic',
      })
    ).toBeNull();
    expect(parseCimdDocument(CODE_ID, [CODE_DOC])).toBeNull();
  });

  it('drops redirect URIs outside the Claude allowlist', () => {
    expect(
      parseCimdDocument(CODE_ID, {
        ...CODE_DOC,
        redirect_uris: ['https://evil.example/cb'],
      })
    ).toBeNull();
    expect(
      parseCimdDocument(CODE_ID, {
        ...CODE_DOC,
        redirect_uris: [
          'https://evil.example/cb',
          'https://claude.ai/api/mcp/auth_callback',
        ],
      })?.redirectUris
    ).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });
});

describe('redirectUriMatches', () => {
  const reg = ['http://localhost/callback', 'http://127.0.0.1/callback'];
  it('ignores the port only on loopback', () => {
    expect(redirectUriMatches(reg, 'http://localhost:3118/callback')).toBe(
      true
    );
    expect(redirectUriMatches(reg, 'http://127.0.0.1:9/callback')).toBe(true);
    expect(redirectUriMatches(reg, 'http://localhost:3118/other')).toBe(false);
    expect(redirectUriMatches(reg, 'http://127.0.0.1:9/callback?x=1')).toBe(
      false
    );
    expect(redirectUriMatches(reg, 'https://localhost:3118/callback')).toBe(
      false
    );
    expect(redirectUriMatches(reg, 'http://evil.example/callback')).toBe(false);
    const hosted = ['https://claude.ai/api/mcp/auth_callback'];
    expect(
      redirectUriMatches(hosted, 'https://claude.ai/api/mcp/auth_callback')
    ).toBe(true);
    expect(
      redirectUriMatches(hosted, 'https://claude.ai:444/api/mcp/auth_callback')
    ).toBe(false);
  });
});

describe('fetchCimdClient', () => {
  it('refuses redirects and oversized or failed responses', async () => {
    const fn = mockFetch(CODE_DOC, 404);
    expect(await fetchCimdClient(CODE_ID)).toBeNull();
    expect(fn).toHaveBeenCalledWith(
      CODE_ID,
      expect.objectContaining({ redirect: 'error' })
    );
    mockFetch({ ...CODE_DOC, pad: 'x'.repeat(20_000) });
    expect(await fetchCimdClient(CODE_ID)).toBeNull();
  });

  it('caches a good document', async () => {
    const fn = mockFetch(CODE_DOC);
    expect(await fetchCimdClient(CODE_ID)).not.toBeNull();
    expect(await fetchCimdClient(CODE_ID)).not.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('CIMD behind the switch', () => {
  it('is not advertised or accepted while the switch is off', async () => {
    const fn = mockFetch(CODE_DOC);
    expect(
      authorizationServerMetadata(false).client_id_metadata_document_supported
    ).toBeUndefined();
    expect(await verifyClientId(seed(false), CODE_ID)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('advertises CIMD alongside DCR and a public token endpoint', () => {
    const meta = authorizationServerMetadata(true);
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.token_endpoint_auth_methods_supported).toContain('none');
    expect(meta.registration_endpoint).toBeTruthy();
  });

  it('connects Claude Code on an ephemeral loopback port end to end', async () => {
    mockFetch(CODE_DOC);
    const db = seed(true);
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const redirectUri = 'http://localhost:51234/callback';
    const caller = {
      uid: 't1',
      token: { email: TEACHER, email_verified: true },
    };
    const approved = await authorize(db, caller, {
      clientId: CODE_ID,
      redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      decision: 'approve',
    });
    if (approved.decision !== 'approve') throw new Error('expected approve');
    expect(approved.redirectTo.startsWith(redirectUri)).toBe(true);
    const code = new URL(approved.redirectTo).searchParams.get('code') ?? '';
    const out = await handleToken(db, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: CODE_ID,
      redirect_uri: redirectUri,
    });
    expect(out.status).toBe(200);
    expect(
      await verifyAccessToken(db, out.json.access_token as string)
    ).toMatchObject({ uid: 't1', email: TEACHER });
  });

  it('never redirects to a URI the document does not list', async () => {
    mockFetch(CODE_DOC);
    await expect(
      authorize(
        seed(true),
        { uid: 't1', token: { email: TEACHER, email_verified: true } },
        {
          clientId: CODE_ID,
          redirectUri: 'https://claude.ai/api/mcp/auth_callback',
          codeChallenge: 'a'.repeat(43),
          codeChallengeMethod: 'S256',
          decision: 'preview',
        }
      )
    ).rejects.toThrow(/not valid/);
  });
});
