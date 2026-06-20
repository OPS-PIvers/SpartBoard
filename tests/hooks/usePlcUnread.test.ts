/**
 * Unit coverage for the pure unread-count derivation behind `usePlcUnread`
 * (Decision 2.2, §3.4). `deriveUnreadCount` is the testable core of the hook:
 * it counts activity events whose `createdAt` is strictly after the member's
 * `lastSeenAt` cursor.
 *
 * The Firestore-listener side of the hook (cursor + activity subscriptions) is
 * exercised by the emulator rules suites (`plcUnreadState.test.ts`,
 * `plcActivity.test.ts`); this file pins the count math + the parser so a
 * regression in the badge number is caught without an emulator.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveUnreadCount,
  parseActivity,
  MENTION_ACTIVITY_TARGET_TYPE,
} from '@/utils/plcActivity';
import type { PlcActivityEvent } from '@/types';

function event(
  id: string,
  createdAt: number,
  overrides: Partial<PlcActivityEvent> = {}
): PlcActivityEvent {
  return {
    id,
    type: 'note_created',
    actorUid: 'u1',
    actorName: 'Teacher One',
    createdAt,
    ...overrides,
  };
}

describe('deriveUnreadCount', () => {
  it('counts only events strictly newer than the cursor', () => {
    const activity = [event('a', 300), event('b', 200), event('c', 100)];
    // Cursor at 150 → only the 300 and 200 events are unread.
    expect(deriveUnreadCount(activity, 150)).toBe(2);
  });

  it('treats an event exactly at the cursor as already seen (strict >)', () => {
    const activity = [event('a', 300), event('b', 200), event('c', 100)];
    // Cursor at 200: the 200 event is exactly at the cursor (seen), 100 is
    // below (seen), only 300 is strictly newer.
    expect(deriveUnreadCount(activity, 200)).toBe(1);
  });

  it('counts every event when the member has no cursor yet (null)', () => {
    const activity = [event('a', 300), event('b', 200), event('c', 100)];
    expect(deriveUnreadCount(activity, null)).toBe(3);
  });

  it('returns zero when nothing is newer than the cursor', () => {
    const activity = [event('a', 100), event('b', 50)];
    expect(deriveUnreadCount(activity, 1000)).toBe(0);
  });

  it('markSeen-to-now semantics: a cursor past every event zeroes the count', () => {
    const activity = [event('a', 300), event('b', 200), event('c', 100)];
    // markSeen() writes serverTimestamp(); once resolved the cursor is >= the
    // newest loaded event, so the badge clears.
    expect(deriveUnreadCount(activity, 300)).toBe(0);
    expect(deriveUnreadCount(activity, Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it('returns zero for an empty feed regardless of cursor', () => {
    expect(deriveUnreadCount([], null)).toBe(0);
    expect(deriveUnreadCount([], 0)).toBe(0);
    expect(deriveUnreadCount([], 1000)).toBe(0);
  });

  it('does not count events with an unresolved (0ms) pending timestamp', () => {
    // A freshly written local event whose serverTimestamp hasn't resolved
    // parses to createdAt: 0 — it must not inflate the badge for an existing
    // cursor (> 0). With a null cursor it still counts (member never visited).
    const activity = [event('pending', 0), event('old', 50)];
    expect(deriveUnreadCount(activity, 100)).toBe(0);
    expect(deriveUnreadCount(activity, 40)).toBe(1); // only the 50ms event
  });

  // Per-mention events are private notifications for the mentioned member only —
  // counting them for everyone is the "per-event spam" Decision 2.3 forbids.
  it('excludes per-mention events addressed to OTHER members from the badge', () => {
    const mention = (id: string, createdAt: number, mentionedUid: string) =>
      event(id, createdAt, {
        type: 'comment_added',
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: mentionedUid,
      });
    const activity = [
      event('general', 300, {
        type: 'comment_added',
        targetType: 'comment',
        targetId: 'thread-1',
      }),
      mention('m-other', 300, 'someone-else'),
      mention('m-me', 300, 'me'),
    ];
    // As "me": the general comment counts once + my own mention counts; the
    // mention addressed to someone else is excluded → 2, NOT 3.
    expect(deriveUnreadCount(activity, 150, 'me')).toBe(2);
    // As "someone-else": general + their mention → 2.
    expect(deriveUnreadCount(activity, 150, 'someone-else')).toBe(2);
    // Signed-out (null uid): every mention is foreign → only the general
    // comment counts → 1.
    expect(deriveUnreadCount(activity, 150, null)).toBe(1);
  });

  it('excludes foreign mentions even with a null cursor (never-visited member)', () => {
    const activity = [
      event('general', 300, { type: 'comment_added', targetType: 'comment' }),
      event('m-other', 300, {
        type: 'comment_added',
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: 'someone-else',
      }),
    ];
    // null cursor counts everything EXCEPT the foreign mention → 1.
    expect(deriveUnreadCount(activity, null, 'me')).toBe(1);
  });
});

describe('parseActivity', () => {
  it('parses a well-formed event, pinning id to the doc id', () => {
    const parsed = parseActivity('doc-1', {
      id: 'ignored-embedded-id',
      type: 'comment_added',
      actorUid: 'u9',
      actorName: 'Author',
      targetType: 'dataCard',
      targetId: 'a1:q2',
      targetTitle: 'Unit 4 CFA',
      createdAt: 1234,
    });
    expect(parsed).toEqual({
      id: 'doc-1',
      type: 'comment_added',
      actorUid: 'u9',
      actorName: 'Author',
      targetType: 'dataCard',
      targetId: 'a1:q2',
      targetTitle: 'Unit 4 CFA',
      createdAt: 1234,
    });
  });

  it('parses a minimal event with no optional target fields', () => {
    const parsed = parseActivity('doc-2', {
      id: 'doc-2',
      type: 'member_joined',
      actorUid: 'u1',
      actorName: 'Joiner',
      createdAt: 1,
    });
    expect(parsed).toMatchObject({
      id: 'doc-2',
      type: 'member_joined',
      actorUid: 'u1',
      actorName: 'Joiner',
      createdAt: 1,
    });
    expect(parsed?.targetType).toBeUndefined();
  });

  it('resolves a Firestore Timestamp createdAt to millis', () => {
    const parsed = parseActivity('doc-3', {
      id: 'doc-3',
      type: 'meeting_held',
      actorUid: 'u1',
      actorName: 'Facilitator',
      createdAt: { toMillis: () => 5000 },
    });
    expect(parsed?.createdAt).toBe(5000);
  });

  it('drops a doc whose type is outside the closed union', () => {
    expect(
      parseActivity('doc-4', {
        id: 'doc-4',
        type: 'totally_made_up',
        actorUid: 'u1',
        actorName: 'X',
        createdAt: 1,
      })
    ).toBeNull();
  });

  it('drops a doc missing required fields', () => {
    expect(
      parseActivity('doc-5', {
        type: 'note_created',
        // actorUid missing
        actorName: 'X',
        createdAt: 1,
      })
    ).toBeNull();
  });
});
