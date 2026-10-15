import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData } from '@/types';

const features = new Set<string>();
const rollout = { enabled: false };
const settingsHook = vi.fn((_enabled?: boolean) => rollout);

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: (id: string) => features.has(id),
    canAccessQuizMediaResponse: () => false,
  })),
}));
vi.mock('@/hooks/usePaperAnswerSheetsSettings', () => ({
  usePaperAnswerSheetsSettings: (enabled?: boolean) => settingsHook(enabled),
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
      detailPane,
      isDirty,
    }: {
      isOpen: boolean;
      detailPane: React.ReactNode;
      isDirty: boolean;
    }) =>
      isOpen ? (
        <div data-testid="editor-workspace" data-is-dirty={String(isDirty)}>
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

const makeQuiz = (maxWords?: number): QuizData => ({
  id: 'quiz-1',
  title: 'Science Review',
  questions: [
    {
      id: 'q1',
      text: 'Explain photosynthesis.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 30,
      ...(maxWords ? { maxWords } : {}),
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
});

const detail = () => within(screen.getByTestId('detail-pane'));
const open = (maxWords?: number) =>
  render(
    <QuizEditorModal
      isOpen
      quiz={makeQuiz(maxWords)}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />
  );
const grantAll = () => {
  features.add('paper-handwritten-responses');
  features.add('paper-answer-sheets');
  rollout.enabled = true;
};

beforeEach(() => {
  features.clear();
  rollout.enabled = false;
  settingsHook.mockClear();
});

describe('Paper answer box', () => {
  it('is not asked in the question editor, even with paper sheets on', () => {
    grantAll();
    open(100);
    expect(detail().queryByText('Paper answer box')).toBeNull();
    expect(detail().queryByRole('radiogroup')).toBeNull();
  });
});
