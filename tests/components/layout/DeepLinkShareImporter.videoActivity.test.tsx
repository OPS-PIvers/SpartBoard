/**
 * DeepLinkShareImporter — /share/video-activity/{id}: Synced or Make a copy behind the preview flag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';

const addToast = vi.fn();
const importVa = vi.fn();
const peekVa = vi.fn();
let flagOn = false;
let pendingLibraryShare: { kind: 'videoActivity'; shareId: string } | null;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-1' },
    orgId: 'orono',
    canAccessFeature: (id: string) =>
      id === 'video-activity-share-sync' && flagOn,
  }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { id: 'd1', widgets: [] },
    addWidget: vi.fn(),
    updateWidget: vi.fn(),
    bringToFront: vi.fn(),
    addToast,
    setPendingAssignmentSetup: vi.fn(),
    pendingLibraryShare,
    clearPendingLibraryShare: () => {
      pendingLibraryShare = null;
    },
  }),
}));

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ importSharedRubric: vi.fn() }),
}));
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    importSharedQuiz: vi.fn(),
    saveQuiz: vi.fn(),
    deleteQuiz: vi.fn(),
    attachSyncLinkage: vi.fn(),
  }),
}));
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({
    importSharedAssignment: vi.fn(),
    peekSharedAssignment: vi.fn(),
  }),
}));
vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    saveActivity: vi.fn(),
    attachSyncLinkage: vi.fn(),
  }),
}));
vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    importSharedAssignment: importVa,
    peekSharedAssignment: peekVa,
  }),
}));
vi.mock('@/hooks/useQuestionBanks', () => ({
  useQuestionBanks: () => ({ saveBank: vi.fn() }),
}));
vi.mock('@/utils/shareImportPeek', () => ({
  peekShareHeader: vi.fn(),
  lookupOrgSharer: () => Promise.resolve({ name: 'Sam Rivera', email: 'x' }),
  describeSharer: (
    _uid: string,
    _me: string,
    _plcs: unknown,
    org: { name: string } | null
  ) => (org ? org.name : 'Someone'),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [], loading: false }),
}));

import { DeepLinkShareImporter } from '@/components/layout/DeepLinkShareImporter';

describe('DeepLinkShareImporter — video activity share link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flagOn = false;
    pendingLibraryShare = { kind: 'videoActivity', shareId: 'va-share' };
    peekVa.mockResolvedValue({
      title: 'Volcanoes',
      originalAuthor: 'author-uid',
      syncGroupId: 'group-1',
    });
    importVa.mockResolvedValue({ assignmentId: 'a1', activityId: 'v1' });
  });

  it('imports a copy after the plain confirm while the flag is off', async () => {
    render(<DeepLinkShareImporter />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(importVa).toHaveBeenCalledWith(
        'va-share',
        expect.objectContaining({ mode: 'copy' })
      )
    );
    expect(screen.queryByText('Synced')).toBeNull();
  });

  it('offers Synced or Make a copy when the flag is on and the share can sync', async () => {
    flagOn = true;
    render(<DeepLinkShareImporter />);
    fireEvent.click(await screen.findByText('Synced'));
    await waitFor(() =>
      expect(importVa).toHaveBeenCalledWith(
        'va-share',
        expect.objectContaining({ mode: 'sync' })
      )
    );
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Synced video activity imported!',
        'success'
      )
    );
  });

  it('skips the choice for a share with no synced group', async () => {
    flagOn = true;
    peekVa.mockResolvedValue({ title: 'Volcanoes', originalAuthor: 'a' });
    render(<DeepLinkShareImporter />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(importVa).toHaveBeenCalledWith(
        'va-share',
        expect.objectContaining({ mode: 'copy' })
      )
    );
  });

  it('skips the choice for someone outside the share PLC', async () => {
    flagOn = true;
    peekVa.mockResolvedValue({
      title: 'Volcanoes',
      originalAuthor: 'author-uid',
      syncGroupId: 'group-1',
      assignmentSettings: { plc: { id: 'plc-9', name: 'Science PLC' } },
    });
    render(<DeepLinkShareImporter />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(importVa).toHaveBeenCalledWith(
        'va-share',
        expect.objectContaining({ mode: 'copy' })
      )
    );
    expect(screen.queryByText('Synced')).toBeNull();
  });
});
