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

function deliverGlobalPermissions(perms: GlobalFeaturePermission[]): void {
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as CollectionRef).__path ?? '';
    if (path === 'global_permissions') {
      const snapshot = {
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => {
          perms.forEach((p) => cb({ id: p.featureId, data: () => p }));
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
  selectedBuildings: string[];
  perms: GlobalFeaturePermission[];
}): Promise<void> {
  ctxHolder.current = null;
  setupGetDoc({
    adminEmail: opts.isAdmin ? opts.email : null,
    selectedBuildings: opts.selectedBuildings,
  });
  deliverGlobalPermissions(opts.perms);

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

describe('AuthContext — canAccessFeature buildings check', () => {
  const baseFeature: Omit<GlobalFeaturePermission, 'buildings'> = {
    featureId: 'personal-spotify',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
  };

  it('passes when buildings is undefined (no restriction)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['high'],
      perms: [baseFeature],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(true);
  });

  it('passes when buildings is an empty array (no restriction)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['high'],
      perms: [{ ...baseFeature, buildings: [] }],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(true);
  });

  it('passes when user has at least one of the allowed buildings', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [{ ...baseFeature, buildings: ['high'] }],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(true);
  });

  it('fails when user has none of the allowed buildings', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['elementary'],
      perms: [{ ...baseFeature, buildings: ['middle', 'high'] }],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });

  it('fails when user has no selected buildings and buildings is restricted', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: [],
      perms: [{ ...baseFeature, buildings: ['middle'] }],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });

  it('admin bypass wins over building restriction', async () => {
    // Admins always pass once a record exists and is enabled — building
    // restriction does not gate admins. Matches the existing accessLevel
    // semantics where isAdmin short-circuits resolvePermissionAccess.
    await mountAs({
      email: 'admin@example.com',
      isAdmin: true,
      selectedBuildings: ['elementary'],
      perms: [{ ...baseFeature, buildings: ['middle'] }],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(true);
  });

  it('disabled wins over a passing building match', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['high'],
      perms: [{ ...baseFeature, enabled: false, buildings: ['high'] }],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });
});
