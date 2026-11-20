import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import * as firestore from 'firebase/firestore';
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
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(() => undefined),
  deleteField: vi.fn(() => '__delete__'),
  FieldPath: class {},
}));

const ctxHolder: { current: AuthContextType | null } = { current: null };

const Probe: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    ctxHolder.current = ctx;
  });
  return null;
};

function buildFakeUser(): User {
  return {
    uid: 'test-uid',
    email: 'teacher@example.com',
    displayName: 'Test',
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
  vi.clearAllMocks();
  ctxHolder.current = null;
});

describe('AuthContext debounced profile writes on sign-out', () => {
  it('sends a pending pen-color save before signing out', async () => {
    const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
    onAuthMock.mockImplementation(() => () => undefined);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    const listener = onAuthMock.mock.calls.at(-1)?.[1] as (
      u: User | null
    ) => void;
    const user = buildFakeUser();
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });
    act(() => listener(user));
    await waitFor(() => expect(ctxHolder.current?.profileLoaded).toBe(true));

    act(() => {
      ctxHolder.current?.savePenColors([
        '#ff0000',
        '#00ff00',
        '#0000ff',
        '#ffff00',
        '#000000',
      ]);
    });
    await act(async () => {
      await ctxHolder.current?.signOut();
    });

    const penWrites = vi
      .mocked(firestore.setDoc)
      .mock.calls.map((c, i) => ({
        data: c[1] as Record<string, unknown>,
        order: vi.mocked(firestore.setDoc).mock.invocationCallOrder[i],
      }))
      .filter((w) => 'penColors' in w.data);
    expect(penWrites).toHaveLength(1);
    const signOutOrder = vi.mocked(firebaseAuth.signOut).mock
      .invocationCallOrder[0];
    expect(penWrites[0].order).toBeLessThan(signOutOrder);
  });
});
