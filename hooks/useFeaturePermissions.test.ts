import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useFeaturePermissions } from './useFeaturePermissions';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

describe('useFeaturePermissions', () => {
  const mockDoc = doc as Mock;
  const mockGetDoc = getDoc as Mock;
  const mockOnSnapshot = onSnapshot as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('feature-permission-doc');
  });

  it('clears loading after the first snapshot arrives', async () => {
    mockOnSnapshot.mockImplementation(
      (
        _docRef: unknown,
        onNext: (snap: { exists: () => boolean; data: () => object }) => void
      ) => {
        queueMicrotask(() => {
          onNext({
            exists: () => true,
            data: () => ({ enabled: true, config: { foo: 'bar' } }),
          });
        });
        return () => undefined;
      }
    );

    const { result } = renderHook(() => useFeaturePermissions());

    expect(result.current.loading).toBe(false);

    let unsubscribe: (() => void) | undefined;
    act(() => {
      unsubscribe = result.current.subscribeToPermission('embed', vi.fn());
    });

    expect(unsubscribe).toEqual(expect.any(Function));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('clears loading after getPermission resolves', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ enabled: true }),
    });

    const { result } = renderHook(() => useFeaturePermissions());

    let permission: unknown;
    await act(async () => {
      permission = await result.current.getPermission('embed');
    });

    expect(permission).toEqual({ enabled: true });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
