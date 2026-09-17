import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ rubrics: [] }),
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

const CONFIG = {
  view: 'manager',
  managerTab: 'library',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

const QUIZ: QuizMetadata = {
  id: 'quiz-1',
  title: 'Unit 3 Test',
  driveFileId: 'drive-1',
  questionCount: 10,
  createdAt: 1000,
  updatedAt: 2000,
};

function renderLibrary(
  overrides: Partial<React.ComponentProps<typeof QuizManager>> = {}
) {
  render(
    <QuizManager
      userId="teacher-1"
      quizzes={[QUIZ]}
      loading={false}
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
      {...overrides}
    />
  );
}

const openRowMenu = () => {
  const menu = screen
    .getAllByRole('button')
    .find((b) => /more|options|menu/i.test(b.getAttribute('aria-label') ?? ''));
  if (!menu) throw new Error('row overflow menu not found');
  fireEvent.click(menu);
};

describe('QuizManager — paper answer sheets', () => {
  it('shows no paper entry points when the feature is off', () => {
    renderLibrary();
    expect(screen.queryByRole('button', { name: 'Paper test' })).toBeNull();
    openRowMenu();
    expect(screen.queryByText('Print answer sheets')).toBeNull();
  });

  it('offers Print answer sheets in the row menu when the feature is on', () => {
    const onPrintPaperSheets = vi.fn();
    renderLibrary({ onPrintPaperSheets });
    openRowMenu();
    fireEvent.click(screen.getByText('Print answer sheets'));
    expect(onPrintPaperSheets).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('offers a Paper test door beside Import, never as a tab', () => {
    const onNewPaperTest = vi.fn();
    renderLibrary({ onNewPaperTest });
    expect(screen.queryByRole('tab', { name: /paper/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Paper test' }));
    expect(onNewPaperTest).toHaveBeenCalledTimes(1);
  });
});
