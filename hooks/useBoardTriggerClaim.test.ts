import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBoardTriggerClaim } from './useBoardTriggerClaim';
import { useDashboard } from '@/context/useDashboard';
import { claimBoardTrigger } from '@/utils/boardTriggerClaim';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/boardTriggerClaim', () => ({
  claimBoardTrigger: vi.fn().mockResolvedValue(true),
}));

const withBoards = (dashboards: unknown) =>
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    dashboards,
  });

describe('useBoardTriggerClaim', () => {
  beforeEach(() => vi.mocked(claimBoardTrigger).mockClear());

  it("claims on the widget's own board, shown or not", async () => {
    withBoards([
      { id: 'shown', widgets: [{ id: 'other' }] },
      { id: 'hidden', widgets: [{ id: 'r1' }] },
    ]);
    const { result } = renderHook(() => useBoardTriggerClaim('r1'));
    await result.current(42);
    expect(claimBoardTrigger).toHaveBeenCalledWith('hidden', 'r1', 42);
  });

  it('acts without a claim on a view-only copy or outside the board list', async () => {
    withBoards([
      { id: 'v', linkedShareRole: 'viewer', widgets: [{ id: 'r1' }] },
    ]);
    const viewer = renderHook(() => useBoardTriggerClaim('r1'));
    await viewer.result.current(1);
    withBoards(undefined);
    const none = renderHook(() => useBoardTriggerClaim('r1'));
    await none.result.current(2);
    expect(vi.mocked(claimBoardTrigger).mock.calls).toEqual([
      [undefined, 'r1', 1],
      [undefined, 'r1', 2],
    ]);
  });
});
