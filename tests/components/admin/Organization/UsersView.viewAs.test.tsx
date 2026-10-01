// The super admin "View as" row action (docs/plans/ADMIN_VIEW_AS.md D8).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { UsersView } from '@/components/admin/Organization/views/UsersView';
import type {
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
  blurb: 'Classroom teacher',
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
  users: 2,
  adminEmails: [],
};

const makeUser = (id: string, status: UserRecord['status']): UserRecord => ({
  id: `${id}@example.com`,
  orgId: 'org1',
  name: `User ${id}`,
  email: `${id}@example.com`,
  role: 'teacher',
  buildingIds: ['b1'],
  status,
  lastActive: null,
});

const props = (
  overrides: Partial<Parameters<typeof UsersView>[0]> = {}
): Parameters<typeof UsersView>[0] => ({
  users: [makeUser('jane', 'active'), makeUser('boss', 'active')],
  roles: [ROLE],
  buildings: [BUILDING],
  actorRole: 'super_admin',
  actorBuildingIds: [],
  activityPartial: false,
  onUpdate: vi.fn(),
  onBulkUpdate: vi.fn(),
  onRemove: vi.fn(),
  onDeleteAccount: vi.fn(),
  onInvite: vi.fn(),
  onBulkInvite: vi.fn(),
  onResendInvite: vi.fn(),
  onResetPassword: vi.fn(),
  ...overrides,
});

const openMenuFor = (name: string) => {
  const row = screen.getByText(name).closest('[class*="grid"]') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
};

describe('UsersView View as', () => {
  it('is absent without onViewAs', () => {
    render(<UsersView {...props()} />);
    openMenuFor('User jane');
    expect(screen.queryByRole('menuitem', { name: /view as/i })).toBeNull();
  });

  it('opens View as for the row', () => {
    const onViewAs = vi.fn();
    render(
      <UsersView {...props({ onViewAs, actorEmail: 'boss@example.com' })} />
    );
    openMenuFor('User jane');
    fireEvent.click(screen.getByRole('menuitem', { name: /view as/i }));
    expect(onViewAs).toHaveBeenCalledWith('jane@example.com');
  });

  it('is absent on your own row', () => {
    render(
      <UsersView
        {...props({ onViewAs: vi.fn(), actorEmail: 'BOSS@example.com' })}
      />
    );
    openMenuFor('User boss');
    expect(screen.queryByRole('menuitem', { name: /view as/i })).toBeNull();
  });
});
