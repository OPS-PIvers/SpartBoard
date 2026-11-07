import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBoardTriggerClaim } from './useBoardTriggerClaim';
import { useDashboard } from '@/context/useDashboard';
import { claimBoardTrigger } from '@/utils/boardTriggerClaim';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/boardTriggerClaim', () => ({
  claimBoardTrigger: vi.fn().mockResolvedValue(true),
}));

const showing = (activeDashboard: unknown) =>
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    activeDashboard,
  });

describe('useBoardTriggerClaim', () => {
  beforeEach(() => vi.mocked(claimBoardTrigger).mockClear());

  it('claims on the shown board', async () => {
    showing({ id: 'shown', widgets: [{ id: 'r1' }] });
    const { result } = renderHook(() => useBoardTriggerClaim('r1'));
    await result.current(42);
    expect(claimBoardTrigger).toHaveBeenCalledWith('shown', 'r1', 42);
  });

  it("never claims from a hidden copy, so it can't take the trigger from the device showing the board", async () => {
    showing({ id: 'other', widgets: [{ id: 'x' }] });
    const { result } = renderHook(() => useBoardTriggerClaim('r1'));
    await result.current(1);
    expect(claimBoardTrigger).toHaveBeenCalledWith(undefined, 'r1', 1);
  });

  it('acts without a claim on a view-only copy or with no board', async () => {
    showing({ id: 'v', linkedShareRole: 'viewer', widgets: [{ id: 'r1' }] });
    const viewer = renderHook(() => useBoardTriggerClaim('r1'));
    await viewer.result.current(1);
    showing(null);
    const none = renderHook(() => useBoardTriggerClaim('r1'));
    await none.result.current(2);
    expect(vi.mocked(claimBoardTrigger).mock.calls).toEqual([
      [undefined, 'r1', 1],
      [undefined, 'r1', 2],
    ]);
  });
});
