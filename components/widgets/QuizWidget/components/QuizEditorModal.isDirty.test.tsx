/**
 * Focused tests for the QuizEditorModal isDirty check on question edits.
 *
 * Mocking strategy mirrors tests/components/widgets/QuizEditorModal.test.tsx.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData, Rubric } from '@/types';

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

// Minimal EditorWorkspace mock: renders both panes and exposes isDirty via a
// data attribute for assertions.
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

const RUBRIC: Rubric = {
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

const rubricQuiz: QuizData = {
  id: 'quiz-2',
  title: 'Writing',
  questions: [
    {
      id: 'q1',
      text: 'Explain your reasoning.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 60,
      // Matches the rubric's criteria max-sum (3 + 4), so a rubric edit that
      // preserves the level points leaves `points` untouched.
      points: 7,
      rubricId: 'rub-1',
      rubricSnapshot: RUBRIC,
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const wordLimitQuiz: QuizData = {
  id: 'quiz-3',
  title: 'Reflection',
  questions: [
    {
      id: 'q1',
      text: 'Reflect on the reading.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      // maxWords pre-set so the "Enforce limit" toggle is visible from render.
      maxWords: 200,
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const dirtyAttr = () =>
  screen.getByTestId('editor-workspace').getAttribute('data-is-dirty');

describe('QuizEditorModal isDirty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips dirty when a rubric edit leaves the question points unchanged', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={rubricQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(dirtyAttr()).toBe('false');

    const detail = () => within(screen.getByTestId('detail-pane'));
    fireEvent.click(detail().getByRole('button', { name: 'Edit' }));

    // Rename a criterion — the level points (and so the question's points)
    // are untouched, so only the snapshot itself differs.
    fireEvent.change(screen.getByLabelText('Criterion 1 name'), {
      target: { value: 'Thesis Statement' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Attach to question' }));

    expect(
      detail().getByRole<HTMLInputElement>('spinbutton', { name: 'Points' })
        .valueAsNumber
    ).toBe(7);
    expect(dirtyAttr()).toBe('true');
  });

  it('flips dirty when a free-response minimum word count is set', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={wordLimitQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(dirtyAttr()).toBe('false');

    const detail = () => within(screen.getByTestId('detail-pane'));
    fireEvent.change(detail().getByLabelText('Minimum words'), {
      target: { value: '50' },
    });
    expect(dirtyAttr()).toBe('true');

    // Revert to the original (unset) minimum — back to clean.
    fireEvent.change(detail().getByLabelText('Minimum words'), {
      target: { value: '' },
    });
    expect(dirtyAttr()).toBe('false');
  });

  it('flips dirty when "Enforce limit" is toggled on a free-response question', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={wordLimitQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(dirtyAttr()).toBe('false');

    const detail = () => within(screen.getByTestId('detail-pane'));
    const enforceToggle = detail().getByRole('switch', {
      name: 'Enforce limit',
    });
    fireEvent.click(enforceToggle);
    expect(dirtyAttr()).toBe('true');

    fireEvent.click(enforceToggle);
    expect(dirtyAttr()).toBe('false');
  });

  it('shows the printed number in the list and edits it in the question form', () => {
    const labelled: QuizData = {
      ...fakeQuiz,
      questions: [{ ...fakeQuiz.questions[0], sourceLabel: '2·3' }],
    };
    render(
      <QuizEditorModal
        isOpen
        quiz={labelled}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const context = within(screen.getByTestId('context-pane'));
    expect(context.getByText('· printed 2·3')).toBeTruthy();

    const field = within(screen.getByTestId('detail-pane')).getByLabelText(
      'Printed number'
    );
    expect((field as HTMLInputElement).value).toBe('2·3');

    fireEvent.change(field, { target: { value: '' } });
    expect(dirtyAttr()).toBe('true');
    expect(context.queryByText(/printed/)).toBeNull();

    fireEvent.change(field, { target: { value: '2·3' } });
    expect(dirtyAttr()).toBe('false');
  });

  it('shows no printed-number field on a question no import labelled', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(
      within(screen.getByTestId('detail-pane')).queryByLabelText(
        'Printed number'
      )
    ).toBeNull();
  });
});
