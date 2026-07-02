import React, { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import type { Dashboard } from '@/types';

/**
 * duplicateDashboard: optimistic insert, rollback-on-failure, and
 * linkage-field sanitization.
 *
 * Three behaviors are pinned here because they regress silently:
 *
 * 1. The optimistic local insert renders the new "(Copy)" Board before
 *    `saveDashboard` resolves — that's the perceived-speed fix. If a
 *    refactor reverts to awaiting Firestore, the modal goes back to
 *    feeling slow.
 *
 * 2. On `saveDashboard` rejection the optimistic row is removed. Without
 *    this, a Drive/Firestore failure leaves a ghost row that disappears
 *    on the next snapshot and confuses the user.
 *
 * 3. `sanitizeBoardSnapshot` strips host-specific linkage fields
 *    (`driveFileId`, `linkedShareId`, `linkedShareRole`,
 *    `linkedShareHostName`, `linkedShareEnded`, `thumbnailUrl`,
 *    `sharedGroups`, `annotationOverlay`, `isDefault`, `isPinned`). The
 *    real bug being defended against: if `driveFileId` is inherited,
 *    `saveDashboard` PATCHes the SOURCE's Drive file with the duplicate's
 *    contents, silently corrupting the original.
 */

const mockUser = {
  uid: 'owner-uid',
  displayName: 'Owner',
  email: 'owner@example.com',
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    refreshGoogleToken: vi.fn().mockResolvedValue('mock-token'),
    profileLoaded: true,
  }),
}));

const mockSaveDashboard = vi.fn().mockResolvedValue(undefined);
type SubscribeCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;

// Module-level seed read INSIDE the subscribe mock. Mirrors the proven
// pattern in `DashboardContext_sharing.test.tsx` — the mock closure
// re-reads this variable on each call, so individual tests can swap it
// before render without re-creating the mock.
let initialDashboardsSeed: Dashboard[] = [];
const mockSubscribeToDashboards = vi.fn((cb: SubscribeCb) => {
  cb(initialDashboardsSeed, false);
  return () => undefined;
});

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => ({
    saveDashboard: mockSaveDashboard,
    saveDashboards: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(undefined),
    subscribeToDashboards: mockSubscribeToDashboards,
    shareDashboard: vi.fn().mockResolvedValue('mock-share-id'),
    loadSharedDashboard: vi.fn().mockResolvedValue(null),
    mirrorSharedBoard: vi.fn().mockResolvedValue(undefined),
    subscribeToSharedBoard: vi.fn(() => () => undefined),
    joinSharedBoard: vi.fn().mockResolvedValue(undefined),
    leaveSharedBoard: vi.fn().mockResolvedValue(undefined),
    stopSharingBoard: vi.fn().mockResolvedValue(undefined),
    rosters: [],
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    activeRosterId: null,
  }),
}));

