/**
 * Unit tests for MembersBody — the PLC membership-management surface (T10).
 *
 * Focus areas (the T10 acceptance criteria):
 *   - Roster + roles render through the T1 helpers (`getPlcMembers` /
 *     `getPlcRole` / `isPlcLeadOrCoLead`), working against BOTH the canonical
 *     `members` map AND legacy `memberUids`/`memberEmails`/`leadUid` arrays.
 *   - A membership manager (lead OR co-lead) sees role <select>s, transfer, and
 *     remove controls; a plain member / viewer does not (the "notManager" hint
 *     shows instead).
 *   - Each mutator (`setMemberRole`, `transferLead`, `removeMember`,
 *     `leavePlc`) is wired with a confirm dialog gate: confirm → mutator runs;
 *     cancel → mutator is NOT called.
 *   - a11y labels are present on the icon-only / select controls.
 *
 * Firebase is never touched: the data hooks and contexts are mocked. The
 * mutator hook (`usePlcs`) returns vi.fn() spies so wiring is asserted.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MembersBody } from '@/components/plc/bodies/MembersBody';
import type { Plc, PlcMember } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string; [key: string]: unknown }) => {
      // Interpolate {{x}} from the options bag so confirm/aria strings carry
      // the email/role through to assertions.
      let s = o?.defaultValue ?? _k;
      if (o) {
        for (const [key, val] of Object.entries(o)) {
          if (key === 'defaultValue') continue;
          s = s.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
        }
      }
      return s;
    },
  }),
}));

const showConfirm = vi.fn();
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));

let mockUser: { uid: string; email: string } | null = {
  uid: 'uid-lead',
  email: 'lead@school.edu',
};
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const setMemberRole = vi.fn().mockResolvedValue(undefined);
const transferLead = vi.fn().mockResolvedValue(undefined);
const removeMember = vi.fn().mockResolvedValue(undefined);
const leavePlc = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    setMemberRole,
    transferLead,
    removeMember,
    leavePlc,
  }),
}));

const sendInvite = vi.fn().mockResolvedValue(undefined);
const revokeInvite = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/usePlcInvitations', () => ({
  usePlcInvitations: () => ({
    sentInvites: [],
    sendInvite,
    revokeInvite,
  }),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function member(
  uid: string,
  email: string,
  role: PlcMember['role']
): PlcMember {
  return {
    uid,
    email,
    displayName: email.split('@')[0] ?? '',
    role,
    joinedAt: 1000,
    status: 'active',
  };
}

/** A PLC carrying the canonical members map with all four roles represented. */
function mapPlc(): Plc {
  return {
    id: 'plc-1',
    name: '5th Grade Math',
    orgId: null,
    buildingId: null,
    leadUid: 'uid-lead',
    members: {
      'uid-lead': member('uid-lead', 'lead@school.edu', 'lead'),
      'uid-co': member('uid-co', 'co@school.edu', 'coLead'),
      'uid-mem': member('uid-mem', 'mem@school.edu', 'member'),
      'uid-view': member('uid-view', 'view@school.edu', 'viewer'),
    },
    memberUids: ['uid-lead', 'uid-co', 'uid-mem', 'uid-view'],
    memberEmails: {
      'uid-lead': 'lead@school.edu',
      'uid-co': 'co@school.edu',
      'uid-mem': 'mem@school.edu',
      'uid-view': 'view@school.edu',
    },
    createdAt: 1000,
    updatedAt: 2000,
  };
}

