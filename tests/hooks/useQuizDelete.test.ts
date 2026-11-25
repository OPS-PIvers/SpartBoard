import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuizDelete } from '@/hooks/useQuizDelete';
import { deletePaperBatchesForQuiz } from '@/utils/paperBatchStore';
import type { QuizAssignment, QuizMetadata } from '@/types';

const showConfirm = vi.fn();
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));
vi.mock('@/utils/paperBatchStore', () => ({
  deletePaperBatchesForQuiz: vi.fn(() => Promise.resolve()),
}));

const meta = (id: string): QuizMetadata =>
  ({ id, driveFileId: `drive-${id}`, title: `Quiz ${id}` }) as QuizMetadata;
const assignment = (quizId: string, status: QuizAssignment['status']) =>
  ({ id: `a-${quizId}-${status}`, quizId, status }) as QuizAssignment;

type Args = Parameters<typeof useQuizDelete>[0];

describe('useQuizDelete (the Quiz library delete policy)', () => {
  const addToast = vi.fn();
  const deleteQuiz = vi.fn((_id: string, _file: string) => Promise.resolve());
  const quizzes = [meta('q1'), meta('q2'), meta('q3')];
  const args = (over: Partial<Args> = {}): Args => ({
    quizzes,
    user: { uid: 'teacher-1' },
    assignments: [],
    assignmentsLoading: false,
    assignmentsError: null,
    addToast,
    deleteQuiz,
    ...over,
  });
  const render = (over: Partial<Args> = {}) =>
    renderHook(() => useQuizDelete(args(over))).result;

  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
  });

  it('asks once, deletes the quiz and its paper batches, and names it', async () => {
    const result = render();
    await act(() => result.current.onDelete(meta('q1')));
    expect(showConfirm).toHaveBeenCalledWith(
      'This cannot be undone.',
      expect.objectContaining({ title: 'Delete "Quiz q1"?' })
    );
    expect(deleteQuiz).toHaveBeenCalledWith('q1', 'drive-q1');
    expect(deletePaperBatchesForQuiz).toHaveBeenCalledWith('teacher-1', 'q1');
    expect(addToast).toHaveBeenCalledWith('"Quiz q1" deleted.', 'success');
  });

  it('carries the archived-assignment warning into the confirm', async () => {
    const result = render({ assignments: [assignment('q1', 'inactive')] });
    await act(() => result.current.onDelete(meta('q1')));
    expect(showConfirm).toHaveBeenCalledWith(
      'This quiz has 1 archived assignment. Deleting it prevents viewing their monitor and results. This cannot be undone.',
      expect.anything()
    );
  });

  it('deletes nothing when the teacher cancels', async () => {
    showConfirm.mockResolvedValue(false);
    const result = render();
    let attempted = true;
    await act(async () => {
      attempted = await result.current.onBulkDelete([meta('q1')]);
    });
    expect(attempted).toBe(false);
    expect(deleteQuiz).not.toHaveBeenCalled();
  });

  it('blocks a quiz with a live assignment before any confirm', async () => {
    const result = render({ assignments: [assignment('q1', 'paused')] });
    await act(() => result.current.onDelete(meta('q1')));
    expect(showConfirm).not.toHaveBeenCalled();
    expect(deleteQuiz).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(
      'Skipped 1 quiz with active or paused assignments. Deactivate them first.',
      'error'
    );
  });

  it('bulk delete skips live quizzes and deletes the rest in one confirm', async () => {
    const result = render({ assignments: [assignment('q2', 'active')] });
    await act(() => result.current.onBulkDelete(quizzes));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(deleteQuiz.mock.calls.map((c) => c[0])).toEqual(['q1', 'q3']);
    expect(addToast).toHaveBeenCalledWith('Deleted 2 quizzes.', 'success');
  });

  it('waits for assignments before deciding', async () => {
    const result = render({ assignmentsLoading: true });
    let attempted = true;
    await act(async () => {
      attempted = await result.current.onBulkDelete([meta('q1')]);
    });
    expect(attempted).toBe(false);
    expect(showConfirm).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(
      'Still loading assignments. Try again in a moment.',
      'info'
    );
  });

  it('reports failures without hiding the successes', async () => {
    deleteQuiz.mockImplementation((id: string) =>
      id === 'q2' ? Promise.reject(new Error('nope')) : Promise.resolve()
    );
    const result = render();
    await act(() => result.current.onBulkDelete(quizzes));
    expect(addToast).toHaveBeenCalledWith('Deleted 2 quizzes.', 'success');
    expect(addToast).toHaveBeenCalledWith('1 quiz failed to delete.', 'error');
    deleteQuiz.mockImplementation(() => Promise.resolve());
  });

  it('keeps a paper batch cleanup failure from failing the delete', async () => {
    vi.mocked(deletePaperBatchesForQuiz).mockRejectedValueOnce(new Error('x'));
    const result = render();
    await act(() => result.current.onDelete(meta('q1')));
    expect(addToast).toHaveBeenCalledWith('"Quiz q1" deleted.', 'success');
  });

  describe('folder delete', () => {
    it('marks live quizzes blocked and deletes only the others', async () => {
      const { folderDeleteActions } = render({
        assignments: [assignment('q2', 'active')],
      }).current;
      expect(folderDeleteActions.isBlocked?.('q2')).toBe(true);
      expect(folderDeleteActions.isBlocked?.('q1')).toBe(false);
      expect(folderDeleteActions.blockedReason?.(2)).toBe(
        '2 quizzes have live assignments'
      );
      await folderDeleteActions.deleteItems?.(['q1', 'q2', 'missing']);
      expect(deleteQuiz.mock.calls.map((c) => c[0])).toEqual(['q1']);
      expect(showConfirm).not.toHaveBeenCalled();
    });

    it('refuses while assignments are still loading', async () => {
      const { folderDeleteActions } = render({
        assignmentsError: new Error('x') as unknown as Args['assignmentsError'],
      }).current;
      await expect(folderDeleteActions.deleteItems?.(['q1'])).rejects.toThrow(
        "Couldn't check assignments. Try again in a moment."
      );
      expect(deleteQuiz).not.toHaveBeenCalled();
    });
  });
});
