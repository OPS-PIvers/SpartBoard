/**
 * Focused unit test for the bulk "Resend invite" action in UsersView.
 *
 * Verifies:
 * - Clicking the button calls `onResendInvite` once per selected *invited* user
 * - Does NOT call `onResendInvite` for selected users whose status is not 'invited'
 * - Clears the selection after firing
 * - The button is disabled when none of the selected users are 'invited'
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsersView } from '@/components/admin/Organization/views/UsersView';
import type {
  BuildingRecord,
  RoleRecord,
  UserRecord,
} from '@/types/organization';

// UsersView imports parseInvitesCsv — mock it so we don't need the full util
// in jsdom (it's not exercised by these tests).
vi.mock('@/utils/csvImport', () => ({
  parseInvitesCsv: vi.fn(() => ({ valid: [], errors: [] })),
}));

// ---------------------------------------------------------------------------
// Minimal fixture data
// ---------------------------------------------------------------------------

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
  users: 3,
  adminEmails: [],
};

const makeUser = (id: string, status: UserRecord['status']): UserRecord => ({
  id,
  orgId: 'org1',
  name: `User ${id}`,
  email: `${id}@example.com`,
  role: 'teacher',
  buildingIds: ['b1'],
  status,
  lastActive: null,
});

// One invited user, one active user, one inactive user
const USER_INVITED = makeUser('invited-1', 'invited');
const USER_ACTIVE = makeUser('active-1', 'active');
const USER_INACTIVE = makeUser('inactive-1', 'inactive');

const ALL_USERS = [USER_INVITED, USER_ACTIVE, USER_INACTIVE];

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------

const makeProps = (
  overrides: Partial<Parameters<typeof UsersView>[0]> = {}
) => ({
  users: ALL_USERS,
  roles: [ROLE],
  buildings: [BUILDING],
  actorRole: 'domain_admin' as const,
  actorBuildingIds: ['b1'],
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Select all visible rows via the header checkbox. */
function selectAll() {
  const selectAllCheckbox = screen.getByRole('checkbox', {
    name: /select all/i,
  });
  fireEvent.click(selectAllCheckbox);
}

/** Get the bulk "Resend invite" button (only visible when selection.size > 0). */
function getBulkResendButton() {
  return screen.getByRole('button', { name: /resend invite/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsersView — bulk Resend invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onResendInvite only for selected invited users, then clears selection', () => {
    const onResendInvite = vi.fn();
    render(<UsersView {...makeProps({ onResendInvite })} />);

    // Select all rows (invited + active + inactive)
    selectAll();

    const btn = getBulkResendButton();
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);

    // Only the invited user should receive the callback
    expect(onResendInvite).toHaveBeenCalledTimes(1);
    expect(onResendInvite).toHaveBeenCalledWith(USER_INVITED);

    // Selection should be cleared — the toolbar disappears when size === 0
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('does NOT call onResendInvite for non-invited selected users', () => {
    const onResendInvite = vi.fn();
    render(<UsersView {...makeProps({ onResendInvite })} />);

    selectAll();
    fireEvent.click(getBulkResendButton());

    const calledWith = onResendInvite.mock.calls.map(
      (args) => (args[0] as UserRecord).status
    );
    expect(calledWith.every((s) => s === 'invited')).toBe(true);
    expect(onResendInvite).not.toHaveBeenCalledWith(USER_ACTIVE);
    expect(onResendInvite).not.toHaveBeenCalledWith(USER_INACTIVE);
  });

  it('is disabled when only non-invited users are selected', () => {
    // Render with only active + inactive users so no invited user is present
    render(
      <UsersView
        {...makeProps({
          users: [USER_ACTIVE, USER_INACTIVE],
        })}
      />
    );

    // Select all (active + inactive only)
    selectAll();

    const btn = getBulkResendButton();
    expect(btn).toBeDisabled();
  });

  it('calls onResendInvite once per invited user when multiple invited users are selected', () => {
    const invited2 = makeUser('invited-2', 'invited');
    const invited3 = makeUser('invited-3', 'invited');
    const onResendInvite = vi.fn();

    render(
      <UsersView
        {...makeProps({
          users: [USER_INVITED, invited2, invited3, USER_ACTIVE],
          onResendInvite,
        })}
      />
    );

    selectAll();
    fireEvent.click(getBulkResendButton());

    expect(onResendInvite).toHaveBeenCalledTimes(3);
    const calledIds = onResendInvite.mock.calls.map(
      (args) => (args[0] as UserRecord).id
    );
    expect(calledIds).toContain('invited-1');
    expect(calledIds).toContain('invited-2');
    expect(calledIds).toContain('invited-3');
    expect(calledIds).not.toContain('active-1');
  });
});
