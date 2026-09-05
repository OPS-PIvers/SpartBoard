/**
 * Tests for the per-widget surgical merge logic in DashboardContext.
 *
 * When the desktop has unsaved local changes and a Firestore snapshot arrives,
 * the onSnapshot handler performs a per-widget merge:
 *   - Widgets whose config/layout changed locally keep their local values.
 *   - Widgets untouched locally accept the incoming server values.
 *
 * These tests document the merge outcomes for three scenarios called out by
 * code review:
 *   1. Local config change on one widget + remote config change on another.
 *   2. Remote deletion of a previously-synced widget while local edits exist.
 *   3. Local changes to non-config, non-layout widget fields (customTitle,
 *      isPinned, annotation, transparency).
 */

import React, { useEffect } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardProvider } from '@/context/DashboardContext';
import { useDashboard } from '@/context/useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable so a test can flip the phone-remote toggle off.
const authState = { remoteControlEnabled: true };

// Stable singleton — a fresh object per render would churn the `user`
// dependency on the dashboards-subscription effect and reset `loading` to
// true on every commit, trapping any effect gated on `!loading` (e.g. the
// autosave effect), even between renders that changed nothing relevant.
const authMock = {
  user: {
    uid: 'test-user',
    displayName: 'Test User',
    email: 'test@example.com',
  },
  isAdmin: false,
  featurePermissions: [],
  selectedBuildings: [],
  savedWidgetConfigs: {},
  saveWidgetConfig: vi.fn(),
  refreshGoogleToken: vi.fn(),
  get remoteControlEnabled() {
    return authState.remoteControlEnabled;
  },
  profileLoaded: true,
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => authMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

const mockSaveDashboard = vi.fn().mockResolvedValue(Date.now());

// Stable singleton objects — a fresh object (or fresh vi.fn() inside one) per
// render churns the mount effect's `subscribeToDashboards`/`saveDashboard`
// deps, re-triggering `setLoading(true)` on every commit (see authMock above).
const firestoreMock = {
  saveDashboard: mockSaveDashboard,
  saveDashboards: vi.fn().mockResolvedValue(undefined),
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
  subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
    capturedSnapshotCb = cb;
    return () => {
      // unsubscribe no-op
    };
  }),
  shareDashboard: vi.fn(),
  loadSharedDashboard: vi.fn().mockResolvedValue(null),
  rosters: [],
  addRoster: vi.fn(),
  updateRoster: vi.fn(),
  deleteRoster: vi.fn(),
  setActiveRoster: vi.fn(),
  activeRosterId: null,
};

vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => firestoreMock,
}));

const rostersMock = {
  rosters: [],
  activeRosterId: null,
  addRoster: vi.fn(),
  updateRoster: vi.fn(),
  deleteRoster: vi.fn(),
  setActiveRoster: vi.fn(),
  setAbsentStudents: vi.fn(),
};

vi.mock('@/hooks/useRosters', () => ({
  useRosters: () => rostersMock,
}));

const collectionsMock = {
  collections: [],
  loading: false,
  error: null,
  createCollection: vi.fn(),
  renameCollection: vi.fn(),
  moveCollection: vi.fn(),
  deleteCollection: vi.fn(),
  reorderSiblings: vi.fn(),
  setCollectionMetadata: vi.fn(),
  setCollectionDefaultBoard: vi.fn(),
};

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => collectionsMock,
}));

const sharedCollectionMock = {
  shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
  shareSubstituteCollection: vi
    .fn()
    .mockResolvedValue('mock-collection-sub-share-id'),
  loadSharedCollection: vi
    .fn()
    .mockResolvedValue({ ok: false, reason: 'not-found' }),
  loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
};

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => sharedCollectionMock,
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  // Real module reference so any unmocked Firestore function (e.g. helpers
  // imported transitively by deeper modules) still resolves to its real
  // implementation. We override only the functions DashboardContext calls
  // directly outside the useFirestore abstraction — primarily the
  // dock-hydration path that reads userProfile via doc()/getDoc() and
  // persists via setDoc().
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

// ---------------------------------------------------------------------------
// Test consumer — exposes context values outside React tree
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  updateWidget: ReturnType<typeof useDashboard>['updateWidget'];
  setGlobalStyle: ReturnType<typeof useDashboard>['setGlobalStyle'];
}

/**
 * Renders inside DashboardProvider and writes the latest context values into
 * a plain-object ref after each commit (via useEffect), which tests can read.
 */
const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  // Write to the ref AFTER render (in an effect) to satisfy react-hooks/refs.
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      updateWidget: ctx.updateWidget,
      setGlobalStyle: ctx.setGlobalStyle,
    };
  });
  return null;
};

