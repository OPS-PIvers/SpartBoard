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

function renderLibrary(assignments: QuizAssignment[]) {
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
      deleteDetail={(q) => quizDeleteDetail(assignments, q.id)}
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

describe('deleting a quiz asks once', () => {
  beforeEach(() => {
    showConfirm.mockReset();
    showConfirm.mockResolvedValue(true);
  });

  it('with no archived assignments, one confirm with no warning', async () => {
    const { onDelete } = renderLibrary([]);
    clickDelete();
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showConfirm).toHaveBeenCalledWith(
      'This cannot be undone.',
      expect.objectContaining({ title: 'Delete "Chapter 5 Review"?' })
    );
  });

  it('with archived assignments, one confirm that carries the warning', async () => {
    const { onDelete } = renderLibrary([
      asg('a1', 'inactive'),
      asg('a2', 'inactive'),
      asg('other', 'active', 'quiz-2'),
    ]);
    clickDelete();
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showConfirm).toHaveBeenCalledWith(
      'This quiz has 2 archived assignments. Deleting it prevents viewing their monitor and results. This cannot be undone.',
      expect.objectContaining({ title: 'Delete "Chapter 5 Review"?' })
    );
  });

  it('does not delete when the teacher cancels', async () => {
    showConfirm.mockResolvedValue(false);
    const { onDelete } = renderLibrary([asg('a1', 'inactive')]);
    clickDelete();
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    expect(onDelete).not.toHaveBeenCalled();
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

  it('leaves live assignments to the existing block', () => {
    expect(
      quizDeleteDetail([asg('a', 'inactive'), asg('b', 'paused')], 'quiz-1')
    ).toBeUndefined();
  });
});
