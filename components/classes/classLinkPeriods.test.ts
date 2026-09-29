import { describe, expect, it, vi } from 'vitest';
import type { ClassLinkClass, ClassRoster } from '@/types';
import {
  backfillRosters,
  classLinkBackfillPatch,
  readClassPeriods,
} from './classLinkPeriods';

const options = [{ buildingId: 'b1', periodId: 'P5', label: 'Period 5' }];
const cls = (periods: unknown): ClassLinkClass =>
  ({ sourcedId: 'c1', title: 'Spanish II', periods }) as ClassLinkClass;

describe('readClassPeriods', () => {
  it('reads the spec array and a comma-separated string', () => {
    expect(readClassPeriods(cls(['5', ' 6 ']))).toEqual(['5', '6']);
    expect(readClassPeriods(cls('5, 6'))).toEqual(['5', '6']);
    expect(readClassPeriods(cls(undefined))).toEqual([]);
    expect(readClassPeriods(cls([5, '']))).toEqual([]);
  });
});

describe('classLinkBackfillPatch', () => {
  it('stores new periods and tags an untagged class', () => {
    expect(classLinkBackfillPatch({}, cls(['5']), options)).toEqual({
      classlinkPeriods: ['5'],
      bellPeriod: { buildingId: 'b1', periodId: 'P5' },
    });
  });

  it('never replaces a tag the teacher already set', () => {
    expect(
      classLinkBackfillPatch(
        {
          classlinkPeriods: ['5'],
          bellPeriod: { buildingId: 'b1', periodId: 'P7' },
        },
        cls(['5']),
        options
      )
    ).toBeNull();
  });

  it('keeps stored periods when OneRoster sends none', () => {
    expect(
      classLinkBackfillPatch({ classlinkPeriods: ['5'] }, cls([]), options)
    ).toBeNull();
  });
});

describe('backfillRosters', () => {
  const rosters = [
    { id: 'r1', classlinkClassId: 'c1' },
    { id: 'r2', classlinkClassId: 'gone' },
    { id: 'r3' },
  ] as ClassRoster[];

  it('patches only rosters linked to a returned class', async () => {
    const updateRoster = vi.fn().mockResolvedValue(undefined);
    await backfillRosters([cls(['5'])], {
      rosters,
      updateRoster,
      bellOptions: options,
    });
    expect(updateRoster).toHaveBeenCalledTimes(1);
    expect(updateRoster).toHaveBeenCalledWith('r1', {
      classlinkPeriods: ['5'],
      bellPeriod: { buildingId: 'b1', periodId: 'P5' },
    });
  });

  it('writes nothing while per-period access is off', async () => {
    const updateRoster = vi.fn();
    await backfillRosters([cls(['5'])], {
      rosters,
      updateRoster,
      bellOptions: undefined,
    });
    expect(updateRoster).not.toHaveBeenCalled();
  });
});
