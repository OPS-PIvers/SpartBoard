import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Regression: a slow claim for the previous user must not overwrite the new user's status.
const mockClaim = vi.fn();
let mockUser: { uid: string; email: string } | null = null;

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mockClaim }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false, signOut: vi.fn() }),
}));

import { InviteAcceptance } from '@/components/auth/InviteAcceptance';

describe('InviteAcceptance ignores a stale claim result', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockClaim.mockReset();
    mockUser = { uid: 'a', email: 'a@example.com' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...window.location,
        pathname: '/invite/tok',
        search: '?org=orono',
      },
    });
  });

  it('does not show the old user error after the new user claim is pending', async () => {
    let rejectA: (e: unknown) => void = () => undefined;
    mockClaim.mockImplementationOnce(
      () => new Promise((_, rej) => (rejectA = rej))
    );
    mockClaim.mockImplementationOnce(() => new Promise(() => undefined));

    const { rerender } = render(<InviteAcceptance />);
    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(1));

    mockUser = { uid: 'b', email: 'b@example.com' };
    rerender(<InviteAcceptance />);
    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(2));

    await act(async () => {
      rejectA(
        Object.assign(new Error('x'), { code: 'functions/permission-denied' })
      );
      await Promise.resolve();
    });

    expect(screen.queryByText(/Wrong account/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Accepting your invitation/i)).toBeInTheDocument();
  });
});
