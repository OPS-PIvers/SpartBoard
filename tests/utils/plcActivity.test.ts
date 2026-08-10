import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import {
  COMMENT_ACTIVITY_TARGET_TYPE,
  MENTION_ACTIVITY_TARGET_TYPE,
  deriveUnreadCount,
  isForeignMentionEvent,
  parseActivity,
  writePlcActivityEvent,
  type PlcActivityEventInput,
} from '@/utils/plcActivity';
import { logError } from '@/utils/logError';
import type { PlcActivityEvent } from '@/types';

// Firestore write helpers are stubbed so we can assert the exact ref/payload
// shape without a live SDK. The REAL `tsToMillis` from `@/utils/plc` is used
// (that module is pure — imports only `@/types`), so `parseActivity`'s
// timestamp resolution is exercised faithfully rather than mocked away.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __brand: 'db' },
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

const mockCollection = collection as unknown as Mock;
const mockDoc = doc as unknown as Mock;
const mockServerTimestamp = serverTimestamp as unknown as Mock;
const mockSetDoc = setDoc as unknown as Mock;
const mockLogError = logError as unknown as Mock;

const GENERATED_ID = 'generated-doc-id';
const SERVER_TS = { __serverTimestamp: true } as const;

function makeEvent(
  overrides: Partial<PlcActivityEvent> = {}
): PlcActivityEvent {
  return {
    id: 'e1',
    type: 'note_created',
    actorUid: 'u1',
    actorName: 'Alice',
    createdAt: 1000,
    ...overrides,
  };
}

