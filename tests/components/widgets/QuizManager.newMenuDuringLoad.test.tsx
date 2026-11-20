import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuizConfig, QuizMetadata } from '@/types';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [] }) }));
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
vi.mock('@/hooks/useRubrics', () => ({ useRubrics: () => ({ rubrics: [] }) }));
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

const CONFIG = {
  view: 'manager',
  managerTab: 'library',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

const QUIZ: QuizMetadata = {
  id: 'quiz-1',
  title: 'Chapter 5 Review',
  driveFileId: 'drive-1',
  questionCount: 5,
  createdAt: 1000,
  updatedAt: 2000,
};

const manager = (loading: boolean, variant?: 'review') => (
  <QuizManager
    variant={variant}
    userId="teacher-1"
    quizzes={loading ? [] : [QUIZ]}
    loading={loading}
    error={null}
    onNew={vi.fn()}
    onImport={vi.fn()}
    onEdit={vi.fn()}
    onPreview={vi.fn()}
    onAssign={vi.fn()}
    onResults={vi.fn()}
    onDelete={vi.fn()}
    onShare={vi.fn()}
    rosters={[]}
    config={CONFIG}
    managerTab="library"
  />
);

describe('the New Quiz menu while the library loads', () => {
  it.each([
    ['Quiz', undefined],
    ['Review', 'review' as const],
  ])('stays open in %s when loading finishes', (_label, variant) => {
    const { rerender } = render(manager(true, variant));
    fireEvent.click(screen.getByRole('button', { name: 'New Quiz' }));
    const create = screen.getByRole('menuitem', { name: 'Create' });

    rerender(manager(false, variant));

    expect(screen.getByText('Chapter 5 Review')).toBeTruthy();
    expect(create.isConnected).toBe(true);
    expect(screen.getByRole('menuitem', { name: 'Create' })).toBe(create);
  });
});
