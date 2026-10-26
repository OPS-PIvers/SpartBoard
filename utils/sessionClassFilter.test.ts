import { describe, expect, it } from 'vitest';
import {
  filterToSessionClasses,
  sessionClassPredicate,
  targetingKey,
  targetsFromKey,
  withLinkedSections,
} from './sessionClassFilter';

const session = {
  classIds: ['cl-A', 'cl-B'],
  classId: 'cl-A',
  periodNames: ['Period 1', 'Period 2', 'Period 4'],
  classPeriodByClassId: { 'cl-A': 'Period 1', 'cl-B': 'Period 2' },
};

describe('sessionClassPredicate', () => {
  const keep = sessionClassPredicate(session);

  it('keeps SSO work from a targeted class and hides a removed one', () => {
    expect(keep({ classId: 'cl-A', classPeriod: 'Period 1' })).toBe(true);
    expect(keep({ classId: 'cl-C', classPeriod: 'Period 3' })).toBe(false);
  });

  it('judges PIN work by its period name', () => {
    expect(keep({ classPeriod: 'Period 4' })).toBe(true);
    expect(keep({ classPeriod: 'Period 3' })).toBe(false);
  });

  it('keeps work with no class, such as a link join', () => {
    expect(keep({})).toBe(true);
    expect(keep({ classId: '', classPeriod: '' })).toBe(true);
  });

  it('keeps everything when the session targets no class', () => {
    const open = sessionClassPredicate({ classIds: [], periodNames: [] });
    expect(open({ classId: 'cl-Z', classPeriod: 'Any' })).toBe(true);
    expect(sessionClassPredicate(null)({ classId: 'cl-Z' })).toBe(true);
  });

  it('counts per-period rows, whose keys can be local rosters', () => {
    const keepRows = sessionClassPredicate({
      classIds: ['cl-A'],
      periodNames: ['Period 1'],
      periodAccess: {
        'cl-A': { label: 'Period 1' },
        'roster:r9': { label: 'Period 9' },
      },
    });
    expect(keepRows({ classId: 'roster:r9', classPeriod: 'Period 9' })).toBe(
      true
    );
    expect(keepRows({ classId: 'roster:r8', classPeriod: 'Period 8' })).toBe(
      false
    );
  });

  it('falls back to the period when no class id is targeted', () => {
    const pinOnly = sessionClassPredicate({
      classIds: [],
      periodNames: ['Period 1'],
    });
    expect(pinOnly({ classId: 'cl-A', classPeriod: 'Period 1' })).toBe(true);
    expect(pinOnly({ classId: 'cl-B', classPeriod: 'Period 2' })).toBe(false);
  });

  it('uses the legacy single classId when classIds is missing', () => {
    const legacy = sessionClassPredicate({ classId: 'cl-A' });
    expect(legacy({ classId: 'cl-A' })).toBe(true);
    expect(legacy({ classId: 'cl-B' })).toBe(false);
  });
});

describe('filterToSessionClasses', () => {
  it('returns the same array when nothing is hidden', () => {
    const list = [{ classId: 'cl-A' }, {}];
    expect(filterToSessionClasses(list, session)).toBe(list);
  });

  it('drops a removed class and keeps the rest in order', () => {
    const list = [
      { id: 1, classId: 'cl-A' },
      { id: 2, classId: 'cl-C' },
      { id: 3 },
    ];
    expect(filterToSessionClasses(list, session).map((r) => r.id)).toEqual([
      1, 3,
    ]);
  });
});

describe('targetingKey', () => {
  it('ignores window changes on per-period rows', () => {
    const a = {
      ...session,
      periodAccess: { 'cl-A': { label: 'P1', openAt: 1 } },
    };
    const b = {
      ...session,
      periodAccess: { 'cl-A': { label: 'P1', openAt: 2 } },
    };
    expect(targetingKey(a)).toBe(targetingKey(b));
  });

  it('round-trips into the same predicate', () => {
    const keep = sessionClassPredicate(targetsFromKey(targetingKey(session)));
    expect(keep({ classId: 'cl-B' })).toBe(true);
    expect(keep({ classId: 'cl-C' })).toBe(false);
    expect(targetsFromKey('')).toBeNull();
  });
});

describe('withLinkedSections', () => {
  const current = {
    classIds: ['cl-A', 'cl-B', 'schoology:1', 'schoology:2'],
    periodNames: ['Period 1', 'Period 2', 'Bio 3'],
    classPeriodByClassId: {
      'cl-A': 'Period 1',
      'cl-B': 'Period 2',
      'schoology:1': 'Bio 3',
      'schoology:2': 'Period 2',
    },
  };

  it('keeps an unpaired section and drops one paired with a removed class', () => {
    expect(
      withLinkedSections(current, {
        classIds: ['cl-A'],
        periodNames: ['Period 1'],
        classPeriodByClassId: { 'cl-A': 'Period 1' },
      })
    ).toEqual({
      classIds: ['cl-A', 'schoology:1'],
      periodNames: ['Period 1', 'Bio 3'],
      classPeriodByClassId: { 'cl-A': 'Period 1', 'schoology:1': 'Bio 3' },
    });
  });

  it('keeps a section paired with a class that stays', () => {
    const out = withLinkedSections(current, {
      classIds: ['cl-B'],
      periodNames: ['Period 2'],
      classPeriodByClassId: { 'cl-B': 'Period 2' },
    });
    expect(out.classIds).toEqual(['cl-B', 'schoology:1', 'schoology:2']);
    expect(out.periodNames).toEqual(['Period 2', 'Bio 3']);
  });

  it('leaves targets alone when no section is linked', () => {
    const next = {
      classIds: ['cl-A'],
      periodNames: ['P'],
      classPeriodByClassId: {},
    };
    expect(withLinkedSections({ classIds: ['cl-A'] }, next)).toBe(next);
  });
});
