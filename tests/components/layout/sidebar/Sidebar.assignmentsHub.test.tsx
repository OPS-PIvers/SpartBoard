import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar/Sidebar';
import type { Dashboard } from '@/types';

vi.mock('@/components/layout/sidebar/SidebarClasses', () => ({
  SidebarClasses: () => <div data-testid="sidebar-classes-stub" />,
}));

vi.mock('@/components/assignmentsHub/AssignmentsHubModal', () => ({
  AssignmentsHubModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="assignments-hub-modal">
      <button onClick={onClose}>close hub</button>
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

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@example.com' },
    signOut: vi.fn(),
    isAdmin: false,
    appSettings: {},
    isExternalUser: false,
    selectedBuildings: [],
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

describe('Sidebar Assignments entry', () => {
  it('shows an Assignments entry with no badge/count and opens the hub modal', async () => {
    render(<Sidebar />);

    const openMenuButton = await screen.findByRole('button', {
      name: 'Open Menu',
    });
    await userEvent.click(openMenuButton);

    const assignmentsButton = await screen.findByRole('button', {
      name: 'Assignments',
    });
    // Decision-8-consistent: no ambient signal on this entry (no badge/count).
    expect(within(assignmentsButton).queryByText(/^\d+$/)).toBeNull();

    expect(screen.queryByTestId('assignments-hub-modal')).toBeNull();
    await userEvent.click(assignmentsButton);
    expect(
      await screen.findByTestId('assignments-hub-modal')
    ).toBeInTheDocument();
  });
});
