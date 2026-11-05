import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UsersView } from '@/components/admin/Organization/views/UsersView';
import {
  protectedRolesFor,
  withoutProtectedMembers,
} from '@/components/admin/Organization/lib/protectedMembers';
import type {
  ActorRole,
  BuildingRecord,
  RoleRecord,
  UserRecord,
} from '@/types/organization';

vi.mock('@/utils/csvImport', () => ({
  parseInvitesCsv: vi.fn(() => ({ valid: [], errors: [] })),
}));

const ROLE: RoleRecord = {
  id: 'teacher',
  name: 'Teacher',
  blurb: '',
  color: 'emerald',
  system: true,
  perms: {} as RoleRecord['perms'],
};

const BUILDING: BuildingRecord = {
  id: 'b1',
  orgId: 'org1',
  name: 'Main Building',
  type: 'high',
  address: '',
  grades: '9-12',
  users: 3,
  adminEmails: [],
};

const makeUser = (id: string, role: string): UserRecord => ({
  id,
  orgId: 'org1',
  name: `User ${id}`,
  email: `${id}@example.com`,
  role,
  buildingIds: ['b1'],
  status: 'active',
  lastActive: null,
});

const statusCell = (user: UserRecord, actorRole: ActorRole) => {
  const { container, unmount } = render(
    <UsersView
      users={[user]}
      roles={[ROLE]}
      buildings={[BUILDING]}
      actorRole={actorRole}
      actorBuildingIds={['b1']}
      activityPartial={false}
      onUpdate={vi.fn()}
      onBulkUpdate={vi.fn()}
      onRemove={vi.fn()}
      onDeleteAccount={vi.fn()}
      onInvite={vi.fn()}
      onBulkInvite={vi.fn()}
      onResendInvite={vi.fn()}
      onResetPassword={vi.fn()}
    />
  );
  const button = container.querySelector<HTMLButtonElement>(
    '[data-tour="admin.org.user-status-cell"]'
  );
  const disabled = button?.disabled;
  unmount();
  return disabled;
};

describe('higher-tier member status', () => {
  it('locks the status cell for a building admin on domain and super admin rows', () => {
    expect(statusCell(makeUser('da', 'domain_admin'), 'building_admin')).toBe(
      true
    );
    expect(statusCell(makeUser('sa', 'super_admin'), 'building_admin')).toBe(
      true
    );
    expect(statusCell(makeUser('t', 'teacher'), 'building_admin')).toBe(false);
    expect(statusCell(makeUser('da', 'domain_admin'), 'domain_admin')).toBe(
      false
    );
  });

  it('drops higher tiers from a bulk status change by actor tier', () => {
    const users = [
      makeUser('sa', 'super_admin'),
      makeUser('da', 'domain_admin'),
      makeUser('t', 'teacher'),
    ];
    const ids = users.map((u) => u.id);
    expect(withoutProtectedMembers(ids, users, 'building_admin')).toEqual([
      't',
    ]);
    expect(withoutProtectedMembers(ids, users, 'domain_admin')).toEqual([
      'da',
      't',
    ]);
    expect(withoutProtectedMembers(ids, users, 'super_admin')).toEqual(ids);
    expect(protectedRolesFor('super_admin')).toEqual([]);
  });
});
