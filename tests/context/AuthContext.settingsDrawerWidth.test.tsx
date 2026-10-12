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

/**
 * Widget settings drawer width (§4.6), on `/users/{uid}/userProfile/profile`:
 *
 *   - settingsDrawerWidth: number, clamped to 360-560, default 400.
 *
 * Covers: default, hydration-with-clamp, write path (merged field via
 * `updateUserPreference`), and in-memory-only behavior under auth bypass.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
}));

// ---------------------------------------------------------------------------
// Probe + harness
// ---------------------------------------------------------------------------

interface DocRef {
  __path: string;
}

const ctxHolder: { current: AuthContextType | null } = { current: null };

const Probe: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    ctxHolder.current = ctx;
  });
  return null;
};

function getCtx(): AuthContextType {
  if (!ctxHolder.current) {
    throw new Error('AuthContext was never captured by the Probe');
  }
  return ctxHolder.current;
}

function buildFakeUser(uid = 'test-uid', email = 'teacher@example.com'): User {
  return {
    uid,
    email,
    displayName: 'Teacher',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    refreshToken: '',
    metadata: {},
    providerId: 'firebase',
    tenantId: null,
    delete: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    getIdTokenResult: vi.fn().mockResolvedValue({
      claims: {},
      authTime: '',
      issuedAtTime: '',
      expirationTime: '',
      signInProvider: '',
      signInSecondFactor: null,
      token: 'mock-id-token',
    }),
    reload: vi.fn(),
    toJSON: () => ({}),
    phoneNumber: null,
  };
}

type DocSnap = Awaited<ReturnType<typeof firestore.getDoc>>;

function setProfileDocData(data: Record<string, unknown> | null): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as DocRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      if (data === null) {
        return Promise.resolve({
          exists: () => false,
          data: () => undefined,
        } as unknown as DocSnap);
      }
      return Promise.resolve({
        exists: () => true,
        data: () => data,
      } as unknown as DocSnap);
    }
    return Promise.resolve({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocSnap);
  });
}

async function mountWithProfile(
  profile: Record<string, unknown> | null
): Promise<void> {
  ctxHolder.current = null;
  setProfileDocData(profile);

  vi.mocked(firestore.onSnapshot).mockImplementation(() => () => undefined);

  const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
  onAuthMock.mockImplementation(() => () => undefined);

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
  if (!lastCall) {
    throw new Error(
      'onAuthStateChanged was never called — provider failed to mount'
    );
  }
  const listener = lastCall[1] as (u: User | null) => void;
  const user = buildFakeUser();
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });

  act(() => {
    listener(user);
  });

  await waitFor(() => {
    expect(ctxHolder.current?.profileLoaded).toBe(true);
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  window.localStorage.clear();
  vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContext — settingsDrawerWidth', () => {
  describe('hydration', () => {
    it('falls back to 400 when the profile doc omits the field', async () => {
      await mountWithProfile({ setupCompleted: true });
      expect(getCtx().settingsDrawerWidth).toBe(400);
    });

    it('hydrates an in-range persisted value unchanged', async () => {
      await mountWithProfile({ settingsDrawerWidth: 480 });
      expect(getCtx().settingsDrawerWidth).toBe(480);
    });

    it('clamps a persisted value above 560 down to 560', async () => {
      await mountWithProfile({ settingsDrawerWidth: 900 });
      expect(getCtx().settingsDrawerWidth).toBe(560);
    });

    it('clamps a persisted value below 360 up to 360', async () => {
      await mountWithProfile({ settingsDrawerWidth: 100 });
      expect(getCtx().settingsDrawerWidth).toBe(360);
    });

    it('falls back to 400 for a non-finite/garbage value', async () => {
      await mountWithProfile({ settingsDrawerWidth: 'wide' });
      expect(getCtx().settingsDrawerWidth).toBe(400);
    });
  });

  describe('updateUserPreference', () => {
    it('writes the merged field via setDoc with merge:true', async () => {
      await mountWithProfile({ settingsDrawerWidth: 400 });
      vi.mocked(firestore.setDoc).mockClear();

      await act(async () => {
        await getCtx().updateUserPreference('settingsDrawerWidth', 480);
      });

      const profileWrites = vi
        .mocked(firestore.setDoc)
        .mock.calls.filter(([ref]) =>
          (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
        );
      expect(profileWrites).toHaveLength(1);
      const [, payload, options] = profileWrites[0];
      expect(payload).toEqual({ settingsDrawerWidth: 480 });
      expect(options).toEqual({ merge: true });
    });

    it('persists the clamped value, not the raw out-of-range value', async () => {
      await mountWithProfile({ settingsDrawerWidth: 400 });
      vi.mocked(firestore.setDoc).mockClear();

      await act(async () => {
        await getCtx().updateUserPreference('settingsDrawerWidth', 900);
      });

      const profileWrites = vi
        .mocked(firestore.setDoc)
        .mock.calls.filter(([ref]) =>
          (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
        );
      expect(profileWrites).toHaveLength(1);
      const [, payload] = profileWrites[0];
      expect(payload).toEqual({ settingsDrawerWidth: 560 });
    });

    it('applies the optimistic state update, clamped, before setDoc resolves', async () => {
      await mountWithProfile({ settingsDrawerWidth: 400 });
      let resolveSetDoc: () => void = () => undefined;
      const pending = new Promise<void>((resolve) => {
        resolveSetDoc = resolve;
      });
      vi.mocked(firestore.setDoc).mockReturnValueOnce(pending);

      let call: Promise<void> = Promise.resolve();
      act(() => {
        call = getCtx().updateUserPreference('settingsDrawerWidth', 900);
      });
      expect(getCtx().settingsDrawerWidth).toBe(560);

      resolveSetDoc();
      await act(async () => {
        await call;
      });
      expect(getCtx().settingsDrawerWidth).toBe(560);
    });
  });
});
