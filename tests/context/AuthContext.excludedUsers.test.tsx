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
import type { GlobalFeaturePermission } from '@/types';

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
  // Silences "No 'X' export defined on the firebase/firestore mock" stderr
  // noise from the returning-user probe at AuthContext.tsx:~1217.
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(() => undefined),
}));

const ctxHolder: { current: AuthContextType | null } = { current: null };

const Probe: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    ctxHolder.current = ctx;
  });
  return null;
};

function getCtx(): AuthContextType {
  if (!ctxHolder.current) throw new Error('AuthContext not captured');
  return ctxHolder.current;
}

function buildFakeUser(email: string): User {
  return {
    uid: 'test-uid',
    email,
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

interface DocRef {
  __path?: string;
}
interface CollectionRef {
  __path?: string;
}

type DocSnap = Awaited<ReturnType<typeof firestore.getDoc>>;

function setupGetDoc(opts: {
  adminEmail: string | null;
  selectedBuildings: string[];
}): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as DocRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ selectedBuildings: opts.selectedBuildings }),
      } as unknown as DocSnap);
    }
    const isAdminLookup =
      opts.adminEmail !== null &&
      path === `admins/${opts.adminEmail.toLowerCase()}`;
    return Promise.resolve({
      exists: () => isAdminLookup,
      data: () => (isAdminLookup ? {} : undefined),
    } as unknown as DocSnap);
  });
}

function deliverPermissions(
  perms: GlobalFeaturePermission[],
  grants: Record<string, unknown> | undefined
): void {
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as CollectionRef).__path ?? '';
    if (path.startsWith('beta_grants/')) {
      (onNext as unknown as (s: unknown) => void)({ data: () => grants });
      return () => undefined;
    }
    // Admins read the originals; everyone else the stripped mirror.
    const stripped = path === 'global_permissions_public';
    if (stripped || path === 'global_permissions') {
      const snapshot = {
        docs: perms.map((p) => ({
          id: p.featureId,
          data: () =>
            stripped ? { ...p, betaUsers: [], excludedUsers: undefined } : p,
        })),
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => {
          snapshot.docs.forEach(cb);
        },
      };
      (onNext as unknown as (s: typeof snapshot) => void)(snapshot);
    }
    return () => undefined;
  });
}

async function mountAs(opts: {
  email: string;
  isAdmin: boolean;
  perms: GlobalFeaturePermission[];
  grants?: Record<string, unknown>;
}): Promise<void> {
  ctxHolder.current = null;
  setupGetDoc({
    adminEmail: opts.isAdmin ? opts.email : null,
    selectedBuildings: [],
  });
  deliverPermissions(opts.perms, opts.grants);

  const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
  onAuthMock.mockImplementation(() => () => undefined);

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
  if (!lastCall) throw new Error('onAuthStateChanged was never called');
  const listener = lastCall[1] as (u: User | null) => void;
  const user = buildFakeUser(opts.email);
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  act(() => {
    listener(user);
  });

  await waitFor(() => {
    expect(ctxHolder.current).not.toBeNull();
    expect(ctxHolder.current?.isAdmin).not.toBeNull();
    expect(ctxHolder.current?.profileLoaded).toBe(true);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
});

const feature = (
  over: Partial<GlobalFeaturePermission> = {}
): GlobalFeaturePermission => ({
  featureId: 'personal-spotify',
  accessLevel: 'admin',
  betaUsers: [],
  enabled: true,
  ...over,
});

describe('AuthContext — exclude list beats every other rule', () => {
  it('hides an admin-only flag from an excluded admin', async () => {
    await mountAs({
      email: 'Boss@Example.com',
      isAdmin: true,
      perms: [feature({ excludedUsers: ['boss@example.com'] })],
    });
    await waitFor(() =>
      expect(getCtx().canAccessFeature('personal-spotify')).toBe(false)
    );
  });

  it('still shows the flag to an admin who is not excluded', async () => {
    await mountAs({
      email: 'boss@example.com',
      isAdmin: true,
      perms: [feature({ excludedUsers: ['someone@example.com'] })],
    });
    await waitFor(() =>
      expect(getCtx().canAccessFeature('personal-spotify')).toBe(true)
    );
  });

  it('hides a public flag from a teacher excluded through their own grant doc', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [feature({ accessLevel: 'public' })],
      grants: { excludedGlobal: ['personal-spotify'] },
    });
    await waitFor(() => expect(getCtx().globalPermissionsLoaded).toBe(true));
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });

  it('hides a beta flag from a tester who is also excluded', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [feature({ accessLevel: 'beta' })],
      grants: {
        global: ['personal-spotify'],
        excludedGlobal: ['personal-spotify'],
      },
    });
    await waitFor(() => expect(getCtx().globalPermissionsLoaded).toBe(true));
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });

  it('keeps a beta tester in when nobody is excluded', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [feature({ accessLevel: 'beta' })],
      grants: { global: ['personal-spotify'] },
    });
    await waitFor(() =>
      expect(getCtx().canAccessFeature('personal-spotify')).toBe(true)
    );
  });
});
