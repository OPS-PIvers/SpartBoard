import { describe, it, expect } from 'vitest';
import {
  dueAtByClassIdFromRosters,
  earliestDueAt,
  resolveStudentDueAt,
} from '@/utils/perClassDueDates';
import type { ClassRoster } from '@/types';

const roster = (id: string, extra: Partial<ClassRoster> = {}) =>
  ({ id, name: id, students: [], ...extra }) as unknown as ClassRoster;

describe('perClassDueDates', () => {
  it('maps roster dates onto their ClassLink and test class ids', () => {
    expect(
      dueAtByClassIdFromRosters({ r1: 100, r2: 200, r3: 300 }, [
        roster('r1', { classlinkClassId: 'c1' }),
        roster('r2', { testClassId: 't2' }),
        roster('r3'),
      ])
    ).toEqual({ c1: 100, t2: 200 });
  });

  it('first roster wins when two share a class id', () => {
    expect(
      dueAtByClassIdFromRosters({ r1: 100, r2: 200 }, [
        roster('r1', { classlinkClassId: 'c1' }),
        roster('r2', { classlinkClassId: 'c1' }),
      ])
    ).toEqual({ c1: 100 });
  });

  it('earliestDueAt picks the minimum or null', () => {
    expect(earliestDueAt({ a: 300, b: 100 })).toBe(100);
    expect(earliestDueAt({})).toBeNull();
  });

  it("a student sees their own class's date, else the shared one", () => {
    expect(resolveStudentDueAt(50, { c1: 100, c2: 200 }, ['c2'])).toBe(200);
    expect(resolveStudentDueAt(50, { c1: 100 }, ['c9'])).toBe(50);
    expect(resolveStudentDueAt(50, undefined, ['c1'])).toBe(50);
  });
});
