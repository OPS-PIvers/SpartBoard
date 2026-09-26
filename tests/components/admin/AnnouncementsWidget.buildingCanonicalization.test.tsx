import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Regression guard: targetBuildings loaded from Firestore may still hold a
// legacy long-form building id (e.g. "orono-high-school") from before the
// Organization Buildings panel switched to short canonical ids ("high").
// Comparing it directly against useAdminBuildings()'s canonical building.id
// means a legacy entry never matches, so re-toggling a legacy-assigned
// building adds a duplicate canonical id instead of removing it.

const mockUser = { email: 'admin@example.com', uid: 'admin-uid' };
const mockUserRoles = { superAdmins: ['admin@example.com'] };
const mockBuildings = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    orgId: null,
    roleId: null,
    userRoles: mockUserRoles,
  }),
}));

const mockAddToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {},
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const legacyAnnouncement = {
  id: 'ann1',
  name: 'Legacy Assigned Announcement',
  widgetType: 'text',
  widgetConfig: {},
  widgetSize: { w: 400, h: 300 },
  maximized: false,
  activationType: 'manual',
  isActive: false,
  activatedAt: null,
  dismissalType: 'manual',
  // Stored before the short-id migration — should resolve to canonical "high".
  targetBuildings: ['orono-high-school'],
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
          cb({ id: legacyAnnouncement.id, data: () => legacyAnnouncement });
        },
      });
      return vi.fn();
    }
  ),
}));

import { updateDoc } from 'firebase/firestore';
import { AnnouncementsManager } from '@/components/admin/Announcements/Widget';

const updateDocMock = updateDoc as unknown as Mock;

describe('AnnouncementsManager — building id canonicalization', () => {
  beforeEach(() => {
    updateDocMock.mockClear();
  });

  it('shows a legacy-id-targeted building as selected when editing', async () => {
    render(<AnnouncementsManager />);

    fireEvent.click(await screen.findByRole('button', { name: /Edit/i }));

    expect(
      await screen.findByRole('switch', { name: 'Target Orono High School' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('fully untargets a legacy-id building on toggle instead of adding a duplicate canonical id', async () => {
    render(<AnnouncementsManager />);

    fireEvent.click(await screen.findByRole('button', { name: /Edit/i }));

    const toggle = await screen.findByRole('switch', {
      name: 'Target Orono High School',
    });
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    const [, writtenData] = updateDocMock.mock.calls[0] as [
      unknown,
      { targetBuildings: string[] },
    ];
    expect(writtenData.targetBuildings).toEqual([]);
  });
});
