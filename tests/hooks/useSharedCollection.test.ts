import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('firebase/firestore', () => {
  const docs = new Map<string, unknown>();
  return {
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    getDoc: vi.fn((ref: { path: string }) =>
      Promise.resolve({
        exists: () => docs.has(ref.path),
        data: () => docs.get(ref.path),
      })
    ),
    getDocs: vi.fn(() =>
      Promise.resolve({
        docs: Array.from(docs.entries())
          .filter(([path]) => path.includes('/boards/'))
          .map(([path, data]) => ({
            id: path.split('/').at(-1) ?? '',
            data: () => data,
          })),
      })
    ),
    writeBatch: vi.fn(() => ({
      set: vi.fn((ref: { path: string }, data: unknown) => {
        docs.set(ref.path, data);
      }),
      commit: vi.fn(() => Promise.resolve(undefined)),
    })),
    Timestamp: { now: () => ({ toMillis: () => 1000 }) },
    __testHelpers: {
      docs,
      reset: () => {
        docs.clear();
      },
    },
  };
});

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { useSharedCollection } from '@/hooks/useSharedCollection';
import type { Collection, Dashboard } from '@/types';

const dashboard = (id: string): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: 'src-collection',
});

const sourceCollection = (): Collection => ({
  id: 'src-collection',
  name: 'Source',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  color: '#ad2122',
});

describe('useSharedCollection', () => {
  beforeEach(async () => {
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { reset: () => void };
    };
    mod.__testHelpers.reset();
  });

  it('shareCollection writes parent + N boards and returns a shareId', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1'), dashboard('b2')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
    });
    expect(shareId).toMatch(/^[0-9a-f-]{36}$/);
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    const parent = mod.__testHelpers.docs.get(
      `shared_collections/${shareId}`
    ) as { boardIds: string[]; intendedMode: string };
    expect(parent.boardIds).toEqual(['b1', 'b2']);
    expect(parent.intendedMode).toBe('copy');
  });

  it('shareSubstituteCollection sets intendedMode=substitute + expiresAt', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
    });
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    const parent = mod.__testHelpers.docs.get(
      `shared_collections/${shareId}`
    ) as { intendedMode: string; expiresAt: number };
    expect(parent.intendedMode).toBe('substitute');
    expect(parent.expiresAt).toBe(9999999999999);
  });

  it('loadSharedCollection returns null for an expired substitute share', async () => {
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    mod.__testHelpers.docs.set('shared_collections/expired', {
      shareId: 'expired',
      intendedMode: 'substitute',
      expiresAt: Date.now() - 1000,
      boardIds: [],
      collection: { name: 'gone' },
    });
    const { result } = renderHook(() => useSharedCollection());
    const meta = await result.current.loadSharedCollection('expired');
    expect(meta).toBeNull();
  });

  it('loadSharedCollectionBoards returns boards in boardIds order', async () => {
    const mod = (await vi.importMock('firebase/firestore')) as {
      __testHelpers: { docs: Map<string, unknown> };
    };
    mod.__testHelpers.docs.set('shared_collections/s1/boards/b1', {
      boardId: 'b1',
      dashboard: dashboard('b1'),
    });
    mod.__testHelpers.docs.set('shared_collections/s1/boards/b2', {
      boardId: 'b2',
      dashboard: dashboard('b2'),
    });
    const { result } = renderHook(() => useSharedCollection());
    const boards = await result.current.loadSharedCollectionBoards('s1', [
      'b2',
      'b1',
    ]);
    expect(boards.map((b) => b.id)).toEqual(['b2', 'b1']);
  });
});