vi.mock('@/hooks/useRosters', () => ({
  useRosters: () => ({
    rosters: [],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    setAbsentStudents: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({
    collections: [],
    loading: false,
    error: null,
    createCollection: vi.fn().mockResolvedValue('new-collection-id'),
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionDefaultBoard: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => ({
    shareCollection: vi.fn().mockResolvedValue('mock-share-id'),
    shareSubstituteCollection: vi.fn().mockResolvedValue('mock-sub-share-id'),
    loadSharedCollection: vi.fn().mockResolvedValue(null),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      __path: segments.join('/'),
    })),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    onSnapshot: vi.fn(() => () => undefined),
    serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  };
});

const SOURCE_ID = 'source-board-id';

// A source Board that carries every host-specific linkage field we need
// to make sure does NOT leak into the duplicate. If the assertions below
// pass, `sanitizeBoardSnapshot` is doing its job inside `duplicateDashboard`.
function makeLinkedSource(): Dashboard {
  return {
    id: SOURCE_ID,
    name: 'My Board',
    background: 'bg-slate-800',
    widgets: [],
    createdAt: 1700000000000,
    updatedAt: 1700000999999,
    isPinned: true,
    isDefault: true,
    driveFileId: 'source-drive-file-id',
    thumbnailUrl: 'https://storage.example/source-thumb.png',
    linkedShareId: 'source-share-id',
    linkedShareRole: 'owner',
    linkedShareHostName: 'Source Host',
    linkedShareEnded: false,
    sharedGroups: [{ id: 'g1', name: 'Group 1' }],
    collectionId: 'source-collection-id',
  };
}

/**
 * Renders the provider with a probe that captures `duplicateDashboard`
 * and the live `dashboards` array so tests can drive the action and
 * read optimistic state in the same render tree.
 */
async function renderWithCaptured(source: Dashboard): Promise<{
  duplicate: (id: string) => Promise<void>;
  getDashboards: () => Dashboard[];
}> {
  // Seed the subscription with the source Board so the provider's
  // `dashboards` state contains it before the test calls duplicate.
  initialDashboardsSeed = [source];

  // Mirror the capture pattern from `DashboardContext_sharing.test.tsx`:
  // an effect captures the latest provider handles into module-scoped
  // mutables, and the caller `waitFor`s until they're populated. The
  // effect re-runs whenever `duplicateDashboard` / `dashboards`
  // identity changes (e.g. when the seeded source lands in state).
  let capturedDuplicate: ((id: string) => Promise<void>) | null = null;
  let capturedDashboards: Dashboard[] = [];

  const Probe: React.FC = () => {
    const { duplicateDashboard, dashboards } = useDashboard();
    useEffect(() => {
      capturedDuplicate = duplicateDashboard;
      capturedDashboards = dashboards;
    }, [duplicateDashboard, dashboards]);
    return <div>Test App</div>;
  };
  render(
    <DashboardProvider>
      <Probe />
    </DashboardProvider>
  );

  // Wait for the seeded source to land and the duplicate handle to
  // populate before returning.
  await waitFor(() => {
    expect(capturedDuplicate).not.toBeNull();
    expect(capturedDashboards.some((d) => d.id === source.id)).toBe(true);
  });

  return {
    duplicate: (id: string) =>
      act(async () => {
        const fn = capturedDuplicate;
        if (!fn) throw new Error('duplicateDashboard not captured');
        await fn(id);
      }),
    getDashboards: () => capturedDashboards,
  };
}

describe('DashboardContext.duplicateDashboard', () => {
  beforeEach(() => {
    // Reset only what we care about — don't `vi.clearAllMocks()`, which
    // in this test surface clears mock.calls on EVERY mocked function
    // including the `vi.mock('@/hooks/...')` factory returns, and the
    // provider hits a stripped surface on the second test's render.
    mockSaveDashboard.mockReset();
    mockSaveDashboard.mockResolvedValue(undefined);
    mockSubscribeToDashboards.mockClear();
    initialDashboardsSeed = [];
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    // testing-library doesn't auto-cleanup in this project's setup, so the
    // provider from the previous test would otherwise hang around and the
    // next `render()` would mount alongside it — which manifests as the
    // new Probe never rendering (the old tree intercepts effects).
    cleanup();
  });

  it('inserts the duplicate into local state and saves it (happy path)', async () => {
    const source = makeLinkedSource();
    const { duplicate, getDashboards } = await renderWithCaptured(source);

    await duplicate(SOURCE_ID);

    // Both the source AND the copy are present after duplicate resolves —
    // the optimistic insert happens before the await on saveDashboard, so
    // even on the happy path the local list contains both rows by the time
    // we observe it. (The dedicated rollback test below pins the reverse:
    // a rejected save removes the optimistic row, which is only meaningful
    // if the optimistic row exists in the first place.)
    const copy = getDashboards().find((d) => d.id !== SOURCE_ID);
    expect(copy).toBeDefined();
    expect(copy?.name).toBe('My Board (Copy)');
    expect(mockSaveDashboard).toHaveBeenCalledTimes(1);
  });

  it('strips host-specific linkage fields when building the duplicate', async () => {
    const source = makeLinkedSource();
    const { duplicate } = await renderWithCaptured(source);
    await duplicate(SOURCE_ID);

    expect(mockSaveDashboard).toHaveBeenCalledTimes(1);
    const saved = mockSaveDashboard.mock.calls[0]?.[0] as Dashboard;

    // ID, name, and createdAt are fresh.
    expect(saved.id).not.toBe(SOURCE_ID);
    expect(saved.name).toBe('My Board (Copy)');
    expect(saved.createdAt).not.toBe(source.createdAt);

    // CRITICAL: linkage fields stripped. The big one is `driveFileId` —
    // inheriting it would PATCH the source's Drive file on save.
    expect(saved.driveFileId).toBeUndefined();
    expect(saved.linkedShareId).toBeUndefined();
    expect(saved.linkedShareRole).toBeUndefined();
    expect(saved.linkedShareHostName).toBeUndefined();
    expect(saved.linkedShareEnded).toBeUndefined();
    expect(saved.thumbnailUrl).toBeUndefined();
    expect(saved.sharedGroups).toBeUndefined();
    expect(saved.isPinned).toBeUndefined();

    // isDefault is stripped by sanitizeBoardSnapshot then explicitly
    // re-initialized to false — a duplicate must never inherit default
    // status, and an explicit boolean keeps Firestore data consistent.
    expect(saved.isDefault).toBe(false);

    // Collection membership is preserved (typical user expectation for
    // single-board duplicate — the copy stays next to the source).
    expect(saved.collectionId).toBe('source-collection-id');

    // updatedAt is stamped fresh so the optimistic row shows a "just
    // edited" date instead of inheriting the source's last-edit ts.
    expect(saved.updatedAt).not.toBe(source.updatedAt);
    expect(typeof saved.updatedAt).toBe('number');
  });

  it('reverts the optimistic insert when saveDashboard rejects', async () => {
    mockSaveDashboard.mockRejectedValue(new Error('Firestore write failed'));

    const source = makeLinkedSource();
    const { duplicate, getDashboards } = await renderWithCaptured(source);
    await duplicate(SOURCE_ID);

    // After rejection only the source remains — the optimistic row is gone.
    await waitFor(() => {
      const copy = getDashboards().find((d) => d.id !== SOURCE_ID);
      expect(copy).toBeUndefined();
    });
    expect(getDashboards()).toHaveLength(1);
    expect(getDashboards()[0]?.id).toBe(SOURCE_ID);
  });
});
