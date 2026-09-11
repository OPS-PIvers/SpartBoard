/**
 * UI-gating + behavior tests for the admin PLC recovery panel (W4-T11).
 *
 * Pins the defense-in-depth gating that mirrors the rules layer:
 *   - hidden for non-admins,
 *   - hidden for admins with no resolved org,
 *   - lists ONLY same-org PLCs (cross-org PLCs and org-less legacy PLCs are
 *     never offered),
 * plus the two recovery actions (reassign lead → adminReassignLead; dissolve →
 * deletePlc), both confirm-gated.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlcRecoveryPanel } from '@/components/admin/PlcResourcesManager/PlcRecoveryPanel';
import { usePlcs } from '@/hooks/usePlcs';
import { useAuth } from '@/context/useAuth';

const interpolate = (s: string, o?: Record<string, unknown>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const v = o?.[k];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  });
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      interpolate((o?.defaultValue as string | undefined) ?? k, o),
  }),
}));

const mockAdminReassignLead = vi.fn();
const mockAdminSetMember = vi.fn();
const mockAdminRemoveMember = vi.fn();
const mockDeletePlc = vi.fn();
vi.mock('@/hooks/useOrgMembers', () => ({
  useOrgMembers: () => ({
    members: [
      { email: 'new@x.com', uid: 'new-9', name: 'Nia New', status: 'active' },
    ],
    loading: false,
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockAddToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

const mockUsePlcs = usePlcs as unknown as Mock;
const mockUseAuth = useAuth as unknown as Mock;

function makeMember(uid: string, role: string, name: string) {
  return {
    uid,
    email: `${uid}@x.com`,
    displayName: name,
    role,
    joinedAt: 1,
    status: 'active',
  };
}

const ORG_PLC = {
  id: 'plc-org',
  name: 'Math PLC',
  orgId: 'org-1',
  leadUid: 'lead-1',
  memberUids: ['lead-1', 'm-2'],
  memberEmails: { 'lead-1': 'lead-1@x.com', 'm-2': 'm-2@x.com' },
  members: {
    'lead-1': makeMember('lead-1', 'lead', 'Lee Lead'),
    'm-2': makeMember('m-2', 'member', 'Mary Member'),
  },
};

const OTHER_ORG_PLC = {
  ...ORG_PLC,
  id: 'plc-other-org',
  name: 'Other Org PLC',
  orgId: 'org-2',
};

const ORGLESS_PLC = {
  ...ORG_PLC,
  id: 'plc-orgless',
  name: 'Legacy PLC',
  orgId: null,
};

function setPlcs(plcs: unknown[]) {
  mockUsePlcs.mockReturnValue({
    plcs,
    loading: false,
    error: null,
    adminReassignLead: mockAdminReassignLead,
    adminSetMember: mockAdminSetMember,
    adminRemoveMember: mockAdminRemoveMember,
    deletePlc: mockDeletePlc,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminReassignLead.mockResolvedValue(undefined);
  mockDeletePlc.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({ isAdmin: true, orgId: 'org-1' });
  setPlcs([ORG_PLC]);
});

describe('PlcRecoveryPanel - gating', () => {
  it('renders nothing for a non-admin', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, orgId: 'org-1' });
    const { container } = render(<PlcRecoveryPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while admin status is unresolved (null)', () => {
    mockUseAuth.mockReturnValue({ isAdmin: null, orgId: 'org-1' });
    const { container } = render(<PlcRecoveryPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an admin with no resolved org', () => {
    mockUseAuth.mockReturnValue({ isAdmin: true, orgId: null });
    const { container } = render(<PlcRecoveryPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reads PLCs via the admin path', () => {
    render(<PlcRecoveryPanel />);
    expect(usePlcs).toHaveBeenCalledWith({ asAdmin: true });
  });

  it('lists only same-org PLCs (excludes cross-org and org-less)', () => {
    setPlcs([ORG_PLC, OTHER_ORG_PLC, ORGLESS_PLC]);
    render(<PlcRecoveryPanel />);
    expect(screen.getByText('Math PLC')).toBeInTheDocument();
    expect(screen.queryByText('Other Org PLC')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy PLC')).not.toBeInTheDocument();
  });

  it('shows the empty state when no same-org PLCs are recoverable', () => {
    setPlcs([OTHER_ORG_PLC, ORGLESS_PLC]);
    render(<PlcRecoveryPanel />);
    expect(
      screen.getByText(/no recoverable plcs in your organization/i)
    ).toBeInTheDocument();
  });
});

describe('PlcRecoveryPanel - reassign lead', () => {
  it('reassigns to a chosen active member after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PlcRecoveryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /reassign lead/i }));
    // The eligible-member select defaults to the only non-lead member (m-2).
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() =>
      expect(mockAdminReassignLead).toHaveBeenCalledWith('plc-org', 'm-2')
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('does NOT reassign when the confirm dialog is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlcRecoveryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /reassign lead/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(mockAdminReassignLead).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows "no eligible members" when the lead is the only member', () => {
    setPlcs([
      {
        ...ORG_PLC,
        memberUids: ['lead-1'],
        members: { 'lead-1': makeMember('lead-1', 'lead', 'Lee Lead') },
      },
    ]);
    render(<PlcRecoveryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /reassign lead/i }));
    expect(
      screen.getByText(/no other active members to promote/i)
    ).toBeInTheDocument();
  });
});

describe('PlcRecoveryPanel - dissolve', () => {
  it('dissolves after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PlcRecoveryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /dissolve plc/i }));

    await waitFor(() => expect(mockDeletePlc).toHaveBeenCalledWith('plc-org'));
    confirmSpy.mockRestore();
  });

  it('does NOT dissolve when the confirm dialog is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlcRecoveryPanel />);

    fireEvent.click(screen.getByRole('button', { name: /dissolve plc/i }));

    expect(mockDeletePlc).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('PlcRecoveryPanel - members', () => {
  it('opens the member editor and adds a teacher through the admin mutator', async () => {
    mockAdminSetMember.mockResolvedValue(undefined);
    render(<PlcRecoveryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^members$/i }));
    expect(screen.getByTestId('admin-members-editor')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Teacher to add'), {
      target: { value: 'new@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockAdminSetMember).toHaveBeenCalledWith(
        'plc-org',
        { uid: 'new-9', email: 'new@x.com', displayName: 'Nia New' },
        'member'
      )
    );
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('Nia New'),
      'success'
    );
  });

  it('removes a member after confirmation', async () => {
    mockAdminRemoveMember.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PlcRecoveryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^members$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mary Member' }));
    await waitFor(() =>
      expect(mockAdminRemoveMember).toHaveBeenCalledWith('plc-org', 'm-2')
    );
    confirmSpy.mockRestore();
  });
});
