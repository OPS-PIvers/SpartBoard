import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useFirestore } from './useFirestore';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

type SnapshotErrorHandler = (err: unknown) => void;

describe('useFirestore – subscribeToSharedBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
  });

  it('tears down its own listener on the error path', () => {
    const unsubscribe = vi.fn();
    let errorHandler: SnapshotErrorHandler | undefined;

    (
      firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (_ref: unknown, _onNext: unknown, onError: SnapshotErrorHandler) => {
        errorHandler = onError;
        return unsubscribe;
      }
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    const callback = vi.fn();
    result.current.subscribeToSharedBoard('share-1', callback);

    // Listener is live; nothing torn down yet.
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(errorHandler).toBeDefined();

    // Simulate the listener erroring (e.g. permission denied).
    errorHandler?.(new Error('permission-denied'));

    // The error branch must tear down its own listener so re-subscribing
    // cannot stack multiple live listeners on the same shared doc.
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null);
  });

  it('returns the onSnapshot unsubscribe so the caller can tear down', () => {
    const unsubscribe = vi.fn();

    (
      firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(unsubscribe);

    const { result } = renderHook(() => useFirestore('user-1'));
    const returned = result.current.subscribeToSharedBoard('share-1', vi.fn());

    expect(returned).toBe(unsubscribe);
  });
});

describe('useFirestore – mirrorSharedBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
  });

  const widget = (id: string, xProp = 0.1) => ({
    id,
    type: 'clock',
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    xProp,
    yProp: 0.1,
    wProp: 0.2,
    hProp: 0.2,
    aspectRatio: 1,
    z: 1,
    flipped: false,
    config: {},
  });

  it("folds a co-teacher's unseen edit into the write", async () => {
    const update = vi.fn();
    (
      firestore.runTransaction as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async (_db: unknown, fn: (tx: unknown) => Promise<void>) =>
        fn({
          get: () =>
            Promise.resolve({
              exists: () => true,
              data: () => ({
                widgets: [widget('a', 0.6)],
                background: 'bg-slate-800',
              }),
            }),
          update,
        })
    );

    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.mirrorSharedBoard(
      'share-1',
      {
        id: 'local',
        name: 'B',
        background: 'bg-slate-800',
        createdAt: 1,
        widgets: [widget('a'), widget('clock')],
      } as never,
      {
        widgets: [widget('a')],
        background: 'bg-slate-800',
        settings: undefined,
        globalStyle: undefined,
        annotationObjects: [],
        connections: [],
      } as never
    );

    expect(firestore.updateDoc).not.toHaveBeenCalled();
    const written = update.mock.calls[0][1] as {
      widgets: { id: string; xProp: number }[];
      updatedBy: string;
    };
    expect(written.widgets.map((w) => [w.id, w.xProp])).toEqual([
      ['a', 0.6],
      ['clock', 0.1],
    ]);
    expect(written.updatedBy).toBe('user-1');
  });
});

describe('useFirestore – share Connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
  });

  it('reads shareConnections over the legacy field an older client rewrites', async () => {
    (firestore.getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        exists: () => true,
        id: 'share-1',
        data: () => ({
          name: 'B',
          widgets: [],
          connections: [
            { id: 'stale', kind: 'follow', leaderId: 'a', followerId: 'b' },
          ],
          shareConnections: [
            { id: 'live', kind: 'follow', leaderId: 'a', followerId: 'b' },
          ],
        }),
      }
    );
    const { result } = renderHook(() => useFirestore('user-1'));
    const snap = await result.current.loadSharedDashboard('share-1');
    expect(snap?.connections?.map((c) => c.id)).toEqual(['live']);
    expect(snap).not.toHaveProperty('shareConnections');
  });

  it('falls back to the legacy field on a doc without shareConnections', async () => {
    (firestore.getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        exists: () => true,
        id: 'share-1',
        data: () => ({
          name: 'B',
          widgets: [],
          connections: [
            { id: 'old', kind: 'follow', leaderId: 'a', followerId: 'b' },
          ],
        }),
      }
    );
    const { result } = renderHook(() => useFirestore('user-1'));
    const snap = await result.current.loadSharedDashboard('share-1');
    expect(snap?.connections?.map((c) => c.id)).toEqual(['old']);
  });

  it('writes both fields without Runs when mirroring', async () => {
    const update = firestore.updateDoc as unknown as ReturnType<typeof vi.fn>;
    update.mockResolvedValue(undefined);
    const { result } = renderHook(() => useFirestore('user-1'));
    await result.current.mirrorSharedBoard('share-1', {
      id: 'b',
      name: 'B',
      background: 'bg',
      widgets: [],
      createdAt: 1,
      connections: [
        {
          id: 's1',
          kind: 'sequence',
          steps: [],
          repeat: 'once',
          run: { deviceId: 'd', stepIndex: 0, stepStartedAt: 1, loops: 0 },
        },
      ],
    });
    const patch = update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.shareConnections).toEqual([
      { id: 's1', kind: 'sequence', steps: [], repeat: 'once' },
    ]);
    expect(patch.connections).toEqual(patch.shareConnections);
  });
});
