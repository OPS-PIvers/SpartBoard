import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlcFolders } from '@/hooks/usePlcFolders';

const mockUpdate = vi.hoisted(() => vi.fn());
const mockCommit = vi.hoisted(() => vi.fn());
const mockDoc = vi.hoisted(() =>
  vi.fn((_db: unknown, ...path: string[]) => path.join('/'))
);
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  writeBatch: () => ({ update: mockUpdate, commit: mockCommit }),
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  orderBy: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

describe('usePlcFolders', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockCommit.mockReset().mockResolvedValue(undefined);
    mockDoc.mockClear();
  });

  it('moveEntry batches both the quiz entry and assessment doc', async () => {
    const { result } = renderHook(() => usePlcFolders('plc-1'));

    await result.current.moveEntry(
      { plcQuizId: 'quiz-1', assessmentId: 'assess-1' },
      'folder-1'
    );

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith(
      'plcs/plc-1/quizzes/quiz-1',
      expect.objectContaining({ folderId: 'folder-1' })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      'plcs/plc-1/assessments/assess-1',
      expect.objectContaining({ folderId: 'folder-1' })
    );
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  it('rejects when both plcQuizId and assessmentId are null', async () => {
    const { result } = renderHook(() => usePlcFolders('plc-1'));

    await expect(
      result.current.moveEntry({ plcQuizId: null, assessmentId: null }, null)
    ).rejects.toThrow(/plcQuizId or assessmentId/);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
