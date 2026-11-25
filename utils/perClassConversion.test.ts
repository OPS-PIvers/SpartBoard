import { describe, expect, it } from 'vitest';
import {
  backfillClassId,
  canConvertToPerClass,
  perClassConversion,
  studentCanEnterAnyGate,
  type WholeQuizSession,
} from './perClassConversion';

const base: WholeQuizSession = {
  status: 'active',
  sessionMode: 'student',
  classIds: ['cl-1', 'cl-2'],
  classPeriodByClassId: { 'cl-1': 'Period 1', 'cl-2': 'Period 2' },
};
const rosters = [
  {
    id: 'r1',
    name: 'P1 Bio',
    classlinkClassId: 'cl-1',
    bellPeriod: { buildingId: 'b', periodId: 'p1' },
  },
];

describe('canConvertToPerClass', () => {
  it('needs a running or paused student-paced quiz with classes and no rows', () => {
    expect(canConvertToPerClass(base)).toBe(true);
    expect(canConvertToPerClass({ ...base, status: 'paused' })).toBe(true);
    expect(canConvertToPerClass({ ...base, status: 'ended' })).toBe(false);
    expect(canConvertToPerClass({ ...base, sessionMode: 'teacher' })).toBe(
      false
    );
    expect(canConvertToPerClass({ ...base, classIds: [] })).toBe(false);
    expect(
      canConvertToPerClass({ ...base, classIds: [], rosterIds: ['r5'] })
    ).toBe(true);
    expect(canConvertToPerClass({ ...base, periodAccess: {} })).toBe(false);
  });
});

describe('perClassConversion', () => {
  it('opens every class on the whole-quiz window while it runs', () => {
    const out = perClassConversion(
      { ...base, openAt: 5, closeAt: 9 },
      rosters,
      100
    );
    expect(out?.accessMode).toBe('assignment');
    expect(out?.resume).toBeNull();
    expect(out?.periodAccess['cl-1']).toEqual({
      state: 'open',
      openAt: 5,
      closeAt: 9,
      bellPeriodId: 'p1',
      verified: true,
      label: 'P1 Bio',
      rosterId: 'r1',
    });
    expect(out?.periodAccess['cl-2']).toMatchObject({
      state: 'open',
      label: 'Period 2',
      bellPeriodId: null,
    });
    expect(out?.periodAccess['cl-2'].rosterId).toBeUndefined();
  });

  it('moves a whole-quiz pause onto every class and resumes the run', () => {
    const out = perClassConversion(
      { ...base, status: 'paused', pausedAt: 50, openAt: 5 },
      [],
      100
    );
    expect(out?.periodAccess['cl-1']).toMatchObject({
      state: 'paused',
      pausedAt: 50,
    });
    expect(out?.resume).toEqual({ pauseSpans: [{ from: 50, to: 100 }] });
    expect(out?.accessMode).toBe('assignment');
  });

  it('keeps a never-started quiz closed until Start', () => {
    const out = perClassConversion({ ...base, status: 'paused' }, [], 100);
    expect(out?.periodAccess['cl-1'].state).toBe('closed');
    expect(out?.accessMode).toBe('assignment');
    expect(out?.resume).toEqual({ pauseSpans: null });
  });
});

describe('local rosters', () => {
  it('key a roster without ClassLink by the roster, unverified', () => {
    const out = perClassConversion(
      { ...base, classIds: ['cl-1'], rosterIds: ['r1', 'r5'] },
      [...rosters, { id: 'r5', name: 'P5 Local' }],
      0
    );
    expect(Object.keys(out?.periodAccess ?? {})).toEqual(['cl-1', 'roster:r5']);
    expect(out?.periodAccess['roster:r5']).toMatchObject({
      verified: false,
      label: 'P5 Local',
      rosterId: 'r5',
    });
  });
  it('cannot move without rosters to key local classes', () => {
    expect(
      perClassConversion({ ...base, classIds: [], rosterIds: ['r5'] }, [], 0)
    ).toBeNull();
  });
});

describe('backfillClassId', () => {
  const rows = perClassConversion(base, rosters, 0)?.periodAccess ?? {};
  it('leaves a response that already names a class', () => {
    expect(backfillClassId(rows, { classId: 'cl-2' })).toBeNull();
  });
  it('matches the period name, else a signed-in student gets the first class', () => {
    expect(backfillClassId(rows, { classPeriod: 'Period 2' })).toBe('cl-2');
    expect(backfillClassId(rows, {})).toBe('cl-1');
    expect(backfillClassId(rows, { classId: '' })).toBe('cl-1');
    expect(backfillClassId(rows, { pin: '1234' })).toBeNull();
    expect(backfillClassId({}, {})).toBeNull();
  });
  it('never moves a class already set', () => {
    expect(backfillClassId(rows, { classId: 'other' })).toBeNull();
  });
});

describe('studentCanEnterAnyGate', () => {
  it('reads a whole-quiz pause and window as the class rows would', () => {
    expect(studentCanEnterAnyGate(base, ['cl-1'], 'u', 100)).toBe(true);
    expect(
      studentCanEnterAnyGate({ ...base, status: 'paused' }, ['cl-1'], 'u', 100)
    ).toBe(false);
    expect(
      studentCanEnterAnyGate({ ...base, openAt: 200 }, ['cl-1'], 'u', 100)
    ).toBe(false);
    expect(studentCanEnterAnyGate({ ...base, closeAt: 50 }, [], 'u', 100)).toBe(
      false
    );
  });
  it('lets a running pass in on per-class rows', () => {
    const rows =
      perClassConversion({ ...base, status: 'paused' }, [], 0)?.periodAccess ??
      {};
    expect(
      studentCanEnterAnyGate(
        { ...base, periodAccess: rows, studentAccess: { u: 500 } },
        ['cl-1'],
        'u',
        100
      )
    ).toBe(true);
  });
});
