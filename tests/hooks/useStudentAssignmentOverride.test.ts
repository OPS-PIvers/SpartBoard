import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStudentAssignmentOverride } from '@/hooks/useStudentAssignmentOverride';

const mockOnSnapshot = vi.hoisted(() => vi.fn());
const mockDoc = vi.hoisted(() => vi.fn(() => ({ path: 'mock' })));

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

describe('useStudentAssignmentOverride', () => {
  beforeEach(() => {
    mockOnSnapshot.mockReset();
    mockDoc.mockClear();
  });

  it('does not subscribe when disabled', () => {
    const { result } = renderHook(() =>
      useStudentAssignmentOverride('uid1', 'assign1', false)
    );
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('does not subscribe without studentUid or assignmentId', () => {
    renderHook(() => useStudentAssignmentOverride(null, 'assign1', true));
    renderHook(() => useStudentAssignmentOverride('uid1', null, true));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('returns the pointer override when enabled and present', async () => {
    let capturedNext: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((_ref, next) => {
      capturedNext = next;
      return () => undefined;
    });

    const { result } = renderHook(() =>
      useStudentAssignmentOverride('uid1', 'assign1', true)
    );

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    capturedNext?.({
      data: () => ({ override: { timeMultiplier: 1.5 } }),
    });

    await waitFor(() => {
      expect(result.current).toEqual({ timeMultiplier: 1.5 });
    });
  });

  it('returns undefined when the pointer doc has no override', async () => {
    let capturedNext: ((snap: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((_ref, next) => {
      capturedNext = next;
      return () => undefined;
    });

    const { result } = renderHook(() =>
      useStudentAssignmentOverride('uid1', 'assign1', true)
    );

    capturedNext?.({ data: () => ({}) });

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('resets to undefined on error', async () => {
    let capturedError: ((err: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((_ref, _next, errCb) => {
      capturedError = errCb;
      return () => undefined;
    });

    const { result } = renderHook(() =>
      useStudentAssignmentOverride('uid1', 'assign1', true)
    );

    capturedError?.(new Error('denied'));

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });
});
