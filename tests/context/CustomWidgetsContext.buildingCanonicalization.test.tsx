import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Regression guard: a custom widget doc's `buildings` array may still hold a
// legacy long-form building id (e.g. "orono-high-school") from before the
// short canonical id migration (see config/buildings.ts BUILDING_ID_ALIASES).
// The admin's WidgetMetaEditor already canonicalizes on write, but a doc
// saved before that existed (or never re-toggled) keeps the legacy id.
// selectedBuildings on the auth side is always canonical post-load, so
// comparing a raw legacy `buildings` entry against it directly never
// matches, and the widget silently disappears from every teacher's
// dashboard/dock in that building.

// Hoisted, referentially-stable mock values: an inline factory returning a
// fresh array per render would change the provider's effect dependency on
// every commit and spin it into an infinite re-render loop.
const mockUser = { uid: 'teacher-uid', email: 'teacher@example.com' };
const mockSelectedBuildings = ['high']; // canonical, post-load form

vi.mock('@/config/firebase', () => ({
  db: {},
  isConfigured: true,
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAdmin: false,
    selectedBuildings: mockSelectedBuildings,
  }),
}));

const legacyWidget = {
  id: 'w1',
  slug: 'legacy-widget',
  title: 'Legacy Widget',
  icon: '',
  color: 'bg-blue-500',
  createdBy: 'admin@example.com',
  createdAt: 1,
  updatedAt: 1,
  mode: 'block',
  published: true,
  // Stored before the short-id migration — should resolve to canonical "high".
  buildings: ['orono-high-school'],
  defaultWidth: 2,
  defaultHeight: 2,
  settings: [],
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(
    (
      q: unknown,
      onNext: (snap: { docs: { id: string; data: () => unknown }[] }) => void
    ) => {
      // Only the "public" query (first `where('accessLevel','==','public')`
      // branch) should deliver this doc; the beta query gets none.
      const isPublicQuery = JSON.stringify(q).includes('public');
      onNext({
        docs: isPublicQuery
          ? [{ id: legacyWidget.id, data: () => legacyWidget }]
          : [],
      });
      return vi.fn();
    }
  ),
}));

import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import { useCustomWidgets } from '@/context/useCustomWidgets';

const capturedHolder: { current: ReturnType<typeof useCustomWidgets> | null } =
  { current: null };

const Probe: React.FC = () => {
  const ctx = useCustomWidgets();
  React.useEffect(() => {
    capturedHolder.current = ctx;
  });
  return null;
};

beforeEach(() => {
  capturedHolder.current = null;
});

describe('CustomWidgetsContext — building id canonicalization', () => {
  it('surfaces a custom widget stored with a legacy long-form building id to a teacher in the canonical building', async () => {
    render(
      <CustomWidgetsProvider>
        <Probe />
      </CustomWidgetsProvider>
    );

    await waitFor(() => {
      expect(capturedHolder.current?.loading).toBe(false);
    });

    expect(capturedHolder.current?.customWidgets.map((w) => w.id)).toContain(
      'w1'
    );
  });
});
