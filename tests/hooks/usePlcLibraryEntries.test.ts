import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collection, onSnapshot, query, updateDoc } from 'firebase/firestore';
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

const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  forEach: (fn: (d: { id: string; data: () => unknown }) => void) =>
    docs.forEach((d) => fn({ id: d.id, data: () => d.data })),
});

beforeEach(() => vi.clearAllMocks());

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
});
