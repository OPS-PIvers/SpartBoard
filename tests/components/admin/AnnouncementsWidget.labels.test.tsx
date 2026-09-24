// Pins the create-form's "Maximize", "Auto-deactivate" and per-building
// target Toggles to accessible names; without a label prop these switches
// are unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  onSnapshot: vi.fn((_q: unknown, onNext: (snap: unknown) => void) => {
    onNext({ forEach: vi.fn() });
    return vi.fn();
  }),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  query: vi.fn(() => 'query'),
  where: vi.fn(() => 'where'),
}));

// Hoisted, referentially-stable mock values: an inline `() => ({...})`
// factory returns a fresh object every render, which would change the
// `[user, isSuperAdmin, orgId]` effect's dependencies on every commit and
// spin it into an infinite re-render loop instead of testing our fix.
const mockUser = { email: 'admin@example.com', uid: 'admin-uid' };
const mockUserRoles = { superAdmins: ['admin@example.com'] };
const mockBuildings = [
  { id: 'b1', name: 'North Elementary', gradeLabel: 'K-5' },
];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    orgId: null,
    roleId: null,
    userRoles: mockUserRoles,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

// The live preview resolves a real (React.lazy) widget component; stub the
// registry so it doesn't dynamic-import actual widget bundles into this test.
vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {},
}));

import { AnnouncementsManager } from '@/components/admin/Announcements/Widget';

afterEach(cleanup);

describe('AnnouncementsManager (create form) — label associations', () => {
  it('leaves no switch without an accessible name', async () => {
    render(<AnnouncementsManager />);

    fireEvent.click(
      await screen.findByRole('button', { name: /New Announcement/i })
    );

    expect(
      screen.getByRole('switch', { name: 'Maximize (full screen)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: 'Auto-deactivate at end date/time',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Target North Elementary' })
    ).toBeInTheDocument();

    // Toggle renders visible "ON"/"OFF" text inside the button, so a bare
    // toHaveAccessibleName() would pass via that text-content fallback even
    // with no aria-label at all — assert the attribute itself instead.
    for (const el of screen.getAllByRole('switch')) {
      expect(el).toHaveAttribute('aria-label');
    }
  });
});
