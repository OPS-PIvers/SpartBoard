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
import type { FeaturePermission, GlobalFeaturePermission } from '@/types';

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
  // noise from the returning-user probe in AuthContext.
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

interface PathRef {
  __path?: string;
}

type DocSnap = Awaited<ReturnType<typeof firestore.getDoc>>;

function setupGetDoc(opts: { adminEmail: string | null }): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as PathRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ selectedBuildings: [] }),
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

/**
 * Wires the onSnapshot mock to deliver permission collections and,
 * optionally, an org member doc (which drives the `org` tier).
 */
function deliverSnapshots(opts: {
  email: string;
  globalPerms: GlobalFeaturePermission[];
  featurePerms: FeaturePermission[];
  isOrgMember: boolean;
}): void {
  const memberPath = `organizations/orono/members/${opts.email.toLowerCase()}`;
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as PathRef).__path ?? '';
    const fire = (snapshot: unknown) =>
      (onNext as unknown as (s: unknown) => void)(snapshot);
    if (path === 'global_permissions') {
      fire({
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => {
          opts.globalPerms.forEach((p) =>
            cb({ id: p.featureId, data: () => p })
          );
        },
      });
    } else if (path === 'feature_permissions') {
      fire({
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => {
          opts.featurePerms.forEach((p) =>
            cb({ id: p.widgetType, data: () => p })
          );
        },
      });
    } else if (path === memberPath) {
      fire({
        exists: () => opts.isOrgMember,
        data: () =>
          opts.isOrgMember ? { orgId: 'orono', buildingIds: [] } : undefined,
      });
    }
    return () => undefined;
  });
}

async function mountAs(opts: {
  email: string;
  isAdmin?: boolean;
  isOrgMember?: boolean;
  globalPerms?: GlobalFeaturePermission[];
  featurePerms?: FeaturePermission[];
}): Promise<void> {
  ctxHolder.current = null;
  setupGetDoc({ adminEmail: opts.isAdmin ? opts.email : null });
  deliverSnapshots({
    email: opts.email,
    globalPerms: opts.globalPerms ?? [],
    featurePerms: opts.featurePerms ?? [],
    isOrgMember: opts.isOrgMember ?? false,
  });

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

const INTERNAL_EMAIL = 'teacher@orono.k12.mn.us';
const EXTERNAL_EMAIL = 'teacher@example.com';

describe('AuthContext — userTier derivation', () => {
  it('derives internal for an orono.k12.mn.us email', async () => {
    await mountAs({ email: INTERNAL_EMAIL });
    expect(getCtx().userTier).toBe('internal');
  });

  it('derives org for an external email with a member doc', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, isOrgMember: true });
    expect(getCtx().userTier).toBe('org');
  });

  it('derives free for an external email without a member doc', async () => {
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().userTier).toBe('free');
  });
});

describe('AuthContext — minTier on canAccessFeature', () => {
  const gated = (
    minTier: GlobalFeaturePermission['minTier']
  ): GlobalFeaturePermission => ({
    featureId: 'google-classroom',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
    ...(minTier ? { minTier } : {}),
  });

  it('defaults to available when no doc exists', async () => {
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('undefined minTier keeps existing docs unrestricted (back-compat)', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, globalPerms: [gated(undefined)] });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('internal user passes minTier internal', async () => {
    await mountAs({ email: INTERNAL_EMAIL, globalPerms: [gated('internal')] });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('org member fails minTier internal but passes minTier org', async () => {
    await mountAs({
      email: EXTERNAL_EMAIL,
      isOrgMember: true,
      globalPerms: [gated('internal')],
    });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(false);

    await mountAs({
      email: EXTERNAL_EMAIL,
      isOrgMember: true,
      globalPerms: [gated('org')],
    });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('free user fails minTier org and internal, passes minTier free', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, globalPerms: [gated('org')] });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(false);

    await mountAs({ email: EXTERNAL_EMAIL, globalPerms: [gated('internal')] });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(false);

    await mountAs({ email: EXTERNAL_EMAIL, globalPerms: [gated('free')] });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('admin bypasses minTier even as a free-tier external', async () => {
    await mountAs({
      email: EXTERNAL_EMAIL,
      isAdmin: true,
      globalPerms: [gated('internal')],
    });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('disabled wins over a passing tier', async () => {
    await mountAs({
      email: INTERNAL_EMAIL,
      globalPerms: [{ ...gated('internal'), enabled: false }],
    });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(false);
  });
});

describe('AuthContext — minTier on canAccessWidget', () => {
  const widgetPerm = (
    minTier: FeaturePermission['minTier']
  ): FeaturePermission => ({
    widgetType: 'clock',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
    ...(minTier ? { minTier } : {}),
  });

  it('undefined minTier keeps existing docs unrestricted (back-compat)', async () => {
    await mountAs({
      email: EXTERNAL_EMAIL,
      featurePerms: [widgetPerm(undefined)],
    });
    expect(getCtx().canAccessWidget('clock')).toBe(true);
  });

  it('free user is denied a minTier internal widget', async () => {
    await mountAs({
      email: EXTERNAL_EMAIL,
      featurePerms: [widgetPerm('internal')],
    });
    expect(getCtx().canAccessWidget('clock')).toBe(false);
  });

  it('internal user passes a minTier internal widget', async () => {
    await mountAs({
      email: INTERNAL_EMAIL,
      featurePerms: [widgetPerm('internal')],
    });
    expect(getCtx().canAccessWidget('clock')).toBe(true);
  });

  it('admin bypasses a minTier internal widget', async () => {
    await mountAs({
      email: EXTERNAL_EMAIL,
      isAdmin: true,
      featurePerms: [widgetPerm('internal')],
    });
    expect(getCtx().canAccessWidget('clock')).toBe(true);
  });
});
