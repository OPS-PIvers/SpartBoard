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
});
