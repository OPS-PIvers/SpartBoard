# Personal Spotify Global Feature Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin gate (`'personal-spotify'`) that controls whether the per-teacher Spotify mode in the Music widget is visible, with `accessLevel` (admin/beta/public) + optional `buildings` scoping. When ungated for a user, the Music widget transparently renders curated stations and `source: 'personal'` config is preserved.

**Architecture:** Extend the existing global-permission system. Add `'personal-spotify'` to `GlobalFeature` and an optional `buildings?: string[]` field to `GlobalFeaturePermission`. Extend the shared `resolvePermissionAccess` helper in AuthContext to enforce the building check (empty/undefined = no restriction). Add a per-feature default-policy map so `canAccessFeature('personal-spotify')` returns `false` when no permission doc exists (matches `canSeeShareTracking` precedent). Wire the admin UI into `GlobalPermissionsManager` with a new generic `PermissionBuildingMultiSelect` chip control. Gate the Music widget at two render-time surfaces: hide the source toggle in Settings, and short-circuit `source: 'personal'` to curated in the top-level widget dispatch.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, Firebase Firestore, Tailwind CSS, lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-18-personal-spotify-gate-design.md`

**Branch:** `feat/personal-spotify-gate` (stacked on `claude/spotify-widget-auth-NRZCZ`)

---

## File Structure

**Modify:**

- `types.ts` — extend `GlobalFeature` union (1 entry); add `buildings?: string[]` to `GlobalFeaturePermission`
- `context/AuthContext.tsx` — extend `resolvePermissionAccess` (building check); add `MISSING_DOC_DEFAULT` map in `canAccessFeature`
- `components/admin/GlobalPermissionsManager.tsx` — add `'personal-spotify'` to `GLOBAL_FEATURES`; render `<PermissionBuildingMultiSelect>` inside each feature row; persist `buildings` on save
- `components/widgets/MusicWidget/Settings.tsx` — wrap source toggle in `canAccessFeature` gate
- `components/widgets/MusicWidget/Widget.tsx` — compute `effectiveSource` that short-circuits `'personal'` → `'curated'` when ungated

**Create:**

- `components/admin/PermissionBuildingMultiSelect.tsx` — generic building-chip multi-select (empty = "All buildings" pill)
- `tests/context/AuthContext.canAccessFeatureBuildings.test.tsx` — unit tests for the building check
- `tests/context/AuthContext.canAccessFeaturePersonalSpotify.test.tsx` — unit tests for the missing-doc default
- `tests/components/admin/PermissionBuildingMultiSelect.test.tsx` — component tests for the multi-select
- `tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx` — component tests for Settings + Widget gating

**Reference files (read for patterns, do not modify):**

- `tests/context/AuthContext.canSeeShareTracking.test.tsx` — established test pattern for AuthContext (uses `Probe` + `mountAs` + `deliverGlobalPermissions` + `setAdmin`)
- `tests/context/AuthContext.quizMonitorPrefs.test.tsx` — example of mocking `selectedBuildings` via the userProfile snapshot (`getDoc` mock returning `{ selectedBuildings: ['high'] }` for paths ending in `userProfile/profile`)
- `components/admin/BuildingSelector.tsx` — existing single-select; informs the new multi-select's API + chip styling
- `hooks/useAdminBuildings.ts` — building data source (used by both selectors)

---

## Task 1: Extend the types

**Files:**

- Modify: `types.ts`

- [ ] **Step 1: Add `'personal-spotify'` to the `GlobalFeature` union**

In `types.ts`, locate the `GlobalFeature` union (currently around line 5252-5267) and append `'personal-spotify'`:

```ts
export type GlobalFeature =
  | 'live-session'
  | 'gemini-functions'
  | 'dashboard-sharing'
  | 'dashboard-import'
  | 'magic-layout'
  | 'smart-paste'
  | 'smart-poll'
  | 'screen-recording'
  | 'remote-control'
  | 'embed-mini-app'
  | 'video-activity-audio-transcription'
  | 'ai-file-context'
  | 'org-admin-writes'
  | 'assignment-modes'
  | 'share-link-tracking'
  | 'personal-spotify';
