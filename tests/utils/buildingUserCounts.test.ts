import { describe, it, expect } from 'vitest';
import { withDerivedUserCounts } from '@/components/admin/Organization/lib/buildingUserCounts';
import type { BuildingRecord, UserRecord } from '@/types/organization';

const building = (id: string, users = 0): BuildingRecord => ({
  id,
  orgId: 'orono',
  name: `Building ${id}`,
  type: 'elementary',
  address: '',
  grades: 'K-5',
  users,
  adminEmails: [],
});

const member = (
  status: UserRecord['status'],
  buildingIds: string[]
): Pick<UserRecord, 'status' | 'buildingIds'> => ({ status, buildingIds });

describe('withDerivedUserCounts', () => {
  it('returns users=0 for every building when members list is empty', () => {
    const buildings = [building('a', 999), building('b', 42)];
    const result = withDerivedUserCounts(buildings, []);
    expect(result.map((b) => b.users)).toEqual([0, 0]);
  });

  it('counts a single active member in a single building', () => {
    const buildings = [building('a'), building('b')];
    const result = withDerivedUserCounts(buildings, [member('active', ['a'])]);
    expect(result.find((b) => b.id === 'a')?.users).toBe(1);
    expect(result.find((b) => b.id === 'b')?.users).toBe(0);
  });

  it('counts a member once per building when they belong to multiple', () => {
    const buildings = [building('a'), building('b')];
    const users = [member('active', ['a', 'b']), member('active', ['b'])];
    const result = withDerivedUserCounts(buildings, users);
    expect(result.find((b) => b.id === 'a')?.users).toBe(1);
    expect(result.find((b) => b.id === 'b')?.users).toBe(2);
  });

  it('excludes inactive members from counts', () => {
    const buildings = [building('a')];
    const users = [
      member('active', ['a']),
      member('inactive', ['a']),
      member('inactive', ['a']),
    ];
    const result = withDerivedUserCounts(buildings, users);
    expect(result[0]?.users).toBe(1);
  });

  it('counts invited members alongside active members', () => {
    const buildings = [building('a')];
    const users = [member('active', ['a']), member('invited', ['a'])];
    const result = withDerivedUserCounts(buildings, users);
    expect(result[0]?.users).toBe(2);
  });

  it('ignores buildingIds on members that do not match any building', () => {
    const buildings = [building('a')];
    const users = [member('active', ['ghost']), member('active', ['a'])];
    const result = withDerivedUserCounts(buildings, users);
    expect(result[0]?.users).toBe(1);
  });

  it('overwrites the denormalized users field rather than adding to it', () => {
    const buildings = [building('a', 9999)];
    const result = withDerivedUserCounts(buildings, [member('active', ['a'])]);
    expect(result[0]?.users).toBe(1);
  });

  it('preserves the order and other fields of the input buildings', () => {
    const buildings = [building('b', 0), building('a', 0)];
    const result = withDerivedUserCounts(buildings, [member('active', ['a'])]);
    expect(result.map((b) => b.id)).toEqual(['b', 'a']);
    expect(result[1]?.name).toBe('Building a');
    expect(result[1]?.orgId).toBe('orono');
  });
});
