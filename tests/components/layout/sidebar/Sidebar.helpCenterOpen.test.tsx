import React from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar/Sidebar';
import type { Dashboard } from '@/types';
import type { AdminSettingsTabRequest } from '@/components/admin/AdminSettings';
import { requestOpenHelpCenter } from '@/components/tours/tourState';
import {
  readHelpCenterSelection,
  writeHelpCenterSelection,
} from '@/components/admin/HelpCenter/helpCenterSelection';

const auth = vi.hoisted(() => ({
  isAdmin: true,
  roleId: undefined as string | undefined,
  orgId: undefined as string | undefined,
}));

vi.mock('@/components/admin/AdminSettings', () => ({
  AdminSettings: ({
    onClose,
    tabRequest,
  }: {
    onClose: () => void;
    tabRequest?: AdminSettingsTabRequest;
  }) => (
    <div data-testid="admin-settings-panel" data-tab={tabRequest?.tab ?? ''}>
      <button onClick={onClose}>close admin settings</button>
    </div>
  ),
}));

const emptyDashboard: Dashboard = {
  id: 'd1',
  name: 'Board 1',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 0,
};

vi.mock('@/hooks/useFirstRun', () => ({
  useFirstRun: () => ({ quiet: false, welcomePending: false, firstRun: false }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'admin-1', email: 'admin@example.com' },
    signOut: vi.fn(),
    isAdmin: auth.isAdmin,
    roleId: auth.roleId,
    orgId: auth.orgId,
    appSettings: {},
    isExternalUser: false,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    dashboards: [emptyDashboard],
    activeDashboard: emptyDashboard,
    isSaving: false,
    clearAllWidgets: vi.fn(),
    rosters: [],
    annotationActive: false,
    openAnnotation: vi.fn(),
    closeAnnotation: vi.fn(),
    isActiveBoardReadOnly: false,
  }),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ isConnected: false }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    loading: false,
    createPlc: vi.fn(),
    leavePlc: vi.fn(),
    deletePlc: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlcInvitations', () => ({
  usePlcInvitations: () => ({
    pendingInvites: [],
    sentInvites: [],
    loading: false,
    inviteCount: 0,
    sendInvite: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    revokeInvite: vi.fn(),
  }),
}));

vi.mock('@/hooks/useChangelog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useChangelog')>();
  return {
    ...actual,
    useChangelog: () => ({
      entries: [],
      loading: false,
      error: null,
      latestVersion: null,
      entriesSinceCurrent: [],
    }),
  };
});

vi.mock('@/hooks/useAppVersion', () => ({
  useAppVersion: () => ({ updateAvailable: false, reloadApp: vi.fn() }),
}));

beforeEach(() => {
  auth.isAdmin = true;
  auth.roleId = undefined;
  auth.orgId = undefined;
  writeHelpCenterSelection(null);
});

describe('Sidebar opens the Help Center on request (H2, H13)', () => {
  it('opens Admin Settings on the Help Center tab with the item selected', async () => {
    render(<Sidebar />);
    act(() => requestOpenHelpCenter({ selectId: 'item-7' }));
    const panel = await screen.findByTestId('admin-settings-panel');
    expect(panel).toHaveAttribute('data-tab', 'help-center');
    expect(readHelpCenterSelection()).toBe('item-7');
  });

  it('keeps the stored selection when no item is named, and the next manual open uses the last tab', async () => {
    writeHelpCenterSelection('item-1');
    render(<Sidebar />);
    act(() => requestOpenHelpCenter());
    await screen.findByTestId('admin-settings-panel');
    expect(readHelpCenterSelection()).toBe('item-1');
    await userEvent.click(screen.getByText('close admin settings'));
    expect(screen.queryByTestId('admin-settings-panel')).toBeNull();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Admin Settings' })
    );
    expect(await screen.findByTestId('admin-settings-panel')).toHaveAttribute(
      'data-tab',
      ''
    );
  });

  it('ignores the request for an admin who has no Help Center tab', async () => {
    auth.isAdmin = false;
    auth.roleId = 'building_admin';
    auth.orgId = 'org-1';
    render(<Sidebar />);
    act(() => requestOpenHelpCenter({ selectId: 'item-7' }));
    await Promise.resolve();
    expect(screen.queryByTestId('admin-settings-panel')).toBeNull();
    expect(readHelpCenterSelection()).toBeNull();
  });
});
