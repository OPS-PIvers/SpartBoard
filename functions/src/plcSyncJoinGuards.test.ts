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

import {
  assertShareAuthorInGroup,
  isGroupLinkedToPlc,
} from './plcSyncJoinGuards';

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

describe('isGroupLinkedToPlc', () => {
  const snap = (data: Record<string, unknown>, createdMs?: number) => ({
    data: () => data,
    ...(createdMs === undefined
      ? {}
      : { createTime: { toMillis: () => createdMs } }),
  });
  const plc = snap({ members: { a: { status: 'active' } } }, 100);
  const group = snap({ plcId: 'p', participants: { a: { joinedAt: 1 } } }, 200);

  it('accepts a header and group made after the PLC root', () => {
    expect(
      isGroupLinkedToPlc('p', plc, snap({ sharedBy: 'a' }, 200), group)
    ).toBe(true);
  });

  it('refuses a header or group older than the PLC root', () => {
    const newRoot = snap({ members: { a: { status: 'active' } } }, 300);
    expect(
      isGroupLinkedToPlc('p', newRoot, snap({ sharedBy: 'a' }, 200), group)
    ).toBe(false);
  });

  it('refuses when a create time is missing', () => {
    expect(
      isGroupLinkedToPlc(
        'p',
        snap({ members: { a: { status: 'active' } } }),
        snap({ sharedBy: 'a' }),
        snap({ plcId: 'p', participants: { a: { joinedAt: 1 } } })
      )
    ).toBe(false);
  });
});
