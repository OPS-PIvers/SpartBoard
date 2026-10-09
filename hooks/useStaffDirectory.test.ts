import { describe, expect, it } from 'vitest';
import { filterStaff, type StaffEntry } from './useStaffDirectory';

const staff: StaffEntry[] = [
  { email: 'linda.paulsen@orono.k12.mn.us', name: 'Linda Paulsen' },
  { email: 'paula.berg@orono.k12.mn.us', name: 'Paula Berg' },
  { email: 'paul.ivers@orono.k12.mn.us', name: 'Paul Ivers' },
  { email: 'mark.johnson@orono.k12.mn.us', name: 'Mark Johnson' },
  { email: 'jsmith@orono.k12.mn.us', name: '' },
];

describe('filterStaff', () => {
  it('ranks email prefix matches before name-word matches', () => {
    expect(filterStaff(staff, 'paul', new Set()).map((s) => s.name)).toEqual([
      'Paul Ivers',
      'Paula Berg',
      'Linda Paulsen',
    ]);
  });

  it('narrows as more is typed', () => {
    expect(filterStaff(staff, 'paul.i', new Set()).map((s) => s.email)).toEqual(
      ['paul.ivers@orono.k12.mn.us']
    );
  });

  it('matches on a later name word and ignores case', () => {
    expect(filterStaff(staff, 'JOHN', new Set())[0]?.name).toBe('Mark Johnson');
  });

  it('leaves out excluded emails and an exact typed match', () => {
    const result = filterStaff(
      staff,
      'paul',
      new Set(['paul.ivers@orono.k12.mn.us'])
    );
    expect(result.map((s) => s.name)).toEqual(['Paula Berg', 'Linda Paulsen']);
    expect(filterStaff(staff, 'jsmith@orono.k12.mn.us', new Set())).toEqual([]);
  });

  it('returns nothing for a blank query and honours the limit', () => {
    expect(filterStaff(staff, '  ', new Set())).toEqual([]);
    expect(filterStaff(staff, 'o', new Set(), 2)).toHaveLength(2);
  });
});
