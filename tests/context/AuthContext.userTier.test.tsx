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

// `resolveOrgIdForUser` calls the `resolveOrgForUser` callable. By default we
// make it reject so the membership effect takes its operator-org fallback (the
// path every existing org-member test relies on). Individual tests can override
// `httpsCallableImpl` — e.g. the "membership still resolving" case below returns
// a never-settling promise so `membershipResolved` stays false.
let httpsCallableImpl: () => Promise<{ data: { orgId: string | null } }> = () =>
  Promise.reject(new Error('callable unavailable in test'));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => httpsCallableImpl(),
}));

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

function buildFakeUser(
  email: string,
  claims: Record<string, unknown> = {}
): User {
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
      claims,
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
  /** Custom claims to stamp on the fake user's ID token (e.g. studentRole). */
  claims?: Record<string, unknown>;
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
  const user = buildFakeUser(opts.email, opts.claims);
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
  // Default: the org-resolver callable rejects, so the membership effect falls
  // back to the operator org and `deliverSnapshots` drives `membershipResolved`.
  httpsCallableImpl = () =>
    Promise.reject(new Error('callable unavailable in test'));
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

  it('defaults to default-public for a pre-tier feature with no doc', async () => {
    // `live-session` has no `defaultMinTier`, so the missing-doc path is the
    // historical public-by-default behavior even for a free-tier external.
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().canAccessFeature('live-session')).toBe(true);
  });

  it('default-denies google-classroom for a free user when no doc exists', async () => {
    // W5 / wide-distro Phase 3: Google-API-backed features carry an in-code
    // `defaultMinTier: 'org'`, so the missing-doc path now denies free-tier
    // users without an admin authoring a doc.
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(false);
  });

  it('default-allows google-classroom for an org member when no doc exists', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, isOrgMember: true });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('default-allows google-classroom for an internal user when no doc exists', async () => {
    await mountAs({ email: INTERNAL_EMAIL });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('admin bypasses the default google-classroom tier floor (no doc)', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, isAdmin: true });
    expect(getCtx().canAccessFeature('google-classroom')).toBe(true);
  });

  it('undefined minTier keeps existing docs unrestricted (back-compat)', async () => {
    // An admin-persisted doc with no `minTier` is authoritative and imposes no
    // floor — the in-code `defaultMinTier` applies ONLY to the missing-doc
    // path, so a real doc without minTier stays unrestricted even for free.
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

  it('default-denies the calendar (Events) widget for a free user (no doc)', async () => {
    // W5 / wide-distro Phase 3: `WIDGET_DEFAULT_MIN_TIER.calendar = 'org'`, so
    // the Google-Calendar-backed widget is denied to free-tier users on the
    // missing-doc path without an admin authoring a permission doc.
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().canAccessWidget('calendar')).toBe(false);
  });

  it('default-allows the calendar widget for an org member (no doc)', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, isOrgMember: true });
    expect(getCtx().canAccessWidget('calendar')).toBe(true);
  });

  it('default-allows the calendar widget for an internal user (no doc)', async () => {
    await mountAs({ email: INTERNAL_EMAIL });
    expect(getCtx().canAccessWidget('calendar')).toBe(true);
  });

  it('admin bypasses the default calendar tier floor (no doc)', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, isAdmin: true });
    expect(getCtx().canAccessWidget('calendar')).toBe(true);
  });

  it('leaves a pre-tier widget (clock) public by default for free (no doc)', async () => {
    // `clock` has no WIDGET_DEFAULT_MIN_TIER entry, so the historical
    // public-by-default behavior is unchanged for free-tier users.
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().canAccessWidget('clock')).toBe(true);
  });
});

describe('AuthContext — isExternalUser / hasOrg', () => {
  it('is external for a fully-resolved free user with no org', async () => {
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().isExternalUser).toBe(true);
    expect(getCtx().hasOrg).toBe(false);
  });

  it('is NOT external for an org member', async () => {
    await mountAs({ email: EXTERNAL_EMAIL, isOrgMember: true });
    expect(getCtx().isExternalUser).toBe(false);
    expect(getCtx().hasOrg).toBe(true);
  });

  it('is NOT external for an internal (Orono) user', async () => {
    // Orono resolves an org member doc, so hasOrg is true and isExternalUser
    // is false — internal users must notice zero change.
    await mountAs({ email: INTERNAL_EMAIL, isOrgMember: true });
    expect(getCtx().isExternalUser).toBe(false);
    expect(getCtx().hasOrg).toBe(true);
  });

  it('is NOT external while org membership is still resolving (no-flicker guard)', async () => {
    // The org-resolver callable never settles, so `subscribeToMembership` is
    // never reached and `membershipResolved` stays false — the in-flight
    // loading window. An Orono member sits here briefly on every load, and
    // `isExternalUser` must stay false the whole time so their org surfaces
    // (My PLCs / My Building(s)) never blink off. `hasOrg` is also false here
    // because `orgId` hasn't resolved yet — which is exactly why callers must
    // prefer `isExternalUser` over `!hasOrg` to gate org-only UI.
    // A promise that never settles — keeps the membership effect mid-resolve.
    httpsCallableImpl = () =>
      new Promise(() => {
        /* never resolves or rejects */
      });
    await mountAs({ email: EXTERNAL_EMAIL });
    expect(getCtx().isExternalUser).toBe(false);
    expect(getCtx().hasOrg).toBe(false);
  });

  it('is NOT external for an SSO student even with a resolved no-org membership', async () => {
    // A `studentRole: true` token claim marks an SSO student. Their membership
    // resolves to orgId=null (no member doc), which would satisfy the first two
    // conditions — but the `!isStudentRole` guard keeps them out of the
    // external bucket so student sessions never hit the external-user gates.
    await mountAs({ email: EXTERNAL_EMAIL, claims: { studentRole: true } });
    await waitFor(() => {
      expect(getCtx().isStudentRole).toBe(true);
    });
    expect(getCtx().hasOrg).toBe(false);
    expect(getCtx().isExternalUser).toBe(false);
  });

  it('is NOT external for a member-doc-less Orono user (internal tier, orgId null)', async () => {
    // The decisive zero-change guard. A brand-new / not-yet-backfilled Orono
    // teacher has no `members/{email}` doc yet, so membership resolves with
    // orgId=null — but their email DOMAIN still derives userTier='internal'.
    // The `userTier === 'free'` condition keeps them OUT of the external bucket,
    // so their org surfaces are never hidden even before a member doc exists.
    // Without that guard, orgId===null alone would wrongly classify them
    // external and hide My PLCs / My Building(s) / etc. — a real regression.
    await mountAs({ email: INTERNAL_EMAIL });
    await waitFor(() => {
      expect(getCtx().userTier).toBe('internal');
    });
    expect(getCtx().hasOrg).toBe(false);
    expect(getCtx().isExternalUser).toBe(false);
  });
});
