/**
 * Focused unit tests for the M4 bulk "Change role" and "Move to building"
 * actions in UsersView.
 *
 * Verifies:
 * - "Change role": picking a role calls onBulkUpdate(ids, { role }) and clears
 *   the selection.
 * - "Move to building": picking building(s) → Continue → confirm calls
 *   onBulkUpdate(ids, { buildingIds }) with REPLACE semantics and clears the
 *   selection.
 * - Both actions are hidden for building_admin (canManageUsers === false).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const TEACHER_ROLE: RoleRecord = {
  id: 'teacher',
  name: 'Teacher',
  blurb: 'Classroom teacher',
  color: 'emerald',
  system: true,
  perms: {} as RoleRecord['perms'],
};
const COACH_ROLE: RoleRecord = {
  id: 'building_admin',
  name: 'Building admin',
  blurb: 'Manages a building',
  color: 'violet',
  system: true,
  perms: {} as RoleRecord['perms'],
};

const BUILDING_A: BuildingRecord = {
  id: 'b1',
  orgId: 'org1',
  name: 'High School',
  type: 'high',
  address: '',
  grades: '9-12',
  users: 3,
  adminEmails: [],
};
const BUILDING_B: BuildingRecord = {
  id: 'b2',
  orgId: 'org1',
  name: 'Middle School',
  type: 'middle',
  address: '',
  grades: '6-8',
  users: 2,
  adminEmails: [],
};

const makeUser = (id: string): UserRecord => ({
  id,
  orgId: 'org1',
  name: `User ${id}`,
  email: `${id}@example.com`,
  role: 'teacher',
  buildingIds: ['b1'],
  status: 'active',
  lastActive: null,
});

const USERS = [makeUser('u1'), makeUser('u2')];

const makeProps = (
  overrides: Partial<Parameters<typeof UsersView>[0]> = {}
) => ({
  users: USERS,
  roles: [TEACHER_ROLE, COACH_ROLE],
  buildings: [BUILDING_A, BUILDING_B],
  actorRole: 'domain_admin' as const,
  actorBuildingIds: ['b1', 'b2'],
  activityPartial: false,
  onUpdate: vi.fn(),
  onBulkUpdate: vi.fn(),
  onRemove: vi.fn(),
  onInvite: vi.fn(),
  onBulkInvite: vi.fn(),
  onResendInvite: vi.fn(),
  onResetPassword: vi.fn(),
  ...overrides,
});

function selectAll() {
  fireEvent.click(screen.getByRole('checkbox', { name: /select all/i }));
}

describe('UsersView — bulk Change role', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies the picked role to all selected users and clears selection', () => {
    const onBulkUpdate = vi.fn();
    render(<UsersView {...makeProps({ onBulkUpdate })} />);

    selectAll();
    // Open the bulk "Change role" picker.
    fireEvent.click(screen.getByRole('button', { name: /^change role$/i }));

    // The role picker modal is open — pick "Building admin".
    const dialog = screen.getByRole('dialog', { name: /change role/i });
    fireEvent.click(within(dialog).getByText('Building admin'));

    // Apply.
    fireEvent.click(
      within(dialog).getByRole('button', { name: /apply to 2 users/i })
    );

    expect(onBulkUpdate).toHaveBeenCalledTimes(1);
    expect(onBulkUpdate).toHaveBeenCalledWith(['u1', 'u2'], {
      role: 'building_admin',
    });
    // Selection cleared — toolbar gone.
    expect(screen.queryByText(/2 selected/i)).not.toBeInTheDocument();
  });
});

describe('UsersView — bulk Move to building (REPLACE)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces building assignments after confirm, then clears selection', () => {
    const onBulkUpdate = vi.fn();
    render(<UsersView {...makeProps({ onBulkUpdate })} />);

    selectAll();
    fireEvent.click(screen.getByRole('button', { name: /move to building/i }));

    // Pick "Middle School" in the building picker.
    const pickerDialog = screen.getByRole('dialog', {
      name: /move to building/i,
    });
    // The <label> wraps the checkbox + a grade badge, so its accessible name is
    // "Middle School 6-8". Click the visible building name to toggle the row.
    fireEvent.click(within(pickerDialog).getByText('Middle School'));
    fireEvent.click(
      within(pickerDialog).getByRole('button', { name: /continue/i })
    );

    // Confirm dialog spells out the replace impact.
    const confirmDialog = screen.getByRole('dialog', {
      name: /replace building assignments/i,
    });
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: /move users/i })
    );

    expect(onBulkUpdate).toHaveBeenCalledTimes(1);
    expect(onBulkUpdate).toHaveBeenCalledWith(['u1', 'u2'], {
      buildingIds: ['b2'],
    });
    expect(screen.queryByText(/2 selected/i)).not.toBeInTheDocument();
  });
});

describe('UsersView — bulk actions gating', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides Change role / Move to building for building_admin', () => {
    render(
      <UsersView
        {...makeProps({
          actorRole: 'building_admin',
          actorBuildingIds: ['b1'],
        })}
      />
    );
    selectAll();
    expect(
      screen.queryByRole('button', { name: /^change role$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /move to building/i })
    ).not.toBeInTheDocument();
  });
});
