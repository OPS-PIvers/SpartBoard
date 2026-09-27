import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Regression guard: pdf.buildings loaded from Firestore may still hold a
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
const mockAddToast = vi.fn();
const mockBuildings = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
];
const mockStorage = {
  uploadAdminPdf: vi.fn(),
  deleteFile: vi.fn(),
};

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: mockShowConfirm }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => mockStorage,
  MAX_PDF_SIZE_BYTES: 50 * 1024 * 1024,
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const legacyPdf = {
  id: 'pdf1',
  name: 'Legacy Assigned PDF',
  storageUrl: 'https://example.com/legacy.pdf',
  storagePath: 'global_pdfs/legacy.pdf',
  size: 1024,
  // Stored before the short-id migration — should resolve to canonical "high".
  buildings: ['orono-high-school'],
  order: 0,
  uploadedAt: 1,
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      onNext: (snap: { docs: { id: string; data: () => unknown }[] }) => void
    ) => {
      onNext({ docs: [{ id: legacyPdf.id, data: () => legacyPdf }] });
      return vi.fn();
    }
  ),
}));

import { setDoc } from 'firebase/firestore';
import { PdfLibraryModal } from '@/components/admin/PdfLibraryModal';

const setDocMock = setDoc as unknown as Mock;

describe('PdfLibraryModal — building id canonicalization', () => {
  beforeEach(() => {
    setDocMock.mockClear();
  });

  it('shows a legacy-id-assigned building as selected in the editor', async () => {
    render(<PdfLibraryModal onClose={vi.fn()} />);

    fireEvent.click(await screen.findByTitle('Edit'));

    const highSchoolButton = await screen.findByRole('button', {
      name: /Orono High School/,
    });
    expect(highSchoolButton.className).toContain('bg-red-600');
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', async () => {
    render(<PdfLibraryModal onClose={vi.fn()} />);

    fireEvent.click(await screen.findByTitle('Edit'));

    const highSchoolButton = await screen.findByRole('button', {
      name: /Orono High School/,
    });
    fireEvent.click(highSchoolButton);

    fireEvent.click(screen.getByText('Update PDF'));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, writtenData] = setDocMock.mock.calls[0] as [
      unknown,
      { buildings: string[] },
    ];
    expect(writtenData.buildings).toEqual([]);
  });
});
