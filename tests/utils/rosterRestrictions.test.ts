import { describe, it, expect } from 'vitest';
import { normalizeRestrictions } from '@/utils/rosterRestrictions';
import type { Student } from '@/types';

const student = (id: string, restricted?: string[]): Student => {
  const s: Student = { id, firstName: id, lastName: '', pin: '' };
  if (restricted) s.restrictedStudentIds = restricted;
  return s;
};

describe('normalizeRestrictions', () => {
  it('mirrors one-sided restrictions to both sides', () => {
    const result = normalizeRestrictions([
      student('a', ['b']),
      student('b'),
      student('c'),
    ]);
    expect(result.find((s) => s.id === 'a')?.restrictedStudentIds).toEqual([
      'b',
    ]);
    expect(result.find((s) => s.id === 'b')?.restrictedStudentIds).toEqual([
      'a',
    ]);
    expect(
      result.find((s) => s.id === 'c')?.restrictedStudentIds
    ).toBeUndefined();
  });

  it('strips references to students no longer in the roster', () => {
    const result = normalizeRestrictions([
      student('a', ['b', 'deleted']),
      student('b', ['a']),
    ]);
    expect(result.find((s) => s.id === 'a')?.restrictedStudentIds).toEqual([
      'b',
    ]);
    expect(result.find((s) => s.id === 'b')?.restrictedStudentIds).toEqual([
      'a',
    ]);
  });

  it('drops self-references', () => {
    const result = normalizeRestrictions([student('a', ['a'])]);
    expect(
      result.find((s) => s.id === 'a')?.restrictedStudentIds
    ).toBeUndefined();
  });

  it('deduplicates restriction entries', () => {
    const result = normalizeRestrictions([
      student('a', ['b', 'b']),
      student('b', ['a']),
    ]);
    expect(result.find((s) => s.id === 'a')?.restrictedStudentIds).toEqual([
      'b',
    ]);
  });

  it('is idempotent — normalizing twice yields identical output', () => {
    const once = normalizeRestrictions([
      student('a', ['b']),
      student('b'),
      student('c', ['a']),
    ]);
    const twice = normalizeRestrictions(once);
    expect(twice).toEqual(once);
  });

  it('returns students without a restrictions field when they have none', () => {
    const result = normalizeRestrictions([student('a'), student('b')]);
    expect(result[0].restrictedStudentIds).toBeUndefined();
    expect(result[1].restrictedStudentIds).toBeUndefined();
  });

  it('preserves other student fields', () => {
    const input: Student[] = [
      {
        id: 'a',
        firstName: 'Ada',
        lastName: 'L',
        pin: '01',
        classLinkSourcedId: 'cl-a',
      },
      { id: 'b', firstName: 'Bea', lastName: 'M', pin: '02' },
    ];
    input[0].restrictedStudentIds = ['b'];
    const result = normalizeRestrictions(input);
    expect(result[0].firstName).toBe('Ada');
    expect(result[0].pin).toBe('01');
    expect(result[0].classLinkSourcedId).toBe('cl-a');
    expect(result[1].firstName).toBe('Bea');
  });
});
