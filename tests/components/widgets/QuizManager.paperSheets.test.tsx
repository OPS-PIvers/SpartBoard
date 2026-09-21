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
  const menu = screen.getAllByRole('button').find((b) => {
    const label = b.getAttribute('aria-label') ?? '';
    return /more|options|menu/i.test(label) && label !== 'More ways to create';
  });
  if (!menu) throw new Error('row overflow menu not found');
  fireEvent.click(menu);
};

describe('QuizManager — paper answer sheets', () => {
  it('shows no paper entry points when the feature is off', () => {
    renderLibrary();
    expect(screen.queryByRole('button', { name: 'Paper test' })).toBeNull();
    openRowMenu();
    expect(screen.queryByText('Print response sheets')).toBeNull();
    expect(screen.queryByText('Import questions')).toBeNull();
  });

  it('offers Print response sheets in the row menu when the feature is on', () => {
    const onPrintPaperSheets = vi.fn();
    renderLibrary({ onPrintPaperSheets });
    openRowMenu();
    fireEvent.click(screen.getByText('Print response sheets'));
    expect(onPrintPaperSheets).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('offers Import responses in the row menu when wired', () => {
    const onImportPaperScan = vi.fn();
    renderLibrary({ onImportPaperScan });
    openRowMenu();
    fireEvent.click(screen.getByText('Import responses'));
    expect(onImportPaperScan).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('offers Import questions in the row menu when wired', () => {
    const onReadPaperQuestions = vi.fn();
    renderLibrary({ onReadPaperQuestions });
    openRowMenu();
    fireEvent.click(screen.getByText('Import questions'));
    expect(onReadPaperQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('offers Paper test behind the New Quiz caret, never as its own button or tab', () => {
    const onNewPaperTest = vi.fn();
    const onNew = vi.fn();
    renderLibrary({ onNewPaperTest, onNew });
    expect(screen.queryByRole('tab', { name: /paper/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Paper test' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New Quiz' }));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNewPaperTest).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'More ways to create' })
    );
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(items).toEqual(['Import', 'Paper test']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paper test' }));
    expect(onNewPaperTest).toHaveBeenCalledTimes(1);
  });

  it('keeps Import in the caret menu when paper is off, with no Import button', () => {
    const onImport = vi.fn();
    renderLibrary({ onImport });
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'More ways to create' })
    );
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(
      ['Import']
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
