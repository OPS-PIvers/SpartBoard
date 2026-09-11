/**
 * Regression test: applying a learning-target tag to a question via the
 * bulk "Tag" action must flip `isDirty`. `questionsEqual` (the dirty-check
 * comparator) previously ignored `QuizQuestion.targets`, so a tag-only edit
 * left `isDirty` false — clicking Cancel/X then calls `requestClose()`,
 * which skips the confirm dialog AND the save whenever `!isDirty`
 * (see EditorModalShell.requestClose), silently discarding the tag.
 *
 * Mocking strategy mirrors QuizEditorModal.isDirty.test.tsx; TargetPicker
 * is mocked to avoid its live Firestore-backed catalog/target-source hooks.
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

// Real TargetPicker pulls live Firestore-backed catalog/target-source hooks;
// stub it down to a single button that applies one tag in 'add' mode.
vi.mock('@/components/quiz/targets/TargetPicker', () => ({
  TargetPicker: ({
    onApply,
  }: {
    onApply: (
      tags: { id: string; kind: 'standard'; label: string }[],
      mode: 'add' | 'replace'
    ) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onApply([{ id: 'std-1', kind: 'standard', label: 'Standard 1' }], 'add')
      }
    >
      Apply tag
    </button>
  ),
}));

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

describe('QuizEditorModal isDirty (learning-target tagging)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flips dirty when a bulk tag is applied to a question with no other edits', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(dirtyAttr()).toBe('false');

    fireEvent.click(
      screen.getByRole('checkbox', { name: /select question 1/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /^tag$/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply tag/i }));

    // Tagging is the only change made — text, correctAnswer, points, etc.
    // are all untouched. The dirty-check must still catch it, or the
    // editor's close button silently discards the tag with no warning.
    expect(dirtyAttr()).toBe('true');
  });
});
