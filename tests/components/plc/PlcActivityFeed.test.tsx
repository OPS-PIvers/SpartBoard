// Unit tests for the PLC activity digest helpers (T8): splitSinceYouWereHere and describeActivityEvent.

import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';

import type { PlcActivityEvent, PlcActivityType } from '@/types';
import { MENTION_ACTIVITY_TARGET_TYPE } from '@/hooks/usePlcComments';
import {
  describeActivityEvent,
  isMentionOfSelf,
  splitSinceYouWereHere,
} from '@/components/plc/activity/activityDescriptions';

/** Minimal {{var}} interpolation so descriptions read like the real UI. */
function interpolate(template: string, opts?: Record<string, unknown>): string {
  if (!opts) return template;
  return template.replace(/{{\s*(\w+)\s*}}/g, (_m, name: string) => {
    const value = opts[name];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return `{{${name}}}`;
  });
}

// A passthrough `t` that mirrors react-i18next:
// returns the (plural-aware) defaultValue with {{vars}} interpolated.
function fakeT(key: string, opts?: Record<string, unknown>): string {
  const count = opts?.count;
  const plural = opts?.defaultValue_plural;
  const dflt = opts?.defaultValue;
  const tmpl =
    typeof count === 'number' && count !== 1 && typeof plural === 'string'
      ? plural
      : typeof dflt === 'string'
        ? dflt
        : key;
  return interpolate(tmpl, opts);
}
const t = fakeT as unknown as TFunction;

function ev(
  id: string,
  type: PlcActivityType,
  createdAt: number,
  extra: Partial<PlcActivityEvent> = {}
): PlcActivityEvent {
  return {
    id,
    type,
    actorUid: 'uid-actor',
    actorName: 'Alice',
    createdAt,
    ...extra,
  };
}

const ALL_TYPES: PlcActivityType[] = [
  'member_joined',
  'member_left',
  'role_changed',
  'assessment_created',
  'assessment_shared',
  'assessment_results_ready',
  'meeting_held',
  'note_created',
  'comment_added',
  'item_deleted',
  'item_restored',
];

// ---------------------------------------------------------------------------
// splitSinceYouWereHere
// ---------------------------------------------------------------------------

describe('splitSinceYouWereHere', () => {
  // newest-first, like the provider feed
  const activity = [
    ev('e3', 'note_created', 3000),
    ev('e2', 'meeting_held', 2000),
    ev('e1', 'member_joined', 1000),
  ];

  it('puts events strictly newer than the cursor in "since"', () => {
    const { since, older } = splitSinceYouWereHere(activity, 1500);
    expect(since.map((e) => e.id)).toEqual(['e3', 'e2']);
    expect(older.map((e) => e.id)).toEqual(['e1']);
  });

  it('treats an event exactly at the cursor as already seen (strict >)', () => {
    const { since, older } = splitSinceYouWereHere(activity, 2000);
    expect(since.map((e) => e.id)).toEqual(['e3']);
    expect(older.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('puts everything in "since" when the cursor is null (never visited)', () => {
    const { since, older } = splitSinceYouWereHere(activity, null);
    expect(since).toHaveLength(3);
    expect(older).toHaveLength(0);
  });

  it('puts everything in "older" when the cursor is past all events', () => {
    const { since, older } = splitSinceYouWereHere(activity, 9999);
    expect(since).toHaveLength(0);
    expect(older).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// describeActivityEvent
// ---------------------------------------------------------------------------

describe('describeActivityEvent', () => {
  it('produces a non-empty, interpolated description for EVERY type', () => {
    for (const type of ALL_TYPES) {
      const desc = describeActivityEvent(
        ev('x', type, 1000, { targetTitle: 'Unit 4 CFA' }),
        t,
        'uid-self'
      );
      expect(desc.length).toBeGreaterThan(0);
      // No un-interpolated placeholders leaked through.
      expect(desc).not.toContain('{{actor}}');
      expect(desc).not.toContain('{{target}}');
      // The actor name is woven into the actor-bearing descriptions.
      if (type !== 'assessment_results_ready') {
        expect(desc).toContain('Alice');
      }
    }
  });

  it('falls back to a translated actor when actorName is blank', () => {
    const desc = describeActivityEvent(
      ev('x', 'member_joined', 1000, { actorName: '   ' }),
      t,
      'uid-self'
    );
    expect(desc).toContain('Someone');
  });

  it('uses the dedicated "mentioned you" copy for a self-mention', () => {
    const mention = ev('m', 'comment_added', 1000, {
      targetType: MENTION_ACTIVITY_TARGET_TYPE,
      targetId: 'uid-self',
      targetTitle: 'thread-123',
    });
    expect(isMentionOfSelf(mention, 'uid-self')).toBe(true);
    const desc = describeActivityEvent(mention, t, 'uid-self');
    expect(desc).toContain('mentioned you');
  });

  it('does NOT treat a mention of someone else as a self-mention', () => {
    const mention = ev('m', 'comment_added', 1000, {
      targetType: MENTION_ACTIVITY_TARGET_TYPE,
      targetId: 'uid-other',
    });
    expect(isMentionOfSelf(mention, 'uid-self')).toBe(false);
  });
});
