import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardProvider } from './DashboardContext';
import { useDashboard } from './useDashboard';
import { Dashboard, WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks (mirrors DashboardContext.bringToFront.test.tsx)
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
// Harness
// ---------------------------------------------------------------------------

interface ContextSnapshot {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  loading: boolean;
  isSaving: boolean;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  loadDashboard: (id: string) => void;
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
      isSaving: ctx.isSaving,
      updateWidget: ctx.updateWidget,
      loadDashboard: ctx.loadDashboard,
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

function makeWidget(id: string, text = 'test'): WidgetData {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
    config: { text },
  };
}

function makeDashboard(
  widgets: WidgetData[],
  id: string,
  updatedAt = 1000
): Dashboard {
  return {
    id,
    name: `Board ${id}`,
    background: 'bg-slate-900',
    widgets,
    createdAt: 1000,
    updatedAt,
  };
}

const boardA = () => makeDashboard([makeWidget('a1')], 'dash-a');
const boardB = () => makeDashboard([makeWidget('b1')], 'dash-b');

async function pushSnapshot(dashboards: Dashboard[]): Promise<void> {
  if (!capturedSnapshotCb) throw new Error('Provider not mounted');
  const cb = capturedSnapshotCb;
  await act(async () => {
    cb(dashboards, false);
    await Promise.resolve();
  });
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function settle(stateRef: { current: ContextSnapshot | null }) {
  await pushSnapshot([boardA(), boardB()]);
  await tick(0);
  if (stateRef.current?.activeDashboard?.id !== 'dash-a')
    throw new Error('dash-a did not load');
}

interface Deferred {
  resolve: (v: number) => void;
  reject: (e: unknown) => void;
}

/** Makes the next save hang until the test settles it. */
function holdNextSave(): Deferred {
  const d = {} as Deferred;
  saveDashboardMock.mockImplementationOnce(
    () =>
      new Promise<number>((resolve, reject) => {
        d.resolve = resolve;
        d.reject = reject;
      })
  );
  return d;
}

const savedIds = () =>
  saveDashboardMock.mock.calls.map((c) => (c[0] as Dashboard).id);
const baselineWidgetIds = (call: unknown[]) =>
  (call[1] as { widgets: WidgetData[] } | undefined)?.widgets.map((w) => w.id);
const widgetText = (
  stateRef: { current: ContextSnapshot | null },
  boardId: string,
  widgetId: string
) =>
  (
    stateRef.current?.dashboards
      .find((d) => d.id === boardId)
      ?.widgets.find((w) => w.id === widgetId)?.config as
      { text?: string } | undefined
  )?.text;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardContext board switch save', () => {
  beforeEach(() => {
    capturedSnapshotCb = null;
    saveDashboardMock.mockReset();
    saveDashboardMock.mockResolvedValue(Date.now());
    firestoreMock.subscribeToDashboards.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a save of the old board that lands after the switch doesn't become the new board's baseline", async () => {
    const stateRef = setup();
    await settle(stateRef);

    const inFlight = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-a' } });
    });
    await tick(900);
    expect(savedIds()).toEqual(['dash-a']);

    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    await act(async () => {
      inFlight.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });

    saveDashboardMock.mockClear();
    act(() => {
      stateRef.current?.updateWidget('b1', { config: { text: 'edit-b' } });
    });
    await tick(900);
    const bSave = saveDashboardMock.mock.calls.find(
      (c) => (c[0] as Dashboard).id === 'dash-b'
    );
    expect(bSave).toBeDefined();
    expect(baselineWidgetIds(bSave as unknown[])).toEqual(['b1']);
  });

  it('a queued save of the old board still merges against its own baseline after the switch', async () => {
    const stateRef = setup();
    await settle(stateRef);

    const first = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-1' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-2' } });
    });
    // The second save is queued behind the first on the chain.
    await tick(900);
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);

    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    await act(async () => {
      first.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(0);

    const aSaves = saveDashboardMock.mock.calls.filter(
      (c) => (c[0] as Dashboard).id === 'dash-a'
    );
    expect(aSaves.length).toBeGreaterThanOrEqual(2);
    // Never a blind whole-board write (no baseline) for the old board.
    for (const call of aSaves) {
      expect(baselineWidgetIds(call)).toEqual(['a1']);
    }
  });

  it('the switch flush waits for the save already in flight', async () => {
    const stateRef = setup();
    await settle(stateRef);

    const inFlight = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-1' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-2' } });
    });
    await tick(100);
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      inFlight.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(0);
    expect(savedIds()).toEqual(['dash-a', 'dash-a']);
    const flushed = saveDashboardMock.mock.calls[1][0] as Dashboard;
    expect(
      (flushed.widgets.find((w) => w.id === 'a1')?.config as { text: string })
        .text
    ).toBe('edit-2');
  });

  it('retries a failed switch flush and keeps the edit on the old board until it lands', async () => {
    const stateRef = setup();
    await settle(stateRef);

    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'unsaved-a' } });
    });
    await tick(100);
    saveDashboardMock.mockRejectedValueOnce(new Error('network'));
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    expect(savedIds()).toEqual(['dash-a']);

    // The server still has the old copy; it must not replace the unsaved edit.
    await pushSnapshot([boardA(), boardB()]);
    await tick(0);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('unsaved-a');

    await tick(2500);
    expect(savedIds()).toEqual(['dash-a', 'dash-a']);
    const retried = saveDashboardMock.mock.calls[1];
    expect(
      ((retried[0] as Dashboard).widgets[0].config as { text: string }).text
    ).toBe('unsaved-a');
    expect(baselineWidgetIds(retried)).toEqual(['a1']);

    // Once it lands, the old board follows the server again.
    await pushSnapshot([
      makeDashboard([makeWidget('a1', 'later-remote')], 'dash-a', 3000),
      boardB(),
    ]);
    await tick(0);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('later-remote');
  });

  it('switching back to a board whose flush failed keeps the edit unsaved and saves it', async () => {
    const stateRef = setup();
    await settle(stateRef);

    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'unsaved-a' } });
    });
    await tick(100);
    saveDashboardMock.mockRejectedValueOnce(new Error('network'));
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
    });
    await tick(900);

    const aSaves = saveDashboardMock.mock.calls.filter(
      (c) => (c[0] as Dashboard).id === 'dash-a'
    );
    expect(aSaves.length).toBe(2);
    expect(
      ((aSaves[1][0] as Dashboard).widgets[0].config as { text: string }).text
    ).toBe('unsaved-a');
  });

  it('the hidden-tab flush waits for the save already in flight', async () => {
    const stateRef = setup();
    await settle(stateRef);

    const inFlight = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-1' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-2' } });
    });
    await tick(100);

    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
      });
    } finally {
      visibility.mockRestore();
    }
    expect(saveDashboardMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      inFlight.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(0);
    expect(saveDashboardMock).toHaveBeenCalledTimes(2);
  });
  it('clears the saving indicator after switching right after a save landed', async () => {
    const stateRef = setup();
    await settle(stateRef);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-a' } });
    });
    await tick(900);
    expect(stateRef.current?.isSaving).toBe(true);
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(5000);
    expect(stateRef.current?.isSaving).toBe(false);
  });

  it('switching back while the switch flush is in flight keeps the flushed baseline', async () => {
    const stateRef = setup();
    await settle(stateRef);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-a' } });
    });
    await tick(100);
    const flush = holdNextSave();
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    expect(savedIds()).toEqual(['dash-a']);
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
    });
    await tick(0);
    await act(async () => {
      flush.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    const localA = stateRef.current?.dashboards.find((d) => d.id === 'dash-a');
    const version = localA?.widgets[0].version ?? 0;
    // Another device edits a1 after the flush landed.
    await pushSnapshot([
      makeDashboard(
        [{ ...makeWidget('a1', 'remote'), version: version + 1 }],
        'dash-a',
        5000
      ),
      boardB(),
    ]);
    await tick(3000);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('remote');
    for (const call of saveDashboardMock.mock.calls.slice(1)) {
      const saved = call[0] as Dashboard;
      if (saved.id !== 'dash-a') continue;
      expect((saved.widgets[0].config as { text: string }).text).not.toBe(
        'edit-a'
      );
    }
  });

  it('switching back while a debounced save is in flight keeps that save as the baseline', async () => {
    const stateRef = setup();
    await settle(stateRef);
    const inFlight = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-a' } });
    });
    await tick(900);
    expect(savedIds()).toEqual(['dash-a']);
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
    });
    await tick(0);
    await act(async () => {
      inFlight.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    const localA = stateRef.current?.dashboards.find((d) => d.id === 'dash-a');
    const version = localA?.widgets[0].version ?? 0;
    await pushSnapshot([
      makeDashboard(
        [{ ...makeWidget('a1', 'remote'), version: version + 1 }],
        'dash-a',
        5000
      ),
      boardB(),
    ]);
    await tick(3000);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('remote');
  });
  it('a save queued at the switch advances the parked baseline, so the flush adds no extra write', async () => {
    const stateRef = setup();
    await settle(stateRef);
    const first = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-1' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-2' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    await act(async () => {
      first.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(3000);
    const aSaves = saveDashboardMock.mock.calls.filter(
      (c) => (c[0] as Dashboard).id === 'dash-a'
    );
    expect(
      aSaves.map(
        (c) => ((c[0] as Dashboard).widgets[0].config as { text: string }).text
      )
    ).toEqual(['edit-1', 'edit-2']);
  });
  it("a held-back server copy older than the flush's write doesn't revert the old board", async () => {
    const stateRef = setup();
    await settle(stateRef);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'edit-a' } });
    });
    await tick(100);
    const flush = holdNextSave();
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    // A snapshot from before the flush committed.
    await pushSnapshot([boardA(), boardB()]);
    await tick(0);
    await act(async () => {
      flush.resolve(7777);
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(0);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('edit-a');

    // The flush's own echo is adopted normally.
    await pushSnapshot([
      makeDashboard([makeWidget('a1', 'edit-a')], 'dash-a', 7777),
      boardB(),
    ]);
    await tick(0);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('edit-a');
  });

  it('switching back to a clean parked board shows the server copy held back meanwhile', async () => {
    const stateRef = setup();
    await settle(stateRef);
    // B's save hangs, so A's switch flush stays queued behind it.
    const bSave = holdNextSave();
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    act(() => {
      stateRef.current?.updateWidget('b1', { config: { text: 'edit-b' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
    });
    await tick(0);
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    // Another device edits A while it is parked.
    await pushSnapshot([
      makeDashboard([makeWidget('a1', 'remote-a')], 'dash-a', 4000),
      makeDashboard([makeWidget('b1', 'edit-b')], 'dash-b', 4000),
    ]);
    await tick(0);
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
    });
    await tick(0);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('remote-a');
    await act(async () => {
      bSave.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(3000);
    const aSaves = saveDashboardMock.mock.calls.filter(
      (c) => (c[0] as Dashboard).id === 'dash-a'
    );
    expect(aSaves).toHaveLength(0);
  });

  it('a switch flush that never settles is retried', async () => {
    const stateRef = setup();
    await settle(stateRef);
    act(() => {
      stateRef.current?.updateWidget('a1', { config: { text: 'unsaved-a' } });
    });
    await tick(100);
    saveDashboardMock.mockImplementationOnce(
      () => new Promise<number>(() => undefined)
    );
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    expect(savedIds()).toEqual(['dash-a']);
    await tick(65_000);
    expect(savedIds()).toEqual(['dash-a', 'dash-a']);
  });
  it("a snapshot right after adopting the held-back copy doesn't undo it or save the stale copy", async () => {
    const boardC = () => makeDashboard([makeWidget('c1')], 'dash-c');
    const fire: { armed: Dashboard[] | null } = { armed: null };
    // Fires a snapshot from a sibling effect in the same commit, before the adoption renders.
    const Fire: React.FC<{ n: number }> = ({ n }) => {
      useEffect(() => {
        if (!fire.armed || !capturedSnapshotCb) return;
        const boards = fire.armed;
        fire.armed = null;
        capturedSnapshotCb(boards, false);
      }, [n]);
      return null;
    };
    const bump = { current: (): void => undefined };
    const stateRef: { current: ContextSnapshot | null } = { current: null };
    const Root: React.FC = () => {
      const [n, setN] = React.useState(0);
      React.useLayoutEffect(() => {
        bump.current = () => setN((x) => x + 1);
      });
      return (
        <>
          <DashboardProvider>
            <TestConsumer stateRef={stateRef} />
          </DashboardProvider>
          <Fire n={n} />
        </>
      );
    };
    render(<Root />);
    await pushSnapshot([boardA(), boardB(), boardC()]);
    await tick(0);
    act(() => {
      stateRef.current?.loadDashboard('dash-c');
    });
    await tick(0);
    const cSave = holdNextSave();
    act(() => {
      stateRef.current?.updateWidget('c1', { config: { text: 'edit-c' } });
    });
    await tick(900);
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
    });
    await tick(0);
    act(() => {
      stateRef.current?.loadDashboard('dash-b');
    });
    await tick(0);
    const remote = () => [
      makeDashboard(
        [{ ...makeWidget('a1', 'remote'), version: 5 }],
        'dash-a',
        7000
      ),
      boardB(),
      boardC(),
    ];
    await pushSnapshot(remote());
    await tick(0);
    fire.armed = remote();
    act(() => {
      stateRef.current?.loadDashboard('dash-a');
      bump.current();
    });
    await tick(0);
    await act(async () => {
      cSave.resolve(Date.now());
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick(3000);
    expect(widgetText(stateRef, 'dash-a', 'a1')).toBe('remote');
    const aTexts = saveDashboardMock.mock.calls
      .filter((c) => (c[0] as Dashboard).id === 'dash-a')
      .map(
        (c) => ((c[0] as Dashboard).widgets[0].config as { text: string }).text
      );
    expect(aTexts).not.toContain('test');
  });
});
