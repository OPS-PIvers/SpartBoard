import { describe, expect, it } from 'vitest';
import {
  buildPeriodAccess,
  periodKeyForRoster,
  resolveRowWindow,
  type PeriodRoster,
} from './periodPlan';

const sso: PeriodRoster = {
  id: 'r1',
  name: 'P1 Algebra',
  classlinkClassId: 'cl-1',
  bellPeriod: { buildingId: 'high', periodId: 'P1' },
};
const test: PeriodRoster = { id: 'r2', name: 'P3 Test', testClassId: 't-3' };
const local: PeriodRoster = { id: 'r3', name: 'P5 Local' };

const bell = { openAt: 1_000, closeAt: 2_000 };

describe('periodKeyForRoster', () => {
  it('keys by the class claim, else the roster', () => {
    expect(periodKeyForRoster(sso)).toBe('cl-1');
    expect(periodKeyForRoster(test)).toBe('t-3');
    expect(periodKeyForRoster(local)).toBe('roster:r3');
  });
});

describe('buildPeriodAccess', () => {
  it('closes every period in assessment mode', () => {
    const pa = buildPeriodAccess({
      plan: { mode: 'assessment' },
      rosters: [sso, test, local],
      sharedWindow: { openAt: 5, closeAt: 9 },
      bellWindow: () => bell,
    });
    expect(pa).toEqual({
      'cl-1': {
        state: 'closed',
        openAt: null,
        closeAt: null,
        bellPeriodId: 'P1',
        verified: true,
        label: 'P1 Algebra',
        rosterId: 'r1',
      },
      't-3': {
        state: 'closed',
        openAt: null,
        closeAt: null,
        bellPeriodId: null,
        verified: true,
        label: 'P3 Test',
        rosterId: 'r2',
      },
      'roster:r3': {
        state: 'closed',
        openAt: null,
        closeAt: null,
        bellPeriodId: null,
        verified: false,
        label: 'P5 Local',
        rosterId: 'r3',
      },
    });
  });

  it('opens each period on its own window in assignment mode', () => {
    const pa = buildPeriodAccess({
      plan: {
        mode: 'assignment',
        rows: {
          r1: { source: 'bell' },
          r2: { source: 'custom', openAt: 7, closeAt: 8 },
        },
      },
      rosters: [sso, test, local],
      sharedWindow: { openAt: 5 },
      bellWindow: (r) => (r.id === 'r1' ? bell : null),
    });
    expect(pa['cl-1']).toMatchObject({ state: 'open', ...bell });
    expect(pa['t-3']).toMatchObject({ state: 'open', openAt: 7, closeAt: 8 });
    expect(pa['roster:r3']).toMatchObject({
      state: 'open',
      openAt: 5,
      closeAt: null,
    });
  });

  it('lets the first roster win a shared class id', () => {
    const pa = buildPeriodAccess({
      plan: { mode: 'assessment' },
      rosters: [sso, { ...sso, id: 'r9', name: 'Copy' }],
      sharedWindow: {},
      bellWindow: () => null,
    });
    expect(Object.keys(pa)).toEqual(['cl-1']);
    expect(pa['cl-1'].label).toBe('P1 Algebra');
  });
});

describe('resolveRowWindow', () => {
  it('falls back to the shared window when the bell has no period that day', () => {
    expect(
      resolveRowWindow(
        { source: 'bell' },
        { openAt: 5, closeAt: 9 },
        () => null
      )
    ).toEqual({ openAt: 5, closeAt: 9 });
  });
});
