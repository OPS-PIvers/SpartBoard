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

const offlineError = () =>
  Object.assign(new Error('client is offline'), { code: 'unavailable' });

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
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

  it('queues an offline save and merges it once the network is back, never writing blind', async () => {
    // A blind write queued offline would overwrite, on reconnect, whatever
    // another device (or Claude) saved during the outage.
    const tx = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        id: 'd1',
        data: () =>
          board([widget('a', 'a0'), widget('b', 'b-other-device')], 300),
      }),
      set: vi.fn(),
    };
    let online = false;
    (firestore.runTransaction as unknown as Fn).mockImplementation(
      (_db: unknown, fn: (t: typeof tx) => Promise<void>) =>
        online ? fn(tx) : Promise.reject(offlineError())
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local'), widget('b', 'b0')]),
      baseline([widget('a', 'a0'), widget('b', 'b0')])
    );
    await flush();

    expect(result.current.hasDeferredSave('d1')).toBe(true);
    expect(
      textOf(
        result.current.deferredSaveBaseline('d1')?.widgets[0] as WidgetData
      )
    ).toBe('a0');
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();

    online = true;
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(tx.set).toHaveBeenCalledTimes(1);
    const written = tx.set.mock.calls[0][1] as Dashboard;
    expect(written.widgets.map(textOf)).toEqual(['a-local', 'b-other-device']);
    expect(result.current.hasDeferredSave('d1')).toBe(false);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('queues later saves of the same board behind an offline one and writes them in order', async () => {
    const written: string[] = [];
    let online = false;
    (firestore.runTransaction as unknown as Fn).mockImplementation(
      (_db: unknown, fn: (t: unknown) => Promise<void>) => {
        if (!online) return Promise.reject(offlineError());
        return fn({
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            id: 'd1',
            data: () => board([widget('a', 'a0')]),
          }),
          set: (_ref: unknown, d: Dashboard) =>
            written.push(textOf(d.widgets[0])),
        });
      }
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'first')]),
      baseline([widget('a', 'a0')])
    );
    await flush();
    // Back online, but the queued save has not landed yet: this one must wait for it.
    online = true;
    await result.current.saveDashboard(
      board([widget('a', 'second')]),
      baseline([widget('a', 'first')])
    );
    expect(written).toEqual([]);

    window.dispatchEvent(new Event('online'));
    await flush();
    expect(written).toEqual(['first', 'second']);
    expect(result.current.hasDeferredSave('d1')).toBe(false);
  });

  it('reports a queued save that fails for a reason other than being offline', async () => {
    let attempts = 0;
    (firestore.runTransaction as unknown as Fn).mockImplementation(() => {
      attempts++;
      return Promise.reject(
        attempts === 1
          ? offlineError()
          : Object.assign(new Error('nope'), { code: 'permission-denied' })
      );
    });
    const onDeferredWriteFailed = vi.fn();

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')]),
      onDeferredWriteFailed
    );
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(onDeferredWriteFailed).toHaveBeenCalledTimes(1);
    expect(result.current.hasDeferredSave('d1')).toBe(false);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('drops a queued offline save once the whole board is written', async () => {
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      offlineError()
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'queued')]),
      baseline([widget('a', 'a0')])
    );
    await flush();
    await result.current.saveDashboard(board([widget('a', 'whole')]));

    expect(result.current.hasDeferredSave('d1')).toBe(false);
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);

    // The superseded retry loop wakes and stops without writing.
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not treat a permission-denied failure as offline just because the browser is', async () => {
    // navigator.onLine is a hint, not a verdict: a blind setDoc fallback here
    // would queue an overwrite of the server copy the rules just refused.
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
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

  it('never writes a board back that was deleted while its save was queued', async () => {
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: () => false }),
      set: vi.fn(),
    };
    let online = false;
    (firestore.runTransaction as unknown as Fn).mockImplementation(
      (_db: unknown, fn: (t: typeof tx) => Promise<void>) =>
        online ? fn(tx) : Promise.reject(offlineError())
    );
    (firestore.deleteDoc as unknown as Fn).mockResolvedValue(undefined);

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')])
    );
    await result.current.deleteDashboard('d1');
    online = true;
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(result.current.hasDeferredSave('d1')).toBe(false);
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('skips a queued retry whose board is gone from the server', async () => {
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: () => false }),
      set: vi.fn(),
    };
    let online = false;
    (firestore.runTransaction as unknown as Fn).mockImplementation(
      (_db: unknown, fn: (t: typeof tx) => Promise<void>) =>
        online ? fn(tx) : Promise.reject(offlineError())
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')])
    );
    online = true;
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(tx.get).toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
    expect(result.current.hasDeferredSave('d1')).toBe(false);
  });

  it('queues a deadline-exceeded transaction like an offline one', async () => {
    (firestore.runTransaction as unknown as Fn).mockRejectedValue(
      Object.assign(new Error('deadline'), { code: 'deadline-exceeded' })
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboard(
      board([widget('a', 'a-local')]),
      baseline([widget('a', 'a0')])
    );

    expect(result.current.hasDeferredSave('d1')).toBe(true);
    expect(firestore.setDoc).not.toHaveBeenCalled();

    // Let the retry loop finish so it cannot run into later tests.
    (firestore.runTransaction as unknown as Fn).mockResolvedValue(undefined);
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(result.current.hasDeferredSave('d1')).toBe(false);
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
    };
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

describe('useFirestore – saveDashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as Fn).mockReturnValue({});
    (firestore.collection as unknown as Fn).mockReturnValue({});
  });

  it('merges each board that comes with a baseline instead of batch-overwriting it', async () => {
    const tx = mockTransaction(
      board([widget('a', 'a0'), widget('b', 'b-other-device')], 200)
    );
    const batch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    (firestore.writeBatch as unknown as Fn).mockReturnValue(batch);

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboards(
      [board([widget('a', 'a-local'), widget('b', 'b0')])],
      new Map([['d1', baseline([widget('a', 'a0'), widget('b', 'b0')])]])
    );

    const written = tx.set.mock.calls[0][1] as Dashboard;
    expect(written.widgets.map(textOf)).toEqual(['a-local', 'b-other-device']);
    expect(batch.set).not.toHaveBeenCalled();
  });

  it('still batch-writes boards that have no baseline', async () => {
    const batch = {
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    (firestore.writeBatch as unknown as Fn).mockReturnValue(batch);

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.saveDashboards([board([widget('a', 'a-local')])]);

    expect(batch.set).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});
