import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';
import type { DashboardContextValue } from './DashboardContextValue';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.configKeyMerge.test.tsx)
// ---------------------------------------------------------------------------

// Stable singleton — see firestoreMock note. Returning a fresh object/fns each
// render churns identity-sensitive deps (driveService memo, load effect) and
// keeps `loading` pinned true.
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

const recordPicks = vi.hoisted(() => vi.fn());
vi.mock('@/utils/boardItemPicks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/boardItemPicks')>()),
  recordBoardItemPicks: recordPicks,
}));

vi.mock('./useAuth', () => ({
  useAuth: () => authMock,
}));

const driveMock = {
  driveService: null,
  userDomain: 'example.com',
  isConnected: false,
};

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => driveMock,
}));

type SnapshotCb = (dashboards: Dashboard[], hasPendingWrites: boolean) => void;
let capturedSnapshotCb: SnapshotCb | null = null;
// Latest dashboards pushed via the snapshot. Replayed synchronously on every
// (re)subscribe, mirroring real Firestore — without this the load effect's
// re-subscriptions leave `loading` stuck true (no snapshot to clear it).
const saveDashboardMock = vi.fn().mockResolvedValue(Date.now());

// IMPORTANT: the mock returns a STABLE singleton object. The DashboardProvider
// load effect depends on `subscribeToDashboards`, so returning fresh function
// identities each render (as a naive `() => ({...})` mock does) would make that
// effect re-run every render, re-calling `setLoading(true)` forever and
// trapping the auto-save effect behind its `loading` guard.
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
  subscribeToSharedBoard: vi.fn(() => () => undefined),
  mirrorSharedBoard: vi.fn().mockResolvedValue(undefined),
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
  activeDashboard: Dashboard | null;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  addWidget: DashboardContextValue['addWidget'];
}

const TestConsumer: React.FC<{
  stateRef: { current: ContextSnapshot | null };
}> = ({ stateRef }) => {
  const ctx = useDashboard();
  useEffect(() => {
    stateRef.current = {
      activeDashboard: ctx.activeDashboard,
      updateWidget: ctx.updateWidget,
      addWidget: ctx.addWidget,
    };
  });
  return null;
};

const quizWidget = (selectedQuizId: string): WidgetData => ({
  id: 'q',
  type: 'quiz',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  z: 1,
  flipped: false,
  config: { view: 'manager', selectedQuizId },
});

const board = (
  selectedQuizId: string,
  link: Partial<Dashboard> = {
    linkedShareId: 'sh',
    linkedShareRole: 'owner',
    linkedShareEnded: false,
  }
): Dashboard => ({
  id: 'dash-1',
  name: 'Period 2',
  background: 'bg-slate-900',
  widgets: [quizWidget(selectedQuizId)],
  createdAt: 1000,
  updatedAt: 1000,
  ...link,
});

async function mount(dashboard: Dashboard) {
  const stateRef: { current: ContextSnapshot | null } = { current: null };
  render(
    <DashboardProvider>
      <TestConsumer stateRef={stateRef} />
    </DashboardProvider>
  );
  await push([dashboard]);
  if (!stateRef.current?.activeDashboard)
    throw new Error('active dashboard not loaded');
  return stateRef;
}

async function push(dashboards: Dashboard[]) {
  if (!capturedSnapshotCb) throw new Error('Provider not mounted');
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, false);
    await vi.advanceTimersByTimeAsync(0);
  });
}

const configOf = (stateRef: { current: ContextSnapshot | null }) =>
  stateRef.current?.activeDashboard?.widgets[0].config as Record<
    string,
    unknown
  >;

describe('DashboardProvider board item picks', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    recordPicks.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a quiz the teacher opens on a live shared board', async () => {
    const stateRef = await mount(board('q1'));
    act(() =>
      stateRef.current?.updateWidget('q', { config: { selectedQuizId: 'q2' } })
    );
    expect(recordPicks).toHaveBeenCalledWith('test-user', 'sh', ['quiz_q2']);
  });

  it('records the item a widget is added with on a live shared board', async () => {
    const stateRef = await mount(board('q1'));
    act(() =>
      stateRef.current?.addWidget('flashcards', {
        config: { presentSetId: 'f1' } as WidgetData['config'],
      })
    );
    expect(recordPicks).toHaveBeenCalledWith('test-user', 'sh', [
      'flashcards_f1',
    ]);
  });

  it('never records an item a co-editor’s change put on the widget', async () => {
    const stateRef = await mount(board('q1'));
    await push([board('planted')]);
    expect(configOf(stateRef).selectedQuizId).toBe('planted');
    // A later local edit that spreads the config keeps the planted id, so it is not a pick.
    act(() =>
      stateRef.current?.updateWidget('q', {
        config: { ...configOf(stateRef), view: 'editor' },
      })
    );
    expect(recordPicks).not.toHaveBeenCalled();
  });

  it('records nothing on a private board or one whose share ended', async () => {
    const stateRef = await mount(board('q1', {}));
    act(() =>
      stateRef.current?.updateWidget('q', { config: { selectedQuizId: 'q2' } })
    );
    await push([
      board('q2', {
        linkedShareId: 'sh',
        linkedShareRole: 'owner',
        linkedShareEnded: true,
      }),
    ]);
    act(() =>
      stateRef.current?.updateWidget('q', { config: { selectedQuizId: 'q3' } })
    );
    expect(recordPicks).not.toHaveBeenCalled();
  });
});
