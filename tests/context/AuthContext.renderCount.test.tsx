import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import type { AuthContextType } from '@/context/AuthContextValue';

vi.mock('firebase/auth', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  return {
    ...actual,
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    signInAnonymously: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  getDoc: vi
    .fn()
    .mockResolvedValue({ exists: () => false, data: () => undefined }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
}));

const probe = {
  renders: 0,
  ctx: null as AuthContextType | null,
  bump: () => undefined as void,
};

const Consumer: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    probe.ctx = ctx;
  });
  return null;
};

const stableChildren = (
  <React.Profiler
    id="consumer"
    onRender={() => {
      probe.renders += 1;
    }}
  >
    <Consumer />
  </React.Profiler>
);

const Parent: React.FC = () => {
  const [, setN] = React.useState(0);
  React.useEffect(() => {
    probe.bump = () => setN((n) => n + 1);
  }, []);
  return <AuthProvider>{stableChildren}</AuthProvider>;
};

function fakeUser(): User {
  return {
    uid: 'u1',
    email: 'teacher@example.com',
    displayName: 'T',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    refreshToken: '',
    metadata: {},
    providerId: 'firebase',
    tenantId: null,
    delete: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue('t'),
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: {}, token: 't' }),
    reload: vi.fn(),
    toJSON: () => ({}),
    phoneNumber: null,
  };
}

beforeEach(() => {
  probe.renders = 0;
  probe.ctx = null;
  window.localStorage.clear();
});

describe('AuthContext render cost', () => {
  it('does not re-render consumers when only the provider parent re-renders', async () => {
    const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
    onAuthMock.mockImplementation(() => () => undefined);
    render(<Parent />);
    const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
    const listener = lastCall[1] as (u: User | null) => void;
    const user = fakeUser();
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });
    act(() => {
      listener(user);
    });
    await waitFor(() => expect(probe.ctx?.profileLoaded).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const before = probe.renders;
    const valueBefore = probe.ctx;
    for (let i = 0; i < 10; i++) act(() => probe.bump());
    expect(probe.ctx).toBe(valueBefore);
    expect(probe.renders - before).toBe(0);
  });
});
