import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Minimal harness mirroring studentIdentity.test.ts's pattern: onCall is
 * mocked to return the bare handler, secrets are stubbed with dummy values,
 * and axios is a controllable fake so ClassLink itself is never hit.
 */
const h: {
  axiosGet: ((url: string, cfg?: unknown) => Promise<unknown>) | null;
} = { axiosGet: null };

vi.mock('./functionsInit', () => ({}));

vi.mock('./secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => 'test-client-id' },
  CLASSLINK_CLIENT_SECRET: { value: () => 'test-client-secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant.example.com' },
}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = 'HttpsError';
    }
  }
  return {
    // Return the bare handler so tests invoke it directly.
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('axios', () => ({
  default: {
    get: (url: string, cfg?: unknown) =>
      h.axiosGet
        ? h.axiosGet(url, cfg)
        : Promise.reject(new Error('no axios handler configured')),
    isAxiosError: () => false,
  },
}));

import { getClassLinkRosterV1 } from './classlinkRoster';

const callRoster = getClassLinkRosterV1 as unknown as (req: {
  auth?: { token: Record<string, unknown> };
  data?: unknown;
}) => Promise<{
  classes: unknown[];
  studentsByClass: Record<string, unknown[]>;
}>;

/** Assert a callable rejects with an HttpsError carrying `code`. */
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => {
  h.axiosGet = null;
});

describe('getClassLinkRosterV1 — caller identity verification', () => {
  it('SECURITY: rejects a self-reported teacher email that is not verified', async () => {
    const promise = callRoster({
      auth: { token: { email: 'teacher@school.org', email_verified: false } },
      data: {},
    });
    await expectCode(promise, 'permission-denied');
    // The gate must fire before any ClassLink lookup is attempted.
    expect(h.axiosGet).toBeNull();
  });

  it('rejects a token with no email_verified claim at all', async () => {
    const promise = callRoster({
      auth: { token: { email: 'teacher@school.org' } },
      data: {},
    });
    await expectCode(promise, 'permission-denied');
  });

  it('allows a verified caller through to the ClassLink lookup', async () => {
    h.axiosGet = vi.fn((url: string) => {
      if (url.endsWith('/users')) {
        return Promise.resolve({
          data: { users: [{ sourcedId: 'teacher-1' }] },
        });
      }
      if (url.includes('/classes') && !url.includes('sourcedId')) {
        return Promise.resolve({ data: { classes: [] } });
      }
      return Promise.resolve({ data: { users: [] } });
    });

    const result = await callRoster({
      auth: { token: { email: 'teacher@school.org', email_verified: true } },
      data: {},
    });

    expect(result).toEqual({ classes: [], studentsByClass: {} });
  });
});
