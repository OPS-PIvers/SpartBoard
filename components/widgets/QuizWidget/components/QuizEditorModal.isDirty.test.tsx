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
import { render, screen, fireEvent } from '@testing-library/react';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: vi.fn(() => false),
  })),
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
});
