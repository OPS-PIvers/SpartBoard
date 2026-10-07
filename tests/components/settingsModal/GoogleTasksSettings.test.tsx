import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const callables: Record<string, ReturnType<typeof vi.fn>> = {
  getGoogleTasksSyncStatusV1: vi.fn(),
  setGoogleTasksSyncV1: vi.fn(),
};
const exchange = vi.fn();

vi.mock('@/config/firebase', () => ({ functions: {}, isAuthBypass: false }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => callables[name],
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'u1@x.org' } }),
}));
vi.mock('@/utils/googleOAuthRefresh', () => ({
  requestAndExchangeAuthCode: (...args: unknown[]): unknown =>
    exchange(...args),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import {
  GoogleTasksSettings,
  GOOGLE_TASKS_SCOPE,
} from '@/components/settingsModal/sections/GoogleTasksSettings';

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client');
  callables.getGoogleTasksSyncStatusV1.mockReset();
  callables.setGoogleTasksSyncV1.mockReset();
  exchange.mockReset();
});

describe('GoogleTasksSettings', () => {
  it('turning it on asks Google for Tasks, then connects', async () => {
    callables.getGoogleTasksSyncStatusV1.mockResolvedValue({
      data: { enabled: false, disconnectReason: null, syncedCount: 0 },
    });
    exchange.mockResolvedValue({ kind: 'success', result: {} });
    callables.setGoogleTasksSyncV1.mockResolvedValue({
      data: { enabled: true, syncedCount: 3 },
    });
    render(<GoogleTasksSettings />);
    fireEvent.click(await screen.findByRole('switch'));
    await screen.findByText('Connected · 3 items synced');
    expect(exchange).toHaveBeenCalledWith('client', 'u1@x.org', [
      GOOGLE_TASKS_SCOPE,
    ]);
    expect(callables.setGoogleTasksSyncV1).toHaveBeenCalledWith({
      enabled: true,
    });
  });

  it('a cancelled consent popup leaves it off without an error', async () => {
    callables.getGoogleTasksSyncStatusV1.mockResolvedValue({
      data: { enabled: false, disconnectReason: null, syncedCount: 0 },
    });
    exchange.mockResolvedValue({ kind: 'cancelled' });
    render(<GoogleTasksSettings />);
    fireEvent.click(await screen.findByRole('switch'));
    await waitFor(() => expect(exchange).toHaveBeenCalled());
    expect(callables.setGoogleTasksSyncV1).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('turning it off skips the consent popup', async () => {
    callables.getGoogleTasksSyncStatusV1.mockResolvedValue({
      data: { enabled: true, disconnectReason: null, syncedCount: 2 },
    });
    callables.setGoogleTasksSyncV1.mockResolvedValue({
      data: { enabled: false, syncedCount: 0 },
    });
    render(<GoogleTasksSettings />);
    fireEvent.click(await screen.findByRole('switch'));
    await waitFor(() =>
      expect(callables.setGoogleTasksSyncV1).toHaveBeenCalledWith({
        enabled: false,
      })
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it('shows Reconnect when the grant was lost', async () => {
    callables.getGoogleTasksSyncStatusV1.mockResolvedValue({
      data: {
        enabled: false,
        disconnectReason: 'needs-consent',
        syncedCount: 0,
      },
    });
    render(<GoogleTasksSettings />);
    expect(
      await screen.findByText('Google Tasks stopped syncing.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
  });

  it('shows an error when connecting fails', async () => {
    callables.getGoogleTasksSyncStatusV1.mockResolvedValue({
      data: { enabled: false, disconnectReason: null, syncedCount: 0 },
    });
    exchange.mockResolvedValue({ kind: 'error', reason: 'access_denied' });
    render(<GoogleTasksSettings />);
    fireEvent.click(await screen.findByRole('switch'));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't connect to Google Tasks. Try again."
    );
  });
});