```

- [ ] **Step 2: Add the optional `buildings?` field to `GlobalFeaturePermission`**

In `types.ts`, locate `GlobalFeaturePermission` (around line 5269) and add the field:

```ts
export interface GlobalFeaturePermission {
  featureId: GlobalFeature;
  accessLevel: AccessLevel;
  betaUsers: string[];
  enabled: boolean;
  /**
   * Building IDs allowed access. Empty array or `undefined` means
   * "no building restriction" — the feature applies org-wide.
   * Non-empty array means: user must have at least one of these
   * buildings in their `selectedBuildings` to pass the gate.
   */
  buildings?: string[];
  config?: Record<string, unknown>;
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm run type-check`

Expected: exit 0, no errors. (Optional field on an existing type does not break any caller.)

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat(types): add personal-spotify feature + optional buildings on GlobalFeaturePermission"
```

---

## Task 2: Extend `resolvePermissionAccess` with the building check

**Files:**

- Create: `tests/context/AuthContext.canAccessFeatureBuildings.test.tsx`
- Modify: `context/AuthContext.tsx` (around lines 1726-1745)

- [ ] **Step 1: Write the failing tests**

Create `tests/context/AuthContext.canAccessFeatureBuildings.test.tsx`. Mirror the structure of `tests/context/AuthContext.canSeeShareTracking.test.tsx` but extend the mount helper to also deliver `selectedBuildings` via the userProfile `getDoc` mock (pattern from `AuthContext.quizMonitorPrefs.test.tsx` lines 124-147).

```tsx
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
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `pnpm vitest run tests/context/AuthContext.canAccessFeatureBuildings.test.tsx`

Expected: most tests FAIL because the building check isn't implemented yet. The "buildings undefined" and "empty array" tests will likely already PASS (current behavior returns true). The "user has match" test will PASS by accident. The "no match," "no buildings," and "disabled" tests are the ones that exercise the new logic — focus on those failing.

- [ ] **Step 3: Extend `resolvePermissionAccess` to check buildings**

In `context/AuthContext.tsx`, locate `resolvePermissionAccess` (around line 1726) and add the building check after the access-level decision. Use `selectedBuildings` (already in scope as component state). Note: `isAdmin` short-circuits at line 1732 BEFORE any building check, so admins bypass building restrictions — that's by design and is asserted by the "admin bypass wins" test.

Replace the existing function with:

```ts
const resolvePermissionAccess = useCallback(
  (permission: GlobalFeaturePermission, userEmail: string | null): boolean => {
    if (!permission.enabled) return false;
    if (isAdmin) return true;
    switch (permission.accessLevel) {
      case 'admin':
        return false;
      case 'beta':
        if (!isBetaUser(permission.betaUsers, userEmail)) return false;
        break;
      case 'public':
        break;
      default:
        return false;
    }
    // Building check applies only when explicitly restricted. An empty
    // array or `undefined` means "no building restriction" — the feature
    // applies to anyone who passed the access-level check above. When set,
    // the user must have at least one of these buildings in their
    // `selectedBuildings` (self-managed in General Settings).
    if (permission.buildings && permission.buildings.length > 0) {
      const allowed = new Set(permission.buildings);
      const hasMatch = selectedBuildings.some((b) => allowed.has(b));
      if (!hasMatch) return false;
    }
    return true;
  },
  [isAdmin, isBetaUser, selectedBuildings]
);
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `pnpm vitest run tests/context/AuthContext.canAccessFeatureBuildings.test.tsx`

Expected: all 7 tests PASS.

- [ ] **Step 5: Run the existing canSeeShareTracking tests to confirm no regression**

`canSeeShareTracking` also goes through `resolvePermissionAccess`. The added building check is gated behind `if (permission.buildings && length > 0)`, so any permission doc without buildings (all existing 15) behaves identically.

Run: `pnpm vitest run tests/context/AuthContext.canSeeShareTracking.test.tsx`

Expected: all tests PASS (no behavioral change).

- [ ] **Step 6: Commit**

```bash
git add tests/context/AuthContext.canAccessFeatureBuildings.test.tsx context/AuthContext.tsx
git commit -m "feat(auth): building-scope check in resolvePermissionAccess"
```

---

## Task 3: Default-policy map for missing permission doc

**Files:**

- Create: `tests/context/AuthContext.canAccessFeaturePersonalSpotify.test.tsx`
- Modify: `context/AuthContext.tsx` (`canAccessFeature` callback around line 1747)

- [ ] **Step 1: Write the failing tests**

Create `tests/context/AuthContext.canAccessFeaturePersonalSpotify.test.tsx`. This test focuses on the missing-doc default for `'personal-spotify'`.

```tsx
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

function setupGetDoc(opts: { adminEmail: string | null }): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as DocRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      return Promise.resolve({
        exists: () => false,
        data: () => undefined,
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
  perms: GlobalFeaturePermission[];
}): Promise<void> {
  ctxHolder.current = null;
  setupGetDoc({ adminEmail: opts.isAdmin ? opts.email : null });
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
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
});

describe('AuthContext — canAccessFeature("personal-spotify") missing-doc default', () => {
  it('returns FALSE for non-admin when no permission doc exists', async () => {
    // Default-off. Deploying without seeding the permission doc must
    // leave teachers without the source toggle — protects misconfigured
    // OAuth deployments from surfacing a broken Connect button.
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });

  it('returns FALSE for admin when no permission doc exists', async () => {
    // Admin bypass only applies once a permission record exists. Missing
    // doc means "no policy has been set" — even admins get the closed
    // default, so they have to seed the doc deliberately.
    await mountAs({
      email: 'admin@example.com',
      isAdmin: true,
      perms: [],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(false);
  });

  it('returns TRUE for other features when no permission doc exists (default-public unchanged)', async () => {
    // The personal-spotify exception must not regress the default for
    // other features. Pick an arbitrary one that has no special-default.
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [],
    });
    expect(getCtx().canAccessFeature('gemini-functions')).toBe(true);
  });

  it('returns TRUE for non-admin when personal-spotify is enabled and public', async () => {
    await mountAs({
      email: 'teacher@example.com',
      isAdmin: false,
      perms: [
        {
          featureId: 'personal-spotify',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
        },
      ],
    });
    expect(getCtx().canAccessFeature('personal-spotify')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `pnpm vitest run tests/context/AuthContext.canAccessFeaturePersonalSpotify.test.tsx`

Expected: the first two tests FAIL (current default returns `true` for missing docs). The last two PASS (existing behavior).

- [ ] **Step 3: Add the per-feature default map in `canAccessFeature`**

In `context/AuthContext.tsx`, locate `canAccessFeature` (around line 1747) and add the map at module top + the lookup inside the function:

Add at the top of the file (after the existing imports, before the `AuthProvider` component):

```ts
/**
 * Per-feature default for `canAccessFeature` when no permission doc exists
 * in `global_permissions`. Features not listed here default to `true`
 * (public). Add an entry here when a feature must stay off until an admin
 * explicitly seeds the doc — e.g. when it depends on external configuration
 * (OAuth setup, API keys) that the code can't verify on its own.
 */
const CANACCESSFEATURE_MISSING_DOC_DEFAULT: Partial<
  Record<GlobalFeature, boolean>
> = {
  'personal-spotify': false,
};
```

Then replace the `canAccessFeature` callback's missing-doc branch:

```ts
const canAccessFeature = useCallback(
  (featureId: GlobalFeature): boolean => {
    if (isAuthBypass) return true;
    if (!user) return false;

    const permission = globalPermissions.find((p) => p.featureId === featureId);

    if (!permission) {
      // Per-feature override; defaults to public (`true`) for any feature
      // not listed in CANACCESSFEATURE_MISSING_DOC_DEFAULT.
      return CANACCESSFEATURE_MISSING_DOC_DEFAULT[featureId] ?? true;
    }
    return resolvePermissionAccess(permission, user.email);
  },
  [user, globalPermissions, resolvePermissionAccess]
);
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `pnpm vitest run tests/context/AuthContext.canAccessFeaturePersonalSpotify.test.tsx`

Expected: all 4 tests PASS.

- [ ] **Step 5: Run all AuthContext tests for regression check**

Run: `pnpm vitest run tests/context/`

Expected: all tests PASS. The default-policy map only changes behavior for `'personal-spotify'`; all other features keep their existing defaults.

- [ ] **Step 6: Commit**

```bash
git add tests/context/AuthContext.canAccessFeaturePersonalSpotify.test.tsx context/AuthContext.tsx
git commit -m "feat(auth): default-off for personal-spotify when permission doc missing"
```

---

## Task 4: `PermissionBuildingMultiSelect` component

**Files:**

- Create: `components/admin/PermissionBuildingMultiSelect.tsx`
- Create: `tests/components/admin/PermissionBuildingMultiSelect.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/PermissionBuildingMultiSelect.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'elem', name: 'Elementary' },
    { id: 'mid', name: 'Middle' },
    { id: 'high', name: 'High School' },
  ],
}));

describe('PermissionBuildingMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an "All buildings" pill when selection is empty', () => {
    render(
      <PermissionBuildingMultiSelect selectedIds={[]} onChange={vi.fn()} />
    );
    expect(screen.getByText(/all buildings/i)).toBeInTheDocument();
  });

  it('renders a chip per selected building name', () => {
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'high']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Elementary')).toBeInTheDocument();
    expect(screen.getByText('High School')).toBeInTheDocument();
    expect(screen.queryByText('Middle')).not.toBeInTheDocument();
  });

  it('calls onChange with the new selection when an unselected building is clicked', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add middle/i }));
    expect(onChange).toHaveBeenCalledWith(['elem', 'mid']);
  });

  it('calls onChange removing the building when a selected chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'high']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove elementary/i }));
    expect(onChange).toHaveBeenCalledWith(['high']);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `pnpm vitest run tests/components/admin/PermissionBuildingMultiSelect.test.tsx`

Expected: FAIL with "Cannot find module '@/components/admin/PermissionBuildingMultiSelect'".

- [ ] **Step 3: Implement `PermissionBuildingMultiSelect.tsx`**

Create `components/admin/PermissionBuildingMultiSelect.tsx`:

```tsx
/**
 * Generic building multi-select for global feature permissions.
 *
 * Empty `selectedIds` displays an "All buildings" pill — the feature
 * applies org-wide. Non-empty means the feature is restricted to users
 * whose `selectedBuildings` overlap this list.
 *
 * Mirrors the chip styling of `BuildingSelector.tsx` (single-select) so
 * the admin UI feels consistent. Unselected buildings render as
 * outlined chips with a "+" affordance; selected buildings render as
 * filled brand-blue chips with a "×" affordance.
 */

import React from 'react';
import { Plus, X, Building2 } from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

interface Props {
  selectedIds: string[];
  onChange: (next: string[]) => void;
  /** Optional label shown above the control. */
  label?: string;
}

export const PermissionBuildingMultiSelect: React.FC<Props> = ({
  selectedIds,
  onChange,
  label,
}) => {
  const buildings = useAdminBuildings();
  const selectedSet = new Set(selectedIds);

  const toggle = (id: string): void => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((b) => b !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          {label}
        </p>
      )}
      {selectedIds.length === 0 && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold border border-slate-200">
          <Building2 className="w-3 h-3" />
          All buildings
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {buildings.map((building) => {
          const isSelected = selectedSet.has(building.id);
          return (
            <button
              key={building.id}
              type="button"
              onClick={() => toggle(building.id)}
              aria-label={
                isSelected ? `Remove ${building.name}` : `Add ${building.name}`
              }
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                isSelected
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm hover:bg-brand-blue-dark'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {isSelected ? (
                <X className="w-3 h-3" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              {building.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `pnpm vitest run tests/components/admin/PermissionBuildingMultiSelect.test.tsx`

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PermissionBuildingMultiSelect.tsx tests/components/admin/PermissionBuildingMultiSelect.test.tsx
git commit -m "feat(admin): generic PermissionBuildingMultiSelect chip control"
```

---

## Task 5: Wire `'personal-spotify'` into GlobalPermissionsManager

**Files:**

- Modify: `components/admin/GlobalPermissionsManager.tsx`

This file is 1450 lines. Three precise patches in known locations:

1. Add `Music2` to the lucide-react import + `'personal-spotify'` entry to the `GLOBAL_FEATURES` array.
2. Update `getPermission` (lines 519-543) to default `buildings: []` so new docs always include the field.
3. Render `<PermissionBuildingMultiSelect>` inside the per-feature row, wired to `updatePermission(featureId, { buildings: ... })` (existing function at line 545).

The save path (`savePermission`, lines 559-604) needs **no changes** — it writes whatever `getPermission` returns, which will include `buildings` once steps 2-3 are in place.

Manual smoke test at the end because GlobalPermissionsManager has no component tests in the repo.

- [ ] **Step 1: Add the import + `GLOBAL_FEATURES` entry**

In `components/admin/GlobalPermissionsManager.tsx`, add `Music2` to the lucide-react import block (near top of file). Check whether it's already there before adding.

Then append to the `GLOBAL_FEATURES` array (defined near the top, after the imports):

```ts
{
  id: 'personal-spotify',
  label: 'Personal Spotify',
  icon: Music2,
  description:
    "Let teachers connect their personal Spotify account in the Music widget. When off, Music shows only curated stations.",
},
```

- [ ] **Step 2: Update `getPermission` default to include `buildings: []`**

Locate `getPermission` at lines 519-543. The default object returned when no permission exists must include `buildings: []` so the persisted Firestore doc always has the field explicitly. Replace the returned default object:

```ts
return (
  permissions.get(featureId) ?? {
    featureId,
    accessLevel: defaultAccessLevel,
    betaUsers: [],
    enabled: true,
    buildings: [],
    config: GEMINI_FEATURES.includes(featureId)
      ? { dailyLimit: defaultLimit, dailyLimitEnabled: true }
      : {},
  }
);
```

Existing permissions already loaded from Firestore (`permissions.get(featureId)`) keep their existing shape — `buildings` is undefined for the 15 legacy docs, which `resolvePermissionAccess` correctly treats as "no restriction." Only NEW docs get `buildings: []` on first save.

- [ ] **Step 3: Import the multi-select component**

Add near the other admin-component imports at the top of the file:

```ts
import { PermissionBuildingMultiSelect } from './PermissionBuildingMultiSelect';
```

- [ ] **Step 4: Render the multi-select inside the per-feature controls**

Find where the per-feature controls (accessLevel radios, betaUsers, enabled toggle) are rendered. The repo uses inline JSX inside the manager component rather than a separate `FeatureRow` extracted component. Look for the section near where `updatePermission(feature.id, { accessLevel: ... })` and `updatePermission(feature.id, { enabled: ... })` are called.

Place the multi-select directly below the existing controls (and above any feature-specific config like `<GeminiModelConfigSection>`):

```tsx
<PermissionBuildingMultiSelect
  label="Restrict to buildings"
  selectedIds={permission.buildings ?? []}
  onChange={(buildings) => updatePermission(feature.id, { buildings })}
/>
```

The file renders permission rows in both `'list'` and `'grid'` view modes — add the control in both places, or factor it into a small shared sub-component if the repeated JSX is awkward. Match the surrounding visual density (smaller text in the list view, more padding in the grid view).

- [ ] **Step 5: Type-check + lint**

```bash
pnpm run type-check
pnpm run lint
```

Expected: both exit 0.

- [ ] **Step 6: Smoke test in the browser**

The dev server should still be running. Open `http://localhost:3000` (sign in as admin), then navigate to Admin Settings → Global Settings.

Verify:

1. "Personal Spotify" appears in the list with the Music2 icon and description.
2. Click into it, set `enabled: true`, `accessLevel: 'admin'`, leave buildings empty. Save.
3. Verify the Firestore doc at `/global_permissions/personal-spotify` has `buildings: []` (Firebase console).
4. Re-edit, add one building to the multi-select, save.
5. Verify the Firestore doc now has `buildings: ['<that-building-id>']`.
6. Remove the building (click the × chip), save. Verify doc shows `buildings: []` again.

If the doc updates correctly through all 6 steps, the wiring is correct.

- [ ] **Step 7: Commit**

```bash
git add components/admin/GlobalPermissionsManager.tsx
git commit -m "feat(admin): wire personal-spotify feature + building multi-select into Global Settings"
```

---

## Task 6: Gate the Music widget Settings source toggle

**Files:**

- Create: `tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`
- Modify: `components/widgets/MusicWidget/Settings.tsx`

- [ ] **Step 1: Write the failing test (Settings half)**

Create `tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`. We'll add Widget-half tests in Task 7 to the same file.

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MusicSettings } from '@/components/widgets/MusicWidget/Settings';
import type { WidgetData } from '@/types';

// Replace `useAuth` so we can flip `canAccessFeature` per test without
// spinning up the full AuthProvider.
const canAccessFeatureMock = vi.fn<(featureId: string) => boolean>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: canAccessFeatureMock,
  }),
}));

// MusicSettings calls useDashboard().updateWidget; mock it minimally.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget: vi.fn() }),
}));

