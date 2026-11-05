import { describe, it, expect, vi } from 'vitest';
import type { ClassRoster } from '@/types';
import { syncRosterMirrorsBatch } from '@/utils/ltiRosterMirrors';

const roster = (id: string, ltiContextId?: string): ClassRoster =>
  ({ id, name: id, students: [], ltiContextId }) as unknown as ClassRoster;

describe('syncRosterMirrorsBatch', () => {
  it('never clears a roster linked in the same batch', async () => {
    // r-a moves from T to S, and r-b takes T in the same batch.
    const update = vi.fn().mockResolvedValue(undefined);
    await syncRosterMirrorsBatch(
      [roster('r-a', 'T'), roster('r-b'), roster('r-c', 'old')],
      [
        { rosterId: 'r-a', contextId: 'S' },
        { rosterId: 'r-b', contextId: 'T' },
      ],
      ['T', 'old'],
      update
    );
    expect(update.mock.calls).toEqual([
      ['r-a', { ltiContextId: 'S' }],
      ['r-b', { ltiContextId: 'T' }],
      ['r-c', { ltiContextId: '' }],
    ]);
  });

  it('still writes the rest when one write fails, then throws', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    await expect(
      syncRosterMirrorsBatch(
        [roster('r-a'), roster('r-b', 'S')],
        [{ rosterId: 'r-a', contextId: 'S' }],
        [],
        update
      )
    ).rejects.toThrow('boom');
    expect(update).toHaveBeenCalledTimes(2);
  });
});
