import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardState = vi.hoisted(() => ({
  blockedPaths: new Set<string>(),
  audited: false,
  needsAudit: false,
  seen: [] as string[][],
}));
const recorded = vi.hoisted(() => ({
  recordViewAsRawWrites: vi.fn((_writes: unknown) => Promise.resolve()),
}));
const real = vi.hoisted(() => ({
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new', path: 'new' })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  commit: vi.fn(() => Promise.resolve()),
  txSet: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: real.setDoc,
  updateDoc: real.updateDoc,
  addDoc: real.addDoc,
  deleteDoc: real.deleteDoc,
  runTransaction: async (
    _db: unknown,
    update: (tx: Record<string, unknown>) => Promise<unknown>
  ) => {
    const tx = { set: real.txSet, update: vi.fn(), delete: vi.fn() };
    return update(tx);
  },
  writeBatch: () => ({
    commit: real.commit,
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }),
  doc: vi.fn(),
  FieldPath: class FieldPath {},
}));

vi.mock('@/utils/viewAsAudit', () => recorded);

vi.mock('@/utils/viewAsTab', () => ({
  isViewAsTab: true,
  ViewAsReadOnlyError: class ViewAsReadOnlyError extends Error {},
  viewAsWriteIsAudited: () => guardState.audited,
  viewAsRawWriteNeedsAudit: () => guardState.needsAudit,
  viewAsBlocksRawWrite: (paths: string[]) => {
    guardState.seen.push(paths);
    return (
      paths.length === 0 || paths.some((p) => guardState.blockedPaths.has(p))
    );
  },
}));

import * as guard from './firestoreViewAsGuard';

const ref = (path: string) => ({ path }) as never;

describe('firestoreViewAsGuard', () => {
  beforeEach(() => {
    guardState.blockedPaths = new Set();
    guardState.audited = false;
    guardState.needsAudit = false;
    guardState.seen = [];
    vi.clearAllMocks();
  });

  it('checks each single write by its path', async () => {
    await guard.setDoc(ref('a/1'), {});
    await guard.updateDoc(ref('a/2'), {});
    await guard.deleteDoc(ref('a/3'));
    await guard.addDoc(ref('a'), {});
    expect(guardState.seen).toEqual([['a/1'], ['a/2'], ['a/3'], ['a/new']]);
    expect(real.setDoc).toHaveBeenCalledTimes(1);
    expect(real.addDoc).toHaveBeenCalledTimes(1);

    guardState.blockedPaths.add('b/1');
    await expect(guard.setDoc(ref('b/1'), {})).rejects.toThrow();
    await expect(guard.updateDoc(ref('b/1'), {})).rejects.toThrow();
    await expect(guard.deleteDoc(ref('b/1'))).rejects.toThrow();
    expect(real.setDoc).toHaveBeenCalledTimes(1);
  });

  it('checks a batch commit against every path it writes', async () => {
    const ok = guard.writeBatch({} as never);
    ok.set(ref('a/1'), {});
    ok.update(ref('a/2'), {});
    await ok.commit();
    expect(guardState.seen.at(-1)).toEqual(['a/1', 'a/2']);
    expect(real.commit).toHaveBeenCalledTimes(1);

    guardState.blockedPaths.add('b/1');
    const bad = guard.writeBatch({} as never);
    bad.set(ref('a/1'), {});
    bad.delete(ref('b/1'));
    await expect(bad.commit()).rejects.toThrow();
    expect(real.commit).toHaveBeenCalledTimes(1);
  });

  it('checks each transaction write unless the transaction started audited', async () => {
    guardState.blockedPaths.add('b/1');
    await expect(
      guard.runTransaction({} as never, (tx) => {
        tx.set(ref('b/1'), {});
        return Promise.resolve();
      })
    ).rejects.toThrow();
    expect(real.txSet).not.toHaveBeenCalled();

    guardState.audited = true;
    await guard.runTransaction({} as never, (tx) => {
      tx.set(ref('b/1'), {});
      return Promise.resolve();
    });
    expect(real.txSet).toHaveBeenCalledTimes(1);
  });

  it('logs each write it lets through when the tab has no audit of its own', async () => {
    const flush = () => new Promise((r) => setTimeout(r, 0));
    await guard.setDoc(ref('quiz_sessions/s1/responses/r1'), {
      unlocked: true,
    });
    await flush();
    expect(recorded.recordViewAsRawWrites).not.toHaveBeenCalled();

    guardState.needsAudit = true;
    await guard.updateDoc(ref('quiz_sessions/s1/responses/r1'), {
      unlocked: true,
    });
    await guard.updateDoc(ref('quiz_sessions/s1'), 'status', 'paused');
    await guard.addDoc(ref('users/u1/rosters'), { name: 'P1' });
    const batch = guard.writeBatch({} as never);
    batch.set(ref('a/1'), { x: 1 });
    batch.delete(ref('a/2'));
    await batch.commit();
    await guard.runTransaction({} as never, (tx) => {
      tx.set(ref('a/3'), { y: 2 });
      return Promise.resolve();
    });
    await flush();
    expect(recorded.recordViewAsRawWrites.mock.calls.map((c) => c[0])).toEqual([
      [
        {
          op: 'update',
          path: 'quiz_sessions/s1/responses/r1',
          data: { unlocked: true },
        },
      ],
      [{ op: 'update', path: 'quiz_sessions/s1', data: { status: 'paused' } }],
      [{ op: 'add', path: 'new', data: { name: 'P1' } }],
      [
        { op: 'set', path: 'a/1', data: { x: 1 } },
        { op: 'delete', path: 'a/2' },
      ],
      [{ op: 'set', path: 'a/3', data: { y: 2 } }],
    ]);
  });

  it('re-exports the rest of the Firestore API', () => {
    expect(guard.doc).toBeDefined();
  });
});