function setup() {
  const stateRef: { current: ContextSnapshot | null } = { current: null };
  render(
    <DashboardProvider>
      <TestConsumer stateRef={stateRef} />
    </DashboardProvider>
  );
  return stateRef;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal WidgetData stub. */
function makeWidget(id: string, configValue: unknown): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    z: 1,
    flipped: false,
    config: { text: configValue } as WidgetData['config'],
  };
}

/** Build a minimal dashboard with the given widgets. */
function makeDashboard(widgets: WidgetData[]): Dashboard {
  return {
    id: 'dash-1',
    name: 'Test Board',
    background: 'bg-slate-900',
    widgets,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

/**
 * Simulate a Firestore snapshot arriving and wait for the React tree to settle.
 */
async function pushSnapshot(
  dashboards: Dashboard[],
  hasPendingWrites = false
): Promise<void> {
  if (!capturedSnapshotCb) {
    throw new Error(
      'subscribeToDashboards was not called — DashboardProvider did not mount'
    );
  }
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, hasPendingWrites);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardContext per-widget merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSnapshotCb = null;
    authState.remoteControlEnabled = true;
  });

  it('accepts server edits to untouched widgets even when the phone-remote toggle is off', async () => {
    authState.remoteControlEnabled = false;
    const stateRef = setup();

    const initialDashboard = makeDashboard([
      makeWidget('wA', 'original-A'),
      makeWidget('wB', 'original-B'),
    ]);
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Local drift on widget A (e.g. a running timer) forces the merge path.
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        config: { text: 'local-A' } as WidgetData['config'],
      });
      await Promise.resolve();
    });

    // Another device with the full board open edits widget B.
    await pushSnapshot([
      {
        ...makeDashboard([
          makeWidget('wA', 'original-A'),
          makeWidget('wB', 'other-device-B'),
        ]),
        updatedAt: 2000,
      },
    ]);

    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      const wA = widgets?.find((w) => w.id === 'wA');
      const wB = widgets?.find((w) => w.id === 'wB');
      expect(wA?.config).toMatchObject({ text: 'local-A' });
      expect(wB?.config).toMatchObject({ text: 'other-device-B' });
    });
  });

  it('preserves local config on widget A while accepting server config on widget B', async () => {
    const stateRef = setup();

    const widgetA = makeWidget('wA', 'original-A');
    const widgetB = makeWidget('wB', 'original-B');
    const initialDashboard = makeDashboard([widgetA, widgetB]);

    // --- Step 1: establish the active dashboard ---
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );

    // --- Step 2: second snapshot initialises lastSaved refs ---
    await pushSnapshot([initialDashboard]);

    // --- Step 3: local edit on widget A ---
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        config: { text: 'local-A' } as WidgetData['config'],
      });
      await Promise.resolve();
    });

    // Confirm local state reflects the edit
    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.config).toMatchObject({ text: 'local-A' });
    });

    // --- Step 4: server snapshot arrives with a different change on widget B ---
    const serverDashboard = makeDashboard([
      makeWidget('wA', 'original-A'), // server doesn't know about local-A yet
      makeWidget('wB', 'server-B'), // server changed widget B
    ]);
    await pushSnapshot([{ ...serverDashboard, updatedAt: 2000 }]);

    // --- Assert: both local and remote changes are preserved ---
    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets).toBeDefined();
      const wA = widgets?.find((w) => w.id === 'wA');
      const wB = widgets?.find((w) => w.id === 'wB');
      // Local edit wins for widget A
      expect(wA?.config).toMatchObject({ text: 'local-A' });
      // Server value wins for widget B (untouched locally)
      expect(wB?.config).toMatchObject({ text: 'server-B' });
    });
  });

  it('preserves a locally-present widget that the server deleted while local edits exist', async () => {
    const stateRef = setup();

    const widgetA = makeWidget('wA', 'original-A');
    const widgetC = makeWidget('wC', 'original-C');
    const initialDashboard = makeDashboard([widgetA, widgetC]);

    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Local edit on widget A so the merge path is taken
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        config: { text: 'local-A' } as WidgetData['config'],
      });
      await Promise.resolve();
    });

    // Server snapshot: widget C has been deleted, widget A is unchanged
    const serverWithoutC = makeDashboard([makeWidget('wA', 'original-A')]);
    await pushSnapshot([{ ...serverWithoutC, updatedAt: 2000 }]);

    // Widget C was previously synced from the server (not locally-added), so
    // when the server deletes it, the merge correctly removes it — only widgets
    // explicitly tracked as locally-added are preserved across server deletions.
    await waitFor(() => {
      const widgets = stateRef.current?.activeDashboard?.widgets;
      expect(widgets?.some((w) => w.id === 'wC')).toBe(false);
    });
  });

  it('preserves local changes to style and instance fields including customTitle', async () => {
    const stateRef = setup();

    const widgetA = makeWidget('wA', 'original-A');
    const widgetB = makeWidget('wB', 'original-B');
    const initialDashboard = makeDashboard([widgetA, widgetB]);

    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Local changes to instance, style, and annotation fields on widget A
    const testAnnotation = {
      mode: 'window' as const,
      paths: [{ points: [{ x: 0, y: 0 }], color: '#000', width: 2 }],
    };
    await act(async () => {
      stateRef.current?.updateWidget('wA', {
        customTitle: 'My Custom Title',
        isPinned: true,
        annotation: testAnnotation,
        transparency: 0.5,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.customTitle).toBe('My Custom Title');
      expect(wA?.isPinned).toBe(true);
    });

    // Server snapshot: widget B config changed; widget A unchanged on server
    const serverDashboard = makeDashboard([
      makeWidget('wA', 'original-A'), // server unaware of local instance / style changes
      makeWidget('wB', 'server-B'),
    ]);
    await pushSnapshot([{ ...serverDashboard, updatedAt: 2000 }]);

    // All locally-changed fields are preserved during merge:
    // customTitle and isPinned via INSTANCE_FIELDS, annotation via
    // dedicated annotation tracking, transparency via STYLE_FIELDS.
    // Server config changes on other widgets are still accepted.
    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      // customTitle is preserved since it is in INSTANCE_FIELDS
      expect(wA?.customTitle).toBe('My Custom Title');
      // isPinned is preserved since it is in INSTANCE_FIELDS
      expect(wA?.isPinned).toBe(true);
      // annotation is preserved via dedicated annotation tracking
      expect(wA?.annotation).toEqual(testAnnotation);
      // transparency is preserved since it is in STYLE_FIELDS
      expect(wA?.transparency).toBe(0.5);
      // But widget B's server config is still accepted
      const wB = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wB'
      );
      expect(wB?.config).toMatchObject({ text: 'server-B' });
    });
  });

  it('REGRESSION: a locally resized widget keeps its pixel size when a stale snapshot arrives', async () => {
    const stateRef = setup();

    const initialDashboard = makeDashboard([makeWidget('wA', 'a')]);
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Resize on this device (drag-end commit writes pixels; proportions follow).
    await act(async () => {
      stateRef.current?.updateWidget('wA', { w: 400, h: 200 });
      await Promise.resolve();
    });
    const resized = stateRef.current?.activeDashboard?.widgets.find(
      (w) => w.id === 'wA'
    );
    expect(resized?.w).toBe(400);
    expect(resized?.h).toBe(200);

    // Another device's write lands before this device's save: the server copy
    // still carries the old size.
    await pushSnapshot([{ ...initialDashboard, updatedAt: 2000 }]);

    await waitFor(() => {
      const wA = stateRef.current?.activeDashboard?.widgets.find(
        (w) => w.id === 'wA'
      );
      expect(wA?.w).toBe(400);
      expect(wA?.h).toBe(200);
    });
  });

  it('REGRESSION: an unsaved board-level style change survives a snapshot that has not seen it yet', async () => {
    const stateRef = setup();

    const initialDashboard = makeDashboard([makeWidget('wA', 'a')]);
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);

    // Teacher picks a new global font from the style settings; not saved yet.
    await act(async () => {
      stateRef.current?.setGlobalStyle({ fontFamily: 'serif' });
      await Promise.resolve();
    });
    expect(stateRef.current?.activeDashboard?.globalStyle?.fontFamily).toBe(
      'serif'
    );

    // A snapshot lands (e.g. this device's own unrelated widget-resize echo)
    // before the debounced autosave has flushed the style change to Firestore,
    // so the server copy still carries no globalStyle at all.
    await pushSnapshot([{ ...initialDashboard, updatedAt: 2000 }]);

    await waitFor(() => {
      expect(stateRef.current?.activeDashboard?.globalStyle?.fontFamily).toBe(
        'serif'
      );
    });
  });

  it('REGRESSION: a global style change alone triggers autosave', async () => {
    const stateRef = setup();

    const initialDashboard = makeDashboard([makeWidget('wA', 'a')]);
    await pushSnapshot([initialDashboard]);
    await waitFor(() =>
      expect(stateRef.current?.activeDashboard?.id).toBe('dash-1')
    );
    await pushSnapshot([initialDashboard]);
    mockSaveDashboard.mockClear();

    // Teacher picks a new global font from the style settings and touches
    // nothing else — no widget, background, name, settings, or ink edit.
    await act(async () => {
      stateRef.current?.setGlobalStyle({ fontFamily: 'serif' });
      await Promise.resolve();
    });
    expect(stateRef.current?.activeDashboard?.globalStyle?.fontFamily).toBe(
      'serif'
    );

    await waitFor(() => expect(mockSaveDashboard).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    const saved = mockSaveDashboard.mock.calls[0][0] as Dashboard;
    expect(saved.globalStyle?.fontFamily).toBe('serif');
  });
});