/** A legacy PLC with only the denormalized arrays (empty members map). */
function legacyPlc(): Plc {
  return {
    id: 'plc-legacy',
    name: 'Legacy PLC',
    orgId: null,
    buildingId: null,
    leadUid: 'uid-lead',
    members: {},
    memberUids: ['uid-lead', 'uid-mem'],
    memberEmails: {
      'uid-lead': 'lead@school.edu',
      'uid-mem': 'mem@school.edu',
    },
    createdAt: 1000,
    updatedAt: 2000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { uid: 'uid-lead', email: 'lead@school.edu' };
  showConfirm.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Role rendering
// ---------------------------------------------------------------------------

describe('MembersBody — role rendering', () => {
  it('renders every member with its role label from the members map', () => {
    render(<MembersBody plc={mapPlc()} />);
    expect(screen.getByText('lead@school.edu')).toBeInTheDocument();
    expect(screen.getByText('co@school.edu')).toBeInTheDocument();
    expect(screen.getByText('mem@school.edu')).toBeInTheDocument();
    expect(screen.getByText('view@school.edu')).toBeInTheDocument();
    // Role labels render (the lead/co-lead/viewer bands). "Co-lead"/"Viewer"
    // also appear as <select> options, so assert at-least-one rather than
    // exactly-one. "Lead" is the lead band only (excluded from the select).
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.getAllByText('Co-lead').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viewer').length).toBeGreaterThan(0);
  });

  it('renders from the legacy arrays when the members map is empty (dual-shape)', () => {
    render(<MembersBody plc={legacyPlc()} />);
    // Both legacy members synthesize: lead via leadUid, the other as member.
    expect(screen.getByText('lead@school.edu')).toBeInTheDocument();
    expect(screen.getByText('mem@school.edu')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Manager gating
// ---------------------------------------------------------------------------

describe('MembersBody — manager gating', () => {
  it('shows role selects + transfer + remove for the lead (manager)', () => {
    render(<MembersBody plc={mapPlc()} />);
    // One role select per non-lead, non-self active member (co, mem, view = 3).
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(3);
    // Remove buttons present for those rows.
    expect(screen.getByLabelText('Remove co@school.edu')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove mem@school.edu')).toBeInTheDocument();
    // Transfer (make lead) buttons present.
    expect(
      screen.getByLabelText('Make co@school.edu the lead')
    ).toBeInTheDocument();
    // The "not manager" hint is hidden for a manager.
    expect(
      screen.queryByText(/Only the PLC lead or a co-lead/)
    ).not.toBeInTheDocument();
  });

  it('allows a co-lead to manage (manager) but not act on the lead or self', () => {
    mockUser = { uid: 'uid-co', email: 'co@school.edu' };
    render(<MembersBody plc={mapPlc()} />);
    // Co-lead can manage the plain member and viewer (2 rows), not the lead
    // (sitting lead is never actionable) nor itself.
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(screen.getByLabelText('Remove mem@school.edu')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Remove lead@school.edu')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Remove co@school.edu')
    ).not.toBeInTheDocument();
  });

  it('hides all management controls + shows the hint for a plain member', () => {
    mockUser = { uid: 'uid-mem', email: 'mem@school.edu' };
    render(<MembersBody plc={mapPlc()} />);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(
      screen.getByText(/Only the PLC lead or a co-lead/)
    ).toBeInTheDocument();
    // The invite form (manager-only) is absent.
    expect(screen.queryByLabelText('Invite a teacher')).not.toBeInTheDocument();
  });

  it('hides all management controls for a viewer', () => {
    mockUser = { uid: 'uid-view', email: 'view@school.edu' };
    render(<MembersBody plc={mapPlc()} />);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(
      screen.getByText(/Only the PLC lead or a co-lead/)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mutator wiring + confirm gating
// ---------------------------------------------------------------------------

describe('MembersBody — mutator wiring', () => {
  it('changing a role confirms then calls setMemberRole(plcId, uid, role)', async () => {
    render(<MembersBody plc={mapPlc()} />);
    const select = screen.getByLabelText('Role for mem@school.edu');
    fireEvent.change(select, { target: { value: 'coLead' } });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(setMemberRole).toHaveBeenCalledWith('plc-1', 'uid-mem', 'coLead')
    );
  });

  it('does NOT call setMemberRole when the confirm is cancelled', async () => {
    showConfirm.mockResolvedValue(false);
    render(<MembersBody plc={mapPlc()} />);
    const select = screen.getByLabelText('Role for mem@school.edu');
    fireEvent.change(select, { target: { value: 'viewer' } });
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(setMemberRole).not.toHaveBeenCalled();
  });

  it('"Make lead" confirms then calls transferLead(plcId, uid)', async () => {
    render(<MembersBody plc={mapPlc()} />);
    fireEvent.click(screen.getByLabelText('Make co@school.edu the lead'));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(transferLead).toHaveBeenCalledWith('plc-1', 'uid-co')
    );
  });

  it('"Remove" confirms then calls removeMember(plcId, uid)', async () => {
    render(<MembersBody plc={mapPlc()} />);
    fireEvent.click(screen.getByLabelText('Remove mem@school.edu'));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(removeMember).toHaveBeenCalledWith('plc-1', 'uid-mem')
    );
  });

  it('does NOT call removeMember when the confirm is cancelled', async () => {
    showConfirm.mockResolvedValue(false);
    render(<MembersBody plc={mapPlc()} />);
    fireEvent.click(screen.getByLabelText('Remove mem@school.edu'));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('offers "Leave this PLC" to a non-lead member and calls leavePlc on confirm', async () => {
    mockUser = { uid: 'uid-mem', email: 'mem@school.edu' };
    render(<MembersBody plc={mapPlc()} />);
    const leaveBtn = screen.getByText('Leave this PLC');
    fireEvent.click(leaveBtn);
    expect(showConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(leavePlc).toHaveBeenCalledWith('plc-1'));
  });

  it('does NOT offer "Leave this PLC" to the lead (must transfer first)', () => {
    render(<MembersBody plc={mapPlc()} />);
    expect(screen.queryByText('Leave this PLC')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Compact mode
// ---------------------------------------------------------------------------

describe('MembersBody — compact mode', () => {
  it('renders the avatar grid with role-aware aria labels and no controls', () => {
    render(<MembersBody plc={mapPlc()} compact />);
    // No management controls in compact mode.
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    // Avatars carry an accessible label combining email + role + "You".
    expect(
      screen.getByLabelText('lead@school.edu, Lead, You')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('co@school.edu, Co-lead')).toBeInTheDocument();
  });
});
