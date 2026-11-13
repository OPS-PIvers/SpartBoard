import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebToursGate } from './WebToursGate';

const auth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  loading: false,
  globalPermissionsLoaded: true,
  isAdmin: null as boolean | null,
  flag: true,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ...auth, canAccessFeature: () => auth.flag }),
}));
vi.mock('@/components/auth/SignInPage', () => ({
  SignInPage: () => <p>Sign in</p>,
}));
vi.mock('./WebToursPage', () => ({
  WebToursPage: () => <p>Web tours page</p>,
}));
vi.mock('./WebTourEditorRosters', () => ({
  WebTourEditorRosters: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('WebToursGate', () => {
  beforeEach(() => {
    Object.assign(auth, {
      user: { uid: 'u1' },
      loading: false,
      globalPermissionsLoaded: true,
      isAdmin: true,
      flag: true,
    });
  });

  it('asks a signed-out visitor to sign in', async () => {
    auth.user = null;
    render(<WebToursGate />);
    expect(await screen.findByText('Sign in')).toBeInTheDocument();
  });

  it('waits while admin status loads', () => {
    auth.isAdmin = null;
    render(<WebToursGate />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('turns away a teacher', () => {
    auth.isAdmin = false;
    render(<WebToursGate />);
    expect(screen.getByText('Web tours are for admins.')).toBeInTheDocument();
  });

  it('tells an admin when Web tours are off', () => {
    auth.flag = false;
    render(<WebToursGate />);
    expect(screen.getByText('Web tours are turned off.')).toBeInTheDocument();
  });

  it('shows the page to an admin', async () => {
    render(<WebToursGate />);
    expect(await screen.findByText('Web tours page')).toBeInTheDocument();
  });
});
