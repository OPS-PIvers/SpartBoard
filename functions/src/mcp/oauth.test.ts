import { beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import type * as admin from 'firebase-admin';
import { makeStubFirestore } from '../testing/stubFirestore';
import { isAllowedRedirectUri } from './config';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  pkceMatches,
  resetSigningKeyCache,
  verifyAccessToken,
} from './tokens';
import { handleRegister, handleToken } from './oauthEndpoints';
import { authorize } from './authorizeCallables';

type Firestore = admin.firestore.Firestore;

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const TEACHER = 'teacher@orono.k12.mn.us';

const seed = () =>
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
  }).db as unknown as Firestore;

const pkcePair = () => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

async function register(db: Firestore): Promise<string> {
  const out = await handleRegister(db, {
    redirect_uris: [REDIRECT],
    client_name: 'Claude',
  });
  expect(out.status).toBe(201);
  return out.json.client_id as string;
}

describe('isAllowedRedirectUri', () => {
  it('allows Claude callbacks and loopback only', () => {
    expect(isAllowedRedirectUri(REDIRECT)).toBe(true);
    expect(
      isAllowedRedirectUri('https://claude.com/api/mcp/auth_callback')
    ).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(
      true
    );
    expect(isAllowedRedirectUri('http://127.0.0.1:33418/callback')).toBe(true);
    expect(
      isAllowedRedirectUri('https://claude.ai.evil.com/api/mcp/auth_callback')
    ).toBe(false);
    expect(isAllowedRedirectUri('https://claude.ai/other')).toBe(false);
    expect(isAllowedRedirectUri('http://claude.ai/api/mcp/auth_callback')).toBe(
      false
    );
    expect(isAllowedRedirectUri('not a url')).toBe(false);
  });
});

describe('tokens', () => {
  it('round-trips refresh tokens and rejects malformed ones', () => {
    const token = encodeRefreshToken('uid123', 'grantABC', 'secret');
    expect(decodeRefreshToken(token)).toEqual({
      uid: 'uid123',
      grantId: 'grantABC',
      secret: 'secret',
    });
    expect(decodeRefreshToken('nodot')).toBeNull();
    expect(
      decodeRefreshToken(`${Buffer.from('a/b:c').toString('base64url')}.s`)
    ).toBeNull();
  });

  it('checks PKCE S256', () => {
    const { verifier, challenge } = pkcePair();
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(`${verifier}x`, challenge)).toBe(false);
    expect(pkceMatches('short', challenge)).toBe(false);
  });
});

describe('authorization flow', () => {
  beforeEach(() => resetSigningKeyCache());

  it('refuses to register non-Claude redirect URIs', async () => {
    const out = await handleRegister(seed(), {
      redirect_uris: ['https://evil.example/cb'],
    });
    expect(out.status).toBe(400);
  });

  it('issues tokens for an eligible teacher and burns the code', async () => {
    const db = seed();
    const clientId = await register(db);
    const { verifier, challenge } = pkcePair();
    const caller = {
      uid: 't1',
      token: { email: TEACHER, email_verified: true },
    };
    const base = {
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: 's',
    };

    const preview = await authorize(db, caller, {
      ...base,
      decision: 'preview',
    });
    expect(preview).toMatchObject({
      decision: 'preview',
      eligible: true,
      reason: null,
    });

    const approved = await authorize(db, caller, {
      ...base,
      decision: 'approve',
    });
    if (approved.decision !== 'approve') throw new Error('expected approve');
    const code = new URL(approved.redirectTo).searchParams.get('code') ?? '';

    const bad = await handleToken(db, {
      grant_type: 'authorization_code',
      code,
      code_verifier: pkcePair().verifier,
      client_id: clientId,
    });
    expect(bad.json.error).toBe('invalid_grant');
    const replay = await handleToken(db, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: clientId,
    });
    expect(replay.json.error).toBe('invalid_grant');
  });

  it('exchanges a code for a verifiable access token', async () => {
    const db = seed();
    const clientId = await register(db);
    const { verifier, challenge } = pkcePair();
    const caller = {
      uid: 't1',
      token: { email: TEACHER, email_verified: true },
    };
    const approved = await authorize(db, caller, {
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      decision: 'approve',
    });
    if (approved.decision !== 'approve') throw new Error('expected approve');
    const code = new URL(approved.redirectTo).searchParams.get('code') ?? '';
    const out = await handleToken(db, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
    });
    expect(out.status).toBe(200);
    const claims = await verifyAccessToken(db, out.json.access_token as string);
    expect(claims).toMatchObject({ uid: 't1', email: TEACHER });
    expect(
      await verifyAccessToken(db, `${out.json.access_token as string}x`)
    ).toBeNull();
  });

  it('marks non-members ineligible and refuses to approve them', async () => {
    const db = seed();
    const clientId = await register(db);
    const caller = {
      uid: 'x',
      token: { email: 'someone@gmail.com', email_verified: true },
    };
    const base = {
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: pkcePair().challenge,
      codeChallengeMethod: 'S256',
    };
    const preview = await authorize(db, caller, {
      ...base,
      decision: 'preview',
    });
    expect(preview).toMatchObject({ eligible: false, reason: 'not-member' });
    await expect(
      authorize(db, caller, { ...base, decision: 'approve' })
    ).rejects.toThrow();
  });

  it('never redirects to an unregistered URI', async () => {
    const db = seed();
    const clientId = await register(db);
    const caller = {
      uid: 't1',
      token: { email: TEACHER, email_verified: true },
    };
    await expect(
      authorize(db, caller, {
        clientId,
        redirectUri: 'http://localhost:1/cb',
        codeChallenge: pkcePair().challenge,
        codeChallengeMethod: 'S256',
        decision: 'deny',
      })
    ).rejects.toThrow();
  });

  it('rejects unverified and student accounts', async () => {
    const db = seed();
    const clientId = await register(db);
    const base = {
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: pkcePair().challenge,
      codeChallengeMethod: 'S256',
      decision: 'preview',
    };
    await expect(
      authorize(
        db,
        { uid: 't1', token: { email: TEACHER, email_verified: false } },
        base
      )
    ).rejects.toThrow();
    await expect(
      authorize(
        db,
        {
          uid: 's',
          token: { email: TEACHER, email_verified: true, studentRole: true },
        },
        base
      )
    ).rejects.toThrow();
  });
});
