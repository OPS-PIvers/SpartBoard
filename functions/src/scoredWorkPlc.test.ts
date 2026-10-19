// Unit tests for scored paper work PLC sharing: pooling stays anonymous and per-teacher figures never surface.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => '__delete__' },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(true)),
}));

import {
  buildSource,
  canContribute,
  normalizeSeriesLabel,
  poolSources,
  seriesKeyOf,
  type ScoreDoc,
  type WorkDoc,
} from './scoredWorkPlc';

const level = (label: string, points: number) => ({ label, points });
const work: WorkDoc = {
  title: 'Essay',
  rubric: {
    criteria: [
      {
        id: 'a',
        name: 'Thesis',
        levels: [level('Beginning', 0), level('Meets', 2), level('Exceeds', 4)],
      },
      {
        id: 'b',
        name: 'Evidence',
        levels: [level('Low', 1), level('High', 3)],
      },
    ],
  },
};
const score = (a: number, b: number, points: number, max = 7): ScoreDoc => ({
  levels: { a, b },
  points,
  max,
});
const ids = (teacherUid: string, workId: string) => ({
  teacherUid,
  workId,
  seriesLabel: 'Unit 1 essay',
});

describe('scored work PLC sharing', () => {
  it('matches series typed with different case and spacing', () => {
    expect(seriesKeyOf(normalizeSeriesLabel('  Unit 1   Essay '))).toBe(
      seriesKeyOf(normalizeSeriesLabel('unit 1 essay'))
    );
  });

  it('reduces scores to counts with no seat or student field', () => {
    const src = buildSource(
      work,
      [score(2, 1, 5), score(0, 0, 1)],
      ids('t1', 'w1'),
      9
    );
    expect(src.studentCount).toBe(2);
    expect(src.criteria[0]).toMatchObject({
      name: 'Thesis',
      levelCounts: [1, 0, 1],
      averagePercent: 50,
    });
    expect(JSON.stringify(src)).not.toMatch(/seat|student(Id|Name)/);
  });

  it('pools two teachers into one aggregate without per-teacher rows', () => {
    const one = buildSource(
      work,
      [score(2, 1, 5), score(2, 1, 5)],
      ids('t1', 'w1'),
      10
    );
    const two = buildSource(work, [score(0, 0, 1)], ids('t2', 'w2'), 20);
    const pooled = poolSources([one, two], 30);
    expect(pooled).toMatchObject({
      teacherCount: 2,
      studentCount: 3,
      firstPublishedAt: 10,
      lastPublishedAt: 20,
      ranAt: 30,
    });
    expect(pooled?.criteria[0].levelCounts).toEqual([1, 0, 2]);
    expect(JSON.stringify(pooled)).not.toMatch(/t1|t2|w1|w2/);
  });

  it('drops the level split when rubrics disagree', () => {
    const other: WorkDoc = {
      title: 'x',
      rubric: {
        criteria: [
          {
            id: 'a',
            name: 'thesis',
            levels: [level('No', 0), level('Yes', 1)],
          },
        ],
      },
    };
    const a = buildSource(work, [score(1, 1, 5)], ids('t1', 'w1'), 1);
    const b = buildSource(
      other,
      [{ levels: { a: 1 }, points: 1, max: 1 }],
      ids('t2', 'w2'),
      2
    );
    const row = poolSources([a, b], 3)?.criteria.find(
      (c) => c.name === 'Thesis'
    );
    expect(row?.studentCount).toBe(2);
    expect(row?.levelLabels).toBeUndefined();
  });

  it('returns nothing to pool once every source is withdrawn', () => {
    expect(poolSources([], 1)).toBeNull();
  });

  it('lets members contribute but not viewers or strangers', () => {
    const plc = {
      memberUids: ['m', 'v'],
      members: { v: { role: 'viewer' } },
    };
    expect(canContribute(plc, 'm')).toBe(true);
    expect(canContribute(plc, 'v')).toBe(false);
    expect(canContribute(plc, 'x')).toBe(false);
    expect(canContribute(undefined, 'm')).toBe(false);
  });
});
