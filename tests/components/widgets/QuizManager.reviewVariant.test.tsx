// Review hosts the same quiz library as Quiz (docs/plans/QUIZ_REVIEW_SPLIT.md D1).

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuizConfig, QuizMetadata } from '@/types';

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({ quizzes: [], loading: false, error: null }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
    canAccessFeature: vi.fn(() => false),
  }),
}));

const BASE_CONFIG: QuizConfig = {
  view: 'manager',
  managerTab: 'library',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

function makeQuizMeta(overrides: Partial<QuizMetadata> = {}): QuizMetadata {
  return {
    id: 'quiz-1',
    title: 'Chapter 5 Review',
    driveFileId: 'drive-1',
    questionCount: 5,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function renderManager(
  props: Partial<React.ComponentProps<typeof QuizManager>> = {}
) {
  const onAssign = vi.fn();
  render(
    <QuizManager
      quizzes={[makeQuizMeta()]}
      loading={false}
      error={null}
      onNew={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onPreview={vi.fn()}
      onAssign={onAssign as never}
      onResults={vi.fn()}
      onDelete={vi.fn()}
      onShare={vi.fn()}
      rosters={[]}
      config={BASE_CONFIG}
      managerTab="library"
      {...props}
    />
  );
  return { onAssign };
}

describe('QuizManager — Review variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Assign in the Quiz variant', async () => {
    renderManager();
    expect(
      await screen.findByRole('button', { name: /^assign$/i })
    ).toBeEnabled();
  });

  it('shows a disabled Start until the launch is wired', async () => {
    renderManager({ variant: 'review' });
    const start = await screen.findByRole('button', { name: /^start$/i });
    expect(start).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^assign$/i })).toBeNull();
  });

  it('hands the quiz to the Review launch instead of the assign flow', async () => {
    const onStartReview = vi.fn();
    const { onAssign } = renderManager({ variant: 'review', onStartReview });
    fireEvent.click(await screen.findByRole('button', { name: /^start$/i }));
    expect(onStartReview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('ignores the view-only share mode, which is Quiz-only', async () => {
    renderManager({ variant: 'review', assignmentMode: 'view-only' });
    expect(
      await screen.findByRole('button', { name: /^start$/i })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull();
  });
});
