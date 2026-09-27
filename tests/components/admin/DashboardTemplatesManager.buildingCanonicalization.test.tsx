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

// Hoisted, referentially-stable mock values: an inline factory returning a
// fresh object/array per render would change a useCallback/useEffect
// dependency on every commit and spin it into an infinite re-render loop
// (see AnnouncementsWidget.labels.test.tsx for the same guard).
const mockUser = { email: 'admin@example.com' };
const mockShowConfirm = vi.fn().mockResolvedValue(true);
const mockAddToast = vi.fn();
const mockBuildings = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: mockShowConfirm }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

vi.mock('@/hooks/useTemplateStore', () => ({
  mockTemplateStore: {
    save: vi.fn(),
    remove: vi.fn(),
    getAll: vi.fn(() => []),
  },
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const legacyTemplate = {
  id: 'tpl1',
  type: 'board',
  name: 'Legacy Assigned Template',
  description: '',
  widgets: [],
  tags: [],
  targetGradeLevels: [],
  // Stored before the short-id migration — should resolve to canonical "high".
  targetBuildings: ['orono-high-school'],
  enabled: true,
  accessLevel: 'public',
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'admin@example.com',
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-id' }),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: { docs: { id: string; data: () => unknown }[] }) => void
    ) => {
      onNext({ docs: [{ id: legacyTemplate.id, data: () => legacyTemplate }] });
      return vi.fn();
    }
  ),
}));

import { setDoc } from 'firebase/firestore';
import { DashboardTemplatesManager } from '@/components/admin/DashboardTemplatesManager';

const setDocMock = setDoc as unknown as Mock;

describe('DashboardTemplatesManager — building id canonicalization', () => {
  beforeEach(() => {
    setDocMock.mockClear();
  });

  it('shows a legacy-id-assigned building as selected', async () => {
    render(<DashboardTemplatesManager />);

    const highSchoolButton = await screen.findByTitle('Orono High School');
    expect(highSchoolButton.className).toContain('bg-brand-blue-primary');
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', async () => {
    render(<DashboardTemplatesManager />);

    const highSchoolButton = await screen.findByTitle('Orono High School');
    fireEvent.click(highSchoolButton);

    fireEvent.click(screen.getByTitle('Save changes'));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, writtenData] = setDocMock.mock.calls[0] as [
      unknown,
      { targetBuildings: string[] },
    ];
    expect(writtenData.targetBuildings).toEqual([]);
  });
});
