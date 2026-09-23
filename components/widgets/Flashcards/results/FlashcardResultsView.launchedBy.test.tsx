import '@testing-library/jest-dom';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FlashcardAssignment } from '@/types';

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ orgId: null }) }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ rosters: [], addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/hooks/useFlashcardResults', () => ({
  useFlashcardResults: () => ({
    session: null,
    results: [],
    loading: false,
    error: null,
    resetStudent: vi.fn(),
    resolveFlag: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useMinuteClock', () => ({ useMinuteClock: () => 0 }));

import { FlashcardResultsView } from './FlashcardResultsView';

const assignment = (
  over: Partial<FlashcardAssignment> = {}
): FlashcardAssignment =>
  ({
    id: 'a1',
    sessionId: 'a1',
    setId: 'set-1',
    setTitle: 'Spanish',
    teacherUid: 'teacher-1',
    kind: 'study',
    status: 'active',
    createdAt: Date.UTC(2026, 8, 23, 14, 0, 0),
    updatedAt: 0,
    ...over,
  }) as FlashcardAssignment;

const show = (over: Partial<FlashcardAssignment> = {}) =>
  render(
    <FlashcardResultsView
      assignment={assignment(over)}
      onBack={vi.fn()}
      onPublishScores={vi.fn()}
      onUnpublishScores={vi.fn()}
    />
  );

describe('FlashcardResultsView — who started the run', () => {
  // Flashcards is the one kind whose results view reads the assignment rather
  // than the session, so the stamp has to be read off the assignment doc.
  it('names the substitute who launched it', () => {
    show({
      launchedBy: {
        uid: 'sub-1',
        email: 'sub@orono.k12.mn.us',
        shareId: 'share-1',
      },
    });

    expect(screen.getByTestId('launched-by-sub')).toHaveTextContent(
      /Launched by sub@orono\.k12\.mn\.us/
    );
  });

  it('says nothing on a run the teacher started', () => {
    show();
    expect(screen.queryByTestId('launched-by-sub')).not.toBeInTheDocument();
  });
});
