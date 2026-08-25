/**
 * Regression test: a member doc's buildingIds can still carry a legacy
 * long-form ID (e.g. `orono-high-school`) predating the Organization admin
 * panel. UsersView must canonicalize before joining against the canonical
 * BuildingRecord list, so the building badge renders, the building filter
 * includes the member, and a scoped building_admin can see/manage them.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const HIGH_SCHOOL: BuildingRecord = {
  id: 'high',
  orgId: 'org1',
  name: 'Orono High School',
  type: 'high',
  address: '',
  grades: '9-12',
  users: 0,
  adminEmails: [],
};

const legacyUser: UserRecord = {
  id: 'u1',
  orgId: 'org1',
  name: 'Legacy Teacher',
  email: 'legacy@example.com',
  role: 'teacher',
  buildingIds: ['orono-high-school'],
  status: 'active',
  lastActive: null,
};

const baseProps = {
  users: [legacyUser],
  roles: [TEACHER_ROLE],
  buildings: [HIGH_SCHOOL],
  activityPartial: false,
  onUpdate: vi.fn(),
  onBulkUpdate: vi.fn(),
  onRemove: vi.fn(),
  onInvite: vi.fn(),
  onBulkInvite: vi.fn(),
  onResendInvite: vi.fn(),
  onResetPassword: vi.fn(),
};

describe('UsersView — legacy buildingId canonicalization', () => {
  it('renders the building badge for a member with a legacy long-form buildingId', () => {
    render(
      <UsersView
        {...baseProps}
        actorRole="domain_admin"
        actorBuildingIds={['high']}
      />
    );
    // "Orono High School" also appears as a <select> option, so scope to the
    // building badge specifically (a <span>, not an <option>).
    const badges = screen
      .getAllByText('Orono High School')
      .filter((el) => el.tagName !== 'OPTION');
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.queryByText('No buildings')).not.toBeInTheDocument();
  });

  it('keeps a legacy-ID member in scope for a building_admin scoped to the canonical building', () => {
    render(
      <UsersView
        {...baseProps}
        actorRole="building_admin"
        actorBuildingIds={['high']}
      />
    );
    // In-scope rows render at full opacity and their checkbox is enabled;
    // an out-of-scope row is dimmed (opacity-60) with a disabled checkbox.
    const checkbox = screen.getByRole('checkbox', {
      name: /select legacy teacher/i,
    });
    expect(checkbox).not.toBeDisabled();
  });
});
