import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OrgRecord } from '@/components/admin/Organization/types';
import type { RolloutSwitch } from '@/config/rolloutSwitches';
import { OverviewView } from './OverviewView';

const state = {
  isAdmin: true as boolean | null,
  featureOn: true,
  switchOn: true as boolean | null,
};
const switchArgs: (RolloutSwitch | undefined)[] = [];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: state.isAdmin,
    canAccessFeature: (id: string) =>
      id === 'claude-connector' && state.featureOn,
  }),
}));

vi.mock('@/components/admin/access/useRolloutSwitch', () => ({
  useRolloutSwitch: (sw: RolloutSwitch | undefined) => {
    switchArgs.push(sw);
    return {
      enabled: sw ? state.switchOn : null,
      saving: false,
      error: null,
      change: vi.fn(),
    };
  },
}));

const ORG = {
  id: 'orono',
  name: 'Orono',
  shortName: 'Orono',
  shortCode: 'OPS',
  state: 'MN',
  primaryAdminEmail: 'admin@orono.k12.mn.us',
  plan: 'full',
  aiEnabled: true,
} as unknown as OrgRecord;

const renderView = (isSuperAdmin: boolean) =>
  render(
    <OverviewView
      org={ORG}
      isSuperAdmin={isSuperAdmin}
      actorRole={isSuperAdmin ? 'super_admin' : 'domain_admin'}
      onUpdate={vi.fn()}
      onArchive={vi.fn()}
    />
  );

const card = () => screen.queryByText('Claude sign-in');

describe('OverviewView Claude sign-in card', () => {
  beforeEach(() => {
    state.isAdmin = true;
    state.featureOn = true;
    state.switchOn = true;
    switchArgs.length = 0;
  });

  it('shows the card to a super admin when the switch and feature are on', () => {
    renderView(true);
    expect(card()).toBeInTheDocument();
  });

  it('hides the card and skips the switch read for a domain admin', () => {
    renderView(false);
    expect(card()).not.toBeInTheDocument();
    expect(switchArgs.every((sw) => sw === undefined)).toBe(true);
  });

  it('hides the card when the rollout switch is off', () => {
    state.switchOn = false;
    renderView(true);
    expect(card()).not.toBeInTheDocument();
  });

  it('hides the card without the claude-connector feature or admin status', () => {
    state.featureOn = false;
    const { unmount } = renderView(true);
    expect(card()).not.toBeInTheDocument();
    unmount();
    state.featureOn = true;
    state.isAdmin = false;
    renderView(true);
    expect(card()).not.toBeInTheDocument();
  });
});
