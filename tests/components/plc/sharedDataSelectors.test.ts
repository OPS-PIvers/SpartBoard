/**
 * Unit tests for sharedDataSelectors — pure filter + summarise helpers.
 * No React, no Firebase. All assertions use real fixture objects that
 * match the shapes emitted by usePlcAssignmentIndex / usePlcContributions.
 */

import { describe, it, expect } from 'vitest';
import {
  filterEntries,
  filterContributionResponses,
  summarize,
  groupContributionsByQuizIdentity,
} from '@/components/plc/sharedData/sharedDataSelectors';
import type { PlcAssignmentIndexEntry, PlcContribution } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<PlcAssignmentIndexEntry> = {}
): PlcAssignmentIndexEntry {
  return {
    id: 'e1',
    kind: 'quiz',
    ownerUid: 'uid-alice',
    ownerName: 'Alice',
    ownerEmail: 'alice@school.edu',
    title: 'Unit 3 Quiz',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/fake',
    status: 'active',
    createdAt: 1_000_000,
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<PlcContribution> & {
    responses?: PlcContribution['responses'];
  } = {}
): PlcContribution {
  const { responses, ...rest } = overrides;
  return {
    id: 'c1',
    schemaVersion: 1,
    quizId: 'quiz-1',
    syncGroupId: null,
    teacherUid: 'uid-alice',
    teacherName: 'Alice',
    questionsSnapshot: [{ id: 'q1', text: 'Question 1', points: 10 }],
    responses: responses ?? [
      {
        studentDisplayName: 'Student A',
        pin: null,
        classPeriod: '1',
        status: 'completed',
        scorePercent: 80,
        pointsEarned: 8,
        maxPoints: 10,
        tabSwitchWarnings: 0,
        submittedAt: 2_000_000,
        pointsByQuestionId: { q1: 8 },
      },
    ],
    updatedAt: 2_000_000,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// filterEntries
// ---------------------------------------------------------------------------

describe('filterEntries', () => {
  const quizEntry = makeEntry({
    id: 'e1',
    kind: 'quiz',
    ownerUid: 'uid-alice',
  });
  const vaEntry = makeEntry({
    id: 'e2',
    kind: 'video-activity',
    ownerUid: 'uid-bob',
    ownerName: 'Bob',
    title: 'Fractions Video',
    createdAt: 2_000_000,
  });
  const entries = [quizEntry, vaEntry];

  it('returns all entries when filters are all "all"', () => {
    const result = filterEntries(entries, {
      type: 'all',
      teacherUid: 'all',
      assignmentId: 'all',
      dateRange: null,
    });
    expect(result).toHaveLength(2);
  });

  it('filters by type=quiz', () => {
    const result = filterEntries(entries, {
      type: 'quiz',
      teacherUid: 'all',
      assignmentId: 'all',
      dateRange: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filters by type=video-activity', () => {
    const result = filterEntries(entries, {
      type: 'video-activity',
      teacherUid: 'all',
      assignmentId: 'all',
      dateRange: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e2');
  });

  it('filters by teacherUid', () => {
    const result = filterEntries(entries, {
      type: 'all',
      teacherUid: 'uid-bob',
      assignmentId: 'all',
      dateRange: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].ownerName).toBe('Bob');
  });

  it('filters by assignmentId', () => {
    const result = filterEntries(entries, {
      type: 'all',
      teacherUid: 'all',
      assignmentId: 'e1',
      dateRange: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filters by dateRange — keeps entries within range', () => {
    const result = filterEntries(entries, {
      type: 'all',
      teacherUid: 'all',
      assignmentId: 'all',
      dateRange: { from: 500_000, to: 1_500_000 },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filters by dateRange — excludes entries outside range', () => {
    const result = filterEntries(entries, {
      type: 'all',
      teacherUid: 'all',
      assignmentId: 'all',
      dateRange: { from: 3_000_000, to: 4_000_000 },
    });
    expect(result).toHaveLength(0);
  });

  it('combines type + teacher filters', () => {
    const result = filterEntries(entries, {
      type: 'quiz',
      teacherUid: 'uid-bob',
      assignmentId: 'all',
      dateRange: null,
    });
    expect(result).toHaveLength(0);
  });

  it('returns empty array on empty input', () => {
    const result = filterEntries([], {
      type: 'quiz',
      teacherUid: 'all',
      assignmentId: 'all',
      dateRange: null,
    });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterContributionResponses
// ---------------------------------------------------------------------------

describe('filterContributionResponses', () => {
  const contrib = makeContribution({
    responses: [
      {
        studentDisplayName: 'Alice Student',
        pin: null,
        classPeriod: '1',
        status: 'completed',
        scorePercent: 90,
        pointsEarned: 9,
        maxPoints: 10,
        tabSwitchWarnings: 0,
        submittedAt: 1_000_000,
        pointsByQuestionId: { q1: 9 },
      },
      {
        studentDisplayName: 'Bob Student',
        pin: null,
        classPeriod: '2',
        status: 'completed',
        scorePercent: 70,
        pointsEarned: 7,
        maxPoints: 10,
        tabSwitchWarnings: 0,
        submittedAt: 1_000_001,
        pointsByQuestionId: { q1: 7 },
      },
    ],
  });

  it('returns all responses when classPeriod is "all"', () => {
    const result = filterContributionResponses([contrib], {
      classPeriod: 'all',
    });
    expect(result[0].responses).toHaveLength(2);
  });

  it('filters responses to matching classPeriod', () => {
    const result = filterContributionResponses([contrib], {
      classPeriod: '1',
    });
    expect(result[0].responses).toHaveLength(1);
    expect(result[0].responses[0].studentDisplayName).toBe('Alice Student');
  });

  it('returns contribution with empty responses when none match the period', () => {
    const result = filterContributionResponses([contrib], {
      classPeriod: '99',
    });
    expect(result[0].responses).toHaveLength(0);
  });

  it('filters across multiple contributions', () => {
    const contrib2 = makeContribution({
      id: 'c2',
      teacherUid: 'uid-bob',
      teacherName: 'Bob',
      responses: [
        {
          studentDisplayName: 'Charlie Student',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 60,
          pointsEarned: 6,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 1_000_002,
          pointsByQuestionId: { q1: 6 },
        },
      ],
    });
    const result = filterContributionResponses([contrib, contrib2], {
      classPeriod: '1',
    });
    expect(result).toHaveLength(2);
    expect(result[0].responses).toHaveLength(1);
    expect(result[1].responses).toHaveLength(1);
  });

  it('returns empty array on empty input', () => {
    const result = filterContributionResponses([], { classPeriod: '1' });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros and null avgScore for empty contributions', () => {
    const result = summarize([]);
    expect(result.avgScore).toBeNull();
    expect(result.teacherCount).toBe(0);
    expect(result.studentCount).toBe(0);
  });

  it('counts completed responses for studentCount', () => {
    const contrib = makeContribution({
      responses: [
        {
          studentDisplayName: 'S1',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 80,
          pointsEarned: 8,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 1_000_000,
          pointsByQuestionId: { q1: 8 },
        },
        {
          studentDisplayName: 'S2',
          pin: null,
          classPeriod: '1',
          status: 'in-progress',
          scorePercent: null,
          pointsEarned: 0,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: null,
          pointsByQuestionId: {},
        },
      ],
    });
    const result = summarize([contrib]);
    expect(result.studentCount).toBe(2);
  });

  it('computes average score across completed responses', () => {
    const contrib = makeContribution({
      responses: [
        {
          studentDisplayName: 'S1',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 80,
          pointsEarned: 8,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 1_000_000,
          pointsByQuestionId: { q1: 8 },
        },
        {
          studentDisplayName: 'S2',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 60,
          pointsEarned: 6,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 1_000_001,
          pointsByQuestionId: { q1: 6 },
        },
      ],
    });
    const result = summarize([contrib]);
    expect(result.avgScore).toBe(70);
  });

  it('counts unique teachers by teacherUid', () => {
    const c1 = makeContribution({ id: 'c1', teacherUid: 'uid-alice' });
    const c2 = makeContribution({ id: 'c2', teacherUid: 'uid-bob' });
    const c3 = makeContribution({ id: 'c3', teacherUid: 'uid-alice' }); // duplicate
    const result = summarize([c1, c2, c3]);
    expect(result.teacherCount).toBe(2);
  });

  it('excludes in-progress responses from avgScore but includes them in studentCount', () => {
    const contrib = makeContribution({
      responses: [
        {
          studentDisplayName: 'S1',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 100,
          pointsEarned: 10,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 1_000_000,
          pointsByQuestionId: { q1: 10 },
        },
        {
          studentDisplayName: 'S2',
          pin: null,
          classPeriod: '1',
          status: 'in-progress',
          scorePercent: null,
          pointsEarned: 0,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: null,
          pointsByQuestionId: {},
        },
      ],
    });
    const result = summarize([contrib]);
    // Only S1 has a score
    expect(result.avgScore).toBe(100);
    // Both S1 and S2 count as students
    expect(result.studentCount).toBe(2);
  });

  it('returns null avgScore when no completed responses exist', () => {
    const contrib = makeContribution({
      responses: [
        {
          studentDisplayName: 'S1',
          pin: null,
          classPeriod: '1',
          status: 'in-progress',
          scorePercent: null,
          pointsEarned: 0,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: null,
          pointsByQuestionId: {},
        },
      ],
    });
    const result = summarize([contrib]);
    expect(result.avgScore).toBeNull();
  });

  it('handles null scorePercent gracefully', () => {
    const contrib = makeContribution({
      responses: [
        {
          studentDisplayName: 'S1',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: null, // completed but no score
          pointsEarned: 0,
          maxPoints: 0,
          tabSwitchWarnings: 0,
          submittedAt: 1_000_000,
          pointsByQuestionId: {},
        },
      ],
    });
    const result = summarize([contrib]);
    expect(result.avgScore).toBeNull();
    expect(result.studentCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// groupContributionsByQuizIdentity (T3)
// ---------------------------------------------------------------------------

describe('groupContributionsByQuizIdentity', () => {
  it('collapses two contributions sharing a syncGroupId into ONE group', () => {
    const c1 = makeContribution({
      id: 'c1',
      quizId: 'quiz-a',
      syncGroupId: 'sync-1',
      teacherUid: 'uid-alice',
      teacherName: 'Alice',
      updatedAt: 1_000,
    });
    const c2 = makeContribution({
      id: 'c2',
      // Different quizId, but SAME syncGroupId — identity is the syncGroupId.
      quizId: 'quiz-b',
      syncGroupId: 'sync-1',
      teacherUid: 'uid-alice',
      teacherName: 'Alice',
      updatedAt: 2_000,
    });

    const groups = groupContributionsByQuizIdentity([c1, c2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].identity).toBe('sync-1');
    expect(groups[0].contributions).toHaveLength(2);
  });

  it('falls back to quizId as the identity when syncGroupId is null', () => {
    const c1 = makeContribution({
      id: 'c1',
      quizId: 'quiz-only',
      syncGroupId: null,
    });

    const groups = groupContributionsByQuizIdentity([c1]);
    expect(groups).toHaveLength(1);
    expect(groups[0].identity).toBe('quiz-only');
  });

  it('keeps distinct quizIds (null syncGroupId) in separate groups', () => {
    const c1 = makeContribution({ id: 'c1', quizId: 'q1', syncGroupId: null });
    const c2 = makeContribution({ id: 'c2', quizId: 'q2', syncGroupId: null });

    const groups = groupContributionsByQuizIdentity([c1, c2]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.identity).sort()).toEqual(['q1', 'q2']);
  });

  it('exposes the latest updatedAt across a group', () => {
    const c1 = makeContribution({
      id: 'c1',
      quizId: 'quiz-a',
      syncGroupId: 'sync-x',
      updatedAt: 5_000,
    });
    const c2 = makeContribution({
      id: 'c2',
      quizId: 'quiz-a',
      syncGroupId: 'sync-x',
      updatedAt: 9_000,
    });
    const c3 = makeContribution({
      id: 'c3',
      quizId: 'quiz-a',
      syncGroupId: 'sync-x',
      updatedAt: 7_000,
    });

    const groups = groupContributionsByQuizIdentity([c1, c2, c3]);
    expect(groups).toHaveLength(1);
    expect(groups[0].latestUpdatedAt).toBe(9_000);
  });

  it('uses the single-owner index-entry title when available', () => {
    const c1 = makeContribution({
      id: 'c1',
      quizId: 'quiz-a',
      syncGroupId: 'sync-t',
      teacherUid: 'uid-alice',
    });
    const titleByOwnerUid = new Map([
      ['uid-alice', 'Unit 3 Quiz (from entry)'],
    ]);

    const groups = groupContributionsByQuizIdentity([c1], titleByOwnerUid);
    expect(groups[0].title).toBe('Unit 3 Quiz (from entry)');
  });

  it('falls back to the first question text when no entry title is available', () => {
    const c1 = makeContribution({
      id: 'c1',
      quizId: 'quiz-a',
      syncGroupId: 'sync-t',
      questionsSnapshot: [
        { id: 'q1', text: 'What is photosynthesis?', points: 10 },
      ],
    });

    // No titleByOwnerUid map → fall back to first question text.
    const groups = groupContributionsByQuizIdentity([c1]);
    expect(groups[0].title).toBe('What is photosynthesis?');
  });

  it('does NOT use the entry title when a group has multiple teachers', () => {
    // Two teachers, same syncGroupId — teacherUids.size > 1 so the single-owner
    // title hint must NOT apply (it would mis-attribute the title).
    const alice = makeContribution({
      id: 'c1',
      quizId: 'quiz-a',
      syncGroupId: 'sync-multi',
      teacherUid: 'uid-alice',
      questionsSnapshot: [{ id: 'q1', text: 'Shared question', points: 10 }],
    });
    const bob = makeContribution({
      id: 'c2',
      quizId: 'quiz-a',
      syncGroupId: 'sync-multi',
      teacherUid: 'uid-bob',
    });
    const titleByOwnerUid = new Map([['uid-alice', 'Alice Entry Title']]);

    const groups = groupContributionsByQuizIdentity(
      [alice, bob],
      titleByOwnerUid
    );
    expect(groups).toHaveLength(1);
    // Falls back to first question text, not the single-owner entry title.
    expect(groups[0].title).toBe('Shared question');
  });

  it('cross-teacher: same syncGroupId → ONE group attributed to BOTH teachers (no double-count)', () => {
    // The bug this function fixed: a quiz synced across two teachers must
    // produce a SINGLE results group crediting both teachers, not two groups
    // and not a double-counted single teacher.
    const alice = makeContribution({
      id: 'c-alice',
      quizId: 'quiz-alice-copy',
      syncGroupId: 'sync-shared',
      teacherUid: 'uid-alice',
      teacherName: 'Alice',
      updatedAt: 3_000,
    });
    const bob = makeContribution({
      id: 'c-bob',
      quizId: 'quiz-bob-copy',
      syncGroupId: 'sync-shared',
      teacherUid: 'uid-bob',
      teacherName: 'Bob',
      updatedAt: 4_000,
    });

    const groups = groupContributionsByQuizIdentity([alice, bob]);
    expect(groups).toHaveLength(1);
    expect(groups[0].identity).toBe('sync-shared');
    // Both teachers attributed to the single group.
    expect(groups[0].teacherUids.size).toBe(2);
    expect(groups[0].teacherUids.has('uid-alice')).toBe(true);
    expect(groups[0].teacherUids.has('uid-bob')).toBe(true);
    // Both contributions belong to the one group (each counted exactly once).
    expect(groups[0].contributions).toHaveLength(2);
  });

  it('sorts groups most-recent first by latestUpdatedAt', () => {
    const older = makeContribution({
      id: 'c-old',
      quizId: 'q-old',
      syncGroupId: null,
      updatedAt: 1_000,
    });
    const newer = makeContribution({
      id: 'c-new',
      quizId: 'q-new',
      syncGroupId: null,
      updatedAt: 9_000,
    });

    const groups = groupContributionsByQuizIdentity([older, newer]);
    expect(groups.map((g) => g.identity)).toEqual(['q-new', 'q-old']);
  });

  it('returns an empty array for no contributions', () => {
    expect(groupContributionsByQuizIdentity([])).toHaveLength(0);
  });
});
