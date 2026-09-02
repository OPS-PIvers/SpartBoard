/**
 * Focused tests for the QuizEditorModal isDirty check after the perf pass
 * replaced `JSON.stringify(behavior) !== JSON.stringify(originalBehavior)`
 * with a field-by-field compare (and added a reference short-circuit for
 * questions). The semantics must be unchanged: editing flips dirty, and
 * reverting the edit — which yields a structurally equal but NOT
 * referentially equal behavior object — flips it back to clean.
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

const dirtyAttr = () =>
  screen.getByTestId('editor-workspace').getAttribute('data-is-dirty');

describe('QuizEditorModal isDirty (behavior compare)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips dirty on a behavior edit and back to clean when the edit is reverted', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(dirtyAttr()).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));

    // Change session mode → dirty.
    fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));
    expect(dirtyAttr()).toBe('true');

    // Revert to the original mode. The behavior object is now structurally
    // equal but NOT referentially equal to the original — the field-by-field
    // compare must still report clean (matching the old JSON.stringify).
    fireEvent.click(screen.getByRole('button', { name: /teacher-paced/i }));
    expect(dirtyAttr()).toBe('false');
  });

  it('flips dirty on a nested sessionOptions toggle and back on revert', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));

    // Gamification toggles live in a collapsible section.
    fireEvent.click(screen.getByText('Gamification'));
    const speedToggle = screen.getByRole('switch', {
      name: /speed bonus points/i,
    });

    fireEvent.click(speedToggle);
    expect(dirtyAttr()).toBe('true');

    fireEvent.click(speedToggle);
    expect(dirtyAttr()).toBe('false');
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
});