const baseWidget: WidgetData = {
  id: 'w1',
  type: 'music',
  x: 0,
  y: 0,
  w: 300,
  h: 200,
  z: 1,
  flipped: false,
  minimized: false,
  config: { source: 'curated' },
};

beforeEach(() => {
  vi.clearAllMocks();
  canAccessFeatureMock.mockReset();
});

describe('MusicWidget Settings — personal Spotify gate', () => {
  it('shows the Source toggle when canAccessFeature("personal-spotify") returns true', () => {
    canAccessFeatureMock.mockReturnValue(true);
    render(<MusicSettings widget={baseWidget} />);
    expect(screen.getByText(/source/i)).toBeInTheDocument();
    // The "My Spotify" option label should be reachable when the toggle is rendered.
    expect(screen.getByText(/my spotify/i)).toBeInTheDocument();
  });

  it('hides the Source toggle entirely when canAccessFeature returns false', () => {
    canAccessFeatureMock.mockReturnValue(false);
    render(<MusicSettings widget={baseWidget} />);
    expect(screen.queryByText(/source/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/my spotify/i)).not.toBeInTheDocument();
  });
});
```

If the exported component from `Settings.tsx` is named something other than `MusicSettings`, adjust the import. Open `components/widgets/MusicWidget/Settings.tsx` to confirm the exported name and the JSX label for "Source" (currently rendered around lines 126-129 per earlier recon).

- [ ] **Step 2: Run the test — confirm it fails**

Run: `pnpm vitest run tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`

Expected: the second test FAILS (Source toggle still renders even when ungated).

- [ ] **Step 3: Gate the Source toggle in `Settings.tsx`**

Open `components/widgets/MusicWidget/Settings.tsx`. Near the top, import `useAuth`:

```ts
import { useAuth } from '@/context/useAuth';
```

Inside the component, read the gate (place near the other hook calls):

```ts
const { canAccessFeature } = useAuth();
const canUsePersonal = canAccessFeature('personal-spotify');
```

Wrap the entire Source-toggle block (the "── Source selector ──" section starting around line 126 and including the `SettingsLabel` + the option buttons) in a conditional:

```tsx
{
  canUsePersonal && (
    <>
      {/* ── Source selector ── */}
      <SettingsLabel icon={Music2}>Source</SettingsLabel>
      {/* ...existing toggle JSX... */}
    </>
  );
}
```

The Source-specific body below (the `{source === 'personal' ? ... : ...}` branch around line 204) does not need to change — when ungated, `source` will be forced to `'curated'` by Task 7's render-dispatch change, and even if a stored `source: 'personal'` reaches this body, the gate kept the user out of the panel so they never had a chance to render the personal settings UI. Defense-in-depth: also short-circuit to the curated body in Settings.tsx when ungated:

```tsx
{source === 'personal' && canUsePersonal ? (
  // existing personal settings JSX (PersonalSpotifyPanel)
) : (
  // existing curated settings JSX
)}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `pnpm vitest run tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx components/widgets/MusicWidget/Settings.tsx
git commit -m "feat(music): gate personal Spotify source toggle in widget settings"
```

