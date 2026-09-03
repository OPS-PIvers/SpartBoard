import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useFirestore } from './useFirestore';
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
  dashboardFields: {},
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
});
