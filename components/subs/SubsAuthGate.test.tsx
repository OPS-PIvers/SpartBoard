import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubsAuthGate } from './SubsAuthGate';

const auth = vi.hoisted(() => ({
  user: { uid: 'sub-uid', email: 'sub@orono.k12.mn.us' },
  loading: false,
  roleResolved: true,
  globalPermissionsLoaded: true,
  canAccessFeature: vi.fn(() => true),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/context/useAuth', () => ({ useAuth: () => auth }));

describe('SubsAuthGate substitute-sharing switch', () => {
  beforeEach(() => {
    auth.globalPermissionsLoaded = true;
    auth.canAccessFeature.mockReturnValue(true);
  });

  it('renders the portal when substitute sharing is on', () => {
    render(<SubsAuthGate>portal</SubsAuthGate>);
    expect(screen.getByText('portal')).toBeTruthy();
    expect(auth.canAccessFeature).toHaveBeenCalledWith('substitute-sharing');
  });

  it('shows the closed screen when substitute sharing is off', () => {
    auth.canAccessFeature.mockReturnValue(false);
    render(<SubsAuthGate>portal</SubsAuthGate>);
    expect(screen.queryByText('portal')).toBeNull();
    expect(screen.getByText('The Substitute Portal is off')).toBeTruthy();
  });

  it('waits for permissions before deciding', () => {
    auth.globalPermissionsLoaded = false;
    auth.canAccessFeature.mockReturnValue(false);
    render(<SubsAuthGate>portal</SubsAuthGate>);
    expect(screen.queryByText('portal')).toBeNull();
    expect(screen.queryByText('The Substitute Portal is off')).toBeNull();
  });
});
