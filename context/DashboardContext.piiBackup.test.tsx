import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

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
