import { describe, expect, it } from 'vitest';
import type { FinalScore } from '@/utils/gradebook/gradebookCore';
import {
  buildGradebookPushPlan,
  readLmsLink,
  schoologyMaxPoints,
} from '@/utils/gradebook/lmsPush';

const final = (p: Partial<FinalScore>): FinalScore => ({
  status: 'scored',
  points: null,
  max: 20,
  pct: null,
  source: 'raw',
  flagId: null,
  rawPoints: null,
  flags: [],
  counts: true,
  ...p,
});
const cell = (uid: string, f: Partial<FinalScore>) => ({
  student: { uid },
  final: final(f),
});

describe('buildGradebookPushPlan', () => {
  it('pushes raw and override scores scaled onto the LMS total', () => {
    const plan = buildGradebookPushPlan(
      [
        cell('a', { pct: 85, source: 'raw' }),
        cell('b', { pct: 50, source: 'override' }),
      ],
      10
    );
    expect(plan.entries).toEqual([
      { pseudonymUid: 'a', pointsEarned: 9 },
      { pseudonymUid: 'b', pointsEarned: 5 },
    ]);
  });

  it('skips awaiting grade and never sends excused students', () => {
    const plan = buildGradebookPushPlan(
      [
        cell('a', { status: 'awaiting' }),
        cell('b', { status: 'excluded' }),
        cell('c', { pct: 100 }),
      ],
      10
    );
    expect(plan.entries.map((e) => e.pseudonymUid)).toEqual(['c']);
    expect(plan.awaiting).toBe(1);
    expect(plan.excluded).toBe(1);
  });

  it('never pushes a flag value such as Missing = 0', () => {
    const plan = buildGradebookPushPlan(
      [cell('a', { pct: 0, source: 'flag', flagId: 'missing' })],
      10
    );
    expect(plan.entries).toEqual([]);
  });

  it('leaves empty and not-assigned cells out and clamps overrides above max', () => {
    const plan = buildGradebookPushPlan(
      [
        cell('a', { status: 'empty', source: null }),
        cell('b', { status: 'not-assigned', source: null }),
        cell('c', { pct: 130, source: 'override' }),
      ],
      10
    );
    expect(plan.entries).toEqual([{ pseudonymUid: 'c', pointsEarned: 10 }]);
  });
});

describe('readLmsLink', () => {
  const att = {
    courseId: 'c',
    itemId: 'i',
    attachmentId: 'x',
    maxPoints: 10,
  };
  it('prefers Classroom attachments, then Schoology', () => {
    expect(readLmsLink({ classroomAttachment: att })).toEqual({
      lms: 'classroom',
      attachments: [att],
    });
    expect(readLmsLink({ ltiAttachment: { contextId: 'x' } })).toEqual({
      lms: 'schoology',
    });
    expect(readLmsLink({})).toBeNull();
    expect(readLmsLink(null)).toBeNull();
  });
});

describe('schoologyMaxPoints', () => {
  it('uses the column Out of, else the largest per-student max', () => {
    const cells = [
      { final: final({ max: 18 }) },
      { final: final({ max: 20 }) },
    ];
    expect(schoologyMaxPoints(cells, null)).toBe(20);
    expect(
      schoologyMaxPoints(cells, {
        maxPointsOverride: 15,
      } as Parameters<typeof schoologyMaxPoints>[1])
    ).toBe(15);
    expect(schoologyMaxPoints([], null)).toBeNull();
  });
});
