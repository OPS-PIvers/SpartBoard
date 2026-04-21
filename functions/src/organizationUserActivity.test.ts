import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => {
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => ({})),
    auth: vi.fn(() => ({
      getUsers: vi.fn(),
    })),
  };
});

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

import { getOrgUserActivity } from './organizationUserActivity';

type CallableHandler = (request: {
  auth?: { uid: string; token: { email?: string } };
  data: unknown;
}) => Promise<unknown>;

const handler = getOrgUserActivity as unknown as CallableHandler;

describe('getOrgUserActivity — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers', async () => {
    await expect(handler({ data: { orgId: 'orono' } })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects callers without an email claim', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: {} },
        data: { orgId: 'orono' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects payloads missing orgId', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
        data: {},
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects non-object payloads', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
        data: 'not-an-object',
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
