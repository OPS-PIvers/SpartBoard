import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Regression: InviteAcceptance never re-armed its claim after the signed-in
// user changed. A user who hit "Wrong account" (permission-denied), signed
// out via the in-page button, and signed back in with the correct account
// stayed stuck on the stale "Wrong account" card forever — claimRanRef.current
// was already true and status.kind was already 'error', so the claim effect's
// own guards (`if (claimRanRef.current) return;` / `if (status.kind !== 'idle')
// return;`) permanently blocked a retry for the new account. Sibling
// PlcInviteAcceptance.tsx already fixes this with a trackedUid reset; this
// test reproduces the same scenario for InviteAcceptance.

const mockClaim = vi.fn();
let mockUser: { uid: string; email: string } | null = null;

vi.mock('@/config/firebase', () => ({
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockClaim,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    signOut: vi.fn(),
  }),
}));

import { InviteAcceptance } from '@/components/auth/InviteAcceptance';

describe('InviteAcceptance re-arms the claim after a user change', () => {
  beforeEach(() => {
    mockClaim.mockReset();
    mockUser = { uid: 'wrong-uid', email: 'wrong@example.com' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...window.location,
        pathname: '/invite/tok123',
        search: '?org=orono',
      },
    });
  });

  it('retries the claim for a newly signed-in user instead of showing the stale error', async () => {
    mockClaim.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { code: 'functions/permission-denied' })
    );
    mockClaim.mockResolvedValueOnce({ data: { ok: true } });

    const { rerender } = render(<InviteAcceptance />);

    await waitFor(() => {
      expect(screen.getByText(/Wrong account/i)).toBeInTheDocument();
    });
    expect(mockClaim).toHaveBeenCalledTimes(1);

    // User signs out, then back in with the correct account.
    mockUser = { uid: 'right-uid', email: 'right@example.com' };
    rerender(<InviteAcceptance />);

    await waitFor(() => {
      expect(mockClaim).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Wrong account/i)).not.toBeInTheDocument();
    });
  });
});
