import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { CalendarGlobalConfig, FeaturePermission } from '@/types';

// Regression guard for Finding 2: the hourly interval effect must be set up
// exactly ONCE and must NOT be torn down / recreated when `ensureGoogleScope`'s
// identity changes (it's a useCallback whose deps include the Google token, so
// it churns on every ~50-min proactive token refresh). Listing it as a
// dependency reset the 1-hour timer before it ever fired, so the central
// calendar sync never ran. The fix reads it through a ref instead.

const ensureGoogleScopeMock = vi.fn(() => Promise.resolve('tok-initial'));

// A mutable auth value so we can change `ensureGoogleScope`'s identity between
// renders (simulating a token refresh) and assert the interval is stable.
const authValue: {
  isAdmin: boolean;
  featurePermissions: FeaturePermission[];
  ensureGoogleScope: (scope: string) => Promise<string | null>;
} = {
  isAdmin: true,
  featurePermissions: [],
  ensureGoogleScope: ensureGoogleScopeMock,
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => authValue,
}));

// Return a STABLE array reference so a re-render doesn't churn the interval
// effect via its `BUILDINGS` dependency (that would be a test artifact, not the
// behavior under test).
const STABLE_BUILDINGS = [{ id: 'b1', name: 'Building One' }];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => STABLE_BUILDINGS,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/googleCalendarService', () => ({
  GoogleCalendarService: class {
    getEvents = vi.fn().mockResolvedValue([]);
  },
}));

import { AdminCalendarFetcher } from '@/components/admin/AdminCalendarFetcher';

const calendarConfig: CalendarGlobalConfig = {
  blockedDates: [],
  updateFrequencyHours: 4,
  buildingDefaults: {
    // No calendar IDs configured, so a sync cycle does no Firestore writes —
    // we only care that the interval is created and stable here.
    b1: { buildingId: 'b1', events: [], googleCalendarIds: [] },
  },
};

const calendarPermission: FeaturePermission = {
  widgetType: 'calendar',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: calendarConfig as unknown as FeaturePermission['config'],
};

beforeEach(() => {
  vi.useFakeTimers();
  ensureGoogleScopeMock.mockClear();
  ensureGoogleScopeMock.mockImplementation(() =>
    Promise.resolve('tok-initial')
  );
  authValue.isAdmin = true;
  authValue.featurePermissions = [calendarPermission];
  authValue.ensureGoogleScope = ensureGoogleScopeMock;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AdminCalendarFetcher — stable hourly interval', () => {
  it('does NOT tear down the interval when ensureGoogleScope identity changes (token value stable)', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { rerender } = render(<AdminCalendarFetcher />);

    // Let the silent probe effect resolve the calendar token so the interval
    // effect runs and an interval is registered.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Baseline cleanups so far (StrictMode mount/unmount double-invoke etc.).
    const clearsAfterMount = clearIntervalSpy.mock.calls.length;

    // Simulate a token refresh: ensureGoogleScope gets a NEW IDENTITY but the
    // SAME token VALUE, so `calendarToken` (the interval effect's real dep) is
    // unchanged. Before the fix, ensureGoogleScope was in the interval effect's
    // dep array, so this identity churn alone tore the interval down + recreated
    // it (clearInterval), resetting the 1-hour timer. After the fix it's read
    // through a ref and is NOT a dependency, so no teardown happens.
    const refreshedSameToken = vi.fn(() => Promise.resolve('tok-initial'));
    authValue.ensureGoogleScope = refreshedSameToken;
    rerender(<AdminCalendarFetcher />);
    await act(async () => {
      await Promise.resolve();
    });

    // No additional clearInterval from the identity change → interval is stable.
    expect(clearIntervalSpy.mock.calls.length).toBe(clearsAfterMount);

    clearIntervalSpy.mockRestore();
  });

  it('uses the freshest ensureGoogleScope (via ref) when the interval fires', async () => {
    const { rerender } = render(<AdminCalendarFetcher />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Swap in a refreshed callback identity (same token value so the interval
    // effect itself does not re-run), mimicking a token refresh. A re-render is
    // required so the render-body ref assignment picks up the new identity —
    // in production AuthContext re-renders consumers when the token changes.
    const refreshed = vi.fn(() => Promise.resolve('tok-initial'));
    authValue.ensureGoogleScope = refreshed;
    rerender(<AdminCalendarFetcher />);
    await act(async () => {
      await Promise.resolve();
    });

    // Advance one hour to fire the interval's fetchAll.
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();
    });

    // The fresh callback must have been invoked by the interval cycle, proving
    // the ref delivers the latest ensureGoogleScope rather than a stale closure.
    expect(refreshed).toHaveBeenCalledWith('calendar.readonly');
  });
});