---

## Task 7: Gate the Music widget render dispatch

**Files:**

- Modify: `components/widgets/MusicWidget/Widget.tsx`
- Modify: `tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx` (append)

- [ ] **Step 1: Read the current widget dispatch**

Open `components/widgets/MusicWidget/Widget.tsx`. Identify the top-level branch that selects between curated and personal modes based on `config.source`. It will look approximately like:

```tsx
const source = widget.config.source ?? 'curated';
return source === 'personal' ? <PersonalMode … /> : <CuratedMode … />;
```

- [ ] **Step 2: Add the failing tests (append to existing test file)**

Append to `tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`:

```tsx
import { MusicWidget } from '@/components/widgets/MusicWidget/Widget';

// PersonalSpotifyPlayer and the curated body each render something
// distinctive we can assert on. Mock them to make the assertion trivial.
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyPlayer', () => ({
  PersonalSpotifyPlayer: () => <div data-testid="personal-player" />,
}));
// Use a vague match for the curated body; if the curated component has a
// stable export name, prefer mocking that. Adjust this mock to whatever
// component renders the curated front face in your widget code.

describe('MusicWidget render dispatch — personal Spotify gate', () => {
  it('renders the personal player when source=personal AND canAccessFeature is true', () => {
    canAccessFeatureMock.mockReturnValue(true);
    render(
      <MusicWidget widget={{ ...baseWidget, config: { source: 'personal' } }} />
    );
    expect(screen.getByTestId('personal-player')).toBeInTheDocument();
  });

  it('renders the curated body when source=personal but canAccessFeature is false', () => {
    canAccessFeatureMock.mockReturnValue(false);
    render(
      <MusicWidget widget={{ ...baseWidget, config: { source: 'personal' } }} />
    );
    // The personal player must NOT be mounted — that's the transparent
    // fallback the spec calls for.
    expect(screen.queryByTestId('personal-player')).not.toBeInTheDocument();
  });

  it('renders the curated body when source=curated regardless of gate', () => {
    canAccessFeatureMock.mockReturnValue(true);
    render(
      <MusicWidget widget={{ ...baseWidget, config: { source: 'curated' } }} />
    );
    expect(screen.queryByTestId('personal-player')).not.toBeInTheDocument();
  });
});
```

