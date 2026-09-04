import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, DrawableObject, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.saveStarvation.test.tsx)
// ---------------------------------------------------------------------------

// Stable singleton — fresh objects per render churn identity-sensitive deps
// and pin `loading` true, which would trap the auto-save effect.
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
  googleAccessToken: null,
  remoteControlEnabled: true,
  profileLoaded: true,
};

vi.mock('./useAuth', () => ({
  useAuth: () => authMock,
}));

const exportDashboardMock = vi.fn().mockResolvedValue('drive-file-1');
const driveServiceMock = {
  exportDashboard: exportDashboardMock,
  updateFileContent: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue({ id: 'pii-file' }),
  listFiles: vi.fn().mockResolvedValue([]),
  downloadFile: vi.fn().mockResolvedValue(null),
  getFileContent: vi.fn().mockResolvedValue(null),
};
const driveMock = {
  driveService: driveServiceMock,
  userDomain: 'example.com',
  isConnected: true,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;

const saveDashboardMock = vi.fn().mockResolvedValue(Date.now());

const firestoreMock = {
  saveDashboard: saveDashboardMock,
  saveDashboards: vi.fn().mockResolvedValue(undefined),
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

interface Snap {
  loading: boolean;
  activeDashboard: Dashboard | null;
  addAnnotationObject: (o: DrawableObject) => boolean;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const Probe: React.FC<{ stateRef: { current: Snap | null } }> = ({
  stateRef,
}) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      loading: ctx.loading,
      activeDashboard: ctx.activeDashboard,
      addAnnotationObject: ctx.addAnnotationObject,
      updateWidget: ctx.updateWidget,
    };
  });
  return null;
};

const widget = (id: string): WidgetData => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  z: 1,
  flipped: false,
  config: { text: 'hello' } as WidgetData['config'],
});

// `driveFileId` is preset so the save path's own first-export branch stays
// out of the way — this file is about the background Drive sync effect.
const board = (): Dashboard => ({
  id: 'dash-1',
  name: 'Board',
  background: 'bg-slate-900',
  widgets: [widget('w1')],
  createdAt: 1000,
  updatedAt: 1000,
  driveFileId: 'drive-file-1',
});

const stroke = (id: string): DrawableObject => ({
  id,
  kind: 'rect',
  z: 1,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  stroke: '#000',
  strokeWidth: 2,
});

async function setup(): Promise<{ current: Snap | null }> {
  const stateRef: { current: Snap | null } = { current: null };
  render(
    <DashboardProvider>
      <Probe stateRef={stateRef} />
    </DashboardProvider>
  );
  const cb = capturedSnapshotCb;
  if (!cb) throw new Error('Provider not mounted');
  await act(async () => {
    cb([board()], false);
    await vi.advanceTimersByTimeAsync(0);
  });
  if (!stateRef.current?.activeDashboard)
    throw new Error('active dashboard not loaded');
  // Let the load-time migration/hydration churn settle: its auto-save and its
  // Drive export both fire and the dedupe refs catch up, so each test starts
  // from a board that is fully in sync.
  await advance(12000);
  saveDashboardMock.mockClear();
  exportDashboardMock.mockClear();
  return stateRef;
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('DashboardContext annotation save cadence', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockClear();
    saveDashboardMock.mockResolvedValue(Date.now());
    exportDashboardMock.mockClear();
    exportDashboardMock.mockResolvedValue('drive-file-1');
    firestoreMock.subscribeToDashboards.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Every stroke rewrites the whole board document. At the 800ms widget
  // debounce a teacher inking a diagram produced a full-board write per
  // stroke pause; ink-only edits now coalesce over a longer idle window.
  it('ink-only edits wait longer than the widget debounce', async () => {
    const stateRef = await setup();

    act(() => {
      stateRef.current?.addAnnotationObject(stroke('s1'));
    });

    await advance(900);
    expect(saveDashboardMock).not.toHaveBeenCalled();

    await advance(1800);
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
    const saved = saveDashboardMock.mock.calls[0][0] as Dashboard;
    expect(saved.annotationOverlay?.objects.map((o) => o.id)).toEqual(['s1']);
  });

  it('a widget edit still uses the normal 800ms debounce', async () => {
    const stateRef = await setup();

    act(() => {
      stateRef.current?.updateWidget('w1', { z: 5 });
    });

    await advance(900);
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  // Regression: the Drive sync effect deduped on a serialization that now
  // includes ink, so every annotation session re-exported the whole board.
  it('REGRESSION: an ink-only edit does not re-export the board to Drive', async () => {
    const stateRef = await setup();

    act(() => {
      stateRef.current?.addAnnotationObject(stroke('s1'));
    });
    await advance(6000);
    expect(exportDashboardMock).not.toHaveBeenCalled();

    // A real board edit still exports, carrying whatever ink is current.
    act(() => {
      stateRef.current?.updateWidget('w1', { z: 5 });
    });
    await advance(6000);
    expect(exportDashboardMock).toHaveBeenCalledTimes(1);
  });

  // The 3s unsaved-edit ceiling clamped the 2.5s ink debounce, so sustained
  // drawing forced a whole-document transactional write roughly every 3s.
  // Ink-only edits now get a 15s ceiling instead.
  it('REGRESSION: sustained inking does not force a full write every 3 seconds', async () => {
    const stateRef = await setup();

    // Ten seconds of steady inking, one stroke per second — every stroke
    // lands inside the 2.5s debounce window, so nothing should be written.
    for (let i = 0; i < 10; i++) {
      act(() => {
        stateRef.current?.addAnnotationObject(stroke(`s${i}`));
      });
      await advance(1000);
    }
    expect(saveDashboardMock).not.toHaveBeenCalled();

    // Past the 15s ink ceiling the write is forced even with strokes arriving.
    for (let i = 10; i < 16; i++) {
      act(() => {
        stateRef.current?.addAnnotationObject(stroke(`s${i}`));
      });
      await advance(1000);
    }
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);
  });

  // The longer ceiling is ink-only: a widget edit keeps the 3s bound.
  it('a widget edit still hits the 3s unsaved-edit ceiling', async () => {
    const stateRef = await setup();

    for (let i = 0; i < 5; i++) {
      act(() => {
        stateRef.current?.updateWidget('w1', { z: 5 + i });
      });
      await advance(700);
    }
    expect(saveDashboardMock).toHaveBeenCalled();
  });

  // Strokes no longer reschedule the export, so cancelling on every effect
  // re-run would let a long annotation session postpone a queued widget edit
  // out of Drive forever. The queued export survives the whole session.
  it('a long annotation session does not postpone a queued Drive export', async () => {
    const stateRef = await setup();

    act(() => {
      stateRef.current?.updateWidget('w1', { z: 5 });
    });

    // Ten seconds of steady inking, one stroke per second.
    for (let i = 0; i < 10; i++) {
      await advance(1000);
      act(() => {
        stateRef.current?.addAnnotationObject(stroke(`s${i}`));
      });
    }

    expect(exportDashboardMock).toHaveBeenCalledTimes(1);
  });
});
