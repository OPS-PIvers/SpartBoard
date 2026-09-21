/**
 * The Assign gate for quizzes imported without a full answer key
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D6). The count comes off
 * `QuizMetadata.needsKeyCount`, which is written on save, so the library
 * answers this without loading the quiz body from Drive.
 *
 * Mocking mirrors QuizManager.assign.test.tsx: heavy hooks stubbed, library
 * primitives left real, rendered at the library tab.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  quizMeta: QuizMetadata,
  extra: { assignmentMode?: 'submissions' | 'view-only' } = {}
) {
  const onAssign = vi.fn();
  render(
    <QuizManager
      quizzes={[quizMeta]}
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
      assignmentMode={extra.assignmentMode ?? 'submissions'}
    />
  );
  return { onAssign };
}

describe('QuizManager — quizzes with questions that still need an answer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves Assign enabled when every question has an answer', async () => {
    renderManager(makeQuizMeta({ needsKeyCount: 0 }));
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    expect(assignBtn).toBeEnabled();
  });

  it('leaves Assign enabled for a quiz saved before the count existed', async () => {
    renderManager(makeQuizMeta());
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    expect(assignBtn).toBeEnabled();
  });

  it('disables Assign and says how many answers are missing', async () => {
    renderManager(makeQuizMeta({ needsKeyCount: 3 }));
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    expect(assignBtn).toBeDisabled();
    expect(assignBtn).toHaveAttribute(
      'title',
      expect.stringContaining('3 questions still need an answer')
    );
  });

  it('says it in the singular for one missing answer', async () => {
    renderManager(makeQuizMeta({ needsKeyCount: 1 }));
    const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
    expect(assignBtn).toHaveAttribute(
      'title',
      expect.stringContaining('1 question still needs an answer')
    );
  });

  it('badges the card so the teacher sees why before hovering', async () => {
    renderManager(makeQuizMeta({ needsKeyCount: 2 }));
    expect(await screen.findByText(/needs answers · 2/i)).toBeInTheDocument();
  });

  it('keeps a view-only Share available — it carries no scoring', async () => {
    renderManager(makeQuizMeta({ needsKeyCount: 3 }), {
      assignmentMode: 'view-only',
    });
    const shareBtn = await screen.findByRole('button', { name: /^share$/i });
    expect(shareBtn).toBeEnabled();
  });
});
