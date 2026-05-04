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

/**
 * Tests `useAuth().canSeeShareTracking()` — the gate guarding the view-count
 * Firestore aggregation reads. The contract is "admin-only by default": a
 * missing or disabled `share-link-tracking` permission record means
 * non-admins skip the read entirely (no `<ViewCountBadge>` mounts, no
 * Firestore aggregation fires). This protects unseed deployments from
 * accidental read bloat — flipping access to public is an explicit admin
 * action, not a deploy-side default.
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
  if (!ctxHolder.current) {
    throw new Error('AuthContext was never captured by the Probe');
  }
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

interface CollectionRef {
  __path?: string;
}

function deliverGlobalPermissions(perms: GlobalFeaturePermission[]): void {
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as CollectionRef).__path ?? '';
    if (path === 'global_permissions') {
      const snapshot = {
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => {
          perms.forEach((p) => {
            cb({ id: p.featureId, data: () => p });
          });
        },
      };
      (onNext as unknown as (s: typeof snapshot) => void)(snapshot);
    }
    return () => undefined;
  });
}

interface DocRef {
  __path?: string;
}

/** Mock getDoc to return an admin record only for the supplied email. */
function setAdmin(adminEmail: string | null): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref: unknown) => {
    const path = (ref as DocRef).__path ?? '';
    const isAdminLookup =
      adminEmail !== null && path === `admins/${adminEmail.toLowerCase()}`;
    return Promise.resolve({
      exists: () => isAdminLookup,
      data: () => (isAdminLookup ? {} : undefined),
    } as unknown as Awaited<ReturnType<typeof firestore.getDoc>>);
  });
}

async function mountAs(opts: {
  email: string;
  isAdmin: boolean;
  perms: GlobalFeaturePermission[];
}): Promise<void> {
  ctxHolder.current = null;
  setAdmin(opts.isAdmin ? opts.email : null);
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

  // Wait for both the global_permissions snapshot AND the admin-doc
  // resolution to flush into context state. `isAdmin` flips from null to
  // true/false after the async getDoc, so check that as well.
  await waitFor(() => {
    expect(ctxHolder.current).not.toBeNull();
    expect(ctxHolder.current?.isAdmin).not.toBeNull();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
});

describe('AuthContext — canSeeShareTracking', () => {
  it('returns true for admins when no permission doc exists', async () => {
    await mountAs({
      email: 'admin@example.com',
      isAdmin: true,
      perms: [],
    });
    expect(getCtx().canSeeShareTracking()).toBe(true);
  });

  it('returns FALSE for non-admins when no permission doc exists (admin-only default)', async () => {
    // The whole point of the gate: a missing record means teachers don't
    // get charged for the aggregation reads. canAccessFeature defaults to
    // true here; canSeeShareTracking deliberately diverges.
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [],
    });
    expect(getCtx().canSeeShareTracking()).toBe(false);
  });

  it('returns false for non-admins when accessLevel is admin', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [
        {
          featureId: 'share-link-tracking',
          accessLevel: 'admin',
          betaUsers: [],
          enabled: true,
        },
      ],
    });
    expect(getCtx().canSeeShareTracking()).toBe(false);
  });

  it('returns true for everyone when accessLevel is public and enabled', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [
        {
          featureId: 'share-link-tracking',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
        },
      ],
    });
    expect(getCtx().canSeeShareTracking()).toBe(true);
  });

  it('returns false for everyone when the permission is disabled (even admins)', async () => {
    // The `enabled: false` master kill switch should win over admin status.
    // Mirrors canAccessFeature's behavior — disabled means disabled.
    await mountAs({
      email: 'admin@example.com',
      isAdmin: true,
      perms: [
        {
          featureId: 'share-link-tracking',
          accessLevel: 'public',
          betaUsers: [],
          enabled: false,
        },
      ],
    });
    expect(getCtx().canSeeShareTracking()).toBe(false);
  });

  it('returns true for beta users on the betaUsers list', async () => {
    await mountAs({
      email: 'beta-teacher@example.com',
      isAdmin: false,
      perms: [
        {
          featureId: 'share-link-tracking',
          accessLevel: 'beta',
          betaUsers: ['beta-teacher@example.com'],
          enabled: true,
        },
      ],
    });
    expect(getCtx().canSeeShareTracking()).toBe(true);
  });

  it('returns false for non-beta users when accessLevel is beta', async () => {
    await mountAs({
      email: 'other-teacher@example.com',
      isAdmin: false,
      perms: [
        {
          featureId: 'share-link-tracking',
          accessLevel: 'beta',
          betaUsers: ['someone-else@example.com'],
          enabled: true,
        },
      ],
    });
    expect(getCtx().canSeeShareTracking()).toBe(false);
  });
});
