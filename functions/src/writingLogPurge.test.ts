import { describe, it, expect, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({ firestore: () => ({}) }));

import { compactPurgedLog, planLogPurge, purgeCutoff } from './writingLogPurge';

const AUG_1 = Date.UTC(2027, 7, 1, 8);
const CUTOFF = purgeCutoff(AUG_1);
const JUNE = Date.UTC(2027, 5, 10);
const JULY = Date.UTC(2027, 6, 20);

describe('purgeCutoff', () => {
  it('is 1 July, midnight Central, of the run year', () => {
    expect(new Date(CUTOFF).toISOString()).toBe('2027-07-01T05:00:00.000Z');
  });
});

describe('compactPurgedLog', () => {
  it('keeps only pastes and untyped additions with their text', () => {
    const log =
      'Tabc;0:H;5:i;P0,2,,pasted%3B text;S9,,,dictated;R0,0,,old;3,1,1,';
    expect(compactPurgedLog(log)).toBe('P0,2,,pasted%3B text;S9,,,dictated');
    expect(compactPurgedLog(compactPurgedLog(log))).toBe(compactPurgedLog(log));
  });

  it('is empty for a log of typing only', () => {
    expect(compactPurgedLog('Tabc;0:H;5:i')).toBe('');
  });
});

describe('planLogPurge', () => {
  const chunks = [
    { id: '0', log: 'Tabc;0:Hi;P0,2,,pasted', updatedAt: JUNE },
    { id: '1', log: '0:more typing', updatedAt: JUNE },
  ];

  it('purges a piece with no writing since 1 July: keeps pastes, deletes typing, stops recording', () => {
    const plan = planLogPurge(
      { summary: { savedAt: JUNE } },
      chunks,
      CUTOFF,
      AUG_1
    );
    expect(plan).toEqual({
      rewrite: [{ id: '0', log: 'P0,2,,pasted' }],
      remove: ['1'],
      patch: { logPurgedAt: AUG_1, 'summary.logStoppedAt': AUG_1 },
    });
  });

  it('keeps an earlier stop time from a full log', () => {
    const plan = planLogPurge(
      { summary: { savedAt: JUNE, logStoppedAt: 5 } },
      chunks,
      CUTOFF,
      AUG_1
    );
    expect(plan?.patch).toEqual({ logPurgedAt: AUG_1 });
  });

  it('leaves a piece written since 1 July until next year', () => {
    expect(
      planLogPurge({ summary: { savedAt: JULY } }, chunks, CUTOFF, AUG_1)
    ).toBeNull();
    expect(
      planLogPurge(
        { summary: { savedAt: JUNE } },
        [{ id: '0', log: '0:x', updatedAt: JULY }],
        CUTOFF,
        AUG_1
      )
    ).toBeNull();
  });

  it('skips a piece already purged or with no log', () => {
    expect(
      planLogPurge(
        { summary: { savedAt: JUNE }, logPurgedAt: 1 },
        chunks,
        CUTOFF,
        AUG_1
      )
    ).toBeNull();
    expect(
      planLogPurge({ summary: { savedAt: JUNE } }, [], CUTOFF, AUG_1)
    ).toBeNull();
  });
});
