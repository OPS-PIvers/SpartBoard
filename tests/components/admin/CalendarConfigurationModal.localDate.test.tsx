import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Regression guard: "Add Date" (district blocked dates) and "Add Event"
// (building default events) must stamp the ADMIN'S LOCAL calendar day, not
// the UTC day. `new Date().toISOString().split('T')[0]` shifts to UTC and
// rolls to the next day for any evening hour in a negative-UTC-offset
// timezone (e.g. US Central) — the exact bug already fixed on the read side
// in components/widgets/Calendar/Widget.tsx (see its `isBlocked` comment).
// A blocked-date add made this way silently blocks the WRONG day.

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn().mockResolvedValue(null) }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Building One' }],
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

describe('CalendarConfigurationModal — local-date write path', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // US Central (UTC-5 in August, DST). 9:30 PM local on Aug 16 is already
    // 2:30 AM UTC on Aug 17 — the exact evening window where the bug bites.
    process.env.TZ = 'America/Chicago';
    // Mock only the Date value (not timer functions) so testing-library's
    // async polling (findBy*/waitFor), which relies on real setTimeout,
    // keeps working normally.
    vi.setSystemTime(new Date('2026-08-17T02:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it('"Add Date" stamps the admin\'s local today, not the UTC-shifted day', async () => {
    const user = userEvent.setup();
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);

    const addDateButton = await screen.findByText(/Add Date/i);
    await user.click(addDateButton);

    const dateInputs = await screen.findAllByDisplayValue('2026-08-16');
    expect(dateInputs.length).toBeGreaterThan(0);
    // Confirms this is actually exercising the bug window: naive
    // toISOString() would have produced the UTC day instead.
    expect(screen.queryByDisplayValue('2026-08-17')).not.toBeInTheDocument();
  });

  it('"Add Event" defaults a new building event to the admin\'s local today', async () => {
    const user = userEvent.setup();
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);

    const addEventButton = await screen.findByText(/Add Event/i);
    await user.click(addEventButton);

    const dateInputs = await screen.findAllByDisplayValue('2026-08-16');
    expect(dateInputs.length).toBeGreaterThan(0);
  });
});
