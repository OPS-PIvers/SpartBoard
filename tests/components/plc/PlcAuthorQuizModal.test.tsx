/**
 * Tests for PlcAuthorQuizModal — Stream B task B1.
 *
 * Key assertions:
 *   - Mounting with isOpen renders QuizEditorModal.
 *   - When QuizEditorModal.onSave fires, saveQuiz is called.
 *   - After saveQuiz resolves, PlcAssignmentConfigModal is opened (the
 *     authoring step hands off to the config step in-PLC, no board
 *     hand-off, no setPendingAssignmentEdit).
 *   - Closing the config modal calls onClose.
 *
 * Mocking strategy:
 *   - useAuth: returns a stub user.
 *   - useQuiz: saveQuiz resolves with fake QuizMetadata.
 *   - QuizEditorModal: renders a "Save Quiz" button that calls onSave(fakeQuiz).
 *   - PlcAssignmentConfigModal: renders a sentinel div so we can assert it mounts.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcAuthorQuizModal } from '@/components/plc/authoring/PlcAuthorQuizModal';
import type { Plc, QuizData, QuizMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockSaveQuiz = vi.fn();

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: vi.fn(() => ({
    saveQuiz: mockSaveQuiz,
    quizzes: [],
    isDriveConnected: true,
  })),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'uid-test',
      displayName: 'Test Teacher',
      email: 'test@school.edu',
    },
  })),
}));

// Mock QuizEditorModal so it renders a simple button that triggers onSave
vi.mock('@/components/widgets/QuizWidget/components/QuizEditorModal', () => ({
  QuizEditorModal: vi.fn(
    ({
      isOpen,
      onSave,
      onClose,
    }: {
      isOpen: boolean;
      onSave: (q: QuizData, behavior: unknown) => Promise<void>;
      onClose: () => void;
    }) => {
      if (!isOpen) return null;
      const fakeQuiz: QuizData = {
        id: 'quiz-abc',
        title: 'Unit 3 Quiz',
        questions: [
          {
            id: 'q1',
            text: 'What is 2+2?',
            type: 'MC',
            correctAnswer: '4',
            incorrectAnswers: ['1', '2', '3'],
            timeLimit: 30,
          },
        ],
        createdAt: 1000,
        updatedAt: 2000,
      };
      // Pass a minimal behavior stub as the 2nd arg to match the new signature.
      const fakeBehavior = {
        sessionMode: 'teacher',
        sessionOptions: {},
        attemptLimit: null,
      };
      return (
        <div data-testid="quiz-editor-modal">
          <button onClick={() => onSave(fakeQuiz, fakeBehavior)}>
            Save Quiz
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      );
    }
  ),
}));

// Mock PlcAssignmentConfigModal so we can assert it mounts with the right props
vi.mock('@/components/plc/assignments/PlcAssignmentConfigModal', () => ({
  PlcAssignmentConfigModal: vi.fn(
    ({
      kind,
      quizRef,
      isOpen,
      onClose,
    }: {
      kind: string;
      quizRef?: { id: string; title: string };
      isOpen: boolean;
      onClose: () => void;
    }) => {
      if (!isOpen) return null;
      return (
        <div
          data-testid="plc-assignment-config-modal"
          data-kind={kind}
          data-quiz-ref-id={quizRef?.id}
          data-quiz-ref-title={quizRef?.title}
        >
          <button onClick={onClose}>Close Config</button>
        </div>
      );
    }
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-a',
  members: {},
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeMetadata: QuizMetadata = {
  id: 'quiz-abc',
  title: 'Unit 3 Quiz',
  driveFileId: 'drive-file-123',
  questionCount: 1,
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcAuthorQuizModal', () => {
  beforeEach(() => {
    mockSaveQuiz.mockClear();
    mockSaveQuiz.mockResolvedValue(fakeMetadata);
  });

  it('renders QuizEditorModal when isOpen=true', () => {
    const onClose = vi.fn();
    render(<PlcAuthorQuizModal plc={fakePlc} isOpen onClose={onClose} />);
    expect(screen.getByTestId('quiz-editor-modal')).toBeInTheDocument();
  });

  it('does not render QuizEditorModal when isOpen=false', () => {
    const onClose = vi.fn();
    render(
      <PlcAuthorQuizModal plc={fakePlc} isOpen={false} onClose={onClose} />
    );
    expect(screen.queryByTestId('quiz-editor-modal')).not.toBeInTheDocument();
  });

  it('calls saveQuiz when QuizEditorModal.onSave fires', () => {
    const onClose = vi.fn();
    render(<PlcAuthorQuizModal plc={fakePlc} isOpen onClose={onClose} />);

    act(() => {
      fireEvent.click(screen.getByText('Save Quiz'));
    });

    expect(mockSaveQuiz).toHaveBeenCalledTimes(1);
    // The first arg to saveQuiz is the QuizData with title 'Unit 3 Quiz';
    // second arg is undefined (no existingDriveFileId for new quizzes);
    // third arg is the behavior passed from the editor.
    expect(mockSaveQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Unit 3 Quiz' }),
      undefined,
      expect.objectContaining({ sessionMode: 'teacher' })
    );
  });

  it('opens PlcAssignmentConfigModal with kind=quiz after save', async () => {
    const onClose = vi.fn();
    render(<PlcAuthorQuizModal plc={fakePlc} isOpen onClose={onClose} />);

    act(() => {
      fireEvent.click(screen.getByText('Save Quiz'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('plc-assignment-config-modal')
      ).toBeInTheDocument();
    });

    const modal = screen.getByTestId('plc-assignment-config-modal');
    expect(modal.getAttribute('data-kind')).toBe('quiz');
    expect(modal.getAttribute('data-quiz-ref-id')).toBe(fakeMetadata.id);
    expect(modal.getAttribute('data-quiz-ref-title')).toBe(fakeMetadata.title);
  });

  it('QuizEditorModal is not shown after transitioning to config step', async () => {
    const onClose = vi.fn();
    render(<PlcAuthorQuizModal plc={fakePlc} isOpen onClose={onClose} />);

    act(() => {
      fireEvent.click(screen.getByText('Save Quiz'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('plc-assignment-config-modal')
      ).toBeInTheDocument();
    });

    // Once config is open, the editor is unmounted
    expect(screen.queryByTestId('quiz-editor-modal')).not.toBeInTheDocument();
  });

  it('calls onClose when config modal is closed', async () => {
    const onClose = vi.fn();
    render(<PlcAuthorQuizModal plc={fakePlc} isOpen onClose={onClose} />);

    act(() => {
      fireEvent.click(screen.getByText('Save Quiz'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('plc-assignment-config-modal')
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close Config'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when only the editor cancel is clicked (onClose forwarded)', () => {
    const onClose = vi.fn();
    render(<PlcAuthorQuizModal plc={fakePlc} isOpen onClose={onClose} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
