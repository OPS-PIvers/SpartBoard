import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';

// Regression guard: "Add Date"/"Add Event" must use the admin's LOCAL today, not
// toISOString()'s UTC date (mirrors Calendar/Widget.test.tsx's "UTC+12 midnight" case).
// TZ is pinned to UTC (tests/setTz.ts), so we spy on the local-time Date.prototype
// getters to simulate an admin whose local date is a day ahead of the UTC date.

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn().mockResolvedValue(null) }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

const STABLE_BUILDINGS = [{ id: 'b1', name: 'Building One' }];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => STABLE_BUILDINGS,
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

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

async function waitForLoaded(): Promise<void> {
  await waitFor(() => expect(screen.getByText('Add Date')).toBeInTheDocument());
}

describe('CalendarConfigurationModal — blocked-date timezone', () => {
  beforeEach(() => {
    // shouldAdvanceTime keeps real timer progression (needed for the async
    // fetchConfig/ensureGoogleScope effects + testing-library's waitFor)
    // while still letting setSystemTime pin "now" for the getters below.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('"Add Date" uses the local date, not the UTC date', async () => {
    // UTC+12 admin at local midnight 2026-06-15 (= 2026-06-14T12:00:00Z).
    // Old code: toISOString() → "2026-06-14T12:00:00.000Z" → adds "2026-06-14".
    // Fixed code: local getters → "2026-06-15" → adds "2026-06-15".
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(5); // June (0-indexed)
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(15); // local day, UTC+12

    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    await waitForLoaded();

    act(() => {
      fireEvent.click(screen.getByText('Add Date'));
    });

    const dateInput =
      document.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput).toBeTruthy();
    // With the bug this would be "2026-06-14" (UTC date, one day behind).
    expect(dateInput?.value).toBe('2026-06-15');
  });

  it('"Add Event" default-dates a new building event to the local date', async () => {
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(5);
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(15);

    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    await waitForLoaded();

    act(() => {
      fireEvent.click(screen.getByText('Add Event'));
    });

    const dateInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="date"]')
    );
    // The new default event's date input — with the bug it would read
    // "2026-06-14" (UTC date) instead of the admin's local "2026-06-15".
    expect(dateInputs.some((el) => el.value === '2026-06-15')).toBe(true);
    expect(dateInputs.some((el) => el.value === '2026-06-14')).toBe(false);
  });
});
