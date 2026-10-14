import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@/i18n';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData } from '@/types';

const features = new Set<string>();

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: (id: string) => features.has(id),
    canAccessQuizMediaResponse: () => false,
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
    }: {
      isOpen: boolean;
      contextPane: React.ReactNode;
    }) => (isOpen ? <div data-testid="context-pane">{contextPane}</div> : null)
  ),
}));
vi.mock('./QuizEditor', async () => {
  const actual =
    await vi.importActual<typeof import('./QuizEditor')>('./QuizEditor');
  return { ...actual, QuizAiOverlay: () => null };
});

const question = (id: string) => ({
  id,
  text: `Question ${id}`,
  type: 'free-response' as const,
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 0,
});

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Unit 3',
  questions: [question('q1'), question('q2')],
  sections: [
    { id: 's1', title: 'Part 1' },
    { id: 's2', title: 'Part 2' },
  ],
  order: [
    { kind: 'section', id: 's1' },
    { kind: 'question', id: 'q1' },
    { kind: 'section', id: 's2' },
    { kind: 'question', id: 'q2' },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

beforeEach(() => {
  features.clear();
});

describe('Quiz editor sections', () => {
  it('keeps "Wait for teacher" after picking it', () => {
    features.add('quiz-import-versions');
    render(
      <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
    );
    const pane = within(screen.getByTestId('context-pane'));
    const select = pane.getByLabelText<HTMLSelectElement>('After this section');
    fireEvent.change(select, { target: { value: 'wait' } });
    expect(
      pane.getByLabelText<HTMLSelectElement>('After this section').value
    ).toBe('wait');
  });

  it('shows a renamed section title', () => {
    render(
      <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
    );
    const pane = within(screen.getByTestId('context-pane'));
    const [first] = pane.getAllByDisplayValue('Part 1');
    fireEvent.change(first, { target: { value: 'Reading' } });
    expect(pane.getByDisplayValue('Reading')).toBeTruthy();
  });
});
