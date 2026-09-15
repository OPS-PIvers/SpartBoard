/**
 * Regression test: stimuliEqual (the isDirty compare for QuizData.stimuli)
 * must include readAloudText/readAloudSource, the fields the read-aloud
 * feature (PR1) added to QuizStimulus after stimuliEqual was written.
 * Mirrors QuizEditorModal.isDirty.test.tsx's minWords/enforceWordLimit case,
 * but for stimuli instead of questions.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: vi.fn((id: string) => id === 'quiz-read-aloud'),
    canAccessQuizMediaResponse: vi.fn(() => false),
  })),
}));

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

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [],
    loading: false,
    error: null,
    saveRubric: vi.fn().mockResolvedValue(undefined),
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
  }),
}));

vi.mock('@/components/common/EditorWorkspace', () => ({
  EditorWorkspace: vi.fn(
    ({
      isOpen,
      contextPane,
      detailPane,
      isDirty,
    }: {
      isOpen: boolean;
      contextPane: React.ReactNode;
      detailPane: React.ReactNode;
      isDirty: boolean;
    }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="editor-workspace" data-is-dirty={String(isDirty)}>
          <div data-testid="context-pane">{contextPane}</div>
          <div data-testid="detail-pane">{detailPane}</div>
        </div>
      );
    }
  ),
}));

vi.mock('./QuizEditor', async () => {
  const actual =
    await vi.importActual<typeof import('./QuizEditor')>('./QuizEditor');
  return {
    ...actual,
    QuizAiOverlay: () => null,
  };
});

const stimulusQuiz: QuizData = {
  id: 'quiz-stimuli',
  title: 'Diagram Review',
  questions: [
    {
      id: 'q1',
      text: 'Label the diagram.',
      type: 'MC',
      correctAnswer: 'A',
      incorrectAnswers: ['B', 'C', 'D'],
      timeLimit: 30,
    },
  ],
  stimuli: [
    {
      id: 's1',
      type: 'image',
      url: 'https://example.com/diagram.png',
      label: 'Diagram',
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const dirtyAttr = () =>
  screen.getByTestId('editor-workspace').getAttribute('data-is-dirty');

describe('QuizEditorModal isDirty (stimuli compare)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips dirty when a stimulus read-aloud text is edited', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={stimulusQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(dirtyAttr()).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /^stimuli$/i }));

    const context = within(screen.getByTestId('context-pane'));
    fireEvent.click(context.getByRole('button', { name: 'Expand stimulus' }));
    fireEvent.click(context.getByRole('button', { name: /read-aloud text/i }));
    fireEvent.change(context.getByLabelText('Read-aloud text'), {
      target: { value: 'The diagram shows a plant cell.' },
    });

    expect(dirtyAttr()).toBe('true');
  });
});
