import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Regression guard: useAdminBuildings() can hand back a legacy long-form
// building doc id (e.g. `schumann-elementary`) for an org whose building
// record predates the short-id migration — see config/buildings.ts's
// BUILDING_ID_ALIASES. buildingDefaults must be looked up (and saved back)
// under the canonical id, not the raw one.

const ensureGoogleScopeMock = vi.fn(() => Promise.resolve(null));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: ensureGoogleScopeMock }),
}));

const mockAddToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'schumann-elementary', name: 'Schumann Elementary' },
  ],
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const setDocMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({
      type: 'calendar',
      config: {
        blockedDates: [],
        updateFrequencyHours: 4,
        buildingDefaults: {
          // Saved canonically ('schumann') from before this org's building
          // doc resolved to the legacy long-form id.
          schumann: {
            buildingId: 'schumann',
            events: [{ date: '2026-01-01', title: 'Saved Event' }],
            googleCalendarIds: [],
          },
        },
      },
    }),
  }),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

vi.mock('@/utils/googleCalendarService', () => ({
  GoogleCalendarService: class {
    getEvents = vi.fn().mockResolvedValue([]);
  },
}));

import { CalendarConfigurationModal } from '@/components/admin/CalendarConfigurationModal';

beforeEach(() => {
  setDocMock.mockClear();
  mockAddToast.mockClear();
});

describe('CalendarConfigurationModal — legacy building id canonicalization', () => {
  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', async () => {
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);

    // If the lookup missed (raw-id bug), the saved event would never render
    // and the "No default events" empty state would show instead.
    await waitFor(() =>
      expect(screen.getByDisplayValue('Saved Event')).toBeInTheDocument()
    );
  });

  it('saves building defaults under the canonical building id, not the legacy raw id', async () => {
    render(<CalendarConfigurationModal isOpen onClose={() => undefined} />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Saved Event')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('Add Event'));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, payload] = setDocMock.mock.calls[0] as [
      unknown,
      {
        config: {
          buildingDefaults: Record<string, { events: unknown[] }>;
        };
      },
    ];
    expect(payload.config.buildingDefaults.schumann?.events).toHaveLength(2);
    expect(
      payload.config.buildingDefaults['schumann-elementary']
    ).toBeUndefined();
  });
});
