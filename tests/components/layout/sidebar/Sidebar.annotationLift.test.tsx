import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar/Sidebar';
import { Z_INDEX } from '@/config/zIndex';
import i18n from '@/i18n';
import type { Dashboard } from '@/types';

const emptyDashboard: Dashboard = {
  id: 'd1',
  name: 'Board 1',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 0,
};

const closeAnnotation = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@example.com' },
    signOut: vi.fn(),
    isAdmin: false,
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
    annotationActive: true,
    openAnnotation: vi.fn(),
    closeAnnotation,
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

describe('Sidebar pill while annotating', () => {
  // Regression: the ink canvas covered the pill, so the pencil toggle — the
  // only way to end annotation from the sidebar — could never be clicked.
  it('REGRESSION: the pencil toggle stays clickable above the ink layer', async () => {
    render(<Sidebar />);

    const pencil = await screen.findByRole('button', {
      name: i18n.t('sidebar.header.stopAnnotating'),
    });
    const pill = pencil.closest('[data-screenshot="exclude"]') as HTMLElement;

    expect(Number(pill.style.zIndex)).toBeGreaterThan(
      Z_INDEX.annotationSurface
    );
    expect(pill.style.pointerEvents).not.toBe('none');
    expect(pencil).toBeEnabled();

    await userEvent.click(pencil);
    expect(closeAnnotation).toHaveBeenCalledTimes(1);
  });
});
