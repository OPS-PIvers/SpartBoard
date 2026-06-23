import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// Regression guard for Finding 6: the "Sync All Now" button must be disabled
// until the silent connection probe resolves to a REAL connection (true).
// While the probe is pending (null, ~200ms on open) or has resolved to "not
// connected" (false), clicking would fire an interactive ensureGoogleScope and
// pop an unexpected OAuth dialog, so the button stays disabled. The separate
// "Reconnect Google" affordance (gated on === false) handles consent.

// `ensureGoogleScope` is driven by a deferred promise so the test controls
// exactly when the probe resolves (and to what).
let resolveProbe: (token: string | null) => void = () => undefined;
const ensureGoogleScopeMock = vi.fn(
  () =>
    new Promise<string | null>((resolve) => {
      resolveProbe = resolve;
    })
);

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: ensureGoogleScopeMock }),
}));

const STABLE_BUILDINGS = [{ id: 'b1', name: 'Building One' }];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => STABLE_BUILDINGS,
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/googleCalendarService', () => ({
  GoogleCalendarService: class {
    getEvents = vi.fn().mockResolvedValue([]);
  },
}));

import { CalendarConfigurationModal } from '@/components/admin/CalendarConfigurationModal';

function getSyncButton(): HTMLButtonElement {
  return screen
    .getByText(/Sync All Now/i)
    .closest('button') as HTMLButtonElement;
}

beforeEach(() => {
  ensureGoogleScopeMock.mockClear();
  resolveProbe = () => undefined;
});

describe('CalendarConfigurationModal — Sync All Now gating', () => {
  it('is disabled while the connection probe is pending (null)', async () => {
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    // Let the initial config fetch settle so the proxy section renders, but do
    // NOT resolve the probe — isCalendarConnected stays null.
    await waitFor(() => expect(getSyncButton()).toBeInTheDocument());
    expect(getSyncButton()).toBeDisabled();
  });

  it('stays disabled when the probe resolves to NOT connected (false)', async () => {
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    await waitFor(() => expect(getSyncButton()).toBeInTheDocument());

    await act(async () => {
      resolveProbe(null); // silent miss → not connected
      await Promise.resolve();
    });

    expect(getSyncButton()).toBeDisabled();
    // The Reconnect affordance must appear for the disconnected case.
    expect(screen.getByText(/Reconnect Google/i)).toBeInTheDocument();
  });

  it('is enabled once the probe resolves to a real connection (true)', async () => {
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    await waitFor(() => expect(getSyncButton()).toBeInTheDocument());

    await act(async () => {
      resolveProbe('tok'); // connected
      await Promise.resolve();
    });

    await waitFor(() => expect(getSyncButton()).toBeEnabled());
    // No Reconnect affordance when connected.
    expect(screen.queryByText(/Reconnect Google/i)).not.toBeInTheDocument();
  });
});
