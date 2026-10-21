/**
 * Tests for QuizEditorModal tabs and the behavior pass-through (D10).
 * Settings live on the assignment, so the editor has no Settings tab and
 * hands the seeded behavior back to onSave unchanged.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import type { QuizBehaviorSettings, QuizData } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { useAuth } from '@/context/useAuth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
  })),
}));

// The stimulus attach section pulls dialog + Drive hooks that need providers.
vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(() => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn(),
  })),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(() => ({ driveService: null, userDomain: undefined })),
}));

// Minimal EditorWorkspace mock: renders both panes + a Save button,
// exposes isDirty via data attribute for assertions.
vi.mock('@/components/common/EditorWorkspace', () => ({
  EditorWorkspace: vi.fn(
    ({
      isOpen,
      contextPane,
      detailPane,
      onSave,
      onClose,
      isDirty,
    }: {
      isOpen: boolean;
      contextPane: React.ReactNode;
      detailPane: React.ReactNode;
      onSave: () => void;
      onClose: () => void;
      isDirty: boolean;
    }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="editor-workspace" data-is-dirty={String(isDirty)}>
          <div data-testid="context-pane">{contextPane}</div>
          <div data-testid="detail-pane">{detailPane}</div>
          <button onClick={onSave}>Save Quiz</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      );
    }
  ),
}));

// Mock the AI overlay — not relevant to this test.
vi.mock('@/components/widgets/QuizWidget/components/QuizEditor', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/widgets/QuizWidget/components/QuizEditor')
  >('@/components/widgets/QuizWidget/components/QuizEditor');
  return {
    ...actual,
    QuizAiOverlay: () => null,
    // QuizEditorContextPane and QuizEditorDetailPane: use real ones but
    // they will be rendered inside the mocked EditorWorkspace context pane.
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeQuiz: QuizData = {
  id: 'quiz-1',
  title: 'Science Review',
  questions: [
    {
      id: 'q1',
      text: 'What is photosynthesis?',
      type: 'MC',
      correctAnswer: 'A',
      incorrectAnswers: ['B', 'C', 'D'],
      timeLimit: 30,
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeQuiz2: QuizData = {
  id: 'quiz-2',
  title: 'History Review',
  questions: [
    {
      id: 'q2',
      text: 'When did WWII end?',
      type: 'MC',
      correctAnswer: '1945',
      incorrectAnswers: ['1918', '1939', '1950'],
      timeLimit: 30,
    },
  ],
  createdAt: 3000,
  updatedAt: 4000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuizEditorModal tabs and behavior (D10)', () => {
  const authWith = (readAloud: boolean) =>
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'uid-test', displayName: 'Test Teacher' },
      canAccessFeature: vi.fn(
        (id: string) => readAloud && id === 'quiz-read-aloud'
      ),
      canAccessQuizMediaResponse: vi.fn(() => false),
    } as unknown as ReturnType<typeof useAuth>);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has Questions and Stimuli tabs and no Settings tab', () => {
    authWith(false);
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /^questions$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^stimuli$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^settings$/i })).toBeNull();
    expect(
      screen.getAllByText('What is photosynthesis?').length
    ).toBeGreaterThan(0);
  });

  it('saves DEFAULT_QUIZ_BEHAVIOR when no behavior is seeded', async () => {
    authWith(false);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Quiz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1]).toEqual(DEFAULT_QUIZ_BEHAVIOR);
  });

  it("saves the quiz's existing behavior unchanged", async () => {
    authWith(false);
    const saved: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'teacher',
      attemptLimit: 4,
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={onSave}
        behavior={saved}
      />
    );
    expect(screen.getByTestId('editor-workspace')).toHaveAttribute(
      'data-is-dirty',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Quiz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1]).toEqual(saved);
  });

  it('reseeds behavior when the modal is reused for a different quiz', async () => {
    authWith(false);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={onSave}
        behavior={{ ...DEFAULT_QUIZ_BEHAVIOR, sessionMode: 'teacher' }}
      />
    );
    rerender(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz2}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    expect(screen.getByTestId('editor-workspace')).toHaveAttribute(
      'data-is-dirty',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Quiz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1]).toEqual(DEFAULT_QUIZ_BEHAVIOR);
  });

  it('puts the read-aloud language picker on the Languages tab', () => {
    authWith(true);
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByText('Language')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^stimuli$/i }));
    expect(screen.queryByText('Language')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^languages$/i }));
    expect(screen.getByText('Language')).toBeInTheDocument();
  });
});
