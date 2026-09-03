import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import {
  Dashboard,
  Toast,
  WidgetConfig,
  WidgetData,
  WidgetType,
} from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.immediate.test.tsx)
// ---------------------------------------------------------------------------

// Admin user: exercises the path where the non-admin "full dashboard export"
// backup never runs, so the PII-supplement backup is the ONLY thing standing
// between an admin's roster data and permanent loss.
const authMock = {
  user: {
    uid: 'test-admin',
    displayName: 'Test Admin',
    email: 'admin@example.com',
  },
  isAdmin: true,
  featurePermissions: [],
  selectedBuildings: [],
  savedWidgetConfigs: {},
  saveWidgetConfig: vi.fn(),
  refreshGoogleToken: vi.fn(),
  googleAccessToken: null,
  remoteControlEnabled: true,
  profileLoaded: true,
};

vi.mock('./useAuth', () => ({
  useAuth: () => authMock,
}));

const uploadFileMock = vi
  .fn()
  .mockResolvedValue({ id: 'pii-file-1', name: 'dash-2-pii.json' });
const updateFileContentMock = vi.fn().mockResolvedValue(undefined);
const exportDashboardMock = vi.fn().mockResolvedValue('drive-file-id');
const listFilesMock = vi.fn().mockResolvedValue([]);

