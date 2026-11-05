import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useFirestore } from './useFirestore';
import type { Dashboard } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

type Fn = ReturnType<typeof vi.fn>;

const board = { id: 'b1', name: 'B', widgets: [], createdAt: 1 } as Dashboard;

const mockTx = (existing: Record<string, unknown> | null) => {
  const tx = {
    get: vi.fn().mockResolvedValue({
      exists: () => existing !== null,
      data: () => existing ?? undefined,
    }),
    set: vi.fn(),
  };
  (firestore.runTransaction as unknown as Fn).mockImplementation(
    (_db: unknown, fn: (t: typeof tx) => Promise<void>) => fn(tx)
  );
  return tx;
};

const shareFixed = (user: string) =>
  renderHook(() => useFirestore(user)).result.current.shareDashboard(
    board,
    'synced',
    'Host',
    undefined,
    'L1',
    'L1_b1'
  );

describe('useFirestore – shareDashboard with a fixed share id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as Fn).mockReturnValue({});
    (firestore.collection as unknown as Fn).mockReturnValue({});
  });

  it('writes the share when no doc has the id', async () => {
    const tx = mockTx(null);
    await expect(shareFixed('host')).resolves.toBe('L1_b1');
    expect(tx.set).toHaveBeenCalledTimes(1);
  });

  it('accepts a doc this user already wrote, as a second tab does', async () => {
    const tx = mockTx({ originalAuthor: 'host' });
    await expect(shareFixed('host')).resolves.toBe('L1_b1');
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('refuses a doc another user wrote at the id and writes nothing', async () => {
    const tx = mockTx({ originalAuthor: 'attacker' });
    await expect(shareFixed('host')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('refuses a doc with no recorded author', async () => {
    mockTx({});
    await expect(shareFixed('host')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
