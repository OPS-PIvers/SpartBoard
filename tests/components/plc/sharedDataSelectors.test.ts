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
  weakestQuestions,
  isAggregateStale,
  latestContributionByAggregateId,
  buildAssessmentCards,
  filterAssessmentCards,
  collectAggregateTeachers,
  collectUnitLabels,
  type SharedDataAggregateFilters,
} from '@/components/plc/sharedData/sharedDataSelectors';
import type {
  PlcAssessmentAggregate,
  PlcAssignmentIndexEntry,
  PlcCommonAssessment,
  PlcContribution,
} from '@/types';

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

// ---------------------------------------------------------------------------
// AGGREGATE-DRIVEN selectors (Wave 3)
// ---------------------------------------------------------------------------

function makeAggregate(
  overrides: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId: 'sync-1',
    schemaVersion: 1,
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 72,
    perQuestion: [
      { questionId: 'q1', text: 'Easy', correctPercent: 92, points: 1 },
      { questionId: 'q2', text: 'Hard', correctPercent: 41, points: 1 },
      { questionId: 'q3', text: 'Medium', correctPercent: 68, points: 1 },
    ],
    perTeacher: [
      {
        teacherUid: 'uid-alice',
        teacherName: 'Alice',
        classCount: 2,
        averagePercent: 78,
        studentCount: 22,
      },
      {
        teacherUid: 'uid-bob',
        teacherName: 'Bob',
        classCount: 1,
        averagePercent: 64,
        studentCount: 18,
      },
    ],
    ranAt: 5_000_000,
    ...overrides,
  };
}

function makeAssessment(
  overrides: Partial<PlcCommonAssessment> = {}
): PlcCommonAssessment {
  return {
    id: 'sync-1',
    title: 'Unit 4 CFA',
    kind: 'quiz',
    syncGroupId: 'sync-1',
    status: 'reviewing',
    createdBy: 'uid-alice',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe('weakestQuestions', () => {
  it('sorts ascending by correctPercent and limits', () => {
    const result = weakestQuestions(makeAggregate().perQuestion, 2);
    expect(result.map((q) => q.questionId)).toEqual(['q2', 'q3']);
  });

  it('breaks ties by questionId', () => {
    const result = weakestQuestions([
      { questionId: 'qb', text: 'B', correctPercent: 50, points: 1 },
      { questionId: 'qa', text: 'A', correctPercent: 50, points: 1 },
    ]);
    expect(result.map((q) => q.questionId)).toEqual(['qa', 'qb']);
  });

  it('does not mutate the input array', () => {
    const input = makeAggregate().perQuestion;
    const copy = [...input];
    weakestQuestions(input);
    expect(input).toEqual(copy);
  });
});

describe('isAggregateStale', () => {
  it('is stale when ranAt is 0 (pending serverTimestamp)', () => {
    expect(isAggregateStale(makeAggregate({ ranAt: 0 }), 0)).toBe(true);
  });

  it('is stale when a contribution is newer than ranAt', () => {
    expect(isAggregateStale(makeAggregate({ ranAt: 100 }), 200)).toBe(true);
  });

  it('is NOT stale when ranAt is current', () => {
    expect(isAggregateStale(makeAggregate({ ranAt: 200 }), 100)).toBe(false);
  });
});

describe('latestContributionByAggregateId', () => {
  it('keys by designated assessment id when syncGroupId matches', () => {
    const contribs = [
      makeContribution({
        id: 'c1',
        quizId: 'quiz-x',
        syncGroupId: 'group-1',
        updatedAt: 9_000,
      }),
    ];
    const assessments = [
      makeAssessment({ id: 'assess-1', syncGroupId: 'group-1' }),
    ];
    const map = latestContributionByAggregateId(contribs, assessments);
    expect(map.get('assess-1')).toBe(9_000);
    expect(map.has('group-1')).toBe(false);
  });

  it('falls back to syncGroupId ?? quizId when no assessment matches', () => {
    const contribs = [
      makeContribution({
        id: 'c1',
        quizId: 'quiz-x',
        syncGroupId: null,
        updatedAt: 5,
      }),
      makeContribution({
        id: 'c2',
        quizId: 'quiz-y',
        syncGroupId: 'g',
        updatedAt: 7,
      }),
    ];
    const map = latestContributionByAggregateId(contribs, []);
    expect(map.get('quiz-x')).toBe(5);
    expect(map.get('g')).toBe(7);
  });

  it('keeps the max updatedAt per group', () => {
    const contribs = [
      makeContribution({ id: 'c1', syncGroupId: 'g', updatedAt: 3 }),
      makeContribution({ id: 'c2', syncGroupId: 'g', updatedAt: 8 }),
    ];
    const map = latestContributionByAggregateId(contribs, []);
    expect(map.get('g')).toBe(8);
  });
});

describe('buildAssessmentCards', () => {
  const members = [
    { uid: 'uid-alice', displayName: 'Alice' },
    { uid: 'uid-bob', displayName: 'Bob' },
    { uid: 'uid-carol', displayName: 'Carol' },
  ];

  it('produces one card per aggregate with anonymized rollups', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice',
      new Map()
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].teamAveragePercent).toBe(72);
    expect(cards[0].teacherCount).toBe(2);
    expect(cards[0].studentCount).toBe(40);
    // Weakest question first.
    expect(cards[0].weakestQuestions[0].questionId).toBe('q2');
  });

  it('joins the designated assessment by id (title/kind/unit/syncGroupId)', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [makeAssessment({ unitLabel: 'Unit 4' })],
      members,
      'uid-alice',
      new Map()
    );
    expect(cards[0].isDesignated).toBe(true);
    expect(cards[0].title).toBe('Unit 4 CFA');
    expect(cards[0].assessment?.unitLabel).toBe('Unit 4');
    expect(cards[0].syncGroupId).toBe('sync-1');
  });

  it('marks an undesignated card and uses the weakest-question text as the title fallback', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice',
      new Map()
    );
    expect(cards[0].isDesignated).toBe(false);
    // Title falls back to the weakest question text.
    expect(cards[0].title).toBe('Hard');
    // syncGroupId falls back to the aggregate id for designation.
    expect(cards[0].syncGroupId).toBe('sync-1');
  });

  it('cross-references the whole roster for who-ran-it (ran first)', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice',
      new Map()
    );
    const ran = cards[0].whoRan;
    expect(ran).toHaveLength(3);
    expect(cards[0].ranCount).toBe(2);
    expect(cards[0].expectedCount).toBe(3);
    // Carol has not run it.
    const carol = ran.find((w) => w.teacherUid === 'uid-carol');
    expect(carol?.hasRun).toBe(false);
  });

  it('marks the signed-in member’s own per-class row as "you"', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice',
      new Map()
    );
    const mine = cards[0].perClass.find((r) => r.teacherUid === 'uid-alice');
    expect(mine?.isYou).toBe(true);
    const bob = cards[0].perClass.find((r) => r.teacherUid === 'uid-bob');
    expect(bob?.isYou).toBe(false);
  });

  it('flags the card "updating" when a contribution outruns ranAt', () => {
    const latest = new Map([['sync-1', 9_999_999]]);
    const cards = buildAssessmentCards(
      [makeAggregate({ ranAt: 5_000_000 })],
      [],
      members,
      'uid-alice',
      latest
    );
    expect(cards[0].updating).toBe(true);
  });

  it('does NOT leak student names — only counts are present', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice',
      new Map()
    );
    const json = JSON.stringify(cards);
    expect(json).not.toContain('studentDisplayName');
    // perClass carries studentCount but no name field beyond the teacher's.
    expect(cards[0].perClass[0]).not.toHaveProperty('students');
  });
});

