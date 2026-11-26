import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockUser {
  uid: string;
  isAnonymous: boolean;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
}

const { mockAuth, signInAnonymously, dropPinLogin } = vi.hoisted(() => {
  const mockAuth = {
    authStateReady: vi.fn<() => Promise<void>>(),
    currentUser: null as MockUser | null,
  };
  return {
    mockAuth,
    signInAnonymously: vi.fn(() => {
      mockAuth.currentUser = {
        uid: 'anon-1',
        isAnonymous: true,
        getIdTokenResult: () => Promise.resolve({ claims: {} }),
      };
      return Promise.resolve({ user: mockAuth.currentUser });
    }),
    dropPinLogin: vi.fn(() => Promise.resolve(null)),
  };
});

vi.mock('@/config/firebase', () => ({ auth: mockAuth }));
vi.mock('firebase/auth', () => ({ signInAnonymously }));
vi.mock('@/utils/pinLoginScope', () => ({ dropPinLogin }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { bootstrapStudentAuth } from '@/hooks/useStudentAuthBootstrap';

const ssoUser = (claims: Record<string, unknown>): MockUser => ({
  uid: 'sso-1',
  isAnonymous: false,
  getIdTokenResult: () => Promise.resolve({ claims }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = null;
  mockAuth.authStateReady.mockResolvedValue(undefined);
});

describe('bootstrapStudentAuth', () => {
  it('keeps a hydrated SSO user and reads its claims', async () => {
    mockAuth.currentUser = ssoUser({
      studentRole: true,
      classIds: ['c1', '', 7, 'c2'],
    });
    const r = await bootstrapStudentAuth({ label: 't', readClaims: true });
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      ready: true,
      failed: false,
      uid: 'sso-1',
      isStudentRole: true,
      isPinLogin: false,
      classIds: ['c1', 'c2'],
    });
  });

  it('waits for hydration before deciding to sign in anonymously', async () => {
    mockAuth.authStateReady.mockImplementation(() => {
      mockAuth.currentUser = ssoUser({ studentRole: true });
      return Promise.resolve();
    });
    const r = await bootstrapStudentAuth({ label: 't' });
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(r.uid).toBe('sso-1');
  });

  it('signs a visitor in anonymously', async () => {
    const r = await bootstrapStudentAuth({ label: 't' });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ uid: 'anon-1', isStudentRole: false });
  });

  it('drops a PIN-bridge token unless the app keeps it', async () => {
    mockAuth.currentUser = ssoUser({ pinLogin: true });
    await bootstrapStudentAuth({ label: 't' });
    expect(dropPinLogin).toHaveBeenCalledTimes(1);
    dropPinLogin.mockClear();
    const kept = await bootstrapStudentAuth({
      label: 't',
      keepPinLogin: true,
      readClaims: true,
    });
    expect(dropPinLogin).not.toHaveBeenCalled();
    expect(kept.isPinLogin).toBe(true);
  });

  it('skips the claim read unless asked, so a token refresh failure cannot fail it', async () => {
    const user = ssoUser({ studentRole: true });
    user.getIdTokenResult = () => Promise.reject(new Error('refresh failed'));
    mockAuth.currentUser = user;
    const r = await bootstrapStudentAuth({ label: 't' });
    expect(r).toMatchObject({
      failed: false,
      uid: 'sso-1',
      isStudentRole: false,
    });
  });

  it('fails on a hydration error by default', async () => {
    mockAuth.authStateReady.mockRejectedValue(new Error('idb blocked'));
    const r = await bootstrapStudentAuth({ label: 't' });
    expect(r).toMatchObject({ ready: true, failed: true });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('can still sign in anonymously after a hydration error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAuth.authStateReady.mockRejectedValue(new Error('idb blocked'));
    const r = await bootstrapStudentAuth({
      label: 't',
      continueOnHydrationError: true,
    });
    expect(r).toMatchObject({ failed: false, uid: 'anon-1' });
  });
});