describe('plcActivity', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so a queued `mockRejectedValueOnce`
    // from the failure test can never survive into the next test — the mock
    // implementations below are re-established every run regardless.
    vi.resetAllMocks();
    // collection() → a sentinel encoding its path segments so we can assert on
    // where the write lands; doc(collectionRef) → an auto-id ref.
    mockCollection.mockImplementation(
      (_db: unknown, ...segments: string[]) => ({
        __collection: segments.join('/'),
      })
    );
    mockDoc.mockReturnValue({ id: GENERATED_ID });
    mockServerTimestamp.mockReturnValue(SERVER_TS);
    mockSetDoc.mockResolvedValue(undefined);
  });

  describe('target-type constants', () => {
    it('pins the mention and general comment sentinels', () => {
      // The listener filter and unread derivation both key off these exact
      // strings — a drift here would silently break mention privacy.
      expect(MENTION_ACTIVITY_TARGET_TYPE).toBe('comment:mention');
      expect(COMMENT_ACTIVITY_TARGET_TYPE).toBe('comment');
    });
  });

  describe('isForeignMentionEvent', () => {
    it('is true for a mention addressed to another member', () => {
      const event = makeEvent({
        type: 'comment_added',
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: 'other-uid',
      });
      expect(isForeignMentionEvent(event, 'me')).toBe(true);
    });

    it('is false for a mention addressed to the viewer themselves', () => {
      const event = makeEvent({
        type: 'comment_added',
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: 'me',
      });
      expect(isForeignMentionEvent(event, 'me')).toBe(false);
    });

    it('is false for a general comment event even when the target differs', () => {
      // A non-mention event is surfaced to everyone regardless of targetId.
      const event = makeEvent({
        type: 'comment_added',
        targetType: COMMENT_ACTIVITY_TARGET_TYPE,
        targetId: 'some-comment-id',
      });
      expect(isForeignMentionEvent(event, 'me')).toBe(false);
    });

    it('is false for an event with no targetType', () => {
      const event = makeEvent({ type: 'note_created' });
      expect(isForeignMentionEvent(event, 'me')).toBe(false);
    });

    it('treats every mention as foreign when signed out (uid null)', () => {
      const event = makeEvent({
        type: 'comment_added',
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: 'anyone',
      });
      expect(isForeignMentionEvent(event, null)).toBe(true);
    });

    it('treats a mention with no targetId as foreign (strict-inequality edge)', () => {
      // The normal write path (buildCommentActivityEvents) always sets
      // `targetId: mentionedUid`, so an absent targetId is an edge case — but
      // pin the branch: `event.targetId !== uid` is `undefined !== uid`, which
      // is true for EVERY uid (a real one or null). A malformed mention with no
      // targetId is therefore classified as foreign (hidden), not surfaced.
      const event = makeEvent({
        type: 'comment_added',
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
      });
      expect(event).not.toHaveProperty('targetId');
      expect(isForeignMentionEvent(event, 'me')).toBe(true);
      expect(isForeignMentionEvent(event, null)).toBe(true);
    });
  });

  describe('parseActivity', () => {
    it('parses a full doc, using the passed id as authoritative', () => {
      const event = parseActivity('doc-42', {
        // A stale/forged `id` in the body must be ignored in favor of the id arg.
        id: 'ignored-body-id',
        type: 'assessment_shared',
        actorUid: 'u9',
        actorName: 'Bob',
        createdAt: { toMillis: () => 55_000 },
        targetType: 'assessment',
        targetId: 'a1',
        targetTitle: 'Unit 3 CFA',
      });

      expect(event).toEqual({
        id: 'doc-42',
        type: 'assessment_shared',
        actorUid: 'u9',
        actorName: 'Bob',
        createdAt: 55_000,
        targetType: 'assessment',
        targetId: 'a1',
        targetTitle: 'Unit 3 CFA',
      });
    });

    it('parses a minimal doc without optional target fields', () => {
      const event = parseActivity('doc-1', {
        type: 'member_joined',
        actorUid: 'u1',
        actorName: 'Alice',
        createdAt: 1234,
      });

      expect(event).toEqual({
        id: 'doc-1',
        type: 'member_joined',
        actorUid: 'u1',
        actorName: 'Alice',
        createdAt: 1234,
      });
      // Optional keys are absent, not `undefined`.
      expect(event).not.toHaveProperty('targetType');
      expect(event).not.toHaveProperty('targetId');
      expect(event).not.toHaveProperty('targetTitle');
    });

    it('returns null when type is outside the activity-type union', () => {
      expect(
        parseActivity('doc-1', {
          type: 'bogus_event',
          actorUid: 'u1',
          actorName: 'Alice',
          createdAt: 1,
        })
      ).toBeNull();
    });

    it('returns null when type is missing', () => {
      expect(
        parseActivity('doc-1', {
          actorUid: 'u1',
          actorName: 'Alice',
          createdAt: 1,
        })
      ).toBeNull();
    });

    it('returns null when actorUid is not a string', () => {
      expect(
        parseActivity('doc-1', {
          type: 'note_created',
          actorUid: 42,
          actorName: 'Alice',
          createdAt: 1,
        })
      ).toBeNull();
    });

    it('returns null when actorName is not a string', () => {
      expect(
        parseActivity('doc-1', {
          type: 'note_created',
          actorUid: 'u1',
          actorName: null,
          createdAt: 1,
        })
      ).toBeNull();
    });

    it('resolves createdAt from a Timestamp, a plain number, and a missing value', () => {
      const fromTs = parseActivity('a', {
        type: 'note_created',
        actorUid: 'u1',
        actorName: 'A',
        createdAt: { toMillis: () => 9000 },
      });
      const fromNumber = parseActivity('b', {
        type: 'note_created',
        actorUid: 'u1',
        actorName: 'A',
        createdAt: 4321,
      });
      // An unresolved pending serverTimestamp (undefined here) → 0.
      const fromMissing = parseActivity('c', {
        type: 'note_created',
        actorUid: 'u1',
        actorName: 'A',
      });

      expect(fromTs?.createdAt).toBe(9000);
      expect(fromNumber?.createdAt).toBe(4321);
      expect(fromMissing?.createdAt).toBe(0);
    });

    it('drops optional target fields that are not strings', () => {
      const event = parseActivity('doc-1', {
        type: 'comment_added',
        actorUid: 'u1',
        actorName: 'Alice',
        createdAt: 1,
        targetType: 123,
        targetId: { nested: true },
        targetTitle: null,
      });

      expect(event).not.toBeNull();
      expect(event).not.toHaveProperty('targetType');
      expect(event).not.toHaveProperty('targetId');
      expect(event).not.toHaveProperty('targetTitle');
    });
  });

  describe('deriveUnreadCount', () => {
    it('counts every non-foreign-mention event when there is no cursor', () => {
      const activity = [
        makeEvent({ id: 'a', createdAt: 0 }),
        makeEvent({ id: 'b', createdAt: 5 }),
        makeEvent({ id: 'c', createdAt: 100 }),
      ];
      // lastSeenAt == null short-circuits the createdAt check, so even the
      // pending (createdAt === 0) event counts here.
      expect(deriveUnreadCount(activity, null)).toBe(3);
    });

    it('counts only events strictly after the cursor', () => {
      const activity = [
        makeEvent({ id: 'a', createdAt: 10 }),
        makeEvent({ id: 'b', createdAt: 20 }),
        makeEvent({ id: 'c', createdAt: 30 }),
      ];
      // 20 is not strictly after 20; only 30 counts.
      expect(deriveUnreadCount(activity, 20)).toBe(1);
    });

    it('does not count a pending (createdAt 0) event against a numeric cursor', () => {
      const activity = [makeEvent({ id: 'a', createdAt: 0 })];
      // 0 > 0 is false → a freshly written local event never inflates the badge.
      expect(deriveUnreadCount(activity, 0)).toBe(0);
    });

    it('excludes foreign mention events but keeps the general comment', () => {
      const activity = [
        makeEvent({
          id: 'general',
          type: 'comment_added',
          targetType: COMMENT_ACTIVITY_TARGET_TYPE,
          createdAt: 100,
        }),
        makeEvent({
          id: 'mention-other',
          type: 'comment_added',
          targetType: MENTION_ACTIVITY_TARGET_TYPE,
          targetId: 'someone-else',
          createdAt: 100,
        }),
      ];
      // Only the general event counts for a viewer who was not mentioned.
      expect(deriveUnreadCount(activity, null, 'me')).toBe(1);
    });

    it('counts a mention addressed to the viewer', () => {
      const activity = [
        makeEvent({
          id: 'mention-me',
          type: 'comment_added',
          targetType: MENTION_ACTIVITY_TARGET_TYPE,
          targetId: 'me',
          createdAt: 100,
        }),
      ];
      expect(deriveUnreadCount(activity, null, 'me')).toBe(1);
    });

    it('treats mention events as foreign when selfUid defaults to null', () => {
      const activity = [
        makeEvent({
          id: 'mention',
          type: 'comment_added',
          targetType: MENTION_ACTIVITY_TARGET_TYPE,
          targetId: 'someone',
          createdAt: 100,
        }),
      ];
      // No selfUid passed → signed-out semantics → mention excluded.
      expect(deriveUnreadCount(activity, null)).toBe(0);
    });

    it('returns 0 for an empty activity list', () => {
      expect(deriveUnreadCount([], null)).toBe(0);
      expect(deriveUnreadCount([], 500)).toBe(0);
    });
  });

  describe('writePlcActivityEvent', () => {
    const baseInput: PlcActivityEventInput = {
      type: 'note_created',
      actorUid: 'u1',
      actorName: 'Alice',
    };

    it('writes a minimal event to plcs/{plcId}/activity with the id pinned to the ref', async () => {
      await writePlcActivityEvent('plc-1', baseInput);

      expect(mockCollection).toHaveBeenCalledWith(
        { __brand: 'db' },
        'plcs',
        'plc-1',
        'activity'
      );
      expect(mockDoc).toHaveBeenCalledWith({
        __collection: 'plcs/plc-1/activity',
      });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        { id: GENERATED_ID },
        {
          id: GENERATED_ID,
          type: 'note_created',
          actorUid: 'u1',
          actorName: 'Alice',
          createdAt: SERVER_TS,
        }
      );
      // A minimal doc carries no target keys (rules use keys().hasOnly).
      const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('targetType');
      expect(payload).not.toHaveProperty('targetId');
      expect(payload).not.toHaveProperty('targetTitle');
    });

    it('includes optional target fields when provided', async () => {
      await writePlcActivityEvent('plc-2', {
        ...baseInput,
        type: 'comment_added',
        targetType: 'comment',
        targetId: 'c-9',
        targetTitle: 'Great point',
      });

      // The plcId must route the write — a hard-coded/ignored id would slip
      // past a payload-only assertion.
      expect(mockCollection).toHaveBeenCalledWith(
        { __brand: 'db' },
        'plcs',
        'plc-2',
        'activity'
      );
      expect(mockSetDoc).toHaveBeenCalledWith(
        { id: GENERATED_ID },
        {
          id: GENERATED_ID,
          type: 'comment_added',
          actorUid: 'u1',
          actorName: 'Alice',
          createdAt: SERVER_TS,
          targetType: 'comment',
          targetId: 'c-9',
          targetTitle: 'Great point',
        }
      );
    });

    it('carries through only the target fields that are present', async () => {
      await writePlcActivityEvent('plc-3', {
        ...baseInput,
        targetType: 'note',
      });

      expect(mockCollection).toHaveBeenCalledWith(
        { __brand: 'db' },
        'plcs',
        'plc-3',
        'activity'
      );
      const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
      // Invariant fields must survive the partial-target branch (Firestore
      // rules require actorName + createdAt), not just the one present target.
      expect(payload.id).toBe(GENERATED_ID);
      expect(payload.type).toBe('note_created');
      expect(payload.actorUid).toBe('u1');
      expect(payload.actorName).toBe('Alice');
      expect(payload.createdAt).toBe(SERVER_TS);
      expect(payload.targetType).toBe('note');
      expect(payload).not.toHaveProperty('targetId');
      expect(payload).not.toHaveProperty('targetTitle');
    });

    it('resolves to undefined and does not call logError on a successful write', async () => {
      await expect(
        writePlcActivityEvent('plc-1', baseInput)
      ).resolves.toBeUndefined();
      expect(mockLogError).not.toHaveBeenCalled();
    });

    it('swallows a write failure: resolves without throwing and logs the error', async () => {
      const failure = new Error('permission-denied');
      mockSetDoc.mockRejectedValueOnce(failure);

      // Fire-and-forget: the canonical write must never fail because of this.
      await expect(
        writePlcActivityEvent('plc-1', baseInput)
      ).resolves.toBeUndefined();

      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenCalledWith(
        'writePlcActivityEvent',
        failure,
        {
          plcId: 'plc-1',
          type: 'note_created',
        }
      );
    });
  });
});
