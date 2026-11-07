import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuizAssignment, QuizConfig, QuizMetadata } from '@/types';

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
    return /more|options|menu/i.test(label) && label !== 'New Quiz';
  });
  if (!menu) throw new Error('row overflow menu not found');
  fireEvent.click(menu);
};

describe('QuizManager — paper answer sheets', () => {
  it('shows no paper entry points when the feature is off', () => {
    renderLibrary();
    expect(screen.queryByRole('button', { name: 'Paper test' })).toBeNull();
    openRowMenu();
    expect(screen.queryByText('Assign on paper')).toBeNull();
    expect(screen.queryByText('Import questions')).toBeNull();
  });

  it('offers Assign on paper in the row menu when the feature is on', () => {
    const onAssignOnPaper = vi.fn();
    renderLibrary({ onAssignOnPaper });
    openRowMenu();
    expect(screen.queryByText('Print response sheets')).toBeNull();
    expect(screen.queryByText('Import responses')).toBeNull();
    fireEvent.click(screen.getByText('Assign on paper'));
    expect(onAssignOnPaper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('offers Import responses on a quiz with a stack no Paper card owns', () => {
    const onImportLooseStack = vi.fn();
    renderLibrary({ onImportLooseStack, hasLooseStack: () => true });
    openRowMenu();
    fireEvent.click(screen.getByText('Import responses'));
    expect(onImportLooseStack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('hides the stack import when every stack has a Paper card', () => {
    renderLibrary({ onImportLooseStack: vi.fn(), hasLooseStack: () => false });
    openRowMenu();
    expect(screen.queryByText('Import responses')).toBeNull();
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

  it('New Quiz opens a Create / Import menu with no Paper test', () => {
    const onImport = vi.fn();
    renderLibrary({ onImport });
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New Quiz' }));
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(
      ['Create', 'Import']
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

const PAPER: QuizAssignment = {
  id: 'qa-paper',
  quizId: 'quiz-1',
  quizTitle: 'Unit 3 Test',
  quizDriveFileId: 'drive-1',
  teacherUid: 'teacher-1',
  code: 'KQ100',
  sessionMode: 'student',
  sessionOptions: {},
  status: 'paused',
  paper: true,
  paperBatchId: 'batch-1',
  periodNames: ['Period 1', 'Period 2'],
  createdAt: 1000,
  updatedAt: 1000,
};

const renderTab = (
  managerTab: 'active' | 'archive',
  assignment: QuizAssignment,
  overrides: Partial<React.ComponentProps<typeof QuizManager>> = {}
) =>
  renderLibrary({
    managerTab,
    assignments: [assignment],
    assignmentsLoading: false,
    ...overrides,
  });

describe('QuizManager — paper assignment card', () => {
  it('shows Paper with Import responses instead of Start, and no join code', () => {
    const onImportPaperResponses = vi.fn();
    renderTab('active', PAPER, { onImportPaperResponses });
    expect(screen.getByText('Paper')).toBeTruthy();
    expect(screen.queryByText('Paused')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
    expect(screen.queryByText('KQ100')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Import responses/ }));
    expect(onImportPaperResponses).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qa-paper' })
    );
  });

  it('offers Print response sheets and Delete in the Paper card menu', () => {
    const onReprintPaperSheets = vi.fn();
    renderTab('active', PAPER, {
      onImportPaperResponses: vi.fn(),
      onReprintPaperSheets,
    });
    openRowMenu();
    expect(screen.getByText('Delete')).toBeTruthy();
    fireEvent.click(screen.getByText('Print response sheets'));
    expect(onReprintPaperSheets).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qa-paper' })
    );
  });

  it('keeps Import responses and Print response sheets after it completes', () => {
    const onImportPaperResponses = vi.fn();
    const onReprintPaperSheets = vi.fn();
    renderTab(
      'archive',
      { ...PAPER, status: 'inactive' },
      { onImportPaperResponses, onReprintPaperSheets }
    );
    openRowMenu();
    expect(screen.getByText('Print response sheets')).toBeTruthy();
    fireEvent.click(screen.getByText('Import responses'));
    expect(onImportPaperResponses).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qa-paper' })
    );
  });

  it('offers no import on a Paper card once paper sheets are off', () => {
    renderTab('active', PAPER);
    expect(screen.getByText('Paper')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Import responses/ })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
  });

  it('reads like any other completed card once imported', () => {
    renderTab('archive', { ...PAPER, status: 'inactive' });
    expect(screen.queryByText('Paper')).toBeNull();
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Results/ })).toBeTruthy();
  });
});

describe('QuizManager — Add answer key (R31)', () => {
  it('offers Add answer key on a quiz that still needs answers', () => {
    const onAddAnswerKey = vi.fn();
    renderLibrary({ quizzes: [{ ...QUIZ, needsKeyCount: 2 }], onAddAnswerKey });
    openRowMenu();
    fireEvent.click(screen.getByText('Add answer key'));
    expect(onAddAnswerKey).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'quiz-1' })
    );
  });

  it('hides it when every question has an answer', () => {
    renderLibrary({
      quizzes: [{ ...QUIZ, needsKeyCount: 0 }],
      onAddAnswerKey: vi.fn(),
    });
    openRowMenu();
    expect(screen.queryByText('Add answer key')).toBeNull();
  });

  it('hides it when document import is off', () => {
    renderLibrary({ quizzes: [{ ...QUIZ, needsKeyCount: 2 }] });
    openRowMenu();
    expect(screen.queryByText('Add answer key')).toBeNull();
  });
});

const HYBRID: QuizAssignment = {
  ...PAPER,
  id: 'qa-hybrid',
  status: 'active',
  paper: undefined,
  writtenOnPaper: true,
  paperWrittenQuestionIds: ['q3'],
  paperWrittenSeats: 26,
  paperWrittenScanned: 18,
};

describe('QuizManager — written answers on paper card', () => {
  it('shows the scanned count and offers Import written answers while running', () => {
    const onImportPaperResponses = vi.fn();
    renderTab('active', HYBRID, {
      onImportPaperResponses,
      onReprintPaperSheets: vi.fn(),
    });
    expect(screen.getByText('Paper 18/26 scanned')).toBeTruthy();
    openRowMenu();
    expect(screen.getByText('Print written answer sheets')).toBeTruthy();
    fireEvent.click(screen.getByText('Import written answers'));
    expect(onImportPaperResponses).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qa-hybrid' })
    );
  });

  it('still imports written answers after the assignment ends', () => {
    const onImportPaperResponses = vi.fn();
    renderTab(
      'archive',
      { ...HYBRID, status: 'inactive', paperWrittenScanned: undefined },
      { onImportPaperResponses }
    );
    expect(screen.getByText('Paper 0/26 scanned')).toBeTruthy();
    openRowMenu();
    fireEvent.click(screen.getByText('Import written answers'));
    expect(onImportPaperResponses).toHaveBeenCalledOnce();
  });

  it('offers no import once paper sheets are off', () => {
    renderTab('active', HYBRID);
    openRowMenu();
    expect(screen.queryByText('Import written answers')).toBeNull();
  });
});
