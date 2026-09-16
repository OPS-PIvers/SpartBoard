import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DriveOfflineGrantCard } from './DriveOfflineGrantCard';

const captureOfflineGrant = vi.fn();
let authValue: Record<string, unknown>;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => authValue,
}));

const DISMISS_KEY = 'spart_offline_grant_dismissed_until';

beforeEach(() => {
  localStorage.clear();
  captureOfflineGrant.mockReset().mockResolvedValue(true);
  authValue = {
    user: { uid: 'u1', email: 't@example.com' },
    offlineGrantMissing: true,
    captureOfflineGrant,
  };
});

describe('DriveOfflineGrantCard', () => {
  it('renders when a grant is missing', () => {
    render(<DriveOfflineGrantCard />);
    expect(screen.getByText('Stay connected to Drive')).toBeInTheDocument();
  });

  it('stays hidden when the grant is already stored', () => {
    authValue.offlineGrantMissing = false;
    render(<DriveOfflineGrantCard />);
    expect(screen.queryByText('Stay connected to Drive')).toBeNull();
  });

  it('stays hidden when signed out', () => {
    authValue.user = null;
    render(<DriveOfflineGrantCard />);
    expect(screen.queryByText('Stay connected to Drive')).toBeNull();
  });

  it('captures the grant on Approve', async () => {
    render(<DriveOfflineGrantCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(captureOfflineGrant).toHaveBeenCalledTimes(1);
  });

  // A declined consent must NOT look like success — the teacher would believe
  // they were covered while still having no refresh token.
  it('keeps the card up when capture fails', async () => {
    captureOfflineGrant.mockResolvedValue(false);
    render(<DriveOfflineGrantCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(screen.getByText('Stay connected to Drive')).toBeInTheDocument()
    );
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it('hides for a week after dismissal and persists it', async () => {
    render(<DriveOfflineGrantCard />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification' })
    );
    await waitFor(() =>
      expect(screen.queryByText('Stay connected to Drive')).toBeNull()
    );
    const until = Number(localStorage.getItem(DISMISS_KEY));
    expect(until).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('stays hidden while a stored dismissal is live', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 60_000));
    render(<DriveOfflineGrantCard />);
    expect(screen.queryByText('Stay connected to Drive')).toBeNull();
  });

  it('reappears once a stored dismissal has expired', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() - 60_000));
    render(<DriveOfflineGrantCard />);
    expect(screen.getByText('Stay connected to Drive')).toBeInTheDocument();
  });
});
