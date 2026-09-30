import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  autoFlagsFor,
  pickAttemptPct,
  resolveFinalScore,
  type RawForResolve,
} from './resolveFinalScore';
import type { GradebookMarkMirror } from './types';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const raw = (over: Partial<RawForResolve> = {}): RawForResolve => ({
  rawPct: 80,
  points: 8,
  max: 10,
  state: 'scored',
  submittedAt: NOW - DAY,
  dueAt: NOW,
  closeAt: null,
  late: false,
  attempts: [{ n: 1, pct: 80, points: 8, max: 10, submittedAt: NOW - DAY }],
  assigned: true,
  completionOnly: false,
  ...over,
});

const mark = (
  over: Partial<GradebookMarkMirror> = {}
): GradebookMarkMirror => ({
  override: null,
  comment: null,
  flags: [],
  suppressedAuto: [],
  publishOverride: null,
  ...over,
});

describe('resolveFinalScore', () => {
  it('returns the raw score when nothing overlays it', () => {
    expect(
      resolveFinalScore(raw(), null, null, DEFAULT_CONFIG, NOW)
    ).toMatchObject({
      status: 'scored',
      pct: 80,
      points: 8,
      max: 10,
      source: 'raw',
    });
  });

  it('prefers an override and rescales against a column max override', () => {
    const r = resolveFinalScore(
      raw(),
      mark({ override: { points: 18 } }),
      {
        maxPointsOverride: 20,
        attemptPolicy: 'latest',
        countsTowardOverall: true,
      },
      DEFAULT_CONFIG,
      NOW
    );
    expect(r).toMatchObject({
      status: 'scored',
      pct: 90,
      points: 18,
      max: 20,
      source: 'override',
    });
  });

  it('never turns awaiting-grade into a zero', () => {
    const r = resolveFinalScore(
      raw({ state: 'awaiting-grade', rawPct: null }),
      null,
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(r.status).toBe('awaiting-grade');
    expect(r.pct).toBeNull();
  });

  it('gives an unsubmitted, overdue cell Missing at 0%', () => {
    const r = resolveFinalScore(
      raw({
        state: 'not-attempted',
        rawPct: null,
        points: null,
        submittedAt: null,
        dueAt: NOW - DAY,
        attempts: [],
      }),
      null,
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(r).toMatchObject({
      status: 'scored',
      pct: 0,
      source: 'flag',
      flags: ['missing'],
      autoFlags: ['missing'],
    });
  });

  it('keeps a cleared auto flag cleared', () => {
    const r = resolveFinalScore(
      raw({
        state: 'not-attempted',
        rawPct: null,
        submittedAt: null,
        dueAt: NOW - DAY,
        attempts: [],
      }),
      mark({ suppressedAuto: ['missing'] }),
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(r.status).toBe('empty');
    expect(r.flags).toEqual([]);
  });

  it('never fires auto flags on a not-assigned cell', () => {
    expect(autoFlagsFor(raw({ assigned: false, late: true }), NOW)).toEqual([]);
  });

  it('lets Excused beat every value and a real score', () => {
    const r = resolveFinalScore(
      raw(),
      mark({ flags: ['excused', 'missing'] }),
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(r.status).toBe('excluded');
    expect(r.pct).toBeNull();
  });

  it('keeps a real score over a valued flag', () => {
    const r = resolveFinalScore(
      raw(),
      mark({ flags: ['missing'] }),
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(r).toMatchObject({ pct: 80, source: 'raw' });
  });

  it('ignores a flag switched off', () => {
    const config = {
      ...DEFAULT_CONFIG,
      flags: DEFAULT_CONFIG.flags.map((f) =>
        f.id === 'excused' ? { ...f, visibility: 'off' as const } : f
      ),
    };
    const r = resolveFinalScore(
      raw(),
      mark({ flags: ['excused'] }),
      null,
      config,
      NOW
    );
    expect(r.status).toBe('scored');
    expect(r.flags).toEqual([]);
  });

  it('uses the lowest value when several valued flags apply', () => {
    const config = {
      ...DEFAULT_CONFIG,
      flags: [
        ...DEFAULT_CONFIG.flags,
        {
          id: 'half',
          key: 'H',
          name: 'Half',
          color: 'sky',
          value: 50,
          excludes: false,
          visibility: 'teacher' as const,
        },
      ],
    };
    const r = resolveFinalScore(
      raw({
        state: 'not-attempted',
        rawPct: null,
        submittedAt: null,
        dueAt: null,
        attempts: [],
      }),
      mark({ flags: ['half', 'missing'] }),
      null,
      config,
      NOW
    );
    expect(r.pct).toBe(0);
  });

  it('applies the retake policy, and shows earlier attempts during a retake', () => {
    const attempts = [
      { n: 1, pct: 90, points: 9, max: 10, submittedAt: 1 },
      { n: 2, pct: 60, points: 6, max: 10, submittedAt: 2 },
    ];
    const col = (attemptPolicy: 'latest' | 'highest' | 'average') => ({
      maxPointsOverride: null,
      attemptPolicy,
      countsTowardOverall: true,
    });
    expect(
      resolveFinalScore(
        raw({ attempts, rawPct: 60 }),
        null,
        col('latest'),
        DEFAULT_CONFIG,
        NOW
      ).pct
    ).toBe(60);
    expect(
      resolveFinalScore(
        raw({ attempts, rawPct: 60 }),
        null,
        col('highest'),
        DEFAULT_CONFIG,
        NOW
      ).pct
    ).toBe(90);
    expect(
      resolveFinalScore(
        raw({ attempts, rawPct: 60 }),
        null,
        col('average'),
        DEFAULT_CONFIG,
        NOW
      ).pct
    ).toBe(75);
    expect(
      resolveFinalScore(
        raw({ attempts, rawPct: null, state: 'in-progress' }),
        null,
        col('latest'),
        DEFAULT_CONFIG,
        NOW
      ).pct
    ).toBe(60);
  });

  it('pickAttemptPct skips attempts still awaiting a grade', () => {
    expect(
      pickAttemptPct(
        [
          { n: 1, pct: 70, points: 7, max: 10, submittedAt: 1 },
          { n: 2, pct: null, points: null, max: 10, submittedAt: 2 },
        ],
        'latest'
      )
    ).toBe(70);
  });

  it('shows no score for a completion-only column', () => {
    const r = resolveFinalScore(
      raw({ completionOnly: true, rawPct: null, max: null }),
      null,
      null,
      DEFAULT_CONFIG,
      NOW
    );
    expect(r.status).toBe('empty');
  });
});
