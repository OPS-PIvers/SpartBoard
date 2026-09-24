/**
 * Unit tests for sharedDataSelectors — pure aggregate view-model helpers.
 * No React, no Firebase. All assertions use real fixture objects that
 * match the shapes emitted by usePlcAggregate / usePlcAssessments.
 */

import { describe, it, expect } from 'vitest';
import {
  weakestQuestions,
  buildAssessmentCards,
  collectUnitLabels,
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
    contributorUids: ['uid-alice', 'uid-bob'],
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
    const cards = buildAssessmentCards([makeAggregate()], [], members);
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
      members
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
      members
    );
    expect(cards[0].isDesignated).toBe(false);
    expect(cards[0].title).toBe('Unit 4 CFA (server)');
  });

  it('marks an undesignated card and uses the weakest-question text as the title fallback', () => {
    const cards = buildAssessmentCards([makeAggregate()], [], members);
    expect(cards[0].isDesignated).toBe(false);
    // Title falls back to the weakest question text.
    expect(cards[0].title).toBe('Hard');
    // syncGroupId falls back to the aggregate id for designation.
    expect(cards[0].syncGroupId).toBe('sync-1');
  });

  it('cross-references the whole roster for who-ran-it (ran first)', () => {
    const cards = buildAssessmentCards([makeAggregate()], [], members);
    const ran = cards[0].whoRan;
    expect(ran).toHaveLength(3);
    expect(cards[0].ranCount).toBe(2);
    expect(cards[0].expectedCount).toBe(3);
    // Carol has not run it.
    const carol = ran.find((w) => w.teacherUid === 'uid-carol');
    expect(carol?.hasRun).toBe(false);
  });

  it('carries no per-teacher scores', () => {
    const cards = buildAssessmentCards([makeAggregate()], [], members);
    expect(cards[0]).not.toHaveProperty('perClass');
    expect(JSON.stringify(cards[0].whoRan)).not.toContain('averagePercent');
  });

  it('counts contributors when the roster has not loaded', () => {
    const cards = buildAssessmentCards([makeAggregate()], [], []);
    expect(cards[0].whoRan).toEqual([]);
    expect(cards[0].ranCount).toBe(2);
    expect(cards[0].expectedCount).toBe(2);
  });

  it('flags the card "updating" while ranAt is a pending serverTimestamp', () => {
    const cards = buildAssessmentCards(
      [makeAggregate({ ranAt: 0 })],
      [],
      members
    );
    expect(cards[0].updating).toBe(true);
  });

  it('does NOT leak student names — only counts are present', () => {
    const cards = buildAssessmentCards([makeAggregate()], [], members);
    const json = JSON.stringify(cards);
    expect(json).not.toContain('studentDisplayName');
  });
});

describe('collectUnitLabels', () => {
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
