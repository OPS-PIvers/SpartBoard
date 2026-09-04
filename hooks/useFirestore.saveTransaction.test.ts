import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useFirestore } from './useFirestore';
import {
  DASHBOARD_FIELDS,
  serializeDashboardField,
} from '@/utils/dashboardSaveMerge';
import type { Dashboard, WidgetData } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

type Fn = ReturnType<typeof vi.fn>;

const textOf = (w: WidgetData) => (w.config as { text: string }).text;

const widget = (id: string, text: string) =>
  ({
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    z: 1,
    flipped: false,
    config: { text },
  }) as WidgetData;

const board = (widgets: WidgetData[], updatedAt?: number) =>
  ({
    id: 'd1',
    name: 'B',
    background: 'bg',
    widgets,
    createdAt: 1,
    updatedAt,
  }) as Dashboard;

const baseline = (widgets: WidgetData[]) => ({
  widgets,
  background: 'bg',
  name: 'B',
  libraryOrder: '[]',
  settings: '{}',
  // Every board field absent on both sides, so the merge is free to take the
  // server's — which is how a legacy doc's missing collectionId gets noticed.
  dashboardFields: Object.fromEntries(
    DASHBOARD_FIELDS.map((f) => [f, serializeDashboardField(undefined)])
  ),
});

const mockTransaction = (serverDoc: Dashboard) => {
  const tx = {
    get: vi.fn().mockResolvedValue({
      exists: () => true,
      id: serverDoc.id,
      data: () => serverDoc,
    }),
    set: vi.fn(),
  };
  (firestore.runTransaction as unknown as Fn).mockImplementation(
    (_db: unknown, fn: (t: typeof tx) => Promise<void>) => fn(tx)
  );
  return tx;
};

