/**
 * Unit coverage for the pure logic behind `usePlcComments` (Decision 2.6,
 * §3.5) — the mention→activity fan-out, the comment parser, mention resolution,
 * and the @mention candidate filter. The Firestore-listener + write side of the
 * hook is exercised by the emulator rules suite (`tests/rules/plcComments.test.ts`);
 * this file pins the non-trivial pure logic without an emulator.
 *
 * The headline behavior (acceptance criterion): a comment with @mentions fans
 * out to ONE general `comment_added` activity event PLUS one per mentioned uid,
 * so each mentioned member's unread (T3) increments.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCommentActivityEvents,
  parseComment,
  COMMENT_ACTIVITY_TARGET_TYPE,
  MENTION_ACTIVITY_TARGET_TYPE,
} from '@/hooks/usePlcComments';
import {
  resolveMentions,
  filterMentionCandidates,
  type MentionCandidate,
} from '@/components/plc/comments/mentionUtils';
import type { PlcMember } from '@/types';

// ---------------------------------------------------------------------------
// buildCommentActivityEvents — the mention → activity fan-out
// ---------------------------------------------------------------------------

describe('buildCommentActivityEvents', () => {
  const base = {
    actorUid: 'author',
    actorName: 'Author Teacher',
    targetType: 'dataCard' as const,
    targetId: 'assessment:q1',
  };

  it('emits exactly one general event when there are no mentions', () => {
    const events = buildCommentActivityEvents({ ...base, mentions: [] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'comment_added',
      actorUid: 'author',
      targetType: COMMENT_ACTIVITY_TARGET_TYPE,
      targetId: 'assessment:q1',
    });
  });

  it('fans out one general event PLUS one per mentioned uid', () => {
    const events = buildCommentActivityEvents({
      ...base,
      mentions: ['m1', 'm2'],
    });
    // 1 general + 2 mention events.
    expect(events).toHaveLength(3);
    const general = events.filter(
      (e) => e.targetType === COMMENT_ACTIVITY_TARGET_TYPE
    );
    const mentions = events.filter(
      (e) => e.targetType === MENTION_ACTIVITY_TARGET_TYPE
    );
    expect(general).toHaveLength(1);
    expect(mentions).toHaveLength(2);
    // Each mention event carries the mentioned uid as targetId and the thread
    // id as targetTitle, and is typed comment_added (so T3 unread picks it up).
    expect(mentions.map((e) => e.targetId).sort()).toEqual(['m1', 'm2']);
    for (const e of mentions) {
      expect(e.type).toBe('comment_added');
      expect(e.actorUid).toBe('author');
      expect(e.targetTitle).toBe('assessment:q1');
    }
  });

  it('de-duplicates repeated mentions of the same uid', () => {
    const events = buildCommentActivityEvents({
      ...base,
      mentions: ['m1', 'm1', 'm1'],
    });
    const mentions = events.filter(
      (e) => e.targetType === MENTION_ACTIVITY_TARGET_TYPE
    );
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.targetId).toBe('m1');
  });

  it('never self-notifies (drops a mention of the author)', () => {
    const events = buildCommentActivityEvents({
      ...base,
      mentions: ['author', 'm2'],
    });
    const mentions = events.filter(
      (e) => e.targetType === MENTION_ACTIVITY_TARGET_TYPE
    );
    expect(mentions.map((e) => e.targetId)).toEqual(['m2']);
  });

  it('ignores empty / non-string mention entries', () => {
    const events = buildCommentActivityEvents({
      ...base,
      mentions: ['', 'm2'],
    });
    const mentions = events.filter(
      (e) => e.targetType === MENTION_ACTIVITY_TARGET_TYPE
    );
    expect(mentions.map((e) => e.targetId)).toEqual(['m2']);
  });
});

// ---------------------------------------------------------------------------
// parseComment
// ---------------------------------------------------------------------------

describe('parseComment', () => {
  const valid = () => ({
    id: 'c1',
    targetType: 'dataCard',
    targetId: 'assessment:q1',
    authorUid: 'u1',
    authorName: 'Teacher One',
    body: 'Look here.',
    mentions: ['u2'],
    createdAt: 1000,
  });

  it('parses a well-formed comment, pinning id from the doc id', () => {
    const parsed = parseComment('c1', valid());
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('c1');
    expect(parsed?.mentions).toEqual(['u2']);
    expect(parsed?.createdAt).toBe(1000);
  });

  it('drops a comment with an out-of-union targetType', () => {
    expect(parseComment('c1', { ...valid(), targetType: 'wall' })).toBeNull();
  });

  it('drops a comment missing a required field', () => {
    const { body: _body, ...withoutBody } = valid();
    expect(parseComment('c1', withoutBody)).toBeNull();
  });

  it('drops a comment whose mentions is not a list', () => {
    expect(parseComment('c1', { ...valid(), mentions: 'u2' })).toBeNull();
  });

  it('filters non-string entries out of mentions', () => {
    const parsed = parseComment('c1', {
      ...valid(),
      mentions: ['u2', 42, null, 'u3'],
    });
    expect(parsed?.mentions).toEqual(['u2', 'u3']);
  });

  it('carries deletedAt through (soft-delete tombstone)', () => {
    const parsed = parseComment('c1', { ...valid(), deletedAt: 5000 });
    expect(parsed?.deletedAt).toBe(5000);
  });

  it('treats a pending serverTimestamp createdAt as 0', () => {
    const parsed = parseComment('c1', { ...valid(), createdAt: null });
    expect(parsed?.createdAt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveMentions — only keep mentions whose @token survives in the body
// ---------------------------------------------------------------------------

describe('resolveMentions', () => {
  const candidate = (uid: string, displayName: string): MentionCandidate => ({
    uid,
    displayName,
    email: `${displayName.toLowerCase()}@x.edu`,
  });

  it('keeps a mention whose @DisplayName token is still present', () => {
    const body = 'Hey @Sam Jones can you look?';
    const uids = resolveMentions(body, [candidate('u1', 'Sam Jones')]);
    expect(uids).toEqual(['u1']);
  });

  it('drops a mention whose token was deleted from the body', () => {
    const body = 'No mention here anymore.';
    const uids = resolveMentions(body, [candidate('u1', 'Sam Jones')]);
    expect(uids).toEqual([]);
  });

  it('de-duplicates a selected candidate', () => {
    const body = '@Sam Jones @Sam Jones';
    const uids = resolveMentions(body, [
      candidate('u1', 'Sam Jones'),
      candidate('u1', 'Sam Jones'),
    ]);
    expect(uids).toEqual(['u1']);
  });
});

// ---------------------------------------------------------------------------
// filterMentionCandidates — the @mention autocomplete matcher
// ---------------------------------------------------------------------------

describe('filterMentionCandidates', () => {
  const member = (
    uid: string,
    displayName: string,
    email: string
  ): PlcMember => ({
    uid,
    email,
    displayName,
    role: 'member',
    joinedAt: 0,
    status: 'active',
  });

  const members: PlcMember[] = [
    member('u1', 'Sam Jones', 'sjones@x.edu'),
    member('u2', 'Sandra Lee', 'slee@x.edu'),
    member('u3', 'Bob Smith', 'bsmith@x.edu'),
    member('me', 'Me Myself', 'me@x.edu'),
  ];

  it('returns all (capped) members for an empty query, excluding self', () => {
    const out = filterMentionCandidates(members, '', 'me');
    expect(out.map((c) => c.uid)).not.toContain('me');
    expect(out).toHaveLength(3);
  });

  it('ranks prefix matches before substring matches', () => {
    // "sa" prefixes Sam + Sandra; "smith" is a substring of Bob Smith.
    const out = filterMentionCandidates(members, 'sa', null);
    expect(out.map((c) => c.uid)).toEqual(['u1', 'u2']);
  });

  it('matches against the email local-part', () => {
    const out = filterMentionCandidates(members, 'bsmith', null);
    expect(out.map((c) => c.uid)).toEqual(['u3']);
  });

  it('excludes the given uid (self) from matches', () => {
    const out = filterMentionCandidates(members, 'me', 'me');
    expect(out).toHaveLength(0);
  });
});