The `MusicWidget` import name might differ. Open `Widget.tsx` to confirm the exported component name and adjust.

- [ ] **Step 3: Run the tests — confirm the gate test fails**

Run: `pnpm vitest run tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`

Expected: the "renders curated when source=personal but canAccessFeature is false" test FAILS because the widget currently honors `source: 'personal'` regardless of permissions.

- [ ] **Step 4: Add the gate in `Widget.tsx`**

In `components/widgets/MusicWidget/Widget.tsx`, import `useAuth` (if not already) and compute `effectiveSource`:

```ts
import { useAuth } from '@/context/useAuth';
```

Replace the dispatch logic:

```tsx
const { canAccessFeature } = useAuth();
const canUsePersonal = canAccessFeature('personal-spotify');
const storedSource = widget.config.source ?? 'curated';
// When the gate is off, treat any stored `source: 'personal'` as curated.
// The stored config is preserved — re-enabling the gate brings personal
// playback back without the user doing anything.
const effectiveSource =
  canUsePersonal && storedSource === 'personal' ? 'personal' : 'curated';

return effectiveSource === 'personal' ? (
  <PersonalSpotifyPlayer widget={widget} />
) : (
  <CuratedPlayer widget={widget} />
);
```

Use the actual component names from the existing dispatch (the names above are illustrative — read the file).

