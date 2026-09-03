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
  updatedAt: 100,
  widgets,
  background: 'bg',
  name: 'B',
  libraryOrder: '[]',
  settings: '{}',
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
});
