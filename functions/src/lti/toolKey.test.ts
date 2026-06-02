import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { signToolJwt } from './toolKey';
import { TOOL_SIGNING_KID } from './toolJwks';

const TOKEN_AUD =
  'https://lti-service.svc.schoology.com/lti-service/access-token';

describe('signToolJwt', () => {
  it('signs a verifiable RS256 JWT with the published kid and standard claims', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const pem = await exportPKCS8(privateKey);

    const jwt = await signToolJwt(pem, {
      issuer: 'client-123',
      audience: TOKEN_AUD,
      claims: { foo: 'bar' },
    });

    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey, {
      issuer: 'client-123',
      audience: TOKEN_AUD,
    });

    expect(protectedHeader.alg).toBe('RS256');
    expect(protectedHeader.kid).toBe(TOOL_SIGNING_KID);
    expect(protectedHeader.typ).toBe('JWT');
    expect(payload.iss).toBe('client-123');
    expect(payload.sub).toBe('client-123'); // defaults to issuer
    expect(payload.jti).toBeTruthy();
    expect(payload.foo).toBe('bar');
    expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
  });

  it('honors an explicit subject and a short expiry', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const pem = await exportPKCS8(privateKey);
    const jwt = await signToolJwt(pem, {
      issuer: 'client-123',
      subject: 'sub-xyz',
      audience: ['https://schoology.schoology.com'],
      expiresInSec: 60,
    });
    const { payload } = await jwtVerify(jwt, publicKey, {
      issuer: 'client-123',
      audience: 'https://schoology.schoology.com',
    });
    expect(payload.sub).toBe('sub-xyz');
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it('produces a unique jti on each call', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const pem = await exportPKCS8(privateKey);
    const decodeJti = (jwt: string) =>
      (
        JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as {
          jti?: string;
        }
      ).jti;
    const a = await signToolJwt(pem, { issuer: 'c', audience: 'a' });
    const b = await signToolJwt(pem, { issuer: 'c', audience: 'a' });
    expect(decodeJti(a)).toBeTruthy();
    expect(decodeJti(a)).not.toBe(decodeJti(b));
  });
});
