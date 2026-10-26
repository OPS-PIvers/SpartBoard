import { describe, expect, it } from 'vitest';
import {
  filterToSessionClasses,
  sessionClassPredicate,
  targetingKey,
  targetsFromKey,
  nextRemovedClasses,
  withLinkedSections,
} from './sessionClassFilter';

const session = {
  classIds: ['cl-A'],
  classId: 'cl-A',
  periodNames: ['Period 1', 'Period 4'],
  classPeriodByClassId: { 'cl-A': 'Period 1' },
  removedClasses: { classIds: ['cl-C'], periodNames: ['Period 3'] },
};

describe('sessionClassPredicate', () => {
  const keep = sessionClassPredicate(session);

  it('hides SSO and PIN work from a removed class', () => {
    expect(keep({ classId: 'cl-C', classPeriod: 'Period 3' })).toBe(false);
    expect(keep({ classPeriod: 'Period 3' })).toBe(false);
    expect(keep({ classId: 'cl-C' })).toBe(false);
  });

  it('keeps work from targeted classes and classes never removed', () => {
    expect(keep({ classId: 'cl-A', classPeriod: 'Period 1' })).toBe(true);
    expect(keep({ classPeriod: 'Period 4' })).toBe(true);
    expect(keep({ classId: 'cl-Z', classPeriod: 'Spare' })).toBe(true);
  });

  it('keeps work with no class, such as a link join', () => {
    expect(keep({})).toBe(true);
    expect(keep({ classId: '', classPeriod: '' })).toBe(true);
  });

  it('changes nothing on a session whose classes never changed', () => {
    const unedited = sessionClassPredicate({
      classIds: ['cl-A'],
      periodNames: ['Period 1'],
    });
    expect(unedited({ classId: 'cl-B', classPeriod: 'Period 2' })).toBe(true);
    expect(sessionClassPredicate(null)({ classId: 'cl-Z' })).toBe(true);
  });

  it('keeps a removed name that is also active again', () => {
    const readded = sessionClassPredicate({
      classIds: ['cl-A'],
      periodNames: ['Period 3'],
      removedClasses: { classIds: ['cl-C'], periodNames: ['Period 3'] },
    });
    expect(readded({ classId: 'cl-C', classPeriod: 'Period 3' })).toBe(true);
  });

  it('counts per-period rows and the legacy period as active', () => {
    const rows = sessionClassPredicate({
      classIds: [],
      periodName: 'Period 7',
      periodAccess: { 'roster:r9': { label: 'Period 9' } },
      removedClasses: {
        classIds: ['roster:r9', 'roster:r8'],
        periodNames: ['Period 7', 'Period 8'],
      },
    });
    expect(rows({ classId: 'roster:r9' })).toBe(true);
    expect(rows({ classPeriod: 'Period 7' })).toBe(true);
    expect(rows({ classId: 'roster:r8', classPeriod: 'Period 8' })).toBe(false);
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

describe('nextRemovedClasses', () => {
  const current = {
    classIds: ['cl-A', 'cl-B', 'schoology:1'],
    periodNames: ['Period 1', 'Period 2', 'Old name'],
    classPeriodByClassId: { 'cl-A': 'Period 1', 'cl-B': 'Period 2' },
    periodAccess: { 'roster:r5': { label: 'Period 5' } },
    removedClasses: { classIds: ['cl-C'], periodNames: ['Period 3'] },
  };

  it('adds dropped classes and their names, but not a kept class renamed', () => {
    expect(
      nextRemovedClasses(
        current,
        {
          classIds: ['cl-A'],
          periodNames: ['Period 1', 'New name'],
          periodAccessKeys: [],
        },
        ['Period 5']
      )
    ).toEqual({
      classIds: ['cl-C', 'cl-B', 'roster:r5'],
      periodNames: ['Period 3', 'Period 5', 'Period 2'],
    });
  });

  it('takes a re-added class off the list', () => {
    expect(
      nextRemovedClasses(
        current,
        {
          classIds: ['cl-A', 'cl-B', 'cl-C'],
          periodNames: ['Period 1', 'Period 2', 'Period 3'],
          periodAccessKeys: ['roster:r5'],
        },
        []
      )
    ).toEqual({ classIds: [], periodNames: [] });
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
    expect(keep({ classId: 'cl-A' })).toBe(true);
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
