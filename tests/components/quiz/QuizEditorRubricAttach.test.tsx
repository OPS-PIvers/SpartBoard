/**
 * Integration: rubric attach/detach in the quiz editor detail pane.
 * Guards that stashed manual points are keyed per question.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { QuizData, Rubric } from '@/types';

const LIBRARY_RUBRIC: Rubric = {
  id: 'rub-1',
  title: 'Paragraph Rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      levels: [
        { id: 'l1', label: 'Below', points: 1 },
        { id: 'l2', label: 'Meets', points: 3 },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'l3', label: 'Below', points: 1 },
        { id: 'l4', label: 'Meets', points: 4 },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [LIBRARY_RUBRIC],
    loading: false,
    error: null,
    saveRubric: vi.fn().mockResolvedValue(undefined),
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: vi.fn(() => false),
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

vi.mock('@/components/common/EditorWorkspace', () => ({
  EditorWorkspace: ({
    isOpen,
    contextPane,
    detailPane,
  }: {
    isOpen: boolean;
    contextPane: React.ReactNode;
    detailPane: React.ReactNode;
  }) =>
    isOpen ? (
      <div>
        <div data-testid="context-pane">{contextPane}</div>
        <div data-testid="detail-pane">{detailPane}</div>
      </div>
    ) : null,
}));

import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';

const PRE_ATTACHED: Rubric = { ...LIBRARY_RUBRIC, id: 'rub-old' };

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Writing',
  questions: [
    {
      id: 'q1',
      text: 'Question one',
      type: 'essay',
      points: 5,
      incorrectAnswers: [],
      correctAnswer: '',
      timeLimit: 60,
    },
    {
      id: 'q2',
      text: 'Question two',
      type: 'short',
      points: 9,
      incorrectAnswers: [],
      correctAnswer: '',
      timeLimit: 60,
    },
    {
      id: 'q3',
      text: 'Question three',
      type: 'essay',
      points: 7,
      incorrectAnswers: [],
      correctAnswer: '',
      timeLimit: 60,
      rubricId: 'rub-old',
      rubricSnapshot: PRE_ATTACHED,
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const detail = () => within(screen.getByTestId('detail-pane'));
const pointsInput = () => detail().getByRole('spinbutton', { name: 'Points' });

const selectQuestion = (text: string) => {
  fireEvent.click(within(screen.getByTestId('context-pane')).getByText(text));
};

const attachLibraryRubric = () => {
  fireEvent.click(detail().getByRole('button', { name: 'Attach Rubric' }));
  fireEvent.change(screen.getByLabelText('Library'), {
    target: { value: LIBRARY_RUBRIC.id },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Attach to question' }));
};

describe('QuizEditor — rubric attach/detach points stash', () => {
  beforeEach(() => vi.clearAllMocks());

  const open = () =>
    render(
      <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
    );

  it('attaching a rubric sets points to the criteria max-sum and disables the input', () => {
    open();
    selectQuestion('Question one');
    expect(pointsInput().valueAsNumber).toBe(5);

    attachLibraryRubric();

    expect(pointsInput().valueAsNumber).toBe(7); // 3 + 4
    expect(pointsInput()).toBeDisabled();
    expect(
      detail().getByText('Points come from the attached rubric.')
    ).toBeInTheDocument();
  });

  it('detach restores the points of the question the rubric was attached to', () => {
    open();
    // Attach on Q1 first so a stash for a different question exists.
    selectQuestion('Question one');
    attachLibraryRubric();

    selectQuestion('Question two');
    expect(pointsInput().valueAsNumber).toBe(9);
    attachLibraryRubric();
    expect(pointsInput().valueAsNumber).toBe(7);

    fireEvent.click(detail().getByRole('button', { name: 'Detach' }));
    expect(pointsInput().valueAsNumber).toBe(9);
    expect(pointsInput()).toBeEnabled();
  });

  it('detaching a rubric attached in a prior session keeps the current points', () => {
    open();
    selectQuestion('Question three');
    expect(pointsInput().valueAsNumber).toBe(7);

    fireEvent.click(detail().getByRole('button', { name: 'Detach' }));
    expect(pointsInput().valueAsNumber).toBe(7);
    expect(pointsInput()).toBeEnabled();
  });

  it('switching questions closes an open rubric builder', () => {
    open();
    selectQuestion('Question one');
    fireEvent.click(detail().getByRole('button', { name: 'Attach Rubric' }));
    expect(screen.getByLabelText('Rubric builder')).toBeInTheDocument();

    selectQuestion('Question two');
    expect(screen.queryByLabelText('Rubric builder')).not.toBeInTheDocument();
  });
});
