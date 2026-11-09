import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useFirestore } from './useFirestore';
import type { Dashboard } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
const recordPicks = vi.hoisted(() => vi.fn());
vi.mock('@/utils/boardItemPicks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/boardItemPicks')>()),
  recordBoardItemPicks: recordPicks,
}));

type Fn = ReturnType<typeof vi.fn>;

const board: Dashboard = {
  id: 'b1',
  name: 'B',
  background: '',
  widgets: [],
  createdAt: 1,
};

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

describe('useFirestore – shareDashboard records the board’s items as the host’s picks', () => {
  const withItems: Dashboard = {
    ...board,
    widgets: [
      {
        id: 'w1',
        type: 'quiz',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        z: 1,
        flipped: false,
        config: { selectedQuizId: 'q1' },
      },
      {
        id: 'w2',
        type: 'clock',
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        z: 2,
        flipped: false,
        config: {},
      },
    ] as Dashboard['widgets'],
  };
  const share = (
    dashboard: Dashboard,
    mode: 'synced' | 'copy' = 'synced',
    shareId?: string
  ) =>
    renderHook(() => useFirestore('host')).result.current.shareDashboard(
      dashboard,
      mode,
      'Host',
      undefined,
      shareId ? 'L1' : undefined,
      shareId
    );

  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as Fn).mockReturnValue({});
    (firestore.collection as unknown as Fn).mockReturnValue({});
    (firestore.addDoc as unknown as Fn).mockResolvedValue({ id: 'new-share' });
  });

  it('on a new live share', async () => {
    await expect(share(withItems)).resolves.toBe('new-share');
    expect(recordPicks).toHaveBeenCalledWith('host', 'new-share', ['quiz_q1']);
    mockTx(null);
    await share(withItems, 'synced', 'L1_b1');
    expect(recordPicks).toHaveBeenLastCalledWith('host', 'L1_b1', ['quiz_q1']);
  });

  it('keeps a never-shared board item whose widget carries a stale stamp', async () => {
    await share({
      ...withItems,
      widgets: [
        {
          ...withItems.widgets[0],
          config: { selectedQuizId: 'q1', selectedQuizOwnerUid: 'old-host' },
        },
      ] as Dashboard['widgets'],
    });
    expect(recordPicks).toHaveBeenCalledWith('host', 'new-share', ['quiz_q1']);
  });

  it('not for a Copy link, a share another tab already wrote, or a board joined from another teacher', async () => {
    await share(withItems, 'copy');
    mockTx({ originalAuthor: 'host' });
    await share(withItems, 'synced', 'L1_b1');
    await share({
      ...withItems,
      linkedShareId: 'other',
      linkedShareRole: 'collaborator',
    });
    await Promise.resolve();
    expect(recordPicks).not.toHaveBeenCalled();
  });

  it('carries the old share’s picks, not the widgets, when the host shares a live or ended board again', async () => {
    (firestore.getDoc as unknown as Fn).mockResolvedValue({
      exists: () => true,
      data: () => ({ items: ['flashcards_f1'] }),
    });
    for (const linkedShareEnded of [false, true]) {
      recordPicks.mockClear();
      await share({
        ...withItems,
        linkedShareId: 'old',
        linkedShareRole: 'owner',
        linkedShareEnded,
      });
      await vi.waitFor(() =>
        expect(recordPicks).toHaveBeenCalledWith('host', 'new-share', [
          'flashcards_f1',
        ])
      );
    }
  });

  it('falls back to the board’s own items when the old share has no picks doc, but not for an empty one', async () => {
    const dashboard: Dashboard = {
      ...withItems,
      widgets: [
        ...withItems.widgets,
        {
          ...withItems.widgets[0],
          id: 'w3',
          config: { selectedQuizId: 'theirs', selectedQuizOwnerUid: 'co' },
        },
      ] as Dashboard['widgets'],
      linkedShareId: 'old',
      linkedShareRole: 'owner',
    };
    (firestore.getDoc as unknown as Fn).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    await share(dashboard);
    await vi.waitFor(() =>
      expect(recordPicks).toHaveBeenCalledWith('host', 'new-share', ['quiz_q1'])
    );
    recordPicks.mockClear();
    (firestore.getDoc as unknown as Fn).mockResolvedValue({
      exists: () => true,
      data: () => ({ items: [] }),
    });
    await share(dashboard);
    await vi.waitFor(() =>
      expect(recordPicks).toHaveBeenCalledWith('host', 'new-share', [])
    );
  });
});
