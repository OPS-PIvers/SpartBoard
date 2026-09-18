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
// Mutable so a single test can swap in a legacy-id building list without
// disturbing the stable-reference guarantee the other tests rely on.
let currentBuildings: { id: string; name: string }[] = STABLE_BUILDINGS;
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => currentBuildings,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const setDocMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

const getEventsMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(() =>
  Promise.resolve([])
);
vi.mock('@/utils/googleCalendarService', () => ({
  GoogleCalendarService: class {
    getEvents = (...args: unknown[]) => getEventsMock(...args);
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
  currentBuildings = STABLE_BUILDINGS;
  setDocMock.mockClear();
  getEventsMock.mockClear();
  getEventsMock.mockResolvedValue([]);
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

describe('AdminCalendarFetcher — legacy building id canonicalization', () => {
  it('reads and writes buildingDefaults under the canonical building id, not a legacy raw id', async () => {
    // useAdminBuildings() can hand back a legacy long-form id for an
    // org whose building doc predates the short-id migration.
    currentBuildings = [
      { id: 'schumann-elementary', name: 'Schumann Elementary' },
    ];

    const legacyConfig: CalendarGlobalConfig = {
      blockedDates: [],
      updateFrequencyHours: 4,
      buildingDefaults: {
        // Saved canonically ('schumann'), keyed off the id BEFORE the org's
        // building doc resolved to the legacy long-form id.
        schumann: {
          buildingId: 'schumann',
          events: [],
          googleCalendarIds: ['cal-1'],
        },
      },
    };
    authValue.featurePermissions = [
      {
        ...calendarPermission,
        config: legacyConfig as unknown as FeaturePermission['config'],
      },
    ];

    render(<AdminCalendarFetcher />);

    // Let the silent token probe resolve, then let the initial fetchAll()
    // (which awaits ensureGoogleScope + getEvents) settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // If the lookup missed (raw-id bug), googleCalendarIds would read as
    // empty under the raw 'schumann-elementary' key and getEvents/setDoc
    // would never fire.
    expect(getEventsMock).toHaveBeenCalledWith(
      'cal-1',
      expect.any(String),
      expect.any(String)
    );
    expect(setDocMock).toHaveBeenCalled();
    const [, payload] = setDocMock.mock.calls[0] as [
      unknown,
      { config: CalendarGlobalConfig },
    ];
    expect(payload.config.buildingDefaults?.schumann?.cachedEvents).toEqual([]);
    expect(
      payload.config.buildingDefaults?.['schumann-elementary']
    ).toBeUndefined();
  });
});
