/**
 * DeepLinkShareImporter — /share/rubric/{id} deep-link import path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const addToast = vi.fn();
const clearPendingRubricShare = vi.fn();
const importSharedRubric = vi.fn();

let pendingRubricShareId: string | null = 'share-abc';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1' } }),
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
  });

  it('imports the pending rubric share and toasts its title', async () => {
    importSharedRubric.mockResolvedValue({ id: 'r1', title: 'Paragraph' });
    render(<DeepLinkShareImporter />);

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

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Failed to import shared rubric: Shared rubric not found',
        'error'
      )
    );
  });

  it('does nothing when no rubric share is pending', () => {
    pendingRubricShareId = null;
    render(<DeepLinkShareImporter />);

    expect(importSharedRubric).not.toHaveBeenCalled();
  });
});
