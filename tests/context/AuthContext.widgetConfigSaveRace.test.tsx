import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
  FieldPath: class {
    constructor(...segments: string[]) {
      Object.assign(this, { segments });
    }
  },
}));

const ctxHolder: { current: AuthContextType | null } = { current: null };
const Probe: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    ctxHolder.current = ctx;
  });
  return null;
};

const user = {
  uid: 'u1',
  email: 'teacher@example.com',
  displayName: 'T',
  photoURL: null,
  isAnonymous: false,
  getIdToken: vi.fn().mockResolvedValue('t'),
  getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
} as unknown as User;

const missing = { exists: () => false, data: () => undefined };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(firestore.getDoc).mockResolvedValue(
    missing as unknown as Awaited<ReturnType<typeof firestore.getDoc>>
  );
  vi.mocked(firestore.getDocs).mockResolvedValue({
    empty: true,
    size: 0,
  } as unknown as Awaited<ReturnType<typeof firestore.getDocs>>);
  vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthContext widget config save race', () => {
  it('a default save for one type does not drop another type pending appearance write', async () => {
    const onAuth = vi.mocked(firebaseAuth.onAuthStateChanged);
    onAuth.mockImplementation(() => () => undefined);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    const listener = onAuth.mock.calls[onAuth.mock.calls.length - 1][1] as (
      u: User | null
    ) => void;
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });
    act(() => listener(user));
    await waitFor(() => expect(ctxHolder.current?.profileLoaded).toBe(true));

    vi.useFakeTimers();
    vi.mocked(firestore.setDoc).mockClear();
    act(() => {
      ctxHolder.current?.saveWidgetConfig('clock', { fontFamily: 'serif' });
    });
    act(() => {
      ctxHolder.current?.saveWidgetDefault('weather', { fontFamily: 'mono' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const written = vi
      .mocked(firestore.setDoc)
      .mock.calls.map((c) => JSON.stringify(c[1]))
      .join('|');
    expect(written).toContain('"clock"');
    expect(written).toContain('serif');
  });
});
