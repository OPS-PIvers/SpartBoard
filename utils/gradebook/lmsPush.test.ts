import { describe, expect, it } from 'vitest';
import type { FinalScore } from '@/utils/gradebook/gradebookCore';
import {
  buildGradebookPushPlan,
  readLmsLink,
  schoologyLinkedTargets,
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

  it('lists Missing cells with no score for tool columns', () => {
    const missing = [{ id: 'missing', auto: true }];
    const plan = buildGradebookPushPlan(
      [
        cell('a', {
          pct: 0,
          source: 'flag',
          flagId: 'missing',
          flags: missing,
        }),
        cell('b', { status: 'empty', source: null, flags: missing }),
        cell('c', { status: 'excluded', flags: missing }),
        cell('d', { status: 'not-assigned', source: null, flags: missing }),
        cell('e', { pct: 60, source: 'override', flags: missing }),
      ],
      10
    );
    expect(plan.missing).toEqual(['a', 'b']);
    expect(plan.entries).toEqual([{ pseudonymUid: 'e', pointsEarned: 6 }]);
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
      mode: 'launch',
    });
    expect(readLmsLink({})).toBeNull();
    expect(readLmsLink(null)).toBeNull();
  });

  it('uses a tool column for a class linked to Schoology, only with the flag on', () => {
    const targets = schoologyLinkedTargets([
      { id: 'r1', ltiContextId: '123', classlinkClassId: 'cl-1' },
      { id: 'r2', classlinkClassId: 'cl-2' },
    ]);
    expect(readLmsLink({ rosterIds: ['r1'] }, targets)).toEqual({
      lms: 'schoology',
      mode: 'tool-column',
      columnExists: false,
    });
    expect(
      readLmsLink({ classIds: ['cl-1'], ltiToolColumn: true }, targets)
    ).toEqual({ lms: 'schoology', mode: 'tool-column', columnExists: true });
    expect(readLmsLink({ rosterIds: ['r2'] }, targets)).toBeNull();
    expect(readLmsLink({ rosterIds: ['r1'] }, null)).toBeNull();
    // A Schoology launch and a Classroom attachment both win over a tool column.
    expect(
      readLmsLink({ rosterIds: ['r1'], ltiAttachment: { x: 1 } }, targets)
    ).toEqual({ lms: 'schoology', mode: 'launch' });
    expect(
      readLmsLink({ rosterIds: ['r1'], classroomAttachment: att }, targets)?.lms
    ).toBe('classroom');
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
