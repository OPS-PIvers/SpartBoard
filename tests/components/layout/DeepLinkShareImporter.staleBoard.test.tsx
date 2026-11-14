/**
 * DeepLinkShareImporter — post-import widget surfacing must use the board as it is when the import resolves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  waitFor,
  act,
  screen,
  fireEvent,
} from '@testing-library/react';
import type { WidgetData } from '@/types';

const addWidget = vi.fn();
const updateWidget = vi.fn();
const bringToFront = vi.fn();
const addToast = vi.fn();
const importSharedQuiz = vi.fn();

let widgets: WidgetData[] = [];
let pendingQuizShareId: string | null = 'share-1';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-1' } }),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { id: 'd1', widgets },
    addWidget,
    updateWidget,
    bringToFront,
    addToast,
    setPendingAssignmentSetup: vi.fn(),
    pendingQuizShareId,
    clearPendingQuizShare: () => {
      pendingQuizShareId = null;
    },
    pendingAssignmentShareId: null,
    clearPendingAssignmentShare: vi.fn(),
    pendingVideoActivityShareId: null,
    clearPendingVideoActivityShare: vi.fn(),
    pendingRubricShareId: null,
    clearPendingRubricShare: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ importSharedRubric: vi.fn() }),
}));
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    importSharedQuiz,
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
  peekShareHeader: () => Promise.resolve({ title: 'Q', originalAuthor: 'a' }),
  describeSharer: () => 'Unknown account',
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [], loading: false }),
}));

import { DeepLinkShareImporter } from '@/components/layout/DeepLinkShareImporter';

describe('DeepLinkShareImporter — stale board at import resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    widgets = [];
    pendingQuizShareId = 'share-1';
  });

  it('reuses a Quiz widget added while the import was in flight', async () => {
    let resolveImport: () => void = () => undefined;
    importSharedQuiz.mockReturnValue(
      new Promise<void>((r) => {
        resolveImport = r;
      })
    );
    const { rerender } = render(<DeepLinkShareImporter />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() => expect(importSharedQuiz).toHaveBeenCalledTimes(1));

    widgets = [
      {
        id: 'quiz-1',
        type: 'quiz',
        x: 0,
        y: 0,
        w: 400,
        h: 300,
        z: 1,
        flipped: false,
        config: {},
      },
    ];
    rerender(<DeepLinkShareImporter />);

    await act(() => {
      resolveImport();
      return Promise.resolve();
    });

    await waitFor(() => expect(bringToFront).toHaveBeenCalledWith('quiz-1'));
    expect(addWidget).not.toHaveBeenCalled();
  });
});
