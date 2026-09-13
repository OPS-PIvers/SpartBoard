/**
 * The Languages tab must be wired at all FOUR sites (plan §8/§16): state
 * union, tab strip, contextPane branch and detailPane branch. Missing either
 * branch renders the Settings panes under the Languages tab with no type
 * error, so this test asserts the panes by content, not by tab presence alone.
 * Mocking strategy mirrors QuizEditorModal.isDirty.test.tsx.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData } from '@/types';

const { canAccessFeature } = vi.hoisted(() => ({
  canAccessFeature: vi.fn((feature: string) => feature === 'quiz-translation'),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature,
    canAccessQuizMediaResponse: vi.fn(() => false),
  })),
}));

vi.mock('@/hooks/useQuizTranslations', () => ({
  useQuizTranslations: () => ({
    byLocale: {},
    loading: {},
    load: vi.fn(),
    generate: vi.fn(),
    editQuestion: vi.fn(),
    setReviewed: vi.fn(),
    save: vi.fn(),
    staleIds: () => [],
    cap: null,
    error: null,
  }),
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
    saveRubric: vi.fn(),
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
    }: {
      isOpen: boolean;
      contextPane: React.ReactNode;
      detailPane: React.ReactNode;
    }) =>
      isOpen ? (
        <div data-testid="editor-workspace">
          <div data-testid="context-pane">{contextPane}</div>
          <div data-testid="detail-pane">{detailPane}</div>
        </div>
      ) : null
  ),
}));

vi.mock('./QuizEditor', async () => {
  const actual =
    await vi.importActual<typeof import('./QuizEditor')>('./QuizEditor');
  return { ...actual, QuizAiOverlay: () => null };
});

const quiz: QuizData = {
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

const bankQuiz: QuizData = {
  ...quiz,
  id: 'quiz-bank',
  bankSlots: [
    {
      id: 'slot-1',
      bankId: 'bank-1',
      bankTitle: 'Bank',
      mode: 'random',
      count: 3,
    },
  ],
};

const openTab = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  vi.clearAllMocks();
  canAccessFeature.mockImplementation(
    (feature: string) => feature === 'quiz-translation'
  );
});

describe('QuizEditorModal Languages tab', () => {
  it('renders the tab when the feature is granted', () => {
    render(
      <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Languages' })).toBeTruthy();
  });

  it('hides the tab when the feature is not granted', () => {
    canAccessFeature.mockReturnValue(false);
    render(
      <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Languages' })).toBeNull();
  });

  it('renders its OWN context and detail panes, not the Settings ones', () => {
    render(
      <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
    );
    openTab('Languages');

    const context = screen.getByTestId('context-pane');
    const detail = screen.getByTestId('detail-pane');
    // Site 3: the language picker, not the behavior settings panel.
    expect(context.textContent).toContain('Pick a language');
    // Site 4: the Languages empty state, not the Settings blurb.
    expect(detail.textContent).toContain('No language chosen');
    expect(detail.textContent).not.toContain(
      'Settings saved with the quiz are the defaults'
    );
  });

  it('disables the tab for a bank-slot quiz (D29)', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={bankQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const tab = screen.getByRole('button', { name: 'Languages' });
    expect(tab).toHaveProperty('disabled', true);
    openTab('Languages');
    expect(screen.getByTestId('detail-pane').textContent).not.toContain(
      'No language chosen'
    );
  });
});