describe('useFirestore – saveDashboard transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as Fn).mockReturnValue({});
    (firestore.collection as unknown as Fn).mockReturnValue({});
    (firestore.setDoc as unknown as Fn).mockResolvedValue(undefined);
  });

  it('writes directly when no baseline is supplied', async () => {
    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(board([widget('a', 'a')]));
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  it('folds a newer server copy into the write instead of overwriting it', async () => {
    const tx = mockTransaction(
      board([widget('a', 'a0'), widget('b', 'b-other-device')], 200)
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local'), widget('b', 'b0')]),
      baseline([widget('a', 'a0'), widget('b', 'b0')])
    );

    const written = tx.set.mock.calls[0][1] as Dashboard;
    expect(written.widgets.map(textOf)).toEqual(['a-local', 'b-other-device']);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('writes the local board as-is when the server has not moved', async () => {
    const tx = mockTransaction(board([widget('a', 'a0')], 100));

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')])
    );

    const written = tx.set.mock.calls[0][1] as Dashboard;
    expect(textOf(written.widgets[0])).toBe('a-local');
  });

  it('still merges when the server timestamp matches this device last write', async () => {
    // The save that folded in the other device's edit advanced updatedAt to a
    // value this device now owns. A timestamp gate would blind-write here and
    // undo that edit; the merge keeps it because the baseline still holds this
    // device's own pre-save copy of the widget.
    const tx = mockTransaction(
      board([widget('a', 'a0'), widget('b', 'b-other-device')], 500)
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local-2'), widget('b', 'b0')], 500),
      baseline([widget('a', 'a-local'), widget('b', 'b0')])
    );

    const written = tx.set.mock.calls[0][1] as Dashboard;
    expect(written.widgets.map(textOf)).toEqual([
      'a-local-2',
      'b-other-device',
    ]);
  });

  it('falls back to a queued setDoc when the transaction fails because we are offline', async () => {
    // Transactions need a live server read and reject outright offline, where
    // the old blind setDoc queued and flushed on reconnect.
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      Object.assign(new Error('client is offline'), { code: 'unavailable' })
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')])
    );

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const written = (firestore.setDoc as unknown as Fn).mock
      .calls[0][1] as Dashboard;
    expect(textOf(written.widgets[0])).toBe('a-local');
  });

  it('reports a queued fallback write that later rejects', async () => {
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      Object.assign(new Error('client is offline'), { code: 'unavailable' })
    );
    (firestore.setDoc as unknown as Fn).mockRejectedValue(
      new Error('never landed')
    );
    const onDeferredWriteFailed = vi.fn();

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')]),
      onDeferredWriteFailed
    );
    // The fallback is deliberately un-awaited, so its rejection settles on a
    // later microtask — without the .catch it is an unhandled rejection and
    // the edit is silently lost.
    await Promise.resolve();
    await Promise.resolve();

    expect(onDeferredWriteFailed).toHaveBeenCalledTimes(1);
  });

  it('does not treat a permission-denied failure as offline just because the browser is', async () => {
    // navigator.onLine is a hint, not a verdict: a blind setDoc fallback here
    // would queue an overwrite of the server copy the rules just refused.
    const onLine = vi
      .spyOn(navigator, 'onLine', 'get')
      .mockReturnValue(false as unknown as boolean);
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'permission-denied' })
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await expect(
      result.current.saveDashboard(
        board([widget('a', 'a-local')]),
        baseline([widget('a', 'a0')])
      )
    ).rejects.toThrow('nope');
    expect(firestore.setDoc).not.toHaveBeenCalled();
    onLine.mockRestore();
  });

  it('falls back for a deadline-exceeded transaction', async () => {
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      Object.assign(new Error('deadline'), { code: 'deadline-exceeded' })
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')])
    );

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
  });

  it('rethrows a transaction failure that is not an offline error', async () => {
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'permission-denied' })
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await expect(
      result.current.saveDashboard(
        board([widget('a', 'a-local')]),
        baseline([widget('a', 'a0')])
      )
    ).rejects.toThrow('nope');
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('normalizes a legacy server doc before merging it', async () => {
    // A pre-Collections, pre-proportional doc must not be folded back in as-is:
    // that would write widgets with no proportional bounds and a board with no
    // collectionId, undoing both migrations.
    const legacyWidget = {
      ...widget('a', 'a0'),
      w: 200,
      h: 100,
    } as WidgetData;
    const tx = mockTransaction(board([legacyWidget]));

    // Layout untouched locally (local === baseline), so the merge adopts the
    // server's layout fields — which only exist once the doc is migrated.
    const localWidget = {
      ...widget('a', 'a0'),
      xProp: 0.25,
      yProp: 0.25,
    } as WidgetData;
    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([localWidget]),
      baseline([{ ...localWidget }])
    );

    const written = tx.set.mock.calls[0][1] as Dashboard;
    expect(written.collectionId).toBeNull();
    expect(written.isPinned).toBe(false);
    // Layout was untouched locally, so the server's (now migrated) proportional
    // fields are adopted — they must be numbers, not undefined.
    expect(typeof written.widgets[0].xProp).toBe('number');
    expect(typeof written.widgets[0].wProp).toBe('number');
  });

  it('migrates a legacy timer widget on the server before merging it', async () => {
    // The snapshot path renames timer/stopwatch to time-tool with a new config.
    // Without the same rename here the merge takes the server's legacy config
    // onto the locally migrated time-tool widget and corrupts it.
    const serverLegacy = {
      id: 'a',
      type: 'timer',
      x: 0,
      y: 0,
      w: 320,
      h: 220,
      z: 1,
      flipped: false,
      config: { duration: 300 },
    } as unknown as WidgetData;
    const serverOnlyLegacy = {
      ...serverLegacy,
      id: 'b',
      type: 'stopwatch',
      config: {},
    } as unknown as WidgetData;
    const tx = mockTransaction(board([serverLegacy, serverOnlyLegacy]));

    const localMigrated = {
      ...serverLegacy,
      type: 'time-tool',
      config: { mode: 'timer', duration: 300, elapsedTime: 300 },
    } as unknown as WidgetData;
    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([localMigrated]),
      baseline([{ ...localMigrated }])
    );

    const written = tx.set.mock.calls[0][1] as Dashboard;
    const merged = written.widgets.find((w) => w.id === 'a') as WidgetData;
    expect(merged.type).toBe('time-tool');
    expect((merged.config as { mode?: string }).mode).toBe('timer');
    expect((merged.config as { duration?: number }).duration).toBe(300);
    // A widget only the server has is carried over migrated, not as 'stopwatch'.
    const carried = written.widgets.find((w) => w.id === 'b') as WidgetData;
    expect(carried.type).toBe('time-tool');
    expect((carried.config as { mode?: string }).mode).toBe('stopwatch');
  });
});