- [ ] **Step 5: Run the tests — confirm they pass**

Run: `pnpm vitest run tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx`

Expected: all 5 tests in the file PASS.

- [ ] **Step 6: Commit**

```bash
git add components/widgets/MusicWidget/Widget.tsx tests/components/widgets/MusicWidget/personalSpotifyGate.test.tsx
git commit -m "feat(music): render-time gate for personal Spotify source in widget dispatch"
```

---

## Task 8: Full validate + push + open PR

- [ ] **Step 1: Run the full validation suite**

```bash
pnpm run validate
```

Expected: exit 0. This runs type-check, lint (`--max-warnings 0`), format-check, and tests. Per CLAUDE.md, this MUST pass before push or CI will block the PR.

If anything fails: fix it before continuing. Do not `--no-verify` or skip hooks.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/personal-spotify-gate
```

- [ ] **Step 3: Open the stacked PR**

```bash
gh pr create --base claude/spotify-widget-auth-NRZCZ --title "feat(admin): personal-spotify global feature gate with building scoping" --body "$(cat <<'EOF'
## Summary

Adds an admin gate (`personal-spotify`) for the per-teacher Spotify mode introduced in #1662. Admins control rollout via Global Settings: enabled toggle, accessLevel (admin/beta/public), and optional buildings restriction. When ungated for a user, the Music widget transparently renders curated stations — `source: 'personal'` config is preserved across gate flips.

