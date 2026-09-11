import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlcAdminMembersEditor } from '@/components/admin/PlcResourcesManager/PlcAdminMembersEditor';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import type { Plc } from '@/types';

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

vi.mock('@/hooks/useOrgMembers', () => ({
  useOrgMembers: vi.fn(),
}));

const mockUseOrgMembers = useOrgMembers as unknown as Mock;

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

const PLC = {
  id: 'plc-1',
  name: 'ELA 9',
  orgId: 'org-1',
  leadUid: 'lead-1',
  memberUids: ['lead-1', 'm-2'],
  memberEmails: { 'lead-1': 'lead-1@x.com', 'm-2': 'm-2@x.com' },
  members: {
    'lead-1': makeMember('lead-1', 'lead', 'Lee Lead'),
    'm-2': makeMember('m-2', 'member', 'Mary Member'),
  },
} as unknown as Plc;

const ORG_MEMBERS = [
  { email: 'm-2@x.com', uid: 'm-2', name: 'Mary Member', status: 'active' },
  { email: 'zed@x.com', uid: 'zed-9', name: 'Zed Late', status: 'active' },
  { email: 'ann@x.com', uid: 'ann-3', name: 'Ann Early', status: 'active' },
  { email: 'never@x.com', name: 'Never Signed In', status: 'active' },
  { email: 'gone@x.com', uid: 'gone-4', name: 'Gone', status: 'inactive' },
];

const onSetMember = vi.fn();
const onRemoveMember = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOrgMembers.mockReturnValue({ members: ORG_MEMBERS, loading: false });
});

const renderEditor = () =>
  render(
    <PlcAdminMembersEditor
      plc={PLC}
      orgId="org-1"
      busy={false}
      onSetMember={onSetMember}
      onRemoveMember={onRemoveMember}
    />
  );

describe('PlcAdminMembersEditor', () => {
  it('lists non-lead members and offers only signed-in, non-member org teachers', () => {
    renderEditor();
    expect(mockUseOrgMembers).toHaveBeenCalledWith('org-1');
    expect(screen.getByText('Mary Member')).toBeInTheDocument();
    expect(screen.queryByText('Lee Lead')).toBeNull();

    const picker = screen.getByLabelText<HTMLSelectElement>('Teacher to add');
    const labels = Array.from(picker.options).map((o) => o.textContent);
    expect(labels).toEqual([
      'Choose a teacher…',
      'Ann Early · ann@x.com',
      'Zed Late · zed@x.com',
    ]);
  });

  it('adds the chosen teacher with the chosen role', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Teacher to add'), {
      target: { value: 'zed@x.com' },
    });
    fireEvent.change(
      screen.getByLabelText('Role', { selector: '#add-role-plc-1' }),
      {
        target: { value: 'viewer' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSetMember).toHaveBeenCalledWith(
      { uid: 'zed-9', email: 'zed@x.com', displayName: 'Zed Late' },
      'viewer'
    );
  });

  it('changes a member role and removes a member', () => {
    renderEditor();
    fireEvent.change(
      screen.getByLabelText('Role', { selector: '#role-plc-1-m-2' }),
      {
        target: { value: 'coLead' },
      }
    );
    expect(onSetMember).toHaveBeenCalledWith(
      { uid: 'm-2', email: 'm-2@x.com', displayName: 'Mary Member' },
      'coLead'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mary Member' }));
    expect(onRemoveMember).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'm-2' })
    );
  });
});
