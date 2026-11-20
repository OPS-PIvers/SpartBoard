import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useQuizDelete } from '@/hooks/useQuizDelete';
import type { QuizAssignment, QuizMetadata } from '@/types';

vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __db: true } }));

const mockCollection = collection as Mock;
const mockGetDocs = getDocs as Mock;
const mockQuery = query as Mock;
const mockWhere = where as Mock;
const mockWriteBatch = writeBatch as Mock;

const meta = (id: string): QuizMetadata =>
  ({ id, driveFileId: `drive-${id}`, title: id }) as QuizMetadata;

const assignment = (
  quizId: string,
  status: QuizAssignment['status']
): QuizAssignment =>
  ({ id: `a-${quizId}-${status}`, quizId, status }) as QuizAssignment;

type Args = Parameters<typeof useQuizDelete>[0];

describe('useQuizDelete', () => {
  const calls: string[] = [];
  const addToast = vi.fn((msg: string, type?: string) => {
    calls.push(`toast:${type}:${msg}`);
  });
  const showConfirm = vi.fn<Args['showConfirm']>();
  const recordDelete = (id: string, driveFileId: string) => {
    calls.push(`deleteQuiz:${id}:${driveFileId}`);
    return Promise.resolve();
  };
  const deleteQuiz = vi.fn(recordDelete);
  const batchDelete = vi.fn((ref: { id: string }) => {
    calls.push(`batch.delete:${ref.id}`);
  });
  const batchCommit = vi.fn(() => {
    calls.push('batch.commit');
    return Promise.resolve();
  });
  let consoleWarn: MockInstance<typeof console.warn>;
  let consoleError: MockInstance<typeof console.error>;

  const baseArgs = (over: Partial<Args> = {}): Args => ({
    user: { uid: 'teacher-1' },
    quizzes: [meta('q1'), meta('q2'), meta('q3')],
    assignments: [],
    assignmentsLoading: false,
    assignmentsError: null,
    addToast,
    showConfirm,
    deleteQuiz,
    ...over,
  });

  const paperBatches = (ids: string[]) => {
    mockGetDocs.mockImplementation(() => {
      calls.push('getDocs');
      return Promise.resolve({
        empty: ids.length === 0,
        docs: ids.map((id) => ({ ref: { id } })),
      });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    deleteQuiz.mockReset().mockImplementation(recordDelete);
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) => ({
      path: segs.join('/'),
    }));
    mockWhere.mockImplementation((f: string, op: string, v: string) => ({
      where: [f, op, v],
    }));
    mockQuery.mockImplementation((ref: unknown, w: unknown) => ({ ref, w }));
    mockWriteBatch.mockReturnValue({
      delete: batchDelete,
      commit: batchCommit,
    });
    paperBatches([]);
    showConfirm.mockResolvedValue(true);
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  describe('onDelete', () => {
    it('blocks a quiz with active or paused assignments and counts only those', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(
          baseArgs({
            assignments: [
              assignment('q1', 'active'),
              assignment('q1', 'paused'),
              assignment('q1', 'inactive'),
              assignment('q2', 'active'),
            ],
          })
        )
      );

      await result.current.onDelete(meta('q1'));

      expect(calls).toEqual([
        'toast:error:Cannot delete: 2 active or paused assignment(s) still reference this quiz. Deactivate them first.',
      ]);
      expect(deleteQuiz).not.toHaveBeenCalled();
      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('deletes a quiz with only archived assignments, then clears its paper batches, then toasts', async () => {
      paperBatches(['b1', 'b2']);
      const { result } = renderHook(() =>
        useQuizDelete(baseArgs({ assignments: [assignment('q1', 'inactive')] }))
      );

      await result.current.onDelete(meta('q1'));

      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'getDocs',
        'batch.delete:b1',
        'batch.delete:b2',
        'batch.commit',
        'toast:success:Quiz deleted.',
      ]);
      expect(mockCollection).toHaveBeenCalledWith(
        { __db: true },
        'users',
        'teacher-1',
        'paper_batches'
      );
      expect(mockWhere).toHaveBeenCalledWith('quizId', '==', 'q1');
    });

    it('skips the batch write when the quiz has no paper batches', async () => {
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.onDelete(meta('q1'));

      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'getDocs',
        'toast:success:Quiz deleted.',
      ]);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('skips paper batch cleanup with no signed-in user', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(baseArgs({ user: null }))
      );

      await result.current.onDelete(meta('q1'));

      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'toast:success:Quiz deleted.',
      ]);
    });

    it('still reports success when paper batch cleanup fails', async () => {
      const cleanupErr = new Error('rules');
      mockGetDocs.mockRejectedValue(cleanupErr);
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.onDelete(meta('q1'));

      expect(consoleWarn).toHaveBeenCalledWith(
        '[QuizWidget] paper batch cleanup:',
        cleanupErr
      );
      expect(addToast.mock.calls).toEqual([['Quiz deleted.', 'success']]);
    });

    it('toasts the error message and skips cleanup when the delete fails', async () => {
      deleteQuiz.mockRejectedValueOnce(new Error('Drive said no'));
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.onDelete(meta('q1'));

      expect(addToast.mock.calls).toEqual([['Drive said no', 'error']]);
      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('toasts "Delete failed" for a non-Error rejection', async () => {
      deleteQuiz.mockRejectedValueOnce('nope');
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.onDelete(meta('q1'));

      expect(addToast.mock.calls).toEqual([['Delete failed', 'error']]);
    });

    it('reads the user from the render it was called in, after the delete awaits', async () => {
      let release: () => void = () => undefined;
      deleteQuiz.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      const { result, rerender } = renderHook(
        (args: Args) => useQuizDelete(args),
        {
          initialProps: baseArgs(),
        }
      );

      const pending = result.current.onDelete(meta('q1'));
      rerender(baseArgs({ user: { uid: 'teacher-2' } }));
      release();
      await pending;

      expect(mockCollection).toHaveBeenCalledTimes(1);
      expect(mockCollection).toHaveBeenCalledWith(
        { __db: true },
        'users',
        'teacher-1',
        'paper_batches'
      );
    });
  });

  describe('onBulkDelete', () => {
    it('aborts while assignments are loading', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(baseArgs({ assignmentsLoading: true }))
      );

      await expect(result.current.onBulkDelete([meta('q1')])).resolves.toBe(
        false
      );
      expect(addToast.mock.calls).toEqual([
        [
          'Still loading assignment data — try bulk delete again in a moment.',
          'info',
        ],
      ]);
      expect(showConfirm).not.toHaveBeenCalled();
      expect(deleteQuiz).not.toHaveBeenCalled();
    });

    it('aborts when the assignment listener errored, even if still loading', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(
          baseArgs({ assignmentsLoading: true, assignmentsError: 'denied' })
        )
      );

      await expect(result.current.onBulkDelete([meta('q1')])).resolves.toBe(
        false
      );
      expect(addToast.mock.calls).toEqual([
        [
          "Couldn't verify assignment status — try bulk delete again in a moment.",
          'info',
        ],
      ]);
      expect(showConfirm).not.toHaveBeenCalled();
    });

    it('returns false with one skipped toast when every quiz is blocked', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(baseArgs({ assignments: [assignment('q1', 'paused')] }))
      );

      await expect(result.current.onBulkDelete([meta('q1')])).resolves.toBe(
        false
      );
      expect(addToast.mock.calls).toEqual([
        [
          'Skipped 1 quiz with active or paused assignments. Deactivate them first.',
          'error',
        ],
      ]);
      expect(showConfirm).not.toHaveBeenCalled();
    });

    it('returns false without a toast for an empty selection', async () => {
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(result.current.onBulkDelete([])).resolves.toBe(false);
      expect(addToast).not.toHaveBeenCalled();
      expect(showConfirm).not.toHaveBeenCalled();
    });

    it('confirms once as danger and deletes quizzes with no assignments', async () => {
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(
        result.current.onBulkDelete([meta('q1'), meta('q2')])
      ).resolves.toBe(true);

      expect(showConfirm.mock.calls).toEqual([
        [
          'Delete 2 quizzes? This cannot be undone.',
          {
            title: 'Delete Quizzes',
            variant: 'danger',
            confirmLabel: 'Delete',
          },
        ],
      ]);
      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'deleteQuiz:q2:drive-q2',
        'getDocs',
        'getDocs',
        'toast:success:Deleted 2 quizzes.',
      ]);
      expect(mockWhere).toHaveBeenCalledWith('quizId', '==', 'q1');
      expect(mockWhere).toHaveBeenCalledWith('quizId', '==', 'q2');
    });

    it('clears paper batches of each deleted quiz', async () => {
      paperBatches(['b1']);
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.onBulkDelete([meta('q1'), meta('q2')]);

      expect(calls.filter((c) => c === 'batch.delete:b1')).toHaveLength(2);
      expect(batchCommit).toHaveBeenCalledTimes(2);
      expect(mockCollection).toHaveBeenCalledWith(
        { __db: true },
        'users',
        'teacher-1',
        'paper_batches'
      );
    });

    it('skips paper batch cleanup with no signed-in user', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(baseArgs({ user: null }))
      );

      await result.current.onBulkDelete([meta('q1')]);

      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('cleans up only quizzes whose delete succeeded', async () => {
      deleteQuiz.mockImplementation((id: string) =>
        id === 'q2' ? Promise.reject(new Error('boom')) : Promise.resolve()
      );
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.onBulkDelete([meta('q1'), meta('q2'), meta('q3')]);

      const cleaned = (mockWhere.mock.calls as string[][]).map((c) => c[2]);
      expect(cleaned.sort()).toEqual(['q1', 'q3']);
      expect(addToast.mock.calls).toEqual([
        ['Deleted 2 quizzes.', 'success'],
        ['1 quiz failed to delete.', 'error'],
      ]);
    });

    it('still reports success when paper batch cleanup fails', async () => {
      const cleanupErr = new Error('rules');
      mockGetDocs.mockRejectedValue(cleanupErr);
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(
        result.current.onBulkDelete([meta('q1'), meta('q2')])
      ).resolves.toBe(true);

      expect(consoleWarn).toHaveBeenCalledWith(
        '[QuizWidget] paper batch cleanup:',
        cleanupErr
      );
      expect(addToast.mock.calls).toEqual([['Deleted 2 quizzes.', 'success']]);
    });

    it('skips blocked quizzes, warns about archived ones, and deletes clean before archived', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(
          baseArgs({
            assignments: [
              assignment('q-arch', 'inactive'),
              assignment('q-live', 'active'),
              assignment('q-live', 'inactive'),
              assignment('q-live2', 'paused'),
            ],
          })
        )
      );

      await expect(
        result.current.onBulkDelete([
          meta('q-arch'),
          meta('q-live'),
          meta('q-clean'),
          meta('q-live2'),
        ])
      ).resolves.toBe(true);

      expect(showConfirm.mock.calls).toEqual([
        [
          'Delete 2 quizzes? 1 has archived assignments — deleting will prevent viewing their monitor and results. This cannot be undone.',
          {
            title: 'Delete Quizzes',
            variant: 'warning',
            confirmLabel: 'Delete Anyway',
          },
        ],
      ]);
      expect(calls).toEqual([
        'toast:error:Skipped 2 quizzes with active or paused assignments. Deactivate them first.',
        'deleteQuiz:q-clean:drive-q-clean',
        'deleteQuiz:q-arch:drive-q-arch',
        'getDocs',
        'getDocs',
        'toast:success:Deleted 2 quizzes.',
      ]);
    });

    it('uses singular wording for one archived quiz and plural "have" for several', async () => {
      const { result, rerender } = renderHook(
        (args: Args) => useQuizDelete(args),
        {
          initialProps: baseArgs({
            assignments: [
              assignment('q1', 'inactive'),
              assignment('q2', 'inactive'),
            ],
          }),
        }
      );

      await result.current.onBulkDelete([meta('q1')]);
      rerender(
        baseArgs({
          assignments: [
            assignment('q1', 'inactive'),
            assignment('q2', 'inactive'),
          ],
        })
      );
      await result.current.onBulkDelete([meta('q1'), meta('q2')]);

      expect(showConfirm.mock.calls.map((c) => c[0])).toEqual([
        'Delete 1 quiz? 1 has archived assignments — deleting will prevent viewing their monitor and results. This cannot be undone.',
        'Delete 2 quizzes? 2 have archived assignments — deleting will prevent viewing their monitor and results. This cannot be undone.',
      ]);
      expect(addToast.mock.calls).toEqual([
        ['Deleted 1 quiz.', 'success'],
        ['Deleted 2 quizzes.', 'success'],
      ]);
    });

    it('returns false and deletes nothing when the teacher cancels', async () => {
      showConfirm.mockResolvedValueOnce(false);
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(result.current.onBulkDelete([meta('q1')])).resolves.toBe(
        false
      );
      expect(deleteQuiz).not.toHaveBeenCalled();
      expect(addToast).not.toHaveBeenCalled();
    });

    it('reports partial failures with a success toast then a failure toast', async () => {
      const err = new Error('boom');
      deleteQuiz.mockImplementation((id: string) =>
        id === 'q2' ? Promise.reject(err) : Promise.resolve()
      );
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(
        result.current.onBulkDelete([meta('q1'), meta('q2'), meta('q3')])
      ).resolves.toBe(true);

      expect(consoleError).toHaveBeenCalledWith(
        '[QuizWidget] bulk delete failed for',
        'q2',
        err
      );
      expect(addToast.mock.calls).toEqual([
        ['Deleted 2 quizzes.', 'success'],
        ['1 quiz failed to delete.', 'error'],
      ]);
    });

    it('shows only the failure toast and still returns true when every delete fails', async () => {
      deleteQuiz.mockRejectedValue(new Error('down'));
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(
        result.current.onBulkDelete([meta('q1'), meta('q2')])
      ).resolves.toBe(true);
      expect(addToast.mock.calls).toEqual([
        ['2 quizzes failed to delete.', 'error'],
      ]);
    });

    it('classifies with the assignments and deleteQuiz of the render it was called in', async () => {
      let answer: (ok: boolean) => void = () => undefined;
      showConfirm.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve;
          })
      );
      const laterDeleteQuiz = vi.fn(() => Promise.resolve());
      const { result, rerender } = renderHook(
        (args: Args) => useQuizDelete(args),
        {
          initialProps: baseArgs(),
        }
      );

      const pending = result.current.onBulkDelete([meta('q1')]);
      rerender(
        baseArgs({
          assignments: [assignment('q1', 'active')],
          deleteQuiz: laterDeleteQuiz,
        })
      );
      answer(true);

      await expect(pending).resolves.toBe(true);
      expect(deleteQuiz).toHaveBeenCalledWith('q1', 'drive-q1');
      expect(laterDeleteQuiz).not.toHaveBeenCalled();
    });
  });

  describe('folderDeleteItems', () => {
    it('deletes each quiz in order, clearing its paper batches after each, with no toast', async () => {
      paperBatches(['b1']);
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.folderDeleteItems(['q1', 'q2']);

      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'getDocs',
        'batch.delete:b1',
        'batch.commit',
        'deleteQuiz:q2:drive-q2',
        'getDocs',
        'batch.delete:b1',
        'batch.commit',
      ]);
      expect(mockWhere).toHaveBeenCalledWith('quizId', '==', 'q1');
      expect(mockWhere).toHaveBeenCalledWith('quizId', '==', 'q2');
    });

    it('skips ids that are not in the library', async () => {
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await result.current.folderDeleteItems(['missing', 'q2']);

      expect(calls).toEqual(['deleteQuiz:q2:drive-q2', 'getDocs']);
    });

    it('skips paper batch cleanup with no signed-in user', async () => {
      const { result } = renderHook(() =>
        useQuizDelete(baseArgs({ user: null }))
      );

      await result.current.folderDeleteItems(['q1']);

      expect(calls).toEqual(['deleteQuiz:q1:drive-q1']);
    });

    it('stops at the first failed quiz delete and rethrows, leaving later quizzes alone', async () => {
      deleteQuiz.mockImplementation((id: string, driveFileId: string) => {
        calls.push(`deleteQuiz:${id}:${driveFileId}`);
        return id === 'q2'
          ? Promise.reject(new Error('drive down'))
          : Promise.resolve();
      });
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(
        result.current.folderDeleteItems(['q1', 'q2', 'q3'])
      ).rejects.toThrow('drive down');

      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'getDocs',
        'deleteQuiz:q2:drive-q2',
      ]);
      expect(addToast).not.toHaveBeenCalled();
    });

    it('swallows a paper batch failure with a warning and keeps deleting', async () => {
      const boom = new Error('batch lookup failed');
      mockGetDocs.mockRejectedValue(boom);
      const { result } = renderHook(() => useQuizDelete(baseArgs()));

      await expect(
        result.current.folderDeleteItems(['q1', 'q2'])
      ).resolves.toBeUndefined();

      expect(calls).toEqual([
        'deleteQuiz:q1:drive-q1',
        'deleteQuiz:q2:drive-q2',
      ]);
      expect(consoleWarn).toHaveBeenCalledWith(
        '[QuizWidget] paper batch cleanup:',
        boom
      );
      expect(addToast).not.toHaveBeenCalled();
    });

    it.each([
      ['loading', { assignmentsLoading: true }],
      ['errored', { assignmentsError: 'boom' }],
    ])(
      'throws before deleting anything while assignments are %s',
      async (_n, over) => {
        const { result } = renderHook(() =>
          useQuizDelete(baseArgs(over as Partial<Args>))
        );

        await expect(result.current.folderDeleteItems(['q1'])).rejects.toThrow(
          "Couldn't check assignments. Try again in a moment."
        );

        expect(deleteQuiz).not.toHaveBeenCalled();
        expect(mockGetDocs).not.toHaveBeenCalled();
      }
    );
  });

  it('returns fresh handlers every render, like the inline props it replaces', () => {
    const { result, rerender } = renderHook(() => useQuizDelete(baseArgs()));
    const first = result.current;
    rerender();
    expect(result.current.onDelete).not.toBe(first.onDelete);
    expect(result.current.onBulkDelete).not.toBe(first.onBulkDelete);
    expect(result.current.folderDeleteItems).not.toBe(first.folderDeleteItems);
  });
});
