import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import { quizDeleteDetail } from '@/utils/quizDeleteDetail';
import type { QuizAssignment, QuizConfig, QuizMetadata } from '@/types';

const showConfirm = vi.fn();
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm,
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
  title: 'Chapter 5 Review',
  driveFileId: 'drive-1',
  questionCount: 5,
  createdAt: 1000,
  updatedAt: 2000,
};

const asg = (id: string, status: string, quizId = 'quiz-1') =>
  ({ id, quizId, status }) as unknown as QuizAssignment;

function renderLibrary() {
  const onDelete = vi.fn();
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
      onDelete={onDelete}
      onShare={vi.fn()}
      rosters={[]}
      config={CONFIG}
      managerTab="library"
    />
  );
  return { onDelete };
}

const clickDelete = () => {
  const menu = screen.getAllByRole('button').find((b) => {
    const label = b.getAttribute('aria-label') ?? '';
    return /more|options|menu/i.test(label) && label !== 'New Quiz';
  });
  if (!menu) throw new Error('row overflow menu not found');
  fireEvent.click(menu);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
};

describe('the Delete menu item', () => {
  beforeEach(() => showConfirm.mockReset());

  it('hands the quiz to the widget delete policy, which owns the confirm', async () => {
    const { onDelete } = renderLibrary();
    clickDelete();
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(QUIZ));
    expect(showConfirm).not.toHaveBeenCalled();
  });
});

describe('quizDeleteDetail', () => {
  it('says nothing without archived assignments', () => {
    expect(quizDeleteDetail([], 'quiz-1')).toBeUndefined();
    expect(quizDeleteDetail([asg('a', 'inactive', 'x')], 'quiz-1')).toBe(
      undefined
    );
  });

  it('counts archived assignments, singular and plural', () => {
    expect(quizDeleteDetail([asg('a', 'inactive')], 'quiz-1')).toContain(
      '1 archived assignment.'
    );
    expect(
      quizDeleteDetail([asg('a', 'inactive'), asg('b', 'inactive')], 'quiz-1')
    ).toContain('2 archived assignments.');
  });

  it('counts quizzes with archived assignments for a bulk delete', () => {
    expect(
      quizDeleteDetail(
        [asg('a', 'inactive'), asg('b', 'inactive', 'quiz-2')],
        ['quiz-1', 'quiz-2', 'quiz-3']
      )
    ).toBe(
      '2 quizzes have archived assignments. Deleting prevents viewing their monitor and results.'
    );
  });

  it('leaves live assignments to the existing block', () => {
    expect(
      quizDeleteDetail([asg('a', 'inactive'), asg('b', 'paused')], 'quiz-1')
    ).toBeUndefined();
  });
});
