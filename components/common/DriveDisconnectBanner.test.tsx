import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { DriveDisconnectBanner } from './DriveDisconnectBanner';

const authValue: { user: unknown; googleAccessToken: string | null } = {
  user: { uid: 'u1' },
  googleAccessToken: null,
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ...authValue, connectGoogleDrive: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  authValue.googleAccessToken = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DriveDisconnectBanner grace window', () => {
  it('stays hidden while a silent refresh could still land', async () => {
    render(<DriveDisconnectBanner />);
    expect(screen.queryByText('Drive Disconnected')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(screen.queryByText('Drive Disconnected')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText('Drive Disconnected')).toBeTruthy();
  });

  it('resets the grace window when the token comes back', async () => {
    const { rerender } = render(<DriveDisconnectBanner />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    authValue.googleAccessToken = 'tok';
    rerender(<DriveDisconnectBanner />);
    authValue.googleAccessToken = null;
    rerender(<DriveDisconnectBanner />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.queryByText('Drive Disconnected')).toBeNull();
  });
});
