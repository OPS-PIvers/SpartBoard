import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { assertShareAuthorInGroup } from './plcSyncJoinGuards';

describe('assertShareAuthorInGroup', () => {
  it('allows a share whose author participates in the group', () => {
    expect(() =>
      assertShareAuthorInGroup(
        { originalAuthor: 'author', syncGroupId: 'g' },
        { participants: { author: { joinedAt: 1 } } }
      )
    ).not.toThrow();
  });

  it('rejects a share pointing at a group its author is not in', () => {
    expect(() =>
      assertShareAuthorInGroup(
        { originalAuthor: 'attacker', syncGroupId: 'g' },
        { participants: { victim: { joinedAt: 1 } } }
      )
    ).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('rejects a share with no author', () => {
    expect(() =>
      assertShareAuthorInGroup(
        { syncGroupId: 'g' },
        { participants: { victim: { joinedAt: 1 } } }
      )
    ).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });
});