const driveMock = {
  driveService: {
    uploadFile: uploadFileMock,
    updateFileContent: updateFileContentMock,
    exportDashboard: exportDashboardMock,
    listFiles: listFilesMock,
  },
  userDomain: 'example.com',
  isConnected: true,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;
const saveDashboardMock = vi.fn().mockResolvedValue(Date.now());
const saveDashboardsMock = vi.fn().mockResolvedValue(undefined);

const firestoreMock = {
  saveDashboard: saveDashboardMock,
  saveDashboards: saveDashboardsMock,
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
  subscribeToDashboards: vi.fn((cb: SnapshotCb) => {
    capturedSnapshotCb = cb;
    return () => {
      // cleanup
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
    createCollection: vi.fn(),
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
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
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

// ---------------------------------------------------------------------------
// Test consumer
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  loading: boolean;
  reorderDashboards: (ids: string[]) => Promise<void>;
  updateWidgetConfigsAcrossBoards: (
    type: WidgetType,
    transform: (config: WidgetConfig) => WidgetConfig | null
  ) => Promise<void>;
  toasts: Toast[];
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      dashboards: ctx.dashboards,
      activeDashboard: ctx.activeDashboard,
      loading: ctx.loading,
      reorderDashboards: ctx.reorderDashboards,
      updateWidgetConfigsAcrossBoards: ctx.updateWidgetConfigsAcrossBoards,
      toasts: ctx.toasts,
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

function makePiiWidget(id: string): WidgetData {
  return {
    id,
    type: 'seating-chart',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
    // `names` is a roster PII field (see utils/dashboardPII.ts PII_WIDGET_FIELDS).
    config: { names: 'Alice\nBob' } as unknown as WidgetData['config'],
  };
}

function makeDashboard(id: string, widgets: WidgetData[]): Dashboard {
  return {
    id,
    name: `Board ${id}`,
    background: 'bg-slate-900',
    widgets,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

async function pushSnapshot(dashboards: Dashboard[]): Promise<void> {
  if (!capturedSnapshotCb) throw new Error('Provider not mounted');
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, false);
    await Promise.resolve();
  });
}

async function settleSnapshot(
  stateRef: { current: ContextSnapshot | null },
  dashboards: Dashboard[]
): Promise<void> {
  await pushSnapshot(dashboards);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  if (!stateRef.current?.activeDashboard)
    throw new Error('active dashboard not loaded');
  if (stateRef.current?.loading)
    throw new Error('loading did not settle to false');
}

describe('DashboardContext plural saveDashboards PII backup', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardsMock.mockClear();
    uploadFileMock.mockClear();
    updateFileContentMock.mockClear();
    exportDashboardMock.mockClear();
    listFilesMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('backs up an admin board containing PII to Drive before reordering scrubs it from Firestore', async () => {
    const stateRef = setup();
    const dash1 = makeDashboard('dash-1', []);
    const dash2 = makeDashboard('dash-2', [makePiiWidget('w-pii')]);
    await settleSnapshot(stateRef, [dash1, dash2]);
    saveDashboardsMock.mockClear();
    uploadFileMock.mockClear();

    await act(async () => {
      await stateRef.current?.reorderDashboards(['dash-2', 'dash-1']);
    });

    // The admin path never calls exportDashboard (that's non-admin only) —
    // the PII-supplement Drive upload must be the backup for admins.
    expect(exportDashboardMock).not.toHaveBeenCalled();
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'dash-2-pii.json',
      'Data/Dashboards'
    );

    // Firestore only ever receives the scrubbed dashboards.
    expect(saveDashboardsMock).toHaveBeenCalledTimes(1);
    const savedDashboards = saveDashboardsMock.mock.calls[0][0] as Dashboard[];
    const savedDash2 = savedDashboards.find((d) => d.id === 'dash-2');
    expect(
      (savedDash2?.widgets[0].config as Record<string, unknown>).names
    ).toBeUndefined();

    // The Drive backup must happen BEFORE the Firestore write, not after —
    // otherwise a crash/reload between the two steps would still lose PII.
    const uploadOrder = uploadFileMock.mock.invocationCallOrder[0];
    const firestoreOrder = saveDashboardsMock.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(firestoreOrder);
  });
});

describe('DashboardContext PII backup with no live Drive connection', () => {
  const realDriveService = driveMock.driveService;

  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardsMock.mockClear();
    uploadFileMock.mockClear();
    updateFileContentMock.mockClear();
    exportDashboardMock.mockClear();
    listFilesMock.mockClear();
    vi.useFakeTimers();
    // Simulates a teacher whose Google access token expired mid-session —
    // useGoogleDrive returns a null driveService until the token refreshes.
    driveMock.driveService = null as unknown as typeof realDriveService;
  });

  afterEach(() => {
    driveMock.driveService = realDriveService;
    vi.useRealTimers();
  });

  it('never writes scrubbed PII to Firestore when there is no Drive connection to back it up to', async () => {
    const stateRef = setup();
    const dash1 = makeDashboard('dash-1', []);
    const dash2 = makeDashboard('dash-2', [makePiiWidget('w-pii')]);
    await settleSnapshot(stateRef, [dash1, dash2]);
    saveDashboardsMock.mockClear();

    await act(async () => {
      await stateRef.current?.reorderDashboards(['dash-2', 'dash-1']);
    });

    // No Drive backup was possible, so the PII-bearing board must never be
    // handed to Firestore in scrubbed form — that would permanently lose the
    // roster names (no Drive copy exists, and Firestore only holds the
    // scrubbed version).
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(saveDashboardsMock).not.toHaveBeenCalled();

    // The save must fail loudly (matching the existing Drive-upload-failure
    // path) rather than silently succeeding with data loss.
    const errorToast = stateRef.current?.toasts.find((t) => t.type === 'error');
    expect(errorToast?.message).toContain('Failed to save the new board order');

    // The in-memory dashboard still has its PII field, ready to be backed up
    // and saved successfully once the Drive connection is restored.
    const liveDash2 = stateRef.current?.dashboards.find(
      (d) => d.id === 'dash-2'
    );
    expect(
      (liveDash2?.widgets[0].config as Record<string, unknown>).names
    ).toBe('Alice\nBob');
  });
});