**Stacked on #1662.** Rebase onto `dev-paul` when that PR squash-merges (per the stacked-PR rebase rule).

### Why default-off when no permission doc exists

Matches the `canSeeShareTracking` precedent. Personal Spotify depends on Firebase Functions secrets, Spotify dashboard redirect URIs, and an OAuth flow — if any are misconfigured, defaulting to ON would surface a broken Connect button to every teacher. Default-off forces explicit admin opt-in.

### Generic `buildings?` field

`buildings?: string[]` is a new optional field on `GlobalFeaturePermission`. Empty/undefined = "no restriction." It's centralised in `resolvePermissionAccess`, so any future global feature can opt in by setting the field — no per-feature code needed. The 15 existing global features are unaffected (field is optional).

## Test plan

- [ ] **Admin UI**: As an admin, navigate to Admin Settings → Global Settings. "Personal Spotify" appears in the list with the Music2 icon and description. Toggle `enabled: true`, `accessLevel: 'admin'`, leave buildings empty. Save.
- [ ] **Default-off**: Sign in as a non-admin teacher with the permission doc deleted. Open a Music widget — Source toggle is absent; only curated stations render.
- [ ] **Admin-only**: With `accessLevel: 'admin'`, non-admin teachers do not see the source toggle.
- [ ] **Beta**: With `accessLevel: 'beta'` and a beta user's email in the list, that user sees the toggle.
- [ ] **Public**: With `accessLevel: 'public'`, all signed-in teachers see the toggle.
- [ ] **Building gate**: With `buildings: ['high']`, teachers whose `selectedBuildings` includes `'high'` see the toggle; others do not.
- [ ] **Transparent fallback**: Configure a Music widget with `source: 'personal'` while gated in. Then revoke access (set `accessLevel: 'admin'` or remove from buildings). The same widget now renders curated; the stored `source: 'personal'` is preserved. Re-enable access — personal mode comes back without re-configuring.
- [ ] **Admin bypass building**: Admins bypass building restriction (the existing admin bypass on accessLevel cascades through resolvePermissionAccess).
- [ ] **No regression**: Existing 15 global features behave identically. Run `pnpm vitest run tests/context/` and confirm all AuthContext tests pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Verify CI is running**

