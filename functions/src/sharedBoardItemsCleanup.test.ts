import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_opts: unknown, handler: unknown) => handler),
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

import {
  cleanupSharedBoardItems,
  orphanedCopies,
} from './sharedBoardItemsCleanup';

type Item = { id: string; ownerUid: string };

function fakeDb(items: Item[], current?: Record<string, unknown>) {
  const store = new Map(items.map((i) => [i.id, i]));
  const docs = (list: Item[]) =>
    list.map((i) => ({
      id: i.id,
      ref: { delete: vi.fn(() => Promise.resolve(store.delete(i.id))) },
    }));
  const itemsCol = {
    where: vi.fn((_f: string, _op: string, uid: string) => ({
      get: vi.fn(() => {
        const hit = [...store.values()].filter((i) => i.ownerUid === uid);
        return Promise.resolve({ size: hit.length, docs: docs(hit) });
      }),
    })),
  };
  let onResult: () => void = () => undefined;
  const writer = {
    onWriteResult: vi.fn((cb: () => void) => {
      onResult = cb;
    }),
  };
  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => itemsCol),
        get: vi.fn(() => Promise.resolve({ data: () => current })),
      })),
    })),
    bulkWriter: vi.fn(() => writer),
    recursiveDelete: vi.fn(() => {
      store.forEach(() => onResult());
      store.clear();
      return Promise.resolve();
    }),
  };
  return { db, store };
}

const share = (participants: Record<string, unknown>) => ({
  originalAuthor: 'host',
  participants,
});

describe('orphanedCopies', () => {
  it('drops every copy when the share is deleted', () => {
    expect(orphanedCopies(share({ a: {} }), undefined)).toEqual({ all: true });
  });

  it('drops the copies of members who left, never the host', () => {
    expect(orphanedCopies(share({ a: {}, b: {} }), share({ b: {} }))).toEqual({
      all: false,
      ownerUids: ['a'],
    });
  });

  it('does nothing on create or an edit that keeps the members', () => {
    expect(orphanedCopies(undefined, share({}))).toEqual({
      all: false,
      ownerUids: [],
    });
    expect(orphanedCopies(share({ a: {} }), share({ a: {} }))).toEqual({
      all: false,
      ownerUids: [],
    });
  });
});

describe('cleanupSharedBoardItems', () => {
  let items: Item[];
  beforeEach(() => {
    items = [
      { id: 'quiz_host_q1', ownerUid: 'host' },
      { id: 'quiz_a_q2', ownerUid: 'a' },
      { id: 'notebook_b_n1', ownerUid: 'b' },
    ];
  });

  it('removes all copies when the share ends', async () => {
    const { db, store } = fakeDb(items);
    const n = await cleanupSharedBoardItems(
      db as never,
      's1',
      share({ a: {}, b: {} }),
      undefined
    );
    expect(n).toBe(3);
    expect(store.size).toBe(0);
  });

  it('removes only the leaving member copies', async () => {
    const { db, store } = fakeDb(items, share({ b: {} }));
    const n = await cleanupSharedBoardItems(
      db as never,
      's1',
      share({ a: {}, b: {} }),
      share({ b: {} })
    );
    expect(n).toBe(1);
    expect([...store.keys()].sort()).toEqual(['notebook_b_n1', 'quiz_host_q1']);
    expect(db.recursiveDelete).not.toHaveBeenCalled();
  });

  it('keeps the copies of a member who rejoined before cleanup ran', async () => {
    const { db, store } = fakeDb(items, share({ a: {}, b: {} }));
    const n = await cleanupSharedBoardItems(
      db as never,
      's1',
      share({ a: {}, b: {} }),
      share({ b: {} })
    );
    expect(n).toBe(0);
    expect(store.size).toBe(3);
  });

  it('keeps the copies of a share re-created at the same id', async () => {
    const { db, store } = fakeDb(items, share({ a: {} }));
    const n = await cleanupSharedBoardItems(
      db as never,
      's1',
      share({ a: {} }),
      undefined
    );
    expect(n).toBe(0);
    expect(store.size).toBe(3);
    expect(db.recursiveDelete).not.toHaveBeenCalled();
  });
});
