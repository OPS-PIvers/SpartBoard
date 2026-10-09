import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {} }));

const { getDocsMock, getDocMock } = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
  getDocMock: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: getDocsMock,
  getDoc: getDocMock,
}));

import {
  buildToolColumnGrades,
  formatToolColumnPushToast,
  withMissingEntries,
  type ToolColumnPushData,
} from '@/utils/schoologyToolColumns';

const marks = (rows: { studentUid: string; flags: string[] }[]) => ({
  docs: rows.map((r) => ({ data: () => r })),
});

beforeEach(() => {
  getDocsMock.mockReset().mockResolvedValue(marks([]));
  getDocMock.mockReset().mockResolvedValue({ data: () => ({}) });
});

describe('withMissingEntries', () => {
  it('marks targeted students with no score Missing, once each', () => {
    expect(
      withMissingEntries(
        [{ pseudonymUid: 'a', pointsEarned: 5 }],
        ['a', 'b', 'c', 'pin-P1-1', 'b', 'd', 'e'],
        new Set(['c']),
        new Set(['d'])
      )
    ).toEqual([
      { pseudonymUid: 'a', pointsEarned: 5 },
      { pseudonymUid: 'b', missing: true },
      { pseudonymUid: 'e', missing: true },
    ]);
  });
});

describe('buildToolColumnGrades', () => {
  const base = {
    kind: 'quiz' as const,
    ownerUid: 't1',
    sessionId: 's1',
    assignmentId: 's1',
    scored: [{ pseudonymUid: 'a', pointsEarned: 5 }],
    rosterUids: ['a', 'b', 'c'],
    refKeyByUid: new Map([
      ['b', 'classlink:sid-b'],
      ['c', 'classlink:sid-c'],
    ]),
    submittedUids: new Set<string>(),
  };

  it('skips students excused in the Gradebook', async () => {
    getDocsMock.mockResolvedValue(
      marks([{ studentUid: 'b', flags: ['excused'] }])
    );
    expect(await buildToolColumnGrades(base)).toEqual([
      { pseudonymUid: 'a', pointsEarned: 5 },
      { pseudonymUid: 'c', missing: true },
    ]);
  });

  it('only marks targeted students on a per-student assignment', async () => {
    getDocMock.mockResolvedValue({
      data: () => ({
        targetMode: 'students',
        targetStudents: [{ kind: 'classlink', sourcedId: 'sid-c' }],
      }),
    });
    expect(await buildToolColumnGrades(base)).toEqual([
      { pseudonymUid: 'a', pointsEarned: 5 },
      { pseudonymUid: 'c', missing: true },
    ]);
  });

  it('sends scores alone when a lookup fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    expect(await buildToolColumnGrades(base)).toEqual(base.scored);
  });
});

describe('formatToolColumnPushToast', () => {
  const data = (
    results: ToolColumnPushData['results'],
    sections: Partial<ToolColumnPushData['sections'][number]>[] = [{}]
  ): ToolColumnPushData => ({
    results,
    pushed: results.filter((r) => r.ok).length,
    total: results.length,
    sections: sections.map((s) => ({
      contextId: '1',
      title: null,
      status: 'pushed',
      columnCreated: false,
      needsCategory: false,
      ...s,
    })),
  });

  it('counts grades, Missing, unchanged and outsiders', () => {
    const { message, failed } = formatToolColumnPushToast(
      data([
        { pseudonymUid: 'a', ok: true },
        { pseudonymUid: 'b', ok: true },
        { pseudonymUid: 'c', ok: true },
        { pseudonymUid: 'd', ok: true, missing: true },
        { pseudonymUid: 'e', ok: true, missing: true },
        { pseudonymUid: 'f', ok: false, reason: 'unchanged' },
        { pseudonymUid: 'g', ok: false, reason: 'not in Schoology section' },
      ])
    );
    expect(message).toBe(
      "Pushed 3 grades to Schoology (2 marked Missing). 1 unchanged. 1 student isn't in the Schoology section."
    );
    expect(failed).toBe(0);
  });

  it('reports failures, kept flags, comment fallbacks and blocked courses', () => {
    const { message, failed } = formatToolColumnPushToast(
      data(
        [
          { pseudonymUid: 'a', ok: false, status: 503 },
          { pseudonymUid: 'b', ok: false, reason: 'flagged in Schoology' },
          { pseudonymUid: 'c', ok: true, missing: true, missingComment: true },
        ],
        [{ status: 'needs-category' }]
      )
    );
    expect(message).toBe(
      'Pushed 0 grades to Schoology (1 marked Missing). 1 cell kept as set in Schoology. Add a grading category to the Schoology course, then push again. Some Missing marks were added as comments. 1 failed to push. Try again.'
    );
    expect(failed).toBe(1);
  });
});
