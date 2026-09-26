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
const mockUser = { email: 'admin@example.com', uid: 'admin-uid' };
const mockBuildings = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

vi.mock('@/config/firebase', () => ({ db: {}, storage: {} }));

const legacyStation = {
  id: 'station1',
  title: 'Legacy Assigned Station',
  channel: 'Some Channel',
  url: 'https://youtu.be/abc12345678',
  thumbnail: 'https://img.youtube.com/vi/abc12345678/hqdefault.jpg',
  color: '#fff',
  isActive: true,
  order: 0,
  // Stored before the short-id migration — should resolve to canonical "high".
  buildingIds: ['orono-high-school'],
};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(
    (
      _docRef: unknown,
      onNext: (snap: { exists: () => boolean; data: () => unknown }) => void
    ) => {
      onNext({
        exists: () => true,
        data: () => ({ stations: [legacyStation] }),
      });
      return vi.fn();
    }
  ),
}));

import { setDoc } from 'firebase/firestore';
import { MusicManager } from '@/components/admin/MusicManager';

const setDocMock = setDoc as unknown as Mock;

describe('MusicManager — building id canonicalization', () => {
  beforeEach(() => {
    setDocMock.mockClear();
  });

  it('shows a legacy-id-assigned building as checked in the editor', async () => {
    render(<MusicManager />);

    fireEvent.click(await screen.findByTitle('Edit station'));

    const highSchoolButton = await screen.findByRole('button', {
      name: /Orono High School/,
    });
    expect(highSchoolButton.className).toContain('bg-indigo-50');
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', async () => {
    render(<MusicManager />);

    fireEvent.click(await screen.findByTitle('Edit station'));

    const highSchoolButton = await screen.findByRole('button', {
      name: /Orono High School/,
    });
    fireEvent.click(highSchoolButton);

    fireEvent.click(screen.getByText('Save Station'));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, writtenData] = setDocMock.mock.calls[0] as [
      unknown,
      { stations: { buildingIds?: string[] }[] },
    ];
    expect(writtenData.stations[0].buildingIds).toEqual([]);
  });
});
