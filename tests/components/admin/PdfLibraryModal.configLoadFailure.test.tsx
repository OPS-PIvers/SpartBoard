import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

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

import { getDoc, setDoc } from 'firebase/firestore';
import { PdfLibraryModal } from '@/components/admin/PdfLibraryModal';

describe('PdfLibraryModal — failed global config load', () => {
  beforeEach(() => {
    vi.mocked(setDoc).mockClear();
    vi.mocked(getDoc).mockReset();
  });

  it('keeps Save Global Settings off after a failed read so defaults never overwrite the saved doc', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('offline'));
    render(<PdfLibraryModal onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Settings'));
    await screen.findByRole('alert');

    const save = screen.getByRole('button', { name: /Save Global Settings/ });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('re-enables Save once Try again loads the config', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getDoc)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        exists: () => false,
      } as unknown as Awaited<ReturnType<typeof getDoc>>);
    render(<PdfLibraryModal onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Settings'));
    fireEvent.click(await screen.findByText('Try again'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Save Global Settings/ })
      ).toBeEnabled()
    );
  });
});
