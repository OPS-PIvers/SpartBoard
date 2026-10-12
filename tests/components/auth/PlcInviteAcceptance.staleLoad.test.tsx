import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Regression: a slow invite read for a previous user overwrote the new user's state.

type Snap = {
  exists: () => boolean;
  id: string;
  data: () => Record<string, unknown>;
};
const resolvers: Array<(s: Snap) => void> = [];
const mockGetDoc = vi.fn(
  () => new Promise<Snap>((resolve) => resolvers.push(resolve))
);
let mockUser: { uid: string; email: string } | null = null;

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () => mockGetDoc(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false, signOut: vi.fn() }),
}));
vi.mock('@/hooks/usePlcInvitations', () => ({
  usePlcInvitations: () => ({
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
  }),
}));

import { PlcInviteAcceptance } from '@/components/auth/PlcInviteAcceptance';

const snapFor = (email: string): Snap => ({
  exists: () => true,
  id: 'inv1',
  data: () => ({
    inviteeEmailLower: email,
    status: 'pending',
    plcId: 'p1',
    plcName: 'Math PLC',
  }),
});

describe('PlcInviteAcceptance ignores a stale invite read after a user change', () => {
  beforeEach(() => {
    resolvers.length = 0;
    mockGetDoc.mockClear();
    mockUser = { uid: 'a', email: 'a@example.com' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, pathname: '/plc-invite/inv1' },
    });
  });

  it('keeps the new account state when the old account read resolves last', async () => {
    const { rerender } = render(<PlcInviteAcceptance />);
    await waitFor(() => expect(mockGetDoc).toHaveBeenCalledTimes(1));

    mockUser = { uid: 'b', email: 'b@example.com' };
    rerender(<PlcInviteAcceptance />);
    await waitFor(() => expect(mockGetDoc).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolvers[1](snapFor('b@example.com'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByText(/Math PLC/)).toBeInTheDocument()
    );

    await act(async () => {
      resolvers[0](snapFor('zzz@example.com'));
      await Promise.resolve();
    });
    expect(screen.getByText(/Math PLC/)).toBeInTheDocument();
  });
});
