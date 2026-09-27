import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Regression guard: buildingIds loaded from Firestore may still hold a
// legacy long-form building id (e.g. "orono-high-school") from before the
// Organization Buildings panel switched to short canonical ids ("high").
// Comparing it directly against useAdminBuildings()'s canonical building.id
// means a legacy entry never matches, so re-toggling a legacy-assigned
// building adds a duplicate canonical id instead of removing it.

// Hoisted, referentially-stable mock values: an inline factory returning a
// fresh object/array per render would change a useCallback/useEffect
// dependency on every commit and spin it into an infinite re-render loop
// (see AnnouncementsWidget.labels.test.tsx for the same guard).
const mockShowConfirm = vi.fn().mockResolvedValue(true);
const mockUser = { email: 'admin@example.com', uid: 'admin-uid' };
const mockStorage = { uploadAdminBackground: vi.fn() };
const mockGoogleDrive = { driveService: null, isConnected: false };
const mockBuildings = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
];

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: mockShowConfirm }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => mockStorage,
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => mockGoogleDrive,
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  storage: {},
}));

const legacyPreset = {
  id: 'preset1',
  url: 'https://example.com/bg.jpg',
  label: 'Legacy Assigned Background',
  active: true,
  accessLevel: 'public',
  betaUsers: [],
  createdAt: 1,
  // Stored before the short-id migration — should resolve to canonical "high".
  buildingIds: ['orono-high-school'],
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn().mockResolvedValue({ empty: true }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: { docs: { id: string; data: () => unknown }[] }) => void
    ) => {
      onNext({ docs: [{ id: legacyPreset.id, data: () => legacyPreset }] });
      return vi.fn();
    }
  ),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

import { updateDoc } from 'firebase/firestore';
import { BackgroundManager } from '@/components/admin/BackgroundManager';

const updateDocMock = updateDoc as unknown as Mock;

describe('BackgroundManager — building id canonicalization', () => {
  beforeEach(() => {
    updateDocMock.mockClear();
  });

  it('shows a legacy-id-assigned building as assigned', async () => {
    render(<BackgroundManager />);

    const highSchoolButton = await screen.findByTitle(
      'Remove from Orono High School'
    );
    expect(highSchoolButton.className).toContain('bg-brand-blue-primary');
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', async () => {
    render(<BackgroundManager />);

    const highSchoolButton = await screen.findByTitle(
      'Remove from Orono High School'
    );
    fireEvent.click(highSchoolButton);

    await waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    const [, writtenData] = updateDocMock.mock.calls[0] as [
      unknown,
      { buildingIds: string[] },
    ];
    expect(writtenData.buildingIds).toEqual([]);
  });
});
