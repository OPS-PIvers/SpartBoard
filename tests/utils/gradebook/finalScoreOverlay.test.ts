import { describe, expect, it } from 'vitest';
import {
  applyFinalScoresToEntries,
  finalScoreFor,
  finalScoreLabel,
  overlayHasEdits,
  type FinalScoreOverlay,
  type LiveRawScore,
} from '@/utils/gradebook/finalScoreOverlay';
import {
  DEFAULT_GRADEBOOK_FLAGS,
  type GradebookColumnConfig,
  type GradebookMark,
} from '@/utils/gradebook/gradebookCore';

const NOW = 1_000_000;

const mark = (
  studentUid: string,
  patch: Partial<GradebookMark> = {}
): GradebookMark => ({
  kind: 'quiz',
  sessionId: 's1',
  studentUid,
  ownerUid: 't1',
  editorUids: [],
  rosterIds: ['r1'],
  override: null,
  comment: null,
  flags: [],
  suppressedAuto: [],
  publishOverride: null,
  updatedAt: 1,
  ...patch,
});

const overlay = (
  marks: GradebookMark[],
  column: GradebookColumnConfig | null = null
): FinalScoreOverlay => ({
  kind: 'quiz',
  sessionId: 's1',
  ownerUid: 't1',
  marks: new Map(marks.map((m) => [m.studentUid, m])),
  column,
  flagDefs: DEFAULT_GRADEBOOK_FLAGS,
  autoFlags: true,
  dueAt: null,
  closeAt: null,
});

const scored = (points: number, max: number): LiveRawScore => ({
  points,
  max,
  state: 'scored',
  submittedAt: 500,
});

const entries = [
  { pseudonymUid: 'a', pointsEarned: 8 },
  { pseudonymUid: 'b', pointsEarned: 5 },
];
const raws: Record<string, LiveRawScore> = {
  a: scored(8, 10),
  b: scored(5, 10),
};
const rawFor = (uid: string) => raws[uid] ?? null;

describe('applyFinalScoresToEntries', () => {
  it('returns the same array when the flag is off', () => {
    expect(applyFinalScoresToEntries(entries, 10, null, rawFor, NOW)).toBe(
      entries
    );
  });

  it('returns the same array when no student has an edit', () => {
    const o = overlay([
      mark('a', { comment: { text: 'hi', shared: false, at: 1 } }),
    ]);
    expect(overlayHasEdits(o)).toBe(false);
    expect(applyFinalScoresToEntries(entries, 10, o, rawFor, NOW)).toBe(
      entries
    );
  });

  it('pushes an override scaled onto the LMS denominator', () => {
    const o = overlay([mark('a', { override: { points: 9, at: 1 } })]);
    expect(applyFinalScoresToEntries(entries, 20, o, rawFor, NOW)).toEqual([
      { pseudonymUid: 'a', pointsEarned: 18 },
      { pseudonymUid: 'b', pointsEarned: 5 },
    ]);
  });

  it('drops an Excused student instead of pushing a 0', () => {
    const o = overlay([mark('b', { flags: ['excused'] })]);
    expect(applyFinalScoresToEntries(entries, 10, o, rawFor, NOW)).toEqual([
      { pseudonymUid: 'a', pointsEarned: 8 },
    ]);
  });

  it('keeps a raw score untouched when a flag has no score value', () => {
    const o = overlay([mark('a', { flags: ['late'] })]);
    const out = applyFinalScoresToEntries(entries, 10, o, rawFor, NOW);
    expect(out).toBe(entries);
  });

  it('never adds a student the legacy payload left out', () => {
    const o = overlay([mark('c', { flags: ['missing'] })]);
    expect(applyFinalScoresToEntries(entries, 10, o, rawFor, NOW)).toBe(
      entries
    );
  });
});

describe('finalScoreFor', () => {
  it('shows a Missing value only on unscored work', () => {
    const o = overlay([mark('a', { flags: ['missing'] })]);
    const none: LiveRawScore = {
      points: null,
      max: 10,
      state: 'not-attempted',
      submittedAt: null,
    };
    const f = finalScoreFor(o, 'a', none, NOW);
    expect(f.status).toBe('scored');
    expect(f.source).toBe('flag');
    expect(f.pct).toBe(0);
    expect(finalScoreFor(o, 'a', scored(7, 10), NOW).source).toBe('raw');
  });

  it('keeps the calculated score beside an override', () => {
    const o = overlay([mark('a', { override: { points: 9, at: 1 } })]);
    const f = finalScoreFor(o, 'a', scored(6, 10), NOW);
    expect(f.pct).toBe(90);
    expect(f.rawPoints).toBe(6);
  });

  it('flags late work from the session due date', () => {
    const o = { ...overlay([]), dueAt: -100_000 };
    const f = finalScoreFor(o, 'a', scored(6, 10), NOW);
    expect(f.flags).toEqual([{ id: 'late', auto: true }]);
    expect(f.source).toBe('raw');
  });
});

describe('finalScoreLabel', () => {
  const name = (id: string) => id.toUpperCase();
  it('labels each status for export', () => {
    const o = overlay([
      mark('x', { flags: ['excused'] }),
      mark('m', { flags: ['missing'] }),
    ]);
    const empty: LiveRawScore = {
      points: null,
      max: 10,
      state: 'not-attempted',
      submittedAt: null,
    };
    expect(
      finalScoreLabel(finalScoreFor(o, 'a', scored(7, 10), NOW), name)
    ).toBe('70%');
    expect(
      finalScoreLabel(finalScoreFor(o, 'x', scored(7, 10), NOW), name)
    ).toBe('Excused');
    expect(finalScoreLabel(finalScoreFor(o, 'm', empty, NOW), name)).toBe(
      '0% (MISSING)'
    );
    expect(
      finalScoreLabel(
        finalScoreFor(
          o,
          'a',
          { points: null, max: 10, state: 'awaiting-grade', submittedAt: 1 },
          NOW
        ),
        name
      )
    ).toBe('Awaiting grade');
  });
});
