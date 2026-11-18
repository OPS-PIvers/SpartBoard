import { describe, it, expect, vi } from 'vitest';
import { miniAppLifecycle } from './miniAppClassLifecycle';

describe('miniAppLifecycle', () => {
  it('End and Reopen drive the existing end and reactivate writes by assignment id', async () => {
    const endAssignment = vi.fn(() => Promise.resolve());
    const reactivateAssignment = vi.fn(() => Promise.resolve());
    const lc = miniAppLifecycle({ endAssignment, reactivateAssignment });

    await lc.end('row-1');
    await lc.reopen('row-1');

    expect(endAssignment).toHaveBeenCalledWith('row-1');
    expect(reactivateAssignment).toHaveBeenCalledWith('row-1');
  });

  it('has no turn-in or run-wide pause, and reads inactive as ended', () => {
    const lc = miniAppLifecycle({
      endAssignment: () => Promise.resolve(),
      reactivateAssignment: () => Promise.resolve(),
    });
    expect(lc).not.toHaveProperty('turnInClass');
    expect(lc).not.toHaveProperty('pause');
    expect(lc.isEnded({ status: 'inactive' })).toBe(true);
    expect(lc.isEnded({ status: 'active' })).toBe(false);
  });
});