describe('filterAssessmentCards', () => {
  const baseFilters: SharedDataAggregateFilters = {
    type: 'all',
    teacherUid: 'all',
    unitLabel: 'all',
    status: 'all',
    search: '',
  };

  function cardsFixture() {
    const quiz = makeAggregate({ assessmentId: 'sync-1' });
    const va = makeAggregate({
      assessmentId: 'sync-2',
      perTeacher: [
        {
          teacherUid: 'uid-alice',
          teacherName: 'Alice',
          classCount: 1,
          averagePercent: 80,
          studentCount: 10,
        },
      ],
    });
    const assessments = [
      makeAssessment({
        id: 'sync-1',
        title: 'Reading CFA',
        unitLabel: 'Unit 4',
      }),
      makeAssessment({
        id: 'sync-2',
        title: 'Video Reflection',
        kind: 'video-activity',
        unitLabel: 'Unit 5',
        status: 'active',
      }),
    ];
    return buildAssessmentCards(
      [quiz, va],
      assessments,
      [
        { uid: 'uid-alice', displayName: 'Alice' },
        { uid: 'uid-bob', displayName: 'Bob' },
      ],
      'uid-alice',
      new Map()
    );
  }

  it('filters by type', () => {
    const cards = cardsFixture();
    const result = filterAssessmentCards(cards, {
      ...baseFilters,
      type: 'video-activity',
    });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('video-activity');
  });

  it('filters by teacher (perTeacher membership)', () => {
    const cards = cardsFixture();
    const result = filterAssessmentCards(cards, {
      ...baseFilters,
      teacherUid: 'uid-bob',
    });
    // Only sync-1 has Bob in perTeacher.
    expect(result).toHaveLength(1);
    expect(result[0].assessmentId).toBe('sync-1');
  });

  it('filters by unit label', () => {
    const cards = cardsFixture();
    const result = filterAssessmentCards(cards, {
      ...baseFilters,
      unitLabel: 'Unit 5',
    });
    expect(result).toHaveLength(1);
    expect(result[0].assessmentId).toBe('sync-2');
  });

  it('filters by status', () => {
    const cards = cardsFixture();
    const result = filterAssessmentCards(cards, {
      ...baseFilters,
      status: 'active',
    });
    expect(result).toHaveLength(1);
    expect(result[0].assessmentId).toBe('sync-2');
  });

  it('filters by case-insensitive search over the title', () => {
    const cards = cardsFixture();
    const result = filterAssessmentCards(cards, {
      ...baseFilters,
      search: 'reading',
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Reading CFA');
  });
});

describe('collectAggregateTeachers / collectUnitLabels', () => {
  it('collects distinct teachers across aggregates, name-sorted', () => {
    const teachers = collectAggregateTeachers([makeAggregate()]);
    expect(teachers.map((t) => t.name)).toEqual(['Alice', 'Bob']);
  });

  it('collects distinct non-empty unit labels from live assessments', () => {
    const units = collectUnitLabels([
      makeAssessment({ id: 'a', unitLabel: 'Unit 4' }),
      makeAssessment({ id: 'b', unitLabel: 'Unit 5' }),
      makeAssessment({ id: 'c', unitLabel: '' }),
      makeAssessment({ id: 'd', unitLabel: 'Unit 4' }),
      makeAssessment({ id: 'e', unitLabel: 'Trashed', deletedAt: 123 }),
    ]);
    expect(units).toEqual(['Unit 4', 'Unit 5']);
  });
});
