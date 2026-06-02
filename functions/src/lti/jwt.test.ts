import { describe, it, expect } from 'vitest';
import { SignJWT, generateKeyPair, type KeyLike } from 'jose';
import { verifyLaunchJwt, deriveRole } from './jwt';
import {
  LTI,
  SCHOOLOGY_ISSUER,
  AGS_SCOPE_SCORE,
  MESSAGE_TYPE_RESOURCE_LINK,
  MESSAGE_TYPE_DEEP_LINKING,
} from './config';

const CLIENT_ID = 'client-123';
const DEPLOYMENT_ID = 'dep-1';

const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    [LTI.MESSAGE_TYPE]: MESSAGE_TYPE_RESOURCE_LINK,
    [LTI.VERSION]: '1.3.0',
    [LTI.DEPLOYMENT_ID]: DEPLOYMENT_ID,
    [LTI.ROLES]: [LEARNER],
    [LTI.CONTEXT]: { id: 'course-1', title: 'Math 7' },
    [LTI.RESOURCE_LINK]: { id: 'rl-1' },
    [LTI.AGS_ENDPOINT]: {
      scope: [AGS_SCOPE_SCORE],
      lineitems: 'https://lti.example/lineitems',
      lineitem: 'https://lti.example/lineitems/1/lineitem',
    },
    [LTI.NRPS]: { context_memberships_url: 'https://lti.example/memberships' },
    nonce: 'nonce-1',
    email: 'stu@orono.k12.mn.us',
    name: 'Test Student',
    ...overrides,
  };
}

interface SignOpts {
  iss?: string;
  aud?: string;
  sub?: string;
  iat?: number;
  exp?: number;
}

async function sign(
  privateKey: KeyLike,
  claims: Record<string, unknown>,
  opts: SignOpts = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'platform-kid' })
    .setIssuedAt(opts.iat ?? now)
    .setIssuer(opts.iss ?? SCHOOLOGY_ISSUER)
    .setSubject(opts.sub ?? 'user-1')
    .setAudience(opts.aud ?? CLIENT_ID)
    .setExpirationTime(opts.exp ?? now + 300)
    .sign(privateKey);
}

describe('verifyLaunchJwt', () => {
  it('accepts a valid resource-link learner launch and parses claims', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(privateKey, baseClaims());

    const claims = await verifyLaunchJwt(token, {
      clientId: CLIENT_ID,
      expectedDeploymentId: DEPLOYMENT_ID,
      keyInput: publicKey,
    });

    expect(claims.role).toBe('student');
    expect(claims.isResourceLink).toBe(true);
    expect(claims.isDeepLinking).toBe(false);
    expect(claims.sub).toBe('user-1');
    expect(claims.contextId).toBe('course-1');
    expect(claims.contextTitle).toBe('Math 7');
    expect(claims.resourceLinkId).toBe('rl-1');
    expect(claims.nonce).toBe('nonce-1');
    expect(claims.deploymentId).toBe(DEPLOYMENT_ID);
    expect(claims.ags?.lineitem).toContain('/lineitem');
    expect(claims.ags?.scope).toContain(AGS_SCOPE_SCORE);
    expect(claims.nrps?.contextMembershipsUrl).toContain('/memberships');
    expect(claims.email).toBe('stu@orono.k12.mn.us');
    expect(claims.name).toBe('Test Student');
  });

  it('accepts a deep-linking instructor launch', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(
      privateKey,
      baseClaims({
        [LTI.MESSAGE_TYPE]: MESSAGE_TYPE_DEEP_LINKING,
        [LTI.ROLES]: [INSTRUCTOR],
        [LTI.DL_SETTINGS]: {
          deep_link_return_url: 'https://schoology.example/return',
          accept_types: ['ltiResourceLink'],
          data: 'opaque-123',
        },
      })
    );

    const claims = await verifyLaunchJwt(token, {
      clientId: CLIENT_ID,
      keyInput: publicKey,
    });

    expect(claims.isDeepLinking).toBe(true);
    expect(claims.isResourceLink).toBe(false);
    expect(claims.role).toBe('teacher');
    expect(claims.deepLinking?.deep_link_return_url).toBe(
      'https://schoology.example/return'
    );
  });

  it('rejects a wrong audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(privateKey, baseClaims(), { aud: 'someone-else' });
    await expect(
      verifyLaunchJwt(token, { clientId: CLIENT_ID, keyInput: publicKey })
    ).rejects.toThrow();
  });

  it('rejects a wrong issuer', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(privateKey, baseClaims(), {
      iss: 'https://evil.example',
    });
    await expect(
      verifyLaunchJwt(token, { clientId: CLIENT_ID, keyInput: publicKey })
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(privateKey, baseClaims(), {
      iat: now - 600,
      exp: now - 120,
    });
    await expect(
      verifyLaunchJwt(token, { clientId: CLIENT_ID, keyInput: publicKey })
    ).rejects.toThrow();
  });

  it('rejects a token signed by the wrong key', async () => {
    const signer = await generateKeyPair('RS256');
    const other = await generateKeyPair('RS256');
    const token = await sign(signer.privateKey, baseClaims());
    await expect(
      verifyLaunchJwt(token, {
        clientId: CLIENT_ID,
        keyInput: other.publicKey,
      })
    ).rejects.toThrow();
  });

  it('rejects a missing nonce', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(privateKey, baseClaims({ nonce: undefined }));
    await expect(
      verifyLaunchJwt(token, { clientId: CLIENT_ID, keyInput: publicKey })
    ).rejects.toThrow(/nonce/i);
  });

  it('rejects a deployment_id mismatch', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(privateKey, baseClaims());
    await expect(
      verifyLaunchJwt(token, {
        clientId: CLIENT_ID,
        expectedDeploymentId: 'a-different-deployment',
        keyInput: publicKey,
      })
    ).rejects.toThrow(/deployment/i);
  });

  it('rejects an unsupported message_type', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const token = await sign(
      privateKey,
      baseClaims({ [LTI.MESSAGE_TYPE]: 'LtiSubmissionReviewRequest' })
    );
    await expect(
      verifyLaunchJwt(token, { clientId: CLIENT_ID, keyInput: publicKey })
    ).rejects.toThrow(/message_type/i);
  });
});

describe('deriveRole', () => {
  it('maps instructor role URIs to teacher', () => {
    expect(deriveRole([INSTRUCTOR])).toBe('teacher');
    expect(
      deriveRole([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#TeachingAssistant',
      ])
    ).toBe('teacher');
  });

  it('maps learner role URIs to student', () => {
    expect(deriveRole([LEARNER])).toBe('student');
    expect(
      deriveRole([
        'http://purl.imsglobal.org/vocab/lis/v2/system/person#Student',
      ])
    ).toBe('student');
  });

  it('returns unknown when no recognized role is present', () => {
    expect(deriveRole([])).toBe('unknown');
    expect(
      deriveRole(['http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor'])
    ).toBe('unknown');
  });

  it('prefers teacher when both instructor and learner roles are present', () => {
    expect(deriveRole([INSTRUCTOR, LEARNER])).toBe('teacher');
  });
});