describe('DashboardContext reorderDashboards rollback', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardsMock.mockClear();
    uploadFileMock.mockClear();
    updateFileContentMock.mockClear();
    exportDashboardMock.mockClear();
    listFilesMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts the local order and toasts an error when the Firestore save fails', async () => {
    const stateRef = setup();
    const dash1 = { ...makeDashboard('dash-1', []), order: 0 };
    const dash2 = { ...makeDashboard('dash-2', []), order: 1 };
    await settleSnapshot(stateRef, [dash1, dash2]);
    const orderBefore = stateRef.current?.dashboards.map((d) => d.id);
    saveDashboardsMock.mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      await stateRef.current?.reorderDashboards(['dash-2', 'dash-1']);
    });

    // Without a revert, the teacher would see an order that was never
    // persisted — it would silently snap back only on the next reload.
    expect(stateRef.current?.dashboards.map((d) => d.id)).toEqual(orderBefore);
    const errorToast = stateRef.current?.toasts.find((t) => t.type === 'error');
    expect(errorToast?.message).toContain('Failed to save');
  });

  it('does not clobber a dashboard added by a concurrent snapshot while the save is in flight', async () => {
    const stateRef = setup();
    const dash1 = { ...makeDashboard('dash-1', []), order: 0 };
    const dash2 = { ...makeDashboard('dash-2', []), order: 1 };
    await settleSnapshot(stateRef, [dash1, dash2]);

    // Hold the save pending so a concurrent snapshot can land mid-flight.
    let rejectSave: (err: Error) => void = () => undefined;
    saveDashboardsMock.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      })
    );

    const reorderPromise = act(async () => {
      await stateRef.current?.reorderDashboards(['dash-2', 'dash-1']);
    });

    // A brand-new dashboard arrives via the live onSnapshot listener before
    // the reorder's save has settled — e.g. created from another tab.
    const dash3 = { ...makeDashboard('dash-3', []), order: 2 };
    await pushSnapshot([dash1, dash2, dash3]);

    rejectSave(new Error('offline'));
    await reorderPromise;

    // A stale full-array revert (setDashboards(previousDashboards), captured
    // before dash-3 existed) would have wiped dash-3 out entirely.
    expect(stateRef.current?.dashboards.map((d) => d.id)).toContain('dash-3');
  });
});

function makeMaterialsWidget(id: string, selectedItems: string[]): WidgetData {
  return {
    id,
    type: 'materials',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
    config: { selectedItems, activeItems: [] } as unknown as WidgetConfig,
  };
}

describe('DashboardContext updateWidgetConfigsAcrossBoards rollback', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardsMock.mockClear();
    uploadFileMock.mockClear();
    updateFileContentMock.mockClear();
    exportDashboardMock.mockClear();
    listFilesMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts the optimistic config update on other boards, but not the active board, and toasts when the save fails', async () => {
    const stateRef = setup();
    // dash-1 becomes the active board (first loaded) and rides the normal
    // autosave, not this call's saveDashboards batch — its own optimistic
    // update must survive even though the other boards' save fails.
    const dashActive = makeDashboard('dash-1', [
      makeMaterialsWidget('w1', ['m1']),
    ]);
    const dash2 = makeDashboard('dash-2', [makeMaterialsWidget('w2', ['m1'])]);
    const dash3 = makeDashboard('dash-3', [makeMaterialsWidget('w3', ['m1'])]);
    await settleSnapshot(stateRef, [dashActive, dash2, dash3]);
    saveDashboardsMock.mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      await stateRef.current?.updateWidgetConfigsAcrossBoards(
        'materials',
        (config) => {
          const materialsConfig = config as unknown as {
            selectedItems: string[];
            activeItems: string[];
          };
          if (!materialsConfig.selectedItems.includes('m1')) return null;
          return {
            ...materialsConfig,
            selectedItems: materialsConfig.selectedItems.filter(
              (id) => id !== 'm1'
            ),
          } as unknown as WidgetConfig;
        }
      );
    });

    // Without a revert, the teacher's own UI would show "m1" as already
    // removed from dash-2/dash-3 even though nothing was ever persisted.
    const reverted2 = stateRef.current?.dashboards
      .find((d) => d.id === 'dash-2')
      ?.widgets.find((w) => w.id === 'w2')?.config as unknown as {
      selectedItems: string[];
    };
    const reverted3 = stateRef.current?.dashboards
      .find((d) => d.id === 'dash-3')
      ?.widgets.find((w) => w.id === 'w3')?.config as unknown as {
      selectedItems: string[];
    };
    expect(reverted2.selectedItems).toEqual(['m1']);
    expect(reverted3.selectedItems).toEqual(['m1']);

    // The active board's update was never part of the failed save — it must
    // NOT be reverted, or a local, already-independently-persisted change
    // would visibly snap back in the UI for an unrelated failure.
    const activeConfig = stateRef.current?.dashboards
      .find((d) => d.id === 'dash-1')
      ?.widgets.find((w) => w.id === 'w1')?.config as unknown as {
      selectedItems: string[];
    };
    expect(activeConfig.selectedItems).toEqual([]);

    const errorToast = stateRef.current?.toasts.find((t) => t.type === 'error');
    expect(errorToast?.message).toContain('syncing it to other boards failed');
  });
});
