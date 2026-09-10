/**
 * Unit tests for the merged Assessments list selectors — statuses (incl. the
 * schema-1 fallback), library-only rows, filter chip, search, and sort order.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateStatus,
  buildAssessmentRows,
  countRowsByFolder,
  filterAssessmentRows,
  filterRowsByFolder,
  hasTeamAverage,
  sortWorstFirst,
  suggestedFolderNames,
} from '@/components/plc/assessments/assessmentListSelectors';
import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcQuizEntry,
} from '@/types';

function makeAggregate(
  overrides: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId: 'a1',
    schemaVersion: 2,
    title: 'Unit 4 CFA',
    kind: 'quiz',
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 72,
    scoredStudentCount: 40,
    sessionCount: 2,
    linkedSessionCount: 2,
    publishedSessionCount: 2,
    perQuestion: [],
    perTeacher: [],
    ranAt: 5_000,
    ...overrides,
  };
}

function makeAssessment(
  overrides: Partial<PlcCommonAssessment> = {}
): PlcCommonAssessment {
  return {
    id: 'a1',
    title: 'Unit 4 CFA',
    kind: 'quiz',
    syncGroupId: 'g1',
    status: 'active',
    createdBy: 'uid-a',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<PlcQuizEntry> = {}): PlcQuizEntry {
  return {
    id: 'e1',
    title: 'Library quiz',
    questionCount: 8,
    syncGroupId: 'g-lib',
    sharedBy: 'uid-b',
    sharedByEmail: 'b@x',
    sharedByName: 'Bea',
    sharedAt: 500,
    updatedAt: 500,
    ...overrides,
  };
}

describe('aggregateStatus', () => {
  it('is notStarted without an aggregate or without linked sessions', () => {
    expect(aggregateStatus(null)).toBe('notStarted');
    expect(
      aggregateStatus(
        makeAggregate({ linkedSessionCount: 0, publishedSessionCount: 0 })
      )
    ).toBe('notStarted');
  });

  it('is inProgress while some linked sessions are unpublished', () => {
    expect(
      aggregateStatus(
        makeAggregate({ linkedSessionCount: 3, publishedSessionCount: 1 })
      )
    ).toBe('inProgress');
  });

  it('is scored when every linked session is published', () => {
    expect(aggregateStatus(makeAggregate())).toBe('scored');
  });

  it('falls back to studentCount for schema-1 aggregates', () => {
    const legacy = makeAggregate({
      schemaVersion: 1,
      linkedSessionCount: undefined,
      publishedSessionCount: undefined,
    });
    expect(aggregateStatus(legacy)).toBe('inProgress');
    expect(aggregateStatus({ ...legacy, studentCount: 0 })).toBe('notStarted');
  });
});

describe('hasTeamAverage', () => {
  it('needs a published session and a scored student', () => {
    expect(hasTeamAverage(makeAggregate())).toBe(true);
    expect(hasTeamAverage(makeAggregate({ publishedSessionCount: 0 }))).toBe(
      false
    );
    expect(hasTeamAverage(makeAggregate({ scoredStudentCount: 0 }))).toBe(
      false
    );
    expect(hasTeamAverage(null)).toBe(false);
  });

  it('uses studentCount for schema-1 aggregates', () => {
    expect(
      hasTeamAverage(
        makeAggregate({
          publishedSessionCount: undefined,
          scoredStudentCount: undefined,
        })
      )
    ).toBe(true);
  });
});

describe('buildAssessmentRows', () => {
  it('joins assessments to aggregates and library entries', () => {
    const rows = buildAssessmentRows({
      assessments: [makeAssessment()],
      aggregates: [makeAggregate()],
      libraryEntries: [makeEntry({ syncGroupId: 'g1', questionCount: 12 })],
      memberCount: 4,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'a1',
      assessmentId: 'a1',
      title: 'Unit 4 CFA',
      status: 'scored',
      questionCount: 12,
      teacherCount: 2,
      memberCount: 4,
      studentCount: 40,
      ranAt: 5_000,
      sharedByName: 'Bea',
    });
  });

  it('adds library-only rows for shared quizzes with no assessment', () => {
    const rows = buildAssessmentRows({
      assessments: [makeAssessment()],
      aggregates: [],
      libraryEntries: [makeEntry()],
      memberCount: 2,
    });
    const libraryRow = rows.find((r) => r.status === 'libraryOnly');
    expect(libraryRow).toMatchObject({
      id: 'library:g-lib',
      assessmentId: null,
      title: 'Library quiz',
      questionCount: 8,
    });
  });

  it('skips deleted assessments, deleted entries and non-quiz kinds', () => {
    const rows = buildAssessmentRows({
      assessments: [
        makeAssessment({ id: 'gone', deletedAt: 10 }),
        makeAssessment({ id: 'va', kind: 'video-activity', syncGroupId: 'v' }),
      ],
      aggregates: [],
      libraryEntries: [makeEntry({ deletedAt: 5 })],
      memberCount: 1,
    });
    expect(rows).toHaveLength(0);
  });

  it('falls back to the aggregate title, then the library title', () => {
    const rows = buildAssessmentRows({
      assessments: [makeAssessment({ title: '' })],
      aggregates: [makeAggregate({ title: 'From aggregate' })],
      libraryEntries: [],
      memberCount: 1,
    });
    expect(rows[0].title).toBe('From aggregate');
  });

  it('marks archived assessments and treats a pending ranAt as unknown', () => {
    const rows = buildAssessmentRows({
      assessments: [makeAssessment({ status: 'closed' })],
      aggregates: [makeAggregate({ ranAt: 0 })],
      libraryEntries: [],
      memberCount: 1,
    });
    expect(rows[0].archived).toBe(true);
    expect(rows[0].ranAt).toBeNull();
  });

  it('sorts in-progress, then scored, then not started, then library only', () => {
    const rows = buildAssessmentRows({
      assessments: [
        makeAssessment({ id: 'scored-old', syncGroupId: 's1' }),
        makeAssessment({ id: 'scored-new', syncGroupId: 's2' }),
        makeAssessment({ id: 'running', syncGroupId: 'r1' }),
        makeAssessment({ id: 'idle', syncGroupId: 'i1' }),
        makeAssessment({ id: 'archived', syncGroupId: 'x1', status: 'closed' }),
      ],
      aggregates: [
        makeAggregate({ assessmentId: 'scored-old', ranAt: 100 }),
        makeAggregate({ assessmentId: 'scored-new', ranAt: 200 }),
        makeAggregate({
          assessmentId: 'running',
          ranAt: 50,
          publishedSessionCount: 0,
        }),
        makeAggregate({ assessmentId: 'archived', ranAt: 900 }),
      ],
      libraryEntries: [
        makeEntry({ id: 'l1', syncGroupId: 'lib-a', sharedAt: 10 }),
        makeEntry({ id: 'l2', syncGroupId: 'lib-b', sharedAt: 20 }),
      ],
      memberCount: 3,
    });
    expect(rows.map((r) => r.id)).toEqual([
      'running',
      'scored-new',
      'scored-old',
      'idle',
      'library:lib-b',
      'library:lib-a',
      'archived',
    ]);
  });
});

describe('filterAssessmentRows', () => {
  const rows = buildAssessmentRows({
    assessments: [
      makeAssessment({ id: 'a', title: 'Fractions CFA', syncGroupId: 'g-a' }),
      makeAssessment({ id: 'b', title: 'Decimals quiz', syncGroupId: 'g-b' }),
    ],
    aggregates: [
      makeAggregate({ assessmentId: 'a' }),
      makeAggregate({ assessmentId: 'b', publishedSessionCount: 1 }),
    ],
    libraryEntries: [makeEntry({ title: 'Ratios warm-up' })],
    memberCount: 2,
  });

  it('filters by status chip', () => {
    expect(filterAssessmentRows(rows, 'scored', '').map((r) => r.id)).toEqual([
      'a',
    ]);
    expect(
      filterAssessmentRows(rows, 'inProgress', '').map((r) => r.id)
    ).toEqual(['b']);
    expect(
      filterAssessmentRows(rows, 'libraryOnly', '').map((r) => r.id)
    ).toEqual(['library:g-lib']);
    expect(filterAssessmentRows(rows, 'all', '')).toHaveLength(3);
  });

  it('searches titles case-insensitively and combines with the chip', () => {
    expect(
      filterAssessmentRows(rows, 'all', '  RATIO').map((r) => r.id)
    ).toEqual(['library:g-lib']);
    expect(filterAssessmentRows(rows, 'scored', 'decimals')).toHaveLength(0);
  });
});

describe('folder inheritance', () => {
  it('assessment without a folderId inherits its library entry folder via syncGroupId', () => {
    const rows = buildAssessmentRows({
      assessments: [makeAssessment()],
      aggregates: [],
      libraryEntries: [
        makeEntry({ syncGroupId: 'g1', folderId: 'lib-folder' }),
      ],
      memberCount: 1,
    });
    expect(rows[0].folderId).toBe('lib-folder');
    expect(rows[0].plcQuizId).toBe('e1');
  });

  it('the assessment’s own folderId wins over the library entry’s', () => {
    const rows = buildAssessmentRows({
      assessments: [makeAssessment({ folderId: 'own-folder' })],
      aggregates: [],
      libraryEntries: [
        makeEntry({ syncGroupId: 'g1', folderId: 'lib-folder' }),
      ],
      memberCount: 1,
    });
    expect(rows[0].folderId).toBe('own-folder');
  });

  it('library-only rows carry their own folderId', () => {
    const rows = buildAssessmentRows({
      assessments: [],
      aggregates: [],
      libraryEntries: [makeEntry({ folderId: 'lib-folder' })],
      memberCount: 1,
    });
    expect(rows[0].folderId).toBe('lib-folder');
  });

  it('filterRowsByFolder keeps only matching rows; null keeps all', () => {
    const rows = buildAssessmentRows({
      assessments: [
        makeAssessment({ id: 'a', folderId: 'f1', syncGroupId: 'g-a' }),
      ],
      aggregates: [],
      libraryEntries: [makeEntry({ syncGroupId: 'g-lib', folderId: null })],
      memberCount: 1,
    });
    expect(filterRowsByFolder(rows, 'f1').map((r) => r.id)).toEqual(['a']);
    expect(filterRowsByFolder(rows, null)).toHaveLength(2);
  });

  it('countRowsByFolder buckets by folderId with root for unfoldered rows', () => {
    const rows = buildAssessmentRows({
      assessments: [
        makeAssessment({ id: 'a', folderId: 'f1', syncGroupId: 'g-a' }),
      ],
      aggregates: [],
      libraryEntries: [makeEntry({ syncGroupId: 'g-lib' })],
      memberCount: 1,
    });
    expect(countRowsByFolder(rows)).toEqual({ f1: 1, root: 1 });
  });
});

describe('suggestedFolderNames', () => {
  it('dedupes, trims and sorts unitLabel values from non-deleted quiz assessments', () => {
    const names = suggestedFolderNames([
      makeAssessment({ id: 'a', unitLabel: '  Unit 4  ' }),
      makeAssessment({ id: 'b', unitLabel: 'Unit 2' }),
      makeAssessment({ id: 'c', unitLabel: 'Unit 4' }),
      makeAssessment({ id: 'd', unitLabel: '   ' }),
      makeAssessment({ id: 'e', unitLabel: undefined }),
      makeAssessment({ id: 'f', unitLabel: 'Unit 9', deletedAt: 5 }),
      makeAssessment({
        id: 'g',
        unitLabel: 'Unit 1',
        kind: 'video-activity',
      }),
    ]);
    expect(names).toEqual(['Unit 2', 'Unit 4']);
  });
});

describe('sortWorstFirst', () => {
  it('orders by incorrectPercent desc with unscored questions last', () => {
    const sorted = sortWorstFirst([
      {
        questionId: 'q1',
        text: '',
        correctPercent: 0,
        points: 1,
        incorrectPercent: null,
      },
      {
        questionId: 'q2',
        text: '',
        correctPercent: 40,
        points: 1,
        incorrectPercent: 60,
      },
      {
        questionId: 'q3',
        text: '',
        correctPercent: 90,
        points: 1,
        incorrectPercent: 10,
      },
      {
        questionId: 'q4',
        text: '',
        correctPercent: 40,
        points: 1,
        incorrectPercent: 60,
      },
    ]);
    expect(sorted.map((q) => q.questionId)).toEqual(['q2', 'q4', 'q3', 'q1']);
  });
});
