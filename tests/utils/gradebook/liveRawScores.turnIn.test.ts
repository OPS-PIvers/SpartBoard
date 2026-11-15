import { describe, expect, it } from 'vitest';
import {
  TURN_IN_SLACK_MS,
  trustedTurnInMs,
} from '@/utils/gradebook/liveRawScores';

describe('trustedTurnInMs', () => {
  it('uses the server turn-in time when its stamp vouches for a backdated claim', () => {
    expect(trustedTurnInMs(100_000, { at: 190_000, claimed: 100_000 })).toBe(
      190_000
    );
  });

  it('keeps an honest claim within the slack, so commit lag never makes it late', () => {
    const at = 1_000_000;
    expect(trustedTurnInMs(at - 800, { at, claimed: at - 800 })).toBe(at - 800);
    const edge = at - TURN_IN_SLACK_MS;
    expect(trustedTurnInMs(edge, { at, claimed: edge })).toBe(edge);
    expect(trustedTurnInMs(at + 500, { at, claimed: at + 500 })).toBe(at + 500);
  });

  it('falls back to the claimed time for a stale or missing stamp', () => {
    expect(trustedTurnInMs(300_000, { at: 190_000, claimed: 100_000 })).toBe(
      300_000
    );
    expect(trustedTurnInMs(300, undefined)).toBe(300);
    expect(trustedTurnInMs(150_000, { at: 190_000, claimed: 100_000 })).toBe(
      190_000
    );
    expect(trustedTurnInMs(null, { at: 190, claimed: 100 })).toBeNull();
  });
});
