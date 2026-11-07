import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockUser = { email: 'admin@example.com', uid: 'admin-uid' };

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    orgId: null,
    roleId: null,
    userRoles: { superAdmins: ['admin@example.com'] },
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {},
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const announcement = {
  id: 'ann1',
  name: 'Duration Announcement',
  widgetType: 'text',
  widgetConfig: {},
  widgetSize: { w: 400, h: 300 },
  maximized: false,
  activationType: 'manual',
  isActive: false,
  activatedAt: null,
  dismissalType: 'duration',
  dismissalDurationSeconds: 60,
  targetBuildings: [],
  targetUsers: [],
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'admin@example.com',
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  query: vi.fn(() => 'query'),
  where: vi.fn(() => 'where'),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: { forEach: (cb: (d: unknown) => void) => void }) => void
    ) => {
      onNext({
        forEach: (cb) => {
          cb({ id: announcement.id, data: () => announcement });
        },
      });
      return vi.fn();
    }
  ),
}));

import { updateDoc } from 'firebase/firestore';
import { AnnouncementsManager } from '@/components/admin/Announcements/Widget';

const updateDocMock = updateDoc as unknown as Mock;

const saveWith = async (value: string) => {
  render(<AnnouncementsManager />);
  fireEvent.click(await screen.findByRole('button', { name: /Edit/i }));
  const input = await waitFor(() => {
    const el = document.querySelector(
      'input[data-tour="admin.announcements.dismissal-duration"]'
    );
    if (!el) throw new Error('no number input');
    return el;
  });
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(updateDocMock).toHaveBeenCalled());
  return (
    updateDocMock.mock.calls[0] as [
      unknown,
      { dismissalDurationSeconds: number },
    ]
  )[1].dismissalDurationSeconds;
};

describe('AnnouncementsManager — dismissal duration cap', () => {
  beforeEach(() => {
    updateDocMock.mockClear();
  });

  it('clamps a typed duration to the one-day maximum shown on the field', async () => {
    expect(await saveWith('9999999')).toBe(86400);
  });
});

import {
  getAnnouncementLiveStatus,
  isWithinActiveWindow,
} from '@/utils/announcementWindow';
import type { Announcement } from '@/types';

describe('announcement status matches the overlay', () => {
  const base = {
    ...announcement,
    activationType: 'scheduled',
    isActive: true,
  } as unknown as Announcement;
  const now = new Date(2026, 10, 7, 12, 0).getTime();
  const cases: [string, Partial<Announcement>][] = [
    ['no start', {}],
    ['date only', { scheduledActivationDate: '2026-11-07' }],
    ['time only, passed', { scheduledActivationTime: '08:00' }],
    ['time only, ahead', { scheduledActivationTime: '23:00' }],
    [
      'future start',
      {
        scheduledActivationDate: '2026-11-09',
        scheduledActivationTime: '08:00',
      },
    ],
    [
      'past start',
      {
        scheduledActivationDate: '2026-11-01',
        scheduledActivationTime: '08:00',
      },
    ],
  ];
  it.each(cases)('%s', (_n, over) => {
    const a = { ...base, ...over };
    expect(getAnnouncementLiveStatus(a, now) === 'active').toBe(
      isWithinActiveWindow(a, now)
    );
  });

  it('keeps manual, inactive and expired statuses', () => {
    const manual = { ...base, activationType: 'manual' } as Announcement;
    expect(getAnnouncementLiveStatus(manual, now)).toBe('active');
    expect(getAnnouncementLiveStatus({ ...manual, isActive: false }, now)).toBe(
      'inactive'
    );
    expect(
      getAnnouncementLiveStatus(
        {
          ...manual,
          scheduledEndDate: '2026-11-01',
          scheduledEndTime: '08:00',
        },
        now
      )
    ).toBe('expired');
  });
});
