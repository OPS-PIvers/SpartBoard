import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';

const readMock = vi.fn();

vi.mock('@/hooks/useStudentAssignments', () => ({
  isClosedUnsubmittableRun: () => false,
  applyResultsOverride: (state: string) => state,
}));
vi.mock('@/utils/studentResponseDoc', () => ({
  OVERRIDE_KINDS: new Set(['quiz']),
  readsTurnIn: (a: { kind: string }) => a.kind === 'quiz',
  readStudentResponseDoc: (...args: unknown[]): Promise<unknown> =>
    readMock(...args) as Promise<unknown>,
}));

import { useStudentTurnIns } from '@/hooks/useStudentTurnIns';

const make = (id: string, kind: string = 'quiz'): AssignmentSummary =>
  ({
    compositeId: `${kind}:${id}`,
    kind,
    sessionId: id,
    workKind: 'work',
  }) as unknown as AssignmentSummary;

beforeEach(() => {
  readMock.mockReset();
});

describe('useStudentTurnIns settled', () => {
  it('is false while a read is pending and true once it resolves', async () => {
    let resolve!: (v: Record<string, unknown> | null) => void;
    readMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const list = [make('a')];
    const { result } = renderHook(() => useStudentTurnIns(list, 'uid-1'));
    expect(result.current.settled).toBe(false);
    await act(async () => {
      resolve(null);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
  });

  it('settles when a read fails', async () => {
    readMock.mockRejectedValue(new Error('offline'));
    const list = [make('a')];
    const { result } = renderHook(() => useStudentTurnIns(list, 'uid-1'));
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.settled).toBe(true));
  });

  it('is not blocked by a kind with no response doc', () => {
    const list = [make('r', 'activity-wall')];
    const { result } = renderHook(() => useStudentTurnIns(list, 'uid-1'));
    expect(result.current.settled).toBe(true);
    expect(readMock).not.toHaveBeenCalled();
  });

  it('is settled with no pseudonym uid', () => {
    const list = [make('a')];
    const { result } = renderHook(() => useStudentTurnIns(list, null));
    expect(result.current.settled).toBe(true);
    expect(readMock).not.toHaveBeenCalled();
  });
});
