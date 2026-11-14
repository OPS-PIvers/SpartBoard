import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  handler: undefined as undefined | ((e: unknown) => Promise<void>),
  options: undefined as undefined | Record<string, unknown>,
  current: undefined as undefined | Record<string, unknown>,
  auth: {
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    setCustomUserClaims: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (opts: unknown, fn: (e: unknown) => Promise<void>) => {
    h.options = opts as Record<string, unknown>;
    h.handler = fn;
    return fn;
  },
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('./firebaseAdmin', () => ({
  apps: { length: 1 },
  initializeApp: vi.fn(),
  auth: () => h.auth,
  firestore: () => ({
    doc: () => ({
      get: () =>
        Promise.resolve({
          exists: h.current !== undefined,
          data: () => h.current,
        }),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }),
  }),
}));

import './organizationMembersSync';

const snap = (d?: Record<string, unknown>) => ({
  exists: d !== undefined,
  data: () => d,
});
const event = (
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
) => ({
  params: { orgId: 'orono', emailLower: 'a@orono.k12.mn.us' },
  data: { before: snap(before), after: snap(after) },
});
const user = { uid: 'u1', customClaims: {} as Record<string, unknown> };

describe('organizationMembersSync deactivation claim wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.customClaims = {};
    h.auth.getUser.mockResolvedValue(user);
    h.auth.getUserByEmail.mockResolvedValue(user);
    h.auth.setCustomUserClaims.mockResolvedValue(undefined);
    h.auth.revokeRefreshTokens.mockResolvedValue(undefined);
  });

  it('retries failed events', () => {
    expect(h.options).toMatchObject({ retry: true });
  });

  it('sets the claim on deactivation', async () => {
    h.current = { status: 'inactive', roleId: 'teacher', uid: 'u1' };
    await h.handler!(
      event(
        { status: 'active', roleId: 'teacher', uid: 'u1' },
        { status: 'inactive', roleId: 'teacher', uid: 'u1' }
      )
    );
    expect(h.auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
      deactivated: true,
    });
  });

  it('rethrows an Auth failure so the event is retried', async () => {
    h.current = { status: 'inactive', roleId: 'teacher', uid: 'u1' };
    h.auth.setCustomUserClaims.mockRejectedValue(new Error('auth 503'));
    await expect(
      h.handler!(
        event(
          { status: 'active', roleId: 'teacher', uid: 'u1' },
          { status: 'inactive', roleId: 'teacher', uid: 'u1' }
        )
      )
    ).rejects.toThrow('auth 503');
  });

  it('leaves the claim alone when an inactive member doc is deleted', async () => {
    h.current = undefined;
    user.customClaims = { deactivated: true };
    await h.handler!(event({ status: 'inactive', roleId: 'teacher' }));
    expect(h.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('applies the doc state now, not the stale event, when reactivation was undone', async () => {
    h.current = { status: 'inactive', roleId: 'teacher', uid: 'u1' };
    user.customClaims = { deactivated: true };
    await h.handler!(
      event(
        { status: 'inactive', roleId: 'teacher', uid: 'u1' },
        { status: 'active', roleId: 'teacher', uid: 'u1' }
      )
    );
    expect(h.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});
