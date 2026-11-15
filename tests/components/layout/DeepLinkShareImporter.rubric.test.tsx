/**
 * DeepLinkShareImporter — /share/rubric/{id} deep-link import path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';

const addToast = vi.fn();
const clearPendingRubricShare = vi.fn();
const importSharedRubric = vi.fn();

let pendingRubricShareId: string | null = 'share-abc';
let confirmFlag = true;
let permsLoaded = true;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-1' },
    isAdmin: false,
    globalPermissionsLoaded: permsLoaded,
    canAccessFeature: (id: string) =>
      id === 'share-import-confirm' && confirmFlag,
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
    pendingQuizShareId: null,
    clearPendingQuizShare: vi.fn(),
    pendingAssignmentShareId: null,
    clearPendingAssignmentShare: vi.fn(),
    pendingVideoActivityShareId: null,
    clearPendingVideoActivityShare: vi.fn(),
    pendingRubricShareId,
    clearPendingRubricShare,
  }),
}));

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ importSharedRubric }),
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
  useVideoActivityAssignments: () => ({ importSharedAssignment: vi.fn() }),
}));

vi.mock('@/hooks/useQuestionBanks', () => ({
  useQuestionBanks: () => ({ saveBank: vi.fn() }),
}));

vi.mock('@/utils/shareImportPeek', () => ({
  peekShareHeader: () =>
    Promise.resolve({ title: 'Paragraph', originalAuthor: 'attacker-uid' }),
  describeSharer: () => 'Unknown account',
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [], loading: false }),
}));

import { DeepLinkShareImporter } from '@/components/layout/DeepLinkShareImporter';

describe('DeepLinkShareImporter — rubric deep link', () => {
  beforeEach(() => {
    addToast.mockReset();
    clearPendingRubricShare.mockReset();
    importSharedRubric.mockReset();
    pendingRubricShareId = 'share-abc';
    confirmFlag = true;
    permsLoaded = true;
  });

  it('imports the pending rubric share and toasts its title', async () => {
    importSharedRubric.mockResolvedValue({ id: 'r1', title: 'Paragraph' });
    render(<DeepLinkShareImporter />);

    await screen.findByText('Unknown account');
    expect(importSharedRubric).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(importSharedRubric).toHaveBeenCalledWith('share-abc')
    );
    expect(clearPendingRubricShare).toHaveBeenCalled();
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Rubric "Paragraph" imported to your library!',
        'success'
      )
    );
  });

  it('toasts a failure when the shared rubric cannot be imported', async () => {
    importSharedRubric.mockRejectedValue(new Error('Shared rubric not found'));
    render(<DeepLinkShareImporter />);

    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Failed to import shared rubric: Shared rubric not found',
        'error'
      )
    );
  });

  it('imports silently with no dialog when the confirm flag is off', async () => {
    confirmFlag = false;
    importSharedRubric.mockResolvedValue({ id: 'r1', title: 'Paragraph' });
    render(<DeepLinkShareImporter />);

    await waitFor(() =>
      expect(importSharedRubric).toHaveBeenCalledWith('share-abc')
    );
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    expect(screen.queryByText('Unknown account')).toBeNull();
  });

  it('neither imports nor shows the dialog until permissions load', async () => {
    permsLoaded = false;
    const { rerender } = render(<DeepLinkShareImporter />);
    await new Promise((r) => setTimeout(r, 20));
    expect(importSharedRubric).not.toHaveBeenCalled();
    expect(clearPendingRubricShare).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();

    permsLoaded = true;
    rerender(<DeepLinkShareImporter />);
    await screen.findByRole('button', { name: 'Import' });
    expect(importSharedRubric).not.toHaveBeenCalled();
  });

  it('does nothing when no rubric share is pending', () => {
    pendingRubricShareId = null;
    render(<DeepLinkShareImporter />);

    expect(importSharedRubric).not.toHaveBeenCalled();
  });
});
