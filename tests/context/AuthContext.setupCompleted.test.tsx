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
 * Tests for the `setupCompleted` resolution logic that gates the new-user
 * setup wizard. Covers the in-profile heuristic and the Firestore-based
 * returning-user probe added to handle legacy users whose profile doc is
 * missing or pre-dates the wizard.
 */

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
  query: vi.fn((collectionRef: unknown) => collectionRef),
  limit: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
}));

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
    metadata: {} as User['metadata'],
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
  } as unknown as User;
}

type DocSnap = Awaited<ReturnType<typeof firestore.getDoc>>;
type QuerySnap = Awaited<ReturnType<typeof firestore.getDocs>>;

interface FakeData {
  profile: Record<string, unknown> | null;
  rootUser: Record<string, unknown> | null;
  hasDashboard: boolean;
}

function installFirestoreFakes(data: FakeData): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as DocRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      if (data.profile === null) {
        return Promise.resolve({
          exists: () => false,
          data: () => undefined,
        } as unknown as DocSnap);
      }
      const captured = data.profile;
      return Promise.resolve({
        exists: () => true,
        data: () => captured,
      } as unknown as DocSnap);
    }
    if (/^users\/[^/]+$/.test(path)) {
      if (data.rootUser === null) {
        return Promise.resolve({
          exists: () => false,
          data: () => undefined,
        } as unknown as DocSnap);
      }
      const captured = data.rootUser;
      return Promise.resolve({
        exists: () => true,
        data: () => captured,
      } as unknown as DocSnap);
    }
    return Promise.resolve({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocSnap);
  });

  vi.mocked(firestore.getDocs).mockImplementation(() => {
    return Promise.resolve({
      empty: !data.hasDashboard,
      size: data.hasDashboard ? 1 : 0,
    } as unknown as QuerySnap);
  });
}

async function mountWithFakes(data: FakeData): Promise<void> {
  ctxHolder.current = null;
  installFirestoreFakes(data);

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

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  window.localStorage.clear();
  vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
});

describe('AuthContext — setupCompleted resolution', () => {
  describe('in-profile heuristic', () => {
    it('treats explicit setupCompleted: true as completed', async () => {
      await mountWithFakes({
        profile: { setupCompleted: true, selectedBuildings: ['high'] },
        rootUser: null,
        hasDashboard: false,
      });
      expect(getCtx().setupCompleted).toBe(true);
    });

    it('treats a profile doc missing the setupCompleted field as completed', async () => {
      await mountWithFakes({
        profile: { selectedBuildings: ['high'] },
        rootUser: null,
        hasDashboard: false,
      });
      expect(getCtx().setupCompleted).toBe(true);
    });

    it('treats setupCompleted: false as completed when selectedBuildings is non-empty (legacy-building broaden)', async () => {
      await mountWithFakes({
        profile: {
          setupCompleted: false,
          selectedBuildings: ['orono-high-school'],
        },
        rootUser: null,
        hasDashboard: false,
      });
      expect(getCtx().setupCompleted).toBe(true);
    });

    it('keeps setupCompleted: false when profile has it false and no buildings', async () => {
      await mountWithFakes({
        profile: { setupCompleted: false, selectedBuildings: [] },
        rootUser: null,
        hasDashboard: false,
      });
      expect(getCtx().setupCompleted).toBe(false);
    });
  });

  describe('Firestore returning-user probe (profile doc missing)', () => {
    it('marks setupCompleted=true when the root users doc has buildings', async () => {
      await mountWithFakes({
        profile: null,
        rootUser: { buildings: ['orono-high-school'] },
        hasDashboard: false,
      });
      await waitFor(() => {
        expect(getCtx().setupCompleted).toBe(true);
      });
      const writes = vi
        .mocked(firestore.setDoc)
        .mock.calls.map((c) => [(c[0] as unknown as DocRef).__path, c[1]]);
      const profileWrite = writes.find(
        ([path]) =>
          typeof path === 'string' && path.endsWith('userProfile/profile')
      );
      expect(profileWrite).toBeDefined();
      const payload = profileWrite?.[1] as Record<string, unknown>;
      expect(payload.setupCompleted).toBe(true);
      expect(payload.selectedBuildings).toEqual(['high']);
    });

    it('marks setupCompleted=true when the user has at least one dashboard', async () => {
      await mountWithFakes({
        profile: null,
        rootUser: null,
        hasDashboard: true,
      });
      await waitFor(() => {
        expect(getCtx().setupCompleted).toBe(true);
      });
    });

    it('leaves setupCompleted=false when there is no prior data anywhere', async () => {
      await mountWithFakes({
        profile: null,
        rootUser: null,
        hasDashboard: false,
      });
      // Give the probe a tick to run and fail to find anything.
      await waitFor(() => {
        expect(getCtx().profileLoaded).toBe(true);
      });
      // Wait for any pending microtasks from the probe to settle.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(getCtx().setupCompleted).toBe(false);
    });
  });
});