The push triggers PR validation (type-check + lint + format-check + build). Watch for green:

```bash
gh pr checks
```

Expected: all checks queued/passing within ~5 minutes. If anything fails, fix locally and push again.

---

## Self-review checklist (run by the implementer before declaring done)

- [ ] **Spec coverage:** Every section of `docs/superpowers/specs/2026-05-18-personal-spotify-gate-design.md` has a corresponding task. Data model (Task 1) ✓ Gate enforcement (Tasks 2, 3) ✓ Admin UI (Tasks 4, 5) ✓ Music widget gating, all 3 surfaces (Tasks 6, 7) ✓ Testing (Tasks 2, 3, 4, 6, 7) ✓ Rollout note (PR body) ✓.
- [ ] **No placeholders:** No "TBD", "TODO", "fill in" remain. Every code block in this plan is meant to be pasted with at most the name adjustments the step calls out.
- [ ] **Type consistency:** `buildings?: string[]` used everywhere. `'personal-spotify'` is the exact feature id. `canAccessFeature`, `resolvePermissionAccess`, `selectedBuildings`, `useAdminBuildings`, `PermissionBuildingMultiSelect` — all names match across tasks.
- [ ] **Out of scope respected:** No OAuth callable changes. No 15-feature backfill. No admin-managed building assignments. No drop-all-tokens admin action. No stored-config rewrites.
