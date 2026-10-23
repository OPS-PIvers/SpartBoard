import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  auth: {
    currentUser: null as object | null,
    authStateReady: () => Promise.resolve(),
  },
  calls: [] as string[],
}));

vi.mock('@/config/firebase', () => ({ auth: h.auth }));
vi.mock('firebase/auth', () => ({
  inMemoryPersistence: 'memory',
  indexedDBLocalPersistence: 'local',
  setPersistence: vi.fn((_auth: unknown, p: string) => {
    h.calls.push(`persist:${p}`);
    return Promise.resolve();
  }),
  signInWithCustomToken: vi.fn((_auth: unknown, t: string) => {
    h.calls.push(`signIn:${t}`);
    return t === 'bad' ? Promise.reject(new Error('net')) : Promise.resolve();
  }),
  signOut: vi.fn(() => {
    h.calls.push('signOut');
    return Promise.resolve();
  }),
  signInAnonymously: vi.fn(() => {
    h.calls.push('signInAnon');
    return Promise.resolve({ user: { uid: 'anon' } });
  }),
}));

import {
  dropSavedPinSignIn,
  pinBridgeSessionId,
  signInAnonymouslyOverPinBridge,
  signInWithPinBridgeToken,
} from '@/utils/pinBridge';

const user = (
  claims: Record<string, unknown>,
  isAnonymous = false,
  providerData: unknown[] = []
) => ({
  isAnonymous,
  providerData,
  getIdTokenResult: () => {
    h.calls.push('claims');
    return Promise.resolve({ claims });
  },
});

beforeEach(() => {
  h.calls.length = 0;
  h.auth.currentUser = null;
});

describe('pinBridgeSessionId', () => {
  it('reads the session a PIN sign-in is scoped to', async () => {
    const id = await pinBridgeSessionId(
      user({ pinLogin: true, pinSessionId: 's1' }) as never
    );
    expect(id).toBe('s1');
  });

  it('is null for SSO and anonymous users', async () => {
    expect(await pinBridgeSessionId(user({ studentRole: true }) as never)).toBe(
      null
    );
    expect(await pinBridgeSessionId(user({}, true) as never)).toBe(null);
  });
});

describe('signInWithPinBridgeToken', () => {
  it('keeps the PIN sign-in in this tab only', async () => {
    await signInWithPinBridgeToken('tok');
    expect(h.calls).toEqual(['persist:memory', 'signIn:tok']);
  });

  it('puts storage back when the sign-in fails, so the anonymous fallback survives a reload', async () => {
    await expect(signInWithPinBridgeToken('bad')).rejects.toThrow('net');
    expect(h.calls).toEqual(['persist:memory', 'signIn:bad', 'persist:local']);
  });
});

describe('signInAnonymouslyOverPinBridge', () => {
  it('saves the replacement anonymous sign-in to storage after the PIN one is gone', async () => {
    expect(await signInAnonymouslyOverPinBridge()).toEqual({ uid: 'anon' });
    expect(h.calls).toEqual(['signInAnon', 'persist:local']);
  });
});

describe('dropSavedPinSignIn', () => {
  it('signs out a restored PIN sign-in, legacy ones included', async () => {
    h.auth.currentUser = user({ pinLogin: true });
    await dropSavedPinSignIn();
    expect(h.calls).toEqual(['claims', 'signOut']);
  });

  it('keeps SSO and anonymous users signed in', async () => {
    h.auth.currentUser = user({ studentRole: true });
    await dropSavedPinSignIn();
    h.auth.currentUser = user({}, true);
    await dropSavedPinSignIn();
    expect(h.calls).not.toContain('signOut');
  });

  it('never reads claims for a Google sign-in', async () => {
    h.auth.currentUser = user({}, false, [{ providerId: 'google.com' }]);
    await dropSavedPinSignIn();
    expect(h.calls).toEqual([]);
  });
});
