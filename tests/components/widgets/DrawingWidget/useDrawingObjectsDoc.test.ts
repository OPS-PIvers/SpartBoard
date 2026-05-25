import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DrawableObject, PathObject } from '@/types';

// ---------------------------------------------------------------------------
// Module-level mocks. These run BEFORE `useDrawingObjectsDoc` is imported.
// ---------------------------------------------------------------------------

interface OnSnapshotCallback {
  (snapshot: { docs: Array<{ data: () => DrawableObject }> }): void;
}

// Per-collection-path registry of (active) snapshot callbacks. Lets a test
// trigger a server-side snapshot by name, without having to thread the
// callback reference through the module-mocked onSnapshot call.
const snapshotCallbacks = new Map<string, OnSnapshotCallback>();
let onSnapshotMock = vi.fn();
let unsubscribeSpy = vi.fn();
let setDocMock = vi.fn();
let deleteDocMock = vi.fn();
let writeBatchMock = vi.fn();
const collectionMock = vi.fn(
  (...args: unknown[]) => args.slice(1).join('/') // stringly path id for keying
);
const docMock = vi.fn((...args: unknown[]) => ({
  kind: 'docRef',
  path: args.slice(1).join('/'),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]): unknown => collectionMock(...args),
  doc: (...args: unknown[]): unknown => docMock(...args),
  onSnapshot: (...args: unknown[]): unknown => onSnapshotMock(...args),
  setDoc: (...args: unknown[]): unknown => setDocMock(...args),
  deleteDoc: (...args: unknown[]): unknown => deleteDocMock(...args),
  writeBatch: (...args: unknown[]): unknown => writeBatchMock(...args),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

// Import AFTER the mocks above are registered.
import {
  useDrawingObjectsDoc,
  __resetForTests,
} from '@/components/widgets/DrawingWidget/useDrawingObjectsDoc';

const pathObj = (overrides: Partial<PathObject> = {}): PathObject => ({
  id: 'obj-1',
  kind: 'path',
  z: 0,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  color: '#000',
  width: 4,
  ...overrides,
});

const emitSnapshot = (path: string, objs: DrawableObject[]) => {
  const cb = snapshotCallbacks.get(path);
  if (!cb) throw new Error(`No onSnapshot callback registered for ${path}`);
  cb({ docs: objs.map((o) => ({ data: () => o })) });
};

// Build the collection path string the mock uses for keying. Mirrors the
// argument order in the hook's `collection(db, 'users', uid, ...)` call.
const colPath = (
  uid: string,
  dashId: string,
  widgetId: string,
  pageId: string
): string =>
  [
    'users',
    uid,
    'dashboards',
    dashId,
    'drawings',
    widgetId,
    'pages',
    pageId,
    'objects',
  ].join('/');

describe('useDrawingObjectsDoc', () => {
  beforeEach(() => {
    snapshotCallbacks.clear();
    unsubscribeSpy = vi.fn();
    onSnapshotMock = vi.fn((colRef: unknown, next: OnSnapshotCallback) => {
      // collectionMock returns the path-string we use as the key.
      const path = String(colRef);
      snapshotCallbacks.set(path, next);
      return () => {
        unsubscribeSpy();
        snapshotCallbacks.delete(path);
      };
    });
    setDocMock = vi.fn().mockResolvedValue(undefined);
    deleteDocMock = vi.fn().mockResolvedValue(undefined);
    writeBatchMock = vi.fn(() => ({
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    }));
    collectionMock.mockClear();
    docMock.mockClear();
  });

  afterEach(() => {
    // Tear down the module-level LRU so cache state doesn't leak across tests.
    __resetForTests();
  });

  it('starts in loading=true and flips to loading=false after the first snapshot', () => {
    const { result } = renderHook(() =>
      useDrawingObjectsDoc({
        dashboardId: 'd1',
        widgetId: 'w-iso-1',
        pageId: 'pA',
      })
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.objects).toEqual([]);
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-iso-1', 'pA'), [
        pathObj({ id: 'a' }),
      ]);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.objects).toHaveLength(1);
    expect(result.current.objects[0].id).toBe('a');
  });

  it('navigating to a new page starts loading=true then flips on the new snapshot', () => {
    const { result, rerender } = renderHook(
      ({ pageId }: { pageId: string }) =>
        useDrawingObjectsDoc({
          dashboardId: 'd1',
          widgetId: 'w-nav-1',
          pageId,
        }),
      { initialProps: { pageId: 'pA' } }
    );
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-nav-1', 'pA'), [
        pathObj({ id: 'a' }),
      ]);
    });
    expect(result.current.loading).toBe(false);
    // Navigate to a fresh page — no cache entry exists for pB.
    rerender({ pageId: 'pB' });
    expect(result.current.loading).toBe(true);
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-nav-1', 'pB'), [
        pathObj({ id: 'b' }),
      ]);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.objects.map((o) => o.id)).toEqual(['b']);
  });

  it('navigating BACK within the LRU window hydrates loading=false immediately', () => {
    const { result, rerender } = renderHook(
      ({ pageId }: { pageId: string }) =>
        useDrawingObjectsDoc({
          dashboardId: 'd1',
          widgetId: 'w-cache-1',
          pageId,
        }),
      { initialProps: { pageId: 'pA' } }
    );
    // Hydrate pA from a snapshot.
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-cache-1', 'pA'), [
        pathObj({ id: 'a' }),
      ]);
    });
    // Navigate to pB and hydrate.
    rerender({ pageId: 'pB' });
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-cache-1', 'pB'), [
        pathObj({ id: 'b' }),
      ]);
    });
    expect(result.current.objects.map((o) => o.id)).toEqual(['b']);
    // Navigate back to pA — pA is still warm in the LRU (capacity 2). The
    // cache-reuse path must synchronously hydrate pA's last-known objects and
    // set loading=false WITHOUT a fresh snapshot.
    rerender({ pageId: 'pA' });
    expect(result.current.loading).toBe(false);
    expect(result.current.objects.map((o) => o.id)).toEqual(['a']);
  });

  it('signs out (uid/dashboardId/pageId missing) by resetting to empty + loading=false', () => {
    const { result, rerender } = renderHook(
      ({ pageId }: { pageId: string | null }) =>
        useDrawingObjectsDoc({
          dashboardId: 'd1',
          widgetId: 'w-out-1',
          pageId,
        }),
      { initialProps: { pageId: 'pA' as string | null } }
    );
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-out-1', 'pA'), [
        pathObj({ id: 'a' }),
      ]);
    });
    expect(result.current.objects).toHaveLength(1);
    rerender({ pageId: null });
    expect(result.current.loading).toBe(false);
    expect(result.current.objects).toEqual([]);
  });

  it('addObject writes to the page-nested object path with setDoc', async () => {
    const { result } = renderHook(() =>
      useDrawingObjectsDoc({
        dashboardId: 'd1',
        widgetId: 'w-add-1',
        pageId: 'pA',
      })
    );
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-add-1', 'pA'), []);
    });
    await act(async () => {
      await result.current.addObject(pathObj({ id: 'new-obj' }));
    });
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const docCall = docMock.mock.calls.at(-1) as unknown[];
    expect(docCall.slice(1)).toEqual([
      'users',
      'u1',
      'dashboards',
      'd1',
      'drawings',
      'w-add-1',
      'pages',
      'pA',
      'objects',
      'new-obj',
    ]);
  });

  it('updateObject calls setDoc with merge:true', async () => {
    const { result } = renderHook(() =>
      useDrawingObjectsDoc({
        dashboardId: 'd1',
        widgetId: 'w-upd-1',
        pageId: 'pA',
      })
    );
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-upd-1', 'pA'), [
        pathObj({ id: 'x' }),
      ]);
    });
    await act(async () => {
      await result.current.updateObject(pathObj({ id: 'x', color: '#fff' }));
    });
    const lastCall = setDocMock.mock.calls.at(-1);
    expect(lastCall?.[2]).toEqual({ merge: true });
  });

  it('removeObject calls deleteDoc on the right path', async () => {
    const { result } = renderHook(() =>
      useDrawingObjectsDoc({
        dashboardId: 'd1',
        widgetId: 'w-rm-1',
        pageId: 'pA',
      })
    );
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-rm-1', 'pA'), [pathObj({ id: 'x' })]);
    });
    await act(async () => {
      await result.current.removeObject('x');
    });
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { count: 449, expectedBatches: 1 },
    { count: 450, expectedBatches: 1 },
    { count: 451, expectedBatches: 2 },
  ])(
    'clear() chunks $count objects into $expectedBatches batch(es) at the 450 boundary',
    async ({ count, expectedBatches }) => {
      const commits: Array<() => Promise<unknown>> = [];
      writeBatchMock = vi.fn(() => {
        const commit = vi.fn().mockResolvedValue(undefined);
        commits.push(commit);
        return { delete: vi.fn(), commit };
      });
      const widgetId = `w-clear-${count}`;
      const { result } = renderHook(() =>
        useDrawingObjectsDoc({
          dashboardId: 'd1',
          widgetId,
          pageId: 'pA',
        })
      );
      const objs = Array.from({ length: count }, (_, i) =>
        pathObj({ id: `o-${i}`, z: i })
      );
      act(() => {
        emitSnapshot(colPath('u1', 'd1', widgetId, 'pA'), objs);
      });
      await act(async () => {
        await result.current.clear();
      });
      expect(writeBatchMock).toHaveBeenCalledTimes(expectedBatches);
      expect(commits).toHaveLength(expectedBatches);
    }
  );

  it('clear() is a no-op when there are no objects', async () => {
    const { result } = renderHook(() =>
      useDrawingObjectsDoc({
        dashboardId: 'd1',
        widgetId: 'w-empty-1',
        pageId: 'pA',
      })
    );
    act(() => {
      emitSnapshot(colPath('u1', 'd1', 'w-empty-1', 'pA'), []);
    });
    await act(async () => {
      await result.current.clear();
    });
    expect(writeBatchMock).not.toHaveBeenCalled();
  });
});
