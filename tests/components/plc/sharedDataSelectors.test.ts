/**
 * Unit tests for sharedDataSelectors — pure aggregate view-model helpers.
 * No React, no Firebase. All assertions use real fixture objects that
 * match the shapes emitted by usePlcAggregate / usePlcAssessments.
 */

import { describe, it, expect } from 'vitest';
import {
  weakestQuestions,
  buildAssessmentCards,
  filterAssessmentCards,
  collectAggregateTeachers,
  collectUnitLabels,
  type SharedDataAggregateFilters,
} from '@/components/plc/sharedData/sharedDataSelectors';
import type { PlcAssessmentAggregate, PlcCommonAssessment } from '@/types';

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

  it('excludes questions served to fewer than five students', () => {
    const result = weakestQuestions([
      {
        questionId: 'tiny',
        text: 'Tiny sample',
        correctPercent: 0,
        points: 1,
        servedCount: 4,
      },
      {
        questionId: 'enough',
        text: 'Enough data',
        correctPercent: 60,
        points: 1,
        servedCount: 5,
      },
    ]);
    expect(result.map((question) => question.questionId)).toEqual(['enough']);
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
      'uid-alice'
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
      'uid-alice'
    );
    expect(cards[0].isDesignated).toBe(true);
    expect(cards[0].title).toBe('Unit 4 CFA');
    expect(cards[0].assessment?.unitLabel).toBe('Unit 4');
    expect(cards[0].syncGroupId).toBe('sync-1');
  });

  it('falls back to the aggregate title before the weakest-question text', () => {
    const cards = buildAssessmentCards(
      [makeAggregate({ title: 'Unit 4 CFA (server)' })],
      [],
      members,
      'uid-alice'
    );
    expect(cards[0].isDesignated).toBe(false);
    expect(cards[0].title).toBe('Unit 4 CFA (server)');
  });

  it('marks an undesignated card and uses the weakest-question text as the title fallback', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice'
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
      'uid-alice'
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
      'uid-alice'
    );
    const mine = cards[0].perClass.find((r) => r.teacherUid === 'uid-alice');
    expect(mine?.isYou).toBe(true);
    const bob = cards[0].perClass.find((r) => r.teacherUid === 'uid-bob');
    expect(bob?.isYou).toBe(false);
  });

  it('flags the card "updating" while ranAt is a pending serverTimestamp', () => {
    const cards = buildAssessmentCards(
      [makeAggregate({ ranAt: 0 })],
      [],
      members,
      'uid-alice'
    );
    expect(cards[0].updating).toBe(true);
  });

  it('does NOT leak student names — only counts are present', () => {
    const cards = buildAssessmentCards(
      [makeAggregate()],
      [],
      members,
      'uid-alice'
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
      'uid-alice'
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
