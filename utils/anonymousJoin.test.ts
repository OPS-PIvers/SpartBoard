import { describe, it, expect } from 'vitest';
import { isAnonymousJoinBlocked } from './anonymousJoin';

describe('isAnonymousJoinBlocked', () => {
  it('blocks only a session stamped false', () => {
    expect(isAnonymousJoinBlocked({ allowAnonymousJoin: false })).toBe(true);
    expect(isAnonymousJoinBlocked({ allowAnonymousJoin: true })).toBe(false);
    expect(isAnonymousJoinBlocked({})).toBe(false);
    expect(isAnonymousJoinBlocked(null)).toBe(false);
  });

  it('leaves view-only shares open', () => {
    expect(
      isAnonymousJoinBlocked({ allowAnonymousJoin: false, mode: 'view-only' })
    ).toBe(false);
  });
});
