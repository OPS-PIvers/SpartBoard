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
