import { describe, it, expect } from 'vitest';
import type { BuildingRecord } from '@/types/organization';
import { withDerivedUserCounts } from './buildingUserCounts';

const building = (id: string): BuildingRecord => ({
  id,
  orgId: 'orono',
  name: id,
  type: 'high',
  address: '',
  grades: '9-12',
  users: 99,
  adminEmails: [],
});

describe('withDerivedUserCounts', () => {
  it('counts a legacy long-form id against its canonical building', () => {
    const [high] = withDerivedUserCounts(
      [building('high')],
      [{ status: 'active', buildingIds: ['orono-high-school'] }]
    );
    expect(high.users).toBe(1);
  });

  it('counts a member once when they hold both the legacy and canonical id', () => {
    const [high] = withDerivedUserCounts(
      [building('high')],
      [{ status: 'active', buildingIds: ['high', 'orono-high-school'] }]
    );
    expect(high.users).toBe(1);
  });

  it('skips inactive members', () => {
    const [high] = withDerivedUserCounts(
      [building('high')],
      [{ status: 'inactive', buildingIds: ['high'] }]
    );
    expect(high.users).toBe(0);
  });
});
