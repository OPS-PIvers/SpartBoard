import { describe, expect, it } from 'vitest';
import { trustedTurnInMs } from '@/utils/gradebook/liveRawScores';

describe('trustedTurnInMs', () => {
  it('uses the server turn-in time when its stamp vouches for this submission', () => {
    expect(trustedTurnInMs(100, { at: 190, claimed: 100 })).toBe(190);
  });

  it('falls back to the claimed time for a stale or missing stamp', () => {
    expect(trustedTurnInMs(300, { at: 190, claimed: 100 })).toBe(300);
    expect(trustedTurnInMs(300, undefined)).toBe(300);
    expect(trustedTurnInMs(null, { at: 190, claimed: 100 })).toBeNull();
  });
});
