import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import {
  isLivePlcLibraryEntry,
  usePlcLibraryEntries,
  type PlcLibrarySpec,
} from '@/hooks/usePlcLibraryEntries';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: string) => ({ field, dir })),
  query: vi.fn((ref: string, ...c: unknown[]) => ({ ref, c })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
const providerSlice = vi.fn<() => unknown>(() => null);
vi.mock('@/context/usePlcContext', () => ({
  usePlcSubcollection: () => providerSlice(),
}));

interface Row {
  id: string;
  sharedAt: number;
  deletedAt?: number | null;
}

const parse = (id: string, data: Record<string, unknown>): Row | null =>
  typeof data.sharedAt === 'number'
    ? {
        id,
        sharedAt: data.sharedAt,
        deletedAt: data.deletedAt as number | null | undefined,
      }
    : null;

const share = vi.fn().mockResolvedValue('created');
const SPEC: PlcLibrarySpec<Row, { title: string }, string> = {
  kind: 'questionBank',
  subcollection: 'question_banks',
  parse,
  keep: isLivePlcLibraryEntry,
  orderByUpdatedAt: false,
  sort: (a, b) => b.sharedAt - a.sharedAt,
  share,
};

const ORDERED: PlcLibrarySpec<Row, { title: string }, string> = {
  ...SPEC,
  kind: 'rubric',
  subcollection: 'rubrics',
  orderByUpdatedAt: true,
  sort: undefined,
};

const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  forEach: (fn: (d: { id: string; data: () => unknown }) => void) =>
    docs.forEach((d) => fn({ id: d.id, data: () => d.data })),
});

beforeEach(() => {
  vi.clearAllMocks();
  providerSlice.mockReturnValue(null);
});

describe('usePlcLibraryEntries', () => {
  it('lists unordered when asked, drops tombstones and malformed rows, sorts client side', () => {
    let next: (s: unknown) => void = () => undefined;
    (onSnapshot as Mock).mockImplementation((_q, onNext) => {
      next = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcLibraryEntries('p1', SPEC));
    expect(query).not.toHaveBeenCalled();
    expect(collection).toHaveBeenCalledWith({}, 'plcs', 'p1', 'question_banks');
    act(() =>
      next(
        snap([
          { id: 'a', data: { sharedAt: 1 } },
          { id: 'b', data: { sharedAt: 3 } },
          { id: 'c', data: { sharedAt: 2, deletedAt: 5 } },
          { id: 'd', data: {} },
        ])
      )
    );
    expect(result.current.entries.map((e) => e.id)).toEqual(['b', 'a']);
    expect(result.current.loading).toBe(false);
  });

  it('unshare tombstones, restore clears it, share binds plc and uid', async () => {
    (onSnapshot as Mock).mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcLibraryEntries('p1', SPEC));
    await result.current.unshare('x');
    await result.current.restore('x');
    const [[p1, del], [p2, res]] = (updateDoc as Mock).mock.calls as [
      string,
      Record<string, unknown>,
    ][];
    expect(p1).toBe('plcs/p1/question_banks/x');
    expect(typeof del.deletedAt).toBe('number');
    expect(del.updatedAt).toBe(del.deletedAt);
    expect(p2).toBe('plcs/p1/question_banks/x');
    expect(res.deletedAt).toBeNull();
    await expect(result.current.share({ title: 'T' })).resolves.toBe('created');
    expect(share).toHaveBeenCalledWith('p1', 'u1', { title: 'T' });
  });

  it('orders by updatedAt on the server when the spec asks', () => {
    (onSnapshot as Mock).mockReturnValue(() => undefined);
    renderHook(() =>
      usePlcLibraryEntries('p1', { ...ORDERED, subcollection: 'rubrics' })
    );
    expect(orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(query).toHaveBeenCalledWith('plcs/p1/rubrics', {
      field: 'updatedAt',
      dir: 'desc',
    });
  });

  it('reads the PlcProvider slice instead of opening a listener', () => {
    providerSlice.mockReturnValue({
      data: [{ id: 'z', sharedAt: 1 }],
      loading: false,
      error: null,
      enabled: true,
    });
    const { result } = renderHook(() => usePlcLibraryEntries('p1', ORDERED));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current.entries.map((e) => e.id)).toEqual(['z']);
  });

  it('resets on PLC change and clears rows on a listener error', () => {
    let next: (s: unknown) => void = () => undefined;
    let fail: (e: unknown) => void = () => undefined;
    (onSnapshot as Mock).mockImplementation((_q, onNext, onErr) => {
      next = onNext;
      fail = onErr;
      return () => undefined;
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePlcLibraryEntries(id, ORDERED),
      { initialProps: { id: 'p1' } }
    );
    act(() => next(snap([{ id: 'a', data: { sharedAt: 1 } }])));
    expect(result.current.entries).toHaveLength(1);
    act(() => fail(new Error('denied')));
    expect(result.current.entries).toEqual([]);
    expect(result.current.error?.message).toBe('denied');
    act(() => next(snap([{ id: 'a', data: { sharedAt: 1 } }])));
    rerender({ id: 'p2' });
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});
