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
import { doc, writeBatch } from 'firebase/firestore';
import { useQuizReorder } from '@/hooks/useQuizReorder';
import { isTourSandboxActive } from '@/utils/tourSandbox';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __db: true } }));

vi.mock('@/utils/tourSandbox', () => ({
  isTourSandboxActive: vi.fn(() => false),
}));

const mockDoc = doc as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockSandbox = isTourSandboxActive as Mock;

describe('useQuizReorder', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();
  const addToast = vi.fn();
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSandbox.mockReturnValue(false);
    mockDoc.mockImplementation((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    }));
    batchCommit.mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('writes order = index onto each quiz metadata doc in one batch', async () => {
    const { result } = renderHook(() =>
      useQuizReorder({ uid: 'teacher-1' }, addToast)
    );

    await result.current(['q-c', 'q-a', 'q-b']);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockWriteBatch).toHaveBeenCalledWith({ __db: true });
    expect(batchUpdate.mock.calls).toEqual([
      [{ path: 'users/teacher-1/quizzes/q-c' }, { order: 0 }],
      [{ path: 'users/teacher-1/quizzes/q-a' }, { order: 1 }],
      [{ path: 'users/teacher-1/quizzes/q-b' }, { order: 2 }],
    ]);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(addToast).not.toHaveBeenCalled();
  });

  it('commits an empty batch for an empty list', async () => {
    const { result } = renderHook(() =>
      useQuizReorder({ uid: 'teacher-1' }, addToast)
    );

    await result.current([]);

    expect(batchUpdate).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when signed out', async () => {
    const { result } = renderHook(() => useQuizReorder(null, addToast));

    await expect(result.current(['q-a'])).resolves.toBeUndefined();

    expect(mockWriteBatch).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('writes nothing while a tour sandbox is active', async () => {
    mockSandbox.mockReturnValue(true);
    const { result } = renderHook(() =>
      useQuizReorder({ uid: 'teacher-1' }, addToast)
    );

    await expect(result.current(['q-a'])).resolves.toBeUndefined();

    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('toasts and re-throws when the commit fails so the drag reverts', async () => {
    const err = new Error('NOT_FOUND');
    batchCommit.mockRejectedValue(err);
    const { result } = renderHook(() =>
      useQuizReorder({ uid: 'teacher-1' }, addToast)
    );

    await expect(result.current(['q-a', 'q-b'])).rejects.toBe(err);

    expect(consoleError).toHaveBeenCalledWith(
      '[QuizWidget] Failed to persist reorder:',
      err
    );
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      'Could not save the new order. Please try again.',
      'error'
    );
  });

  it('keeps one callback identity while uid and addToast are unchanged', () => {
    const { result, rerender } = renderHook(
      ({ user }: { user: { uid: string } | null }) =>
        useQuizReorder(user, addToast),
      { initialProps: { user: { uid: 'teacher-1' } } }
    );
    const first = result.current;

    rerender({ user: { uid: 'teacher-1' } });
    expect(result.current).toBe(first);

    rerender({ user: { uid: 'teacher-2' } });
    expect(result.current).not.toBe(first);
  });

  it('reads uid when called, not after the commit resolves', async () => {
    let resolveCommit: () => void = () => undefined;
    batchCommit.mockReturnValue(
      new Promise<void>((r) => {
        resolveCommit = r;
      })
    );
    const initialProps: { user: { uid: string } | null } = {
      user: { uid: 'teacher-1' },
    };
    const { result, rerender } = renderHook(
      ({ user }) => useQuizReorder(user, addToast),
      { initialProps }
    );

    const pending = result.current(['q-a']);
    rerender({ user: null });
    resolveCommit();
    await pending;

    expect(batchUpdate).toHaveBeenCalledWith(
      { path: 'users/teacher-1/quizzes/q-a' },
      { order: 0 }
    );
    expect(addToast).not.toHaveBeenCalled();
  });
});
