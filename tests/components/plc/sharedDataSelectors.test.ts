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
