import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar/Sidebar';
import type { Dashboard } from '@/types';

// Counts AdminSettings module evaluations — 0 before render proves it's lazy, not static.
const adminSettingsEval = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/components/admin/AdminSettings', () => {
  adminSettingsEval.count += 1;
  return {
    AdminSettings: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="admin-settings-panel">
        <button onClick={onClose}>close admin settings</button>
      </div>
    ),
  };
});

const emptyDashboard: Dashboard = {
  id: 'd1',
  name: 'Board 1',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 0,
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'admin-1', email: 'admin@example.com' },
    signOut: vi.fn(),
    isAdmin: true,
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

describe('Sidebar admin settings code-splitting', () => {
  it('does not evaluate the AdminSettings module until an admin opens the panel', async () => {
    // Regression guard: AdminSettings used to be statically imported, shipping ~1.2MB to every teacher.
    expect(adminSettingsEval.count).toBe(0);

    render(<Sidebar />);

    const adminButton = await screen.findByRole('button', {
      name: 'Admin Settings',
    });
    expect(adminSettingsEval.count).toBe(0);

    await userEvent.click(adminButton);

    expect(
      await screen.findByTestId('admin-settings-panel')
    ).toBeInTheDocument();
    expect(adminSettingsEval.count).toBe(1);
  });
});
