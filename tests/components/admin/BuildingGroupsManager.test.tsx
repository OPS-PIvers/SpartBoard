import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BuildingGroupsManager } from '@/components/admin/PlcResourcesManager/BuildingGroupsManager';

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

const mockSetMember = vi.fn();
const mockRemoveMember = vi.fn();
const mockDeletePlc = vi.fn();
const mockSync = vi.fn();
const mockAddToast = vi.fn();

const member = (uid: string, role: string) => ({
  uid,
  email: `${uid}@x.com`,
  displayName: uid,
  role,
  joinedAt: 1,
  status: 'active',
});

const GROUP = {
  id: 'g1',
  name: 'OHS ILT',
  orgId: 'org-1',
  buildingId: 'high',
  groupType: 'building',
  autoRoster: false,
  leadUid: 'lead',
  memberUids: ['lead', 't1'],
  members: { lead: member('lead', 'lead'), t1: member('t1', 'viewer') },
};

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ orgId: 'org-1' }) }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));
vi.mock('@/hooks/useOrgBuildings', () => ({
  useOrgBuildings: () => ({ buildings: [{ id: 'high', name: 'High School' }] }),
}));
vi.mock('@/hooks/useOrgMembers', () => ({
  useOrgMembers: () => ({ members: [], loading: false }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [GROUP],
    loading: false,
    adminSetMember: mockSetMember,
    adminRemoveMember: mockRemoveMember,
    deletePlc: mockDeletePlc,
  }),
}));
vi.mock('@/hooks/useBuildingGroups', () => ({
  callCreateBuildingGroup: vi.fn(),
  callSyncBuildingGroup: (req: unknown): unknown => mockSync(req),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSync.mockResolvedValue({ added: 0, autoRoster: false });
  mockDeletePlc.mockResolvedValue(undefined);
  mockRemoveMember.mockResolvedValue(undefined);
});

describe('BuildingGroupsManager row actions', () => {
  it('deletes a group after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BuildingGroupsManager />);
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(mockDeletePlc).toHaveBeenCalledWith('g1'));
  });

  it('does not delete when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BuildingGroupsManager />);
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(mockDeletePlc).not.toHaveBeenCalled();
  });

  it('renames through the building-group callable', async () => {
    render(<BuildingGroupsManager />);
    fireEvent.click(screen.getByRole('button', { name: /Rename/ }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'OHS Staff' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(mockSync).toHaveBeenCalledWith({ plcId: 'g1', name: 'OHS Staff' })
    );
  });

  it('opens the member editor and removes a member', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BuildingGroupsManager />);
    fireEvent.click(screen.getByRole('button', { name: /Members/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove t1' }));
    await waitFor(() =>
      expect(mockRemoveMember).toHaveBeenCalledWith('g1', 't1')
    );
  });
});
