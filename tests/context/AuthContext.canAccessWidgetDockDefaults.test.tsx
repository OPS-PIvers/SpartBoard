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
import type { FeaturePermission } from '@/types';

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

function deliverFeaturePermissions(perms: FeaturePermission[]): void {
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as CollectionRef).__path ?? '';
    if (path === 'feature_permissions') {
      const snapshot = {
        forEach: (cb: (doc: { data: () => unknown }) => void) => {
          perms.forEach((p) => cb({ data: () => p }));
        },
      };
      (onNext as unknown as (s: typeof snapshot) => void)(snapshot);
    }
    // `global_permissions` and any other listener: deliver an empty snapshot.
    return () => undefined;
  });
}

async function mountAs(opts: {
  email: string;
  isAdmin: boolean;
  selectedBuildings: string[];
  perms: FeaturePermission[];
}): Promise<void> {
  ctxHolder.current = null;
  setupGetDoc({
    adminEmail: opts.isAdmin ? opts.email : null,
    selectedBuildings: opts.selectedBuildings,
  });
  deliverFeaturePermissions(opts.perms);

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
    expect(ctxHolder.current?.featurePermissions.length).toBe(
      opts.perms.length
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
});

describe('AuthContext — canAccessWidget per-building dockDefaults gate', () => {
  // The documented contract (AuthContext.tsx canAccessWidget comment):
  //   - missing dockDefaults → no opinion, allow
  //   - user has no selected buildings → no opinion, allow
  //   - building entry missing or true → allow
  //   - only deny when *every* selected building is explicitly `false`
  const basePermission: FeaturePermission = {
    widgetType: 'time-tool',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
  };

  function withDockDefaults(
    dockDefaults: Record<string, boolean>
  ): FeaturePermission {
    return {
      ...basePermission,
      config: { dockDefaults },
    };
  }

  it('denies when every selected building is explicitly false (all-off)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [withDockDefaults({ middle: false, high: false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(false);
  });

  it('allows when buildings are mixed (some true, some false)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [withDockDefaults({ middle: true, high: false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('allows when a selected building is missing from dockDefaults (partial config defaults to enabled)', async () => {
    // The gate must NOT treat a missing entry as "off": a building the admin
    // has not configured keeps public-by-default access. Here `high` is off
    // but `middle` is unconfigured, so access is granted via `middle`.
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [withDockDefaults({ high: false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('allows when every selected building is missing from dockDefaults', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [withDockDefaults({ schumann: false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('allows when every selected building is explicitly true (all-enabled)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [withDockDefaults({ middle: true, high: true })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('allows when dockDefaults is absent entirely (no opinion)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['middle', 'high'],
      perms: [basePermission],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('allows when the user has no selected buildings (no opinion)', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: [],
      perms: [withDockDefaults({ middle: false, high: false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('canonicalizes legacy dockDefaults keys against canonical selections', async () => {
    // Legacy admin write keyed by `orono-high-school` must match the
    // canonical `high` selection so the all-off gate still fires.
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: ['high'],
      perms: [withDockDefaults({ 'orono-high-school': false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(false);
  });

  it('admin bypass wins over an all-off dockDefaults gate', async () => {
    await mountAs({
      email: 'admin@example.com',
      isAdmin: true,
      selectedBuildings: ['middle', 'high'],
      perms: [withDockDefaults({ middle: false, high: false })],
    });
    expect(getCtx().canAccessWidget('time-tool')).toBe(true);
  });

  it('honors customBuildings override for the in-flight selection', async () => {
    // AuthContext has no selected buildings, but the wizard passes an
    // in-flight selection that is fully off → deny.
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      selectedBuildings: [],
      perms: [withDockDefaults({ middle: false, high: false })],
    });
    expect(getCtx().canAccessWidget('time-tool', ['middle', 'high'])).toBe(
      false
    );
  });
});
