import { describe, expect, it } from 'vitest';
import type { PeriodAccess, PeriodAccessSessionFields } from '@/types';
import {
  effectivePeriodState,
  nextScheduledOpen,
  pickPeriodKey,
  studentCanEnter,
  studentPeriodKeys,
  summarizePeriods,
} from './periodAccess';

const NOW = 1_000_000;

const period = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

describe('effectivePeriodState', () => {
  it('reports stored paused and closed as they are', () => {
    expect(effectivePeriodState(period({ state: 'paused' }), NOW)).toBe(
      'paused'
    );
    expect(effectivePeriodState(period({ state: 'closed' }), NOW)).toBe(
      'closed'
    );
  });

  it('resolves an open window against the clock', () => {
    expect(effectivePeriodState(period(), NOW)).toBe('open');
    expect(effectivePeriodState(period({ openAt: NOW + 1 }), NOW)).toBe(
      'scheduled'
    );
    expect(effectivePeriodState(period({ openAt: NOW }), NOW)).toBe('open');
    expect(effectivePeriodState(period({ closeAt: NOW }), NOW)).toBe('ended');
    expect(effectivePeriodState(period({ closeAt: NOW + 1 }), NOW)).toBe(
      'open'
    );
  });
});

describe('studentCanEnter', () => {
  const session: PeriodAccessSessionFields = {
    accessMode: 'assessment',
    periodAccess: {
      A: period({ label: 'P1' }),
      B: period({ state: 'closed', label: 'P3' }),
    },
  };

  it('lets every student through a legacy session', () => {
    expect(studentCanEnter({}, [], 'u', NOW)).toBe(true);
    expect(studentCanEnter(null, [], 'u', NOW)).toBe(true);
  });

  it('follows the student period', () => {
    expect(studentCanEnter(session, ['A'], 'u', NOW)).toBe(true);
    expect(studentCanEnter(session, ['B'], 'u', NOW)).toBe(false);
    expect(studentCanEnter(session, [], 'u', NOW)).toBe(false);
  });

  it('lets a student in when any of their periods is open', () => {
    expect(studentCanEnter(session, ['B', 'A'], 'u', NOW)).toBe(true);
  });

  it('honours an unexpired Let in now pass only', () => {
    expect(
      studentCanEnter(
        { ...session, studentAccess: { u: NOW + 1 } },
        ['B'],
        'u',
        NOW
      )
    ).toBe(true);
    expect(
      studentCanEnter(
        { ...session, studentAccess: { u: NOW } },
        ['B'],
        'u',
        NOW
      )
    ).toBe(false);
  });
});

describe('studentPeriodKeys / pickPeriodKey', () => {
  const session: PeriodAccessSessionFields = {
    periodAccess: {
      A: period({ state: 'closed', label: 'P1' }),
      B: period({ label: 'P3' }),
      'roster:r1': period({ label: 'P5', verified: false }),
    },
  };

  it('matches claims first, then the picked period name', () => {
    expect(studentPeriodKeys(session, ['A', 'B', 'X'], 'P5')).toEqual([
      'A',
      'B',
    ]);
    expect(studentPeriodKeys(session, [], 'P5')).toEqual(['roster:r1']);
    expect(studentPeriodKeys(session, [], null)).toEqual([]);
  });

  it('prefers an open period', () => {
    expect(pickPeriodKey(session, ['A', 'B'], NOW)).toBe('B');
    expect(pickPeriodKey(session, ['A'], NOW)).toBe('A');
    expect(pickPeriodKey(session, [], NOW)).toBeNull();
  });
});

describe('nextScheduledOpen / summarizePeriods', () => {
  const session: PeriodAccessSessionFields = {
    periodAccess: {
      A: period({ openAt: NOW + 500 }),
      B: period({ openAt: NOW + 100 }),
      C: period(),
      D: period({ state: 'paused', openAt: NOW + 50 }),
    },
  };

  it('finds the earliest upcoming open among the student periods', () => {
    expect(nextScheduledOpen(session, ['A', 'B', 'C', 'D'], NOW)).toBe(
      NOW + 100
    );
    expect(nextScheduledOpen(session, ['C'], NOW)).toBeNull();
  });

  it('counts live periods', () => {
    expect(summarizePeriods(session, NOW)).toEqual({ live: 1, total: 4 });
    expect(summarizePeriods({}, NOW)).toBeNull();
  });
});
