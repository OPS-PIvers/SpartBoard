import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

describe('Paper answer box picker', () => {
  it('stays hidden and skips the settings listener without the flag', () => {
    features.add('paper-answer-sheets');
    rollout.enabled = true;
    open();
    expect(detail().queryByText('Paper answer box')).toBeNull();
    expect(settingsHook).toHaveBeenCalledWith(false);
  });

  it('stays hidden while the paper sheets rollout is off', () => {
    grantAll();
    rollout.enabled = false;
    open();
    expect(detail().queryByText('Paper answer box')).toBeNull();
  });

  it('defaults to Medium with no word limit', () => {
    grantAll();
    open();
    const group = detail().getByRole('group', { name: 'Paper answer box' });
    expect(
      within(group)
        .getByRole('button', { name: 'Medium' })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('derives the default from the maximum word count', () => {
    grantAll();
    open(100);
    const group = detail().getByRole('group', { name: 'Paper answer box' });
    expect(
      within(group)
        .getByRole('button', { name: 'Large' })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('saves a picked size and marks the quiz dirty', () => {
    grantAll();
    open();
    const group = detail().getByRole('group', { name: 'Paper answer box' });
    fireEvent.click(within(group).getByRole('button', { name: 'Full page' }));
    expect(
      within(group)
        .getByRole('button', { name: 'Full page' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByTestId('editor-workspace').getAttribute('data-is-dirty')
    ).toBe('true');
  });
});
